#!/usr/bin/env node
import { forLocales } from './test-locales.mjs';
// The tills at desktop size, in French, English and Arabic: restaurant, boutique,
// pressing, hotel and the épicerie's credit book, each opened in a fresh
// Chromium demo page through its real entry (browser-trace records a failing
// visit) and held to the same four checks as the dashboard matrix.
import { harness, openTill, verify } from './surface-matrix-lib.mjs';

const h = await harness('surface-matrix-till-desktop');
const tills = { open: (t, surface, locale, viewport) => openTill(h, t, surface, locale, viewport) };
try {
  for (const locale of forLocales(['fr', 'en', 'ar'])) {
    await h.S.run(`caisse-restaurant · ${locale} · desktop`, async (t) => {
      // coverage: surface=caisse-restaurant locale=fr viewport=desktop
      // coverage: surface=caisse-restaurant locale=en viewport=desktop
      // coverage: surface=caisse-restaurant locale=ar viewport=desktop
      const cell = await tills.open(t, 'caisse-restaurant', locale, 'desktop');
      await verify(h, t, cell, `matrix-caisse-restaurant-${locale}-desktop`, locale);
    });
    await h.S.run(`caisse-boutique · ${locale} · desktop`, async (t) => {
      // coverage: surface=caisse-boutique locale=fr viewport=desktop
      // coverage: surface=caisse-boutique locale=en viewport=desktop
      // coverage: surface=caisse-boutique locale=ar viewport=desktop
      const cell = await tills.open(t, 'caisse-boutique', locale, 'desktop');
      await verify(h, t, cell, `matrix-caisse-boutique-${locale}-desktop`, locale);
    });
    await h.S.run(`caisse-pressing · ${locale} · desktop`, async (t) => {
      // coverage: surface=caisse-pressing locale=fr viewport=desktop
      // coverage: surface=caisse-pressing locale=en viewport=desktop
      // coverage: surface=caisse-pressing locale=ar viewport=desktop
      const cell = await tills.open(t, 'caisse-pressing', locale, 'desktop');
      await verify(h, t, cell, `matrix-caisse-pressing-${locale}-desktop`, locale);
    });
    await h.S.run(`caisse-hotel · ${locale} · desktop`, async (t) => {
      // coverage: surface=caisse-hotel locale=fr viewport=desktop
      // coverage: surface=caisse-hotel locale=en viewport=desktop
      // coverage: surface=caisse-hotel locale=ar viewport=desktop
      const cell = await tills.open(t, 'caisse-hotel', locale, 'desktop');
      await verify(h, t, cell, `matrix-caisse-hotel-${locale}-desktop`, locale);
    });
    await h.S.run(`credit-book · ${locale} · desktop`, async (t) => {
      // coverage: surface=credit-book locale=fr viewport=desktop
      // coverage: surface=credit-book locale=en viewport=desktop
      // coverage: surface=credit-book locale=ar viewport=desktop
      const cell = await tills.open(t, 'credit-book', locale, 'desktop');
      await verify(h, t, cell, `matrix-credit-book-${locale}-desktop`, locale);
    });
  }
} finally {
  await h.close();
  await h.S.finish();
}
