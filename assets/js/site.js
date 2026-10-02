/* ShapedOps — site interactions. Plain script, no dependencies. */
(function () {
  "use strict";
  window.__so = true;
  addEventListener("load", function () {
    setTimeout(function () { document.documentElement.classList.add("smooth"); }, 300);
  });

  var root = document.documentElement;
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var wide = matchMedia("(min-width: 901px)");
  var finePointer = matchMedia("(pointer: fine)").matches;

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  // cheap check on a section's own box (never its skipped contents)
  function nearView(el) { var r = el.getBoundingClientRect(); return r.bottom > -innerHeight && r.top < innerHeight * 2; }

  /* ---------------------------------------------------------- header */
  var header = $(".site-header");
  var menuBtn = $(".menu-btn");

  function setMenu(open) {
    document.body.classList.toggle("menu-open", open);
    if (menuBtn) {
      menuBtn.setAttribute("aria-expanded", String(open));
      menuBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    }
  }
  if (menuBtn) {
    menuBtn.addEventListener("click", function () { setMenu(!document.body.classList.contains("menu-open")); });
    $$(".mobile-menu a").forEach(function (a) { a.addEventListener("click", function () { setMenu(false); }); });
    addEventListener("keydown", function (e) { if (e.key === "Escape") setMenu(false); });
    wide.addEventListener("change", function (e) { if (e.matches) setMenu(false); });
  }

  /* ------------------------------------------- land in-page links exactly */
  // Deferred sections (.defer-render) take their real height only when they
  // render, which can happen mid-jump. After a hash jump, re-aim at the target
  // until it holds still — unless the visitor has started scrolling themselves.
  var userScrolled = false;
  ["wheel", "touchstart", "keydown"].forEach(function (t) { addEventListener(t, function () { userScrolled = true; }, { passive: true }); });
  function settleOn(el) {
    var until = performance.now() + 3000;
    userScrolled = false;
    (function check() {
      if (userScrolled || performance.now() > until) return;
      var pad = parseFloat(getComputedStyle(root).scrollPaddingTop) || 0;
      var off = el.getBoundingClientRect().top - pad;
      if (Math.abs(off) > 2) scrollBy({ top: off, behavior: "instant" });
      setTimeout(check, 120);
    })();
  }
  function hashTarget(hash) {
    if (!hash || hash.length < 2) return null;
    try { return document.getElementById(decodeURIComponent(hash.slice(1))); } catch (e) { return null; }
  }
  addEventListener("load", function () {
    var el = hashTarget(location.hash);
    if (el) requestAnimationFrame(function () { settleOn(el); });
  });
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[href*='#']");
    if (!a || a.pathname !== location.pathname || a.host !== location.host) return;
    var el = hashTarget(a.hash);
    if (!el) return;
    // let the browser run its (smooth) scroll, then correct once it ends
    var done = false;
    function finish() { if (done) return; done = true; settleOn(el); }
    addEventListener("scrollend", finish, { once: true });
    setTimeout(finish, 1400);
  });

  /* ------------------------------------------------- split headlines */
  function splitWords(el) {
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (child) {
        if (child.nodeType === 3) {
          var frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            var w = document.createElement("span");
            w.className = "w";
            var inner = document.createElement("span");
            inner.textContent = part;
            w.appendChild(inner);
            frag.appendChild(w);
          });
          child.parentNode.replaceChild(frag, child);
        } else if (child.nodeType === 1 && child.tagName !== "BR") {
          walk(child);
        }
      });
    })(el);
    $$(".w > span", el).forEach(function (s, i) { s.style.transitionDelay = (i * 0.05).toFixed(2) + "s"; });
  }
  if (!reduce) $$(".split").forEach(splitWords);

  /* ----------------------------------------------------------- reveal */
  var revealTargets = $$(".reveal, .split, [data-inview]");
  if (reduce || !("IntersectionObserver" in window)) {
    revealTargets.forEach(function (el) { el.classList.add("in"); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -8% 0px" });
    revealTargets.forEach(function (el) { io.observe(el); });
    // anything already above the fold starts on the first frame. Targets inside
    // a deferred section that is off screen are skipped: measuring them would
    // force the browser to lay out content it is deliberately skipping.
    requestAnimationFrame(function () {
      revealTargets.forEach(function (el) {
        var sec = el.closest(".defer-render");
        if (sec && !nearView(sec)) return;
        var r = el.getBoundingClientRect();
        if (r.top < innerHeight * 0.92 && r.bottom > 0) { el.classList.add("in"); io.unobserve(el); }
      });
    });
  }

  /* -------------------------------------- scroll-driven scenes (rAF) */
  // Each scene has a measure() that only reads layout and an apply() that only
  // writes styles. A frame runs every measure first, then only the applies whose
  // value changed, so scrolling never forces a layout between writes.
  var scenes = [];

  // header gets its solid background once the page has scrolled, and a thin
  // line along its bottom edge shows how far down the page you are
  if (header) {
    var bar = document.createElement("div");
    bar.className = "scroll-progress";
    bar.setAttribute("aria-hidden", "true");
    header.appendChild(bar);
    scenes.push({
      measure: function () {
        if (scrollY <= 8) return 0;
        var max = document.documentElement.scrollHeight - innerHeight;
        return Math.max(0.0005, q4(clamp(scrollY / Math.max(1, max), 0, 1)));
      },
      apply: function (v) {
        header.classList.toggle("scrolled", v > 0);
        bar.style.transform = "scaleX(" + v.toFixed(4) + ")";
      }
    });
  }

  function q4(v) { return Math.round(v * 2000) / 2000; }

  // home — the journey's stage rail marks the chapter at the middle of the
  // screen, and only shows while the chapters (not the hero) are on screen.
  // Past the journey the 3D line stays behind the page, dimmed (site.css).
  var journey = $("#journey");
  if (journey) {
    var chapters = $$("[data-ch]", journey);
    var railLinks = $$("[data-rail]", journey);
    scenes.push({
      measure: function () {
        var mid = innerHeight / 2;
        var r = journey.getBoundingClientRect();
        if (r.bottom < mid) return -2;
        if (r.top > mid) return -1;
        for (var i = chapters.length - 1; i >= 0; i--) {
          if (chapters[i].getBoundingClientRect().top <= mid) return Number(chapters[i].dataset.ch);
        }
        return 0;
      },
      apply: function (ch) {
        document.documentElement.classList.toggle("in-journey", ch >= 1);
        document.documentElement.classList.toggle("past-journey", ch === -2);
        railLinks.forEach(function (a) {
          var n = Number(a.dataset.rail);
          a.classList.toggle("on", n === ch);
          a.classList.toggle("done", n < ch);
          if (n === ch) a.setAttribute("aria-current", "step"); else a.removeAttribute("aria-current");
        });
      }
    });
  }

  // manufacturers — the stage rail fills as the list passes the middle of the screen
  var rail = $("[data-fill]");
  if (rail) {
    var railRows = $$(":scope > li", rail);
    var railH = 1, rowTops = [];
    var railSection = rail.closest("section") || rail;
    scenes.push({
      measure: function () {
        // far from the screen: settle at empty/full without touching the rows
        if (!nearView(railSection)) return railSection.getBoundingClientRect().top > 0 ? 0 : 1;
        var r = rail.getBoundingClientRect();
        railH = r.height;
        rowTops = railRows.map(function (li) { return li.offsetTop; });
        return reduce ? 1 : q4(clamp((innerHeight * 0.55 - r.top) / r.height, 0, 1));
      },
      apply: function (f) {
        rail.style.setProperty("--fill", f.toFixed(3));
        railRows.forEach(function (li, i) { li.classList.toggle("lit", rowTops[i] + 24 <= f * railH); });
      }
    });
  }

  var ticking = false;
  function runScenes() {
    ticking = false;
    var values = scenes.map(function (s) { return s.measure(); });   // reads
    scenes.forEach(function (s, i) {                                   // writes
      if (values[i] !== s.last) { s.last = values[i]; s.apply(values[i]); }
    });
  }
  function requestScenes() { if (!ticking) { ticking = true; requestAnimationFrame(runScenes); } }
  if (scenes.length) {
    runScenes();
    addEventListener("scroll", requestScenes, { passive: true });
    addEventListener("resize", function () { scenes.forEach(function (s) { s.last = undefined; }); requestScenes(); });
  }

  /* -------------------------------------------- home: settle on pages */
  // When a scroll stops within a fifth of a screen of a page edge, glide the
  // rest of the way, so the homepage reads as screens rather than one long
  // strip. It never acts mid-scroll, while the scrollbar is being dragged, on
  // phones (pages there are taller than the screen) or with reduced motion.
  if ($("#journey") && !reduce) {
    var pages = $$(".hero, .chapter, main > .section");
    var bigScreen = matchMedia("(min-width: 901px) and (min-height: 640px)");
    var pointerDown = false, settleTimer = 0, settling = false;
    addEventListener("pointerdown", function () { pointerDown = true; }, { passive: true });
    addEventListener("pointerup", function () { pointerDown = false; }, { passive: true });
    var settle = function () {
      if (!bigScreen.matches || pointerDown || settling || document.body.classList.contains("menu-open")) return;
      var vh = innerHeight, best = null;
      pages.forEach(function (p) {
        var top = p.getBoundingClientRect().top;
        if (Math.abs(top) < vh * 0.2 && (best === null || Math.abs(top) < Math.abs(best))) best = top;
      });
      if (best === null || Math.abs(best) < 2) return;
      settling = true;
      scrollTo({ top: scrollY + best, behavior: "smooth" });
      setTimeout(function () { settling = false; }, 700);
    };
    addEventListener("scroll", function () {
      clearTimeout(settleTimer);
      if (!settling) settleTimer = setTimeout(settle, 140);
    }, { passive: true });
  }

  /* ------------------------------------------- features: sideways row */
  var specsRow = $("#specs-row");
  if (specsRow) {
    var specBtns = $$("[data-specs]");
    var syncSpecBtns = function () {
      var max = specsRow.scrollWidth - specsRow.clientWidth - 2;
      specBtns.forEach(function (b) { b.disabled = b.dataset.specs < 0 ? specsRow.scrollLeft <= 2 : specsRow.scrollLeft >= max; });
    };
    specBtns.forEach(function (b) {
      b.addEventListener("click", function () {
        var card = specsRow.firstElementChild;
        var step = card ? card.getBoundingClientRect().width + parseFloat(getComputedStyle(specsRow).columnGap || 0) : specsRow.clientWidth;
        specsRow.scrollBy({ left: Number(b.dataset.specs) * step, behavior: reduce ? "auto" : "smooth" });
      });
    });
    specsRow.addEventListener("scroll", function () { requestAnimationFrame(syncSpecBtns); }, { passive: true });
    addEventListener("resize", syncSpecBtns);
    // measured once the row comes near, not at load: the features section skips
    // layout until then (content-visibility), and reading its size would force it
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries, obs) { if (entries[0].isIntersecting) { syncSpecBtns(); obs.disconnect(); } }).observe(specsRow);
    }
  }

  /* ------------------------------------------------- 04 phone sequence */
  var phone = $("#phone");
  if (phone) {
    var scene = phone.closest(".phone-scene");
    var msgs = $$(".wa-msg", phone);
    var played = false, timers = [];
    function play() {
      timers.forEach(clearTimeout); timers = [];
      phone.classList.remove("on-portal");
      msgs.forEach(function (m) { m.classList.remove("show"); });
      if (reduce) { msgs.forEach(function (m) { m.classList.add("show"); }); return; }
      msgs.forEach(function (m, i) { timers.push(setTimeout(function () { m.classList.add("show"); }, 500 + i * 1150)); });
      timers.push(setTimeout(function () { phone.classList.add("on-portal"); }, 500 + msgs.length * 1150 + 1300));
    }
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries, obs) {
        entries.forEach(function (e) { if (e.isIntersecting && !played) { played = true; play(); obs.disconnect(); } });
      }, { threshold: 0.45 }).observe(scene);
    } else { play(); }
    scene.addEventListener("click", function () {
      timers.forEach(clearTimeout);
      msgs.forEach(function (m) { m.classList.add("show"); });
      phone.classList.toggle("on-portal");
    });
    scene.style.cursor = "pointer";
    if (finePointer && !reduce) {
      scene.addEventListener("pointermove", function (e) {
        var r = scene.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
        phone.style.setProperty("--ry", (-16 + px * 26).toFixed(2) + "deg");
        phone.style.setProperty("--rx", (6 - py * 12).toFixed(2) + "deg");
      });
      scene.addEventListener("pointerleave", function () {
        phone.style.removeProperty("--ry"); phone.style.removeProperty("--rx");
      });
    }
  }

  /* ------------------------------------ manufacturers — job card stamping */
  var rig = $("[data-jobcard]");
  if (rig) {
    var card = $(".jobcard", rig);
    var stages = $$(".jc-stages li", rig);
    var feed = $(".jc-events", rig);
    var party = "Mehul";
    var clock = ["10:05", "11:40", "15:12", "09:30", "17:45", "17:52", "12:18"];

    function stageName(li) { return li.childNodes[1].textContent.trim(); }
    function pushEvent(ic, title, sub) {
      var li = document.createElement("li");
      li.innerHTML = '<i class="ic ' + ic + '">' + (ic === "pdf" ? "PDF" : ic === "done" ? "✓" : "") + "</i><div><b></b><small></small></div>";
      li.querySelector("b").textContent = title;
      li.querySelector("small").textContent = sub;
      feed.insertBefore(li, feed.firstChild);
      while (feed.children.length > 3) feed.removeChild(feed.lastChild);
    }
    function stamp(i) {
      stages.forEach(function (li, j) { li.classList.toggle("cur", j === i); });
      var li = stages[i];
      li.classList.add("on");
      var name = stageName(li);
      if (i === 0) { pushEvent("done", "Enquiry logged", "Owner: Rakesh · on the board"); return; }
      if (li.dataset.doc) pushEvent("pdf", li.dataset.doc + " generated", "Filed against ORD-2041");
      if (i === stages.length - 1) { pushEvent("done", "Order closed", "Receipt sent · ₹4,08,280 collected"); return; }
      timers.push(setTimeout(function () {
        pushEvent("wa", "WhatsApp → " + party, "moved to: " + name + " · " + clock[i]);
      }, li.dataset.doc ? 520 : 0));
    }
    var timers = [], step = 0;
    function run() {
      if (step < stages.length) {
        stamp(step++);
        timers.push(setTimeout(run, 1500));
      } else {
        // hold on the finished card, then lift the stamps and start again
        timers.push(setTimeout(function () {
          card.classList.add("resetting");
          stages.forEach(function (li) { li.classList.remove("on", "cur"); });
          timers.push(setTimeout(function () {
            card.classList.remove("resetting");
            feed.innerHTML = "";
            step = 0; run();
          }, 900));
        }, 3200));
      }
    }
    function stop() { timers.forEach(clearTimeout); timers = []; }

    if (reduce) {
      stages.forEach(function (li) { li.classList.add("on"); });
      pushEvent("wa", "WhatsApp → " + party, "moved to: Invoiced · 17:52");
      pushEvent("pdf", "receipt.pdf generated", "Filed against ORD-2041");
      pushEvent("done", "Order closed", "Receipt sent · ₹4,08,280 collected");
    } else if ("IntersectionObserver" in window) {
      var running = false;
      new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          rig.parentNode.classList.toggle("is-off", !e.isIntersecting);
          if (e.isIntersecting && !running) { running = true; run(); }
          else if (!e.isIntersecting && running) { running = false; stop(); }
        });
      }, { threshold: 0.3 }).observe(rig);
    } else { run(); }

    if (finePointer && !reduce) {
      var scene3 = rig.parentNode;
      scene3.addEventListener("pointermove", function (e) {
        var r = scene3.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
        rig.style.setProperty("--ry", (-15 + px * 18).toFixed(2) + "deg");
        rig.style.setProperty("--rx", (9 - py * 10).toFixed(2) + "deg");
      });
      scene3.addEventListener("pointerleave", function () {
        rig.style.removeProperty("--ry"); rig.style.removeProperty("--rx");
      });
    }
  }

  /* ------------------------------------------------------------- tabs */
  function wireTabs(tablist) {
    var tabs = $$('[role="tab"]', tablist);
    function select(tab, focus) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
        var panel = document.getElementById(t.getAttribute("aria-controls"));
        if (panel) panel.hidden = !on;
      });
      if (focus) tab.focus();
    }
    tabs.forEach(function (t, i) {
      t.addEventListener("click", function () { select(t); });
      t.addEventListener("keydown", function (e) {
        var n = null;
        if (e.key === "ArrowRight") n = tabs[(i + 1) % tabs.length];
        if (e.key === "ArrowLeft") n = tabs[(i - 1 + tabs.length) % tabs.length];
        if (e.key === "Home") n = tabs[0];
        if (e.key === "End") n = tabs[tabs.length - 1];
        if (n) { e.preventDefault(); select(n, true); }
      });
    });
    return select;
  }
  $$(".ind-tabs").forEach(wireTabs);
  var formTabs = $(".form-tabs");
  var selectFormTab = formTabs ? wireTabs(formTabs) : null;
  $$("[data-open-tab]").forEach(function (a) {
    a.addEventListener("click", function () {
      var t = formTabs && formTabs.querySelector('[data-tab="' + a.dataset.openTab + '"]');
      if (t && selectFormTab) selectFormTab(t);
    });
  });
  // /#get-quote (linked from other pages) opens the form on the quote tab
  if (location.hash === "#get-quote" && formTabs) {
    selectFormTab(formTabs.querySelector('[data-tab="quote"]'));
    var access = document.getElementById("access");
    if (access) {
      access.scrollIntoView();
      addEventListener("load", function () { requestAnimationFrame(function () { settleOn(access); }); });
    }
  }

  /* ---------------------------------------------- lead forms (production) */
  // Same endpoint, fields and `kind` values as before the redesign. The API's
  // CORS allowlist only includes shapedops.com / www.shapedops.com.
  var LEADS_ENDPOINT = "https://shapedops.ashlyticss.com/api/leads";
  function wireLeadForm(formId, kind) {
    var form = document.getElementById(formId);
    if (!form) return;
    var status = form.querySelector(".form-status");
    var submitBtn = form.querySelector('button[type="submit"]');
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var data = {};
      new FormData(form).forEach(function (v, k) { data[k] = v; });
      data.kind = kind;
      var originalHTML = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.textContent = "Sending…";
      status.textContent = "";
      status.className = "form-status";
      fetch(LEADS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      }).then(function (res) {
        if (!res.ok) throw new Error("request failed");
        form.reset();
        status.textContent = kind === "early_access" ? "You're on the list — we'll be in touch within 48 hours." : "Got it — we'll follow up shortly to set up a call.";
        status.classList.add("ok");
      }).catch(function () {
        status.textContent = "Something went wrong. Please try again, or email ashlyticss@gmail.com directly.";
        status.classList.add("err");
      }).then(function () {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalHTML;
      });
    });
  }
  wireLeadForm("early-access-form", "early_access");
  wireLeadForm("quote-form", "quote");

  /* ------------------------------------------ hero legend ← 3D stations */
  var legend = $$(".hero-legend li");
  if (legend.length) {
    addEventListener("shapedops:station", function (e) {
      var li = legend[e.detail.index];
      if (!li) return;
      li.classList.add("hit");
      clearTimeout(li._t);
      li._t = setTimeout(function () { li.classList.remove("hit"); }, 1100);
    });
  }
})();
