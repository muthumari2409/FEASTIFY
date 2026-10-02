/* =====================================================================
   FEASTIFY - auth.js
   Used on login.html, register.html and admin-login.html.
   Passwords are sent to the backend over the API; the backend checks
   them against hashed passwords in MongoDB and sets an HttpOnly cookie.
   No password or admin credential is stored in this file.
   ===================================================================== */
(function () {
  "use strict";
  const F = window.FeastifyAPI;

  // Only allow redirects to our own pages, e.g. "booking.html"
  function safeNext(fallback) {
    const next = new URLSearchParams(location.search).get("next");
    return next && /^[a-z0-9-]+\.html$/i.test(next) && !next.startsWith("admin") ? next : fallback;
  }

  function initPasswordToggles() {
    document.querySelectorAll(".toggle-pass").forEach((btn) => {
      btn.addEventListener("click", () => {
        const input = btn.parentElement.querySelector("input");
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        btn.innerHTML = '<i class="fa-regular ' + (show ? "fa-eye-slash" : "fa-eye") + '"></i>';
        btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
      });
    });
  }

  /* ---------------- customer login ---------------- */
  function initLogin() {
    const form = document.getElementById("loginForm");
    if (!form) return;
    const alertBox = document.getElementById("loginAlert");
    if (new URLSearchParams(location.search).get("next")) {
      F.showAlert(alertBox, "Please log in to continue.", "success");
    }
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      F.hideAlert(alertBox);
      const email = form.email.value.trim();
      const password = form.password.value;
      if (!email || !password) return F.showAlert(alertBox, "Please enter your email and password.");
      const btn = form.querySelector("button[type=submit]");
      F.setLoading(btn, true, "Logging in...");
      try {
        const data = await F.api("/api/auth/login", { method: "POST", body: { email, password } });
        F.showAlert(alertBox, data.message, "success");
        setTimeout(() => (location.href = safeNext("index.html")), 500);
      } catch (err) {
        F.showAlert(alertBox, err.message);
        F.setLoading(btn, false);
      }
    });
  }

  /* ---------------- customer registration ---------------- */
  function passwordScore(pw) {
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    return score;
  }

  function initRegister() {
    const form = document.getElementById("registerForm");
    if (!form) return;
    const alertBox = document.getElementById("registerAlert");
    const bar = document.getElementById("strengthBar");
    const label = document.getElementById("strengthLabel");
    const colors = ["#b4432d", "#b4432d", "#e3a13a", "#2f7d57", "#2f7d57"];
    const words = ["Too short", "Weak", "Fair", "Good", "Strong"];

    form.password.addEventListener("input", () => {
      const s = passwordScore(form.password.value);
      bar.style.width = (s / 4) * 100 + "%";
      bar.style.background = colors[s];
      label.textContent = form.password.value ? words[s] : "Use 8+ characters with letters and numbers.";
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      F.hideAlert(alertBox);
      const body = {
        name: form.name.value.trim(),
        email: form.email.value.trim(),
        phone: form.phone.value.trim(),
        password: form.password.value,
        confirm_password: form.confirm_password.value,
      };
      // quick checks in the browser (the backend checks everything again)
      if (body.name.length < 2) return F.showAlert(alertBox, "Please enter your full name.");
      if (!/^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(body.email)) return F.showAlert(alertBox, "Please enter a valid email address.");
      if (!/^\+?[0-9]{10,15}$/.test(body.phone.replace(/[\s\-()]/g, ""))) return F.showAlert(alertBox, "Please enter a valid phone number (10-15 digits).");
      if (body.password.length < 8 || !/[A-Za-z]/.test(body.password) || !/[0-9]/.test(body.password))
        return F.showAlert(alertBox, "Password must be at least 8 characters and include a letter and a number.");
      if (body.password !== body.confirm_password) return F.showAlert(alertBox, "Passwords do not match.");
      if (!form.terms.checked) return F.showAlert(alertBox, "Please accept the booking policy to continue.");

      const btn = form.querySelector("button[type=submit]");
      F.setLoading(btn, true, "Creating account...");
      try {
        const data = await F.api("/api/auth/register", { method: "POST", body });
        F.showAlert(alertBox, data.message, "success");
        setTimeout(() => (location.href = safeNext("index.html")), 700);
      } catch (err) {
        F.showAlert(alertBox, err.message);
        F.setLoading(btn, false);
      }
    });
  }

  /* ---------------- admin login ---------------- */
  async function initAdminLogin() {
    const form = document.getElementById("adminLoginForm");
    if (!form) return;
    const alertBox = document.getElementById("adminAlert");

    if (new URLSearchParams(location.search).get("error") === "unauthorized") {
      F.showAlert(alertBox, "Unauthorized access. Please sign in with an admin account.");
    }

    // Already signed in as admin? Go straight to the dashboard.
    try {
      await F.api("/api/admin/me");
      location.replace("admin-dashboard.html");
      return;
    } catch (_) { /* not signed in - show the form */ }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      F.hideAlert(alertBox);
      const username = form.username.value.trim();
      const password = form.password.value;
      if (!username || !password) return F.showAlert(alertBox, "Please enter the admin username and password.");
      const btn = form.querySelector("button[type=submit]");
      F.setLoading(btn, true, "Signing in...");
      try {
        await F.api("/api/admin/login", { method: "POST", body: { username, password } });
        location.href = "admin-dashboard.html";
      } catch (err) {
        F.showAlert(alertBox, err.message);
        F.setLoading(btn, false);
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    initPasswordToggles();
    initLogin();
    initRegister();
    initAdminLogin();
  });
})();
