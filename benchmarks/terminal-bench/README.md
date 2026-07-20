# Terminal-Bench Core v0.1.1 adapter

Pinned dataset: `terminal-bench-core` version **0.1.1**.
Dataset file: [`dataset.jsonl`](./dataset.jsonl) — 80 task IDs.

## Usage

```bash
# Validate adapter parity (no model, no cost)
bun run benchmarks/terminal-bench/run.ts --validate

# Dry-run manifest (shows pinned tasks, no execution)
bun run benchmarks/terminal-bench/run.ts --dry-run
```

## Budget gate

The scaffold enforces `budgetUsdPerSession: 0` to prevent accidental
paid runs. To execute real Terminal-Bench tasks:

1. Install and configure the `terminal-bench` CLI (`pip install terminal-bench`).
2. Set `budgetUsdPerSession` to a non-zero value.
3. Record the required manifest fields per the [runbook](./RUNBOOK.md).

## Dataset

`dataset.jsonl` contains all 80 tasks from Terminal-Bench-Core v0.1.1.
Each line is a JSON object with `id`, `name`, `category`, and `version`.
The full task content (prompts, repositories, test scripts) is distributed
via the `terminal-bench` pip package.
