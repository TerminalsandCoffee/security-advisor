/*
 * parsers.js — ingestion layer.
 *
 * Turns an uploaded file into a format-agnostic RawParsedReport:
 *   { format, filename, byteSize, text, structured, meta }
 *
 * Adding a new report type later = add a branch here that produces the same
 * shape. Nothing downstream needs to know the original format.
 *
 * Security posture: we NEVER execute uploaded content. JSON is parsed with
 * JSON.parse (data only). Text is treated as inert strings. No eval, no DOM
 * insertion of raw content happens in this module.
 */
(function (root) {
  const SA = (root.SA = root.SA || {});
  const SUPPORTED = ["pdf", "csv", "json", "txt"];
  const MAX_BYTES = 25 * 1024 * 1024; // 25MB guardrail

  function detectFormat(filename) {
    const ext = String(filename || "").toLowerCase().split(".").pop();
    if (SUPPORTED.includes(ext)) return ext;
    return null;
  }

  /** Minimal, correct CSV parser (handles quotes, escaped quotes, CRLF). */
  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;
    const s = String(text);
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (inQuotes) {
        if (c === '"') {
          if (s[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += c;
        }
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && s[i + 1] === "\n") i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += c;
      }
    }
    // Flush trailing field/row.
    if (field.length > 0 || row.length > 0) {
      row.push(field);
      rows.push(row);
    }
    const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ""));
    if (!nonEmpty.length) return { headers: [], rows: [] };
    const headers = nonEmpty[0].map((h) => h.trim());
    const objects = nonEmpty.slice(1).map((r) => {
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = r[idx] != null ? r[idx].trim() : "";
      });
      return obj;
    });
    return { headers, rows: objects };
  }

  /** Build the normalized RawParsedReport from already-extracted text. */
  function buildRawReport(format, filename, text, byteSize) {
    const report = {
      format,
      filename,
      byteSize: byteSize || (text ? text.length : 0),
      text: text || "",
      structured: null,
      meta: {},
    };

    if (format === "json") {
      try {
        report.structured = JSON.parse(text);
        report.meta.parsed = "json-ok";
      } catch (e) {
        report.meta.parsed = "json-error";
        report.meta.error = String(e && e.message ? e.message : e);
      }
    } else if (format === "csv") {
      const csv = parseCsv(text);
      report.structured = csv;
      report.meta.rows = csv.rows.length;
      report.meta.columns = csv.headers.length;
    }
    return report;
  }

  // ---- Browser-only helpers (PDF + File reading) ----

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("File read failed"));
      reader.readAsText(file);
    });
  }

  function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error("File read failed"));
      reader.readAsArrayBuffer(file);
    });
  }

  /** Extract text from a PDF using the locally bundled pdf.js (offline). */
  async function extractPdfText(arrayBuffer) {
    if (typeof root.pdfjsLib === "undefined") {
      throw new Error("PDF support unavailable: pdf.js failed to load.");
    }
    const pdfjsLib = root.pdfjsLib;
    const loadingTask = pdfjsLib.getDocument({
      data: arrayBuffer,
      // Disable any external resource fetching for safety/offline use.
      isEvalSupported: false,
      disableFontFace: true,
    });
    const pdf = await loadingTask.promise;
    const pages = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      const strings = content.items.map((it) => (it && it.str) || "");
      pages.push(strings.join(" "));
    }
    return pages.join("\n\n");
  }

  /** Validate + parse a browser File into a RawParsedReport. */
  async function parseFile(file) {
    const format = detectFormat(file.name);
    if (!format) {
      throw new Error(
        "Unsupported file type. Allowed: PDF, CSV, JSON, TXT.",
      );
    }
    if (file.size > MAX_BYTES) {
      throw new Error(
        "File too large (" +
          SA.utils.formatBytes(file.size) +
          "). Limit is " +
          SA.utils.formatBytes(MAX_BYTES) +
          ".",
      );
    }

    let text = "";
    if (format === "pdf") {
      const buf = await readFileAsArrayBuffer(file);
      text = await extractPdfText(buf);
    } else {
      text = await readFileAsText(file);
    }
    return buildRawReport(format, file.name, text, file.size);
  }

  SA.parsers = {
    SUPPORTED,
    MAX_BYTES,
    detectFormat,
    parseCsv,
    buildRawReport,
    parseFile,
    extractPdfText,
    readFileAsText,
    readFileAsArrayBuffer,
  };
})(typeof self !== "undefined" ? self : globalThis);
