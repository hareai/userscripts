/* global UsIngest, UsNotify */

const form = document.getElementById("form");
const statusEl = document.getElementById("status");
const urlEl = document.getElementById("ingestUrl");
const tokenEl = document.getElementById("ingestToken");
const adapterEl = document.getElementById("notifyAdapter");
const notifyUrlEl = document.getElementById("notifyUrl");
const notifySecretEl = document.getElementById("notifySecret");

async function load() {
  const s = await chrome.storage.local.get({
    ingestUrl: "",
    ingestToken: "",
    notifyAdapter: "hermes",
    notifyUrl: "",
    notifySecret: "",
  });
  urlEl.value = s.ingestUrl || "";
  tokenEl.value = s.ingestToken || "";
  adapterEl.value = s.notifyAdapter || "hermes";
  notifyUrlEl.value = s.notifyUrl || "";
  notifySecretEl.value = s.notifySecret || "";
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const ingestUrl = urlEl.value.trim();
  const ingestToken = tokenEl.value;
  const notifyAdapter = adapterEl.value || "hermes";
  const notifyUrl = notifyUrlEl.value.trim();
  const notifySecret = notifySecretEl.value;
  if (ingestUrl && !UsIngest.isLoopbackIngestUrl(ingestUrl)) {
    statusEl.textContent = "ingest URL must be 127.0.0.1 or ::1";
    return;
  }
  if (notifyUrl && !UsNotify.hermesWebhookUrl(notifyUrl)) {
    statusEl.textContent = "notify URL must be http://127.0.0.1:port/webhooks/name";
    return;
  }
  await chrome.storage.local.set({
    ingestUrl,
    ingestToken,
    notifyAdapter,
    notifyUrl,
    notifySecret,
  });
  statusEl.textContent = "saved";
});

load();
