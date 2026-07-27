import React from 'react';
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, F } from '../theme';
import { Grain, Vignette } from '../grade';

/* The photo engine for the 2-minute film. Eleven AI stills carry the real-world
 * half of the story; this wrapper is what makes them read as one film rather
 * than eleven stock frames: a constant-speed Ken Burns drift, a riad wash that
 * pulls every photo toward the brand palette, a bottom shade that holds type,
 * and the same vignette + grain the UI scenes wear. */

export const PhotoScene: React.FC<{
  src: string;
  dur: number;
  zoom?: [number, number];
  focus?: [number, number]; // transform-origin, in %
  shade?: number; // bottom gradient strength for type legibility
  topShade?: number;
  wash?: number; // riad soft-light wash
  children?: React.ReactNode;
}> = ({ src, dur, zoom = [1.06, 1.16], focus = [50, 50], shade = 0.55, topShade = 0.3, wash = 0.18, children }) => {
  const frame = useCurrentFrame();
  /* linear drift — eased camera moves read mechanical on a still */
  const scale = interpolate(frame, [0, dur], zoom, { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ background: '#050B08', overflow: 'hidden' }}>
      <Img
        src={staticFile(src)}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: `scale(${scale.toFixed(4)})`,
          transformOrigin: `${focus[0]}% ${focus[1]}%`,
        }}
      />
      <div style={{ position: 'absolute', inset: 0, background: C.riad, opacity: wash, mixBlendMode: 'soft-light' }} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(180deg, rgba(3,8,6,${topShade}) 0%, rgba(3,8,6,0) 26%, rgba(3,8,6,0) 56%, rgba(3,8,6,${shade}) 100%)`,
        }}
      />
      {children}
      <Vignette strength={0.58} />
      <Grain opacity={0.07} />
    </AbsoluteFill>
  );
};

/* A headline over a photograph — sans base with the serif accent word upright,
 * rising in on a short ease. `out` fades it away for two-line scenes. */
export const Headline: React.FC<{
  at: number;
  parts: { t: string; serif?: boolean }[];
  size?: number;
  bottom?: number;
  top?: number;
  out?: number;
}> = ({ at, parts, size = 64, bottom = 120, top, out }) => {
  const frame = useCurrentFrame();
  const inT = interpolate(frame, [at, at + 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const e = 1 - Math.pow(1 - inT, 3);
  const gone =
    out === undefined
      ? 0
      : interpolate(frame, [out, out + 14], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  if (e <= 0 || gone >= 1) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        ...(top !== undefined ? { top } : { bottom }),
        textAlign: 'center',
        opacity: e * (1 - gone),
        transform: `translateY(${((1 - e) * 26 - gone * 14).toFixed(1)}px)`,
      }}
    >
      <span
        style={{
          fontFamily: F.sans,
          fontWeight: 500,
          fontSize: size,
          letterSpacing: '-0.025em',
          color: C.paper,
          textShadow: '0 3px 26px rgba(0,0,0,.38)',
        }}
      >
        {parts.map((p, i) =>
          p.serif ? (
            <span
              key={i}
              style={{ fontFamily: F.serif, fontStyle: 'normal', fontSize: size * 1.12, color: C.mint }}
            >
              {p.t}
            </span>
          ) : (
            <span key={i}>{p.t}</span>
          )
        )}
      </span>
    </div>
  );
};

/* A small editorial mono tag pinned wherever the scene needs a timestamp or a
 * caption — the corner-label register from the reference. */
export const Tag: React.FC<{
  at: number;
  text: string;
  x?: number;
  y?: number;
  right?: number;
  bottom?: number;
  color?: string;
}> = ({ at, text, x = 52, y = 40, right, bottom, color = 'rgba(247,245,240,.78)' }) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [at, at + 16], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div
      style={{
        position: 'absolute',
        ...(right !== undefined ? { right } : { left: x }),
        ...(bottom !== undefined ? { bottom } : { top: y }),
        fontFamily: F.mono,
        fontSize: 16,
        letterSpacing: '.3em',
        color,
        opacity: o,
        textShadow: '0 2px 14px rgba(0,0,0,.55)',
      }}
    >
      {text}
    </div>
  );
};

/* A floating UI chip that springs in over the photograph — the product's
 * presence inside the real world. */
export const Chip: React.FC<{
  at: number;
  x: number | string;
  y: number | string;
  text: string;
  dot?: boolean;
  mint?: boolean;
  size?: number;
  out?: number;
}> = ({ at, x, y, text, dot = true, mint = false, size = 19, out }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - at, fps, config: { damping: 15, mass: 0.6, stiffness: 170 } });
  const gone =
    out === undefined
      ? 0
      : interpolate(frame, [out, out + 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  if (frame < at || gone >= 1) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '16px 26px',
        borderRadius: 100,
        background: mint ? 'rgba(11,110,79,.88)' : 'rgba(6,18,13,.82)',
        boxShadow: `0 24px 50px -18px rgba(0,0,0,.75), 0 0 0 1px rgba(125,242,176,${mint ? '.45' : '.22'}), inset 0 1px 0 rgba(255,255,255,.12)`,
        transform: `scale(${s.toFixed(3)})`,
        opacity: 1 - gone,
      }}
    >
      {dot ? (
        <div
          style={{
            width: 9,
            height: 9,
            borderRadius: 5,
            background: C.mint,
            boxShadow: '0 0 12px rgba(125,242,176,.8)',
          }}
        />
      ) : null}
      <span
        style={{
          fontFamily: F.sans,
          fontWeight: 500,
          fontSize: size,
          letterSpacing: '-0.01em',
          color: C.paper,
          whiteSpace: 'nowrap',
        }}
      >
        {text}
      </span>
    </div>
  );
};

/* English-grouped money. */
export const fmtEN = (v: number) => {
  const [int, cent] = v.toFixed(2).split('.');
  return { grouped: int.replace(/\B(?=(\d{3})+(?!\d))/g, ','), cent };
};
