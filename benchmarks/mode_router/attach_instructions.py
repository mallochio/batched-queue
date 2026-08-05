#!/usr/bin/env python3
"""Attach real Terminal-Bench instruction text into the discordance ledger."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from benchmarks.mode_router.instructions import load_instruction

LEDGER_PATH = Path(__file__).parents[1] / "terminal-bench" / "discordance_ledger.json"


def attach_instructions(ledger: dict) -> dict:
    tasks = ledger.get("tasks", {})
    attached = 0
    missing: list[str] = []
    for task_id, info in tasks.items():
        try:
            info["instruction"] = load_instruction(task_id)
            attached += 1
        except FileNotFoundError:
            missing.append(task_id)
    ledger["instructions_attached"] = attached
    ledger["instructions_missing"] = missing
    return ledger


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ledger", type=Path, default=LEDGER_PATH)
    parser.add_argument("--in-place", action="store_true", help="overwrite the ledger file with instruction text embedded")
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()

    ledger = json.loads(args.ledger.read_text(encoding="utf-8"))
    ledger = attach_instructions(ledger)

    out = args.out or (args.ledger if args.in_place else None)
    if out is not None:
        out.write_text(json.dumps(ledger, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"Attached {ledger['instructions_attached']} instructions; missing: {ledger['instructions_missing']}")
    if ledger["instructions_missing"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
