# Terminal-Bench adapter runbook

This is the external validation path. The custom H1–H24 fixture suite must
never be reported as Terminal-Bench.

## Adapter scaffold

- `benchmarks/terminal-bench/types.ts` — Terminal-Bench task and manifest types.
- `benchmarks/terminal-bench/adapter.ts` — native and explicit-batch Pi adapter
  factory plus parity checking.
- `benchmarks/terminal-bench/run.ts` — no-op CLI for validation and dry-run.
- `benchmarks/terminal-bench/adapter.test.ts` — parity and no-execution tests.

## Atomic stages

1. Pin the Terminal-Bench Core dataset version and commit a task list.
2. Implement parity-checked native and explicit-batch Pi adapters.
3. Verify both adapters expose identical tools except for `batch_queue`.
4. Run one no-cost configuration/pilot block.
5. Run the frozen held-out block only after the correctness gate passes.

## Required controls

- same task revision and container image;
- same model/provider, permissions, timeout, and Pi version;
- paired fresh containers per task and condition;
- randomized condition order;
- cold-cache headline results; warm-cache results reported separately;
- raw task outcomes retained, including provider errors and timeouts.

## Budget gate

Do not launch a paid run until the following are recorded in the manifest:

```text
terminal-bench version
adapter commit
Pi version
model/provider
timeout and concurrency
USD/session budget
```

The `run.ts` scaffold always reports `budgetUsdPerSession: 0` and `taskCount: 0`
until a dataset is explicitly provided. Use `--validate` and `--dry-run` to
confirm adapter parity without incurring cost.

## Validation

```bash
bun run benchmarks/terminal-bench/run.ts --validate
bun run benchmarks/terminal-bench/run.ts --dry-run
bun test benchmarks/terminal-bench/adapter.test.ts
```

The first external claim should use pass@1 task resolution and paired
confidence intervals. Efficiency metrics are secondary and must be reported
on jointly resolved tasks.
