# Security Consulting Toolkit

A small suite of **local-first** tools I use for security consulting work — interpreting WAF metrics and drafting client advisories, tracking engagement tasks, and digging through investigation data.

Everything runs **offline in the browser**: no accounts, no backend, no build step, no API keys, and no data leaving the machine.

## Run it

Open **`index.html`** (double-click, or drag it into any modern browser). That's the toolkit landing page — pick a tool from there. Each tool is also a standalone single-file app you can open directly.

## Tools

| Tool | What it does | Open |
| --- | --- | --- |
| **SecAdvisor** | Upload customer reports from a WAF dashboard (attack analytics, traffic metrics) → interpret the threat posture → draft customer-ready advisory emails. | [`tools/advisor/index.html`](tools/advisor/index.html) |
| **Command Center · Kanban** | Quick-capture kanban / scrum board for engagement tasks: draggable cards, editable columns, priorities, due dates, tags, search, JSON export/import. | [`tools/kanban/index.html`](tools/kanban/index.html) |
| **WAF Raw Visit Investigator** | Investigation helper for making sense of raw WAF visit data during triage. | [`tools/raw-data/index.html`](tools/raw-data/index.html) |

## Structure

```
index.html               → toolkit landing page
tools/
  advisor/index.html     → SecAdvisor WAF email drafter (single file)
  kanban/index.html      → Command Center kanban board (single file)
  raw-data/index.html    → WAF Raw Visit Investigator (single file)
```

## Design principles across the suite

- **Local-first & private** — no network calls at runtime; anything you upload or paste stays in your browser (`localStorage` where persistence is needed).
- **Zero build step & portable** — self-contained HTML/CSS/JS single-file apps. Clone and open in Firefox, Chrome, Edge, or Safari.
- **Actionable output** — streamlined for real consulting workflows: triage traffic, analyze attacks, and draft client-facing deliverables.

---

Built by [Terminals &amp; Coffee](https://github.com/TerminalsandCoffee). These are working tools, not a product — a look at the workflow and utilities I lean on during security consulting engagements.
