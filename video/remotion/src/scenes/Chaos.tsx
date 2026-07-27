import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { C, F } from '../theme';
import { Caption } from '../Caption';

/* Ten things a café owner is holding in their head at once. Every one of them
 * is a surface Kiwi actually has (tables, stock, règlements, réservations,
 * terminaux, Glovo) — the cold open is a promise the rest of the film keeps.
 *
 * Positions are authored, not random: a seeded scatter reads as noise, and this
 * needs to read as a specific person's specific bad afternoon. */
type Chip = {
  t: string;
  sub?: string;
  x: number;
  y: number;
  rot: number;
  depth: number;
  tone: 'alert' | 'warn' | 'plain';
  in: number;
};

const CHIPS: Chip[] = [
  { t: 'TPE en panne', x: 14, y: 22, rot: -4.5, depth: 0.15, tone: 'alert', in: 8 },
  { t: 'Service midi', sub: '34 couverts · 9 en attente', x: 39, y: 12, rot: 2.4, depth: 0.0, tone: 'plain', in: 20 },
  { t: 'Caisse 2', sub: 'plus de fond de caisse', x: 66, y: 15, rot: -2.2, depth: 0.05, tone: 'plain', in: 32 },
  { t: 'Addition table 7', x: 20, y: 41, rot: 3.6, depth: 0.3, tone: 'warn', in: 44 },
  { t: 'Réservation 20 h ?', x: 55, y: 34, rot: -1.6, depth: 0.22, tone: 'plain', in: 56 },
  { t: 'Stock épuisé', sub: 'mozzarella', x: 76, y: 42, rot: 4.2, depth: 0.1, tone: 'warn', in: 68 },
  { t: 'Glovo · 4 à préparer', x: 10, y: 58, rot: -3.1, depth: 0.35, tone: 'plain', in: 80 },
  { t: 'CA · −27,5 % MDR', x: 33, y: 63, rot: 1.8, depth: 0.18, tone: 'alert', in: 92 },
  { t: 'Fournisseur Leïla ?', x: 61, y: 60, rot: -4.8, depth: 0.28, tone: 'plain', in: 104 },
  { t: 'Règlement · quand ?', x: 82, y: 66, rot: 2.9, depth: 0.4, tone: 'warn', in: 116 },
];

const TONE = {
  alert: { bg: '#FBE9E7', fg: '#8C2F22', dot: '#C0442F' },
  warn: { bg: '#FAF1DC', fg: '#7A5A18', dot: '#C08A2F' },
  plain: { bg: C.paper, fg: C.ink, dot: null as string | null },
};

export const Chaos: React.FC<{ exitAt: number }> = ({ exitAt }) => {
  const frame = useCurrentFrame();

  /* the whole cloud drifts as one body, slowly, forever unresolved */
  const drift = frame / 60;

  return (
    <div style={{ position: 'absolute', inset: 0, background: C.paperDeep }}>
      {/* a soft warm light so the chips sit in a room, not on a swatch */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(78% 62% at 50% 42%, rgba(255,255,255,.85) 0%, rgba(239,235,227,0) 72%)',
        }}
      />

      {CHIPS.map((c, i) => {
        const app = interpolate(frame, [c.in, c.in + 22], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        /* on exit every chip is thrown outward from centre and blurred away */
        const ex = interpolate(frame, [exitAt, exitAt + 34], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        const outX = (c.x - 50) * 3.4 * ex;
        const outY = (c.y - 44) * 3.4 * ex;

        const tone = TONE[c.tone];
        /* depth drives size, blur and speed together — one number, so the
           parallax can't disagree with the focus */
        const scale = (1 - c.depth * 0.42) * (0.86 + app * 0.14);
        const wob = Math.sin(drift * 0.8 + i * 1.7) * (2 + c.depth * 5);
        const wobY = Math.cos(drift * 0.63 + i * 2.3) * (1.6 + c.depth * 4);

        return (
          <div
            key={c.t}
            style={{
              position: 'absolute',
              left: `${c.x}%`,
              top: `${c.y}%`,
              opacity: app * (1 - ex) * (1 - c.depth * 0.35),
              filter: `blur(${(c.depth * 3.1 + (1 - app) * 6 + ex * 7).toFixed(2)}px)`,
              transform:
                `translate(${(outX + wob).toFixed(2)}%, ${(outY + wobY).toFixed(2)}%) ` +
                `rotate(${(c.rot + ex * c.rot * 2.2).toFixed(2)}deg) ` +
                `scale(${scale.toFixed(4)})`,
              transformOrigin: '50% 50%',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: c.sub ? '14px 20px' : '12px 20px',
                borderRadius: 12,
                background: tone.bg,
                boxShadow:
                  '0 18px 34px -16px rgba(10,15,13,.28), 0 1px 0 rgba(255,255,255,.7) inset',
                whiteSpace: 'nowrap',
              }}
            >
              {tone.dot && (
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: tone.dot,
                    flex: '0 0 auto',
                  }}
                />
              )}
              <div>
                <div
                  style={{
                    fontFamily: F.sans,
                    fontSize: 20,
                    fontWeight: 500,
                    letterSpacing: '-0.015em',
                    color: tone.fg,
                  }}
                >
                  {c.t}
                </div>
                {c.sub && (
                  <div
                    style={{
                      fontFamily: F.sans,
                      fontSize: 15,
                      color: tone.fg,
                      opacity: 0.58,
                      marginTop: 3,
                    }}
                  >
                    {c.sub}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      <Caption head="Gérer un café, c’est" accent="jongler." from={62} hold={192} />
      <Caption head="Et si tout tenait sur un seul" accent="écran" tail=" ?" from={264} hold={158} />
    </div>
  );
};
