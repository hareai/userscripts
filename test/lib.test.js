"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const nodeCrypto = require("node:crypto");

function sandbox() {
  const ctx = {
    module: { exports: {} },
    exports: {},
    URL,
    Date,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Set,
    Math,
    JSON,
    RegExp,
    console,
    crypto,
    Uint8Array,
    TextEncoder,
  };
  ctx.globalThis = ctx;
  return ctx;
}

function loadLib(name, ctx) {
  const env = ctx || sandbox();
  env.module = { exports: {} };
  const file = path.join(__dirname, "..", "extension", "lib", name);
  vm.runInNewContext(fs.readFileSync(file, "utf8"), env, { filename: file });
  return env.module.exports;
}

const ingest = loadLib("ingest-url.js");
const day = loadLib("beijing-day.js");
const linuxdo = loadLib("linuxdo.js");
const nodeseek = loadLib("nodeseek.js");
const listings = loadLib("listings.js");
const schedule = loadLib("schedule.js");
const notifyCtx = sandbox();
loadLib("ingest-url.js", notifyCtx);
const notify = loadLib("notify.js", notifyCtx);

test("loopback ingest URLs only", () => {
  assert.equal(ingest.isLoopbackIngestUrl("http://127.0.0.1:8787/internal/ingest"), true);
  assert.equal(ingest.isLoopbackIngestUrl("http://[::1]/internal/ingest"), true);
  assert.equal(ingest.isLoopbackIngestUrl("https://127.0.0.1/x"), true);
  assert.equal(ingest.isLoopbackIngestUrl(""), false);
  assert.equal(ingest.isLoopbackIngestUrl("http://localhost/internal/ingest"), false);
  assert.equal(ingest.isLoopbackIngestUrl("http://example.com/internal/ingest"), false);
  assert.equal(ingest.isLoopbackIngestUrl("https://member.expireddomains.net/"), false);
  assert.equal(ingest.isLoopbackIngestUrl("http://127.0.0.1.evil.test/x"), false);
  assert.equal(ingest.isLoopbackIngestUrl("http://user:pass@127.0.0.1/x"), false);
  assert.equal(ingest.isLoopbackIngestUrl("file:///etc/passwd"), false);
});

test("sanitize listings", () => {
  const rows = ingest.sanitizeListings([
    { fqdn: "WWW.Example.COM", le: 7 },
    { fqdn: "example.com" },
    { fqdn: "nope" },
    null,
    { fqdn: "ok.net", extra: 1 },
  ]);
  assert.deepEqual(
    Array.from(rows, (r) => r.fqdn),
    ["example.com", "ok.net"],
  );
  assert.equal(rows[1].extra, undefined);
  assert.equal(rows[0].le, 7);
});

test("beijing day around UTC+8", () => {
  assert.equal(day.beijingDay(Date.UTC(2026, 8, 11, 16, 0, 0)), "2026-09-12");
  assert.equal(day.beijingDay(Date.UTC(2026, 8, 11, 15, 59, 0)), "2026-09-11");
});

test("linux.do path helpers and defaults", () => {
  assert.equal(linuxdo.DEFAULTS.sessionsPerDay, 3);
  assert.equal(linuxdo.DEFAULTS.likeCap, 2);
  assert.equal(linuxdo.DEFAULTS.topicsPerSession, 1);
  assert.equal(linuxdo.isList("/"), true);
  assert.equal(linuxdo.isList("/latest"), true);
  assert.equal(linuxdo.isList("/latest/"), true);
  assert.equal(linuxdo.isList("/unseen"), true);
  assert.equal(linuxdo.isList("/unseen/"), true);
  assert.equal(linuxdo.isList("/t/hello/123"), false);
  assert.equal(linuxdo.isTopic("/t/hello/123"), true);
  assert.equal(linuxdo.topicId("https://linux.do/t/hello/99"), "99");
  assert.equal(linuxdo.topicId("/t/hello/99", "https://linux.do"), "99");
  assert.equal(linuxdo.clampNum("3", 1, 10, 5), 3);
  assert.equal(linuxdo.clampNum("99", 1, 10, 5), 10);
  const btn = { getAttribute: () => "12 likes", parentElement: null, textContent: "" };
  assert.equal(linuxdo.likeCount(btn), 12);
  assert.equal(
    linuxdo.loggedIn({
      querySelector(sel) {
        return sel.includes("#current-user") ? { id: "current-user" } : null;
      },
    }),
    true,
  );
  assert.equal(linuxdo.loggedIn({ querySelector: () => null }), false);
});

