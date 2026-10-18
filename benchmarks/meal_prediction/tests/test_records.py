# ABOUTME: Behavior checks for the shared meal-prediction snapshot contract.
# ABOUTME: Protects binary labels, outcome-free alignment, references, and raw context.

from dataclasses import FrozenInstanceError
from datetime import datetime, timezone
import json
from pathlib import Path

import pytest

from meal_prediction import records


EXAMPLE = Path(__file__).resolve().parents[3] / "contracts/meal-prediction/pilot-v1.example.json"


@pytest.fixture
def snapshot():
    return json.loads(EXAMPLE.read_text())


def save_snapshot(tmp_path, snapshot):
    path = tmp_path / "snapshot.json"
    path.write_text(json.dumps(snapshot))
    return path


def test_uncertainty_is_not_a_negative():
    dataset = records.load_snapshot(EXAMPLE)
    assert set(dataset.targets) == {"e-yes", "e-no"}
    assert records.labels_for(dataset, ("e-no", "e-yes")).tolist() == [0, 1]
    assert tuple(event.event_id for event in dataset.events) == (
        "e-yes", "e-no", "e-unsure", "e-unanswered"
    )
    assert {(entry.event_id, entry.reason) for entry in dataset.audit} >= {
        ("e-unsure", "not_sure"),
        ("e-unanswered", "unanswered"),
        ("e-unanswered", "client_closed"),
    }
    events = records.events_for(dataset, ("e-no", "e-yes"))
    assert tuple(event.event_id for event in events) == ("e-no", "e-yes")
    assert not hasattr(events[0], "y")
    assert not hasattr(events[0], "answer")
    with pytest.raises(FrozenInstanceError):
        events[0].item_id = "changed"


@pytest.mark.parametrize("conflict, field", [
    ("response_id", "responseId"),
    ("answer", "eventId"),
])
def test_snapshot_rejects_conflicting_answers(tmp_path, snapshot, conflict, field):
    response = dict(snapshot["responses"][0])
    if conflict == "answer":
        response.update(responseId="r-conflict", answer="no")
    snapshot["responses"].append(response)
    with pytest.raises(ValueError, match=field):
        records.load_snapshot(save_snapshot(tmp_path, snapshot))


@pytest.mark.parametrize("path, value, field", [
    (("schemaVersion",), 2, "schemaVersion"),
    (("schemaVersion",), True, "schemaVersion"),
    (("exposures", 0, "visitId"), "missing", "visitId"),
    (("visits", 0, "participantId"), "missing", "participantId"),
    (("exposures", 0, "allocationId"), "missing", "allocationId"),
    (("exposures", 0, "meal", "id"), "wrong-meal", "itemId"),
    (("visits", 0, "settingsVersion"), 9, "settingsVersion"),
    (("manifest", "trainingEndsAt"), "2026-01-05T00:00:00Z", "trainingEndsAt"),
])
def test_wrong_version_or_references_fail(tmp_path, snapshot, path, value, field):
    target = snapshot
    for part in path[:-1]:
        target = target[part]
    target[path[-1]] = value
    with pytest.raises(ValueError, match=field):
        records.load_snapshot(save_snapshot(tmp_path, snapshot))


@pytest.mark.parametrize("path, value, field", [
    (("responses", 0, "answer"), True, "answer"),
    (("responses", 0, "answer"), "like", "answer"),
    (("visits", 0, "hunger"), "hungry", "hunger"),
    (("visits", 0, "weather", "temperatureC"), float("nan"), "temperatureC"),
    (("exposures", 0, "meal", "heaviness"), float("inf"), "heaviness"),
    (("exposures", 0, "meal", "spiciness"), True, "spiciness"),
    (("responses", 0, "receivedAt"), "2026-01-02T12:01:02", "receivedAt"),
    (("responses", 0, "receivedAt"), "2026-01-02T13:01:02+01:00", "receivedAt"),
    (("participants", 0, "enrollmentTimezone"), "not/a-zone", "enrollmentTimezone"),
    (("allocations", 0, "selectionProbability"), 0, "selectionProbability"),
])
def test_invalid_values_fail_at_the_named_field(tmp_path, snapshot, path, value, field):
    target = snapshot
    for part in path[:-1]:
        target = target[part]
    target[path[-1]] = value
    with pytest.raises(ValueError, match=field):
        records.load_snapshot(save_snapshot(tmp_path, snapshot))


def test_duplicate_exposure_ids_fail(tmp_path, snapshot):
    snapshot["exposures"].append(dict(snapshot["exposures"][0]))
    with pytest.raises(ValueError, match="eventId"):
        records.load_snapshot(save_snapshot(tmp_path, snapshot))


def test_missing_or_legacy_fields_fail(tmp_path, snapshot):
    del snapshot["responses"][0]["receivedAt"]
    with pytest.raises(ValueError, match="receivedAt"):
        records.load_snapshot(save_snapshot(tmp_path, snapshot))
    snapshot["responses"][0]["receivedAt"] = "2026-01-02T12:01:02Z"
    snapshot["exposures"][0]["outcome"] = "dislike"
    with pytest.raises(ValueError, match="outcome"):
        records.load_snapshot(save_snapshot(tmp_path, snapshot))


