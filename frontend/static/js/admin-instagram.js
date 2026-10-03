/* =====================================================================
   FEASTIFY - admin-instagram.js  (admin-instagram.html only)
   Shows visits, sign-ups, bookings and food pre-orders that came from
   Instagram (GET /api/admin/instagram), live Instagram post stats, and
   lets the admin keep a list of Instagram posts with likes and comments.
   Loads AFTER admin.js and waits for the admin access check.
   ===================================================================== */
(function () {
  "use strict";
  const F = window.FeastifyAPI;
  const esc = F.escapeHtml;
  const rupees = (n) => "\u20B9" + Number(n || 0).toLocaleString("en-IN");
  const IG_LINK = location.origin + "/?from=instagram";
  let chart;

  function setStat(id, value, hint) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = value;
    const h = el.parentElement.querySelector(".hint");
    if (h && hint !== undefined) h.textContent = hint;
  }

  function drawChart(d) {
    const canvas = document.getElementById("igChart");
    if (!canvas || !window.Chart) return;
    const labels = d.labels.map((s) => {
      const t = F.parseYmd(s);
      return t.getDate() + " " + F.MONTHS[t.getMonth()];
    });
    if (chart) {
      chart.data.labels = labels;
      chart.data.datasets[0].data = d.visits;
      chart.data.datasets[1].data = d.bookings;
      chart.update();
      return;
    }
    chart = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "Visits from Instagram", data: d.visits, backgroundColor: "#c13584", borderRadius: 6, maxBarThickness: 26 },
          { label: "Bookings from Instagram", data: d.bookings, backgroundColor: "#e3a13a", borderRadius: 6, maxBarThickness: 26 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: "bottom", labels: { usePointStyle: true } } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: "#eee7da" } }, x: { grid: { display: false } } },
      },
    });
  }

  function renderSources(rows) {
    document.getElementById("srcBody").innerHTML = rows.length
      ? rows.map((r) => `<tr class="${r.source === "instagram" ? "ig-row" : ""}">
          <td><strong>${r.source === "instagram" ? '<i class="fa-brands fa-instagram me-1"></i>' : ""}${esc(r.source)}</strong></td>
          <td>${r.visits}</td><td>${r.signups}</td><td>${r.bookings}</td></tr>`).join("")
      : '<tr class="empty-row"><td colspan="4">No visits yet.</td></tr>';
  }

  function renderBookings(list) {
    document.getElementById("igBookingsBody").innerHTML = list.length
      ? list.map((b) => {
          const dishes = (b.preorder_items || []).reduce((a, i) => a + i.qty, 0);
          return `<tr>
            <td class="ref">${esc(b.booking_ref)}</td>
            <td><strong>${esc(b.customer_name)}</strong><div class="muted">${esc(b.email)}</div></td>
            <td class="text-nowrap">${esc(F.fmtDate(b.date))}<div class="muted">${esc(F.fmtTime(b.time))}</div></td>
            <td>Table ${esc(b.table_number)}</td>
            <td>${dishes ? `${dishes} dish${dishes === 1 ? "" : "es"} &middot; ${rupees(b.preorder_total)}` : '<span class="muted">None</span>'}</td>
            <td>${window.FeastifyAdmin.statusBadge(b.status)}</td></tr>`;
        }).join("")
      : '<tr class="empty-row"><td colspan="6"><i class="fa-brands fa-instagram me-2"></i>No bookings from Instagram yet. Share your Instagram link to start.</td></tr>';
  }

  let posts = [];
  function renderPosts() {
    const likes = posts.reduce((a, p) => a + p.likes, 0);
    const comments = posts.reduce((a, p) => a + p.comments, 0);
    document.getElementById("postTotals").textContent =
      posts.length + " posts \u00b7 " + likes.toLocaleString() + " likes \u00b7 " + comments.toLocaleString() + " comments";
    document.getElementById("postBody").innerHTML = posts.length
      ? posts.map((p) => `<tr>
          <td><strong>${esc(p.title)}</strong>${p.url ? `<div><a href="${esc(p.url)}" target="_blank" rel="noopener" class="small">Open on Instagram</a></div>` : ""}</td>
          <td class="text-nowrap">${p.posted_on ? esc(F.fmtDate(p.posted_on)) : "-"}</td>
          <td><i class="fa-solid fa-heart text-danger me-1"></i>${p.likes.toLocaleString()}</td>
          <td><i class="fa-regular fa-comment me-1"></i>${p.comments.toLocaleString()}</td>
          <td><div class="row-actions">
            <button class="act view" data-edit="${p.id}" title="Edit" aria-label="Edit post"><i class="fa-solid fa-pen"></i></button>
            <button class="act cancel" data-del="${p.id}" title="Delete" aria-label="Delete post"><i class="fa-solid fa-trash"></i></button>
          </div></td></tr>`).join("")
      : '<tr class="empty-row"><td colspan="5">No posts added yet. Add your first Instagram post above.</td></tr>';
  }

  /* ---------- live data from the Instagram account ---------- */
  const fmt = (n) => Number(n || 0).toLocaleString();
  async function loadLive(force) {
    const sub = document.getElementById("liveSub");
    try {
      const res = await F.api("/api/admin/instagram/live" + (force ? "?refresh=1" : ""));
      const live = res.live;
      const connected = live.connected;
      document.getElementById("liveSetup").classList.toggle("d-none", connected);
      document.getElementById("liveAccount").classList.toggle("d-none", !connected || !live.account);
      document.getElementById("manualPanel").classList.toggle("d-none", connected);
      document.getElementById("liveRefresh").classList.toggle("d-none", !connected);
      if (!connected) {
        sub.textContent = "Connect your Instagram account to see likes, comments and views here automatically.";
        document.getElementById("liveGrid").innerHTML = "";
        return;
      }
      if (res.warning) F.toast(res.warning, "error", 6000);
      const a = live.account || {};
      const t = live.totals || {};
      sub.textContent = "Updated " + (live.fetched_at ? F.fmtDateTime(live.fetched_at) : "-") +
        " \u00b7 refreshes every 10 minutes";
      document.getElementById("liveAccount").innerHTML = `
        <div class="ig-handle"><i class="fa-brands fa-instagram"></i>@${esc(a.username || "")}</div>
        <div><strong>${fmt(a.followers)}</strong><span>followers</span></div>
        <div><strong>${fmt(a.posts)}</strong><span>posts</span></div>
        <div><strong>${fmt(t.likes)}</strong><span>likes</span></div>
        <div><strong>${fmt(t.comments)}</strong><span>comments</span></div>
        <div><strong>${fmt(t.views)}</strong><span>views</span></div>
        <div><strong>${fmt(t.reach)}</strong><span>accounts reached</span></div>`;
      document.getElementById("liveGrid").innerHTML = (live.posts || []).length
        ? live.posts.map((p) => `
          <a class="ig-post" href="${esc(p.permalink)}" target="_blank" rel="noopener">
            <div class="ig-thumb">${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy">` : ""}
              <span class="ig-type">${p.type === "VIDEO" ? '<i class="fa-solid fa-play"></i> Video' : p.type === "CAROUSEL_ALBUM" ? '<i class="fa-regular fa-clone"></i> Album' : '<i class="fa-regular fa-image"></i> Post'}</span></div>
            <div class="ig-stats">
              <span title="Likes"><i class="fa-solid fa-heart"></i>${fmt(p.likes)}</span>
              <span title="Comments"><i class="fa-regular fa-comment"></i>${fmt(p.comments)}</span>
              <span title="Views"><i class="fa-regular fa-eye"></i>${fmt(p.views)}</span>
            </div>
            <p>${esc(p.caption || "(no caption)")}</p>
          </a>`).join("")
        : '<p class="text-muted">No posts on this Instagram account yet.</p>';
    } catch (err) {
      sub.textContent = err.message;
    }
  }

  async function load() {
    try {
      const { instagram: d } = await F.api("/api/admin/instagram");
      const s = d.summary;
      setStat("igVisits", s.visits.toLocaleString(), s.visits_7d + " in the last 7 days");
      setStat("igSignups", s.signups.toLocaleString(), s.signups_7d + " in the last 7 days");
      setStat("igBookings", s.bookings.toLocaleString(), s.conversion + "% of Instagram visits booked");
      setStat("igPreorders", s.preorders.toLocaleString(), rupees(s.preorder_value) + " in food");
      drawChart(d.daily);
      renderSources(d.sources);
      renderBookings(d.recent_bookings);
      posts = d.posts;
      renderPosts();
      window.FeastifyAdmin.setUpdated();
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        alert("Unauthorized access");
        location.replace("admin-login.html?error=unauthorized");
        return;
      }
      F.toast(err.message, "error");
    }
  }

  // form.elements[...] avoids clashes with built-in form properties like form.title / form.id
  const el = (name) => document.getElementById("postForm").elements[name];

  function resetForm(form) {
    form.reset();
    el("post_id").value = "";
    document.getElementById("postSave").innerHTML = '<i class="fa-solid fa-plus me-1"></i>Add post';
    document.getElementById("postCancel").classList.add("d-none");
  }

  document.addEventListener("DOMContentLoaded", async () => {
    await window.FeastifyAdmin.ready;

    document.getElementById("igLink").textContent = IG_LINK;
    document.getElementById("copyIgLink").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(IG_LINK);
        F.toast("Instagram link copied. Paste it in your Instagram bio.");
      } catch (_) {
        F.toast("Select the link and press CTRL + C to copy it.", "error");
      }
    });

    const form = document.getElementById("postForm");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const body = {
        title: el("title").value.trim(), url: el("url").value.trim(), posted_on: el("posted_on").value,
        likes: Number(el("likes").value || 0), comments: Number(el("comments").value || 0),
      };
      const id = el("post_id").value;
      try {
        const res = await F.api(id ? `/api/admin/instagram/posts/${id}` : "/api/admin/instagram/posts",
          { method: id ? "PUT" : "POST", body });
        F.toast(res.message);
        resetForm(form);
        load();
      } catch (err) {
        F.toast(err.message, "error");
      }
    });
    document.getElementById("postCancel").addEventListener("click", () => resetForm(form));

    document.getElementById("postBody").addEventListener("click", async (e) => {
      const edit = e.target.closest("button[data-edit]");
      const del = e.target.closest("button[data-del]");
      if (edit) {
        const p = posts.find((x) => x.id === edit.dataset.edit);
        if (!p) return;
        el("post_id").value = p.id;
        el("title").value = p.title;
        el("url").value = p.url;
        el("posted_on").value = p.posted_on;
        el("likes").value = p.likes;
        el("comments").value = p.comments;
        document.getElementById("postSave").innerHTML = '<i class="fa-solid fa-check me-1"></i>Save changes';
        document.getElementById("postCancel").classList.remove("d-none");
        form.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      if (del) {
        if (!confirm("Delete this Instagram post from the list?")) return;
        try {
          const res = await F.api(`/api/admin/instagram/posts/${del.dataset.del}`, { method: "DELETE" });
          F.toast(res.message);
          load();
        } catch (err) {
          F.toast(err.message, "error");
        }
      }
    });

    document.getElementById("refreshBtn")?.addEventListener("click", () => { load(); loadLive(false); });
    document.getElementById("liveRefresh").addEventListener("click", () => loadLive(true));
    loadLive(false);
    load();
    setInterval(() => { if (!document.hidden) load(); }, 60000);
  });
})();