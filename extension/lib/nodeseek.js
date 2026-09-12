(function (root) {
  "use strict";

  function loggedIn(rootEl) {
    const doc = rootEl || (typeof document !== "undefined" ? document : null);
    if (!doc || typeof doc.querySelector !== "function") return false;
    // Guest pages list lots of avatars. Only treat account chrome as login.
    return Boolean(
      doc.querySelector('a[href="/logout"], a[href*="/notification"], a[href="/setting"]'),
    );
  }

  function alreadyCheckedIn(message, status) {
    const msg = String(message || "");
    if (/已签到|已完成|重复|already|duplicate/i.test(msg)) return true;
    return Number(status) === 200 && !msg;
  }

  function looksLoggedOut(message, status) {
    const msg = String(message || "");
    if (/USER NOT FOUND|未登录|not logged|unauthorized|login required/i.test(msg)) return true;
    return Number(status) === 401 || Number(status) === 403;
  }

  const api = { loggedIn, alreadyCheckedIn, looksLoggedOut };
  root.UsNodeseek = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
