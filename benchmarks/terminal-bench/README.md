# Terminal-Bench 2.1 adapter

External validation uses Harbor 0.20.0, Pi 0.80.3, and the official 89-task
Terminal-Bench 2.1 repository pinned at commit
`36d417f56c293b8271b306a0e4c566f58e98c153`.

The primary comparison uses the same `BatchedQueuePi` agent and neutral task
instruction in both conditions. `condition=batch` adds only the pinned local
`batch_queue` extension; `condition=native` does not load it.

## No-cost validation

```bash
python3.12 -m venv .venv_harbor
.venv_harbor/bin/pip install -r benchmarks/terminal-bench/requirements.txt
bash benchmarks/terminal-bench/run.sh validate
```

Validation resolves these fixed pilot tasks without starting a container or
calling a model. To verify Pi and the extension install in a real container
without calling a model:

```bash
bash benchmarks/terminal-bench/run.sh install-check
```

The fixed pilot tasks are:

- `fix-git` — short Git recovery smoke task;
- `modernize-scientific-stack` — dependent code migration;
- `nginx-request-logging` — stateful system configuration.

## Paid smoke gate

The script refuses execution unless approval is explicit:

```bash
BQ_ALLOW_PAID_SMOKE=1 \
BQ_MODEL=azure-openai-responses/gpt-5.6-luna \
bash benchmarks/terminal-bench/run.sh smoke
```

This runs only `fix-git` under the batch-available condition. The gate limits
episode count, not provider USD; Pi exposes no enforceable per-session dollar
cap. Inspect Harbor's result and provider billing before authorizing the six
pilot episodes.

Harbor writes the smoke job under `benchmarks/results/terminal-bench/`. Pi
turn, tool, usage, and final-message events are retained; redundant streaming
`message_update` events are dropped. The official verifier reward is the source
of truth for pass/fail.

## Paired pilot

After the smoke gate passes, run the six seeded, sequential episodes:

```bash
BQ_ALLOW_PAID_PILOT=1 \
BQ_MAX_PILOT_COST_USD=2.00 \
BQ_MODEL=azure-openai-responses/gpt-5.6-luna \
bash benchmarks/terminal-bench/run.sh pilot
```

Seed 42 fixes condition order as:

```text
fix-git                    batch  native
modernize-scientific-stack batch  native
nginx-request-logging       native batch
```

The runner checks all three Docker image digests before spending, stops before
the next episode once the observed cost reaches the cap, and writes a JSON
summary beside the Harbor jobs. Re-summarize any job directory with:

```bash
bash benchmarks/terminal-bench/run.sh summarize <job-directory>
```

The completed pilot is summarized in [`PILOT_REPORT.md`](./PILOT_REPORT.md).

## Full paired run

The full runner freezes all 89 task IDs and seed-42 condition order in the run
directory, runs fresh Harbor containers sequentially, skips completed jobs when
resumed with the same directory, and stops before the next episode when observed
cost reaches the configured cap:

```bash
BQ_ALLOW_PAID_FULL=1 \
BQ_MAX_FULL_COST_USD=30.00 \
BQ_MODEL=azure-openai-responses/gpt-5.6-luna \
BQ_RUN_DIR=benchmarks/results/terminal-bench/full-frozen \
bash benchmarks/terminal-bench/run.sh full
```

Keep `BQ_RUN_DIR` unchanged to resume an interrupted run. The paired pilot cost
$0.569548; its linear full-suite projection is about $16.90, but the $30 stop
loss allows for harder tasks without silently spending past the gate.

After completion, compute task-level paired bootstrap intervals and the exact
McNemar test from the generated summary:

```bash
.venv_harbor/bin/python benchmarks/terminal-bench/analyze.py \
  "$BQ_RUN_DIR/summary.json"
```
