// ==UserScript==
// @name         ExpiredDomains ingest
// @namespace    prust.userscripts.expireddomains-ingest
// @version      1.1.0
// @description  Run saved searches in this tab and dump listing rows to a local URL.
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
  const RUN_KEY = "ed-ingest-run";
  const PANEL_ID = "ed-ingest-panel";
  const DEFAULTS = {
    url: "",
    token: "",
    pages: 5,
    gapSec: 2,
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

  function loadRun() {
    try {
      return JSON.parse(sessionStorage.getItem(RUN_KEY) || "null");
    } catch {
      return null;
    }
  }

  function saveRun(run) {
    if (!run) sessionStorage.removeItem(RUN_KEY);
    else sessionStorage.setItem(RUN_KEY, JSON.stringify(run));
  }

  function num(v, min, max, fallback) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function cell(tr, cls) {
    const el = tr.querySelector(`td.${cls}`);
    return el ? el.textContent.trim().replace(/\s+/g, " ") : "";
  }

  function firstNumber(text) {
    const m = String(text || "").match(/-?\d+/);
    return m ? Number(m[0]) : null;
  }

  function dashNull(text) {
    const t = String(text || "").trim();
    if (!t || t === "-") return null;
    return t;
  }

  const KEY_TD = {
    field_length: "le",
    field_creationdate: "wby",
    field_abirth: "aby",
    field_statustld_registered: "reg",
    field_changes: "dropped",
    field_whois: "status",
  };

  function listingsFromTable(meta) {
    const rows = document.querySelectorAll("table.base1 tbody tr");
    const out = [];
    const seen = new Set();
    for (const tr of rows) {
      const link = tr.querySelector("a.namelinks");
      if (!link) continue;
      let fqdn = (link.textContent || "").trim().toLowerCase();
      fqdn = fqdn.replace(/^www\./, "").split(/\s+/)[0];
      if (!fqdn.includes(".") || seen.has(fqdn)) continue;
      seen.add(fqdn);
      const other = {};
      for (const td of tr.querySelectorAll("td[class*='field_']")) {
        const cls = [...td.classList].find((c) => c.startsWith("field_"));
        if (!cls || cls === "field_domain" || KEY_TD[cls]) continue;
        const text = dashNull(td.textContent.trim().replace(/\s+/g, " "));
        if (text) other[cls.replace(/^field_/, "")] = text;
      }
      const addDate = dashNull(cell(tr, "field_adddate"));
      const dropped = dashNull(cell(tr, "field_changes"));
      out.push({
        fqdn,
        le: firstNumber(cell(tr, "field_length")),
        wby: dashNull(cell(tr, "field_creationdate")),
        aby: dashNull(cell(tr, "field_abirth")),
        reg: firstNumber(cell(tr, "field_statustld_registered")),
        dropped,
        status: dashNull(cell(tr, "field_whois")),
        drop_date: addDate || dropped,
        other,
        savedsearch_id: meta.savedsearch_id || null,
        savedsearch_name: meta.savedsearch_name || null,
        source_url: location.href,
      });
    }
    return out;
  }

  function parseMenu(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return [...doc.querySelectorAll('a[href*="/savedsearches/goto/"]')]
      .map((a) => {
        const href = a.getAttribute("href") || "";
        const id = (href.match(/goto\/(\d+)/) || [])[1];
        const name = (a.textContent || "").replace(/^[➥\s]+/u, "").trim();
        return { id, name, href };
      })
      .filter((x) => x.id);
  }

  function gmRequest(opts) {
    const send =
      (typeof GM !== "undefined" && typeof GM.xmlHttpRequest === "function" && GM.xmlHttpRequest.bind(GM)) ||
      (typeof GM_xmlhttpRequest === "function" && GM_xmlhttpRequest);
    if (!send) return Promise.reject(new Error("GM.xmlHttpRequest missing"));
    return new Promise((resolve, reject) => {
      send({
        ...opts,
        onload: (res) => resolve(res),
        onerror: () => reject(new Error("network error")),
      });
    });
  }

  async function gmPost(url, token, body) {
    const res = await gmRequest({
      method: "POST",
      url,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      data: JSON.stringify(body),
    });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`ingest ${res.status}: ${String(res.responseText || "").slice(0, 200)}`);
    }
    try {
      return JSON.parse(res.responseText || "{}");
    } catch {
      return { raw: res.responseText, status: res.status };
    }
  }

  async function fetchSearches() {
    const html = await fetch("/savedsearches/menu/", { credentials: "include" }).then((r) => {
      if (!r.ok) throw new Error(`menu ${r.status}`);
      return r.text();
    });
    return parseMenu(html);
  }

  function listingUrl(run) {
    const search = run.searches[run.searchIndex];
    if (!search) return null;
    if (run.pageIndex === 0) {
      return new URL(search.href, location.origin).href;
    }
    const u = new URL(location.href);
    u.searchParams.set("savedsearch_id", search.id);
    u.searchParams.set("start", String(run.pageIndex * 200));
    u.hash = "listing";
    return u.href;
  }

  function isListing() {
    return /\/domains\/combinedexpired/.test(location.pathname);
  }

  function statusEl() {
    return document.querySelector("#ed-ingest-panel [data-status]");
  }

  function setStatus(text) {
    const el = statusEl();
    if (el) el.textContent = text;
  }

  async function dumpCurrent(run) {
    const s = loadSettings();
    const search = run.searches[run.searchIndex] || {};
    const listings = listingsFromTable({
      savedsearch_id: search.id,
      savedsearch_name: search.name,
    });
    run.lastCount = listings.length;
    run.sent = (run.sent || 0) + listings.length;
    saveRun(run);
    setStatus(
      `${search.name || search.id} p${run.pageIndex + 1}/${run.pages} · ${listings.length} rows · total ${run.sent}`,
    );
    if (!s.url) {
      setStatus(`found ${listings.length} — set URL`);
      return listings;
    }
    if (!listings.length) return listings;
    const result = await gmPost(s.url, s.token, { listings });
    setStatus(
      `${search.name || search.id} p${run.pageIndex + 1}/${run.pages} · sent ${listings.length} · kept ${result.kept ?? "?"} · total ${run.sent}`,
    );
    return listings;
  }

  function go(url) {
    location.assign(url);
  }

  async function step() {
    const s = loadSettings();
    const run = loadRun();
    if (!run || !run.running) return;
    const pages = num(run.pages, 1, 20, s.pages);
    run.pages = pages;

    if (!run.searches || !run.searches.length) {
      setStatus("loading saved searches");
      run.searches = await fetchSearches();
      run.searchIndex = 0;
      run.pageIndex = 0;
      saveRun(run);
      if (!run.searches.length) {
        run.running = false;
        saveRun(run);
        setStatus("no saved searches");
        return;
      }
      go(new URL(run.searches[0].href, location.origin).href);
      return;
    }

    const search = run.searches[run.searchIndex];
    if (!search) {
      run.running = false;
      saveRun(run);
      setStatus(`done · ${run.sent || 0} rows`);
      return;
    }

    if (!isListing() || !new URLSearchParams(location.search).get("savedsearch_id")) {
      setStatus(`open ${search.name}`);
      go(new URL(search.href, location.origin).href);
      return;
    }

    try {
      await dumpCurrent(run);
    } catch (e) {
      run.running = false;
      saveRun(run);
      setStatus(String(e.message || e));
      return;
    }

    const empty = (run.lastCount || 0) === 0;
    run.pageIndex += 1;
    if (!empty && run.pageIndex < pages) {
      saveRun(run);
      setTimeout(() => go(listingUrl(run)), s.gapSec * 1000);
      return;
    }
    run.searchIndex += 1;
    run.pageIndex = 0;
    saveRun(run);
    const next = run.searches[run.searchIndex];
    if (!next) {
      run.running = false;
      saveRun(run);
      setStatus(`done · ${run.sent || 0} rows`);
      return;
    }
    setTimeout(() => go(new URL(next.href, location.origin).href), s.gapSec * 1000);
  }

  async function startRun() {
    const s = loadSettings();
    saveRun({
      running: true,
      searches: [],
      searchIndex: 0,
      pageIndex: 0,
      pages: num(s.pages, 1, 20, 5),
      sent: 0,
    });
    setStatus("starting");
    await step();
  }

  function stopRun() {
    const run = loadRun() || {};
    run.running = false;
    saveRun(run);
    setStatus("stopped");
    render();
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
        <label>pages <input data-k="pages" type="number" min="1" max="20" style="width:4em"> (200/page)</label><br>
        <label>gap <input data-k="gapSec" type="number" min="1" max="30" style="width:4em"> s</label>
        <div style="margin-top:8px;display:flex;gap:8px;align-items:center">
          <button type="button" data-act="run">run saved</button>
          <button type="button" data-act="stop">stop</button>
        </div>
      </div>`;
    document.documentElement.appendChild(host);
    host.querySelector("[data-act=run]").addEventListener("click", () => startRun().catch((e) => setStatus(String(e.message || e))));
    host.querySelector("[data-act=stop]").addEventListener("click", stopRun);
    host.querySelectorAll("[data-k]").forEach((input) => {
      input.addEventListener("change", () => {
        const s = loadSettings();
        if (input.dataset.k === "pages") s.pages = num(input.value, 1, 20, 5);
        else if (input.dataset.k === "gapSec") s.gapSec = num(input.value, 1, 30, 2);
        else s[input.dataset.k] = input.value.trim();
        saveSettings(s);
      });
    });
    return host;
  }

  function render() {
    const host = ensurePanel();
    const s = loadSettings();
    const run = loadRun();
    host.querySelector('[data-k="url"]').value = s.url;
    host.querySelector('[data-k="token"]').value = s.token;
    host.querySelector('[data-k="pages"]').value = s.pages;
    host.querySelector('[data-k="gapSec"]').value = s.gapSec;
    if (run && run.running) {
      const search = (run.searches || [])[run.searchIndex];
      setStatus(
        `running ${search ? search.name : "…"} p${(run.pageIndex || 0) + 1}/${run.pages || s.pages} · ${run.sent || 0}`,
      );
    }
    return host;
  }

  function start() {
    render();
    const run = loadRun();
    if (run && run.running) {
      step().catch((e) => setStatus(String(e.message || e)));
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
