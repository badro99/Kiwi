/* Fonts are loaded explicitly rather than left to @font-face + document.fonts.ready.
 * `ready` resolves as soon as no load is *pending*, which on a cold frame is
 * immediately — so a render can and does start on the fallback face and bake a
 * wrong-metrics frame into the master. Loading each FontFace by hand and holding
 * the render handle until all of them resolve is the only version of this that
 * can't race. */
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

Promise.all(
  FACES.map(([family, file, weight]) => {
    const face = new FontFace(family, `url(${staticFile('fonts/' + file)})`, {
      weight,
      style: 'normal',
    });
    return face.load().then((loaded) => {
      document.fonts.add(loaded);
    });
  })
)
  .then(() => continueRender(handle))
  /* A missing face must not hang the render forever — fail loud in the log,
     carry on with the fallback rather than timing out at 30s per frame. */
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('font load failed', err);
    continueRender(handle);
  });
