/* FLOP Relay — shared shell behaviour.
   Progressive enhancement only: navigation, content and every link work with
   this file blocked. It adds the theme toggle, the phone tools drawer, and
   scroll reveals. */
(function () {
  "use strict";

  var root = document.documentElement;
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── theme ──────────────────────────────────────────────────────────── */
  var THEME_KEY = "flop-relay-theme";
  var order = ["system", "dark", "light"];

  function readStored() {
    try { return localStorage.getItem(THEME_KEY); } catch (error) { return null; }
  }
  function store(value) {
    try { value === "system" ? localStorage.removeItem(THEME_KEY) : localStorage.setItem(THEME_KEY, value); } catch (error) { /* private mode */ }
  }
  function applyTheme(value) {
    if (value === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", value);
    var button = document.querySelector("[data-theme-toggle]");
    if (!button) return;
    button.textContent = "Theme: " + value;
    button.setAttribute("aria-label", "Change colour theme (currently " + value + ")");
  }

  var current = readStored();
  applyTheme(order.indexOf(current) > 0 ? current : "system");

  document.addEventListener("click", function (event) {
    var toggle = event.target.closest("[data-theme-toggle]");
    if (!toggle) return;
    var active = root.getAttribute("data-theme") || "system";
    var next = order[(order.indexOf(active) + 1) % order.length];
    store(next);
    applyTheme(next);
  });

  /* ── phone tools drawer ─────────────────────────────────────────────── */
  document.addEventListener("click", function (event) {
    var burger = event.target.closest("[data-nav-toggle]");
    if (!burger) return;
    var tools = document.querySelector("[data-nav-tools]");
    if (!tools) return;
    var open = tools.getAttribute("data-open") === "true";
    tools.setAttribute("data-open", open ? "false" : "true");
    burger.setAttribute("aria-expanded", open ? "false" : "true");
  });

  /* ── scroll reveals ─────────────────────────────────────────────────── */
  var targets = document.querySelectorAll(".reveal");
  if (!targets.length) return;
  if (reduced || typeof IntersectionObserver !== "function") {
    Array.prototype.forEach.call(targets, function (node) { node.setAttribute("data-shown", "true"); });
    return;
  }
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      // A short stagger inside one group reads as one movement rather than a
      // row of independent pops.
      var delay = Number(entry.target.getAttribute("data-delay")) || 0;
      entry.target.style.animationDelay = delay + "ms";
      entry.target.setAttribute("data-shown", "true");
      observer.unobserve(entry.target);
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: .08 });
  Array.prototype.forEach.call(targets, function (node) { observer.observe(node); });
})();
