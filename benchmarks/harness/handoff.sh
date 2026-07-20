#!/usr/bin/env bash
set -euo pipefail
# ──────────────────────────────────────────────────────────────────────────────
# Model-mediated benchmark handoff
# Usage:
#   bash benchmarks/harness/handoff.sh pilot   # 3 reps, 4 scenarios
#   bash benchmarks/harness/handoff.sh main    # 20 reps, all 24 scenarios
#   bash benchmarks/harness/handoff.sh azure   # Azure Luna+Grok config
# ──────────────────────────────────────────────────────────────────────────────

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO"

MODE="${1:-pilot}"
shift 1 2>/dev/null || true

# ── Validate environment ──────────────────────────────────────────────────────

command -v bun >/dev/null 2>&1 || { echo "bun required"; exit 1; }
command -v pi >/dev/null 2>&1 || { echo "Pi CLI required — did you run 'bun install'?"; exit 1; }

if [ -z "${OPENAI_API_KEY:-}" ] && [ -z "${AZURE_OPENAI_API_KEY:-}" ]; then
  echo "ERROR: set OPENAI_API_KEY or AZURE_OPENAI_API_KEY first"
  exit 1
fi

# ── Configuration ──────────────────────────────────────────────────────────────

case "$MODE" in
  pilot)
    # Quick validation: 3 reps × 4 scenarios × 3 conditions = 36 runs
    SCENARIOS="H1,H2,H3,H4"
    REPS=3
    DRIVER_MODEL="gpt-5.4-mini"
    EXECUTOR_MODEL="openai/gpt-5.4-nano"
    PROVIDER="openai"
    THINKING="low"
    MAX_COST=3
    ;;
  main)
    # Full run: 20 reps × 24 scenarios × 3 conditions = 1440 runs
    SCENARIOS="H1,H2,H3,H4,H5,H6,H7,H8,H9,H10,H11,H12,H13,H14,H15,H16,H17,H18,H19,H20,H21,H22,H23,H24"
    REPS=20
    DRIVER_MODEL="gpt-5.4-mini"
    EXECUTOR_MODEL="openai/gpt-5.4-nano"
    PROVIDER="openai"
    THINKING="low"
    MAX_COST=50
    ;;
  azure)
    # Azure Luna+Grok validated config
    SCENARIOS="H1,H2,H3,H4,H5,H6,H7,H8,H9,H10"
    REPS=10
    DRIVER_MODEL="gpt-5.6-luna"
    EXECUTOR_MODEL="azure-openai-responses/grok-4.3"
    PROVIDER="azure-openai-responses"
    THINKING="high"
    EXECUTOR_THINKING="high"
    MAX_COST=30
    ;;
  *)
    echo "Usage: $0 {pilot|main|azure}"
    exit 1
    ;;
esac

echo "═══════════════════════════════════════════════════════════════"
echo "  Mode:        $MODE"
echo "  Scenarios:   $SCENARIOS"
echo "  Repetitions: $REPS"
echo "  Driver:      $DRIVER_MODEL ($PROVIDER)"
echo "  Executor:    $EXECUTOR_MODEL"
echo "  Max cost:    \$${MAX_COST}"
echo "═══════════════════════════════════════════════════════════════"
echo ""

OUTDIR="benchmarks/results/${MODE}-$(date +%Y-%m-%d)-${DRIVER_MODEL//[^a-zA-Z0-9]/_}"
mkdir -p "$OUTDIR"

# Save the config for reproducibility
cat > "$OUTDIR/config.env" <<ENVEOF
MODE=$MODE
SCENARIOS=$SCENARIOS
REPS=$REPS
DRIVER_MODEL=$DRIVER_MODEL
EXECUTOR_MODEL=$EXECUTOR_MODEL
PROVIDER=$PROVIDER
THINKING=$THINKING
MAX_COST=$MAX_COST
BATCH_QUEUE_EXECUTOR=$EXECUTOR_MODEL
ENVEOF

# ── Run ────────────────────────────────────────────────────────────────────────

CMD=(
  bun benchmarks/harness/run.ts
  --scenarios "$SCENARIOS"
  --conditions "native,batch-explicit,batch-objective"
  --reps "$REPS"
  --driver-model "$DRIVER_MODEL"
  --executor-model "$EXECUTOR_MODEL"
  --provider "$PROVIDER"
  --thinking "$THINKING"
  --max-cost-usd "$MAX_COST"
  --out "$OUTDIR"
)

if [ -n "${EXECUTOR_THINKING:-}" ]; then
  CMD+=(--executor-thinking "$EXECUTOR_THINKING")
fi

echo "Command: ${CMD[*]}"
echo "Started: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo ""

# Export executor env vars consumed by run.ts -> scenarios.ts
export BATCH_QUEUE_EXECUTOR="$EXECUTOR_MODEL"
export BATCH_QUEUE_GROUNDING_TURNS="3"
if [ -n "${EXECUTOR_THINKING:-}" ]; then
  export BATCH_QUEUE_EXECUTOR_THINKING="$EXECUTOR_THINKING"
fi

"${CMD[@]}"

# ── Aggregate ──────────────────────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Run complete. Generating aggregate report..."
echo "═══════════════════════════════════════════════════════════════"

bun benchmarks/harness/aggregate.ts "$OUTDIR"

echo ""
echo "  Report:  $OUTDIR/REPORT.md"
echo "  Data:    $OUTDIR/aggregate.json"
echo "  Raw:     $OUTDIR/runs.json"
echo ""
echo "Next steps:"
echo "  cat $OUTDIR/REPORT.md"
echo "  # Compare with previous runs:"
echo "  bun benchmarks/harness/aggregate.ts <previous-outdir>"
