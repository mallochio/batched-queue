"""Unit tests for the mode classifier."""

from __future__ import annotations

import json
from pathlib import Path

from benchmarks.mode_router.classifier import Classifier
from benchmarks.mode_router.policy import ModePolicy

LEDGER = Path(__file__).parents[1] / "terminal-bench" / "discordance_ledger.json"
ARTIFACT = Path(__file__).parent / "artifacts" / "classifier_v1"


def _load_artifact_meta() -> dict:
    meta_path = ARTIFACT.with_suffix(".json")
    return json.loads(meta_path.read_text())


def test_holdout_disjoint_from_train() -> None:
    meta = _load_artifact_meta()
    train = set(meta["train_ids"])
    holdout = set(meta["holdout_ids"])
    assert not (train & holdout), "holdout overlaps train"


def test_classifier_returns_valid_modes() -> None:
    clf = Classifier(ARTIFACT.with_suffix(".pkl"))
    p = clf.predict("Locate the config file and count the tokens")
    assert p["mode"] in ("native", "batch")
    assert 0.0 <= p["score"] <= 1.0


def test_modepolicy_classifier_strategy() -> None:
    policy = ModePolicy("classifier", classifier_artifact=ARTIFACT)
    res = policy.decide("x", "compile and build the model")
    assert res["mode"] in ("native", "batch")
    assert "classifier_score" in res


if __name__ == "__main__":
    test_holdout_disjoint_from_train()
    test_classifier_returns_valid_modes()
    test_modepolicy_classifier_strategy()
    print("All classifier tests passed!")
