# deep-research

> A grounded research team for Claude Code. One command turns any question into a fully-cited, interactive HTML report — built by a planner, six parallel researchers, and a quality auditor working together.

No extra API keys, no external services. Drop the `.claude/` folder into any project, launch Claude code, type `/deep-research` and go.

---

## Branches

| Branch | Approach | Best for |
|---|---|---|
| `master` | Claude Code orchestrates subagents directly via the Agent SDK | Anyone using Claude Code or the web/desktop app |
| [`dynamic-workflow`](https://github.com/kaixiangkh7/deep-research/tree/dynamic-workflow) | Deterministic flow using the new Dynamic Workflow harness | Claude Code CLI users who want explicit, reproducible orchestration |

Use `master` if you want Claude Code to orchestrate subagents directly. Switch to the `dynamic-workflow` branch if you're on the Claude Code CLI and want a deterministic execution flow powered by the Dynamic Workflow engine.

---

## What you get

Ask a question. Get this:

```
/deep-research is apple a good stock to buy
```

**→ A self-contained HTML report with:**
- Every factual claim backed by a verbatim quote from its source
- Interactive citation chips — click any claim to open a source verification sidebar
- SEC 10-Q filings, analyst reports, and live market data all in one place
- A `Not found in sources` declaration anywhere the evidence ran dry

No hallucinations. No unsourced claims. If it can't be cited, it isn't in the report.

---

## Requirements

- [Claude Code](https://claude.ai/code) installed and authenticated (`claude --version` works)

---

## Install

**The simple way** — download this repo and copy the `.claude/` folder into your project:

```
your-project/
└── .claude/          ← paste here
    ├── agents/
    └── skills/
```

Open Claude Code in your project and you're done.

---

**Via git clone — Per-project** (skill available only in one repo):

```bash
git clone https://github.com/kaixiangkh7/deep-research .claude
```

**Via git clone — Global** (skill available in every project):

```bash
git clone https://github.com/kaixiangkh7/deep-research ~/.claude
```

No build step, no dependencies, no config files to edit.

**Verify it worked:**

```
/deep-research what is the capital of France
```

If you see a plan being drafted and agents firing, you're set.

---

## Quickstart

```
# Ask anything — research, finance, technical, competitive analysis
/deep-research is apple a good stock to buy
/deep-research what are the best practices for LLM prompt caching
/deep-research summarize the key risks in this codebase
```

Your report saves to `./deep-research-report.html`. Open it in any browser — no server needed.

---

## The team

Four specialized agents, each with a single job:

| Agent | Role | What it does |
|---|---|---|
| **Lead Researcher** | Orchestrator | Breaks down the question, dispatches workers, synthesizes, and delivers |
| **Web Researcher** | Field agent | Searches the internet, fetches pages, returns only verbatim quotes with exact URLs |
| **Document Researcher** | Archivist | Searches local files, PDFs, and codebases with exact file:line citations |
| **Research Critic** | Quality control | Scores plans before execution; audits reports for ungrounded claims after synthesis |

The **Web Researcher** and **Document Researcher** run in parallel — up to 8 simultaneous workers on a single question, each answering one sub-question independently.

---

## How it works

```
Your question
     │
     ▼
  [Plan]  Lead Researcher breaks the question into 4–8 sub-questions
     │
     ▼
  [Score] Research Critic scores the plan (1–5 on 6 criteria) before a line is fetched
     │
     ▼
  [Research]  All workers fire at once — web + local in parallel
     │         ├── Web Researcher × N  (live web, SEC filings, docs)
     │         └── Document Researcher × N  (local files, PDFs, codebases)
     ▼
  [Gaps?]  Missing answers trigger a targeted second round (capped at 3 rounds)
     │
     ▼
  [Synthesize]  Lead Researcher writes the HTML report — every claim tagged
     │
     ▼
  [Audit]  Research Critic checks for ungrounded claims
     │
     ▼
  [Deliver]  Interactive HTML report saved to ./deep-research-report.html
```

---

## The rules every agent follows

**Web Researcher**
- Never cites a URL it hasn't fetched
- Never uses a root domain (`https://example.com`) — always the deepest specific path
- Returns `Information not found` rather than a plausible-sounding guess

**Document Researcher**
- Every claim includes `file:line` — no vague file-level citations
- Quotes are copy-pasted verbatim — no paraphrasing
- Returns `Not found in sources` rather than inferring

**Research Critic**
- Never issues verdicts or prescribes fixes — that's the Lead Researcher's job
- Scores plans on 6 criteria: Goal Alignment, Insight Quality, Accuracy, Robustness, Simplicity, Feasibility
- Audits reports by spot-checking quotes against actual source text

**Lead Researcher**
- Revises the plan if the critic scores below 4/5 on any criterion
- Decides APPROVED / INCREMENTAL / REJECTED / DEBATE after each audit — never rubber-stamps
- Caps at 3 research rounds, 3 incremental cycles, and 2 debate rounds to prevent infinite loops

---

## Example: 22-source investment report in one command

```
/deep-research is apple a good stock to buy
```

**What ran:**
- 6 parallel web researchers fired simultaneously
- Sources fetched: Apple Newsroom, SEC 10-Q (Q2 FY2026), StockAnalysis, GuruFocus, MarketBeat, Barclays, Wedbush, BofA, Morgan Stanley, EU Digital Markets Act, DOJ court filings, Fortune, MacRumors, The Motley Fool, and more
- Plan critic scored the plan 4.3/5 before a single search ran
- Output critic verified every claim — 0 ungrounded assertions flagged

**What you got:** A 22-source HTML report with verbatim 10-Q risk-factor language, exact analyst price targets, and a SEC filing section citing `aapl-20260328.htm` directly.

---

## Report features

The output HTML is fully self-contained — no server, no build step, just open in a browser.

- **Citation chips** — every claim is an inline clickable chip (blue = web, green = local file)
- **Source sidebar** — click any chip to see the verbatim grounding excerpt with the quoted text highlighted
- **Auto-generated sources list** — deduplicated and ordered by first appearance
- **Dark / light mode toggle**
- **"Not found" declarations** — gaps are surfaced as blockquotes, never silently dropped

---

## Project structure

```
.claude/
├── agents/
│   ├── web-researcher.md        # Field agent — internet sources
│   ├── document-researcher.md  # Archivist — local files
│   └── research-critic.md      # QC — plan scoring + output audit
│
└── skills/
    └── deep-research/
        ├── SKILL.md                        # 9-phase orchestration loop
        ├── assets/
        │   └── report-template.html        # Interactive HTML template
        └── references/
            ├── orchestration-loop.md       # Loop mechanics, caps, edge cases
            ├── critic-rubric.md            # Scoring criteria
            ├── citation-format.md          # Citation rules (markdown + HTML)
            └── html-claim-format.md        # <claim> tag schema
```

---

## Philosophy

> **Every claim must be grounded, or declared not found. There is no third option.**

Research tools that hallucinate are worse than no research tools at all — they give you confidence you haven't earned. This skill is built around one constraint: if a fact can't be traced to a real URL or a real file at a specific line, it does not go in the report.

The parallel agent architecture isn't about speed. It's about independence — each researcher answers their sub-question without seeing the others' work, so the Lead Researcher synthesizes from diverse, non-contaminated sources.

The critic isn't optional. It runs before research (scoring the plan) and after synthesis (auditing the report). A plan that passes the critic wastes fewer fetches. A report that passes the critic earns its citations.
