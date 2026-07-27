import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, F, SPRING } from '../theme';

export const Close: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const mark = spring({ frame: frame - 4, fps, config: SPRING, durationInFrames: 46 });
  const l1 = interpolate(frame, [40, 66], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const l2 = interpolate(frame, [58, 84], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const foot = interpolate(frame, [86, 112], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  /* the last hold still breathes — a 1.5% creep, never a frozen frame */
  const creep = interpolate(frame, [0, 286], [1, 1.016], {
    extrapolateRight: 'clamp',
  });
  const fade = interpolate(frame, [246, 282], [1, 0], {
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
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(64% 52% at 50% 48%, rgba(255,255,255,.92) 0%, rgba(239,235,227,0) 76%)',
        }}
      />
      <div
        style={{
          textAlign: 'center',
          opacity: fade,
          transform: `scale(${creep.toFixed(4)})`,
        }}
      >
        <div
          style={{
            fontFamily: F.sans,
            fontSize: 128,
            fontWeight: 700,
            letterSpacing: '-0.055em',
            color: C.ink,
            lineHeight: 1,
            opacity: mark,
            filter: `blur(${((1 - mark) * 12).toFixed(2)}px)`,
            transform: `scale(${(1.06 - mark * 0.06).toFixed(4)})`,
          }}
        >
          kiwi
          <span
            style={{
              display: 'inline-block',
              width: 20,
              height: 20,
              borderRadius: '50%',
              background: C.atlas,
              marginLeft: 10,
            }}
          />
        </div>

        <div style={{ marginTop: 34 }}>
          <div
            style={{
              fontFamily: F.sans,
              fontSize: 34,
              fontWeight: 500,
              color: C.ink,
              opacity: l1,
              transform: `translateY(${((1 - l1) * 10).toFixed(2)}px)`,
            }}
          >
            Gérez votre café.
          </div>
          {/* the accent line is the serif face, upright — the brand's own way
              of carrying emphasis without slanting anything */}
          <div
            style={{
              fontFamily: F.serif,
              fontStyle: 'normal',
              fontSize: 38,
              color: C.atlas,
              marginTop: 4,
              opacity: l2,
              transform: `translateY(${((1 - l2) * 10).toFixed(2)}px)`,
            }}
          >
            Simplement.
          </div>
        </div>

        <div
          style={{
            marginTop: 44,
            fontFamily: F.mono,
            fontSize: 12,
            letterSpacing: '.3em',
            color: C.inkFaint,
            opacity: foot,
          }}
        >
          POS · CAISSE · ANALYTICS · RÈGLEMENT T+1
        </div>
      </div>
    </div>
  );
};
