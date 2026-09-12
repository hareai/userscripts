(function (root) {
  "use strict";

  const KINDS = ["login-lost", "checkin-failed", "session-failed", "job-timeout"];
  const SITES = ["linux.do", "nodeseek.com", "expireddomains"];

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

  async function hermesWebhookSend(settings, alert) {
    const url = hermesWebhookUrl(settings && settings.notifyUrl);
    const secret = settings && settings.notifySecret;
    const payload = sanitizeAlert(alert);
    if (!url) throw new Error("set a loopback Hermes webhook URL in options");
    if (!secret) throw new Error("set the Hermes webhook secret in options");
    if (!payload) throw new Error("invalid alert");
    const body = JSON.stringify(payload);
    const sig = await githubSignature(secret, body);
    const ctrl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 15000) : null;
    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Hub-Signature-256": sig,
          "X-GitHub-Event": payload.kind,
        },
        body,
        signal: ctrl ? ctrl.signal : undefined,
      });
    } catch (e) {
      throw new Error("notify network: " + String(e.message || e).slice(0, 120));
    } finally {
      if (timer) clearTimeout(timer);
    }
    const text = await res.text();
    if (res.status < 200 || res.status >= 300) {
      throw new Error("notify " + res.status + ": " + text.slice(0, 200));
    }
    return { ok: true, status: res.status };
  }

  const adapters = {
    hermes: hermesWebhookSend,
  };

  function getAdapter(name) {
    return adapters[name] || adapters.hermes;
  }

  async function sendAlert(settings, alert) {
    const send = getAdapter(settings && settings.notifyAdapter);
    return send(settings, alert);
  }

  const api = {
    KINDS,
    SITES,
    githubSignature,
    sanitizeAlert,
    hermesWebhookUrl,
    getAdapter,
    sendAlert,
  };
  root.UsNotify = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
