import React from 'react';
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from 'remotion';
import '../fonts';
import { C, F } from '../theme';
import { A_Comptoir } from './A_Comptoir';
import { B_Chiffre } from './B_Chiffre';
import { C_Nuit } from './C_Nuit';
import { D_Systeme } from './D_Systeme';

/* Four style tests, 5 s each, back to back. The label is deliberately ugly and
 * outside the frame's design language — it is scaffolding for choosing, not
 * part of any of the four looks. */

export const SHOT = 300;

const TESTS = [
  { k: 'A', name: 'LE COMPTOIR', note: 'objet · macro · lumière dure', C: A_Comptoir, dark: true },
  { k: 'B', name: 'LE CHIFFRE', note: 'typographie cinétique · coupes sèches', C: B_Chiffre, dark: false },
  { k: 'C', name: 'LA NUIT', note: 'récit · une personne · 23 h 47', C: C_Nuit, dark: true },
  { k: 'D', name: 'LE SYSTÈME', note: '3D réelle · caméra en orbite', C: D_Systeme, dark: true },
];

const Label: React.FC<{ k: string; name: string; note: string; dark: boolean }> = ({
  k,
  name,
  note,
  dark,
}) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [6, 22, SHOT - 30, SHOT - 16], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const fg = dark ? C.paper : C.ink;
  return (
    <div style={{ position: 'absolute', left: 54, top: 46, opacity: o * 0.92 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
        <span
          style={{
            fontFamily: F.sans,
            fontSize: 58,
            fontWeight: 700,
            letterSpacing: '-0.05em',
            color: fg,
          }}
        >
          {k}
        </span>
        <span
          style={{
            fontFamily: F.mono,
            fontSize: 16,
            letterSpacing: '.26em',
            color: fg,
          }}
        >
          {name}
        </span>
      </div>
      <div
        style={{
          fontFamily: F.mono,
          fontSize: 12.5,
          letterSpacing: '.16em',
          color: fg,
          opacity: 0.55,
          marginTop: 4,
        }}
      >
        {note}
      </div>
    </div>
  );
};

export const Reel: React.FC = () => (
  <AbsoluteFill style={{ background: '#000' }}>
    {TESTS.map((t, i) => (
      <Sequence key={t.k} from={i * SHOT} durationInFrames={SHOT} layout="none">
        <AbsoluteFill>
          <t.C dur={SHOT} />
          <Label k={t.k} name={t.name} note={t.note} dark={t.dark} />
        </AbsoluteFill>
      </Sequence>
    ))}
  </AbsoluteFill>
);
