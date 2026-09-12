/* global UsIngest */

importScripts("lib/ingest-url.js");

const DEFAULTS = {
  ingestUrl: "",
  ingestToken: "",
};

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
});

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});
