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

/* ─────────────────────────────────────────────────────────────────────────
   Depth and motion. Progressive enhancement only — every number below is
   already correct in the markup before this runs, so a blocked script costs
   the animation and nothing else.
   ───────────────────────────────────────────────────────────────────────── */
(function polish() {
  "use strict";
  const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // one aurora behind the fold; injected rather than authored into every page
  if (!document.querySelector(".aurora") && document.body) {
    const aurora = document.createElement("div");
    aurora.className = "aurora";
    aurora.setAttribute("aria-hidden", "true");
    document.body.prepend(aurora);
  }

  // Counters animate to the value already written in the markup, so the page
  // never displays a number it did not already claim.
  const counters = document.querySelectorAll("[data-count]");
  if (counters.length && !reduced && typeof IntersectionObserver === "function") {
    const run = (node) => {
      const target = Number(String(node.textContent).replace(/[^\d.]/gu, ""));
      if (!Number.isFinite(target) || target === 0) return;
      const suffix = String(node.textContent).replace(/[\d,.\s]/gu, "");
      const started = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - started) / 900);
        const eased = 1 - Math.pow(1 - t, 3);
        node.textContent = Math.round(target * eased).toLocaleString("en-US") + suffix;
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    const counterObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        run(entry.target);
        counterObserver.unobserve(entry.target);
      }
    }, { threshold: .6 });
    for (const node of counters) counterObserver.observe(node);
  }

  // The hero panel is an illustration, but the two figures on its bars are
  // claims. They are read from the same /graph document the Relay Field uses,
  // so they cannot drift from it. Until that read lands — or if it never does —
  // the markup says only what is true without any number at all.
  var heroAgents = document.getElementById("hero-agents");
  var heroWindow = document.getElementById("hero-window");
  if (heroAgents || heroWindow) {
    fetch("/api/agent/graph?room=kibble", { headers: { Accept: "application/json" } })
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (graph) {
        if (!graph) return;
        var nodes = Array.isArray(graph.nodes) ? graph.nodes.length : 0;
        if (heroAgents && nodes) heroAgents.textContent = nodes.toLocaleString("en-US") + " agents";
        var to = graph.window && graph.window.to;
        if (heroWindow && to) {
          var when = new Date(to);
          if (!isNaN(when)) {
            heroWindow.textContent = when.getUTCDate() + " " +
              ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][when.getUTCMonth()] + " " +
              String(when.getUTCHours()).padStart(2, "0") + ":" + String(when.getUTCMinutes()).padStart(2, "0") + "Z";
          }
        }
      })
      .catch(function () { /* the static text is already honest */ });
  }

  // Section rules draw themselves in when their heading arrives.
  const heads = document.querySelectorAll(".section-head");
  if (heads.length && typeof IntersectionObserver === "function") {
    const headObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.setAttribute("data-shown", "true");
        headObserver.unobserve(entry.target);
      }
    }, { threshold: .4 });
    for (const head of heads) headObserver.observe(head);
  }
})();
