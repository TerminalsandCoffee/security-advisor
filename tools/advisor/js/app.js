/*
 * app.js — bootstrap. Runs last, after all modules + pdf.js have loaded.
 */
(function (root) {
  const SA = root.SA || {};

  function boot() {
    // Point pdf.js at the LOCAL worker (offline). If the browser blocks a
    // worker from file://, pdf.js transparently falls back to a main-thread
    // "fake worker", so PDF parsing still works either way.
    if (root.pdfjsLib && root.pdfjsLib.GlobalWorkerOptions) {
      try {
        root.pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";
      } catch (e) {
        console.warn("Could not set pdf.js worker src:", e);
      }
    } else {
      console.warn("pdf.js not loaded — PDF uploads will be unavailable, other formats still work.");
    }

    // Seed fictional demo data on first run (localStorage empty).
    SA.store.ensureSeeded();

    const mountEl = document.getElementById("app");
    SA.ui.init(mountEl);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(typeof self !== "undefined" ? self : globalThis);
