# Publication readiness: evidence audit and next steps

Status snapshot as of **23 July 2026** (`main` / docs sync). This is a decision
document, not a paper draft. Use it to decide what to finish before submitting
[`PAPER_OUTLINE.md`](./PAPER_OUTLINE.md). Doc index: [`README.md`](./README.md).

## Verdict

The repo has a **publishable research question and a credible workshop framing**,
but it is **not yet submission-ready**. The controlled suite shows a useful
mechanism under contested validity; the external Terminal-Bench signal is
incomplete and currently null-to-negative; raw full-run artifacts are not in
this checkout.

Treat the story as:

> Explicit tool-action batching can compress dependent repository workflows in a
> controlled setting. Under neutral tool availability on Terminal-Bench 2.1, the
> effect does not yet look like a general reliability or efficiency win. The
> contribution is the interaction-boundary analysis, not a universal agent
> upgrade.

If the remaining 44 Terminal-Bench pairs reverse the interim trend, update the
title and abstract. Do not invent a positive external claim from the 45-pair
prefix.

---

## What exists today

| Evidence | Scale | Direction | Publication use |
| --- | --- | --- | --- |
| Deterministic local pilot | small | mechanism only | appendix / system section |
| Luna fixture study (README) | 24 tasks × 2 obs × 3 conditions | explicit batch +10.4 pp success, fewer tool calls | directional only; not significance |
| Azure Grok provider check | same 24-task suite | same direction | provider validation, not external benchmark |
| Phase 2 H1–H24 cloud run | 1,440 episodes | explicit 88% / objective 86% / native 70% | **do not cite as cleaned result** |
| Terminal-Bench pilot | 3 tasks × 2 conditions | all pass; efficiency wins when queue used | harness validation only |
| Terminal-Bench full run | **45 / 89 pairs** interim | batch 29/45 vs native 32/45; McNemar p=0.5488; batch slower/costlier | incomplete; not a full-benchmark claim |

Sources: [`README.md`](./README.md) (this directory),
[`../README.md`](../README.md), [`RESEARCH_RUNBOOK.md`](./RESEARCH_RUNBOOK.md),
[`PAPER_OUTLINE.md`](./PAPER_OUTLINE.md),
[`terminal-bench/PILOT_REPORT.md`](./terminal-bench/PILOT_REPORT.md),
[`harness/README.md`](./harness/README.md).

Raw Terminal-Bench artifacts are gitignored under `benchmarks/results/` and are
absent from this environment. The interim 45-pair numbers live only in the paper
outline until the frozen run directory is restored and re-analyzed.

---

## What the numbers actually support

### Supported now

1. **Mechanism:** a typed queue can execute dependent read/grep/bash/diff steps
   with persistent shell state, bindings, and fast-fail evidence.
2. **Interaction compression hypothesis:** on short dependent fixture workflows,
   explicit batches tend to reduce tool-call boundaries versus native sequential
   turns.
3. **Fairness of the external design:** neutral availability, paired containers,
   official verifier, seed-42 condition order, and paid gates are in place.
4. **Null result is publishable:** if the full 89-pair run stays near the
   interim checkpoint, the paper should argue workload boundaries, not claim a
   Terminal-Bench win.

### Not supported yet

1. A general Terminal-Bench reliability improvement.
2. A cleaned H1–H24 significance claim (known oracle / aggregation defects).
3. Cost or latency superiority on realistic terminal tasks.
4. Model-independent effects (one primary driver so far).
5. Objective-mode superiority once planner cost is included.

---

## Blocking gaps

### P0 — must finish before any submission

1. **Complete the frozen Terminal-Bench 2.1 run**
   - Finish all 89 tasks × 2 conditions, or predeclare exclusions.
   - Resume with the same `BQ_RUN_DIR`; do not restart and mix prefixes.
   - Preserve the final `summary.json`, Harbor jobs, and image digests.
   - Re-run `analyze.py` from a clean checkout and paste script output into the
     paper tables—no hand transcription.

2. **Restore and freeze artifacts**
   - Raw results are not in git. Archive a release tarball or private artifact
     store with commit SHAs, Harbor pin, Pi version, and analysis commands.
   - Without artifacts, reviewers and coauthors cannot audit discordant tasks.

3. **Discordant-task failure analysis**
   - For every batch-only or native-only task: verifier outcome, queue adoption,
     halt reason, timeout/provider status, and a short evidence-backed failure
     mode.
   - Write this **before** choosing the final title or abstract polarity.

4. **Match the abstract to the observed direction**
   - Positive fixture mechanism + null/negative external transfer is a coherent
     workshop paper.
   - Do not keep marketing wording in the README that overstates Terminal-Bench
     readiness.

### P1 — needed for a clean mechanism section

