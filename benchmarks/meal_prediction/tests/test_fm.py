# ABOUTME: Verifies the actual River factorization machine on frozen shared feature rows.
# ABOUTME: Catches unseen latent allocation, order-sensitive scoring, and artifact drift.

from dataclasses import replace
from datetime import datetime, timedelta, timezone
from pathlib import Path
import pickle
from tempfile import TemporaryDirectory

import numpy as np
import pytest

from meal_prediction.records import Exposure, FeatureBatch, Target


PARAMS = {"n_factors": 4, "l2": 0.001}


def batch(rows):
    rows = tuple(rows)
    events = tuple(Exposure(f"e{index}", f"person-{index}", "item", None, {}, {}) for index in range(len(rows)))
    return FeatureBatch(tuple(event.event_id for event in events), tuple(event.participant_id for event in events), rows, events)


def fitted_state_bytes(model):
    with TemporaryDirectory() as directory:
        path = Path(directory) / "fm.pkl"
        model.save(path)
        return path.read_bytes()


def training_batch():
    return batch((
        {"participant_id": "alice", "meal_id": "rice", "context.hunger": "very_hungry", "content": 1.0, "zero_at_fit": 0.0},
        {"participant_id": "bob", "meal_id": "pasta", "context.hunger": "somewhat_hungry", "content": -1.0, "zero_at_fit": 0.0},
    ) * 8)


def unfamiliar_batch():
    return batch((
        {"participant_id": "unseen-alice", "meal_id": "unseen-rice", "context.hunger": "not_hungry", "content": 1.0, "zero_at_fit": 9.0, "new_numeric": 2.0},
        {"participant_id": "unseen-bob", "meal_id": "unseen-pasta", "context.hunger": "unseen-category", "content": -1.0, "zero_at_fit": -3.0},
        {"participant_id": "alice", "content": 0.0},
        {},
    ))


def test_fm_unknown_predictions_do_not_initialize_latents():
    from meal_prediction.models.fm import fit_fm

    training, scored = training_batch(), unfamiliar_batch()
    inputs_before = pickle.dumps((training, scored))
    fitted = fit_fm(training, np.array([1, 0] * 8), PARAMS, 42)
    before = fitted_state_bytes(fitted)
    probabilities = fitted.predict_proba(scored)
    assert fitted_state_bytes(fitted) == before
    assert probabilities.shape == (4,)
    assert np.isfinite(probabilities).all() and ((0 <= probabilities) & (probabilities <= 1)).all()
    np.testing.assert_array_equal(probabilities[:2], fitted.predict_proba(batch(({"content": 1.0}, {"content": -1.0}))))
    assert probabilities[0] > 0.6 and probabilities[1] < 0.4
    np.testing.assert_array_equal(fitted.predict_proba(batch(({"content": 0.0},))), probabilities[3:])
    np.testing.assert_array_equal(fitted.predict_proba(scored), probabilities)
    assert fitted_state_bytes(fitted) == before
    assert pickle.dumps((training, scored)) == inputs_before


def test_fm_prediction_order_and_reload_are_stable(tmp_path):
    from meal_prediction.models.base import FittedModel, load_fitted
    from meal_prediction.models.fm import fit_fm

    fitted = fit_fm(training_batch(), np.array([1, 0] * 8), PARAMS, 42)
    before = fitted_state_bytes(fitted)
    path = tmp_path / "fm.pkl"
    fitted.save(path)
    restored = load_fitted(path)
    assert isinstance(restored, FittedModel)
    assert fitted_state_bytes(restored) == before
    scored = unfamiliar_batch()
    reversed_rows = tuple(dict(reversed(tuple(row.items()))) for row in reversed(scored.rows))
    reversed_batch = replace(scored, ids=scored.ids[::-1], participant_ids=scored.participant_ids[::-1], rows=reversed_rows, events=scored.events[::-1])
    probabilities = fitted.predict_proba(scored)
    np.testing.assert_array_equal(restored.predict_proba(reversed_batch), probabilities[::-1])
    np.testing.assert_array_equal(restored.predict_proba(scored), probabilities)
    assert fitted_state_bytes(fitted) == fitted_state_bytes(restored) == before
    assert fitted.predict_proba(batch(())).shape == (0,)


