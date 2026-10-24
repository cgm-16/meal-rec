# ABOUTME: Evaluates participant-balanced losses and fixed-bin calibration.
# ABOUTME: Uses shared paired person/date draws and explicit sparse-evidence guards.

from dataclasses import dataclass
from datetime import datetime, timedelta
from itertools import combinations
from typing import Mapping, Sequence

import numpy as np


BOOTSTRAP_REPLICATES = 2000


@dataclass(frozen=True)
class CalibrationBin:
    lower: float
    upper: float
    event_count: int
    weight: float
    mean_probability: float | None
    positive_fraction: float | None


@dataclass(frozen=True)
class MetricSummary:
    status: str
    observations: int
    participants: int
    classes: tuple[int, ...]
    participant_log_loss: float | None
    event_log_loss: float | None
    participant_brier: float | None
    calibration: tuple[CalibrationBin, ...]
    per_participant: dict[str, dict]


@dataclass(frozen=True)
class Prediction:
    event_id: str
    participant_id: str
    y: int
    probabilities: Mapping[str, float]
    displayed_at: datetime | None = None


@dataclass(frozen=True)
class PairedInterval:
    first: str
    second: str
    observed_difference: float
    lower: float | None
    upper: float | None
    usable: int
    empty: int
    status: str


@dataclass(frozen=True)
class IntervalSummary:
    source: str
    status: str
    replicates: int
    seed: int
    group_support: int
    date_support: int
    group: dict[str, PairedInterval]
    time: dict[str, PairedInterval]


def _arrays(batch_ids, participant_ids, y, probabilities):
    ids, people = tuple(batch_ids), tuple(participant_ids)
    labels, values = np.asarray(y), np.asarray(probabilities)
    if (labels.ndim != 1 or values.ndim != 1 or not len(ids) == len(people) == len(labels) == len(values)):
        raise ValueError("predictions: IDs, participants, labels and probabilities must align")
    if len(set(ids)) != len(ids):
        raise ValueError("predictions: duplicate observation ID")
    if any(not isinstance(value, str) or not value for value in ids + people):
        raise ValueError("predictions: expected nonempty string identities")
    if any(isinstance(value, (bool, np.bool_)) for value in y) or labels.dtype.kind not in "iuf" or not np.isin(labels, (0, 1)).all():
        raise ValueError("y: expected binary 0/1 labels, never booleans")
    if values.dtype.kind not in "iuf" or not np.isfinite(values).all() or not ((values >= 0) & (values <= 1)).all():
        raise ValueError("probabilities: expected finite probabilities in [0,1]")
    return ids, people, labels.astype(float), values.astype(float)


def _losses(labels, values):
    clipped = np.clip(values, 1e-6, 1 - 1e-6)
    return -(labels * np.log(clipped) + (1 - labels) * np.log1p(-clipped))


def evaluate(batch_ids, participant_ids, y, probabilities) -> MetricSummary:
    ids, people, labels, values = _arrays(batch_ids, participant_ids, y, probabilities)
    people_array = np.array(people)
    losses, brier = _losses(labels, values), (labels - values) ** 2
    per_person, weights = {}, np.zeros(len(ids))
    for person in sorted(set(people)):
        mask = people_array == person
        per_person[person] = {"observations": int(mask.sum()), "log_loss": float(losses[mask].mean()),
                              "brier": float(brier[mask].mean()), "positive_labels": int(labels[mask].sum())}
        weights[mask] = 1 / (len(set(people)) * mask.sum())
    calibration = []
    for index in range(5):
        lower, upper = index / 5, (index + 1) / 5
        mask = (values >= lower) & ((values <= upper) if index == 4 else (values < upper))
        weight = float(weights[mask].sum())
        calibration.append(CalibrationBin(lower, upper, int(mask.sum()), weight,
            float(np.average(values[mask], weights=weights[mask])) if weight else None,
            float(np.average(labels[mask], weights=weights[mask])) if weight else None))
    classes = tuple(int(value) for value in np.unique(labels))
    return MetricSummary(
        "empty" if not ids else "single_class" if len(classes) == 1 else "ok", len(ids), len(per_person), classes,
        float(np.dot(weights, losses)) if ids else None, float(losses.mean()) if ids else None,
        float(np.dot(weights, brier)) if ids else None, tuple(calibration), per_person,
    )


def _resample_person_losses(loss_vectors, draws):
    return loss_vectors[draws].mean(axis=1)


def _paired(names, observed, resamples, *, unavailable=None, empty=0):
    intervals = {}
    for i, j in combinations(range(len(names)), 2):
        values = resamples[:, i] - resamples[:, j]
        bounds = np.percentile(values, [2.5, 97.5]) if len(values) and unavailable is None else (None, None)
        intervals[f"{names[i]}__minus__{names[j]}"] = PairedInterval(
            names[i], names[j], float(observed[i] - observed[j]),
            float(bounds[0]) if bounds[0] is not None else None,
            float(bounds[1]) if bounds[1] is not None else None,
            len(values) if unavailable is None else 0, empty,
            unavailable or ("available" if len(values) else "empty_resamples"),
        )
    return intervals


