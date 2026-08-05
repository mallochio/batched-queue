#!/usr/bin/env python3
"""Render the mode-router strategy comparison table as LaTeX from script output."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from benchmarks.mode_router.eval_slice import (
    LEDGER_PATH,
    compute_gap_closed,
    evaluate_policy_on_slice,
    select_stratified_slice,
)

DEFAULT_OUTPUT = Path(__file__).parents[2] / "paper" / "tables" / "mode_router.tex"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ledger", type=Path, default=LEDGER_PATH)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--classifier-artifact", type=Path, default=None)
    args = parser.parse_args()

    if not args.ledger.exists():
        raise SystemExit(f"Ledger not found: {args.ledger}")

    ledger = json.loads(args.ledger.read_text(encoding="utf-8"))
    slice_tasks = select_stratified_slice(ledger)

    strategies = ["always_native", "always_batch", "random", "heuristic", "classifier", "oracle"]
    results = {}
    always_native = None
    for strat in strategies:
        res = evaluate_policy_on_slice(strat, slice_tasks, ledger, classifier_artifact=args.classifier_artifact)
        results[strat] = res
        if strat == "always_native":
            always_native = res

    lines = [
        r"\begin{tabular}{lcccc}",
        r"\toprule",
        r"\textbf{Policy Strategy} & \textbf{Resolved Tasks} & \textbf{Pass@1 (\%)} & \textbf{Regret vs Oracle} & \textbf{Total Cost (\$)} \\",
        r"\midrule",
    ]
    for strat in strategies:
        r = results[strat]
        pass_str = f"${r['passed']}/{r['tasks_evaluated']}$"
        pass_rate = f"{r['pass_rate']*100:.1f}\\%"
        regret = f"{r['regret_vs_oracle']*100:.1f}\\%"
        cost = f"\\${r['total_cost_usd']:.2f}"
        bold = strat == "classifier"
        if bold:
            lines.append(f"\\textbf{{{strat.replace('_', ' ')}}} & {pass_str} & {pass_rate} & {regret} & {cost} \\\\")
        else:
            lines.append(f"{strat.replace('_', ' ')} & {pass_str} & {pass_rate} & {regret} & {cost} \\\\")
    lines.append(r"\bottomrule")
    lines.append(r"\end{tabular}")

    body = "\n".join(lines) + "\n"
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(body, encoding="utf-8")
    print(f"Wrote mode-router table to {args.output}")


if __name__ == "__main__":
    main()
