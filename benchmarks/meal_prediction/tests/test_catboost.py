# ABOUTME: Verifies the actual CPU CatBoost candidate on shared meal feature rows.
# ABOUTME: Catches categorical loss, mutable scoring, unsupported fits, and artifact drift.

from dataclasses import replace
from datetime import datetime, timedelta, timezone
import hashlib
from pathlib import Path
import pickle

from catboost import CatBoostError
import numpy as np
import pytest

from meal_prediction.records import Exposure, FeatureBatch, Target


PARAMS = {"depth": 2, "l2_leaf_reg": 3.0}


def batch(rows):
    rows = tuple(rows)
    events = tuple(Exposure(f"e{index}", f"person-{index}", "item", None, {}, {}) for index in range(len(rows)))
    return FeatureBatch(tuple(event.event_id for event in events), tuple(event.participant_id for event in events), rows, events)


def test_catboost_real_fit_handles_missing_and_unseen_categories():
    from meal_prediction.features import fit_features, transform_features
    from meal_prediction.models.catboost import fit_catboost

    events = []
    for index in range(24):
        positive = index % 2
        displayed_at = datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(minutes=index * 10)
        events.append(Exposure(f"e{index}", "alice" if positive else "bob", "rice" if positive else "pasta", displayed_at, {
            "cuisine": "Korean" if positive else "Italian", "primaryIngredients": ["rice" if positive else "wheat"],
            "spiciness": positive, "heaviness": 2,
        }, {
            "city": {"timezone": "Asia/Seoul"},
            "hunger": None if index % 3 == 0 else ("very_hungry" if positive else "somewhat_hungry"),
            "weather": {"status": "partial", "validAt": displayed_at, "retrievedAt": displayed_at,
                        "temperatureC": None, "precipitationMm": 0.0,
                        "weatherCode": None if index % 3 == 0 else (61 if positive else 0)},
        }))
    events = tuple(events)
    targets = {event.event_id: Target(event.event_id, index % 2, event.displayed_at + timedelta(minutes=1)) for index, event in enumerate(events)}
    state, training = fit_features(events, targets, preset="F3", source="pilot")
    original_training = pickle.dumps((state, training, events, targets))
    fitted = fit_catboost(training, np.array([index % 2 for index in range(24)]), PARAMS, 42)
    known = replace(events[1], event_id="known", displayed_at=events[-1].displayed_at + timedelta(hours=1))
    known = replace(known, context=known.context | {"weather": known.context["weather"] | {"validAt": known.displayed_at, "retrievedAt": known.displayed_at}})
    unknown = replace(known, event_id="unknown", participant_id="new-person", item_id="new-meal",
                      meal=known.meal | {"cuisine": "unseen-cuisine", "primaryIngredients": ["new-ingredient"]},
                      context=known.context | {"hunger": "not_hungry", "weather": known.context["weather"] | {"weatherCode": 95}})
    missing = replace(known, event_id="missing", context=known.context | {"hunger": None, "weather": None})
    scored = transform_features(state, (known, unknown, missing))
    original_scored = pickle.dumps(scored)
    before = hashlib.sha256(pickle.dumps(fitted)).hexdigest()
    probabilities = fitted.predict_proba(scored)
    categorical = {fitted.estimator.feature_names_[index] for index in fitted.estimator.get_cat_feature_indices()}
    assert {"participant_id", "meal_id", "meal.cuisine", "context.hunger", "context.wmo"} <= categorical
    assert training.rows[1]["context.wmo"] == "61"
    assert training.rows[1]["context.hunger"] == "very_hungry"
    assert not {"participant_id", "meal_id", "meal.cuisine", "context.hunger", "context.wmo"} & scored.rows[1].keys()
    assert scored.rows[2]["context.hunger"] == "__MISSING__"
    assert scored.rows[2]["context.temperature.missing"] == 1.0
    assert scored.ids == ("known", "unknown", "missing")
    assert probabilities.shape == (3,)
    assert np.isfinite(probabilities).all() and ((0 <= probabilities) & (probabilities <= 1)).all()
    assert probabilities[0] > 0.8
    reversed_batch = replace(scored, ids=scored.ids[::-1], participant_ids=scored.participant_ids[::-1], rows=scored.rows[::-1], events=scored.events[::-1])
    np.testing.assert_array_equal(fitted.predict_proba(reversed_batch), probabilities[::-1])
    assert hashlib.sha256(pickle.dumps(fitted)).hexdigest() == before
    assert pickle.dumps((state, training, events, targets)) == original_training
    assert pickle.dumps(scored) == original_scored


