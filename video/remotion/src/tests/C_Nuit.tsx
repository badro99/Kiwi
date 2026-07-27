import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { C, F } from '../theme';
import { Bokeh, Grain, Vignette, useShotFade } from '../grade';

/* C · LA NUIT — narrative. 23:47, the café is shut, and the owner is still
 * adding up a paper notebook by the light of one lamp.
 *
 * The only movement is a hand-ruled column of figures being replaced, line by
 * line, by the same figures already totalled on a phone. No UI tour, no
 * feature list: one person's night getting shorter. */

const LINES = [
  ['Café  ×34', '204,00'],
  ['Thé menthe  ×28', '168,00'],
  ['Jus orange  ×12', '144,00'],
  ['Msemen  ×19', '133,00'],
  ['Terrasse soir', '892,50'],
  ['Glovo', '318,40'],
];

export const C_Nuit: React.FC<{ dur?: number }> = ({ dur = 300 }) => {
  const frame = useCurrentFrame();
  const fade = useShotFade(dur);

  /* the lamp flickers, barely — a room, not a render */
  const lamp = 0.94 + Math.sin(frame / 7.3) * 0.02 + Math.sin(frame / 2.9) * 0.012;

  /* the phone rises into the pool of light and takes over the page */
  const rise = interpolate(frame, [96, 176], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const eased = 1 - Math.pow(1 - rise, 3);
  const paperOut = interpolate(frame, [120, 200], [1, 0.16], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const push = interpolate(frame, [0, dur], [1.0, 1.09]);

  return (
    <AbsoluteFill style={{ background: '#030806', opacity: fade }}>
      <Bokeh count={7} hue="255,208,132" seed="lamp" drift={0.4} />

      {/* the pool of lamplight */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(46% 44% at 43% 52%, rgba(255,226,168,${(
            0.46 * lamp
          ).toFixed(3)}) 0%, rgba(255,206,138,.14) 46%, rgba(0,0,0,0) 70%)`,
        }}
      />

      <AbsoluteFill
        style={{ transform: `scale(${push.toFixed(4)})`, transformOrigin: '44% 54%' }}
      >
        {/* the notebook page, raked on the table */}
        <div
          style={{
            position: 'absolute',
            left: '17%',
            top: '20%',
            width: 700,
            height: 720,
            padding: '54px 56px',
            background: 'linear-gradient(172deg, #EFE7D2 0%, #DCD0B4 100%)',
            boxShadow: '0 60px 90px -40px rgba(0,0,0,.9)',
            transform: 'perspective(1500px) rotateX(46deg) rotateZ(-7deg)',
            transformOrigin: '50% 100%',
            opacity: paperOut,
          }}
        >
          <div
            style={{
              fontFamily: F.mono,
              fontSize: 19,
              letterSpacing: '.2em',
              color: 'rgba(60,44,20,.62)',
              marginBottom: 30,
            }}
          >
            MARDI · 10.06
          </div>
          {LINES.map(([k, v], i) => {
            /* each line is struck through as the phone claims it */
            const claimed = interpolate(frame, [108 + i * 9, 124 + i * 9], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            return (
              <div
                key={k}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '13px 0',
                  borderBottom: '1px solid rgba(60,44,20,.16)',
                  fontFamily: F.sans,
                  fontSize: 27,
                  color: `rgba(38,28,12,${(0.9 - claimed * 0.5).toFixed(2)})`,
                  position: 'relative',
                }}
              >
                <span>{k}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{v}</span>
                <span
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: '52%',
                    height: 2,
                    width: `${(claimed * 100).toFixed(1)}%`,
                    background: 'rgba(38,28,12,.5)',
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* the phone, rising into the same light */}
        <div
          style={{
            position: 'absolute',
            left: '58%',
            top: '50%',
            width: 372,
            height: 762,
            marginTop: -381,
            borderRadius: 46,
            background: 'linear-gradient(165deg,#12211B,#05100C)',
            boxShadow:
              '0 80px 120px -46px rgba(0,0,0,.95), 0 0 0 1px rgba(125,242,176,.14), inset 0 2px 0 rgba(255,255,255,.08)',
            padding: 15,
            transform: `perspective(1600px) rotateY(-19deg) rotateX(6deg) translateY(${(
              (1 - eased) * 620
            ).toFixed(1)}px)`,
            opacity: eased,
            filter: `blur(${((1 - eased) * 7).toFixed(2)}px)`,
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 15,
              borderRadius: 34,
              background: `linear-gradient(168deg,${C.atlas},${C.riad})`,
              padding: '54px 32px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                fontFamily: F.mono,
                fontSize: 13,
                letterSpacing: '.22em',
                color: 'rgba(247,245,240,.5)',
              }}
            >
              CLÔTURE · 23:47
            </div>
            <div
              style={{
                fontFamily: F.sans,
                fontWeight: 600,
                fontSize: 68,
                letterSpacing: '-0.045em',
                color: C.paper,
                marginTop: 16,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              1 859
              <span style={{ fontSize: 40, opacity: 0.62 }}>,90</span>
            </div>
            <div
              style={{
                fontFamily: F.sans,
                fontSize: 19,
                color: 'rgba(247,245,240,.6)',
                marginTop: 4,
              }}
            >
              MAD · déjà compté
            </div>
            {LINES.slice(0, 5).map(([k, v], i) => (
              <div
                key={k}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginTop: 19,
                  fontFamily: F.sans,
                  fontSize: 17,
                  color: 'rgba(247,245,240,.78)',
                  opacity: interpolate(frame, [132 + i * 9, 148 + i * 9], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  }),
                }}
              >
                <span>{k}</span>
                <span>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </AbsoluteFill>

      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 88,
          textAlign: 'center',
          opacity: interpolate(frame, [206, 232], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
        }}
      >
        <span style={{ fontFamily: F.sans, fontSize: 40, fontWeight: 500, color: C.paper }}>
          Il est 23 h 47. Le compte est{' '}
          <span style={{ fontFamily: F.serif, fontStyle: 'normal', fontSize: 44, color: C.mint }}>
            déjà fait.
          </span>
        </span>
      </div>

      <Vignette strength={0.78} warm />
      <Grain opacity={0.085} />
    </AbsoluteFill>
  );
};
