export const meta = {
  name: 'deep-research',
  description: 'Multi-agent grounded research: parallel workers, plan review, synthesis, audit, HTML report',
  phases: [
    { title: 'Triage', detail: 'Classify as QUICK_ANSWER or DEEP_RESEARCH' },
    { title: 'Plan', detail: 'Decompose query into local/web sub-questions' },
    { title: 'Plan Review', detail: 'research-critic scores plan on 6 criteria' },
    { title: 'Research', detail: 'Parallel dispatch to web/local researchers, up to 3 rounds' },
    { title: 'Synthesize', detail: 'Grounded HTML body with <claim> tags' },
    { title: 'Audit', detail: 'research-critic output-audit mode' },
    { title: 'Deliver', detail: 'Render HTML file, print terminal summary' },
  ],
}

// ─── Input ────────────────────────────────────────────────────────────────────

const query = typeof args === 'string' ? args : (args && args.query) || ''
const today  = (args && args.date) || '2026-06-09'

if (!query) {
  log('ERROR: No research query provided. Pass query via args.')
  return { error: 'No query provided' }
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const TRIAGE_SCHEMA = {
  type: 'object',
  required: ['type', 'reason'],
  properties: {
    type:   { type: 'string', enum: ['QUICK_ANSWER', 'DEEP_RESEARCH'] },
    reason: { type: 'string' }
  }
}

const PLAN_SCHEMA = {
  type: 'object',
  required: ['subquestions', 'strategy'],
  properties: {
    strategy: { type: 'string' },
    subquestions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'question', 'workerType'],
        properties: {
          id:          { type: 'string' },
          question:    { type: 'string' },
          workerType:  { type: 'string', enum: ['web', 'local'] },
          searchTerms: { type: 'string' },
          paths:       { type: 'array', items: { type: 'string' } }
        }
      }
    }
  }
}

const PLAN_REVIEW_SCHEMA = {
  type: 'object',
  required: ['scores', 'minimumScore', 'meanScore', 'hasCriticalRisks', 'criticalRisks'],
  properties: {
    scores: {
      type: 'object',
      required: ['goalAlignment', 'insightQuality', 'accuracyTraceability', 'robustness', 'simplicity', 'feasibility'],
      properties: {
        goalAlignment:        { type: 'number' },
        insightQuality:       { type: 'number' },
        accuracyTraceability: { type: 'number' },
        robustness:           { type: 'number' },
        simplicity:           { type: 'number' },
        feasibility:          { type: 'number' }
      }
    },
    minimumScore:      { type: 'number' },
    meanScore:         { type: 'number' },
    hasCriticalRisks:  { type: 'boolean' },
    criticalRisks:     { type: 'array', items: { type: 'string' } }
  }
}

const RESEARCH_FINDINGS_SCHEMA = {
  type: 'object',
  required: ['subquestionId', 'findings', 'coverage'],
  properties: {
    subquestionId: { type: 'string' },
    findings:      { type: 'string', description: 'Markdown findings with inline citations' },
    coverage:      { type: 'string', enum: ['fully_answered', 'partially_answered', 'not_found'] }
  }
}

const SYNTHESIS_SCHEMA = {
  type: 'object',
  required: ['reportBody', 'title', 'directAnswer', 'keyFindings', 'localSourceCount', 'webSourceCount'],
  properties: {
    reportBody:       { type: 'string', description: 'HTML article body with <claim> tags; no <html>/<head>/<body> wrapper' },
    title:            { type: 'string' },
    directAnswer:     { type: 'string', description: 'One-sentence direct answer to the query' },
    keyFindings:      { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 5 },
    localSourceCount: { type: 'number' },
    webSourceCount:   { type: 'number' }
  }
}

const AUDIT_SCHEMA = {
  type: 'object',
  required: ['answersQuery', 'hasUngroundedClaims', 'consultantOpinion'],
  properties: {
    answersQuery:       { type: 'string', enum: ['yes', 'no', 'partially'] },
    hasUngroundedClaims: { type: 'boolean' },
    ungroundedClaims:   { type: 'array', items: { type: 'string' } },
    consultantOpinion:  { type: 'string' }
  }
}

