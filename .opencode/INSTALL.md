# Installing batched-queue for OpenCode

This is the **OpenCode plugin**. For the **Prime Agent extension**, see the root [README](../README.md#install--prime-agent-extension).

The package default export supports OpenCode 2 and OpenCode **1.18.29+**:

- OpenCode 2 reads `id` and `setup()` (`Plugin.define` from `@opencode/plugin`) and the `plugins` config key.
- OpenCode 1.18.29+ calls `server()` and reads the `plugin` config key.
- Older OpenCode 1.x builds expect a function default export and will not load this package.

Restart OpenCode after install or config changes. Commands run in the **session** directory (`session.location.directory`), not the directory the plugin package was loaded from.

## Prerequisites

- [OpenCode](https://opencode.ai) 2.x, or 1.18.29+
- `git` on your PATH for git-backed installs
- `bash` and `rg` on your PATH (required by batch_queue actions)

## OpenCode 2

```bash
opencode plugin add "batched-queue@git+https://github.com/mallochio/batched-queue.git"
```

`~/.config/opencode/opencode.json` (global) or project `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    "batched-queue@git+https://github.com/mallochio/batched-queue.git"
  ]
}
```

Do not use the bare GitHub URL (`https://github.com/mallochio/batched-queue`).

To pin a git ref, append a ref that exists on the repo. This package's `version` is `0.1.0`; there is no `v0.2.0` tag.

```json
"batched-queue@git+https://github.com/mallochio/batched-queue.git#<tag-or-commit>"
```

## OpenCode 1.18.29+

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

OpenCode 2 does not read `plugin`. OpenCode 1 does not read `plugins`.

## Helper script

From a clone:

```bash
chmod +x scripts/install-opencode.sh
./scripts/install-opencode.sh              # OpenCode 2 global git spec
./scripts/install-opencode.sh --local      # OpenCode 2 ./opencode.json = absolute path of this clone
./scripts/install-opencode.sh --v1         # OpenCode 1.18.29+ global `plugin` key
./scripts/install-opencode.sh --v1 --local # OpenCode 1.18.29+ git+file URL of this clone
./scripts/install-opencode.sh --verify     # tests only, no config edit
```

## Local development

OpenCode 2, project `opencode.json`:

```json
{
  "plugins": ["/absolute/path/to/batched-queue"]
}
```

OpenCode 1.18.29+, project `opencode.json`:

```json
{
  "plugin": ["batched-queue@git+file:///absolute/path/to/batched-queue"]
}
```

Running OpenCode from this repo also auto-loads [`.opencode/plugins/batched-queue.ts`](plugins/batched-queue.ts).

## Configuration

Settings merge in this order (highest wins):

1. Plugin factory overrides (code)
2. Environment variables (`BATCH_QUEUE_*`)
3. `.opencode/batched-queue.json` in the **session** directory
4. `package.json` → `opencode.batchQueue`

Copy [`.opencode/batched-queue.json.example`](batched-queue.json.example) to `.opencode/batched-queue.json` in the project you are editing.

The driver model is the OpenCode session model. `BATCH_QUEUE_EXECUTOR=provider/model` selects another model already configured in OpenCode for objective planning.

These three variables work on Prime Agent and OpenCode 1.x. They do not configure OpenCode 2's `generate.text` call:

- `BATCH_QUEUE_EXECUTOR_BASE_URL`
- `BATCH_QUEUE_EXECUTOR_API_KEY` (OpenCode 2 objective mode returns an error if either of these is set)
- `BATCH_QUEUE_EXECUTOR_THINKING` (ignored on OpenCode 2)

## Verify

```bash
opencode run --print-logs "hello" 2>&1 | grep -i batch
```

Ask the agent to run a small `batch_queue` with explicit `actions` (read + grep) in the project you care about. Confirm the reported `cwd` is that project.

## Windows fallback

If git-backed install fails, install with npm and point OpenCode 2 at the package directory:

```powershell
npm install batched-queue@git+https://github.com/mallochio/batched-queue.git --prefix "$HOME\.config\opencode"
```

```json
{
  "plugins": ["C:/Users/you/.config/opencode/node_modules/batched-queue"]
}
```

On OpenCode 1.18.29+, put that same path spec in `plugin` instead of `plugins`.

## Troubleshooting

### Plugin not loading

1. Check logs: `opencode run --print-logs "hello" 2>&1 | grep -i batch`
2. Use a package spec or an absolute directory path, not a bare GitHub URL
3. OpenCode 2: `plugins`. OpenCode 1.18.29+: `plugin`
4. Remove duplicate `batched-queue` entries from global and project configs
5. Restart OpenCode

### Objective mode errors

`BATCH_QUEUE_EXECUTOR=provider/model` selects a configured OpenCode model. On OpenCode 2, unset `BATCH_QUEUE_EXECUTOR_BASE_URL` and `BATCH_QUEUE_EXECUTOR_API_KEY`. When `BATCH_QUEUE_EXECUTOR` is unset, the session model plans the batch. Explicit `actions` never call the planner.

### Files change in the wrong directory

OpenCode 2 must execute against `session.location.directory`. If `cwd` in the tool result is the plugin install path, you are not on a build that includes this fix. Upgrade to the current package and restart.

### Updating

Restart OpenCode after `git pull`. If a git-installed plugin stays stale, remove it from config, clear OpenCode's package cache, add it again, and restart.

## Tool usage

The `batch_queue` tool accepts:

- `actions`: pre-planned batch from the session driver (no extra model call per step)
- `objective`: the session model plans by default, or `BATCH_QUEUE_EXECUTOR` when that model is configured in OpenCode

Action types: `read_lines`, `grep_pattern`, `execute_bash`, `apply_diff`.
