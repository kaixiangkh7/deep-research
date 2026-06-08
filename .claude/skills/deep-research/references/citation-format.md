# Citation Format Reference

All research output — from subagents and from the Lead Researcher's final synthesis — must follow this format. Every factual claim must be grounded. If a fact cannot be cited, it must be omitted or explicitly flagged as unverified.

---

## Inline citations

### Local files

```markdown
[filename.ext:line](relative/path/to/file#Lline)
```

Examples:
- `[config.ts:42](src/config.ts#L42)` — single line
- `[auth.py:10-15](backend/auth.py#L10-L15)` — line range
- `[README.md:3](README.md#L3)` — root-level file

Rules:
- Path must be **relative to the project root**.
- Line number(s) must be exact — verify with Read/Grep before citing.
- Use the shortest unambiguous path (don't include `./`).

### Web sources

```markdown
[Page Title or Domain](https://exact.full/url/path)
```

Examples:
- `[React Docs — useEffect](https://react.dev/reference/react/useEffect)`
- `[AWS S3 Pricing](https://aws.amazon.com/s3/pricing/)`

Rules:
- URL must be the **deepest, most specific path** where the information appears.
- Never use a generic root domain (`https://example.com`) as a citation — that proves nothing.
- Title should describe the specific page, not just the site.

---

## Inline usage in prose

Weave citations directly into sentences:

```markdown
The default timeout is 30 seconds ([config.ts:18](src/config.ts#L18)).

AWS charges $0.023 per GB for S3 Standard storage ([AWS S3 Pricing](https://aws.amazon.com/s3/pricing/)).
```

Do **not** use footnote numbers (`[^1]`) — use inline links so readers can immediately jump to the source.

---

## Sources section

Every research report must end with a `## Sources` section listing all cited sources with their exact quotes:

```markdown
## Sources

1. [config.ts:18](src/config.ts#L18)
   > "timeout: 30000, // 30 seconds"

2. [AWS S3 Pricing](https://aws.amazon.com/s3/pricing/)
   > "S3 Standard: $0.023 per GB for the first 50 TB / Month"

3. [auth.py:10-15](backend/auth.py#L10-L15)
   > "def validate_token(token: str) -> bool:\n    if not token:\n        return False"
```

Rules:
- List sources in the order they first appear in the report.
- The blockquote (`>`) must be **verbatim** from the source — no paraphrasing.
- For multi-line quotes, preserve line breaks with `\n` or use a multi-line blockquote.
- For web sources, the quote must be text that actually appeared on the fetched page.

---

## "Not found" declarations

When a sub-question cannot be answered from available sources, declare it explicitly rather than omitting or filling in:

**Local files:**
```markdown
> Not found in sources: Searched `src/`, `docs/` for "timeout configuration" — no matching content located.
```

**Web:**
```markdown
> Information not found based on current available sources: Searched for "AWS Lambda cold start 2024 benchmarks" — no pages with verifiable content located.
```

Do **not** guess. Do **not** hallucinate a plausible answer. Explicit "not found" is always preferred over a wrong citation.

---

## Grounding rule

> **Every factual claim in a research report must be grounded by an inline citation, OR explicitly declared as "not found in sources."**
>
> There is no third option. Unsupported claims will be flagged by the research-critic and may trigger a re-research cycle.

---

## HTML report output

The `deep-research` skill's primary output is a self-contained HTML file
(`deep-research-report.html`) that renders citations as interactive chips. The terminal
also prints a brief summary.

In the HTML body, citations use richer `<claim>` tags rather than markdown links:

```html
<claim source="src/config.ts" quote="timeout: 30000" page="line 18"
       context="export const defaults = { timeout: 30000 }">
  the default timeout is 30 seconds
</claim>
```

The `context` attribute feeds the yellow-highlighted excerpt in the Source Verification
sidebar; the `logic` attribute adds a "Derived Calculation" block for computed facts.

See [`html-claim-format.md`](html-claim-format.md) for the full schema, placeholder
substitution instructions, and body HTML rules.

Workers (`document-researcher`, `web-researcher`) still return markdown citations during
the research phases — the Lead Researcher converts them to `<claim>` tags at synthesis.
