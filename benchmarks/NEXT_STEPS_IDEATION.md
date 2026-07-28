# Next-step ideation: publication path and moonshots

Companion to [`PUBLICATION_READINESS.md`](./PUBLICATION_READINESS.md). This
document is deliberately expansive: critical path first, then adjacent bets that
could become a second paper, a systems artifact, or a longer research program.

**Anchor fact:** the strongest currently defensible story is a *bounded
interaction-boundary study* — fixture gains for dependent workflows, incomplete
and interim-null Terminal-Bench transfer. Plan as if the null/negative external
result holds; treat a late reversal as upside, not the base case.

---

## A. Critical path (workshop-submittable)

Do these in order. Everything else is optional until A1–A5 land.

### A1. Finish and freeze the external result
- Resume the same frozen Terminal-Bench run directory through 89/89 pairs.
- Archive Harbor jobs, digests, pins, `summary.json`, and analysis commands.
- Run `analyze.py` from a clean checkout; paste script output into paper tables.

### A2. Discordant-task autopsy before the abstract
For every batch-only / native-only task, record adoption, halt reason,
timeout/provider status, and a short evidence-backed failure mode. Choose title
polarity *after* this table exists.

### A3. Repair the mechanism suite without a full recloud
- Fix H8/H10 nested `check.sh` path, H21 fail∧nonzero oracle mismatch,
  `outcome === "pass"` aggregation, and agent-visible proof leakage.
- Regression-rerun only affected + small sample scenarios.
- Promote repaired cells into Section 4.1; demote Phase 2 aggregates to appendix
  provenance.

### A4. Two cheap ablations that sharpen RQ5
1. **Executor-only replay** of a frozen action plan through sequential vs batch
   (near-zero model cost): isolates orchestration overhead.
2. **Independent-read control**: show when parallel native tools should win by
   construction.

Optional third: forced-batch prompt vs neutral availability — labeled separately.

### A5. Write to the observed sign
Default narrative if the full run stays near 45/89:
> Explicit batching compresses dependent fixture workflows; under neutral
> Terminal-Bench availability it does not transfer as a general reliability or
> efficiency win. The contribution is the workload boundary.

Fallback title already in the outline is appropriate for that outcome.

---

## B. Same-paper upgrades (high leverage, still on-theme)

These strengthen the workshop paper without changing the claim class.

| Idea | Why it helps | Cost / risk |
| --- | --- | --- |
| **Adoption-conditioned secondary analysis** | Separates “queue available” from “queue used”; explains nginx-style pairs | Exploratory; must stay labeled |
| **Category / dependency-length breakdown** | Turns null aggregate into a workload map for RQ5 | Needs honest pre-registration language |
| **Planner-cost waterfall** | Prevents objective mode from looking cheaper than it is | Already partially instrumented |
| **Hidden-oracle fixture repair as methods contribution** | Fits “Who Verifies the Agents?” themes directly | Must not silently rewrite old aggregates |
| **Reproducibility appendix as first-class artifact** | Harbor pins + analysis scripts become a deliverable | Artifact packaging work |
| **One open/cheaper model on 20 tasks** | Softens single-driver limitation | Spend only after A1 |

Venue fit reminder: verification, cost/latency signals, failure attribution, and
evaluation tooling are already the primary workshop themes — lean into those
rather than forcing a pass@1 win narrative.

---

## C. Narrative forks (pick one after A2)

1. **Boundary paper (base case):** fixture help, TB null/negative, clear when
   *not* to batch.
2. **Adoption paper:** neutral availability fails because models under-use the
   queue; forced-batch recovers efficiency without harming pass@1.
3. **Verification tooling paper:** the paired Harbor adapter, outcome taxonomy,
   and discordant autopsy are the contribution; batching is the case study.
4. **Negative-result paper:** batching increases tokens/cost under realistic
   terminal workloads; publish the counterexample cleanly.

Do not mix forks in the abstract. Pick one spine; park the others as future work.

---

## D. Near-horizon research extensions (next paper, not this deadline)

### D1. Dependency-aware routing policy
Train or prompt a tiny router: *batch / parallel / sequential / shell* from a
cheap task sketch. Evaluate regret vs always-native and always-batch. Turns the
null TB result into a *policy learning* problem.

