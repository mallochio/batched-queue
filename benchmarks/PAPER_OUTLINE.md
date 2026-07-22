# When does tool-action batching help terminal agents?

Working outline for a workshop or short empirical paper.

## Submission target

Primary target: a **NeurIPS 2026 workshop on agent verification or evaluation**,
especially *Who Verifies the Agents? Toward Reliable Agent Development*. The
workshop's themes include verification, cost and latency signals, failure
attribution, regression detection, reproducibility, and evaluation tooling.
NeurIPS lists 29 August 2026 as the suggested date for workshop contributions
and 29 September as the mandatory author-notification deadline; the individual
workshop CFP controls the actual paper deadline. NeurIPS workshop papers are
non-archival, which keeps a later archival submission possible subject to the
venue's rules.

Secondary target: **DAI 2026, AI Paper Track** (deadline listed as 11 August
2026). The topic is broad enough for an agent-interface study. AAAI-27 may also
work if a relevant agentic-AI or software-engineering workshop opens, but AAAI
does not publish workshop technical reports in its digital library. ICLR 2026
and ICML 2026 workshop deadlines have passed; target their 2027 workshops
instead. CVPR and ICCV are poor fits unless the project adds a genuine
vision-language or embodied-agent component.

## Working title

**When Does Tool-Action Batching Help Terminal Agents? A Controlled Study of
Reliability, Cost, and Interaction Boundaries**

Fallback title if the external result stays mixed or negative:

**Tool-Action Batching Is Not a Free Lunch for Terminal Agents**

## Current verdict

The controlled fixture suite shows a useful mechanism: explicit batches can
reduce interaction boundaries on short, dependent workflows. The Terminal-Bench
result is not yet complete. At the current interim checkpoint, 45 paired tasks
show:

| Metric | Batch | Native | Batch minus native |
| --- | ---: | ---: | ---: |
| Verified passes | 29/45 | 32/45 | -3 |
| Median agent seconds | — | — | +18.74 s |
| Median model turns | — | — | +1 |
| Median tool calls | — | — | +2 |
| Median tokens | — | — | +14,320 |
| Median cost | — | — | +$0.0225 |

The exact paired McNemar p-value is 0.5488. These are interim numbers, not a
claim. They currently argue against a general Terminal-Bench improvement under
neutral tool availability. That is still a publishable workshop story if the
89-task run completes and the paper treats the workload boundary as the result.

The current run must finish all 89 tasks before these results can be called a
full Terminal-Bench evaluation. A partial prefix is not a defensible external
benchmark result.

## Abstract placeholder

LLM coding agents often execute repository work through a sequence of model and
tool turns. We study whether a typed queue for dependent tool actions improves
agent reliability or efficiency by reducing orchestration boundaries while
preserving shell state, result flow, and failure handling. We compare native
terminal tools with a batch-available condition under matched prompts and fresh
containerized tasks. A deterministic fixture suite isolates executor behavior;
Terminal-Bench 2.1 tests whether the effect transfers to realistic terminal
workflows. [Insert completed pass@1, paired confidence interval, latency, and
cost results.] The controlled study shows [result]. On Terminal-Bench, batching
[improves / does not improve / has workload-dependent effects on] task
resolution and [reduces / does not reduce] interaction overhead. We find that
batching is most useful when [workload condition], while [independent or long
running workloads] erase or reverse the advantage. The result is a bounded
interface study, not a claim that batching is universally better than native or
parallel tool use.

## 1. Introduction

### Problem

Terminal agents repeatedly alternate between model reasoning and tool
execution. For dependent repository work, each intermediate result can trigger
another model turn even when the next action is already clear. Those boundaries
add latency and context traffic.

### Proposed idea

`batch_queue` accepts a typed sequence of dependent actions and executes them
with persistent shell state, result bindings, fast-fail behavior, workspace
checks, and structured evidence. It does not replace parallel tools for
independent work and it is not a durable workflow engine.

### Research questions

- **RQ1:** Does batching reduce model/tool interaction boundaries on dependent
  terminal workflows?
- **RQ2:** Does that reduction preserve official task correctness?
- **RQ3:** Does the effect transfer from controlled fixtures to Terminal-Bench?
- **RQ4:** What are the cost and latency trade-offs, including planner cost?
- **RQ5:** Which workloads benefit, and which do not?