def test_fm_learns_opposite_content_preferences_through_second_order_latents():
    from river import facto, optim
    from meal_prediction.models.fm import fit_fm

    rows = (
        {"person": "alice", "content": "rice"}, {"person": "alice", "content": "pasta"},
        {"person": "bob", "content": "rice"}, {"person": "bob", "content": "pasta"},
    )
    fitted = fit_fm(batch(rows * 32), np.array([1, 0, 0, 1] * 32), PARAMS, 42)
    probabilities = fitted.predict_proba(batch(rows))
    assert isinstance(fitted.estimator, facto.FMClassifier)
    assert isinstance(fitted.estimator.loss, optim.losses.Log)
    assert probabilities[0] > 0.9 and probabilities[3] > 0.9
    assert probabilities[1] < 0.1 and probabilities[2] < 0.1
    assert fitted.estimator.weight_optimizer.n_iterations == 3200
    assert fitted.estimator.latent_optimizer.n_iterations == 6400


@pytest.mark.parametrize("positive,negative", [
    ({"a_b": "c"}, {"a": "b_c"}),
    ({"kind": "yes"}, {'kind="yes"': 1.0}),
    ({"kind": 'a"=b'}, {'kind="a"': "b"}),
])
def test_native_category_encoding_does_not_collide_with_other_fields(positive, negative):
    from meal_prediction.models.fm import fit_fm

    fitted = fit_fm(batch((positive, negative) * 8), np.array([1, 0] * 8), PARAMS, 42)
    probabilities = fitted.predict_proba(batch((positive, negative)))
    assert probabilities[0] > 0.6 and probabilities[1] < 0.4


def test_repeatable_fit_canonicalizes_feature_order_and_uses_seed():
    from meal_prediction.models.fm import fit_fm

    training = training_batch()
    reordered = replace(training, rows=tuple(dict(reversed(tuple(row.items()))) for row in training.rows))
    fitted = fit_fm(training, np.array([1, 0] * 8), PARAMS, 42)
    repeated = fit_fm(reordered, np.array([1, 0] * 8), PARAMS, 42)
    different_seed = fit_fm(training, np.array([1, 0] * 8), PARAMS, 43)
    np.testing.assert_array_equal(repeated.predict_proba(training), fitted.predict_proba(training))
    assert fitted_state_bytes(repeated) == fitted_state_bytes(fitted)
    assert not np.array_equal(different_seed.predict_proba(training), fitted.predict_proba(training))


def test_fm_predictions_use_only_feature_rows():
    from meal_prediction.models.fm import fit_fm

    training = training_batch()
    fitted = fit_fm(training, np.array([1, 0] * 8), PARAMS, 42)
    expected = fitted.predict_proba(training)
    renamed = tuple(replace(event, event_id=f"other-{index}", participant_id="other-person", item_id="other-meal", meal={"answer": index % 2}, context={"outcome": index % 2}) for index, event in enumerate(training.events))
    changed = replace(training, ids=tuple(event.event_id for event in renamed), participant_ids=("other-person",) * len(renamed), events=renamed)
    np.testing.assert_array_equal(fitted.predict_proba(changed), expected)
    renamed_training = fit_fm(changed, np.array([1, 0] * 8), PARAMS, 42)
    assert fitted_state_bytes(renamed_training) == fitted_state_bytes(fitted)


@pytest.mark.parametrize("labels,reason", [([], "empty_fit"), ([0, 0], "single_class"), ([1, 1], "single_class")])
def test_no_two_class_fit_is_reported(labels, reason):
    from meal_prediction.models.base import NotEstimable
    from meal_prediction.models.fm import fit_fm

    with pytest.raises(NotEstimable) as error:
        fit_fm(batch(({"x": 1.0},) * len(labels)), np.array(labels, dtype=int), PARAMS, 42)
    assert error.value.family == "fm"
    assert error.value.reason == reason
    assert error.value.params == PARAMS


@pytest.mark.parametrize("rows", [({}, {}), ({"x": 0.0}, {"x": 0.0})])
def test_no_active_feature_fit_is_reported(rows):
    from meal_prediction.models.base import NotEstimable
    from meal_prediction.models.fm import fit_fm

    with pytest.raises(NotEstimable) as error:
        fit_fm(batch(rows), np.array([0, 1]), PARAMS, 42)
    assert error.value.family == "fm" and error.value.reason == "no_features"
    assert error.value.params == PARAMS


@pytest.mark.parametrize("labels", [[0], [0, 2], [0, float("nan")], [False, True], [[0], [1]]])
def test_invalid_binary_targets_are_rejected(labels):
    from meal_prediction.models.fm import fit_fm

    with pytest.raises(ValueError, match="y"):
        fit_fm(batch(({"x": -1.0}, {"x": 1.0})), np.array(labels), PARAMS, 42)


