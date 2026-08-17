/*
 * narrative.js — "Tell the Story".
 *
 * Converts the extracted facts into a customer-facing narrative structured as:
 *   What happened -> Why it matters -> Evidence -> Recommended next steps
 *
 * Two views are produced: an Executive view (short, plain English) and a
 * Technical view (detailed, preserves evidence + terminology). Output is plain
 * editable text — the analyst always edits before copying/exporting.
 *
 * Fully deterministic and offline; grounded strictly in the analysis output.
 */
(function (root) {
  const SA = (root.SA = root.SA || {});
  const U = SA.utils;

  function bullets(items) {
    if (!items || !items.length) return "  • (none)";
    return items.map((t) => "  • " + t).join("\n");
  }

  function deltaSentence(deltas) {
    if (!deltas) return "This is the first report on record for this customer.";
    const parts = [];
    if (deltas.newFindings.length) parts.push(`${deltas.newFindings.length} new`);
    if (deltas.resolvedFindings.length) parts.push(`${deltas.resolvedFindings.length} resolved`);
    if (deltas.repeatedFindings.length) parts.push(`${deltas.repeatedFindings.length} repeated`);
    const trendWord =
      deltas.trend === "improving"
        ? "improving"
        : deltas.trend === "worsening"
        ? "worsening"
        : "holding steady";
    const change = parts.length ? ` (${parts.join(", ")})` : "";
    return `Compared with the previous report, the overall posture is ${trendWord}${change}.`;
  }

  function generate(ctx) {
    const { customerName, reportName, summary, findings, deltas } = ctx;
    const active = (findings || []).filter((f) => !f.removed);
    const counts = summary.counts;
    // Evidence should foreground current (open) risk; fall back to all if every
    // finding is resolved.
    const openActive = active.filter((f) => f.status !== "resolved");
    const topFindings = U.sortBySeverity(openActive.length ? openActive : active).slice(0, 3);
    // Technical view: show open first, then the rest (resolved) for completeness.
    const allTech = U.sortBySeverity(openActive).concat(
      U.sortBySeverity(active.filter((f) => f.status === "resolved")),
    );
    const cves = Array.from(new Set(active.flatMap((f) => f.cve || [])));

    // ---------- EXECUTIVE VIEW ----------
    const exec = [];
    exec.push("WHAT HAPPENED");
    exec.push(
      `We reviewed the latest security report ("${reportName}") for ${customerName}. ` +
        `It contains ${U.pluralize(summary.totalFindings, "finding")}` +
        (counts.critical + counts.high > 0
          ? `, including ${counts.critical} critical and ${counts.high} high priority.`
          : ", none of them critical or high priority.") +
        " " +
        deltaSentence(deltas),
    );
    exec.push("");
    exec.push("WHY IT MATTERS");
    exec.push(
      "  " +
        (summary.interpretations[0] ||
          "The findings describe the customer's current security exposure and where attention is best spent."),
    );
    if (summary.interpretations[1]) exec.push("  " + summary.interpretations[1]);
    exec.push("");
    exec.push("EVIDENCE");
    exec.push(
      bullets(
        topFindings.map(
          (f) => `${U.titleCase(f.severity)} — ${f.title}` + (f._asset ? ` (${f._asset})` : ""),
        ),
      ),
    );
    if (cves.length) exec.push(`  • ${U.pluralize(cves.length, "CVE")} referenced: ${cves.slice(0, 5).join(", ")}${cves.length > 5 ? "…" : ""}`);
    exec.push("");
    exec.push("RECOMMENDED NEXT STEPS");
    exec.push(bullets(summary.recommendations.slice(0, 3)));

    // ---------- TECHNICAL VIEW ----------
    const tech = [];
    tech.push("WHAT HAPPENED");
    tech.push(
      `Report "${reportName}" was ingested and normalized. Severity breakdown: ` +
        `${counts.critical} critical / ${counts.high} high / ${counts.medium} medium / ` +
        `${counts.low} low / ${counts.info} info across ${U.pluralize(summary.totalFindings, "active finding")}.`,
    );
    tech.push("  " + deltaSentence(deltas));
    if (deltas && deltas.newFindings.length)
      tech.push("  New this cycle: " + deltas.newFindings.slice(0, 8).join("; ") + ".");
    if (deltas && deltas.resolvedFindings.length)
      tech.push("  Resolved since last: " + deltas.resolvedFindings.slice(0, 8).join("; ") + ".");
    tech.push("");
    tech.push("WHY IT MATTERS");
    summary.interpretations.forEach((s) => tech.push("  • " + s));
    if (deltas && deltas.regressions.length)
      tech.push("  • Regressions: " + deltas.regressions.join("; ") + ".");
    if (deltas && deltas.improvements.length)
      tech.push("  • Improvements: " + deltas.improvements.join("; ") + ".");
    if (summary.anomalies.length)
      summary.anomalies.forEach((s) => tech.push("  • Anomaly: " + s));
    tech.push("");
    tech.push("EVIDENCE");
    allTech.slice(0, 12).forEach((f) => {
      const head =
        `  [${f.severity.toUpperCase()}] ${f.title}` +
        (f.status ? `  · status: ${f.status}` : "") +
        (f.sourceLocation ? `  · source: ${f.sourceLocation}` : "") +
        (f.cve && f.cve.length ? `  · ${f.cve.join(", ")}` : "");
      tech.push(head);
      if (f.description) tech.push("      " + U.clampText(f.description, 240));
      if (f.evidence) tech.push("      evidence: " + U.clampText(f.evidence, 240));
    });
    if (allTech.length > 12) tech.push(`  …and ${allTech.length - 12} more finding(s).`);
    tech.push("");
    tech.push("RECOMMENDED NEXT STEPS");
    summary.recommendations.forEach((r, i) => tech.push(`  ${i + 1}. ${r}`));

    return {
      executive: exec.join("\n"),
      technical: tech.join("\n"),
      generatedAt: new Date().toISOString(),
      engine: "mock",
    };
  }

  SA.narrative = { generate };
})(typeof self !== "undefined" ? self : globalThis);
