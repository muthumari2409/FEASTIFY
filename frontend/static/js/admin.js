/* =====================================================================
   FEASTIFY - admin.js
   Used by: admin-dashboard.html, admin-bookings.html,
            admin-customers.html, admin-analytics.html
   1. Access guard   - asks the backend (/api/admin/me) if you are an admin.
                       If not: "Unauthorized access" + redirect to admin login.
   2. Sidebar        - built here so it is identical on every admin page.
   3. Dashboard      - summary cards, mini chart, recent bookings/visitors.
   4. Bookings       - filter, search, view, confirm, complete, cancel.
   5. Customers      - registered customers, visitor sessions, messages.
   (Analytics charts live in analytics.js.)
   NOTE: admin pages never load main.js, so admins are never counted as visitors.
   ===================================================================== */
(function () {
  "use strict";
  const F = window.FeastifyAPI;
  const esc = F.escapeHtml;
  const PAGE = document.body.dataset.adminPage || "";

  let resolveReady;
  const ready = new Promise((r) => (resolveReady = r));
  window.FeastifyAdmin = { ready, statusBadge, openBooking, setUpdated };

  /* ------------------------------------------------ 1. access guard */
  async function guard() {
    try {
      const data = await F.api("/api/admin/me");
      renderSidebar(data.admin);
      document.getElementById("authOverlay")?.classList.add("hidden");
      resolveReady(data.admin);
      return data.admin;
    } catch (err) {
      alert("Unauthorized access");
      location.replace("admin-login.html?error=unauthorized");
      return null;
    }
  }

  /* ------------------------------------------------ 2. sidebar */
  function renderSidebar(admin) {
    const box = document.getElementById("adminSidebar");
    if (!box) return;
    const links = [
      ["dashboard", "admin-dashboard.html", "fa-gauge-high", "Dashboard"],
      ["bookings", "admin-bookings.html", "fa-calendar-check", "Bookings"],
      ["customers", "admin-customers.html", "fa-users", "Customers"],
      ["analytics", "admin-analytics.html", "fa-chart-line", "Analytics"],
      ["reviews", "admin-reviews.html", "fa-star", "Reviews"],
    ];
    box.innerHTML = `
      <a class="admin-brand" href="admin-dashboard.html"><i class="fa-solid fa-utensils"></i>FEASTIFY
        <small>Restaurant management</small></a>
      <ul class="side-nav">
        ${links.map(([key, href, icon, label]) => `
          <li><a href="${href}" class="${PAGE === key ? "active" : ""}" ${PAGE === key ? 'aria-current="page"' : ""}>
            <i class="fa-solid ${icon}"></i>${label}</a></li>`).join("")}
        <li class="sep" role="separator"></li>
        <li><a href="index.html" target="_blank" rel="noopener"><i class="fa-solid fa-arrow-up-right-from-square"></i>View website</a></li>
        <li><button type="button" id="adminLogout"><i class="fa-solid fa-right-from-bracket"></i>Logout</button></li>
      </ul>
      <div class="side-foot">
        <div class="av">${esc(F.initials(admin.username))}</div>
        <div><strong>${esc(admin.username)}</strong><span>Administrator</span></div>
      </div>`;

    document.getElementById("adminLogout").addEventListener("click", logout);

    // Mobile sidebar
    const toggle = document.getElementById("menuToggle");
    const backdrop = document.getElementById("sidebarBackdrop");
    const close = () => { box.classList.remove("open"); backdrop?.classList.remove("show"); };
    toggle?.addEventListener("click", () => { box.classList.add("open"); backdrop?.classList.add("show"); });
    backdrop?.addEventListener("click", close);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  }

  async function logout() {
    try { await F.api("/api/admin/logout", { method: "POST" }); } catch (_) { /* ignore */ }
    location.replace("admin-login.html");
  }

  /* ------------------------------------------------ shared helpers */
  function statusBadge(status) {
    const icons = { Pending: "fa-hourglass-half", Confirmed: "fa-circle-check", Completed: "fa-flag-checkered", Cancelled: "fa-ban" };
    return `<span class="status-badge status-${esc(status)}"><i class="fa-solid ${icons[status] || "fa-circle"}"></i>${esc(status)}</span>`;
  }

  function setUpdated() {
    const el = document.getElementById("updatedAt");
    if (el) el.textContent = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
  }

  function person(name, sub) {
    return `<div class="person"><div class="av">${esc(F.initials(name))}</div>
      <div><strong>${esc(name)}</strong>${sub ? `<span class="muted">${esc(sub)}</span>` : ""}</div></div>`;
  }

  function actionButtons(b) {
    const s = b.status;
    return `<div class="row-actions">
      <button class="act view" data-act="view" data-id="${b.id}" title="View details" aria-label="View booking ${esc(b.booking_ref)}"><i class="fa-solid fa-eye"></i></button>
      <button class="act confirm" data-act="Confirmed" data-id="${b.id}" title="Confirm" aria-label="Confirm booking" ${s === "Pending" ? "" : "disabled"}><i class="fa-solid fa-check"></i></button>
      <button class="act complete" data-act="Completed" data-id="${b.id}" title="Mark completed" aria-label="Mark completed" ${s === "Pending" || s === "Confirmed" ? "" : "disabled"}><i class="fa-solid fa-flag-checkered"></i></button>
      <button class="act cancel" data-act="Cancelled" data-id="${b.id}" title="Cancel" aria-label="Cancel booking" ${s === "Pending" || s === "Confirmed" ? "" : "disabled"}><i class="fa-solid fa-xmark"></i></button>
    </div>`;
  }

  // One click handler for every table that shows action buttons
  function wireActions(container, reload) {
    container.addEventListener("click", async (e) => {
      const btn = e.target.closest("button[data-act]");
      if (!btn || btn.disabled) return;
      const id = btn.dataset.id;
      const act = btn.dataset.act;
      if (act === "view") return openBooking(id, reload);
      await changeStatus(id, act, reload);
    });
  }

  async function changeStatus(id, status, reload) {
    const verbs = { Confirmed: "confirm", Completed: "mark as completed", Cancelled: "cancel", Pending: "move back to pending" };
    if (!confirm(`Are you sure you want to ${verbs[status] || "update"} this booking?`)) return false;
    try {
      const data = await F.api(`/api/admin/bookings/${encodeURIComponent(id)}/status`, { method: "PUT", body: { status } });
      F.toast(data.message || "Booking updated.");
      if (reload) await reload();
      return true;
    } catch (err) {
      F.toast(err.message, "error");
      return false;
    }
  }

  let modal;
  async function openBooking(id, reload) {
    const el = document.getElementById("bookingModal");
    if (!el) return;
    modal = modal || new bootstrap.Modal(el);
    const body = document.getElementById("bookingModalBody");
    const foot = document.getElementById("bookingModalFoot");
    body.innerHTML = '<p class="text-center text-muted my-4"><span class="spinner-border spinner-border-sm me-2"></span>Loading...</p>';
    foot.innerHTML = "";
    modal.show();
    try {
      const { booking: b } = await F.api(`/api/admin/bookings/${encodeURIComponent(id)}`);
      body.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-3">
          <div><span class="muted small">Booking ID</span><h3 class="h4 mb-0">${esc(b.booking_ref)}</h3></div>
          ${statusBadge(b.status)}
        </div>
        <ul class="detail-list">
          <li><span>Customer</span><strong>${esc(b.customer_name)}</strong></li>
          <li><span>Email</span><strong>${esc(b.email)}</strong></li>
          <li><span>Phone</span><strong>${esc(b.phone)}</strong></li>
          <li><span>Date</span><strong>${esc(F.fmtDate(b.date))}</strong></li>
          <li><span>Time</span><strong>${esc(F.fmtTime(b.time))}</strong></li>
          <li><span>Guests</span><strong>${esc(b.guests)}</strong></li>
          <li><span>Table</span><strong>Table ${esc(b.table_number)} &middot; ${esc(b.table_name)} (${esc(b.table_seats)} seats)</strong></li>
          <li><span>Special request</span><strong>${esc(b.special_request || "None")}</strong></li>
          <li><span>Booked on</span><strong>${esc(F.fmtDateTime(b.created_at))}</strong></li>
          ${b.updated_by ? `<li><span>Last updated</span><strong>${esc(F.fmtDateTime(b.updated_at))} by ${esc(b.updated_by)}</strong></li>` : ""}
        </ul>`;
      const can = (s) => (s === "Confirmed" ? b.status === "Pending" : ["Pending", "Confirmed"].includes(b.status));
      foot.innerHTML = `
        <button class="btn btn-soft" data-bs-dismiss="modal">Close</button>
        ${can("Cancelled") ? '<button class="btn btn-outline-danger" data-set="Cancelled"><i class="fa-solid fa-xmark me-1"></i>Cancel</button>' : ""}
        ${can("Completed") ? '<button class="btn btn-leaf" data-set="Completed"><i class="fa-solid fa-flag-checkered me-1"></i>Complete</button>' : ""}
        ${can("Confirmed") ? '<button class="btn btn-saffron" data-set="Confirmed"><i class="fa-solid fa-check me-1"></i>Confirm</button>' : ""}`;
      foot.querySelectorAll("[data-set]").forEach((btn) =>
        btn.addEventListener("click", async () => {
          if (await changeStatus(b.id, btn.dataset.set, reload)) modal.hide();
        })
      );
    } catch (err) {
      body.innerHTML = `<p class="text-danger my-4 text-center">${esc(err.message)}</p>`;
      foot.innerHTML = '<button class="btn btn-soft" data-bs-dismiss="modal">Close</button>';
    }
  }

  function handleAuthError(err) {
    if (err.status === 401 || err.status === 403) {
      alert("Unauthorized access");
      location.replace("admin-login.html?error=unauthorized");
      return true;
    }
    return false;
  }

  /* ------------------------------------------------ 3. dashboard */
  let miniChart;
  async function loadDashboard() {
    try {
      const [{ analytics: a }, { bookings }, { visits }] = await Promise.all([
        F.api("/api/admin/analytics"),
        F.api("/api/admin/bookings?limit=6"),
        F.api("/api/admin/visits?limit=8"),
      ]);

      document.querySelectorAll("[data-stat]").forEach((el) => {
        const v = a.summary[el.dataset.stat];
        el.textContent = v === undefined ? "0" : Number(v).toLocaleString();
      });

      const tbody = document.getElementById("recentBookings");
      tbody.innerHTML = bookings.length
        ? bookings.map((b) => `<tr>
            <td class="ref">${esc(b.booking_ref)}</td>
            <td>${person(b.customer_name, b.email)}</td>
            <td>${esc(F.fmtDate(b.date))}<div class="muted">${esc(F.fmtTime(b.time))}</div></td>
            <td>Table ${esc(b.table_number)}<div class="muted">${esc(b.guests)} guests</div></td>
            <td>${statusBadge(b.status)}</td>
            <td>${actionButtons(b)}</td></tr>`).join("")
        : '<tr class="empty-row"><td colspan="6"><i class="fa-regular fa-calendar me-2"></i>No bookings yet. They will appear here as soon as customers book.</td></tr>';

      const vbox = document.getElementById("recentVisitors");
      vbox.innerHTML = visits.length
        ? visits.map((v) => `<div class="visit-item">
            ${person(v.visitor_name, v.visitor_email || "Not signed in")}
            <span class="when">${esc(F.relativeDay(v.last_seen))}<br>${esc(v.page_views)} page${v.page_views === 1 ? "" : "s"}</span></div>`).join("")
        : '<p class="text-muted text-center my-4">No customer visits recorded yet.</p>';

      drawMini(a);
      setUpdated();
    } catch (err) {
      if (!handleAuthError(err)) F.toast(err.message, "error");
    }
  }

  function drawMini(a) {
    const canvas = document.getElementById("miniChart");
    if (!canvas || !window.Chart) return;
    const labels = a.visits.daily.labels.map((l) => l.split(" ").slice(0, 2).join(" "));
    const datasets = [
      { label: "Website visits", data: a.visits.daily.data, borderColor: "#173b30", backgroundColor: "rgba(23,59,48,.12)", fill: true, tension: .35, pointRadius: 3 },
      { label: "Bookings made", data: a.bookings.daily.data, borderColor: "#e3a13a", backgroundColor: "rgba(227,161,58,.15)", fill: true, tension: .35, pointRadius: 3 },
    ];
    if (miniChart) {
      miniChart.data.labels = labels;
      miniChart.data.datasets.forEach((d, i) => (d.data = datasets[i].data));
      miniChart.update();
      return;
    }
    miniChart = new Chart(canvas, {
      type: "line",
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
        plugins: { legend: { position: "bottom", labels: { usePointStyle: true, font: { family: "DM Sans" } } } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: "#eee7da" } }, x: { grid: { display: false } } },
      },
    });
  }

  function initDashboard() {
    const reload = loadDashboard;
    wireActions(document.getElementById("recentBookings"), reload);
    document.getElementById("refreshBtn")?.addEventListener("click", reload);
    const hour = new Date().getHours();
    const g = document.getElementById("greeting");
    if (g) g.textContent = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    reload();
    setInterval(() => { if (!document.hidden) reload(); }, 30000);
  }

  /* ------------------------------------------------ 4. bookings */
  function initBookings() {
    const state = { status: "", date: "", q: "" };
    const tabs = document.getElementById("statusTabs");
    const tbody = document.getElementById("bookingsBody");
    const dateIn = document.getElementById("filterDate");
    const searchIn = document.getElementById("searchInput");
    const countEl = document.getElementById("resultCount");

    async function load() {
      const params = new URLSearchParams();
      if (state.status) params.set("status", state.status);
      if (state.date) params.set("date", state.date);
      if (state.q) params.set("q", state.q);
      try {
        const { bookings, counts } = await F.api("/api/admin/bookings?" + params.toString());
        const all = Object.values(counts).reduce((a, b) => a + b, 0);
        tabs.querySelectorAll("button").forEach((btn) => {
          const s = btn.dataset.status;
          btn.querySelector(".n").textContent = s ? counts[s] || 0 : all;
          btn.classList.toggle("active", s === state.status);
        });
        countEl.textContent = `${bookings.length} booking${bookings.length === 1 ? "" : "s"} shown`;
        tbody.innerHTML = bookings.length
          ? bookings.map((b) => `<tr>
              <td class="ref">${esc(b.booking_ref)}</td>
              <td>${person(b.customer_name)}</td>
              <td>${esc(b.email)}</td>
              <td class="text-nowrap">${esc(b.phone)}</td>
              <td class="text-nowrap">${esc(F.fmtDate(b.date))}</td>
              <td class="text-nowrap">${esc(F.fmtTime(b.time))}</td>
              <td>${esc(b.guests)}</td>
              <td class="text-nowrap">Table ${esc(b.table_number)}<div class="muted">${esc(b.table_seats)} seats</div></td>
              <td>${statusBadge(b.status)}</td>
              <td class="text-nowrap muted">${esc(F.fmtDateTime(b.created_at))}</td>
              <td>${actionButtons(b)}</td></tr>`).join("")
          : '<tr class="empty-row"><td colspan="11"><i class="fa-solid fa-filter-circle-xmark me-2"></i>No bookings match these filters.</td></tr>';
        setUpdated();
      } catch (err) {
        if (!handleAuthError(err)) F.toast(err.message, "error");
      }
    }

    tabs.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      state.status = btn.dataset.status;
      load();
    });
    dateIn.addEventListener("change", () => { state.date = dateIn.value; load(); });
    let t;
    searchIn.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(() => { state.q = searchIn.value.trim(); load(); }, 300);
    });
    document.getElementById("todayBtn")?.addEventListener("click", () => { dateIn.value = F.localToday(); state.date = dateIn.value; load(); });
    document.getElementById("clearFilters")?.addEventListener("click", () => {
      state.status = ""; state.date = ""; state.q = "";
      dateIn.value = ""; searchIn.value = "";
      load();
    });
    document.getElementById("refreshBtn")?.addEventListener("click", load);
    wireActions(tbody, load);
    load();
    setInterval(() => { if (!document.hidden) load(); }, 30000);
  }

  /* ------------------------------------------------ 5. customers */
  function initCustomers() {
    const tbody = document.getElementById("customersBody");
    const searchIn = document.getElementById("customerSearch");
    const weekAgo = () => Date.now() - 7 * 86400000;

    async function loadCustomers() {
      const q = searchIn.value.trim();
      try {
        const { customers, total } = await F.api("/api/admin/customers" + (q ? "?q=" + encodeURIComponent(q) : ""));
        document.getElementById("cTotal").textContent = total.toLocaleString();
        if (!q) {
          document.getElementById("cActive").textContent =
            customers.filter((c) => c.last_visit && new Date(c.last_visit).getTime() >= weekAgo()).length;
          document.getElementById("cVisits").textContent =
            customers.reduce((sum, c) => sum + (c.visit_count || 0), 0).toLocaleString();
        }
        document.getElementById("customerCount").textContent =
          `${customers.length} customer${customers.length === 1 ? "" : "s"}${q ? " found" : ""}`;
        tbody.innerHTML = customers.length
          ? customers.map((c) => `<tr>
              <td>${person(c.name)}</td>
              <td>${esc(c.email)}</td>
              <td class="text-nowrap">${esc(c.phone || "-")}</td>
              <td><strong>${esc(c.visit_count || 0)}</strong></td>
              <td>${esc(c.bookings)}${c.cancelled_bookings ? `<div class="muted">${esc(c.cancelled_bookings)} cancelled</div>` : ""}</td>
              <td class="text-nowrap">${esc(F.relativeDay(c.last_visit))}</td>
              <td class="text-nowrap muted">${c.first_visit ? esc(F.fmtDateTime(c.first_visit)) : "-"}</td>
              <td class="text-nowrap muted">${esc(F.fmtDateTime(c.created_at))}</td></tr>`).join("")
          : `<tr class="empty-row"><td colspan="8"><i class="fa-regular fa-user me-2"></i>${q ? "No customers match your search." : "No customers have registered yet."}</td></tr>`;
        setUpdated();
      } catch (err) {
        if (!handleAuthError(err)) F.toast(err.message, "error");
      }
    }

    async function loadVisits() {
      try {
        const { visits } = await F.api("/api/admin/visits?limit=50");
        document.getElementById("cGuest").textContent = visits.filter((v) => !v.user_id).length;
        document.getElementById("visitsBody").innerHTML = visits.length
          ? visits.map((v) => `<tr>
              <td>${person(v.visitor_name, v.visitor_email || "")}</td>
              <td>${v.user_id ? '<span class="chip member">Customer</span>' : '<span class="chip">Guest</span>'}</td>
              <td class="text-nowrap">${esc(F.fmtDateTime(v.visit_date))}</td>
              <td class="text-nowrap">${esc(F.relativeDay(v.last_seen))}</td>
              <td>${esc(v.page_views)}</td>
              <td class="muted">${esc((v.pages || []).join(", "))}</td></tr>`).join("")
          : '<tr class="empty-row"><td colspan="6">No visits recorded yet. Open the customer website in another browser to create one.</td></tr>';
      } catch (err) {
        if (!handleAuthError(err)) F.toast(err.message, "error");
      }
    }

    async function loadMessages() {
      const box = document.getElementById("messagesList");
      if (!box) return;
      try {
        const { messages } = await F.api("/api/admin/messages?limit=20");
        box.innerHTML = messages.length
          ? messages.map((m) => `<div class="visit-item align-items-start">
              <div class="person"><div class="av">${esc(F.initials(m.name))}</div>
                <div><strong>${esc(m.subject || "Message")}</strong>
                <span class="muted">${esc(m.name)} &middot; ${esc(m.email)}</span>
                <p class="mb-0 mt-1 small">${esc(m.message)}</p></div></div>
              <span class="when">${esc(F.relativeDay(m.created_at))}</span></div>`).join("")
          : '<p class="text-muted text-center my-4">No contact messages yet.</p>';
      } catch (err) {
        box.innerHTML = `<p class="text-danger">${esc(err.message)}</p>`;
      }
    }

    const all = () => Promise.all([loadCustomers(), loadVisits(), loadMessages()]);
    let t;
    searchIn.addEventListener("input", () => { clearTimeout(t); t = setTimeout(loadCustomers, 300); });
    document.getElementById("refreshBtn")?.addEventListener("click", all);
    all();
    setInterval(() => { if (!document.hidden) all(); }, 30000);
  }

  /* ------------------------------------------------ start */
  document.addEventListener("DOMContentLoaded", async () => {
    const admin = await guard();
    if (!admin) return;
    document.querySelectorAll("[data-admin-name]").forEach((el) => (el.textContent = admin.username));
    if (PAGE === "dashboard") initDashboard();
    if (PAGE === "bookings") initBookings();
    if (PAGE === "customers") initCustomers();
  });
})();
