# ABOUTME: Fits the contextual second-order River factorization-machine benchmark.
# ABOUTME: Freezes encoded fitting support and all learned state during scoring.

from dataclasses import dataclass
from numbers import Integral, Real
import random
from typing import Mapping
import warnings

import numpy as np
from river import facto, optim

from meal_prediction.models.base import FitFailure, FittedModel, NotEstimable, validate_batch
from meal_prediction.records import FeatureBatch


FM_GRID = tuple({"n_factors": rank, "l2": l2} for rank in (4, 8, 16) for l2 in (1e-5, 1e-3, 0.1))


def _encoded_row(row):
    return dict(sorted(
        ((name, value), 1.0) if isinstance(value, str) else ((name,), value)
        for name, value in row.items() if isinstance(value, str) or value != 0
    ))


@dataclass(frozen=True)
class FittedFM(FittedModel):
    active_keys: tuple[tuple[str, ...], ...]
    estimator: facto.FMClassifier

    def predict_proba(self, batch: FeatureBatch) -> np.ndarray:
        validate_batch(batch)
        active = set(self.active_keys)
        probabilities = np.array([
            self.estimator.predict_proba_one({key: value for key, value in _encoded_row(row).items() if key in active})[True]
            for row in batch.rows
        ])
        if not np.isfinite(probabilities).all() or not ((0 <= probabilities) & (probabilities <= 1)).all():
            raise ValueError("fm: invalid predicted probabilities")
        return probabilities


def fit_fm(batch: FeatureBatch, y: np.ndarray, params: Mapping[str, int | float], seed: int) -> FittedModel:
    validate_batch(batch)
    if (set(params) != {"n_factors", "l2"} or isinstance(params["n_factors"], bool)
            or not isinstance(params["n_factors"], Integral) or params["n_factors"] not in (4, 8, 16)
            or isinstance(params["l2"], bool) or not isinstance(params["l2"], Real)
            or params["l2"] not in (1e-5, 1e-3, 0.1)):
        raise ValueError("params: expected only n_factors in (4, 8, 16) and l2 in (1e-5, 1e-3, 0.1)")
    params = {"n_factors": int(params["n_factors"]), "l2": float(params["l2"])}
    labels = np.asarray(y)
    if (labels.ndim != 1 or len(labels) != len(batch.ids) or labels.dtype.kind not in "iuf"
            or not np.isin(labels, (0, 1)).all()):
        raise ValueError("y: expected aligned binary 0/1 targets, never booleans")
    if not len(labels):
        raise NotEstimable("fm", "empty_fit", params=params)
    if len(np.unique(labels)) != 2:
        raise NotEstimable("fm", "single_class", params=params)
    rows = tuple(_encoded_row(row) for row in batch.rows)
    active_keys = tuple(sorted({key for row in rows for key in row}))
    if not active_keys:
        raise NotEstimable("fm", "no_features", params=params)
    estimator = facto.FMClassifier(
        n_factors=params["n_factors"], loss=optim.losses.Log(),
        weight_optimizer=optim.SGD(0.01), latent_optimizer=optim.SGD(0.01),
        l2_weight=params["l2"], l2_latent=params["l2"], seed=seed,
    )
    order, rng = list(range(len(rows))), random.Random(seed)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error")
            if any(not np.isfinite(value) for row in rows for value in row.values()):
                raise ValueError("non-finite fitting features")
            for _ in range(25):
                rng.shuffle(order)
                for index in order:
                    estimator.learn_one(rows[index], labels[index])
            if (not np.isfinite(estimator.intercept) or not np.isfinite(list(estimator.weights.values())).all()
                    or not all(np.isfinite(value).all() for value in estimator.latents.values())):
                raise ValueError("non-finite fitted parameters")
    except Warning as error:
        raise FitFailure("fm", "solver_warning", params=params, detail=str(error)) from error
    except (ValueError, FloatingPointError, OverflowError) as error:
        raise FitFailure("fm", "solver_error", params=params, detail=str(error)) from error
    # Prediction must never initialize a latent or weight, even for a scoring-only nonzero key.
    estimator.weights.default_factory = estimator.latents.default_factory = None
    return FittedFM(active_keys, estimator)
