#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
HARBOR=${HARBOR:-"$ROOT/.venv/bin/harbor"}
PYTHON=${PYTHON:-"$ROOT/.venv/bin/python"}
TB_COMMIT=36d417f56c293b8271b306a0e4c566f58e98c153
TB_REPO="https://github.com/harbor-framework/terminal-bench-2-1.git@$TB_COMMIT"
AGENT=benchmarks.terminal_bench_agent:BatchedQueuePi
PI_VERSION=0.80.3
SEED=42
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

image_spec() {
  case "$1" in
    fix-git) echo 'alexgshaw/fix-git:20260403|sha256:389b9c8247610c2c5be080b1ac00429007c2c69bf57f7f26c79f0f75ba2d5c74' ;;
    modernize-scientific-stack) echo 'alexgshaw/modernize-scientific-stack:20251031|sha256:64e69cee13bf6b0b9016e735b51891bce996a60f1e2d1a005bf12c949e221d71' ;;
    nginx-request-logging) echo 'alexgshaw/nginx-request-logging:20251031|sha256:693e64431a0dbf45952e8b91a298d54fd60247e501c6623fb8fa3ebc07fc3d3d' ;;
    *) return 1 ;;
  esac
}

check_images() {
  local task spec image digest actual
  for task in "${TASKS[@]}"; do
    spec=$(image_spec "$task")
    image=${spec%%|*}
    digest=${spec#*|}
    actual=$(docker image inspect "$image" --format '{{join .RepoDigests "\n"}}' 2>/dev/null) || {
      echo "Missing image $image; run install-check first." >&2
      return 1
    }
    grep -q "@$digest" <<<"$actual" || {
      echo "Unexpected $task image digest: $actual" >&2
      return 1
    }
  done
}

make_plan() {
  "$PYTHON" - "$SEED" "$@" <<'PY'
import random, sys
rng = random.Random(int(sys.argv[1]))
for task in sys.argv[2:]:
    conditions = ["native", "batch"]
    rng.shuffle(conditions)
    print(task, *conditions)
PY
}

pilot_plan() {
  make_plan "${TASKS[@]}"
}

require_valid_job() {
  local job_dir=$1 outcome
  outcome=$("$PYTHON" benchmarks/terminal-bench/summarize.py "$job_dir" |
    "$PYTHON" -c 'import json,sys; rows=json.load(sys.stdin)["runs"]; print(rows[0]["outcome"] if rows else "invalid")')
  case "$outcome" in
    invalid|provider_error)
      echo "Stopping after harness/provider failure in $job_dir ($outcome)." >&2
      return 1
      ;;
  esac
}

dataset_checkout() {
  local checkout="$ROOT/.cache/terminal-bench-2-1"
  if [[ ! -d "$checkout/.git" ]]; then
    git clone -q https://github.com/harbor-framework/terminal-bench-2-1.git "$checkout"
  fi
  git -C "$checkout" fetch -q origin "$TB_COMMIT"
  git -C "$checkout" checkout -q --detach "$TB_COMMIT"
  printf '%s\n' "$checkout"
}

case "${1:-validate}" in
  validate)
    "$PYTHON" benchmarks/terminal_bench_agent.py >/dev/null
    for task in "${TASKS[@]}"; do
      "$HARBOR" run "${common[@]}" --include-task-name "$task" \
        --model nop/nop --ak condition=native --print-config >/dev/null
    done
    pilot_plan
    printf 'Validated Terminal-Bench 2.1 commit %s, Pi %s, seed %s.\n' \
      "$TB_COMMIT" "$PI_VERSION" "$SEED"
    ;;
  install-check)
    for task in "${TASKS[@]}"; do
      spec=$(image_spec "$task")
      docker pull "${spec%%|*}" >/dev/null
    done
    "$HARBOR" run "${common[@]}" --include-task-name fix-git \
      --model nop/nop --ak condition=batch --install-only \
      --job-name "bq-install-check-$(date -u +%Y%m%dT%H%M%SZ)" \
      --jobs-dir benchmarks/results/terminal-bench
    check_images
    ;;
  smoke)
    if [[ ${BQ_ALLOW_PAID_SMOKE:-0} != 1 ]]; then
      echo 'Refusing paid smoke run: set BQ_ALLOW_PAID_SMOKE=1 after approval.' >&2
      exit 2
    fi
    : "${BQ_MODEL:?Set BQ_MODEL to provider/model}"
    : "${BQ_THINKING:=high}"
    check_images
    "$HARBOR" run "${common[@]}" --include-task-name fix-git \
      --model "$BQ_MODEL" --ak condition=batch --ak "thinking=$BQ_THINKING" \
      --job-name "bq-smoke-fix-git-batch-$(date -u +%Y%m%dT%H%M%SZ)" \
      --jobs-dir benchmarks/results/terminal-bench
    ;;
  pilot)
    if [[ ${BQ_ALLOW_PAID_PILOT:-0} != 1 ]]; then
      echo 'Refusing paid pilot: set BQ_ALLOW_PAID_PILOT=1 after approval.' >&2
      exit 2
    fi
    : "${BQ_MODEL:?Set BQ_MODEL to provider/model}"
    : "${BQ_THINKING:=high}"
    : "${BQ_MAX_PILOT_COST_USD:=2.00}"
    check_images
    pilot_dir="benchmarks/results/terminal-bench/pilot-$(date -u +%Y%m%dT%H%M%SZ)"
    mkdir -p "$pilot_dir"
    pilot_plan > "$pilot_dir/plan.txt"
    printf '{"terminalBenchCommit":"%s","piVersion":"%s","seed":%s,"model":"%s","thinking":"%s"}\n' \
      "$TB_COMMIT" "$PI_VERSION" "$SEED" "$BQ_MODEL" "$BQ_THINKING" > "$pilot_dir/manifest.json"

    while read -r task first second; do
      for condition in "$first" "$second"; do
        spent=$("$PYTHON" benchmarks/terminal-bench/summarize.py "$pilot_dir" --cost-only)
        "$PYTHON" - "$spent" "$BQ_MAX_PILOT_COST_USD" <<'PY'
