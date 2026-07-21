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

Harbor writes the smoke job under `benchmarks/results/terminal-bench/`. Raw Pi
JSON events are retained as the agent log, and the official verifier reward is
the source of truth for pass/fail.
