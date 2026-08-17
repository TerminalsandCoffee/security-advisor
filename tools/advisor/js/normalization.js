/*
 * normalization.js — cross-report change detection + customer rollups.
 *
 * Kept separate from analysis.js on purpose: analysis extracts facts from ONE
 * report; normalization compares reports over time (trends, improvements,
 * regressions, repeated findings) and rolls findings up to the customer card.
 */
(function (root) {
  const SA = (root.SA = root.SA || {});
  const U = SA.utils;

  function activeFindings(fs) {
    return (fs || []).filter((f) => !f.removed);
  }

  function findingKey(f) {
    if (f.cve && f.cve.length) return f.cve.join(",").toLowerCase();
    return String(f.title || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function countBySeverity(findings) {
    const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    activeFindings(findings).forEach((f) => {
      if (f.status === "resolved") return;
      if (counts[f.severity] != null) counts[f.severity] += 1;
    });
    return counts;
  }

  function deriveOverallStatus(findings) {
    const c = countBySeverity(findings);
    if (c.critical > 0) return "critical";
    if (c.high > 0) return "attention";
    if (c.medium > 0) return "stable";
    return "good";
  }

  /** Higher = worse. Used only to pick a trend direction. */
  function weightedRisk(findings) {
    return activeFindings(findings).reduce((sum, f) => {
      if (f.status === "resolved") return sum;
      return sum + Math.pow(2, U.severityRank(f.severity));
    }, 0);
  }

  function computeDeltas(current, previous) {
    if (!previous) return undefined;

    const prevMap = new Map();
    activeFindings(previous.findings).forEach((f) => prevMap.set(findingKey(f), f));
    const currMap = new Map();
    activeFindings(current.findings).forEach((f) => currMap.set(findingKey(f), f));

    const newFindings = [];
    const repeatedFindings = [];
    const resolvedFindings = [];
    const improvements = [];
    const regressions = [];

    currMap.forEach((f, key) => {
      const prev = prevMap.get(key);
      if (!prev) {
        newFindings.push(f.title);
        return;
      }
      repeatedFindings.push(f.title);
      const delta = U.severityRank(f.severity) - U.severityRank(prev.severity);
      if (delta > 0) regressions.push(`${f.title} (${prev.severity} → ${f.severity})`);
      else if (delta < 0) improvements.push(`${f.title} (${prev.severity} → ${f.severity})`);
      if (prev.status !== "resolved" && f.status === "resolved")
        improvements.push(`${f.title} marked resolved`);
    });

    prevMap.forEach((f, key) => {
      if (!currMap.has(key)) resolvedFindings.push(f.title);
    });

    const prevWeight = weightedRisk(previous.findings);
    const currWeight = weightedRisk(current.findings);
    let trend = "steady";
    if (currWeight < prevWeight - 1) trend = "improving";
    else if (currWeight > prevWeight + 1) trend = "worsening";

    return {
      previousReportId: previous.id,
      previousReportName: previous.filename,
      trend,
      newFindings,
      resolvedFindings,
      repeatedFindings,
      improvements,
      regressions,
    };
  }

  function sortedReports(customer) {
    return (customer.reports || [])
      .slice()
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
  }

  function customerSnapshot(customer) {
    const reports = sortedReports(customer);
    const lastReport = reports[0];
    if (!lastReport) {
      return {
        reportCount: 0,
        totalFindings: 0,
        criticalHigh: 0,
        status: "good",
        lastActivity: undefined,
        lastReport: undefined,
      };
    }
    const counts = countBySeverity(lastReport.findings);
    return {
      lastReport,
      reportCount: reports.length,
      totalFindings: activeFindings(lastReport.findings).length,
      criticalHigh: counts.critical + counts.high,
      status: deriveOverallStatus(lastReport.findings),
      lastActivity: lastReport.uploadedAt,
    };
  }

  SA.normalization = {
    activeFindings,
    findingKey,
    countBySeverity,
    deriveOverallStatus,
    weightedRisk,
    computeDeltas,
    sortedReports,
    customerSnapshot,
  };
})(typeof self !== "undefined" ? self : globalThis);
