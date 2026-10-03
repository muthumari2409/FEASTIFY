/* =====================================================================
   FEASTIFY - api.js
   Shared by EVERY page (customer and admin). Load it first.
   - api()           : talks to the Flask backend
   - image fallback  : local image -> online image -> branded placeholder
   - toast()         : small pop-up messages
   - format helpers  : dates, times, escaping
   ===================================================================== */
(function () {
  "use strict";

  /* ---------- 1. Image fallback ----------
     <img src="static/images/food1.jpg" data-fallback="https://...">
     If your own file is missing, the online image is used. If that also
     fails, a Feastify placeholder is shown - so no broken image icons. */
  const PLACEHOLDER =
    "data:image/svg+xml;charset=UTF-8," +
    encodeURIComponent(
      "<svg xmlns='http://www.w3.org/2000/svg' width='800' height='600' viewBox='0 0 800 600'>" +
        "<rect width='800' height='600' fill='#173b30'/>" +
        "<circle cx='400' cy='300' r='150' fill='none' stroke='#e3a13a' stroke-opacity='.35' stroke-width='2'/>" +
        "<text x='400' y='312' font-family='Georgia,serif' font-size='42' fill='#e3a13a' text-anchor='middle' letter-spacing='8'>FEASTIFY</text>" +
      "</svg>"
    );

  window.addEventListener(
    "error",
    function (event) {
      const img = event.target;
      if (!img || img.tagName !== "IMG") return;
      const fallback = img.getAttribute("data-fallback");
      if (fallback && !img.dataset.triedFallback) {
        img.dataset.triedFallback = "1";
        img.src = fallback;
        return;
      }
      if (!img.dataset.placeholder) {
        img.dataset.placeholder = "1";
        img.src = PLACEHOLDER;
      }
    },
    true
  );

  /* ---------- Traffic source (Instagram tracking) ----------
     A link like https://your-site/?from=instagram (or opening the site from
     inside the Instagram app) marks this browser as "instagram" for 7 days.
     Every API call then tells the backend where the visitor came from. */
  const SOURCE_KEY = "feastify_source";
  function trafficSource() {
    try {
      const params = new URLSearchParams(location.search);
      let src = (params.get("from") || params.get("utm_source") || "").toLowerCase();
      if (!src && (/instagram/i.test(navigator.userAgent) || /instagram\.com/i.test(document.referrer))) src = "instagram";
      if (/^[a-z0-9_-]{1,30}$/.test(src)) {
        localStorage.setItem(SOURCE_KEY, JSON.stringify({ src, at: Date.now() }));
        return src;
      }
      const saved = JSON.parse(localStorage.getItem(SOURCE_KEY) || "null");
      if (saved && Date.now() - saved.at < 7 * 86400000) return saved.src;
    } catch (_) { /* storage blocked */ }
    return "";
  }
  trafficSource(); // remember it as soon as the page opens

  /* ---------- 2. API helper ---------- */
  async function api(path, options = {}) {
    const request = {
      method: options.method || "GET",
      headers: { Accept: "application/json" },
      credentials: "same-origin", // sends the HttpOnly login cookie
    };
    const src = trafficSource();
    if (src) request.headers["X-Feastify-Source"] = src;
    if (options.body !== undefined) {
      request.headers["Content-Type"] = "application/json";
      request.body = JSON.stringify(options.body);
    }

    let response;
    try {
      response = await fetch(path, request);
    } catch (networkError) {
      throw new Error("Cannot reach the Feastify server. Make sure 'python app.py' is running.");
    }

    let data = {};
    try {
      data = await response.json();
    } catch (_) {
      /* response was not JSON */
    }

    if (!response.ok || data.success === false) {
      const err = new Error(data.message || "Request failed (" + response.status + ").");
      err.status = response.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  /* ---------- 3. Safety: escape text before putting it in HTML ---------- */
  function escapeHtml(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* ---------- 4. Toast messages ---------- */
  function ensureToastArea() {
    let area = document.getElementById("fst-toasts");
    if (area) return area;
    const style = document.createElement("style");
    style.textContent =
      "#fst-toasts{position:fixed;right:1rem;bottom:1rem;z-index:4000;display:flex;flex-direction:column;gap:.6rem;max-width:min(380px,calc(100vw - 2rem))}" +
      ".fst-toast{display:flex;gap:.75rem;align-items:flex-start;background:#fffcf6;color:#1d2622;border-radius:14px;padding:.9rem 1rem;" +
      "box-shadow:0 18px 40px -18px rgba(15,42,34,.55);border-left:5px solid #2f7d57;font-size:.95rem;animation:fstIn .25s ease}" +
      ".fst-toast.error{border-left-color:#b4432d}.fst-toast.info{border-left-color:#e3a13a}" +
      ".fst-toast i{margin-top:.2rem}.fst-toast.success i{color:#2f7d57}.fst-toast.error i{color:#b4432d}.fst-toast.info i{color:#c9821c}" +
      "@keyframes fstIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}";
    document.head.appendChild(style);
    area = document.createElement("div");
    area.id = "fst-toasts";
    area.setAttribute("role", "status");
    area.setAttribute("aria-live", "polite");
    document.body.appendChild(area);
    return area;
  }

  function toast(message, type = "success", ms = 4200) {
    const icons = { success: "fa-circle-check", error: "fa-circle-exclamation", info: "fa-circle-info" };
    const item = document.createElement("div");
    item.className = "fst-toast " + type;
    item.innerHTML = '<i class="fa-solid ' + (icons[type] || icons.info) + '"></i><div>' + escapeHtml(message) + "</div>";
    ensureToastArea().appendChild(item);
    setTimeout(() => item.remove(), ms);
  }

  /* ---------- 5. Formatting helpers ---------- */
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  function parseYmd(ymd) {
    const [y, m, d] = String(ymd).split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  function fmtDate(ymd) {
    if (!ymd) return "-";
    const d = parseYmd(ymd);
    return DAYS[d.getDay()] + ", " + d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear();
  }
  function fmtTime(hm) {
    if (!hm) return "-";
    const [h, m] = hm.split(":").map(Number);
    return ((h % 12) || 12) + ":" + String(m).padStart(2, "0") + (h < 12 ? " AM" : " PM");
  }
  function fmtDateTime(iso) {
    if (!iso) return "-";
    const d = new Date(iso);
    return d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear() + ", " +
      d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  function relativeDay(iso) {
    if (!iso) return "Never";
    const d = new Date(iso);
    const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((start(new Date()) - start(d)) / 86400000);
    if (diff === 0) return "Today, " + d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    if (diff === 1) return "Yesterday";
    if (diff < 7) return diff + " days ago";
    return d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear();
  }
  function localToday() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function initials(name) {
    return String(name || "?").trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  }
  function firstName(name) {
    return String(name || "").trim().split(/\s+/)[0];
  }
  function setLoading(button, isLoading, text) {
    if (!button) return;
    if (isLoading) {
      button.dataset.originalText = button.innerHTML;
      button.disabled = true;
      button.innerHTML = '<span class="spinner-border me-2" role="status" aria-hidden="true"></span>' + (text || "Please wait...");
    } else {
      button.disabled = false;
      if (button.dataset.originalText) button.innerHTML = button.dataset.originalText;
    }
  }
  function showAlert(el, message, type = "error") {
    if (!el) return;
    el.className = "form-alert show " + type;
    el.textContent = message;
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  function hideAlert(el) {
    if (el) el.className = "form-alert";
  }

  window.FeastifyAPI = {
    api, escapeHtml, toast, fmtDate, fmtTime, fmtDateTime, relativeDay, localToday,
    initials, firstName, setLoading, showAlert, hideAlert, parseYmd, MONTHS,
  };
})();