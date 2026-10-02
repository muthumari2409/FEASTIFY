/* =====================================================================
   FEASTIFY - reviews.js  (reviews.html)
   Shows all reviews from the backend (GET /api/reviews) and lets a
   logged-in customer post, edit or delete their own review.
   ===================================================================== */
(function () {
  "use strict";
  const F = window.FeastifyAPI;
  const { api, escapeHtml, toast } = F;
  const WORDS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];
  let reviews = [];

  function stars(n) {
    let out = "";
    for (let i = 1; i <= 5; i++) {
      out += '<i class="fa-' + (i <= Math.round(n) ? "solid" : "regular") + ' fa-star"></i>';
    }
    return out;
  }

  function renderSummary(s) {
    document.getElementById("avgScore").textContent = s.count ? s.average.toFixed(1) : "0.0";
    document.getElementById("avgStars").innerHTML = stars(s.average);
    document.getElementById("reviewCount").textContent =
      s.count ? "Based on " + s.count + (s.count === 1 ? " review" : " reviews") : "No reviews yet - be the first!";
    document.getElementById("starBars").innerHTML = [5, 4, 3, 2, 1].map((n) => {
      const c = s.stars[String(n)] || 0;
      const pct = s.count ? Math.round((c / s.count) * 100) : 0;
      return '<div class="star-bar"><span>' + n + ' <i class="fa-solid fa-star"></i></span>' +
        '<div class="track"><div class="fill" style="width:' + pct + '%"></div></div><span class="n">' + c + "</span></div>";
    }).join("");
  }

  function renderList() {
    const sort = document.getElementById("reviewSort").value;
    const list = reviews.slice().sort((a, b) =>
      sort === "high" ? b.rating - a.rating || b.created_at.localeCompare(a.created_at)
        : sort === "low" ? a.rating - b.rating || b.created_at.localeCompare(a.created_at)
          : b.created_at.localeCompare(a.created_at));
    const box = document.getElementById("reviewList");
    box.innerHTML = list.length
      ? list.map((r) =>
        '<article class="review-card">' +
          '<div class="d-flex align-items-center gap-3 mb-2">' +
            '<div class="review-av">' + escapeHtml(F.initials(r.name)) + "</div>" +
            '<div class="flex-grow-1"><strong>' + escapeHtml(r.name) + "</strong>" +
              '<div class="small text-muted-soft">' + escapeHtml(F.fmtDate(r.created_at.slice(0, 10))) +
              (r.updated_at && r.updated_at !== r.created_at ? " &middot; edited" : "") + "</div></div>" +
            '<div class="review-stars" title="' + r.rating + ' out of 5">' + stars(r.rating) + "</div>" +
          "</div>" +
          "<p class=\"mb-0\">" + escapeHtml(r.comment) + "</p>" +
        "</article>").join("")
      : '<div class="empty-state"><i class="fa-regular fa-comment-dots"></i><p class="mx-auto">No reviews yet. Be the first to share your experience!</p></div>';
  }

  function fillMine(mine) {
    const form = document.getElementById("reviewForm");
    if (!form) return;
    const del = document.getElementById("deleteReview");
    if (mine) {
      document.getElementById("reviewFormTitle").textContent = "Your review";
      const radio = form.querySelector('input[name=rating][value="' + mine.rating + '"]');
      if (radio) radio.checked = true;
      form.comment.value = mine.comment;
      document.getElementById("reviewSubmit").innerHTML = '<i class="fa-solid fa-pen me-2"></i>Update review';
      del.classList.remove("d-none");
      if (mine.hidden) F.showAlert(document.getElementById("reviewAlert"), "Your review is currently hidden by the restaurant.");
    } else {
      document.getElementById("reviewFormTitle").textContent = "Write a review";
      form.reset();
      document.getElementById("reviewSubmit").innerHTML = '<i class="fa-regular fa-paper-plane me-2"></i>Post review';
      del.classList.add("d-none");
    }
    updateRatingText();
    document.getElementById("charCount").textContent = form.comment.value.length;
  }

  function updateRatingText() {
    const r = document.querySelector("#reviewForm input[name=rating]:checked");
    document.getElementById("ratingText").textContent = r ? r.value + " / 5 - " + WORDS[r.value] : "Tap a star to rate";
  }

  async function load() {
    try {
      const data = await api("/api/reviews");
      reviews = data.reviews;
      renderSummary(data.summary);
      renderList();
      fillMine(data.mine);
    } catch (err) {
      document.getElementById("reviewList").innerHTML = '<p class="text-danger">' + escapeHtml(err.message) + "</p>";
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    if (document.body.dataset.page !== "reviews") return;
    await window.Feastify.ready; // know who is logged in first
    document.getElementById("reviewSort").addEventListener("change", renderList);

    const form = document.getElementById("reviewForm");
    const alertBox = document.getElementById("reviewAlert");
    form.addEventListener("change", updateRatingText);
    form.comment.addEventListener("input", () => {
      document.getElementById("charCount").textContent = form.comment.value.length;
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      F.hideAlert(alertBox);
      const rating = form.querySelector("input[name=rating]:checked");
      if (!rating) return F.showAlert(alertBox, "Please choose a star rating.");
      if (form.comment.value.trim().length < 10) return F.showAlert(alertBox, "Please write at least 10 characters.");
      const btn = document.getElementById("reviewSubmit");
      F.setLoading(btn, true, "Posting...");
      try {
        const res = await api("/api/reviews", {
          method: "POST",
          body: { rating: Number(rating.value), comment: form.comment.value.trim() },
        });
        F.setLoading(btn, false);
        toast(res.message, "success");
        await load();
      } catch (err) {
        F.setLoading(btn, false);
        F.showAlert(alertBox, err.message);
      }
    });

    document.getElementById("deleteReview").addEventListener("click", async () => {
      if (!confirm("Delete your review?")) return;
      try {
        const res = await api("/api/reviews/mine", { method: "DELETE" });
        toast(res.message, "success");
        F.hideAlert(alertBox);
        await load();
      } catch (err) {
        toast(err.message, "error");
      }
    });

    load();
  });
})();