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

test("notify adapter registry: hermes default, telegram optional, unknown fails closed", async () => {
  assert.equal(Array.from(notify.ADAPTERS).join(","), "hermes,telegram");
  assert.equal(notify.DEFAULT_ADAPTER, "hermes");
  assert.equal(notify.resolveAdapter("").name, "hermes");
  assert.equal(notify.resolveAdapter("hermes").ok, true);
  assert.equal(notify.resolveAdapter("telegram").ok, true);
  assert.equal(notify.resolveAdapter("nope").ok, false);
  assert.equal(notify.getAdapter("nope"), undefined);
  assert.equal(typeof notify.getAdapter("telegram"), "function");
  const fakeToken = "12345:AAAAAAAAAAAAAAAAAAAA";
  assert.equal(notify.telegramBotToken(fakeToken), fakeToken);
  assert.equal(notify.telegramBotToken("not-a-token"), "");
  assert.equal(notify.telegramChatId("123456789"), "123456789");
  assert.equal(notify.telegramChatId("-1001234567890"), "-1001234567890");
  assert.equal(notify.telegramChatId("abc"), "");
  assert.equal(
    notify.telegramSendUrl(fakeToken),
    "https://api.telegram.org/bot" + fakeToken + "/sendMessage",
  );
  assert.equal(notify.validateSettings({ notifyAdapter: "hermes" }).ok, true);
  assert.equal(notify.validateSettings({ notifyAdapter: "nope" }).ok, false);
  assert.equal(
    notify.validateSettings({ notifyAdapter: "hermes", notifyUrl: "http://example.com/webhooks/x" }).ok,
    false,
  );
  assert.equal(notify.validateSettings({ notifyAdapter: "telegram", telegramBotToken: fakeToken, telegramChatId: "1" }).ok, false);
  assert.equal(
    notify.validateSettings({ notifyAdapter: "telegram", telegramBotToken: fakeToken, telegramChatId: "123456789" }).ok,
    true,
  );
  assert.equal(notify.formatText({ site: "linux.do", kind: "login-lost", text: "gone" }), "linux.do login-lost\ngone");
  await assert.rejects(
    () => notify.sendAlert({ notifyAdapter: "nope" }, { site: "linux.do", kind: "login-lost", text: "x" }),
    /unknown notify adapter/,
  );

  const calls = [];
  const env = sandbox();
  env.fetch = async (url, opts) => {
    calls.push({ url: String(url), body: String(opts && opts.body) });
    return {
      status: 200,
      text: async () => JSON.stringify({ ok: true, result: { message_id: 1 } }),
    };
  };
  loadLib("ingest-url.js", env);
  const withFetch = loadLib("notify.js", env);
  const sent = await withFetch.sendAlert(
    { notifyAdapter: "telegram", telegramBotToken: fakeToken, telegramChatId: "123456789" },
    { site: "linux.do", kind: "login-lost", text: "gone" },
  );
  assert.equal(sent.adapter, "telegram");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.telegram.org/bot" + fakeToken + "/sendMessage");
  assert.match(calls[0].body, /"chat_id":"123456789"/);
  assert.match(calls[0].body, /linux\.do login-lost/);
});

