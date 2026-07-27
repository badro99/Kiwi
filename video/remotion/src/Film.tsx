import React from 'react';
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from 'remotion';
import './fonts';
import { C } from './theme';
import { Chaos } from './scenes/Chaos';
import { Dash } from './scenes/Dash';
import { Settle } from './scenes/Settle';
import { Close } from './scenes/Close';

/* 30 s at 60 fps. The beats overlap by design — every scene's Sequence starts
 * before the previous one has finished fading, so the film never rests on an
 * empty frame at a boundary. */
/* Each scene's last element must still be on screen when the next scene's
 * first element starts arriving. The overlap below is not decoration — the
 * previous cut of this film measured 12 seconds of empty stage because every
 * exit finished before the next entrance began. */
export const CUT = {
  chaos: { from: 0, dur: 450 },
  dash: { from: 400, dur: 820 },
  settle: { from: 1200, dur: 330 },
  close: { from: 1510, dur: 290 },
};

/* A cross-dissolve. Note this sits INSIDE the Sequence, so useCurrentFrame() is
 * already rebased to the sequence start — subtracting `from` again would offset
 * it twice and the fade would never fire. */
const Fade: React.FC<{ dur: number; children: React.ReactNode }> = ({ dur, children }) => {
  const local = useCurrentFrame();
  const opacity = interpolate(local, [0, 20, dur - 22, dur], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};

export const Film: React.FC = () => {
  const frame = useCurrentFrame();
  /* the film opens out of white and closes into it — the paper is the stage */
  const open = interpolate(frame, [0, 26], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: C.paperDeep }}>
      <AbsoluteFill style={{ opacity: open }}>
        <Sequence from={CUT.chaos.from} durationInFrames={CUT.chaos.dur} layout="none">
          <Fade dur={CUT.chaos.dur}>
            <Chaos exitAt={330} />
          </Fade>
        </Sequence>

        <Sequence from={CUT.dash.from} durationInFrames={CUT.dash.dur} layout="none">
          <Fade dur={CUT.dash.dur}>
            <Dash />
          </Fade>
        </Sequence>

        <Sequence from={CUT.settle.from} durationInFrames={CUT.settle.dur} layout="none">
          <Fade dur={CUT.settle.dur}>
            <Settle />
          </Fade>
        </Sequence>

        <Sequence from={CUT.close.from} durationInFrames={CUT.close.dur} layout="none">
          <Fade dur={CUT.close.dur}>
            <Close />
          </Fade>
        </Sequence>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
