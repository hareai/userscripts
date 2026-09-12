(function (root) {
  "use strict";

  const KINDS = ["login-lost", "checkin-failed", "session-failed", "job-timeout"];
  const SITES = ["linux.do", "nodeseek.com", "expireddomains"];
  const ADAPTERS = ["hermes", "telegram"];
  const DEFAULT_ADAPTER = "hermes";

  function bytesToHex(buf) {
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function githubSignature(secret, body) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(String(secret || "")),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(String(body || "")));
    return "sha256=" + bytesToHex(sig);
  }

  function sanitizeAlert(input) {
    const src = input && typeof input === "object" ? input : {};
    const site = SITES.includes(src.site) ? src.site : "";
    const kind = KINDS.includes(src.kind) ? src.kind : "";
    const text = String(src.text || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200);
    if (!site || !kind || !text) return null;
    return {
      event_type: "userscripts.alert",
      site,
      kind,
      text,
      day: String(src.day || ""),
    };
  }

  function formatText(alert) {
    const a = sanitizeAlert(alert) || alert;
    if (!a || !a.site || !a.kind) return "";
    return a.site + " " + a.kind + "\n" + String(a.text || "");
  }

  function resolveAdapter(raw) {
    const name = String(raw == null || raw === "" ? DEFAULT_ADAPTER : raw).trim();
    if (!ADAPTERS.includes(name)) return { ok: false, name, reason: "unknown-adapter" };
    return { ok: true, name };
  }

  function hermesWebhookUrl(raw) {
    if (typeof UsIngest === "undefined" || !UsIngest.isLoopbackIngestUrl(raw)) return "";
    try {
      const u = new URL(String(raw).trim());
      if (!/^\/webhooks\/[A-Za-z0-9_-]+\/?$/.test(u.pathname)) return "";
      return u.href;
    } catch {
      return "";
    }
  }

  function telegramBotToken(raw) {
    const t = String(raw || "").trim();
    if (!/^\d{5,}:[A-Za-z0-9_-]{20,}$/.test(t)) return "";
    return t;
  }

  function telegramChatId(raw) {
    const t = String(raw || "").trim();
    if (!/^-?\d{5,20}$/.test(t)) return "";
    return t;
  }

  function telegramSendUrl(token) {
    const t = telegramBotToken(token);
    if (!t) return "";
    return "https://api.telegram.org/bot" + t + "/sendMessage";
  }

  async function postJson(url, headers, body) {
    const ctrl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 15000) : null;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body,
        signal: ctrl ? ctrl.signal : undefined,
      });
      const text = await res.text();
      return { status: res.status, text };
    } catch (e) {
      throw new Error("notify network: " + String(e.message || e).slice(0, 120));
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function hermesWebhookSend(settings, alert) {
    const url = hermesWebhookUrl(settings && settings.notifyUrl);
    const secret = settings && settings.notifySecret;
    const payload = sanitizeAlert(alert);
    if (!url) throw new Error("set a loopback Hermes webhook URL in options");
    if (!secret) throw new Error("set the Hermes webhook secret in options");
    if (!payload) throw new Error("invalid alert");
    const body = JSON.stringify(payload);
    const sig = await githubSignature(secret, body);
    const res = await postJson(
      url,
      {
        "Content-Type": "application/json",
        "X-Hub-Signature-256": sig,
        "X-GitHub-Event": payload.kind,
      },
      body,
    );
    if (res.status < 200 || res.status >= 300) {
      throw new Error("notify " + res.status + ": " + res.text.slice(0, 200));
    }
    return { ok: true, status: res.status, adapter: "hermes" };
  }

  async function telegramBotSend(settings, alert) {
    const token = telegramBotToken(settings && settings.telegramBotToken);
    const chatId = telegramChatId(settings && settings.telegramChatId);
    const payload = sanitizeAlert(alert);
    const url = telegramSendUrl(token);
    if (!token || !url) throw new Error("set a Telegram bot token in options");
    if (!chatId) throw new Error("set a Telegram chat id in options");
    if (!payload) throw new Error("invalid alert");
    const body = JSON.stringify({
      chat_id: chatId,
      text: formatText(payload),
      disable_web_page_preview: true,
    });
    const res = await postJson(url, { "Content-Type": "application/json" }, body);
    let data = {};
    try {
      data = JSON.parse(res.text || "{}");
    } catch {
      data = {};
    }
    if (res.status < 200 || res.status >= 300 || data.ok === false) {
      throw new Error("notify telegram " + res.status + ": " + String(data.description || res.text).slice(0, 200));
    }
    return { ok: true, status: res.status, adapter: "telegram" };
  }

  const senders = {
    hermes: hermesWebhookSend,
    telegram: telegramBotSend,
  };

  function getAdapter(name) {
    const got = resolveAdapter(name);
    return got.ok ? senders[got.name] : undefined;
  }

  function validateSettings(settings) {
    const got = resolveAdapter(settings && settings.notifyAdapter);
    if (!got.ok) return { ok: false, error: "unknown notify adapter", adapter: got.name };
    if (got.name === "hermes") {
      const url = settings && settings.notifyUrl;
      if (url && !hermesWebhookUrl(url)) {
        return { ok: false, error: "notify URL must be http://127.0.0.1:port/webhooks/name", adapter: got.name };
      }
      return { ok: true, adapter: got.name };
    }
    if (got.name === "telegram") {
      const token = settings && settings.telegramBotToken;
      const chat = settings && settings.telegramChatId;
      if (token && !telegramBotToken(token)) {
        return { ok: false, error: "telegram bot token looks wrong", adapter: got.name };
      }
      if (chat && !telegramChatId(chat)) {
        return { ok: false, error: "telegram chat id must be a number", adapter: got.name };
      }
      return { ok: true, adapter: got.name };
    }
    return { ok: false, error: "unknown notify adapter", adapter: got.name };
  }

  async function sendAlert(settings, alert) {
    const got = resolveAdapter(settings && settings.notifyAdapter);
    if (!got.ok) throw new Error("unknown notify adapter");
    return senders[got.name](settings, alert);
  }

  const api = {
    KINDS,
    SITES,
    ADAPTERS,
    DEFAULT_ADAPTER,
    githubSignature,
    sanitizeAlert,
    formatText,
    resolveAdapter,
    hermesWebhookUrl,
    telegramBotToken,
    telegramChatId,
    telegramSendUrl,
    validateSettings,
    getAdapter,
    sendAlert,
  };
  root.UsNotify = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