### Contributions

Keep this list to three concrete claims after the final analysis:

1. A typed execution interface for dependent terminal actions with explicit
   state, binding, and failure boundaries.
2. A controlled mechanism benchmark that separates queue execution from model
   planning and tests the relevant safety invariants.
3. A paired evaluation on Terminal-Bench 2.1 that reports positive, null, and
   negative cases rather than assuming universal benefit.

If the neutral Terminal-Bench result is null, say that the contribution is the
careful boundary analysis. Do not claim a general reliability gain.

## 2. System

### 2.1 Native execution

Describe the ordinary Pi tools and one dependent action per model/tool turn as
the historical baseline. Also state that the unrestricted external baseline
may use compound shell commands; do not describe a deliberately weakened
baseline as native terminal capability.

### 2.2 Explicit batching

Describe the `actions` array, action types, persistent shell session, result
bindings, output limits, fast-fail halt metadata, workspace validation, and
mutation validation. Include one short example:

```text
read marker -> bind marker -> consume ${marker} -> verify
```

### 2.3 Objective batching

Describe objective-to-action planning separately. Count planner requests,
planner tokens, planner cost, and executor cost independently. Do not combine
objective mode with the primary neutral availability result.

### 2.4 Scope

State the intended workload boundary: short dependent terminal workflows. State
explicitly that independent actions should use parallel native calls and that
large durable graphs need a workflow system.

## 3. Experimental design

### 3.1 Controlled mechanism suite

Use H1-H24 only as a mechanism study. The fixtures are deterministic and use
fixture-owned verification. Report the repaired oracle protocol, hidden-oracle
boundary, outcome taxonomy, and the fact that related scenarios are correlated.
Do not treat 1,440 episodes as 1,440 independent tasks.

Conditions:

- native sequential;
- explicit batch with a frozen action sequence;
- objective batch, reported separately;
- parallel native tools only for genuinely independent controls;
- monolithic shell only as a lower-level speed reference.

### 3.2 Terminal-Bench 2.1

- Dataset commit: `36d417f56c293b8271b306a0e4c566f58e98c153`.
- 89 tasks from the official `harbor-framework/terminal-bench-2-1` repository.
- Harbor commit: record the exact pinned commit from
  root `pyproject.toml` and `uv.lock`.
- Pi: `0.80.3`.
- Driver: `azure-openai-responses/gpt-5.6-luna`, thinking `high`.
- One fresh container per task-condition pair.
- Seed: 42 for within-task condition order.
- No retries in the primary run.
- Task-owned official verifier is the correctness oracle.
- Timeouts, provider errors, and invalid runs remain in the denominator.

### 3.3 Conditions and fairness

Primary comparison:

1. native tools with neutral task instructions;
2. the same native authority plus `batch_queue` available, also with neutral
   instructions.

The only treatment difference is extension availability. The model may choose
not to use the queue. Report queue adoption separately.

Mechanism comparison:

- force native sequential behavior;
- force explicit batch behavior;
- replay the same frozen action plan through both executors without replanning.

Keep this comparison separate from the primary availability experiment.

### 3.4 Measurements

Primary:

- official pass@1 task resolution;
- paired success difference across tasks.

Secondary:

- wall-clock and agent execution latency;
- model turns and tool calls;
- actions per queue call;
- input, output, and cache tokens;
- driver cost, planner cost, and total cost;
- queue adoption and replanning;
- timeout, provider-error, and invalid rates.

### 3.5 Statistical analysis

Treat the task as the statistical unit. Report:

- task-level success for each condition;
- exact McNemar test for paired resolution outcomes;
- paired bootstrap 95% intervals for success deltas and numeric metric
  differences;
- all-task latency and cost, assigning timeouts the declared cap;
- jointly-resolved latency/cost as a labeled secondary analysis;
- per-task discordant outcomes and failure categories.

Do not pool all episodes as independent Bernoulli observations.

## 4. Results

### 4.1 Controlled suite

Insert:

