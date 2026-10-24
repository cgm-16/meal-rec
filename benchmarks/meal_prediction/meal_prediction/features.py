# ABOUTME: Builds shared fit-only feature rows for all meal-prediction candidates.
# ABOUTME: Keeps training histories strictly prior and scoring profiles frozen.

"""Rows keep native scalar categories and deterministic set indicators.

Indicators use `field=<JSON string>`; numeric cross-products use
`x:<JSON pair of atom names>`. Unknown categories/crosses are omitted.
Fixed numeric columns and their paired `.missing` flags remain present, including
truthful profile counts/rates. `active_keys` records fitted nonzero raw columns,
not an encoded FM mask: adapters must freeze their own encoded nonzero support.
Entirely missing fitted measurements stay zero/missing at scoring.
"""

from collections import defaultdict
from dataclasses import dataclass, replace
from datetime import datetime, timedelta
import json
import math
from statistics import fmean, median
from typing import Mapping
from zoneinfo import ZoneInfo

from meal_prediction.records import Exposure, FeatureBatch, Target


MISSING = "__MISSING__"
SCALED = {"meal.spiciness", "meal.heaviness", "context.temperature", "context.precipitation"}
PUBLIC_ATTRIBUTES = (
    "alcohol", "smoking_area", "dress_code", "accessibility", "price",
    "Rambience", "franchise", "area", "other_services",
)
AFFINITY_FIELDS = {"cuisine": "meal.cuisine", "ingredient": "meal.ingredient", "flavor": "meal.flavor"}


@dataclass(frozen=True)
class FeatureState:
    source: str
    preset: str
    medians: tuple[tuple[str, float], ...]
    means: tuple[tuple[str, float], ...]
    scales: tuple[tuple[str, float], ...]
    empty_numeric: tuple[str, ...]
    vocabulary: tuple[tuple[str, tuple[str, ...]], ...]
    missing_categories: tuple[str, ...]
    profiles: tuple[tuple[tuple[str, ...], tuple[int, int]], ...]
    active_keys: tuple[str, ...]


def _token(field, value):
    return f"{field}={json.dumps(value, ensure_ascii=True, separators=(',', ':'))}"


def _values(value):
    return tuple(sorted(set(value or ())))


def _weather_usable(event, weather):
    """Use recorded retrieval/capture time, excluding any after-prediction fetch."""
    anchor = weather.get("retrievedAt")
    if anchor is None:
        anchor = event.context.get("contextCapturedAt")
    valid_at = weather.get("validAt")
    if weather.get("status") not in ("ok", "partial") or any(
        not isinstance(instant, datetime) or instant.utcoffset() is None
        for instant in (anchor, valid_at, event.displayed_at)
    ):
        return False
    return anchor <= event.displayed_at and -timedelta(minutes=5) <= anchor - valid_at <= timedelta(hours=1)


def _raw(event, source, preset):
    meal, context = event.meal, event.context
    if source == "pilot" and (
        (event.displayed_at is None and preset != "F0")
        or (event.displayed_at is not None and event.displayed_at.utcoffset() is None)
    ):
        raise ValueError("displayed_at: pilot histories require an aware prediction time")
    if source == "uci":
        cuisines = _values(meal.get("cuisines"))
        preferences = _values(context.get("cuisine_preferences"))
        compatibility = len(set(cuisines) & set(preferences)) / len(cuisines) if cuisines and preferences else None
        numeric = {"context.cuisine_compatibility": compatibility}
        categorical = {f"meal.{field}": meal.get(field) for field in PUBLIC_ATTRIBUTES}
        multiple = {"meal.cuisine": cuisines, "meal.payment": _values(meal.get("payments")),
                    "meal.parking": _values(meal.get("parking"))}
    else:
        numeric = {f"meal.{field}": meal.get(field) for field in ("spiciness", "heaviness")}
        categorical = {"meal.cuisine": meal.get("cuisine")}
        multiple = {f"meal.{field}": _values(meal.get(raw)) for field, raw in (
            ("ingredient", "primaryIngredients"), ("flavor", "flavorTags"),
            ("weather_tag", "weather"), ("time_tag", "timeOfDay"),
        )}
        local = None
        zone = (context.get("city") or {}).get("timezone")
        if event.displayed_at is not None and zone is not None:
            local = event.displayed_at.astimezone(ZoneInfo(zone))
        hour = None if local is None else local.hour + local.minute / 60 + local.second / 3600
        for name, position, period in (("hour", hour, 24), ("dow", None if local is None else local.weekday(), 7)):
            for function in ("sin", "cos"):
                numeric[f"context.{name}_{function}"] = None if position is None else getattr(math, function)(2 * math.pi * position / period)
        if preset in ("F2", "F3"):
            categorical["context.hunger"] = context.get("hunger")
        if preset == "F3":
            weather = context.get("weather") or {}
            if not _weather_usable(event, weather):
                weather = {}
            numeric.update({"context.temperature": weather.get("temperatureC"),
                            "context.precipitation": weather.get("precipitationMm")})
            categorical["context.wmo"] = weather.get("weatherCode")
    if preset != "F0":
        categorical.update(participant_id=event.participant_id, meal_id=event.item_id)
    for name, value in numeric.items():
        if value is not None and (type(value) not in (int, float) or not math.isfinite(value)):
            raise ValueError(f"{name}: expected a finite numeric value or None")
    return numeric, categorical, multiple


