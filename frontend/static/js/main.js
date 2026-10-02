/* =====================================================================
   FEASTIFY - main.js  (customer pages only - never loaded on admin pages)
   - builds the navbar and footer on every page
   - asks the backend who is logged in and shows their name everywhere
   - protects customer-only pages (profile, my bookings)
   - records the website visit (backend decides whether to count it)
   - menu, gallery, contact form and profile page logic
   ===================================================================== */
(function () {
  "use strict";
  const F = window.FeastifyAPI;
  const { api, escapeHtml, toast } = F;

  const NAV_LINKS = [
    ["home", "index.html", "Home"],
    ["about", "about.html", "About"],
    ["menu", "menu.html", "Menu"],
    ["gallery", "gallery.html", "Gallery"],
        ["reviews", "reviews.html", "Reviews"],
    ["booking", "booking.html", "Booking"],
    ["contact", "contact.html", "Contact"],
  ];

  // Other scripts (booking.js) wait for this: `const user = await Feastify.ready;`
  let resolveReady;
  window.Feastify = { user: null, ready: new Promise((r) => (resolveReady = r)) };

  /* ------------------------------------------------------------ navbar */
  function renderNavbar() {
    const holder = document.getElementById("site-navbar");
    if (!holder) return;
    const page = document.body.dataset.page;
    const solid = document.body.dataset.nav === "solid";
    holder.innerHTML =
      '<nav class="navbar navbar-expand-lg fixed-top feast-nav ' + (solid ? "scrolled" : "") + '" id="mainNav" aria-label="Main navigation">' +
        '<div class="container">' +
          '<a class="navbar-brand" href="index.html"><i class="fa-solid fa-utensils"></i>FEASTIFY</a>' +
          '<button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navMenu" aria-controls="navMenu" aria-expanded="false" aria-label="Open menu"><i class="fa-solid fa-bars"></i></button>' +
          '<div class="collapse navbar-collapse" id="navMenu">' +
            '<ul class="navbar-nav mx-auto">' +
              NAV_LINKS.map(([key, href, label]) =>
                '<li class="nav-item"><a class="nav-link' + (page === key ? " active" : "") + '"' +
                (page === key ? ' aria-current="page"' : "") + ' href="' + href + '">' + label + "</a></li>"
              ).join("") +
            "</ul>" +
            '<div class="nav-auth" id="navAuth"><span class="nav-loading"></span></div>' +
          "</div>" +
        "</div>" +
      "</nav>";

    if (!solid) {
      const nav = document.getElementById("mainNav");
      const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 40);
      onScroll();
      window.addEventListener("scroll", onScroll, { passive: true });
    }
  }

  function renderAuthArea(user) {
    const area = document.getElementById("navAuth");
    if (!area) return;
    const page = document.body.dataset.page;
    if (!user) {
      area.innerHTML =
        '<a href="login.html" class="btn btn-ghost-light btn-sm' + (page === "login" ? " active" : "") + '"><i class="fa-solid fa-right-to-bracket me-1"></i>Login</a>' +
        '<a href="register.html" class="btn btn-saffron btn-sm">Register</a>';
      return;
    }
    area.innerHTML =
      '<div class="dropdown">' +
        '<button class="btn user-chip dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">' +
          '<span class="avatar">' + escapeHtml(F.initials(user.name)) + "</span>" +
          "Hi, " + escapeHtml(F.firstName(user.name)) +
        "</button>" +
        '<ul class="dropdown-menu dropdown-menu-end feast-dropdown">' +
          '<li class="dropdown-header">' + escapeHtml(user.name) + "<small>" + escapeHtml(user.email) + "</small></li>" +
          '<li><a class="dropdown-item" href="profile.html"><i class="fa-regular fa-user"></i>Profile</a></li>' +
          '<li><a class="dropdown-item" href="my-bookings.html"><i class="fa-regular fa-calendar-check"></i>My Bookings</a></li>' +
          '<li><a class="dropdown-item" href="booking.html"><i class="fa-solid fa-plus"></i>Book a table</a></li>' +
          '<li><hr class="dropdown-divider"></li>' +
          '<li><button class="dropdown-item text-danger" type="button" id="logoutBtn"><i class="fa-solid fa-arrow-right-from-bracket text-danger"></i>Logout</button></li>' +
        "</ul>" +
      "</div>";
    document.getElementById("logoutBtn").addEventListener("click", logout);
  }

  /* ------------------------------------------------------------ footer */
  function renderFooter() {
    const holder = document.getElementById("site-footer");
    if (!holder) return;
    holder.innerHTML =
      '<footer class="site-footer">' +
        '<div class="container">' +
          '<div class="row g-4">' +
            '<div class="col-lg-4">' +
              '<div class="brand mb-3"><i class="fa-solid fa-utensils me-2"></i>FEASTIFY</div>' +
              "<p>Slow-cooked South Indian classics and modern plates, served at tables made for long conversations.</p>" +
              '<div class="socials">' +
                '<a href="#" aria-label="Instagram"><i class="fa-brands fa-instagram"></i></a>' +
                '<a href="#" aria-label="Facebook"><i class="fa-brands fa-facebook-f"></i></a>' +
                '<a href="#" aria-label="X"><i class="fa-brands fa-x-twitter"></i></a>' +
                '<a href="#" aria-label="YouTube"><i class="fa-brands fa-youtube"></i></a>' +
              "</div>" +
            "</div>" +
            '<div class="col-6 col-lg-2"><h4>Explore</h4><ul>' +
              NAV_LINKS.map(([, href, label]) => '<li><a href="' + href + '">' + label + "</a></li>").join("") +
            "</ul></div>" +
            '<div class="col-6 col-lg-3"><h4>Visit us</h4><ul class="contact-list">' +
              '<li><i class="fa-solid fa-location-dot"></i>24 Golden Avenue, Food Street</li>' +
              '<li><i class="fa-solid fa-phone"></i><a href="tel:+919876543210">+91 98765 43210</a></li>' +
              '<li><i class="fa-solid fa-envelope"></i><a href="mailto:hello@feastify.com">hello@feastify.com</a></li>' +
            "</ul></div>" +
            '<div class="col-lg-3"><h4>Opening hours</h4><ul>' +
              "<li>Mon - Thu: 11:30 AM - 11:00 PM</li>" +
              "<li>Fri - Sun: 11:00 AM - 11:30 PM</li>" +
              '<li class="mt-3"><a href="booking.html" class="btn btn-saffron btn-sm">Book a table</a></li>' +
            "</ul></div>" +
          "</div>" +
          '<div class="footer-bottom">' +
            "<span>&copy; " + new Date().getFullYear() + " Feastify Restaurant. All rights reserved.</span>" +
            '<span><a href="admin-login.html">Staff login</a></span>' +
          "</div>" +
        "</div>" +
      "</footer>";
  }

  /* ------------------------------------------------------------ user name everywhere */
  function applyUser(user) {
    document.querySelectorAll("[data-user-name]").forEach((el) => (el.textContent = user ? user.name : ""));
    document.querySelectorAll("[data-user-first]").forEach((el) => (el.textContent = user ? F.firstName(user.name) : ""));
    document.querySelectorAll("[data-user-email]").forEach((el) => (el.textContent = user ? user.email : ""));
    document.querySelectorAll("[data-user-initials]").forEach((el) => (el.textContent = user ? F.initials(user.name) : ""));
    document.querySelectorAll('[data-show-if="user"]').forEach((el) => el.classList.toggle("d-none", !user));
    document.querySelectorAll('[data-show-if="guest"]').forEach((el) => el.classList.toggle("d-none", !!user));
  }

  async function loadUser() {
    try {
      const data = await api("/api/auth/me");
      return data.authenticated ? data.user : null;
    } catch (_) {
      return null;
    }
  }

  function currentFile() {
    return location.pathname.split("/").pop() || "index.html";
  }

  function guardPage(user) {
    const rule = document.body.dataset.auth;
    if (rule === "required" && !user) {
      location.replace("login.html?next=" + encodeURIComponent(currentFile()));
      return false;
    }
    if (rule === "guest" && user) {
      location.replace("index.html");
      return false;
    }
    document.body.classList.add("auth-ok");
    return true;
  }

  async function logout() {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch (_) { /* cookie is cleared on the server anyway */ }
    window.Feastify.user = null;
    // a new person using this computer starts a new visit
    try { localStorage.removeItem(VISIT_KEY); } catch (_) {}
    applyUser(null);
    location.href = "index.html";
  }

  /* ------------------------------------------------------------ visit tracking
     The browser keeps a visit id for 30 minutes of activity. Opening
     Home, Menu, Gallery... in the same visit re-uses the same id, so the
     backend counts ONE visitor. Admin pages never load this file, and the
     backend also refuses to count anyone holding an admin login. */
  const VISIT_KEY = "feastify_visit";
  const VISIT_TIMEOUT = 30 * 60 * 1000;

  function newId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "v" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
  }

  function visitSessionId() {
    let visit = null;
    try { visit = JSON.parse(localStorage.getItem(VISIT_KEY)); } catch (_) {}
    const now = Date.now();
    if (!visit || !visit.id || now - visit.last > VISIT_TIMEOUT) visit = { id: newId(), last: now };
    visit.last = now;
    try { localStorage.setItem(VISIT_KEY, JSON.stringify(visit)); } catch (_) {}
    return visit.id;
  }

  function trackVisit() {
    api("/api/visits", {
      method: "POST",
      body: { session_id: visitSessionId(), page: document.body.dataset.page || "page" },
    }).catch(() => { /* tracking must never break the page */ });
  }

  /* ------------------------------------------------------------ reveal on scroll */
  function initReveal() {
    const items = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) {
      items.forEach((el) => el.classList.add("visible"));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("visible");
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12 });
    items.forEach((el) => io.observe(el));
  }

  /* ------------------------------------------------------------ MENU */
  const U = (id) => "https://images.unsplash.com/" + id + "?auto=format&fit=crop&w=600&q=75";
  const MENU = [
    { cat: "Starters", name: "Crispy Vegetable Samosa", price: 180, desc: "Hand-folded pastry, spiced potato and peas, mint and tamarind chutneys.", tags: ["veg"], img: U("photo-1601050690597-df0568f70950") },
    { cat: "Starters", name: "Garden Harvest Salad", price: 220, desc: "Crisp greens, roasted seeds, pomegranate and a lime-honey dressing.", tags: ["veg"], img: U("photo-1546069901-ba9599a7e63c") },
    { cat: "Starters", name: "Chef's Bruschetta", price: 240, desc: "Grilled sourdough, heirloom tomato, basil and aged balsamic.", tags: ["veg"], img: U("photo-1476224203421-9ac39bcb3327") },
    { cat: "Starters", name: "Avocado Egg Toast", price: 260, desc: "Smashed avocado, soft egg, chilli flakes on multigrain toast.", tags: [], img: U("photo-1482049016688-2d3e1b311543") },
    { cat: "Starters", name: "Mezze Bowl", price: 280, desc: "Hummus, falafel, pickled onions, cucumber and warm pita.", tags: ["veg"], img: U("photo-1512621776951-a57141f2eefd") },
    { cat: "Starters", name: "Tomato Basil Soup", price: 160, desc: "Slow-roasted tomatoes, fresh basil and a swirl of cream.", tags: ["veg"], img: U("photo-1547592166-23ac45744acd") },

    { cat: "Main Course", name: "Butter Chicken", price: 420, desc: "Tandoor-smoked chicken in a velvety tomato, butter and fenugreek gravy.", tags: ["chef"], img: U("photo-1585937421612-70a008356fbe") },
    { cat: "Main Course", name: "Dum Biryani", price: 380, desc: "Aged basmati and tender meat sealed and slow-cooked with whole spices.", tags: ["spicy", "chef"], img: U("photo-1563379091339-03b21ab4a4f8") },
    { cat: "Main Course", name: "Wood-fired Margherita", price: 360, desc: "San Marzano tomato, fresh mozzarella and basil on a blistered crust.", tags: ["veg"], img: U("photo-1565299624946-b28f40a0ae38") },
    { cat: "Main Course", name: "Feastify Signature Burger", price: 340, desc: "Double patty, cheddar, caramelised onion, house sauce, brioche bun.", tags: [], img: U("photo-1568901346375-23c9450c58cd") },
    { cat: "Main Course", name: "Grilled Pepper Steak", price: 620, desc: "Char-grilled steak, peppercorn jus, garlic mash and greens.", tags: ["chef"], img: U("photo-1600891964599-f61ba0e24092") },
    { cat: "Main Course", name: "Creamy Alfredo Pasta", price: 350, desc: "Fettuccine, parmesan cream, mushrooms and cracked pepper.", tags: ["veg"], img: U("photo-1473093295043-cdd812d0e601") },

    { cat: "Desserts", name: "Belgian Chocolate Cake", price: 240, desc: "Three layers of dark chocolate sponge and ganache.", tags: ["veg", "chef"], img: U("photo-1578985545062-69928b1d9587") },
    { cat: "Desserts", name: "Berry Panna Cotta", price: 210, desc: "Vanilla bean cream set soft, with a mixed-berry compote.", tags: ["veg"], img: U("photo-1488477181946-6428a0291777") },
    { cat: "Desserts", name: "Artisan Gelato", price: 180, desc: "Three scoops, churned in-house daily. Ask for today's flavours.", tags: ["veg"], img: U("photo-1497034825429-c343d7c6a68f") },
    { cat: "Desserts", name: "Honey Pancake Stack", price: 220, desc: "Fluffy pancakes, wild honey, butter and fresh berries.", tags: ["veg"], img: U("photo-1567620905732-2d1ec7ab7445") },
    { cat: "Desserts", name: "Glazed Donut Trio", price: 190, desc: "Chocolate, strawberry and classic sugar glaze.", tags: ["veg"], img: U("photo-1551024601-bec78aea704b") },
    { cat: "Desserts", name: "Strawberry Cheesecake", price: 260, desc: "Baked New York cheesecake with strawberry glaze.", tags: ["veg"], img: U("photo-1565958011703-44f9829ba187") },

    { cat: "Drinks", name: "Sunset Mocktail", price: 180, desc: "Orange, passion fruit and grenadine over crushed ice.", tags: ["veg"], img: U("photo-1514362545857-3bc16c4c7d1b") },
    { cat: "Drinks", name: "Cold Brew Coffee", price: 160, desc: "Steeped for 18 hours, served over ice with a splash of milk.", tags: ["veg"], img: U("photo-1461023058943-07fcbe16d735") },
    { cat: "Drinks", name: "Fresh Orange Juice", price: 140, desc: "Pressed to order. Nothing added.", tags: ["veg"], img: U("photo-1600271886742-f049cd451bba") },
    { cat: "Drinks", name: "Lemon Iced Tea", price: 130, desc: "House-brewed black tea, lemon and a hint of mint.", tags: ["veg"], img: U("photo-1556679343-c7306c1976bc") },
    { cat: "Drinks", name: "Virgin Mojito", price: 170, desc: "Lime, mint, cane sugar and soda.", tags: ["veg"], img: U("photo-1544145945-f90425340c7e") },
    { cat: "Drinks", name: "Masala Chai", price: 90, desc: "Assam tea simmered with ginger, cardamom and milk.", tags: ["veg"], img: U("photo-1571934811356-5cc061b6821f") },
  ];
  const TAG_LABELS = { veg: ["veg", "Vegetarian"], spicy: ["spicy", "Spicy"], chef: ["", "Chef's pick"] };
  
  // Dish ids - the same ids the backend uses in backend/models/menu_model.py
  const MENU_IDS = ["samosa", "garden-salad", "bruschetta", "avocado-toast", "mezze-bowl", "tomato-soup",
    "butter-chicken", "dum-biryani", "margherita", "burger", "pepper-steak", "alfredo",
    "choco-cake", "panna-cotta", "gelato", "pancakes", "donuts", "cheesecake",
    "mocktail", "cold-brew", "orange-juice", "iced-tea", "mojito", "masala-chai"];
  MENU.forEach((m, i) => (m.id = MENU_IDS[i]));

  // Food pre-order basket (kept in this browser, loaded into the booking page)
    // Each customer has their OWN basket (key includes the user id), so a
  // different person logging in on the same computer never sees it.
  function cartKey() {
    const u = window.Feastify.user;
    return "feastify_preorder_" + (u ? u.id : "guest");
  }
  function readCart() {
    try { return JSON.parse(localStorage.getItem(cartKey())) || {}; } catch (_) { return {}; }
  }
  function writeCart(cart) {
    try { localStorage.setItem(cartKey(), JSON.stringify(cart)); } catch (_) { /* ignore */ }
  }
  // When a guest logs in, move what they picked as a guest into their own basket
  function adoptGuestCart() {
    const u = window.Feastify.user;
    if (!u) return;
    try {
      const guest = JSON.parse(localStorage.getItem("feastify_preorder_guest")) || {};
      if (!Object.keys(guest).length) return;
      const mine = readCart();
      Object.keys(guest).forEach((id) => { mine[id] = Math.min((mine[id] || 0) + guest[id], 10); });
      writeCart(mine);
      localStorage.removeItem("feastify_preorder_guest");
      localStorage.removeItem("feastify_preorder"); // old shared key from earlier versions
    } catch (_) { /* ignore */ }
  }

  function menuCard(item) {
    return (
      '<div class="col-md-6 col-xl-4"><article class="menu-card">' +
        '<div class="thumb"><img src="' + item.img + '" alt="' + escapeHtml(item.name) + '" loading="lazy"></div>' +
        '<div class="body">' +
          '<div class="top"><h3>' + escapeHtml(item.name) + '</h3><span class="price">&#8377;' + item.price + "</span></div>" +
          "<p>" + escapeHtml(item.desc) + "</p>" +
          '<div class="tags">' + item.tags.map((t) => '<span class="tag ' + TAG_LABELS[t][0] + '">' + TAG_LABELS[t][1] + "</span>").join("") + "</div>" + cartControl(item) +
        "</div>" +
      "</article></div>"
    );
  }

    function cartControl(item) {
    const q = readCart()[item.id] || 0;
    if (!q) {
      return '<button type="button" class="btn btn-leaf btn-sm add-dish mt-3" data-add="' + item.id + '">' +
        '<i class="fa-solid fa-plus me-1"></i>Add to pre-order</button>';
    }
    return '<div class="qty mt-3">' +
      '<button type="button" data-minus="' + item.id + '" aria-label="Remove one"><i class="fa-solid fa-minus"></i></button>' +
      "<span>" + q + "</span>" +
      '<button type="button" data-plus="' + item.id + '" aria-label="Add one" ' + (q >= 10 ? "disabled" : "") + '><i class="fa-solid fa-plus"></i></button>' +
      '<span class="in-order">in your pre-order</span></div>';
  }

  // Floating bar on the menu page: "3 dishes - Rs.930  [Book a table]"
  function renderCartBar() {
    let bar = document.getElementById("cartBar");
    const cart = readCart();
    let count = 0, total = 0;
    MENU.forEach((m) => { const q = cart[m.id] || 0; count += q; total += q * m.price; });
    if (!count) { if (bar) bar.remove(); return; }
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "cartBar";
      bar.className = "cart-bar";
      document.body.appendChild(bar);
    }
    bar.innerHTML =
      '<div><i class="fa-solid fa-bowl-food me-2"></i><strong>' + count + (count === 1 ? " dish" : " dishes") +
      "</strong> &middot; &#8377;" + total.toLocaleString("en-IN") +
      '<button type="button" class="btn btn-link btn-sm text-white-50 ms-2" id="cartClear">Clear</button></div>' +
      '<a href="booking.html" class="btn btn-saffron btn-sm">Book a table with this order <i class="fa-solid fa-arrow-right ms-1"></i></a>';
    bar.querySelector("#cartClear").addEventListener("click", () => {
      writeCart({});
      document.dispatchEvent(new Event("feastify:cart"));
    });
  }

  function initMenu() {
    const grid = document.getElementById("menuGrid");
    if (!grid) return;

    // + / - / Add buttons on the menu cards
    grid.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-add], button[data-plus], button[data-minus]");
      if (!btn) return;
      const cart = readCart();
      const id = btn.dataset.add || btn.dataset.plus || btn.dataset.minus;
      if (btn.dataset.minus) {
        cart[id] = (cart[id] || 0) - 1;
        if (cart[id] <= 0) delete cart[id];
      } else {
        cart[id] = Math.min((cart[id] || 0) + 1, 10);
        if (btn.dataset.add) toast("Added to your pre-order. Book a table to send it to the kitchen.");
      }
      writeCart(cart);
      document.dispatchEvent(new Event("feastify:cart"));
    });
    document.addEventListener("feastify:cart", () => { draw(); renderCartBar(); });
    renderCartBar();
        // redraw once we know who is logged in (their own basket)
    window.Feastify.ready.then(() => { adoptGuestCart(); document.dispatchEvent(new Event("feastify:cart")); });
    let category = "All";
    const search = document.getElementById("menuSearch");

    function draw() {
      const q = (search.value || "").trim().toLowerCase();
      const categories = category === "All" ? ["Starters", "Main Course", "Desserts", "Drinks"] : [category];
      let html = "";
      categories.forEach((cat) => {
        const items = MENU.filter((m) => m.cat === cat &&
          (!q || m.name.toLowerCase().includes(q) || m.desc.toLowerCase().includes(q)));
        if (!items.length) return;
        html += '<h2 class="menu-category-title">' + cat + '</h2><div class="row g-3">' + items.map(menuCard).join("") + "</div>";
      });
      grid.innerHTML = html ||
        '<div class="empty-state"><i class="fa-solid fa-magnifying-glass"></i><p class="mx-auto">No dishes match "' +
        escapeHtml(q) + '". Try another word or choose All.</p></div>';
    }

    document.querySelectorAll("[data-menu-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-menu-filter]").forEach((b) => {
          b.classList.remove("active");
          b.setAttribute("aria-pressed", "false");
        });
        btn.classList.add("active");
        btn.setAttribute("aria-pressed", "true");
        category = btn.dataset.menuFilter;
        draw();
      });
    });
    search.addEventListener("input", draw);
    draw();
  }

  /* ------------------------------------------------------------ GALLERY (filter + lightbox) */
  function initGallery() {
    const items = document.querySelectorAll(".gallery-item");
    if (!items.length) return;

    document.querySelectorAll("[data-gallery-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-gallery-filter]").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const f = btn.dataset.galleryFilter;
        items.forEach((it) => it.classList.toggle("hidden-item", f !== "all" && it.dataset.category !== f));
      });
    });

    const modalEl = document.getElementById("lightbox");
    if (!modalEl || !window.bootstrap) return;
    const modal = new bootstrap.Modal(modalEl);
    const img = modalEl.querySelector("img");
    const cap = modalEl.querySelector(".lb-caption");
    items.forEach((it) => {
      it.addEventListener("click", () => {
        const source = it.querySelector("img");
        img.src = source.currentSrc || source.src;
        img.alt = source.alt;
        cap.textContent = source.alt;
        modal.show();
      });
    });
  }

  /* ------------------------------------------------------------ CONTACT FORM */
  function initContact(user) {
    const form = document.getElementById("contactForm");
    if (!form) return;
    const alertBox = document.getElementById("contactAlert");
    if (user) {
      form.name.value = user.name;
      form.email.value = user.email;
    }
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      F.hideAlert(alertBox);
      const btn = form.querySelector("button[type=submit]");
      const body = {
        name: form.name.value.trim(),
        email: form.email.value.trim(),
        subject: form.subject.value,
        message: form.message.value.trim(),
      };
      if (body.message.length < 10) return F.showAlert(alertBox, "Please write a message of at least 10 characters.");
      F.setLoading(btn, true, "Sending...");
      try {
        const data = await api("/api/contact", { method: "POST", body });
        F.showAlert(alertBox, data.message, "success");
        form.message.value = "";
      } catch (err) {
        F.showAlert(alertBox, err.message);
      } finally {
        F.setLoading(btn, false);
      }
    });
  }

  /* ------------------------------------------------------------ PROFILE PAGE */
  function fillProfile(user) {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set("pfName", user.name);
    set("pfEmail", user.email);
    set("pfPhone", user.phone || "-");
    set("pfSince", F.fmtDateTime(user.created_at));
    set("pfLastLogin", F.fmtDateTime(user.last_login));
    set("pfVisits", user.visit_count || 0);
    set("pfLastVisit", F.relativeDay(user.last_visit));
    const form = document.getElementById("profileForm");
    if (form) {
      form.name.value = user.name;
      form.phone.value = user.phone || "";
      form.email.value = user.email;
    }
  }

  async function initProfile(user) {
    if (document.body.dataset.page !== "profile" || !user) return;
    fillProfile(user);

    try {
      const data = await api("/api/bookings/my");
      const list = data.bookings;
      const today = data.today;
      const upcoming = list.filter((b) => ["Pending", "Confirmed"].includes(b.status) &&
        (b.date > today || (b.date === today && b.time > data.now_time)));
      document.getElementById("pfBookings").textContent = list.length;
      document.getElementById("pfUpcoming").textContent = upcoming.length;
      const next = upcoming.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
      document.getElementById("pfNext").innerHTML = next
        ? "<strong>" + F.fmtDate(next.date) + "</strong> at " + next.time_label + ", Table " + next.table_number +
          ' <span class="status-badge status-' + next.status + '">' + next.status + "</span>"
        : 'No upcoming bookings. <a href="booking.html">Book a table</a>';
    } catch (err) {
      toast(err.message, "error");
    }

    const form = document.getElementById("profileForm");
    const alertBox = document.getElementById("profileAlert");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      F.hideAlert(alertBox);
      const btn = form.querySelector("button[type=submit]");
      F.setLoading(btn, true, "Saving...");
      try {
        const data = await api("/api/auth/profile", {
          method: "PUT",
          body: { name: form.name.value.trim(), phone: form.phone.value.trim() },
        });
        window.Feastify.user = data.user;
        fillProfile(data.user);
        applyUser(data.user);
        renderAuthArea(data.user);
        F.showAlert(alertBox, "Profile saved.", "success");
      } catch (err) {
        F.showAlert(alertBox, err.message);
      } finally {
        F.setLoading(btn, false);
      }
    });

    const pwForm = document.getElementById("passwordForm");
    const pwAlert = document.getElementById("passwordAlert");
    pwForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      F.hideAlert(pwAlert);
      const btn = pwForm.querySelector("button[type=submit]");
      F.setLoading(btn, true, "Updating...");
      try {
        const data = await api("/api/auth/password", {
          method: "PUT",
          body: {
            current_password: pwForm.current_password.value,
            new_password: pwForm.new_password.value,
            confirm_password: pwForm.confirm_password.value,
          },
        });
        F.showAlert(pwAlert, data.message, "success");
        pwForm.reset();
      } catch (err) {
        F.showAlert(pwAlert, err.message);
      } finally {
        F.setLoading(btn, false);
      }
    });
  }

  /* ------------------------------------------------------------ start-up */
  document.addEventListener("DOMContentLoaded", async () => {
    if (location.protocol === "file:") {
      const warn = document.createElement("div");
      warn.className = "file-warning";
      warn.innerHTML = "You opened this file directly. Start the server with <b>python app.py</b> and open <b>http://127.0.0.1:5000</b>.";
      document.body.appendChild(warn);
    }

    renderNavbar();
    renderFooter();
    initReveal();
    initMenu();
    initGallery();

    const user = await loadUser();
    window.Feastify.user = user;
    renderAuthArea(user);
    applyUser(user);
    if (!guardPage(user)) return;

    trackVisit();
    initContact(user);
    initProfile(user);
    resolveReady(user);
  });

  window.Feastify.applyUser = applyUser;
})();
