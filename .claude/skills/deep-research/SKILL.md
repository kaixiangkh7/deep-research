---
name: deep-research
description: Full-fidelity multi-agent research skill. Triggers on requests like "research X", "do a deep dive on Y", "find grounded answers with citations", "investigate Z across my files and the web", or any question requiring thorough evidence-based analysis. Runs the complete orchestration loop: plan → critic scorecard → parallel dispatch → gap re-planning → synthesize → critic audit → arbitrate → deliver. All claims are grounded with exact citations. No hallucinations.
allowed-tools: Agent, Workflow, WebSearch, WebFetch, Read, Grep, Glob, Write, AskUserQuestion
---

# Deep Research Skill

This skill delegates to the `deep-research` workflow, which owns all orchestration logic
(planning, parallel dispatch, gap-filling, synthesis, audit, arbitration, HTML rendering).

## On activation

1. Extract the user's research question verbatim from their message.
2. Call the Workflow tool:

```
Workflow({
  name: 'deep-research',
  args: { query: '<the user's research question>', date: '<today YYYY-MM-DD>' }
})
```

3. When the workflow completes, print a terminal summary:
   - **Direct answer** — from `result.directAnswer`
   - **Key findings** — `result.keyFindings` as a bullet list
   - `📄 Report saved → {result.reportPath}` (unique per session; format: `deep-research-<date>-<slug>.html`)
   - If any sub-questions were unanswerable, note them here.

## QUICK_ANSWER exception

If the workflow returns `{ type: 'QUICK_ANSWER' }`, print the answer inline only — no HTML file.

## Workflow source

`.claude/workflows/deep-research.js` — edit that file to change orchestration behaviour.
Reference docs in `.claude/skills/deep-research/references/` remain authoritative for citation
format, critic rubric, HTML claim schema, and loop mechanics.