test("nodeseek login and already-checked", () => {
  const doc = {
    querySelector(sel) {
      if (sel.includes("/logout")) return { href: "/logout" };
      return null;
    },
  };
  assert.equal(nodeseek.loggedIn(doc), true);
  assert.equal(nodeseek.loggedIn({ querySelector: () => null }), false);
  assert.equal(
    nodeseek.loggedIn({
      querySelector(sel) {
        return sel.includes("img.avatar") ? { tagName: "IMG" } : null;
      },
    }),
    false,
  );
  assert.equal(nodeseek.alreadyCheckedIn("已签到", 400), true);
  assert.equal(nodeseek.alreadyCheckedIn("ok", 500), false);
  assert.equal(nodeseek.looksLoggedOut("USER NOT FOUND", 500), true);
  assert.equal(nodeseek.looksLoggedOut("ok", 200), false);
  assert.equal(nodeseek.isSignInPath("/signIn.html"), true);
  assert.equal(nodeseek.isSignInPath("/login"), true);
  assert.equal(nodeseek.isSignInPath("/"), false);
});

test("parse saved-search menu", () => {
  const html = fs.readFileSync(path.join(__dirname, "fixtures", "savedsearches-menu.html"), "utf8");
  const items = listings.parseMenu(html);
  assert.equal(items.length, 2);
  assert.equal(items[0].id, "653083");
  assert.equal(items[0].name, "通用域名48d");
  assert.equal(items[1].id, "700001");
});

test("listing table rows keep owner fields", () => {
  const html = fs.readFileSync(path.join(__dirname, "fixtures", "listing-table.html"), "utf8");
  const rows = listings.listingsFromHtml(html, {
    savedsearch_id: "653083",
    savedsearch_name: "通用域名48d",
    source_url: "https://member.expireddomains.net/domains/combinedexpired/?savedsearch_id=653083",
  });
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.equal(r.fqdn, "mofumofu.top");
  assert.equal(r.le, 8);
  assert.equal(r.wby, "2020");
  assert.equal(r.aby, "2025");
  assert.equal(r.reg, 47);
  assert.equal(r.dropped, "Yesterday 21:13");
  assert.equal(r.status, "available");
  assert.equal(r.drop_date, "2026-09-11");
  assert.equal(r.other.majestic, "12");
  assert.equal(r.other.alexa, undefined);
  assert.equal(r.savedsearch_id, "653083");
});

test("listing pagination URL", () => {
  const run = {
    searches: [{ id: "653083", href: "/savedsearches/goto/653083/" }],
    searchIndex: 0,
    pageIndex: 1,
  };
  const url = listings.listingUrl(
    run,
    "https://member.expireddomains.net/domains/combinedexpired/?savedsearch_id=653083&foo=1",
    "https://member.expireddomains.net",
  );
  assert.match(url, /savedsearch_id=653083/);
  assert.match(url, /start=200/);
  assert.equal(listings.isListingPath("/domains/combinedexpired/"), true);
});

test("random daily minutes are unique and inside window", () => {
  let i = 0;
  const seq = [0.1, 0.9, 0.4, 0.2, 0.7, 0.05];
  const mins = schedule.pickUniqueMinutes(3, 8 * 60, 23 * 60, () => seq[i++ % seq.length]);
  assert.equal(mins.length, 3);
  assert.equal(new Set(mins).size, 3);
  for (const m of mins) {
    assert.ok(m >= 8 * 60 && m < 23 * 60);
  }
  const when = schedule.alarmWhen("2026-09-12", 9 * 60);
  assert.equal(when, Date.UTC(2026, 8, 12, 1, 0, 0));
});

