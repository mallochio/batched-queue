"""Unit tests for ModePolicy."""

from __future__ import annotations

import tempfile
import json
from pathlib import Path
from benchmarks.mode_router.features import supra_complexity_score
from benchmarks.mode_router.policy import ModePolicy


def test_supra_complexity_score() -> None:
    score1 = supra_complexity_score("find the config and check port")
    assert 1 <= score1 <= 5

    score2 = supra_complexity_score("compile PyTorch model and train qemu Alpine kernel with pystan")
    assert score2 > score1


def test_always_strategies() -> None:
    pn = ModePolicy("always_native")
    assert pn.decide("task1", "hello")["mode"] == "native"

    pb = ModePolicy("always_batch")
    assert pb.decide("task1", "hello")["mode"] == "batch"


def test_oracle_strategy() -> None:
    with tempfile.NamedTemporaryFile("w+", suffix=".json") as tmp:
        ledger = {
            "tasks": {
                "t1": {"preferred_oracle_mode": "batch"},
                "t2": {"preferred_oracle_mode": "native"},
            }
        }
        Path(tmp.name).write_text(json.dumps(ledger))
        po = ModePolicy("oracle", ledger_path=Path(tmp.name))

        assert po.decide("t1", "desc")["mode"] == "batch"
        assert po.decide("t2", "desc")["mode"] == "native"
        assert po.decide("t3", "desc")["mode"] == "native"  # fallback


def test_heuristic_strategy() -> None:
    ph = ModePolicy("heuristic")
    
    # Inspection task -> batch
    res1 = ph.decide("count-dataset-tokens", "Locate token dataset and count total tokens")
    assert res1["mode"] == "batch"

    # Exploratory build task -> native
    res2 = ph.decide("build-cython-ext", "Compile C++ Cython extension, build shared library, and debug segmentation fault")
    assert res2["mode"] == "native"


if __name__ == "__main__":
    test_supra_complexity_score()
    test_always_strategies()
    test_oracle_strategy()
    test_heuristic_strategy()
    print("All ModePolicy tests passed!")
