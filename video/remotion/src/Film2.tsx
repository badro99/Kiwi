import React from 'react';
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from 'remotion';
import './fonts';
import { C } from './theme';
import { F01_Morning, F02_Rush, F03_Word } from './film2/act1';
import { F04_Till, F05_CardTap, F06_QR, F07_Service, F08_Kitchen } from './film2/act2';
import { F09_Dashboard, F10_Owner, F11_Night, F12_Settlement } from './film2/act3';
import { F13_Market, F14_Burst, F15_KiwiStill, F16_Finale } from './film2/act4';

/* The 2-minute English film — 7200 frames at 60 fps, sixteen scenes on a
 * 120 BPM grid: every scene boundary lands on a multiple of 30 frames, so a
 * 120 BPM track can be laid under the cut without re-editing.
 *
 * The arc: the world before Kiwi (photographs) → one sale traveling the
 * system (UI + photographs alternating) → what the owner sees → the market →
 * the arsenal → the poster. Joints are soft where scenes share darkness,
 * hard where the tempo spikes (the rush, the burst, the still after it). */
export const CUT2 = {
  s01: { from: 0, dur: 390 }, // morning terrace
  s02: { from: 360, dur: 420 }, // the rush — hard in on the beat
  s03: { from: 750, dur: 330 }, // wordmark → ink flood
  s04: { from: 1050, dur: 660 }, // the till, inside the flood
  s05: { from: 1680, dur: 330 }, // card tap
  s06: { from: 1980, dur: 390 }, // QR at the table
  s07: { from: 2340, dur: 330 }, // service
  s08: { from: 2640, dur: 420 }, // kitchen
  s09: { from: 3030, dur: 750 }, // dashboard
  s10: { from: 3750, dur: 390 }, // owner, live
  s11: { from: 4110, dur: 540 }, // the night
  s12: { from: 4620, dur: 450 }, // settlement
  s13: { from: 5040, dur: 480 }, // the market
  s14: { from: 5520, dur: 390 }, // burst — hard both sides
  s15: { from: 5910, dur: 330 }, // the still — hard in, the snap to calm
  s16: { from: 6210, dur: 990 }, // finale poster — no exit fade
};

const Shot: React.FC<{ dur: number; inF?: number; outF?: number; children: React.ReactNode }> = ({
  dur,
  inF = 10,
  outF = 12,
  children,
}) => {
  const local = useCurrentFrame();
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

type SceneDef = {
  key: keyof typeof CUT2;
  inF: number;
  outF: number;
  C: React.FC<{ dur?: number }>;
};

const SCENES: SceneDef[] = [
  { key: 's01', inF: 12, outF: 12, C: F01_Morning },
  { key: 's02', inF: 0, outF: 12, C: F02_Rush },
  { key: 's03', inF: 10, outF: 0, C: F03_Word },
  { key: 's04', inF: 7, outF: 10, C: F04_Till },
  { key: 's05', inF: 10, outF: 12, C: F05_CardTap },
  { key: 's06', inF: 10, outF: 12, C: F06_QR },
  { key: 's07', inF: 10, outF: 12, C: F07_Service },
  { key: 's08', inF: 10, outF: 12, C: F08_Kitchen },
  { key: 's09', inF: 12, outF: 10, C: F09_Dashboard },
  { key: 's10', inF: 10, outF: 12, C: F10_Owner },
  { key: 's11', inF: 12, outF: 12, C: F11_Night },
  { key: 's12', inF: 10, outF: 10, C: F12_Settlement },
  { key: 's13', inF: 10, outF: 12, C: F13_Market },
  { key: 's14', inF: 0, outF: 0, C: F14_Burst },
  { key: 's15', inF: 0, outF: 12, C: F15_KiwiStill },
  { key: 's16', inF: 8, outF: 0, C: F16_Finale },
];

export const Film2: React.FC = () => (
  <AbsoluteFill style={{ background: C.ink }}>
    {SCENES.map(({ key, inF, outF, C: Scene }) => (
      <Sequence key={key} from={CUT2[key].from} durationInFrames={CUT2[key].dur} layout="none">
        <Shot dur={CUT2[key].dur} inF={inF} outF={outF}>
          <Scene dur={CUT2[key].dur} />
        </Shot>
      </Sequence>
    ))}
  </AbsoluteFill>
);
