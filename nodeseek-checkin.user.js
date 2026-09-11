// ==UserScript==
// @name         NodeSeek check-in
// @namespace    prust.userscripts.nodeseek-checkin
// @version      1.0.0
// @description  Daily NodeSeek check-in. Derived from NodeSeekX signIn.js.
// @match        https://www.nodeseek.com/*
// @run-at       document-idle
// @grant        none
// @license      GPL-3.0-or-later
// ==/UserScript==

/*
  Derived from NodeSeekX src/features/signIn.js
  https://github.com/NodeSeekX/userscript  (GPL-3.0)
  Original: POST /api/attendance?random=true|false while logged in, once per Beijing day.
  This file is check-in only — no editor/upload/filter from NodeSeekX.
*/

(() => {
  "use strict";

  const KEY = "ns-checkin-last-bj";

  function beijingDay() {
    const off = new Date().getTimezoneOffset() + 480;
    const bj = new Date(Date.now() + off * 60000);
    return `${bj.getFullYear()}/${bj.getMonth() + 1}/${bj.getDate()}`;
  }

  function loggedIn() {
    return Boolean(
      document.querySelector(
        'a[href*="/notification"], a[href*="/setting"], img.avatar, .user-card, a[href="/logout"]',
      ),
    );
  }

  async function checkin() {
    const day = beijingDay();
    if (localStorage.getItem(KEY) === day) return;
    if (!loggedIn()) {
      console.warn("[nodeseek-checkin] not logged in, skip");
      return;
    }
    // random=true → 随机鸡腿；false → 固定 5。默认随机，与 NodeSeekX method=1 相同。
    const random = true;
    try {
      const r = await fetch(`/api/attendance?random=${random}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      const data = await r.json().catch(() => ({}));
      const msg = data.message || r.statusText || String(r.status);
      const already = /已签到|已完成|重复|already|duplicate/i.test(msg);
      if (data.success || already || r.status === 200) {
        localStorage.setItem(KEY, day);
        console.info("[nodeseek-checkin]", msg || "ok", data);
      } else {
        console.warn("[nodeseek-checkin] fail", r.status, data);
      }
    } catch (e) {
      console.warn("[nodeseek-checkin] error", e);
    }
  }

  if (document.readyState === "complete") checkin();
  else window.addEventListener("load", checkin, { once: true });
})();
