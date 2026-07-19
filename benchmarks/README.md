# batched-queue benchmarks

This directory contains benchmark plans and result templates for demonstrating the specific value of `batch_queue` without overstating its scope.

The central hypothesis is:

> For short, dependent repository workflows, `batch_queue` reduces model/tool interaction turns while preserving action-level structure, shell state, failure boundaries, and final correctness.

This is intentionally narrower than a claim that `batch_queue` is faster for every workload. Independent actions should usually use parallel tool calls, and large durable DAGs should use a workflow/orchestration system.

## Benchmark plans

- [`DETERMINISTIC-PLAN.md`](./DETERMINISTIC-PLAN.md) — API-key-free executor and safety benchmark suitable for CI.
- [`MODEL-MEDIATED-PLAN.md`](./MODEL-MEDIATED-PLAN.md) — controlled Pi/OpenCode comparison using a fixed model and isolated fixtures.
- [`PI-HEADLESS-HANDOFF.md`](./PI-HEADLESS-HANDOFF.md) — executable handoff for measuring Pi JSON-mode sessions, token usage, latency, and correctness.
- [`harness/README.md`](./harness/README.md) — current executable commands,
  validated Azure configuration, and pre-external-benchmark checklist.
- [`RESULTS-TEMPLATE.md`](./RESULTS-TEMPLATE.md) — report template; do not fill it with unverified or cherry-picked results.

## Conditions to compare

1. Native sequential tools: one dependent action per model/tool turn.
2. `batch_queue` with explicit actions: the exact action sequence is supplied.
3. `batch_queue` with `objective`: the planner grounds and emits the action sequence.
4. Parallel native tools: only for independent-action control scenarios.
5. One monolithic shell script: optional lower-bound control; useful for showing what typed action structure and safety checks cost.

## Primary metrics

- model turns and tool calls;
- per-action model calls;
- wall-clock latency and p95 latency;
- input/output tokens and estimated cost;
- action/result bytes returned to the model;
- successful completion and final verification status;
- replans and retries;
- correct fast-fail behavior;
- shell cwd/environment persistence;
- final filesystem and test-result equivalence.

## Reporting rules

- Use fixed repository fixtures and deterministic checks.
- Randomize condition order to reduce warm-cache and provider drift effects.
- Run at least 20 repetitions per condition for model-mediated tests; report median and p95.
- Keep deterministic and provider-dependent results separate.
- Record raw JSONL data in an ignored results directory; commit only aggregate reports and reproducible configuration.
- Report failed runs and exclusions explicitly.
- Do not claim a speedup without accounting for objective-planning model calls.
- Do not compare `batch_queue` against parallel execution on a dependent workload as if they were interchangeable.
- The current H1–H24 suite is a controlled deterministic fixture suite, not
  Terminal-Bench 2.1 or SWE-bench. Use it for mechanism and provider
  validation; use a public benchmark for external capability claims.
