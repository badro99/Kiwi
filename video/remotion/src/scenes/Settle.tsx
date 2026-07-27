import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, F, SPRING } from '../theme';
import { Caption } from '../Caption';

/* The money actually arriving. Everything before this beat is measurement; this
 * is the one that answers "and when do I get paid". */
export const Settle: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const card = spring({ frame: frame - 6, fps, config: SPRING, durationInFrames: 46 });
  const runT = interpolate(frame, [20, 118], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const amount = 47320 * (1 - Math.pow(1 - runT, 3));
  const track = interpolate(frame, [58, 150], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const out = interpolate(frame, [268, 296], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: C.paperDeep,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(70% 55% at 50% 46%, rgba(255,255,255,.9) 0%, rgba(239,235,227,0) 74%)',
        }}
      />
      <div
        style={{
          width: 760,
          borderRadius: 22,
          background: C.paper,
          border: `1px solid ${C.line}`,
          boxShadow: '0 44px 90px -40px rgba(10,15,13,.36)',
          padding: '38px 44px 34px',
          marginTop: -40,
          opacity: card * out,
          transform: `translateY(${((1 - card) * 30).toFixed(2)}px) scale(${(
            0.97 +
            card * 0.03
          ).toFixed(4)})`,
        }}
      >
        <div
          style={{
            fontFamily: F.mono,
            fontSize: 11.5,
            letterSpacing: '.2em',
            color: C.inkFaint,
          }}
        >
          VIREMENT · T+1
        </div>
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span
            style={{
              fontFamily: F.sans,
              fontSize: 82,
              fontWeight: 600,
              letterSpacing: '-0.045em',
              color: C.ink,
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1,
            }}
          >
            {Math.round(amount).toLocaleString('fr-FR').replace(/ | |,/g, ' ')}
          </span>
          <span
            style={{
              fontFamily: F.sans,
              fontSize: 25,
              fontWeight: 500,
              color: C.inkMute,
            }}
          >
            MAD
          </span>
        </div>
        <div
          style={{
            fontFamily: F.sans,
            fontSize: 16,
            color: C.inkMute,
            marginTop: 12,
          }}
        >
          Versé sur votre compte Attijari · IBAN ••7728
        </div>

        <div style={{ marginTop: 30 }}>
          <div
            style={{
              height: 3,
              borderRadius: 999,
              background: C.line,
              position: 'relative',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                width: `${(track * 100).toFixed(2)}%`,
                background: C.atlas,
                borderRadius: 999,
              }}
            />
            <span
              style={{
                position: 'absolute',
                left: `${(track * 100).toFixed(2)}%`,
                top: '50%',
                width: 13,
                height: 13,
                marginLeft: -6.5,
                marginTop: -6.5,
                borderRadius: '50%',
                background: C.atlas,
                boxShadow: `0 0 0 5px rgba(11,110,79,.14)`,
              }}
            />
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: 14,
              fontFamily: F.mono,
              fontSize: 11.5,
              letterSpacing: '.12em',
              color: C.inkFaint,
            }}
          >
            <span>CLÔTURE · 23:30</span>
            <span>ARRIVÉE · 09:00</span>
          </div>
        </div>
      </div>

      <Caption head="Règlement demain, 9 h." accent="Promis." from={54} hold={196} />
    </div>
  );
};
