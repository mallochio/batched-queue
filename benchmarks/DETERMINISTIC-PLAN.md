# Deterministic executor benchmark plan

## Purpose

Measure the mechanics that do not require a model provider:

- one batch versus repeated single-action execution;
- persistent shell state;
- result bindings;
- fast-fail and timeout behavior;
- workspace and mutation safety;
- output compactness and final-state equivalence.

This benchmark must not be presented as an end-to-end model-cost benchmark.

## Fixture

Create a temporary repository for every run. It should contain:

```text
fixture/
├── README.md
├── src/config-loader.ts
├── src/feature.ts
├── tests/config-loader.test.ts
└── nested/state.txt
```

The fixture must be recreated or reset between repetitions. Avoid network access, random data, and commands whose duration depends on external services.

## Scenarios

### D1 — dependent inspection

```text
grep for the config loader
→ read the matching source range
→ run the focused test
```

Compare one `executeBatch` call with three one-action calls through the same runner.

### D2 — persistent shell state

```text
cd nested
→ export BQ_BENCHMARK=value
→ print the current directory and variable
```

Assert that the second and third actions observe state created by earlier actions.

### D3 — result binding

```text
read a fixture marker with bindTo: marker
→ pass ${marker} to a later command
```

Use a shell-safe fixture value and separately test that raw interpolation is documented rather than escaped automatically.

### D4 — fast-fail

```text
print a first marker
→ exit non-zero
→ attempt a trailing mutation
```

Assert that the trailing mutation did not execute, the halt index is correct, and the failure reason is reported.

### D5 — timeout recovery

Run a bounded sleep that exceeds the action timeout, then execute a recovery command in a new batch. Assert that the recovered runner remains usable.

### D6 — workspace and mutation safety

Attempt an out-of-workspace read and a rejected `apply_diff`, then assert that the action is blocked and no outside file or trailing mutation changes.

### D7 — apply and verify

Apply a targeted diff to the fixture and run a deterministic syntax or content check in the same batch. Compare the final file and check result against the expected state.

## Controls

- **Batched:** one runner and one `executeBatch` call containing all dependent actions.
- **Unbatched:** one runner and one `executeBatch` call per action, preserving the same cwd between calls.
- **Fresh shell:** a new shell process for each bash action, where applicable.
- **Monolithic script:** one shell command containing equivalent operations, clearly labeled as a lower-bound control rather than a competing typed-action implementation.

## Measurements

For each scenario and condition, record:

- total wall-clock milliseconds;
- action count;
- executor-call count;
- shell-process count if observable;
- output bytes and result bytes;
- success/failure and halt metadata;
- final filesystem digest;
- final shell cwd;
- test/check exit status.

Run at least 30 repetitions for stable local timing. Report median, p95, and the full sample count. Correctness assertions must fail the benchmark rather than silently excluding a run.

## Acceptance criteria

The benchmark is useful if it demonstrates, without a model:

1. batched and unbatched dependent scenarios produce equivalent expected results;
2. shell state persists within a batch;
3. bindings resolve only after their producer action;
4. failed actions prevent later actions from running;
5. workspace and diff validation boundaries remain enforced;
6. timeout recovery works as documented.

Performance results should be treated as environment-specific. The stronger product claim is the combination of fewer orchestration boundaries with preserved safety and observability.
