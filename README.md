# Security Consulting Toolkit

A small suite of **local-first** tools I use for security consulting work — turning
raw reports into client-ready stories, tracking engagement tasks, and digging
through investigation data.

Everything runs **offline in the browser**: no accounts, no backend, no build
step, no API keys, and no data leaving the machine.

## Run it

Open **`index.html`** (double-click, or drag it into any modern browser). That's
the toolkit landing page — pick a tool from there. Each tool is also a standalone
file you can open directly.

## Tools

| Tool | What it does | Open |
| --- | --- | --- |
| **Security Advisor Dashboard** | Upload a customer security report (PDF/CSV/JSON/TXT) → extract traceable findings → generate a customer-ready narrative in Executive and Technical views. Findings are never invented; every statement traces back to its source. | [`tools/advisor/index.html`](tools/advisor/index.html) |
| **Command Center · Kanban** | Quick-capture kanban / scrum board for engagement tasks: draggable cards, editable columns, priorities, due dates, tags, search, JSON export/import. | [`tools/kanban/index.html`](tools/kanban/index.html) |
| **WAF Raw Visit Investigator** | Investigation helper for making sense of raw WAF visit data during triage. | [`tools/raw-data/index.html`](tools/raw-data/index.html) |

## Structure

```
index.html               → toolkit landing page
tools/
  advisor/               → Security Advisor Dashboard (multi-file app)
    index.html, js/, styles.css, vendor/, samples/, tests/
    README.md            → full docs for this tool
  kanban/index.html      → Command Center kanban board (single file)
  raw-data/index.html    → WAF Raw Visit Investigator (single file)
```

## Design principles across the suite

- **Local-first & private** — no network calls at runtime; anything you upload or
  paste stays in your browser (`localStorage` where persistence is needed).
- **No build step** — plain HTML/CSS/JS. Clone and open.
- **Traceable output** — where the tools produce analysis (e.g. the Advisor
  Dashboard), facts, interpretations, and recommendations are clearly separated so
  the analyst stays the final decision-maker.

## Tests

The Advisor Dashboard has a Node smoke test for its analysis pipeline:

```bash
cd tools/advisor
node tests/smoke.js
```

---

Built by [Terminals &amp; Coffee](https://github.com/TerminalsandCoffee). These are
working tools, not a product — a look at the workflow and utilities I lean on
during security consulting engagements.
