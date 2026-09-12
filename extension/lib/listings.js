(function (root) {
  "use strict";

  function firstNumber(text) {
    const m = String(text || "").match(/-?\d+/);
    return m ? Number(m[0]) : null;
  }

  function dashNull(text) {
    const t = String(text || "").trim();
    if (!t || t === "-") return null;
    return t;
  }

  const KEY_TD = {
    field_length: "le",
    field_creationdate: "wby",
    field_abirth: "aby",
    field_statustld_registered: "reg",
    field_changes: "dropped",
    field_whois: "status",
  };

  function listingFromCells(fqdn, cells, other, meta) {
    const addDate = dashNull(cells.field_adddate);
    const dropped = dashNull(cells.field_changes);
    return {
      fqdn,
      le: firstNumber(cells.field_length),
      wby: dashNull(cells.field_creationdate),
      aby: dashNull(cells.field_abirth),
      reg: firstNumber(cells.field_statustld_registered),
      dropped,
      status: dashNull(cells.field_whois),
      drop_date: addDate || dropped,
      other: other && typeof other === "object" ? other : {},
      savedsearch_id: (meta && meta.savedsearch_id) || null,
      savedsearch_name: (meta && meta.savedsearch_name) || null,
      source_url: (meta && meta.source_url) || "",
    };
  }

  function decodeText(html) {
    return String(html || "")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();
  }

  function classOf(tagOpen) {
    const m = String(tagOpen || "").match(/\bclass=["']([^"']+)["']/i);
    return m ? m[1] : "";
  }

  function listingsFromHtml(html, meta) {
    const out = [];
    const seen = new Set();
    const trRe = /<tr\b[\s\S]*?<\/tr>/gi;
    let tr;
    while ((tr = trRe.exec(String(html || "")))) {
      const row = tr[0];
      const link = row.match(/<a\b[^>]*class=["'][^"']*\bnamelinks\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
      if (!link) continue;
      let fqdn = decodeText(link[1]).toLowerCase().replace(/^www\./, "").split(/\s+/)[0];
      if (!fqdn.includes(".") || seen.has(fqdn)) continue;
      seen.add(fqdn);
      const cells = {};
      const other = {};
      const tdRe = /<td\b([^>]*)>([\s\S]*?)<\/td>/gi;
      let td;
      while ((td = tdRe.exec(row))) {
        const cls = (classOf(td[1]).split(/\s+/).find((c) => c.startsWith("field_")) || "");
        if (!cls || cls === "field_domain") continue;
        const text = dashNull(decodeText(td[2]));
        cells[cls] = text;
        if (!KEY_TD[cls] && text) other[cls.replace(/^field_/, "")] = text;
      }
      out.push(listingFromCells(fqdn, cells, other, meta || {}));
    }
    return out;
  }

  function listingsFromTable(doc, meta) {
    const root = doc || (typeof document !== "undefined" ? document : null);
    const table = root && root.querySelector ? root.querySelector("table.base1") : null;
    const html = table ? table.outerHTML : "";
    const source_url =
      (meta && meta.source_url) || (typeof location !== "undefined" ? location.href : "");
    return listingsFromHtml(html, { ...(meta || {}), source_url });
  }

  function parseMenu(html) {
    const out = [];
    const seen = new Set();
    const re =
      /<a\s[^>]*href=["']([^"']*savedsearches\/goto\/(\d+)\/?)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = re.exec(String(html || "")))) {
      const id = m[2];
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const href = m[1];
      const name = decodeText(m[3]).replace(/^[➥\s]+/u, "").trim();
      out.push({ id, name, href });
    }
    return out;
  }

  function listingUrl(run, currentHref, origin) {
    const search = run && run.searches && run.searches[run.searchIndex];
    if (!search) return null;
    if ((run.pageIndex || 0) === 0) {
      return new URL(search.href, origin || "https://member.expireddomains.net").href;
    }
    const u = new URL(
      currentHref || origin || "https://member.expireddomains.net/domains/combinedexpired/",
    );
    u.searchParams.set("savedsearch_id", search.id);
    u.searchParams.set("start", String(run.pageIndex * 200));
    u.hash = "listing";
    return u.href;
  }

  function isListingPath(pathname) {
    return /\/domains\/combinedexpired/.test(String(pathname || ""));
  }

  const api = {
    KEY_TD,
    firstNumber,
    dashNull,
    listingFromCells,
    listingsFromHtml,
    listingsFromTable,
    parseMenu,
    listingUrl,
    isListingPath,
  };
  root.UsListings = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
