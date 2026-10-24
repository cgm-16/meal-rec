# ABOUTME: Verifies shared information presets and training-only feature preprocessing.
# ABOUTME: Catches own/future-label leakage, unknown activations, and mutable score state.

from dataclasses import replace
from datetime import datetime, timedelta, timezone

import pytest

from meal_prediction import features
from meal_prediction.records import Dataset, Exposure, Split, Target, events_for


T0 = datetime(2026, 1, 1, tzinfo=timezone.utc)


def pilot_event(identity, hour, *, participant="p", item="m", meal=None, context=None):
    displayed_at = T0 + timedelta(hours=hour)
    weather = {
        "status": "ok", "validAt": displayed_at, "retrievedAt": displayed_at,
        "temperatureC": None, "precipitationMm": 0, "weatherCode": 61,
    }
    visit = {
        "city": {"timezone": "Asia/Seoul"}, "hunger": "very_hungry",
        "contextCapturedAt": displayed_at, "weather": weather,
    } | (context or {})
    if visit["weather"] is not None:
        visit["weather"] = weather | visit["weather"]
    return Exposure(identity, participant, item, displayed_at, {
        "id": item, "name": "Display title", "cuisine": "Korean",
        "primaryIngredients": ["rice"], "flavorTags": ["savory"],
        "weather": ["cold"], "timeOfDay": ["dinner"],
        "spiciness": 1, "heaviness": 2,
    } | (meal or {}), visit)


def pilot_target(event, y, receipt_hour):
    return Target(event.event_id, y, T0 + timedelta(hours=receipt_hour))


def public_event(identity, cuisine, *, participant="u", item="r"):
    return Exposure(identity, participant, item, None, {
        "id": item, "name": "Direct restaurant identity", "cuisines": (cuisine,),
        "price": "medium", "payments": ("cash",), "parking": ("public",),
    }, {"profile": {"weight": "60"}, "cuisine_preferences": ("Mexican",)})


def test_training_profile_excludes_own_and_future_label():
    first, second, boundary, last = tuple(pilot_event(f"e{i}", i) for i in range(4))
    events = (last, second, first, boundary)
    targets = {
        "e0": pilot_target(first, 1, 0.5), "e1": pilot_target(second, 1, 2),
        "e2": pilot_target(boundary, 0, 2.5), "e3": pilot_target(last, 1, 3.5),
    }
    _, batch = features.fit_features(events, targets, preset="F1", source="pilot")
    rows = dict(zip(batch.ids, batch.rows))
    assert batch.ids == ("e3", "e1", "e0", "e2")
    assert (rows["e0"]["profile.user.rate"], rows["e0"]["profile.user.count"]) == (0.5, 0)
    assert rows["e1"]["profile.user.rate"] == pytest.approx(2 / 3)
    assert rows["e1"]["profile.user.count"] == 1
    assert rows["e2"]["profile.user.rate"] == pytest.approx(2 / 3)
    assert rows["e2"]["profile.user.count"] == 1  # Receipt exactly at prediction is unavailable.
    assert rows["e3"]["profile.user.rate"] == pytest.approx(3 / 5)
    assert rows["e3"]["profile.user.count"] == 3
    assert rows["e1"]['profile.cuisine="Korean".rate'] == pytest.approx(2 / 3)
    assert rows["e1"]['profile.ingredient="rice".count'] == 1
    assert rows["e1"]['profile.flavor="savory".rate'] == pytest.approx(2 / 3)
    changed = targets | {"e1": replace(targets["e1"], y=0), "e3": replace(targets["e3"], y=0)}
    _, changed_batch = features.fit_features(events, changed, preset="F1", source="pilot")
    changed_rows = dict(zip(changed_batch.ids, changed_batch.rows))
    assert all(rows[key] == changed_rows[key] for key in ("e0", "e1", "e2"))
    assert changed_rows["e3"]["profile.user.rate"] == pytest.approx(2 / 5)


