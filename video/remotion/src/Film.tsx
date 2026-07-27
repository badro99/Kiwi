import React from 'react';
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from 'remotion';
import './fonts';
import { C } from './theme';
import { S1_Ouverture } from './film/S1_Ouverture';
import { S2_Caisse } from './film/S2_Caisse';
import { S3_Dash } from './film/S3_Dash';
import { S4_Marche } from './film/S4_Marche';
import { S5_Nuit } from './film/S5_Nuit';
import { S6_Systeme } from './film/S6_Systeme';
import { S7_Reglement } from './film/S7_Reglement';
import { S8_Rafale } from './film/S8_Rafale';
import { S9_Fin } from './film/S9_Fin';

/* 30 s at 60 fps — nine beats, one idea each, at the reference's cadence.
 *
 * Two kinds of joints, both deliberate:
 *  - soft: the outgoing scene is still resolving when the incoming one starts
 *    (dark-to-dark handoffs ride the shared blackness);
 *  - hard: S4 and S8 cut in at full opacity — the tempo spike is the point.
 * The old cut's sin was butt-jointed dissolves; nothing here is ever allowed
 * to leave an empty stage. */
export const CUT = {
  s1: { from: 0, dur: 140 },
  s2: { from: 112, dur: 228 }, // begins inside S1's ink flood
  s3: { from: 336, dur: 224 },
  s4: { from: 556, dur: 220 }, // hard cut to paper
  s5: { from: 772, dur: 192 },
  s6: { from: 954, dur: 222 },
  s7: { from: 1166, dur: 192 },
  s8: { from: 1352, dur: 216 }, // hard cut, strobe
  s9: { from: 1562, dur: 238 },
};

/* Soft fade for scenes that need edges; hard scenes pass fade={false}. */
const Shot: React.FC<{ dur: number; inF?: number; outF?: number; children: React.ReactNode }> = ({
  dur,
  inF = 10,
  outF = 12,
  children,
}) => {
  const local = useCurrentFrame();
  /* inF/outF of 0 mean "hard edge" — computed separately because interpolate
     rejects duplicate input points */
  const fadeIn =
    inF === 0
      ? 1
      : interpolate(local, [0, inF], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fadeOut =
    outF === 0
      ? 1
      : interpolate(local, [dur - outF, dur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return <AbsoluteFill style={{ opacity: Math.min(fadeIn, fadeOut) }}>{children}</AbsoluteFill>;
};

export const Film: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: C.ink }}>
      <Sequence from={CUT.s1.from} durationInFrames={CUT.s1.dur} layout="none">
        <Shot dur={CUT.s1.dur} inF={0} outF={0}>
          <S1_Ouverture dur={CUT.s1.dur} />
        </Shot>
      </Sequence>

      <Sequence from={CUT.s2.from} durationInFrames={CUT.s2.dur} layout="none">
        {/* S1 ends on solid ink, so S2 rises out of black — fade the content,
            not the stage */}
        <Shot dur={CUT.s2.dur} inF={7} outF={10}>
          <S2_Caisse dur={CUT.s2.dur} />
        </Shot>
      </Sequence>

      <Sequence from={CUT.s3.from} durationInFrames={CUT.s3.dur} layout="none">
        <Shot dur={CUT.s3.dur} inF={12} outF={10}>
          <S3_Dash dur={CUT.s3.dur} />
        </Shot>
      </Sequence>

      <Sequence from={CUT.s4.from} durationInFrames={CUT.s4.dur} layout="none">
        {/* hard in — white slap after the dark run */}
        <Shot dur={CUT.s4.dur} inF={0} outF={10}>
          <S4_Marche dur={CUT.s4.dur} />
        </Shot>
      </Sequence>

      <Sequence from={CUT.s5.from} durationInFrames={CUT.s5.dur} layout="none">
        <Shot dur={CUT.s5.dur} inF={12} outF={10}>
          <S5_Nuit dur={CUT.s5.dur} />
        </Shot>
      </Sequence>

      <Sequence from={CUT.s6.from} durationInFrames={CUT.s6.dur} layout="none">
        <Shot dur={CUT.s6.dur} inF={12} outF={10}>
          <S6_Systeme dur={CUT.s6.dur} />
        </Shot>
      </Sequence>

      <Sequence from={CUT.s7.from} durationInFrames={CUT.s7.dur} layout="none">
        <Shot dur={CUT.s7.dur} inF={12} outF={10}>
          <S7_Reglement dur={CUT.s7.dur} />
        </Shot>
      </Sequence>

      <Sequence from={CUT.s8.from} durationInFrames={CUT.s8.dur} layout="none">
        {/* hard in and hard out — the strobe run */}
        <Shot dur={CUT.s8.dur} inF={0} outF={0}>
          <S8_Rafale dur={CUT.s8.dur} />
        </Shot>
      </Sequence>

      <Sequence from={CUT.s9.from} durationInFrames={CUT.s9.dur} layout="none">
        <Shot dur={CUT.s9.dur} inF={8} outF={0}>
          <S9_Fin dur={CUT.s9.dur} />
        </Shot>
      </Sequence>
    </AbsoluteFill>
  );
};
