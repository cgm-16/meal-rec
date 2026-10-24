# ABOUTME: Fits the personalized L2 logistic benchmark on shared feature rows.
# ABOUTME: Freezes deterministic sparse encoding and reports unsupported or failed fits.

from dataclasses import dataclass
from numbers import Real
from typing import Mapping
import warnings

import numpy as np
from sklearn.feature_extraction import DictVectorizer
from sklearn.linear_model import LogisticRegression

from meal_prediction.models.base import FitFailure, FittedModel, NotEstimable, validate_batch
from meal_prediction.records import FeatureBatch


LOGISTIC_GRID = tuple({"C": float(value)} for value in np.logspace(-2, 2, 9))


@dataclass(frozen=True)
class FittedLogistic(FittedModel):
    vectorizer: DictVectorizer
    estimator: LogisticRegression

    def predict_proba(self, batch: FeatureBatch) -> np.ndarray:
        validate_batch(batch)
        if not batch.ids:
            return np.empty(0, dtype=float)
        probabilities = self.estimator.predict_proba(self.vectorizer.transform(batch.rows))[:, 1]
        if not np.isfinite(probabilities).all() or not ((0 <= probabilities) & (probabilities <= 1)).all():
            raise ValueError("logistic: invalid predicted probabilities")
        return probabilities


def fit_logistic(batch: FeatureBatch, y: np.ndarray, params: Mapping[str, float], seed: int) -> FittedModel:
    validate_batch(batch)
    if (set(params) != {"C"} or isinstance(params["C"], bool) or not isinstance(params["C"], Real)
            or not np.isfinite(params["C"]) or params["C"] <= 0):
        raise ValueError("params: expected only a finite positive C")
    params = {"C": float(params["C"])}
    labels = np.asarray(y)
    if (labels.ndim != 1 or len(labels) != len(batch.ids) or labels.dtype.kind not in "iuf"
            or not np.isin(labels, (0, 1)).all()):
        raise ValueError("y: expected aligned binary 0/1 targets, never booleans")
    if not len(labels):
        raise NotEstimable("logistic", "empty_fit", params=params)
    if len(np.unique(labels)) != 2:
        raise NotEstimable("logistic", "single_class", params=params)
    vectorizer = DictVectorizer(sparse=True, sort=True)
    matrix = vectorizer.fit_transform(batch.rows)
    if not matrix.shape[1]:
        raise NotEstimable("logistic", "no_features", params=params)
    estimator = LogisticRegression(
        C=params["C"], l1_ratio=0.0, solver="lbfgs", max_iter=2000, tol=1e-6, random_state=seed,
    )
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error")
            estimator.fit(matrix, labels)
    except Warning as error:
        raise FitFailure("logistic", "solver_warning", params=params, detail=str(error)) from error
    except (ValueError, FloatingPointError, OverflowError) as error:
        raise FitFailure("logistic", "solver_error", params=params, detail=str(error)) from error
    return FittedLogistic(vectorizer, estimator)