def paired_intervals(predictions: Sequence[Prediction], *, source, study_start, seed=42) -> IntervalSummary:
    if source not in ("uci", "pilot"):
        raise ValueError("source: expected uci or pilot")
    if not predictions:
        return IntervalSummary(source, "empty", BOOTSTRAP_REPLICATES, seed, 0, 0, {}, {})
    ids = tuple(row.event_id for row in predictions)
    people = tuple(row.participant_id for row in predictions)
    y = tuple(row.y for row in predictions)
    names = tuple(predictions[0].probabilities)
    if not names or any(set(row.probabilities) != set(names) for row in predictions):
        raise ValueError("predictions: all candidate/control probabilities must align on identical IDs")
    columns = []
    for name in names:
        _, _, labels, values = _arrays(ids, people, y, [row.probabilities[name] for row in predictions])
        columns.append(_losses(labels, values))
    losses = np.array(columns).T
    persons, person_index = np.unique(people, return_inverse=True)
    person_losses = np.array([losses[person_index == index].mean(axis=0) for index in range(len(persons))])
    observed = person_losses.mean(axis=0)
    rng = np.random.default_rng(seed)
    draws = rng.integers(len(persons), size=(BOOTSTRAP_REPLICATES, len(persons)))
    group = _paired(names, observed, _resample_person_losses(person_losses, draws),
                    unavailable="insufficient_participants" if len(persons) < 2 else None)
    time, date_support = {}, 0
    if source == "pilot":
        if not isinstance(study_start, datetime) or study_start.utcoffset() != timedelta(0):
            raise ValueError("study_start: expected an aware UTC instant")
        dates = []
        for row in predictions:
            if (row.displayed_at is None or row.displayed_at.utcoffset() != timedelta(0)
                    or not study_start + timedelta(days=7) <= row.displayed_at < study_start + timedelta(days=14)):
                raise ValueError("predictions: expected UTC dates within the test week")
            dates.append((row.displayed_at - study_start).days - 7)
        dates = np.array(dates)
        date_support = len(np.unique(dates))
        # Draw common circular two-day blocks, concatenate four blocks, truncate to seven dates.
        starts = rng.integers(7, size=(BOOTSTRAP_REPLICATES, 4))
        date_draws = np.stack((starts, (starts + 1) % 7), axis=2).reshape(BOOTSTRAP_REPLICATES, 8)[:, :7]
        sums = np.zeros((len(persons), 7, len(names)))
        counts = np.zeros((len(persons), 7))
        for index in range(len(ids)):
            sums[person_index[index], dates[index]] += losses[index]
            counts[person_index[index], dates[index]] += 1
        time_losses, empty = [], 0
        for draw in date_draws:
            totals = counts[:, draw].sum(axis=1)
            represented = totals > 0
            if not represented.any():
                empty += 1
                continue
            time_losses.append((sums[:, draw].sum(axis=1)[represented] / totals[represented, None]).mean(axis=0))
        resamples = np.array(time_losses).reshape(-1, len(names))
        time = _paired(names, observed, resamples, empty=empty)
    return IntervalSummary(source, "ok", BOOTSTRAP_REPLICATES, seed, len(persons), date_support, group, time)


def _improvement_interval(pairs, reference, candidate):
    for pair in pairs.values():
        if pair.status != "available":
            continue
        if (pair.first, pair.second) == (reference, candidate):
            return pair.lower, pair.upper
        if (pair.first, pair.second) == (candidate, reference):
            return -pair.upper, -pair.lower
    return None


def pilot_gain(predictions, intervals, *, candidate, reference):
    if intervals.source == "uci":
        return {"status": "not_applicable_public_proxy", "useful_gain": False,
                "reason": "Static restaurant ratings do not measure immediate meal appeal, hunger or weather."}
    mode = "within_person" if intervals.group_support == 1 else "group"
    result = {"status": "insufficient_evidence", "useful_gain": False, "mode": mode, "relative_gain": None}
    if not predictions or intervals.date_support < 5 or len({row.y for row in predictions}) < 2:
        return result
    candidate_loss, reference_loss = [evaluate(
        [row.event_id for row in predictions], [row.participant_id for row in predictions],
        [row.y for row in predictions], [row.probabilities[name] for row in predictions],
    ).participant_log_loss for name in (candidate, reference)]
    result["relative_gain"] = (reference_loss - candidate_loss) / reference_loss
    support = [_improvement_interval(intervals.time, reference, candidate)]
    if mode == "group":
        support.append(_improvement_interval(intervals.group, reference, candidate))
    if any(interval is None for interval in support):
        return result
    useful = result["relative_gain"] >= 0.05 and all(interval[0] > 0 for interval in support)
    result.update(status="provisional_useful_gain" if useful else "no_supported_useful_gain", useful_gain=useful)
    return result