def _profile_keys(event, source):
    if source == "uci":
        content = {"cuisine": _values(event.meal.get("cuisines"))}
    else:
        content = {"cuisine": () if not event.meal.get("cuisine") else (event.meal["cuisine"],),
                   "ingredient": _values(event.meal.get("primaryIngredients")),
                   "flavor": _values(event.meal.get("flavorTags"))}
    return (("user", event.participant_id), ("item", event.item_id), *(
        (kind, event.participant_id, value) for kind, values in content.items() for value in values
    ))


def _update_profiles(profiles, event, target, source):
    for key in _profile_keys(event, source):
        yes, count = profiles.get(key, (0, 0))
        profiles[key] = (yes + target.y, count + 1)


def _row(state, event, raw, profiles, *, exclude=None):
    numeric, categorical, multiple = raw
    medians, means, scales = dict(state.medians), dict(state.means), dict(state.scales)
    vocabulary = dict(state.vocabulary)
    row = {}
    for name, value in numeric.items():
        missing = value is None or name in state.empty_numeric
        value = medians[name] if missing else float(value)
        row[name] = (value - means[name]) / scales[name]
        row[f"{name}.missing"] = float(missing)
    for name, value in categorical.items():
        missing = value is None or value == ""
        if missing and name in state.missing_categories:
            row[name] = MISSING
        elif not missing and str(value) in vocabulary[name]:
            row[name] = str(value)
        row[f"{name}.missing"] = float(missing)
    for name, values in multiple.items():
        row[f"{name}.missing"] = float(not values)
        for value in values:
            if value in vocabulary[name]:
                row[_token(name, value)] = 1.0
    content, contexts = {}, {}
    for name, value in row.items():
        if name.endswith(".missing"):
            continue
        atom, magnitude = (_token(name, value), 1.0) if isinstance(value, str) else (name, value)
        if name.startswith("meal."):
            content[atom] = magnitude
        elif name.startswith("context."):
            contexts[atom] = magnitude
    if "participant_id" in row:
        person = _token("participant_id", row["participant_id"])
        personal_content = content if state.source == "pilot" else {
            name: value for name, value in content.items() if name.startswith("meal.cuisine=")
        }
        for name, value in personal_content.items():
            row["x:" + json.dumps((person, name), separators=(',', ':'))] = value
    for context, magnitude in contexts.items():
        for name, value in content.items():
            row["x:" + json.dumps((context, name), separators=(',', ':'))] = magnitude * value
    if state.preset != "F0":
        for key in _profile_keys(event, state.source):
            kind = key[0]
            if kind in AFFINITY_FIELDS and key[-1] not in vocabulary[AFFINITY_FIELDS[kind]]:
                continue
            yes, count = profiles.get(key, (0, 0))
            if exclude is not None:
                yes, count = yes - exclude.y, count - 1
            name = f"profile.{kind}" if kind in ("user", "item") else _token(f"profile.{kind}", key[-1])
            row[f"{name}.count"] = float(count)
            row[f"{name}.rate"] = (yes + 1) / (count + 2)
    return dict(sorted(row.items()))