import sys
if float(sys.argv[1]) >= float(sys.argv[2]):
    raise SystemExit(f"Pilot cost gate reached: ${float(sys.argv[1]):.4f} >= ${float(sys.argv[2]):.2f}")
PY
        "$HARBOR" run "${common[@]}" --include-task-name "$task" \
          --model "$BQ_MODEL" --ak "condition=$condition" --ak "thinking=$BQ_THINKING" \
          --job-name "$task-$condition" --jobs-dir "$pilot_dir"
      done
    done < "$pilot_dir/plan.txt"

    "$PYTHON" benchmarks/terminal-bench/summarize.py "$pilot_dir" | tee "$pilot_dir/summary.json"
    ;;
  full)
    if [[ ${BQ_ALLOW_PAID_FULL:-0} != 1 ]]; then
      echo 'Refusing paid full run: set BQ_ALLOW_PAID_FULL=1 after approval.' >&2
      exit 2
    fi
    : "${BQ_MODEL:?Set BQ_MODEL to provider/model}"
    : "${BQ_THINKING:=high}"
    : "${BQ_MAX_FULL_COST_USD:=30.00}"
    if [[ -n $(git status --porcelain) ]]; then
      echo 'Refusing full run from a dirty tree; commit the frozen harness first.' >&2
      exit 2
    fi
    adapter_commit=$(git rev-parse HEAD)
    checkout=$(dataset_checkout)
    run_dir=${BQ_RUN_DIR:-"benchmarks/results/terminal-bench/full-$(date -u +%Y%m%dT%H%M%SZ)"}
    mkdir -p "$run_dir"
    if [[ ! -f "$run_dir/plan.txt" ]]; then
      all_tasks=()
      while IFS= read -r task; do all_tasks+=("$task"); done < <(
        find "$checkout/tasks" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sort
      )
      make_plan "${all_tasks[@]}" > "$run_dir/plan.txt"
      printf '{"terminalBenchCommit":"%s","adapterCommit":"%s","piVersion":"%s","seed":%s,"model":"%s","thinking":"%s"}\n' \
        "$TB_COMMIT" "$adapter_commit" "$PI_VERSION" "$SEED" "$BQ_MODEL" "$BQ_THINKING" > "$run_dir/manifest.json"
    fi

    while read -r task first second; do
      for condition in "$first" "$second"; do
        [[ -f "$run_dir/$task-$condition/result.json" ]] && continue
        spent=$("$PYTHON" benchmarks/terminal-bench/summarize.py "$run_dir" --cost-only)
        "$PYTHON" - "$spent" "$BQ_MAX_FULL_COST_USD" <<'PY'
import sys
if float(sys.argv[1]) >= float(sys.argv[2]):
    raise SystemExit(f"Full-run cost gate reached: ${float(sys.argv[1]):.4f} >= ${float(sys.argv[2]):.2f}")
PY
        "$HARBOR" run "${common[@]}" --include-task-name "$task" \
          --model "$BQ_MODEL" --ak "condition=$condition" --ak "thinking=$BQ_THINKING" \
          --job-name "$task-$condition" --jobs-dir "$run_dir"
        require_valid_job "$run_dir/$task-$condition"
      done
    done < "$run_dir/plan.txt"
    "$PYTHON" benchmarks/terminal-bench/summarize.py "$run_dir" | tee "$run_dir/summary.json"
    ;;
  summarize)
    : "${2:?Usage: $0 summarize <job-directory>}"
    "$PYTHON" benchmarks/terminal-bench/summarize.py "$2"
    ;;
  *)
    echo "Usage: $0 [validate|install-check|smoke|pilot|full|summarize <dir>]" >&2
    exit 2
    ;;
esac
