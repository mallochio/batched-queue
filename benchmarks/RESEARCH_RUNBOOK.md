# Batched Queue: Master Research & Publication Runbook

**Goal:** Prepare a workshop paper for ICML / ICLR / NeurIPS demonstrating that migrating LLM coding agents from a single-step Sequential Read-Eval-Print-Loop (REPL) to a Queue-based Batch Architecture significantly improves task completion reliability and cuts network-bound latency.

For the current evidence audit and submission checklist, see
[`PUBLICATION_READINESS.md`](./PUBLICATION_READINESS.md). Do not treat the
interim Terminal-Bench prefix or unrepaired Phase 2 aggregates as final claims.

The central hypothesis is:
> *For short, dependent repository workflows, `batch_queue` reduces model/tool interaction turns while preserving action-level structure, shell state, failure boundaries, and final correctness.*

---

## 1. Experimental Conditions

Across all our experiments, we benchmark the following conditions against each other:
1. **Native (Sequential):** One dependent action per model/tool turn. The agent must wait for previous results.
2. **Batch-Explicit:** The agent uses `batch_queue` and provides the exact explicit action sequence, isolating execution advantage from planning.
3. **Batch-Objective:** The agent delegates an objective to a secondary planner model, which grounds and emits the action sequence.
4. **Parallel Native Tools (Control):** Used strictly for independent-action control scenarios.
5. **Monolithic Shell Script (Control):** Establishes a raw execution speed lower-bound (though lacking typed validation and workspace safety).

---

## 2. History of Experiments & Results

### Phase 1: Local Deterministic Pilot
*   **Scale:** 36 runs across 4 scenarios.
*   **Result:** All conditions completed the small synthetic suite. Batching reduced orchestration boundaries, but these environment-specific timings are mechanism evidence only.

### Phase 2: Cloud Scale-Up (July 20–21, 2026)
*   **Scale:** 1,440 episodes: 24 synthetic scenarios × 3 conditions × 20 repetitions.
*   **Model:** Azure OpenAI `gpt-5.6-luna` (thinking: high).
*   **Infrastructure:** GCP `n4-standard-8` via SkyPilot ($30 budget).
*   **Directional observations:** Native, batch-explicit, and batch-objective recorded 70%, 88%, and 86% verification rates respectively. Median model turns were 3, 2, and 2; median tool calls were 2, 1, and 1. Batch-explicit had modest aggregate latency improvement, while batch-objective was slower and more expensive.
*   **Scope:** Batch-explicit improved verification on 6 of 24 scenarios, tied on 17, and regressed on 1. The suite contains correlated variants over one fixture, so episodes are not independent task samples.

### Known validity issues
The archived Phase 2 report is retained for provenance, not as publication-ready evidence:

1. H8 and H10 reverify from `nested/` using the invalid relative path `scripts/check.sh`; all conditions scored zero.
2. H21's oracle requires both `fail` and `nonzero`, although its task predicate accepts either, favoring structured batch error wording.
3. Agent-visible `.bench/proof/` files are not hidden oracles.
4. Post-run reverification proves fixture validity, not that the agent performed every requested action.
5. Aggregate success currently uses `verificationPassed`; a timeout can therefore be counted as successful even when its outcome is `timeout`.
6. Several scenarios directly request persistent state or result binding unavailable as equivalent native primitives. These are mechanism tests, not general capability tests.
7. H22 is read-only; its result does not prove that batching prevents context loss or improves mutation safety.

Do not use the Phase 2 aggregate for a significance claim. Repair the harness and rerun only affected scenarios plus a small regression sample; do not repeat all 1,440 episodes.

---

## 3. Publication Strategy & Claims

Use **Terminal-Bench 2.1** for external validation across its 89 containerized tasks. Treat the custom H1–H24 suite as a mechanism study.

The hypothesis remains an empirical question. Do not predict a dramatic pass@1 gain or use “proves” language before the external results exist. The strongest claim supported by the current evidence is:

> For some short, dependent and stateful tool workflows, explicit batching reduces orchestration boundaries; its effects on resolution, latency, and cost are workload-dependent.

A workshop paper should report positive, null, and negative results and include:

* a neutral tool-availability comparison where the model may choose whether to use `batch_queue`;
* a forced native-sequential versus forced batch-explicit mechanism comparison;
* an executor-only ablation that replays the same frozen actions through sequential and batched execution;
* an unrestricted native baseline that may use compound shell commands;
* failure analysis for every task resolved by only one condition.

---

## 4. Cost-Conscious Execution Plan & Validation Gates

Follow `WORK-UNITS.md` and `terminal-bench/RUNBOOK.md`. Stop at the first failed gate; preserve artifacts and do not spend through a harness defect.

### Step 0: Repair the controlled harness

Before citing or rerunning H1–H24:

* fix H8, H10, and H21;
* place oracle specifications outside the agent-visible workspace;
* count only `outcome === "pass"` in headline success;
* compute per-run total cost before aggregation;
* record a randomization seed and execution order;
* analyze task families rather than treating repeated episodes as independent tasks.

Rerun the three affected scenarios and 3–5 representative regression scenarios with 3 repetitions per condition. A full 20-repetition rerun is unnecessary unless these checks reveal broader drift.

### Step 1: Pin and validate the Terminal-Bench adapter (Unit T1)

* Pin the exact Terminal-Bench 2.1 revision, 89-task list, container image digests, Pi version, queue commit, model deployment, permissions, timeout, concurrency, and budget.
* Ensure both conditions have the same underlying filesystem and shell authority. The only intended treatment difference is tool availability or the explicitly declared forced-use instruction.
* Run `bash benchmarks/terminal-bench/run.sh validate` at Budget Gate = $0; it resolves the pinned dataset and checks condition flags without starting a container or calling a model.

### Step 2: No-cost and tiny paid pilot (Unit E1)

Run configuration validation first, then one paid `fix-git` smoke episode. After that succeeds, run at most 3 representative tasks × 2 conditions × 1 repetition. Verify:

* fresh paired containers and task-owned tests;
* seeded within-task condition-order randomization;
* outcome taxonomy, timeout handling, and complete artifact retention;
* tool/action parsing, model turns, tokens, cost, and latency;
* no oracle or answer leakage;
* unrestricted native behavior is not artificially forced into a weak action pattern.

If any check fails, stop the job, preserve logs, repair, and repeat only the pilot.

### Step 3: Full-suite pass@1 (Unit E2)

After the pilot gate passes, run 89 tasks × 2 primary conditions once per task (178 episodes):

1. unrestricted native tools under a neutral task prompt;
2. the same native authority plus `batch_queue`, also under a neutral task prompt.

Use paired fresh containers and record the seeded condition order. Headline analysis must include:

* pass@1 with timeout, provider error, and invalid runs counted as failures;
* paired bootstrap confidence intervals over tasks;
* exact McNemar test for paired resolution outcomes;
* latency and cost over all tasks with the declared timeout/cost cap, plus a separately labeled jointly-resolved analysis;
* per-task outcomes and discordant-task failure analysis.

Cold-cache results are primary. Run warm-cache analysis only if the cache state can be defined and reproduced.

### Step 4: Minimal robustness block

Estimate stochasticity on a preregistered stratified subset of 20 tasks with 2 additional repetitions per condition (80 episodes). If budget permits, run one cheaper or open model on 20 tasks × 2 conditions (40 episodes); skip this second model before weakening the primary controls.

The publication target is therefore 258 required external episodes, or 298 with the second-model check—not a repeat of the 1,440-episode synthetic run.

### Step 5: Cheap ablations

Replay frozen action plans through sequential and batched executors without asking a model to replan. Measure orchestration latency, state persistence, binding, structured evidence size, and fast-fail behavior. These deterministic ablations should have zero or negligible model cost.

### Step 6: Draft the paper

Report task-level uncertainty, all exclusions, negative results, model/provider configuration, raw aggregate artifacts, and reproducible analysis commands. Use a bounded conclusion rather than claiming universal reliability or latency gains.

---

# Appendix: Historical Plans and Runbooks
The following sections contain the verbatim historical planning documents, work unit definitions, and validation rules that guided the earlier phases of this research. They are preserved here for historical context.



## Archive: DETERMINISTIC-PLAN.md

# Deterministic executor benchmark plan

## Purpose

Measure the mechanics that do not require a model provider:

- one batch versus repeated single-action execution;
- persistent shell state;
- result bindings;
- fast-fail and timeout behavior;
- workspace and mutation safety;
- output compactness and final-state equivalence.

This benchmark must not be presented as an end-to-end model-cost benchmark.

## Fixture

Create a temporary repository for every run. It should contain:

```text
fixture/
├── README.md
├── src/config-loader.ts
├── src/feature.ts
├── tests/config-loader.test.ts
└── nested/state.txt
```

The fixture must be recreated or reset between repetitions. Avoid network access, random data, and commands whose duration depends on external services.

## Scenarios

### D1 — dependent inspection

```text
grep for the config loader
→ read the matching source range
→ run the focused test
```

Compare one `executeBatch` call with three one-action calls through the same runner.

### D2 — persistent shell state

```text
cd nested
→ export BQ_BENCHMARK=value
→ print the current directory and variable
```

