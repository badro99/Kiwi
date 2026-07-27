import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, F } from '../theme';
import { Grain } from '../grade';
import { MicroLabels } from '../kit';

/* S9 · FIN — everything resolves onto paper. The wordmark lands with weight,
 * the serif line breathes, the tiers sit quietly at the bottom, and the
 * editorial corner labels from the opening return to close the frame. */
export const S9_Fin: React.FC<{ dur?: number }> = ({ dur = 240 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const markIn = spring({ frame: frame - 6, fps, config: { damping: 15, mass: 0.9, stiffness: 150 } });
  const scale = interpolate(markIn, [0, 1], [2.4, 1]);
  const dot = spring({ frame: frame - 30, fps, config: { damping: 11, mass: 0.6, stiffness: 210 } });

  const line = interpolate(frame, [56, 80], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const tiers = interpolate(frame, [96, 118], [0, 0.8], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const labels = interpolate(frame, [110, 132], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  /* no exit — the last frame is the poster, and the film holds on it */
  const creep = interpolate(frame, [0, dur], [1, 1.02]);

  return (
    <AbsoluteFill style={{ background: C.paper }}>
      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          transform: `scale(${creep.toFixed(4)})`,
        }}
      >
        <div style={{ textAlign: 'center', transform: 'translateY(-30px)' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'baseline',
              transform: `scale(${scale.toFixed(3)})`,
              filter: scale > 1.05 ? `blur(${((scale - 1) * 10).toFixed(1)}px)` : undefined,
              opacity: frame < 6 ? 0 : 1,
            }}
          >
            <span
              style={{
                fontFamily: F.sans,
                fontWeight: 700,
                fontSize: 230,
                letterSpacing: '-0.06em',
                color: C.ink,
                lineHeight: 1,
              }}
            >
              kiwi
            </span>
            <span
              style={{
                display: 'inline-block',
                width: 40,
                height: 40,
                marginLeft: 20,
                borderRadius: 22,
                background: C.atlas,
                transform: `scale(${dot.toFixed(3)})`,
                boxShadow: '0 0 40px rgba(11,110,79,.3)',
              }}
            />
          </div>

          <div
            style={{
              marginTop: 40,
              fontFamily: F.sans,
              fontWeight: 500,
              fontSize: 54,
              letterSpacing: '-0.03em',
              color: C.ink,
              opacity: line,
              transform: `translateY(${((1 - line) * 26).toFixed(1)}px)`,
            }}
          >
            Gérez votre café.{' '}
            <span style={{ fontFamily: F.serif, fontStyle: 'normal', fontSize: 60, color: C.atlas }}>
              Simplement.
            </span>
          </div>
        </div>

        <div
          style={{
            position: 'absolute',
            bottom: 96,
            left: 0,
            right: 0,
            textAlign: 'center',
            fontFamily: F.mono,
            fontSize: 19,
            letterSpacing: '.3em',
            color: C.ink,
            opacity: tiers,
          }}
        >
          BASIC 199 · PRO 399 · ULTRA 1 499 MAD / MOIS
        </div>

        <div style={{ opacity: labels }}>
          <MicroLabels items={['KIWI · POS', 'KIWI.MA', 'CASABLANCA']} />
        </div>
      </AbsoluteFill>
      <Grain opacity={0.045} blend="multiply" />
    </AbsoluteFill>
  );
};
