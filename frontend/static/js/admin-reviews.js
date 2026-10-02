/* FEASTIFY - admin-reviews.js (admin-reviews.html): list reviews, hide/show, delete */
(function () {
  "use strict";
  const F = window.FeastifyAPI;
  const esc = F.escapeHtml;
  let all = [];

  const stars = (n) => '<span class="rv-stars" title="' + n + ' out of 5">' +
    "★".repeat(n) + '<span class="off">' + "★".repeat(5 - n) + "</span></span>";

  function render() {
    const q = document.getElementById("rvSearch").value.trim().toLowerCase();
    const f = document.getElementById("rvFilter").value;
    const rows = all.filter((r) =>
      (!q || (r.name + " " + r.email + " " + r.comment).toLowerCase().includes(q)) &&
      (!f || (f === "hidden" ? r.hidden : String(r.rating) === f)));
    document.getElementById("rvShown").textContent = rows.length + " review" + (rows.length === 1 ? "" : "s") + " shown";
    document.getElementById("rvBody").innerHTML = rows.length
      ? rows.map((r) => `<tr class="${r.hidden ? "rv-hidden" : ""}">
          <td><div class="person"><div class="av">${esc(F.initials(r.name))}</div>
            <div><strong>${esc(r.name)}</strong><span class="muted">${esc(r.email)}</span></div></div></td>
          <td class="text-nowrap">${stars(r.rating)}</td>
          <td class="rv-text">${esc(r.comment)}</td>
          <td class="text-nowrap muted">${esc(F.fmtDateTime(r.created_at))}</td>
          <td>${r.hidden ? '<span class="chip">Hidden</span>' : '<span class="chip member">Visible</span>'}</td>
          <td><div class="row-actions">
            <button class="act ${r.hidden ? "confirm" : "view"}" data-toggle="${r.id}" data-hidden="${r.hidden ? "0" : "1"}"
              title="${r.hidden ? "Show on website" : "Hide from website"}"><i class="fa-solid ${r.hidden ? "fa-eye" : "fa-eye-slash"}"></i></button>
            <button class="act cancel" data-delete="${r.id}" title="Delete"><i class="fa-solid fa-trash"></i></button>
          </div></td></tr>`).join("")
      : '<tr class="empty-row"><td colspan="6"><i class="fa-regular fa-comment-dots me-2"></i>No reviews match.</td></tr>';
  }

  async function load() {
    try {
      const data = await F.api("/api/admin/reviews");
      all = data.reviews;
      document.getElementById("rvAvg").textContent = data.summary.count ? data.summary.average.toFixed(1) + " / 5" : "-";
      document.getElementById("rvCount").textContent = data.summary.count;
      document.getElementById("rvHidden").textContent = data.hidden_count;
      document.getElementById("rvFive").textContent = data.summary.stars["5"] || 0;
      render();
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

  document.addEventListener("DOMContentLoaded", async () => {
    await window.FeastifyAdmin.ready;
    document.getElementById("rvSearch").addEventListener("input", render);
    document.getElementById("rvFilter").addEventListener("change", render);
    document.getElementById("refreshBtn")?.addEventListener("click", load);

    document.getElementById("rvBody").addEventListener("click", async (e) => {
      const toggle = e.target.closest("button[data-toggle]");
      const del = e.target.closest("button[data-delete]");
      try {
        if (toggle) {
          const res = await F.api(`/api/admin/reviews/${toggle.dataset.toggle}/visibility`,
            { method: "PUT", body: { hidden: toggle.dataset.hidden === "1" } });
          F.toast(res.message);
          load();
        } else if (del) {
          if (!confirm("Delete this review permanently?")) return;
          const res = await F.api(`/api/admin/reviews/${del.dataset.delete}`, { method: "DELETE" });
          F.toast(res.message);
          load();
        }
      } catch (err) {
        F.toast(err.message, "error");
      }
    });

    load();
    setInterval(() => { if (!document.hidden) load(); }, 60000);
  });
})();