Assert that the second and third actions observe state created by earlier actions.

### D3 — result binding

```text
read a fixture marker with bindTo: marker
→ pass ${marker} to a later command
```

Use a shell-safe fixture value and separately test that raw interpolation is documented rather than escaped automatically.

### D4 — fast-fail

```text
print a first marker
→ exit non-zero
→ attempt a trailing mutation
```

Assert that the trailing mutation did not execute, the halt index is correct, and the failure reason is reported.

### D5 — timeout recovery

Run a bounded sleep that exceeds the action timeout, then execute a recovery command in a new batch. Assert that the recovered runner remains usable.

### D6 — workspace and mutation safety

Attempt an out-of-workspace read and a rejected `apply_diff`, then assert that the action is blocked and no outside file or trailing mutation changes.

### D7 — apply and verify

Apply a targeted diff to the fixture and run a deterministic syntax or content check in the same batch. Compare the final file and check result against the expected state.

## Controls

- **Batched:** one runner and one `executeBatch` call containing all dependent actions.
- **Unbatched:** one runner and one `executeBatch` call per action, preserving the same cwd between calls.
- **Fresh shell:** a new shell process for each bash action, where applicable.
- **Monolithic script:** one shell command containing equivalent operations, clearly labeled as a lower-bound control rather than a competing typed-action implementation.

## Measurements

For each scenario and condition, record:

- total wall-clock milliseconds;
- action count;
- executor-call count;
- shell-process count if observable;
- output bytes and result bytes;
- success/failure and halt metadata;
- final filesystem digest;
- final shell cwd;
- test/check exit status.

Run at least 30 repetitions for stable local timing. Report median, p95, and the full sample count. Correctness assertions must fail the benchmark rather than silently excluding a run.

## Acceptance criteria

The benchmark is useful if it demonstrates, without a model:

1. batched and unbatched dependent scenarios produce equivalent expected results;
2. shell state persists within a batch;
3. bindings resolve only after their producer action;
4. failed actions prevent later actions from running;
5. workspace and diff validation boundaries remain enforced;
6. timeout recovery works as documented.

Performance results should be treated as environment-specific. The stronger product claim is the combination of fewer orchestration boundaries with preserved safety and observability.


## Archive: MODEL-MEDIATED-PLAN.md

# Model-mediated benchmark plan

## Purpose

Measure whether `batch_queue` reduces model/tool interaction overhead on realistic dependent repository tasks while maintaining completion quality.

This benchmark is manual or nightly because it requires a configured Pi/OpenCode model provider and is affected by model, provider, cache, and network variance.

## Fixed task suite

Use isolated copies of the same small fixture repository for every run.

1. **Discover–inspect–verify:** locate a config loader, inspect the relevant lines, and run its focused check.
2. **Stateful shell:** change directory, set an environment variable, and use both in a later command.
3. **Bound result:** read a fixture value, bind it, and consume it in a later command.
4. **Failure boundary:** encounter a deliberate failing check and prove that a trailing mutation was not executed.
5. **Mutation–verify:** apply a targeted change and run a focused syntax/type/content check.
6. **Objective grounding:** ask for a repository-dependent read/check objective whose correct action sequence cannot be known from the prompt alone.
7. **Independent-action control:** perform unrelated searches where parallel tools are expected to be competitive or better.

Each task needs a deterministic completion predicate, such as a file digest, exact marker, test result, or expected structured report.

## Conditions

### A — Native sequential tools

The model uses ordinary `read`, `grep`, `find`, `ls`, and `bash` calls. Dependent actions must wait for the previous result.

### B — Explicit batch

The model receives the same task and uses `batch_queue` with an explicit action list. This isolates the execution advantage from objective planning.

### C — Objective batch

The model uses `batch_queue` with an objective. Record both the planning call and the resulting action execution. Do not attribute planner latency to the queue executor.

### D — Parallel control

Use only for scenario 7 or other genuinely independent actions. This prevents an unfair comparison where parallel execution violates dependencies.

### E — Monolithic shell control (optional)

Use one equivalent shell script. This establishes a raw execution lower bound, but it is not equivalent in typed validation, action visibility, or workspace safety.

## Instrumentation

Run each condition through the same Pi/OpenCode version, model, tool configuration, and fixture revision. Capture JSONL events or session logs containing:

```json
{
  "scenario": "discover-inspect-verify",
  "condition": "batch-explicit",
  "run": 1,
  "success": true,
  "elapsedMs": 0,
  "modelTurns": 0,
  "toolCalls": 0,
  "actions": 0,
  "perActionModelCalls": 0,
  "inputTokens": 0,
  "outputTokens": 0,
  "estimatedCostUsd": 0,
  "resultBytes": 0,
  "replans": 0,
  "verificationPassed": true,
  "haltReason": null
}
```

At minimum, collect:

- model request/turn count;
- tool-call count;
- action count;
- per-action model calls;
- elapsed wall time and p95;
- input/output tokens and cost where available;
- returned result bytes;
- successful completion and verification result;
- replan/retry count;
- number of actions correctly skipped after failure.

## Experimental controls

- Pin the model and reasoning settings.
- Use the same initial user prompt for all conditions.
- Randomize condition order.
- Run 20–30 repetitions per condition and scenario.
- Reset the fixture and session state between repetitions.
- Separate cold-cache and warm-cache runs.
- Record provider failures instead of silently dropping them.
- Use bootstrap confidence intervals or another documented comparison method.

## Hypotheses

The benchmark should test, not assume, these hypotheses:

1. Explicit batches require fewer model/tool turns than native sequential calls for dependent tasks.
2. Explicit batches reduce result/context overhead without reducing final correctness.
3. Objective batches add planning cost but can reduce manual action-selection effort.
4. Batch execution preserves state and failure boundaries better than a monolithic shell script.
5. Parallel native tools are preferable for independent work.
6. The advantage is largest for 3–10 short dependent actions and diminishes for one action or long-running commands.

## Recommended report

Report per-scenario medians and p95 values, followed by aggregate results:

```text
condition          median turns   median tool calls   success   median cost
native-sequential  ...             ...                 ...       ...
batch-explicit     ...             ...                 ...       ...
batch-objective    ...             ...                 ...       ...
parallel-control   ...             ...                 ...       ...
```

The final conclusion should describe the workload boundary, for example:

> `batch_queue` reduced interaction turns on short dependent repository tasks;
> parallel tools remained better for independent reads, and monolithic scripts
> remained a lower-level speed baseline but did not provide equivalent typed
> evidence or safety boundaries.


## Archive: PI-HEADLESS-HANDOFF.md

# Pi headless performance benchmark handoff

## Objective

Measure whether `batch_queue` improves short, dependent repository workflows when compared with native Pi tools, without overstating the result.

Primary claim to test:

> For 2–10 dependent repository actions, `batch_queue` reduces model/tool interaction turns and context overhead while preserving final correctness, shell state, result flow, and failure boundaries.

This plan measures **performance and interaction efficiency**, not general model intelligence.

## Current repository state

- Repository: `/home/ubuntu/repos/batched-queue`
- Benchmark branch: `devin/benchmark-pi-batched-queue`
- Pi version used for validation: `0.80.3`
- Extension entry point: `src/extension.ts`
- Existing headless tests:
  - `tests/headless-test.ts`
  - `tests/opencode-headless-test.ts`
  - `tests/agent-objective-test.ts` (requires provider credentials)
- Related plans:
  - `DETERMINISTIC-PLAN.md`
  - `MODEL-MEDIATED-PLAN.md`
  - `RESULTS-TEMPLATE.md`
  - `harness/README.md`

The current harness contains 24 deterministic scenarios (`H1`–`H24`) and
three primary conditions: native sequential, explicit batch, and objective
batch. These are controlled fixture tasks; they are not Terminal-Bench 2.1 or
SWE-bench tasks.

## First actions for the next session

```bash
cd /home/ubuntu/repos/batched-queue
git status --short --branch
bun run typecheck
bun node_modules/.bin/pi --version
```

Use a clean temporary fixture for every run. Do not benchmark by allowing the model to edit the batched-queue repository itself.

## Headless invocation model

Use Pi JSON event mode rather than print mode so the runner can count turns, tools, messages, and usage:

```bash
pi \
  --mode json \
  --no-session \
  --no-extensions \
  --no-context-files \
  --approve \
  --model "$MODEL" \
  --thinking low \
  --tools read,grep,find,ls,bash \
  "$PROMPT" \
  > "$EVENTS_JSONL" \
  2> "$STDERR_LOG"
```

`--no-session` prevents one repetition from affecting the next. `--no-extensions` gives a clean baseline; an explicit `-e` then loads only the extension under test:

```bash
pi \
  --mode json \
  --no-session \
  --no-extensions \
  --no-context-files \
  --approve \
  -e /tmp/batched-queue/src/extension.ts \
  --model "$MODEL" \
  --thinking low \
  --tools batch_queue \
  "$PROMPT" \
  > "$EVENTS_JSONL" \
  2> "$STDERR_LOG"
```

For a mutation scenario, add `edit,write` to the native allowlist. Keep the default benchmark read/check-only so both conditions have equivalent authority.

Do not use `--print` for the primary measurements: JSON mode exposes the event stream needed for instrumentation.

