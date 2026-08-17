/*
 * dom.js — tiny element helper.
 *
 * All uploaded/report-derived strings are inserted via textContent or passed as
 * string children (which become text nodes). We never assign raw report content
 * to innerHTML, so malicious content in an uploaded file cannot execute or
 * inject markup. This is the app's "sanitize rendered content" guarantee.
 */
(function (root) {
  const SA = (root.SA = root.SA || {});

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === "class" || k === "className") node.className = v;
        else if (k === "text") node.textContent = v;
        else if (k === "html") node.innerHTML = v; // only used with app-controlled strings
        else if (k === "dataset") {
          for (const d in v) node.dataset[d] = v[d];
        } else if (k === "style" && typeof v === "object") {
          Object.assign(node.style, v);
        } else if (k.slice(0, 2) === "on" && typeof v === "function") {
          node.addEventListener(k.slice(2).toLowerCase(), v);
        } else if (k in node && k !== "list") {
          try {
            node[k] = v;
          } catch {
            node.setAttribute(k, v);
          }
        } else {
          node.setAttribute(k, v);
        }
      }
    }
    appendChildren(node, children);
    return node;
  }

  function appendChildren(node, children) {
    if (children == null) return;
    if (Array.isArray(children)) {
      children.forEach((c) => appendChildren(node, c));
    } else if (children instanceof Node) {
      node.appendChild(children);
    } else {
      node.appendChild(document.createTextNode(String(children)));
    }
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  // Common shorthands
  const div = (a, c) => el("div", a, c);
  const span = (a, c) => el("span", a, c);
  const button = (a, c) => el("button", a, c);

  SA.dom = { el, div, span, button, clear };
})(typeof self !== "undefined" ? self : globalThis);
