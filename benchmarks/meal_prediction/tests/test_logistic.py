# ABOUTME: Verifies personalized sparse logistic fits using the installed estimator.
# ABOUTME: Catches interaction loss, unsupported fits, scoring mutation, and artifact drift.

from dataclasses import replace
import json
import pickle

import numpy as np
import pytest
from scipy.sparse import issparse
from sklearn.exceptions import ConvergenceWarning

from meal_prediction.records import Exposure, FeatureBatch


def batch(rows):
    rows = tuple(rows)
    events = tuple(Exposure(f"e{index}", f"person-{index}", "item", None, {}, {}) for index in range(len(rows)))
    return FeatureBatch(tuple(event.event_id for event in events), tuple(event.participant_id for event in events), rows, events)


def content_row(person, cuisine):
    interaction = json.dumps((f'participant_id={json.dumps(person)}', f'meal.cuisine={json.dumps(cuisine)}'), separators=(",", ":"))
    return {"participant_id": person, "meal.cuisine": cuisine, "x:" + interaction: 1.0}


def test_content_interactions_personalize_ranking():
    from meal_prediction.models.logistic import fit_logistic

    rows = tuple(content_row(person, cuisine) for person in ("alice", "bob") for cuisine in ("Korean", "Mexican"))
    fitted = fit_logistic(batch(rows * 8), np.array([1, 0, 0, 1] * 8), {"C": 1.0}, 42)
    probabilities = fitted.predict_proba(batch(rows))
    assert probabilities[0] > probabilities[1]
    assert probabilities[2] < probabilities[3]
    assert probabilities[0] > 0.75 and probabilities[3] > 0.75
    without_interactions = tuple({key: value for key, value in row.items() if not key.startswith("x:")} for row in rows)
    intercept_only = fit_logistic(batch(without_interactions * 8), np.array([1, 0, 0, 1] * 8), {"C": 1.0}, 42)
    np.testing.assert_allclose(intercept_only.predict_proba(batch(without_interactions)), 0.5, atol=1e-8)


def test_uninformative_two_class_fit_uses_unit_weights():
    from meal_prediction.models.logistic import fit_logistic

    fitted = fit_logistic(batch(({"fixed": 0.0},) * 4), np.array([1, 0, 0, 0]), {"C": 1.0}, 42)
    np.testing.assert_allclose(fitted.predict_proba(batch(({"fixed": 0.0},))), [0.25], atol=1e-5)


def test_sparse_encoding_is_frozen_and_predictions_stay_aligned():
    from meal_prediction.models.logistic import fit_logistic

    training = batch(({"kind": "yes", "fixed": 0.0}, {"kind": "no", "fixed": 0.0}) * 4)
    fitted = fit_logistic(training, np.array([1, 0] * 4), {"C": 1.0}, 42)
    original = pickle.dumps(fitted)
    expected = fitted.predict_proba(training)
    assert issparse(fitted.vectorizer.transform(training.rows))
    assert expected.shape == (8,) and np.isfinite(expected).all()
    assert ((0 <= expected) & (expected <= 1)).all()
    reversed_rows = tuple(dict(reversed(tuple(row.items()))) for row in reversed(training.rows))
    np.testing.assert_array_equal(fitted.predict_proba(batch(reversed_rows)), expected[::-1])
    zeros = batch(({"kind": "yes", "fixed": 9000.0}, {"kind": "yes", "fixed": 0.0}))
    np.testing.assert_array_equal(fitted.predict_proba(zeros), [expected[0], expected[0]])
    unknown = batch(({"kind": "unseen", "new_column": 100.0}, {}))
    unknown_probabilities = fitted.predict_proba(unknown)
    np.testing.assert_array_equal(unknown_probabilities, [unknown_probabilities[0]] * 2)
    assert fitted.predict_proba(batch(())).shape == (0,)
    assert pickle.dumps(fitted) == original


def test_candidate_uses_rows_without_metadata_predictors():
    from meal_prediction.models.logistic import fit_logistic

    training = batch(({"content": 1.0}, {"content": -1.0}) * 4)
    fitted = fit_logistic(training, np.array([1, 0] * 4), {"C": 1.0}, 42)
    renamed = tuple(replace(event, event_id=f"other-{index}", participant_id="other-person", item_id="other-item", meal={"answer": index % 2}) for index, event in enumerate(training.events))
    changed = replace(training, ids=tuple(event.event_id for event in renamed), participant_ids=("other-person",) * len(renamed), events=renamed)
    np.testing.assert_array_equal(fitted.predict_proba(changed), fitted.predict_proba(training))


def test_logistic_save_load_preserves_predictions(tmp_path):
    from meal_prediction.models.base import FittedModel, load_fitted
    from meal_prediction.models.logistic import fit_logistic

    training = batch(({"content": 1.0}, {"content": -1.0}) * 4)
    fitted = fit_logistic(training, np.array([1, 0] * 4), {"C": 1.0}, 42)
    path = tmp_path / "logistic.pkl"
    fitted.save(path)
    restored = load_fitted(path)
    assert isinstance(restored, FittedModel)
    np.testing.assert_array_equal(restored.predict_proba(training), fitted.predict_proba(training))


@pytest.mark.parametrize("labels,reason", [([], "empty_fit"), ([0, 0], "single_class"), ([1, 1], "single_class")])
def test_no_two_class_fit_is_reported(labels, reason):
    from meal_prediction.models.base import NotEstimable
    from meal_prediction.models.logistic import fit_logistic

    with pytest.raises(NotEstimable) as error:
        fit_logistic(batch(({"content": 1.0},) * len(labels)), np.array(labels, dtype=int), {"C": 1.0}, 42)
    assert error.value.family == "logistic"
    assert error.value.reason == reason
    assert error.value.params == {"C": 1.0}