5. **Repair H1–H24 validity issues still present in code**
   - H8/H10 `reverifyCommand` still `cd nested` then run `bash scripts/check.sh`
     with a nested-relative path.
   - H21 oracle still asks for both `fail` and `nonzero` while the task
     predicate accepts either.
   - `aggregate.ts` still headlines `verificationPassed`, which can credit a
     timed-out run if an oracle somehow passed; headline success must use
     `outcome === "pass"`.
   - Proof files under agent-visible `.bench/proof/` remain discoverable; move
     oracles outside the agent workspace or deny-list them in the agent mount.
   - After fixes: rerun H8, H10, H21 plus 3–5 regression scenarios × 3 reps.
     Do **not** spend another 1,440-episode cloud run.

6. **Fill empty paper tables from scripts**
   - Controlled suite table, Terminal-Bench headline, efficiency, and
     discordance tables in [`PAPER_OUTLINE.md`](./PAPER_OUTLINE.md) are placeholders.
   - Add queue-adoption rate as a first-class secondary metric; availability ≠ use.

7. **Cheap ablations that sharpen the claim**
   - Executor-only replay of a frozen action plan through sequential vs batch
     (zero/near-zero model cost).
   - Independent-read control showing when parallel native tools should win.
   - Forced-batch prompt as a separate, labeled comparison—not mixed into the
     neutral availability result.

### P2 — strengthens reviewability, not the core claim

8. **Robustness block** from the runbook: 20 stratified tasks × 2 extra reps.
9. **Second cheaper/open model** only after primary controls are solid.
10. **Related work and limitations** drafted against the final numbers.
11. **Missing harness protocol doc** — addressed by
    [`harness/README.md`](./harness/README.md); keep it aligned with code fixes.
12. **Author checklist:** one coauthor independently verifies the discordant
    table and McNemar / bootstrap outputs.

---

## Recommended claim ladder

Use the strongest claim that survives the completed evidence. Stop climbing when
a rung fails.

| Rung | Claim | Gate |
| --- | --- | --- |
| A | Interface paper: typed dependent-action queue with safety/evidence semantics | System + deterministic checks |
| B | Mechanism paper: explicit batching reduces interaction boundaries on dependent fixtures | Repaired H1–H24 regression sample |
| C | Boundary paper: fixture gains do not transfer under neutral Terminal-Bench availability | Complete 89-pair run + failure analysis |
| D | Conditional win paper: batching helps when adoption occurs on dependent tasks | Adoption-conditioned secondary analysis, labeled exploratory |
| E | Reliability win paper: batch availability raises Terminal-Bench pass@1 | Only if full paired delta and CI support it |

Current evidence points at **rung C**, with rung B contingent on harness repair.
Do not write as if rung E is expected.

---

## Venue and writing sequence

Primary targets already listed in the outline:

- NeurIPS 2026 agent-verification / evaluation workshop (non-archival; later
  archival still possible subject to venue rules).
- DAI 2026 AI Paper Track if the full run and draft land before that deadline.

Writing order (unchanged, still correct):

1. Freeze and validate final Terminal-Bench artifacts.
2. Fill methods/results tables from scripts.
3. Write discordant-task failure analysis.
4. Choose title/abstract polarity from that analysis.
5. Related work, limitations, reproducibility appendix.
6. Submit.

Suggested titles by outcome:

- Null/negative external: **Tool-Action Batching Is Not a Free Lunch for Terminal Agents**
- Mixed/adoption-dependent: keep **When Does Tool-Action Batching Help Terminal Agents?**
- Positive external (only if earned): keep the working title and drop the fallback.

---

## Concrete next-step checklist

```text
[ ] Locate or resume full-frozen Terminal-Bench run directory
[ ] Finish remaining pairs to 89/89 (or document exclusions)
[ ] Archive raw artifacts + pins (Harbor, Pi, dataset, queue commit)
[ ] Run analyze.py; commit generated analysis JSON/Markdown into paper draft
[ ] Build discordant-task table with adoption + halt reasons
[ ] Fix H8/H10/H21 + aggregate outcome accounting; regression-rerun only
[ ] Add executor-only and independent-read ablations
[ ] Draft Sections 3–4, then abstract/title
[ ] Keep harness README aligned after oracle/aggregate repairs
[ ] Align root README claims with final evidence
[ ] Coauthor audit of tables and stats
[ ] Submit to chosen workshop / DAI track
```

### Cost note

The 3-task pilot cost ~$0.57. A linear 178-episode projection is ~$17; use a
higher stop-loss because harder tasks dominate. Do not reopen a large synthetic
cloud run until the external result and harness repairs are done.

---

## What not to do

- Do not cite the 45-pair prefix as a completed Terminal-Bench evaluation.
- Do not cite Phase 2 88%/70% aggregates as cleaned publication evidence.
- Do not merge objective-mode results into the neutral availability headline.
- Do not weaken the native baseline to make batching look better.
- Do not treat repeated fixture variants as independent tasks for significance.
- Do not spend budget on a second model before the primary 89-pair run is frozen.
