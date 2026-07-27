import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, F } from '../theme';
import { Bokeh, Grain, KeyLight, Vignette, useShotFade } from '../grade';

/* A · LE COMPTOIR — the physical moment of a sale, shot like an object film.
 *
 * The story is a card touching a terminal. Everything is depth: a blown-out
 * background, a subject in focus, and a foreground edge slightly out of it. */
export const A_Comptoir: React.FC<{ dur?: number }> = ({ dur = 300 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fade = useShotFade(dur);

  /* the card falls, contacts at f=104, lifts away */
  const drop = spring({ frame, fps, config: { damping: 26, mass: 1.1, stiffness: 62 }, durationInFrames: 104 });
  const cardY = interpolate(drop, [0, 1], [-540, -8]);
  const lift = interpolate(frame, [128, 200], [0, -190], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const cardOut = interpolate(frame, [150, 210], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  /* contact ring */
  const ring = interpolate(frame, [104, 168], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const paid = interpolate(frame, [112, 132], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  /* a slow push-in with a hand's worth of drift */
  const push = interpolate(frame, [0, dur], [1.06, 1.15]);
  const driftX = Math.sin(frame / 78) * 7;
  const driftY = Math.cos(frame / 96) * 5;

  return (
    <AbsoluteFill style={{ background: '#04110C', opacity: fade }}>
      {/* blown-out background: a café at night, entirely out of focus */}
      <AbsoluteFill style={{ filter: 'blur(2px)' }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(70% 55% at 62% 30%, #0E4A36 0%, #06231A 55%, #030D09 100%)',
          }}
        />
        <Bokeh count={16} hue="255,214,140" seed="warm" />
        <Bokeh count={9} hue="125,242,176" seed="mint" drift={1.6} />
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          transform: `scale(${push.toFixed(4)}) translate(${driftX.toFixed(2)}px, ${driftY.toFixed(2)}px)`,
          transformOrigin: '52% 56%',
        }}
      >
        {/* the counter surface, raking away */}
        <div
          style={{
            position: 'absolute',
            left: '-20%',
            right: '-20%',
            top: '58%',
            height: '60%',
            /* No hard edge. A lit plane with a soft leading highlight reads as
               a counter; a rectangle with a crisp top edge reads as a black bar
               laid over the shot, which is what the first pass looked like. */
            background:
              'linear-gradient(180deg, rgba(28,64,48,.85) 0%, rgba(9,26,19,.75) 34%, rgba(3,10,8,0) 82%)',
            transform: 'perspective(1200px) rotateX(58deg)',
            transformOrigin: '50% 0%',
            filter: 'blur(9px)',
          }}
        />

        {/* contact shadow — the terminal has to be standing on the surface */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '54%',
            width: 460,
            height: 120,
            marginLeft: -230,
            marginTop: 150,
            borderRadius: '50%',
            background: 'radial-gradient(closest-side, rgba(0,0,0,.78), rgba(0,0,0,0))',
            filter: 'blur(18px)',
          }}
        />

        {/* the terminal */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '54%',
            width: 300,
            height: 452,
            marginLeft: -150,
            marginTop: -226,
            borderRadius: 34,
            background: 'linear-gradient(158deg, #2A5F4B 0%, #0C2419 62%, #061810 100%)',
            boxShadow:
              '0 70px 110px -40px rgba(0,0,0,.92), 0 0 0 1px rgba(125,242,176,.16), inset 0 2px 0 rgba(255,255,255,.10)',
            transform: 'perspective(1400px) rotateX(12deg) rotateY(-15deg) rotateZ(-2deg)',
          }}
        >
          {/* screen */}
          <div
            style={{
              position: 'absolute',
              left: 24,
              right: 24,
              top: 28,
              height: 214,
              borderRadius: 16,
              background: paid > 0.02 ? 'linear-gradient(160deg,#0B6E4F,#053B2C)' : '#03110B',
              boxShadow: `inset 0 0 60px rgba(125,242,176,${(0.1 + paid * 0.34).toFixed(3)})`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
            }}
          >
            <div
              style={{
                fontFamily: F.mono,
                fontSize: 13,
                letterSpacing: '.26em',
                color: C.mint,
                opacity: paid,
              }}
            >
              PAYÉ
            </div>
            <div
              style={{
                fontFamily: F.sans,
                fontWeight: 600,
                fontSize: 46,
                letterSpacing: '-0.03em',
                color: C.paper,
                opacity: paid,
                transform: `scale(${(0.9 + paid * 0.1).toFixed(3)})`,
              }}
            >
              148,00
              <span style={{ fontSize: 20, opacity: 0.62, marginLeft: 7 }}>MAD</span>
            </div>
          </div>
          {/* keypad */}
          {new Array(12).fill(0).map((_, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: 40 + (i % 3) * 78,
                top: 274 + Math.floor(i / 3) * 42,
                width: 66,
                height: 30,
                borderRadius: 8,
                background: 'rgba(247,245,240,.10)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,.12)',
              }}
            />
          ))}

          {/* contact ring, breaking out of the screen plane */}
          {ring > 0 && (
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: 135,
                width: 40,
                height: 40,
                marginLeft: -20,
                marginTop: -20,
                borderRadius: '50%',
                border: `2px solid rgba(125,242,176,${(1 - ring).toFixed(3)})`,
                transform: `scale(${(1 + ring * 11).toFixed(3)})`,
              }}
            />
          )}
        </div>

        {/* the card */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '54%',
            width: 250,
            height: 158,
            marginLeft: -110,
            marginTop: -300,
            borderRadius: 15,
            background: 'linear-gradient(145deg, #F7F5F0 0%, #DCD6C9 100%)',
            boxShadow: '0 46px 70px -26px rgba(0,0,0,.8), inset 0 1px 0 rgba(255,255,255,.9)',
            transform: `perspective(1400px) rotateX(52deg) rotateY(-14deg) rotateZ(6deg) translateY(${(
              cardY + lift
            ).toFixed(2)}px)`,
            opacity: cardOut,
            filter: `blur(${Math.max(0, (1 - drop) * 4).toFixed(2)}px)`,
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 20,
              top: 30,
              width: 42,
              height: 32,
              borderRadius: 6,
              background: 'linear-gradient(140deg,#C9A227,#9C7B14)',
            }}
          />
        </div>
      </AbsoluteFill>

      <KeyLight x="30%" y="12%" size="70% 60%" color="255,236,196" opacity={0.24} />
      <Vignette strength={0.78} warm />
      <Grain opacity={0.07} />
    </AbsoluteFill>
  );
};