def test_public_profile_is_leave_one_out():
    events = (public_event("a", "Mexican"), public_event("b", "Mexican"), public_event("c", "Chinese"))
    targets = {identity: Target(identity, y, None) for identity, y in (("a", 1), ("b", 0), ("c", 1))}
    state, batch = features.fit_features(events, targets, preset="F1", source="uci")
    assert [row["profile.user.rate"] for row in batch.rows] == [0.5, 0.75, 0.5]
    assert [row["profile.user.count"] for row in batch.rows] == [2, 2, 2]
    assert batch.rows[0]['profile.cuisine="Mexican".rate'] == pytest.approx(1 / 3)
    assert batch.rows[1]['profile.cuisine="Mexican".rate'] == pytest.approx(2 / 3)
    assert batch.rows[2]['profile.cuisine="Chinese".rate'] == 0.5
    scored = features.transform_features(state, (public_event("new", "Mexican"),))
    assert scored.rows[0]["profile.user.rate"] == pytest.approx(3 / 5)
    assert scored.rows[0]["profile.user.count"] == 3
    assert scored.rows[0]['profile.cuisine="Mexican".rate'] == 0.5


def test_heldout_targets_cannot_change_features():
    events = tuple(pilot_event(f"e{i}", i) for i in range(4))
    targets = {event.event_id: pilot_target(event, index % 2, index + 0.5) for index, event in enumerate(events)}
    dataset = Dataset("pilot", {}, events, targets, ())
    split = Split(("e0", "e1"), ("e2",), ("e3",), ())
    fit = events_for(dataset, split.train_ids)
    state, _ = features.fit_features(fit, {key: targets[key] for key in split.train_ids}, preset="F3", source="pilot")
    score_events = events_for(dataset, split.development_ids + split.test_ids)
    before = features.transform_features(state, score_events)
    changed = replace(dataset, targets=targets | {key: replace(targets[key], y=1-targets[key].y) for key in ("e2", "e3")})
    assert features.transform_features(state, events_for(changed, before.ids)) == before
    assert before.ids == ("e2", "e3")
    assert before.participant_ids == ("p", "p")
    assert before.events == score_events
    assert not hasattr(before, "targets")
    with pytest.raises(TypeError):
        features.transform_features(state, score_events, targets=changed.targets)


def test_unknown_and_never_active_features_are_neutral():
    events = (pilot_event("a", 0), pilot_event("b", 1, context={
        "weather": {"temperatureC": None, "precipitationMm": 2, "weatherCode": 61},
    }))
    targets = {event.event_id: pilot_target(event, 1, index + 0.5) for index, event in enumerate(events)}
    state, training = features.fit_features(events, targets, preset="F3", source="pilot")
    unseen = pilot_event("new", 2, participant="unseen-person", item="unseen-meal", meal={
        "cuisine": "Unseen cuisine", "primaryIngredients": ["unseen-ingredient"],
    }, context={"hunger": "not_hungry", "weather": {
        "temperatureC": 30, "precipitationMm": None, "weatherCode": 999,
    }})
    scored = features.transform_features(state, (unseen,)).rows[0]
    assert not {"participant_id", "meal_id", "meal.cuisine", "context.hunger", "context.wmo"} & scored.keys()
    assert scored["context.temperature"] == 0
    assert scored["context.temperature.missing"] == 1
    assert scored["context.precipitation"] == 0  # Training median 1, mean 1, scale 1.
    assert scored["context.precipitation.missing"] == 1
    assert not any("unseen" in key or "Unseen" in key or "999" in key or "not_hungry" in key for key in scored)
    assert set(scored) <= set().union(*(row.keys() for row in training.rows))


