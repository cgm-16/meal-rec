# ABOUTME: Outcome-free records and validation for versioned meal snapshots.
# ABOUTME: Keeps uncertain, unanswered, and invalidly timed exposures outside binary targets.

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
import json
import math
from pathlib import Path
import re
from typing import Any, Iterable, Mapping
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import numpy as np


@dataclass(frozen=True)
class Exposure:
    event_id: str
    participant_id: str
    item_id: str
    displayed_at: datetime | None
    meal: dict[str, Any]
    context: dict[str, Any]


@dataclass(frozen=True)
class Target:
    event_id: str
    y: int
    received_at: datetime | None

    def __post_init__(self):
        if type(self.y) is not int or self.y not in (0, 1):
            raise ValueError("y: expected binary integer 0 or 1, never a boolean")


@dataclass(frozen=True)
class AuditEntry:
    event_id: str
    reason: str


@dataclass(frozen=True)
class Dataset:
    source: str
    manifest: dict[str, Any]
    events: tuple[Exposure, ...]
    targets: Mapping[str, Target]
    audit: tuple[AuditEntry, ...]


@dataclass(frozen=True)
class Split:
    train_ids: tuple[str, ...]
    development_ids: tuple[str, ...]
    test_ids: tuple[str, ...]
    audit: tuple[AuditEntry, ...]


@dataclass(frozen=True)
class FeatureBatch:
    ids: tuple[str, ...]
    participant_ids: tuple[str, ...]
    rows: tuple[dict[str, float | str], ...]
    events: tuple[Exposure, ...]


def _fail(field: str, message: str):
    raise ValueError(f"{field}: {message}")


