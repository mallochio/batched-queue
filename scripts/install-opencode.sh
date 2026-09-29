#!/usr/bin/env bash
# Register batched-queue as an OpenCode plugin (global or project-local).
#
# Usage:
#   ./scripts/install-opencode.sh           # update ~/.config/opencode/opencode.json
#   ./scripts/install-opencode.sh --local   # update ./opencode.json in the current project
#   ./scripts/install-opencode.sh --verify  # run OpenCode smoke tests only

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CALLER_DIR="$(pwd)"
LOCAL=false
VERIFY_ONLY=false
V1=false
REPO_URL="https://github.com/mallochio/batched-queue.git"
GITHUB_SPEC="batched-queue@git+${REPO_URL}"

for arg in "$@"; do
	case "$arg" in
		--local) LOCAL=true ;;
		--v1) V1=true ;;
		--verify) VERIFY_ONLY=true ;;
		-h | --help)
			cat <<'EOF'
Register the batched-queue OpenCode plugin.

Options:
  --local   Write ./opencode.json in the current directory, pointing at this checkout
  --v1      Target OpenCode 1.18.29+ (`plugin` key). Default is OpenCode 2 (`plugins`)
  --verify  Run OpenCode smoke/headless tests only (skip config edit)
  -h, --help  Show this help

OpenCode 2 global (default):
  plugins: ["batched-queue@git+https://github.com/mallochio/batched-queue.git"]

OpenCode 2 project checkout (--local):
  plugins: ["/absolute/path/to/this/repo"]

OpenCode 1.18.29+ (--v1):
  plugin: ["batched-queue@git+https://github.com/mallochio/batched-queue.git"]
  --v1 --local uses batched-queue@git+file://<this repo>

Restart OpenCode after registration.
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
	bun run tests/opencode-v2-smoke-test.ts
else
	npx tsx tests/opencode-smoke-test.ts
	npx tsx tests/opencode-headless-test.ts
	npx tsx tests/opencode-v2-smoke-test.ts
fi

if $VERIFY_ONLY; then
	echo "OK: OpenCode plugin loads and executes in headless mode."
	exit 0
fi

if $LOCAL; then
	if [ "$CALLER_DIR" = "$ROOT" ]; then
		echo "OpenCode already auto-loads .opencode/plugins/batched-queue.ts inside this checkout."
		echo "Run --local from the project you want to register the plugin in, e.g.:"
		echo "  cd /path/to/your-project && ${ROOT}/scripts/install-opencode.sh --local"
		exit 0
	fi
	CONFIG_PATH="$CALLER_DIR/opencode.json"
else
	CONFIG_PATH="${HOME}/.config/opencode/opencode.json"
	mkdir -p "$(dirname "$CONFIG_PATH")"
fi

if $V1; then
	CONFIG_KEY="plugin"
	if $LOCAL; then
		PLUGIN_SPEC="batched-queue@git+file://${ROOT}"
	else
		PLUGIN_SPEC="$GITHUB_SPEC"
	fi
else
	CONFIG_KEY="plugins"
	if $LOCAL; then
		PLUGIN_SPEC="$ROOT"
	else
		PLUGIN_SPEC="$GITHUB_SPEC"
	fi
fi

if [ ! -f "$CONFIG_PATH" ]; then
	if $V1; then
		cat >"$CONFIG_PATH" <<'EOF'
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": []
}
EOF
	else
		cat >"$CONFIG_PATH" <<'EOF'
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": []
}
EOF
	fi
fi

upsert_plugin() {
	local runner="$1"
	"$runner" -e "
const fs = require('node:fs');
const path = process.argv[1];
const spec = process.argv[2];
const key = process.argv[3];
const raw = JSON.parse(fs.readFileSync(path, 'utf8'));
raw[key] = Array.isArray(raw[key]) ? raw[key] : [];
const hasPlugin = raw[key].some((entry) =>
  typeof entry === 'string' && (entry === spec || entry.includes('batched-queue'))
);
if (hasPlugin) {
  console.log('A batched-queue entry already exists in ' + key + ' of ' + path + '; left unchanged.');
} else {
  raw[key].push(spec);
  fs.writeFileSync(path, JSON.stringify(raw, null, 2) + '\n');
  console.log('Updated ' + key + ' in ' + path + ' with ' + spec);
}
" "$CONFIG_PATH" "$PLUGIN_SPEC" "$CONFIG_KEY"
}

if command -v bun >/dev/null 2>&1; then
	upsert_plugin bun
else
	upsert_plugin node
fi

echo ""
echo "Installed. Restart OpenCode so it reloads plugins."
echo "Config key: ${CONFIG_KEY}"
echo "Entry: ${PLUGIN_SPEC}"
echo "File: ${CONFIG_PATH}"
