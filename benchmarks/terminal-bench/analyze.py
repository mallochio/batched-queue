#!/usr/bin/env python3
"""Paired task-level analysis for Terminal-Bench summaries."""

from __future__ import annotations

import argparse
import json
import math
import random
import statistics
from pathlib import Path
from typing import Any


def percentile(values: list[float], q: float) -> float:
    values = sorted(values)
    return values[round((len(values) - 1) * q)]


def bootstrap_ci(values: list[float], seed: int = 42, samples: int = 10_000) -> list[float]:
    if not values:
        return [0.0, 0.0]
    rng = random.Random(seed)
    means = [statistics.fmean(rng.choice(values) for _ in values) for _ in range(samples)]
    return [percentile(means, 0.025), percentile(means, 0.975)]


def mcnemar_exact(batch_only: int, native_only: int) -> float:
    discordant = batch_only + native_only
    if discordant == 0:
        return 1.0
    tail = sum(math.comb(discordant, i) for i in range(min(batch_only, native_only) + 1)) / 2**discordant
    return min(1.0, 2 * tail)


def analyze(summary: dict[str, Any]) -> dict[str, Any]:
    pairs: dict[str, dict[str, dict[str, Any]]] = {}
    for row in summary["runs"]:
        pairs.setdefault(row["task"], {})[row["condition"]] = row
    complete = {task: pair for task, pair in pairs.items() if {"native", "batch"} <= pair.keys()}
    batch_only = sum(pair["batch"]["outcome"] == "pass" and pair["native"]["outcome"] != "pass" for pair in complete.values())
    native_only = sum(pair["native"]["outcome"] == "pass" and pair["batch"]["outcome"] != "pass" for pair in complete.values())

    metrics: dict[str, Any] = {}
    extractors = {
        "agentSeconds": lambda row: row["agentSeconds"],
        "turns": lambda row: row["turns"],
        "toolCalls": lambda row: row["toolCalls"],
        "tokens": lambda row: (row["inputTokens"] or 0) + (row["outputTokens"] or 0),
        "costUsd": lambda row: row["costUsd"] or 0,
    }
    for name, get in extractors.items():
        deltas = [get(pair["batch"]) - get(pair["native"]) for pair in complete.values()]
        metrics[name] = {
            "meanBatchMinusNative": statistics.fmean(deltas) if deltas else 0,
            "medianBatchMinusNative": statistics.median(deltas) if deltas else 0,
            "bootstrap95Ci": bootstrap_ci(deltas),
        }

    return {
        "pairedTasks": len(complete),
        "success": {
            "batch": sum(pair["batch"]["outcome"] == "pass" for pair in complete.values()),
            "native": sum(pair["native"]["outcome"] == "pass" for pair in complete.values()),
            "batchOnly": batch_only,
            "nativeOnly": native_only,
            "mcnemarExactP": mcnemar_exact(batch_only, native_only),
        },
        "metrics": metrics,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("summary", type=Path)
    args = parser.parse_args()
    print(json.dumps(analyze(json.loads(args.summary.read_text())), indent=2))


if __name__ == "__main__":
    main()
