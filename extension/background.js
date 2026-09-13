/* global UsIngest, UsNotify, UsSchedule, UsDay, UsJobs, UsConfig */

importScripts(
  "lib/ingest-url.js",
  "lib/notify.js",
  "lib/schedule.js",
  "lib/beijing-day.js",
  "lib/jobs.js",
  "lib/config.js",
);

const DEFAULTS = {
  ingestUrl: "",
  ingestToken: "",
  notifyAdapter: "hermes",
  notifyUrl: "",
  notifySecret: "",
  telegramBotToken: "",
  telegramChatId: "",
};

const LINUXDO_DAY = "linuxdo.day";
const NODESEEK_LAST = "nodeseek.last-bj";
const ALERTS_KEY = "alerts.sent";
const ALERTS_QUEUE = "alerts.queue";
const JOB_LOCK = "jobs.lock";
const JOB_QUEUE = "jobs.queue";
const JOB_PLAN_DAY = "jobs.planDay";
const SITE_BY_JOB = {
  linuxdo: "linux.do",
  nodeseek: "nodeseek.com",
  expireddomains: "expireddomains",
};
const JOB_BY_HOST = {
  "linux.do": "linuxdo",
  "www.nodeseek.com": "nodeseek",
  "member.expireddomains.net": "expireddomains",
};

