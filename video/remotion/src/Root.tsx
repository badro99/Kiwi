import React from 'react';
import { Composition } from 'remotion';
import { Film } from './Film';
import { Reel, SHOT } from './tests/Reel';

export const RemotionRoot: React.FC = () => (
  <>
    {/* the four style tests, back to back — 20 s */}
    <Composition
      id="Reel"
      component={Reel}
      durationInFrames={SHOT * 4}
      fps={60}
      width={1920}
      height={1080}
    />
    {/* the earlier 30 s cut, kept so the two can be compared directly */}
    <Composition id="Film" component={Film} durationInFrames={1800} fps={60} width={1920} height={1080} />
  </>
);
