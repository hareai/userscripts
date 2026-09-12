/* global UsListings */

(() => {
  "use strict";

  const RUN_KEY = "ed-ingest-run";
  const PANEL_ID = "ed-ingest-panel";
  const DEFAULTS = {
    pages: 5,
    gapSec: 2,
    savedSearches: [],
  };
  let cachedSettings = { ...DEFAULTS };

  function publicConfig() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "public-config" }, (res) => {
        void chrome.runtime.lastError;
        resolve(res && res.ok ? res.settings : null);
      });
    });
  }

  async function loadSettings() {
    const got = await publicConfig();
    if (got && got.expireddomains) cachedSettings = { ...DEFAULTS, ...got.expireddomains };
    return cachedSettings;
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

  function ingest(listings) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "ingest", listings }, (res) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!res || !res.ok) {
          reject(new Error((res && res.error) || "ingest failed"));
          return;
        }
        resolve(res.result || {});
      });
    });
  }

  function sendJob(type) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type, job: "expireddomains" }, (res) => {
        void chrome.runtime.lastError;
        resolve(res || { ok: false });
      });
    });
  }

  async function fetchSearches() {
    const html = await fetch("/savedsearches/menu/", { credentials: "include" }).then((r) => {
      if (!r.ok) throw new Error("menu " + r.status);
      return r.text();
    });
    return UsListings.parseMenu(html);
  }

  function listingUrl(run) {
    return UsListings.listingUrl(run, location.href, location.origin);
  }

  function statusEl() {
    return document.querySelector("#ed-ingest-panel [data-status]");
  }

  function setStatus(text) {
    const el = statusEl();
    if (el) el.textContent = text;
  }

  async function dumpCurrent(run) {
    const search = run.searches[run.searchIndex] || {};
    const listings = UsListings.listingsFromTable(document, {
      savedsearch_id: search.id,
      savedsearch_name: search.name,
      source_url: location.href,
    });
    run.lastCount = listings.length;
    run.sent = (run.sent || 0) + listings.length;
    saveRun(run);
    setStatus(
      (search.name || search.id) +
        " p" +
        (run.pageIndex + 1) +
        "/" +
        run.pages +
        " · " +
        listings.length +
        " rows · total " +
        run.sent,
    );
    if (!listings.length) return listings;
    const result = await ingest(listings);
    setStatus(
      (search.name || search.id) +
        " p" +
        (run.pageIndex + 1) +
        "/" +
        run.pages +
        " · sent " +
        listings.length +
        " · kept " +
        (result.kept ?? "?") +
        " · total " +
        run.sent,
    );
    return listings;
  }

  function go(url) {
    location.assign(url);
  }

  async function step() {
    const hold = await sendJob("job-hold");
    if (!hold.ok) {
      const run = loadRun();
      if (run) {
        run.running = false;
        saveRun(run);
      }
      setStatus("stopped");
      return;
    }
    const s = await loadSettings();
    const run = loadRun();
    if (!run || !run.running) {
      await sendJob("job-done");
      return;
    }
    const pages = num(run.pages, 1, 20, s.pages);
    run.pages = pages;

    if (!run.searches || !run.searches.length) {
      setStatus("loading saved searches");
      run.searches = await fetchSearches();
      const wanted = (s.savedSearches || []).map(String).filter(Boolean);
      if (wanted.length) {
        run.searches = run.searches.filter((item) => wanted.includes(String(item.id)) || wanted.includes(String(item.name)));
      }
      run.searchIndex = 0;
      run.pageIndex = 0;
      saveRun(run);
      if (!run.searches.length) {
        run.running = false;
        saveRun(run);
        setStatus("no saved searches");
        await sendJob("job-done");
        return;
      }
      go(new URL(run.searches[0].href, location.origin).href);
      return;
    }

    const search = run.searches[run.searchIndex];
    if (!search) {
      run.running = false;
      saveRun(run);
      setStatus("done · " + (run.sent || 0) + " rows");
      await sendJob("job-done");
      return;
    }

    if (!UsListings.isListingPath(location.pathname) || !new URLSearchParams(location.search).get("savedsearch_id")) {
      setStatus("open " + search.name);
      go(new URL(search.href, location.origin).href);
      return;
    }

    try {
      await dumpCurrent(run);
    } catch (e) {
      run.running = false;
      saveRun(run);
      setStatus(String(e.message || e));
      await sendJob("job-done");
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
      setStatus("done · " + (run.sent || 0) + " rows");
      await sendJob("job-done");
      return;
    }
    setTimeout(() => go(new URL(next.href, location.origin).href), s.gapSec * 1000);
  }

  async function startRunOnThisTab() {
    const s = await loadSettings();
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

  async function startRun() {
    const got = await sendJob("job-start");
    if (!got.ok) {
      setStatus(got.error || "busy");
      return;
    }
    setStatus("job tab started");
  }

  function stopRun() {
    const run = loadRun() || {};
    run.running = false;
    saveRun(run);
    setStatus("stopped");
    sendJob("job-done");
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
        <p style="margin:6px 0;opacity:.75">pages / gap / searches: config.yaml</p>
        <div data-cfg style="opacity:.75"></div>
        <div style="margin-top:8px;display:flex;gap:8px;align-items:center">
          <button type="button" data-act="run">run saved</button>
          <button type="button" data-act="stop">stop</button>
        </div>
      </div>`;
    document.documentElement.appendChild(host);
    host.querySelector("[data-act=run]").addEventListener("click", () => {
      startRun().catch((e) => setStatus(String(e.message || e)));
    });
    host.querySelector("[data-act=stop]").addEventListener("click", stopRun);
    return host;
  }

  async function render() {
    const host = ensurePanel();
    const s = await loadSettings();
    const run = loadRun();
    host.querySelector("[data-cfg]").textContent =
      "pages " + s.pages + " · gap " + s.gapSec + "s" +
      ((s.savedSearches || []).length ? " · " + s.savedSearches.length + " searches" : " · all saved");
    if (run && run.running) {
      const search = (run.searches || [])[run.searchIndex];
      setStatus(
        "running " +
          (search ? search.name : "…") +
          " p" +
          ((run.pageIndex || 0) + 1) +
          "/" +
          (run.pages || s.pages) +
          " · " +
          (run.sent || 0),
      );
    }
    return host;
  }

  function start() {
    render();
    sendJob("job-hold")
      .then((hold) => {
        if (!hold.ok) return;
        const run = loadRun();
        if (run && run.running) return step();
        return startRunOnThisTab();
      })
      .catch((e) => setStatus(String(e.message || e)));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
