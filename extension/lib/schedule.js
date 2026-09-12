(function (root) {
  "use strict";

  function clampInt(v, min, max, fallback) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.trunc(n)));
  }

  function beijingParts(nowMs) {
    const ms = nowMs == null ? Date.now() : nowMs;
    const off = new Date(ms).getTimezoneOffset() + 480;
    const bj = new Date(ms + off * 60000);
    return {
      day:
        bj.getFullYear() +
        "-" +
        String(bj.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(bj.getDate()).padStart(2, "0"),
      minute: bj.getHours() * 60 + bj.getMinutes(),
      ms,
    };
  }

  function beijingMidnightUtc(day) {
    const m = String(day || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0) - 8 * 3600 * 1000;
  }

  function pickUniqueMinutes(count, startMin, endMin, rng) {
    const n = clampInt(count, 1, 24, 3);
    const start = clampInt(startMin, 0, 24 * 60 - 1, 8 * 60);
    const end = clampInt(endMin, start + 1, 24 * 60, 23 * 60);
    const span = end - start;
    const take = Math.min(n, span);
    const pool = [];
    for (let i = 0; i < span; i++) pool.push(start + i);
    const out = [];
    const rand = typeof rng === "function" ? rng : Math.random;
    for (let i = 0; i < take; i++) {
      const j = Math.floor(rand() * pool.length);
      out.push(pool.splice(j, 1)[0]);
    }
    out.sort((a, b) => a - b);
    return out;
  }

  function alarmWhen(day, minuteOfDay) {
    const midnight = beijingMidnightUtc(day);
    if (midnight == null) return null;
    return midnight + minuteOfDay * 60 * 1000;
  }

  const api = { clampInt, beijingParts, beijingMidnightUtc, pickUniqueMinutes, alarmWhen };
  root.UsSchedule = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