const ARBITRATION_SCHEMA = {
  type: 'object',
  required: ['verdict', 'reasoning'],
  properties: {
    verdict:              { type: 'string', enum: ['APPROVED', 'INCREMENTAL', 'REJECTED', 'DEBATE', 'NEEDS_CLARIFICATION'] },
    reasoning:            { type: 'string' },
    gapSubquestions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'question', 'workerType'],
        properties: {
          id:         { type: 'string' },
          question:   { type: 'string' },
          workerType: { type: 'string', enum: ['web', 'local'] },
          searchTerms: { type: 'string' },
          paths:       { type: 'array', items: { type: 'string' } }
        }
      }
    },
    counterArgument:      { type: 'string', description: 'For DEBATE: evidence that the critic is wrong' },
    clarificationNeeded:  { type: 'string', description: 'For NEEDS_CLARIFICATION: what to ask the user' }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function workerPrompt(sq) {
  if (sq.workerType === 'web') {
    return `Research this question using web search.

Question: "${sq.question}"
Search terms: ${sq.searchTerms || sq.question}
Subquestion ID (echo back in subquestionId field): ${sq.id}

Return findings with exact citations: full URL paths, verbatim quotes. If not found, say so explicitly.`
  }
  return `Research this question from local project files.

Question: "${sq.question}"
Search in: ${sq.paths && sq.paths.length > 0 ? sq.paths.join(', ') : '.'}
Subquestion ID (echo back in subquestionId field): ${sq.id}

Return findings with exact citations: file path + line number, verbatim quotes. If not found, say so explicitly.`
}

function findingsBlock(findings) {
  return findings
    .map((f, i) => `### Finding ${i + 1} [${f.subquestionId}] (${f.coverage})\n${f.findings}`)
    .join('\n\n')
    .slice(0, 8000)
}

// ─── Phase 0: Triage ──────────────────────────────────────────────────────────

phase('Triage')
log(`Query: "${query}"`)

const triage = await agent(
  `Classify this research query:
- QUICK_ANSWER: single factual lookup, answerable from one source in one step, no comparison or synthesis needed.
- DEEP_RESEARCH: comparison, synthesis, multi-source investigation, or analysis required.

When in doubt, choose DEEP_RESEARCH.

Query: "${query}"`,
  { label: 'triage', phase: 'Triage', schema: TRIAGE_SCHEMA }
)

if (!triage || triage.type === 'QUICK_ANSWER') {
  log('QUICK_ANSWER — dispatching single researcher')

  const answer = await agent(
    `Answer this question directly with a single citation. Search the web or local files as appropriate.
If not found, say so explicitly — do not guess.

Question: "${query}"`,
    { label: 'quick-answer', phase: 'Triage' }
  )

  return { type: 'QUICK_ANSWER', query, answer }
}

log('DEEP_RESEARCH — beginning full loop')

// ─── Loop state ───────────────────────────────────────────────────────────────

const MAX_RESEARCH_ROUNDS = 3
const MAX_INCREMENTAL     = 3
const MAX_DEBATE          = 2
const MAX_REJECTED        = 3

let allFindings  = []
let bestSynthesis = null
let rejectedCycles = 0

// ─── Outer loop: REJECTED restarts ────────────────────────────────────────────

