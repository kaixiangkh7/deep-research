# Deep Research Pack — Claude Code Guidance

This repo contains a copy-paste Claude Code pack that implements grounded multi-agent research via the `deep-research` skill and three subagents.

## Research conventions

When the `deep-research` skill is active:
- Every factual claim in a report must have an inline markdown citation (`[file:line](path#Lline)` for local, `[title](url)` for web) during research phases.
- Workers return "Not found in sources" rather than speculate.
- The primary deliverable is a self-contained HTML report (`deep-research-report.html`) written to the working directory. It uses `<claim source="…" quote="…" page="…" context="…">text</claim>` tags in the body — the template JS upgrades them to interactive citation chips and builds the Sources list automatically. See `skills/deep-research/assets/report-template.html` and `references/html-claim-format.md`.
- A concise terminal summary (direct answer + key findings + file path) is printed after the HTML file is written.
- QUICK_ANSWER paths stay in the terminal only (no HTML file).

## Subagent roles (do not modify without updating the skill)

| Agent | Role | Must not |
|---|---|---|
| `document-researcher` | Local file grounded retrieval | Invent, speculate, or search the web |
| `web-researcher` | Web grounded retrieval | Cite root-only URLs; hallucinate facts |
| `research-critic` | Plan scoring + output audit | Issue verdicts; prescribe fixes |

## Loop behavior

Orchestration is a deterministic JS workflow (`workflows/deep-research.js`) — not prompt-driven. Hard caps enforced in code: 3 research rounds, 3 INCREMENTAL cycles, 3 REJECTED restarts, 2 DEBATE rounds. After any cap is hit the current best report is delivered.

## Extending the pack

To add a new specialist researcher (e.g., a database-researcher or code-executor):
1. Add `agents/your-agent.md` with the standard frontmatter (`name`, `description`, `tools`).
2. In `workflows/deep-research.js`, extend the `PLAN_SCHEMA` `workerType` enum to include the new type.
3. Update `workerPrompt()` to handle the new worker type.
4. Update the research dispatch `parallel()` call to use the new `agentType` for matching sub-questions.