def test_pilot_f0_uses_content_and_current_city_cyclic_clock_only():
    event = pilot_event("a", 0, meal={"primaryIngredients": ["rice", "bean", "rice"]})
    state, batch = features.fit_features((event,), {"a": pilot_target(event, 1, 0.5)}, preset="F0", source="pilot")
    row = batch.rows[0]
    assert row["meal.cuisine"] == "Korean"
    assert row['meal.ingredient="rice"'] == row['meal.ingredient="bean"'] == 1
    assert row['meal.flavor="savory"'] == row['meal.weather_tag="cold"'] == row['meal.time_tag="dinner"'] == 1
    assert row["context.hour_sin"] == pytest.approx(2 ** -0.5)
    assert row["context.hour_cos"] == pytest.approx(-(2 ** -0.5))
    assert row["context.dow_sin"] == pytest.approx(0.43388373911755823)
    assert row["context.dow_cos"] == pytest.approx(-0.900968867902419)
    assert not any(key.startswith(("profile.", "participant_id", "meal_id", "context.hunger", "context.wmo", "context.temperature", "context.precipitation")) for key in row)
    changed = replace(event, event_id="other-event", participant_id="other-person", item_id="other-meal", meal=event.meal | {
        "id": "other-meal", "name": "Other title", "description": "Other description",
        "primaryIngredients": ["bean", "rice"], "answer": "no",
    }, context=event.context | {"enrollmentTimezone": "UTC", "answer": "yes"})
    assert features.transform_features(state, (changed,)).rows == batch.rows


def test_preset_ladder_keeps_native_categories_and_explicit_interactions():
    import json

    first = pilot_event("a", 0, context={"weather": {"temperatureC": 10, "precipitationMm": 0, "weatherCode": 61}})
    second = pilot_event("b", 1, meal={"spiciness": 3, "heaviness": 4}, context={
        "hunger": "somewhat_hungry", "weather": {"temperatureC": 20, "precipitationMm": 2, "weatherCode": 0},
    })
    targets = {"a": pilot_target(first, 1, 0.5), "b": pilot_target(second, 0, 1.5)}
    rows = {preset: features.fit_features((first, second), targets, preset=preset, source="pilot")[1].rows[0] for preset in ("F0", "F1", "F2", "F3")}
    assert rows["F1"]["participant_id"] == "p"
    assert rows["F1"]["meal_id"] == "m"
    assert rows["F2"]["context.hunger"] == "very_hungry"
    assert rows["F3"]["context.wmo"] == "61"
    assert all(not isinstance(row.get("context.hunger"), float) and not isinstance(row.get("context.wmo"), float) for row in rows.values())
    assert "context.hunger" not in rows["F0"] and "context.hunger" not in rows["F1"]
    assert "context.wmo" not in rows["F2"] and "context.temperature" not in rows["F2"]
    for preset in ("F1", "F2", "F3"):
        crosses = {tuple(json.loads(key[2:])): value for key, value in rows[preset].items() if key.startswith("x:")}
        assert crosses[('participant_id="p"', 'meal.cuisine="Korean"')] == 1
        assert crosses[('participant_id="p"', 'meal.ingredient="rice"')] == 1
        assert crosses[('participant_id="p"', 'meal.flavor="savory"')] == 1
        assert crosses[('participant_id="p"', "meal.spiciness")] == -1
        assert crosses[('participant_id="p"', "meal.heaviness")] == -1
    crosses = {tuple(json.loads(key[2:])): value for key, value in rows["F3"].items() if key.startswith("x:")}
    assert crosses[('context.hunger="very_hungry"', "meal.spiciness")] == -1
    assert crosses[('context.wmo="61"', 'meal.ingredient="rice"')] == 1
    assert crosses[("context.temperature", "meal.spiciness")] == 1
    assert crosses[("context.precipitation", 'meal.cuisine="Korean"')] == -1
    assert any(key.startswith('x:["context.hour_sin",') for key in rows["F0"])


