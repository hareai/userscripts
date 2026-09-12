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
    statusEl.textContent =
      "adapter: " +
      (settings.notifyAdapter || UsNotify.DEFAULT_ADAPTER) +
      "\n" +
      (check.ok ? "config ok" : "config error: " + check.error) +
      "\nnotify url: " +
      (settings.notifyUrl || "(empty)") +
      "\nwebhook secret: " +
      mask(settings.notifySecret) +
      "\ntelegram token: " +
      mask(settings.telegramBotToken) +
      "\ntelegram chat: " +
      (settings.telegramChatId || "(empty)") +
      "\ningest url: " +
      (settings.ingestUrl || "(empty)");
  } catch (e) {
    statusEl.textContent = "config.yaml: " + String(e.message || e);
  }
}

load();
