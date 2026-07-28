/* Fonts are loaded explicitly rather than left to @font-face + document.fonts.ready.
 * `ready` resolves as soon as no load is *pending*, which on a cold frame is
 * immediately — so a render can start on the fallback face and bake a
 * wrong-metrics frame into the master.
 *
 * Two guards matter here and only one of them is obvious:
 *  1. a .catch, for a face that REJECTS;
 *  2. a timeout, for a face that never settles at all.
 * Only (1) was here at first, and a hung request took the whole render down
 * with "delayRender was called but not cleared after 28000ms". A promise that
 * never settles never reaches .catch — it has to be raced. */
import { continueRender, delayRender, staticFile } from 'remotion';

const handle = delayRender('Loading Kiwi typefaces');

const FACES: [string, string, string][] = [
  ['Inter Tight', 'InterTight-400-normal.woff2', '400'],
  ['Inter Tight', 'InterTight-500-normal.woff2', '500'],
  ['Inter Tight', 'InterTight-600-normal.woff2', '600'],
  ['Inter Tight', 'InterTight-700-normal.woff2', '700'],
  ['Instrument Serif', 'InstrumentSerif-400-normal.woff2', '400'],
  ['JetBrains Mono', 'JetBrainsMono-400-normal.woff2', '400'],
  ['JetBrains Mono', 'JetBrainsMono-500-normal.woff2', '500'],
];

/* Also register the faces in CSS. Belt and braces: if the scripted load is the
 * thing that misbehaves, the browser still has a declaration to resolve from. */
const style = document.createElement('style');
style.textContent = FACES.map(
  ([family, file, weight]) => `@font-face{font-family:"${family}";font-weight:${weight};
    font-style:normal;font-display:block;src:url("${staticFile('fonts/' + file)}") format("woff2");}`
).join('\n');
document.head.appendChild(style);

/* Each face races a 25 s in-page ceiling. The config-level ceiling
 * (setDelayRenderTimeoutInMilliseconds) is a guillotine — when one tab's
 * FontFace.load() hangs (observed twice on the 2-minute render, with a second
 * session's studio sharing the machine), it kills the whole render. Racing out
 * a single face degrades exactly one thing: that tab falls back to the CSS
 * @font-face declaration above, which still applies the face if the fetch ever
 * completes. In-page setTimeout does fire during a render — Remotion drives the
 * animation clock, not the page's timers. */
const withCeiling = (p: Promise<unknown>, label: string) =>
  Promise.race([
    p,
    new Promise<void>((resolve) =>
      setTimeout(() => {
        // eslint-disable-next-line no-console
        console.error(`[kiwi] ${label} did not settle in 25s — continuing on the CSS declaration`);
        resolve();
      }, 25000)
    ),
  ]);

const loadAll = Promise.all(
  FACES.map(([family, file, weight]) =>
    withCeiling(
      new FontFace(family, `url(${staticFile('fonts/' + file)})`, { weight, style: 'normal' })
        .load()
        .then((loaded) => {
          document.fonts.add(loaded);
        }),
      `${family} ${weight}`
    )
  )
);

loadAll
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[kiwi] font load failed, continuing on fallback faces', err);
  })
  .finally(() => continueRender(handle));
