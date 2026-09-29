# batched-queue

`batch_queue` is an [OpenCode 2](https://opencode.ai) plugin tool. It runs 1 to 10 dependent repo actions in one tool call, so the model does not pay a full tool turn per step.

Actions run in order: `read_lines`, `grep_pattern`, `execute_bash`, `apply_diff`. The shell keeps its cwd and env between steps and batches. The batch stops at the first failure. File paths stay inside the workspace. `apply_diff` checks syntax before it writes.

## Layout

```
src/
├── opencode/plugin.ts    # OpenCode 2 plugin
├── execute-batch-queue.ts# shared tool logic
├── queue-runner.ts       # sequential fast-fail runner
├── executors/            # one executor per action type
├── diff-validation/      # diff matching and syntax checks
└── lib/                  # path security, file mutation queue
.opencode/plugins/batched-queue.ts  # OpenCode entry (package main/exports)
tests/
```

Requirements: `bash` and `rg` on `PATH`.

## Why not Prime Agent

Prime Agent's `ipython` tool already runs dependent steps in one call: one cell can edit, lint, and test, and stop at the first failure. A separate `batch_queue` tool adds nothing there, so this package only targets OpenCode 2.

## Install

```bash
opencode plugin add "batched-queue@git+https://github.com/mallochio/batched-queue.git"
```

Or add the spec to `plugins` in `opencode.json` (project) or `~/.config/opencode/opencode.json` (global):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["batched-queue@git+https://github.com/mallochio/batched-queue.git"]
}
```

Restart OpenCode after you change the config.

## Tool usage

```json
{
  "actions": [
    { "type": "read_lines", "path": "src/config.ts", "startLine": 1, "endLine": 120 },
    { "type": "grep_pattern", "pattern": "loadConfig", "glob": "*.ts" },
    { "type": "apply_diff", "path": "src/config.ts", "oldText": "retries: 3", "newText": "retries: 5" },
    { "type": "execute_bash", "command": "npm test -- config" }
  ]
}
```

Use `batch_queue` for short dependent sequences. Use native tools for one obvious step, for independent parallel reads, or for long-running and interactive commands. Append `|| true` to a command when a non-zero exit is expected.

## Development

```bash
bun install
bun run typecheck
bun run test
```

## Credit

The read/grep/bash action-queue pattern comes from [RGB-Agent](https://github.com/alexisfox7/RGB-Agent).

## License

MIT
