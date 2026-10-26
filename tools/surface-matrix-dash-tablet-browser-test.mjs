#!/usr/bin/env node
import { forLocales } from './test-locales.mjs';
// Every dashboard destination at tablet size, in French, English and Arabic: a real
// Chromium demo session walks the sidebar the way a merchant does, and each
// destination must declare its language and direction, paint, not scroll
// sideways, and pass axe-core (browser-trace records a failing visit).
import { harness, dashboardWalker, verify } from './surface-matrix-lib.mjs';

const h = await harness('surface-matrix-dash-tablet');
const nav = dashboardWalker(h);
try {
  for (const locale of forLocales(['fr', 'en', 'ar'])) {
    await h.S.run(`dashboard-transactions · ${locale} · tablet`, async (t) => {
      // coverage: surface=dashboard-transactions locale=fr viewport=tablet
      // coverage: surface=dashboard-transactions locale=en viewport=tablet
      // coverage: surface=dashboard-transactions locale=ar viewport=tablet
      const cell = await nav.open(t, 'dashboard-transactions', locale, 'tablet');
      await verify(h, t, cell, `matrix-dashboard-transactions-${locale}-tablet`, locale);
    });
    await h.S.run(`dashboard-rapport · ${locale} · tablet`, async (t) => {
      // coverage: surface=dashboard-rapport locale=fr viewport=tablet
      // coverage: surface=dashboard-rapport locale=en viewport=tablet
      // coverage: surface=dashboard-rapport locale=ar viewport=tablet
      const cell = await nav.open(t, 'dashboard-rapport', locale, 'tablet');
      await verify(h, t, cell, `matrix-dashboard-rapport-${locale}-tablet`, locale);
    });
    await h.S.run(`dashboard-terminaux · ${locale} · tablet`, async (t) => {
      // coverage: surface=dashboard-terminaux locale=fr viewport=tablet
      // coverage: surface=dashboard-terminaux locale=en viewport=tablet
      // coverage: surface=dashboard-terminaux locale=ar viewport=tablet
      const cell = await nav.open(t, 'dashboard-terminaux', locale, 'tablet');
      await verify(h, t, cell, `matrix-dashboard-terminaux-${locale}-tablet`, locale);
    });
    await h.S.run(`dashboard-conformite · ${locale} · tablet`, async (t) => {
      // coverage: surface=dashboard-conformite locale=fr viewport=tablet
      // coverage: surface=dashboard-conformite locale=en viewport=tablet
      // coverage: surface=dashboard-conformite locale=ar viewport=tablet
      const cell = await nav.open(t, 'dashboard-conformite', locale, 'tablet');
      await verify(h, t, cell, `matrix-dashboard-conformite-${locale}-tablet`, locale);
    });
    await h.S.run(`dashboard-equipe · ${locale} · tablet`, async (t) => {
      // coverage: surface=dashboard-equipe locale=fr viewport=tablet
      // coverage: surface=dashboard-equipe locale=en viewport=tablet
      // coverage: surface=dashboard-equipe locale=ar viewport=tablet
      const cell = await nav.open(t, 'dashboard-equipe', locale, 'tablet');
      await verify(h, t, cell, `matrix-dashboard-equipe-${locale}-tablet`, locale);
    });
    await h.S.run(`dashboard-payroll · ${locale} · tablet`, async (t) => {
      // coverage: surface=dashboard-payroll locale=fr viewport=tablet
      // coverage: surface=dashboard-payroll locale=en viewport=tablet
      // coverage: surface=dashboard-payroll locale=ar viewport=tablet
      const cell = await nav.open(t, 'dashboard-payroll', locale, 'tablet');
      await verify(h, t, cell, `matrix-dashboard-payroll-${locale}-tablet`, locale);
    });
    await h.S.run(`dashboard-reservations · ${locale} · tablet`, async (t) => {
      // coverage: surface=dashboard-reservations locale=fr viewport=tablet
      // coverage: surface=dashboard-reservations locale=en viewport=tablet
      // coverage: surface=dashboard-reservations locale=ar viewport=tablet
      const cell = await nav.open(t, 'dashboard-reservations', locale, 'tablet');
      await verify(h, t, cell, `matrix-dashboard-reservations-${locale}-tablet`, locale);
    });
    await h.S.run(`dashboard-tables · ${locale} · tablet`, async (t) => {
      // coverage: surface=dashboard-tables locale=fr viewport=tablet
      // coverage: surface=dashboard-tables locale=en viewport=tablet
      // coverage: surface=dashboard-tables locale=ar viewport=tablet
      const cell = await nav.open(t, 'dashboard-tables', locale, 'tablet');
      await verify(h, t, cell, `matrix-dashboard-tables-${locale}-tablet`, locale);
    });
    await h.S.run(`dashboard-menu · ${locale} · tablet`, async (t) => {
      // coverage: surface=dashboard-menu locale=fr viewport=tablet
      // coverage: surface=dashboard-menu locale=en viewport=tablet
      // coverage: surface=dashboard-menu locale=ar viewport=tablet
      const cell = await nav.open(t, 'dashboard-menu', locale, 'tablet');
      await verify(h, t, cell, `matrix-dashboard-menu-${locale}-tablet`, locale);
    });
    await h.S.run(`dashboard-stock · ${locale} · tablet`, async (t) => {
      // coverage: surface=dashboard-stock locale=fr viewport=tablet
      // coverage: surface=dashboard-stock locale=en viewport=tablet
      // coverage: surface=dashboard-stock locale=ar viewport=tablet
      const cell = await nav.open(t, 'dashboard-stock', locale, 'tablet');
      await verify(h, t, cell, `matrix-dashboard-stock-${locale}-tablet`, locale);
    });
    await h.S.run(`dashboard-finance · ${locale} · tablet`, async (t) => {
      // coverage: surface=dashboard-finance locale=fr viewport=tablet
      // coverage: surface=dashboard-finance locale=en viewport=tablet
      // coverage: surface=dashboard-finance locale=ar viewport=tablet
      const cell = await nav.open(t, 'dashboard-finance', locale, 'tablet');
      await verify(h, t, cell, `matrix-dashboard-finance-${locale}-tablet`, locale);
    });
  }
} finally {
  await h.close();
  await h.S.finish();
}
