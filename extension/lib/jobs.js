(function (root) {
  "use strict";

  const JOBS = ["linuxdo", "nodeseek", "expireddomains"];
  const AUTO_QUEUE = ["linuxdo", "nodeseek"];
  const NODESEEK_TIMEOUT_MS = 2 * 60 * 1000;
  const EXPIREDDOMAINS_TIMEOUT_MS = 20 * 60 * 1000;
  const LINUXDO_TIMEOUT_MIN_MS = 3 * 60 * 1000;
  const LINUXDO_TIMEOUT_MAX_MS = 20 * 60 * 1000;
  const NOTIFY_RETRY_MS = [60 * 1000, 5 * 60 * 1000, 15 * 60 * 1000, 30 * 60 * 1000];

  function clampInt(v, min, max, fallback) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.trunc(n)));
  }

  function linuxdoTimeoutMs(settings) {
    const s = settings || {};
    const stay = clampInt(s.staySec, 5, 600, 20);
    const gap = clampInt(s.gapSec, 2, 120, 8);
    const topics = clampInt(s.topicsPerSession, 1, 20, 1);
    const raw = ((stay + gap + 20) * topics + 60) * 1000;
    return Math.min(LINUXDO_TIMEOUT_MAX_MS, Math.max(LINUXDO_TIMEOUT_MIN_MS, raw));
  }

  function timeoutMs(job, settings) {
    if (job === "linuxdo") return linuxdoTimeoutMs(settings);
    if (job === "expireddomains") return EXPIREDDOMAINS_TIMEOUT_MS;
    return NODESEEK_TIMEOUT_MS;
  }

  function newToken() {
    try {
      if (typeof crypto !== "undefined" && crypto.getRandomValues) {
        const bytes = crypto.getRandomValues(new Uint8Array(8));
        return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
      }
    } catch {
      /* fall through */
    }
    return String(Date.now().toString(16)) + String(Math.random()).slice(2, 10);
  }

  function inspectLock(lock, now) {
    if (!lock || typeof lock !== "object") return { empty: true };
    if (!JOBS.includes(lock.job) || !lock.token) return { empty: true };
    const tabId = Number(lock.tabId);
    if (!Number.isFinite(tabId) || tabId <= 0) return { expired: true, lock };
    if (!Number.isFinite(Number(lock.deadline)) || Number(lock.deadline) <= now) {
      return { expired: true, lock };
    }
    return { held: true, lock };
  }

  function decideAcquire(lock, job, now) {
    if (!JOBS.includes(job)) return { ok: false, reason: "unknown-job" };
    const st = inspectLock(lock, now);
    if (st.empty) return { ok: true, steal: false };
    if (st.expired) return { ok: true, steal: true, previous: st.lock };
    if (st.lock.job === job) return { ok: false, reason: "running", holder: job };
    return { ok: false, reason: "busy", holder: st.lock.job, until: st.lock.deadline };
  }

  function makeLock(job, token, now, timeout, tabId) {
    const startedAt = Number(now) || 0;
    const id = Number(tabId);
    return {
      job,
      token: String(token || ""),
      startedAt,
      deadline: startedAt + Math.max(1000, Number(timeout) || NODESEEK_TIMEOUT_MS),
      tabId: Number.isFinite(id) && id > 0 ? id : 0,
    };
  }

  function senderMatchesLock(lock, tabId) {
    const id = Number(tabId);
    const held = Number(lock && lock.tabId);
    if (!Number.isFinite(id) || id <= 0) return false;
    if (!Number.isFinite(held) || held <= 0) return false;
    return id === held;
  }

  function enqueueJob(queue, job) {
    const q = Array.isArray(queue) ? queue.filter((j) => JOBS.includes(j)) : [];
    if (!AUTO_QUEUE.includes(job)) return q;
    if (q.includes(job)) return q;
    return q.concat([job]);
  }

  function dequeueJob(queue) {
    const q = Array.isArray(queue) ? queue.filter((j) => JOBS.includes(j)) : [];
    if (!q.length) return { job: "", queue: [] };
    return { job: q[0], queue: q.slice(1) };
  }

  function notifyRetryDelay(attempts) {
    const n = Math.max(0, Math.trunc(Number(attempts) || 0));
    return NOTIFY_RETRY_MS[Math.min(NOTIFY_RETRY_MS.length - 1, n)];
  }

  function alertDedupeKey(alert) {
    if (!alert || typeof alert !== "object") return "";
    const kind = String(alert.kind || "");
    const site = String(alert.site || "");
    const day = String(alert.day || "");
    if (!kind || !site) return "";
    if (kind === "login-lost" || kind === "checkin-failed") return [day, site, kind].join(":");
    if (kind === "job-timeout" || kind === "session-failed") {
      return [day, site, kind, String(alert.token || alert.job || "")].join(":");
    }
    return [day, site, kind, String(alert.text || "")].join(":");
  }

  function shouldAutoQueue(job) {
    return AUTO_QUEUE.includes(job);
  }

  const api = {
    JOBS,
    AUTO_QUEUE,
    NODESEEK_TIMEOUT_MS,
    EXPIREDDOMAINS_TIMEOUT_MS,
    LINUXDO_TIMEOUT_MIN_MS,
    LINUXDO_TIMEOUT_MAX_MS,
    clampInt,
    linuxdoTimeoutMs,
    timeoutMs,
    newToken,
    inspectLock,
    decideAcquire,
    makeLock,
    senderMatchesLock,
    enqueueJob,
    dequeueJob,
    notifyRetryDelay,
    alertDedupeKey,
    shouldAutoQueue,
  };
  root.UsJobs = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
