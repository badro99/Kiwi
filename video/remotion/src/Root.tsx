import React from 'react';
import { Composition } from 'remotion';
import { Film } from './Film';

/* 30 s at 60 fps. 60 not 30: the reference cut the founders liked is 60 fps and
 * that smoothness is a real part of why it reads as a product film rather than
 * a screen recording. Remotion renders frames in parallel, so the extra 900
 * frames cost minutes, not the half-hour the old CDP renderer charged. */
export const RemotionRoot: React.FC = () => (
  <Composition
    id="Film"
    component={Film}
    durationInFrames={1800}
    fps={60}
    width={1920}
    height={1080}
  />
);
