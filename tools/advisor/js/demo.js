/*
 * demo.js — realistic FICTIONAL customers + reports.
 *
 * Demo reports are run through the exact same parse -> analyze -> deltas
 * pipeline as an uploaded file, so demo findings are just as traceable (they
 * carry real evidence + source locations). Nothing here is a hard-coded
 * "pretend" finding list.
 */
(function (root) {
  const SA = (root.SA = root.SA || {});
  const U = SA.utils;

  // ---- Raw sample report contents (also written to /samples for upload) ----

  const NIMBUS_SCAN_JUNE = `Title,Severity,Status,CVE,Asset,Category,Description
Outdated OpenSSL on web tier,Critical,Open,CVE-2022-3602,web-prod-01,Patch Management,Vulnerable OpenSSL 3.0.0 allows a stack buffer overflow during certificate verification
SMBv1 protocol enabled,High,Open,,file-prod-02,Configuration,Legacy SMBv1 is enabled and exposed on the internal file server
Weak TLS ciphers supported,Medium,Open,,web-prod-01,Encryption,Server negotiates TLS 1.0 and RC4 cipher suites
Missing security headers,Low,Open,,web-prod-01,Web Hardening,Responses lack HSTS and Content-Security-Policy headers
Verbose error messages,Low,Open,,api-prod-03,Web Hardening,Unhandled exceptions return full stack traces to clients
Default database admin account present,High,Open,,db-prod-05,Access Control,The default sa administrator account is enabled with a weak password`;

  const NIMBUS_SCAN_AUGUST = `Title,Severity,Status,CVE,Asset,Category,Description
Outdated OpenSSL on web tier,Critical,Resolved,CVE-2022-3602,web-prod-01,Patch Management,Upgraded to OpenSSL 3.0.7 and redeployed across the web tier
SMBv1 protocol enabled,High,Resolved,,file-prod-02,Configuration,SMBv1 has been disabled and blocked at the host firewall
Weak TLS ciphers supported,Medium,Open,,web-prod-01,Encryption,Server still negotiates TLS 1.0 and RC4 cipher suites
Missing security headers,Low,Open,,web-prod-01,Web Hardening,Responses lack HSTS and Content-Security-Policy headers
Default database admin account present,Medium,Open,,db-prod-05,Access Control,Account was renamed but still exists with elevated privileges
Publicly exposed object storage bucket,Critical,Open,,s3://nimbus-reports,Cloud Security,Bucket nimbus-reports permits unauthenticated public list and read
Unpatched Log4j logging library,High,Open,CVE-2021-44228,api-prod-03,Patch Management,log4j-core 2.14.1 remains bundled with the reporting API`;

  const HELIOS_CSPM = JSON.stringify(
    {
      report: "Cloud Security Posture Assessment",
      generated: "2026-08-15",
      account: "helios-prod",
      findings: [
        {
          name: "Unencrypted RDS database storing PHI",
          severity: "critical",
          status: "open",
          category: "Data Protection",
          resource: "rds/patients-db",
          description:
            "At-rest encryption is disabled on the primary patient database, which stores protected health information.",
        },
        {
          name: "Root account has active access keys",
          severity: "critical",
          status: "open",
          category: "Identity",
          resource: "iam/root",
          description:
            "The account root user has two active long-lived access keys, contrary to best practice.",
        },
        {
          name: "IAM service account with AdministratorAccess and no MFA",
          severity: "high",
          status: "open",
          category: "Identity",
          resource: "iam/svc-deploy",
          description:
            "Deployment service account holds full administrator privileges and does not enforce MFA.",
        },
        {
          name: "Security group exposes RDP to the internet",
          severity: "high",
          status: "open",
          category: "Network",
          resource: "sg-0a12 (3389)",
          description: "Inbound RDP (3389) is open to 0.0.0.0/0.",
        },
        {
          name: "CloudTrail audit logging disabled in primary region",
          severity: "high",
          status: "open",
          category: "Logging",
          resource: "cloudtrail/us-east-1",
          description: "No management-event audit trail is being recorded in us-east-1.",
        },
        {
          name: "EBS snapshot shared publicly",
          severity: "high",
          status: "open",
          category: "Data Protection",
          resource: "ebs/snap-9f3c",
          description: "A volume snapshot is shared with all AWS accounts.",
        },
        {
          name: "Backup bucket without versioning",
          severity: "medium",
          status: "open",
          category: "Data Protection",
          resource: "s3/helios-backups",
          description: "Object versioning is disabled, weakening ransomware recovery.",
        },
        {
          name: "Kubernetes control plane past end-of-life",
          severity: "medium",
          status: "open",
          category: "Patch Management",
          resource: "eks/prod",
          description: "Cluster runs Kubernetes 1.24, which is end-of-life.",
        },
      ],
    },
    null,
    2,
  );

  const AURORA_PENTEST = `AURORA RETAIL GROUP - EXTERNAL PENETRATION TEST
Engagement window: 2026-07-24 to 2026-07-28
Scope: public e-commerce platform and admin portal

Critical Findings
- SQL injection in the /search endpoint permits full extraction of the product and customer database
- Remote code execution via unrestricted file upload on /admin/upload allows arbitrary server commands

High Findings
- Reflected XSS in the product review form enables session theft against other shoppers
- Exposed .git directory on the web root reveals application source code and secrets
- Session cookies are transmitted without the Secure or HttpOnly flags

Medium Findings
- No rate limiting on the /login endpoint enables large-scale credential stuffing
- Directory listing is enabled on /assets and exposes internal file names

Low Findings
- Web server version is disclosed in HTTP response headers
- Verbose 404 pages reveal the underlying web framework and version`;

  function iso(dateStr) {
    return new Date(dateStr).toISOString();
  }

  /** Build a fully-analyzed NormalizedReport from a raw sample spec. */
  function makeReport(customerId, spec, previous) {
    const raw = SA.parsers.buildRawReport(
      spec.format,
      spec.filename,
      spec.text,
      spec.text.length,
    );
    const { findings, summary } = SA.analysis.analyzeReport(raw);
    const report = {
      id: U.uid("rep"),
      customerId,
      filename: spec.filename,
      format: spec.format,
      uploadedAt: iso(spec.date),
      rawText: U.clampText(raw.text, 20000),
      byteSize: spec.text.length,
      findings,
      summary,
      deltas: SA.normalization.computeDeltas(
        { id: "tmp", findings },
        previous,
      ),
    };
    return report;
  }

  function makeCustomer(def) {
    const id = U.uid("cust");
    // Process oldest -> newest so deltas compare against the prior report.
    let previous = undefined;
    const chronological = [];
    def.reports.forEach((spec) => {
      const rep = makeReport(id, spec, previous);
      chronological.push(rep);
      previous = rep;
    });
    return {
      id,
      name: def.name,
      industry: def.industry,
      contact: def.contact,
      notes: def.notes,
      createdAt: iso(def.createdAt || def.reports[0].date),
      reports: chronological.reverse(), // newest first for display
    };
  }

  function buildDemoCustomers() {
    return [
      makeCustomer({
        name: "Nimbus Financial",
        industry: "Financial Services",
        contact: "Dana Okoye — CISO",
        notes: "Quarterly vulnerability scans. Migrating web tier to new cloud VPC.",
        createdAt: "2026-06-01",
        reports: [
          {
            filename: "nimbus-vuln-scan-2026-06.csv",
            format: "csv",
            date: "2026-06-10",
            text: NIMBUS_SCAN_JUNE,
          },
          {
            filename: "nimbus-vuln-scan-2026-08.csv",
            format: "csv",
            date: "2026-08-12",
            text: NIMBUS_SCAN_AUGUST,
          },
        ],
      }),
      makeCustomer({
        name: "Helios Health Systems",
        industry: "Healthcare",
        contact: "Marcus Feld — Director of Security",
        notes: "HIPAA-regulated. Primary cloud is AWS. PHI handling under review.",
        createdAt: "2026-08-15",
        reports: [
          {
            filename: "helios-cspm-2026-08.json",
            format: "json",
            date: "2026-08-15",
            text: HELIOS_CSPM,
          },
        ],
      }),
      makeCustomer({
        name: "Aurora Retail Group",
        industry: "Retail / E-commerce",
        contact: "Priya Nair — Head of IT",
        notes: "Peak season approaching. External pentest just completed.",
        createdAt: "2026-08-01",
        reports: [
          {
            filename: "aurora-external-pentest-2026-07.txt",
            format: "txt",
            date: "2026-08-01",
            text: AURORA_PENTEST,
          },
        ],
      }),
    ];
  }

  SA.demo = {
    buildDemoCustomers,
    samples: {
      "nimbus-vuln-scan-2026-06.csv": NIMBUS_SCAN_JUNE,
      "nimbus-vuln-scan-2026-08.csv": NIMBUS_SCAN_AUGUST,
      "helios-cspm-2026-08.json": HELIOS_CSPM,
      "aurora-external-pentest-2026-07.txt": AURORA_PENTEST,
    },
  };
})(typeof self !== "undefined" ? self : globalThis);
