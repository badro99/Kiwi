import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, SPRING } from '../theme';
import { Caption } from '../Caption';
import { ChartCard, DonutCard, FeedCard, HeroCard, Sidebar, TopBar } from '../ui/Dashboard';

/* One continuous shot. The dashboard assembles, the day's takings run up, and
 * the camera eases down the page — cutting between "the big number" and "the
 * detail" would throw away the thing that makes the product feel alive, which
 * is that all of it is one screen. */
export const Dash: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const chrome = spring({ frame, fps, config: SPRING, durationInFrames: 40 });
  const hero = spring({ frame: frame - 12, fps, config: SPRING, durationInFrames: 42 });

  /* The counter is the emotional beat of the film: it starts at nothing and
     lands on a real day's takings. Eased hard so it decelerates into the
     number instead of stopping dead. */
  const runT = interpolate(frame, [34, 200], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const eased = 1 - Math.pow(1 - runT, 3.2);
  const TARGET = 21230.29;
  const amount = TARGET * eased;
  const barPct = Math.min(1, (amount / 27000) * 1);

  /* The whole page is present within the first second. The previous take held
     the lower half back for four seconds, which left the bottom of a 1080-tall
     frame as blank paper for most of the shot — it read as an unfinished
     layout, not as a reveal. The camera, not the opacity, does the pacing. */
  const lower = spring({ frame: frame - 26, fps, config: SPRING, durationInFrames: 44 });
  const feed = spring({ frame: frame - 40, fps, config: SPRING, durationInFrames: 44 });

  const draw = interpolate(frame, [46, 210], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const donut = interpolate(frame, [62, 232], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  /* the feed keeps filling the whole way through the shot */
  const feedRows = Math.floor(interpolate(frame, [150, 470], [0, 5], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  }));

  /* The full page is ~1190px tall in a 1080 frame, so the ease down is exactly
     the overflow plus a little — enough to travel, never enough to run past the
     end of the layout onto empty paper. */
  const pan = interpolate(frame, [200, 700], [0, -172], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  /* Zoom starts at 1 and pushes IN. Starting above 1 and easing out was
     cropping the sidebar off the left edge for the first two seconds. */
  const zoom = interpolate(frame, [0, 780], [1, 1.05], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div style={{ position: 'absolute', inset: 0, background: C.paper, overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          transform: `scale(${zoom.toFixed(4)}) translateY(${pan.toFixed(2)}px)`,
          transformOrigin: '50% 50%',
        }}
      >
        <Sidebar reveal={chrome} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <TopBar reveal={chrome} />
          <HeroCard enter={hero} amount={amount} barPct={barPct} />
          <div style={{ display: 'flex', gap: 20, margin: '20px 52px 0' }}>
            <ChartCard enter={lower} draw={draw} />
            <DonutCard enter={lower} fill={donut} />
          </div>
          <FeedCard enter={feed} rows={feedRows} />
        </div>
      </div>

      {/* the page keeps moving under a caption that stays put */}
      <Caption head="Votre chiffre d’affaires, en" accent="direct." from={84} hold={150} />
      <Caption head="Chaque vente, à la" accent="seconde." from={392} hold={300} />
    </div>
  );
};
