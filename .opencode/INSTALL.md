# Installing batched-queue for OpenCode

## Prerequisites

- [OpenCode](https://opencode.ai) installed
- `git` on your PATH (for git-backed plugin install)
- `bash` and `rg` on your PATH (required by batch_queue actions)

## One-line install

Use OpenCode's plugin installer:

```bash
opencode plugin "batched-queue@git+https://github.com/mallochio/batched-queue.git" -g
```

Or add the same package spec to `~/.config/opencode/opencode.json` (global) or project `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "batched-queue@git+https://github.com/mallochio/batched-queue.git"
  ]
}
```

Do not use the bare GitHub URL (`https://github.com/mallochio/batched-queue`) as a plugin entry. Restart OpenCode after install or config changes. The plugin installs automatically via Bun at startup.

Pin a release tag for stability:

```json
"batched-queue@git+https://github.com/mallochio/batched-queue.git#v0.2.0"
```

## Helper script

From a clone of this repo:

```bash
chmod +x scripts/install-opencode.sh
./scripts/install-opencode.sh
```

Project-local config:

```bash
./scripts/install-opencode.sh --local
```

Verify only (no config edits):

```bash
./scripts/install-opencode.sh --verify
```

## Local development

Use a `file://` URL pointing at your clone (must be a git repo):

```json
{
  "plugin": [
    "batched-queue@git+file:///absolute/path/to/batched-queue"
  ]
}
```

Or symlink/copy [`.opencode/plugins/batched-queue.ts`](../plugins/batched-queue.ts) into a project's `.opencode/plugins/` directory.

## Configuration

Settings merge in this order (highest wins):

1. Plugin factory overrides (code)
2. Environment variables (`BATCH_QUEUE_*`)
3. Project `.opencode/batched-queue.json`
4. `package.json` → `opencode.batchQueue`

Copy [`.opencode/batched-queue.json.example`](batched-queue.json.example) to `.opencode/batched-queue.json`.

The planner / driver model is inherited from your OpenCode session (`opencode.json` → `model` or per-session selection). Only an optional cheap `executionModel` (alias: `executorModel`) needs configuration for objective batches.

## Verify

```bash
opencode run --print-logs "hello" 2>&1 | grep -i batch
```

Ask the agent to run a small `batch_queue` with explicit `actions` (read + grep).

## Windows fallback

If git-backed plugin install fails (OpenCode/Bun cannot find `git`), install with system npm and point OpenCode at the local package:

```powershell
npm install batched-queue@git+https://github.com/mallochio/batched-queue.git --prefix "$HOME\.config\opencode"
```

Then in `opencode.json`:

```json
{
  "plugin": ["~/.config/opencode/node_modules/batched-queue"]
}
```

## Troubleshooting

### Plugin not loading

1. Check logs: `opencode run --print-logs "hello" 2>&1 | grep -i batch`
2. Confirm the `plugin` entry in `opencode.json` uses an npm package spec, not a bare GitHub URL
3. Remove duplicate `batched-queue` entries from global and project configs
4. Restart OpenCode after config changes

If a git-package install still fails, use the local-plugin fallback: install this package under `~/.config/opencode` and add `~/.config/opencode/plugins/batched-queue.ts` containing:

```ts
export { BatchedQueuePlugin } from "batched-queue/src/opencode/plugin.ts";
```

### Objective mode errors

Set `executionModel` in `.opencode/batched-queue.json` or `BATCH_QUEUE_EXECUTOR=provider/model` when you want a cheaper model for objective→actions conversion. When unset, the session driver plans objective batches. Ensure the parent session has a model selected.

### Updating

Restart OpenCode after `git pull`. If the plugin does not update, clear OpenCode's package cache and restart.

## Tool usage

The `batch_queue` tool accepts:

- `actions`: pre-planned batch from the session driver (no LLM call)
- `objective`: session driver plans by default, or configured execution model when set

Action types: `read_lines`, `grep_pattern`, `execute_bash`, `apply_diff`.
