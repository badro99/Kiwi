#!/usr/bin/env node
// The tills at phone size, in French, English and Arabic: restaurant, boutique,
// pressing, hotel and the épicerie's credit book, each opened in a fresh
// Chromium demo page through its real entry (browser-trace records a failing
// visit) and held to the same four checks as the dashboard matrix.
import { harness, openTill, verify } from './surface-matrix-lib.mjs';

const h = await harness('surface-matrix-till-phone');
const tills = { open: (t, surface, locale, viewport) => openTill(h, t, surface, locale, viewport) };
try {
  for (const locale of ['fr', 'en', 'ar']) {
    await h.S.run(`caisse-restaurant · ${locale} · phone`, async (t) => {
      // coverage: surface=caisse-restaurant locale=fr viewport=phone
      // coverage: surface=caisse-restaurant locale=en viewport=phone
      // coverage: surface=caisse-restaurant locale=ar viewport=phone
      const cell = await tills.open(t, 'caisse-restaurant', locale, 'phone');
      await verify(h, t, cell, `matrix-caisse-restaurant-${locale}-phone`, locale);
    });
    await h.S.run(`caisse-boutique · ${locale} · phone`, async (t) => {
      // coverage: surface=caisse-boutique locale=fr viewport=phone
      // coverage: surface=caisse-boutique locale=en viewport=phone
      // coverage: surface=caisse-boutique locale=ar viewport=phone
      const cell = await tills.open(t, 'caisse-boutique', locale, 'phone');
      await verify(h, t, cell, `matrix-caisse-boutique-${locale}-phone`, locale);
    });
    await h.S.run(`caisse-pressing · ${locale} · phone`, async (t) => {
      // coverage: surface=caisse-pressing locale=fr viewport=phone
      // coverage: surface=caisse-pressing locale=en viewport=phone
      // coverage: surface=caisse-pressing locale=ar viewport=phone
      const cell = await tills.open(t, 'caisse-pressing', locale, 'phone');
      await verify(h, t, cell, `matrix-caisse-pressing-${locale}-phone`, locale);
    });
    await h.S.run(`caisse-hotel · ${locale} · phone`, async (t) => {
      // coverage: surface=caisse-hotel locale=fr viewport=phone
      // coverage: surface=caisse-hotel locale=en viewport=phone
      // coverage: surface=caisse-hotel locale=ar viewport=phone
      const cell = await tills.open(t, 'caisse-hotel', locale, 'phone');
      await verify(h, t, cell, `matrix-caisse-hotel-${locale}-phone`, locale);
    });
    await h.S.run(`credit-book · ${locale} · phone`, async (t) => {
      // coverage: surface=credit-book locale=fr viewport=phone
      // coverage: surface=credit-book locale=en viewport=phone
      // coverage: surface=credit-book locale=ar viewport=phone
      const cell = await tills.open(t, 'credit-book', locale, 'phone');
      await verify(h, t, cell, `matrix-credit-book-${locale}-phone`, locale);
    });
  }
} finally {
  await h.close();
  await h.S.finish();
}
