import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, F } from '../theme';
import { Grain, KeyLight, Vignette } from '../grade';
import { BlobWipe, ClickRing, Cursor, MicroLabels, SlamWord } from '../kit';
import { Headline, PhotoScene, Tag } from './photo';

/* ACT IV — the market, the arsenal, and the poster the film ends on. */

/* a competitor name that assembles, is struck through in red, and is swept
 * off the frame — over the golden city they don't serve */
const Struck: React.FC<{ word: string; at: number; strike: number; sweep: number; y: number }> = ({
  word,
  at,
  strike,
  sweep,
  y,
}) => {
  const frame = useCurrentFrame();
  const inT = interpolate(frame, [at, at + 16], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const e = 1 - Math.pow(1 - inT, 3);
  const st = interpolate(frame, [strike, strike + 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const sw = interpolate(frame, [sweep, sweep + 26], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const sx = Math.pow(sw, 2.2) * -1900;
  if (inT <= 0 || sw >= 1) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: y,
        textAlign: 'center',
        opacity: e,
        transform: `translateX(${sx.toFixed(1)}px)`,
        filter: sw > 0 ? `blur(${(sw * 18).toFixed(1)}px)` : undefined,
      }}
    >
      <span
        style={{
          position: 'relative',
          fontFamily: F.sans,
          fontWeight: 600,
          fontSize: 128,
          letterSpacing: '-0.045em',
          color: C.paper,
          textShadow: '0 6px 40px rgba(0,0,0,.65)',
          display: 'inline-block',
          transform: `translateY(${((1 - e) * 30).toFixed(1)}px)`,
        }}
      >
        {word}
        <span
          style={{
            position: 'absolute',
            left: '-4%',
            right: '-4%',
            top: '50%',
            height: 12,
            marginTop: -6,
            background: 'rgba(192,68,47,.92)',
            transform: `scaleX(${st.toFixed(3)})`,
            transformOrigin: 'left center',
            borderRadius: 6,
          }}
        />
      </span>
    </div>
  );
};

/* F13 · THE MARKET — golden Casablanca, and the names that never came. */
export const F13_Market: React.FC<{ dur?: number }> = ({ dur = 480 }) => {
  return (
    <PhotoScene src="photos/casablanca-golden.jpg" dur={dur} zoom={[1.04, 1.15]} focus={[55, 40]} wash={0.08} shade={0.62} topShade={0.4}>
      <Struck word="Square" at={26} strike={64} sweep={92} y={220} />
      <Struck word="Toast" at={104} strike={142} sweep={170} y={220} />
      <Struck word="Lightspeed" at={182} strike={220} sweep={248} y={220} />
      <Headline
        at={286}
        parts={[{ t: 'None of them sell ' }, { t: 'here.', serif: true }]}
        bottom={480}
        out={368}
      />
      <Headline at={376} size={74} parts={[{ t: 'Kiwi is built ' }, { t: 'for Morocco.', serif: true }]} bottom={440} />
      <Tag at={428} text="FROM 199 MAD / MONTH" bottom={62} x={52} />
    </PhotoScene>
  );
};

/* F14 · THE BURST — six features, hard cuts, one breath each. */
const CARDS: { label: string; word: string; bg: string; fg: string; accent: string }[] = [
  { label: 'ORDERING', word: 'QR at the table', bg: C.paper, fg: C.ink, accent: C.atlas },
  { label: 'PAYMENTS', word: 'Split the bill', bg: C.atlas, fg: C.paper, accent: C.mint },
  { label: 'INVENTORY', word: 'Live inventory', bg: C.ink, fg: C.paper, accent: C.mint },
  { label: 'KITCHEN', word: 'Kitchen display', bg: C.paper, fg: C.atlas, accent: C.ink },
  { label: 'PEOPLE', word: 'Team payroll', bg: C.riad, fg: C.paper, accent: C.mint },
  { label: 'SCALE', word: 'Multi-location', bg: C.atlas, fg: C.paper, accent: C.mint },
];
const STEP = 60;

export const F14_Burst: React.FC<{ dur?: number }> = ({ dur = 390 }) => {
  const frame = useCurrentFrame();
  const i = Math.min(CARDS.length - 1, Math.floor(frame / STEP));
  const card = CARDS[i];
  return (
    <AbsoluteFill style={{ background: card.bg, alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{
          position: 'absolute',
          top: 46,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontFamily: F.mono,
          fontSize: 17,
          letterSpacing: '.4em',
          color: card.accent,
        }}
      >
        {card.label}
      </div>
      <SlamWord text={card.word} at={i * STEP + 2} fontSize={148} color={card.fg} />
      <div
        style={{
          position: 'absolute',
          bottom: 46,
          right: 60,
          fontFamily: F.mono,
          fontSize: 17,
          letterSpacing: '.3em',
          color: card.accent,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {String(i + 1).padStart(2, '0')} / 06
      </div>
      <Grain opacity={0.05} blend={card.bg === C.paper ? 'multiply' : 'overlay'} />
    </AbsoluteFill>
  );
};

/* F15 · THE STILL — after the strobe, one quiet frame and the promise. */
export const F15_KiwiStill: React.FC<{ dur?: number }> = ({ dur = 330 }) => {
  return (
    <PhotoScene src="photos/kiwi-espresso.jpg" dur={dur} zoom={[1.12, 1.04]} focus={[42, 48]} wash={0.06} shade={0.4}>
      <Headline at={70} size={70} parts={[{ t: 'Run your café. ' }, { t: 'Simply.', serif: true }]} bottom={140} />
    </PhotoScene>
  );
};

/* F16 · THE POSTER — wordmark, tiers, one click on Try Kiwi, and a hold.
 * No fade at the end: the last frame is the poster. */
export const F16_Finale: React.FC<{ dur?: number }> = ({ dur = 990 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const slam = spring({ frame: frame - 10, fps, config: { damping: 15, mass: 0.9, stiffness: 150 } });
  const scale = interpolate(slam, [0, 1], [2.4, 1]);
  const dot = spring({ frame: frame - 44, fps, config: { damping: 12, mass: 0.6, stiffness: 200 } });

  const tag = interpolate(frame, [84, 106], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const tiers = interpolate(frame, [140, 162], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  /* the CTA arrives late on purpose — two quiet seconds on the poster first,
     so the click lands at ~1:51 and the closing hold stays near five seconds */
  const url = interpolate(frame, [470, 492], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const labels = interpolate(frame, [490, 512], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const flyT = interpolate(frame, [344, 412], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fly = 1 - Math.pow(1 - flyT, 2.8);
  const cx = interpolate(fly, [0, 1], [1760, 1030]);
  const cy = interpolate(fly, [0, 1], [140, 802]) + Math.sin(fly * Math.PI) * 110;
  const press = interpolate(frame, [412, 418, 426], [0, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const pulse = frame > 422 ? 1 + Math.sin((frame - 422) / 8) * 0.01 : 1;

  const creep = 1 + Math.min(1, frame / dur) * 0.018;

  return (
    <AbsoluteFill style={{ background: C.paper }}>
      <div style={{ opacity: labels }}>
        <MicroLabels color={C.ink} opacity={0.55} items={['KIWI · POS', 'KIWI.MA', 'CASABLANCA']} />
      </div>

      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', transform: `scale(${creep.toFixed(4)})` }}>
        <div style={{ textAlign: 'center', transform: 'translateY(-100px)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center' }}>
            <span
              style={{
                fontFamily: F.sans,
                fontWeight: 650 as never,
                fontSize: 250,
                letterSpacing: '-0.06em',
                color: C.ink,
                lineHeight: 1,
                display: 'inline-block',
                transform: `scale(${scale.toFixed(3)})`,
                filter: scale > 1.05 ? `blur(${((scale - 1) * 10).toFixed(1)}px)` : undefined,
                opacity: frame < 10 ? 0 : 1,
              }}
            >
              kiwi
            </span>
            <span
              style={{
                width: 44,
                height: 44,
                borderRadius: 24,
                background: C.atlas,
                display: 'inline-block',
                marginLeft: 20,
                transform: `scale(${dot.toFixed(3)})`,
              }}
            />
          </div>

          <div
            style={{
              marginTop: 38,
              fontFamily: F.sans,
              fontWeight: 500,
              fontSize: 44,
              letterSpacing: '-0.02em',
              color: C.ink,
              opacity: tag,
              transform: `translateY(${((1 - tag) * 22).toFixed(1)}px)`,
            }}
          >
            Run your café.{' '}
            <span style={{ fontFamily: F.serif, fontStyle: 'normal', fontSize: 50, color: C.atlas }}>Simply.</span>
          </div>

          <div
            style={{
              marginTop: 30,
              fontFamily: F.mono,
              fontSize: 18,
              letterSpacing: '.3em',
              color: C.inkMute,
              opacity: tiers,
            }}
          >
            BASIC 199 · PRO 399 · ULTRA 1,499 MAD / MONTH
          </div>
        </div>
      </AbsoluteFill>

      {/* the call to action blooms, and the film clicks it */}
      <BlobWipe at={330} x="50%" y="74%" dur={24}>
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 176 }}>
          <div
            style={{
              padding: '30px 84px',
              borderRadius: 200,
              background: `linear-gradient(168deg, #128159 0%, ${C.atlas} 46%, ${C.riad} 100%)`,
              boxShadow:
                '0 50px 100px -30px rgba(0,0,0,.4), 0 0 70px rgba(11,110,79,.25), inset 0 2px 0 rgba(255,255,255,.3), inset 0 -12px 30px rgba(0,0,0,.32)',
              transform: `scale(${((1 - press * 0.05) * pulse).toFixed(3)})`,
              fontFamily: F.sans,
              fontWeight: 600,
              fontSize: 52,
              letterSpacing: '-0.02em',
              color: C.paper,
            }}
          >
            Try Kiwi
          </div>
        </AbsoluteFill>
      </BlobWipe>

      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 108,
          textAlign: 'center',
          fontFamily: F.mono,
          fontSize: 17,
          letterSpacing: '.34em',
          color: C.inkMute,
          opacity: url,
        }}
      >
        KIWI.MA
      </div>

      <ClickRing at={414} x={1052} y={820} color={C.atlas} />
      {frame >= 344 && frame < 460 && <Cursor x={cx} y={cy} press={press} size={104} />}

      <KeyLight x="38%" y="10%" color="255,246,224" opacity={0.32} />
      <Grain opacity={0.05} blend="multiply" />
    </AbsoluteFill>
  );
};
