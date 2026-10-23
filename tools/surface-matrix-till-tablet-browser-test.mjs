#!/usr/bin/env node
// The tills at tablet size, in French, English and Arabic: restaurant, boutique,
// pressing, hotel and the épicerie's credit book, each opened in a fresh
// Chromium demo page through its real entry (browser-trace records a failing
// visit) and held to the same four checks as the dashboard matrix.
import { harness, openTill, verify } from './surface-matrix-lib.mjs';

const h = await harness('surface-matrix-till-tablet');
const tills = { open: (t, surface, locale, viewport) => openTill(h, t, surface, locale, viewport) };
try {
  for (const locale of ['fr', 'en', 'ar']) {
    await h.S.run(`caisse-restaurant · ${locale} · tablet`, async (t) => {
      // coverage: surface=caisse-restaurant locale=fr viewport=tablet
      // coverage: surface=caisse-restaurant locale=en viewport=tablet
      // coverage: surface=caisse-restaurant locale=ar viewport=tablet
      const cell = await tills.open(t, 'caisse-restaurant', locale, 'tablet');
      await verify(h, t, cell, `matrix-caisse-restaurant-${locale}-tablet`, locale);
    });
    await h.S.run(`caisse-boutique · ${locale} · tablet`, async (t) => {
      // coverage: surface=caisse-boutique locale=fr viewport=tablet
      // coverage: surface=caisse-boutique locale=en viewport=tablet
      // coverage: surface=caisse-boutique locale=ar viewport=tablet
      const cell = await tills.open(t, 'caisse-boutique', locale, 'tablet');
      await verify(h, t, cell, `matrix-caisse-boutique-${locale}-tablet`, locale);
    });
    await h.S.run(`caisse-pressing · ${locale} · tablet`, async (t) => {
      // coverage: surface=caisse-pressing locale=fr viewport=tablet
      // coverage: surface=caisse-pressing locale=en viewport=tablet
      // coverage: surface=caisse-pressing locale=ar viewport=tablet
      const cell = await tills.open(t, 'caisse-pressing', locale, 'tablet');
      await verify(h, t, cell, `matrix-caisse-pressing-${locale}-tablet`, locale);
    });
    await h.S.run(`caisse-hotel · ${locale} · tablet`, async (t) => {
      // coverage: surface=caisse-hotel locale=fr viewport=tablet
      // coverage: surface=caisse-hotel locale=en viewport=tablet
      // coverage: surface=caisse-hotel locale=ar viewport=tablet
      const cell = await tills.open(t, 'caisse-hotel', locale, 'tablet');
      await verify(h, t, cell, `matrix-caisse-hotel-${locale}-tablet`, locale);
    });
    await h.S.run(`credit-book · ${locale} · tablet`, async (t) => {
      // coverage: surface=credit-book locale=fr viewport=tablet
      // coverage: surface=credit-book locale=en viewport=tablet
      // coverage: surface=credit-book locale=ar viewport=tablet
      const cell = await tills.open(t, 'credit-book', locale, 'tablet');
      await verify(h, t, cell, `matrix-credit-book-${locale}-tablet`, locale);
    });
  }
} finally {
  await h.close();
  await h.S.finish();
}
