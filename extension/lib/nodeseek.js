(function (root) {
  "use strict";

  function loggedIn(rootEl) {
    const doc = rootEl || (typeof document !== "undefined" ? document : null);
    if (!doc || typeof doc.querySelector !== "function") return false;
    return Boolean(
      doc.querySelector(
        'a[href*="/notification"], a[href*="/setting"], img.avatar, .user-card, a[href="/logout"]',
      ),
    );
  }

  function alreadyCheckedIn(message, status) {
    const msg = String(message || "");
    if (/已签到|已完成|重复|already|duplicate/i.test(msg)) return true;
    return Number(status) === 200 && !msg;
  }

  const api = { loggedIn, alreadyCheckedIn };
  root.UsNodeseek = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
