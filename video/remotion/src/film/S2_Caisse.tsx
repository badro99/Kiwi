import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, F } from '../theme';
import { Bokeh, Grain, KeyLight, Vignette } from '../grade';
import { BlobWipe, ClickRing, Cursor, TiltPanel, fmtMAD } from '../kit';

/* S2 · LA CAISSE — one glossy button in the dark, an oversized cursor that
 * actually clicks it, and the till that blooms out of the click. The sale is
 * an action performed, not a screen displayed. */

const LINES: [string, string][] = [
  ['Café allongé ×2', '24,00'],
  ['Msemen miel', '17,00'],
  ['Jus d’orange ×2', '48,00'],
  ['Thé à la menthe ×3', '36,00'],
  ['Pastilla du jour', '23,00'],
];

export const S2_Caisse: React.FC<{ dur?: number }> = ({ dur = 220 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  /* the button breathes in */
  const btnIn = spring({ frame, fps, config: { damping: 18, mass: 0.8, stiffness: 130 } });

  /* cursor flight: arc in from bottom right, press at 58 */
  const flyT = interpolate(frame, [8, 56], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fly = 1 - Math.pow(1 - flyT, 2.8);
  const cx = interpolate(fly, [0, 1], [1700, 968]);
  const cy = interpolate(fly, [0, 1], [1030, 540]) - Math.sin(fly * Math.PI) * 160;
  const press = interpolate(frame, [56, 61, 68], [0, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  /* button dips under the press then hands off to the blob */
  const dip = 1 - press * 0.06;
  const btnOut = interpolate(frame, [66, 84], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  /* till total */
  const totalT = interpolate(frame, [96, 152], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const total = fmtMAD(148 * (1 - Math.pow(1 - totalT, 3.2)));

  /* the panel's own camera: settles upright, then leaves toward the lens */
  const settle = spring({ frame: frame - 66, fps, config: { damping: 30, mass: 1, stiffness: 70 } });
  const leaveT = interpolate(frame, [dur - 26, dur], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const leave = Math.pow(leaveT, 2.2);
  const paid = interpolate(frame, [160, 172], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: '#04110C' }}>
      <AbsoluteFill style={{ filter: 'blur(2px)' }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(72% 60% at 40% 28%, #0C4433 0%, #06231A 56%, #030D09 100%)',
          }}
        />
        <Bokeh count={13} hue="255,214,140" seed="s2w" />
        <Bokeh count={8} hue="125,242,176" seed="s2m" drift={1.5} />
      </AbsoluteFill>

      {/* the button */}
      {btnOut > 0 && (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: btnOut }}>
          <div
            style={{
              padding: '38px 92px',
              borderRadius: 200,
              background: `linear-gradient(168deg, #128159 0%, ${C.atlas} 42%, ${C.riad} 100%)`,
              boxShadow:
                '0 60px 110px -30px rgba(0,0,0,.85), 0 0 90px rgba(125,242,176,.22), inset 0 2px 0 rgba(255,255,255,.32), inset 0 -14px 34px rgba(0,0,0,.35)',
              transform: `scale(${(btnIn * dip).toFixed(3)})`,
              display: 'flex',
              alignItems: 'baseline',
              gap: 26,
            }}
          >
            <span
              style={{
                fontFamily: F.sans,
                fontWeight: 600,
                fontSize: 64,
                letterSpacing: '-0.03em',
                color: C.paper,
              }}
            >
              Encaisser
            </span>
            <span style={{ fontFamily: F.mono, fontSize: 26, letterSpacing: '.08em', color: C.mint }}>
              148,00 MAD
            </span>
          </div>
        </AbsoluteFill>
      )}

      <ClickRing at={58} x={960} y={540} />

      {/* the till blooms out of the click point */}
      <BlobWipe at={64} x="50%" y="50%" dur={30}>
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
          <TiltPanel
            rotX={interpolate(settle, [0, 1], [16, 7]) + leave * 10}
            rotY={interpolate(settle, [0, 1], [-24, -11]) - leave * 14}
            travel={leave * 22}
            style={{
              width: 780,
              background: 'linear-gradient(165deg, #0D2A20 0%, #071B14 70%, #05130E 100%)',
              transform: `perspective(1700px) rotateX(${(interpolate(settle, [0, 1], [16, 7]) + leave * 10).toFixed(2)}deg) rotateY(${(
                interpolate(settle, [0, 1], [-24, -11]) - leave * 14
              ).toFixed(2)}deg) scale(${(0.94 + settle * 0.06 + leave * 0.55).toFixed(3)})`,
              opacity: 1 - leave * 0.9,
            }}
          >
            <div style={{ padding: '30px 42px 38px' }}>
              {/* chrome */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 26 }}>
                {['#E0574F', '#E0A23E', '#3DBB6E'].map((c) => (
                  <div key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c, opacity: 0.9 }} />
                ))}
                <div
                  style={{
                    marginLeft: 18,
                    fontFamily: F.mono,
                    fontSize: 15,
                    letterSpacing: '.26em',
                    color: 'rgba(247,245,240,.55)',
                  }}
                >
                  CAISSE · CAFÉ ATLAS
                </div>
                <div
                  style={{
                    marginLeft: 'auto',
                    fontFamily: F.mono,
                    fontSize: 14,
                    letterSpacing: '.2em',
                    color: C.mint,
                    opacity: paid,
                  }}
                >
                  PAYÉ · CARTE
                </div>
              </div>

              {LINES.map(([k, v], i) => {
                const rowT = interpolate(frame, [88 + i * 8, 100 + i * 8], [0, 1], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                });
                const e = 1 - Math.pow(1 - rowT, 3);
                return (
                  <div
                    key={k}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '15px 2px',
                      borderBottom: '1px solid rgba(247,245,240,.09)',
                      fontFamily: F.sans,
                      fontSize: 25,
                      color: 'rgba(247,245,240,.88)',
                      opacity: e,
                      transform: `translateX(${((1 - e) * 60).toFixed(1)}px)`,
                    }}
                  >
                    <span>{k}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums', color: 'rgba(247,245,240,.66)' }}>{v}</span>
                  </div>
                );
              })}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 28 }}>
                <span style={{ fontFamily: F.mono, fontSize: 16, letterSpacing: '.3em', color: 'rgba(247,245,240,.5)' }}>
                  TOTAL
                </span>
                <span
                  style={{
                    fontFamily: F.sans,
                    fontWeight: 600,
                    fontSize: 66,
                    letterSpacing: '-0.04em',
                    color: C.paper,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {total.grouped}
                  <span style={{ fontSize: 36, opacity: 0.6 }}>,{total.cent}</span>
                  <span style={{ fontSize: 26, color: C.mint, marginLeft: 12 }}>MAD</span>
                </span>
              </div>
            </div>
          </TiltPanel>
        </AbsoluteFill>
      </BlobWipe>

      {/* cursor exits after the click */}
      {frame < 96 && <Cursor x={cx} y={cy} press={press} size={110} />}

      <KeyLight x="28%" y="10%" color="255,236,196" opacity={0.2} />
      <Vignette strength={0.72} warm />
      <Grain opacity={0.07} />
    </AbsoluteFill>
  );
};
