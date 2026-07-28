/* Fonts are loaded explicitly rather than left to @font-face + document.fonts.ready.
 * `ready` resolves as soon as no load is *pending*, which on a cold frame is
 * immediately — so a render can start on the fallback face and bake a
 * wrong-metrics frame into the master.
 *
 * The faces ship INSIDE the bundle as base64 data URIs (src/fontdata.ts,
 * ~340 KB for all seven). This is not an optimisation — it is the fix for a
 * render-killing failure class: under a multi-tab render on a busy machine,
 * FontFace.load() against the bundle server's HTTP endpoint was observed to
 * hang forever (three renders died at the delayRender ceiling; a fourth raced
 * out and would have baked fallback faces into the master). A data URI has no
 * network layer, so it cannot hang and cannot lose the race. */
import { continueRender, delayRender } from 'remotion';
import { FONT_DATA } from './fontdata';

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

const uri = (file: string) => `data:font/woff2;base64,${FONT_DATA[file]}`;

/* Belt and braces: register the faces in CSS too, from the same data URIs. */
const style = document.createElement('style');
style.textContent = FACES.map(
  ([family, file, weight]) => `@font-face{font-family:"${family}";font-weight:${weight};
    font-style:normal;font-display:block;src:url("${uri(file)}") format("woff2");}`
).join('\n');
document.head.appendChild(style);

const loadAll = Promise.all(
  FACES.map(([family, file, weight]) =>
    new FontFace(family, `url(${uri(file)})`, { weight, style: 'normal' })
      .load()
      .then((loaded) => {
        document.fonts.add(loaded);
      })
  )
);

loadAll
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[kiwi] font decode failed, continuing on fallback faces', err);
  })
  .finally(() => continueRender(handle));
