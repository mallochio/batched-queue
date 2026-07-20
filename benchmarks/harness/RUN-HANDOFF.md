# Model-mediated benchmark handoff

Run the batch_queue model-mediated benchmark: 24 scenarios × 3 conditions × 20+ reps.

## Prerequisites

```bash
# From repo root
bun install
command -v pi           # Pi CLI installed (bun install does this)
echo "$OPENAI_API_KEY"  # or Azure/GCP/Bedrock key
```

## Quick start: pilot (3 reps, 4 scenarios, ~$0.50)

Validate the harness, auth, and invocation before the main run:

```bash
bash benchmarks/harness/handoff.sh pilot
```

This runs H1,H2,H3,H4 × native,batch-explicit,batch-objective × 3 reps.

## Main run (20 reps, 24 scenarios, ~$40-100)

```bash
bash benchmarks/harness/handoff.sh main
```

## Tested providers

| Provider | Driver model | Executor model | Cost/rep |
| --- | --- | --- | --- |
| OpenAI | `gpt-5.4-mini` | `openai/gpt-5.4-nano` | ~$0.02-0.05 |
| Azure (Luna+Grok) | `gpt-5.6-luna` | `azure-openai/grok-4.3` | ~$0.03-0.08 |

## Output

Results land in `benchmarks/results/<date>-<model>/` (gitignored).
After a run completes, aggregate:

```bash
bun benchmarks/harness/aggregate.ts benchmarks/results/<outdir>
```

This writes `REPORT.md` and `aggregate.json` in the results directory.

## Budget gate

The runner stops when cumulative observed cost reaches `--max-cost-usd`.
Default: $30. Every run is persisted to `runs.json` immediately, so you can
interrupt and resume by inspecting which runs are missing.

## Resume after interruption

```bash
# Find the last completed run tag:
ls benchmarks/results/<outdir>/*.summary.json | sort | tail -3

# Restart with the same command; the runner re-runs completed tags
# (they'll just be overwritten). To avoid re-running, move the outdir.
```
