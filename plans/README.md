# Implementation Plans

Generated on 2026-07-27; updated 2026-08-05. Execute plans in dependency order. The executor must read the entire plan, run each verification gate, and update this index when done.

## Execution order & status

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 001 | Make objective mode evidence-gated and bounded | P1 | L | — | TODO |
| 002 | Instruction-trained mode router (path to positive results) | P0 | XL | frozen TB full run on GCP | TODO |

Status values: TODO | IN PROGRESS | DONE | BLOCKED (with reason) | REJECTED (with rationale).

## Dependency notes

- Plan 001 is self-contained. It changes the objective-mode protocol shared by Pi and OpenCode; do not attempt piecemeal host-specific fixes.
- Plan 002 is the publication-critical path for adaptive execution-mode routing. It does **not** depend on Plan 001. Prefer executing 002 before 001 if bandwidth is limited.
- Plan 002 work packages (WP-A…F) are designed for subagent handoff; parent agent owns sequential L0/L1/L2/L3 gates. Do not start paid Harbor (`adaptive-full`) unless L1 PASS.

## Findings considered and rejected

- Changing only the planner prompt: rejected. The current prompt already asks for grounding and a success criterion, but the controller accepts early JSON and never verifies the executed evidence.
- Raising `groundingTurns`: rejected. It is a maximum, not a minimum; `planBatchWithGrounding` accepts a textual JSON batch before grounding is complete.
- Forking llm-router / mantis for batch-vs-native mode choice (Plan 002): rejected. Wrong routing axis; mode gating must be pre-episode in the Harbor/Pi agent.
- Publishing the current 17/24 heuristic table as main-track evidence (Plan 002): rejected. Offline eval used fake instructions.
