/* global UsIngest */

const form = document.getElementById("form");
const statusEl = document.getElementById("status");
const urlEl = document.getElementById("ingestUrl");
const tokenEl = document.getElementById("ingestToken");

async function load() {
  const s = await chrome.storage.local.get({ ingestUrl: "", ingestToken: "" });
  urlEl.value = s.ingestUrl || "";
  tokenEl.value = s.ingestToken || "";
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const ingestUrl = urlEl.value.trim();
  const ingestToken = tokenEl.value;
  if (ingestUrl && !UsIngest.isLoopbackIngestUrl(ingestUrl)) {
    statusEl.textContent = "URL must be 127.0.0.1 or ::1";
    return;
  }
  await chrome.storage.local.set({ ingestUrl, ingestToken });
  statusEl.textContent = "saved";
});

load();