def test_no_feature_fit_is_reported():
    from meal_prediction.models.base import NotEstimable
    from meal_prediction.models.logistic import fit_logistic

    with pytest.raises(NotEstimable) as error:
        fit_logistic(batch(({}, {})), np.array([0, 1]), {"C": 1.0}, 42)
    assert error.value.reason == "no_features"


@pytest.mark.parametrize("labels", [[0], [0, 2], [0, float("nan")], [False, True], [[0], [1]]])
def test_invalid_binary_targets_are_rejected(labels):
    from meal_prediction.models.logistic import fit_logistic

    with pytest.raises(ValueError, match="y"):
        fit_logistic(batch(({"x": -1.0}, {"x": 1.0})), np.array(labels), {"C": 1.0}, 42)


@pytest.mark.parametrize("params", [{}, {"C": 0}, {"C": -1}, {"C": float("nan")}, {"C": float("inf")}, {"C": True}, {"C": "1"}, {"C": 1.0, "class_weight": "balanced"}])
def test_invalid_or_unplanned_parameters_are_rejected(params):
    from meal_prediction.models.logistic import fit_logistic

    with pytest.raises(ValueError, match="params"):
        fit_logistic(batch(({"x": -1.0}, {"x": 1.0})), np.array([0, 1]), params, 42)


def test_logistic_grid_changes_regularization_strength():
    from meal_prediction.models.logistic import LOGISTIC_GRID, fit_logistic

    training = batch(({"x": -1.0}, {"x": 1.0}) * 4)
    probabilities = [fit_logistic(training, np.array([0, 1] * 4), params, 42).predict_proba(batch(({"x": 1.0},)))[0] for params in LOGISTIC_GRID]
    assert len(probabilities) == 9
    assert all(first < second for first, second in zip(probabilities, probabilities[1:]))
    assert probabilities[0] < 0.52 and probabilities[-1] > 0.99


def test_actual_solver_warning_is_a_structured_failed_fit():
    from meal_prediction.models.base import FitFailure
    from meal_prediction.models.logistic import fit_logistic

    with pytest.raises(FitFailure) as error:
        fit_logistic(batch(({"x": 1e100}, {"x": -1e100})), np.array([1, 0]), {"C": 1.0}, 42)
    assert error.value.family == "logistic"
    assert error.value.reason == "solver_warning"
    assert error.value.params == {"C": 1.0}
    assert isinstance(error.value.__cause__, ConvergenceWarning)
    assert "lbfgs" in error.value.detail


def test_fitted_loader_rejects_other_owned_objects(tmp_path):
    from meal_prediction.models.base import load_fitted

    path = tmp_path / "other.pkl"
    path.write_bytes(pickle.dumps({"not": "a fitted model"}))
    with pytest.raises(ValueError, match="fitted model"):
        load_fitted(path)


def test_misaligned_batches_are_rejected():
    from meal_prediction.models.logistic import fit_logistic

    training = batch(({"x": -1.0}, {"x": 1.0}))
    broken = replace(training, ids=("only-one",))
    with pytest.raises(ValueError, match="align"):
        fit_logistic(broken, np.array([0, 1]), {"C": 1.0}, 42)
    fitted = fit_logistic(training, np.array([0, 1]), {"C": 1.0}, 42)
    with pytest.raises(ValueError, match="align"):
        fitted.predict_proba(broken)


def test_actual_estimator_error_is_a_structured_failed_fit():
    from meal_prediction.models.base import FitFailure
    from meal_prediction.models.logistic import fit_logistic

    with pytest.raises(FitFailure) as error:
        fit_logistic(batch(({"x": float("nan")}, {"x": 1.0})), np.array([0, 1]), {"C": 1.0}, 42)
    assert error.value.family == "logistic"
    assert error.value.reason == "solver_error"
    assert error.value.params == {"C": 1.0}
    assert isinstance(error.value.__cause__, ValueError)
    assert "NaN" in error.value.detail


@pytest.mark.parametrize("preset", ["F0", "F1"])
def test_real_uci_models_consume_shared_frozen_batches(preset, tmp_path):
    from pathlib import Path
    from meal_prediction.controls import fit_rate_control
    from meal_prediction.datasets import load_uci
    from meal_prediction.features import fit_features, transform_features
    from meal_prediction.models.base import load_fitted
    from meal_prediction.models.logistic import fit_logistic
    from meal_prediction.records import events_for, labels_for
    from meal_prediction.splits import split_uci

    dataset = load_uci(Path(__file__).resolve().parents[1] / "data/uci-restaurant-consumer.zip")
    split = split_uci(dataset, seed=42)
    events = events_for(dataset, split.train_ids)
    targets = {identity: dataset.targets[identity] for identity in split.train_ids}
    state, training = fit_features(events, targets, preset=preset, source="uci")
    original = pickle.dumps((state, training))
    candidates = (
        fit_logistic(training, labels_for(dataset, split.train_ids), {"C": 1.0}, 42),
        fit_rate_control("global", events, targets),
        fit_rate_control("personal", events, targets),
    )
    scored = transform_features(state, events_for(dataset, split.development_ids + split.test_ids))
    assert scored.ids == split.development_ids + split.test_ids
    for index, candidate in enumerate(candidates):
        probabilities = candidate.predict_proba(scored)
        assert probabilities.shape == (349,)
        assert np.isfinite(probabilities).all() and ((0 <= probabilities) & (probabilities <= 1)).all()
        path = tmp_path / f"{preset}-{index}.pkl"
        candidate.save(path)
        np.testing.assert_array_equal(load_fitted(path).predict_proba(scored), probabilities)
    assert pickle.dumps((state, training)) == original