test("config.yaml is the notify/ingest source of truth", () => {
  const cfg = loadLib("config.js");
  const doc = cfg.parseYaml(`
notify:
  adapter: telegram
  hermes:
    url: http://127.0.0.1:8644/webhooks/userscripts-alerts
    secret: "hook-secret"
  telegram:
    bot_token: "12345:AAAAAAAAAAAAAAAAAAAA"
    chat_id: "123456789"
ingest:
  url: http://127.0.0.1:8787/internal/ingest
  token: "scout"
linuxdo:
  enabled: true
  stay_sec: 30
  gap_sec: 10
  sessions_per_day: 2
  topics_per_session: 1
  like_cap: 1
  like_min: 3
  window_start_hour: 9
  window_end_hour: 22
nodeseek:
  enabled: false
  random: false
expireddomains:
  enabled: true
  pages: 3
  gap_sec: 4
  saved_searches:
    - 653083
    - 通用域名48d
# comment
`);
  const s = cfg.settingsFromDoc(doc);
  assert.equal(s.notifyAdapter, "telegram");
  assert.equal(s.notifyUrl, "http://127.0.0.1:8644/webhooks/userscripts-alerts");
  assert.equal(s.notifySecret, "hook-secret");
  assert.equal(s.telegramBotToken, "12345:AAAAAAAAAAAAAAAAAAAA");
  assert.equal(s.telegramChatId, "123456789");
  assert.equal(s.ingestUrl, "http://127.0.0.1:8787/internal/ingest");
  assert.equal(s.ingestToken, "scout");
  assert.equal(s.linuxdo.staySec, 30);
  assert.equal(s.linuxdo.sessionsPerDay, 2);
  assert.equal(s.linuxdo.likeCap, 1);
  assert.equal(s.linuxdo.windowStartHour, 9);
  assert.equal(s.nodeseek.enabled, false);
  assert.equal(s.nodeseek.random, false);
  assert.equal(s.expireddomains.pages, 3);
  assert.equal(s.expireddomains.gapSec, 4);
  assert.equal(s.expireddomains.savedSearches.join(","), "653083,通用域名48d");
  const empty = cfg.settingsFromDoc({});
  assert.equal(empty.linuxdo.sessionsPerDay, 3);
  assert.equal(empty.linuxdo.likeCap, 2);
  assert.equal(empty.nodeseek.enabled, true);
  assert.equal(empty.expireddomains.pages, 5);
  const example = cfg.parseYaml(
    fs.readFileSync(path.join(__dirname, "..", "config.example.yaml"), "utf8"),
  );
  const fromExample = cfg.settingsFromDoc(example);
  assert.equal(fromExample.notifyAdapter, "hermes");
  assert.equal(fromExample.telegramBotToken, "");
  assert.equal(fromExample.notifySecret, "");
  assert.equal(fromExample.linuxdo.sessionsPerDay, 3);
  assert.equal(fromExample.linuxdo.likeCap, 2);
  assert.equal(fromExample.nodeseek.random, true);
  assert.equal(fromExample.expireddomains.pages, 5);
  const pub = cfg.publicSettings(s);
  assert.equal(pub.notifySecret, undefined);
  assert.equal(pub.telegramBotToken, undefined);
  assert.equal(pub.linuxdo.likeCap, 1);
  const bg = fs.readFileSync(path.join(__dirname, "..", "extension", "background.js"), "utf8");
  assert.match(bg, /config\.yaml/);
  assert.match(bg, /UsConfig/);
  assert.match(bg, /public-config/);
  const opt = fs.readFileSync(path.join(__dirname, "..", "extension", "options.js"), "utf8");
  assert.equal(opt.includes("chrome.storage.local.set"), false);
  const linuxdoContent = fs.readFileSync(path.join(__dirname, "..", "extension", "content", "linuxdo.js"), "utf8");
  assert.equal(linuxdoContent.includes("linuxdo.settings"), false);
  assert.equal(linuxdoContent.includes("saveSettings"), false);
  const ed = fs.readFileSync(path.join(__dirname, "..", "extension", "content", "expireddomains.js"), "utf8");
  assert.equal(ed.includes("ed.settings"), false);
  assert.equal(ed.includes("localStorage"), false);
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
  assert.ok(manifest.host_permissions.includes("https://api.telegram.org/*"));
  for (const p of manifest.host_permissions) {
    assert.equal(p.includes("localhost"), false);
  }
  const text = fs.readFileSync(path.join(__dirname, "..", "extension", "background.js"), "utf8");
  assert.match(text, /jobs\.lock/);
  assert.match(text, /job-watchdog/);
  assert.match(text, /alerts\.queue/);
  assert.match(text, /job-timeout/);
  const linuxdo = fs.readFileSync(path.join(__dirname, "..", "extension", "content", "linuxdo.js"), "utf8");
  assert.match(linuxdo, /location\.assign\(next\.href\)/);
  assert.match(linuxdo, /onJobNav/);
  assert.equal(linuxdo.includes("next.click()"), false);
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
    assert.equal(text.includes("telegramBotToken"), false, name);
    assert.equal(text.includes("Authorization"), false, name);
    assert.equal(text.includes("Bearer"), false, name);
  }
});