@pytest.mark.parametrize("received_at, reason", [
    ("2026-01-02T12:00:59Z", "response_before_display"),
    ("2026-01-02T12:30:00Z", "response_after_visit"),
])
def test_impossible_response_times_remain_auditable(tmp_path, snapshot, received_at, reason):
    snapshot["responses"][0]["receivedAt"] = received_at
    dataset = records.load_snapshot(save_snapshot(tmp_path, snapshot))
    assert "e-yes" not in dataset.targets
    assert "e-yes" in {event.event_id for event in dataset.events}
    assert ("e-yes", reason) in {(entry.event_id, entry.reason) for entry in dataset.audit}


def test_cutoff_crossing_response_has_no_binary_target(tmp_path, snapshot):
    snapshot["visits"][0].update(
        startedAt="2026-01-05T23:50:00Z", expiresAt="2026-01-06T00:20:00Z",
        contextCapturedAt="2026-01-05T23:50:00Z",
    )
    snapshot["exposures"][0].update(
        displayedAt="2026-01-05T23:59:00Z", clientDisplayedAt="2026-01-05T23:59:00Z",
    )
    snapshot["responses"][0].update(
        actionAt="2026-01-06T00:00:00Z", receivedAt="2026-01-06T00:00:01Z",
    )
    dataset = records.load_snapshot(save_snapshot(tmp_path, snapshot))
    assert "e-yes" not in dataset.targets
    assert ("e-yes", "crosses_cutoff") in {
        (entry.event_id, entry.reason) for entry in dataset.audit
    }


def test_times_and_optional_raw_context_survive_loading(tmp_path, snapshot):
    weather = snapshot["visits"][0]["weather"]
    weather.update(temperatureC=None, gridLatitude=None, weatherCode=999)
    dataset = records.load_snapshot(save_snapshot(tmp_path, snapshot))
    event = dataset.events[0]
    assert event.displayed_at == datetime(2026, 1, 2, 12, 1, tzinfo=timezone.utc)
    assert dataset.targets["e-yes"].received_at == datetime(
        2026, 1, 2, 12, 1, 2, tzinfo=timezone.utc
    )
    assert dataset.manifest["startsAt"].tzinfo is not None
    assert event.context["hunger"] is None
    assert event.context["weather"]["temperatureC"] is None
    assert event.context["weather"]["gridLatitude"] is None
    assert event.context["weather"]["weatherCode"] == 999
    assert event.context["weather"]["precipitationMm"] == 0
    assert event.context["weather"]["validAt"].tzinfo is not None
    snapshot["visits"][0]["weather"] = None
    dataset = records.load_snapshot(save_snapshot(tmp_path, snapshot))
    assert dataset.events[0].context["weather"] is None
    assert set(dataset.targets) == {"e-yes", "e-no"}


def test_client_clock_does_not_replace_server_acknowledgement(tmp_path, snapshot):
    snapshot["exposures"][0]["clientDisplayedAt"] = "2026-01-01T12:01:00Z"
    dataset = records.load_snapshot(save_snapshot(tmp_path, snapshot))
    assert dataset.events[0].displayed_at == datetime(
        2026, 1, 2, 12, 1, tzinfo=timezone.utc
    )
    assert "e-yes" in dataset.targets


@pytest.mark.parametrize("value", [True, False, 2, -1, float("nan"), float("inf")])
def test_target_rejects_boolean_or_nonbinary_values(value):
    with pytest.raises(ValueError, match="y"):
        records.Target("event", value, None)


@pytest.mark.parametrize("helper, ids", [
    ("events_for", ("missing",)),
    ("labels_for", ("missing",)),
    ("labels_for", ("e-unsure",)),
    ("labels_for", ("e-unanswered",)),
])
def test_alignment_helpers_reject_missing_ids(helper, ids):
    dataset = records.load_snapshot(EXAMPLE)
    with pytest.raises(ValueError, match="ids"):
        getattr(records, helper)(dataset, ids)


@pytest.mark.parametrize("entity, field", [
    ("exposures", "displayedAt"),
    ("responses", "receivedAt"),
])
def test_development_snapshot_rejects_test_week_records(tmp_path, snapshot, entity, field):
    snapshot[entity][0][field] = "2026-01-08T00:00:00Z"
    with pytest.raises(ValueError, match=field):
        records.load_snapshot(save_snapshot(tmp_path, snapshot))


def test_final_snapshot_requires_and_preserves_freeze_link(tmp_path, snapshot):
    snapshot["manifest"]["phase"] = "final"
    with pytest.raises(ValueError, match="freezeLink"):
        records.load_snapshot(save_snapshot(tmp_path, snapshot))
    snapshot["manifest"]["freezeLink"] = {
        "freezeManifestSha256": "1" * 64,
        "developmentSnapshotSha256": "2" * 64,
        "frozenAt": "2026-01-07T00:00:00Z",
    }
    dataset = records.load_snapshot(save_snapshot(tmp_path, snapshot))
    assert dataset.manifest["freezeLink"]["freezeManifestSha256"] == "1" * 64
    assert dataset.manifest["freezeLink"]["frozenAt"].tzinfo is not None