let jobChain = Promise.resolve();
let jobDepth = 0;
function serialized(fn) {
  if (jobDepth > 0) return fn();
  const run = jobChain.then(async () => {
    jobDepth += 1;
    try {
      return await fn();
    } finally {
      jobDepth -= 1;
    }
  });
  jobChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function loadSettings() {
  try {
    const res = await fetch(chrome.runtime.getURL("config.yaml"), { cache: "no-store" });
    const text = res.ok ? await res.text() : "";
    return { ...DEFAULTS, ...UsConfig.settingsFromDoc(text ? UsConfig.parseYaml(text) : {}) };
  } catch {
    return { ...DEFAULTS, ...UsConfig.settingsFromDoc({}) };
  }
}

function jsonHeaders(token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  return headers;
}

async function postListings(listings) {
  const s = await loadSettings();
  if (!UsIngest.isLoopbackIngestUrl(s.ingestUrl)) {
    throw new Error("set a loopback ingest URL in options");
  }
  const body = { listings: UsIngest.sanitizeListings(listings) };
  if (!body.listings.length) return { kept: 0, seen: 0, sent: 0 };
  const res = await fetch(s.ingestUrl.trim(), {
    method: "POST",
    headers: jsonHeaders(s.ingestToken),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (res.status < 200 || res.status >= 300) {
    throw new Error("ingest " + res.status + ": " + text.slice(0, 200));
  }
  try {
    return { sent: body.listings.length, ...JSON.parse(text || "{}") };
  } catch {
    return { sent: body.listings.length, raw: text, status: res.status };
  }
}

async function alreadySent(alert, extra) {
  const key = UsJobs.alertDedupeKey({ ...alert, ...(extra || {}) });
  if (!key) return false;
  const stored = await chrome.storage.local.get({ [ALERTS_KEY]: {} });
  const map = stored[ALERTS_KEY] || {};
  return Boolean(map[key]);
}

async function markSent(alert, extra) {
  const key = UsJobs.alertDedupeKey({ ...alert, ...(extra || {}) });
  if (!key) return;
  const stored = await chrome.storage.local.get({ [ALERTS_KEY]: {} });
  const map = { ...(stored[ALERTS_KEY] || {}), [key]: Date.now() };
  await chrome.storage.local.set({ [ALERTS_KEY]: map });
}

async function enqueueAlert(alert, extra, err) {
  const stored = await chrome.storage.local.get({ [ALERTS_QUEUE]: [] });
  const queue = Array.isArray(stored[ALERTS_QUEUE]) ? stored[ALERTS_QUEUE].slice() : [];
  queue.push({
    alert,
    extra: extra || {},
    attempts: 0,
    nextAt: Date.now() + UsJobs.notifyRetryDelay(0),
    lastError: String(err || "").slice(0, 120),
  });
  await chrome.storage.local.set({ [ALERTS_QUEUE]: queue });
  chrome.alarms.create("notify-retry", { when: Date.now() + UsJobs.notifyRetryDelay(0) });
}

async function drainNotifyQueue() {
  const now = Date.now();
  const stored = await chrome.storage.local.get({ [ALERTS_QUEUE]: [] });
  const queue = Array.isArray(stored[ALERTS_QUEUE]) ? stored[ALERTS_QUEUE] : [];
  if (!queue.length) return { sent: 0, left: 0 };
  const rest = [];
  let sent = 0;
  const settings = await loadSettings();
  for (const item of queue) {
    if (!item || !item.alert) continue;
    if (Number(item.nextAt) > now) {
      rest.push(item);
      continue;
    }
    try {
      await UsNotify.sendAlert(settings, item.alert);
      await markSent(item.alert, item.extra);
      sent += 1;
    } catch (e) {
      const attempts = Number(item.attempts) + 1;
      rest.push({
        alert: item.alert,
        extra: item.extra || {},
        attempts,
        nextAt: now + UsJobs.notifyRetryDelay(attempts),
        lastError: String(e.message || e).slice(0, 120),
      });
    }
  }
  await chrome.storage.local.set({ [ALERTS_QUEUE]: rest });
  if (rest.length) {
    const next = Math.min(...rest.map((i) => Number(i.nextAt) || now + 60000));
    chrome.alarms.create("notify-retry", { when: Math.max(next, now + 5000) });
  } else {
    await chrome.alarms.clear("notify-retry");
  }
  return { sent, left: rest.length };
}

async function handleAlert(msg) {
  const day = UsDay.beijingDay();
  const extra = { token: msg && msg.token, job: msg && msg.job };
  const alert = UsNotify.sanitizeAlert({ ...msg, day });
  if (!alert) throw new Error("invalid alert");
  if (await alreadySent(alert, extra)) {
    return { ok: true, deduped: true };
  }
  const s = await loadSettings();
  try {
    await UsNotify.sendAlert(s, alert);
    await markSent(alert, extra);
    return { ok: true };
  } catch (e) {
    await enqueueAlert(alert, extra, e.message || e);
    return { ok: false, queued: true, error: String(e.message || e).slice(0, 120) };
  }
}

function siteForJob(job) {
  return SITE_BY_JOB[job] || "";
}

async function loadLinuxdoDay() {
  const day = UsDay.beijingDay();
  const stored = await chrome.storage.local.get({ [LINUXDO_DAY]: {} });
  const saved = stored[LINUXDO_DAY] || {};
  if (saved.day !== day) {
    return { day, topics: 0, likes: 0, sessions: 0, visited: {}, sessionStartTopics: 0 };
  }
  return { day, topics: 0, likes: 0, sessions: 0, visited: {}, sessionStartTopics: 0, ...saved };
}

async function saveLinuxdoDay(d) {
  await chrome.storage.local.set({ [LINUXDO_DAY]: d });
}

async function linuxdoSettings() {
  const all = await loadSettings();
  return all.linuxdo || {};
}

async function jobLedger() {
  const day = UsDay.beijingDay();
  const settings = await linuxdoSettings();
  const d = await loadLinuxdoDay();
  const stored = await chrome.storage.local.get({ [NODESEEK_LAST]: "" });
  return {
    day,
    nodeseekLastBj: stored[NODESEEK_LAST] || "",
    linuxdoSessions: d.sessions,
    linuxdoCap: Number(settings.sessionsPerDay) || 3,
  };
}

async function readLockState() {
  const stored = await chrome.storage.local.get({ [JOB_LOCK]: null, [JOB_QUEUE]: [] });
  return {
    lock: stored[JOB_LOCK] || null,
    queue: Array.isArray(stored[JOB_QUEUE]) ? stored[JOB_QUEUE] : [],
  };
}

async function setJobTimeout(deadline) {
  await chrome.alarms.clear("job-timeout");
  if (deadline && deadline > Date.now() + 1000) {
    chrome.alarms.create("job-timeout", { when: deadline });
  }
}

async function ensureWatchdog() {
  const alarm = await chrome.alarms.get("job-watchdog");
  if (!alarm) chrome.alarms.create("job-watchdog", { periodInMinutes: 1 });
}

async function notifyLockTimeout(lock, reason) {
  if (!lock || !lock.job) return;
  const elapsed = Math.max(0, Math.round((Date.now() - Number(lock.startedAt || 0)) / 1000));
  await handleAlert({
    site: siteForJob(lock.job),
    kind: "job-timeout",
    text: lock.job + " timed out after " + elapsed + "s (" + String(reason || "timeout") + ")",
    token: lock.token,
    job: lock.job,
  });
}

async function closeJobTab(lock) {
  const id = Number(lock && lock.tabId);
  if (!Number.isFinite(id) || id <= 0) return;
  try {
    await chrome.tabs.remove(id);
  } catch {
    /* already gone */
  }
}

function senderTabId(sender) {
  const id = sender && sender.tab && sender.tab.id;
  return Number(id) > 0 ? Number(id) : 0;
}

async function failLock(lock, reason) {
  return serialized(async () => {
    const state = await readLockState();
    const current = state.lock;
    if (!lock || !current || current.token !== lock.token) return;
    await chrome.storage.local.set({ [JOB_LOCK]: null });
    await chrome.alarms.clear("job-timeout");
    await closeJobTab(lock);
    await notifyLockTimeout(lock, reason);
  });
}

async function acquire(job, settings, tabId) {
  return serialized(async () => {
    if (!UsJobs.JOBS.includes(job)) return { ok: false, reason: "unknown-job" };
    const id = Number(tabId);
    if (!Number.isFinite(id) || id <= 0) return { ok: false, reason: "no-tab" };
    const now = Date.now();
    const state = await readLockState();
    const decision = UsJobs.decideStart(job, state.lock, now, await jobLedger());
    if (decision.action === "skip") return { ok: false, reason: decision.reason };
    if (decision.action === "queue") {
      await chrome.storage.local.set({ [JOB_QUEUE]: UsJobs.enqueueJob(state.queue, job) });
      return { ok: false, reason: "busy", holder: decision.holder };
    }
    if (decision.action === "reject") {
      return { ok: false, reason: decision.reason, holder: decision.holder };
    }
    if (decision.action === "reap" && decision.previous) {
      await failLock(decision.previous, "dead");
    }
    const token = UsJobs.newToken();
    const lock = UsJobs.makeLock(job, token, now, UsJobs.timeoutMs(job, settings), id);
    await chrome.storage.local.set({ [JOB_LOCK]: lock });
    const verify = await chrome.storage.local.get({ [JOB_LOCK]: null });
    if (!verify[JOB_LOCK] || verify[JOB_LOCK].token !== token || Number(verify[JOB_LOCK].tabId) !== id) {
      return { ok: false, reason: "lost-race", holder: (verify[JOB_LOCK] || {}).job };
    }
    await setJobTimeout(lock.deadline);
    await ensureWatchdog();
    if (job === "linuxdo") {
      const d = await loadLinuxdoDay();
      d.sessionStartTopics = d.topics;
      await saveLinuxdoDay(d);
    }
    return { ok: true, lock };
  });
}

async function release(job, tabId) {
  return serialized(async () => {
    const state = await readLockState();
    const st = UsJobs.inspectLock(state.lock, Date.now());
    if (st.state !== "running" || st.lock.job !== job) return { ok: false, reason: "not-holder" };
    if (!UsJobs.senderMatchesLock(st.lock, tabId)) return { ok: false, reason: "tab-mismatch" };
    const lock = st.lock;
    await chrome.storage.local.set({ [JOB_LOCK]: null });
    await chrome.alarms.clear("job-timeout");
    await closeJobTab(lock);
    await drainJobQueue();
    return { ok: true };
  });
}

async function hold(job, tabId) {
  return serialized(async () => {
    const state = await readLockState();
    const st = UsJobs.inspectLock(state.lock, Date.now());
    if (st.state === "dead" && st.lock) {
      await failLock(st.lock, "expired-hold");
      await drainJobQueue();
      return { ok: false, reason: "expired" };
    }
    if (st.state !== "running" || st.lock.job !== job) return { ok: false, reason: "not-holder" };
    if (!UsJobs.senderMatchesLock(st.lock, tabId)) return { ok: false, reason: "tab-mismatch" };
    return { ok: true, lock: st.lock };
  });
}

async function beginJob(job, settings, url) {
  const state = await readLockState();
  const decision = UsJobs.decideStart(job, state.lock, Date.now(), await jobLedger());
  if (decision.action === "skip") return { ok: false, reason: decision.reason };
  if (decision.action === "queue") {
    await chrome.storage.local.set({ [JOB_QUEUE]: UsJobs.enqueueJob(state.queue, job) });
    return { ok: false, reason: "busy", holder: decision.holder };
  }
  if (decision.action === "reject") {
    return { ok: false, reason: decision.reason, holder: decision.holder };
  }
  if (decision.action === "reap" && decision.previous) {
    await failLock(decision.previous, "dead");
  }
  let tabId = 0;
  try {
    const created = await chrome.tabs.create({ url: "about:blank", active: false });
    tabId = created && created.id;
  } catch {
    return { ok: false, reason: "no-tab" };
  }
  if (!tabId) return { ok: false, reason: "no-tab" };
  const got = await acquire(job, settings, tabId);
  if (!got.ok) {
    try {
      await chrome.tabs.remove(tabId);
    } catch {
      /* ignore */
    }
    return got;
  }
  try {
    await chrome.tabs.update(tabId, { url });
  } catch {
    await failLock(got.lock, "navigate");
    return { ok: false, reason: "navigate" };
  }
  return { ok: true, lock: got.lock };
}

async function drainJobQueue() {
  for (;;) {
    const state = await readLockState();
    const st = UsJobs.inspectLock(state.lock, Date.now());
    if (st.state === "running") return;
    const next = UsJobs.dequeueJob(state.queue);
    await chrome.storage.local.set({ [JOB_QUEUE]: next.queue });
    if (!next.job) return;
    let result = { skipped: "unknown" };
    if (next.job === "linuxdo") result = await startLinuxdoSession();
    else if (next.job === "nodeseek") result = await startNodeseekCheckin();
    else return;
    if (result && result.ok) return;
    if (result && (result.skipped === "done" || result.skipped === "cap" || result.skipped === "disabled")) continue;
    return;
  }
}

async function startLinuxdoSession() {
  const settings = await linuxdoSettings();
  if (settings.enabled === false) return { skipped: "disabled" };
  const got = await beginJob("linuxdo", settings, "https://linux.do/unseen");
  if (!got.ok) return { skipped: got.reason, holder: got.holder };
  return { ok: true };
}

async function startNodeseekCheckin() {
  const all = await loadSettings();
  if (!all.nodeseek || all.nodeseek.enabled === false) return { skipped: "disabled" };
  const got = await beginJob("nodeseek", null, "https://www.nodeseek.com/");
  if (!got.ok) return { skipped: got.reason, holder: got.holder };
  return { ok: true };
}

async function startExpireddomains() {
  const all = await loadSettings();
  if (!all.expireddomains || all.expireddomains.enabled === false) {
    return { ok: false, error: "disabled" };
  }
  const got = await beginJob("expireddomains", null, "https://member.expireddomains.net/");
  if (!got.ok) return { ok: false, error: got.reason === "busy" ? "busy:" + got.holder : got.reason };
  return { ok: true };
}

async function planTodayAlarms() {
  const parts = UsSchedule.beijingParts();
  const all = await loadSettings();
  const linuxdo = all.linuxdo || {};
  const sessionsPerDay = Number(linuxdo.sessionsPerDay) || 3;
  const windowStart = Math.max(0, Math.min(23, Number(linuxdo.windowStartHour) || 8));
  const windowEnd = Math.max(windowStart + 1, Math.min(24, Number(linuxdo.windowEndHour) || 23));
  const start = Math.max(parts.minute + 2, windowStart * 60);
  const minutes = linuxdo.enabled === false ? [] : UsSchedule.pickUniqueMinutes(sessionsPerDay, start, windowEnd * 60);
  const existing = await chrome.alarms.getAll();
  for (const alarm of existing) {
    if (alarm.name.startsWith("linuxdo-session") || alarm.name === "nodeseek-checkin" || alarm.name === "plan-day") {
      await chrome.alarms.clear(alarm.name);
    }
  }
  minutes.forEach((minute, i) => {
    const when = UsSchedule.alarmWhen(parts.day, minute);
    if (!when || when <= Date.now() + 5000) return;
    chrome.alarms.create("linuxdo-session-" + i, { when });
  });
  if (all.nodeseek && all.nodeseek.enabled !== false) {
    const checkinMin = minutes[0] != null ? Math.max(windowStart * 60, minutes[0] - 15) : windowStart * 60 + 60;
    const checkinWhen = UsSchedule.alarmWhen(parts.day, checkinMin);
    if (checkinWhen && checkinWhen > Date.now() + 5000) {
      chrome.alarms.create("nodeseek-checkin", { when: checkinWhen });
    }
  }
  const nextPlan = UsSchedule.beijingMidnightUtc(parts.day) + 24 * 3600 * 1000 + 60 * 1000;
  if (nextPlan > Date.now()) {
    chrome.alarms.create("plan-day", { when: nextPlan });
  }
  await chrome.storage.local.set({ [JOB_PLAN_DAY]: parts.day });
  await ensureWatchdog();
}

async function healSchedule() {
  const parts = UsSchedule.beijingParts();
  const stored = await chrome.storage.local.get({ [JOB_PLAN_DAY]: "" });
  if (stored[JOB_PLAN_DAY] !== parts.day) {
    await planTodayAlarms();
    return;
  }
  const alarms = await chrome.alarms.getAll();
  const names = new Set(alarms.map((a) => a.name));
  if (!names.has("plan-day")) {
    const nextPlan = UsSchedule.beijingMidnightUtc(parts.day) + 24 * 3600 * 1000 + 60 * 1000;
    if (nextPlan > Date.now()) chrome.alarms.create("plan-day", { when: nextPlan });
  }
  await ensureWatchdog();
}

async function tabAlive(tabId) {
  const id = Number(tabId);
  if (!Number.isFinite(id) || id <= 0) return false;
  try {
    const tab = await chrome.tabs.get(id);
    return Boolean(tab && tab.id);
  } catch {
    return false;
  }
}

async function healLock() {
  return serialized(async () => {
    const now = Date.now();
    const state = await readLockState();
    const st = UsJobs.inspectLock(state.lock, now);
    if (st.state === "dead" && st.lock) {
      await failLock(st.lock, "watchdog");
      await drainJobQueue();
      return;
    }
    if (st.state === "running" && !(await tabAlive(st.lock.tabId))) {
      await failLock(st.lock, "tab-gone");
      await drainJobQueue();
    }
  });
}

async function watchdogTick() {
  await healLock();
  await healSchedule();
  await drainNotifyQueue();
}

function senderHost(sender) {
  const url = String((sender && (sender.url || (sender.tab && sender.tab.url))) || "");
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

chrome.runtime.onInstalled.addListener(() => {
  healSchedule();
  drainNotifyQueue();
  healLock();
});
chrome.runtime.onStartup.addListener(() => {
  healSchedule();
  drainNotifyQueue();
  healLock();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "plan-day") {
    planTodayAlarms();
    return;
  }
  if (alarm.name === "job-watchdog") {
    watchdogTick();
    return;
  }
  if (alarm.name === "job-timeout") {
    healLock();
    return;
  }
  if (alarm.name === "notify-retry") {
    drainNotifyQueue();
    return;
  }
  if (alarm.name.startsWith("linuxdo-session")) {
    startLinuxdoSession();
    return;
  }
  if (alarm.name === "nodeseek-checkin") {
    startNodeseekCheckin();
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== "object") return;
  const host = senderHost(sender);
  const job = JOB_BY_HOST[host] || "";
  const tabId = senderTabId(sender);
  if (msg.type === "public-config") {
    loadSettings()
      .then((s) => sendResponse({ ok: true, settings: UsConfig.publicSettings(s) }))
      .catch((err) => sendResponse({ ok: false, error: String(err.message || err) }));
    return true;
  }
  if (msg.type === "ingest") {
    if (host !== "member.expireddomains.net") {
      sendResponse({ ok: false, error: "ingest only from expireddomains" });
      return;
    }
    postListings(msg.listings)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((err) => sendResponse({ ok: false, error: String(err.message || err) }));
    return true;
  }
  if (msg.type === "alert") {
    const allowed = {
      "linux.do": "linux.do",
      "www.nodeseek.com": "nodeseek.com",
      "member.expireddomains.net": "expireddomains",
    };
    if (!allowed[host] || allowed[host] !== msg.site) {
      sendResponse({ ok: false, error: "alert host mismatch" });
      return;
    }
    handleAlert(msg)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, error: String(err.message || err) }));
    return true;
  }
  if (msg.type === "run-now") {
    if (host === "linux.do") {
      startLinuxdoSession()
        .then((result) => sendResponse({ ok: true, result }))
        .catch((err) => sendResponse({ ok: false, error: String(err.message || err) }));
      return true;
    }
    sendResponse({ ok: false, error: "run-now only from linux.do" });
    return;
  }
  if (msg.type === "job-start") {
    if (job === "expireddomains" && msg.job === "expireddomains") {
      startExpireddomains()
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ ok: false, error: String(err.message || err) }));
      return true;
    }
    sendResponse({ ok: false, error: "job-start host mismatch" });
    return;
  }
  if (msg.type === "job-done") {
    if (!job || job !== msg.job) {
      sendResponse({ ok: false, error: "job-done host mismatch" });
      return;
    }
    release(job, tabId)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, error: String(err.message || err) }));
    return true;
  }
  if (msg.type === "job-hold") {
    if (!job || job !== msg.job) {
      sendResponse({ ok: false, error: "job-hold host mismatch" });
      return;
    }
    hold(job, tabId)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, error: String(err.message || err) }));
    return true;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  readLockState().then(async (state) => {
    const st = UsJobs.inspectLock(state.lock, Date.now());
    if (st.state === "running" && Number(st.lock.tabId) === Number(tabId)) {
      await failLock(st.lock, "tab-closed");
      await drainJobQueue();
    }
  });
});

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});
