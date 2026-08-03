#!/usr/bin/env python3
"""Summarize Harbor Terminal-Bench jobs without reading model prose."""

from __future__ import annotations

import argparse
import json
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any


def seconds(start: str | None, end: str | None) -> float | None:
    if not start or not end:
        return None
    return (datetime.fromisoformat(end.replace("Z", "+00:00")) - datetime.fromisoformat(start.replace("Z", "+00:00"))).total_seconds()


def summarize_trial(result_path: Path) -> dict[str, Any]:
    result = json.loads(result_path.read_text())
    tools: Counter[str] = Counter()
    batch_modes: Counter[str] = Counter()
    batch_actions = 0
    max_batch_actions = 0
    turns = 0
    events = result_path.parent / "agent" / "pi.txt"
    if events.exists():
        for line in events.read_text().splitlines():
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            if event.get("type") == "turn_start":
                turns += 1
            if event.get("type") == "tool_execution_start":
                name = str(event.get("toolName", "unknown"))
                tools[name] += 1
                if name == "batch_queue":
                    args = event.get("args") or {}
                    batch_modes["objective" if "objective" in args else "explicit"] += 1
                    requested = len(args.get("actions") or [])
                    batch_actions += requested
                    max_batch_actions = max(max_batch_actions, requested)

    reward = ((result.get("verifier_result") or {}).get("rewards") or {}).get("reward")
    exception = result.get("exception_info")
    outcome = "pass" if reward == 1 else "fail"
    if exception:
        kind = str(exception.get("exception_type", "invalid"))
        msg = str(exception.get("exception_message", ""))
        if "NonZeroAgentExitCodeError" in kind:
            outcome = "timeout" if ("exit 143" in msg or "exit 124" in msg) else ("pass" if reward == 1 else "fail")
        elif "Timeout" in kind:
            outcome = "timeout"
        elif "Api" in kind:
            outcome = "provider_error"
        else:
            outcome = "invalid"
    agent = result.get("agent_result") or {}
    timing = result.get("agent_execution") or {}
    return {
        "task": result.get("task_name", "").removeprefix("terminal-bench/"),
        "condition": (((result.get("config") or {}).get("agent") or {}).get("kwargs") or {}).get("condition"),
        "outcome": outcome,
        "reward": reward,
        "agentSeconds": seconds(timing.get("started_at"), timing.get("finished_at")),
        "turns": turns,
        "toolCalls": sum(tools.values()),
        "tools": dict(tools),
        "batchModes": dict(batch_modes),
        "batchActionsRequested": batch_actions,
        "maxBatchActions": max_batch_actions,
        "inputTokens": agent.get("n_input_tokens"),
        "cacheTokens": agent.get("n_cache_tokens"),
        "outputTokens": agent.get("n_output_tokens"),
        "costUsd": agent.get("cost_usd"),
        "exception": (exception or {}).get("exception_type"),
        "result": str(result_path),
    }


def find_trials(path: Path) -> list[Path]:
    return sorted(
        result for result in path.rglob("result.json")
        if (result.parent / "agent").is_dir() and "agent_result" in result.read_text()
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("path", type=Path)
    parser.add_argument("--cost-only", action="store_true")
    args = parser.parse_args()
    rows = [summarize_trial(path) for path in find_trials(args.path)]
    if args.cost_only:
        print(sum(row["costUsd"] or 0 for row in rows))
        return
    print(json.dumps({"runs": rows, "totalCostUsd": sum(row["costUsd"] or 0 for row in rows)}, indent=2))


if __name__ == "__main__":
    main()
