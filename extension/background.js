/* global UsIngest, UsNotify, UsSchedule, UsDay */

importScripts("lib/ingest-url.js", "lib/notify.js", "lib/schedule.js", "lib/beijing-day.js");

const DEFAULTS = {
  ingestUrl: "",
  ingestToken: "",
  notifyAdapter: "hermes",
  notifyUrl: "",
  notifySecret: "",
};

const LINUXDO_SETTINGS = "linuxdo.settings";
const LINUXDO_DAY = "linuxdo.day";
const NODESEEK_LAST = "nodeseek.last-bj";
const ALERTS_KEY = "alerts.sent";

async function loadSettings() {
  const stored = await chrome.storage.local.get(DEFAULTS);
  return { ...DEFAULTS, ...stored };
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

async function alreadySent(site, kind, day) {
  const key = day + ":" + site + ":" + kind;
  const stored = await chrome.storage.local.get({ [ALERTS_KEY]: {} });
  const map = stored[ALERTS_KEY] || {};
  return Boolean(map[key]);
}

async function markSent(site, kind, day) {
  const key = day + ":" + site + ":" + kind;
  const stored = await chrome.storage.local.get({ [ALERTS_KEY]: {} });
  const map = { ...(stored[ALERTS_KEY] || {}), [key]: Date.now() };
  await chrome.storage.local.set({ [ALERTS_KEY]: map });
}

async function handleAlert(msg) {
  const day = UsDay.beijingDay();
  const alert = UsNotify.sanitizeAlert({ ...msg, day });
  if (!alert) throw new Error("invalid alert");
  if (await alreadySent(alert.site, alert.kind, day)) {
    return { ok: true, deduped: true };
  }
  const s = await loadSettings();
  await UsNotify.sendAlert(s, alert);
  await markSent(alert.site, alert.kind, day);
  return { ok: true };
}

async function loadLinuxdoDay() {
  const day = UsDay.beijingDay();
  const stored = await chrome.storage.local.get({ [LINUXDO_DAY]: {} });
  const saved = stored[LINUXDO_DAY] || {};
  if (saved.day !== day) {
    return { day, topics: 0, likes: 0, sessions: 0, visited: {}, pending: false, sessionStartTopics: 0 };
  }
  return { day, topics: 0, likes: 0, sessions: 0, visited: {}, pending: false, sessionStartTopics: 0, ...saved };
}

async function saveLinuxdoDay(d) {
  await chrome.storage.local.set({ [LINUXDO_DAY]: d });
}

async function findTab(urlPattern) {
  const tabs = await chrome.tabs.query({ url: urlPattern });
  return tabs.find((t) => t.id) || null;
}

async function openOrReload(urlPattern, fallbackUrl) {
  const tab = await findTab(urlPattern);
  if (tab) {
    await chrome.tabs.reload(tab.id);
    return tab.id;
  }
  const created = await chrome.tabs.create({ url: fallbackUrl, active: false });
  return created.id;
}

async function startLinuxdoSession() {
  const d = await loadLinuxdoDay();
  const stored = await chrome.storage.local.get({ [LINUXDO_SETTINGS]: {} });
  const sessionsPerDay = Number((stored[LINUXDO_SETTINGS] || {}).sessionsPerDay) || 3;
  if (d.pending) return { skipped: "running" };
  if (d.sessions >= sessionsPerDay) return { skipped: "cap" };
  d.pending = true;
  d.sessionStartTopics = d.topics;
  await saveLinuxdoDay(d);
  await openOrReload("https://linux.do/*", "https://linux.do/latest");
  return { ok: true };
}

async function startNodeseekCheckin() {
  const day = UsDay.beijingDay();
  const stored = await chrome.storage.local.get({ [NODESEEK_LAST]: "" });
  if (stored[NODESEEK_LAST] === day) return { skipped: "done" };
  await openOrReload("https://www.nodeseek.com/*", "https://www.nodeseek.com/");
  return { ok: true };
}

async function planTodayAlarms() {
  const parts = UsSchedule.beijingParts();
  const stored = await chrome.storage.local.get({ [LINUXDO_SETTINGS]: {} });
  const sessionsPerDay = Number((stored[LINUXDO_SETTINGS] || {}).sessionsPerDay) || 3;
  const start = Math.max(parts.minute + 2, 8 * 60);
  const minutes = UsSchedule.pickUniqueMinutes(sessionsPerDay, start, 23 * 60);
  await chrome.alarms.clearAll();
  minutes.forEach((minute, i) => {
    const when = UsSchedule.alarmWhen(parts.day, minute);
    if (!when || when <= Date.now() + 5000) return;
    chrome.alarms.create("linuxdo-session-" + i, { when });
  });
  const checkinMin = minutes[0] != null ? Math.max(8 * 60, minutes[0] - 15) : 9 * 60;
  const checkinWhen = UsSchedule.alarmWhen(parts.day, checkinMin);
  if (checkinWhen && checkinWhen > Date.now() + 5000) {
    chrome.alarms.create("nodeseek-checkin", { when: checkinWhen });
  }
  const nextPlan = UsSchedule.beijingMidnightUtc(parts.day) + 24 * 3600 * 1000 + 60 * 1000;
  if (nextPlan > Date.now()) {
    chrome.alarms.create("plan-day", { when: nextPlan });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  planTodayAlarms();
});
chrome.runtime.onStartup.addListener(() => {
  planTodayAlarms();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "plan-day") {
    planTodayAlarms();
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
  const url = String((sender && (sender.url || (sender.tab && sender.tab.url))) || "");
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    host = "";
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
  }
});

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});
