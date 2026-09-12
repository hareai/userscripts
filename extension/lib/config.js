(function (root) {
  "use strict";

  function stripComment(line) {
    let inSingle = false;
    let inDouble = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === "'" && !inDouble) inSingle = !inSingle;
      else if (ch === '"' && !inSingle) inDouble = !inDouble;
      else if (ch === "#" && !inSingle && !inDouble) return line.slice(0, i).trimEnd();
    }
    return line;
  }

  function parseScalar(raw) {
    const v = String(raw || "").trim();
    if (!v) return "";
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      return v.slice(1, -1);
    }
    if (v === "true") return true;
    if (v === "false") return false;
    if (v === "null" || v === "~") return null;
    if (/^-?\d+$/.test(v)) return v;
    return v;
  }

  function isEmptyObject(v) {
    return v && typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length;
  }

  function parseYaml(text) {
    const lines = String(text || "").split(/\r?\n/);
    const root = {};
    const stack = [{ indent: -1, container: root, parent: null, key: null }];
    for (const original of lines) {
      const noComment = stripComment(original);
      if (!noComment.trim()) continue;
      const indent = noComment.match(/^\s*/)[0].length;
      const trimmed = noComment.trim();
      while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
      const frame = stack[stack.length - 1];
      if (trimmed.startsWith("-")) {
        const item = parseScalar(trimmed.replace(/^-/, "").trim());
        if (!Array.isArray(frame.container)) {
          if (frame.parent && frame.key && isEmptyObject(frame.container)) {
            const arr = [];
            frame.parent[frame.key] = arr;
            frame.container = arr;
          } else {
            throw new Error("yaml lists need a key");
          }
        }
        frame.container.push(item);
        continue;
      }
      const colon = trimmed.indexOf(":");
      if (colon < 0) throw new Error("yaml: missing colon");
      const key = trimmed.slice(0, colon).trim();
      const rest = trimmed.slice(colon + 1).trim();
      if (!key) throw new Error("yaml: empty key");
      if (Array.isArray(frame.container)) throw new Error("yaml: map entry inside list");
      if (!rest) {
        const child = {};
        frame.container[key] = child;
        stack.push({ indent, container: child, parent: frame.container, key });
      } else {
        frame.container[key] = parseScalar(rest);
      }
    }
    return root;
  }

  function str(v) {
    if (v == null) return "";
    return String(v).trim();
  }

  function bool(v, fallback) {
    if (v === true || v === "true") return true;
    if (v === false || v === "false") return false;
    return fallback;
  }

  function num(v, min, max, fallback) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function list(v) {
    if (!Array.isArray(v)) return [];
    return v.map(str).filter(Boolean);
  }

  function obj(v) {
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  }

  function settingsFromDoc(doc) {
    const src = obj(doc);
    const notify = obj(src.notify);
    const hermes = obj(notify.hermes);
    const telegram = obj(notify.telegram);
    const ingest = obj(src.ingest);
    const linuxdo = obj(src.linuxdo);
    const nodeseek = obj(src.nodeseek);
    const expireddomains = obj(src.expireddomains);
    return {
      notifyAdapter: str(notify.adapter),
      notifyUrl: str(hermes.url),
      notifySecret: str(hermes.secret),
      telegramBotToken: str(telegram.bot_token),
      telegramChatId: str(telegram.chat_id),
      ingestUrl: str(ingest.url),
      ingestToken: str(ingest.token),
      linuxdo: {
        enabled: bool(linuxdo.enabled, true),
        staySec: num(linuxdo.stay_sec, 5, 600, 20),
        gapSec: num(linuxdo.gap_sec, 2, 120, 8),
        sessionsPerDay: num(linuxdo.sessions_per_day, 1, 12, 3),
        topicsPerSession: num(linuxdo.topics_per_session, 1, 20, 1),
        likeCap: num(linuxdo.like_cap, 0, 50, 2),
        likeMin: num(linuxdo.like_min, 0, 999, 0),
        windowStartHour: num(linuxdo.window_start_hour, 0, 23, 8),
        windowEndHour: num(linuxdo.window_end_hour, 1, 24, 23),
      },
      nodeseek: {
        enabled: bool(nodeseek.enabled, true),
        random: bool(nodeseek.random, true),
      },
      expireddomains: {
        enabled: bool(expireddomains.enabled, true),
        pages: num(expireddomains.pages, 1, 20, 5),
        gapSec: num(expireddomains.gap_sec, 1, 30, 2),
        savedSearches: list(expireddomains.saved_searches),
      },
    };
  }

  function publicSettings(settings) {
    const s = settings && typeof settings === "object" ? settings : {};
    return {
      linuxdo: s.linuxdo,
      nodeseek: s.nodeseek,
      expireddomains: s.expireddomains,
    };
  }

  const api = { parseYaml, settingsFromDoc, publicSettings };
  root.UsConfig = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
