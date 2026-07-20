# Cost accounting runbook

## Cost buckets

Every episode reports these buckets independently:

1. `driver`: the outer Pi/OpenCode session model;
2. `planner`: objective-to-actions model calls, including grounding retries;
3. `execution`: deterministic queue execution, with zero model cost;
4. `total`: driver plus planner, with completeness metadata.

Do not infer planner usage from top-level Pi turns. Objective planner calls are
nested inside the `batch_queue` tool execution.

## Instrumentation

- `src/planner-usage.ts` defines a normalized `PlannerUsage` shape and an
  accumulator that sums across multiple planner calls.
- `src/analyzer.ts` (`analyzeBatchObjective` / `planBatchWithGrounding`) forwards
  the underlying Pi `complete()` `usage` into the accumulator and returns
  `{ payload, plannerUsage }`.
- `src/execute-batch-queue.ts` passes the planner usage through the execute
  result.
- `src/extension.ts` includes `plannerUsage` in the `batch_queue` tool result
  `details`.
- `src/opencode/analyzer.ts` captures `data.info.usage` when OpenCode exposes it.
- `benchmarks/harness/parse-events.ts` extracts `details.plannerUsage` from each
  `batch_queue` `tool_execution_end` event and aggregates across replans.
- `benchmarks/harness/aggregate.ts` reports driver, planner, and total cost
  columns, and only marks cost complete when every bucket reports a non-zero
  cost or has zero tokens.

## Required fields

Usage records should preserve raw provider data and normalize:

```ts
type ModelUsage = {
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  costUsd?: number;
  raw?: unknown;
};
```

Planner details include the model reference, call count, aggregate usage, and
`costComplete`. Aggregate reports key subtotals by `(provider, model)`.

## Missing cost

Azure and other providers may expose tokens without a USD amount. Preserve the
tokens, set `costComplete=false`, and report a partial total rather than
inventing a price. Explicit-action conditions have no planner bucket.

## Validation

Synthetic usage fixtures test:

- multiple `batch_queue` planner calls;
- missing cost when tokens are present;
- explicit batches with zero planner calls;
- `costComplete` propagation into `RunSummary`.

Run:

```bash
bun test benchmarks/harness/cost-accounting.test.ts
bun test tests/planner-usage.test.ts
```

Do not run paid provider validation as part of unit tests.
