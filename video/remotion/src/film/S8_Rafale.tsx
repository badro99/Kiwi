import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C, F } from '../theme';
import { Grain } from '../grade';
import { SlamWord } from '../kit';

/* S8 · LA RAFALE — six features at strobe tempo, the reference's mid-film
 * burst. Hard cuts, alternating grounds, one word each. Nothing here needs
 * explaining; the tempo IS the message: there is a lot of product. */

type Card = { word: string; label: string; bg: string; fg: string; labelC: string };
const CARDS: Card[] = [
  { word: 'QR à table', label: 'LE CLIENT COMMANDE SEUL', bg: C.paper, fg: C.ink, labelC: C.atlas },
  { word: 'Addition partagée', label: 'FRACTIONNER EN 2 · 3 · 4', bg: C.atlas, fg: C.paper, labelC: C.mint },
  { word: 'Stock en direct', label: 'RUPTURE ANNONCÉE AVANT LE RUSH', bg: C.ink, fg: C.paper, labelC: C.mint },
  { word: 'Cuisine · KDS', label: 'LES BONS PARTENT SEULS', bg: C.paper, fg: C.atlas, labelC: C.ink },
  { word: 'Paie équipe', label: 'POURBOIRES RÉPARTIS', bg: C.riad, fg: C.paper, labelC: C.mint },
  { word: 'Multi-sites', label: 'TOUS VOS ÉTABLISSEMENTS', bg: C.atlas, fg: C.paper, labelC: C.mint },
];

const STEP = 36;

export const S8_Rafale: React.FC<{ dur?: number }> = ({ dur = 216 }) => {
  const frame = useCurrentFrame();
  const i = Math.min(CARDS.length - 1, Math.floor(frame / STEP));
  const card = CARDS[i];
  const local = frame - i * STEP;

  return (
    <AbsoluteFill style={{ background: card.bg, alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{
          fontFamily: F.mono,
          fontSize: 19,
          letterSpacing: '.34em',
          color: card.labelC,
          marginBottom: 34,
          opacity: local > 6 ? 1 : local / 6,
        }}
      >
        {card.label}
      </div>
      <SlamWord text={card.word} at={i * STEP + 2} fontSize={150} color={card.fg} />
      {/* counter, bottom right — the burst knows where it is */}
      <div
        style={{
          position: 'absolute',
          right: 68,
          bottom: 58,
          fontFamily: F.mono,
          fontSize: 17,
          letterSpacing: '.3em',
          color: card.fg,
          opacity: 0.5,
        }}
      >
        {String(i + 1).padStart(2, '0')} / 06
      </div>
      <Grain opacity={0.05} blend={card.bg === C.paper ? 'multiply' : 'overlay'} />
    </AbsoluteFill>
  );
};
