// ==UserScript==
// @name         ExpiredDomains ingest
// @namespace    prust.userscripts.expireddomains-ingest
// @version      1.0.0
// @description  Dump the listing table to a local ingest API you configure.
// @match        https://member.expireddomains.net/*
// @run-at       document-idle
// @grant        GM.xmlHttpRequest
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// @connect      localhost
// @license      GPL-3.0-or-later
// ==/UserScript==

(() => {
  "use strict";

  const SETTINGS_KEY = "ed-ingest-settings";
  const PANEL_ID = "ed-ingest-panel";
  const DEFAULTS = {
    url: "",
    token: "",
    auto: false,
  };

  function loadSettings() {
    try {
      return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") };
    } catch {
      return { ...DEFAULTS };
    }
  }

  function saveSettings(s) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  }

  function cellText(tr, selectors) {
    for (const sel of selectors) {
      const el = tr.querySelector(sel);
      if (el && el.textContent.trim()) return el.textContent.trim();
    }
    return "";
  }

  function listingsFromTable() {
    const rows = document.querySelectorAll(
      "table.base1 tbody tr, table.listing tbody tr, #listing tbody tr, table tbody tr",
    );
    const out = [];
    const seen = new Set();
    for (const tr of rows) {
      const link =
        tr.querySelector("a.namelinks") ||
        tr.querySelector("td.field_domain a") ||
        tr.querySelector("td:first-child a[href]");
      if (!link) continue;
      let fqdn = (link.textContent || "").trim().toLowerCase();
      fqdn = fqdn.replace(/^www\./, "").split(/\s+/)[0];
      if (!fqdn.includes(".")) {
        try {
          const href = new URL(link.href, location.origin);
          const q = href.searchParams.get("q") || href.searchParams.get("domain") || "";
          fqdn = (q || href.pathname.split("/").filter(Boolean).pop() || "").toLowerCase();
        } catch {
          continue;
        }
      }
      if (!fqdn.includes(".") || seen.has(fqdn)) continue;
      seen.add(fqdn);
      const drop =
        cellText(tr, [
          "td.field_timeend",
          "td.field_enddate",
          "td.field_dropdate",
          "td.field_changes",
        ]) || null;
      out.push({
        fqdn,
        drop_date: drop,
        source_url: location.href,
      });
    }
    return out;
  }

  function gmPost(url, token, body) {
    const send =
      (typeof GM !== "undefined" && typeof GM.xmlHttpRequest === "function" && GM.xmlHttpRequest.bind(GM)) ||
      (typeof GM_xmlhttpRequest === "function" && GM_xmlhttpRequest);
    if (!send) {
      return Promise.reject(new Error("GM.xmlHttpRequest missing"));
    }
    return new Promise((resolve, reject) => {
      send({
        method: "POST",
        url,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        data: JSON.stringify(body),
        onload: (res) => {
          if (res.status >= 200 && res.status < 300) {
            try {
              resolve(JSON.parse(res.responseText || "{}"));
            } catch {
              resolve({ raw: res.responseText, status: res.status });
            }
          } else {
            reject(new Error(`ingest ${res.status}: ${String(res.responseText || "").slice(0, 200)}`));
          }
        },
        onerror: () => reject(new Error("ingest network error")),
      });
    });
  }

  async function dump(statusEl) {
    const s = loadSettings();
    const listings = listingsFromTable();
    statusEl.textContent = `found ${listings.length}`;
    if (!listings.length) return;
    if (!s.url) {
      statusEl.textContent = `found ${listings.length} — set URL`;
      return;
    }
    try {
      const result = await gmPost(s.url, s.token, { listings });
      const kept = result.kept ?? "?";
      const seen = result.seen ?? "?";
      statusEl.textContent = `sent ${listings.length} · kept ${kept} · seen ${seen}`;
    } catch (e) {
      statusEl.textContent = String(e.message || e);
    }
  }

  function ensurePanel() {
    let host = document.getElementById(PANEL_ID);
    if (host) return host;
    host = document.createElement("div");
    host.id = PANEL_ID;
    host.style.cssText =
      "position:fixed;right:12px;bottom:12px;z-index:2147483647;font:12px/1.4 sans-serif;";
    host.innerHTML = `
      <div style="background:#111;color:#eee;padding:10px 12px;border-radius:8px;min-width:240px;box-shadow:0 4px 16px #0006">
        <strong>expireddomains</strong>
        <div data-status style="margin:6px 0;opacity:.85">idle</div>
        <label>url<br><input data-k="url" type="url" placeholder="http://127.0.0.1:port/path" style="width:100%"></label>
        <label>token<br><input data-k="token" type="password" autocomplete="off" style="width:100%"></label>
        <div style="margin-top:8px;display:flex;gap:8px;align-items:center">
          <button type="button" data-act="dump">dump page</button>
          <label><input data-k="auto" type="checkbox"> auto</label>
        </div>
      </div>`;
    document.documentElement.appendChild(host);
    const statusEl = host.querySelector("[data-status]");
    host.querySelector("[data-act=dump]").addEventListener("click", () => dump(statusEl));
    host.querySelectorAll("[data-k]").forEach((input) => {
      input.addEventListener("change", () => {
        const s = loadSettings();
        if (input.type === "checkbox") s.auto = input.checked;
        else s[input.dataset.k] = input.value.trim();
        saveSettings(s);
      });
    });
    return host;
  }

  function render() {
    const host = ensurePanel();
    const s = loadSettings();
    host.querySelector('[data-k="url"]').value = s.url;
    host.querySelector('[data-k="token"]').value = s.token;
    host.querySelector('[data-k="auto"]').checked = s.auto;
    return host;
  }

  function start() {
    const host = render();
    const s = loadSettings();
    if (s.auto) dump(host.querySelector("[data-status]"));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
