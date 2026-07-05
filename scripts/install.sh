#!/usr/bin/env bash
# Install batched-queue as a Pi extension (user-global or project-local).
#
# Usage:
#   ./scripts/install.sh           # register in ~/.pi/agent/settings.json (recommended)
#   ./scripts/install.sh --local   # register in .pi/settings.json for this repo only
#   ./scripts/install.sh --verify  # install deps and run smoke test only (no pi register)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL=false
VERIFY_ONLY=false

pi_bin() {
	if command -v pi >/dev/null 2>&1; then
		command -v pi
	elif [ -x "$ROOT/node_modules/.bin/pi" ]; then
		echo "$ROOT/node_modules/.bin/pi"
	else
		echo "npx --yes @earendil-works/pi-coding-agent"
	fi
}

run_pi() {
	local bin
	bin="$(pi_bin)"
	if [[ "$bin" == npx* ]]; then
		npx --yes @earendil-works/pi-coding-agent "$@"
	else
		"$bin" "$@"
	fi
}

for arg in "$@"; do
	case "$arg" in
		--local) LOCAL=true ;;
		--verify) VERIFY_ONLY=true ;;
		-h | --help)
			cat <<'EOF'
Install the batched-queue Pi extension.

Options:
  --local   Register in the current project's .pi/settings.json
  --verify  Install dependencies and run smoke test (skip pi install)
  -h, --help  Show this help

Requirements: pi, bun (preferred) or npm, bash, rg on PATH.
EOF
			exit 0
			;;
		*)
			echo "Unknown option: $arg" >&2
			exit 1
			;;
	esac
done

if ! $VERIFY_ONLY && ! command -v pi >/dev/null 2>&1 && [ ! -x "$ROOT/node_modules/.bin/pi" ]; then
	echo "note: pi not on PATH; will use npx @earendil-works/pi-coding-agent for registration."
fi

if ! command -v rg >/dev/null 2>&1; then
	echo "error: ripgrep (rg) not found — required for grep_pattern actions." >&2
	exit 1
fi

cd "$ROOT"

if command -v bun >/dev/null 2>&1; then
	echo "Installing dependencies with bun..."
	bun install
else
	echo "Installing dependencies with npm..."
	npm install
fi

echo "Running smoke test..."
if command -v bun >/dev/null 2>&1; then
	bun run tests/smoke-test.ts
else
	npx tsx tests/smoke-test.ts
fi

if $VERIFY_ONLY; then
	echo "OK: dependencies installed and extension loads correctly."
	exit 0
fi

if $LOCAL; then
	echo "Registering extension for this project only..."
	run_pi install -l "$ROOT"
else
	echo "Registering extension globally..."
	run_pi install "$ROOT"
fi

echo ""
echo "Installed. Start Pi normally, or load once without registering:"
echo "  pi -e \"$ROOT/src/extension.ts\""
echo ""
echo "Optional: set a cheap executor model for batch planning, e.g.:"
echo "  export BATCH_QUEUE_EXECUTOR=openai/gpt-5.4-nano"
