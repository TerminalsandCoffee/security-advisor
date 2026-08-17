/*
 * utils.js — shared helpers + the severity/status vocabulary.
 *
 * Every logic module in this app uses the same UMD-ish wrapper so it works two
 * ways with zero build step:
 *   - In the browser (file://) as a classic <script>, attaching to window.SA
 *   - In Node (for the smoke test) via require(), attaching to globalThis.SA
 */
(function (root) {
  const SA = (root.SA = root.SA || {});

  /** Non-crypto unique id (fine for local-only records). */
  function uid(prefix) {
    return (
      (prefix || "id") +
      "_" +
      Math.random().toString(36).slice(2, 10) +
      Date.now().toString(36).slice(-4)
    );
  }

  const SEVERITIES = ["critical", "high", "medium", "low", "info"];

  const SEVERITY_RANK = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

  function severityRank(s) {
    return SEVERITY_RANK[s] != null ? SEVERITY_RANK[s] : 0;
  }

  function sortBySeverity(items) {
    return items
      .slice()
      .sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
  }

  /**
   * Normalize any messy severity token from a report into our 5-level scale.
   * Accepts words (critical/high/…), CVSS-ish numbers, and common synonyms.
   * Returns null when nothing recognizable is present (so callers can decide a
   * sensible default without us inventing a severity).
   */
  function normalizeSeverity(value) {
    if (value == null) return null;
    if (typeof value === "number") return severityFromScore(value);
    const raw = String(value).trim().toLowerCase();
    if (!raw) return null;

    // Pure number (possibly with decimals) => treat as CVSS score.
    if (/^\d+(\.\d+)?$/.test(raw)) return severityFromScore(parseFloat(raw));

    if (/(^|\b)(crit|critical|sev\s*1|p1|emergency)($|\b)/.test(raw)) return "critical";
    if (/(^|\b)(high|severe|major|sev\s*2|p2)($|\b)/.test(raw)) return "high";
    if (/(^|\b)(med|medium|moderate|sev\s*3|p3)($|\b)/.test(raw)) return "medium";
    if (/(^|\b)(low|minor|sev\s*4|p4)($|\b)/.test(raw)) return "low";
    if (/(^|\b)(info|informational|none|note|negligible)($|\b)/.test(raw)) return "info";
    return null;
  }

  function severityFromScore(n) {
    if (isNaN(n)) return null;
    if (n >= 9) return "critical";
    if (n >= 7) return "high";
    if (n >= 4) return "medium";
    if (n > 0) return "low";
    return "info";
  }

  function normalizeStatus(value) {
    if (value == null) return "unknown";
    const raw = String(value).trim().toLowerCase();
    if (/(resolved|closed|fixed|remediated|passed|pass|mitigated|compliant)/.test(raw))
      return "resolved";
    if (/(in.?progress|ongoing|acknowledged|investigating|assigned)/.test(raw))
      return "in_progress";
    if (/(open|new|active|failed|fail|detected|present|non.?compliant|vulnerable)/.test(raw))
      return "open";
    return "unknown";
  }

  /** Extract CVE identifiers from an arbitrary string. */
  function extractCves(text) {
    if (!text) return [];
    const matches = String(text).toUpperCase().match(/CVE-\d{4}-\d{3,7}/g);
    return matches ? Array.from(new Set(matches)) : [];
  }

  function clampText(text, max) {
    if (!text) return "";
    const t = String(text);
    return t.length > max ? t.slice(0, max) + "…" : t;
  }

  function titleCase(s) {
    return String(s || "")
      .replace(/[_\-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function pluralize(n, word) {
    return n + " " + word + (n === 1 ? "" : "s");
  }

  function formatBytes(bytes) {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + " " + units[i];
  }

  SA.utils = {
    uid,
    SEVERITIES,
    severityRank,
    sortBySeverity,
    normalizeSeverity,
    severityFromScore,
    normalizeStatus,
    extractCves,
    clampText,
    titleCase,
    pluralize,
    formatBytes,
  };
})(typeof self !== "undefined" ? self : globalThis);
