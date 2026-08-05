#!/usr/bin/env python3
"""Export discordance ledger JSON with per-task outcomes, tool usage, adoption, and metrics."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def export_ledger(summary: dict[str, Any]) -> dict[str, Any]:
    pairs: dict[str, dict[str, dict[str, Any]]] = {}
    for row in summary["runs"]:
        pairs.setdefault(row["task"], {})[row["condition"]] = row

    complete = {task: pair for task, pair in pairs.items() if {"native", "batch"} <= pair.keys()}
    incomplete = {task: list(pair.keys()) for task, pair in pairs.items() if not ({"native", "batch"} <= pair.keys())}

    ledger_tasks = {}
    for task_id, pair in sorted(complete.items()):
        batch = pair["batch"]
        native = pair["native"]
        b_pass = batch["outcome"] == "pass"
        n_pass = native["outcome"] == "pass"

        if b_pass and n_pass:
            mode = "both_pass"
        elif b_pass and not n_pass:
            mode = "batch_only"
        elif not b_pass and n_pass:
            mode = "native_only"
        else:
            mode = "neither_pass"

        batch_queue_calls = batch.get("tools", {}).get("batch_queue", 0)

        ledger_tasks[task_id] = {
            "task_id": task_id,
            "mode": mode,
            "preferred_oracle_mode": "batch" if b_pass else ("native" if n_pass else "native"),
            "batch": {
                "outcome": batch["outcome"],
                "reward": batch.get("reward"),
                "seconds": batch.get("agentSeconds"),
                "turns": batch.get("turns"),
                "tool_calls": batch.get("toolCalls"),
                "batch_queue_calls": batch_queue_calls,
                "used_queue": batch_queue_calls > 0,
                "cost_usd": batch.get("costUsd"),
            },
            "native": {
                "outcome": native["outcome"],
                "reward": native.get("reward"),
                "seconds": native.get("agentSeconds"),
                "turns": native.get("turns"),
                "tool_calls": native.get("toolCalls"),
                "cost_usd": native.get("costUsd"),
            },
        }

    return {
        "summary_metadata": {
            "total_tasks_in_summary": len(pairs),
            "paired_tasks": len(complete),
            "incomplete_tasks": incomplete,
        },
        "tasks": ledger_tasks,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("summary", type=Path)
    parser.add_argument("--output", "-o", type=Path, default=Path("benchmarks/terminal-bench/discordance_ledger.json"))
    args = parser.parse_args()

    summary_data = json.loads(args.summary.read_text())
    ledger = export_ledger(summary_data)
    args.output.write_text(json.dumps(ledger, indent=2) + "\n")
    print(f"Wrote discordance ledger ({len(ledger['tasks'])} tasks) to {args.output}")


if __name__ == "__main__":
    main()
