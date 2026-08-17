# SecAdvisor — Security Advisor Customer Intelligence Dashboard (V1)

Turn raw security/customer reports into an accurate, **traceable**, customer-ready
story — faster than doing it by hand.

**Local-first. Fully offline. No API keys. No server. No build step.**
Everything runs in your browser from a set of static files. Uploaded report data
never leaves your device.

---

## Run it

1. Open the project folder `security-advisor-dashboard`.
2. **Double-click `index.html`** (or drag it into any modern browser — Chrome, Edge, Firefox).

That's it. There is nothing to install and no server to start.

> Data you create (customers, uploaded reports, edited narratives) is saved in
> your browser's `localStorage`, so it persists across reloads **on that browser**.
> Use **Reset demo data** / **Clear all data** in the sidebar to manage it.

### Optional: serve it locally
Opening via `file://` works. If you prefer a local URL, run any static server in
the folder, e.g.:

```bash
npx serve .
# or
python -m http.server 8000
```

Then open the printed URL. No server is *required* — this is purely optional.

---

## The core workflow (2-minute demo)

The app ships seeded with three **fictional** customers already analyzed:

- **Nimbus Financial** — two quarterly CSV vulnerability scans (shows trends,
  new/resolved findings, and severity movement between reports).
- **Helios Health Systems** — a JSON cloud-posture report (critical PHI exposure).
- **Aurora Retail Group** — a plain-text external penetration test.

To walk the full loop:

1. **Open a customer** from the dashboard.
2. **Upload** a report (drag & drop) or pick one from **"Load a sample report…"**.
   Sample files also live in [`/samples`](./samples) for real drag-and-drop.
3. See **extracted findings** in the Analyst Workspace, grouped by severity.
4. **Review the evidence** — expand *Source evidence* on any finding to see the
   verbatim snippet and where it came from.
5. Click **Tell the Story**.
6. Toggle between **Executive** and **Technical** views.
7. **Edit** the narrative inline, then **Copy** it.

---

## What makes the output trustworthy

Every statement is tagged with its provenance, and the UI renders the three kinds
distinctly:

| Tag | Meaning |
| --- | --- |
| **FACT FROM REPORT** | Extracted verbatim/structurally from the uploaded file. Carries evidence + source location. |
| **AI INTERPRETATION** | A reading of the facts (deterministic, grounded in the extracted counts). |
| **RECOMMENDATION** | A suggested next step derived from the facts. |

**Findings are never invented.** The analyzer only surfaces content actually
present in the report. If it can't find structured findings, it says so rather
than fabricating any.

The **analyst is the final decision-maker**: remove irrelevant findings, mark
important ones, edit wording, regenerate, and edit the story before copying.

---

## Architecture (separation of concerns)

Plain ES5-compatible modules, each attaching to a `window.SA` namespace. No
bundler. The same modules also load in Node for testing.

```
index.html            → loads styles + scripts in order
styles.css            → dark security-SaaS theme
vendor/
  pdf.min.js          → bundled pdf.js (UMD) for OFFLINE PDF text extraction
  pdf.worker.min.js
js/
  utils.js            → severity/status normalization, helpers
  dom.js              → tiny element builder (textContent-only = XSS-safe)
  parsers.js          → INGESTION: PDF/CSV/JSON/TXT → RawParsedReport
  normalization.js    → cross-report deltas, trends, rollups
  analysis.js         → ANALYSIS: deterministic finding extraction + summary
  narrative.js        → "Tell the Story" (Executive + Technical)
  demo.js             → fictional seed data (runs the real pipeline)
  store.js            → local-first state (localStorage) + pub/sub
  ui.js               → all rendering + interaction
  app.js              → bootstrap
samples/              → sample report files for drag-and-drop
```

**Pipeline:** `parse → normalize → analyze → narrate`, all format-agnostic after
the parser. A shared `RawParsedReport` shape means new report formats only need a
new branch in `parsers.js`; nothing downstream changes.

### Adding a new report format later
Add a case in `js/parsers.js` that produces the standard shape
`{ format, filename, byteSize, text, structured, meta }`. The analyzer already
understands both structured arrays (JSON/CSV rows) and text (TXT/PDF).

### "AI provider" note
V1 uses a **deterministic, offline analysis engine** — there is no model call and
no API key, by design. The extraction and narrative logic is isolated in
`analysis.js` / `narrative.js`, so a real model provider could be swapped in
behind the same function signatures later without touching the UI or store.

---

## Security posture

- **No external calls.** No network requests of any kind at runtime; pdf.js is
  bundled locally. Uploaded data stays in the browser.
- **No code execution of uploaded content.** JSON is parsed as data
  (`JSON.parse`); text is treated as inert strings; there is no `eval`.
- **Sanitized rendering.** Report-derived content is inserted via `textContent`
  (never `innerHTML`), so malicious markup in a file cannot inject or execute.
- **File validation.** Type and size (25 MB) are checked before parsing.
- **No secrets.** There are no API keys or secrets in this project.
- **No sensitive logging.** Report contents are not logged to the console.

---

## Tests

A Node smoke test exercises the pure pipeline (parse → analyze → deltas →
narrative) with no browser:

```bash
node tests/smoke.js
```

It asserts the demo reports extract the expected findings/severities, that deltas
detect new/resolved/repeated items, that every finding carries evidence +
`FACT` provenance, and that both narrative views are produced.

---

## Scope (intentionally limited to V1)

No CRM/Salesforce/Jira/ticketing, no email, no scheduling, no auth/SSO, no
multi-user, no cloud infra, no autonomous agents. V1 proves one thing: **we can
reliably turn security reports into an accurate, traceable, customer-ready story.**
