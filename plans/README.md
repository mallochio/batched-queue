# Implementation Plans

Generated on 2026-07-27. Execute the plan below in order. The executor must read the entire plan, run each verification gate, and update this index when done.

## Execution order & status

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 001 | Make objective mode evidence-gated and bounded | P1 | L | — | TODO |

Status values: TODO | IN PROGRESS | DONE | BLOCKED (with reason) | REJECTED (with rationale).

## Dependency notes

- Plan 001 is self-contained. It changes the objective-mode protocol shared by Pi and OpenCode; do not attempt piecemeal host-specific fixes.

## Findings considered and rejected

- Changing only the planner prompt: rejected. The current prompt already asks for grounding and a success criterion, but the controller accepts early JSON and never verifies the executed evidence.
- Raising `groundingTurns`: rejected. It is a maximum, not a minimum; `planBatchWithGrounding` accepts a textual JSON batch before grounding is complete.
