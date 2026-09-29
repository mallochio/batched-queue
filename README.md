# batched-queue

## Plan once. Execute a verified action pipeline. Replan from evidence.

`batched-queue` is a low-latency tool for [Prime Agent](https://github.com/PrimeIntellect-ai/prime-agent) and [OpenCode](https://opencode.ai) coding-agent sessions. It executes up to N short, dependent repository actions in one tool call, preserving shell state and returning structured evidence for the next planning decision — so the driver model batches commands instead of paying a full tool turn per step.

Instead of forcing the model to stop after every observation, a session can submit a small typed pipeline:

```text
discover → inspect → verify
```

The queue executes `read_lines`, `grep_pattern`, `execute_bash`, and `apply_diff` actions sequentially with fast-fail semantics, workspace boundaries, optional result bindings, and no additional model calls during action execution.

### The middle ground between one tool call and a workflow engine

| Need | Best fit |
| --- | --- |
| One obvious read, search, or command | Native Prime Agent / OpenCode tools |
| Independent reads or searches | Parallel tool calls |
| 2–10 dependent repository actions | `batch_queue` |
| Large DAGs, fan-out, worktrees, or durable jobs | A workflow/orchestration system |

`batch_queue` is intentionally small: it is not a replacement for a multi-agent workflow engine. Its purpose is to compress short dependent tool sequences without hiding action boundaries or failure evidence.

## Project layout

```
batched-queue/
├── README.md
├── package.json
├── src/                  # shared core + two host adapters
│   ├── extension.ts      # Prime Agent extension entry (pi package manifest)
│   ├── opencode/         # OpenCode plugin adapter
│   ├── index.ts          # public API barrel export
│   ├── executors/        # action executors
│   ├── diff-validation/  # diff matching and syntax checks
│   └── lib/              # shared utilities
├── .opencode/            # OpenCode plugin entry + install docs
├── .prime/agent/         # Prime Agent config example
├── .pi/                  # legacy Pi config example (still read)
├── tests/                # unit, integration, and smoke tests
└── scripts/
    ├── install.sh        # Prime Agent package install helper
    └── install-opencode.sh
```

## Requirements

- [Prime Agent](https://github.com/PrimeIntellect-ai/prime-agent) on your `PATH` (or legacy [Pi coding agent](https://www.npmjs.com/package/@earendil-works/pi-coding-agent))
- [Bun](https://bun.sh) preferred, or Node/npm for dependency install
- `bash` and `rg` on `PATH`

## Two integrations

This repository ships **two adapters** over one shared executor:

| Host | Entry | Registers | Token savings |
| --- | --- | --- | --- |
| **Prime Agent** | `src/extension.ts` via `package.json` → `pi.extensions` | `batch_queue` tool with session UI + prompt guidelines | One model turn runs many dependent repo actions |
| **OpenCode** | `.opencode/plugins/batched-queue.ts` (dual V1 `server()` + V2 `setup()`) | Same `batch_queue` tool | Same batching semantics in OpenCode sessions |

Use **Prime Agent** when you work in Prime Agent / pi-mono-compatible sessions. Use **OpenCode** when you work in OpenCode. You can install one or both; they share configuration shape but read host-specific project files.

## Install — Prime Agent extension

Install as a Prime Agent package (recommended). Source formats follow the [Prime Agent packages](https://github.com/PrimeIntellect-ai/prime-agent/blob/main/packages/coding-agent/docs/packages.md) docs:

```bash
prime-agent package install git:github.com/mallochio/batched-queue
# or raw URL:
prime-agent package install https://github.com/mallochio/batched-queue
```

Project-local install:

```bash
prime-agent package install git:github.com/mallochio/batched-queue --local
```

Or install from a checkout:

```bash
prime-agent package install /path/to/batched-queue
prime-agent package install /path/to/batched-queue --local
```

The package declares resources under the inherited `pi` manifest key and the `pi-package` keyword. Host packages (`@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`) are optional peer dependencies so Prime Agent can supply its bundled copies, and an OpenCode install does not fail when those packages are absent. Installed packages land under `~/.prime/agent/` (global) or `.prime/agent/` (`--local`).

From a checkout, the helper does the same registration after the smoke test:

```bash
chmod +x scripts/install.sh
./scripts/install.sh           # global
./scripts/install.sh --local   # this project only
./scripts/install.sh --verify  # deps + smoke test, no registration
```

`prime-agent` is used when it is on `PATH`. Otherwise the script falls back to legacy `pi install`.

Legacy Pi CLI:

```bash
pi install https://github.com/mallochio/batched-queue
pi install -l https://github.com/mallochio/batched-queue
```

## Install — OpenCode plugin

The package default-exports one object with OpenCode 2 `id` + `setup()` and OpenCode 1 `server()`. The `server()` object form requires **OpenCode 1.18.29 or newer**. Older 1.x releases are not supported.

Restart OpenCode after every install or config edit.

### OpenCode 2

```bash
opencode plugin add "batched-queue@git+https://github.com/mallochio/batched-queue.git"
```

Or add the spec yourself:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    "batched-queue@git+https://github.com/mallochio/batched-queue.git"
  ]
}
```

Global config file: `~/.config/opencode/opencode.json`. Project config file: `opencode.json` in the project root.

### OpenCode 1.18.29+

```bash
opencode plugin "batched-queue@git+https://github.com/mallochio/batched-queue.git" -g
```

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "batched-queue@git+https://github.com/mallochio/batched-queue.git"
  ]
}
```

Do not use a bare GitHub URL (`https://github.com/mallochio/batched-queue`) as a plugin entry. OpenCode 2 ignores the `plugin` key. OpenCode 1 ignores the `plugins` key.

### Helper script

```bash
chmod +x scripts/install-opencode.sh
./scripts/install-opencode.sh              # OpenCode 2, global git spec
./scripts/install-opencode.sh --local      # OpenCode 2, ./opencode.json points at this checkout
./scripts/install-opencode.sh --v1         # OpenCode 1.18.29+, global `plugin` key
./scripts/install-opencode.sh --v1 --local # OpenCode 1.18.29+, this checkout via git+file
./scripts/install-opencode.sh --verify     # smoke tests only
```

`--local` on OpenCode 2 writes the absolute path of this repo. `--local --v1` writes `batched-queue@git+file://<this repo>`. Neither flag publishes a new npm version.

See [.opencode/INSTALL.md](.opencode/INSTALL.md) for config files, objective-mode limits, and troubleshooting.

OpenCode batch settings come from `.opencode/batched-queue.json` in the **session** directory and from `package.json` → `opencode.batchQueue`. The session model is the driver. `BATCH_QUEUE_EXECUTOR=provider/model` can select another OpenCode-configured model for objective planning. Custom base URL, API key, and thinking env vars are Prime Agent and OpenCode 1.x only; OpenCode 2 objective mode errors if a custom base URL or API key is set.

## Local development

```bash
bun install
bun test
bun run typecheck
```

You can also load the Prime Agent extension without installing:

```bash
prime-agent -e ./src/extension.ts
# legacy: pi -e ./src/extension.ts
```

Or use the helper script:

```bash
chmod +x scripts/install.sh
./scripts/install.sh
```

## Configuration

Settings merge in this order (highest priority wins):

1. Extension / plugin factory overrides (code)
2. Environment variables
3. Host project JSON (see below)
4. `package.json` → `pi.batchQueue` or `opencode.batchQueue` (package defaults)

### Prime Agent JSON config

Project-local config in `.prime/agent/batched-queue.json` (preferred). Legacy Pi paths (`.pi/batched-queue.json`) are still read; Prime Agent settings override legacy Pi settings when both exist.

```json
{
  "groundingTurns": 3,
  "requirePlanReflection": true,
  "maxBatchActions": 10,
  "allowObjectiveMutations": false
}
```

`groundingTurns` (default `3`) lets the objective planner read/grep the real repo before it plans; set `0` to plan blind in one shot (Prime Agent objective mode only). `requirePlanReflection` (default `true`) asks objective planners to attach structured confidence, success criteria, risks, and fallback metadata to submitted batches.

Copy `.prime/agent/batched-queue.json.example` to `.prime/agent/batched-queue.json` to get started.

Package defaults can live in `package.json`:

```json
{
  "pi": {
    "batchQueue": {
      "maxBatchActions": 10,
      "allowObjectiveMutations": false
    }
  }
}
```

### OpenCode JSON config

Project-local config in `.opencode/batched-queue.json`. Copy `.opencode/batched-queue.json.example`. OpenCode also reads `package.json` → `opencode.batchQueue`.

### Environment variables

Optional environment variables:

- `BATCH_QUEUE_MAX_ACTIONS`: max actions per batch, default `10`
- `BATCH_QUEUE_EXECUTOR`: execution model as `provider/model` for objective batches
- `BATCH_QUEUE_EXECUTOR_PROVIDER`: execution model provider when set separately
- `BATCH_QUEUE_EXECUTOR_MODEL`: execution model id when set separately
- `BATCH_QUEUE_EXECUTOR_BASE_URL`: OpenAI-compatible chat completions base URL. Prime Agent and OpenCode 1.x only. OpenCode 2 objective mode fails if this is set.
- `BATCH_QUEUE_EXECUTOR_API_KEY`: API key for that endpoint. Prime Agent and OpenCode 1.x only. OpenCode 2 objective mode fails if this is set.
- `BATCH_QUEUE_EXECUTOR_THINKING`: reasoning effort (`minimal`, `low`, `medium`, `high`, `xhigh`). Prime Agent and OpenCode 1.x only. OpenCode 2 does not forward this value.
- `BATCH_QUEUE_GROUNDING_TURNS`: read/grep grounding turns before the planner must submit, default `3` (`0` = plan blind)
- `BATCH_QUEUE_REQUIRE_PLAN_REFLECTION`: set to `false` to stop asking objective planners for confidence/risk reflection metadata
- `BATCH_QUEUE_ALLOW_OBJECTIVE_MUTATIONS`: set to `true` to let objective-planned batches include `apply_diff`

The planner / driver model is always your main session model. An optional cheap execution model converts `objective` inputs into action batches; when unset, the session driver plans. Prefer explicit `actions` from the driver for edits. Objective-planned batches are read/check-only by default.

Example:

```bash
export BATCH_QUEUE_EXECUTOR=bifrost/gemini-3.7-flash
export BATCH_QUEUE_EXECUTOR_BASE_URL=http://127.0.0.1:8080/v1
export BATCH_QUEUE_EXECUTOR_API_KEY="$BIFROST_API_KEY"
prime-agent --provider openai --model gpt-5.4-mini
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

## Research inspirations

The **primary architectural inspiration** for `batch_queue` is [**RGB-Agent / Read-Grep-Bash Agent**](https://github.com/alexisfox7/RGB-Agent), an agent for [ARC-AGI-3](https://three.arcprize.org/). Its README reports completing all three preview games in **1,069 actions**, described there as the **lowest publicly reported count**. This is a public result reported by the project, not a claim that it won an official global leaderboard.

RGB-Agent’s core pattern is the one `batch_queue` generalizes for coding work:

1. an analyzer/planner inspects the environment and emits a JSON action plan;
2. an action queue executes the plan with zero LLM calls per action;
3. the analyzer runs again when the queue empties or important observations change.

`batch_queue` adapts that Read/Grep/Bash planning-and-queue pattern to Prime Agent and OpenCode repository workflows, adding workspace-safe file actions, persistent shell state, fast-fail execution, objective grounding, and optional typed result bindings.

Two additional design inspirations are:

- [**Metacognition in LLMs: Foundations, Progress, and Opportunities**](https://arxiv.org/abs/2607.11881) motivates planner self-check metadata. Objective-planned batches can attach a `reflection` object with confidence, success criteria, risks, and fallback guidance so the driver can see how certain the planner was.
- [**Function-Aware Fill-in-the-Middle as Mid-Training for Coding Agent Foundation Models**](https://arxiv.org/abs/2607.12463) observes that an agent action-observation-continuation loop resembles a function call whose return value is consumed downstream. `batch_queue` mirrors that idea with `bindTo` result bindings and `${name}` references between sequential actions.

These projects and papers are inspirations, not runtime dependencies or claims of reimplementation.

## Manage install

Prime Agent:

```bash
prime-agent package list
prime-agent package remove git:github.com/mallochio/batched-queue
prime-agent package remove git:github.com/mallochio/batched-queue --local
```

Legacy Pi:

```bash
pi list
pi remove https://github.com/mallochio/batched-queue
pi remove -l https://github.com/mallochio/batched-queue
```

OpenCode 2:

```bash
opencode plugin list
opencode plugin remove "batched-queue@git+https://github.com/mallochio/batched-queue.git"
```

If your OpenCode 2 build has no `plugin remove`, delete the spec from the `plugins` array and restart. OpenCode 1.18.29+ uses the `plugin` array instead.

## License

MIT
