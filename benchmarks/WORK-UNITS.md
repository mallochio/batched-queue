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
