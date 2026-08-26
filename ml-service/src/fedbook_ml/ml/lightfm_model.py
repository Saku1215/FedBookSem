"""LightFM WARP hybrid CF recommender.

Training happens off this machine (Colab / cloud GPU) via a separate script.
This module is the LOAD + INFERENCE surface used by the API. The training
script lives at scripts/train_lightfm.py and is intentionally not exercised
in the development environment.
"""

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import joblib
import numpy as np


@dataclass
class LightFMRecommender:
    """Container for a trained LightFM model + mapping tables.

    Do NOT construct directly - use `.load(path)` to hydrate a serialised
    artefact produced elsewhere.
    """

    model: Any                       # lightfm.LightFM
    item_features_matrix: Any        # scipy.sparse
    user_id_map: dict
    item_id_map: dict
    reverse_item_map: dict

    def recommend(self, user_id: int, k: int = 10) -> list[dict]:
        internal_uid = self.user_id_map.get(user_id)
        if internal_uid is None:
            return []
        n_items = len(self.item_id_map)
        scores = self.model.predict(
            internal_uid,
            np.arange(n_items),
            item_features=self.item_features_matrix,
        )
        top = np.argsort(-scores)[:k]
        return [
            {"goodbooks_id": self.reverse_item_map[int(i)], "score": float(scores[i])}
            for i in top
        ]

    @classmethod
    def load(cls, path: Path) -> "LightFMRecommender":
        return joblib.load(path)

    def save(self, path: Path) -> None:
        joblib.dump(self, path)
