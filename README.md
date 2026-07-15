# batched-queue

Stateful batched action queue for [Pi](https://github.com/earendil-works/pi-mono) and [OpenCode](https://opencode.ai) coding agent sessions. It executes up to N sequential actions (`read_lines`, `grep_pattern`, `execute_bash`, `apply_diff`) in one tool call with persistent shell state and fast-fail semantics.

## Project layout

```
batched-queue/
├── README.md
├── package.json
├── src/                  # extension and library source
│   ├── extension.ts      # Pi extension entry point
│   ├── opencode/         # OpenCode plugin adapter
│   ├── index.ts          # public API barrel export
│   ├── executors/        # action executors
│   ├── diff-validation/  # diff matching and syntax checks
│   └── lib/              # shared utilities
├── .opencode/            # OpenCode plugin entry + install docs
├── .pi/                  # Pi config example
├── tests/                # unit, integration, and smoke tests
└── scripts/
    ├── install.sh        # Pi install helper
    └── install-opencode.sh
```

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

RGB-style workflow: plan a batch, execute with zero per-action LLM calls, read the `next steps` hints, then replan if needed.

For coding sessions, prefer `batch_queue` for small sequential inspect/search/check loops instead of making multiple individual tool calls.

Use it when you need up to 10 low-risk sequential repo actions:

- inspect files
- search symbols or text
- run small shell checks
- apply a targeted diff
- verify a local change

Actions can form a typed mini-pipeline. Add `bindTo` to any action to name its result, then reference that raw text in later string fields as `${name}`. This is most useful for objective-planned batches where a read/grep result determines a follow-up command. Quote interpolated values carefully in shell commands; substitution is raw text, not shell escaping.

Use `actions` when you already know the exact deterministic steps, especially for `apply_diff`. Use `objective` only when enumerating steps is tedious.

Prefer `multi_tool_use.parallel` instead for independent parallel reads/searches. Do not use `batch_queue` for destructive, long-running, interactive, or approval-sensitive commands. File actions are workspace-scoped unless configured otherwise.

## Manage install

```bash
pi list
pi remove https://github.com/mallochio/batched-queue
pi remove -l https://github.com/mallochio/batched-queue
```

## License

MIT
