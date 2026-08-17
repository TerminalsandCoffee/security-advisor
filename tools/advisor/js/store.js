/*
 * store.js — local-first state (browser only).
 *
 * Persists everything to localStorage. There is no network layer at all. A tiny
 * pub/sub lets the UI re-render on change.
 */
(function (root) {
  const SA = (root.SA = root.SA || {});
  const U = SA.utils;
  const KEY = "sec-advisor-store-v1";

  const state = { customers: [], seeded: false };
  const listeners = new Set();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        state.customers = Array.isArray(parsed.customers) ? parsed.customers : [];
        state.seeded = Boolean(parsed.seeded);
      }
    } catch (e) {
      console.warn("Store load failed; starting fresh.", e);
    }
  }

  function persist() {
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({ customers: state.customers, seeded: state.seeded }),
      );
    } catch (e) {
      console.warn("Store persist failed (quota?).", e);
    }
  }

  function emit() {
    persist();
    listeners.forEach((l) => {
      try {
        l();
      } catch (e) {
        console.error(e);
      }
    });
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function getState() {
    return state;
  }

  function getCustomer(id) {
    return state.customers.find((c) => c.id === id);
  }

  function ensureSeeded() {
    if (state.seeded) return;
    state.customers = SA.demo.buildDemoCustomers();
    state.seeded = true;
    emit();
  }

  function resetDemo() {
    state.customers = SA.demo.buildDemoCustomers();
    state.seeded = true;
    emit();
  }

  function clearAll() {
    state.customers = [];
    state.seeded = true; // don't auto-reseed after an intentional wipe
    emit();
  }

  function addCustomer(input) {
    const id = U.uid("cust");
    state.customers.unshift({
      id,
      name: input.name,
      industry: input.industry || "",
      contact: input.contact || "",
      notes: input.notes || "",
      createdAt: new Date().toISOString(),
      reports: [],
    });
    emit();
    return id;
  }

  function deleteCustomer(id) {
    state.customers = state.customers.filter((c) => c.id !== id);
    emit();
  }

  /**
   * Add an already-analyzed report ({filename, format, rawText, byteSize,
   * findings, summary}). Deltas are computed here against the newest prior
   * report for the customer.
   */
  function addReport(customerId, report) {
    const customer = getCustomer(customerId);
    if (!customer) return null;
    const previous = SA.normalization.sortedReports(customer)[0];
    const id = U.uid("rep");
    const full = Object.assign({}, report, {
      id,
      customerId,
      uploadedAt: report.uploadedAt || new Date().toISOString(),
    });
    full.deltas = SA.normalization.computeDeltas(full, previous);
    customer.reports.unshift(full);
    emit();
    return id;
  }

  function deleteReport(customerId, reportId) {
    const c = getCustomer(customerId);
    if (!c) return;
    c.reports = c.reports.filter((r) => r.id !== reportId);
    emit();
  }

  function getReport(customerId, reportId) {
    const c = getCustomer(customerId);
    return c ? c.reports.find((r) => r.id === reportId) : undefined;
  }

  function updateFinding(customerId, reportId, findingId, patch) {
    const r = getReport(customerId, reportId);
    if (!r) return;
    r.findings = r.findings.map((f) =>
      f.id === findingId ? Object.assign({}, f, patch) : f,
    );
    // Severity/status/removal edits change rollups — recompute this report's
    // summary so the dashboard + counts stay honest with analyst curation.
    const rebuilt = SA.analysis.buildSummary(r.findings, {
      format: r.format,
      meta: {},
    });
    r.summary = rebuilt;
    emit();
  }

  function setNarrative(customerId, reportId, narrative) {
    const r = getReport(customerId, reportId);
    if (!r) return;
    r.narrative = narrative;
    emit();
  }

  function editNarrative(customerId, reportId, patch) {
    const r = getReport(customerId, reportId);
    if (!r || !r.narrative) return;
    r.narrative = Object.assign({}, r.narrative, patch);
    emit();
  }

  load();

  SA.store = {
    subscribe,
    getState,
    getCustomer,
    getReport,
    ensureSeeded,
    resetDemo,
    clearAll,
    addCustomer,
    deleteCustomer,
    addReport,
    deleteReport,
    updateFinding,
    setNarrative,
    editNarrative,
  };
})(typeof self !== "undefined" ? self : globalThis);
