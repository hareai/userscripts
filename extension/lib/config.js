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

  function parseYaml(text) {
    const lines = String(text || "").split(/\r?\n/);
    const root = {};
    const stack = [{ indent: -1, obj: root }];
    for (const original of lines) {
      const noComment = stripComment(original);
      if (!noComment.trim()) continue;
      const indent = noComment.match(/^\s*/)[0].length;
      const trimmed = noComment.trim();
      if (trimmed.startsWith("-")) throw new Error("yaml lists are not supported");
      const colon = trimmed.indexOf(":");
      if (colon < 0) throw new Error("yaml: missing colon");
      const key = trimmed.slice(0, colon).trim();
      const rest = trimmed.slice(colon + 1).trim();
      if (!key) throw new Error("yaml: empty key");
      while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
      const parent = stack[stack.length - 1].obj;
      if (!rest) {
        const child = {};
        parent[key] = child;
        stack.push({ indent, obj: child });
      } else {
        parent[key] = parseScalar(rest);
      }
    }
    return root;
  }

  function str(v) {
    if (v == null) return "";
    return String(v).trim();
  }

  function settingsFromDoc(doc) {
    const src = doc && typeof doc === "object" ? doc : {};
    const notify = src.notify && typeof src.notify === "object" ? src.notify : {};
    const hermes = notify.hermes && typeof notify.hermes === "object" ? notify.hermes : {};
    const telegram = notify.telegram && typeof notify.telegram === "object" ? notify.telegram : {};
    const ingest = src.ingest && typeof src.ingest === "object" ? src.ingest : {};
    return {
      notifyAdapter: str(notify.adapter),
      notifyUrl: str(hermes.url),
      notifySecret: str(hermes.secret),
      telegramBotToken: str(telegram.bot_token),
      telegramChatId: str(telegram.chat_id),
      ingestUrl: str(ingest.url),
      ingestToken: str(ingest.token),
    };
  }

  const api = { parseYaml, settingsFromDoc };
  root.UsConfig = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
