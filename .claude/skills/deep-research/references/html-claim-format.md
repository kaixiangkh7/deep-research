# HTML Claim Format Reference

This document defines how Claude should emit grounded claims when writing the HTML
report body, and how to substitute the template placeholders.

---

## The `<claim>` tag

Every grounded fact in the HTML body must be wrapped in a `<claim>` tag. The template's
JavaScript reads these tags, replaces them with styled citation chips, and builds the
Sources section automatically.

```html
<claim source="…" quote="…" page="…" context="…" logic="…">visible claim text</claim>
```

### Attributes

| Attribute | Required | Description |
|---|---|---|
| `source` | Yes | Relative file path (e.g. `src/auth.ts`) or full URL (`https://…`). For web sources, use the deepest specific URL path — never a root domain. |
| `quote` | Yes | Exact verbatim text from the source. This drives the yellow highlight in the sidebar. Must match character-for-character (case-insensitive match is handled in JS). |
| `page` | Recommended | Human-readable location label: `line 42`, `L10–15`, `p. 12`, `§3.2`. |
| `context` | Recommended | A paragraph or passage of surrounding text from the source (makes the sidebar excerpt richer). If omitted, falls back to `quote`. |
| `logic` | Optional | Derived-reasoning note — use when a claim is computed or inferred rather than directly quoted (e.g. `"Sum of Q1–Q4 revenue figures"`). Renders as the "Derived Calculation" block. |

### Local file example

```html
The default timeout is 30 seconds
<claim source="src/config.ts" quote="timeout: 30000, // 30 seconds" page="line 18" context="export const defaults = {\n  retries: 3,\n  timeout: 30000, // 30 seconds\n  maxPayload: '10mb'\n};">
  [config.ts:18]
</claim>.
```

### Web source example

```html
AWS charges $0.023 per GB for the first 50 TB / month
<claim source="https://aws.amazon.com/s3/pricing/" quote="S3 Standard: $0.023 per GB for the first 50 TB / Month" page="Storage pricing table">
  [AWS S3 Pricing]
</claim>.
```

### Derived fact example

```html
Total 2024 revenue was $1.4 billion
<claim source="annual-report.pdf" quote="Q1: $340M" page="p. 12" logic="Sum of Q1 $340M + Q2 $360M + Q3 $350M + Q4 $350M = $1,400M">
  [annual-report.pdf, derived]
</claim>.
```

---

## Template placeholders

When writing the report, substitute these three placeholders:

| Placeholder | What to put |
|---|---|
| `<!--REPORT_TITLE-->` | The user's research query, title-cased (also used in `<title>`). |
| `<!--REPORT_META-->` | One or more `<span>` elements: date, source counts. Example: `<span>📅 2025-06-03</span><span>📄 4 local sources</span><span>🌐 2 web sources</span>` |
| `<!--REPORT_BODY-->` | The full article HTML (paragraphs, headings, lists, tables). Every grounded fact wrapped in `<claim>`. Do NOT include a Sources section — the template generates it. |

---

## Body HTML rules

1. Use semantic HTML: `<p>`, `<h2>`, `<h3>`, `<ul>`, `<ol>`, `<table>`, `<blockquote>`, `<code>`.
2. Start with an opening `<p>` that directly answers the query (executive summary).
3. Use `<h2>` for major section headings, `<h3>` for sub-sections.
4. Every factual claim → `<claim>` tag. Prose that's just framing or transition language doesn't need one.
5. For "not found" gaps: use a `<blockquote>` with the exact text:
   ```html
   <blockquote>Not found in sources: Searched <code>src/</code> for "cache configuration" — no matching content located.</blockquote>
   ```
6. Do NOT hand-write a `## Sources` section. The JS builds it from the `<claim>` tags.

---

## Output file

Write the finished HTML to:

```
./deep-research-report.html
```

in the current working directory. Use the `Write` tool with the full substituted
`report-template.html` content as the file body.

---

## Workflow at Phase 9

1. Read `assets/report-template.html` (use the `Read` tool with the path relative to the
   skill dir, resolved via `${CLAUDE_SKILL_DIR}`).
2. Build the article body HTML with `<claim>` tags.
3. Substitute `<!--REPORT_TITLE-->`, `<!--REPORT_META-->`, `<!--REPORT_BODY-->`.
4. Write the result to `./deep-research-report.html`.
5. Print a concise terminal summary: direct answer + 3–5 key findings + the file path.
