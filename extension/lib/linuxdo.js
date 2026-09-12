(function (root) {
  "use strict";

  const DEFAULTS = {
    enabled: false,
    staySec: 20,
    gapSec: 8,
    maxTopics: 5,
    likeCap: 0,
    likeMin: 0,
  };

  function clampNum(v, min, max, fallback) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function isList(pathname) {
    const p = String(pathname || "").replace(/\/+$/, "") || "/";
    return p === "/" || p === "/latest" || p.startsWith("/latest/");
  }

  function isTopic(pathname) {
    return /^\/t\//.test(String(pathname || ""));
  }

  function topicId(href, origin) {
    try {
      const path =
        href instanceof URL
          ? href.pathname
          : new URL(String(href), origin || "https://linux.do").pathname;
      const m = path.match(/^\/t\/[^/]+\/(\d+)/);
      return m ? m[1] : "";
    } catch {
      return "";
    }
  }

  function likeCount(btn) {
    if (!btn) return 0;
    const labeled = btn.getAttribute
      ? btn.getAttribute("aria-label") || btn.title || ""
      : btn.ariaLabel || btn.title || "";
    const n = String(labeled).match(/(\d+)/);
    if (n) return Number(n[1]);
    const sibling = btn.parentElement && btn.parentElement.querySelector
      ? btn.parentElement.querySelector(".count, .like-count")
      : null;
    if (sibling && /\d/.test(sibling.textContent || "")) {
      return Number(String(sibling.textContent).replace(/\D/g, ""));
    }
    const text = String(btn.textContent || "").replace(/\D/g, "");
    return text ? Number(text) : 0;
  }

  const api = { DEFAULTS, clampNum, isList, isTopic, topicId, likeCount };
  root.UsLinuxdo = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
