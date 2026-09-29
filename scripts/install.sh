#!/usr/bin/env bash
# Install batched-queue as a Prime Agent package (user-global or project-local).
# Falls back to the legacy `pi` CLI when `prime-agent` is not installed.
#
# Usage:
#   ./scripts/install.sh           # register globally (recommended)
#   ./scripts/install.sh --local   # register in this repo only
#   ./scripts/install.sh --verify  # install deps and run smoke test only (no register)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL=false
VERIFY_ONLY=false

agent_cli() {
	if command -v prime-agent >/dev/null 2>&1; then
		echo "prime-agent"
		return 0
	fi
	if command -v pi >/dev/null 2>&1; then
		echo "pi"
		return 0
	fi
	if [ -x "$ROOT/node_modules/.bin/pi" ]; then
		echo "$ROOT/node_modules/.bin/pi"
		return 0
	fi
	echo "npx"
}

run_agent_install() {
	local cli
	cli="$(agent_cli)"
	case "$cli" in
		prime-agent)
			if $LOCAL; then
				prime-agent package install "$ROOT" --local
			else
				prime-agent package install "$ROOT"
			fi
			;;
		npx)
			if $LOCAL; then
				npx --yes @earendil-works/pi-coding-agent install -l "$ROOT"
			else
				npx --yes @earendil-works/pi-coding-agent install "$ROOT"
			fi
			;;
		*)
			if $LOCAL; then
				"$cli" install -l "$ROOT"
			else
				"$cli" install "$ROOT"
			fi
			;;
	esac
}

for arg in "$@"; do
	case "$arg" in
		--local) LOCAL=true ;;
		--verify) VERIFY_ONLY=true ;;
		-h | --help)
			cat <<'EOF'
Install the batched-queue Prime Agent extension package.

Options:
  --local   Register in the current project only
  --verify  Install dependencies and run smoke test (skip package registration)
  -h, --help  Show this help

Requirements: prime-agent (or legacy pi), bun (preferred) or npm, bash, rg on PATH.
EOF
			exit 0
			;;
		*)
			echo "Unknown option: $arg" >&2
			exit 1
			;;
	esac
done

if ! $VERIFY_ONLY; then
	case "$(agent_cli)" in
		prime-agent) ;;
		npx)
			echo "note: prime-agent not on PATH; will use npx @earendil-works/pi-coding-agent for registration."
			;;
		pi)
			echo "note: prime-agent not on PATH; using legacy pi install."
			;;
	esac
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
else
	echo "Registering extension globally..."
fi
run_agent_install

echo ""
echo "Installed. Start Prime Agent normally, or load once without registering:"
echo "  prime-agent -e \"$ROOT/src/extension.ts\""
echo ""
echo "Legacy Pi CLI equivalent:"
echo "  pi -e \"$ROOT/src/extension.ts\""
echo ""
echo "Optional: set a cheap executor model for batch planning, e.g.:"
echo "  export BATCH_QUEUE_EXECUTOR=openai/gpt-5.4-nano"