while (rejectedCycles <= MAX_REJECTED) {

  // ── Plan ──────────────────────────────────────────────────────────────────

  phase('Plan')

  const priorContext = rejectedCycles > 0
    ? `\n\nPREVIOUS PLAN REJECTED (attempt ${rejectedCycles}). Revise strategy significantly.\nPrior findings for context:\n${findingsBlock(allFindings)}`
    : ''

  let plan = await agent(
    `Decompose this research query into concrete, parallel-ready sub-questions.

Query: "${query}"${priorContext}

Tag each sub-question:
- "local" → assign to document-researcher; list specific file paths or directories to search
- "web"   → assign to web-researcher; provide targeted search terms or URL

Scale: SIMPLE_FACT uses 1–3 sub-questions, DEEP_ANALYSIS uses 3–8. Do not over-engineer.`,
    { label: 'plan', phase: 'Plan', schema: PLAN_SCHEMA }
  )

  if (!plan || !plan.subquestions || plan.subquestions.length === 0) {
    log('ERROR: Planner returned no sub-questions')
    break
  }

  // ── Plan Review ───────────────────────────────────────────────────────────

  phase('Plan Review')

  const planReview = await agent(
    `MODE: plan-review
QUERY: "${query}"
PLAN STRATEGY: ${plan.strategy}
SUB-QUESTIONS:
${plan.subquestions.map((sq, i) => `${i + 1}. [${sq.workerType}] ${sq.question}`).join('\n')}

Score on 6 criteria (1–5 each):
1. Goal Alignment — does plan directly address the query?
2. Insight Quality — will answers be specific and actionable?
3. Accuracy & Traceability — are citation requirements clear? Hallucination risk addressed?
4. Robustness — does plan handle "not found" gracefully?
5. Simplicity — is scope appropriate, not over-engineered?
6. Feasibility — executable with Read, Grep, Glob, WebSearch, WebFetch?

Flag any critical risks with verbatim evidence from the plan text. Do not issue verdicts or rewrite the plan.`,
    { label: 'plan-review', phase: 'Plan Review', agentType: 'research-critic', schema: PLAN_REVIEW_SCHEMA }
  )

  const needsRevision = planReview && (planReview.minimumScore < 4 || planReview.hasCriticalRisks)
  if (needsRevision) {
    log(`Plan needs revision — min score: ${planReview.minimumScore}, critical risks: ${planReview.hasCriticalRisks}`)

    const revised = await agent(
      `Revise this research plan to address critic feedback.

Query: "${query}"
Original plan: ${JSON.stringify(plan, null, 2)}

Critic feedback:
- Minimum score: ${planReview.minimumScore}/5
- Critical risks: ${planReview.criticalRisks.join('; ')}

Address all risks. Keep the same scope — do not over-engineer.`,
      { label: 'plan-revised', phase: 'Plan Review', schema: PLAN_SCHEMA }
    )

    if (revised && revised.subquestions && revised.subquestions.length > 0) plan = revised
  }

  // ── Research rounds ───────────────────────────────────────────────────────

  phase('Research')
  allFindings = []
  let researchRound = 0
  let activeSubquestions = plan.subquestions.slice()

  while (researchRound < MAX_RESEARCH_ROUNDS && activeSubquestions.length > 0) {
    researchRound++
    log(`Research round ${researchRound} — ${activeSubquestions.length} sub-question(s) in parallel`)

    const roundFindings = await parallel(
      activeSubquestions.map(sq => () => agent(
        workerPrompt(sq),
        {
          label:      `research:${sq.id}:r${researchRound}`,
          phase:      'Research',
          agentType:  sq.workerType === 'web' ? 'web-researcher' : 'document-researcher',
          schema:     RESEARCH_FINDINGS_SCHEMA
        }
      ))
    )

    const valid = roundFindings.filter(Boolean)
    allFindings.push(...valid)

    const gaps = valid.filter(f => f.coverage !== 'fully_answered')
    if (gaps.length < 2 || researchRound >= MAX_RESEARCH_ROUNDS) break

    log(`${gaps.length} gap(s) found — planning follow-up round`)

    const gapPlan = await agent(
      `Create 1–3 targeted follow-up sub-questions to fill these research gaps.

Original query: "${query}"
Unanswered sub-questions:
${gaps.map(f => `- [${f.subquestionId}] ${f.coverage}: ${f.findings.slice(0, 200)}`).join('\n')}

Use different sources or search angles than before.`,
      { label: `gap-plan:r${researchRound}`, phase: 'Research', schema: PLAN_SCHEMA }
    )

    activeSubquestions = (gapPlan && gapPlan.subquestions) ? gapPlan.subquestions : []
  }

  log(`Research complete — ${allFindings.length} findings across ${researchRound} round(s)`)

  // ── Synthesis + Audit inner loop ──────────────────────────────────────────

  phase('Synthesize')

  let synthesis = await agent(
    `Synthesize all research findings into a grounded HTML report body.

Original query: "${query}"
Today's date: ${today}

RESEARCH FINDINGS:
${findingsBlock(allFindings)}

Rules for the HTML body (no <html>/<head>/<body> wrapper):
- Open with a <p> that directly answers the query
- Use <h2> per major topic, <h3> for sub-sections
- Wrap EVERY factual claim in a <claim> tag:
    <claim source="…" quote="…" page="…" context="…">visible text</claim>
    • source: relative file path OR full specific URL (never a root domain)
    • quote: verbatim text from the source
    • page: line number, page, or section reference
    • context: surrounding passage for the sidebar excerpt
- For "not found" gaps: <blockquote>Not found in sources: …</blockquote>
- Do NOT write a Sources section — the template generates it from <claim> tags
- Count local file sources and web URL sources used`,
    { label: 'synthesize', phase: 'Synthesize', schema: SYNTHESIS_SCHEMA }
  )

  if (!synthesis) break
  bestSynthesis = synthesis

  let incrementalCycles = 0
  let debateRounds = 0
  let debateHistory = []
  let finalVerdict = null

  while (incrementalCycles < MAX_INCREMENTAL) {

    // Audit
    phase('Audit')

    const auditPrompt = debateHistory.length > 0
      ? `Audit this report. The lead researcher offers this counter-argument:\n${debateHistory.join('\n---\n')}\n\n`
      : ''

    const audit = await agent(
      `${auditPrompt}MODE: output-audit
QUERY: "${query}"

REPORT BODY (excerpt):
${synthesis.reportBody.slice(0, 5000)}

Check:
1. Does the report directly answer the query?
2. Does every factual claim have a <claim> tag with a grounded citation?
3. Are web sources specific URLs (not root domains like https://example.com)?
4. Are unanswerable gaps explicitly declared as "Not found in sources"?

Do NOT issue verdicts or prescribe fixes. Report only what you observe.`,
      { label: `audit:c${incrementalCycles}`, phase: 'Audit', agentType: 'research-critic', schema: AUDIT_SCHEMA }
    )

    if (!audit) { finalVerdict = 'APPROVED'; break }

    // Arbitrate (orchestrator logic — not delegated to an agent)
    const clean = audit.answersQuery === 'yes' && !audit.hasUngroundedClaims
    if (clean) { finalVerdict = 'APPROVED'; log('Audit: APPROVED'); break }

    const arbitration = await agent(
      `You are the lead researcher arbitrating the critic's audit. Decide a verdict:

AUDIT RESULT:
- answersQuery: ${audit.answersQuery}
- hasUngroundedClaims: ${audit.hasUngroundedClaims}
- ungroundedClaims: ${(audit.ungroundedClaims || []).join('; ')}
- consultantOpinion: ${audit.consultantOpinion}

ACCUMULATED FINDINGS SUMMARY:
${allFindings.map(f => `[${f.subquestionId}] ${f.coverage}`).join(', ')}

Verdicts:
- APPROVED: report fully answers query with valid citations (or critic is wrong)
- INCREMENTAL: 1–2 specific facts missing; can do targeted gap-fill without full restart
- REJECTED: widespread ungrounded claims or fundamental query miss; need new plan
- DEBATE: you have evidence a flagged claim IS grounded; provide counter-argument
- NEEDS_CLARIFICATION: required source inaccessible; user must provide more info

For INCREMENTAL: list gapSubquestions (1–3 targeted sub-questions with workerType).
For DEBATE: fill counterArgument with specific evidence.`,
      { label: `arbitrate:c${incrementalCycles}`, schema: ARBITRATION_SCHEMA }
    )

    if (!arbitration) { finalVerdict = 'APPROVED'; break }
    finalVerdict = arbitration.verdict

    log(`Arbitration: ${finalVerdict}`)

    if (finalVerdict === 'APPROVED') break

    if (finalVerdict === 'DEBATE') {
      if (debateRounds >= MAX_DEBATE) { finalVerdict = 'APPROVED'; log('DEBATE cap reached — forcing APPROVED'); break }
      debateRounds++
      debateHistory.push(`Round ${debateRounds}: ${arbitration.counterArgument}`)
      log(`DEBATE round ${debateRounds}/${MAX_DEBATE}`)
      continue
    }

    if (finalVerdict === 'INCREMENTAL') {
      incrementalCycles++
      const gaps = (arbitration.gapSubquestions || []).filter(Boolean)
      if (gaps.length === 0) { finalVerdict = 'APPROVED'; break }

      log(`INCREMENTAL gap-fill cycle ${incrementalCycles}/${MAX_INCREMENTAL} — ${gaps.length} sub-question(s)`)

      const gapFindings = await parallel(
        gaps.map(sq => () => agent(
          workerPrompt(sq),
          {
            label:     `gap:${sq.id}:c${incrementalCycles}`,
            phase:     'Research',
            agentType: sq.workerType === 'web' ? 'web-researcher' : 'document-researcher',
            schema:    RESEARCH_FINDINGS_SCHEMA
          }
        ))
      )

      allFindings.push(...gapFindings.filter(Boolean))

      phase('Synthesize')
      const reSynth = await agent(
        `Re-synthesize the full report incorporating additional findings.

Original query: "${query}"
Today's date: ${today}

ALL ACCUMULATED FINDINGS (${allFindings.length} total):
${findingsBlock(allFindings)}

Same rules: every factual claim in a <claim> tag, gaps in <blockquote>, no Sources section.`,
        { label: `re-synthesize:c${incrementalCycles}`, phase: 'Synthesize', schema: SYNTHESIS_SCHEMA }
      )

      if (reSynth) { synthesis = reSynth; bestSynthesis = reSynth }
      continue
    }

    if (finalVerdict === 'REJECTED' || finalVerdict === 'NEEDS_CLARIFICATION') break
  }

  // After inner loop: treat exhausted INCREMENTAL budget as APPROVED (deliver best)
  if (!finalVerdict || finalVerdict === 'INCREMENTAL') finalVerdict = 'APPROVED'

  if (finalVerdict === 'APPROVED' || finalVerdict === 'DEBATE' || finalVerdict === 'NEEDS_CLARIFICATION') break

  if (finalVerdict === 'REJECTED') {
    rejectedCycles++
    if (rejectedCycles > MAX_REJECTED) { log('REJECTED cap reached — delivering best available'); break }
    log(`REJECTED restart ${rejectedCycles}/${MAX_REJECTED} — re-planning`)
    continue
  }

  break
}

