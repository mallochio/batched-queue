#!/usr/bin/env bash
# Register batched-queue as an OpenCode plugin (global or project-local).
#
# Usage:
#   ./scripts/install-opencode.sh           # update ~/.config/opencode/opencode.json
#   ./scripts/install-opencode.sh --local   # update ./opencode.json in this repo
#   ./scripts/install-opencode.sh --verify  # run OpenCode smoke tests only

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL=false
VERIFY_ONLY=false
REPO_URL="https://github.com/mallochio/batched-queue.git"
PLUGIN_SPEC="batched-queue@git+${REPO_URL}"

for arg in "$@"; do
	case "$arg" in
		--local) LOCAL=true ;;
		--verify) VERIFY_ONLY=true ;;
		-h | --help)
			cat <<'EOF'
Register the batched-queue OpenCode plugin.

Options:
  --local   Update ./opencode.json in the current project
  --verify  Run OpenCode smoke/headless tests only (skip config edit)
  -h, --help  Show this help

After registration, restart OpenCode. Verify with:
  opencode run --print-logs "hello" 2>&1 | grep -i batch
EOF
			exit 0
			;;
		*)
			echo "Unknown option: $arg" >&2
			exit 1
			;;
	esac
done

cd "$ROOT"

if command -v bun >/dev/null 2>&1; then
	bun install
else
	npm install
fi

if command -v bun >/dev/null 2>&1; then
	bun run tests/opencode-smoke-test.ts
	bun run tests/opencode-headless-test.ts
else
	npx tsx tests/opencode-smoke-test.ts
	npx tsx tests/opencode-headless-test.ts
fi

if $VERIFY_ONLY; then
	echo "OK: OpenCode plugin loads and executes in headless mode."
	exit 0
fi

if $LOCAL; then
	CONFIG_PATH="$ROOT/opencode.json"
else
	CONFIG_PATH="${HOME}/.config/opencode/opencode.json"
	mkdir -p "$(dirname "$CONFIG_PATH")"
fi

if [ ! -f "$CONFIG_PATH" ]; then
	cat >"$CONFIG_PATH" <<'EOF'
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": []
}
EOF
fi

if command -v bun >/dev/null 2>&1; then
	bun -e "
const fs = require('node:fs');
const path = process.argv[1];
const spec = process.argv[2];
const root = process.argv[3];
const raw = JSON.parse(fs.readFileSync(path, 'utf8'));
raw.plugin = raw.plugin ?? [];
const localSpec = 'batched-queue@git+file://' + root;
const hasPlugin = raw.plugin.some((entry) =>
  typeof entry === 'string' && (entry.includes('batched-queue') || entry === localSpec)
);
if (!hasPlugin) {
  raw.plugin.push(spec);
}
fs.writeFileSync(path, JSON.stringify(raw, null, 2) + '\n');
console.log('Updated plugin list in ' + path);
" "$CONFIG_PATH" "$PLUGIN_SPEC" "$ROOT"
else
	node -e "
const fs = require('node:fs');
const path = process.argv[1];
const spec = process.argv[2];
const root = process.argv[3];
const raw = JSON.parse(fs.readFileSync(path, 'utf8'));
raw.plugin = raw.plugin ?? [];
const localSpec = 'batched-queue@git+file://' + root;
const hasPlugin = raw.plugin.some((entry) =>
  typeof entry === 'string' && (entry.includes('batched-queue') || entry === localSpec)
);
if (!hasPlugin) {
  raw.plugin.push(spec);
}
fs.writeFileSync(path, JSON.stringify(raw, null, 2) + '\n');
console.log('Updated plugin list in ' + path);
" "$CONFIG_PATH" "$PLUGIN_SPEC" "$ROOT"
fi

echo ""
echo "Installed. Restart OpenCode to load the plugin."
echo ""
echo "One-line manual install (global):"
echo "  Add to ~/.config/opencode/opencode.json:"
echo "    \"plugin\": [\"${PLUGIN_SPEC}\"]"
echo ""
echo "Local dev (this clone):"
echo "  \"plugin\": [\"batched-queue@git+file://${ROOT}\"]"
