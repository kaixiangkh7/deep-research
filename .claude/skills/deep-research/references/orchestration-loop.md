# Orchestration Loop Reference

Loop mechanics for the `deep-research` workflow. The orchestration lives in
`.claude/workflows/deep-research.js` as deterministic JavaScript — not a prompt asking the LLM
to follow phase instructions. This file documents the control flow, caps, and decision trees.

---

## Full loop diagram

```
User query (passed as args.query)
    │
    ▼
[Triage agent] ──QUICK_ANSWER──► single researcher → inline answer → return
    │ DEEP_RESEARCH
    ▼
[Plan agent] — decompose into sub-questions tagged local/web
    │
    ▼
[Plan Review] — research-critic in plan-review mode
    │
    ├──min≥4 & no critical risks──► proceed
    │
    └──min<4 or critical risks──► plan revision agent ──► proceed regardless
    │                              (one revision; never loops)
    ▼
[Research while-loop] — researchRound < MAX_RESEARCH_ROUNDS(3)
    │
    │  parallel() — all activeSubquestions dispatched concurrently
    │         ├── document-researcher (local sub-questions)
    │         └── web-researcher      (web sub-questions)
    │
    ├──gaps < 2 OR round cap hit──► exit research loop
    │
    └──gaps ≥ 2 AND rounds remain──► gap-plan agent ──► loop again
    │
    ▼
[Synthesis agent] — HTML body with <claim> tags
    │
    ▼
[Audit/Arbitrate while-loop] — incrementalCycles < MAX_INCREMENTAL(3)
    │
    │  [Audit] — research-critic in output-audit mode
    │  [Arbitrate] — orchestrator agent decides verdict
    │
    ├──APPROVED──────────────────────────────────────────── break → deliver
    │
    ├──DEBATE ──► debateRounds < MAX_DEBATE(2)?
    │    YES ──► append counter-argument to debateHistory ──► continue (re-audit)
    │    NO  ──► force APPROVED ──► break → deliver
    │
    ├──INCREMENTAL ──► gap-fill parallel() ──► re-synthesis ──► continue
    │                  incrementalCycles++
    │
    ├──REJECTED ──► break inner loop
    │               rejectedCycles++ < MAX_REJECTED(3)?
    │                 YES ──► reset allFindings, re-plan ──► outer loop continues
    │                 NO  ──► deliver best available
    │
    └──NEEDS_CLARIFICATION ──► break → deliver best available
    │
    ▼
[Deliver agent] — reads template, substitutes placeholders, writes HTML file
```

---

## Round caps (hard limits — enforced by JS constants)

| Constant | Value | What happens at cap |
|---|---|---|
| `MAX_RESEARCH_ROUNDS` | 3 | Exit research loop; synthesize with whatever was gathered |
| `MAX_INCREMENTAL` | 3 | Exit audit loop; treat as APPROVED, deliver best synthesis |
| `MAX_REJECTED` | 3 | Exit outer loop; deliver best available with log note |
| `MAX_DEBATE` | 2 | Force `finalVerdict = 'APPROVED'`; break and deliver |

These are `const` declarations at the top of `workflows/deep-research.js`. To change a cap, edit that file.

---

## Parallelism

`parallel()` is called in two places — both dispatch workers concurrently:

```javascript
// Research rounds — all sub-questions fire at once
const roundFindings = await parallel(
  activeSubquestions.map(sq => () => agent(workerPrompt(sq), { agentType: ... }))
)

// INCREMENTAL gap-fill — gap sub-questions fire at once
const gapFindings = await parallel(
  arbitration.gapSubquestions.map(sq => () => agent(workerPrompt(sq), { agentType: ... }))
)
```

**Sequential (never concurrent):**
- Plan Review → Research (critic needs the plan)
- Research → Synthesis (synthesis needs all findings)
- Synthesis → Audit (audit needs the synthesized report)

**Never in the same `parallel()` call:**
- Two critic calls
- A critic call and a researcher call

---

## INCREMENTAL vs. REJECTED decision tree

```
Critic flags hasUngroundedClaims: true
    │
    ├── Isolated (1–2 claims)?
    │       YES → INCREMENTAL: arbitration.gapSubquestions targets those facts only
    │       NO  → REJECTED: fundamental problem, full plan restart
    │
    └── Is the critic actually correct?
            NO  → DEBATE: arbitration.counterArgument cites evidence claim IS grounded
            YES → INCREMENTAL or REJECTED by severity

Critic flags answersQuery: "no" or "partially"
    │
    ├── Scope gap (missing sub-topic)?
    │       YES → INCREMENTAL: target the missing scope
    │       NO  → REJECTED: wrong approach entirely
    │
    └── Is the required source accessible?
            NO  → NEEDS_CLARIFICATION: surface to user, deliver best available
            YES → INCREMENTAL or REJECTED depending on severity
```

---

## INCREMENTAL mode mechanics

When `arbitration.verdict === 'INCREMENTAL'`:
1. `arbitration.gapSubquestions` lists 1–3 targeted sub-questions.
2. `parallel()` dispatches only those sub-questions.
3. New findings are pushed into `allFindings` (existing findings are never discarded).
4. A re-synthesis agent rewrites the full report from all accumulated findings.
5. The loop continues — the next iteration audits the re-synthesized report.
6. `incrementalCycles` increments; at `MAX_INCREMENTAL` the inner loop exits and the best synthesis is delivered.

---

## DEBATE mode mechanics

When `arbitration.verdict === 'DEBATE'`:
1. `arbitration.counterArgument` contains the lead researcher's evidence.
2. The counter-argument is appended to `debateHistory[]`.
3. The next audit pass receives `debateHistory` prepended to the audit prompt.
4. The critic audits again with the counter-argument in view.
5. After `MAX_DEBATE` rounds, `finalVerdict` is forced to `'APPROVED'` regardless.

---

## QUICK_ANSWER path

The triage agent classifies the query. If `type === 'QUICK_ANSWER'`:
1. A single general agent answers directly (local or web as appropriate).
2. No plan, no critic, no loop, no HTML file.
3. The workflow returns `{ type: 'QUICK_ANSWER', answer }` immediately.

Threshold: single factual lookup, likely in one place, no comparison or synthesis needed.
When in doubt, the triage agent should choose `DEEP_RESEARCH`.

---

## State tracking

Progress is emitted via `phase()` and `log()` calls in the workflow — visible in `/workflows`:

| Call | When |
|---|---|
| `phase('Triage')` | Start of query classification |
| `phase('Plan')` | Plan decomposition begins |
| `phase('Plan Review')` | Critic review starts |
| `phase('Research')` | Each research round (called again for each round) |
| `phase('Synthesize')` | Each synthesis pass |
| `phase('Audit')` | Each critic audit |
| `phase('Deliver')` | HTML rendering and file write |
| `log(message)` | Round counts, verdicts, gap counts, cap notifications |
