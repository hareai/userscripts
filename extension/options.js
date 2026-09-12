/* global UsIngest, UsNotify */

const form = document.getElementById("form");
const statusEl = document.getElementById("status");
const urlEl = document.getElementById("ingestUrl");
const tokenEl = document.getElementById("ingestToken");
const adapterEl = document.getElementById("notifyAdapter");
const notifyUrlEl = document.getElementById("notifyUrl");
const notifySecretEl = document.getElementById("notifySecret");
const telegramTokenEl = document.getElementById("telegramBotToken");
const telegramChatEl = document.getElementById("telegramChatId");
const hermesFields = document.getElementById("hermes-fields");
const telegramFields = document.getElementById("telegram-fields");

function syncAdapterFields() {
  const name = adapterEl.value || UsNotify.DEFAULT_ADAPTER;
  hermesFields.hidden = name !== "hermes";
  telegramFields.hidden = name !== "telegram";
}

async function load() {
  const s = await chrome.storage.local.get({
    ingestUrl: "",
    ingestToken: "",
    notifyAdapter: UsNotify.DEFAULT_ADAPTER,
    notifyUrl: "",
    notifySecret: "",
    telegramBotToken: "",
    telegramChatId: "",
  });
  urlEl.value = s.ingestUrl || "";
  tokenEl.value = s.ingestToken || "";
  adapterEl.value = UsNotify.ADAPTERS.includes(s.notifyAdapter) ? s.notifyAdapter : UsNotify.DEFAULT_ADAPTER;
  notifyUrlEl.value = s.notifyUrl || "";
  notifySecretEl.value = s.notifySecret || "";
  telegramTokenEl.value = s.telegramBotToken || "";
  telegramChatEl.value = s.telegramChatId || "";
  syncAdapterFields();
}

adapterEl.addEventListener("change", syncAdapterFields);

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const ingestUrl = urlEl.value.trim();
  const ingestToken = tokenEl.value;
  const notifyAdapter = adapterEl.value || UsNotify.DEFAULT_ADAPTER;
  const notifyUrl = notifyUrlEl.value.trim();
  const notifySecret = notifySecretEl.value;
  const telegramBotToken = telegramTokenEl.value.trim();
  const telegramChatId = telegramChatEl.value.trim();
  if (ingestUrl && !UsIngest.isLoopbackIngestUrl(ingestUrl)) {
    statusEl.textContent = "ingest URL must be 127.0.0.1 or ::1";
    return;
  }
  const check = UsNotify.validateSettings({
    notifyAdapter,
    notifyUrl,
    telegramBotToken,
    telegramChatId,
  });
  if (!check.ok) {
    statusEl.textContent = check.error;
    return;
  }
  await chrome.storage.local.set({
    ingestUrl,
    ingestToken,
    notifyAdapter,
    notifyUrl,
    notifySecret,
    telegramBotToken,
    telegramChatId,
  });
  statusEl.textContent = "saved";
});

load();
