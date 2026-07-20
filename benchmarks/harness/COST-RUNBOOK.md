# Cost accounting runbook

## Cost buckets

Every episode reports these buckets independently:

1. `driver`: the outer Pi/OpenCode session model;
2. `planner`: objective-to-actions model calls, including grounding retries;
3. `execution`: deterministic queue execution, with zero model cost;
4. `total`: driver plus planner, with completeness metadata.

Do not infer planner usage from top-level Pi turns. Objective planner calls are
nested inside the `batch_queue` tool execution.

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

Planner details should include the model reference, whether it reused the
driver, call count, per-call usage, aggregate usage, and `costComplete`.
Aggregate reports must key subtotals by `(provider, model)`.

## Missing cost

Azure and other providers may expose tokens without a USD amount. Preserve the
tokens, set `costComplete=false`, and report a partial total rather than
inventing a price. Explicit-action conditions have no planner bucket.

## Validation

Use synthetic usage fixtures to test:

- multiple grounding and planner calls;
- missing cost on one call;
- driver and planner on different providers;
- explicit batches with zero planner calls;
- total-cost aggregation and per-provider subtotals.

Do not run paid provider validation as part of unit tests.
