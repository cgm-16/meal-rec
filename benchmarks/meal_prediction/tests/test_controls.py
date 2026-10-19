# ABOUTME: Verifies fitting-partition-only global and personal rate references.
# ABOUTME: Catches answer dilution, incorrect shrinkage, alignment errors, and mutable state.

from dataclasses import replace
import pickle

import numpy as np
import pytest

from meal_prediction.records import Exposure, FeatureBatch, Target


def event(identity, person):
    return Exposure(identity, person, "item", None, {}, {})


def batch(people):
    events = tuple(event(f"score-{index}", person) for index, person in enumerate(people))
    return FeatureBatch(tuple(exposure.event_id for exposure in events), tuple(people), ({},) * len(events), events)


@pytest.fixture
def fitting():
    events = (event("a-yes", "a"), event("a-no", "a"), event("b-yes", "b"), event("unanswered", "a"))
    targets = {identity: Target(identity, y, None) for identity, y in (("a-yes", 1), ("a-no", 0), ("b-yes", 1))}
    return events, targets


def test_personal_rate_shrinks_to_global(fitting):
    from meal_prediction.controls import fit_rate_control

    fitted = fit_rate_control("personal", *fitting)
    probabilities = fitted.predict_proba(batch(("b", "new-person", "a")))
    np.testing.assert_allclose(probabilities, [2 / 3, 3 / 5, 4 / 7])
    assert probabilities.shape == (3,) and np.isfinite(probabilities).all()
    assert ((0 <= probabilities) & (probabilities <= 1)).all()


def test_global_rate_excludes_unanswered_exposures(fitting):
    from meal_prediction.controls import fit_rate_control

    fitted = fit_rate_control("global", *fitting)
    np.testing.assert_allclose(fitted.predict_proba(batch(("a", "b", "new-person"))), [3 / 5] * 3)


@pytest.mark.parametrize("kind", ["global", "personal"])
def test_rate_controls_support_empty_and_single_class_labels(kind):
    from meal_prediction.controls import fit_rate_control

    unanswered = (event("unanswered", "a"),)
    np.testing.assert_array_equal(fit_rate_control(kind, unanswered, {}).predict_proba(batch(("a", "new-person"))), [0.5, 0.5])
    np.testing.assert_allclose(fit_rate_control(kind, (event("yes", "a"),), {"yes": Target("yes", 1, None)}).predict_proba(batch(("new-person",))), [2 / 3])


@pytest.mark.parametrize("kind", ["global", "personal"])
def test_rate_controls_save_load_and_scoring_preserve_state(kind, fitting, tmp_path):
    from meal_prediction.controls import fit_rate_control
    from meal_prediction.models.base import FittedModel, load_fitted

    fitted = fit_rate_control(kind, *fitting)
    before = pickle.dumps(fitted)
    scored = batch(("new-person", "a", "b", "new-person"))
    expected = fitted.predict_proba(scored)
    fitting[1]["a-no"] = Target("a-no", 1, None)
    np.testing.assert_array_equal(fitted.predict_proba(scored), expected)
    assert fitted.predict_proba(batch(())).shape == (0,)
    assert pickle.dumps(fitted) == before
    path = tmp_path / f"{kind}.pkl"
    fitted.save(path)
    restored = load_fitted(path)
    assert isinstance(restored, FittedModel)
    np.testing.assert_array_equal(restored.predict_proba(scored), expected)


def test_rate_control_rejects_unknown_kind(fitting):
    from meal_prediction.controls import fit_rate_control

    with pytest.raises(ValueError, match="kind"):
        fit_rate_control("other", *fitting)


@pytest.mark.parametrize("kind", ["global", "personal"])
def test_rate_controls_reject_foreign_or_mismatched_targets(kind, fitting):
    from meal_prediction.controls import fit_rate_control

    events, targets = fitting
    with pytest.raises(ValueError, match="target"):
        fit_rate_control(kind, events, targets | {"heldout": Target("heldout", 1, None)})
    with pytest.raises(ValueError, match="target"):
        fit_rate_control(kind, events, {"a-yes": Target("wrong-id", 1, None)})
    with pytest.raises(ValueError, match="duplicate"):
        fit_rate_control(kind, events + events[:1], targets)


@pytest.mark.parametrize("kind", ["global", "personal"])
def test_rate_controls_reject_misaligned_batches(kind, fitting):
    from meal_prediction.controls import fit_rate_control

    fitted = fit_rate_control(kind, *fitting)
    with pytest.raises(ValueError, match="align"):
        fitted.predict_proba(replace(batch(("a", "b")), participant_ids=("a",)))
