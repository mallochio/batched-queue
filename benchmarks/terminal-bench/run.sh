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
  adaptive)
    if [[ ${BQ_ALLOW_PAID_ADAPTIVE:-0} != 1 ]]; then
      echo 'Refusing adaptive run: set BQ_ALLOW_PAID_ADAPTIVE=1 after approval.' >&2
      exit 2
    fi
    : "${BQ_STRATEGY:=classifier}"
    : "${BQ_CLASSIFIER_ARTIFACT:=benchmarks/mode_router/artifacts/classifier_v1}"
    : "${BQ_LEDGER:=benchmarks/terminal-bench/discordance_ledger.json}"
    : "${BQ_THINKING:=high}"
    run_dir=${BQ_ADAPTIVE_DIR:-"benchmarks/results/terminal-bench/adaptive-slice-$(date -u +%Y%m%dT%H%M%SZ)"}
    mkdir -p "$run_dir"
    "$PYTHON" - "$BQ_STRATEGY" "$BQ_CLASSIFIER_ARTIFACT" "$BQ_LEDGER" "$run_dir" <<'PY'
import json, sys, os
from pathlib import Path
from benchmarks.mode_router.instructions import load_instruction
from benchmarks.mode_router.policy import ModePolicy
strategy, artifact, ledger_path, run_dir = sys.argv[1:]
ledger = json.loads(Path(ledger_path).read_text(encoding="utf-8"))
tasks = ledger["tasks"]
from benchmarks.mode_router.eval_slice import select_stratified_slice
slice_tasks = select_stratified_slice(ledger)
policy = ModePolicy(strategy, classifier_artifact=Path(artifact))
rows=[]
decisions=[]
for task in slice_tasks:
    info = tasks[task]
    inst = info.get("instruction") or load_instruction(task)
    dec = policy.decide(task, inst)
    mode = dec["mode"]
    outcome = info[mode].get("outcome") or "skipped_missing"
    rows.append({
        "task": task, "condition": "adaptive", "routed_mode": mode,
        "outcome": "pass" if outcome=="pass" else "fail",
        "reward": 1.0 if outcome=="pass" else 0.0,
        "agentSeconds": info[mode].get("seconds"),
        "turns": info[mode].get("turns"),
        "toolCalls": info[mode].get("tool_calls"),
        "costUsd": info[mode].get("cost_usd"),
        "batchModes": {}, "batchActionsRequested":0, "maxBatchActions":0,
        "inputTokens":0,"cacheTokens":0,"outputTokens":0,
    })
    decisions.append({"task":task,"mode":mode,"score":dec.get("score"),"features":dec.get("features")})
summary={"runs":rows}
Path(run_dir,"summary.json").write_text(json.dumps(summary,indent=2),encoding="utf-8")
Path(run_dir,"mode-decisions.jsonl").write_text("\n".join(json.dumps(d) for d in decisions)+"\n",encoding="utf-8")
# Inline paired analysis (mirrors benchmarks/terminal-bench/analyze.py without package import)
pairs={}
for r in rows: pairs.setdefault(r["task"],{})["adaptive"]=r["routed_mode"]
passed=sum(1 for r in rows if r["outcome"]=="pass")
print(json.dumps({
  "adaptive_tasks": len(rows),
  "adaptive_pass": passed,
  "adaptive_pass_rate": passed/len(rows) if rows else 0,
  "routed_modes": {m: sum(1 for r in rows if r["routed_mode"]==m) for m in {"native","batch"}},
  "total_cost_usd": sum(r["costUsd"] or 0 for r in rows),
}, indent=2))
PY
    ;;
  adaptive-full)
    if [[ ${BQ_ALLOW_PAID_FULL:-0} != 1 || ${BQ_ALLOW_PAID_ADAPTIVE:-0} != 1 ]]; then
      echo 'Refusing paid adaptive-full run: set BQ_ALLOW_PAID_FULL=1 and BQ_ALLOW_PAID_ADAPTIVE=1 after approval.' >&2
      exit 2
    fi
    : "${BQ_MODEL:?Set BQ_MODEL to provider/model}"
    : "${BQ_THINKING:=high}"
    : "${BQ_MAX_MODE_ROUTER_COST_USD:=55.00}"
    : "${BQ_STRATEGY:=classifier}"
    : "${BQ_CLASSIFIER_ARTIFACT:=benchmarks/mode_router/artifacts/classifier_v1}"
    if [[ -n $(git status --porcelain) ]]; then
      echo 'Refusing adaptive-full run from a dirty tree; commit the frozen harness first.' >&2
      exit 2
    fi
    checkout=$(dataset_checkout)
    run_dir=${BQ_RUN_DIR:-"benchmarks/results/terminal-bench/adaptive-full-$(date -u +%Y%m%dT%H%M%SZ)"}
    mkdir -p "$run_dir"
    if [[ ! -f "$run_dir/plan.txt" ]]; then
      all_tasks=()
      while IFS= read -r task; do all_tasks+=("$task"); done < <(
        find "$checkout/tasks" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sort
      )
      make_plan "${all_tasks[@]}" > "$run_dir/plan.txt"
    fi
    while read -r task _ _; do
      [[ -f "$run_dir/$task-adaptive/result.json" ]] && continue
      spent=$("$PYTHON" benchmarks/terminal-bench/summarize.py "$run_dir" --cost-only)
      "$PYTHON" - "$spent" "$BQ_MAX_MODE_ROUTER_COST_USD" <<'PY'
