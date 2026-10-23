#!/usr/bin/env node
// Every dashboard destination at desktop size, in French, English and Arabic: a real
// Chromium demo session walks the sidebar the way a merchant does, and each
// destination must declare its language and direction, paint, not scroll
// sideways, and pass axe-core (browser-trace records a failing visit).
import { harness, dashboardWalker, verify } from './surface-matrix-lib.mjs';

const h = await harness('surface-matrix-dash-desktop');
const nav = dashboardWalker(h);
try {
  for (const locale of ['fr', 'en', 'ar']) {
    await h.S.run(`dashboard-transactions · ${locale} · desktop`, async (t) => {
      // coverage: surface=dashboard-transactions locale=fr viewport=desktop
      // coverage: surface=dashboard-transactions locale=en viewport=desktop
      // coverage: surface=dashboard-transactions locale=ar viewport=desktop
      const cell = await nav.open(t, 'dashboard-transactions', locale, 'desktop');
      await verify(h, t, cell, `matrix-dashboard-transactions-${locale}-desktop`, locale);
    });
    await h.S.run(`dashboard-rapport · ${locale} · desktop`, async (t) => {
      // coverage: surface=dashboard-rapport locale=fr viewport=desktop
      // coverage: surface=dashboard-rapport locale=en viewport=desktop
      // coverage: surface=dashboard-rapport locale=ar viewport=desktop
      const cell = await nav.open(t, 'dashboard-rapport', locale, 'desktop');
      await verify(h, t, cell, `matrix-dashboard-rapport-${locale}-desktop`, locale);
    });
    await h.S.run(`dashboard-terminaux · ${locale} · desktop`, async (t) => {
      // coverage: surface=dashboard-terminaux locale=fr viewport=desktop
      // coverage: surface=dashboard-terminaux locale=en viewport=desktop
      // coverage: surface=dashboard-terminaux locale=ar viewport=desktop
      const cell = await nav.open(t, 'dashboard-terminaux', locale, 'desktop');
      await verify(h, t, cell, `matrix-dashboard-terminaux-${locale}-desktop`, locale);
    });
    await h.S.run(`dashboard-conformite · ${locale} · desktop`, async (t) => {
      // coverage: surface=dashboard-conformite locale=fr viewport=desktop
      // coverage: surface=dashboard-conformite locale=en viewport=desktop
      // coverage: surface=dashboard-conformite locale=ar viewport=desktop
      const cell = await nav.open(t, 'dashboard-conformite', locale, 'desktop');
      await verify(h, t, cell, `matrix-dashboard-conformite-${locale}-desktop`, locale);
    });
    await h.S.run(`dashboard-equipe · ${locale} · desktop`, async (t) => {
      // coverage: surface=dashboard-equipe locale=fr viewport=desktop
      // coverage: surface=dashboard-equipe locale=en viewport=desktop
      // coverage: surface=dashboard-equipe locale=ar viewport=desktop
      const cell = await nav.open(t, 'dashboard-equipe', locale, 'desktop');
      await verify(h, t, cell, `matrix-dashboard-equipe-${locale}-desktop`, locale);
    });
    await h.S.run(`dashboard-payroll · ${locale} · desktop`, async (t) => {
      // coverage: surface=dashboard-payroll locale=fr viewport=desktop
      // coverage: surface=dashboard-payroll locale=en viewport=desktop
      // coverage: surface=dashboard-payroll locale=ar viewport=desktop
      const cell = await nav.open(t, 'dashboard-payroll', locale, 'desktop');
      await verify(h, t, cell, `matrix-dashboard-payroll-${locale}-desktop`, locale);
    });
    await h.S.run(`dashboard-reservations · ${locale} · desktop`, async (t) => {
      // coverage: surface=dashboard-reservations locale=fr viewport=desktop
      // coverage: surface=dashboard-reservations locale=en viewport=desktop
      // coverage: surface=dashboard-reservations locale=ar viewport=desktop
      const cell = await nav.open(t, 'dashboard-reservations', locale, 'desktop');
      await verify(h, t, cell, `matrix-dashboard-reservations-${locale}-desktop`, locale);
    });
    await h.S.run(`dashboard-tables · ${locale} · desktop`, async (t) => {
      // coverage: surface=dashboard-tables locale=fr viewport=desktop
      // coverage: surface=dashboard-tables locale=en viewport=desktop
      // coverage: surface=dashboard-tables locale=ar viewport=desktop
      const cell = await nav.open(t, 'dashboard-tables', locale, 'desktop');
      await verify(h, t, cell, `matrix-dashboard-tables-${locale}-desktop`, locale);
    });
    await h.S.run(`dashboard-menu · ${locale} · desktop`, async (t) => {
      // coverage: surface=dashboard-menu locale=fr viewport=desktop
      // coverage: surface=dashboard-menu locale=en viewport=desktop
      // coverage: surface=dashboard-menu locale=ar viewport=desktop
      const cell = await nav.open(t, 'dashboard-menu', locale, 'desktop');
      await verify(h, t, cell, `matrix-dashboard-menu-${locale}-desktop`, locale);
    });
    await h.S.run(`dashboard-stock · ${locale} · desktop`, async (t) => {
      // coverage: surface=dashboard-stock locale=fr viewport=desktop
      // coverage: surface=dashboard-stock locale=en viewport=desktop
      // coverage: surface=dashboard-stock locale=ar viewport=desktop
      const cell = await nav.open(t, 'dashboard-stock', locale, 'desktop');
      await verify(h, t, cell, `matrix-dashboard-stock-${locale}-desktop`, locale);
    });
    await h.S.run(`dashboard-finance · ${locale} · desktop`, async (t) => {
      // coverage: surface=dashboard-finance locale=fr viewport=desktop
      // coverage: surface=dashboard-finance locale=en viewport=desktop
      // coverage: surface=dashboard-finance locale=ar viewport=desktop
      const cell = await nav.open(t, 'dashboard-finance', locale, 'desktop');
      await verify(h, t, cell, `matrix-dashboard-finance-${locale}-desktop`, locale);
    });
  }
} finally {
  await h.close();
  await h.S.finish();
}