test("job lock: one tab lifetime, idempotent start", () => {
  const jobs = loadLib("jobs.js");
  const now = 1_000_000;
  const day = "2026-09-12";
  assert.equal(jobs.inspectLock(null, now).state, "idle");
  assert.equal(jobs.inspectLock(jobs.makeLock("linuxdo", "tok", now, 60_000), now + 10).state, "dead");
  const lock = jobs.makeLock("linuxdo", "tok", now, 60_000, 7);
  assert.equal(lock.tabId, 7);
  assert.equal(jobs.inspectLock(lock, now + 10).state, "running");
  assert.equal(jobs.inspectLock(lock, now + 60_000).state, "dead");
  assert.equal(jobs.senderMatchesLock(lock, 7), true);
  assert.equal(jobs.senderMatchesLock(lock, 8), false);
  assert.equal(jobs.decideStart("linuxdo", null, now, { linuxdoSessions: 0, linuxdoCap: 3 }).action, "start");
  assert.equal(jobs.decideStart("linuxdo", null, now, { linuxdoSessions: 3, linuxdoCap: 3 }).action, "skip");
  assert.equal(jobs.decideStart("linuxdo", null, now, { linuxdoSessions: 3, linuxdoCap: 3 }).reason, "cap");
  assert.equal(jobs.decideStart("nodeseek", null, now, { day, nodeseekLastBj: day }).action, "skip");
  assert.equal(jobs.decideStart("nodeseek", null, now, { day, nodeseekLastBj: day }).reason, "done");
  assert.equal(jobs.decideStart("nodeseek", lock, now, { day }).action, "queue");
  assert.equal(jobs.decideStart("linuxdo", lock, now, { linuxdoSessions: 0, linuxdoCap: 3 }).action, "skip");
  assert.equal(jobs.decideStart("linuxdo", lock, now, { linuxdoSessions: 0, linuxdoCap: 3 }).reason, "running");
  assert.equal(jobs.decideStart("nodeseek", lock, now + 60_000, { day }).action, "reap");
  assert.deepEqual(jobs.enqueueJob([], "linuxdo"), ["linuxdo"]);
  assert.deepEqual(jobs.enqueueJob(["linuxdo"], "linuxdo"), ["linuxdo"]);
  assert.deepEqual(jobs.enqueueJob(["linuxdo"], "nodeseek"), ["linuxdo", "nodeseek"]);
  assert.deepEqual(jobs.enqueueJob([], "expireddomains"), []);
  assert.equal(jobs.dequeueJob(["nodeseek", "linuxdo"]).job, "nodeseek");
  assert.ok(jobs.linuxdoTimeoutMs({ staySec: 20, gapSec: 8, topicsPerSession: 1 }) >= jobs.LINUXDO_TIMEOUT_MIN_MS);
  assert.equal(jobs.timeoutMs("nodeseek"), jobs.NODESEEK_TIMEOUT_MS);
  assert.equal(jobs.notifyRetryDelay(0), 60 * 1000);
  assert.equal(jobs.alertDedupeKey({ site: "linux.do", kind: "login-lost", day }), "2026-09-12:linux.do:login-lost");
});

test("notify adapter: loopback webhook URL and HMAC", async () => {
  assert.ok(notify.hermesWebhookUrl("http://127.0.0.1:8644/webhooks/userscripts-alerts"));
  assert.equal(notify.hermesWebhookUrl("http://example.com/webhooks/x"), "");
  assert.equal(notify.hermesWebhookUrl("http://127.0.0.1:8644/v1/chat"), "");
  assert.equal(notify.hermesWebhookUrl("http://localhost:8644/webhooks/x"), "");
  const body = JSON.stringify({ event_type: "userscripts.alert", site: "linux.do", kind: "login-lost", text: "x" });
  const sig = await notify.githubSignature("secret", body);
  const expected =
    "sha256=" + nodeCrypto.createHmac("sha256", "secret").update(body).digest("hex");
  assert.equal(sig, expected);
  assert.equal(notify.sanitizeAlert({ site: "linux.do", kind: "login-lost", text: "please login" }).kind, "login-lost");
  assert.equal(notify.sanitizeAlert({ site: "linux.do", kind: "job-timeout", text: "linuxdo timed out" }).kind, "job-timeout");
  assert.equal(notify.sanitizeAlert({ site: "evil.com", kind: "login-lost", text: "x" }), null);
  assert.equal(typeof notify.getAdapter("hermes"), "function");
});

test("manifest is one unpacked MV3 with loopback notify/ingest hosts", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "extension", "manifest.json"), "utf8"),
  );
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.background.service_worker, "background.js");
  assert.deepEqual(manifest.permissions, ["storage", "alarms"]);
  assert.ok(manifest.host_permissions.includes("https://linux.do/*"));
  assert.ok(manifest.host_permissions.includes("https://www.nodeseek.com/*"));
  for (const p of manifest.host_permissions) {
    assert.equal(p.includes("localhost"), false);
  }
  const text = fs.readFileSync(path.join(__dirname, "..", "extension", "background.js"), "utf8");
  assert.match(text, /jobs\.lock/);
  assert.match(text, /job-watchdog/);
  assert.match(text, /alerts\.queue/);
  assert.match(text, /job-timeout/);
  assert.match(text, /decideStart/);
  assert.match(text, /beginJob/);
  assert.equal(text.includes("pending"), false);
  assert.equal(text.includes("decideAcquire"), false);
  assert.equal(text.includes("chrome.alarms.clearAll"), false);
  assert.equal(text.includes("openOrReload"), false);
  assert.equal(text.includes("attachJobTab"), false);
  assert.equal(manifest.content_scripts.length, 3);
});

test("content scripts never mention secrets", () => {
  const dir = path.join(__dirname, "..", "extension", "content");
  for (const name of fs.readdirSync(dir)) {
    const text = fs.readFileSync(path.join(dir, name), "utf8");
    assert.equal(text.includes("ingestToken"), false, name);
    assert.equal(text.includes("notifySecret"), false, name);
    assert.equal(text.includes("Authorization"), false, name);
    assert.equal(text.includes("Bearer"), false, name);
  }
});
