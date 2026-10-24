# ABOUTME: Pins the benchmark heuristic to actual core score vectors and strict receipt histories.
# ABOUTME: Verifies real calibration, frozen fitting state, persistence and aligned score metadata.

from dataclasses import replace
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import pickle
import warnings

import numpy as np
import pytest
from sklearn.linear_model import LogisticRegression

from meal_prediction.records import Exposure, FeatureBatch, Target


T0 = datetime(2026, 1, 15, 12, tzinfo=timezone.utc)
VECTORS = json.loads((Path(__file__).resolve().parents[3] / "contracts/meal-prediction/heuristic-v1.example.json").read_text())["vectors"]


def event(identity="score", *, item="candidate", person="p", when=T0, meal=None, weather=None, avoided=()):
    return Exposure(identity, person, item, when, {
        "id": item, "name": "Candidate", "cuisine": "Korean", "primaryIngredients": ["rice"],
        "allergens": [], "spiciness": 2, "heaviness": 2, "weather": [],
        "timeOfDay": ["lunch"], "flavorTags": ["savory"],
    } | (meal or {}), {"dietaryExclusions": list(avoided), "weather": weather})


def weather(condition, when=T0):
    if condition == "normal":
        return None
    return {"status": "ok", "retrievedAt": when, "validAt": when,
            "temperatureC": {"cold": 10, "hot": 28, "rain": 0}[condition],
            "weatherCode": 50 if condition == "rain" else 0}


def batch(events):
    return FeatureBatch(tuple(row.event_id for row in events), tuple(row.participant_id for row in events),
                        tuple({"ignored_candidate_feature": 999.0} for _ in events), events)


def test_heuristic_matches_core_vectors_and_history_cutoff():
    from meal_prediction.heuristic import heuristic_score

    for vector in VECTORS:
        meal = {key: value for key, value in vector["meal"].items() if key != "_id"}
        current = event(meal=meal, weather=weather(vector["weather"]), avoided=vector["quiz"]["ingredientsToAvoid"])
        prior, targets = [], {}
        for index, feedback in enumerate(vector["recentFeedback"]):
            receipt = datetime.fromisoformat(feedback["timestamp"])
            history = replace(event(f"prior-{index}", item=feedback["mealId"], when=receipt-timedelta(seconds=1)), meal=dict(feedback.get("meal", {})))
            prior.append(history)
            targets[history.event_id] = Target(history.event_id, int(feedback["type"] == "like"), receipt)
        assert heuristic_score(current, tuple(prior), targets) == pytest.approx(vector["expectedScore"], abs=1e-14), vector["name"]

    current = event()
    prior = (
        event("old-exact", when=T0-timedelta(hours=4)),
        event("new-exact", when=T0-timedelta(hours=3)),
        event("old-similar", item="similar", when=T0-timedelta(hours=2), meal={"cuisine": "Italian"}),
        event("new-similar", item="similar", when=T0-timedelta(hours=1)),
        event("equal", item="equal", when=T0-timedelta(minutes=30)),
        event("future", item="future", when=T0-timedelta(minutes=20)),
        event("foreign", person="someone-else", when=T0-timedelta(hours=1)),
        event("unanswered", when=T0-timedelta(hours=1)), current,
    )
    targets = {row.event_id: Target(row.event_id, int(row.event_id.startswith("new")), row.displayed_at+timedelta(seconds=1))
               for row in prior if row.event_id != "unanswered"}
    targets.update(equal=Target("equal", 0, T0), future=Target("future", 0, T0+timedelta(seconds=1)))
    assert heuristic_score(current, prior[::-1], targets) == pytest.approx(1.6)
    changed = targets | {key: replace(targets[key], y=1-targets[key].y) for key in ("score", "equal", "future", "foreign")}
    assert heuristic_score(current, prior, changed) == pytest.approx(1.6)


def test_equal_history_receipts_have_stable_event_id_tiebreak():
    from meal_prediction.heuristic import heuristic_score

    prior = (event("a", when=T0-timedelta(hours=2)), event("z", when=T0-timedelta(hours=1)))
    receipt = T0-timedelta(minutes=1)
    targets = {"a": Target("a", 0, receipt), "z": Target("z", 1, receipt)}
    assert heuristic_score(event(), prior, targets) == pytest.approx(1.4)
    assert heuristic_score(event(), prior[::-1], targets) == pytest.approx(1.4)


@pytest.mark.parametrize("recorded", [None, {"status": "unavailable"},
    {"status": "ok", "retrievedAt": T0, "validAt": T0-timedelta(hours=1, seconds=1), "temperatureC": 0, "weatherCode": 61},
    {"status": "ok", "retrievedAt": T0+timedelta(seconds=1), "validAt": T0, "temperatureC": 0, "weatherCode": 61},
    {"status": "partial", "retrievedAt": T0, "validAt": T0, "temperatureC": None, "weatherCode": None}])
def test_missing_or_unusable_weather_retains_native_normal_fallback(recorded):
    from meal_prediction.heuristic import heuristic_score

    assert heuristic_score(event(meal={"weather": ["normal"]}, weather=recorded), (), {}) == pytest.approx(1.2)


def calibration_data():
    names = ("base", "spice-distance-three", "rain", "spice-distance-two", "hot", "base")
    vectors = {row["name"]: row for row in VECTORS}
    events = tuple(event(str(index), person=f"fit-{index}", when=T0-timedelta(days=1),
                         meal={key: value for key, value in vectors[name]["meal"].items() if key != "_id"},
                         weather=weather(vectors[name]["weather"], T0-timedelta(days=1))) for index, name in enumerate(names))
    labels = (0, 0, 1, 0, 1, 1)
    targets = {row.event_id: Target(row.event_id, label, row.displayed_at+timedelta(seconds=1)) for row, label in zip(events, labels)}
    return events, targets, np.array([vectors[name]["expectedScore"] for name in names]).reshape(-1, 1), labels


