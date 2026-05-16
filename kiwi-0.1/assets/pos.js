/* ==========================================================================
   Kiwi v2 — Dashboard / POS interactions
   - Command palette (⌘K)
   - Range selector
   - Charts via Chart.js (revenue line, payment donut)
   ========================================================================== */

(function () {
  "use strict";

  const ready = (fn) => (document.readyState !== "loading" ? fn() : document.addEventListener("DOMContentLoaded", fn));

  // ----- Command palette -----------------------------------------------
  function initCmdP() {
    const palette = document.querySelector(".cmdp");
    const trigger = document.querySelector(".cmd");
    if (!palette || !trigger) return;
    const open = () => {
      palette.classList.add("open");
      const i = palette.querySelector("input");
      if (i) setTimeout(() => i.focus(), 50);
    };
    const close = () => palette.classList.remove("open");
    trigger.addEventListener("click", open);
    palette.addEventListener("click", (e) => { if (e.target === palette) close(); });
    document.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        palette.classList.contains("open") ? close() : open();
      } else if (e.key === "Escape") {
        close();
      }
    });
  }

  // ----- Charts ---------------------------------------------------------
  function initCharts() {
    if (typeof Chart === "undefined") return;
    Chart.defaults.font.family = "Geist, -apple-system, system-ui, sans-serif";
    Chart.defaults.font.size = 11;
    Chart.defaults.color = "#6F6C65";

    const rev = document.getElementById("chartRevenue");
    if (rev) {
      const ctx = rev.getContext("2d");
      const grad = ctx.createLinearGradient(0, 0, 0, 220);
      grad.addColorStop(0, "rgba(11, 110, 79, 0.30)");
      grad.addColorStop(1, "rgba(11, 110, 79, 0.00)");
      new Chart(ctx, {
        type: "line",
        data: {
          labels: ["Ven", "Sam", "Dim", "Lun", "Mar", "Mer", "Jeu"],
          datasets: [{
            label: "CA · DH",
            data: [12480, 14200, 9800, 16385, 17920, 15640, 18420],
            borderColor: "#0B6E4F",
            backgroundColor: grad,
            borderWidth: 2,
            tension: 0.45,
            fill: true,
            pointRadius: 0,
            pointHoverRadius: 5,
            pointHoverBackgroundColor: "#0B6E4F",
            pointHoverBorderColor: "#fff",
            pointHoverBorderWidth: 2,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: "#0A0F0D",
              titleColor: "#F7F5F0",
              bodyColor: "#F7F5F0",
              padding: 10,
              cornerRadius: 8,
              displayColors: false,
              callbacks: {
                label: (c) => " " + new Intl.NumberFormat("fr-MA").format(c.parsed.y) + " DH",
              },
            },
          },
          scales: {
            x: { grid: { display: false }, border: { display: false } },
            y: {
              grid: { color: "rgba(10,15,13,.06)", drawBorder: false },
              border: { display: false },
              ticks: {
                callback: (v) => (v / 1000).toFixed(0) + "K",
                padding: 8,
              },
            },
          },
        },
      });
    }

    const don = document.getElementById("chartPay");
    if (don) {
      new Chart(don.getContext("2d"), {
        type: "doughnut",
        data: {
          labels: ["Espèces", "CMI", "Wafacash / CashPlus", "Virement"],
          datasets: [{
            data: [42, 35, 15, 8],
            backgroundColor: ["#0B6E4F", "#7DF2B0", "#C97B2D", "#1C2225"],
            borderColor: "#FFFFFF",
            borderWidth: 3,
            hoverOffset: 4,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: "68%",
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: "#0A0F0D",
              titleColor: "#F7F5F0",
              bodyColor: "#F7F5F0",
              padding: 10,
              cornerRadius: 8,
              displayColors: true,
              callbacks: { label: (c) => " " + c.label + " · " + c.parsed + " %" },
            },
          },
        },
      });
    }
  }

  // ----- Sidebar nav active state --------------------------------------
  function initNavRow() {
    document.querySelectorAll(".nav-row").forEach((b) => {
      b.addEventListener("click", () => {
        document.querySelectorAll(".nav-row").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
      });
    });
  }

  ready(() => {
    initCmdP();
    initNavRow();
    if (typeof Chart === "undefined") {
      // wait for Chart.js if defer-loaded
      window.addEventListener("load", initCharts);
    } else {
      initCharts();
    }
  });
})();
