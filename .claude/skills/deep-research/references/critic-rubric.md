# Critic Rubric Reference

This document defines the scoring criteria and audit checklists used by the `research-critic` subagent. The Lead Researcher uses these to interpret critic feedback and make arbitration decisions.

---

## Plan Review Scorecard (6 criteria, 1–5 each)

### 1. Goal Alignment (1–5)
Does the plan directly and completely address the user's query?

| Score | Meaning |
|---|---|
| 5 | Every sub-question maps precisely to the user's stated need |
| 4 | Mostly aligned; minor tangent or slight gap |
| 3 | Partially aligned; key aspect of query under-addressed |
| 2 | Misaligned; plan answers a different or related question |
| 1 | Plan does not address the query |

### 2. Insight Quality (1–5)
Will the tasks yield specific, actionable findings — or only generic summaries?

| Score | Meaning |
|---|---|
| 5 | Sub-questions are precise; answers will be specific and directly usable |
| 4 | Mostly specific; one sub-question is vague |
| 3 | Mix of specific and vague; some useful, some generic |
| 2 | Most sub-questions too broad to yield specific findings |
| 1 | No sub-question is specific enough to yield useful answers |

### 3. Accuracy & Traceability (1–5)
Does the plan require citations and address hallucination risk?

| Score | Meaning |
|---|---|
| 5 | All tasks require exact citations; hallucination risk explicitly addressed |
| 4 | Citations required; minor gap in traceability |
| 3 | Some tasks could produce uncited claims; risk partially addressed |
| 2 | Citation requirements absent for most tasks |
| 1 | No traceability requirements; high hallucination risk |

### 4. Robustness (1–5)
Does the plan handle "not found" gracefully?

| Score | Meaning |
|---|---|
| 5 | Fallback strategy explicit; alternative sources identified |
| 4 | Plan handles partial failure adequately |
| 3 | Single point of failure; no fallback for key sub-questions |
| 2 | Plan likely fails if primary sources return nothing |
| 1 | No handling for missing data at all |

### 5. Simplicity (1–5)
Is the plan appropriately scoped for the question?

| Score | Meaning |
|---|---|
| 5 | Minimum necessary tasks to answer the query well |
| 4 | Slightly over-scoped; minor redundancy |
| 3 | Noticeable redundancy or unnecessary tasks |
| 2 | Significantly over-engineered |
| 1 | Far too complex; will waste tokens without improving the answer |

### 6. Feasibility (1–5)
Can the plan be executed with available tools (Read, Grep, Glob, WebSearch, WebFetch)?

| Score | Meaning |
|---|---|
| 5 | All tasks fully executable with built-in tools |
| 4 | Mostly feasible; one task slightly uncertain |
| 3 | At least one task requires a tool not available |
| 2 | Multiple tasks infeasible with available tools |
| 1 | Plan is fundamentally unexecutable |

---

## Gating thresholds (for Lead Researcher)

The Lead Researcher (not the critic) applies these gates:

| Condition | Action |
|---|---|
| Min score ≥ 4 AND no critical risks | Proceed to execution |
| Min score 3–3.9 OR non-critical risks | Revise plan once, then proceed |
| Min score < 3 OR critical risks present | Revise plan; re-submit to critic |

After one revision cycle, always proceed — do not loop forever on planning.

---

## Output Audit Checklist

The `research-critic` in output-audit mode checks these items:

### Query coverage
- [ ] Does the report open with a direct answer to the user's question?
- [ ] Are all sub-questions addressed (or explicitly noted as "not found")?
- [ ] Is the scope appropriate — not too narrow, not inflated with irrelevant content?

### Citation grounding
- [ ] Does every factual claim have an inline citation?
- [ ] For local-file citations: does the quoted text actually appear in the cited file? (Spot-check with Grep)
- [ ] For web citations: does the URL include a specific path (not just a root domain)?
- [ ] Are any claims made without sources?

### Hallucination flags
These patterns are suspicious — the critic should flag them:
- A claim with no citation at all
- A web citation to a generic root domain (`https://example.com` with no path)
- A local citation where the file does not exist or the line number is out of range
- A "quote" that doesn't match the verbatim content of the cited source

### Valid citation patterns (do NOT flag these as hallucinations)
- Web citations with a deep URL path + verbatim quote — even if the critic cannot re-fetch them
- Local citations where the quoted text is verified to appear in the file via Grep
- "Not found in sources" declarations — these are correct, not hallucinations

---

## Arbitration verdicts (for Lead Researcher reference)

After receiving the output audit, the Lead Researcher chooses one verdict:

| Verdict | When to use |
|---|---|
| **APPROVED** | Report fully answers the query; no ungrounded claims; OR critic finding is incorrect (explain why) |
| **INCREMENTAL** | Report is mostly correct but missing 1–2 specific facts; targeted gap-fill without full restart |
| **REJECTED** | Widespread ungrounded claims, or report fundamentally misses the query; full restart required |
| **DEBATE** | Critic flagged a claim as ungrounded but the Lead has evidence it IS grounded; state counter-argument |
| **NEEDS-CLARIFICATION** | Cannot fill the gap because the required source is inaccessible or the user must specify more |

Cap: Max 2 DEBATE rounds, then force APPROVED. Max 3 total INCREMENTAL/REJECTED cycles.