def _batch(state, events, rows):
    active = set(state.active_keys)
    return FeatureBatch(
        tuple(event.event_id for event in events), tuple(event.participant_id for event in events),
        tuple({key: value for key, value in row.items() if not key.startswith("x:") or key in active} for row in rows),
        events,
    )


def fit_features(
    fit_events: tuple[Exposure, ...], fit_targets: Mapping[str, Target], *, preset: str, source: str,
) -> tuple[FeatureState, FeatureBatch]:
    if source not in ("pilot", "uci"):
        raise ValueError("source: expected pilot or uci")
    if preset not in ("F0", "F1", "F2", "F3") or (source == "uci" and preset not in ("F0", "F1")):
        raise ValueError("preset: expected pilot F0-F3 or public F0-F1")
    if not fit_events:
        raise ValueError("fit_events: empty fitting partition")
    indexed = {event.event_id: event for event in fit_events}
    if len(indexed) != len(fit_events):
        raise ValueError("fit_events: duplicate event ID")
    for identity, target in fit_targets.items():
        if identity not in indexed or target.event_id != identity:
            raise ValueError("fit_targets: target must match an event in the fitting partition")
        if source == "pilot":
            display, receipt = indexed[identity].displayed_at, target.received_at
            if (display is None or receipt is None or display.utcoffset() is None
                    or receipt.utcoffset() is None or receipt <= display):
                raise ValueError("fit_targets: receipt must be aware and strictly after displayed_at")
    raws = tuple(_raw(event, source, preset) for event in fit_events)
    medians, means, scales, empty = {}, {}, {}, []
    for name in raws[0][0]:
        values = [raw[0][name] for raw in raws if raw[0][name] is not None]
        medians[name] = float(median(values)) if values else 0.0
        if not values:
            empty.append(name)
        imputed = [medians[name] if raw[0][name] is None else float(raw[0][name]) for raw in raws]
        means[name] = fmean(imputed) if name in SCALED else 0.0
        scales[name] = (math.sqrt(fmean((value - means[name]) ** 2 for value in imputed)) or 1.0) if name in SCALED else 1.0
    vocabulary, missing_categories = defaultdict(set), set()
    for _, categorical, multiple in raws:
        for name, value in categorical.items():
            known = vocabulary[name]
            if value is None or value == "":
                missing_categories.add(name)
            else:
                known.add(str(value))
        for name, values in multiple.items():
            vocabulary[name].update(values)
    profiles = {}
    if preset != "F0":
        for event in fit_events:
            if event.event_id in fit_targets:
                _update_profiles(profiles, event, fit_targets[event.event_id], source)
    state = FeatureState(
        source=source, preset=preset, medians=tuple(sorted(medians.items())),
        means=tuple(sorted(means.items())), scales=tuple(sorted(scales.items())),
        empty_numeric=tuple(sorted(empty)),
        vocabulary=tuple((name, tuple(sorted(values))) for name, values in sorted(vocabulary.items())),
        missing_categories=tuple(sorted(missing_categories)), profiles=tuple(sorted(profiles.items())),
        active_keys=(),
    )
    if source == "uci" or preset == "F0":
        rows = tuple(_row(state, event, raw, profiles, exclude=fit_targets.get(event.event_id) if source == "uci" else None)
                     for event, raw in zip(fit_events, raws))
    else:
        prior, rows_by_id, cursor = {}, {}, 0
        receipts = sorted((target.received_at, identity) for identity, target in fit_targets.items())
        raw_by_id = dict(zip(indexed, raws))
        for event in sorted(fit_events, key=lambda event: (event.displayed_at, event.event_id)):
            while cursor < len(receipts) and receipts[cursor][0] < event.displayed_at:
                _, identity = receipts[cursor]
                _update_profiles(prior, indexed[identity], fit_targets[identity], source)
                cursor += 1
            rows_by_id[event.event_id] = _row(state, event, raw_by_id[event.event_id], prior)
        rows = tuple(rows_by_id[event.event_id] for event in fit_events)
    state = replace(state, active_keys=tuple(sorted({key for row in rows for key, value in row.items() if isinstance(value, str) or value != 0})))
    return state, _batch(state, fit_events, rows)


def transform_features(state: FeatureState, events: tuple[Exposure, ...]) -> FeatureBatch:
    profiles = dict(state.profiles)
    rows = tuple(_row(state, event, _raw(event, state.source, state.preset), profiles) for event in events)
    return _batch(state, events, rows)
