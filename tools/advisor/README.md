# SecAdvisor — WAF Report Interpreter & Email Drafter

Turn raw security & WAF dashboard exports (attack analytics, traffic metrics, security findings) into a polished, customer-ready advisory email in seconds.

**Local-first. Fully offline. No API keys. No server. No build step.**
Everything runs in your browser from a self-contained static file. Uploaded report data never leaves your device.

---

## Run it

1. Open `tools/advisor/index.html` (or open the root `index.html` landing page and click **SecAdvisor**).
2. Double-click or drag it into any modern browser (Firefox, Chrome, Edge, Safari).

There is nothing to install and no server to start.

---

## Features

- **Multi-Format Ingestion**: Drag & drop or paste CSV, JSON, TXT, or LOG exports from any WAF dashboard or security scanner.
- **Automated Metric Extraction**: Parses total event counts, blocked percentages, top attack categories (SQLi, XSS, Bad Bots, Credential Stuffing, RFI, API violations), and targeted endpoints.
- **Customer Email Drafter**:
  - **Monthly Security Review**: High-level overview, threat breakdown table, key observations, and prioritized next steps.
  - **Attack Spike / Incident Advisory**: Rapid incident brief covering surge metrics, WAF mitigation actions, and immediate recommendations.
  - **Executive Summary Brief**: High-level posture snapshot formatted for executive leadership.
  - **Action Items & Tuning**: Technical policy tuning recommendations (rate limiting, schema validation, bot challenges).
- **One-Click Export**: Copy full email with subject line or copy action items directly into your email client.
- **Privacy & Persistence**: Saves active drafts locally in browser `localStorage`.
