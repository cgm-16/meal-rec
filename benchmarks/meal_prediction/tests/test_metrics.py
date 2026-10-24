# ABOUTME: Checks hand-derived participant weighting and shared paired resampling.
# ABOUTME: Rejects misaligned evidence and prevents optimistic sparse pilot claims.

from datetime import datetime, timedelta, timezone
import math

import numpy as np
import pytest

from meal_prediction import metrics


T0 = datetime(2026, 1, 1, tzinfo=timezone.utc)


def predictions(*, people=3, days=7, one_class=False):
    return tuple(metrics.Prediction(
        f"{person}-{day}", str(person), 0 if one_class else day % 2,
        {"reference": 0.5, "candidate": 0.1 if one_class or day % 2 == 0 else 0.9},
        T0 + timedelta(days=7 + day),
    ) for person in range(people) for day in range(days))


def test_user_balancing_and_bootstrap_multiplicity():
    summary = metrics.evaluate(tuple(map(str, range(10))), ("one",) + ("nine",) * 9,
                               [1] * 10, [0.9] + [0.1] * 9)
    assert summary.participant_log_loss == pytest.approx((-math.log(0.9) - math.log(0.1)) / 2)
    assert summary.event_log_loss == pytest.approx((-math.log(0.9) - 9 * math.log(0.1)) / 10)
    assert summary.participant_brier == pytest.approx((0.01 + 0.81) / 2)
    assert summary.per_participant["one"]["observations"] == 1
    assert summary.per_participant["nine"]["observations"] == 9
    # A repeated person has repeated weight, not set membership.
    draws = metrics._resample_person_losses(np.array([[1., 10.], [4., 40.], [9., 90.]]), np.array([[0, 0, 1]]))
    np.testing.assert_array_equal(draws, [[2., 20.]])


def test_log_loss_clips_only_loss_and_calibration_balances_people():
    summary = metrics.evaluate(("a", "b", "c"), ("p", "q", "q"), [1, 0, 1], [0., 0.2, 1.])
    assert summary.participant_log_loss == pytest.approx((-math.log(1e-6) + (-math.log(0.8) - math.log(0.999999)) / 2) / 2)
    assert summary.participant_brier == pytest.approx((1. + 0.02) / 2)
    assert [row.event_count for row in summary.calibration] == [1, 1, 0, 0, 1]
    assert [row.weight for row in summary.calibration] == [0.5, 0.25, 0, 0, 0.25]
    assert summary.calibration[0].mean_probability == 0.
    assert summary.calibration[4].mean_probability == 1.
    assert summary.calibration[0].positive_fraction == 1.


@pytest.mark.parametrize("ids,people,y,p", [
    (("a", "a"), ("p", "p"), [0, 1], [0.5, 0.5]),
    (("a",), (), [0], [0.5]), (("a",), ("p",), [2], [0.5]),
    (("a",), ("p",), [True], [0.5]), (("a",), ("p",), [0], [float("nan")]),
    (("a",), ("p",), [0], [1.01]), (("a",), ("p",), [0], [-0.01]),
])
def test_metric_boundary_rejects_invalid_alignment_or_values(ids, people, y, p):
    with pytest.raises(ValueError):
        metrics.evaluate(ids, people, y, p)


def test_empty_or_sparse_evidence_is_explicit():
    summary = metrics.evaluate((), (), [], [])
    assert summary.status == "empty"
    assert summary.participant_log_loss is None and summary.event_log_loss is None
    assert summary.participants == summary.observations == 0
    assert all(row.mean_probability is None for row in summary.calibration)
    empty = metrics.paired_intervals((), source="pilot", study_start=T0)
    assert empty.status == "empty" and empty.group == {} and empty.time == {}
    sparse = predictions(people=2, days=4)
    intervals = metrics.paired_intervals(sparse, source="pilot", study_start=T0)
    assert metrics.pilot_gain(sparse, intervals, candidate="candidate", reference="reference")["status"] == "insufficient_evidence"
    one_class = predictions(one_class=True)
    intervals = metrics.paired_intervals(one_class, source="pilot", study_start=T0)
    assert metrics.pilot_gain(one_class, intervals, candidate="candidate", reference="reference")["useful_gain"] is False


def test_paired_intervals_share_draws_are_repeatable_and_require_identical_ids():
    rows = predictions()
    first = metrics.paired_intervals(rows, source="uci", study_start=None)
    assert first == metrics.paired_intervals(rows, source="uci", study_start=None)
    assert first.replicates == 2000 and first.group_support == 3
    assert first.time == {} and first.date_support == 0
    pair = next(iter(first.group.values()))
    assert pair.first == "reference" and pair.second == "candidate"
    assert pair.observed_difference == pytest.approx(math.log(0.9 / 0.5))
    assert pair.lower == pytest.approx(pair.upper)
    assert pair.usable == 2000 and pair.empty == 0
    with pytest.raises(ValueError, match="align"):
        metrics.paired_intervals(rows[:-1] + (metrics.Prediction("x", "p", 0, {"candidate": 0.5}),), source="uci", study_start=None)
    with pytest.raises(ValueError, match="duplicate"):
        metrics.paired_intervals(rows + rows[:1], source="uci", study_start=None)


def test_pilot_group_and_solo_gains_require_available_paired_support():
    rows = predictions()
    intervals = metrics.paired_intervals(rows, source="pilot", study_start=T0)
    assert intervals.date_support == 7
    gain = metrics.pilot_gain(rows, intervals, candidate="candidate", reference="reference")
    assert gain["status"] == "provisional_useful_gain" and gain["useful_gain"] is True
    assert gain["mode"] == "group"
    solo = predictions(people=1)
    solo_intervals = metrics.paired_intervals(solo, source="pilot", study_start=T0)
    assert next(iter(solo_intervals.group.values())).status == "insufficient_participants"
    assert next(iter(solo_intervals.time.values())).usable == 2000
    assert metrics.pilot_gain(solo, solo_intervals, candidate="candidate", reference="reference")["mode"] == "within_person"
    public = metrics.paired_intervals(rows, source="uci", study_start=None)
    assert metrics.pilot_gain(rows, public, candidate="candidate", reference="reference")["status"] == "not_applicable_public_proxy"


def test_empty_pilot_date_resamples_are_counted():
    rows = predictions(people=2, days=1)
    summary = metrics.paired_intervals(rows, source="pilot", study_start=T0)
    pair = next(iter(summary.time.values()))
    assert 0 < pair.empty < 2000
    assert pair.usable + pair.empty == 2000
    outside = (metrics.Prediction("bad", "p", 1, {"a": 0.5, "b": 0.5}, T0),)
    with pytest.raises(ValueError, match="test"):
        metrics.paired_intervals(outside, source="pilot", study_start=T0)


def test_mixed_boolean_labels_are_not_coerced_into_binary_targets():
    with pytest.raises(ValueError, match="binary"):
        metrics.evaluate(("a", "b"), ("p", "p"), [True, 0], [0.5, 0.5])
