# Controlled fixture harness (H1–H24)

Pi headless benchmark for short dependent repository workflows. Each episode
uses a fresh deterministic fixture, one condition, and fixture-owned
verification. This is a **mechanism study**, not an external capability
benchmark.

For publication status and what these numbers may claim, see
[`../PUBLICATION_READINESS.md`](../PUBLICATION_READINESS.md).

## Conditions

| Id | Meaning |
| --- | --- |
| `native` | Native Pi tools; one dependent action per model/tool turn |
| `batch-explicit` | Driver submits an explicit `batch_queue` action list |
| `batch-objective` | Objective planner emits the action list (planner cost counted separately) |

Optional controls (when enabled in a run): parallel native tools for independent
reads, and monolithic shell as a lower-level speed reference.

## What is recorded

Per episode: verification / outcome, model turns, tool calls, completed actions,
action compression, driver and planner tokens/cost, latency, result bytes,
batch halt metadata, and retries.

## Requirements

- Bun and local `pi` from `node_modules/.bin/pi` (via `bun install`)
- Provider credentials for the configured driver / executor models
- `bash` and `rg` on `PATH`

## Run

Preferred handoff wrapper:

```bash
bun run bench:model-mediated
# or
bash benchmarks/harness/handoff.sh
```

Direct runner:

```bash
bun benchmarks/harness/run.ts \
  --scenarios H1,H2,H3 \
  --conditions native,batch-explicit,batch-objective \
  --reps 3 \
  --driver-model gpt-5.4-mini \
  --provider openai \
  --thinking low \
  --max-cost-usd 5
```

Useful flags:

| Flag | Default | Notes |
| --- | --- | --- |
| `--scenarios` | all H1–H24 | Comma-separated ids |
| `--conditions` | all three | Restrict for cheaper pilots |
| `--reps` | `3` | Per scenario × condition |
| `--executor-model` | env / nano default | Use `none` to disable objective executor |
| `--max-cost-usd` | `30` | Soft stop before the next episode |
| `--out` | `benchmarks/results/<date>-<model>/` | Manifest + JSONL land here |

Aggregate a finished result directory:

```bash
bun benchmarks/harness/aggregate.ts <result-dir>
```

## Validity notes (do not ignore)

The archived Phase 2 1,440-episode cloud aggregates are **not** cleaned
publication evidence. Known issues still relevant to citing H1–H24:

1. H8 / H10 reverify commands `cd nested` then invoke `bash scripts/check.sh`
   with a nested-relative path.
2. H21 oracle asks for both `fail` and `nonzero` while the task predicate
   accepts either.
3. Headline aggregation still uses `verificationPassed`; prefer
   `outcome === "pass"` so timeouts cannot count as successes.
4. `.bench/proof/` artifacts are written inside the fixture and may be
   agent-visible.
5. Related scenarios share one fixture family; do not treat repeated episodes
   as independent tasks for significance tests.

Repair those items, then regression-rerun H8/H10/H21 plus a small sample. Do
not spend another full 1,440-episode cloud run until the external Terminal-Bench
result is frozen.

## Related

- Deterministic model-free checks: [`../deterministic/run.ts`](../deterministic/run.ts)
- External Terminal-Bench adapter: [`../terminal-bench/README.md`](../terminal-bench/README.md)
- Research history: [`../RESEARCH_RUNBOOK.md`](../RESEARCH_RUNBOOK.md)
