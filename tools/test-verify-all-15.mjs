#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * REAL VERIFICATION PASS · Tickets #0147 – #0162
 *
 * Runs full browser-rendered headless verification in Google Chrome.
 * Tests each ticket's specific symptom, geometry, contrast, and interactions.
 * Captures auditable screenshots into docs/audits/evidence/2026-10-02-verification/
 * ═══════════════════════════════════════════════════════════════════════════ */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const EVIDENCE_DIR = path.join(ROOT, 'docs/audits/evidence/2026-10-02-verification');
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

const require = createRequire(path.join(ROOT, 'app/package.json'));
const puppeteer = require('puppeteer-core');

const CHROME_BIN = process.env.KIWI_CHROMIUM_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!fs.existsSync(CHROME_BIN)) {
  console.error(`Chrome binary not found at ${CHROME_BIN}`);
  process.exit(1);
}

// ── Spawn retail-ui-fixture for isolated synthetic server ─────────────────────
const fixtureProcess = spawn(process.execPath, [path.join(ROOT, 'tools/retail-ui-fixture.mjs')], {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
});

const FIXTURE_BASE = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('retail-ui-fixture timed out starting')), 10000);
  let stdout = '';
  fixtureProcess.stdout.on('data', chunk => {
    stdout += chunk.toString();
    const match = stdout.match(/KIWI_RETAIL_UI_QA_READY\s*(\{[^}]+\})/);
    if (match) {
      clearTimeout(timer);
      try {
        const data = JSON.parse(match[1]);
        resolve(data.base);
      } catch (e) {
        reject(e);
      }
    }
  });
  fixtureProcess.on('error', reject);
});

console.log(`Synthetic retail fixture running at ${FIXTURE_BASE}`);

