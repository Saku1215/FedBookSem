"""LightGBM LambdaRank learned rank-fusion model.

Training happens off this machine. This module is LOAD + INFERENCE only.
The FeatureBuilder is used both at train time and at inference time to
ensure feature parity.
"""

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import joblib
import numpy as np

# Feature order MUST match the training script.
FEATURE_ORDER = [
    "sim_score",
    "cf_score",
    "reception_score",
    "diversity_score",
    "ce_score",
    "freshness",
]


class FeatureBuilder:
    """Assemble the (N, len(FEATURE_ORDER)) feature matrix for a candidate list."""

    def build(self, candidates: list[dict]) -> np.ndarray:
        rows = []
        for c in candidates:
            rows.append([float(c.get(name, 0.0) or 0.0) for name in FEATURE_ORDER])
        return np.asarray(rows, dtype=np.float32)


@dataclass
class LTRRanker:
    model: Any            # lightgbm.Booster
    feature_names: list[str]

    def score(self, candidates: list[dict]) -> np.ndarray:
        X = FeatureBuilder().build(candidates)
        return self.model.predict(X)

    @classmethod
    def load(cls, path: Path) -> "LTRRanker":
        return joblib.load(path)

    def save(self, path: Path) -> None:
        joblib.dump(self, path)
