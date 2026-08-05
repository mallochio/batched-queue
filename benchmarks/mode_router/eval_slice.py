#!/usr/bin/env python3
"""Evaluate ModePolicy decisions and regret against the ground-truth discordance ledger on the 24-task stratified slice."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from benchmarks.mode_router.instructions import load_instruction
from benchmarks.mode_router.policy import ModePolicy

LEDGER_PATH = Path(__file__).parents[1] / "terminal-bench" / "discordance_ledger.json"


def select_stratified_slice(ledger_data: dict[str, Any]) -> list[str]:
    """Select 24 stratified tasks: all 21 discordant + 3 representative concordant tasks."""
    tasks = ledger_data.get("tasks", {})

    discordant = [t for t, info in tasks.items() if info["mode"] in ("batch_only", "native_only")]
    both_pass = [t for t, info in tasks.items() if info["mode"] == "both_pass"]
    neither_pass = [t for t, info in tasks.items() if info["mode"] == "neither_pass"]

    selected = sorted(discordant)
    # Add 2 both-pass and 1 neither-pass to reach 24 tasks
    if both_pass:
        selected.extend(both_pass[:2])
    if neither_pass:
        selected.extend(neither_pass[:1])

    return selected[:24]


def evaluate_policy_on_slice(
    strategy: str,
    slice_tasks: list[str],
    ledger_data: dict[str, Any],
    classifier_artifact: Path | None = None,
) -> dict[str, Any]:
    policy_kwargs = {"ledger_path": LEDGER_PATH}
    if classifier_artifact is not None:
        policy_kwargs["classifier_artifact"] = classifier_artifact
    policy = ModePolicy(strategy, **policy_kwargs)
    tasks_info = ledger_data.get("tasks", {})

    passed = 0
    total_cost = 0.0
    total_seconds = 0.0
    oracle_passed = 0

    decisions = []

    for task_id in slice_tasks:
        info = tasks_info.get(task_id, {})
        # Real instruction from the ledger (attached from instruction.md), falling back to the file loader
        instruction = info.get("instruction") or load_instruction(task_id)

        dec = policy.decide(task_id, instruction)
        chosen_mode = dec["mode"]

        # Calculate pass and cost for chosen mode from ledger
        mode_data = info.get(chosen_mode, {})
        is_pass = mode_data.get("outcome") == "pass"
        cost = mode_data.get("cost_usd") or 0.0
        sec = mode_data.get("seconds") or 0.0

        if is_pass:
            passed += 1
        total_cost += cost
        total_seconds += sec

        # Oracle mode
        oracle_mode = info.get("preferred_oracle_mode", "native")
        oracle_data = info.get(oracle_mode, {})
        if oracle_data.get("outcome") == "pass":
            oracle_passed += 1

        decisions.append({
            "task_id": task_id,
            "mode_chosen": chosen_mode,
            "is_pass": is_pass,
            "cost_usd": cost,
            "seconds": sec,
            "oracle_mode": oracle_mode,
            "features": dec.get("features", {}),
        })

    pass_rate = passed / len(slice_tasks) if slice_tasks else 0.0
    oracle_pass_rate = oracle_passed / len(slice_tasks) if slice_tasks else 0.0
    regret = oracle_pass_rate - pass_rate

    return {
        "strategy": strategy,
        "tasks_evaluated": len(slice_tasks),
        "passed": passed,
        "pass_rate": pass_rate,
        "oracle_passed": oracle_passed,
        "oracle_pass_rate": oracle_pass_rate,
        "regret_vs_oracle": regret,
        "total_cost_usd": total_cost,
        "total_seconds": total_seconds,
        "decisions": decisions,
    }


def compute_gap_closed(
    strategy_result: dict[str, Any],
    always_native_result: dict[str, Any],
) -> dict[str, Any]:
    """Fraction of the oracle-vs-native gap closed by the strategy."""
    oracle_gap = always_native_result["oracle_pass_rate"] - always_native_result["pass_rate"]
    strategy_gap = strategy_result["regret_vs_oracle"]
    always_native_gap = always_native_result["regret_vs_oracle"]
    closed = (always_native_gap - strategy_gap) / oracle_gap if oracle_gap > 0 else 0.0
    return {"oracle_gap": oracle_gap, "gap_closed": closed}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ledger", type=Path, default=LEDGER_PATH)
    parser.add_argument("--strategy", action="append", default=None,
                        help="strategies to evaluate (repeatable); default all static + heuristic + oracle")
    parser.add_argument("--json-out", type=Path, default=None)
    parser.add_argument("--classifier-artifact", type=Path, default=None)
    args = parser.parse_args()

    if not args.ledger.exists():
        print(f"Ledger file not found at {args.ledger}")
        return

    ledger_data = json.loads(args.ledger.read_text(encoding="utf-8"))
    slice_tasks = select_stratified_slice(ledger_data)
    strategies = args.strategy or ["always_native", "always_batch", "random", "heuristic", "oracle"]

    print("--- Stratified 24-Task Slice Evaluation ---")
    print(f"Selected {len(slice_tasks)} tasks for slice.")

    results: dict[str, Any] = {"slice_tasks": slice_tasks, "results": {}}
    always_native = None
    for strat in strategies:
        res = evaluate_policy_on_slice(strat, slice_tasks, ledger_data, classifier_artifact=args.classifier_artifact)
        results["results"][strat] = res
        if strat == "always_native":
            always_native = res

    for strat in strategies:
        res = results["results"][strat]
        line = (f"Strategy: {strat:15s} | Pass@1: {res['passed']}/{res['tasks_evaluated']} "
                f"({res['pass_rate']*100:.1f}%) | Regret vs Oracle: {res['regret_vs_oracle']*100:.1f}% | "
                f"Total Cost: ${res['total_cost_usd']:.2f}")
        if always_native is not None and strat != "always_native":
            gap = compute_gap_closed(res, always_native)
            results["results"][strat]["gap_closed"] = gap["gap_closed"]
            line += f" | gap_closed: {gap['gap_closed']*100:.1f}%"
        print(line)

    if args.json_out is not None:
        args.json_out.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"\nWrote JSON to {args.json_out}")


if __name__ == "__main__":
    main()
