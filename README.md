# batched-queue

## Plan once. Execute a verified action pipeline. Replan from evidence.

`batched-queue` is a low-latency tool for [Pi](https://github.com/earendil-works/pi) and [OpenCode](https://opencode.ai) coding-agent sessions. It executes up to N short, dependent repository actions in one tool call, preserving shell state and returning structured evidence for the next planning decision.

Instead of forcing the model to stop after every observation, a session can submit a small typed pipeline:

```text
discover → inspect → verify
```

The queue executes `read_lines`, `grep_pattern`, `execute_bash`, and `apply_diff` actions sequentially with fast-fail semantics, workspace boundaries, optional result bindings, and no additional model calls during action execution.

### The middle ground between one tool call and a workflow engine

| Need | Best fit |
| --- | --- |
| One obvious read, search, or command | Native Pi/OpenCode tools |
| Independent reads or searches | Parallel tool calls |
| 2–10 dependent repository actions | `batch_queue` |
| Large DAGs, fan-out, worktrees, or durable jobs | A workflow/orchestration system |

`batch_queue` is intentionally small: it is not a replacement for a multi-agent workflow engine. Its purpose is to compress short dependent tool sequences without hiding action boundaries or failure evidence.

## Project layout

```
batched-queue/
├── README.md
├── package.json
├── pyproject.toml        # uv-managed Harbor / Terminal-Bench tooling
├── src/                  # extension and library source
│   ├── extension.ts      # Pi extension entry point
│   ├── opencode/         # OpenCode plugin adapter
│   ├── index.ts          # public API barrel export
│   ├── executors/        # action executors
│   ├── diff-validation/  # diff matching and syntax checks
│   └── lib/              # shared utilities
├── benchmarks/           # research harnesses, adapters, and publication docs
│   ├── harness/          # H1–H24 controlled fixture suite
│   ├── deterministic/    # model-free executor mechanics (D1–D7)
│   ├── terminal-bench/   # Terminal-Bench 2.1 Harbor adapter
│   └── results/          # local run artifacts (gitignored)
├── .opencode/            # OpenCode plugin entry + install docs
├── .pi/                  # Pi config example
├── tests/                # unit, integration, and smoke tests
└── scripts/
    ├── install.sh        # Pi install helper
    └── install-opencode.sh
```

Research and publication docs live under [`benchmarks/`](./benchmarks/):

| Doc | Role |
| --- | --- |
| [`benchmarks/README.md`](./benchmarks/README.md) | Benchmark index and current status |
| [`benchmarks/PUBLICATION_READINESS.md`](./benchmarks/PUBLICATION_READINESS.md) | Evidence audit, claim ladder, submission gates |
| [`benchmarks/PAPER_OUTLINE.md`](./benchmarks/PAPER_OUTLINE.md) | Workshop / short-paper outline |
| [`benchmarks/RESEARCH_RUNBOOK.md`](./benchmarks/RESEARCH_RUNBOOK.md) | Experiment history and execution plan |
| [`benchmarks/harness/README.md`](./benchmarks/harness/README.md) | Controlled H1–H24 protocol |
| [`benchmarks/terminal-bench/README.md`](./benchmarks/terminal-bench/README.md) | External Terminal-Bench 2.1 adapter |

## Requirements

- [Pi coding agent](https://www.npmjs.com/package/@earendil-works/pi-coding-agent) on your `PATH`
- [Bun](https://bun.sh) preferred, or Node/npm for dependency install
- `bash` and `rg` on `PATH`

## Install

Install directly from GitHub:

```bash
pi install https://github.com/mallochio/batched-queue
```

Project-local install:

```bash
pi install -l https://github.com/mallochio/batched-queue
```

Pi stores the package under `packages` in settings, so you do not need a separate `extensions` entry.

## OpenCode install

Use OpenCode's plugin installer:

```bash
opencode plugin "batched-queue@git+https://github.com/mallochio/batched-queue.git" -g
```

Or add the same package spec to `~/.config/opencode/opencode.json` (or project `opencode.json`):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "batched-queue@git+https://github.com/mallochio/batched-queue.git"
  ]
}
```

Restart OpenCode. Do not use the bare GitHub URL (`https://github.com/mallochio/batched-queue`) as a plugin entry. See [.opencode/INSTALL.md](.opencode/INSTALL.md) for local dev, config, and troubleshooting.

Or use the helper script:

```bash
chmod +x scripts/install-opencode.sh
./scripts/install-opencode.sh
```

OpenCode configuration uses `.opencode/batched-queue.json` and `package.json` → `opencode.batchQueue`. The session driver / planner model is inherited from your OpenCode session; only an optional cheap execution model needs configuration.

## Local development

```bash
bun install
bun test
bun run typecheck
```

Python benchmark tooling uses the single root environment managed by `uv`:

```bash
uv sync
uv run python benchmarks/terminal_bench_agent.py
bash benchmarks/terminal-bench/run.sh validate
```

The Python version is pinned to 3.12 for the Harbor benchmark dependency. Do
not create a separate benchmark virtual environment; use `uv run` or the
repository's `.venv/bin` entry points.

You can also load it without installing:

```bash
pi -e ./src/extension.ts
```

Or use the helper script:

```bash
chmod +x scripts/install.sh
./scripts/install.sh
```

## Configuration

Settings are merged in this order (highest priority wins):

1. Extension factory overrides (code)
2. Environment variables
3. Project `.pi/batched-queue.json`
4. `package.json` → `pi.batchQueue` (package defaults)

### JSON config

Project-local config in `.pi/batched-queue.json`:

```json
{
  "executionModel": "openai/gpt-5.4-nano",
  "executorThinking": "high",
  "groundingTurns": 3,
  "requirePlanReflection": true,
  "maxBatchActions": 10,
  "allowObjectiveMutations": false
}
```

`executionModel` (alias: `executorModel`) accepts either `provider/model` shorthand or `{ "provider": "...", "id": "..." }`. When unset, objective batches use your session driver / planner model. `executorThinking` is optional (`minimal`, `low`, `medium`, `high`, `xhigh`) and is forwarded best-effort as Pi `reasoningEffort` or OpenCode prompt `variant`. `groundingTurns` (default `3`) lets the objective planner read/grep the real repo before it plans; set `0` to plan blind in one shot (Pi objective mode only). `requirePlanReflection` (default `true`) asks objective planners to attach structured confidence, success criteria, risks, and fallback metadata to submitted batches.

Package defaults can live in `package.json`:

```json
{
  "pi": {
    "batchQueue": {
      "executionModel": "openai/gpt-5.4-nano",
      "maxBatchActions": 10,
      "allowObjectiveMutations": false
    }
  }
}
```

Copy `.pi/batched-queue.json.example` to `.pi/batched-queue.json` to get started.

### Environment variables

Optional environment variables:

- `BATCH_QUEUE_MAX_ACTIONS`: max actions per batch, default `10`
- `BATCH_QUEUE_EXECUTOR`: cheap execution model as `provider/model` for objective batches
- `BATCH_QUEUE_EXECUTOR_PROVIDER`: execution model provider when set separately
- `BATCH_QUEUE_EXECUTOR_MODEL`: execution model id when set separately
- `BATCH_QUEUE_EXECUTOR_THINKING`: optional reasoning/thinking effort (`minimal`, `low`, `medium`, `high`, `xhigh`)
- `BATCH_QUEUE_GROUNDING_TURNS`: read/grep grounding turns before the planner must submit, default `3` (`0` = plan blind)
- `BATCH_QUEUE_REQUIRE_PLAN_REFLECTION`: set to `false` to stop asking objective planners for confidence/risk reflection metadata
- `BATCH_QUEUE_ALLOW_OBJECTIVE_MUTATIONS`: set to `true` to let objective-planned batches include `apply_diff`

The planner / driver model is always your main session model. An optional cheap execution model converts `objective` inputs into action batches; when unset, the session driver plans. Prefer explicit `actions` from the driver for edits. Objective-planned batches are read/check-only by default.

Example:

```bash
export BATCH_QUEUE_EXECUTOR=openai/gpt-5.4-nano
pi --provider openai --model gpt-5.4-mini
```

The driver (`gpt-5.4-mini`) replans; the optional execution model (`nano`) can handle objective→actions conversion when configured.

## Tool usage

The `batch_queue` tool accepts either:

- `actions`: a pre-planned batch from the session driver / planner (preferred)
- `objective`: the session driver plans by default, or a configured cheap execution model when set

RGB-style workflow: plan a batch, execute with no additional model call per action, read the `next steps` hints, then replan if needed.

For coding sessions, prefer `batch_queue` for small sequential inspect/search/check loops instead of making multiple individual tool calls.

Use it when you need up to 10 low-risk sequential repo actions:

- inspect files
- search symbols or text
- run small shell checks
- apply a targeted diff
- verify a local change

Actions can form a typed mini-pipeline. Add `bindTo` to any action to name its result, then reference that raw text in later string fields as `${name}`. This is most useful for objective-planned batches where a read/grep result determines a follow-up command. Quote interpolated values carefully in shell commands; substitution is raw text, not shell escaping.

Use `actions` when you already know the exact deterministic steps, especially for `apply_diff`. Use `objective` only when enumerating steps is tedious.

### Quick examples

Use `objective` for dependent read/check workflows where the planner should decide the exact safe steps:

```json
{
  "objective": "Find the config loader, read the relevant code, and run the smallest local check that verifies it still works."
}
```

Use explicit `actions` when the steps are already known or when applying a mutation:

```json
{
  "actions": [
    { "type": "read_lines", "path": "src/config.ts", "startLine": 1, "endLine": 120 },
    { "type": "execute_bash", "command": "npm test -- config" }
  ]
}
```

Use `bindTo` when a later action needs an earlier observation:

```json
{
  "actions": [
    { "type": "read_lines", "path": "README.md", "startLine": 1, "endLine": 1, "bindTo": "title" },
    { "type": "execute_bash", "command": "printf '%s' '${title}'" }
  ]
}
```

Do **not** use `batch_queue` for a single obvious read/search/command, independent parallel reads/searches, destructive commands, long-running commands, interactive commands, or anything that needs user approval. Prefer `multi_tool_use.parallel` instead for independent parallel reads/searches. File actions are workspace-scoped unless configured otherwise.

## Benchmark status

`batch_queue` is evaluated as a **bounded interface change**, not as a claim
that the underlying model became smarter. Current evidence supports interaction
compression on short dependent fixture workflows; it does **not** yet support a
general Terminal-Bench reliability or efficiency win. See
[`benchmarks/PUBLICATION_READINESS.md`](./benchmarks/PUBLICATION_READINESS.md)
for the full audit and submission gates.

### Controlled fixture suite (directional)

The Pi harness under [`benchmarks/harness/`](./benchmarks/harness/) compares
native sequential tools, explicit `batch_queue` actions, and objective-planned
batches on fresh deterministic fixtures. It records verification, model turns,
tool calls, actions, tokens, cost, latency, result bytes, retries, and
fast-fail metadata.

The initial Luna study used 24 tasks, two observations per task/condition,
`gpt-5.6-luna` at Pi `xhigh`, and `gpt-5.4-mini` at high for objective
planning ($6.05 reported API usage across 144 episodes):

| condition | verified success | median tool calls |
| --- | ---: | ---: |
| native sequential | 72.9% | 2.5 |
| explicit `batch_queue` | 83.3% | 1.0 |
| objective `batch_queue` | 64.6% | 2.5 |

A follow-up Azure provider check on the same 24-task suite (`gpt-5.6-luna`
driver, Azure `grok-4.3` objective executor) was directionally similar:

| condition | verified success | median tool calls | median cost |
| --- | ---: | ---: | ---: |
| native sequential | 71% | 2 | $0.0131 |
| explicit `batch_queue` | 83% | 1 | $0.0132 |
| objective `batch_queue` | 77% | 1 | $0.0099 |

These are pilot-scale and custom-fixture results. A larger Phase 2 cloud run
(1,440 episodes) remains archived for provenance only: known oracle and
aggregation defects mean those aggregates are **not** publication-ready. Repair
and regression-rerun instructions are in the research runbook.

### Terminal-Bench 2.1 (external)

The Harbor adapter under [`benchmarks/terminal-bench/`](./benchmarks/terminal-bench/)
pins Terminal-Bench 2.1 (89 tasks), Harbor `0.20.0`, and Pi `0.80.3`. The
primary comparison is neutral tool availability: native tools alone versus the
same authority with `batch_queue` available.

- **Pilot (complete):** 3 tasks × 2 conditions, all official-verifier passes,
  ~$0.57. Queue adoption on 2/3 batch episodes. See
  [`benchmarks/terminal-bench/PILOT_REPORT.md`](./benchmarks/terminal-bench/PILOT_REPORT.md).
- **Full paired run (incomplete):** 45 of 89 task pairs reported so far show
  batch 29/45 vs native 32/45 (McNemar p≈0.55), with higher median latency,
  turns, tool calls, tokens, and cost for batch. This prefix is **not** a
  completed Terminal-Bench evaluation. Finish all 89 pairs before citing an
  external result.

Raw job artifacts under `benchmarks/results/` are gitignored and must be
archived separately for reproducibility.

### How to run

```bash
# Model-free executor mechanics
bun run bench:deterministic

# Controlled fixture harness (requires provider credentials)
bun run bench:model-mediated

# Terminal-Bench adapter validation (no containers / no model spend)
uv sync
bash benchmarks/terminal-bench/run.sh validate
```

Workshop draft outline:
[`benchmarks/PAPER_OUTLINE.md`](./benchmarks/PAPER_OUTLINE.md).

## Research inspirations

The **primary architectural inspiration** for `batch_queue` is [**RGB-Agent / Read-Grep-Bash Agent**](https://github.com/alexisfox7/RGB-Agent), an agent for [ARC-AGI-3](https://three.arcprize.org/). Its README reports completing all three preview games in **1,069 actions**, described there as the **lowest publicly reported count**. This is a public result reported by the project, not a claim that it won an official global leaderboard.

RGB-Agent’s core pattern is the one `batch_queue` generalizes for coding work:

1. an analyzer/planner inspects the environment and emits a JSON action plan;
2. an action queue executes the plan with zero LLM calls per action;
3. the analyzer runs again when the queue empties or important observations change.

`batch_queue` adapts that Read/Grep/Bash planning-and-queue pattern to Pi and OpenCode repository workflows, adding workspace-safe file actions, persistent shell state, fast-fail execution, objective grounding, and optional typed result bindings.

Two additional design inspirations are:

- [**Metacognition in LLMs: Foundations, Progress, and Opportunities**](https://arxiv.org/abs/2607.11881) motivates planner self-check metadata. Objective-planned batches can attach a `reflection` object with confidence, success criteria, risks, and fallback guidance so the driver can see how certain the planner was.
- [**Function-Aware Fill-in-the-Middle as Mid-Training for Coding Agent Foundation Models**](https://arxiv.org/abs/2607.12463) observes that an agent action-observation-continuation loop resembles a function call whose return value is consumed downstream. `batch_queue` mirrors that idea with `bindTo` result bindings and `${name}` references between sequential actions.

These projects and papers are inspirations, not runtime dependencies or claims of reimplementation.

## Manage install

```bash
pi list
pi remove https://github.com/mallochio/batched-queue
pi remove -l https://github.com/mallochio/batched-queue
```

## License

MIT
