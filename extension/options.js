/* global UsNotify, UsConfig */

const statusEl = document.getElementById("status");

function mask(v) {
  const s = String(v || "");
  if (!s) return "(empty)";
  if (s.length <= 6) return "••••";
  return s.slice(0, 4) + "…" + s.slice(-2);
}

async function load() {
  try {
    const res = await fetch(chrome.runtime.getURL("config.yaml"), { cache: "no-store" });
    if (!res.ok) {
      statusEl.textContent = "missing extension/config.yaml — copy config.example.yaml";
      return;
    }
    const settings = UsConfig.settingsFromDoc(UsConfig.parseYaml(await res.text()));
    const check = UsNotify.validateSettings(settings);
    const linuxdo = settings.linuxdo || {};
    const nodeseek = settings.nodeseek || {};
    const ed = settings.expireddomains || {};
    statusEl.textContent = [
      "adapter: " + (settings.notifyAdapter || UsNotify.DEFAULT_ADAPTER),
      check.ok ? "config ok" : "config error: " + check.error,
      "notify url: " + (settings.notifyUrl || "(empty)"),
      "webhook secret: " + mask(settings.notifySecret),
      "telegram token: " + mask(settings.telegramBotToken),
      "telegram chat: " + (settings.telegramChatId || "(empty)"),
      "ingest url: " + (settings.ingestUrl || "(empty)"),
      "linux.do: " +
        (linuxdo.enabled === false ? "off" : "on") +
        " · " +
        linuxdo.sessionsPerDay +
        " sessions · like " +
        linuxdo.likeCap +
        " · stay " +
        linuxdo.staySec +
        "s",
      "nodeseek: " + (nodeseek.enabled === false ? "off" : "on") + " · random " + String(nodeseek.random !== false),
      "expireddomains: " +
        (ed.enabled === false ? "off" : "on") +
        " · pages " +
        ed.pages +
        " · " +
        ((ed.savedSearches || []).length ? ed.savedSearches.length + " searches" : "all saved"),
    ].join("\n");
  } catch (e) {
    statusEl.textContent = "config.yaml: " + String(e.message || e);
  }
}

load();
