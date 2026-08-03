# Plan 001: Make objective mode evidence-gated and bounded

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. If a STOP condition occurs, stop and report; do not improvise. When complete, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 7f24bb4..HEAD -- src/analyzer.ts src/opencode/analyzer.ts src/execute-batch-queue.ts src/config.ts src/payload.ts src/schemas.ts src/guards.ts src/format-batch-result.ts src/extension.ts src/opencode/plugin.ts tests/analyzer-grounding.test.ts tests/execute-batch-queue.test.ts tests/opencode-objective-test.ts tests/agent-objective-test.ts`
>
> If any in-scope file changed, compare the current code to the excerpts below. Stop if the control flow or interfaces no longer match.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `7f24bb4`, 2026-07-27

## Why this matters

Objective mode can report a successful batch without accomplishing the requested objective. In a live run, the planner executed only `ls -la` and the outer agent claimed success without reading `buggy.py` or finding the requested defect. This is a controller failure: valid action JSON and successful process exits are treated as proof of objective completion. The corrected protocol must gather concrete evidence, evaluate that evidence against the original objective, and either continue with a bounded follow-up batch or return an explicit incomplete result rather than a false success.

## Current state

- `src/analyzer.ts` is the Pi objective planner.
  - `analyzerSystemPrompt()` says grounding is optional: `src/analyzer.ts:165-171` says the model “may call” inspect tools.
  - `planBatchWithGrounding()` permits a model to return a tool-call or textual batch on every turn. It immediately returns a parsed payload at `src/analyzer.ts:467-488`, before inspect calls are considered at `src/analyzer.ts:491-509`.
  - Therefore the default `groundingTurns: 3` is a maximum turn count, not a minimum evidence requirement.
- `src/config.ts` defines `groundingTurns` as “may take before it must submit” and defaults it to `3` at `src/config.ts:46-49` and `src/config.ts:85-88`.
- `src/execute-batch-queue.ts` resolves exactly one objective payload at `src/execute-batch-queue.ts:96-109`, executes it once at `src/execute-batch-queue.ts:126-127`, and returns its action result. It never compares the original objective or the plan’s `reflection.successCriteria` with execution evidence.
- `src/payload.ts:3-8` defines `PlanReflection.successCriteria`, but it is advisory metadata only. `src/format-batch-result.ts:27-30` displays it, and no source file enforces it.
- `src/opencode/analyzer.ts:160-198` is a separate one-shot planner: it opens an ephemeral session, parses one structured payload, and returns it. It has no grounding loop or post-execution evaluation.
- `tests/analyzer-grounding.test.ts:17-49` tests the happy path where the model voluntarily inspects, then submits. It has no test proving that premature JSON is rejected or that an objective is evaluated after execution.
- `tests/agent-objective-test.ts:92-113` considers any non-error result containing either “batch completed” or `read_lines` successful; it does not prove the stated objective was satisfied.
- The repository’s public contract is stronger than the implementation: `README.md:3-5` says “Replan from evidence” and describes a tool that returns structured evidence for the next planning decision.

### Required protocol

Objective mode needs a bounded evidence loop, shared by Pi and OpenCode:

1. Before the first executable batch, require at least one successful read/grep grounding observation when grounding is enabled. A direct JSON batch or `submit_action_batch` call before that observation is not accepted; preserve it only as rejected planner output and prompt for grounding.
2. Execute a bounded action batch and retain a compact, structured evidence view: action index, action type, success/failure, requested input, and bounded stdout/stderr/read/grep output already produced by `BatchExecutionResult`.
3. Ask the configured objective model to return a strict verdict against the immutable original objective and the evidence: `complete` with evidence citations, or `continue` with the next safe action payload. A verdict cannot be `complete` unless it cites at least one successful action result.
4. Run at most a new, explicit configurable number of objective rounds. If the cap is reached, evidence is insufficient, an action fails, or the verdict is malformed, return an incomplete/error result with the objective, evidence summary, and a follow-up recommendation. Never label that result as objective completion.
5. Preserve explicit `actions` mode as one-shot and model-free. It must not gain objective verification calls.

A semantic verifier is necessary because no deterministic rule can tell whether arbitrary natural-language objectives (for example, “find the division bug”) were met by arbitrary command output. Citation requirements and a bounded loop make the model decision auditable and prevent the prior blind-success path; they do not claim to prove arbitrary model reasoning.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install dependencies | `bun install` | exit 0 |
| Typecheck | `bun run typecheck` | exit 0, no TypeScript errors |
| Unit tests | `bun test` | all tests pass |
| Full project tests | `bun test && bun run tests/smoke-test.ts && bun run tests/headless-test.ts && bun run tests/opencode-smoke-test.ts && bun run tests/opencode-headless-test.ts && bun run tests/opencode-objective-test.ts && bun run tests/opencode-schemas.test.ts && bun run tests/opencode-apply-diff-test.ts` | all commands exit 0 |
| Pi smoke test | `cd /tmp/advtest && pi -p --no-session "Use batch_queue in objective mode only to find the division bug in buggy.py."` | reports evidence from `buggy.py:3`, not only a directory listing |
| omp smoke test | `cd /tmp/advtest && omp -p --no-session "Use batch_queue in objective mode only to find the division bug in buggy.py."` | reports evidence from `buggy.py:3`; refresh provider credentials first if omp reports expired AWS SSO |

## Scope

**In scope**

- `src/config.ts`
- `src/payload.ts`
- `src/schemas.ts`
- `src/guards.ts`
- `src/analyzer.ts`
- `src/opencode/analyzer.ts`
- `src/execute-batch-queue.ts`
- `src/format-batch-result.ts`
- `src/extension.ts`
- `src/opencode/plugin.ts`
- Existing focused tests under `tests/`
- `README.md` configuration and behavior documentation
- `plans/README.md`

**Out of scope**

- Explicit `actions` execution semantics, executor safety policies, and action implementations.
- `src/lib/file-mutation-queue.ts` and the Pi/omp module-resolution compatibility layer.
- Benchmark score claims or Terminal-Bench methodology.
- Automatic retries of failed shell commands. A failed action must remain evidence of an incomplete objective unless a subsequent planner round intentionally chooses a different safe action.
- More than the bounded follow-up rounds configured by this plan.

## Git workflow

- Branch: `advisor/001-objective-evidence-loop`.
- Make logical commits using the repository’s imperative style, for example `Make batch validation compatible with Pi and Oh My Pi`.
- Do not push or open a PR unless the operator explicitly requests it.

## Steps

### Step 1: Characterize the premature-completion paths before changing interfaces

In `tests/analyzer-grounding.test.ts`, add deterministic scripted-model tests using the existing `PlanBatchDeps.complete` and `runInspect` injection points:

1. With `groundingTurns: 1`, return a direct JSON/text batch on turn one without an inspect call. Assert the planner does not return that payload; it must request/await grounding and either accept a later inspected plan or fail with a clear evidence-required error.
2. With grounding enabled, return a successful inspect tool call and then a valid batch. Preserve the existing acceptance behavior.
3. Test malformed inspection arguments and inspect failures: they must not count as successful grounding evidence.
4. Add tests that the original objective is retained unchanged through all planned rounds.

Use the existing test at `tests/analyzer-grounding.test.ts:17-49` as the style and dependency-injection pattern. Do not use a live model in these unit tests.

**Verify**: `bun test tests/analyzer-grounding.test.ts` exits 0 and includes the new premature-batch regression case.

### Step 2: Define the shared objective-round and verdict data contract

Add small, explicit types in `src/payload.ts` or a new focused source file if that keeps all source files under 300 lines:

- `ObjectiveRound`: original objective, round number, submitted payload, and `BatchExecutionResult` evidence.
- `ObjectiveVerdict`: discriminated union with exactly:
  - `complete`: a concise summary and a non-empty list of cited successful action indexes;
  - `continue`: a next `ActionBatchPayload`, a concise reason why current evidence is insufficient, and citations;
  - `incomplete`: reason and citations when further safe work cannot be proposed.
- `ObjectiveOutcome`: completed, incomplete, or exhausted; include the original objective, completed rounds, final evidence, and verdict.

Extend TypeBox schemas in `src/schemas.ts` for model-facing output and extend the local structural guards in `src/guards.ts`; do not reintroduce runtime `Value.Check`, because Pi and omp deliberately use different TypeBox loading behavior. Validate all citation indexes against the actual current batch result, require citations to point to successful actions, reject empty summaries, reject `continue` with an empty action list, and pass every next payload through the existing objective mutation policy.

Add unit tests for accepted/rejected verdicts, including nonexistent indexes, failed-action citations, empty citations, and a `continue` payload with `apply_diff` while objective mutations are disabled.

**Verify**: `bun run typecheck && bun test tests/schemas.test.ts` exits 0.

### Step 3: Make Pi planning evidence-gated and add a structured verifier call

Refactor `src/analyzer.ts` without changing explicit-actions behavior:

1. Change `planBatchWithGrounding()` so a parsed text batch or `submit_action_batch` received before the configured minimum successful inspect count is rejected for that turn. Add the model response to history, append a precise reminder that it must call `inspect_read` or `inspect_grep` first, and continue while the grounding budget remains.
2. Keep `groundingTurns: 0` as an explicit opt-out for callers that knowingly accept blind planning. Document that it is unsafe for open-ended diagnosis objectives.
3. Export a separate injected, unit-testable verifier function. Its inputs must include the original objective, the immutable round evidence, the current config, and the same resolved planning model transport used for planning. Its output must be parsed exclusively through the new `ObjectiveVerdict` guard.
4. Use a dedicated verifier system prompt that says it is an evaluator, not the executor: it may return `complete` only when cited successful action output directly supports every material part of the objective; otherwise return `continue` with the minimal next read/grep/bash payload, or `incomplete`. Include the evidence in a bounded form; never include unbounded command output or secrets.
5. Add explicit error messages that distinguish “planner did not ground”, “verifier returned invalid output”, “objective evidence insufficient”, and “objective round limit reached”. Do not call an incomplete result a completed batch.

Preserve the current model-resolution logic at `src/analyzer.ts:375-408` and literal pi-ai dynamic imports; both are required for Pi/omp compatibility.

**Verify**: `bun test tests/analyzer-grounding.test.ts` exits 0; tests demonstrate early JSON is not accepted and a valid cited completion verdict is parsed.

### Step 4: Refactor the execution coordinator into a bounded objective loop

Refactor `src/execute-batch-queue.ts` so objective mode, and only objective mode, follows this sequence:

1. Resolve the first payload.
2. Execute it with the existing per-session `BatchQueueRunner`.
3. If execution halts prematurely, return an incomplete objective result immediately; do not ask a verifier to bless a failed batch.
4. Request a verdict using injected dependencies rather than importing a host-specific analyzer into the coordinator.
5. On `complete`, return an outcome marked completed only after citation validation.
6. On `continue`, execute the next payload in the same runner/session and repeat until the configured maximum objective rounds is reached.
7. On `incomplete`, malformed verifier output, or cap exhaustion, return `isError: true` with the evidence and actionable next step. Preserve planner usage across planning and verification calls.

Add a config field such as `maxObjectiveRounds`, defaulting to `2`, with environment and file-config parsing that follows `groundingTurns` conventions. Validate it as a positive integer. This cap prevents unbounded cost and tool execution; describe its extra model-call cost in the README.

Keep `BatchQueueExecuteDeps.resolveObjective` narrow or replace it with clearly named planning/verifying callbacks; update the Pi extension adapter and OpenCode adapter together. Explicit `actions` calls must still execute exactly one action list and make zero planner/verifier calls.

Add coordinator tests in `tests/execute-batch-queue.test.ts` for: cited completion; one continue then completion; cap exhaustion; action failure; invalid verdict; and explicit actions making no objective callbacks.

**Verify**: `bun test tests/execute-batch-queue.test.ts` exits 0 with all new loop cases passing.

### Step 5: Implement the same contract for OpenCode

`src/opencode/analyzer.ts:160-198` currently returns one structured plan from an ephemeral session. Extend it to support the common round/verdict contract rather than duplicating execution logic:

1. Continue to create and dispose ephemeral planning sessions reliably.
2. Use JSON-schema structured output for the verdict when supported, and retain the existing plain-prompt fallback only when OpenCode rejects structured format.
3. Ensure the verifier receives only the original objective and bounded structured evidence, not parent-session conversation history.
4. Reuse the exact shared parser/guard/mutation policy used by Pi.
5. Wire the planner and verifier callbacks through `src/opencode/plugin.ts`; do not make `execute-batch-queue.ts` depend on OpenCode client types.

Add scripted OpenCode adapter tests covering one evidence-backed completion and one `continue` followed by cap exhaustion. Extend `tests/opencode-objective-test.ts` so success requires action evidence relevant to its requested file, not merely a non-error tool response.

**Verify**: `bun test tests/opencode-objective-test.ts && bun run tests/opencode-objective-test.ts` exits 0.

### Step 6: Render outcomes honestly and document the behavior change

Update `src/format-batch-result.ts` and Pi extension rendering so user-visible language is accurate:

- Use “objective verified” only for a validated `complete` verdict.
- Use “objective incomplete” for failed evidence, invalid verifier response, or cap exhaustion, including the reason, cited evidence, and the next safe action recommendation.
- Keep “batch completed” for the mechanical execution state only; do not let it imply objective satisfaction.

Update `README.md` configuration and objective-mode documentation:

- Explain that objective mode requires evidence and may make one verification call per configured round.
- Document `maxObjectiveRounds`, the default, cost/latency implications, and the unsafe `groundingTurns: 0` opt-out.
- State that `actions` mode remains deterministic and incurs no verifier calls.

**Verify**: `bun run typecheck && bun test` exits 0. Manually inspect the formatter test output to confirm incomplete objective text cannot be mistaken for verified completion.

### Step 7: Run full verification and live host smoke tests

Run the full suite, then the two live objective-mode commands listed above. The live objective test must show evidence from `buggy.py:3` or from a command that directly demonstrates `ZeroDivisionError`; a directory listing alone is a failure. If a host model cannot complete due to provider credentials, record that as an environment blocker and preserve the deterministic unit and integration evidence.

**Verify**: all commands in the Commands table pass, except a documented credential-only blocker for omp.

## Test plan

- `tests/analyzer-grounding.test.ts`: reject early JSON and tool-call batches until required successful inspect evidence exists; preserve valid inspect-then-plan behavior; reject failed inspection as grounding.
- `tests/schemas.test.ts` or a new focused verdict test: strict verdict shape, citation bounds, successful-only citations, mutation policy, and next-payload validation.
- `tests/execute-batch-queue.test.ts`: full bounded-loop state machine, failures, cap, and explicit-mode no-model-call regression.
- `tests/opencode-objective-test.ts`: structured verdict path and objective-relevant output regression.
- `tests/agent-objective-test.ts`: assert its stated file-read and shell-command evidence rather than accepting generic completion text.
- Live Pi and omp smoke tests: the diagnosis objective must cite the actual defect evidence, never just a successful `ls`.

## Done criteria

- [ ] `groundingTurns > 0` prevents a planner from submitting or returning executable JSON before at least one successful inspect result.
- [ ] Objective mode executes no more than `maxObjectiveRounds` batches and no more verifier calls than documented.
- [ ] A result is marked objective-verified only after a well-formed `complete` verdict cites successful action evidence from the final or accumulated rounds.
- [ ] Failed execution, invalid verdicts, unsupported citations, and cap exhaustion return explicit incomplete/error outcomes, not generic completion.
- [ ] Explicit-actions mode makes zero planning or verification model calls.
- [ ] Pi and OpenCode use the same shared payload/verdict validation and objective mutation policy.
- [ ] `bun run typecheck` exits 0.
- [ ] The full test command in this plan exits 0.
- [ ] Pi smoke test proves the division-bug objective from direct evidence.
- [ ] omp smoke test proves the same once provider credentials are valid.
- [ ] No files outside Scope are modified, except generated ignored test artifacts.
- [ ] `plans/README.md` marks Plan 001 DONE.

## STOP conditions

- The executor finds a host API that cannot make an isolated planner/verifier call with bounded evidence and no parent-session mutation; stop and present the API constraint before adding a host-specific workaround.
- A verifier model cannot reliably return a strict JSON/schema-constrained verdict on either host; stop with captured non-secret response shapes and propose a compatibility adapter.
- Implementing the loop requires changing action-executor safety policies or the public explicit-actions input shape.
- The live model objectively ignores the evidence contract in tests after two prompt/schema tightening attempts; stop and recommend a deterministic objective subset or a separate verifier model rather than silently weakening the completion gate.
- Any in-scope source file exceeds 300 lines; split it into focused modules instead of extending it further.

## Maintenance notes

- Objective verification deliberately adds model calls and latency. Keep its cap low, account for all planner/verifier usage in `PlannerUsage`, and expose the cap in rendered results so cost is explainable.
- Reviewers should scrutinize citation validation, result truncation/redaction before model prompts, and any path where `complete` is inferred from process exit status alone.
- The plan does not attempt to prove arbitrary natural-language objectives deterministically. It makes model judgments evidence-cited, bounded, and safely incomplete on uncertainty.
- If future work adds mutation-enabled objective mode, retain the existing `allowObjectiveMutations` policy for every continuation payload and require a post-mutation verification action before a completion verdict.
