# Pi benchmark harness

This harness measures the current `batched-queue` implementation in Pi JSON
event mode. It compares native sequential tools, explicit `batch_queue`
actions, and objective-planned batches on deterministic temporary fixtures.

## Prerequisites

- Run `bun install` from the repository root.
- Keep a provider credential in the environment (`OPENAI_API_KEY` for the
  default OpenAI examples).
- Use `bun` to launch Pi. The Pi CLI's Node entrypoint is incompatible with
  the Node/undici version in some environments.

## Pilot

Run three repetitions per scenario and condition while validating the harness:

```bash
bun benchmarks/harness/run.ts \
  --scenarios H1,H2,H3,H4 \
  --conditions native,batch-explicit,batch-objective \
  --reps 3 \
  --driver-model gpt-5.4-mini \
  --executor-model openai/gpt-5.4-nano \
  --provider openai \
  --thinking low \
  --out benchmarks/results/pilot

bun benchmarks/harness/aggregate.ts benchmarks/results/pilot
```

The runner randomizes condition order, creates a fresh fixture for every run,
stores raw JSONL/stderr/summary artifacts, and writes `manifest.json` and
`runs.json`. Results are ignored by Git; do not commit transcripts or
credentials.

## Main run

Use at least 20 repetitions per condition/scenario, randomize order, and
separate cold-cache and warm-cache runs. Pin the model, provider, thinking
level, Pi version, and queue commit. The report includes:

- model turns and tool calls;
- effective actions and action compression;
- input/output/cache tokens and estimated cost;
- result bytes and latency median/p95;
- completion-predicate success;
- batch counts and fast-fail metadata.

The result is an interaction-efficiency benchmark, not a general measure of
model intelligence. Compare objective-planner cost separately from the driver
and queue execution cost.