| Condition | Runs | Success | Median turns | Median tool calls | Median cost | Median latency |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Native sequential | — | — | — | — | — | — |
| Explicit batch | — | — | — | — | — | — |
| Objective batch | — | — | — | — | — | — |
| Parallel control | — | — | — | — | — | — |

Follow with the invariant checks: state persistence, binding order,
fast-fail, timeout recovery, workspace boundary, mutation validation, and final
state equivalence.

### 4.2 Terminal-Bench headline table

| Condition | Tasks | Pass@1 | 95% CI | Median agent seconds | Median cost |
| --- | ---: | ---: | --- | ---: | ---: |
| Native | 89 | — | — | — | — |
| Batch available | 89 | — | — | — | — |

Add paired discordance:

| Pair outcome | Count |
| --- | ---: |
| Both pass | — |
| Batch only | — |
| Native only | — |
| Neither pass | — |

### 4.3 Efficiency table

| Condition | Median turns | Median tool calls | Median tokens | Median cost | Median latency |
| --- | ---: | ---: | ---: | ---: | ---: |
| Native | — | — | — | — | — |
| Batch available | — | — | — | — | — |

Report queue adoption separately. Availability is not the same as forced use.

### 4.4 Workload breakdown

Break results down by Terminal-Bench category and by observed queue adoption.
Use this section to answer RQ5. Do not invent a post-hoc subgroup as a primary
hypothesis; label exploratory analyses.

### 4.5 Failure analysis

For every discordant task, record:

- task and condition order;
- official verifier result;
- timeout/provider/harness status;
- native tool trace summary;
- batch action count and halt reason;
- whether the queue was actually invoked;
- likely failure mode, with evidence.

## 5. Ablations

### 5.1 Executor-only replay

Run a frozen action plan sequentially and through `batch_queue`. This is the
cleanest test of orchestration overhead and should not require model calls.

### 5.2 Queue adoption

Compare neutral availability with a condition that explicitly instructs the
model to use an explicit batch. Keep the result separate because the prompt
changes behavior.

### 5.3 Objective planner

Report planner calls and cost as a separate system. Do not present objective
mode as cheaper unless planner usage is included.

### 5.4 Independent actions

Use a small independent-read control to show when parallel native tools are the
right choice. A batch queue should not win this control by construction.

## 6. Related work

Cover:

- terminal-agent benchmarks, especially Terminal-Bench 2.1;
- tool-use and function-calling agents;
- ReAct-style iterative tool use;
- workflow and DAG execution systems;
- parallel tool calls and action batching;
- agent reliability, verifier-based evaluation, and cost-aware inference.

The distinction to preserve: this work changes the orchestration boundary and
execution semantics, not the underlying language model.

## 7. Limitations and responsible reporting

- One primary driver model does not establish model-independent effects.
- The custom fixtures are small and correlated.
- Terminal-Bench is one terminal workload, not all coding work.
- Provider pricing and latency vary.
- Neutral availability measures adoption plus execution, not executor speed alone.
- A single pass per task estimates pass@1 but not stochastic variance.
- Report the incomplete run as incomplete; never turn the 45-pair prefix into a
  full benchmark claim.

## 8. Reproducibility appendix

Include:

- repository and adapter commit;
- Harbor and Pi versions;
- Terminal-Bench dataset commit;
- model/provider and reasoning setting;
- task list and seed;
- image references and digests where available;
- exact commands;
- environment and resource configuration;
- raw artifact location or release archive;
- analysis script and expected output schema;
- exclusions with reasons;
- cost accounting rules.

Do not release credentials, private task data, or raw transcripts containing
secrets.

## Decision gate before submission

Submit only after:

- all 89 tasks have both conditions or exclusions are predeclared;
- the final manifest and raw artifacts are preserved;
- official verifier outcomes parse without loss;
- the full paired analysis runs from a clean checkout;
- the abstract matches the observed direction, including null results;
- at least one author independently checks the discordant-task table.

## Writing order

1. Freeze and validate the final run artifacts.
2. Fill Sections 3 and 4 from scripts, not hand calculations.
3. Write the failure analysis before choosing the title or abstract claim.
4. Add related work and limitations.
5. Submit to DAI 2026 if the full run is complete by the listed deadline; use a
   workshop submission for a shorter version if the conference deadline passes.
