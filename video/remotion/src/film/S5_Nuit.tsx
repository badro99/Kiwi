import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { C, F } from '../theme';
import { Bokeh, Grain, Vignette } from '../grade';

/* S5 · LA NUIT — the human beat, compressed. 23:47, one lamp, a paper
 * notebook losing its lines to a phone that has already counted them. */

const LINES: [string, string][] = [
  ['Café ×34', '204,00'],
  ['Thé menthe ×28', '168,00'],
  ['Jus orange ×12', '144,00'],
  ['Terrasse soir', '892,50'],
  ['Glovo', '318,40'],
];

export const S5_Nuit: React.FC<{ dur?: number }> = ({ dur = 192 }) => {
  const frame = useCurrentFrame();
  const lamp = 0.94 + Math.sin(frame / 7.3) * 0.02 + Math.sin(frame / 2.9) * 0.012;

  const rise = interpolate(frame, [26, 86], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const eased = 1 - Math.pow(1 - rise, 3);
  const paperOut = interpolate(frame, [46, 120], [1, 0.18], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const push = interpolate(frame, [0, dur], [1.0, 1.08]);
  const cap = interpolate(frame, [128, 150], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: '#030806' }}>
      <Bokeh count={7} hue="255,208,132" seed="lamp5" drift={0.4} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(46% 44% at 43% 52%, rgba(255,226,168,${(0.46 * lamp).toFixed(3)}) 0%, rgba(255,206,138,.14) 46%, rgba(0,0,0,0) 70%)`,
        }}
      />

      <AbsoluteFill style={{ transform: `scale(${push.toFixed(4)})`, transformOrigin: '44% 54%' }}>
        <div
          style={{
            position: 'absolute',
            left: '18%',
            top: '22%',
            width: 660,
            height: 640,
            padding: '46px 52px',
            background: 'linear-gradient(172deg, #EFE7D2 0%, #DCD0B4 100%)',
            boxShadow: '0 60px 90px -40px rgba(0,0,0,.9)',
            transform: 'perspective(1500px) rotateX(44deg) rotateZ(-7deg)',
            transformOrigin: '50% 100%',
            opacity: paperOut,
          }}
        >
          <div style={{ fontFamily: F.mono, fontSize: 18, letterSpacing: '.2em', color: 'rgba(60,44,20,.62)', marginBottom: 24 }}>
            MARDI · 10.06
          </div>
          {LINES.map(([k, v], i) => {
            const claimed = interpolate(frame, [40 + i * 8, 54 + i * 8], [0, 1], {
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

        <div
          style={{
            position: 'absolute',
            left: '57%',
            top: '50%',
            width: 358,
            height: 730,
            marginTop: -365,
            borderRadius: 44,
            background: 'linear-gradient(165deg,#12211B,#05100C)',
            boxShadow:
              '0 80px 120px -46px rgba(0,0,0,.95), 0 0 0 1px rgba(125,242,176,.14), inset 0 2px 0 rgba(255,255,255,.08)',
            padding: 14,
            transform: `perspective(1600px) rotateY(-19deg) rotateX(6deg) translateY(${((1 - eased) * 600).toFixed(1)}px)`,
            opacity: eased,
            filter: `blur(${((1 - eased) * 7).toFixed(2)}px)`,
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 14,
              borderRadius: 33,
              background: `linear-gradient(168deg,${C.atlas},${C.riad})`,
              padding: '48px 30px',
              overflow: 'hidden',
            }}
          >
            <div style={{ fontFamily: F.mono, fontSize: 13, letterSpacing: '.22em', color: 'rgba(247,245,240,.5)' }}>
              CLÔTURE · 23:47
            </div>
            <div
              style={{
                fontFamily: F.sans,
                fontWeight: 600,
                fontSize: 66,
                letterSpacing: '-0.045em',
                color: C.paper,
                marginTop: 14,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              1 859
              <span style={{ fontSize: 38, opacity: 0.62 }}>,90</span>
            </div>
            <div style={{ fontFamily: F.sans, fontSize: 18, color: 'rgba(247,245,240,.6)', marginTop: 4 }}>
              MAD · déjà compté
            </div>
            {LINES.map(([k, v], i) => (
              <div
                key={k}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginTop: 18,
                  fontFamily: F.sans,
                  fontSize: 16.5,
                  color: 'rgba(247,245,240,.78)',
                  opacity: interpolate(frame, [64 + i * 8, 78 + i * 8], [0, 1], {
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

      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 84, textAlign: 'center', opacity: cap }}>
        <span style={{ fontFamily: F.sans, fontSize: 40, fontWeight: 500, color: C.paper }}>
          Il est 23 h 47. Le compte est{' '}
          <span style={{ fontFamily: F.serif, fontStyle: 'normal', fontSize: 44, color: C.mint }}>déjà fait.</span>
        </span>
      </div>

      <Vignette strength={0.78} warm />
      <Grain opacity={0.085} />
    </AbsoluteFill>
  );
};
