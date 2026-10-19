# ABOUTME: Fits response-rate controls and the calibrated deterministic pilot heuristic.
# ABOUTME: Freezes fitting-partition labels and histories before outcome-free scoring.

from copy import deepcopy
from dataclasses import dataclass
from typing import Mapping
import warnings

import numpy as np
from sklearn.linear_model import LogisticRegression

from meal_prediction.heuristic import HEURISTIC_INPUT_MAPPING, HEURISTIC_VERSION, heuristic_score, validate_history
from meal_prediction.models.base import FitFailure, FittedModel, NotEstimable, validate_batch
from meal_prediction.records import Exposure, FeatureBatch, Target


@dataclass(frozen=True)
class RateControl(FittedModel):
    kind: str
    global_rate: float
    personal_rates: dict[str, float]

    def predict_proba(self, batch: FeatureBatch) -> np.ndarray:
        validate_batch(batch)
        return np.array([self.personal_rates.get(person, self.global_rate) for person in batch.participant_ids], dtype=float)


def fit_rate_control(kind: str, fit_events: tuple[Exposure, ...], fit_targets: Mapping[str, Target]) -> FittedModel:
    if kind not in ("global", "personal"):
        raise ValueError("kind: expected global or personal")
    indexed = {event.event_id: event for event in fit_events}
    if len(indexed) != len(fit_events):
        raise ValueError("fit_events: duplicate event ID")
    counts = {}
    for identity, target in fit_targets.items():
        if identity not in indexed or target.event_id != identity:
            raise ValueError("fit_targets: target must match an event in the fitting partition")
        if kind == "personal":
            person = indexed[identity].participant_id
            yes, count = counts.get(person, (0, 0))
            counts[person] = (yes + target.y, count + 1)
    global_rate = (sum(target.y for target in fit_targets.values()) + 1) / (len(fit_targets) + 2)
    personal_rates = {person: (yes + 5 * global_rate) / (count + 5) for person, (yes, count) in counts.items()}
    return RateControl(kind, global_rate, personal_rates)


@dataclass(frozen=True)
class CalibratedHeuristic(FittedModel):
    estimator: LogisticRegression
    fit_events: tuple[Exposure, ...]
    fit_targets: dict[str, Target]
    version: str
    input_mapping: dict[str, object]

    def predict_proba(self, batch: FeatureBatch) -> np.ndarray:
        validate_batch(batch)
        if (batch.ids != tuple(event.event_id for event in batch.events)
                or batch.participant_ids != tuple(event.participant_id for event in batch.events)):
            raise ValueError("batch: events must align with IDs and participants")
        if not batch.ids:
            return np.empty(0, dtype=float)
        scores = np.array([heuristic_score(event, self.fit_events, self.fit_targets) for event in batch.events]).reshape(-1, 1)
        probabilities = self.estimator.predict_proba(scores)[:, 1]
        if not np.isfinite(probabilities).all() or not ((0 <= probabilities) & (probabilities <= 1)).all():
            raise ValueError("heuristic: invalid predicted probabilities")
        return probabilities


def fit_heuristic_control(fit_events: tuple[Exposure, ...], fit_targets: Mapping[str, Target]) -> FittedModel:
    validate_history(fit_events, fit_targets)
    events = deepcopy(tuple(event for event in fit_events if event.event_id in fit_targets))
    targets = dict(fit_targets)
    labels = np.array([targets[event.event_id].y for event in events])
    params = {"C": 1.0}
    if not len(labels):
        raise NotEstimable("heuristic", "empty_fit", params=params)
    if len(np.unique(labels)) != 2:
        raise NotEstimable("heuristic", "single_class", params=params)
    scores = np.array([heuristic_score(event, events, targets) for event in events]).reshape(-1, 1)
    estimator = LogisticRegression(C=1, l1_ratio=0.0, solver="lbfgs", max_iter=2000, tol=1e-6, random_state=42)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error")
            estimator.fit(scores, labels)
    except Warning as error:
        raise FitFailure("heuristic", "solver_warning", params=params, detail=str(error)) from error
    except (ValueError, FloatingPointError, OverflowError) as error:
        raise FitFailure("heuristic", "solver_error", params=params, detail=str(error)) from error
    return CalibratedHeuristic(estimator, events, targets, HEURISTIC_VERSION, dict(HEURISTIC_INPUT_MAPPING))
