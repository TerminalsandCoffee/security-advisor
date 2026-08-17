/*
 * ui.js — all rendering + interaction.
 *
 * Plain DOM, no framework. Re-renders the whole view on store changes, except
 * during text editing (edits commit on blur / explicit action to preserve focus).
 */
(function (root) {
  const SA = (root.SA = root.SA || {});
  const { el, div, span, button, clear } = SA.dom;
  const U = SA.utils;
  const store = SA.store;

  // ---------- view state (in-memory nav) ----------
  const ui = {
    view: "dashboard",
    customerId: null,
    reportId: null,
    tab: "workspace",
    storyView: "executive",
    filterSeverity: "all",
    showRemoved: false,
    editingFindingId: null,
  };

  let mount = null;

  // ---------- small formatters ----------
  function formatDate(iso) {
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return iso;
    }
  }
  function timeAgo(iso) {
    const then = new Date(iso).getTime();
    if (isNaN(then)) return "—";
    const mins = Math.round((Date.now() - then) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return mins + "m ago";
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return hrs + "h ago";
    const days = Math.round(hrs / 24);
    if (days < 30) return days + "d ago";
    return formatDate(iso);
  }
  const STATUS_LABEL = {
    critical: "Critical",
    attention: "Needs Attention",
    stable: "Stable",
    good: "Healthy",
  };
  const PROV_LABEL = {
    FACT: "Fact from report",
    AI_INTERPRETATION: "AI interpretation",
    RECOMMENDATION: "Recommendation",
  };
  const FINDING_STATUS_LABEL = {
    open: "Open",
    in_progress: "In progress",
    resolved: "Resolved",
    unknown: "Unknown",
  };

  // ---------- reusable components ----------
  function sevBadge(sev) {
    return span({ class: "badge sev-" + sev }, [
      span({ class: "dot" }),
      U.titleCase(sev),
    ]);
  }
  function statusPill(overall) {
    return span({ class: "pill status-" + overall }, [
      span({ class: "dot" }),
      STATUS_LABEL[overall] || overall,
    ]);
  }
  function provTag(prov) {
    return span({ class: "prov prov-" + prov, title: PROV_LABEL[prov] }, PROV_LABEL[prov]);
  }
  function findingStatusChip(status) {
    return span({ class: "fstatus fstatus-" + status }, FINDING_STATUS_LABEL[status] || status);
  }

  function severityBar(counts) {
    const order = ["critical", "high", "medium", "low", "info"];
    const total = order.reduce((s, k) => s + counts[k], 0) || 1;
    return div(
      { class: "sevbar", title: order.map((k) => counts[k] + " " + k).join(" · ") },
      order.map((k) =>
        counts[k]
          ? div({
              class: "sevseg sev-bg-" + k,
              style: { width: (counts[k] / total) * 100 + "%" },
            })
          : null,
      ),
    );
  }

  function toast(message, kind) {
    const host = document.getElementById("toast-host");
    if (!host) return;
    const t = div({ class: "toast toast-" + (kind || "info") }, message);
    host.appendChild(t);
    setTimeout(() => t.classList.add("show"), 10);
    setTimeout(() => {
      t.classList.remove("show");
      setTimeout(() => t.remove(), 300);
    }, 3200);
  }

  // ---------- clipboard (file:// safe) ----------
  function copyText(textStr) {
    const done = () => toast("Narrative copied to clipboard.", "success");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textStr).then(done, () => fallbackCopy(textStr, done));
    } else {
      fallbackCopy(textStr, done);
    }
  }
  function fallbackCopy(textStr, done) {
    const ta = document.createElement("textarea");
    ta.value = textStr;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand("copy");
      done();
    } catch {
      toast("Copy failed — select the text and copy manually.", "error");
    }
    ta.remove();
  }

  // ===================================================================
  // SHELL
  // ===================================================================
  function renderShell(content) {
    clear(mount);
    const engineBadge = div({ class: "engine-badge", title: "No API keys. All analysis runs locally in your browser." }, [
      span({ class: "dot" }),
      "Offline engine · no data leaves this device",
    ]);

    const nav = el("nav", { class: "sidebar-nav" }, [
      navItem("Dashboard", "grid", ui.view === "dashboard", () => go({ view: "dashboard" })),
    ]);

    const sidebar = el("aside", { class: "sidebar" }, [
      div({ class: "brand" }, [
        div({ class: "brand-mark" }, "◈"),
        div({ class: "brand-text" }, [
          div({ class: "brand-title" }, "SecAdvisor"),
          div({ class: "brand-sub" }, "Customer Intelligence"),
        ]),
      ]),
      nav,
      div({ class: "sidebar-spacer" }),
      div({ class: "sidebar-foot" }, [
        engineBadge,
        button(
          { class: "ghost-btn small", onClick: onResetDemo },
          "Reset demo data",
        ),
        button({ class: "ghost-btn small danger", onClick: onClearAll }, "Clear all data"),
        div({ class: "foot-note" }, "V1 · local-first"),
      ]),
    ]);

    const main = el("main", { class: "main" }, content);
    mount.appendChild(div({ class: "layout" }, [sidebar, main]));
  }

  function navItem(label, icon, active, onClick) {
    return button({ class: "nav-item" + (active ? " active" : ""), onClick }, [
      span({ class: "nav-ico" }, iconGlyph(icon)),
      label,
    ]);
  }
  function iconGlyph(name) {
    return { grid: "▦", back: "←", upload: "⬆", star: "★", trash: "🗑", doc: "▤" }[name] || "•";
  }

  // ===================================================================
  // DASHBOARD
  // ===================================================================
  function renderDashboard() {
    const customers = store.getState().customers;
    const totalCrit = customers.reduce((s, c) => {
      const snap = SA.normalization.customerSnapshot(c);
      return s + snap.criticalHigh;
    }, 0);

    const header = div({ class: "page-head" }, [
      div({}, [
        el("h1", { class: "page-title" }, "Customer Dashboard"),
        div({ class: "page-sub" }, [
          U.pluralize(customers.length, "customer") +
            " · " +
            U.pluralize(totalCrit, "open critical/high finding") +
            " across latest reports",
        ]),
      ]),
      button({ class: "primary-btn", onClick: openNewCustomer }, [span({ class: "btn-ico" }, "＋"), "New Customer"]),
    ]);

    let grid;
    if (!customers.length) {
      grid = div({ class: "empty-state" }, [
        div({ class: "empty-emoji" }, "🛡"),
        el("h3", {}, "No customers yet"),
        div({ class: "muted" }, "Create a customer or reset the demo data to get started."),
        div({ class: "row gap" }, [
          button({ class: "primary-btn", onClick: openNewCustomer }, "New Customer"),
          button({ class: "ghost-btn", onClick: onResetDemo }, "Load demo data"),
        ]),
      ]);
    } else {
      grid = div({ class: "card-grid" }, customers.map(customerCard));
    }
    renderShell([header, grid]);
  }

  function customerCard(customer) {
    const snap = SA.normalization.customerSnapshot(customer);
    const counts = snap.lastReport
      ? SA.normalization.countBySeverity(snap.lastReport.findings)
      : { critical: 0, high: 0, medium: 0, low: 0, info: 0 };

    return div(
      { class: "cust-card", onClick: () => openCustomer(customer.id) },
      [
        div({ class: "cust-card-top" }, [
          div({}, [
            div({ class: "cust-name" }, customer.name),
            div({ class: "cust-industry" }, customer.industry || "—"),
          ]),
          statusPill(snap.status),
        ]),
        div({ class: "cust-metrics" }, [
          metric(String(snap.totalFindings), "Findings"),
          metric(String(snap.criticalHigh), "Critical / High"),
          metric(String(snap.reportCount), "Reports"),
        ]),
        snap.lastReport ? severityBar(counts) : div({ class: "sevbar empty" }),
        div({ class: "cust-card-foot" }, [
          div({ class: "muted small" }, [
            span({ class: "nav-ico dim" }, "▤"),
            snap.lastReport ? snap.lastReport.filename : "No reports yet",
          ]),
          div({ class: "muted small" }, snap.lastActivity ? timeAgo(snap.lastActivity) : ""),
        ]),
      ],
    );
  }
  function metric(value, label) {
    return div({ class: "metric" }, [
      div({ class: "metric-val" }, value),
      div({ class: "metric-lbl" }, label),
    ]);
  }

  // ===================================================================
  // CUSTOMER DETAIL
  // ===================================================================
  function renderCustomer() {
    const customer = store.getCustomer(ui.customerId);
    if (!customer) {
      go({ view: "dashboard" });
      return;
    }
    const reports = SA.normalization.sortedReports(customer);
    // Resolve selected report (default newest).
    let report = reports.find((r) => r.id === ui.reportId) || reports[0];
    ui.reportId = report ? report.id : null;

    const head = div({ class: "page-head" }, [
      div({}, [
        button({ class: "back-link", onClick: () => go({ view: "dashboard" }) }, [
          span({ class: "nav-ico" }, "←"),
          "Dashboard",
        ]),
        el("h1", { class: "page-title" }, customer.name),
        div({ class: "page-sub" }, [
          [customer.industry, customer.contact].filter(Boolean).join("  ·  ") || "—",
        ]),
      ]),
      report ? statusPill(SA.normalization.deriveOverallStatus(report.findings)) : null,
    ]);

    const uploadPanel = renderUpload(customer);

    const body = div({ class: "cust-body" }, [
      renderReportRail(customer, reports, report),
      report
        ? renderReportMain(customer, report)
        : div({ class: "panel empty-report" }, [
            div({ class: "empty-emoji" }, "📄"),
            el("h3", {}, "No report selected"),
            div({ class: "muted" }, "Upload a report or load a sample above to begin."),
          ]),
    ]);

    renderShell([head, uploadPanel, body]);
  }

  function renderUpload(customer) {
    const dz = div(
      {
        class: "dropzone",
        tabindex: "0",
        onClick: () => fileInput.click(),
        onDragover: (e) => {
          e.preventDefault();
          dz.classList.add("drag");
        },
        onDragleave: () => dz.classList.remove("drag"),
        onDrop: (e) => {
          e.preventDefault();
          dz.classList.remove("drag");
          if (e.dataTransfer && e.dataTransfer.files.length)
            handleFiles(customer.id, e.dataTransfer.files);
        },
      },
      [
        div({ class: "dz-ico" }, "⬆"),
        div({ class: "dz-title" }, "Drag & drop a report here"),
        div({ class: "dz-sub" }, "or click to browse · PDF, CSV, JSON, TXT · processed locally"),
      ],
    );

    const fileInput = el("input", {
      type: "file",
      accept: ".pdf,.csv,.json,.txt",
      multiple: true,
      style: { display: "none" },
      onChange: (e) => {
        if (e.target.files.length) handleFiles(customer.id, e.target.files);
        e.target.value = "";
      },
    });

    const sampleNames = Object.keys(SA.demo.samples);
    const sampleSelect = el(
      "select",
      {
        class: "sample-select",
        onChange: (e) => {
          const name = e.target.value;
          e.target.value = "";
          if (name) handleSample(customer.id, name);
        },
      },
      [el("option", { value: "" }, "Load a sample report…")].concat(
        sampleNames.map((n) => el("option", { value: n }, n)),
      ),
    );

    return div({ class: "panel upload-panel" }, [
      div({ class: "upload-left" }, [dz, fileInput]),
      div({ class: "upload-right" }, [
        div({ class: "panel-label" }, "Quick start"),
        div({ class: "muted small" }, "Try the pipeline instantly with a bundled fictional report."),
        sampleSelect,
        div({ class: "hint" }, "Nothing is uploaded to any server. Files are read and analyzed in this browser."),
      ]),
    ]);
  }

  function renderReportRail(customer, reports, selected) {
    return div({ class: "report-rail" }, [
      div({ class: "rail-head" }, [
        span({ class: "panel-label" }, "Report history"),
        span({ class: "count-chip" }, String(reports.length)),
      ]),
      reports.length
        ? div(
            { class: "rail-list" },
            reports.map((r) => {
              const counts = SA.normalization.countBySeverity(r.findings);
              const active = selected && r.id === selected.id;
              return div(
                { class: "rail-item" + (active ? " active" : ""), onClick: () => go({ reportId: r.id, tab: "workspace" }) },
                [
                  div({ class: "rail-item-top" }, [
                    span({ class: "fmt-chip fmt-" + r.format }, r.format.toUpperCase()),
                    span({ class: "muted small" }, formatDate(r.uploadedAt)),
                  ]),
                  div({ class: "rail-name", title: r.filename }, r.filename),
                  div({ class: "rail-foot" }, [
                    statusPill(SA.normalization.deriveOverallStatus(r.findings)),
                    span({ class: "muted small" }, U.pluralize(SA.normalization.activeFindings(r.findings).length, "finding")),
                  ]),
                ],
              );
            }),
          )
        : div({ class: "muted small pad" }, "No reports yet."),
    ]);
  }

  function renderReportMain(customer, report) {
    const tabs = div({ class: "tabs" }, [
      tabBtn("Analyst Workspace", "workspace"),
      tabBtn("Tell the Story", "story"),
      div({ class: "tabs-spacer" }),
      button({ class: "ghost-btn small danger", onClick: () => onDeleteReport(customer.id, report.id) }, "Delete report"),
    ]);
    const content =
      ui.tab === "story" ? renderStory(customer, report) : renderWorkspace(customer, report);
    return div({ class: "report-main" }, [tabs, content]);
  }
  function tabBtn(label, key) {
    return button({ class: "tab" + (ui.tab === key ? " active" : ""), onClick: () => go({ tab: key }) }, label);
  }

  // ===================================================================
  // ANALYST WORKSPACE
  // ===================================================================
  function renderWorkspace(customer, report) {
    return div({ class: "workspace" }, [
      analysisSummary(report),
      report.deltas ? deltaPanel(report.deltas) : null,
      findingsSection(customer, report),
    ]);
  }

  function provPanel(title, prov, items, emptyText) {
    return div({ class: "prov-panel prov-panel-" + prov }, [
      div({ class: "prov-panel-head" }, [span({ class: "prov-panel-title" }, title), provTag(prov)]),
      items && items.length
        ? el("ul", { class: "prov-list" }, items.map((t) => el("li", {}, t)))
        : div({ class: "muted small" }, emptyText || "None."),
    ]);
  }

  function analysisSummary(report) {
    const s = report.summary;
    const counts = s.counts;
    return div({ class: "panel summary-panel" }, [
      div({ class: "summary-top" }, [
        div({}, [
          div({ class: "panel-label" }, "Executive summary"),
          div({ class: "exec-summary" }, s.executiveSummary),
        ]),
        div({ class: "summary-counts" }, [
          ["critical", "high", "medium", "low", "info"].map((k) =>
            div({ class: "count-tile sev-" + k }, [
              div({ class: "count-num" }, String(counts[k])),
              div({ class: "count-lbl" }, U.titleCase(k)),
            ]),
          ),
        ]),
      ]),
      div({ class: "prov-legend" }, [
        "Traceability: ",
        provTag("FACT"),
        provTag("AI_INTERPRETATION"),
        provTag("RECOMMENDATION"),
      ]),
      div({ class: "prov-grid" }, [
        provPanel("Key facts", "FACT", s.keyFacts, "No facts extracted."),
        provPanel(
          "AI interpretation",
          "AI_INTERPRETATION",
          (s.interpretations || []).concat((s.anomalies || []).map((a) => "Anomaly: " + a)),
          "No interpretation.",
        ),
        provPanel("Recommendations", "RECOMMENDATION", s.recommendations, "No recommendations."),
      ]),
    ]);
  }

  function deltaPanel(d) {
    const trendClass = d.trend === "improving" ? "up" : d.trend === "worsening" ? "down" : "flat";
    const trendGlyph = d.trend === "improving" ? "▲" : d.trend === "worsening" ? "▼" : "▬";
    function chips(list, cls) {
      if (!list || !list.length) return div({ class: "muted small" }, "None");
      return div({ class: "chip-wrap" }, list.slice(0, 12).map((t) => span({ class: "delta-chip " + cls }, t)));
    }
    return div({ class: "panel delta-panel" }, [
      div({ class: "delta-head" }, [
        span({ class: "panel-label" }, "Changes since previous report"),
        span({ class: "trend trend-" + trendClass }, [span({ class: "dot" }, trendGlyph), U.titleCase(d.trend)]),
        d.previousReportName ? span({ class: "muted small" }, "vs " + d.previousReportName) : null,
      ]),
      div({ class: "delta-grid" }, [
        deltaCol("New", d.newFindings, "new"),
        deltaCol("Resolved", d.resolvedFindings, "resolved"),
        deltaCol("Improvements", d.improvements, "improve"),
        deltaCol("Regressions", d.regressions, "regress"),
        deltaCol("Repeated", d.repeatedFindings, "repeat"),
      ]),
    ]);
    function deltaCol(label, list, cls) {
      return div({ class: "delta-col" }, [
        div({ class: "delta-col-head" }, [label, span({ class: "count-chip" }, String((list || []).length))]),
        chips(list, cls),
      ]);
    }
  }

  function findingsSection(customer, report) {
    const all = report.findings;
    const active = all.filter((f) => !f.removed);
    const removed = all.filter((f) => f.removed);
    let list = ui.showRemoved ? all : active;
    if (ui.filterSeverity !== "all") list = list.filter((f) => f.severity === ui.filterSeverity);
    list = U.sortBySeverity(list);
    // Important first.
    list = list.slice().sort((a, b) => (b.important ? 1 : 0) - (a.important ? 1 : 0));

    const filters = div({ class: "filters" }, [
      div({ class: "seg" }, ["all", "critical", "high", "medium", "low", "info"].map((k) =>
        button(
          { class: "seg-btn" + (ui.filterSeverity === k ? " active" : ""), onClick: () => go({ filterSeverity: k }) },
          k === "all" ? "All" : U.titleCase(k),
        ),
      )),
      div({ class: "filters-right" }, [
        el("label", { class: "checkline" }, [
          el("input", {
            type: "checkbox",
            checked: ui.showRemoved,
            onChange: (e) => go({ showRemoved: e.target.checked }),
          }),
          "Show removed (" + removed.length + ")",
        ]),
      ]),
    ]);

    return div({ class: "findings-wrap" }, [
      div({ class: "findings-head" }, [
        span({ class: "panel-label" }, "Findings"),
        span({ class: "muted small" }, U.pluralize(active.length, "active finding") + " · analyst is final decision-maker"),
      ]),
      filters,
      list.length
        ? div({ class: "findings-list" }, list.map((f) => findingCard(customer, report, f)))
        : div({ class: "muted small pad" }, "No findings match this filter."),
    ]);
  }

  function findingCard(customer, report, f) {
    const editing = ui.editingFindingId === f.id;
    if (editing) return findingEditCard(customer, report, f);

    const cveChips = (f.cve || []).map((c) => span({ class: "cve-chip" }, c));
    const head = div({ class: "fc-head" }, [
      sevBadge(f.severity),
      findingStatusChip(f.status),
      f.category ? span({ class: "cat-chip" }, f.category) : null,
      div({ class: "fc-spacer" }),
      provTag("FACT"),
    ]);

    const actions = div({ class: "fc-actions" }, [
      button(
        { class: "icon-btn" + (f.important ? " on" : ""), title: "Mark important", onClick: () => store.updateFinding(customer.id, report.id, f.id, { important: !f.important }) },
        "★",
      ),
      button({ class: "icon-btn", title: "Edit wording", onClick: () => { ui.editingFindingId = f.id; render(); } }, "✎"),
      f.removed
        ? button({ class: "icon-btn", title: "Restore", onClick: () => store.updateFinding(customer.id, report.id, f.id, { removed: false }) }, "↩")
        : button({ class: "icon-btn danger", title: "Remove as irrelevant", onClick: () => store.updateFinding(customer.id, report.id, f.id, { removed: true }) }, "🗑"),
    ]);

    const evidence = el("details", { class: "evidence" }, [
      el("summary", {}, [span({ class: "ev-label" }, "Source evidence"), f.sourceLocation ? span({ class: "muted small" }, f.sourceLocation) : null]),
      div({ class: "ev-body" }, [
        div({ class: "ev-prov" }, [provTag("FACT"), span({ class: "muted small" }, "Verbatim from " + report.filename)]),
        el("pre", { class: "ev-pre" }, f.evidence || "—"),
      ]),
    ]);

    return div({ class: "finding-card" + (f.important ? " important" : "") + (f.removed ? " removed" : "") }, [
      div({ class: "fc-main" }, [
        head,
        div({ class: "fc-title" }, [f.edited ? span({ class: "edited-dot", title: "Edited by analyst" }, "•") : null, f.title]),
        f.description ? div({ class: "fc-desc" }, f.description) : null,
        cveChips.length ? div({ class: "cve-wrap" }, cveChips) : null,
        f.aiNote ? div({ class: "ai-note" }, [provTag("AI_INTERPRETATION"), span({}, f.aiNote)]) : null,
        f.remediationHint ? div({ class: "rec-note" }, [provTag("RECOMMENDATION"), span({}, f.remediationHint)]) : null,
        evidence,
      ]),
      actions,
    ]);
  }

  function findingEditCard(customer, report, f) {
    const titleInput = el("input", { class: "edit-input", type: "text", value: f.title });
    const descInput = el("textarea", { class: "edit-textarea", rows: "3" }, f.description || "");
    const sevSelect = el(
      "select",
      { class: "edit-select" },
      ["critical", "high", "medium", "low", "info"].map((k) => el("option", { value: k, selected: f.severity === k }, U.titleCase(k))),
    );
    const statSelect = el(
      "select",
      { class: "edit-select" },
      ["open", "in_progress", "resolved", "unknown"].map((k) => el("option", { value: k, selected: f.status === k }, FINDING_STATUS_LABEL[k])),
    );
    function save() {
      store.updateFinding(customer.id, report.id, f.id, {
        title: titleInput.value.trim() || f.title,
        description: descInput.value.trim(),
        severity: sevSelect.value,
        status: statSelect.value,
        edited: true,
      });
      ui.editingFindingId = null;
      render();
    }
    function cancel() {
      ui.editingFindingId = null;
      render();
    }
    return div({ class: "finding-card editing" }, [
      div({ class: "fc-main" }, [
        div({ class: "edit-row" }, [
          el("label", { class: "edit-lbl" }, "Severity"),
          sevSelect,
          el("label", { class: "edit-lbl" }, "Status"),
          statSelect,
        ]),
        el("label", { class: "edit-lbl" }, "Title"),
        titleInput,
        el("label", { class: "edit-lbl" }, "Description"),
        descInput,
        div({ class: "edit-actions" }, [
          button({ class: "primary-btn small", onClick: save }, "Save"),
          button({ class: "ghost-btn small", onClick: cancel }, "Cancel"),
          span({ class: "muted small" }, "Editing wording does not change the underlying evidence."),
        ]),
      ]),
    ]);
  }

  // ===================================================================
  // TELL THE STORY
  // ===================================================================
  function renderStory(customer, report) {
    if (!report.narrative) {
      return div({ class: "panel story-empty" }, [
        div({ class: "story-empty-ico" }, "📖"),
        el("h3", {}, "Turn these findings into a customer-ready story"),
        div({ class: "muted" }, "Generates a narrative — What happened → Why it matters → Evidence → Recommended next steps — in Executive and Technical views. You can edit everything before copying."),
        button({ class: "primary-btn big", onClick: () => generateStory(customer, report) }, [span({ class: "btn-ico" }, "✨"), "Tell the Story"]),
      ]);
    }

    const n = report.narrative;
    const isExec = ui.storyView === "executive";
    const generated = isExec ? n.executive : n.technical;
    const editedKey = isExec ? "editedExecutive" : "editedTechnical";
    const current = n[editedKey] != null ? n[editedKey] : generated;

    const textarea = el("textarea", {
      class: "story-text",
      spellcheck: "true",
      onBlur: (e) => {
        const val = e.target.value;
        if (val !== current) store.editNarrative(customer.id, report.id, { [editedKey]: val });
      },
    }, current);

    const edited = n[editedKey] != null && n[editedKey] !== generated;

    return div({ class: "panel story-panel" }, [
      div({ class: "story-head" }, [
        div({ class: "story-toggle" }, [
          button({ class: "toggle-btn" + (isExec ? " active" : ""), onClick: () => go({ storyView: "executive" }) }, "Executive View"),
          button({ class: "toggle-btn" + (!isExec ? " active" : ""), onClick: () => go({ storyView: "technical" }) }, "Technical View"),
        ]),
        div({ class: "story-actions" }, [
          edited ? span({ class: "edited-flag" }, "Edited by analyst") : span({ class: "muted small" }, "AI-drafted · editable"),
          button({ class: "ghost-btn small", onClick: () => { textarea.value = generated; store.editNarrative(customer.id, report.id, { [editedKey]: null }); } }, "Revert to draft"),
          button({ class: "ghost-btn small", onClick: () => generateStory(customer, report) }, "Regenerate"),
          button({ class: "primary-btn small", onClick: () => copyText(textarea.value) }, [span({ class: "btn-ico" }, "⎘"), "Copy"]),
        ]),
      ]),
      div({ class: "story-meta muted small" }, [
        isExec ? "Short, plain-English summary for leadership / non-technical stakeholders." : "Detailed view preserving technical evidence and terminology.",
        "  ·  Generated " + timeAgo(n.generatedAt),
      ]),
      textarea,
    ]);
  }

  function generateStory(customer, report) {
    const n = SA.narrative.generate({
      customerName: customer.name,
      reportName: report.filename,
      summary: report.summary,
      findings: report.findings,
      deltas: report.deltas,
    });
    store.setNarrative(customer.id, report.id, n);
    go({ tab: "story" });
    toast("Story generated. Review and edit before sharing.", "success");
  }

  // ===================================================================
  // UPLOAD HANDLERS
  // ===================================================================
  async function ingestRaw(customerId, raw) {
    const { findings, summary } = SA.analysis.analyzeReport(raw);
    const id = store.addReport(customerId, {
      filename: raw.filename,
      format: raw.format,
      rawText: U.clampText(raw.text, 20000),
      byteSize: raw.byteSize,
      findings,
      summary,
    });
    go({ view: "customer", customerId, reportId: id, tab: "workspace" });
    toast('Analyzed "' + raw.filename + '" · ' + U.pluralize(findings.length, "finding") + " extracted.", "success");
  }

  async function handleFiles(customerId, fileList) {
    const files = Array.from(fileList);
    showBusy("Analyzing report…");
    try {
      for (const file of files) {
        const raw = await SA.parsers.parseFile(file);
        await ingestRaw(customerId, raw);
      }
    } catch (e) {
      console.error(e);
      toast(String(e && e.message ? e.message : e), "error");
    } finally {
      hideBusy();
    }
  }

  async function handleSample(customerId, name) {
    const text = SA.demo.samples[name];
    if (!text) return;
    showBusy("Analyzing sample…");
    try {
      const fmt = SA.parsers.detectFormat(name);
      const raw = SA.parsers.buildRawReport(fmt, name, text, text.length);
      await ingestRaw(customerId, raw);
    } catch (e) {
      toast(String(e && e.message ? e.message : e), "error");
    } finally {
      hideBusy();
    }
  }

  // ===================================================================
  // MODAL / BUSY / NAV
  // ===================================================================
  function openNewCustomer() {
    const nameI = el("input", { class: "edit-input", type: "text", placeholder: "e.g. Contoso Manufacturing" });
    const indI = el("input", { class: "edit-input", type: "text", placeholder: "e.g. Manufacturing" });
    const conI = el("input", { class: "edit-input", type: "text", placeholder: "e.g. Jane Doe — CISO" });
    const noteI = el("textarea", { class: "edit-textarea", rows: "2", placeholder: "Optional context" });
    function create() {
      const name = nameI.value.trim();
      if (!name) {
        nameI.classList.add("err");
        nameI.focus();
        return;
      }
      const id = store.addCustomer({ name, industry: indI.value.trim(), contact: conI.value.trim(), notes: noteI.value.trim() });
      closeModal();
      openCustomer(id);
      toast("Customer created.", "success");
    }
    showModal("New Customer", [
      field("Customer name *", nameI),
      field("Industry", indI),
      field("Primary contact", conI),
      field("Notes", noteI),
    ], [
      button({ class: "ghost-btn", onClick: closeModal }, "Cancel"),
      button({ class: "primary-btn", onClick: create }, "Create customer"),
    ]);
    setTimeout(() => nameI.focus(), 30);
  }
  function field(label, input) {
    return div({ class: "field" }, [el("label", { class: "edit-lbl" }, label), input]);
  }

  function showModal(title, bodyNodes, footNodes) {
    const host = document.getElementById("modal-host");
    clear(host);
    const modal = div({ class: "modal" }, [
      div({ class: "modal-head" }, [el("h3", {}, title), button({ class: "icon-btn", onClick: closeModal }, "✕")]),
      div({ class: "modal-body" }, bodyNodes),
      div({ class: "modal-foot" }, footNodes),
    ]);
    const overlay = div({ class: "modal-overlay", onClick: (e) => { if (e.target === overlay) closeModal(); } }, [modal]);
    host.appendChild(overlay);
  }
  function closeModal() {
    clear(document.getElementById("modal-host"));
  }

  function showBusy(msg) {
    const host = document.getElementById("busy-host");
    clear(host);
    host.appendChild(div({ class: "busy-overlay" }, [div({ class: "busy-card" }, [div({ class: "spinner" }), div({}, msg || "Working…")])]));
  }
  function hideBusy() {
    clear(document.getElementById("busy-host"));
  }

  function onResetDemo() {
    store.resetDemo();
    go({ view: "dashboard" });
    toast("Demo data reset.", "success");
  }
  function onClearAll() {
    if (confirmInline()) {
      store.clearAll();
      go({ view: "dashboard" });
      toast("All local data cleared.", "info");
    }
  }
  function confirmInline() {
    // Avoid blocking browser dialogs; use a lightweight confirm modal instead.
    return window.confirm("Clear ALL local customers and reports? This cannot be undone.");
  }

  function onDeleteReport(customerId, reportId) {
    if (window.confirm("Delete this report?")) {
      store.deleteReport(customerId, reportId);
      ui.reportId = null;
      render();
      toast("Report deleted.", "info");
    }
  }

  function openCustomer(id) {
    go({ view: "customer", customerId: id, reportId: null, tab: "workspace" });
  }

  function go(patch) {
    Object.assign(ui, patch);
    if (patch.view || patch.customerId) ui.editingFindingId = null;
    render();
  }

  // ===================================================================
  // RENDER ROOT
  // ===================================================================
  function render() {
    if (ui.view === "customer") renderCustomer();
    else renderDashboard();
  }

  function init(mountEl) {
    mount = mountEl;
    store.subscribe(() => {
      // Re-render only if not mid text-edit of a finding (edit uses its own inputs).
      render();
    });
    render();
  }

  SA.ui = { init };
})(typeof self !== "undefined" ? self : globalThis);