@pytest.mark.parametrize("params", [
    {}, {"n_factors": 4}, {"n_factors": True, "l2": 0.001}, {"n_factors": 4.5, "l2": 0.001},
    {"n_factors": 0, "l2": 0.001}, {"n_factors": 32, "l2": 0.001},
    {"n_factors": 4, "l2": 0.0}, {"n_factors": 4, "l2": -1},
    {"n_factors": 4, "l2": float("nan")}, {"n_factors": 4, "l2": float("inf")},
    {"n_factors": 4, "l2": True}, {"n_factors": 4, "l2": "0.001"},
    PARAMS | {"learning_rate": 0.1},
])
def test_invalid_or_unplanned_parameters_are_rejected(params):
    from meal_prediction.models.fm import fit_fm

    with pytest.raises(ValueError, match="params"):
        fit_fm(batch(({"x": -1.0}, {"x": 1.0})), np.array([0, 1]), params, 42)


def test_grid_fits_all_nine_approved_regularized_settings():
    from meal_prediction.models.fm import FM_GRID, fit_fm

    assert len(FM_GRID) == 9
    assert {(params["n_factors"], params["l2"]) for params in FM_GRID} == {
        (4, 1e-5), (4, 0.001), (4, 0.1), (8, 1e-5), (8, 0.001), (8, 0.1), (16, 1e-5), (16, 0.001), (16, 0.1),
    }
    training = batch(({"x": -1.0, "content": 1.0}, {"x": 1.0, "content": 1.0}) * 8)
    positives = []
    for params in FM_GRID:
        fitted = fit_fm(training, np.array([0, 1] * 8), params, 42)
        probabilities = fitted.predict_proba(training)
        assert probabilities[0] < 0.3 and probabilities[1] > 0.7
        estimator = fitted.estimator
        assert estimator.n_factors == params["n_factors"]
        assert estimator.l2_weight == estimator.l2_latent == params["l2"]
        assert estimator.weight_optimizer.learning_rate == estimator.latent_optimizer.learning_rate == 0.01
        assert estimator.weight_optimizer.n_iterations == 400
        assert estimator.seed == 42
        positives.append(probabilities[1])
    assert positives[0] > positives[1] > positives[2]


@pytest.mark.parametrize("value", [float("nan"), float("inf"), -float("inf")])
def test_nonfinite_fit_is_a_structured_failure(value):
    from meal_prediction.models.base import FitFailure
    from meal_prediction.models.fm import fit_fm

    with pytest.raises(FitFailure) as error:
        fit_fm(batch(({"x": value}, {"x": 1.0})), np.array([0, 1]), PARAMS, 42)
    assert error.value.family == "fm"
    assert error.value.reason in ("solver_error", "solver_warning")
    assert error.value.params == PARAMS


def test_actual_floating_point_warning_is_a_failed_setting():
    from meal_prediction.models.base import FitFailure
    from meal_prediction.models.fm import fit_fm

    with pytest.raises(FitFailure) as error:
        fit_fm(batch(({"x": 1e200, "content": 1e200}, {"x": -1e200, "content": -1e200})), np.array([0, 1]), PARAMS, 42)
    assert error.value.family == "fm" and error.value.reason == "solver_warning"
    assert isinstance(error.value.__cause__, RuntimeWarning)
    assert error.value.detail


def test_nonfinite_predicted_probability_is_rejected():
    from meal_prediction.models.fm import fit_fm

    fitted = fit_fm(training_batch(), np.array([1, 0] * 8), PARAMS, 42)
    with pytest.raises(ValueError, match="probabilities"):
        fitted.predict_proba(batch(({"content": float("nan")},)))


def test_misaligned_batches_are_rejected():
    from meal_prediction.models.fm import fit_fm

    training = batch(({"x": -1.0}, {"x": 1.0}))
    broken = replace(training, ids=("only-one",))
    with pytest.raises(ValueError, match="align"):
        fit_fm(broken, np.array([0, 1]), PARAMS, 42)
    fitted = fit_fm(training, np.array([0, 1]), PARAMS, 42)
    with pytest.raises(ValueError, match="align"):
        fitted.predict_proba(broken)