def test_predictions_use_only_rows_with_frozen_columns_and_defaults():
    from meal_prediction.models.catboost import fit_catboost

    training = batch(({"kind": "yes", "fixed": 0.0}, {"kind": "no", "fixed": 0.0}) * 8)
    fitted = fit_catboost(training, np.array([1, 0] * 8), PARAMS, 44)
    assert fitted.estimator.get_all_params()["random_seed"] == 44
    before = pickle.dumps(fitted)
    expected = fitted.predict_proba(training)
    assert expected[0] > 0.8 and expected[1] < 0.2
    renamed = tuple(replace(event, event_id=f"other-{index}", participant_id="other-person", item_id="other-meal", meal={"answer": index % 2}) for index, event in enumerate(training.events))
    changed = replace(training, ids=tuple(event.event_id for event in renamed), participant_ids=("other-person",) * len(renamed), events=renamed)
    np.testing.assert_array_equal(fitted.predict_proba(changed), expected)
    changed_rows = tuple(dict(reversed(tuple((row | {"fixed": 9000.0, "new-column": 123.0}).items()))) for row in reversed(training.rows))
    np.testing.assert_array_equal(fitted.predict_proba(batch(changed_rows)), expected[::-1])
    defaults = batch(({}, {"kind": "", "x": 0.0, "fixed": 0.0}, {"kind": "unseen", "x": 0.0}))
    probabilities = fitted.predict_proba(defaults)
    assert probabilities.shape == (3,) and np.isfinite(probabilities).all()
    assert probabilities[0] == probabilities[1]
    assert fitted.predict_proba(batch(())).shape == (0,)
    assert pickle.dumps(fitted) == before


def test_catboost_save_load_preserves_predictions_without_unsolicited_files(tmp_path, monkeypatch):
    from meal_prediction.models.base import FittedModel, load_fitted
    from meal_prediction.models.catboost import fit_catboost

    monkeypatch.chdir(tmp_path)
    training = batch(({"kind": "yes", "x": 1.0}, {"kind": "no", "x": -1.0}) * 4)
    fitted = fit_catboost(training, np.array([1, 0] * 4), PARAMS, 42)
    assert list(tmp_path.iterdir()) == []
    expected = fitted.predict_proba(training)
    path = tmp_path / "catboost.pkl"
    fitted.save(path)
    restored = load_fitted(path)
    assert isinstance(restored, FittedModel)
    np.testing.assert_array_equal(restored.predict_proba(training), expected)
    assert list(tmp_path.iterdir()) == [path]


@pytest.mark.parametrize("labels,reason", [([], "empty_fit"), ([0, 0], "single_class"), ([1, 1], "single_class")])
def test_no_two_class_fit_is_reported(labels, reason):
    from meal_prediction.models.base import NotEstimable
    from meal_prediction.models.catboost import fit_catboost

    with pytest.raises(NotEstimable) as error:
        fit_catboost(batch(({"x": 1.0},) * len(labels)), np.array(labels, dtype=int), PARAMS, 42)
    assert error.value.family == "catboost"
    assert error.value.reason == reason
    assert error.value.params == PARAMS


def test_no_feature_fit_is_reported():
    from meal_prediction.models.base import NotEstimable
    from meal_prediction.models.catboost import fit_catboost

    with pytest.raises(NotEstimable) as error:
        fit_catboost(batch(({}, {})), np.array([0, 1]), PARAMS, 42)
    assert error.value.reason == "no_features"


def test_constant_features_report_actual_library_failure():
    from meal_prediction.models.base import FitFailure
    from meal_prediction.models.catboost import fit_catboost

    with pytest.raises(FitFailure) as error:
        fit_catboost(batch(({"x": 0.0},) * 4), np.array([1, 0, 0, 0]), PARAMS, 42)
    assert error.value.family == "catboost"
    assert error.value.reason == "solver_error"
    assert error.value.params == PARAMS
    assert isinstance(error.value.__cause__, CatBoostError)
    assert "constant" in error.value.detail.lower()


def test_invalid_categorical_value_reports_actual_library_failure():
    from meal_prediction.models.base import FitFailure
    from meal_prediction.models.catboost import fit_catboost

    with pytest.raises(FitFailure) as error:
        fit_catboost(batch(({"kind": "known"}, {"kind": 0.5})), np.array([0, 1]), PARAMS, 42)
    assert error.value.family == "catboost"
    assert error.value.reason == "solver_error"
    assert isinstance(error.value.__cause__, CatBoostError)
    assert "cat_feature" in error.value.detail


@pytest.mark.parametrize("labels", [[0], [0, 2], [0, float("nan")], [False, True], [[0], [1]]])
def test_invalid_binary_targets_are_rejected(labels):
    from meal_prediction.models.catboost import fit_catboost

    with pytest.raises(ValueError, match="y"):
        fit_catboost(batch(({"x": -1.0}, {"x": 1.0})), np.array(labels), PARAMS, 42)