// ─── Phase: Deliver ───────────────────────────────────────────────────────────

phase('Deliver')

if (!bestSynthesis) {
  log('ERROR: No synthesis produced — research failed')
  return { error: 'Research failed to produce a report', query }
}

await agent(
  `Render the final deep-research HTML report.

Steps:
1. Read the template from: .claude/skills/deep-research/assets/report-template.html
2. Make exactly these three substitutions (replace the placeholder comments):
   <!--REPORT_TITLE-->  →  ${bestSynthesis.title}
   <!--REPORT_META-->   →  <span>📅 ${today}</span><span>📄 ${bestSynthesis.localSourceCount} local source(s)</span><span>🌐 ${bestSynthesis.webSourceCount} web source(s)</span>
   <!--REPORT_BODY-->   →  (the REPORT BODY below, verbatim)
3. Write the full substituted HTML to: ./deep-research-report.html

REPORT BODY:
${bestSynthesis.reportBody}`,
  { label: 'render-html', phase: 'Deliver' }
)

log('Report written → ./deep-research-report.html')

return {
  type:         'DEEP_RESEARCH',
  query,
  reportPath:   './deep-research-report.html',
  directAnswer: bestSynthesis.directAnswer,
  keyFindings:  bestSynthesis.keyFindings,
  localSources: bestSynthesis.localSourceCount,
  webSources:   bestSynthesis.webSourceCount,
}