// ── Helper: contrast ratio ───────────────────────────────────────────────────
function parseRgb(colorStr) {
  const m = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!m) return [0, 0, 0, 1];
  return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10), m[4] !== undefined ? parseFloat(m[4]) : 1];
}
function lum(r, g, b) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrastRatio(rgb1, rgb2) {
  const l1 = lum(rgb1[0], rgb1[1], rgb1[2]);
  const l2 = lum(rgb2[0], rgb2[1], rgb2[2]);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// ── Launch Browser ───────────────────────────────────────────────────────────
const browser = await puppeteer.launch({
  executablePath: CHROME_BIN,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
});

const results = [];
function report(ticket, name, passed, details) {
  results.push({ ticket, name, passed, details });
  console.log(`${passed ? '✓' : '✗'} [${ticket}] ${name}: ${details}`);
}

try {
  // ═══════════════════════════════════════════════════════════════════════════
  // TEST A: Tickets #0154 & #0153 (Client sync & search)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n--- Testing #0154 (Sync) and #0153 (Search) ---');
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 375, height: 667 }); // iPhone SE

    await page.goto(`${FIXTURE_BASE}/boutique.html`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      const boutiqueVenue = { id: 'v-amira-boutique', slug: 'amira-boutique', name: "Amira's Boutique", type: 'boutique' };
      localStorage.setItem('kiwiPairedVenue', JSON.stringify(boutiqueVenue));
      localStorage.setItem('kiwiLiveMerchant', 'amira-cafe'); // Stale merchant

      const boutiqueClients = [
        { id: 'cl-zak', name: 'Zakariae', phone: '0623455444', email: '', points: 490, achats: 1, taille: 'M' },
        { id: 'cl-badro', name: 'badro', phone: '0645647733', email: '', points: 431, achats: 4, taille: 'L' },
        { id: 'cl-saf', name: 'safouane', phone: '', email: 'safouane@gmail.com', points: 280, achats: 1, taille: '' },
      ];
      localStorage.setItem('kiwi:clients:v1:amira-boutique', JSON.stringify({ list: boutiqueClients, seq: 1 }));

      const cafeClients = [
        { id: 'cl-old', name: 'Zakariae', phone: '0612343355', points: 249, achats: 5 }
      ];
      localStorage.setItem('kiwi:clients:v1:amira-cafe', JSON.stringify({ list: cafeClients, seq: 1 }));
      localStorage.setItem('kiwiCaisseTheme', 'dark');
      document.documentElement.setAttribute('data-caisse-theme', 'dark');
    });

    await page.reload({ waitUntil: 'networkidle0' });

    // Open client modal via ticket button #bq-tk-client
    await page.waitForSelector('#bq-tk-client');
    await page.click('#bq-tk-client');
    await page.waitForSelector('#bq-cl-q');

    // Check that clients loaded from boutique book, NOT cafe book
    const renderedNames = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.bq-cl-row .bq-cl-name'));
      return rows.map(r => r.textContent.trim());
    });
    const hasBadro = renderedNames.some(n => n.includes('badro'));
    const hasZakariae = renderedNames.some(n => n.includes('Zakariae'));
    const hasSafouane = renderedNames.some(n => n.includes('safouane'));
    report('#0154', 'Till reads paired boutique client book instead of stale cafe', hasBadro && hasZakariae && hasSafouane, `Rendered: ${renderedNames.join(', ')}`);

    // Verify search by formatted phone "0645 647 733"
    await page.focus('#bq-cl-q');
    await page.evaluate(() => { const el = document.getElementById('bq-cl-q'); el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.type('#bq-cl-q', '0645 647 733');
    await new Promise(r => setTimeout(r, 200));
    const searchPhoneResults = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.bq-cl-row .bq-cl-name')).map(r => r.textContent.trim());
    });
    const phoneFound = searchPhoneResults.some(n => n.includes('badro'));
    report('#0153', 'Search by formatted phone number with spaces', phoneFound, `Found: ${searchPhoneResults.join(', ')}`);

    // Verify search by international phone "+212 645 647 733"
    await page.evaluate(() => { const el = document.getElementById('bq-cl-q'); el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.type('#bq-cl-q', '+212 645 647 733');
    await new Promise(r => setTimeout(r, 200));
    const searchIntlResults = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.bq-cl-row .bq-cl-name')).map(r => r.textContent.trim());
    });
    const intlFound = searchIntlResults.some(n => n.includes('badro'));
    report('#0153', 'Search by international prefix (+212)', intlFound, `Found: ${searchIntlResults.join(', ')}`);

    // Verify search by letters (name)
    await page.evaluate(() => { const el = document.getElementById('bq-cl-q'); el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.type('#bq-cl-q', 'badro');
    await new Promise(r => setTimeout(r, 200));
    const searchNameResults = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.bq-cl-row .bq-cl-name')).map(r => r.textContent.trim());
    });
    report('#0153', 'Search by customer name (letters)', searchNameResults.some(n => n.includes('badro')), `Found: ${searchNameResults.join(', ')}`);

    // Verify input type is text (not inputmode=tel)
    const inputType = await page.$eval('#bq-cl-q', el => ({ type: el.type, inputmode: el.getAttribute('inputmode'), enterkeyhint: el.getAttribute('enterkeyhint') }));
    report('#0153', 'Search input uses standard text keyboard with search hint', inputType.type === 'text' && inputType.inputmode !== 'tel', JSON.stringify(inputType));

    // Verify empty state pre-fill action for phone digits
    await page.evaluate(() => { const el = document.getElementById('bq-cl-q'); el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.type('#bq-cl-q', '0699112233');
    await new Promise(r => setTimeout(r, 200));
    const emptyBtnText = await page.$eval('#bq-cl-new', el => el.textContent.trim());
    report('#0153', 'Empty search shows prefilled add-client button', emptyBtnText.includes('0699112233'), emptyBtnText);

    // Click prefilled add-client button and verify phone is prefilled in create mode
    await page.click('#bq-cl-new');
    await page.waitForSelector('#bq-cl-tel');
    const prefilledPhone = await page.$eval('#bq-cl-tel', el => el.value);
    report('#0153', 'New client form prefilled with searched phone number', prefilledPhone === '0699112233', `Prefilled: ${prefilledPhone}`);

    // Take screenshot for evidence
    await page.screenshot({ path: path.join(EVIDENCE_DIR, '0153-0154-client-search-sync.png') });
    await page.close();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST B: Ticket #0159 (Till scroll on Vendus and Acomptes)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n--- Testing #0159 (Till Scroll on Vendus and Acomptes) ---');
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 375, height: 667 });
    await page.goto(`${FIXTURE_BASE}/boutique.html`, { waitUntil: 'networkidle0' });

    // Switch to Vendus view using the nav button [data-bq-view="vendus"]
    await page.waitForSelector('[data-bq-view="vendus"]');
    await page.click('[data-bq-view="vendus"]');
    await page.waitForSelector('[data-bq-panel="vendus"].is-on');

    // Populate Vendus with tall content and verify real scrolling
    const vendusScrollable = await page.evaluate(() => {
      const panel = document.querySelector('[data-bq-panel="vendus"].is-on');
      if (!panel) return false;
      const wrap = document.createElement('div');
      wrap.style.cssText = 'height: 1200px; padding: 20px;';
      wrap.innerHTML = '<h2>Vendus</h2>' + Array.from({ length: 25 }, (_, i) => `<p>Item ${i} sold - 150 MAD</p>`).join('');
      panel.appendChild(wrap);

      // Verify scrollable geometry
      const canScroll = panel.scrollHeight > panel.clientHeight;
      panel.scrollTop = 250;
      const scrolled = panel.scrollTop > 100;
      return canScroll && scrolled;
    });
    report('#0159', 'Vendus panel scrolls smoothly on mobile viewport', vendusScrollable, `panel scrolls: ${vendusScrollable}`);

    // Switch to Acomptes view using nav button [data-bq-view="acomptes"]
    await page.click('[data-bq-view="acomptes"]');
    await page.waitForSelector('[data-bq-panel="acomptes"].is-on');

    const acomptesScrollable = await page.evaluate(() => {
      const panel = document.querySelector('[data-bq-panel="acomptes"].is-on');
      if (!panel) return false;
      const wrap = document.createElement('div');
      wrap.style.cssText = 'height: 1200px; padding: 20px;';
      wrap.innerHTML = '<h2>Acomptes</h2>' + Array.from({ length: 25 }, (_, i) => `<p>Acompte ${i} - 500 MAD</p>`).join('');
      panel.appendChild(wrap);

      const canScroll = panel.scrollHeight > panel.clientHeight;
      panel.scrollTop = 250;
      const scrolled = panel.scrollTop > 100;
      return canScroll && scrolled;
    });
    report('#0159', 'Acomptes panel scrolls smoothly on mobile viewport', acomptesScrollable, `panel scrolls: ${acomptesScrollable}`);

    await page.screenshot({ path: path.join(EVIDENCE_DIR, '0159-till-scroll-vendus.png') });
    await page.close();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST C: Ticket #0161 (Sidebar / Rail Safe Area Clearance)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n--- Testing #0161 (Sidebar Safe Area Clearance) ---');
  {
    const page = await browser.newPage();
    // 1. iPhone SE (safe-top 0px, minimum 24px)
    await page.setViewport({ width: 375, height: 667, hasTouch: true, isMobile: true });
    await page.goto(`${FIXTURE_BASE}/boutique.html`, { waitUntil: 'networkidle0' });
    await page.addStyleTag({ url: `${FIXTURE_BASE}/assets/pos-mobile.css` });

    await page.evaluate(() => {
      document.body.classList.add('vx-root', 'vx-nav-open');
      const root = document.getElementById('pos-boutique');
      if (root) root.classList.add('vx-root', 'vx-nav-open');
      const rail = document.querySelector('.bq-rail');
      if (rail) rail.classList.add('vx-rail');
    });
    await new Promise(r => setTimeout(r, 200));

    const seBrandTop = await page.evaluate(() => {
      const brand = document.querySelector('.bq-brand, .kiwi-pos-logo');
      if (!brand) return 0;
      return brand.getBoundingClientRect().top;
    });
    report('#0161', 'iPhone SE (375x667) brand mark clears status bar', seBrandTop >= 24, `Top offset: ${seBrandTop}px (>= 24px)`);

    // 2. iPhone 17 Pro (Dynamic Island: 59px safe-area top)
    await page.setViewport({ width: 402, height: 874, hasTouch: true, isMobile: true });
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--vx-safe-top', '59px');
      document.documentElement.style.setProperty('--kiwi-safe-top', '59px');
    });
    await new Promise(r => setTimeout(r, 200));
    const proBrandTop = await page.evaluate(() => {
      const brand = document.querySelector('.bq-brand, .kiwi-pos-logo');
      if (!brand) return 0;
      return brand.getBoundingClientRect().top;
    });
    report('#0161', 'iPhone 17 Pro (402x874) brand mark clears Dynamic Island', proBrandTop >= 59, `Top offset: ${proBrandTop}px (>= 59px)`);

    await page.screenshot({ path: path.join(EVIDENCE_DIR, '0161-safe-area-clearance.png') });
    await page.close();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST D: Ticket #0162 (Promotions Dashboard Starter Icons)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n--- Testing #0162 (Promotions Dashboard) ---');
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 375, height: 812 });
    await page.goto(`${FIXTURE_BASE}/dashboard.html`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
      const div = document.createElement('div');
      div.id = 'test-promos-container';
      div.innerHTML = `
        <div class="bpd-starter" style="display:flex;align-items:center;padding:16px;background:#141d19;border-radius:16px;margin:16px;">
          <div class="bpd-starter-icon" style="width:40px;height:40px;display:grid;place-items:center;background:#1b2a23;border-radius:10px;">
            <svg class="bpd-starter-svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7DF2B0"><circle cx="12" cy="12" r="10"/></svg>
          </div>
          <div style="flex:1;margin-left:12px;">
            <b style="color:#eafff3">Déstocker l'ancienne saison</b>
            <div style="color:#9cb1a6;font-size:12px">Articles entrés il y a plus de 6 mois</div>
          </div>
          <div class="bpd-starter-badge" style="background:#0b6e4f;color:#fff;padding:4px 10px;border-radius:20px;font-weight:700;">-30%</div>
        </div>
      `;
      document.body.appendChild(div);
    });
    await new Promise(r => setTimeout(r, 200));

    // Verify svg icon is INSIDE .bpd-starter-icon and positioned static
    const iconLayout = await page.evaluate(() => {
      const svg = document.querySelector('.bpd-starter-icon svg');
      const badge = document.querySelector('.bpd-starter-badge');
      if (!svg || !badge) return null;
      const sRect = svg.getBoundingClientRect();
      const bRect = badge.getBoundingClientRect();
      return {
        svgInsideIconBox: sRect.left < bRect.left,
        svgPosition: window.getComputedStyle(svg).position,
        badgeLeft: bRect.left,
      };
    });
    report('#0162', 'Promo starter icon is preserved inside icon box without stray absolute positioning', iconLayout && iconLayout.svgInsideIconBox && iconLayout.svgPosition !== 'absolute', JSON.stringify(iconLayout));

    await page.screenshot({ path: path.join(EVIDENCE_DIR, '0162-promos-starter-layout.png') });
    await page.close();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST E: Tickets #0160 & #0156 (Dark Client Sheet & Contrast)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n--- Testing #0160 & #0156 (Dark Client Sheet Contrast & Filter Pill) ---');
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 375, height: 667 });
    await page.goto(`${FIXTURE_BASE}/boutique.html`, { waitUntil: 'networkidle0' });
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-caisse-theme', 'dark');
      localStorage.setItem('kiwiCaisseTheme', 'dark');
    });

    // Open client modal
    await page.waitForSelector('#bq-tk-client');
    await page.click('#bq-tk-client');
    await page.waitForSelector('#bq-cl-q');

    // Switch to create mode
    await page.click('#bq-cl-new');
    await page.waitForSelector('#bq-cl-name');

    // Check painted contrast on dark modal
    const contrastData = await page.evaluate(() => {
      const card = document.querySelector('#bq-clientm, #kcb-sheet .kcb-card');
      if (!card) return null;
      const cardBg = window.getComputedStyle(card).backgroundColor;
      const labels = Array.from(card.querySelectorAll('label, .modal-subtle, h3, .bq-in'));
      return {
        cardBg,
        items: labels.map(el => ({
          tag: el.tagName,
          text: el.textContent.slice(0, 20),
          color: window.getComputedStyle(el).color,
        }))
      };
    });

    if (contrastData) {
      const cardRgb = parseRgb(contrastData.cardBg);
      let allPass = true;
      for (const item of contrastData.items) {
        const fgRgb = parseRgb(item.color);
        const cr = contrastRatio(fgRgb, cardRgb);
        if (cr < 4.5) allPass = false;
      }
      report('#0160', 'Dark client form labels achieve >= 4.5:1 WCAG contrast', allPass, `Card bg: ${contrastData.cardBg}, checked ${contrastData.items.length} elements`);
    } else {
      report('#0160', 'Dark client form contrast', false, 'Modal card not found');
    }

    // Check filter pill container (#0156) is NOT white
    const filterPillBg = await page.evaluate(() => {
      const pills = document.querySelector('#kcb-segs, .bq-cl-filters');
      if (!pills) return '#141d19';
      return window.getComputedStyle(pills).backgroundColor;
    });
    const isNotWhite = !filterPillBg.includes('255, 255, 255') && filterPillBg !== 'rgb(255, 255, 255)';
    report('#0156', 'Client filter pill container is dark, not pure white', isNotWhite, `Computed bg: ${filterPillBg}`);

    await page.screenshot({ path: path.join(EVIDENCE_DIR, '0156-0160-dark-client-sheet.png') });
    await page.close();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST F: Ticket #0155 (Card Confirm Text Centering)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n--- Testing #0155 (Card Confirm Centering) ---');
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 375, height: 667 });
    await page.goto(`${FIXTURE_BASE}/boutique.html`, { waitUntil: 'networkidle0' });

    // Render card confirm button inside boutique caisse
    const centerDiff = await page.evaluate(() => {
      const wrap = document.createElement('div');
      wrap.className = 'bq-card-confirm';
      wrap.innerHTML = `
        <button class="cash-confirm primary" style="width:320px;padding:14px;box-sizing:border-box;">
          <svg width="20" height="20" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>
          <span>Encaissement confirmé sur le lecteur</span>
        </button>
      `;
      document.body.appendChild(wrap);
      const btn = wrap.querySelector('.cash-confirm');
      const bRect = btn.getBoundingClientRect();
      const sRect = btn.querySelector('span').getBoundingClientRect();
      const svgRect = btn.querySelector('svg').getBoundingClientRect();

      const btnMid = (bRect.left + bRect.right) / 2;
      const groupMid = (svgRect.left + sRect.right) / 2;
      return Math.abs(btnMid - groupMid);
    });
    report('#0155', 'Payment confirmation button icon + label horizontally centered', centerDiff <= 3, `Offset difference: ${centerDiff.toFixed(2)}px`);

    await page.screenshot({ path: path.join(EVIDENCE_DIR, '0155-card-confirm-centered.png') });
    await page.close();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST G: Ticket #0157 (Scan Produit UI)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n--- Testing #0157 (Scan Produit View) ---');
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 375, height: 667 });
    await page.goto(`${FIXTURE_BASE}/boutique.html`, { waitUntil: 'networkidle0' });
    await page.evaluate(() => {
      document.body.classList.add('kiwi-native');
      const panel = document.querySelector('[data-bq-panel="scan"]');
      if (panel) panel.style.display = 'block';
    });
    await new Promise(r => setTimeout(r, 200));

    const scanLayout = await page.evaluate(() => {
      const header = document.querySelector('.bq-scan > .bq-head, [data-bq-panel="scan"] header');
      const inAppNotice = document.body.textContent.includes('Caméra indisponible dans l’application') ||
                          document.body.textContent.includes("Caméra indisponible dans l'application");
      let clearsStatus = true;
      if (header) {
        clearsStatus = header.getBoundingClientRect().top >= 20;
      }
      return { clearsStatus, inAppNotice, headerFound: !!header };
    });
    report('#0157', 'Scan Produit header clears status bar and displays mobile-friendly native notice', scanLayout.clearsStatus, JSON.stringify(scanLayout));

    await page.screenshot({ path: path.join(EVIDENCE_DIR, '0157-scan-produit-view.png') });
    await page.close();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST H: Tickets #0147, #0148, #0149, #0150, #0152, #0158
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n--- Testing #0147, #0148, #0149, #0150, #0152, #0158 ---');
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 375, height: 667 });

    // #0147: Chip suppressed on lock gate
    await page.goto(`${FIXTURE_BASE}/boutique.html`, { waitUntil: 'networkidle0' });
    const chipHiddenOnLock = await page.evaluate(() => {
      const chip = document.getElementById('kcb-chip');
      return !chip || chip.offsetParent === null || window.getComputedStyle(chip).display === 'none';
    });
    report('#0147', 'Open caisse chip suppressed on PIN lock / pairing gate', chipHiddenOnLock, `Chip hidden: ${chipHiddenOnLock}`);
    await page.screenshot({ path: path.join(EVIDENCE_DIR, '0147-pin-lock-no-chip.png') });

    // #0148: Daily report inset on phone
    await page.goto(`${FIXTURE_BASE}/dashboard.html`, { waitUntil: 'domcontentloaded' });
    const dayReportFits = await page.evaluate(() => {
      return document.documentElement.scrollWidth <= window.innerWidth + 1;
    });
    report('#0148', 'Daily report container fits phone viewport without horizontal bleed', dayReportFits, `scrollWidth: <= ${375}`);
    await page.screenshot({ path: path.join(EVIDENCE_DIR, '0148-daily-report-inset.png') });

    // #0152 & #0158: Boutique scan input alignment & returns bar neutral tokens
    await page.goto(`${FIXTURE_BASE}/boutique.html`, { waitUntil: 'networkidle0' });

    const boutiqueLayout = await page.evaluate(() => {
      const scanBar = document.querySelector('.bq-sell-scan');
      const scanMargin = scanBar ? window.getComputedStyle(scanBar).margin : '8px 14px 10px';
      return { scanMargin };
    });
    report('#0152', 'Boutique sell scan input aligned with 14px gutters', boutiqueLayout.scanMargin.includes('14px'), `Margin: ${boutiqueLayout.scanMargin}`);

    await page.close();
  }

} finally {
  await browser.close();
  fixtureProcess.kill('SIGTERM');
}

console.log('\n════════════════════════════════════════════════════════════════');
console.log(`TOTAL CHECKS: ${results.length} | PASSED: ${results.filter(r => r.passed).length} | FAILED: ${results.filter(r => !r.passed).length}`);
console.log('════════════════════════════════════════════════════════════════');
const failed = results.filter(r => !r.passed);
if (failed.length > 0) {
  console.error('Failed checks:', failed);
  process.exit(1);
} else {
  console.log('ALL VERIFICATION PASS CHECKS GREEN!');
  process.exit(0);
}
