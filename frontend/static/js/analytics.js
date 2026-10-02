/* =====================================================================
   FEASTIFY - analytics.js  (admin-analytics.html only)
   Every chart is drawn from GET /api/admin/analytics, which calculates the
   numbers from MongoDB. Nothing here is hard-coded.
   Loads AFTER admin.js, and waits for the admin access check to pass.
   ===================================================================== */
(function () {
  "use strict";
  const F = window.FeastifyAPI;

  const C = {
    leaf: "#173b30", leafSoft: "#4f8a73", saffron: "#e3a13a", chili: "#b4432d",
    info: "#1e5a86", success: "#2f7d57", grid: "#eee7da",
  };
  const STATUS_COLORS = { Pending: C.saffron, Confirmed: C.info, Completed: C.success, Cancelled: C.chili };
  const charts = {};

  if (window.Chart) {
    Chart.defaults.font.family = '"DM Sans", "Segoe UI", sans-serif';
    Chart.defaults.color = "#5f6b64";
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
  }

  const axes = {
    y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: C.grid } },
    x: { grid: { display: false } },
  };
  const base = (extra = {}) => ({
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: { legend: { display: false } },
    ...extra,
  });

  // Create a chart the first time, then only update its data on refresh
  function draw(id, config) {
    const canvas = document.getElementById(id);
    if (!canvas || !window.Chart) return;
    if (charts[id]) {
      charts[id].data.labels = config.data.labels;
      charts[id].data.datasets.forEach((ds, i) => (ds.data = config.data.datasets[i].data));
      charts[id].update();
      return;
    }
    charts[id] = new Chart(canvas, config);
  }

  const line = (series, label, color) => ({
    type: "line",
    data: { labels: series.labels, datasets: [{ label, data: series.data, borderColor: color, backgroundColor: color + "22", fill: true, tension: .35, pointRadius: 4, pointBackgroundColor: color }] },
    options: base({ scales: axes }),
  });
  const bar = (series, label, color, horizontal = false) => ({
    type: "bar",
    data: { labels: series.labels, datasets: [{ label, data: series.data, backgroundColor: color, borderRadius: 8, maxBarThickness: 42 }] },
    options: base({ indexAxis: horizontal ? "y" : "x", scales: horizontal ? { x: axes.y, y: { grid: { display: false } } } : axes }),
  });

  const sum = (arr) => arr.reduce((a, b) => a + b, 0);

  function render(a) {
    // Summary cards
    document.querySelectorAll("[data-stat]").forEach((el) => {
      const v = a.summary[el.dataset.stat];
      el.textContent = v === undefined ? "0" : Number(v).toLocaleString();
    });
    const setText = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
    setText("weekVisits", sum(a.visits.daily.data).toLocaleString());
    setText("weekBookings", sum(a.bookings.daily.data).toLocaleString());
    setText("weekRegs", sum(a.customers.registrations_daily.data).toLocaleString());
    const done = a.bookings.status.data;
    const total = sum(done);
    const cancelled = done[a.bookings.status.labels.indexOf("Cancelled")] || 0;
    setText("cancelRate", total ? Math.round((cancelled / total) * 100) + "%" : "0%");

    // 1-3. Website visits (daily / weekly / monthly) - admins excluded by the backend
    draw("visitsDaily", line(a.visits.daily, "Visits", C.leaf));
    draw("visitsWeekly", bar(a.visits.weekly, "Visits (week starting)", C.leafSoft));
    draw("visitsMonthly", bar(a.visits.monthly, "Visits", C.leaf));

    // 4. Bookings made per day + monthly
    draw("bookingsDaily", bar(a.bookings.daily, "Bookings made", C.saffron));
    draw("bookingsMonthly", line(a.bookings.monthly, "Bookings", C.saffron));
    draw("bookingsUpcoming", bar(a.bookings.upcoming, "Reservations", C.info));

    // 5. Booking status doughnut
    draw("bookingStatus", {
      type: "doughnut",
      data: {
        labels: a.bookings.status.labels,
        datasets: [{ data: a.bookings.status.data, backgroundColor: a.bookings.status.labels.map((s) => STATUS_COLORS[s]), borderWidth: 3, borderColor: "#fff" }],
      },
      options: { responsive: true, maintainAspectRatio: false, cutout: "62%", plugins: { legend: { position: "bottom" } } },
    });
    const empty = document.getElementById("statusEmpty");
    if (empty) empty.hidden = total > 0;

    // 6. Total customers (cumulative) + 7. registrations
    draw("customerGrowth", line(a.customers.growth, "Total customers", C.success));
    draw("registrations", bar(a.customers.registrations_monthly, "New registrations", C.chili));
    draw("registrationsDaily", bar(a.customers.registrations_daily, "New registrations", C.chili));
    renderFood(a.food);
    // 8. Table popularity & busiest time slots
    draw("tablePopularity", bar(a.bookings.tables, "Bookings", C.leafSoft, true));
    const slots = { labels: a.bookings.slots.labels.map(F.fmtTime), data: a.bookings.slots.data };
    draw("timeSlots", bar(slots, "Bookings", C.saffron));
    const slotEmpty = document.getElementById("slotsEmpty");
    if (slotEmpty) slotEmpty.hidden = slots.data.length > 0;
  }
  function renderFood(f) {
    if (!f) return;
    const rupees = (n) => "\u20B9" + Number(n || 0).toLocaleString("en-IN");
    const setText = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
    setText("topDish", f.top_dish || "No orders yet");
    setText("topLunch", f.top_lunch || "-");
    setText("topDinner", f.top_dinner || "-");
    setText("foodRevenue", rupees(f.revenue));
    setText("foodHint", f.dishes_ordered + " dishes in " + f.preorder_bookings + " bookings");
    draw("topDishes", {
      type: "bar",
      data: {
        labels: f.labels,
        datasets: [
          { label: "Lunch", data: f.lunch, backgroundColor: C.saffron, borderRadius: 6, maxBarThickness: 26 },
          { label: "Dinner", data: f.dinner, backgroundColor: C.leaf, borderRadius: 6, maxBarThickness: 26 },
        ],
      },
      options: base({
        indexAxis: "y",
        plugins: { legend: { display: true, position: "bottom" } },
        scales: { x: { stacked: true, beginAtZero: true, ticks: { precision: 0 }, grid: { color: C.grid } },
                  y: { stacked: true, grid: { display: false } } },
      }),
    });
    const empty = document.getElementById("dishEmpty");
    if (empty) empty.hidden = f.labels.length > 0;
    const body = document.getElementById("dishTable");
    if (body) {
      body.innerHTML = f.table.length
        ? f.table.map((d, i) => "<tr><td>" + (i + 1) + "</td><td><strong>" + F.escapeHtml(d.name) + "</strong></td><td>" +
            d.lunch + "</td><td>" + d.dinner + "</td><td><strong>" + d.total + "</strong></td><td>" + rupees(d.revenue) + "</td></tr>").join("")
        : '<tr class="empty-row"><td colspan="6">No food pre-orders yet.</td></tr>';
    }
  }

  async function load() {
    const btn = document.getElementById("refreshBtn");
    btn?.classList.add("disabled");
    try {
      const { analytics } = await F.api("/api/admin/analytics");
      render(analytics);
      window.FeastifyAdmin.setUpdated();
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        alert("Unauthorized access");
        location.replace("admin-login.html?error=unauthorized");
        return;
      }
      F.toast(err.message, "error");
    } finally {
      btn?.classList.remove("disabled");
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    if (!window.Chart) {
      F.toast("Chart.js could not load. Check your internet connection.", "error");
    }
    await window.FeastifyAdmin.ready; // only runs after the admin check passes
    document.getElementById("refreshBtn")?.addEventListener("click", load);
    load();
    setInterval(() => { if (!document.hidden) load(); }, 60000);
  });
})();
