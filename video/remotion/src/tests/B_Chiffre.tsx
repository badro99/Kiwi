import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { C, F } from '../theme';
import { Grain, useShotFade } from '../grade';

/* B · LE CHIFFRE — Swiss kinetic typography. No UI at all.
 *
 * The story is the economics, told at 500px. Hard cuts on a fixed beat, type
 * entering fast enough to smear. The whole argument in four words. */

type Beat = { at: number; text: string; sub?: string; size: number; serif?: boolean };

/* an 8-frame beat at 60fps ≈ 133ms — fast enough to feel like a cut, slow
   enough to read a single word */
const BEATS: Beat[] = [
  { at: 14, text: 'Square', size: 190 },
  { at: 62, text: 'Toast', size: 190 },
  { at: 110, text: 'Lightspeed', size: 150 },
  { at: 162, text: 'Aucun', sub: 'ne vend au Maroc.', size: 210, serif: true },
];

export const B_Chiffre: React.FC<{ dur?: number }> = ({ dur = 300 }) => {
  const frame = useCurrentFrame();
  const fade = useShotFade(dur);

  /* the last beat holds; the ones before it are struck through and swept out */
  return (
    <AbsoluteFill
      style={{
        background: C.paper,
        opacity: fade,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {/* a single moving atlas bar behind the type — the only non-type element */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          height: 348,
          top: '50%',
          marginTop: -174,
          background: C.atlas,
          transform: `scaleX(${interpolate(frame, [160, 190], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }).toFixed(4)})`,
          transformOrigin: '0% 50%',
        }}
      />

      {BEATS.map((b, i) => {
        const last = i === BEATS.length - 1;
        const out = last ? 1e9 : BEATS[i + 1].at - 2;
        const local = frame - b.at;
        const alive = frame >= b.at && frame < out;
        if (!alive) return null;

        /* fly in from the right, decelerate hard, then leave left */
        const inT = interpolate(local, [0, 11], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        const eased = 1 - Math.pow(1 - inT, 4);
        const life = out - b.at;
        const outT = last
          ? 0
          : interpolate(local, [life - 9, life], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
        const x = (1 - eased) * 1500 - outT * 1500;
        /* smear along the axis of travel — the frame-to-frame velocity, not a
           constant, so it sharpens exactly as the word lands */
        const vel = Math.abs((1 - eased) * 1500) * (1 - inT) + outT * 900;

        return (
          <div
            key={b.text}
            style={{
              position: 'absolute',
              textAlign: 'center',
              transform: `translateX(${x.toFixed(1)}px)`,
              filter: `blur(${Math.min(30, vel * 0.03).toFixed(2)}px)`,
            }}
          >
            <div
              style={{
                fontFamily: b.serif ? F.serif : F.sans,
                fontStyle: 'normal',
                fontWeight: b.serif ? 400 : 700,
                fontSize: last ? 168 : b.size,
                letterSpacing: b.serif ? '-0.01em' : '-0.06em',
                lineHeight: 0.92,
                color: last ? C.paper : C.ink,
                /* the competitors get struck out as they leave */
                textDecoration: last ? 'none' : 'line-through',
                textDecorationThickness: last ? undefined : '9px',
                textDecorationColor: 'rgba(192,68,47,.9)',
              }}
            >
              {b.text}
            </div>
            {b.sub && (
              <div
                style={{
                  fontFamily: F.sans,
                  fontWeight: 500,
                  fontSize: 66,
                  letterSpacing: '-0.035em',
                  color: C.paper,
                  marginTop: 6,
                  opacity: interpolate(local, [14, 30], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  }),
                }}
              >
                {b.sub}
              </div>
            )}
          </div>
        );
      })}

      {/* the turn, bottom-left, small — the only quiet thing in the shot */}
      <div
        style={{
          position: 'absolute',
          left: 96,
          bottom: 84,
          fontFamily: F.mono,
          fontSize: 19,
          letterSpacing: '.3em',
          color: C.ink,
          opacity: interpolate(frame, [230, 254], [0, 0.8], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
        }}
      >
        KIWI · 199 MAD / MOIS
      </div>

      <Grain opacity={0.045} blend="multiply" />
    </AbsoluteFill>
  );
};