## Validated Azure matrix

The provider-validated configuration is:

```text
driver:   azure-openai-responses/gpt-5.6-luna
executor: azure-openai-responses/grok-4.3
thinking: high / high
Pi:       0.80.3
```

Azure objective mode requires the custom-deployment fallback in
`src/analyzer.ts`. Same-provider custom executor ids are resolved from the
active driver's transport configuration; reasoning is disabled on the clone
for deployments that reject encrypted reasoning content.

The 144-episode validation run cost $2.99 in reported usage and produced
directional results only: native 71% success, explicit batch 83%, and
objective batch 77%. Three runs timed out. Do not present these figures as
external-benchmark results or statistically conclusive marketing claims.

## Conditions

Run the same task prompt and fixture revision under these conditions:

### N — native sequential tools

```bash
--no-extensions --tools read,grep,find,ls,bash
```

The prompt must tell the model to use native tools one dependent step at a time.

### B — explicit batch

```bash
--no-extensions -e /tmp/batched-queue/src/extension.ts --tools batch_queue
```

The prompt must tell the model to use an explicit `actions` array. This isolates the executor benefit from objective planning.

### O — objective batch

Use the same extension invocation, but instruct the model to use `batch_queue` with an `objective` and not hand-author the action list.

Record objective-planner calls separately. If `BATCH_QUEUE_EXECUTOR` is set, record the extra execution-model request and its cost; do not hide it inside the main batch result.

### P — parallel control

Use only for a task whose actions are genuinely independent. This is a control for choosing the correct tool, not a direct competitor on dependent workflows.

## Fixture design

Generate a small deterministic repository per repetition:

```text
fixture/
├── README.md
├── config/project.json
├── src/config-loader.ts
├── src/feature.ts
├── tests/config-loader.test.ts
└── nested/state.txt
```

The fixture generator should:

- use a fixed seed or no randomness;
- write a unique temporary directory;
- avoid network and long-running commands;
- record the fixture commit or content digest;
- clean up after the run unless `KEEP_BENCHMARK_ARTIFACTS=1` is set.

## Headless task prompts

Keep prompts identical across conditions except for the required tool-selection instruction. Every task needs an objective completion predicate.

### H1 — dependent discovery, inspection, verification

```text
In this repository, locate the project configuration loader, inspect the relevant
source lines, and run the smallest focused check that verifies the loader. Use
[CONDITION-SPECIFIC TOOL INSTRUCTION]. Finish by reporting the exact verification
marker from the check. Do not edit files.
```

Expected shape: search → read → check.

### H2 — persistent shell state

```text
In this repository, verify the nested workspace state by changing into the
nested directory, setting a temporary environment variable, and using both the
cwd and variable in a later command. Use [CONDITION-SPECIFIC TOOL INSTRUCTION].
Do not edit files.
```

Expected shape: `cd` → `export` → consume state.

### H3 — result binding

```text
Read the benchmark marker from the fixture and use that observed value in a
later verification command. Use [CONDITION-SPECIFIC TOOL INSTRUCTION]. Do not
edit files.
```

For B, require an explicit `bindTo` action and `${name}` consumer. For N, allow the model to pass the observed value through its normal next turn.

### H4 — failure boundary

```text
Run the fixture's deliberate failing check. After it fails, do not perform any
trailing mutation or recovery action. Use [CONDITION-SPECIFIC TOOL INSTRUCTION].
Report what was skipped and why.
```

Expected batch behavior: fast-fail at the failing action and no execution of later actions.

### H5 — mutation and verification (optional second phase)

```text
Make the smallest targeted change requested by the fixture, then run the
focused verification. Use [CONDITION-SPECIFIC TOOL INSTRUCTION]. Report the
verification result and changed file.
```

Run this only after the read/check benchmark is stable. Native and batch conditions must have equivalent edit authority.

## External benchmark next phase

After the controlled suite is hardened:

1. Select Terminal-Bench tasks with deterministic tests and no network
   dependency; record the exact task revision and container image.
2. Run native and explicit batch first with the same driver model, permissions,
   timeout, and paired fresh containers. Keep objective mode separate because
   it adds planner-model behavior and cost.
3. Start with one pass per task, then repeat only the primary dependent subset
   if the effect is promising. Do not call the controlled fixture results a
   Terminal-Bench result.
4. Add a small SWE-bench subset only after the Terminal-Bench adapter and
   validator accounting are stable.

## JSON event extraction

Write a parser under `benchmarks/` or a temporary analysis directory. It should parse one JSON object per line and tolerate unknown future event types.

Count at minimum:

- `session` event: session id, cwd, start timestamp;
- `turn_start` / `turn_end`: model turn count;
- `tool_execution_start`: tool call count, tool names, supplied arguments;
- `tool_execution_end`: tool success/error count and result payload size;
- `message_end` where `message.role === "assistant"`: assistant messages;
- assistant `usage` fields when present: input, output, cache-read, cache-write tokens, and cost;
- `agent_end`: terminal completion;
- process exit code and timeout status.

Do not assume one exact usage schema. Preserve the raw `message.usage` object and normalize known numeric fields into the report.

For batch runs, additionally inspect the `batch_queue` tool result details where available:

- requested action count;
- completed action count;
- halted action index and reason;
- batch duration;
- shell cwd;
- reflection confidence and risks;
- bound result names;
- next-step hints.

## Metrics

### Primary performance metrics

- end-to-end wall-clock time;
- model turns;
- tool calls;
- per-action model calls;
- input tokens;
- output tokens;
- cache-read and cache-write tokens;
- estimated cost;
- result/context bytes returned;
- actions completed per model/tool turn.

Useful derived measures:

```text
turn_reduction = (native_turns - batch_turns) / native_turns
cost_reduction = (native_cost - batch_cost) / native_cost
context_reduction = (native_result_bytes - batch_result_bytes) / native_result_bytes
action_compression = completed_actions / tool_calls
```

For objective mode, report both:

```text
executor-only cost/latency
full objective-to-completion cost/latency
```

### Correctness and safety metrics

- task success rate;
- final output or file digest equivalence;
- verification pass rate;
- shell cwd/environment persistence;
- binding resolution success;
- correct skipped-action count after failure;
- workspace-boundary violations blocked;
- mutation validation failures detected;
- unexpected edits or side effects.

A faster run that fails correctness is not an improvement.

### Replanning metrics

- number of batches per completed task;
- number of halted batches followed by a successful replan;
- repeated or redundant actions;
- actions the model attempted after a batch already returned sufficient evidence;
- objective planner action-count accuracy.

## Repetition and analysis protocol

### Pilot

Run 3 repetitions per condition and scenario to validate:

- invocation flags;
- tool allowlists;
- fixture reset;
- JSON parser;
- completion predicates;
- provider authentication;
- artifact cleanup.

Do not publish pilot numbers.

### Main run

Run at least 20 repetitions per condition and scenario; use 30 where provider cost allows. Randomize condition order and separate cold-cache from warm-cache runs.

Report:

- sample count;
- success rate;
- median;
- p95;
- interquartile range;
- bootstrap confidence intervals for paired differences where possible;
- provider/model/reasoning configuration;
- excluded runs and exact reasons.

Use paired fixture seeds and prompt order so each condition sees equivalent work.

## Expected comparisons

The benchmark should test these hypotheses:

1. B uses fewer model/tool turns than N on H1–H3.
2. B has lower context/result overhead than N while maintaining correctness.
3. O may cost more than B because planning is an additional model-mediated step, but should reduce manual action-selection burden on repository-dependent tasks.
4. B preserves shell state and failure boundaries better than a monolithic shell script while exposing more structured evidence.
5. P is preferable to B for independent actions.
6. The advantage is largest for 3–10 short dependent actions and disappears for one action or long-running commands.

These are hypotheses, not conclusions.

## Artifacts

Store raw artifacts outside Git or under an ignored directory:

```text
benchmarks/results/
├── <date>-<model>-manifest.json
├── <date>-<model>/
│   ├── <scenario>-<condition>-<run>.jsonl
│   ├── <scenario>-<condition>-<run>.stderr.log
│   ├── <scenario>-<condition>-<run>.summary.json
│   └── fixture-digest.json
└── aggregate.json
```

Commit only:

- the benchmark runner and parser once implemented;
- the exact fixture/prompt manifest;
- aggregate Markdown reports;
- no raw model transcripts, credentials, or sensitive repository content.

## Completion criteria

The benchmark handoff is complete when:

- all pilot conditions run successfully;
- raw JSONL events parse without loss of unknown events;
- every scenario has a deterministic completion predicate;
- batch and native conditions have equivalent authority;
- at least 20 main repetitions per condition are recorded;
- results include cost/latency and correctness/safety metrics;
- failures and exclusions are documented;
- the final conclusion states the workload boundary rather than claiming universal superiority.

## Suggested next implementation commit

Implement only the measurement harness first:

1. fixture generator;
2. condition runner;
3. JSONL event parser;
4. completion-predicate checker;
5. aggregate JSON writer;
6. one Markdown report generated from aggregate data.

Do not modify queue execution behavior as part of the first benchmark commit. Benchmark the current implementation before making performance changes.


