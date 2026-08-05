"""Load and run the trained mode classifier."""

from __future__ import annotations

import joblib
import numpy as np
from pathlib import Path
from typing import Any
from scipy.sparse import hstack
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

from benchmarks.mode_router.features import structural_feature_rows

DEFAULT_ARTIFACT = Path(__file__).parent / "artifacts" / "classifier_v1"


class CombinedPipeline:
    """Pipeline over (texts, structural_matrix) with fitted TF-IDF + scaler + LR.

    Defined here (not in __main__) so it can be pickled/unpickled by joblib.
    """

    def __init__(self, max_features: int = 50) -> None:
        self.tfidf = TfidfVectorizer(max_features=max_features, lowercase=True, stop_words="english")
        self.scaler = StandardScaler()
        self.lr = LogisticRegression(class_weight="balanced", C=1.0, max_iter=2000)

    def fit(self, texts, struct, y) -> "CombinedPipeline":
        tfidf_mat = self.tfidf.fit_transform(texts)
        struct_scaled = self.scaler.fit_transform(struct)
        X = hstack([tfidf_mat, struct_scaled]).tocsr()
        self.lr.fit(X, y)
        return self

    def predict(self, texts, struct):
        return self.lr.predict(self._transform(texts, struct))

    def predict_proba(self, texts, struct):
        return self.lr.predict_proba(self._transform(texts, struct))

    def _transform(self, texts, struct):
        tfidf_mat = self.tfidf.transform(texts)
        struct_scaled = self.scaler.transform(struct)
        return hstack([tfidf_mat, struct_scaled]).tocsr()

    @property
    def classes_(self):
        return self.lr.classes_


class Classifier:
    """Thin wrapper over the fitted CombinedPipeline predicting execution mode."""

    def __init__(self, model_path: Path) -> None:
        self.model: CombinedPipeline = joblib.load(model_path)
        self.threshold = 0.5

    def predict(self, instruction: str) -> dict[str, Any]:
        texts = [instruction or ""]
        struct = np.asarray(structural_feature_rows(texts), dtype=float)
        proba = self.model.predict_proba(texts, struct)[0]
        batch_prob = proba[1] if self.model.classes_[1] == 1 else proba[0]
        mode = "batch" if batch_prob >= self.threshold else "native"
        return {
            "mode": mode,
            "score": float(batch_prob),
            "label": int(batch_prob >= self.threshold),
        }


def load_classifier(artifact_base: Path = DEFAULT_ARTIFACT) -> Classifier:
    """Load the classifier from an artifact base path (without extension)."""
    return Classifier(artifact_base.with_suffix(".pkl"))