def test_calibration_uses_actual_fixed_l2_fit_and_frozen_history(tmp_path):
    from meal_prediction.controls import fit_heuristic_control
    from meal_prediction.models.base import FittedModel, load_fitted

    events, targets, matrix, labels = calibration_data()
    with warnings.catch_warnings():
        warnings.simplefilter("error")
        expected = LogisticRegression(C=1, l1_ratio=0.0, solver="lbfgs", max_iter=2000, tol=1e-6, random_state=42).fit(matrix, labels)
        fitted = fit_heuristic_control(events, targets)
    assert isinstance(fitted, FittedModel)
    scored = tuple(replace(row, event_id=f"score-{index}", participant_id="new", displayed_at=T0, meal=dict(row.meal),
                           context={**row.context, "weather": weather(("normal", "normal", "rain", "normal", "hot", "normal")[index])})
                   for index, row in enumerate(events))
    values = expected.predict_proba(matrix)[:, 1]
    before = pickle.dumps(fitted)
    np.testing.assert_allclose(fitted.predict_proba(batch(scored)), values, rtol=1e-12)
    known = event(person="fit-2", meal={"weather": ["rain"]}, weather=weather("rain"))
    np.testing.assert_allclose(fitted.predict_proba(batch((known,))), expected.predict_proba([[1.6]])[:, 1], rtol=1e-12)
    targets["2"] = replace(targets["2"], y=0)
    events[2].meal["spiciness"] = 5
    events[2].meal["cuisine"] = "changed-after-fit"
    np.testing.assert_array_equal(fitted.predict_proba(batch(scored[::-1])), values[::-1])
    assert fitted.predict_proba(batch(())).shape == (0,)
    assert pickle.dumps(fitted) == before
    path = tmp_path / "heuristic.pkl"
    fitted.save(path)
    restored = load_fitted(path)
    np.testing.assert_array_equal(restored.predict_proba(batch(scored)), fitted.predict_proba(batch(scored)))
    with pytest.raises(TypeError):
        fitted.predict_proba(batch(scored), targets=targets)
    with pytest.raises(ValueError, match="align"):
        fitted.predict_proba(replace(batch(scored), events=()))
    with pytest.raises(ValueError, match="align"):
        fitted.predict_proba(replace(batch(scored), events=scored[::-1]))


def test_calibration_rejects_foreign_duplicate_and_invalid_receipt_history():
    from meal_prediction.controls import fit_heuristic_control

    events, targets, _, _ = calibration_data()
    with pytest.raises(ValueError, match="target"):
        fit_heuristic_control(events, targets | {"foreign": Target("foreign", 1, T0)})
    with pytest.raises(ValueError, match="duplicate"):
        fit_heuristic_control(events + events[:1], targets)
    with pytest.raises(ValueError, match="target"):
        fit_heuristic_control(events, {"0": Target("wrong", 1, T0)})
    with pytest.raises(ValueError, match="receipt"):
        fit_heuristic_control(events, targets | {"0": Target("0", 1, None)})
    with pytest.raises(ValueError, match="receipt"):
        fit_heuristic_control(events, targets | {"0": Target("0", 1, events[0].displayed_at)})


@pytest.mark.parametrize("single_class", [None, 0, 1])
def test_calibration_reports_not_estimable_for_empty_or_single_class(single_class):
    from meal_prediction.controls import fit_heuristic_control
    from meal_prediction.models.base import NotEstimable

    events, targets, _, _ = calibration_data()
    targets = {} if single_class is None else {key: replace(row, y=single_class) for key, row in targets.items()}
    with pytest.raises(NotEstimable, match="empty_fit" if single_class is None else "single_class"):
        fit_heuristic_control(events, targets)


def test_calibration_fitting_scores_exclude_own_and_future_labels():
    from meal_prediction.controls import fit_heuristic_control

    events = tuple(event(str(i), when=T0+timedelta(hours=i)) for i in range(6))
    labels = (0, 1, 0, 1, 0, 1)
    targets = {row.event_id: Target(row.event_id, label, row.displayed_at+timedelta(seconds=1)) for row, label in zip(events, labels)}
    # Only the latest earlier response to this meal contributes the exact +/-0.4.
    expected = LogisticRegression(C=1, l1_ratio=0.0, solver="lbfgs", max_iter=2000, tol=1e-6, random_state=42).fit(
        np.array([1, .6, 1.4, .6, 1.4, .6]).reshape(-1, 1), labels)
    fitted = fit_heuristic_control(events, targets)
    scored = (event("known", when=T0+timedelta(days=8)), event("new", person="new", when=T0+timedelta(days=8)))
    np.testing.assert_allclose(fitted.predict_proba(batch(scored)), expected.predict_proba([[1.4], [1]])[:, 1], rtol=1e-12)


def test_calibration_solver_warning_is_a_failed_fit(monkeypatch):
    from sklearn.exceptions import ConvergenceWarning
    from meal_prediction.controls import fit_heuristic_control
    from meal_prediction.models.base import FitFailure

    def exhausted(self, *args):
        warnings.warn("test solver exhaustion", ConvergenceWarning)

    monkeypatch.setattr(LogisticRegression, "fit", exhausted)
    events, targets, _, _ = calibration_data()
    with pytest.raises(FitFailure, match="solver_warning"):
        fit_heuristic_control(events, targets)
