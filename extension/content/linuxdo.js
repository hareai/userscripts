/* global UsDay, UsLinuxdo */

(() => {
  "use strict";

  const SETTINGS_KEY = "linuxdo.settings";
  const DAY_KEY = "linuxdo.day";
  const PANEL_ID = "linuxdo-browse-panel";
  const { DEFAULTS, clampNum, isList, isTopic, topicId, likeCount } = UsLinuxdo;

  async function loadSettings() {
    const stored = await chrome.storage.local.get({ [SETTINGS_KEY]: {} });
    return { ...DEFAULTS, ...(stored[SETTINGS_KEY] || {}) };
  }

  async function saveSettings(s) {
    await chrome.storage.local.set({ [SETTINGS_KEY]: s });
  }

  async function loadDay() {
    const day = UsDay.beijingDay();
    const stored = await chrome.storage.local.get({ [DAY_KEY]: {} });
    const saved = stored[DAY_KEY] || {};
    if (saved.day !== day) {
      return { day, topics: 0, likes: 0, visited: {} };
    }
    return { day, topics: 0, likes: 0, visited: {}, ...saved };
  }

  async function saveDay(d) {
    await chrome.storage.local.set({ [DAY_KEY]: d });
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

  let timer = null;
  function later(fn, ms) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, ms);
  }

  async function maybeLike() {
    const s = await loadSettings();
    const d = await loadDay();
    if (!s.enabled || s.likeCap <= 0) return;
    if (d.likes >= s.likeCap) return;
    const btn = likeButton();
    if (!btn) return;
    if (likeCount(btn) < s.likeMin) return;
    btn.click();
    d.likes += 1;
    await saveDay(d);
    await render();
  }

  async function openNext() {
    const s = await loadSettings();
    const d = await loadDay();
    if (!s.enabled) return;
    if (d.topics >= s.maxTopics) {
      s.enabled = false;
      await saveSettings(s);
      await render();
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
    await saveDay(d);
    next.click();
    later(() => {
      if (isList(location.pathname)) location.assign(next.href);
    }, 1800);
  }

  async function tick() {
    const s = await loadSettings();
    await render();
    if (!s.enabled) return;
    if (isTopic(location.pathname)) {
      later(() => {
        maybeLike().then(() => {
          later(() => {
            if (history.length > 1) history.back();
            else location.assign("/latest");
          }, 800);
        });
      }, s.staySec * 1000);
      return;
    }
    if (isList(location.pathname)) {
      later(() => {
        openNext();
      }, s.gapSec * 1000);
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
      loadSettings().then(async (s) => {
        s.enabled = !s.enabled;
        await saveSettings(s);
        tick();
      });
    });
    host.querySelectorAll("[data-k]").forEach((input) => {
      input.addEventListener("change", () => {
        loadSettings().then(async (s) => {
          const key = input.dataset.k;
          const limits = {
            staySec: [5, 600],
            gapSec: [2, 120],
            maxTopics: [1, 200],
            likeCap: [0, 50],
            likeMin: [0, 999],
          }[key];
          s[key] = clampNum(input.value, limits[0], limits[1], DEFAULTS[key]);
          await saveSettings(s);
          await render();
        });
      });
    });
    return host;
  }

  async function render() {
    if (!document.body && !document.documentElement) return;
    const host = ensurePanel();
    const s = await loadSettings();
    const d = await loadDay();
    host.querySelector("[data-act=toggle]").textContent = s.enabled ? "pause" : "start";
    host.querySelector("[data-status]").textContent =
      "topics " + d.topics + "/" + s.maxTopics + " · likes " + d.likes + "/" + s.likeCap;
    host.querySelectorAll("[data-k]").forEach((input) => {
      input.value = s[input.dataset.k];
    });
  }

  tick();
})();