@pytest.mark.parametrize("params", [
    {}, {"depth": 2}, {"depth": True, "l2_leaf_reg": 3}, {"depth": 2.5, "l2_leaf_reg": 3},
    {"depth": 0, "l2_leaf_reg": 3}, {"depth": 17, "l2_leaf_reg": 3},
    {"depth": 2, "l2_leaf_reg": -1}, {"depth": 2, "l2_leaf_reg": float("nan")},
    {"depth": 2, "l2_leaf_reg": float("inf")}, {"depth": 2, "l2_leaf_reg": True},
    {"depth": 2, "l2_leaf_reg": "3"}, PARAMS | {"task_type": "GPU"},
])
def test_invalid_or_unplanned_parameters_are_rejected(params):
    from meal_prediction.models.catboost import fit_catboost

    with pytest.raises(ValueError, match="params"):
        fit_catboost(batch(({"x": -1.0}, {"x": 1.0})), np.array([0, 1]), params, 42)


def test_grid_fits_all_nine_approved_cpu_settings():
    from meal_prediction.models.catboost import CATBOOST_GRID, fit_catboost

    assert len(CATBOOST_GRID) == 9
    assert {(params["depth"], params["l2_leaf_reg"]) for params in CATBOOST_GRID} == {
        (2, 1), (2, 3), (2, 10), (4, 1), (4, 3), (4, 10), (6, 1), (6, 3), (6, 10),
    }
    training = batch(({"x": -1.0}, {"x": 1.0}) * 8)
    positives = []
    for params in CATBOOST_GRID:
        fitted = fit_catboost(training, np.array([0, 1] * 8), params, 42)
        probabilities = fitted.predict_proba(batch(({"x": -1.0}, {"x": 1.0})))
        assert probabilities[0] < 0.2 and probabilities[1] > 0.8
        actual = fitted.estimator.get_all_params()
        assert actual["depth"] == params["depth"]
        assert actual["l2_leaf_reg"] == params["l2_leaf_reg"]
        assert actual["iterations"] == fitted.estimator.tree_count_ == 300
        assert actual["learning_rate"] == pytest.approx(0.05)
        assert actual["loss_function"] == "Logloss" and actual["task_type"] == "CPU"
        assert actual["random_seed"] == 42
        assert fitted.estimator.get_params()["thread_count"] == 1
        positives.append(probabilities[1])
    assert positives[0] > positives[1] > positives[2]


def test_misaligned_batches_are_rejected():
    from meal_prediction.models.catboost import fit_catboost

    training = batch(({"x": -1.0}, {"x": 1.0}))
    broken = replace(training, ids=("only-one",))
    with pytest.raises(ValueError, match="align"):
        fit_catboost(broken, np.array([0, 1]), PARAMS, 42)
    fitted = fit_catboost(training, np.array([0, 1]), PARAMS, 42)
    with pytest.raises(ValueError, match="align"):
        fitted.predict_proba(broken)


@pytest.mark.parametrize("preset", ["F0", "F1"])
def test_real_uci_catboost_consumes_shared_frozen_batches(preset, tmp_path):
    from meal_prediction.datasets import load_uci
    from meal_prediction.features import fit_features, transform_features
    from meal_prediction.models.base import load_fitted
    from meal_prediction.models.catboost import fit_catboost
    from meal_prediction.records import events_for, labels_for
    from meal_prediction.splits import split_uci

    dataset = load_uci(Path(__file__).resolve().parents[1] / "data/uci-restaurant-consumer.zip")
    split = split_uci(dataset, seed=42)
    events = events_for(dataset, split.train_ids)
    state, training = fit_features(events, {identity: dataset.targets[identity] for identity in split.train_ids}, preset=preset, source="uci")
    original = pickle.dumps((state, training))
    seed = 42 if preset == "F0" else 43
    fitted = fit_catboost(training, labels_for(dataset, split.train_ids), PARAMS, seed)
    assert fitted.estimator.get_all_params()["random_seed"] == seed
    scored = transform_features(state, events_for(dataset, split.development_ids + split.test_ids))
    assert scored.ids == split.development_ids + split.test_ids
    probabilities = fitted.predict_proba(scored)
    assert probabilities.shape == (349,)
    assert np.isfinite(probabilities).all() and ((0 <= probabilities) & (probabilities <= 1)).all()
    path = tmp_path / f"{preset}-catboost.pkl"
    fitted.save(path)
    np.testing.assert_array_equal(load_fitted(path).predict_proba(scored), probabilities)
    assert pickle.dumps((state, training)) == original
