(function (root) {
  "use strict";

  function isLoopbackIngestUrl(raw) {
    if (typeof raw !== "string" || !raw.trim()) return false;
    let u;
    try {
      u = new URL(raw.trim());
    } catch {
      return false;
    }
    if (u.username || u.password) return false;
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    return host === "127.0.0.1" || host === "::1";
  }

  const LISTING_KEYS = [
    "le",
    "wby",
    "aby",
    "reg",
    "dropped",
    "status",
    "drop_date",
    "other",
    "savedsearch_id",
    "savedsearch_name",
    "source_url",
  ];

  function sanitizeListings(input) {
    if (!Array.isArray(input)) return [];
    const out = [];
    const seen = new Set();
    for (const row of input.slice(0, 500)) {
      if (!row || typeof row !== "object") continue;
      const fqdn = String(row.fqdn || "")
        .trim()
        .toLowerCase()
        .replace(/^www\./, "");
      if (!fqdn.includes(".") || seen.has(fqdn)) continue;
      seen.add(fqdn);
      const clean = { fqdn };
      for (const key of LISTING_KEYS) {
        if (row[key] === undefined) continue;
        if (key === "other" && (row.other === null || typeof row.other !== "object" || Array.isArray(row.other))) {
          continue;
        }
        clean[key] = row[key];
      }
      out.push(clean);
    }
    return out;
  }

  const api = { isLoopbackIngestUrl, sanitizeListings };
  root.UsIngest = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
