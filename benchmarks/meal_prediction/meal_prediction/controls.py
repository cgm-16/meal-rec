# ABOUTME: Fits global and shrunk personal response-rate controls from supplied labels.
# ABOUTME: Leaves unanswered exposures uncounted and scoring-only participants at the global rate.

from dataclasses import dataclass
from typing import Mapping

import numpy as np

from meal_prediction.models.base import FittedModel, validate_batch
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
