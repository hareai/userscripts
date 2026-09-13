(function (root) {
  "use strict";

  const DEFAULTS = {
    staySec: 20,
    gapSec: 8,
    sessionsPerDay: 3,
    topicsPerSession: 1,
    likeCap: 2,
    likeMin: 0,
  };

  function clampNum(v, min, max, fallback) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function isList(pathname) {
    const p = String(pathname || "").replace(/\/+$/, "") || "/";
    return (
      p === "/" ||
      p === "/latest" ||
      p.startsWith("/latest/") ||
      p === "/unseen" ||
      p.startsWith("/unseen/")
    );
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
    const sibling =
      btn.parentElement && btn.parentElement.querySelector
        ? btn.parentElement.querySelector(".count, .like-count")
        : null;
    if (sibling && /\d/.test(sibling.textContent || "")) {
      return Number(String(sibling.textContent).replace(/\D/g, ""));
    }
    const text = String(btn.textContent || "").replace(/\D/g, "");
    return text ? Number(text) : 0;
  }

  function csrfFromDoc(doc) {
    const el = doc && typeof doc.querySelector === "function" ? doc.querySelector('meta[name="csrf-token"]') : null;
    if (!el) return "";
    const attr = el.getAttribute ? el.getAttribute("content") : el.content;
    return String(attr || "").trim();
  }

  function jsonHeaders(csrf) {
    const headers = { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" };
    if (csrf) headers["X-CSRF-Token"] = csrf;
    return headers;
  }

  function firstPost(topicJson) {
    const posts = topicJson && topicJson.post_stream && topicJson.post_stream.posts;
    return Array.isArray(posts) && posts[0] ? posts[0] : null;
  }

  function likeAction(post) {
    const list = post && Array.isArray(post.actions_summary) ? post.actions_summary : [];
    for (const item of list) {
      if (Number(item && item.id) === 2) return item;
    }
    return null;
  }

  function alreadyLiked(post) {
    if (post && post.current_user_reaction) return true;
    const action = likeAction(post);
    return Boolean(action && action.acted);
  }

  function canLike(post) {
    const action = likeAction(post);
    return Boolean(action && action.can_act);
  }

  function likeCountOf(post) {
    const action = likeAction(post);
    if (action && Number.isFinite(Number(action.count))) return Number(action.count);
    const n = Number(post && post.like_count);
    return Number.isFinite(n) ? n : 0;
  }

  async function fetchTopic(topicId, headers, fetchFn) {
    const f = fetchFn || fetch;
    const res = await f("/t/" + topicId + ".json", { credentials: "same-origin", headers: headers || {} });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  }

  async function postLike(postId, headers, fetchFn) {
    const f = fetchFn || fetch;
    const res = await f("/post_actions.json", {
      method: "POST",
      credentials: "same-origin",
      headers: { ...(headers || {}), "Content-Type": "application/json" },
      body: JSON.stringify({ id: postId, post_action_type_id: 2 }),
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  }

  function likeOk(status) {
    return Number(status) >= 200 && Number(status) < 300;
  }

  function loggedIn(rootEl) {
    const doc = rootEl || (typeof document !== "undefined" ? document : null);
    if (!doc || typeof doc.querySelector !== "function") return false;
    return Boolean(
      doc.querySelector(
        "#current-user, .header-dropdown-toggle.current-user, button.user-menu-trigger",
      ),
    );
  }

  const api = {
    DEFAULTS,
    clampNum,
    isList,
    isTopic,
    topicId,
    likeCount,
    loggedIn,
    csrfFromDoc,
    jsonHeaders,
    firstPost,
    likeAction,
    alreadyLiked,
    canLike,
    likeCountOf,
    fetchTopic,
    postLike,
    likeOk,
  };
  root.UsLinuxdo = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