def test_numeric_preprocessing_uses_only_fit_medians_and_scales():
    import math

    events = tuple(pilot_event(f"e{i}", i, meal={"spiciness": spice, "heaviness": 0}, context={
        "weather": {"temperatureC": temperature, "precipitationMm": 0, "weatherCode": 61},
    }) for i, (spice, temperature) in enumerate(((1, 10), (None, None), (3, 30))))
    state, _ = features.fit_features(events, {}, preset="F3", source="pilot")
    assert dict(state.medians)["meal.spiciness"] == 2
    assert dict(state.medians)["context.temperature"] == 20
    assert dict(state.means)["meal.spiciness"] == 2
    assert dict(state.scales)["meal.spiciness"] == pytest.approx(math.sqrt(2 / 3))
    score = pilot_event("score", 4, meal={"spiciness": 5, "heaviness": 2}, context={
        "weather": {"temperatureC": None, "precipitationMm": 1000, "weatherCode": 61},
    })
    row = features.transform_features(state, (score,)).rows[0]
    assert row["meal.spiciness"] == pytest.approx(3 / math.sqrt(2 / 3))
    assert row["context.temperature"] == 0
    assert row["context.temperature.missing"] == 1
    assert row["context.precipitation"] == 1000
    assert row["meal.heaviness"] == 2  # A known fixed numeric column retains its truthful value.
    assert "meal.heaviness" not in state.active_keys
    assert not any("meal.heaviness" in key for key in row if key.startswith("x:"))


def test_missing_categories_are_preserved_and_sets_do_not_double_count():
    first = pilot_event("a", 0, meal={"primaryIngredients": ["rice", "rice"], "cuisine": None}, context={
        "hunger": None, "weather": {"temperatureC": None, "precipitationMm": None, "weatherCode": None},
    })
    second = replace(first, event_id="b", displayed_at=T0 + timedelta(hours=1))
    state, training = features.fit_features((first, second), {"a": pilot_target(first, 1, 0.5)}, preset="F3", source="pilot")
    row = training.rows[1]
    assert row["meal.cuisine"] == row["context.hunger"] == row["context.wmo"] == "__MISSING__"
    assert row["context.hunger.missing"] == row["context.wmo.missing"] == 1
    assert row['profile.ingredient="rice".count'] == 1
    measured = pilot_event("later", 2, meal=first.meal, context={
        "hunger": "very_hungry", "weather": {"temperatureC": 30, "precipitationMm": 2, "weatherCode": 61},
    })
    scored = features.transform_features(state, (measured,)).rows[0]
    assert "context.hunger" not in scored and "context.wmo" not in scored
    assert scored["context.hunger.missing"] == scored["context.wmo.missing"] == 0
    assert scored["context.precipitation"] == 0
    assert scored["context.precipitation.missing"] == 1


def test_public_f0_allowlist_uses_static_content_and_stated_compatibility():
    event = public_event("a", "Mexican")
    event = replace(event, meal=event.meal | {
        "cuisines": ("Mexican", "Chinese", "Mexican"), "alcohol": "No_Alcohol_Served",
        "spiciness": 5, "heaviness": 5, "weather": ["cold"], "timeOfDay": ["dinner"],
        "address": "Direct identity", "url": "https://example.invalid/id", "latitude": "22.0",
        "opening_hours": (("Mon", "09:00-17:00"),), "rating": 2,
    }, context=event.context | {"hunger": "very_hungry", "weather": {"temperatureC": 20}, "receivedAt": T0})
    state, batch = features.fit_features((event,), {"a": Target("a", 1, None)}, preset="F0", source="uci")
    row = batch.rows[0]
    assert row["meal.price"] == "medium"
    assert row["meal.alcohol"] == "No_Alcohol_Served"
    assert row['meal.cuisine="Chinese"'] == row['meal.cuisine="Mexican"'] == 1
    assert row['meal.payment="cash"'] == row['meal.parking="public"'] == 1
    assert row["context.cuisine_compatibility"] == 0.5
    assert not any(token in key for key in row for token in ("hour", "dow_", "hunger", "weather", "spiciness", "heaviness", "profile.", "participant_id", "meal_id", "latitude", "address", "url", "rating"))
    changed = replace(event, event_id="renamed", participant_id="other", item_id="other", meal=event.meal | {"id": "other", "name": "Other name"})
    assert features.transform_features(state, (changed,)).rows == batch.rows
    personal, personal_batch = features.fit_features((event,), {"a": Target("a", 1, None)}, preset="F1", source="uci")
    assert personal_batch.rows[0]["participant_id"] == "u"
    assert personal_batch.rows[0]["meal_id"] == "r"
    frozen = features.transform_features(personal, (replace(event, event_id="score"),)).rows[0]
    assert frozen["profile.user.count"] == 1  # A zero training count still has an honest frozen value.
    assert "profile.user.count" not in personal.active_keys


