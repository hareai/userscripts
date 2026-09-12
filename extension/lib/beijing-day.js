(function (root) {
  "use strict";

  function beijingDay(nowMs) {
    const ms = nowMs == null ? Date.now() : nowMs;
    const off = new Date(ms).getTimezoneOffset() + 480;
    const bj = new Date(ms + off * 60000);
    const y = bj.getFullYear();
    const m = String(bj.getMonth() + 1).padStart(2, "0");
    const d = String(bj.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  const api = { beijingDay };
  root.UsDay = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
