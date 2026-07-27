import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { C, F } from '../theme';
import { Grain } from '../grade';
import { MicroLabels, MotionWord } from '../kit';

/* S1 · OUVERTURE — the reference's own opening move: an editorial frame of
 * tiny mono labels, a wordmark that assembles, then the type itself becomes
 * the transition — it inflates until its ink fills the frame, and the next
 * scene begins inside that darkness. */
export const S1_Ouverture: React.FC<{ dur?: number }> = ({ dur = 140 }) => {
  const frame = useCurrentFrame();

  const labels = interpolate(frame, [4, 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  /* the inflation: the word grows until its strokes are the whole frame */
  const growT = interpolate(frame, [62, 104], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const grow = 1 + Math.pow(growT, 2.6) * 17;
  const rot = growT * -5;
  /* an ink flood guarantees full coverage at the moment of handoff */
  const flood = interpolate(frame, [92, 106], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  /* per-letter breathing before the inflation — the word is alive, not set */
  const breathe = (i: number) =>
    frame > 34 && frame < 66 ? 1 + Math.sin((frame - 34) / 6 + i * 1.7) * 0.045 : 1;

  return (
    <AbsoluteFill style={{ background: C.paper }}>
      <div style={{ opacity: labels }}>
        <MicroLabels items={['KIWI · POS', 'CASABLANCA', 'EST. 2026']} />
      </div>
      {/* bottom rail mirrors the top */}
      <div
        style={{
          position: 'absolute',
          bottom: 34,
          left: 52,
          fontFamily: F.mono,
          fontSize: 15,
          letterSpacing: '.3em',
          color: C.ink,
          opacity: labels * 0.4,
        }}
      >
        UN FILM DE DÉMONSTRATION
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: 34,
          right: 52,
          fontFamily: F.mono,
          fontSize: 15,
          letterSpacing: '.3em',
          color: C.ink,
          opacity: labels * 0.4,
        }}
      >
        30 S
      </div>

      {/* No blur on the inflation — the reference's mass stays crisp ink all
          the way to full coverage; blur here reads as fog, not as type. */}
      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          transform: `scale(${grow.toFixed(3)}) rotate(${rot.toFixed(2)}deg)`,
          transformOrigin: '50% 52%',
        }}
      >
        <div style={{ transform: `scaleY(${breathe(0).toFixed(3)})` }}>
          <MotionWord
            text="KIWI"
            at={8}
            fontSize={360}
            color={C.ink}
            fontWeight={700}
            letterSpacing="-0.04em"
            scatter={520}
            stagger={3}
            speed={15}
            seed="kiwi1"
          />
        </div>
      </AbsoluteFill>

      <AbsoluteFill style={{ background: C.ink, opacity: flood }} />
      <Grain opacity={0.05} blend="multiply" />
    </AbsoluteFill>
  );
};
