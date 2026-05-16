/* ==========================================================================
   Kiwi v2 — App interactions
   - Reveal on scroll (IntersectionObserver)
   - Live ticker (CSS-driven, here we duplicate items for seamless loop)
   - Pricing calculator (real math, mint pulse on tier crossings)
   - Feature card proximity-aware mouse position
   - Dashboard mockup tilt: scroll-driven flatten
   ========================================================================== */

(function () {
  "use strict";

  const ready = (fn) => (document.readyState !== "loading"
    ? fn()
    : document.addEventListener("DOMContentLoaded", fn));

  // -----------------------------------------------------------------------
  // 1. Reveal on scroll
  //    Above-fold elements: instant, no animation (they ARE the page).
  //    Below-fold elements: IntersectionObserver, animate as discovered.
  // -----------------------------------------------------------------------
  function initReveal() {
    const els = document.querySelectorAll(".reveal");
    if (!els.length) return;

    // Above-fold pass: anything already in view loads instantly (no animation).
    const vh = window.innerHeight;
    const aboveFold = [];
    const belowFold = [];
    els.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < vh * 0.92) aboveFold.push(el);
      else belowFold.push(el);
    });

    aboveFold.forEach((el) => {
      el.style.transition = "none";
      el.classList.add("in");
      // restore transition for any future state changes
      requestAnimationFrame(() => { el.style.transition = ""; });
    });

    if (!("IntersectionObserver" in window) || !belowFold.length) {
      belowFold.forEach((el) => el.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -60px 0px" });
    belowFold.forEach((el) => io.observe(el));
  }

  // -----------------------------------------------------------------------
  // 2. Live ticker — duplicate the items so the CSS animation loops seamlessly
  // -----------------------------------------------------------------------
  function initTicker() {
    const track = document.querySelector(".ticker-track");
    if (!track) return;
    const html = track.innerHTML;
    track.innerHTML = html + html; // exact duplicate for -50% scroll loop
  }

  // -----------------------------------------------------------------------
  // 3. Pricing calculator
  //    Slider value = monthly volume in MAD (1k → 500k)
  //    Old (CMI) cost = volume * 0.018  + 99 MAD monthly fixed
  //    Kiwi cost      = volume * 0.0179 + 0 MAD monthly (free until 50k)
  //    Savings        = old - kiwi
  //    Tiers: <10k → "Starter", 10k–50k → "Pro", 50k–250k → "Plus", 250k+ → "Scale"
  // -----------------------------------------------------------------------
  const TIERS = [
    { max: 10000,  name: "Starter", rate: 0.0179, monthly: 0   },
    { max: 50000,  name: "Pro",     rate: 0.0179, monthly: 0   },
    { max: 250000, name: "Plus",    rate: 0.0149, monthly: 99  },
    { max: Infinity, name: "Scale", rate: 0.0119, monthly: 299 },
  ];
  const CMI_RATE = 0.018;
  const CMI_MONTHLY = 99;

  function fmtMAD(n) {
    return new Intl.NumberFormat("fr-MA", { maximumFractionDigits: 0 }).format(Math.round(n));
  }

  function tierFor(vol) {
    return TIERS.find((t) => vol <= t.max) || TIERS[TIERS.length - 1];
  }

  function initCalc() {
    const slider = document.querySelector(".calc-slider");
    if (!slider) return;
    const valEl  = document.querySelector(".calc-slider-val .v");
    const tierEl = document.querySelector(".calc-tier-badge");
    const outEl  = document.querySelector(".calc-output");
    const outAmt = document.querySelector(".calc-output-amt .v");
    const outVs  = document.querySelector(".calc-output-vs .save");
    const outPct = document.querySelector(".calc-output-vs .pct");

    let lastTier = "";

    function update() {
      const vol = +slider.value;
      const tier = tierFor(vol);
      const old = vol * CMI_RATE + CMI_MONTHLY;
      const kiwi = vol * tier.rate + tier.monthly;
      const save = old - kiwi;
      const pct = old > 0 ? (save / old) * 100 : 0;

      // Slider fill
      const min = +slider.min || 1000;
      const max = +slider.max || 500000;
      const pos = ((vol - min) / (max - min)) * 100;
      slider.style.setProperty("--p", pos + "%");

      // Numbers
      if (valEl)  valEl.textContent  = fmtMAD(vol);
      if (tierEl) tierEl.textContent = "Plan " + tier.name;
      if (outAmt) outAmt.textContent = fmtMAD(save);
      if (outVs)  outVs.textContent  = fmtMAD(save);
      if (outPct) outPct.textContent = pct.toFixed(1).replace(".", ",");

      // Pulse on tier change
      if (tier.name !== lastTier) {
        if (lastTier && outEl) {
          outEl.classList.add("pulse");
          setTimeout(() => outEl.classList.remove("pulse"), 600);
        }
        lastTier = tier.name;
      }
    }

    slider.addEventListener("input", update);
    update();
  }

  // -----------------------------------------------------------------------
  // 4. Feature card mouse position (proximity radial glow)
  // -----------------------------------------------------------------------
  function initFeatures() {
    const cards = document.querySelectorAll(".feature");
    cards.forEach((card) => {
      card.addEventListener("pointermove", (e) => {
        const r = card.getBoundingClientRect();
        card.style.setProperty("--mx", (e.clientX - r.left) + "px");
        card.style.setProperty("--my", (e.clientY - r.top) + "px");
      });
    });
  }

  // -----------------------------------------------------------------------
  // 5. Dashboard mockup tilt: flatten as user scrolls past hero
  // -----------------------------------------------------------------------
  function initDashTilt() {
    const mock = document.querySelector(".dash-mock");
    if (!mock) return;
    const hero = document.querySelector(".hero");
    if (!hero) return;

    const onScroll = () => {
      const heroBottom = hero.offsetTop + hero.offsetHeight;
      const viewHeight = window.innerHeight;
      // Progress: 0 at top of hero, 1 by 30% scroll past hero
      const past = Math.max(0, window.scrollY - 0);
      const progress = Math.min(1, past / (viewHeight * 0.5));
      // Interpolate tilt
      const rx = -8 + 8 * progress;     // -8deg → 0
      const ry = -6 + 6 * progress;     // -6deg → 0
      const sc = 0.96 + 0.04 * progress; // 0.96 → 1
      mock.style.setProperty("--rx", rx + "deg");
      mock.style.setProperty("--ry", ry + "deg");
      mock.style.setProperty("--scale", sc.toFixed(3));
    };

    let raf = 0;
    window.addEventListener("scroll", () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        onScroll();
        raf = 0;
      });
    }, { passive: true });
    onScroll();
  }

  // -----------------------------------------------------------------------
  // 6. Nav: add scrolled class on scroll
  // -----------------------------------------------------------------------
  function initNav() {
    const nav = document.querySelector(".nav");
    if (!nav) return;
    const onScroll = () => {
      nav.classList.toggle("scrolled", window.scrollY > 8);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  // -----------------------------------------------------------------------
  // Init
  // -----------------------------------------------------------------------
  ready(() => {
    initReveal();
    initTicker();
    initCalc();
    initFeatures();
    initDashTilt();
    initNav();
  });
})();