def test_serialized_feature_state_is_frozen_across_scoring_and_reload(tmp_path):
    from dataclasses import FrozenInstanceError
    import hashlib
    import pickle

    event = pilot_event("fit", 0)
    state, _ = features.fit_features((event,), {"fit": pilot_target(event, 1, 0.5)}, preset="F3", source="pilot")
    original = pickle.dumps(state)
    original_hash = hashlib.sha256(original).hexdigest()
    state_path = tmp_path / "state.pkl"
    state_path.write_bytes(original)
    future = (pilot_event("score-a", 3), pilot_event("score-b", 4))
    scored = features.transform_features(state, future)
    assert [row["profile.user.count"] for row in scored.rows] == [1, 1]
    assert [row["profile.user.rate"] for row in scored.rows] == pytest.approx([2 / 3, 2 / 3])
    assert hashlib.sha256(pickle.dumps(state)).hexdigest() == original_hash
    restored = pickle.loads(state_path.read_bytes())
    assert hash(restored) == hash(state)
    assert hashlib.sha256(pickle.dumps(restored)).hexdigest() == original_hash
    assert features.transform_features(restored, future) == scored
    with pytest.raises(FrozenInstanceError):
        state.preset = "F0"


@pytest.mark.parametrize("source,preset", [("other", "F0"), ("pilot", "F4"), ("uci", "F2"), ("uci", "F3")])
def test_invalid_source_or_preset_is_rejected(source, preset):
    with pytest.raises(ValueError, match="source|preset"):
        features.fit_features((pilot_event("a", 0),), {}, source=source, preset=preset)


def test_fit_rejects_duplicate_events_and_targets_outside_fit_partition():
    event = pilot_event("a", 0)
    with pytest.raises(ValueError, match="duplicate"):
        features.fit_features((event, event), {}, preset="F1", source="pilot")
    with pytest.raises(ValueError, match="target"):
        features.fit_features((event,), {"heldout": Target("heldout", 1, T0)}, preset="F1", source="pilot")
    with pytest.raises(ValueError, match="target"):
        features.fit_features((event,), {"a": Target("wrong-id", 1, T0)}, preset="F1", source="pilot")
    with pytest.raises(ValueError, match="empty"):
        features.fit_features((), {}, preset="F0", source="pilot")


def test_real_uci_features_fit_and_score_the_recorded_partition():
    import math
    from pathlib import Path
    from meal_prediction.datasets import fetch_uci, load_uci
    from meal_prediction.splits import split_uci

    dataset = load_uci(fetch_uci(Path(__file__).resolve().parents[1] / "data/uci-restaurant-consumer.zip"))
    split = split_uci(dataset, seed=42)
    state, fitted = features.fit_features(events_for(dataset, split.train_ids), {
        identity: dataset.targets[identity] for identity in split.train_ids
    }, preset="F1", source="uci")
    assert fitted.ids == split.train_ids
    assert sum(count for key, (_, count) in state.profiles if key[0] == "user") == 812
    assert set(dict(state.vocabulary)["participant_id"]) == {event.participant_id for event in fitted.events}
    scored = features.transform_features(state, events_for(dataset, split.development_ids + split.test_ids))
    assert len(fitted.rows) == 812
    assert len(scored.rows) == 349
    assert all(isinstance(value, str) or math.isfinite(value) for row in (*fitted.rows, *scored.rows) for value in row.values())
    assert not any(token in key for row in (*fitted.rows, *scored.rows) for key in row for token in ("context.hour", "context.hunger", "context.wmo", "context.temperature", "context.precipitation"))


