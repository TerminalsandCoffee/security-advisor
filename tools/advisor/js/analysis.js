/*
 * analysis.js — deterministic, offline finding extraction + interpretation.
 *
 * DESIGN PRINCIPLE: never invent security findings. Findings are only ever
 * extracted from content actually present in the uploaded report. Every finding
 * carries verbatim `evidence` and a `sourceLocation` so it is fully traceable.
 *
 * The summary separates three provenance buckets that the UI renders distinctly:
 *   - keyFacts        -> FACT (pulled straight from the report)
 *   - interpretations -> AI_INTERPRETATION (a reading of the facts)
 *   - recommendations -> RECOMMENDATION (suggested actions)
 *
 * There is no model call here. "AI interpretation" = deterministic templated
 * reasoning grounded strictly in the extracted counts/facts.
 */
(function (root) {
  const SA = (root.SA = root.SA || {});
  const U = SA.utils;

  const FIELD_MAP = {
    title: [
      "title", "name", "finding", "vulnerability", "vuln", "issue", "rule",
      "check", "check_name", "plugin_name", "alert", "threat", "test",
      "control", "control_name", "summary",
    ],
    description: [
      "description", "desc", "details", "detail", "message", "synopsis",
      "info", "explanation", "observation", "note", "notes",
    ],
    severity: [
      "severity", "risk", "risk_level", "criticality", "level", "priority",
      "cvss", "cvss_score", "cvss_base_score", "score", "impact", "rating",
    ],
    status: ["status", "state", "result", "disposition", "compliance", "outcome"],
    cve: ["cve", "cve_id", "cves", "references", "reference", "ref"],
    category: [
      "category", "type", "class", "group", "family", "domain", "tag", "tags",
      "control_family", "area",
    ],
    evidence: [
      "evidence", "proof", "location", "resource", "asset", "host", "hostname",
      "ip", "url", "endpoint", "path", "file", "affected", "affected_asset",
      "target", "component", "port", "service",
    ],
    remediation: ["remediation", "fix", "recommendation", "solution", "mitigation"],
  };

  function lowerKeyMap(obj) {
    const map = {};
    for (const k in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, k)) {
        map[k.toLowerCase().trim()] = obj[k];
      }
    }
    return map;
  }

  function pick(lmap, candidates) {
    for (const c of candidates) {
      if (lmap[c] != null && String(lmap[c]).trim() !== "") return lmap[c];
    }
    return null;
  }

  function stringifyValue(v) {
    if (v == null) return "";
    if (typeof v === "object") {
      try {
        return JSON.stringify(v);
      } catch {
        return String(v);
      }
    }
    return String(v);
  }

  // ---- Structured extraction (JSON / CSV rows) ----

  function findFindingArray(structured, depth) {
    if (depth == null) depth = 0;
    if (depth > 4 || structured == null) return null;
    if (Array.isArray(structured)) return structured;
    if (typeof structured === "object") {
      // CSV shape from parsers.js
      if (Array.isArray(structured.rows)) return structured.rows;
      const keys = [
        "findings", "vulnerabilities", "vulns", "issues", "results",
        "alerts", "detections", "items", "checks", "data",
      ];
      for (const key of keys) {
        if (Array.isArray(structured[key])) return structured[key];
      }
      for (const k in structured) {
        if (structured[k] && typeof structured[k] === "object") {
          const nested = findFindingArray(structured[k], depth + 1);
          if (nested) return nested;
        }
      }
    }
    return null;
  }

  function findingFromObject(obj, index, kind) {
    if (obj == null) return null;
    // Primitive array element (e.g. list of strings) -> treat as text line.
    if (typeof obj !== "object") {
      return findingFromLine(String(obj), index, kind);
    }
    const lmap = lowerKeyMap(obj);
    const title = pick(lmap, FIELD_MAP.title);
    const description = pick(lmap, FIELD_MAP.description);
    const sevRaw = pick(lmap, FIELD_MAP.severity);
    const statusRaw = pick(lmap, FIELD_MAP.status);
    const category = pick(lmap, FIELD_MAP.category);
    const evidenceField = pick(lmap, FIELD_MAP.evidence);
    const remediation = pick(lmap, FIELD_MAP.remediation);

    const severity = U.normalizeSeverity(sevRaw) || "info";
    const status = U.normalizeStatus(statusRaw);

    // CVEs can hide in several fields; scan the whole row's text.
    const rowText = stringifyValue(obj);
    const cve = U.extractCves(rowText + " " + stringifyValue(lmap.cve || ""));

    const label = kind === "row" ? "row " + (index + 2) : "item " + (index + 1);

    let displayTitle = title
      ? String(title).trim()
      : description
      ? U.clampText(String(description).trim(), 80)
      : category
      ? U.titleCase(String(category))
      : "Unlabeled finding";

    return {
      id: U.uid("f"),
      title: displayTitle,
      description: description ? String(description).trim() : "",
      severity,
      category: category ? U.titleCase(String(category)) : undefined,
      status,
      provenance: "FACT",
      evidence: U.clampText(rowText, 600),
      sourceLocation: label,
      cve: cve.length ? cve : undefined,
      remediationHint: remediation ? String(remediation).trim() : undefined,
      _asset: evidenceField ? String(evidenceField).trim() : undefined,
    };
  }

  // ---- Text extraction (TXT / PDF) ----

  const SEV_WORD = /\b(critical|high|medium|moderate|low|informational|info)\b/i;
  const BULLET = /^\s*(?:[-*•·]|\d+[.)])\s+/;

  function findingFromLine(line, index, kind, contextSeverity) {
    const clean = line.replace(/\s+/g, " ").trim();
    if (!clean) return null;
    let severity =
      U.normalizeSeverity((clean.match(SEV_WORD) || [])[0]) ||
      contextSeverity ||
      "info";
    const cve = U.extractCves(clean);
    // Strip a leading "Severity:" / "[High]" style prefix from the title.
    let title = clean
      .replace(BULLET, "")
      .replace(/^\[?\s*(critical|high|medium|moderate|low|info(?:rmational)?)\s*\]?\s*[:\-–]?\s*/i, "")
      .replace(/^severity\s*[:\-]\s*\w+\s*[:\-–]?\s*/i, "")
      .trim();
    if (!title) title = clean;
    return {
      id: U.uid("f"),
      title: U.clampText(title, 140),
      description: "",
      severity,
      status: "open",
      provenance: "FACT",
      evidence: U.clampText(clean, 600),
      sourceLocation: "line " + (index + 1),
      cve: cve.length ? cve : undefined,
    };
  }

  /** Detect a section heading like "Critical Findings" / "High Severity". */
  function headingSeverity(line) {
    const clean = line.trim();
    if (clean.length > 60) return null; // headings are short
    const sevMatch = clean.match(SEV_WORD);
    if (!sevMatch) return null;
    // Heading-ish: contains a severity word AND a findings/issues/vuln keyword,
    // or is a very short line ending without sentence punctuation.
    if (/(finding|issue|vulnerabilit|severity|risk|priorit)/i.test(clean)) {
      return U.normalizeSeverity(sevMatch[0]);
    }
    return null;
  }

  function extractFromText(text) {
    const lines = String(text).split(/\r?\n/);
    const findings = [];
    const seen = new Set();
    let contextSeverity = null;

    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      const hSev = headingSeverity(trimmed);
      if (hSev && !BULLET.test(line)) {
        contextSeverity = hSev;
        return; // heading itself is not a finding
      }

      const isBullet = BULLET.test(line);
      const hasSev = SEV_WORD.test(trimmed);
      const hasCve = /CVE-\d{4}-\d+/i.test(trimmed);

      // Only treat a line as a finding if it looks like one.
      if (isBullet || hasSev || hasCve) {
        const f = findingFromLine(line, i, "line", isBullet ? contextSeverity : null);
        if (f) {
          const key = f.title.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            findings.push(f);
          }
        }
      }
    });
    return findings;
  }

  // ---- Top-level extraction ----

  function extractFindings(raw) {
    let findings = [];
    const arr = findFindingArray(raw.structured);
    if (arr && arr.length) {
      const kind = raw.format === "csv" ? "row" : "item";
      findings = arr
        .map((o, i) => findingFromObject(o, i, kind))
        .filter(Boolean);
    }
    // Fall back to (or supplement with) text scanning when structure is thin.
    if (findings.length === 0 && raw.text) {
      findings = extractFromText(raw.text);
    }
    return findings;
  }

  // ---- Summary (facts vs interpretation vs recommendation) ----

  function activeOf(findings) {
    return findings.filter((f) => !f.removed);
  }

  function buildSummary(findings, raw) {
    const active = activeOf(findings);
    const counts = SA.normalization.countBySeverity(findings);
    const total = active.length;
    const openCount = active.filter((f) => f.status !== "resolved").length;
    const resolvedCount = active.filter((f) => f.status === "resolved").length;
    const overallStatus = SA.normalization.deriveOverallStatus(findings);

    const allCves = Array.from(
      new Set(active.flatMap((f) => f.cve || [])),
    );

    // ---- FACTS ----
    const keyFacts = [];
    keyFacts.push(
      `Report contains ${U.pluralize(total, "finding")}: ` +
        `${counts.critical} critical, ${counts.high} high, ${counts.medium} medium, ` +
        `${counts.low} low, ${counts.info} info.`,
    );
    if (resolvedCount > 0)
      keyFacts.push(`${U.pluralize(resolvedCount, "finding")} already marked resolved.`);
    // Spotlight the OPEN critical/high items so key facts match the counts
    // (resolved criticals are captured under deltas/improvements instead).
    const topCriticalHigh = SA.utils
      .sortBySeverity(
        active.filter(
          (f) => (f.severity === "critical" || f.severity === "high") && f.status !== "resolved",
        ),
      )
      .slice(0, 4);
    topCriticalHigh.forEach((f) => {
      keyFacts.push(`${U.titleCase(f.severity)}: ${f.title}` + (f._asset ? ` (${f._asset})` : ""));
    });
    if (allCves.length)
      keyFacts.push(`CVEs referenced: ${allCves.slice(0, 12).join(", ")}${allCves.length > 12 ? "…" : ""}.`);
    if (raw && raw.meta && raw.meta.rows)
      keyFacts.push(`Parsed ${U.pluralize(Number(raw.meta.rows), "row")} from the ${raw.format.toUpperCase()} file.`);

    // ---- Category frequency (used by interpretation + anomalies) ----
    const catCounts = {};
    active.forEach((f) => {
      if (f.category) catCounts[f.category] = (catCounts[f.category] || 0) + 1;
    });
    const repeatedCat = Object.entries(catCounts)
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1]);

    const assetCounts = {};
    active.forEach((f) => {
      if (f._asset) assetCounts[f._asset] = (assetCounts[f._asset] || 0) + 1;
    });
    const busiestAsset = Object.entries(assetCounts).sort((a, b) => b[1] - a[1])[0];

    // ---- INTERPRETATIONS ----
    const interpretations = [];
    if (counts.critical > 0)
      interpretations.push(
        `The presence of ${U.pluralize(counts.critical, "critical finding")} points to actively exploitable risk that typically warrants immediate action.`,
      );
    if (counts.high > 0)
      interpretations.push(
        `${U.pluralize(counts.high, "high-severity finding")} represent significant exposure that should be scheduled for near-term remediation.`,
      );
    if (repeatedCat.length)
      interpretations.push(
        `Multiple findings cluster around "${repeatedCat[0][0]}" (${repeatedCat[0][1]}), suggesting a systemic gap rather than isolated issues.`,
      );
    if (total > 0 && resolvedCount === total)
      interpretations.push(
        `Every detected finding is marked resolved, indicating remediation appears complete for this report.`,
      );
    if (total > 0 && counts.critical === 0 && counts.high === 0)
      interpretations.push(
        `No critical or high findings were detected; remaining items are lower-priority hygiene issues.`,
      );
    if (total === 0)
      interpretations.push(
        `No structured findings were detected in this report. It may be narrative-only, or use a format the extractor does not yet recognize.`,
      );

    // ---- RECOMMENDATIONS ----
    const recommendations = [];
    if (counts.critical + counts.high > 0)
      recommendations.push(
        `Prioritize remediation of the ${U.pluralize(counts.critical + counts.high, "critical/high finding")} before the next reporting cycle.`,
      );
    if (allCves.length)
      recommendations.push(
        `Apply vendor patches for the referenced ${U.pluralize(allCves.length, "CVE")} and confirm versions post-update.`,
      );
    if (repeatedCat.length)
      recommendations.push(
        `Introduce or strengthen a control covering "${repeatedCat[0][0]}" to prevent recurrence.`,
      );
    if (openCount > 0)
      recommendations.push(`Re-scan after fixes to verify closure of the ${U.pluralize(openCount, "open finding")}.`);
    if (recommendations.length === 0)
      recommendations.push(`Maintain current controls and continue periodic reporting to confirm the posture holds.`);

    // ---- ANOMALIES ----
    const anomalies = [];
    if (busiestAsset && busiestAsset[1] >= 3)
      anomalies.push(
        `Asset "${busiestAsset[0]}" accounts for ${U.pluralize(busiestAsset[1], "finding")} — a concentration worth isolating or prioritizing.`,
      );
    const openCritical = active.filter((f) => f.severity === "critical" && f.status === "open");
    if (openCritical.length)
      anomalies.push(
        `${U.pluralize(openCritical.length, "critical finding")} remain in an open state with no resolution recorded.`,
      );

    // ---- Executive summary paragraph ----
    const statusPhrase = {
      critical: "requires urgent attention",
      attention: "needs prompt follow-up",
      stable: "is broadly stable with some items to address",
      good: "is healthy",
    }[overallStatus];
    const executiveSummary =
      `This report surfaces ${U.pluralize(total, "finding")}` +
      (counts.critical + counts.high > 0
        ? `, including ${counts.critical} critical and ${counts.high} high`
        : "") +
      `. Overall posture ${statusPhrase}.` +
      (allCves.length ? ` ${U.pluralize(allCves.length, "CVE")} referenced.` : "") +
      (resolvedCount ? ` ${resolvedCount} of ${total} already resolved.` : "");

    return {
      executiveSummary,
      counts,
      totalFindings: total,
      overallStatus,
      keyFacts,
      interpretations,
      recommendations,
      anomalies,
      engine: "mock",
    };
  }

  function analyzeReport(raw) {
    const findings = extractFindings(raw);
    const summary = buildSummary(findings, raw);
    return { findings, summary };
  }

  SA.analysis = {
    analyzeReport,
    extractFindings,
    buildSummary,
    extractFromText,
    findingFromObject,
  };
})(typeof self !== "undefined" ? self : globalThis);