### D2. Batching × speculative decoding / KV reuse
Measure whether shorter tool-turn traces improve cache hit rates and effective
tokens/sec. Connects orchestration interfaces to systems performance.

### D3. Formal action-pipeline semantics
Small operational semantics for bindings, persistent shell, fast-fail, and
workspace bounds; property tests as proofs-of-concept. Appeals to PL / verified
agents venues.

### D4. Cross-harness transfer
Same availability experiment on a SWE-bench-style subset or another terminal
suite. Tests whether the TB boundary is suite-specific.

### D5. Human-in-the-loop batch approval
Surface planned batches for one-click approve/edit before mutation actions.
Measures trust, edit distance, and safety — HCI-adjacent, still about the queue.

---

## E. Moonshots (tangential but fertile)

These are intentionally off the critical path. Any one could seed a separate
program; none should delay A1–A5.

### E1. Action traces as mid-training data
Treat successful explicit batches as function-like “call → multi-step body →
return evidence” sequences (inspired by the FIM/agent-loop paper already cited).
Mid-train or SFT a coding model to *emit* well-typed batches instead of
single-step ReAct. Moonshot metric: fewer tool turns on held-out dependent
workflows without pass@1 regression.

### E2. Verifier-conditioned batch synthesis
Generate synthetic dependent tasks whose official verifier is known; search for
batch plans that maximize verifier pass under a turn budget. Closes the loop
between Harbor-style verification and queue planning — a data engine for agent
interfaces.

### E3. “Interaction thermodynamics” of agents
Define an accounting identity: useful work ≈ verified state change per joule of
tokens, turns, and wall clock. Position `batch_queue` as one intervention among
parallel tools, caches, and smaller executors. Ambitious framing paper; needs
careful non-hype language.

### E4. Multi-agent batch markets
Several agents bid for short exclusive shell/filesystem leases; a scheduler
packs compatible actions into batches. Tangential distributed-systems idea with
coding-agent packaging.

### E5. Embodied / OS-world transfer
Port the typed queue to a desktop or browser agent (OSWorld-style) where
dependent UI actions suffer the same turn tax. High risk, high novelty; only if
a genuine non-terminal substrate is added.

### E6. Compile agents to workflows
Static analysis over batch traces → durable DAG / Temporal / Inngest workflows
when a pattern repeats. Bridge from ephemeral agent loops to production
orchestration — product moonshot with a research angle on when to graduate a
batch into a workflow.

### E7. Differential privacy / secret-scrubbing for batch evidence
Structured evidence is larger than terse native output; build a sanitizer that
preserves replanning utility while redacting secrets. Tangential security paper;
also makes public artifact release safer.

### E8. Competitive RGB-style coding arena
Public leaderboard: minimize verified actions/turns on a fixed dependent-task
suite with open logs. Community moonshot that reuses the harness as an arena,
not only a paper appendix.

### E9. Neuro-symbolic shell plans
Translate objectives into a small typed IR (the current action schema), then
either execute directly or prove lightweight safety properties (no path escape,
no unapproved mutation). Pushes the queue toward a verified tool IR.

### E10. Curriculum for “when to stop batching”
Use failure analysis to build a teaching dataset of overlong batches, premature
halts, and binding mistakes; evaluate whether reflection metadata actually
reduces those classes. Connects metacognition inspiration to measurable error
taxonomies.

---

## F. Recommended portfolio

If capacity is limited, allocate roughly:

| Bucket | Share | Items |
| --- | ---: | --- |
| Ship the workshop paper | 70% | A1–A5, then B adoption + category breakdown |
| Seed the next paper | 20% | D1 router or D3 semantics sketch |
| One moonshot spike | 10% | E1 (batch traces as mid-training) *or* E2 (verifier-conditioned synthesis) |

Avoid starting E4–E6 before A1 is frozen; they are attractive distractions.

---

## G. Decision checklist

```text
[ ] A1 full 89-pair freeze + artifact archive
[ ] A2 discordant autopsy written
[ ] A3 harness repairs + small regression
[ ] A4 executor-only + independent-read ablations
[ ] A5 abstract/title locked to observed sign
[ ] Pick narrative fork (C1–C4)
[ ] Optional B upgrades that serve that fork only
[ ] Park one D/E idea as explicit future work in the paper
```

When A1–A5 are done, revisit moonshots with a clear “this paper vs next paper”
split so the workshop submission stays a bounded interface study.
