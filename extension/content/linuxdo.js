/* global UsDay, UsLinuxdo */

(() => {
  "use strict";

  const DAY_KEY = "linuxdo.day";
  const PANEL_ID = "linuxdo-browse-panel";
  const { DEFAULTS, isList, isTopic, topicId, likeCount, loggedIn } = UsLinuxdo;
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
    if (got && got.linuxdo) cachedSettings = { ...DEFAULTS, ...got.linuxdo };
    return cachedSettings;
  }

  async function loadDay() {
    const day = UsDay.beijingDay();
    const stored = await chrome.storage.local.get({ [DAY_KEY]: {} });
    const saved = stored[DAY_KEY] || {};
    if (saved.day !== day) {
      return { day, topics: 0, likes: 0, sessions: 0, visited: {}, sessionStartTopics: 0 };
    }
    return { day, topics: 0, likes: 0, sessions: 0, visited: {}, sessionStartTopics: 0, ...saved };
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
  let scrollTimer = null;
  function later(fn, ms) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, ms);
  }

  function stopReadingScroll() {
    if (scrollTimer) {
      clearInterval(scrollTimer);
      scrollTimer = null;
    }
  }

  function startReadingScroll() {
    stopReadingScroll();
    window.scrollTo(0, 0);
    scrollTimer = setInterval(() => {
      const root = document.scrollingElement || document.documentElement;
      const max = Math.max(0, (root.scrollHeight || 0) - window.innerHeight);
      if (max <= 0) return;
      const delta = 140 + Math.floor(Math.random() * 180);
      root.scrollTop = Math.min(max, (root.scrollTop || 0) + delta);
    }, 1600);
  }

  function sendAlert(kind, text) {
    chrome.runtime.sendMessage({ type: "alert", site: "linux.do", kind, text }, () => {
      void chrome.runtime.lastError;
    });
  }

  async function maybeLike() {
    const s = await loadSettings();
    const d = await loadDay();
    if (s.likeCap <= 0) return;
    if (d.likes >= s.likeCap) return;
    const btn = likeButton();
    if (!btn) return;
    if (likeCount(btn) < s.likeMin) return;
    btn.click();
    d.likes += 1;
    await saveDay(d);
    await render();
  }

  async function finishSession() {
    const s = await loadSettings();
    const d = await loadDay();
    const progressed = d.topics - (d.sessionStartTopics || 0);
    if (progressed >= s.topicsPerSession) d.sessions += 1;
    await saveDay(d);
    await render();
    chrome.runtime.sendMessage({ type: "job-done", job: "linuxdo" }, () => {
      void chrome.runtime.lastError;
    });
  }

  function holdJob() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "job-hold", job: "linuxdo" }, (res) => {
        void chrome.runtime.lastError;
        resolve(res && res.ok);
      });
    });
  }

  async function openNext() {
    if (!(await holdJob())) return;
    const s = await loadSettings();
    const d = await loadDay();
    const progressed = d.topics - (d.sessionStartTopics || 0);
    if (progressed >= s.topicsPerSession || d.sessions >= s.sessionsPerDay) {
      await finishSession();
      return;
    }
    const links = topicLinks();
    const next = links.find((a) => {
      const id = topicId(a.href);
      return id && !d.visited[id];
    });
    if (!next) {
      await finishSession();
      return;
    }
    const id = topicId(next.href);
    d.visited[id] = Date.now();
    d.topics += 1;
    await saveDay(d);
    location.assign(next.href);
  }

  let tickPath = "";
  async function tick() {
    const path = location.pathname;
    if (tickPath === path) return;
    tickPath = path;
    await render();
    if (!(await holdJob())) return;
    if (!loggedIn(document)) {
      const challenge =
        /請稍候|请稍候|Just a moment|Attention Required/i.test(document.title) ||
        Boolean(document.querySelector("#challenge-running, iframe[src*='challenges.cloudflare']"));
      if (!challenge) {
        sendAlert("login-lost", "linux.do login is gone — reopen the tab after you sign in");
      }
      await finishSession();
      return;
    }
    const s = await loadSettings();
    const d = await loadDay();
    const progressed = d.topics - (d.sessionStartTopics || 0);
    if (isTopic(location.pathname) && progressed === 0) {
      location.assign("/unseen");
      return;
    }
    if (isTopic(location.pathname)) {
      startReadingScroll();
      later(() => {
        maybeLike().then(async () => {
          stopReadingScroll();
          const cur = await loadDay();
          const done = cur.topics - (cur.sessionStartTopics || 0);
          if (done >= s.topicsPerSession) {
            await finishSession();
            return;
          }
          later(() => location.assign("/unseen"), 800);
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

  let lastHref = location.href;
  function onJobNav() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    tickPath = "";
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    stopReadingScroll();
    tick();
  }
  window.addEventListener("popstate", onJobNav);
  setInterval(onJobNav, 1000);

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
          <button type="button" data-act="run">run now</button>
        </div>
        <div data-status style="margin:6px 0;opacity:.85"></div>
        <div data-cfg style="opacity:.75"></div>
      </div>`;
    document.documentElement.appendChild(host);
    host.querySelector("[data-act=run]").addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "run-now" }, () => {
        void chrome.runtime.lastError;
      });
    });
    return host;
  }

  async function render() {
    if (!document.body && !document.documentElement) return;
    const host = ensurePanel();
    const s = await loadSettings();
    const d = await loadDay();
    host.querySelector("[data-status]").textContent =
      "sessions " +
      d.sessions +
      "/" +
      s.sessionsPerDay +
      " · likes " +
      d.likes +
      "/" +
      s.likeCap +
      (loggedIn(document) ? "" : " · login lost");
    host.querySelector("[data-cfg]").textContent =
      "stay " + s.staySec + "s · gap " + s.gapSec + "s · " + s.topicsPerSession + " topic/session";
  }

  tick();
})();
