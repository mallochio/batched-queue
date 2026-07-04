# batched-queue

Stateful batched action queue for [Pi](https://github.com/earendil-works/pi-mono) coding agent sessions. It executes up to N sequential actions (`read_lines`, `grep_pattern`, `execute_bash`, `apply_diff`) in one tool call with persistent shell state and fast-fail semantics.

## Requirements

- [Pi coding agent](https://www.npmjs.com/package/@mariozechner/pi-coding-agent) on your `PATH`
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

## Local development

```bash
bun install
bun test
bun run typecheck
```

You can also load it without installing:

```bash
pi -e ./extension.ts
```

Or use the helper script:

```bash
chmod +x install.sh
./install.sh
```

## Configuration

Optional environment variables:

- `BATCH_QUEUE_MAX_ACTIONS`: max actions per batch, default `5`
- `BATCH_QUEUE_EXECUTOR`: executor model as `provider/model`
- `BATCH_QUEUE_EXECUTOR_PROVIDER`: executor provider when set separately
- `BATCH_QUEUE_EXECUTOR_MODEL`: executor model id when set separately

The driver model is your main Pi session model. The executor model plans batches when you pass an `objective`. By default it uses the same session model.

Example:

```bash
export BATCH_QUEUE_EXECUTOR=openai/gpt-5.4-nano
pi --provider openai --model gpt-5.4-mini
```

## Tool usage

The `batch_queue` tool accepts either:

- `objective`: an executor model plans the action batch
- `actions`: a pre-planned batch supplied directly by the driver model

## Manage install

```bash
pi list
pi remove https://github.com/mallochio/batched-queue
pi remove -l https://github.com/mallochio/batched-queue
```

## License

MIT