## Archive: README.md

# batched-queue benchmarks

This directory contains benchmark plans and result templates for demonstrating the specific value of `batch_queue` without overstating its scope.

The central hypothesis is:

> For short, dependent repository workflows, `batch_queue` reduces model/tool interaction turns while preserving action-level structure, shell state, failure boundaries, and final correctness.

This is intentionally narrower than a claim that `batch_queue` is faster for every workload. Independent actions should usually use parallel tool calls, and large durable DAGs should use a workflow/orchestration system.

## Benchmark plans

- [`DETERMINISTIC-PLAN.md`](./DETERMINISTIC-PLAN.md) — API-key-free executor and safety benchmark suitable for CI.
- [`MODEL-MEDIATED-PLAN.md`](./MODEL-MEDIATED-PLAN.md) — controlled Pi/OpenCode comparison using a fixed model and isolated fixtures.
- [`PI-HEADLESS-HANDOFF.md`](./PI-HEADLESS-HANDOFF.md) — executable handoff for measuring Pi JSON-mode sessions, token usage, latency, and correctness.
- [`harness/README.md`](./harness/README.md) — current executable commands,
  validated Azure configuration, and pre-external-benchmark checklist.
- [`RESULTS-TEMPLATE.md`](./RESULTS-TEMPLATE.md) — report template; do not fill it with unverified or cherry-picked results.
- [`WORK-UNITS.md`](./WORK-UNITS.md) — atomic delegation order, ownership
  contract, dependencies, and budget gates.
- [`harness/VALIDATOR-RUNBOOK.md`](./harness/VALIDATOR-RUNBOOK.md) —
  fixture-owned oracle contract and outcome taxonomy.
- [`harness/COST-RUNBOOK.md`](./harness/COST-RUNBOOK.md) — driver/planner/
  execution cost accounting and missing-cost rules.
- [`terminal-bench/RUNBOOK.md`](./terminal-bench/RUNBOOK.md) — external
  Terminal-Bench adapter stages and paid-run gate.

## Conditions to compare

1. Native sequential tools: one dependent action per model/tool turn.
2. `batch_queue` with explicit actions: the exact action sequence is supplied.
3. `batch_queue` with `objective`: the planner grounds and emits the action sequence.
4. Parallel native tools: only for independent-action control scenarios.
5. One monolithic shell script: optional lower-bound control; useful for showing what typed action structure and safety checks cost.

## Primary metrics

- model turns and tool calls;
- per-action model calls;
- wall-clock latency and p95 latency;
- input/output tokens and estimated cost;
- action/result bytes returned to the model;
- successful completion and final verification status;
- replans and retries;
- correct fast-fail behavior;
- shell cwd/environment persistence;
- final filesystem and test-result equivalence.

## Reporting rules

- Use fixed repository fixtures and deterministic checks.
- Randomize condition order to reduce warm-cache and provider drift effects.
- Run at least 20 repetitions per condition for model-mediated tests; report median and p95.
- Keep deterministic and provider-dependent results separate.
- Record raw JSONL data in an ignored results directory; commit only aggregate reports and reproducible configuration.
- Report failed runs and exclusions explicitly.
- Do not claim a speedup without accounting for objective-planning model calls.
- Do not compare `batch_queue` against parallel execution on a dependent workload as if they were interchangeable.
- The current H1–H24 suite is a controlled deterministic fixture suite, not
  Terminal-Bench 2.1 or SWE-bench. Use it for mechanism and provider
  validation; use a public benchmark for external capability claims.


## Archive: RESULTS-TEMPLATE.md

# batched-queue benchmark results

- Date:
- Commit:
- Pi/OpenCode version:
- Model/provider:
- Reasoning setting:
- Host platform:
- Fixture revision:
- Repetitions per condition:

## Scope

Describe the workload and which benchmark plan was followed:

- [ ] Deterministic executor plan
- [ ] Model-mediated plan

## Summary

| Condition | Median wall time | P95 wall time | Median model turns | Median tool calls | Success rate | Median cost |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Native sequential | — | — | — | — | — | — |
| Explicit batch | — | — | — | — | — | — |
| Objective batch | — | — | — | — | — | — |
| Parallel control | — | — | — | — | — | — |
| Monolithic script | — | — | — | — | — | — |

## Per-scenario results

| Scenario | Condition | Runs | Success rate | Median turns | Median actions | Median result bytes | Notes |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| Discover–inspect–verify | — | — | — | — | — | — | — |
| Stateful shell | — | — | — | — | — | — | — |
| Bound result | — | — | — | — | — | — | — |
| Failure boundary | — | — | — | — | — | — | — |
| Mutation–verify | — | — | — | — | — | — | — |
| Objective grounding | — | — | — | — | — | — | — |
| Independent-action control | — | — | — | — | — | — | — |

## Safety and correctness

- Final output equivalence:
- Shell-state checks:
- Binding checks:
- Fast-fail checks:
- Workspace-boundary checks:
- Mutation-validation checks:
- Runs excluded and reasons:

## Interpretation

State what the data supports and what it does not support. Avoid claiming universal speedups or model-quality improvements from a small benchmark.

## Raw data

- Raw JSONL path:
- Benchmark command:
- Fixture setup command:
- Analysis command:


## Archive: WORK-UNITS.md

# Benchmark work units

This file is the coordination runbook for follow-up benchmark work. Each unit
has one owner, one deliverable, and one validation boundary. Units may run in
parallel only when their file sets do not overlap.

## Unit order

| Unit | Deliverable | Depends on | Validation |
| --- | --- | --- | --- |
| V1 | Hidden filesystem/test oracles for H1–H24 | None | `bun test`, `bun run typecheck` |
| C1 | Direct objective planner cost accounting | None | cost fixtures + `bun test`, `bun run typecheck` |
| T1 | Terminal-Bench 2.1 adapter scaffold | None | adapter config tests; no paid run |
| E1 | External benchmark pilot | V1, C1, T1 | one paired task block, budget gate |
| E2 | Held-out confirmation | E1 passes correctness gate | frozen config, cold-cache report |

V1, C1, and T1 are atomic and can be delegated in parallel. E1 must not start
until all three are reviewed and the runbook entries are complete.

## Delegation contract

Every subagent must:

1. Work only in `mallochio/batched-queue`.
2. Keep its file set limited to the assigned unit.
3. Add or update that unit's runbook.
4. Add focused tests or configuration validation.
5. Run the required validation commands.
6. Commit its changes and report the commit/PR, files, tests, and unresolved
   risks.

Subagents must not claim Terminal-Bench results from the custom H1–H24 suite,
must not print credentials, and must not start paid benchmark runs without an
explicit budget gate.

## Unit V1 — hidden oracles

Replace transcript wording checks with fixture-owned proof files and
re-verification commands. Preserve paired fixture seeds across conditions.
Classify every run as `pass`, `fail`, `timeout`, `provider_error`, or `invalid`.
Keep proof files outside tracked fixture digests and grant equal authority to
all compared conditions.

## Unit C1 — objective cost

Report four buckets separately:

- driver model usage from Pi/OpenCode events;
- planner usage from nested `batch_queue` details;
- deterministic queue execution (`$0` model cost);
- total model cost, marked incomplete when any provider omits cost.

Key costs by `(provider, model)` and never infer planner usage by subtracting
top-level turns: planner calls are nested inside the batch tool execution.

## Unit T1 — Terminal-Bench adapter

Pin the Terminal-Bench Core dataset version and task list. Run two parity-checked
adapters that differ only in whether `batch_queue` is registered. Keep Docker,
provider credentials, model, timeout, permissions, and task revision identical.
Start with one no-cost configuration/pilot validation before any paid run.

## Current state

- The controlled H1–H24 suite is custom deterministic fixture data.
- PR #1, which added the current harness and provider runbook, is merged.
- The next implementation branch must remain separate from `main`.
- Child-session delegation may be unavailable when the organization quota is
  exhausted; if so, execute the same atomic unit locally and preserve this
  contract and runbook.


## Archive: README.md

# Pi benchmark harness

This harness measures the current `batched-queue` implementation in Pi JSON
event mode. It compares native sequential tools, explicit `batch_queue`
actions, and objective-planned batches on deterministic temporary fixtures.

The coordination contract is in [`../WORK-UNITS.md`](../WORK-UNITS.md).
Validator and cost requirements are maintained in
[`VALIDATOR-RUNBOOK.md`](./VALIDATOR-RUNBOOK.md) and
[`COST-RUNBOOK.md`](./COST-RUNBOOK.md).

## Prerequisites

- Run `bun install` from the repository root.
- Keep a provider credential in the environment. Validated providers include
  OpenAI, Azure OpenAI, Google Vertex, and Amazon Bedrock.
- Use `bun` to launch Pi. The Pi CLI's Node entrypoint is incompatible with
  the Node/undici version in some environments.
- Never print or commit credentials, service-account JSON, or raw transcripts.

## Pilot

Run three repetitions per scenario and condition while validating the harness:

```bash
bun benchmarks/harness/run.ts \
  --scenarios H1,H2,H3,H4 \
  --conditions native,batch-explicit,batch-objective \
  --reps 3 \
  --driver-model gpt-5.4-mini \
  --executor-model openai/gpt-5.4-nano \
  --provider openai \
  --thinking low \
  --out benchmarks/results/pilot

bun benchmarks/harness/aggregate.ts benchmarks/results/pilot
```