def test_prior_affinities_do_not_mix_participants():
    first = pilot_event("a", 0, participant="yes-person", item="first-item")
    second = pilot_event("b", 1, participant="no-person", item="second-item")
    third = pilot_event("c", 2, participant="yes-person", item="new-item")
    fourth = pilot_event("d", 2, participant="no-person", item="new-item")
    _, batch = features.fit_features((first, second, third, fourth), {
        "a": pilot_target(first, 1, 0.5), "b": pilot_target(second, 0, 1.5),
    }, preset="F1", source="pilot")
    assert batch.rows[1]["profile.user.count"] == 0
    assert batch.rows[1]["profile.user.rate"] == 0.5
    assert batch.rows[2]['profile.cuisine="Korean".rate'] == pytest.approx(2 / 3)
    assert batch.rows[3]['profile.cuisine="Korean".rate'] == pytest.approx(1 / 3)
    assert batch.rows[2]['profile.ingredient="rice".count'] == 1
    assert batch.rows[2]["profile.item.count"] == 0


def test_pilot_f0_does_not_invent_an_unknown_clock():
    event = replace(pilot_event("a", 0), displayed_at=None, context={})
    state, batch = features.fit_features((event,), {}, preset="F0", source="pilot")
    assert batch.rows[0]["context.hour_sin"] == 0
    assert batch.rows[0]["context.hour_sin.missing"] == 1
    assert batch.rows[0]["context.dow_cos"] == 0
    assert batch.rows[0]["context.dow_cos.missing"] == 1
    measured = pilot_event("b", 1)
    row = features.transform_features(state, (measured,)).rows[0]
    assert row["context.hour_sin"] == 0
    assert row["context.hour_sin.missing"] == 1


@pytest.mark.parametrize("value", [float("nan"), float("inf"), True, "20"])
def test_nonfinite_or_nonnumeric_measurements_are_rejected(value):
    event = pilot_event("a", 0, context={"weather": {"temperatureC": value}})
    with pytest.raises(ValueError, match="context.temperature"):
        features.fit_features((event,), {}, preset="F3", source="pilot")
    valid = pilot_event("fit", 0)
    state, _ = features.fit_features((valid,), {}, preset="F3", source="pilot")
    with pytest.raises(ValueError, match="context.temperature"):
        features.transform_features(state, (event,))


@pytest.mark.parametrize("receipt", [None, T0, T0 - timedelta(seconds=1), T0.replace(tzinfo=None)])
def test_pilot_targets_require_a_strictly_later_aware_receipt(receipt):
    event = pilot_event("a", 0)
    with pytest.raises(ValueError, match="target.*receipt"):
        features.fit_features((event,), {"a": Target("a", 1, receipt)}, preset="F1", source="pilot")


@pytest.mark.parametrize("display", [None, T0.replace(tzinfo=None)])
def test_pilot_histories_require_a_known_aware_prediction_time(display):
    event = replace(pilot_event("a", 0), displayed_at=display)
    with pytest.raises(ValueError, match="displayed_at"):
        features.fit_features((event,), {}, preset="F1", source="pilot")


