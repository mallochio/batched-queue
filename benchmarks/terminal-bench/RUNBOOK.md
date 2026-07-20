# Terminal-Bench adapter runbook

This is the external validation path. The custom H1–H24 fixture suite must
never be reported as Terminal-Bench.

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
dataset version
task ids and split
adapter commit
Pi version
model/provider
timeout and concurrency
USD/session budget
```

The first external claim should use pass@1 task resolution and paired
confidence intervals. Efficiency metrics are secondary and must be reported
on jointly resolved tasks.