The runner randomizes condition order, creates a fresh fixture for every run,
stores raw JSONL/stderr/summary artifacts, and writes `manifest.json` and
`runs.json`. Results are ignored by Git; do not commit transcripts or
credentials.

## Azure validation

The validated Azure configuration keeps Luna as the driver and uses Grok as
the objective executor:

```bash
export AZURE_OPENAI_API_KEY="$AZURE_API_KEY"
export AZURE_OPENAI_RESOURCE_NAME="ih-foundry-resource"

bun benchmarks/harness/run.ts \
  --reps 2 \
  --driver-model gpt-5.6-luna \
  --provider azure-openai-responses \
  --thinking high \
  --executor-model azure-openai-responses/grok-4.3 \
  --executor-thinking high \
  --max-cost-usd 30 \
  --out benchmarks/results/azure-luna-grok
```

Objective mode accepts custom same-provider deployment ids. Custom Azure
executor clones disable reasoning because some deployments reject Pi's
`reasoning.encrypted_content` request field. The 24 scenarios in this run are
deterministic local fixtures, not Terminal-Bench or SWE-bench tasks.

## Main run

Use at least 20 repetitions per condition/scenario, randomize order, and
separate cold-cache and warm-cache runs. Pin the model, provider, thinking
level, Pi version, and queue commit. The report includes:

- model turns and tool calls;
- effective actions and action compression;
- input/output/cache tokens and estimated cost;
- result bytes and latency median/p95;
- completion-predicate success;
- batch counts and fast-fail metadata.

The result is an interaction-efficiency benchmark, not a general measure of
model intelligence. Compare objective-planner cost separately from the driver
and queue execution cost.

## Before an external benchmark run

1. Replace wording-sensitive predicates with hidden filesystem/test oracles.
2. Add direct accounting for objective-planner requests and cost.
3. Pin Pi, provider, model deployments, thinking levels, timeout, queue commit,
   task revision, and container image.
4. Run a small Terminal-Bench subset first, then a held-out subset; keep task
   order paired and randomized across native and explicit-batch conditions.
5. Report pass@1, paired success deltas, turns, tool calls, total cost, p95
   latency, timeouts, and all provider failures. Treat the task—not each
   condition run—as the statistical unit.


## Archive: RUN-HANDOFF.md

# Model-mediated benchmark handoff

Run the batch_queue model-mediated benchmark: 24 scenarios × 3 conditions × 20+ reps.

## Prerequisites

```bash
# From repo root
bun install
command -v pi           # Pi CLI installed (bun install does this)
echo "$OPENAI_API_KEY"  # or Azure/GCP/Bedrock key
```

## Quick start: pilot (3 reps, 4 scenarios, ~$0.50)

Validate the harness, auth, and invocation before the main run:

```bash
bash benchmarks/harness/handoff.sh pilot
```

This runs H1,H2,H3,H4 × native,batch-explicit,batch-objective × 3 reps.

## Main run (20 reps, 24 scenarios, ~$40-100)

```bash
bash benchmarks/harness/handoff.sh main
```

## Tested providers

| Provider | Driver model | Executor model | Cost/rep |
| --- | --- | --- | --- |
| OpenAI | `gpt-5.4-mini` | `openai/gpt-5.4-nano` | ~$0.02-0.05 |
| Azure (Luna+Grok) | `gpt-5.6-luna` | `azure-openai/grok-4.3` | ~$0.03-0.08 |

## Output

Results land in `benchmarks/results/<date>-<model>/` (gitignored).
After a run completes, aggregate:

```bash
bun benchmarks/harness/aggregate.ts benchmarks/results/<outdir>
```

This writes `REPORT.md` and `aggregate.json` in the results directory.

## Budget gate

The runner stops when cumulative observed cost reaches `--max-cost-usd`.
Default: $30. Every run is persisted to `runs.json` immediately, so you can
interrupt and resume by inspecting which runs are missing.

## Resume after interruption

```bash
# Find the last completed run tag:
ls benchmarks/results/<outdir>/*.summary.json | sort | tail -3

# Restart with the same command; the runner re-runs completed tags
# (they'll just be overwritten). To avoid re-running, move the outdir.
```


## Archive: VALIDATOR-RUNBOOK.md

# Validator runbook

## Purpose

Use fixture-owned proof artifacts and deterministic re-checks as the source of
truth for benchmark success. Do not decide correctness from the final assistant
message.

## Outcome taxonomy

Each run must have exactly one outcome:

- `pass`: all required oracle checks pass;
- `fail`: the agent completed but one or more oracle checks failed;
- `timeout`: the process exceeded the configured timeout;
- `provider_error`: authentication, model, quota, or provider request failure;
- `invalid`: the run violated the benchmark contract or produced unusable
  artifacts.

Timeouts and provider errors remain in the denominator for operational
reporting, but success rate should also expose the valid-run denominator.

Outcome classification is implemented in `parse-events.ts`:

- `timedOut` -> `timeout`;
- `!reachedAgentEnd` -> `provider_error`;
- `reachedAgentEnd && willRetry` -> `invalid`;
- otherwise the oracle result determines `pass` or `fail`.

## Oracle contract

An oracle receives:

```ts
type OracleContext = {
  fixtureDir: string;
  expected: FixtureExpectations;
  parsed: ParsedEvents;
  timedOut: boolean;
  readFixtureFile(path: string): string | null;
  reverify(command: string, timeoutMs: number): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }>;
};

type OracleResult = {
  passed: boolean;
  checks: Record<string, boolean>;
  note?: string;
};
```

The default oracle is `benchmarks/harness/oracles.ts` (`defaultOracle`). It
reads the proof spec from `.bench/proof/expected.json` and runs:

- `expectedSubstrings` checks against the final assistant text and every bash
  or batch tool output captured in `ParsedEvents.bashOutputs`;
- `reverifyCommand` executed in the fixture directory with an expected exit code
  (default `0`) and required output substrings;
- `forbiddenOutput` checks against `bashOutputs` to detect trailing actions
  after a deliberate failure;
- `noMutation` fixture-digest verification for read-only scenarios.

Oracles must be deterministic, side-effect bounded, and independent of
assistant wording. Proof files live under `.bench/proof/` and are excluded from
tracked fixture digests.

## Proof files

For every run `createFixture(scenarioId)` writes:

- `.bench/proof/expected.json` — the proof spec (`family`, `expectedSubstrings`,
  `reverifyCommand`, `expectedExitCode`, `reverifyOutputContains`,
  `forbiddenOutput`, `noMutation`);
- `.bench/proof/.digest` — the SHA-256 digest of the tracked fixture files,
  used when `noMutation` is true.

The scenario-to-proof mapping is in `benchmarks/harness/fixture.ts`
(`SCENARIO_PROOFS`).

## Scenario families

- Verify-family tasks (H1, H7, H20, H23): re-run `bash scripts/check.sh` and
  require the `VERIFY_OK token=VTOK-9C3` output plus the expected token in the
  agent text.
- Shell-state tasks (H2, H8, H18): re-run the nested `cd`, `BQ_VAR`, `pwd`, and
  `echo` sequence and require the expected `nested` directory and `STATE-88`
  value.
- Binding tasks (H3, H10, H19): re-run `sed` from `nested/state.txt` into
  `consumed:<marker>` and require that exact output.
- Failure-boundary tasks (H4, H12, H21): re-run `bash scripts/fail.sh`, expect
  exit code `3`, and forbid `VERIFY_OK` in any bash/batch output.
- Read-only tasks (H5, H6, H9, H13, H14, H15, H16, H17, H22, H24): re-read the
  relevant fixture files and compare the expected values to the agent text.
- Test tasks (H11, H15): re-run `bun test tests/config-loader.test.ts` and
  expect exit code `0` plus a passing result.
- No-mutation task (H23): in addition to the verify check, recompute the fixture
  digest ignoring `.bench/proof` and compare it to `.bench/proof/.digest`.

The exact scenario mapping belongs in `scenarios.ts`; this document defines the
contract, not a second source of truth.

## Validation

Run:

```bash
bun test
bun run typecheck
```

Before external runs, add a held-out fixture seed and verify that all three
conditions receive equal permissions.


## Archive: COST-RUNBOOK.md

# Cost accounting runbook

## Cost buckets

Every episode reports these buckets independently:

1. `driver`: the outer Pi/OpenCode session model;
2. `planner`: objective-to-actions model calls, including grounding retries;
3. `execution`: deterministic queue execution, with zero model cost;
4. `total`: driver plus planner, with completeness metadata.

Do not infer planner usage from top-level Pi turns. Objective planner calls are
nested inside the `batch_queue` tool execution.

## Instrumentation

- `src/planner-usage.ts` defines a normalized `PlannerUsage` shape and an
  accumulator that sums across multiple planner calls.
- `src/analyzer.ts` (`analyzeBatchObjective` / `planBatchWithGrounding`) forwards
  the underlying Pi `complete()` `usage` into the accumulator and returns
  `{ payload, plannerUsage }`.
