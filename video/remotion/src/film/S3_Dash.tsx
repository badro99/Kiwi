import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { C, F } from '../theme';
import { Grain, KeyLight, Vignette } from '../grade';
import { DepthCard, TiltPanel, fmtMAD } from '../kit';

/* S3 · LE TABLEAU DE BORD — the money shot, staged like the reference's
 * trading scene: a field of defocused KPI cards floating behind, and one
 * crisp hero panel where the week's revenue draws itself. */

const BARS = [9200, 11800, 10400, 14100, 15900, 19400, 21230];
const DAYS = ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM'];

export const S3_Dash: React.FC<{ dur?: number }> = ({ dur = 224 }) => {
  const frame = useCurrentFrame();

  /* the camera straightens the panel over the first 90 frames */
  const camT = interpolate(frame, [0, 90], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const cam = 1 - Math.pow(1 - camT, 3);
  /* velocity of the move drives the whole-plane smear */
  const vel = (1 - camT) * 14;

  const rotY = interpolate(cam, [0, 1], [-22, -7]);
  const rotX = interpolate(cam, [0, 1], [12, 5]);
  const scale = interpolate(cam, [0, 1], [0.9, 1.02]);

  /* count-up */
  const countT = interpolate(frame, [26, 128], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const total = fmtMAD(21230.29 * (1 - Math.pow(1 - countT, 3.4)));

  const live = 0.55 + 0.45 * Math.sin(frame / 9);

  /* exit: push through the panel into the next scene */
  const outT = interpolate(frame, [dur - 24, dur], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const out = Math.pow(outT, 2.4);

  return (
    <AbsoluteFill style={{ background: '#041009' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(80% 66% at 58% 30%, #0A3A2B 0%, #052018 50%, #030B08 100%)',
        }}
      />
      {/* the depth field — blurred, dimmed, drifting */}
      <DepthCard x={90} y={120} title="RÈGLEMENT · T+1" value="47 320 MAD" seed="d1" rot={-4} blur={8} />
      <DepthCard x={1420} y={90} title="STOCK" value="92 %" trend="down" seed="d2" rot={3} blur={9} w={330} />
      <DepthCard x={1460} y={760} title="ÉQUIPE" value="6 en service" seed="d3" rot={-2} blur={7} w={360} />
      <DepthCard x={60} y={780} title="POURBOIRES" value="1 240 MAD" seed="d4" rot={5} blur={10} w={340} />

      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <TiltPanel
          rotX={rotX}
          rotY={rotY}
          travel={vel + out * 26}
          style={{
            width: 1060,
            background: 'linear-gradient(163deg, #0E2C21 0%, #082017 60%, #061711 100%)',
            transform: `perspective(1700px) rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg) scale(${(
              scale +
              out * 0.85
            ).toFixed(3)})`,
            opacity: 1 - out * 0.95,
          }}
        >
          <div style={{ padding: '38px 48px 44px' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ fontFamily: F.mono, fontSize: 16, letterSpacing: '.3em', color: 'rgba(247,245,240,.55)' }}>
                REVENUS · 7 JOURS
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 11,
                    height: 11,
                    borderRadius: 6,
                    background: C.mint,
                    boxShadow: `0 0 ${14 + live * 12}px rgba(125,242,176,.8)`,
                    opacity: 0.5 + live * 0.5,
                  }}
                />
                <span style={{ fontFamily: F.mono, fontSize: 14, letterSpacing: '.26em', color: C.mint }}>
                  EN DIRECT
                </span>
              </div>
            </div>

            <div
              style={{
                marginTop: 20,
                fontFamily: F.sans,
                fontWeight: 600,
                fontSize: 120,
                letterSpacing: '-0.05em',
                color: C.paper,
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1,
              }}
            >
              {total.grouped}
              <span style={{ fontSize: 56, opacity: 0.55 }}>,{total.cent}</span>
              <span style={{ fontSize: 40, color: C.mint, marginLeft: 16, letterSpacing: '-0.02em' }}>MAD</span>
            </div>

            {/* the week draws itself */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 26, marginTop: 46, height: 250 }}>
              {BARS.map((v, i) => {
                const t = interpolate(frame, [34 + i * 11, 78 + i * 11], [0, 1], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                });
                const e = 1 - Math.pow(1 - t, 2.8);
                const overshoot = 1 + Math.sin(Math.min(1, t) * Math.PI) * 0.05;
                const h = (v / 21230) * 218 * e * overshoot;
                const isToday = i === 6;
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
                    <div
                      style={{
                        width: '100%',
                        height: Math.max(2, h),
                        borderRadius: 10,
                        background: isToday
                          ? `linear-gradient(180deg, ${C.mint} 0%, ${C.atlas} 90%)`
                          : `linear-gradient(180deg, #1E8A64 0%, #0B4A36 100%)`,
                        boxShadow: isToday ? '0 0 44px rgba(125,242,176,.34)' : undefined,
                        opacity: 0.5 + e * 0.5,
                      }}
                    />
                    <span
                      style={{
                        fontFamily: F.mono,
                        fontSize: 13,
                        letterSpacing: '.2em',
                        color: isToday ? C.mint : 'rgba(247,245,240,.4)',
                      }}
                    >
                      {DAYS[i]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </TiltPanel>
      </AbsoluteFill>

      <KeyLight x="66%" y="8%" color="180,255,214" opacity={0.14} />
      <Vignette strength={0.7} />
      <Grain opacity={0.065} />
    </AbsoluteFill>
  );
};
