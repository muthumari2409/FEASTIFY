/* =====================================================================
   FEASTIFY - booking.js
   booking.html     : live table availability + booking form + food pre-order
   my-bookings.html : the logged-in customer's own bookings + cancel
   The backend makes the final decision; this file only shows the state.
   ===================================================================== */
(function () {
  "use strict";
  const F = window.FeastifyAPI;
  const { api, escapeHtml, toast } = F;
  const REFRESH_MS = 15000; // re-check availability every 15 seconds
  const rupees = (n) => "\u20B9" + Number(n || 0).toLocaleString("en-IN");

  // Food pre-order lines, e.g. "2 x Dum Biryani, 1 x Masala Chai"
  function foodLines(b) {
    return (b.preorder_items || []).map((i) => i.qty + " x " + escapeHtml(i.name)).join(", ");
  }

  /* ================================================================ BOOKING PAGE */
  async function initBookingPage(user) {
    const form = document.getElementById("bookingForm");
    if (!form || !user) return;

    const alertBox = document.getElementById("bookingAlert");
    const grid = document.getElementById("tableGrid");
    const liveStatus = document.getElementById("liveStatus");
    const summary = document.getElementById("bookingSummary");
    let selectedTable = null;
    let timer = null;
    let lastKey = "";
    // dish id -> quantity (food pre-order). Starts with dishes picked on the Menu page.
        const CART_KEY = "feastify_preorder_" + user.id; // this customer's own basket
    let cart = {};
    try { cart = JSON.parse(localStorage.getItem(CART_KEY)) || {}; } catch (_) { cart = {}; }
    const saveCart = () => { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (_) { /* ignore */ } };
    let menu = [];

    // prefill from the logged-in account (name comes from the backend, never hard-coded)
    form.customer_name.value = user.name;
    form.email.value = user.email;
    form.phone.value = user.phone || "";

    // time slots + date limits from the backend
    let meta;
    try {
      meta = await api("/api/tables");
    } catch (err) {
      F.showAlert(alertBox, err.message);
      return;
    }
    form.date.min = meta.today;
    const max = F.parseYmd(meta.today);
    max.setDate(max.getDate() + meta.max_advance_days);
    form.date.max = max.getFullYear() + "-" + String(max.getMonth() + 1).padStart(2, "0") + "-" + String(max.getDate()).padStart(2, "0");
    form.time.innerHTML = '<option value="">Choose a time</option>' +
      meta.time_slots.map((s) => '<option value="' + s.value + '">' + s.label + "</option>").join("");
    form.guests.innerHTML = '<option value="">Guests</option>' +
      Array.from({ length: meta.max_guests }, (_, i) =>
        '<option value="' + (i + 1) + '">' + (i + 1) + (i ? " guests" : " guest") + "</option>").join("");
    form.guests.value = "2";

    const preset = new URLSearchParams(location.search).get("date");
    form.date.value = preset && preset >= meta.today ? preset : meta.today;

    // Disable time slots that have already passed today and pick the next free slot
    function refreshTimeOptions() {
      const isToday = form.date.value === meta.today;
      let firstOk = null;
      Array.from(form.time.options).forEach((o) => {
        if (!o.value) return;
        const past = isToday && o.value <= meta.now_time;
        o.disabled = past;
        o.textContent = o.textContent.replace(" (passed)", "") + (past ? " (passed)" : "");
        if (!past && !firstOk) firstOk = o.value;
      });
      if (!firstOk && isToday) {
        // every slot today is over -> move to tomorrow
        const t = F.parseYmd(meta.today);
        t.setDate(t.getDate() + 1);
        form.date.value = t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0");
        return refreshTimeOptions();
      }
      const current = form.time.selectedOptions[0];
      if (!form.time.value || (current && current.disabled)) form.time.value = firstOk || "";
    }
    refreshTimeOptions();
    form.date.addEventListener("change", refreshTimeOptions);

    /* ---------- STEP 3: food pre-order ---------- */
    const preTabs = document.getElementById("preorderTabs");
    const preList = document.getElementById("preorderList");
    let activeCat = "";

    function cartTotals() {
      let count = 0, total = 0;
      menu.forEach((d) => { const q = cart[d.id] || 0; count += q; total += q * d.price; });
      return { count, total };
    }

    function renderCartTotal() {
      const { count, total } = cartTotals();
      document.getElementById("preorderCount").textContent =
        count ? count + (count === 1 ? " dish" : " dishes") + " pre-ordered" : "No dishes selected";
      document.getElementById("preorderAmount").textContent = rupees(total);
      document.getElementById("preorderTotal").classList.toggle("has-items", count > 0);
      updateSummary();
    }

    function renderMenu() {
      const cats = [...new Set(menu.map((d) => d.category))];
      if (!activeCat) activeCat = cats[0];
      preTabs.innerHTML = cats.map((c) => {
        const n = menu.filter((d) => d.category === c).reduce((a, d) => a + (cart[d.id] || 0), 0);
        return '<button type="button" data-cat="' + escapeHtml(c) + '" class="' + (c === activeCat ? "active" : "") + '">' +
          escapeHtml(c) + (n ? ' <span class="n">' + n + "</span>" : "") + "</button>";
      }).join("");
      preList.innerHTML = menu.filter((d) => d.category === activeCat).map((d) => {
        const q = cart[d.id] || 0;
        return '<div class="dish-row' + (q ? " picked" : "") + '">' +
          '<span class="veg-dot ' + (d.veg ? "veg" : "nonveg") + '" title="' + (d.veg ? "Vegetarian" : "Non-vegetarian") + '"></span>' +
          '<div class="dish-info"><strong>' + escapeHtml(d.name) + "</strong><span>" + rupees(d.price) + "</span></div>" +
          '<div class="qty" aria-label="Quantity of ' + escapeHtml(d.name) + '">' +
            '<button type="button" data-minus="' + d.id + '" aria-label="Remove one" ' + (q ? "" : "disabled") + '><i class="fa-solid fa-minus"></i></button>' +
            "<span>" + q + "</span>" +
            '<button type="button" data-plus="' + d.id + '" aria-label="Add one" ' + (q >= 10 ? "disabled" : "") + '><i class="fa-solid fa-plus"></i></button>' +
          "</div></div>";
      }).join("");
      renderCartTotal();
    }

    preTabs.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-cat]");
      if (!b) return;
      activeCat = b.dataset.cat;
      renderMenu();
    });
    preList.addEventListener("click", (e) => {
      const plus = e.target.closest("button[data-plus]");
      const minus = e.target.closest("button[data-minus]");
      if (plus) cart[plus.dataset.plus] = Math.min((cart[plus.dataset.plus] || 0) + 1, 10);
      if (minus) {
        const id = minus.dataset.minus;
        cart[id] = (cart[id] || 0) - 1;
        if (cart[id] <= 0) delete cart[id];
      }
      if (plus || minus) { saveCart(); renderMenu(); }
    });

    api("/api/menu")
      .then((data) => {
        menu = data.menu;
        // drop anything that is not on the backend menu any more
        Object.keys(cart).forEach((id) => {
          const q = parseInt(cart[id], 10);
          if (!menu.some((d) => d.id === id) || !(q > 0)) delete cart[id];
          else cart[id] = Math.min(q, 10);
        });
        saveCart();
        renderMenu();
      })
      .catch(() => { preList.innerHTML = '<p class="text-muted-soft small">The menu could not be loaded. You can still book a table.</p>'; });

    function updateSummary() {
      const t = selectedTable ? "Table " + selectedTable : "Not chosen yet";
      const food = menu.length ? cartTotals() : { count: 0, total: 0 };
      summary.innerHTML =
        "<li><span>Date</span><strong>" + (form.date.value ? F.fmtDate(form.date.value) : "-") + "</strong></li>" +
        "<li><span>Time</span><strong>" + (form.time.value ? F.fmtTime(form.time.value) : "-") + "</strong></li>" +
        "<li><span>Guests</span><strong>" + (form.guests.value || "-") + "</strong></li>" +
        "<li><span>Table</span><strong>" + t + "</strong></li>" +
        "<li><span>Food pre-order</span><strong>" + (food.count ? food.count + (food.count === 1 ? " dish" : " dishes") + " &middot; " + rupees(food.total) : "None") + "</strong></li>";
    }

    function seatIcons(n) {
      return Array.from({ length: n }, () => '<i class="fa-solid fa-circle"></i>').join("");
    }

    function renderTables(data) {
      grid.innerHTML = data.tables.map((t) => {
        let cls = "is-available", state = "Available";
        if (data.slot_passed) { cls = "is-past"; state = "Time passed"; }
        else if (t.booked) { cls = "is-booked"; state = "Booked"; }
        else if (!t.fits) { cls = "is-small"; state = "Too small"; }
        if (t.available && selectedTable === t.number) cls = "is-available is-selected";
        return (
          '<label class="table-card ' + cls + '" title="Table ' + t.number + " - " + t.seats + ' seats">' +
            '<input type="radio" name="table_number" value="' + t.number + '"' +
              (t.available ? "" : " disabled") + (selectedTable === t.number && t.available ? " checked" : "") + ">" +
            '<div class="t-num">' + t.number + "</div>" +
            '<div class="t-name">' + escapeHtml(t.name) + "</div>" +
            '<div class="seats" aria-hidden="true">' + seatIcons(t.seats) + "</div>" +
            '<div class="small text-muted-soft mb-1">' + t.seats + " seats</div>" +
            '<span class="t-state">' + state + "</span>" +
          "</label>"
        );
      }).join("");

      // keep the selection only if that table is still free
      const stillFree = data.tables.find((t) => t.number === selectedTable && t.available);
      if (selectedTable && !stillFree) {
        toast("Table " + selectedTable + " was just booked by someone else. Please choose another table.", "error", 6000);
        selectedTable = null;
      }

      // Explain why a locked table cannot be clicked
      grid.querySelectorAll(".table-card.is-past, .table-card.is-booked, .table-card.is-small").forEach((card) => {
        card.addEventListener("click", () => {
          const msg = card.classList.contains("is-past")
            ? "This time has already passed. Choose a later time or tomorrow's date in Step 1."
            : card.classList.contains("is-booked")
              ? "This table is already booked for this time. Please choose another table."
              : "This table has fewer seats than your guests. Choose a bigger table or fewer guests.";
          toast(msg, "error", 5000);
        });
      });

      // If the chosen time is over, show a one-click way to book tomorrow instead
      if (data.slot_passed) {
        const note = document.createElement("div");
        note.className = "table-placeholder";
        note.style.gridColumn = "1 / -1";
        note.innerHTML = '<i class="fa-regular fa-clock me-2"></i>' + escapeHtml(data.time_label) +
          " on this date has already passed. " +
          '<button type="button" class="btn btn-saffron btn-sm ms-2" id="useTomorrow">Show tables for tomorrow, 7:00 PM</button>';
        grid.prepend(note);
        note.querySelector("#useTomorrow").addEventListener("click", () => {
          const t = new Date();
          t.setDate(t.getDate() + 1);
          form.date.value = t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0");
          form.date.dispatchEvent(new Event("change"));
          form.time.value = "19:00";
          form.time.dispatchEvent(new Event("change"));
        });
      }

      grid.querySelectorAll("input[name=table_number]").forEach((input) => {
        input.addEventListener("change", () => {
          selectedTable = Number(input.value);
          grid.querySelectorAll(".table-card").forEach((c) => c.classList.remove("is-selected"));
          input.closest(".table-card").classList.add("is-selected");
          updateSummary();
        });
      });

      const when = new Date(data.checked_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
      liveStatus.innerHTML = '<span class="live-dot"></span>' + data.available_count +
        " of " + data.tables.length + " tables free for " + escapeHtml(data.time_label) + " &middot; updated " + when;
      updateSummary();
    }

    async function loadAvailability(silent) {
      const date = form.date.value, time = form.time.value, guests = form.guests.value;
      updateSummary();
      if (!date || !time) {
        grid.innerHTML = '<div class="table-placeholder" style="grid-column:1/-1"><i class="fa-regular fa-clock mb-2 d-block fs-3"></i>Choose a date and time to see which tables are free.</div>';
        liveStatus.textContent = "";
        return;
      }
      const key = date + time + guests;
      if (key !== lastKey) { selectedTable = null; lastKey = key; }
      try {
        const data = await api("/api/tables/availability?date=" + encodeURIComponent(date) +
          "&time=" + encodeURIComponent(time) + "&guests=" + encodeURIComponent(guests || ""));
        renderTables(data);
      } catch (err) {
        if (!silent) F.showAlert(alertBox, err.message);
      }
    }

    function restartPolling() {
      clearInterval(timer);
      timer = setInterval(() => { if (!document.hidden) loadAvailability(true); }, REFRESH_MS);
    }

    ["date", "time", "guests"].forEach((name) =>
      form[name].addEventListener("change", () => { F.hideAlert(alertBox); loadAvailability(); restartPolling(); }));

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      F.hideAlert(alertBox);
      if (!form.date.value || !form.time.value) return F.showAlert(alertBox, "Please choose a date and time.");
      if (!form.guests.value) return F.showAlert(alertBox, "Please choose the number of guests.");
      if (!selectedTable) return F.showAlert(alertBox, "Please select an available table.");
      if (!/^\+?[0-9]{10,15}$/.test(form.phone.value.replace(/[\s\-()]/g, "")))
        return F.showAlert(alertBox, "Please enter a valid phone number (10-15 digits).");

      const btn = form.querySelector("button[type=submit]");
      F.setLoading(btn, true, "Reserving your table...");
      try {
        const data = await api("/api/bookings", {
          method: "POST",
          body: {
            customer_name: form.customer_name.value.trim(),
            phone: form.phone.value.trim(),
            date: form.date.value,
            time: form.time.value,
            guests: Number(form.guests.value),
            table_number: selectedTable,
            special_request: form.special_request.value.trim(),
            preorder: Object.keys(cart).map((id) => ({ id, qty: cart[id] })),
          },
        });
        showConfirmation(data.booking);
        form.special_request.value = "";
        Object.keys(cart).forEach((id) => delete cart[id]);
        saveCart();
        if (menu.length) renderMenu();
        selectedTable = null;
        loadAvailability(true);
      } catch (err) {
        F.showAlert(alertBox, err.message);
        if (err.status === 409) loadAvailability(true); // refresh so the taken table shows as Booked
      } finally {
        F.setLoading(btn, false);
      }
    });

    loadAvailability();
    restartPolling();
  }

  function showConfirmation(b) {
    const body = document.getElementById("confirmBody");
    body.innerHTML =
      '<div class="confirm-ticket">' +
        '<div class="small text-muted-soft">Booking reference</div>' +
        '<div class="ref mb-3">' + escapeHtml(b.booking_ref) + "</div>" +
        '<ul class="side-list">' +
          "<li><span>Name</span><strong>" + escapeHtml(b.customer_name) + "</strong></li>" +
          "<li><span>Date</span><strong>" + F.fmtDate(b.date) + "</strong></li>" +
          "<li><span>Time</span><strong>" + escapeHtml(b.time_label) + "</strong></li>" +
          "<li><span>Guests</span><strong>" + b.guests + "</strong></li>" +
          "<li><span>Table</span><strong>Table " + b.table_number + " (" + escapeHtml(b.table_name) + ")</strong></li>" +
          '<li><span>Status</span><strong><span class="status-badge status-' + b.status + '">' + b.status + "</span></strong></li>" +
        "</ul>" +
        ((b.preorder_items || []).length
          ? '<div class="preorder-receipt"><div class="small text-muted-soft mb-1">Food pre-order</div>' +
            b.preorder_items.map((i) => "<div><span>" + i.qty + " x " + escapeHtml(i.name) + "</span><span>" + rupees(i.subtotal) + "</span></div>").join("") +
            '<div class="total"><span>Total (pay at restaurant)</span><span>' + rupees(b.preorder_total) + "</span></div></div>"
          : "") +
      "</div>" +
      '<p class="mt-3 mb-0 text-muted-soft small">Your table is held. Our team will confirm the booking shortly - you can follow its status in My Bookings.</p>';
    new bootstrap.Modal(document.getElementById("confirmModal")).show();
  }

  /* ================================================================ MY BOOKINGS PAGE */
  function classify(b, today, nowTime) {
    if (b.status === "Cancelled") return "cancelled";
    const past = b.date < today || (b.date === today && b.time <= nowTime);
    if (b.status === "Completed" || past) return "past";
    return "upcoming";
  }

  function bookingItem(b, group) {
    const d = F.parseYmd(b.date);
    const canCancel = group === "upcoming" && (b.status === "Pending" || b.status === "Confirmed");
    const icons = { Pending: "fa-hourglass-half", Confirmed: "fa-circle-check", Completed: "fa-flag-checkered", Cancelled: "fa-ban" };
    return (
      '<article class="booking-item">' +
        '<div class="date-block"><div class="m">' + F.MONTHS[d.getMonth()] + '</div><div class="d">' + d.getDate() + '</div><div class="y">' + d.getFullYear() + "</div></div>" +
        "<div>" +
          "<h3>" + F.fmtDate(b.date) + " at " + escapeHtml(b.time_label) + "</h3>" +
          '<div class="meta">' +
            '<span><i class="fa-solid fa-chair"></i>Table ' + b.table_number + " &middot; " + escapeHtml(b.table_name) + "</span>" +
            '<span><i class="fa-solid fa-user-group"></i>' + b.guests + (b.guests > 1 ? " guests" : " guest") + "</span>" +
            '<span><i class="fa-solid fa-hashtag"></i>' + escapeHtml(b.booking_ref) + "</span>" +
          "</div>" +
          ((b.preorder_items || []).length
            ? '<div class="note food"><i class="fa-solid fa-bowl-food me-1"></i>Pre-order: ' + foodLines(b) + " &middot; <strong>" + rupees(b.preorder_total) + "</strong></div>"
            : "") +
          (b.special_request ? '<div class="note">"' + escapeHtml(b.special_request) + '"</div>' : "") +
        "</div>" +
        '<div class="booking-actions">' +
          '<span class="status-badge status-' + b.status + '"><i class="fa-solid ' + icons[b.status] + '"></i>' + b.status + "</span>" +
          (canCancel ? '<button class="btn btn-sm btn-cancel" data-cancel="' + b.id + '" data-ref="' + escapeHtml(b.booking_ref) + '">Cancel booking</button>' : "") +
        "</div>" +
      "</article>"
    );
  }

  async function initMyBookings(user) {
    const wrap = document.getElementById("myBookings");
    if (!wrap || !user) return;

    async function load() {
      let data;
      try {
        data = await api("/api/bookings/my");
      } catch (err) {
        wrap.innerHTML = '<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><p class="mx-auto">' + escapeHtml(err.message) + "</p></div>";
        return;
      }
      const groups = { upcoming: [], past: [], cancelled: [] };
      data.bookings.forEach((b) => groups[classify(b, data.today, data.now_time)].push(b));
      groups.upcoming.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

      document.getElementById("statTotal").textContent = data.bookings.length;
      document.getElementById("statUpcoming").textContent = groups.upcoming.length;
      document.getElementById("statPast").textContent = groups.past.length;
      document.getElementById("statCancelled").textContent = groups.cancelled.length;

      const empties = {
        upcoming: 'No upcoming bookings. <a href="booking.html">Book a table</a> for your next visit.',
        past: "Your completed and past visits will appear here.",
        cancelled: "You have no cancelled bookings.",
      };
      Object.keys(groups).forEach((g) => {
        document.getElementById("count-" + g).textContent = groups[g].length;
        document.getElementById("list-" + g).innerHTML = groups[g].length
          ? groups[g].map((b) => bookingItem(b, g)).join("")
          : '<div class="empty-state"><i class="fa-regular fa-calendar"></i><p class="mx-auto">' + empties[g] + "</p></div>";
      });

      wrap.querySelectorAll("[data-cancel]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          if (!confirm("Cancel booking " + btn.dataset.ref + "? This frees the table for other guests.")) return;
          F.setLoading(btn, true, "Cancelling...");
          try {
            const res = await api("/api/bookings/" + btn.dataset.cancel + "/cancel", { method: "PUT" });
            toast(res.message, "success");
            load();
          } catch (err) {
            toast(err.message, "error");
            F.setLoading(btn, false);
          }
        });
      });
    }

    await load();
    setInterval(() => { if (!document.hidden) load(); }, 30000); // status changes by admin appear automatically
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const user = await window.Feastify.ready;
    initBookingPage(user);
    initMyBookings(user);
  });
})();