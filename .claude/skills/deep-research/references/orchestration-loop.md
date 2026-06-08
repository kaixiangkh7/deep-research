# Orchestration Loop Reference

Detailed mechanics for the `deep-research` skill's multi-agent coordination loop. The SKILL.md has the phase summary; this file has the edge cases, caps, and decision trees.

---

## Full loop diagram

```
User query
    │
    ▼
[Phase 0] Intent triage ──QUICK_ANSWER──► Answer directly
    │ DEEP_RESEARCH
    ▼
[Phase 1] Clarify (optional HITL)
    │
    ▼
[Phase 2] Plan: decompose into sub-questions, tag local/web
    │
    ▼
[Phase 3] Plan review (research-critic: plan-review mode)
    │
    ├──min≥4 & no risks──► proceed
    │
    └──min<4 or risks──► revise plan once ──► re-review ──► proceed regardless
    │
    ▼
[Phase 4] Parallel dispatch (all workers in one message)
    │         ├── document-researcher (local sub-questions)
    │         └── web-researcher      (web sub-questions)
    ▼
[Phase 5] Gap evaluation
    │
    ├──sufficient──► proceed to synthesis
    │
    └──gaps found──► targeted re-plan ──► Phase 4 again
                     (max 3 rounds total; after cap → proceed)
    │
    ▼
[Phase 6] Synthesize: write grounded report with all accumulated findings
    │
    ▼
[Phase 7] Output audit (research-critic: output-audit mode)
    │
    ▼
[Phase 8] Arbitrate
    │
    ├──APPROVED──────────────────────────────────────────────► deliver
    │
    ├──INCREMENTAL──► targeted Phase 4–6 for gap ──► merge ──► re-arbitrate
    │                 (max 3 INCREMENTAL cycles total)
    │
    ├──REJECTED──► restart from Phase 2 with revised plan
    │              (max 3 REJECTED cycles total; after cap → APPROVED)
    │
    ├──DEBATE──► re-submit to critic with counter-argument
    │             ──► critic replies ──► re-arbitrate
    │             (max 2 debate rounds; after cap → APPROVED)
    │
    └──NEEDS-CLARIFICATION──► AskUserQuestion ──► resume from Phase 2
    │
    ▼
[Phase 9] Deliver final grounded report
```

---

## Round caps (hard limits)

| Loop | Cap | What happens at cap |
|---|---|---|
| Research rounds (Phases 4–5) | 3 total | After round 3, proceed to synthesis with whatever was gathered |
| INCREMENTAL cycles (Phase 8) | 3 total | After 3, deliver current report |
| REJECTED restarts (Phase 8) | 3 total | After 3, deliver best available report with caveats |
| DEBATE rounds (Phase 8) | 2 total | After 2, force APPROVED and deliver |
| Plan revision cycles (Phase 3) | 1 total | After 1 revision, proceed regardless of score |

These caps prevent infinite loops. When a cap is hit, always notify the user:
> "Reached maximum [X] rounds. Delivering best available findings."

---

## Parallelism rules

**Do in one message (concurrent)** using the Agent tool (formerly Task — both work):
- All initial worker dispatches (Phase 4)
- Follow-up gap-fill dispatches (Phase 5)

**Must be sequential:**
- Plan review THEN dispatch (critic needs the plan to review)
- Dispatch THEN synthesis (synthesis needs worker results)
- Synthesis THEN output audit (audit needs the synthesized report)

**Never concurrent with each other:**
- Two critic calls
- A critic call and a researcher call in the same batch

---

## Incremental vs. Rejected decision tree

```
Critic flags: "has_ungrounded_claims: Yes"
    │
    ├── Are the flagged claims isolated (1–2 specific facts)?
    │       YES → INCREMENTAL: targeted re-research for those facts only
    │       NO  → REJECTED: fundamental problem, full restart
    │
    └── Is the critic correct? (Check your own sources)
            NO  → DEBATE: cite evidence for why the claim IS grounded
            YES → accept INCREMENTAL or REJECTED as appropriate

Critic flags: "does_answer_query: No"
    │
    ├── Is it a scope gap (missing sub-topic)?
    │       YES → INCREMENTAL: targeted re-research for missing scope
    │       NO  → REJECTED: wrong approach entirely
    │
    └── Is the required source accessible?
            NO  → NEEDS-CLARIFICATION: ask user for the source
            YES → INCREMENTAL or REJECTED depending on severity
```

---

## INCREMENTAL mode mechanics

When arbitration verdict is INCREMENTAL:
1. Identify **exactly** which facts are missing (from critic's `consultant_opinion`).
2. Create a mini-plan covering only those gaps (1–3 sub-questions).
3. Dispatch only the workers needed for those sub-questions.
4. Merge the new findings with **all previously accumulated findings**.
5. Re-synthesize the full report (do NOT discard previous findings).
6. Skip re-auditing (to avoid INCREMENTAL loops). Deliver directly.

Exception: if the merged report introduces new concerns, do one final audit.

---

## DEBATE mode mechanics

When you disagree with the critic's finding:
1. State your counter-argument explicitly with evidence:
   > "The critic flagged claim X as ungrounded, but [file.md:42] contains the exact quote 'Y'. The citation is valid."
2. Re-submit to `research-critic` in output-audit mode with your debate history appended:
   > MODE: output-audit  
   > DEBATE ROUND: 1  
   > LEAD'S COUNTER-ARGUMENT: <your argument>  
   > ORIGINAL REPORT: <report>
3. The critic reviews again in light of your argument.
4. After 2 debate rounds, force APPROVED regardless of outcome and deliver.

---

## QUICK_ANSWER path

For simple queries that do not need the full loop:
1. Determine if local files or web is most likely to have the answer.
2. Dispatch one worker (or answer directly from context if trivial).
3. Deliver with inline citation.
4. No critic, no plan, no loop.

Threshold for QUICK_ANSWER:
- Single factual lookup (a function signature, a config value, a definition)
- Answer is likely in one place
- No comparison, synthesis, or multi-source corroboration needed

When in doubt, run the full loop. False positives (running the full loop on a simple question) waste tokens but never produce wrong answers. False negatives (skipping the loop on a complex question) may produce uncited claims.

---

## State to track across phases

Use `TodoWrite` to maintain visible state:

```
[ ] Plan: <strategy summary>
[ ] Plan review: <min score / risks>
[ ] Research round 1: <sub-questions dispatched>
[ ] Research round 2 (if needed): <gap sub-questions>
[ ] Synthesis: <in progress>
[ ] Output audit: <critic findings>
[ ] Arbitration: <verdict>
```

Mark each item complete as you finish it. This gives the user visibility into where the loop is at any point.