def _fields(value: Any, field: str, names: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        _fail(field, "expected an object")
    expected = set(names.split())
    missing = expected - value.keys()
    extra = value.keys() - expected
    if missing or extra:
        _fail(field, f"missing fields {sorted(missing)}; unknown fields {sorted(extra)}")
    return value


def _text(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        _fail(field, "expected a nonempty string")
    return value


def _enum(value: Any, field: str, choices: tuple[str, ...]) -> str:
    if _text(value, field) not in choices:
        _fail(field, f"expected one of {choices}")
    return value


def _integer(value: Any, field: str, minimum: int | None = None) -> int:
    if type(value) is not int or (minimum is not None and value < minimum):
        _fail(field, f"expected an integer >= {minimum}" if minimum is not None else "expected an integer")
    return value


def _number(value: Any, field: str) -> float:
    if type(value) not in (int, float):
        _fail(field, "expected a finite number, never a boolean")
    try:
        result = float(value)
    except OverflowError:
        _fail(field, "expected a finite number")
    if not math.isfinite(result):
        _fail(field, "expected a finite number")
    return result


def _finite(value: Any, field: str):
    if isinstance(value, float) and not math.isfinite(value):
        _fail(field, "expected a finite number")
    if isinstance(value, dict):
        for key, child in value.items():
            _finite(child, f"{field}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            _finite(child, f"{field}[{index}]")


def _instant(value: Any, field: str) -> datetime:
    _text(value, field)
    try:
        result = datetime.fromisoformat(value)
    except ValueError:
        _fail(field, "expected a UTC ISO-8601 timestamp")
    if "T" not in value or result.tzinfo is None or result.utcoffset() != timedelta(0):
        _fail(field, "expected a UTC ISO-8601 timestamp")
    return result.astimezone(timezone.utc)


def _zone(value: Any, field: str) -> str:
    _text(value, field)
    try:
        ZoneInfo(value)
    except (ValueError, ZoneInfoNotFoundError):
        _fail(field, "expected an IANA timezone")
    return value


def _strings(value: Any, field: str):
    if not isinstance(value, list):
        _fail(field, "expected an array of strings")
    for index, item in enumerate(value):
        _text(item, f"{field}[{index}]")


def _rows(root: dict[str, Any], name: str, fields: str, id_key: str) -> dict[str, dict[str, Any]]:
    value = root[name]
    if not isinstance(value, list):
        _fail(name, "expected an array")
    indexed = {}
    for index, item in enumerate(value):
        path = f"{name}[{index}]"
        _fields(item, path, fields)
        identity = _text(item[id_key], f"{path}.{id_key}")
        if identity in indexed:
            _fail(f"{path}.{id_key}", f"duplicate ID {identity}")
        indexed[identity] = item
    return indexed


def _reference(row: dict[str, Any], key: str, records: Mapping, field: str):
    identity = _text(row[key], f"{field}.{key}")
    if identity not in records:
        _fail(f"{field}.{key}", f"unknown reference {identity}")
    return records[identity]


def _sha256(value: Any, field: str):
    if not isinstance(value, str) or re.fullmatch(r"[0-9a-f]{64}", value) is None:
        _fail(field, "expected a lowercase SHA-256 hex digest")


def _city(value: Any, field: str):
    _fields(value, field, "cityId label country adminArea latitude longitude timezone")
    for key in ("cityId", "label", "country"):
        _text(value[key], f"{field}.{key}")
    if value["adminArea"] is not None:
        _text(value["adminArea"], f"{field}.adminArea")
    for key, bound in (("latitude", 90), ("longitude", 180)):
        if abs(_number(value[key], f"{field}.{key}")) > bound:
            _fail(f"{field}.{key}", "coordinate out of range")
    _zone(value["timezone"], f"{field}.timezone")


def _weather(value: Any, field: str):
    if value is None:
        return
    _fields(value, field, "provider providerHost accessMode status requestedLatitude requestedLongitude "
            "gridLatitude gridLongitude validAt sourceIntervalSeconds requestedAt retrievedAt "
            "temperatureC precipitationMm weatherCode units sourceTimeFormat timezone failureReason")
    for key in ("provider", "providerHost", "accessMode", "failureReason"):
        if value[key] is not None:
            _text(value[key], f"{field}.{key}")
    _enum(value["status"], f"{field}.status", ("ok", "partial", "unavailable"))
    for key, bound in (("requestedLatitude", 90), ("requestedLongitude", 180),
                       ("gridLatitude", 90), ("gridLongitude", 180)):
        if value[key] is None and key.startswith("grid"):
            continue
        if abs(_number(value[key], f"{field}.{key}")) > bound:
            _fail(f"{field}.{key}", "coordinate out of range")
    for key in ("temperatureC", "precipitationMm"):
        if value[key] is not None:
            _number(value[key], f"{field}.{key}")
    for key in ("weatherCode", "sourceIntervalSeconds"):
        if value[key] is not None:
            _integer(value[key], f"{field}.{key}")
    for key in ("validAt", "requestedAt", "retrievedAt"):
        if value[key] is not None or key == "requestedAt":
            value[key] = _instant(value[key], f"{field}.{key}")
    _fields(value["units"], f"{field}.units", "temperature precipitation")
    _enum(value["units"]["temperature"], f"{field}.units.temperature", ("celsius",))
    _enum(value["units"]["precipitation"], f"{field}.units.precipitation", ("mm",))
    _enum(value["sourceTimeFormat"], f"{field}.sourceTimeFormat", ("unixtime",))
    if value["timezone"] is not None:
        _zone(value["timezone"], f"{field}.timezone")


def _meal(value: Any, field: str):
    _fields(value, field, "id name cuisine primaryIngredients allergens weather timeOfDay "
            "spiciness heaviness imageUrl description flavorTags")
    for key in ("id", "name"):
        _text(value[key], f"{field}.{key}")
    for key in ("cuisine", "imageUrl", "description"):
        if value[key] is not None and not isinstance(value[key], str):
            _fail(f"{field}.{key}", "expected a string or null")
    for key in ("primaryIngredients", "allergens", "weather", "timeOfDay", "flavorTags"):
        _strings(value[key], f"{field}.{key}")
    for key in ("spiciness", "heaviness"):
        if not 0 <= _number(value[key], f"{field}.{key}") <= 5:
            _fail(f"{field}.{key}", "expected a value from 0 to 5")


def _manifest(value: Any):
    field = "manifest"
    _fields(value, field, "schemaVersion studyId studyVersion protocolVersion catalogVersion "
            "catalogSha256 startsAt trainingEndsAt developmentEndsAt endsAt quotaTimezoneRule seed "
            "phase exportedAt sourceProvenance freezeLink")
    if _integer(value["schemaVersion"], "manifest.schemaVersion") != 1:
        _fail("manifest.schemaVersion", "only version 1 is supported")
    for key in ("studyId", "studyVersion", "protocolVersion", "catalogVersion"):
        _text(value[key], f"manifest.{key}")
    _sha256(value["catalogSha256"], "manifest.catalogSha256")
    _integer(value["seed"], "manifest.seed", 0)
    _enum(value["quotaTimezoneRule"], "manifest.quotaTimezoneRule", ("enrollment",))
    _enum(value["phase"], "manifest.phase", ("development", "final"))
    for key in ("startsAt", "trainingEndsAt", "developmentEndsAt", "endsAt", "exportedAt"):
        value[key] = _instant(value[key], f"manifest.{key}")
    for key, days in (("trainingEndsAt", 5), ("developmentEndsAt", 7), ("endsAt", 14)):
        if value[key] != value["startsAt"] + timedelta(days=days):
            _fail(f"manifest.{key}", f"must equal startsAt + {days} days")
    provenance = _fields(value["sourceProvenance"], "manifest.sourceProvenance", "name url license attribution")
    for key in ("name", "license", "attribution"):
        _text(provenance[key], f"manifest.sourceProvenance.{key}")
    if provenance["url"] is not None:
        _text(provenance["url"], "manifest.sourceProvenance.url")
    link = value["freezeLink"]
    if link is not None:
        _fields(link, "manifest.freezeLink", "freezeManifestSha256 frozenAt developmentSnapshotSha256")
        for key in ("freezeManifestSha256", "developmentSnapshotSha256"):
            _sha256(link[key], f"manifest.freezeLink.{key}")
        link["frozenAt"] = _instant(link["frozenAt"], "manifest.freezeLink.frozenAt")
    if (value["phase"] == "final") != (link is not None):
        _fail("manifest.freezeLink", "final exports require a freeze link; development exports use null")


def _setting(participant: dict[str, Any], version: Any, field: str):
    _integer(version, field, 1)
    for setting in participant["settings"]:
        if setting["version"] == version:
            return setting
    _fail(field, f"unknown settings version {version}")


def _interval(instant: datetime, manifest: dict[str, Any]) -> int | None:
    boundaries = [manifest[key] for key in ("startsAt", "trainingEndsAt", "developmentEndsAt", "endsAt")]
    for index in range(3):
        if boundaries[index] <= instant < boundaries[index + 1]:
            return index
    return None


def _timing_reasons(event: Exposure, visit: dict[str, Any], response: dict[str, Any] | None,
                    manifest: dict[str, Any]) -> list[str]:
    reasons = []
    if not timedelta(0) < visit["expiresAt"] - visit["startedAt"] <= timedelta(minutes=30):
        reasons.append("invalid_visit_interval")
    if not visit["startedAt"] <= event.displayed_at < visit["expiresAt"]:
        reasons.append("display_outside_visit")
    display_interval = _interval(event.displayed_at, manifest)
    if display_interval is None:
        reasons.append("display_outside_study")
    if response is not None:
        received_at = response["receivedAt"]
        if received_at <= event.displayed_at:
            reasons.append("response_before_display")
        if received_at >= visit["expiresAt"]:
            reasons.append("response_after_visit")
        receipt_interval = _interval(received_at, manifest)
        if receipt_interval is None:
            reasons.append("response_outside_study")
        elif display_interval is not None and display_interval != receipt_interval:
            reasons.append("crosses_cutoff")
    return reasons


def load_snapshot(path: Path) -> Dataset:
    root = json.loads(path.read_text())
    _fields(root, "snapshot", "schemaVersion source manifest participants visits allocations exposures responses audit")
    _finite(root, "snapshot")
    if _integer(root["schemaVersion"], "schemaVersion") != 1:
        _fail("schemaVersion", "only version 1 is supported")
    source = _enum(root["source"], "source", ("pilot",))
    manifest = root["manifest"]
    _manifest(manifest)
    participants = _rows(root, "participants", "participantId enrolledAt enrollmentTimezone settings", "participantId")
    for identity, row in participants.items():
        field = f"participants[{identity}]"
        row["enrolledAt"] = _instant(row["enrolledAt"], f"{field}.enrolledAt")
        _zone(row["enrollmentTimezone"], f"{field}.enrollmentTimezone")
        if not isinstance(row["settings"], list) or not row["settings"]:
            _fail(f"{field}.settings", "expected a nonempty settings history")
        versions = set()
        for setting in row["settings"]:
            _fields(setting, f"{field}.settings", "version effectiveAt city dietaryExclusions")
            version = _integer(setting["version"], f"{field}.settings.version", 1)
            if version in versions:
                _fail(f"{field}.settings.version", "duplicate version")
            versions.add(version)
            setting["effectiveAt"] = _instant(setting["effectiveAt"], f"{field}.settings.effectiveAt")
            _city(setting["city"], f"{field}.settings.city")
            _strings(setting["dietaryExclusions"], f"{field}.settings.dietaryExclusions")
    visits = _rows(root, "visits", "visitId participantId settingsVersion startedAt expiresAt "
                  "contextCapturedAt city hunger weather", "visitId")
    for identity, row in visits.items():
        field = f"visits[{identity}]"
        participant = _reference(row, "participantId", participants, field)
        setting = _setting(participant, row["settingsVersion"], f"{field}.settingsVersion")
        for key in ("startedAt", "expiresAt", "contextCapturedAt"):
            row[key] = _instant(row[key], f"{field}.{key}")
        _city(row["city"], f"{field}.city")
        if row["city"] != setting["city"]:
            _fail(f"{field}.city", "does not match the referenced settings version")
        if row["hunger"] is not None:
            _enum(row["hunger"], f"{field}.hunger", ("not_hungry", "somewhat_hungry", "very_hungry"))
        _weather(row["weather"], f"{field}.weather")
    allocations = _rows(root, "allocations", "allocationId participantId localDate settingsVersion itemId "
                        "allocatedAt eligiblePoolSize selectionProbability", "allocationId")
    for identity, row in allocations.items():
        field = f"allocations[{identity}]"
        participant = _reference(row, "participantId", participants, field)
        _setting(participant, row["settingsVersion"], f"{field}.settingsVersion")
        _text(row["itemId"], f"{field}.itemId")
        _text(row["localDate"], f"{field}.localDate")
        try:
            local_date = date.fromisoformat(row["localDate"])
        except ValueError:
            _fail(f"{field}.localDate", "expected an ISO calendar date")
        if local_date.isoformat() != row["localDate"]:
            _fail(f"{field}.localDate", "expected YYYY-MM-DD")
        row["allocatedAt"] = _instant(row["allocatedAt"], f"{field}.allocatedAt")
        _integer(row["eligiblePoolSize"], f"{field}.eligiblePoolSize", 1)
        if not 0 < _number(row["selectionProbability"], f"{field}.selectionProbability") <= 1:
            _fail(f"{field}.selectionProbability", "expected a probability in (0, 1]")
    exposures = _rows(root, "exposures", "eventId participantId visitId allocationId settingsVersion itemId "
                      "displayedAt clientDisplayedAt meal", "eventId")
    events = []
    used_allocations = set()
    for identity, row in exposures.items():
        field = f"exposures[{identity}]"
        participant = _reference(row, "participantId", participants, field)
        visit = _reference(row, "visitId", visits, field)
        allocation = _reference(row, "allocationId", allocations, field)
        if visit["participantId"] != row["participantId"] or allocation["participantId"] != row["participantId"]:
            _fail(f"{field}.participantId", "visit/allocation ownership mismatch")
        if row["allocationId"] in used_allocations:
            _fail(f"{field}.allocationId", "one allocation may have only one acknowledged exposure")
        used_allocations.add(row["allocationId"])
        setting = _setting(participant, row["settingsVersion"], f"{field}.settingsVersion")
        if row["settingsVersion"] != visit["settingsVersion"]:
            _fail(f"{field}.settingsVersion", "must match the visit")
        _meal(row["meal"], f"{field}.meal")
        if _text(row["itemId"], f"{field}.itemId") != row["meal"]["id"] or row["itemId"] != allocation["itemId"]:
            _fail(f"{field}.itemId", "must match allocation.itemId and meal.id")
        displayed_at = _instant(row["displayedAt"], f"{field}.displayedAt")
        if manifest["phase"] == "development" and displayed_at >= manifest["developmentEndsAt"]:
            _fail(f"{field}.displayedAt", "test-week data is forbidden in a development snapshot")
        client_displayed_at = _instant(row["clientDisplayedAt"], f"{field}.clientDisplayedAt")
        context = dict(visit, allocationId=row["allocationId"], localDate=allocation["localDate"],
                       eligiblePoolSize=allocation["eligiblePoolSize"],
                       selectionProbability=allocation["selectionProbability"],
                       dietaryExclusions=setting["dietaryExclusions"],
                       enrollmentTimezone=participant["enrollmentTimezone"], clientDisplayedAt=client_displayed_at)
        events.append(Exposure(identity, row["participantId"], row["itemId"], displayed_at, row["meal"], context))
    responses = _rows(root, "responses", "responseId eventId participantId answer actionAt receivedAt", "responseId")
    by_event = {}
    for identity, row in responses.items():
        field = f"responses[{identity}]"
        exposure = _reference(row, "eventId", exposures, field)
        _reference(row, "participantId", participants, field)
        if row["participantId"] != exposure["participantId"]:
            _fail(f"{field}.participantId", "does not own the exposure")
        if row["eventId"] in by_event:
            _fail(f"{field}.eventId", "multiple immutable responses for one exposure")
        _enum(row["answer"], f"{field}.answer", ("yes", "no", "not_sure"))
        for key in ("actionAt", "receivedAt"):
            row[key] = _instant(row[key], f"{field}.{key}")
        if manifest["phase"] == "development" and row["receivedAt"] >= manifest["developmentEndsAt"]:
            _fail(f"{field}.receivedAt", "test-week data is forbidden in a development snapshot")
        by_event[row["eventId"]] = row
    if not isinstance(root["audit"], list):
        _fail("audit", "expected an array")
    audit = []
    for index, row in enumerate(root["audit"]):
        field = f"audit[{index}]"
        _fields(row, field, "eventId reason")
        _reference(row, "eventId", exposures, field)
        audit.append(AuditEntry(row["eventId"], _text(row["reason"], f"{field}.reason")))
    targets = {}
    for event in events:
        response = by_event.get(event.event_id)
        reasons = _timing_reasons(event, visits[event.context["visitId"]], response, manifest)
        if response is None:
            reasons.append("unanswered")
        elif response["answer"] == "not_sure":
            reasons.append("not_sure")
        elif not reasons:
            targets[event.event_id] = Target(event.event_id, int(response["answer"] == "yes"), response["receivedAt"])
        audit.extend(AuditEntry(event.event_id, reason) for reason in reasons)
    return Dataset(source, manifest, tuple(events), targets, tuple(dict.fromkeys(audit)))


def events_for(dataset: Dataset, ids: Iterable[str]) -> tuple[Exposure, ...]:
    indexed = {event.event_id: event for event in dataset.events}
    try:
        return tuple(indexed[identity] for identity in ids)
    except KeyError as error:
        raise ValueError(f"ids: unknown exposure {error.args[0]}") from error


def labels_for(dataset: Dataset, ids: Iterable[str]) -> np.ndarray:
    try:
        return np.asarray([dataset.targets[identity].y for identity in ids], dtype=np.int64)
    except KeyError as error:
        raise ValueError(f"ids: no definite eligible target for {error.args[0]}") from error
