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
    incomplete = {task: list(pair.keys()) for task, pair in pairs.items() if not ({"native", "batch"} <= pair.keys())}
    
    batch_only_tasks = sorted([task for task, pair in complete.items() if pair["batch"]["outcome"] == "pass" and pair["native"]["outcome"] != "pass"])
    native_only_tasks = sorted([task for task, pair in complete.items() if pair["native"]["outcome"] == "pass" and pair["batch"]["outcome"] != "pass"])
    both_pass_tasks = sorted([task for task, pair in complete.items() if pair["batch"]["outcome"] == "pass" and pair["native"]["outcome"] == "pass"])
    neither_pass_tasks = sorted([task for task, pair in complete.items() if pair["batch"]["outcome"] != "pass" and pair["native"]["outcome"] != "pass"])

    batch_queue_invocations = sum(1 for pair in complete.values() if pair["batch"].get("tools", {}).get("batch_queue", 0) > 0)
    adoption_rate = batch_queue_invocations / len(complete) if complete else 0.0

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

    oracle_ceiling = len(both_pass_tasks) + len(batch_only_tasks) + len(native_only_tasks)
    native_pass = sum(pair["native"]["outcome"] == "pass" for pair in complete.values())
    batch_pass = sum(pair["batch"]["outcome"] == "pass" for pair in complete.values())

    return {
        "totalTasksInSummary": len(pairs),
        "pairedTasks": len(complete),
        "incompleteTasks": incomplete,
        "queueAdoption": {
            "invokedEpisodes": batch_queue_invocations,
            "totalBatchAvailableEpisodes": len(complete),
            "adoptionRate": adoption_rate,
        },
        "success": {
            "nativePass": native_pass,
            "nativePassRate": native_pass / len(complete) if complete else 0,
            "batchPass": batch_pass,
            "batchPassRate": batch_pass / len(complete) if complete else 0,
            "oracleCeilingPass": oracle_ceiling,
            "oracleCeilingPassRate": oracle_ceiling / len(complete) if complete else 0,
            "nativeRegretVsOracle": (oracle_ceiling - native_pass) / len(complete) if complete else 0,
            "batchRegretVsOracle": (oracle_ceiling - batch_pass) / len(complete) if complete else 0,
            "batchOnly": len(batch_only_tasks),
            "nativeOnly": len(native_only_tasks),
            "bothPass": len(both_pass_tasks),
            "neitherPass": len(neither_pass_tasks),
            "mcnemarExactP": mcnemar_exact(len(batch_only_tasks), len(native_only_tasks)),
        },
        "discordantTasks": {
            "batchOnly": batch_only_tasks,
            "nativeOnly": native_only_tasks,
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