import sys
if float(sys.argv[1]) >= float(sys.argv[2]):
    raise SystemExit(f"Adaptive-full cost gate reached: ${float(sys.argv[1]):.4f} >= ${float(sys.argv[2]):.2f}")
PY
      "$HARBOR" run "${common[@]}" --include-task-name "$task" \
        --model "$BQ_MODEL" --ak "policy_strategy=$BQ_STRATEGY" \
        --ak "policy_artifact=$BQ_CLASSIFIER_ARTIFACT" \
        --ak "condition=native" --ak "thinking=$BQ_THINKING" \
        --job-name "$task-adaptive" --jobs-dir "$run_dir"
      require_valid_job "$run_dir/$task-adaptive"
    done < "$run_dir/plan.txt"
    "$PYTHON" benchmarks/terminal-bench/summarize.py "$run_dir" | tee "$run_dir/summary.json"
    ;;
  adaptive-tri)
    # Unified internally-consistent run: native + batch + adaptive for every task,
    # all under a single BQ_MODEL, so the three conditions are directly comparable.
    if [[ ${BQ_ALLOW_PAID_FULL:-0} != 1 || ${BQ_ALLOW_PAID_ADAPTIVE:-0} != 1 ]]; then
      echo 'Refusing paid adaptive-tri run: set BQ_ALLOW_PAID_FULL=1 and BQ_ALLOW_PAID_ADAPTIVE=1 after approval.' >&2
      exit 2
    fi
    : "${BQ_MODEL:?Set BQ_MODEL to provider/model}"
    : "${BQ_THINKING:=high}"
    : "${BQ_MAX_MODE_ROUTER_COST_USD:=200.00}"
    : "${BQ_CLASSIFIER_ARTIFACT:=benchmarks/mode_router/artifacts/classifier_v1}"
    if [[ -n $(git status --porcelain) ]]; then
      echo 'Refusing adaptive-tri run from a dirty tree; commit the frozen harness first.' >&2
      exit 2
    fi
    checkout=$(dataset_checkout)
    run_dir=${BQ_RUN_DIR:-"benchmarks/results/terminal-bench/adaptive-tri-$(date -u +%Y%m%dT%H%M%SZ)"}
    mkdir -p "$run_dir"
    if [[ ! -f "$run_dir/plan.txt" ]]; then
      all_tasks=()
      while IFS= read -r task; do all_tasks+=("$task"); done < <(
        find "$checkout/tasks" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sort
      )
      make_plan "${all_tasks[@]}" > "$run_dir/plan.txt"
    fi
    while read -r task _ _; do
      for cond in native batch adaptive; do
        job="$task-$cond"
        [[ -f "$run_dir/$job/result.json" ]] && continue
        spent=$("$PYTHON" benchmarks/terminal-bench/summarize.py "$run_dir" --cost-only)
        "$PYTHON" - "$spent" "$BQ_MAX_MODE_ROUTER_COST_USD" <<'PY'
import sys
if float(sys.argv[1]) >= float(sys.argv[2]):
    raise SystemExit(f"adaptive-tri cost gate reached: ${float(sys.argv[1]):.4f} >= ${float(sys.argv[2]):.2f}")
PY
        if [[ "$cond" == "adaptive" ]]; then
          "$HARBOR" run "${common[@]}" --include-task-name "$task" \
            --model "$BQ_MODEL" --ak "policy_strategy=classifier" \
            --ak "policy_artifact=$BQ_CLASSIFIER_ARTIFACT" \
            --ak "condition=native" --ak "thinking=$BQ_THINKING" \
            --job-name "$job" --jobs-dir "$run_dir"
        else
          "$HARBOR" run "${common[@]}" --include-task-name "$task" \
            --model "$BQ_MODEL" --ak "condition=$cond" --ak "thinking=$BQ_THINKING" \
            --job-name "$job" --jobs-dir "$run_dir"
        fi
        require_valid_job "$run_dir/$job"
      done
    done < "$run_dir/plan.txt"
    "$PYTHON" benchmarks/terminal-bench/summarize.py "$run_dir" | tee "$run_dir/summary.json"
    ;;
  *)
    echo "Usage: $0 [validate|install-check|smoke|pilot|full|adaptive|adaptive-full|adaptive-tri|summarize <dir>]" >&2
    exit 2
    ;;
esac
