# Pi benchmark harness

This harness measures the current `batched-queue` implementation in Pi JSON
event mode. It compares native sequential tools, explicit `batch_queue`
actions, and objective-planned batches on deterministic temporary fixtures.

## Prerequisites

- Run `bun install` from the repository root.
- Keep a provider credential in the environment. Validated providers include
  OpenAI, Azure OpenAI, Google Vertex, and Amazon Bedrock.
- Use `bun` to launch Pi. The Pi CLI's Node entrypoint is incompatible with
  the Node/undici version in some environments.
- Never print or commit credentials, service-account JSON, or raw transcripts.

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

## Azure validation

The validated Azure configuration keeps Luna as the driver and uses Grok as
the objective executor:

```bash
export AZURE_OPENAI_API_KEY="$AZURE_API_KEY"
export AZURE_OPENAI_RESOURCE_NAME="ih-foundry-resource"

bun benchmarks/harness/run.ts \
  --reps 2 \
  --driver-model gpt-5.6-luna \
  --provider azure-openai-responses \
  --thinking high \
  --executor-model azure-openai-responses/grok-4.3 \
  --executor-thinking high \
  --max-cost-usd 30 \
  --out benchmarks/results/azure-luna-grok
```

Objective mode accepts custom same-provider deployment ids. Custom Azure
executor clones disable reasoning because some deployments reject Pi's
`reasoning.encrypted_content` request field. The 24 scenarios in this run are
deterministic local fixtures, not Terminal-Bench or SWE-bench tasks.

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

## Before an external benchmark run

1. Replace wording-sensitive predicates with hidden filesystem/test oracles.
2. Add direct accounting for objective-planner requests and cost.
3. Pin Pi, provider, model deployments, thinking levels, timeout, queue commit,
   task revision, and container image.
4. Run a small Terminal-Bench subset first, then a held-out subset; keep task
   order paired and randomized across native and explicit-batch conditions.
5. Report pass@1, paired success deltas, turns, tool calls, total cost, p95
   latency, timeouts, and all provider failures. Treat the task—not each
   condition run—as the statistical unit.
