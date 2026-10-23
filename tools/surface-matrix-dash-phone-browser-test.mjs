#!/usr/bin/env node
// Every dashboard destination at phone size, in French, English and Arabic: a real
// Chromium demo session walks the sidebar the way a merchant does, and each
// destination must declare its language and direction, paint, not scroll
// sideways, and pass axe-core (browser-trace records a failing visit).
import { harness, dashboardWalker, verify } from './surface-matrix-lib.mjs';

const h = await harness('surface-matrix-dash-phone');
const nav = dashboardWalker(h);
try {
  for (const locale of ['fr', 'en', 'ar']) {
    await h.S.run(`dashboard-transactions · ${locale} · phone`, async (t) => {
      // coverage: surface=dashboard-transactions locale=fr viewport=phone
      // coverage: surface=dashboard-transactions locale=en viewport=phone
      // coverage: surface=dashboard-transactions locale=ar viewport=phone
      const cell = await nav.open(t, 'dashboard-transactions', locale, 'phone');
      await verify(h, t, cell, `matrix-dashboard-transactions-${locale}-phone`, locale);
    });
    await h.S.run(`dashboard-rapport · ${locale} · phone`, async (t) => {
      // coverage: surface=dashboard-rapport locale=fr viewport=phone
      // coverage: surface=dashboard-rapport locale=en viewport=phone
      // coverage: surface=dashboard-rapport locale=ar viewport=phone
      const cell = await nav.open(t, 'dashboard-rapport', locale, 'phone');
      await verify(h, t, cell, `matrix-dashboard-rapport-${locale}-phone`, locale);
    });
    await h.S.run(`dashboard-terminaux · ${locale} · phone`, async (t) => {
      // coverage: surface=dashboard-terminaux locale=fr viewport=phone
      // coverage: surface=dashboard-terminaux locale=en viewport=phone
      // coverage: surface=dashboard-terminaux locale=ar viewport=phone
      const cell = await nav.open(t, 'dashboard-terminaux', locale, 'phone');
      await verify(h, t, cell, `matrix-dashboard-terminaux-${locale}-phone`, locale);
    });
    await h.S.run(`dashboard-conformite · ${locale} · phone`, async (t) => {
      // coverage: surface=dashboard-conformite locale=fr viewport=phone
      // coverage: surface=dashboard-conformite locale=en viewport=phone
      // coverage: surface=dashboard-conformite locale=ar viewport=phone
      const cell = await nav.open(t, 'dashboard-conformite', locale, 'phone');
      await verify(h, t, cell, `matrix-dashboard-conformite-${locale}-phone`, locale);
    });
    await h.S.run(`dashboard-equipe · ${locale} · phone`, async (t) => {
      // coverage: surface=dashboard-equipe locale=fr viewport=phone
      // coverage: surface=dashboard-equipe locale=en viewport=phone
      // coverage: surface=dashboard-equipe locale=ar viewport=phone
      const cell = await nav.open(t, 'dashboard-equipe', locale, 'phone');
      await verify(h, t, cell, `matrix-dashboard-equipe-${locale}-phone`, locale);
    });
    await h.S.run(`dashboard-payroll · ${locale} · phone`, async (t) => {
      // coverage: surface=dashboard-payroll locale=fr viewport=phone
      // coverage: surface=dashboard-payroll locale=en viewport=phone
      // coverage: surface=dashboard-payroll locale=ar viewport=phone
      const cell = await nav.open(t, 'dashboard-payroll', locale, 'phone');
      await verify(h, t, cell, `matrix-dashboard-payroll-${locale}-phone`, locale);
    });
    await h.S.run(`dashboard-reservations · ${locale} · phone`, async (t) => {
      // coverage: surface=dashboard-reservations locale=fr viewport=phone
      // coverage: surface=dashboard-reservations locale=en viewport=phone
      // coverage: surface=dashboard-reservations locale=ar viewport=phone
      const cell = await nav.open(t, 'dashboard-reservations', locale, 'phone');
      await verify(h, t, cell, `matrix-dashboard-reservations-${locale}-phone`, locale);
    });
    await h.S.run(`dashboard-tables · ${locale} · phone`, async (t) => {
      // coverage: surface=dashboard-tables locale=fr viewport=phone
      // coverage: surface=dashboard-tables locale=en viewport=phone
      // coverage: surface=dashboard-tables locale=ar viewport=phone
      const cell = await nav.open(t, 'dashboard-tables', locale, 'phone');
      await verify(h, t, cell, `matrix-dashboard-tables-${locale}-phone`, locale);
    });
    await h.S.run(`dashboard-menu · ${locale} · phone`, async (t) => {
      // coverage: surface=dashboard-menu locale=fr viewport=phone
      // coverage: surface=dashboard-menu locale=en viewport=phone
      // coverage: surface=dashboard-menu locale=ar viewport=phone
      const cell = await nav.open(t, 'dashboard-menu', locale, 'phone');
      await verify(h, t, cell, `matrix-dashboard-menu-${locale}-phone`, locale);
    });
    await h.S.run(`dashboard-stock · ${locale} · phone`, async (t) => {
      // coverage: surface=dashboard-stock locale=fr viewport=phone
      // coverage: surface=dashboard-stock locale=en viewport=phone
      // coverage: surface=dashboard-stock locale=ar viewport=phone
      const cell = await nav.open(t, 'dashboard-stock', locale, 'phone');
      await verify(h, t, cell, `matrix-dashboard-stock-${locale}-phone`, locale);
    });
    await h.S.run(`dashboard-finance · ${locale} · phone`, async (t) => {
      // coverage: surface=dashboard-finance locale=fr viewport=phone
      // coverage: surface=dashboard-finance locale=en viewport=phone
      // coverage: surface=dashboard-finance locale=ar viewport=phone
      const cell = await nav.open(t, 'dashboard-finance', locale, 'phone');
      await verify(h, t, cell, `matrix-dashboard-finance-${locale}-phone`, locale);
    });
  }
} finally {
  await h.close();
  await h.S.finish();
}
