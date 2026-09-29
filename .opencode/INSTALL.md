# Installing batched-queue for OpenCode

This is the **OpenCode plugin** half of `batched-queue`. For the **Prime Agent extension**, see the root [README](../README.md#install--prime-agent-extension).

The package default export supports **OpenCode V1 and V2** from one entrypoint:

- V2: `Plugin.define` fields (`id`, `setup`) — tools via `ctx.tool.transform`
- V1: `server()` — classic hook/`tool` map via `@opencode-ai/plugin`

## Prerequisites

- [OpenCode](https://opencode.ai) installed
- `git` on your PATH (for git-backed plugin install)
- `bash` and `rg` on your PATH (required by batch_queue actions)

## One-line install

### OpenCode 2 (preferred)

```bash
opencode plugin add "batched-queue@git+https://github.com/mallochio/batched-queue.git"
```

Or add to `~/.config/opencode/opencode.json` / project `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    "batched-queue@git+https://github.com/mallochio/batched-queue.git"
  ]
}
```

### OpenCode 1.x

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

Do not use the bare GitHub URL (`https://github.com/mallochio/batched-queue`) as a plugin entry. Restart OpenCode after install or config changes.

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
  "plugins": [
    "batched-queue@git+file:///absolute/path/to/batched-queue"
  ]
}
```

Or rely on auto-discovery: this repo's [`.opencode/plugins/batched-queue.ts`](plugins/batched-queue.ts) loads when you run OpenCode from the package root.

## Configuration

Settings merge in this order (highest wins):

1. Plugin factory overrides (code)
2. Environment variables (`BATCH_QUEUE_*`)
3. Project `.opencode/batched-queue.json`
4. `package.json` → `opencode.batchQueue`

Copy [`.opencode/batched-queue.json.example`](batched-queue.json.example) to `.opencode/batched-queue.json`.

The planner / driver model is inherited from your OpenCode session (`opencode.json` → `model` or per-session selection). Configure an optional objective executor only through `BATCH_QUEUE_EXECUTOR` and related environment variables.

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
  "plugins": ["~/.config/opencode/node_modules/batched-queue"]
}
```

## Troubleshooting

### Plugin not loading

1. Check logs: `opencode run --print-logs "hello" 2>&1 | grep -i batch`
2. Confirm the config uses an npm/git package spec, not a bare GitHub URL
3. On OpenCode 2 use `plugins`; on 1.x use `plugin`
4. Remove duplicate `batched-queue` entries from global and project configs
5. Restart OpenCode after config changes

### Objective mode errors

Set `BATCH_QUEUE_EXECUTOR=provider/model` when you want a separate model for objective→actions conversion. Optional endpoint settings are `BATCH_QUEUE_EXECUTOR_BASE_URL`, `BATCH_QUEUE_EXECUTOR_API_KEY`, and `BATCH_QUEUE_EXECUTOR_THINKING`. When unset, the session driver plans objective batches.

### Updating

Restart OpenCode after `git pull`. If the plugin does not update, clear OpenCode's package cache and restart.

## Tool usage

The `batch_queue` tool accepts:

- `actions`: pre-planned batch from the session driver (no LLM call)
- `objective`: session driver plans by default, or configured execution model when set

Action types: `read_lines`, `grep_pattern`, `execute_bash`, `apply_diff`.
