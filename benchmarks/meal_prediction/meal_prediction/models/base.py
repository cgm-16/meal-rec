# ABOUTME: Defines minimal fitted-model persistence and structured fit outcomes.
# ABOUTME: Loads owned pickle artifacts after the caller verifies their provenance.

from abc import ABC, abstractmethod
from pathlib import Path
import pickle
from typing import Any, Mapping

import numpy as np

from meal_prediction.records import FeatureBatch


class FitError(RuntimeError):
    def __init__(self, family: str, reason: str, *, params: Mapping[str, Any] | None = None, detail: str = ""):
        self.family = family
        self.reason = reason
        self.params = dict(params or {})
        self.detail = detail
        super().__init__(f"{family}: {reason}" + (f": {detail}" if detail else ""))


class NotEstimable(FitError):
    """The fitting partition cannot estimate the requested candidate."""


class FitFailure(FitError):
    """An attempted candidate fit failed or emitted a solver warning."""


class FittedModel(ABC):
    @abstractmethod
    def predict_proba(self, batch: FeatureBatch) -> np.ndarray:
        """Return aligned P(y=1) values without updating fitted state."""

    def save(self, path: Path) -> None:
        path.write_bytes(pickle.dumps(self, protocol=pickle.HIGHEST_PROTOCOL))


def load_fitted(path: Path) -> FittedModel:
    """Load only owned artifacts after manifest/hash/version checks by the caller."""
    fitted = pickle.loads(path.read_bytes())
    if not isinstance(fitted, FittedModel):
        raise ValueError("artifact: expected a fitted model")
    return fitted


def validate_batch(batch: FeatureBatch) -> None:
    if not len(batch.ids) == len(batch.participant_ids) == len(batch.rows) == len(batch.events):
        raise ValueError("batch: IDs, participants, rows, and events must align")
