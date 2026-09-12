/* global UsDay, UsNodeseek */

/*
  Derived from NodeSeekX src/features/signIn.js
  https://github.com/NodeSeekX/userscript  (GPL-3.0)
  Original: POST /api/attendance?random=true|false while logged in, once per Beijing day.
  This file is check-in only — no editor/upload/filter from NodeSeekX.
*/

(() => {
  "use strict";

  const KEY = "nodeseek.last-bj";

  function sendAlert(kind, text) {
    chrome.runtime.sendMessage({ type: "alert", site: "nodeseek.com", kind, text }, () => {
      void chrome.runtime.lastError;
    });
  }

  async function checkin() {
    const day = UsDay.beijingDay();
    const stored = await chrome.storage.local.get({ [KEY]: "" });
    if (stored[KEY] === day) return;
    if (!UsNodeseek.loggedIn(document)) {
      sendAlert("login-lost", "nodeseek.com login is gone — sign in, then reload");
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
    }
  }

  if (document.readyState === "complete") checkin();
  else window.addEventListener("load", checkin, { once: true });
})();
