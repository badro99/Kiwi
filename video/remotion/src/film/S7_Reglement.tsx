import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { C, F } from '../theme';
import { Grain, KeyLight, Vignette } from '../grade';
import { BlobWipe, ClickRing, Cursor, DepthCard, fmtMAD } from '../kit';

/* S7 · LE RÈGLEMENT — the OPEN ACCOUNT moment. A number a café owner feels
 * in the stomach, then the call to action arrives as a green blob under an
 * oversized cursor. */
export const S7_Reglement: React.FC<{ dur?: number }> = ({ dur = 192 }) => {
  const frame = useCurrentFrame();

  const countT = interpolate(frame, [6, 78], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const amount = fmtMAD(47320 * (1 - Math.pow(1 - countT, 3.4)));
  const sub = interpolate(frame, [70, 92], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  /* cta */
  const flyT = interpolate(frame, [96, 142], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fly = 1 - Math.pow(1 - flyT, 2.8);
  const cx = interpolate(fly, [0, 1], [1780, 1050]);
  const cy = interpolate(fly, [0, 1], [70, 830]) + Math.sin(fly * Math.PI) * 120;
  const press = interpolate(frame, [142, 147, 155], [0, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const ctaPulse = frame > 150 ? 1 + Math.sin((frame - 150) / 7) * 0.012 : 1;

  return (
    <AbsoluteFill style={{ background: '#04100A' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(76% 62% at 50% 30%, #0B3A2A 0%, #051B12 55%, #030B07 100%)',
        }}
      />
      <DepthCard x={110} y={140} title="LUN — VEN" value="T+1" seed="r1" rot={-4} blur={9} w={300} />
      <DepthCard x={1440} y={150} title="COMMISSION" value="0,9 %" trend="down" seed="r2" rot={3} blur={8} w={330} />
      <DepthCard x={1470} y={740} title="VIREMENT" value="08:00" seed="r3" rot={-2} blur={10} w={310} />
      <DepthCard x={80} y={760} title="CAISSE ↦ BANQUE" value="auto" seed="r4" rot={4} blur={9} w={350} />

      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', transform: 'translateY(-70px)' }}>
          <div style={{ fontFamily: F.mono, fontSize: 17, letterSpacing: '.32em', color: 'rgba(247,245,240,.55)' }}>
            ENCAISSÉ AUJOURD’HUI
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
            Sur votre compte{' '}
            <span style={{ fontFamily: F.serif, fontStyle: 'normal', fontSize: 43, color: C.mint }}>
              demain matin.
            </span>
          </div>
        </div>
      </AbsoluteFill>

      {/* the CTA blooms in under the cursor */}
      <BlobWipe at={112} x="50%" y="76%" dur={24}>
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 130 }}>
          <div
            style={{
              padding: '34px 92px',
              borderRadius: 200,
              background: `linear-gradient(168deg, #128159 0%, ${C.atlas} 46%, ${C.riad} 100%)`,
              boxShadow:
                '0 50px 100px -30px rgba(0,0,0,.85), 0 0 80px rgba(125,242,176,.24), inset 0 2px 0 rgba(255,255,255,.3), inset 0 -12px 30px rgba(0,0,0,.32)',
              transform: `scale(${((1 - press * 0.05) * ctaPulse).toFixed(3)})`,
              fontFamily: F.sans,
              fontWeight: 600,
              fontSize: 58,
              letterSpacing: '-0.02em',
              color: C.paper,
            }}
          >
            Essayer Kiwi
          </div>
        </AbsoluteFill>
      </BlobWipe>

      <ClickRing at={144} x={1075} y={848} />
      {frame >= 96 && frame < 182 && <Cursor x={cx} y={cy} press={press} size={116} />}

      <KeyLight x="50%" y="4%" color="180,255,214" opacity={0.14} />
      <Vignette strength={0.72} />
      <Grain opacity={0.07} />
    </AbsoluteFill>
  );
};
