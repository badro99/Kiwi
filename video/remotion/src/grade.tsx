import React from 'react';
import { interpolate, random, useCurrentFrame } from 'remotion';

/* Film grade. The last cut looked cheap for reasons that had nothing to do with
 * layout: flat lighting, no depth cues, no texture, and everything in perfect
 * focus at the same distance. These are the primitives that fix that, in one
 * place so every style test gets the same treatment. */

/* Static turbulence, sampled once. Deterministic per frame index so it never
 * shimmers between renders, but stepped slowly so it reads as grain, not noise. */
export const Grain: React.FC<{ opacity?: number; blend?: string }> = ({
  opacity = 0.055,
  blend = 'overlay',
}) => {
  const frame = useCurrentFrame();
  /* step every 2 frames — grain that changes every frame at 60fps strobes */
  const seed = Math.floor(frame / 2);
  const dx = random(`gx${seed}`) * 200;
  const dy = random(`gy${seed}`) * 200;
  return (
    <div
      style={{
        position: 'absolute',
        inset: -200,
        pointerEvents: 'none',
        opacity,
        mixBlendMode: blend as never,
        backgroundPosition: `${dx.toFixed(1)}px ${dy.toFixed(1)}px`,
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='4'/></filter><rect width='220' height='220' filter='url(%23n)'/></svg>\")",
      }}
    />
  );
};

export const Vignette: React.FC<{ strength?: number; warm?: boolean }> = ({
  strength = 0.55,
  warm = false,
}) => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      background: `radial-gradient(125% 92% at 50% 46%, rgba(0,0,0,0) 40%, rgba(${
        warm ? '24,10,0' : '0,0,0'
      },${strength}) 100%)`,
    }}
  />
);

/* Out-of-focus highlights. Real bokeh is what separates "a rendered rectangle"
 * from "a photographed object" — it gives the frame a background that is
 * physically behind the subject rather than merely underneath it. */
export const Bokeh: React.FC<{
  count?: number;
  hue?: string;
  seed?: string;
  drift?: number;
}> = ({ count = 14, hue = '125,242,176', seed = 'b', drift = 1 }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {new Array(count).fill(0).map((_, i) => {
        const x = random(`${seed}x${i}`) * 116 - 8;
        const y = random(`${seed}y${i}`) * 116 - 8;
        const r = 46 + random(`${seed}r${i}`) * 190;
        const a = 0.06 + random(`${seed}a${i}`) * 0.2;
        const sp = 0.2 + random(`${seed}s${i}`) * 0.5;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${x}%`,
              top: `${y}%`,
              width: r,
              height: r,
              marginLeft: -r / 2,
              marginTop: -r / 2,
              borderRadius: '50%',
              background: `radial-gradient(circle, rgba(${hue},${a}) 0%, rgba(${hue},${
                a * 0.5
              }) 58%, rgba(${hue},0) 72%)`,
              filter: `blur(${(r * 0.06).toFixed(1)}px)`,
              transform: `translate(${(Math.sin(frame / 90 + i) * 14 * drift).toFixed(
                2
              )}px, ${(Math.cos(frame / 110 + i * 1.6) * 11 * drift).toFixed(2)}px)`,
            }}
          />
        );
      })}
    </div>
  );
};

/* A hard key light with falloff — the single cheapest way to make a flat plane
 * read as a lit object. */
export const KeyLight: React.FC<{
  x?: string;
  y?: string;
  size?: string;
  color?: string;
  opacity?: number;
}> = ({ x = '32%', y = '18%', size = '78% 66%', color = '255,246,224', opacity = 0.5 }) => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      background: `radial-gradient(${size} at ${x} ${y}, rgba(${color},${opacity}) 0%, rgba(${color},0) 68%)`,
    }}
  />
);

/* Directional smear standing in for shutter blur. Real per-sample motion blur
 * means rendering each frame N times; for type moving 2000px in 8 frames a
 * blur along the axis of travel is indistinguishable and ~N times cheaper. */
export const useSmear = (velocity: number, max = 26) =>
  `blur(${Math.min(max, Math.abs(velocity) * 0.05).toFixed(2)}px)`;

export const Letterbox: React.FC<{ bars?: number }> = ({ bars = 0 }) =>
  bars > 0 ? (
    <>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: bars, background: '#000' }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: bars, background: '#000' }} />
    </>
  ) : null;

/* Every test opens and closes on the same 12-frame dissolve so the reel reads
 * as four takes of one film, not four separate files. */
export const useShotFade = (dur: number) => {
  const f = useCurrentFrame();
  return interpolate(f, [0, 12, dur - 14, dur], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
};
