// ==UserScript==
// @name         Linux.do browse
// @namespace    prust.userscripts.linuxdo-browse
// @version      1.0.0
// @description  Browse latest topics. Optional likes with a daily cap you set.
// @match        https://linux.do/*
// @run-at       document-idle
// @grant        none
// @license      GPL-3.0-or-later
// ==/UserScript==

(() => {
  "use strict";

  const SETTINGS_KEY = "linuxdo-browse-settings";
  const DAY_KEY = "linuxdo-browse-day";
  const PANEL_ID = "linuxdo-browse-panel";

  const DEFAULTS = {
    enabled: false,
    staySec: 20,
    gapSec: 8,
    maxTopics: 5,
    likeCap: 0,
    likeMin: 0,
  };

  function beijingDay() {
    const off = new Date().getTimezoneOffset() + 480;
    const bj = new Date(Date.now() + off * 60000);
    return `${bj.getFullYear()}-${bj.getMonth() + 1}-${bj.getDate()}`;
  }

  function readJson(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
    } catch {
      return fallback;
    }
  }

  function loadSettings() {
    return { ...DEFAULTS, ...readJson(SETTINGS_KEY, {}) };
  }

  function saveSettings(s) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  }

  function loadDay() {
    const day = beijingDay();
    const saved = readJson(DAY_KEY, {});
    if (saved.day !== day) {
      return { day, topics: 0, likes: 0, visited: {} };
    }
    return { day, topics: 0, likes: 0, visited: {}, ...saved };
  }

  function saveDay(d) {
    localStorage.setItem(DAY_KEY, JSON.stringify(d));
  }

  function isList() {
    const p = location.pathname.replace(/\/+$/, "") || "/";
    return p === "/" || p === "/latest" || p.startsWith("/latest/");
  }

  function isTopic() {
    return /^\/t\//.test(location.pathname);
  }

  function topicId(href) {
    try {
      const path = href instanceof URL ? href.pathname : new URL(href, location.origin).pathname;
      const m = path.match(/^\/t\/[^/]+\/(\d+)/);
      return m ? m[1] : "";
    } catch {
      return "";
    }
  }

  function topicLinks() {
    const sel = [
      "#list-area .topic-list-item a.title",
      "#list-area .topic-list-item a.raw-topic-link",
      "tr.topic-list-item a.title",
      ".latest-topic-list-item a.title",
      "a.title.raw-link.raw-topic-link",
    ].join(",");
    return [...document.querySelectorAll(sel)].filter((a) => topicId(a.href));
  }

  function likeButton() {
    const root =
      document.querySelector("article#post_1") ||
      document.querySelector(".topic-post:first-of-type") ||
      document;
    return root.querySelector(
      "button.like:not(.has-like):not([disabled]), button.toggle-like:not(.has-like):not([disabled])",
    );
  }

  function likeCount(btn) {
    if (!btn) return 0;
    const labeled = btn.getAttribute("aria-label") || btn.title || "";
    const n = labeled.match(/(\d+)/);
    if (n) return Number(n[1]);
    const sibling = btn.parentElement && btn.parentElement.querySelector(".count, .like-count");
    if (sibling && /\d/.test(sibling.textContent)) return Number(sibling.textContent.replace(/\D/g, ""));
    const text = (btn.textContent || "").replace(/\D/g, "");
    return text ? Number(text) : 0;
  }

  let timer = null;
  function later(fn, ms) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, ms);
  }

  function maybeLike() {
    const s = loadSettings();
    const d = loadDay();
    if (!s.enabled || s.likeCap <= 0) return;
    if (d.likes >= s.likeCap) return;
    const btn = likeButton();
    if (!btn) return;
    if (likeCount(btn) < s.likeMin) return;
    btn.click();
    d.likes += 1;
    saveDay(d);
    render();
  }

  function openNext() {
    const s = loadSettings();
    const d = loadDay();
    if (!s.enabled) return;
    if (d.topics >= s.maxTopics) {
      s.enabled = false;
      saveSettings(s);
      render();
      return;
    }
    const links = topicLinks();
    const next = links.find((a) => {
      const id = topicId(a.href);
      return id && !d.visited[id];
    });
    if (!next) {
      later(() => location.reload(), Math.max(30, s.gapSec) * 1000);
      return;
    }
    const id = topicId(next.href);
    d.visited[id] = Date.now();
    d.topics += 1;
    saveDay(d);
    next.click();
    later(() => {
      if (isList()) location.assign(next.href);
    }, 1800);
  }

  function tick() {
    const s = loadSettings();
    render();
    if (!s.enabled) return;
    if (isTopic()) {
      later(() => {
        maybeLike();
        later(() => {
          if (history.length > 1) history.back();
          else location.assign("/latest");
        }, 800);
      }, s.staySec * 1000);
      return;
    }
    if (isList()) {
      later(openNext, s.gapSec * 1000);
    }
  }

  function num(v, min, max, fallback) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function ensurePanel() {
    let host = document.getElementById(PANEL_ID);
    if (host) return host;
    host = document.createElement("div");
    host.id = PANEL_ID;
    host.style.cssText =
      "position:fixed;right:12px;bottom:12px;z-index:2147483647;font:12px/1.4 sans-serif;";
    host.innerHTML = `
      <div style="background:#111;color:#eee;padding:10px 12px;border-radius:8px;min-width:200px;box-shadow:0 4px 16px #0006">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:center">
          <strong>linux.do</strong>
          <button type="button" data-act="toggle"></button>
        </div>
        <div data-status style="margin:6px 0;opacity:.85"></div>
        <label>stay <input data-k="staySec" type="number" min="5" max="600" style="width:4em"> s</label><br>
        <label>gap <input data-k="gapSec" type="number" min="2" max="120" style="width:4em"> s</label><br>
        <label>topics/day <input data-k="maxTopics" type="number" min="1" max="200" style="width:4em"></label><br>
        <label>like cap <input data-k="likeCap" type="number" min="0" max="50" style="width:4em"> (0=off)</label><br>
        <label>like min <input data-k="likeMin" type="number" min="0" max="999" style="width:4em"></label>
      </div>`;
    document.documentElement.appendChild(host);
    host.querySelector("[data-act=toggle]").addEventListener("click", () => {
      const s = loadSettings();
      s.enabled = !s.enabled;
      saveSettings(s);
      tick();
    });
    host.querySelectorAll("[data-k]").forEach((input) => {
      input.addEventListener("change", () => {
        const s = loadSettings();
        const key = input.dataset.k;
        const limits = {
          staySec: [5, 600],
          gapSec: [2, 120],
          maxTopics: [1, 200],
          likeCap: [0, 50],
          likeMin: [0, 999],
        }[key];
        s[key] = num(input.value, limits[0], limits[1], DEFAULTS[key]);
        saveSettings(s);
        render();
      });
    });
    return host;
  }

  function render() {
    if (!document.body && !document.documentElement) return;
    const host = ensurePanel();
    const s = loadSettings();
    const d = loadDay();
    host.querySelector("[data-act=toggle]").textContent = s.enabled ? "pause" : "start";
    host.querySelector("[data-status]").textContent =
      `topics ${d.topics}/${s.maxTopics} · likes ${d.likes}/${s.likeCap}`;
    host.querySelectorAll("[data-k]").forEach((input) => {
      input.value = s[input.dataset.k];
    });
  }

  const start = () => tick();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
