"""Instruction-only feature extraction for the mode classifier.

All features are derived from the task instruction text only. No outcome,
reward, cost, tool-call, or verifier fields are ever used.
"""

from __future__ import annotations

import re


def supra_complexity_score(instruction: str) -> int:
    """In-process lightweight complexity heuristic (1-5 scale) without network calls."""
    text = instruction.lower()
    score = 1

    if any(k in text for k in ["compile", "build", "train", "pystan", "stan", "qemu", "install", "debug"]):
        score += 2
    if len(text) > 400 or text.count("\n") > 5:
        score += 1
    if any(k in text for k in ["file", "directory", "script", "code", "log"]):
        score += 1

    return min(5, score)


EXPLORATORY_KEYWORDS = [
    "compile", "build", "train", "model", "qemu", "stan", "pystan",
    "debug", "install", "test", "performance", "optimize",
]

INSPECTION_KEYWORDS = [
    "grep", "find", "locate", "check", "search", "read", "count",
    "config", "token", "query", "inspect", "list",
]


def structural_features(text: str) -> dict[str, int]:
    """Structural + keyword features for one instruction string."""
    lower = text.lower()
    return {
        "length": len(text),
        "line_count": text.count("\n") + 1,
        "supra_complexity": supra_complexity_score(text),
        "is_exploratory": int(bool(re.search(rf"\b({'|'.join(EXPLORATORY_KEYWORDS)})\b", lower))),
        "is_inspection": int(bool(re.search(rf"\b({'|'.join(INSPECTION_KEYWORDS)})\b", lower))),
        "kw_compile": int("compile" in lower),
        "kw_train": int("train" in lower or "training" in lower),
        "kw_model": int("model" in lower),
        "kw_build": int("build" in lower),
        "kw_debug": int("debug" in lower),
        "kw_install": int("install" in lower),
        "kw_config": int("config" in lower or "configuration" in lower),
        "kw_grep": int("grep" in lower or "search" in lower),
        "kw_count": int("count" in lower or "number of" in lower),
        "kw_file": int("file" in lower or "directory" in lower),
    }


STRUCTURAL_FEATURE_NAMES = sorted(structural_features("").keys())


def structural_feature_rows(texts: list[str]) -> list[list[float]]:
    names = STRUCTURAL_FEATURE_NAMES
    rows = []
    for t in texts:
        feat = structural_features(t)
        rows.append([float(feat[name]) for name in names])
    return rows
