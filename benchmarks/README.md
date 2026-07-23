# Benchmarks and publication docs

This directory holds the evaluation harnesses, Terminal-Bench adapter, and
workshop-facing documents for `batch_queue`.

## Current status (July 2026)

| Track | Status | Cite as |
| --- | --- | --- |
| Deterministic executor (D1–D7) | Runnable, model-free | Mechanism / appendix |
| Controlled fixtures (H1–H24) | Directional; Phase 2 aggregates unrepaired | Mechanism only until repaired |
| Terminal-Bench 2.1 pilot | Complete (3×2) | Harness validation |
| Terminal-Bench 2.1 full paired run | **45 / 89 pairs** interim | Incomplete — not a full external result |
| Workshop paper | Outline + readiness audit | Not submission-ready |

Authoritative readiness checklist:
[`PUBLICATION_READINESS.md`](./PUBLICATION_READINESS.md).

## Layout

```
benchmarks/
├── README.md                 # this index
├── PUBLICATION_READINESS.md  # evidence audit and submission gates
├── PAPER_OUTLINE.md          # workshop / short-paper outline
├── RESEARCH_RUNBOOK.md       # experiment history + execution plan
├── harness/                  # H1–H24 controlled Pi fixture suite
├── deterministic/            # D1–D7 model-free executor checks
├── terminal-bench/           # Harbor adapter for Terminal-Bench 2.1
├── terminal_bench_agent.py   # Pi agent entry used by Harbor
└── results/                  # local artifacts (gitignored)
```

## Quick commands

```bash
# Model-free executor mechanics
bun run bench:deterministic

# Controlled fixture handoff (needs provider credentials)
bun run bench:model-mediated

# Terminal-Bench no-cost validation
uv sync
bash benchmarks/terminal-bench/run.sh validate
```

Paid Terminal-Bench gates require explicit approval env vars; see
[`terminal-bench/README.md`](./terminal-bench/README.md).

## Reading order for publication work

1. [`PUBLICATION_READINESS.md`](./PUBLICATION_READINESS.md) — what the numbers
   can and cannot claim.
2. [`PAPER_OUTLINE.md`](./PAPER_OUTLINE.md) — venue, RQs, table shells.
3. [`RESEARCH_RUNBOOK.md`](./RESEARCH_RUNBOOK.md) — history, validity issues,
   cost-conscious gates.
4. [`harness/README.md`](./harness/README.md) and
   [`terminal-bench/README.md`](./terminal-bench/README.md) — how to reproduce.
