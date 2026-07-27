import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { C, F } from '../theme';
import { Grain } from '../grade';
import { MicroLabels, MotionWord } from '../kit';
import { Chip, Headline, PhotoScene, Tag } from './photo';

/* ACT I — the world before Kiwi. Two photographs and a wordmark. */

/* F01 · MORNING — the film opens on a real street, not a UI. */
export const F01_Morning: React.FC<{ dur?: number }> = ({ dur = 390 }) => {
  const frame = useCurrentFrame();
  const labels = interpolate(frame, [10, 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <PhotoScene src="photos/morning-terrace.jpg" dur={dur} zoom={[1.06, 1.18]} focus={[62, 52]}>
      <div style={{ opacity: labels }}>
        <MicroLabels color={C.paper} opacity={0.75} items={['KIWI · POS', 'CASABLANCA', 'EST. 2026']} />
      </div>
      <Tag at={46} text="6:12 AM · THE FIRST COFFEE" bottom={54} x={52} />
      <Tag at={46} text="A DEMONSTRATION FILM · 2 MIN" bottom={54} right={52} />
      <Headline at={110} parts={[{ t: 'Morning, ' }, { t: 'Casablanca.', serif: true }]} bottom={150} />
    </PhotoScene>
  );
};

/* F02 · THE RUSH — hard cut on the beat; order chips pile up faster than a
 * notebook can hold them. */
export const F02_Rush: React.FC<{ dur?: number }> = ({ dur = 420 }) => {
  return (
    <PhotoScene src="photos/terrace-busy.jpg" dur={dur} zoom={[1.05, 1.2]} focus={[42, 40]} shade={0.6}>
      <Headline
        at={14}
        parts={[{ t: 'Then ' }, { t: 'everyone', serif: true }, { t: ' arrives at once.' }]}
        bottom={140}
        out={214}
      />
      <Chip at={54} x="9%" y="24%" text="Table 3 · two espressos" />
      <Chip at={86} x="66%" y="18%" text="Terrace · the check, please" />
      <Chip at={118} x="57%" y="60%" text="Table 7 · mint tea ×3" />
      <Chip at={148} x="13%" y="58%" text="Table 1 · msemen ×2" />
      <Chip at={178} x="36%" y="37%" text="Kitchen · where is ticket 12?" dot={false} />
      <Headline
        at={240}
        parts={[{ t: 'Orders on paper. Totals ' }, { t: 'by hand.', serif: true }]}
        bottom={140}
      />
    </PhotoScene>
  );
};

/* F03 · THE WORD — paper, a promise, and the wordmark that inflates until its
 * ink is the next scene's darkness. The film's signature transition. */
export const F03_Word: React.FC<{ dur?: number }> = ({ dur = 330 }) => {
  const frame = useCurrentFrame();

  const sub = interpolate(frame, [16, 36], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const subGone = interpolate(frame, [178, 196], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const growT = interpolate(frame, [196, 300], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const grow = 1 + Math.pow(growT, 2.6) * 17;
  const rot = growT * -5;
  const flood = interpolate(frame, [282, 304], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const breathe = frame > 140 && frame < 196 ? 1 + Math.sin((frame - 140) / 6) * 0.04 : 1;

  return (
    <AbsoluteFill style={{ background: C.paper }}>
      <MicroLabels color={C.ink} opacity={0.55} items={['KIWI · POS', 'CASABLANCA', 'EST. 2026']} />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 236,
          textAlign: 'center',
          opacity: sub * (1 - subGone),
          transform: `translateY(${((1 - sub) * 22).toFixed(1)}px)`,
        }}
      >
        <span style={{ fontFamily: F.sans, fontWeight: 500, fontSize: 46, letterSpacing: '-0.02em', color: C.ink }}>
          There is a{' '}
          <span style={{ fontFamily: F.serif, fontStyle: 'normal', fontSize: 52, color: C.atlas }}>simpler</span> way.
        </span>
      </div>

      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          transform: `scale(${grow.toFixed(3)}) rotate(${rot.toFixed(2)}deg)`,
          transformOrigin: '50% 54%',
        }}
      >
        <div style={{ transform: `scaleY(${breathe.toFixed(3)})`, marginTop: 60 }}>
          <MotionWord
            text="KIWI"
            at={64}
            fontSize={340}
            color={C.ink}
            fontWeight={700}
            letterSpacing="-0.04em"
            scatter={520}
            stagger={3}
            speed={15}
            seed="kiwi2"
          />
        </div>
      </AbsoluteFill>

      <AbsoluteFill style={{ background: C.ink, opacity: flood }} />
      <Grain opacity={0.05} blend="multiply" />
    </AbsoluteFill>
  );
};