- `src/execute-batch-queue.ts` passes the planner usage through the execute
  result.
- `src/extension.ts` includes `plannerUsage` in the `batch_queue` tool result
  `details`.
- `src/opencode/analyzer.ts` captures `data.info.usage` when OpenCode exposes it.
- `benchmarks/harness/parse-events.ts` extracts `details.plannerUsage` from each
  `batch_queue` `tool_execution_end` event and aggregates across replans.
- `benchmarks/harness/aggregate.ts` reports driver, planner, and total cost
  columns, and only marks cost complete when every bucket reports a non-zero
  cost or has zero tokens.

## Required fields

Usage records should preserve raw provider data and normalize:

```ts
type ModelUsage = {
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  costUsd?: number;
  raw?: unknown;
};
```

Planner details include the model reference, call count, aggregate usage, and
`costComplete`. Aggregate reports key subtotals by `(provider, model)`.

## Missing cost

Azure and other providers may expose tokens without a USD amount. Preserve the
tokens, set `costComplete=false`, and report a partial total rather than
inventing a price. Explicit-action conditions have no planner bucket.

## Validation

Synthetic usage fixtures test:

- multiple `batch_queue` planner calls;
- missing cost when tokens are present;
- explicit batches with zero planner calls;
- `costComplete` propagation into `RunSummary`.

Run:

```bash
bun test benchmarks/harness/cost-accounting.test.ts
bun test tests/planner-usage.test.ts
```

Do not run paid provider validation as part of unit tests.


## Archive: RUNBOOK.md

# Terminal-Bench adapter runbook

This is the external validation path. The custom H1–H24 fixture suite must
never be reported as Terminal-Bench.

## Adapter scaffold

- `benchmarks/terminal-bench/types.ts` — Terminal-Bench task and manifest types.
- `benchmarks/terminal-bench/adapter.ts` — native and explicit-batch Pi adapter
  factory plus parity checking.
- `benchmarks/terminal-bench/run.ts` — no-op CLI for validation and dry-run.
- `benchmarks/terminal-bench/adapter.test.ts` — parity and no-execution tests.

## Atomic stages

1. Pin the Terminal-Bench Core dataset version and commit a task list.
2. Implement parity-checked native and explicit-batch Pi adapters.
3. Verify both adapters expose identical tools except for `batch_queue`.
4. Run one no-cost configuration/pilot block.
5. Run the frozen held-out block only after the correctness gate passes.

## Required controls

- same task revision and container image;
- same model/provider, permissions, timeout, and Pi version;
- paired fresh containers per task and condition;
- randomized condition order;
- cold-cache headline results; warm-cache results reported separately;
- raw task outcomes retained, including provider errors and timeouts.

## Budget gate

Do not launch a paid run until the following are recorded in the manifest:

```text
terminal-bench version
adapter commit
Pi version
model/provider
timeout and concurrency
USD/session budget
```

The `run.ts` scaffold always reports `budgetUsdPerSession: 0` and `taskCount: 0`
until a dataset is explicitly provided. Use `--validate` and `--dry-run` to
confirm adapter parity without incurring cost.

## Validation

```bash
bun run benchmarks/terminal-bench/run.ts --validate
bun run benchmarks/terminal-bench/run.ts --dry-run
bun test benchmarks/terminal-bench/adapter.test.ts
```

The first external claim should use pass@1 task resolution and paired
confidence intervals. Efficiency metrics are secondary and must be reported
on jointly resolved tasks.


## Archive: July 20 Empirical Results (REPORT.md)

# batched-queue Pi headless benchmark results

Generated by `benchmarks/harness/aggregate.ts`. Numbers reflect the committed queue implementation with no behavioural changes.

## Configuration

- date: 2026-07-20T17:21:30.233Z
- provider: azure-openai-responses
- driver model: gpt-5.6-luna
- objective executor model: azure-openai-responses/gpt-5.6-luna
- thinking: high
- repetitions per cell: 20
- pi version: 0.80.3
- commit: 71180c8
- total runs: 1440 (12 timed out)

> Pilot-scale sample. Per the benchmark reporting rules, a headline speedup claim needs ≥20 reps/cell and separated cold/warm-cache runs. Treat small-n medians as directional.


## Scenario H5

| condition | n | success | med turns | med tool calls | med actions | action compression | med cost (USD) | med planner cost (USD) | med total cost (USD) | med result bytes | med latency (s) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| batch-objective | 20 | 100% | 2 | 1 | 1 | 1.00x | $0.00862 | $0.00707 | $0.01569 | 813 | 9.9 |
| batch-explicit | 20 | 100% | 2 | 1 | 2 | 2.00x | $0.01477 | $0.00000 | $0.01477 | 539 | 8.4 |
| native | 20 | 100% | 2 | 1 | 1 | 1.00x | $0.00573 | $0.00000 | $0.00573 | 62 | 5.0 |

Reduction vs native (positive = fewer/cheaper):

| condition | turns | tool calls | total cost | result bytes |
| --- | --- | --- | --- | --- |
| batch-objective | -0% | -0% | +174% | +1211% |
| batch-explicit | -0% | -0% | +158% | +769% |


## Scenario H8

| condition | n | success | med turns | med tool calls | med actions | action compression | med cost (USD) | med planner cost (USD) | med total cost (USD) | med result bytes | med latency (s) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| batch-objective | 20 | 0% | 2 | 1 | 5 | 3.33x | $0.01692 | $0.07260 | $0.08952 | 3,695 | 60.4 |
| batch-explicit | 20 | 0% | 5 | 4 | 12 | 2.82x | $0.06539 | $0.00000 | $0.06539 | 3,949 | 31.2 |
| native | 20 | 0% | 12 | 11 | 11 | 1.00x | $0.06597 | $0.00000 | $0.06597 | 1,291 | 43.2 |

Reduction vs native (positive = fewer/cheaper):

| condition | turns | tool calls | total cost | result bytes |
| --- | --- | --- | --- | --- |
| batch-objective | -83% | -91% | +36% | +186% |
| batch-explicit | -58% | -64% | -1% | +206% |


## Scenario H15

| condition | n | success | med turns | med tool calls | med actions | action compression | med cost (USD) | med planner cost (USD) | med total cost (USD) | med result bytes | med latency (s) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| batch-objective | 20 | 100% | 2 | 1 | 1 | 1.00x | $0.01038 | $0.01006 | $0.02044 | 1,278 | 12.1 |
| batch-explicit | 20 | 100% | 2 | 1 | 2 | 2.00x | $0.01120 | $0.00000 | $0.01120 | 882 | 6.5 |
| native | 20 | 100% | 3 | 2 | 2 | 1.00x | $0.01095 | $0.00000 | $0.01095 | 327 | 9.8 |

Reduction vs native (positive = fewer/cheaper):

| condition | turns | tool calls | total cost | result bytes |
| --- | --- | --- | --- | --- |
| batch-objective | -33% | -50% | +87% | +291% |
| batch-explicit | -33% | -50% | +2% | +170% |


## Scenario H13

| condition | n | success | med turns | med tool calls | med actions | action compression | med cost (USD) | med planner cost (USD) | med total cost (USD) | med result bytes | med latency (s) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| batch-objective | 20 | 100% | 2 | 1 | 1 | 1.00x | $0.00885 | $0.00919 | $0.01804 | 789 | 11.7 |
| batch-explicit | 20 | 100% | 2 | 1 | 2 | 2.00x | $0.01299 | $0.00000 | $0.01299 | 532 | 7.8 |
| native | 20 | 100% | 2 | 1 | 1 | 1.00x | $0.00570 | $0.00000 | $0.00570 | 69 | 5.3 |

Reduction vs native (positive = fewer/cheaper):

| condition | turns | tool calls | total cost | result bytes |
| --- | --- | --- | --- | --- |
| batch-objective | -0% | -0% | +217% | +1043% |
| batch-explicit | -0% | -0% | +128% | +671% |


## Scenario H9

| condition | n | success | med turns | med tool calls | med actions | action compression | med cost (USD) | med planner cost (USD) | med total cost (USD) | med result bytes | med latency (s) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| batch-objective | 20 | 95% | 3 | 2 | 3 | 1.50x | $0.01534 | $0.01365 | $0.02899 | 1,204 | 20.1 |
| batch-explicit | 20 | 100% | 2 | 1 | 3 | 3.00x | $0.01123 | $0.00000 | $0.01123 | 632 | 6.8 |
| native | 20 | 25% | 4 | 3 | 3 | 1.00x | $0.01295 | $0.00000 | $0.01295 | 154 | 10.9 |

Reduction vs native (positive = fewer/cheaper):

| condition | turns | tool calls | total cost | result bytes |
| --- | --- | --- | --- | --- |
| batch-objective | -25% | -33% | +124% | +682% |
| batch-explicit | -50% | -67% | -13% | +310% |


## Scenario H4

| condition | n | success | med turns | med tool calls | med actions | action compression | med cost (USD) | med planner cost (USD) | med total cost (USD) | med result bytes | med latency (s) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| batch-objective | 20 | 95% | 2 | 1 | 1 | 1.00x | $0.00989 | $0.00864 | $0.01853 | 998 | 11.9 |
| batch-explicit | 20 | 100% | 2 | 1 | 1 | 1.00x | $0.01076 | $0.00000 | $0.01076 | 453 | 5.7 |
| native | 20 | 100% | 2 | 1 | 1 | 1.00x | $0.00625 | $0.00000 | $0.00625 | 42 | 5.6 |