@pytest.mark.parametrize("weather,context,usable", [
    ({"status": "unavailable"}, {}, False),
    ({"status": None}, {}, False),
    ({"validAt": None}, {}, False),
    ({"validAt": T0 + timedelta(hours=3, microseconds=-1)}, {}, False),
    ({"validAt": T0 + timedelta(hours=4, minutes=5, microseconds=1)}, {}, False),
    ({"validAt": T0 + timedelta(hours=3)}, {}, True),
    ({"validAt": T0 + timedelta(hours=4, minutes=5)}, {}, True),
    ({"retrievedAt": T0 + timedelta(hours=4, microseconds=1)}, {}, False),
    ({"retrievedAt": None}, {}, True),
    ({"retrievedAt": None}, {"contextCapturedAt": None}, False),
    ({"retrievedAt": None}, {"contextCapturedAt": T0 + timedelta(hours=4, microseconds=1)}, False),
    ({"retrievedAt": None}, {"contextCapturedAt": T0 + timedelta(hours=3, minutes=59)}, True),
    ({"retrievedAt": (T0 + timedelta(hours=4)).replace(tzinfo=None)}, {}, False),
    ({"validAt": (T0 + timedelta(hours=4)).replace(tzinfo=None)}, {}, False),
])
def test_weather_availability_uses_recorded_time_and_inclusive_bounds(weather, context, usable):
    from copy import deepcopy

    first = pilot_event("a", 0, context={"weather": {"temperatureC": 10, "precipitationMm": 0, "weatherCode": 0}})
    second = pilot_event("b", 1, context={"weather": {"temperatureC": 30, "precipitationMm": 2, "weatherCode": 61}})
    state, _ = features.fit_features((first, second), {}, preset="F3", source="pilot")
    event = pilot_event("score", 4, context=context | {"weather": {
        "temperatureC": 30, "precipitationMm": 2, "weatherCode": 0,
    } | weather})
    original = deepcopy(event)
    batch = features.transform_features(state, (event,))
    row = batch.rows[0]
    assert row["context.temperature.missing"] == row["context.precipitation.missing"] == row["context.wmo.missing"] == int(not usable)
    assert row["context.temperature"] == row["context.precipitation"] == int(usable)
    assert row.get("context.wmo") == ("0" if usable else None)
    assert event == original
    assert batch.events[0] is event


def test_usable_partial_weather_keeps_zero_fields_and_fits_only_eligible_values():
    unavailable = pilot_event("unavailable", 0, context={"weather": {
        "status": "unavailable", "temperatureC": 999, "precipitationMm": 999, "weatherCode": 999,
    }})
    low = pilot_event("low", 1, context={"weather": {"temperatureC": 10, "precipitationMm": 0, "weatherCode": 0}})
    high = pilot_event("high", 2, context={"weather": {"temperatureC": 30, "precipitationMm": 2, "weatherCode": 61}})
    state, fit = features.fit_features((unavailable, low, high), {}, preset="F3", source="pilot")
    assert dict(state.medians)["context.temperature"] == 20
    assert "999" not in dict(state.vocabulary)["context.wmo"]
    assert fit.rows[0]["context.temperature.missing"] == 1
    partial = pilot_event("partial", 4, context={"weather": {
        "status": "partial", "temperatureC": None, "precipitationMm": 0, "weatherCode": 0,
    }})
    row = features.transform_features(state, (partial,)).rows[0]
    assert row["context.temperature.missing"] == 1
    assert row["context.precipitation.missing"] == row["context.wmo.missing"] == 0
    assert row["context.precipitation"] == pytest.approx(-(3 / 2) ** 0.5)
    assert row["context.wmo"] == "0"


@pytest.mark.parametrize("fitted_cuisine,scored_cuisine,missing", [
    (None, "__MISSING__", 0), ("__MISSING__", None, 1),
])
def test_missing_marker_cannot_make_an_unseen_real_category_known(fitted_cuisine, scored_cuisine, missing):
    first = pilot_event("fit", 0, meal={"cuisine": fitted_cuisine})
    state, _ = features.fit_features((first,), {}, preset="F0", source="pilot")
    score = pilot_event("score", 1, meal={"cuisine": scored_cuisine})
    row = features.transform_features(state, (score,)).rows[0]
    assert "meal.cuisine" not in row
    assert row["meal.cuisine.missing"] == missing
