"""Pre-episode execution-mode routing policy for tool availability."""

from __future__ import annotations

import json
import random
import re
from pathlib import Path
from typing import Any, Literal

from benchmarks.mode_router.classifier import Classifier, load_classifier, DEFAULT_ARTIFACT
from benchmarks.mode_router.features import supra_complexity_score

Mode = Literal["native", "batch"]

LEDGER_PATH = Path(__file__).parents[1] / "terminal-bench" / "discordance_ledger.json"


class ModePolicy:
    """Pre-episode execution-mode selector for coding agents."""

    def __init__(
        self,
        strategy: Literal["always_native", "always_batch", "random", "oracle", "heuristic", "classifier"] = "heuristic",
        ledger_path: Path = LEDGER_PATH,
        seed: int = 42,
        classifier_artifact: Path | None = None,
    ) -> None:
        self.strategy = strategy
        self.ledger_path = ledger_path
        self.seed = seed
        self._oracle_map: dict[str, Mode] = {}
        self._classifier: Classifier | None = None

        if strategy == "oracle" and ledger_path.exists():
            data = json.loads(ledger_path.read_text())
            for task_id, info in data.get("tasks", {}).items():
                self._oracle_map[task_id] = info.get("preferred_oracle_mode", "native")

        if strategy == "classifier":
            artifact = classifier_artifact or DEFAULT_ARTIFACT
            self._classifier = load_classifier(artifact)

    def decide(self, task_id: str, instruction: str) -> dict[str, Any]:
        """Return decision dict: {"mode": Mode, "score": float, "features": dict, "strategy": str}."""
        features: dict[str, Any] = {"task_id": task_id, "instruction_length": len(instruction)}

        if self.strategy == "always_native":
            return {"mode": "native", "score": 0.0, "features": features, "strategy": self.strategy}

        if self.strategy == "always_batch":
            return {"mode": "batch", "score": 1.0, "features": features, "strategy": self.strategy}

        if self.strategy == "random":
            rng = random.Random(f"{self.seed}:{task_id}")
            choice: Mode = "batch" if rng.random() > 0.5 else "native"
            return {"mode": choice, "score": 0.5, "features": features, "strategy": self.strategy}

        if self.strategy == "oracle":
            choice = self._oracle_map.get(task_id, "native")
            return {"mode": choice, "score": 1.0 if choice == "batch" else 0.0, "features": features, "strategy": self.strategy}

        if self.strategy == "classifier":
            if self._classifier is None:
                raise RuntimeError("classifier strategy requested but no classifier loaded")
            pred = self._classifier.predict(instruction)
            features["classifier_score"] = pred["score"]
            features["classifier_label"] = pred["label"]
            return {
                "mode": pred["mode"],
                "score": pred["score"],
                "features": features,
                "strategy": self.strategy,
                "classifier_score": pred["score"],
            }

        # Heuristic / Supra probe policy
        text_lower = instruction.lower()
        complexity = supra_complexity_score(instruction)
        features["supra_complexity"] = complexity

        # Check for harmful long-running exploratory keywords
        is_exploratory = bool(re.search(r"\b(compile|build|train|model|qemu|stan|pystan|debug|test)\b", text_lower))
        # Check for beneficial short inspection keywords
        is_inspection = bool(re.search(r"\b(find|grep|locate|check|search|read|token|count|config)\b", text_lower))

        features["is_exploratory"] = is_exploratory
        features["is_inspection"] = is_inspection

        if is_exploratory and not is_inspection:
            mode: Mode = "native"
            score = 0.2
        elif is_inspection and complexity <= 3:
            mode = "batch"
            score = 0.8
        else:
            mode = "native"
            score = 0.4

        return {
            "mode": mode,
            "score": score,
            "features": features,
            "strategy": self.strategy,
        }
