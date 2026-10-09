/* FERAL AMERICA: UI behaviors: nav, reveal-on-scroll, year, form UX */
(function () {
  "use strict";

  // Mobile nav
  var toggle = document.querySelector(".nav-toggle");
  var links = document.querySelector(".nav-links");
  if (toggle && links) {
    toggle.addEventListener("click", function () {
      links.classList.toggle("open");
    });
    links.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () { links.classList.remove("open"); });
    });
  }

  // Reveal on scroll (shared observer, also used by feeds.js)
  var io = null;
  if ("IntersectionObserver" in window) {
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    document.querySelectorAll(".reveal").forEach(function (el) { io.observe(el); });
  } else {
    document.querySelectorAll(".reveal").forEach(function (el) { el.classList.add("in"); });
  }
  window.__revealObserve = function (nodes) {
    if (!io) { nodes.forEach(function (n) { n.classList.add("in"); }); return; }
    nodes.forEach(function (n) { io.observe(n); });
  };

  // Current year in footer
  var y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();

  // Formspree AJAX submit (stay on page, show thank-you)
  var form = document.getElementById("tip-form");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var status = document.getElementById("form-status");
      var btn = form.querySelector("button[type=submit]");
      var original = btn.textContent;
      btn.disabled = true; btn.textContent = "Sending…";
      fetch(form.action, {
        method: "POST",
        body: new FormData(form),
        headers: { Accept: "application/json" },
      }).then(function (r) {
        if (r.ok) {
          form.reset();
          status.textContent = "Received. Your message is encrypted in transit and headed to a secure inbox. Expect a reply if it warrants one. Thank you for staying feral.";
          status.className = "form-note ok";
          status.style.color = "#7BE0A4";
        } else {
          throw new Error("submit failed");
        }
      }).catch(function () {
        status.textContent = "Something went wrong sending that. You can email localtip@proton.me directly.";
        status.style.color = "#ff8a8a";
      }).finally(function () {
        btn.disabled = false; btn.textContent = original;
      });
    });
  }
})();
