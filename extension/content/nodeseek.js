/* global UsDay, UsNodeseek */

/*
  Derived from NodeSeekX src/features/signIn.js
  https://github.com/NodeSeekX/userscript  (GPL-3.0)
  Original: POST /api/attendance?random=true|false while logged in, once per Beijing day.
  This file is check-in only — no editor/upload/filter from NodeSeekX.
  Only the job tab created by the background alarm may check in. Sign-in pages
  and the owner's own tabs are left alone.
*/

(() => {
  "use strict";

  const KEY = "nodeseek.last-bj";

  function sendAlert(kind, text) {
    chrome.runtime.sendMessage({ type: "alert", site: "nodeseek.com", kind, text }, () => {
      void chrome.runtime.lastError;
    });
  }

  function jobDone() {
    chrome.runtime.sendMessage({ type: "job-done", job: "nodeseek" }, () => {
      void chrome.runtime.lastError;
    });
  }

  function jobHold() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "job-hold", job: "nodeseek" }, (res) => {
        void chrome.runtime.lastError;
        resolve(Boolean(res && res.ok));
      });
    });
  }

  async function checkin() {
    if (UsNodeseek.isSignInPath(location.pathname)) {
      if (await jobHold()) {
        sendAlert("login-lost", "nodeseek.com login is gone — sign in, then reload");
        jobDone();
      }
      return;
    }
    if (!(await jobHold())) return;
    const day = UsDay.beijingDay();
    const stored = await chrome.storage.local.get({ [KEY]: "" });
    if (stored[KEY] === day) {
      jobDone();
      return;
    }
    if (!UsNodeseek.loggedIn(document)) {
      sendAlert("login-lost", "nodeseek.com login is gone — sign in, then reload");
      jobDone();
      return;
    }
    const random = true;
    try {
      const r = await fetch("/api/attendance?random=" + random, {
        method: "POST",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      const data = await r.json().catch(() => ({}));
      const msg = data.message || r.statusText || String(r.status);
      if (UsNodeseek.looksLoggedOut(msg, r.status) || UsNodeseek.looksLoggedOut(msg, data.status)) {
        sendAlert("login-lost", "nodeseek.com login is gone — sign in, then reload");
        return;
      }
      if (data.success || UsNodeseek.alreadyCheckedIn(msg, r.status) || r.status === 200) {
        await chrome.storage.local.set({ [KEY]: day });
        console.info("[nodeseek-checkin]", msg || "ok");
      } else {
        sendAlert("checkin-failed", "nodeseek check-in failed: " + String(msg).slice(0, 80));
      }
    } catch (e) {
      sendAlert("checkin-failed", "nodeseek check-in error: " + String(e.message || e).slice(0, 80));
    } finally {
      jobDone();
    }
  }

  if (document.readyState === "complete") checkin();
  else window.addEventListener("load", checkin, { once: true });
})();
