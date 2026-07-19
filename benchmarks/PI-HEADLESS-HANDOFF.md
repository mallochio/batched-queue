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
