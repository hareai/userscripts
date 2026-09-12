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

  function tabIdOf(lock) {
    const id = Number(lock && lock.tabId);
    return Number.isFinite(id) && id > 0 ? id : 0;
  }

  function inspectLock(lock, now) {
    if (!lock || typeof lock !== "object") return { state: "idle" };
    if (!JOBS.includes(lock.job) || !lock.token) return { state: "idle" };
    const tabId = tabIdOf(lock);
    if (!tabId) return { state: "dead", lock };
    if (!Number.isFinite(Number(lock.deadline)) || Number(lock.deadline) <= now) {
      return { state: "dead", lock };
    }
    return { state: "running", lock };
  }

  function decideStart(job, lock, now, ledger) {
    if (!JOBS.includes(job)) return { action: "reject", reason: "unknown-job" };
    const book = ledger && typeof ledger === "object" ? ledger : {};
    if (job === "nodeseek" && book.nodeseekLastBj && book.nodeseekLastBj === book.day) {
      return { action: "skip", reason: "done" };
    }
    if (job === "linuxdo") {
      const cap = clampInt(book.linuxdoCap, 1, 12, 3);
      if (clampInt(book.linuxdoSessions, 0, 99, 0) >= cap) return { action: "skip", reason: "cap" };
    }
    const st = inspectLock(lock, now);
    if (st.state === "running") {
      if (st.lock.job === job) return { action: "skip", reason: "running" };
      if (AUTO_QUEUE.includes(job)) return { action: "queue", reason: "busy", holder: st.lock.job };
      return { action: "reject", reason: "busy", holder: st.lock.job };
    }
    if (st.state === "dead") return { action: "reap", previous: st.lock };
    return { action: "start" };
  }

  function makeLock(job, token, now, timeout, tabId) {
    const startedAt = Number(now) || 0;
    const id = tabIdOf({ tabId });
    return {
      job,
      token: String(token || ""),
      startedAt,
      deadline: startedAt + Math.max(1000, Number(timeout) || NODESEEK_TIMEOUT_MS),
      tabId: id,
    };
  }

  function senderMatchesLock(lock, tabId) {
    const held = tabIdOf(lock);
    const id = Number(tabId);
    return held > 0 && Number.isFinite(id) && id === held;
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
    tabIdOf,
    inspectLock,
    decideStart,
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
