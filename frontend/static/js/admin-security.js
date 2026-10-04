(function () {
  const body = document.getElementById("secBody");

  // Escapes text so nobody can inject HTML/JS through an email or browser name
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function fmt(t) {
    return t ? new Date(t).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "-";
  }
  function device(ua) {
    ua = ua || "";
    if (/mobile|android|iphone/i.test(ua)) return "Mobile";
    if (/windows|mac|linux/i.test(ua)) return "Computer";
    return "Unknown";
  }

  async function load() {
    try {
      const res = await fetch("/api/admin/security-logs", { credentials: "same-origin" });
      if (res.status === 401) { location.href = "/admin-login.html?error=unauthorized"; return; }
      const raw = await res.json();
      if (!raw.success) throw new Error(raw.message || "Error");
      const d = raw.data || raw;

      document.getElementById("secTotal").textContent = d.total;
      document.getElementById("sec24").textContent = d.last_24h;
      document.getElementById("secFailed").textContent = d.failed_15m;
      document.getElementById("updatedAt").textContent =
        new Date().toLocaleTimeString("en-IN", { timeStyle: "short" });

      if (!d.logs.length) {
        body.innerHTML = '<tr class="empty-row"><td colspan="6">No blocked attempts yet.</td></tr>';
        return;
      }
      body.innerHTML = d.logs.map(l => `
        <tr>
          <td>${esc(fmt(l.time))}</td>
          <td>${esc(l.email)}</td>
          <td>${l.role === "admin"
                ? '<span class="badge text-bg-danger">Admin</span>'
                : '<span class="badge text-bg-secondary">Customer</span>'}</td>
          <td>${esc(l.ip)}</td>
          <td>${esc(device(l.user_agent))}</td>
          <td><span class="badge text-bg-warning">Blocked</span></td>
        </tr>`).join("");
    } catch (e) {
      body.innerHTML = `<tr class="empty-row"><td colspan="6">Could not load logs: ${esc(e.message)}</td></tr>`;
    }
  }

  document.getElementById("refreshBtn").addEventListener("click", load);
  load();
})();