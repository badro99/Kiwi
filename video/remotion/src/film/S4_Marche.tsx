import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { C, F } from '../theme';
import { Grain } from '../grade';
import { MotionWord } from '../kit';

/* S4 · LE MARCHÉ — the argument, at the reference's tempo. Each competitor
 * assembles per-letter, takes a strike, and is swept off; the answer lands on
 * an atlas bar. This is test B rebuilt with the per-letter vocabulary. */

type Beat = { text: string; at: number; out: number; size: number };
const BEATS: Beat[] = [
  { text: 'Square', at: 4, out: 52, size: 200 },
  { text: 'Toast', at: 56, out: 104, size: 200 },
  { text: 'Lightspeed', at: 108, out: 158, size: 156 },
];

export const S4_Marche: React.FC<{ dur?: number }> = ({ dur = 220 }) => {
  const frame = useCurrentFrame();

  const bar = interpolate(frame, [158, 184], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const barE = 1 - Math.pow(1 - bar, 3);
  const sub = interpolate(frame, [188, 204], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const foot = interpolate(frame, [198, 214], [0, 0.85], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: C.paper, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {BEATS.map((b, bi) => {
        if (frame < b.at || frame > b.out + 14) return null;
        /* the strike: a red rule drawn through, then the word is swept left */
        const strike = interpolate(frame, [b.out - 18, b.out - 8], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        const sweepT = interpolate(frame, [b.out - 4, b.out + 12], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        const sweep = Math.pow(sweepT, 2.2);
        return (
          <div
            key={b.text}
            style={{
              position: 'absolute',
              transform: `translateX(${(-sweep * 1900).toFixed(1)}px)`,
              filter: sweep > 0.02 ? `blur(${(sweep * 26).toFixed(1)}px)` : undefined,
              opacity: strike > 0 ? 1 - strike * 0.45 : 1,
            }}
          >
            <MotionWord
              text={b.text}
              at={b.at}
              fontSize={b.size}
              color={C.ink}
              fontWeight={700}
              scatter={480}
              stagger={2}
              speed={12}
              seed={`m${bi}`}
            />
            <div
              style={{
                position: 'absolute',
                left: '-3%',
                top: '50%',
                height: 12,
                width: `${(strike * 106).toFixed(1)}%`,
                background: 'rgba(192,68,47,.92)',
                borderRadius: 6,
              }}
            />
          </div>
        );
      })}

      {/* the answer */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: '50%',
          height: 400,
          marginTop: -200,
          background: C.atlas,
          transform: `scaleX(${barE.toFixed(4)})`,
          transformOrigin: '0% 50%',
        }}
      />
      {frame >= 162 && (
        <div style={{ position: 'absolute', textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <MotionWord
              text="Aucun"
              at={166}
              fontSize={172}
              color={C.paper}
              fontFamily={F.serif}
              fontWeight={400}
              letterSpacing="-0.01em"
              scatter={340}
              stagger={2}
              speed={11}
              seed="aucun"
            />
          </div>
          <div
            style={{
              fontFamily: F.sans,
              fontWeight: 500,
              fontSize: 64,
              letterSpacing: '-0.035em',
              color: C.mint,
              marginTop: 8,
              opacity: sub,
              transform: `translateY(${((1 - sub) * 30).toFixed(1)}px)`,
            }}
          >
            ne vend au Maroc.
          </div>
        </div>
      )}

      <div
        style={{
          position: 'absolute',
          left: 96,
          bottom: 84,
          fontFamily: F.mono,
          fontSize: 19,
          letterSpacing: '.3em',
          color: C.ink,
          opacity: foot,
        }}
      >
        KIWI · À PARTIR DE 199 MAD / MOIS
      </div>

      <Grain opacity={0.045} blend="multiply" />
    </AbsoluteFill>
  );
};
