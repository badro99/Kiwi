import React from 'react';
import { interpolate, random, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, F } from './theme';

/* The motion kit — the vocabulary the reference film runs on, rebuilt inside
 * the Kiwi brand system. Four ideas carry that whole showreel:
 *
 *  1. type assembles per-letter, each glyph flying its own path with blur;
 *  2. an oversized cursor acts — the UI is used, not displayed;
 *  3. new surfaces arrive as a blob that wipes over the old one;
 *  4. interfaces are photographed objects: tilted, motion-blurred while the
 *     camera moves, lit from one side, defocused when behind the subject.
 */

/* ------------------------------------------------------------------ type -- */

type MotionWordProps = {
  text: string;
  at: number; // frame the assembly starts
  fontSize: number;
  color?: string;
  /* per-letter accent tints, cycled — pass [] for monochrome */
  tints?: string[];
  fontFamily?: string;
  fontWeight?: number;
  letterSpacing?: string;
  scatter?: number; // how far letters start from home, px
  stagger?: number; // frames between letters
  speed?: number; // frames for one letter's flight
  seed?: string;
};

/* Letters converge from scattered positions with directional blur, each on its
 * own delay. This is the reference's "Never" — the word is the destination,
 * not the object. */
export const MotionWord: React.FC<MotionWordProps> = ({
  text,
  at,
  fontSize,
  color = C.ink,
  tints = [],
  fontFamily = F.sans,
  fontWeight = 700,
  letterSpacing = '-0.05em',
  scatter = 420,
  stagger = 2,
  speed = 13,
  seed = 'mw',
}) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: 'flex', whiteSpace: 'pre' }}>
      {text.split('').map((ch, i) => {
        const t0 = at + i * stagger;
        const t = interpolate(frame, [t0, t0 + speed], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        const e = 1 - Math.pow(1 - t, 3.4);
        const dx = (random(`${seed}x${i}`) - 0.5) * 2 * scatter;
        const dy = (random(`${seed}y${i}`) - 0.5) * 2 * scatter;
        const tint = tints.length ? tints[i % tints.length] : color;
        /* blur along the remaining travel — sharpens exactly on landing */
        const rem = Math.hypot(dx, dy) * (1 - e);
        return (
          <span
            key={i}
            style={{
              fontFamily,
              fontWeight,
              fontSize,
              letterSpacing,
              lineHeight: 1,
              color: tint,
              display: 'inline-block',
              transform: `translate(${(dx * (1 - e)).toFixed(1)}px, ${(dy * (1 - e)).toFixed(1)}px)`,
              filter: rem > 2 ? `blur(${Math.min(22, rem * 0.06).toFixed(1)}px)` : undefined,
              opacity: t === 0 ? 0 : 1,
            }}
          >
            {ch}
          </span>
        );
      })}
    </div>
  );
};

/* A word that slams in with squash-and-stretch — for the burst montage. */
export const SlamWord: React.FC<{
  text: string;
  at: number;
  fontSize: number;
  color: string;
  fontFamily?: string;
  fontWeight?: number;
}> = ({ text, at, fontSize, color, fontFamily = F.sans, fontWeight = 700 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - at, fps, config: { damping: 16, mass: 0.7, stiffness: 190 } });
  const scale = interpolate(s, [0, 1], [2.6, 1]);
  const blur = Math.max(0, (scale - 1) * 14);
  return (
    <div
      style={{
        fontFamily,
        fontWeight,
        fontSize,
        letterSpacing: '-0.055em',
        lineHeight: 0.94,
        color,
        transform: `scale(${scale.toFixed(3)}) scaleY(${(1 / Math.max(1, scale * 0.92)).toFixed(3)})`,
        filter: blur > 1 ? `blur(${blur.toFixed(1)}px)` : undefined,
        opacity: frame < at ? 0 : 1,
        textAlign: 'center',
      }}
    >
      {text}
    </div>
  );
};

/* --------------------------------------------------------------- cursor -- */

/* The reference's cursor is huge — a fifth of the frame — because it is an
 * actor, not a UI element. Path is the classic arrow, white-stroked so it
 * survives any background. */
export const Cursor: React.FC<{
  x: number;
  y: number;
  size?: number;
  press?: number; // 0..1, dips the cursor on click
}> = ({ x, y, size = 120, press = 0 }) => (
  <svg
    width={size}
    height={size * 1.5}
    viewBox="0 0 100 150"
    style={{
      position: 'absolute',
      left: x,
      top: y,
      transform: `scale(${(1 - press * 0.16).toFixed(3)})`,
      transformOrigin: '18% 8%',
      filter: 'drop-shadow(0 18px 30px rgba(0,0,0,.45))',
    }}
  >
    <path
      d="M18 8 L18 112 L44 88 L62 130 L80 122 L62 82 L94 80 Z"
      fill={C.ink}
      stroke={C.paper}
      strokeWidth={7}
      strokeLinejoin="round"
    />
  </svg>
);

/* The ring a click leaves behind. */
export const ClickRing: React.FC<{ at: number; x: number; y: number; color?: string }> = ({
  at,
  x,
  y,
  color = C.mint,
}) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [at, at + 34], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  if (t <= 0 || t >= 1) return null;
  const e = 1 - Math.pow(1 - t, 2.4);
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: 60,
        height: 60,
        marginLeft: -30,
        marginTop: -30,
        borderRadius: '50%',
        border: `3px solid ${color}`,
        opacity: 1 - e,
        transform: `scale(${(1 + e * 8).toFixed(2)})`,
      }}
    />
  );
};

