import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, F } from '../theme';
import { Grain, KeyLight, Vignette } from '../grade';
import { DepthCard, TiltPanel } from '../kit';
import { Chip, Headline, PhotoScene, Tag, fmtEN } from './photo';

/* ACT III — what the owner sees: the dashboard, the phone, the night count,
 * and the money landing. */

const BARS = [9200, 11800, 10400, 14100, 15900, 19400, 21230];
const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

/* F09 · THE DASHBOARD — the money shot, held longer than in the 30 s cut so
 * the week can breathe. A sale from Act II lands as a toast mid-scene. */
export const F09_Dashboard: React.FC<{ dur?: number }> = ({ dur = 750 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const camT = interpolate(frame, [0, 110], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const cam = 1 - Math.pow(1 - camT, 3);
  const vel = (1 - camT) * 14;
  const rotY = interpolate(cam, [0, 1], [-22, -7]);
  const rotX = interpolate(cam, [0, 1], [12, 5]);
  const scale = interpolate(cam, [0, 1], [0.9, 1.02]);

  const countT = interpolate(frame, [30, 150], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const total = fmtEN(21230.29 * (1 - Math.pow(1 - countT, 3.4)));
  const live = 0.55 + 0.45 * Math.sin(frame / 9);

  const toast = spring({ frame: frame - 470, fps, config: { damping: 15, mass: 0.6, stiffness: 160 } });

  const outT = interpolate(frame, [dur - 26, dur], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
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
      <DepthCard x={90} y={120} title="SETTLEMENT · T+1" value="47,320 MAD" seed="e1" rot={-4} blur={8} />
      <DepthCard x={1420} y={90} title="STOCK" value="92 %" trend="down" seed="e2" rot={3} blur={9} w={330} />
      <DepthCard x={1460} y={760} title="TEAM" value="6 on shift" seed="e3" rot={-2} blur={7} w={360} />
      <DepthCard x={60} y={780} title="TIPS" value="1,240 MAD" seed="e4" rot={5} blur={10} w={340} />

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
                REVENUE · 7 DAYS
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
                <span style={{ fontFamily: F.mono, fontSize: 14, letterSpacing: '.26em', color: C.mint }}>LIVE</span>
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
              <span style={{ fontSize: 56, opacity: 0.55 }}>.{total.cent}</span>
              <span style={{ fontSize: 40, color: C.mint, marginLeft: 16, letterSpacing: '-0.02em' }}>MAD</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 26, marginTop: 46, height: 250 }}>
              {BARS.map((v, i) => {
                const t = interpolate(frame, [40 + i * 12, 88 + i * 12], [0, 1], {
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

          {/* the sale from Act II arrives */}
          {frame >= 470 && (
            <div
              style={{
                position: 'absolute',
                top: 30,
                right: -150,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '16px 26px',
                borderRadius: 100,
                background: 'rgba(6,20,15,.92)',
                boxShadow: '0 24px 50px -18px rgba(0,0,0,.8), 0 0 0 1px rgba(125,242,176,.45)',
                transform: `scale(${toast.toFixed(3)})`,
              }}
            >
              <div style={{ width: 9, height: 9, borderRadius: 5, background: C.mint, boxShadow: '0 0 12px rgba(125,242,176,.8)' }} />
              <span style={{ fontFamily: F.sans, fontWeight: 500, fontSize: 20, color: C.paper, whiteSpace: 'nowrap' }}>
                New sale · 148.00 MAD · Table 4
              </span>
            </div>
          )}
        </TiltPanel>
      </AbsoluteFill>

      <KeyLight x="66%" y="8%" color="180,255,214" opacity={0.14} />
      <Vignette strength={0.7} />
      <Grain opacity={0.065} />
    </AbsoluteFill>
  );
};

/* F10 · WHEREVER YOU ARE — the owner's back, the phone's glow, and the chain
 * of four surfaces lighting up as one sale travels it. */
export const F10_Owner: React.FC<{ dur?: number }> = ({ dur = 390 }) => {
  const frame = useCurrentFrame();
  const CHAIN = ['SERVER', 'TILL', 'GUEST', 'OWNER'];
  const seg = interpolate(frame, [130, 300], [0, 3], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const chipW = 210;
  const x0 = 960 - (chipW * 4 + 36 * 3) / 2;
  const dotX = x0 + chipW / 2 + seg * (chipW + 36);
  return (
    <PhotoScene src="photos/owner-phone.jpg" dur={dur} zoom={[1.05, 1.15]} focus={[46, 48]} shade={0.66}>
      <Headline at={40} parts={[{ t: 'Wherever ' }, { t: 'you', serif: true }, { t: ' are.' }]} bottom={210} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 96, display: 'flex', justifyContent: 'center', gap: 36 }}>
        {CHAIN.map((c, i) => {
          const lit = seg >= i - 0.1;
          return (
            <div
              key={c}
              style={{
                width: chipW,
                textAlign: 'center',
                padding: '15px 0',
                borderRadius: 100,
                background: lit ? 'rgba(11,110,79,.85)' : 'rgba(6,18,13,.7)',
                boxShadow: `0 20px 44px -16px rgba(0,0,0,.7), 0 0 0 1px rgba(125,242,176,${lit ? '.5' : '.16'})`,
                fontFamily: F.mono,
                fontSize: 16,
                letterSpacing: '.26em',
                color: lit ? C.mint : 'rgba(247,245,240,.55)',
              }}
            >
              {c}
            </div>
          );
        })}
      </div>
      {frame >= 130 && frame <= 310 && (
        <div
          style={{
            position: 'absolute',
            left: dotX - 10,
            bottom: 158,
            width: 20,
            height: 20,
            borderRadius: 10,
            background: C.mint,
            boxShadow: '0 0 26px rgba(125,242,176,.95), 0 0 70px rgba(125,242,176,.5)',
          }}
        />
      )}
      <Tag at={315} text="FOUR SCREENS · ONE SYSTEM" bottom={44} x={52} />
    </PhotoScene>
  );
};

/* F11 · THE NIGHT — the film's most beautiful frame gets its time. The till is
 * already counted before the chairs come down. */
export const F11_Night: React.FC<{ dur?: number }> = ({ dur = 540 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rise = spring({ frame: frame - 120, fps, config: { damping: 17, mass: 0.8, stiffness: 120 } });
  const ROWS = [
    ['Total', '1,859.90 MAD'],
    ['Card', '1,214.40'],
    ['Cash', '645.50'],
    ['Tips', '96.00'],
  ];
  return (
    <PhotoScene src="photos/night-cafe.jpg" dur={dur} zoom={[1.03, 1.12]} focus={[56, 34]} wash={0.1} shade={0.5}>
      <Tag at={24} text="11:47 PM" x={52} y={44} />
      <Tag at={24} text="CAFÉ ATLAS · CLOSED" right={52} y={44} />

      {frame >= 120 && (
        <div
          style={{
            position: 'absolute',
            right: 120,
            top: 250,
            width: 430,
            padding: '30px 34px',
            borderRadius: 24,
            background: 'linear-gradient(165deg, rgba(9,30,22,.94), rgba(4,14,10,.94))',
            boxShadow: '0 60px 110px -30px rgba(0,0,0,.9), 0 0 0 1px rgba(125,242,176,.22), inset 0 1px 0 rgba(255,255,255,.08)',
            transform: `translateY(${((1 - rise) * 140).toFixed(1)}px) rotate(-1.5deg)`,
            opacity: Math.min(1, rise * 1.4),
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontFamily: F.mono, fontSize: 15, letterSpacing: '.26em', color: 'rgba(247,245,240,.55)' }}>
              CLOSING SUMMARY
            </span>
            <span style={{ fontFamily: F.mono, fontSize: 15, color: C.mint }}>11:47 PM</span>
          </div>
          {ROWS.map((r, i) => {
            const t = interpolate(frame, [168 + i * 16, 184 + i * 16], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            return (
              <div
                key={r[0]}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '14px 0',
                  borderBottom: i < ROWS.length - 1 ? '1px solid rgba(247,245,240,.08)' : 'none',
                  opacity: t,
                  transform: `translateX(${((1 - t) * 26).toFixed(1)}px)`,
                }}
              >
                <span style={{ fontFamily: F.sans, fontWeight: 500, fontSize: i === 0 ? 26 : 22, color: 'rgba(247,245,240,.75)' }}>
                  {r[0]}
                </span>
                <span
                  style={{
                    fontFamily: F.sans,
                    fontWeight: 600,
                    fontSize: i === 0 ? 30 : 22,
                    color: i === 0 ? C.paper : 'rgba(247,245,240,.85)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {r[1]}
                </span>
              </div>
            );
          })}
          {frame >= 270 && (
            <div
              style={{
                marginTop: 18,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                padding: '11px 22px',
                borderRadius: 100,
                background: 'rgba(125,242,176,.1)',
                border: '1px solid rgba(125,242,176,.5)',
                fontFamily: F.mono,
                fontSize: 14,
                letterSpacing: '.24em',
                color: C.mint,
              }}
            >
              <div style={{ width: 8, height: 8, borderRadius: 4, background: C.mint }} />
              DAY CLOSED
            </div>
          )}
        </div>
      )}

      <Headline at={350} parts={[{ t: 'The count is ' }, { t: 'already done.', serif: true }]} bottom={120} />
    </PhotoScene>
  );
};

/* F12 · THE SETTLEMENT — the number a café owner feels in the stomach. */
export const F12_Settlement: React.FC<{ dur?: number }> = ({ dur = 450 }) => {
  const frame = useCurrentFrame();
  const countT = interpolate(frame, [10, 92], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const amount = fmtEN(47320 * (1 - Math.pow(1 - countT, 3.4)));
  const sub = interpolate(frame, [96, 118], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const creep = 1 + Math.min(1, frame / dur) * 0.015;

  return (
    <AbsoluteFill style={{ background: '#04100A' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(76% 62% at 50% 30%, #0B3A2A 0%, #051B12 55%, #030B07 100%)',
        }}
      />
      <DepthCard x={110} y={140} title="MON — FRI" value="T+1" seed="s1" rot={-4} blur={9} w={300} />
      <DepthCard x={1440} y={150} title="FEES" value="0.9 %" trend="down" seed="s2" rot={3} blur={8} w={330} />
      <DepthCard x={1470} y={740} title="TRANSFER" value="08:00" seed="s3" rot={-2} blur={10} w={310} />
      <DepthCard x={80} y={760} title="TILL ↦ BANK" value="auto" seed="s4" rot={4} blur={9} w={350} />

      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', transform: `translateY(-40px) scale(${creep.toFixed(4)})` }}>
          <div style={{ fontFamily: F.mono, fontSize: 17, letterSpacing: '.32em', color: 'rgba(247,245,240,.55)' }}>
            COLLECTED TODAY
          </div>
          <div
            style={{
              marginTop: 22,
              fontFamily: F.sans,
              fontWeight: 600,
              fontSize: 176,
              letterSpacing: '-0.055em',
              lineHeight: 1,
              color: C.paper,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {amount.grouped}
            <span style={{ fontSize: 64, color: C.mint, marginLeft: 18, letterSpacing: '-0.02em' }}>MAD</span>
          </div>
          <div
            style={{
              marginTop: 26,
              fontFamily: F.sans,
              fontSize: 38,
              fontWeight: 500,
              color: 'rgba(247,245,240,.78)',
              opacity: sub,
              transform: `translateY(${((1 - sub) * 24).toFixed(1)}px)`,
            }}
          >
            In your account{' '}
            <span style={{ fontFamily: F.serif, fontStyle: 'normal', fontSize: 43, color: C.mint }}>
              tomorrow morning.
            </span>
          </div>
          {frame >= 190 && (
            <div
              style={{
                marginTop: 40,
                display: 'inline-block',
                padding: '13px 30px',
                borderRadius: 100,
                background: 'rgba(125,242,176,.08)',
                border: '1px solid rgba(125,242,176,.4)',
                fontFamily: F.mono,
                fontSize: 16,
                letterSpacing: '.26em',
                color: C.mint,
                opacity: interpolate(frame, [190, 208], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
              }}
            >
              T+1 SETTLEMENT · EVERY BUSINESS DAY
            </div>
          )}
        </div>
      </AbsoluteFill>

      <KeyLight x="50%" y="4%" color="180,255,214" opacity={0.14} />
      <Vignette strength={0.72} />
      <Grain opacity={0.07} />
    </AbsoluteFill>
  );
};

export { Chip };