def test_shared_pilot_features_keep_truthful_scoring_values_neutral_when_inactive():
    from meal_prediction.features import fit_features, transform_features
    from meal_prediction.models.fm import fit_fm

    displayed_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
    events = tuple(Exposure(f"e{index}", "alice" if index % 2 else "bob", "rice" if index % 2 else "pasta", displayed_at, {
        "cuisine": "Korean" if index % 2 else "Italian", "primaryIngredients": ["rice" if index % 2 else "wheat"],
        "spiciness": index % 2, "heaviness": 2.0,
    }, {
        "city": {"timezone": "Asia/Seoul"}, "hunger": "very_hungry" if index % 2 else "somewhat_hungry",
        "weather": {"status": "ok", "validAt": displayed_at, "retrievedAt": displayed_at,
                    "temperatureC": 10.0, "precipitationMm": 0.0, "weatherCode": 61 if index % 2 else 0},
    }) for index in range(4))
    targets = {event.event_id: Target(event.event_id, index % 2, displayed_at + timedelta(minutes=1)) for index, event in enumerate(events)}
    state, training = fit_features(events, targets, preset="F3", source="pilot")
    inputs_before = pickle.dumps((state, training, events, targets))
    fitted = fit_fm(training, np.array([0, 1, 0, 1]), PARAMS, 44)
    known = replace(events[1], event_id="known", displayed_at=displayed_at + timedelta(hours=1), meal=events[1].meal | {"heaviness": 4.0})
    known = replace(known, context=known.context | {"hunger": None, "weather": known.context["weather"] | {
        "validAt": known.displayed_at, "retrievedAt": known.displayed_at, "temperatureC": 20.0, "precipitationMm": 2.0,
    }})
    unknown = replace(known, event_id="unknown", participant_id="new-person", item_id="new-meal",
                      meal=known.meal | {"cuisine": "unseen-cuisine", "primaryIngredients": ["unseen-ingredient"]},
                      context=known.context | {"hunger": "not_hungry", "weather": known.context["weather"] | {"weatherCode": 95}})
    scored = transform_features(state, (known, unknown))
    inactive = {"profile.user.count", "profile.item.count", "meal.heaviness", "context.temperature", "context.precipitation", "context.hunger.missing"}
    assert all(training.rows[0][name] == 0.0 for name in inactive)
    assert not inactive & set(state.active_keys)
    assert all(scored.rows[0][name] > 0.0 for name in inactive)
    assert training.rows[1]["context.wmo"] == "61"
    assert not {"participant_id", "meal_id", "meal.cuisine", "context.hunger", "context.wmo"} & scored.rows[1].keys()
    original_scored = pickle.dumps(scored)
    before = fitted_state_bytes(fitted)
    probabilities = fitted.predict_proba(scored)
    projected = replace(scored, rows=tuple({key: value for key, value in row.items() if key not in inactive} for row in scored.rows))
    np.testing.assert_array_equal(fitted.predict_proba(projected), probabilities)
    assert probabilities.shape == (2,) and np.isfinite(probabilities).all()
    assert fitted_state_bytes(fitted) == before
    assert pickle.dumps(scored) == original_scored
    assert pickle.dumps((state, training, events, targets)) == inputs_before


@pytest.mark.parametrize("preset", ["F0", "F1"])
def test_real_uci_fm_consumes_shared_frozen_batches(preset, tmp_path):
    from meal_prediction.datasets import fetch_uci, load_uci
    from meal_prediction.features import fit_features, transform_features
    from meal_prediction.models.base import load_fitted
    from meal_prediction.models.fm import fit_fm
    from meal_prediction.records import events_for, labels_for
    from meal_prediction.splits import split_uci

    dataset = load_uci(fetch_uci(Path(__file__).resolve().parents[1] / "data/uci-restaurant-consumer.zip"))
    split = split_uci(dataset, seed=42)
    events = events_for(dataset, split.train_ids)
    state, training = fit_features(events, {identity: dataset.targets[identity] for identity in split.train_ids}, preset=preset, source="uci")
    original = pickle.dumps((state, training))
    seed = 42 if preset == "F0" else 43
    fitted = fit_fm(training, labels_for(dataset, split.train_ids), PARAMS, seed)
    assert fitted.estimator.seed == seed
    before = fitted_state_bytes(fitted)
    scored = transform_features(state, events_for(dataset, split.development_ids + split.test_ids))
    assert scored.ids == split.development_ids + split.test_ids
    probabilities = fitted.predict_proba(scored)
    assert probabilities.shape == (349,)
    assert np.isfinite(probabilities).all() and ((0 <= probabilities) & (probabilities <= 1)).all()
    reversed_batch = replace(scored, ids=scored.ids[::-1], participant_ids=scored.participant_ids[::-1], rows=scored.rows[::-1], events=scored.events[::-1])
    np.testing.assert_array_equal(fitted.predict_proba(reversed_batch), probabilities[::-1])
    path = tmp_path / f"{preset}-fm.pkl"
    fitted.save(path)
    restored = load_fitted(path)
    np.testing.assert_array_equal(restored.predict_proba(scored), probabilities)
    assert fitted_state_bytes(fitted) == fitted_state_bytes(restored) == before
    assert pickle.dumps((state, training)) == original