/* ------------------------------------------------------------ blob wipe -- */

/* A disc that grows from a point and reveals its children — the reference's
 * OPEN ACCOUNT moment, where the next surface arrives as liquid, not as a cut. */
export const BlobWipe: React.FC<{
  at: number;
  x: string; // origin, e.g. '50%'
  y: string;
  dur?: number;
  children: React.ReactNode;
}> = ({ at, x, y, dur = 26, children }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [at, at + dur], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  if (t <= 0) return null;
  const e = 1 - Math.pow(1 - t, 2.6);
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        clipPath: `circle(${(e * 130).toFixed(1)}% at ${x} ${y})`,
      }}
    >
      {children}
    </div>
  );
};

/* ----------------------------------------------------------- micro labels -- */

/* The editorial frame — tiny mono captions pinning the corners, exactly the
 * register the reference opens on. They make the big moments read as designed
 * rather than merely large. */
export const MicroLabels: React.FC<{
  color?: string;
  opacity?: number;
  items?: [string, string, string];
}> = ({ color = C.ink, opacity = 0.62, items = ['KIWI · POS', 'CASABLANCA', 'EST. 2026'] }) => {
  const base: React.CSSProperties = {
    position: 'absolute',
    top: 34,
    fontFamily: F.mono,
    fontSize: 15,
    letterSpacing: '.3em',
    color,
    opacity,
  };
  return (
    <>
      <div style={{ ...base, left: 52 }}>{items[0]}</div>
      <div style={{ ...base, left: '50%', transform: 'translateX(-50%)' }}>{items[1]}</div>
      <div style={{ ...base, right: 52, letterSpacing: '.3em' }}>{items[2]}</div>
    </>
  );
};

/* --------------------------------------------------------- depth cards -- */

/* Defocused KPI cards floating behind the subject — the reference's trading
 * scene backgrounds. Blur + dim + slow parallax is what makes the crisp
 * foreground read as photographed. */
export const DepthCard: React.FC<{
  x: number;
  y: number;
  w?: number;
  title: string;
  value: string;
  trend?: 'up' | 'down';
  blur?: number;
  dim?: number;
  drift?: number;
  seed?: string;
  rot?: number;
}> = ({ x, y, w = 380, title, value, trend = 'up', blur = 7, dim = 0.55, drift = 1, seed = 'd', rot = 0 }) => {
  const frame = useCurrentFrame();
  const fx = Math.sin(frame / 130 + random(`${seed}p`) * 9) * 12 * drift;
  const fy = Math.cos(frame / 150 + random(`${seed}q`) * 9) * 9 * drift;
  /* deterministic sparkline */
  const pts = new Array(9)
    .fill(0)
    .map((_, i) => {
      const v = random(`${seed}s${i}`) * 26 + (trend === 'up' ? -i * 1.8 : i * 1.8);
      return `${i * 14},${(30 + v * 0.6).toFixed(1)}`;
    })
    .join(' ');
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        padding: '26px 30px',
        borderRadius: 20,
        background: 'linear-gradient(155deg, rgba(18,42,33,.92), rgba(6,20,15,.88))',
        boxShadow: '0 40px 70px -30px rgba(0,0,0,.8), 0 0 0 1px rgba(125,242,176,.10)',
        transform: `translate(${fx.toFixed(1)}px, ${fy.toFixed(1)}px) rotate(${rot}deg)`,
        filter: `blur(${blur}px) brightness(${1 - dim * 0.5})`,
        opacity: 1 - dim * 0.35,
      }}
    >
      <div style={{ fontFamily: F.mono, fontSize: 14, letterSpacing: '.24em', color: 'rgba(247,245,240,.55)' }}>
        {title}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 12 }}>
        <div
          style={{
            fontFamily: F.sans,
            fontWeight: 600,
            fontSize: 34,
            letterSpacing: '-0.03em',
            color: C.paper,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {value}
        </div>
        <svg width={116} height={44} viewBox="0 0 116 44">
          <polyline
            points={pts}
            fill="none"
            stroke={trend === 'up' ? C.mint : '#E0A23E'}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------ tilt panel -- */

/* A UI surface photographed in 3D. `travel` is the camera's velocity signal —
 * pass the derivative of whatever drives the move and the whole plane smears
 * while in motion, then snaps sharp, which is the single strongest cue in the
 * reference that these interfaces are objects. */
export const TiltPanel: React.FC<{
  rotX?: number;
  rotY?: number;
  z?: number;
  travel?: number;
  glow?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ rotX = 8, rotY = -14, z = 0, travel = 0, glow = '125,242,176', children, style }) => (
  <div
    style={{
      transform: `perspective(1700px) rotateX(${rotX}deg) rotateY(${rotY}deg) translateZ(${z}px)`,
      filter: Math.abs(travel) > 0.5 ? `blur(${Math.min(16, Math.abs(travel) * 0.9).toFixed(1)}px)` : undefined,
      boxShadow: `0 90px 140px -50px rgba(0,0,0,.85), 0 0 0 1px rgba(${glow},.14), inset 0 1px 0 rgba(255,255,255,.09)`,
      borderRadius: 26,
      ...style,
    }}
  >
    {children}
  </div>
);

/* French-grouped money with stepped centimes. */
export const fmtMAD = (v: number) => {
  const [int, cent] = v.toFixed(2).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return { grouped, cent };
};
