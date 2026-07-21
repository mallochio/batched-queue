#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
HARBOR=${HARBOR:-"$ROOT/.venv_harbor/bin/harbor"}
PYTHON=${PYTHON:-"$ROOT/.venv_harbor/bin/python"}
TB_COMMIT=36d417f56c293b8271b306a0e4c566f58e98c153
TB_REPO="https://github.com/harbor-framework/terminal-bench-2-1.git@$TB_COMMIT"
AGENT=benchmarks.terminal_bench_agent:BatchedQueuePi
PI_VERSION=0.80.3
SEED=42
FIX_GIT_DIGEST=sha256:389b9c8247610c2c5be080b1ac00429007c2c69bf57f7f26c79f0f75ba2d5c74
TASKS=(fix-git modernize-scientific-stack nginx-request-logging)

cd "$ROOT"
export PYTHONPATH="$ROOT${PYTHONPATH:+:$PYTHONPATH}"

common=(
  --repo "$TB_REPO"
  --path tasks
  --agent "$AGENT"
  --n-concurrent 1
  --max-retries 0
)

case "${1:-validate}" in
  validate)
    "$PYTHON" benchmarks/terminal_bench_agent.py >/dev/null
    for task in "${TASKS[@]}"; do
      "$HARBOR" run "${common[@]}" --include-task-name "$task" \
        --model nop/nop --ak condition=native --print-config >/dev/null
    done
    printf 'Validated Terminal-Bench 2.1 commit %s, Pi %s, seed %s, tasks: %s\n' \
      "$TB_COMMIT" "$PI_VERSION" "$SEED" "${TASKS[*]}"
    ;;
  install-check)
    "$HARBOR" run "${common[@]}" --include-task-name fix-git \
      --model nop/nop --ak condition=batch --install-only \
      --job-name "bq-install-check" --jobs-dir benchmarks/results/terminal-bench
    actual=$(docker image inspect alexgshaw/fix-git:20260403 --format '{{join .RepoDigests "\n"}}')
    grep -q "@$FIX_GIT_DIGEST" <<<"$actual" || {
      echo "Unexpected fix-git image digest: $actual" >&2
      exit 1
    }
    ;;
  smoke)
    if [[ ${BQ_ALLOW_PAID_SMOKE:-0} != 1 ]]; then
      echo 'Refusing paid smoke run: set BQ_ALLOW_PAID_SMOKE=1 after approval.' >&2
      exit 2
    fi
    : "${BQ_MODEL:?Set BQ_MODEL to provider/model}"
    : "${BQ_THINKING:=high}"
    "$HARBOR" run "${common[@]}" --include-task-name fix-git \
      --model "$BQ_MODEL" --ak condition=batch --ak "thinking=$BQ_THINKING" \
      --job-name "bq-smoke-fix-git-batch-$(date -u +%Y%m%dT%H%M%SZ)" \
      --jobs-dir benchmarks/results/terminal-bench
    ;;
  *)
    echo "Usage: $0 [validate|install-check|smoke]" >&2
    exit 2
    ;;
esac
