/*
 * Node smoke test for the offline pipeline (no browser required).
 * Run:  node tests/smoke.js
 */
const path = require("path");
const jsDir = path.join(__dirname, "..", "js");
globalThis.SA = {};
require(path.join(jsDir, "utils.js"));
require(path.join(jsDir, "normalization.js"));
require(path.join(jsDir, "parsers.js"));
require(path.join(jsDir, "analysis.js"));
require(path.join(jsDir, "narrative.js"));
require(path.join(jsDir, "demo.js"));
const SA = globalThis.SA;

let failures = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    failures++;
  } else {
    console.log("ok  -", msg);
  }
}

// 1) CSV parser handles quoted commas
const csv = SA.parsers.parseCsv('a,b\n1,2\n"x,y",3');
assert(csv.headers.length === 2, "csv headers parsed");
assert(csv.rows.length === 2 && csv.rows[1].a === "x,y", "csv quoted comma preserved");

// 2) Demo customers build through the real pipeline
const customers = SA.demo.buildDemoCustomers();
assert(customers.length === 3, "3 demo customers built");

// 3) Nimbus (CSV, two reports => deltas/trends)
const nimbus = customers[0];
const latest = nimbus.reports[0]; // newest first
assert(nimbus.reports.length === 2, "nimbus has 2 reports");
assert(latest.findings.length === 7, "nimbus latest extracts 7 findings");
assert(latest.summary.counts.critical === 1, "nimbus latest counts 1 open critical");
assert(!!latest.deltas, "nimbus latest has deltas vs previous");
assert(latest.deltas.newFindings.length === 2, "2 new findings detected (S3, Log4j)");
assert(
  latest.deltas.improvements.some((s) => /OpenSSL/.test(s)),
  "OpenSSL improvement (resolved) detected",
);
assert(latest.findings.every((f) => f.provenance === "FACT"), "all findings tagged FACT");
assert(
  latest.findings.every((f) => f.evidence && f.sourceLocation),
  "all findings carry evidence + source location",
);
assert(
  latest.findings.some((f) => (f.cve || []).includes("CVE-2021-44228")),
  "Log4j CVE captured",
);

// 4) Helios (JSON)
const helios = customers[1].reports[0];
assert(helios.findings.length === 8, "helios extracts 8 findings");
assert(helios.summary.counts.critical === 2, "helios counts 2 critical");
assert(
  helios.summary.interpretations.some((s) => /Data Protection/.test(s)),
  "helios detects clustered category",
);

// 5) Aurora (TXT via headings + bullets)
const aurora = customers[2].reports[0];
assert(aurora.findings.length >= 8, "aurora extracts >= 8 findings from text");
assert(aurora.summary.counts.critical === 2, "aurora counts 2 critical from heading section");

// 6) Narrative
const story = SA.narrative.generate({
  customerName: nimbus.name,
  reportName: latest.filename,
  summary: latest.summary,
  findings: latest.findings,
  deltas: latest.deltas,
});
assert(story.executive.includes("WHAT HAPPENED"), "executive view is structured");
assert(story.technical.includes("EVIDENCE"), "technical view preserves evidence");
assert(!/OpenSSL/.test(story.executive.split("RECOMMENDED")[0].split("EVIDENCE")[1] || ""),
  "resolved critical not shown as top open evidence");

console.log("\n" + (failures ? failures + " FAILURE(S)" : "ALL PASSED"));
process.exit(failures ? 1 : 0);