Reduction vs native (positive = fewer/cheaper):

| condition | turns | tool calls | total cost | result bytes |
| --- | --- | --- | --- | --- |
| batch-objective | -0% | -0% | +196% | +2275% |
| batch-explicit | -0% | -0% | +72% | +979% |


## Scenario H24

| condition | n | success | med turns | med tool calls | med actions | action compression | med cost (USD) | med planner cost (USD) | med total cost (USD) | med result bytes | med latency (s) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| batch-objective | 20 | 85% | 3 | 2 | 2 | 1.00x | $0.01497 | $0.01031 | $0.02528 | 1,441 | 28.1 |
| batch-explicit | 20 | 100% | 2 | 1 | 2 | 2.00x | $0.01028 | $0.00000 | $0.01028 | 827 | 5.8 |
| native | 20 | 100% | 3 | 2 | 2 | 1.00x | $0.00941 | $0.00000 | $0.00941 | 364 | 7.0 |

Reduction vs native (positive = fewer/cheaper):

| condition | turns | tool calls | total cost | result bytes |
| --- | --- | --- | --- | --- |
| batch-objective | -0% | -0% | +169% | +296% |
| batch-explicit | -33% | -50% | +9% | +127% |


## Scenario H21

| condition | n | success | med turns | med tool calls | med actions | action compression | med cost (USD) | med planner cost (USD) | med total cost (USD) | med result bytes | med latency (s) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| batch-objective | 20 | 100% | 2 | 1 | 1 | 1.00x | $0.00948 | $0.00909 | $0.01857 | 1,018 | 11.9 |
| batch-explicit | 20 | 100% | 2 | 1 | 2 | 2.00x | $0.01290 | $0.00000 | $0.01290 | 517 | 6.8 |
| native | 20 | 15% | 2 | 1 | 1 | 1.00x | $0.00595 | $0.00000 | $0.00595 | 42 | 5.3 |

Reduction vs native (positive = fewer/cheaper):

| condition | turns | tool calls | total cost | result bytes |
| --- | --- | --- | --- | --- |
| batch-objective | -0% | -0% | +212% | +2324% |
| batch-explicit | -0% | -0% | +117% | +1131% |


## Scenario H18

| condition | n | success | med turns | med tool calls | med actions | action compression | med cost (USD) | med planner cost (USD) | med total cost (USD) | med result bytes | med latency (s) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| batch-objective | 20 | 100% | 2 | 1 | 2 | 2.00x | $0.01069 | $0.02928 | $0.03998 | 1,526 | 23.9 |
| batch-explicit | 20 | 100% | 2 | 1 | 2 | 2.00x | $0.01077 | $0.00000 | $0.01077 | 577 | 5.9 |
| native | 20 | 0% | 3 | 2 | 2 | 1.00x | $0.01415 | $0.00000 | $0.01415 | 31 | 11.0 |

Reduction vs native (positive = fewer/cheaper):

| condition | turns | tool calls | total cost | result bytes |
| --- | --- | --- | --- | --- |
| batch-objective | -33% | -50% | +183% | +4823% |
| batch-explicit | -33% | -50% | -24% | +1761% |


## Scenario H11

| condition | n | success | med turns | med tool calls | med actions | action compression | med cost (USD) | med planner cost (USD) | med total cost (USD) | med result bytes | med latency (s) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| batch-objective | 20 | 80% | 3 | 2 | 3 | 2.00x | $0.01424 | $0.04136 | $0.05560 | 2,859 | 33.2 |
| batch-explicit | 20 | 60% | 3 | 2 | 4 | 2.00x | $0.03397 | $0.00000 | $0.03397 | 2,397 | 16.8 |
| native | 20 | 70% | 5 | 4 | 4 | 1.00x | $0.01927 | $0.00000 | $0.01927 | 2,575 | 13.4 |

Reduction vs native (positive = fewer/cheaper):

| condition | turns | tool calls | total cost | result bytes |
| --- | --- | --- | --- | --- |
| batch-objective | -50% | -63% | +189% | +11% |
| batch-explicit | -40% | -50% | +76% | -7% |


## Scenario H7

| condition | n | success | med turns | med tool calls | med actions | action compression | med cost (USD) | med planner cost (USD) | med total cost (USD) | med result bytes | med latency (s) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| batch-objective | 20 | 100% | 2 | 1 | 3 | 2.75x | $0.01256 | $0.03287 | $0.04543 | 3,573 | 29.4 |
| batch-explicit | 20 | 100% | 2 | 1 | 4 | 3.00x | $0.02494 | $0.00000 | $0.02494 | 2,297 | 13.2 |
| native | 20 | 100% | 6 | 5 | 5 | 1.00x | $0.02294 | $0.00000 | $0.02294 | 1,263 | 15.3 |

Reduction vs native (positive = fewer/cheaper):

| condition | turns | tool calls | total cost | result bytes |
| --- | --- | --- | --- | --- |
| batch-objective | -67% | -80% | +98% | +183% |
| batch-explicit | -67% | -80% | +9% | +82% |


## Scenario H10

| condition | n | success | med turns | med tool calls | med actions | action compression | med cost (USD) | med planner cost (USD) | med total cost (USD) | med result bytes | med latency (s) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| batch-objective | 20 | 0% | 2 | 1 | 2 | 1.17x | $0.01036 | $0.02272 | $0.03308 | 1,426 | 20.7 |
| batch-explicit | 20 | 0% | 3 | 2 | 5 | 3.00x | $0.02240 | $0.00000 | $0.02240 | 1,320 | 12.1 |
| native | 20 | 0% | 4 | 3 | 3 | 1.00x | $0.01588 | $0.00000 | $0.01588 | 67 | 11.0 |

Reduction vs native (positive = fewer/cheaper):

| condition | turns | tool calls | total cost | result bytes |
| --- | --- | --- | --- | --- |
| batch-objective | -50% | -67% | +108% | +2028% |
| batch-explicit | -25% | -33% | +41% | +1869% |


## Scenario H1

| condition | n | success | med turns | med tool calls | med actions | action compression | med cost (USD) | med planner cost (USD) | med total cost (USD) | med result bytes | med latency (s) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| batch-objective | 20 | 100% | 3 | 2 | 3 | 2.00x | $0.01394 | $0.04212 | $0.05606 | 3,411 | 37.4 |
| batch-explicit | 20 | 100% | 3 | 2 | 4 | 2.00x | $0.03184 | $0.00000 | $0.03184 | 2,212 | 17.8 |
| native | 20 | 100% | 4 | 3 | 3 | 1.00x | $0.01684 | $0.00000 | $0.01684 | 882 | 13.0 |

Reduction vs native (positive = fewer/cheaper):

| condition | turns | tool calls | total cost | result bytes |
| --- | --- | --- | --- | --- |
| batch-objective | -38% | -50% | +233% | +287% |
| batch-explicit | -25% | -33% | +89% | +151% |


## Scenario H2

| condition | n | success | med turns | med tool calls | med actions | action compression | med cost (USD) | med planner cost (USD) | med total cost (USD) | med result bytes | med latency (s) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| batch-objective | 20 | 100% | 3 | 2 | 4 | 2.00x | $0.01565 | $0.04378 | $0.05943 | 2,603 | 32.4 |
| batch-explicit | 20 | 100% | 2 | 1 | 2 | 2.00x | $0.01071 | $0.00000 | $0.01071 | 540 | 5.4 |
| native | 20 | 100% | 4 | 3 | 3 | 1.00x | $0.02554 | $0.00000 | $0.02554 | 110 | 15.0 |

Reduction vs native (positive = fewer/cheaper):

| condition | turns | tool calls | total cost | result bytes |
| --- | --- | --- | --- | --- |
| batch-objective | -25% | -33% | +133% | +2266% |
| batch-explicit | -50% | -67% | -58% | +391% |


## Scenario H22

| condition | n | success | med turns | med tool calls | med actions | action compression | med cost (USD) | med planner cost (USD) | med total cost (USD) | med result bytes | med latency (s) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| batch-objective | 20 | 65% | 6 | 5 | 9 | 2.00x | $0.04230 | $0.17799 | $0.22029 | 11,620 | 121.6 |
| batch-explicit | 20 | 100% | 8 | 7 | 14 | 2.15x | $0.07125 | $0.00000 | $0.07125 | 4,897 | 37.9 |
| native | 20 | 45% | 12 | 11 | 11 | 1.00x | $0.04815 | $0.00000 | $0.04815 | 725 | 38.2 |

Reduction vs native (positive = fewer/cheaper):

| condition | turns | tool calls | total cost | result bytes |
| --- | --- | --- | --- | --- |
| batch-objective | -50% | -55% | +358% | +1504% |
| batch-explicit | -38% | -41% | +48% | +576% |


## Scenario H23

