# Model-mediated benchmark plan

## Purpose

Measure whether `batch_queue` reduces model/tool interaction overhead on realistic dependent repository tasks while maintaining completion quality.

This benchmark is manual or nightly because it requires a configured Pi/OpenCode model provider and is affected by model, provider, cache, and network variance.

## Fixed task suite

Use isolated copies of the same small fixture repository for every run.

1. **Discover–inspect–verify:** locate a config loader, inspect the relevant lines, and run its focused check.
2. **Stateful shell:** change directory, set an environment variable, and use both in a later command.
3. **Bound result:** read a fixture value, bind it, and consume it in a later command.
4. **Failure boundary:** encounter a deliberate failing check and prove that a trailing mutation was not executed.
5. **Mutation–verify:** apply a targeted change and run a focused syntax/type/content check.
6. **Objective grounding:** ask for a repository-dependent read/check objective whose correct action sequence cannot be known from the prompt alone.
7. **Independent-action control:** perform unrelated searches where parallel tools are expected to be competitive or better.

Each task needs a deterministic completion predicate, such as a file digest, exact marker, test result, or expected structured report.

## Conditions

### A — Native sequential tools

The model uses ordinary `read`, `grep`, `find`, `ls`, and `bash` calls. Dependent actions must wait for the previous result.

### B — Explicit batch

The model receives the same task and uses `batch_queue` with an explicit action list. This isolates the execution advantage from objective planning.

### C — Objective batch

The model uses `batch_queue` with an objective. Record both the planning call and the resulting action execution. Do not attribute planner latency to the queue executor.

### D — Parallel control

Use only for scenario 7 or other genuinely independent actions. This prevents an unfair comparison where parallel execution violates dependencies.

### E — Monolithic shell control (optional)

Use one equivalent shell script. This establishes a raw execution lower bound, but it is not equivalent in typed validation, action visibility, or workspace safety.

## Instrumentation

Run each condition through the same Pi/OpenCode version, model, tool configuration, and fixture revision. Capture JSONL events or session logs containing:

```json
{
  "scenario": "discover-inspect-verify",
  "condition": "batch-explicit",
  "run": 1,
  "success": true,
  "elapsedMs": 0,
  "modelTurns": 0,
  "toolCalls": 0,
  "actions": 0,
  "perActionModelCalls": 0,
  "inputTokens": 0,
  "outputTokens": 0,
  "estimatedCostUsd": 0,
  "resultBytes": 0,
  "replans": 0,
  "verificationPassed": true,
  "haltReason": null
}
```

At minimum, collect:

- model request/turn count;
- tool-call count;
- action count;
- per-action model calls;
- elapsed wall time and p95;
- input/output tokens and cost where available;
- returned result bytes;
- successful completion and verification result;
- replan/retry count;
- number of actions correctly skipped after failure.

## Experimental controls

- Pin the model and reasoning settings.
- Use the same initial user prompt for all conditions.
- Randomize condition order.
- Run 20–30 repetitions per condition and scenario.
- Reset the fixture and session state between repetitions.
- Separate cold-cache and warm-cache runs.
- Record provider failures instead of silently dropping them.
- Use bootstrap confidence intervals or another documented comparison method.

## Hypotheses

The benchmark should test, not assume, these hypotheses:

1. Explicit batches require fewer model/tool turns than native sequential calls for dependent tasks.
2. Explicit batches reduce result/context overhead without reducing final correctness.
3. Objective batches add planning cost but can reduce manual action-selection effort.
4. Batch execution preserves state and failure boundaries better than a monolithic shell script.
5. Parallel native tools are preferable for independent work.
6. The advantage is largest for 3–10 short dependent actions and diminishes for one action or long-running commands.

## Recommended report

Report per-scenario medians and p95 values, followed by aggregate results:

```text
condition          median turns   median tool calls   success   median cost
native-sequential  ...             ...                 ...       ...
batch-explicit     ...             ...                 ...       ...
batch-objective    ...             ...                 ...       ...
parallel-control   ...             ...                 ...       ...
```

The final conclusion should describe the workload boundary, for example:

> `batch_queue` reduced interaction turns on short dependent repository tasks;
> parallel tools remained better for independent reads, and monolithic scripts
> remained a lower-level speed baseline but did not provide equivalent typed
> evidence or safety boundaries.