| condition | n | success | med turns | med tool calls | med actions | action compression | med cost (USD) | med planner cost (USD) | med total cost (USD) | med result bytes | med latency (s) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| batch-objective | 20 | 70% | 5 | 4 | 9 | 2.00x | $0.00979 | $0.29306 | $0.30285 | 15,337 | 235.1 |
| batch-explicit | 20 | 100% | 5 | 4 | 11 | 2.75x | $0.08135 | $0.00000 | $0.08135 | 5,810 | 35.9 |
| native | 20 | 100% | 9 | 8 | 8 | 1.00x | $0.04885 | $0.00000 | $0.04885 | 2,516 | 37.0 |

Reduction vs native (positive = fewer/cheaper):

| condition | turns | tool calls | total cost | result bytes |
| --- | --- | --- | --- | --- |
| batch-objective | -44% | -50% | +520% | +510% |
| batch-explicit | -44% | -50% | +67% | +131% |


## Scenario H14

| condition | n | success | med turns | med tool calls | med actions | action compression | med cost (USD) | med planner cost (USD) | med total cost (USD) | med result bytes | med latency (s) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| batch-objective | 20 | 100% | 3 | 2 | 1 | 1.00x | $0.01022 | $0.00950 | $0.01972 | 950 | 15.6 |
| batch-explicit | 20 | 100% | 2 | 1 | 2 | 2.00x | $0.01285 | $0.00000 | $0.01285 | 592 | 8.1 |
| native | 20 | 100% | 2 | 1 | 1 | 1.00x | $0.00654 | $0.00000 | $0.00654 | 132 | 6.4 |

Reduction vs native (positive = fewer/cheaper):

| condition | turns | tool calls | total cost | result bytes |
| --- | --- | --- | --- | --- |
| batch-objective | +25% | +50% | +202% | +619% |
| batch-explicit | -0% | -0% | +96% | +348% |


## Scenario H16

| condition | n | success | med turns | med tool calls | med actions | action compression | med cost (USD) | med planner cost (USD) | med total cost (USD) | med result bytes | med latency (s) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| batch-objective | 20 | 90% | 2 | 1 | 2 | 2.00x | $0.00950 | $0.01132 | $0.02083 | 1,045 | 15.2 |
| batch-explicit | 20 | 100% | 2 | 1 | 2 | 2.00x | $0.01056 | $0.00000 | $0.01056 | 540 | 6.9 |
| native | 20 | 30% | 3 | 2 | 2 | 1.00x | $0.00927 | $0.00000 | $0.00927 | 131 | 7.4 |

Reduction vs native (positive = fewer/cheaper):

| condition | turns | tool calls | total cost | result bytes |
| --- | --- | --- | --- | --- |
| batch-objective | -33% | -50% | +125% | +697% |
| batch-explicit | -33% | -50% | +14% | +312% |


## Scenario H3

| condition | n | success | med turns | med tool calls | med actions | action compression | med cost (USD) | med planner cost (USD) | med total cost (USD) | med result bytes | med latency (s) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| batch-objective | 20 | 100% | 2 | 1 | 1 | 1.00x | $0.00944 | $0.00851 | $0.01795 | 754 | 11.6 |
| batch-explicit | 20 | 100% | 3 | 2 | 4 | 2.00x | $0.01936 | $0.00000 | $0.01936 | 1,158 | 9.8 |
| native | 20 | 100% | 3 | 2 | 2 | 1.00x | $0.00893 | $0.00000 | $0.00893 | 42 | 7.1 |

Reduction vs native (positive = fewer/cheaper):

| condition | turns | tool calls | total cost | result bytes |
| --- | --- | --- | --- | --- |
| batch-objective | -33% | -50% | +101% | +1694% |
| batch-explicit | -0% | -0% | +117% | +2656% |


## Scenario H19

| condition | n | success | med turns | med tool calls | med actions | action compression | med cost (USD) | med planner cost (USD) | med total cost (USD) | med result bytes | med latency (s) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| batch-objective | 20 | 100% | 2 | 1 | 3 | 2.00x | $0.00999 | $0.02059 | $0.03058 | 1,271 | 22.0 |
| batch-explicit | 20 | 50% | 2 | 1 | 2 | 2.00x | $0.01668 | $0.00000 | $0.01668 | 563 | 8.8 |
| native | 20 | 0% | 3 | 2 | 2 | 1.00x | $0.01177 | $0.00000 | $0.01177 | 42 | 10.3 |

Reduction vs native (positive = fewer/cheaper):

| condition | turns | tool calls | total cost | result bytes |
| --- | --- | --- | --- | --- |
| batch-objective | -33% | -50% | +160% | +2925% |
| batch-explicit | -33% | -50% | +42% | +1239% |


## Scenario H17

| condition | n | success | med turns | med tool calls | med actions | action compression | med cost (USD) | med planner cost (USD) | med total cost (USD) | med result bytes | med latency (s) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| batch-objective | 20 | 95% | 2 | 1 | 2 | 2.00x | $0.00958 | $0.01076 | $0.02033 | 946 | 13.4 |
| batch-explicit | 20 | 100% | 2 | 1 | 2 | 2.00x | $0.01457 | $0.00000 | $0.01457 | 608 | 7.9 |
| native | 20 | 100% | 3 | 2 | 2 | 1.00x | $0.00961 | $0.00000 | $0.00961 | 46 | 8.7 |

Reduction vs native (positive = fewer/cheaper):

| condition | turns | tool calls | total cost | result bytes |
| --- | --- | --- | --- | --- |
| batch-objective | -33% | -50% | +112% | +1957% |
| batch-explicit | -33% | -50% | +52% | +1222% |


## Scenario H12

| condition | n | success | med turns | med tool calls | med actions | action compression | med cost (USD) | med planner cost (USD) | med total cost (USD) | med result bytes | med latency (s) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| batch-objective | 20 | 100% | 2 | 1 | 1 | 1.00x | $0.01038 | $0.00973 | $0.02011 | 1,018 | 11.8 |
| batch-explicit | 20 | 100% | 2 | 1 | 1 | 1.00x | $0.01264 | $0.00000 | $0.01264 | 453 | 7.1 |
| native | 20 | 100% | 2 | 1 | 1 | 1.00x | $0.00692 | $0.00000 | $0.00692 | 42 | 6.0 |

Reduction vs native (positive = fewer/cheaper):

| condition | turns | tool calls | total cost | result bytes |
| --- | --- | --- | --- | --- |
| batch-objective | -0% | -0% | +191% | +2323% |
| batch-explicit | -0% | -0% | +83% | +979% |


## Scenario H20

| condition | n | success | med turns | med tool calls | med actions | action compression | med cost (USD) | med planner cost (USD) | med total cost (USD) | med result bytes | med latency (s) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| batch-objective | 20 | 100% | 2 | 1 | 1 | 1.00x | $0.00977 | $0.01169 | $0.02146 | 1,102 | 13.9 |
| batch-explicit | 20 | 100% | 4 | 3 | 3 | 1.17x | $0.02086 | $0.00000 | $0.02086 | 2,092 | 10.8 |
| native | 20 | 100% | 4 | 3 | 3 | 1.00x | $0.01343 | $0.00000 | $0.01343 | 1,114 | 9.8 |

Reduction vs native (positive = fewer/cheaper):

| condition | turns | tool calls | total cost | result bytes |
| --- | --- | --- | --- | --- |
| batch-objective | -43% | -60% | +60% | -1% |
| batch-explicit | +14% | +20% | +55% | +88% |


## Scenario H6

| condition | n | success | med turns | med tool calls | med actions | action compression | med cost (USD) | med planner cost (USD) | med total cost (USD) | med result bytes | med latency (s) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| batch-objective | 20 | 100% | 2 | 1 | 2 | 1.00x | $0.01015 | $0.01918 | $0.02933 | 2,372 | 17.5 |
| batch-explicit | 20 | 100% | 3 | 2 | 3 | 1.50x | $0.02124 | $0.00000 | $0.02124 | 2,132 | 13.1 |
| native | 20 | 100% | 3 | 2 | 2 | 1.00x | $0.01027 | $0.00000 | $0.01027 | 1,155 | 7.6 |

Reduction vs native (positive = fewer/cheaper):

| condition | turns | tool calls | total cost | result bytes |
| --- | --- | --- | --- | --- |
| batch-objective | -33% | -50% | +186% | +105% |
| batch-explicit | -0% | -0% | +107% | +85% |

## Aggregate across scenarios

| condition | success | med turns | med tool calls | driver cost (USD) | planner cost (USD) | total cost (USD) | med result bytes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| batch-objective | 86% | 2 | 1 | $0.01041 | $0.01420 | $0.02461 | 1,251 |
| batch-explicit | 88% | 2 | 1 | $0.01485 | $0.00000 | $0.01485 | 827 |
| native | 70% | 3 | 2 | $0.01174 | $0.00000 | $0.01174 | 132 |

## Interpretation

The hypothesis under test is that for short dependent repository workflows, `batch_queue` reduces model/tool interaction turns and context overhead while preserving correctness. Read the per-scenario tables above: batch conditions should show fewer model/tool turns for dependent work at equal success. Result bytes are reported separately because the queue intentionally returns structured action evidence and can therefore be larger than terse native output. Batch-objective may cost more because planning is an extra model-mediated step.

