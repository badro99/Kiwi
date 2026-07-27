import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, F, SPRING } from '../theme';

/* The whole dashboard is real DOM — every rule, number and axis label below is
 * laid out by the browser at 1920×1080 and rasterised at native resolution.
 * The previous cut composited 3200px screenshots onto CSS-3D planes, which is
 * why it read as "screenshots on a stage" instead of as software. */

const NAV = [
  'Aujourd’hui',
  'Analytics',
  'Transactions',
  'Terminaux',
  'Règlements',
  'Réservations',
  'Tables & addition',
  'Menu',
  'Stock',
];

/* Café Atlas is the repo's own demo venue (assets/venues.js) — the same one the
 * product ships as its demo. No invented customer. */
export const VENUE = { name: 'Café Atlas', city: 'Médina, Tanger' };

export const Sidebar: React.FC<{ reveal: number }> = ({ reveal }) => (
  <div
    style={{
      width: 268,
      flex: '0 0 268px',
      borderRight: `1px solid ${C.line}`,
      padding: '38px 0 0',
      background: C.paper,
      transform: `translateX(${((1 - reveal) * -60).toFixed(2)}px)`,
      opacity: reveal,
    }}
  >
    <div
      style={{
        fontFamily: F.sans,
        fontWeight: 700,
        fontSize: 27,
        letterSpacing: '-0.05em',
        color: C.ink,
        padding: '0 32px 34px',
      }}
    >
      kiwi
      <span
        style={{
          display: 'inline-block',
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: C.atlas,
          marginLeft: 3,
          verticalAlign: 'baseline',
        }}
      />
    </div>
    {NAV.map((n, i) => {
      const on = i === 0;
      /* each row arrives a beat after the one above it */
      const r = interpolate(reveal, [i * 0.045, i * 0.045 + 0.35], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
      return (
        <div
          key={n}
          style={{
            margin: '0 16px 3px',
            padding: '11px 16px',
            borderRadius: 11,
            fontFamily: F.sans,
            fontSize: 16.5,
            fontWeight: on ? 600 : 500,
            color: on ? C.atlas : C.inkMute,
            background: on ? 'rgba(11,110,79,.08)' : 'transparent',
            opacity: r,
            transform: `translateX(${((1 - r) * -14).toFixed(2)}px)`,
          }}
        >
          {n}
        </div>
      );
    })}
  </div>
);

export const TopBar: React.FC<{ reveal: number }> = ({ reveal }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      padding: '40px 52px 26px',
      opacity: reveal,
      transform: `translateY(${((1 - reveal) * -14).toFixed(2)}px)`,
    }}
  >
    <div>
      <div
        style={{
          fontFamily: F.sans,
          fontSize: 40,
          fontWeight: 600,
          letterSpacing: '-0.035em',
          color: C.ink,
        }}
      >
        Aujourd&rsquo;hui
      </div>
      <div
        style={{
          fontFamily: F.mono,
          fontSize: 13,
          letterSpacing: '.06em',
          color: C.inkFaint,
          marginTop: 7,
        }}
      >
        {VENUE.name} · {VENUE.city}
      </div>
    </div>
    <div style={{ display: 'flex', gap: 6 }}>
      {['Aujourd’hui', '7 jours', '30 jours'].map((p, i) => (
        <div
          key={p}
          style={{
            padding: '9px 17px',
            borderRadius: 999,
            fontFamily: F.sans,
            fontSize: 14.5,
            fontWeight: 500,
            color: i === 0 ? C.paper : C.inkMute,
            background: i === 0 ? C.ink : 'transparent',
            border: i === 0 ? 'none' : `1px solid ${C.line}`,
          }}
        >
          {p}
        </div>
      ))}
    </div>
  </div>
);

/* Grouped thousands with a French narrow space, and the centimes stepped down —
 * the big number is the hero of the shot, so its typography has to hold up at
 * 118px. */
export const Money: React.FC<{ value: number; size: number }> = ({ value, size }) => {
  const whole = Math.floor(value);
  const cents = Math.round((value - whole) * 100);
  const grouped = whole.toLocaleString('fr-FR').replace(/ | |,/g, ' ');
  return (
    <span
      style={{
        fontFamily: F.sans,
        fontWeight: 600,
        letterSpacing: '-0.045em',
        fontVariantNumeric: 'tabular-nums',
        fontSize: size,
        lineHeight: 1,
        color: C.paper,
      }}
    >
      {grouped}
      <span style={{ fontSize: size * 0.62, opacity: 0.66 }}>
        ,{String(cents).padStart(2, '0')}
      </span>
      <span
        style={{
          fontSize: size * 0.26,
          fontWeight: 500,
          letterSpacing: '.02em',
          opacity: 0.6,
          marginLeft: size * 0.1,
        }}
      >
        MAD
      </span>
    </span>
  );
};

export const HeroCard: React.FC<{ enter: number; amount: number; barPct: number }> = ({
  enter,
  amount,
  barPct,
}) => {
  const frame = useCurrentFrame();
  /* the LIVE dot pulses on a slow, deterministic sine — no rAF, no Date.now */
  const pulse = 0.55 + 0.45 * Math.sin(frame / 9);

  return (
    <div
      style={{
        margin: '0 52px',
        borderRadius: 22,
        padding: '34px 40px 32px',
        background: `linear-gradient(134deg, ${C.atlas} 0%, ${C.riad} 118%)`,
        boxShadow: '0 34px 70px -30px rgba(5,59,44,.55)',
        opacity: enter,
        transform: `translateY(${((1 - enter) * 34).toFixed(2)}px) scale(${(
          0.97 +
          enter * 0.03
        ).toFixed(4)})`,
        transformOrigin: '50% 0%',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 22 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 13px 6px 10px',
            borderRadius: 999,
            background: 'rgba(125,242,176,.15)',
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: C.mint,
              opacity: pulse,
              boxShadow: `0 0 0 3px rgba(125,242,176,${(pulse * 0.22).toFixed(3)})`,
            }}
          />
          <span
            style={{
              fontFamily: F.mono,
              fontSize: 11.5,
              letterSpacing: '.15em',
              color: C.mint,
            }}
          >
            LIVE
          </span>
        </div>
        <span
          style={{
            fontFamily: F.mono,
            fontSize: 11.5,
            letterSpacing: '.15em',
            color: C.onAtlasFaint,
          }}
        >
          SESSION CONTINUE DEPUIS 08:12
        </span>
      </div>

      <div
        style={{
          fontFamily: F.mono,
          fontSize: 11.5,
          letterSpacing: '.2em',
          color: C.onAtlasFaint,
          marginBottom: 12,
        }}
      >
        ENCAISSÉ AUJOURD&rsquo;HUI
      </div>

      <Money value={amount} size={112} />

      <div style={{ display: 'flex', gap: 54, marginTop: 30 }}>
        {[
          ['vs hier', '+4,2 %'],
          ['vs semaine', '+16 %'],
          ['vs mois dernier', '+11 %'],
          ['net après kiwi', '17 781 MAD'],
        ].map(([k, v]) => (
          <div key={k}>
            <div
              style={{
                fontFamily: F.mono,
                fontSize: 10.5,
                letterSpacing: '.14em',
                color: C.onAtlasFaint,
                textTransform: 'uppercase',
              }}
            >
              {k}
            </div>
            <div
              style={{
                fontFamily: F.sans,
                fontSize: 21,
                fontWeight: 500,
                color: C.paper,
                marginTop: 6,
              }}
            >
              {v}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 28 }}>
        <div
          style={{
            height: 4,
            borderRadius: 999,
            background: 'rgba(247,245,240,.14)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${(barPct * 100).toFixed(2)}%`,
              background: C.mint,
              borderRadius: 999,
            }}
          />
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: 10,
            fontFamily: F.mono,
            fontSize: 10.5,
            letterSpacing: '.14em',
            color: C.onAtlasFaint,
          }}
        >
          <span>OBJECTIF JOUR · 27 000 MAD</span>
          <span>{Math.round(barPct * 100)} %</span>
        </div>
      </div>
    </div>
  );
};

/* ── the revenue curve ─────────────────────────────────────────────────── */

/* A month of a real café's takings: a weekly rhythm (weekends up, Mondays
 * down) on a gentle upward trend. The first pass alternated up/down on every
 * point, which drew a sawtooth — legible as "a chart", not as a business. */
const SERIES = [
  62, 58, 64, 71, 88, 94, 69, 66, 63, 70, 78, 95, 103, 74, 71, 68, 76, 84, 101,
  110, 79, 77, 74, 83, 91, 108, 118, 86, 84, 92,
];

export const ChartCard: React.FC<{ enter: number; draw: number }> = ({ enter, draw }) => {
  const W = 660;
  const H = 232;
  const max = Math.max(...SERIES) * 1.12;
  const pts = SERIES.map((v, i) => {
    const x = (i / (SERIES.length - 1)) * W;
    const y = H - (v / max) * H;
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${W} ${H} L0 ${H} Z`;
  /* dash-offset draw-on: the curve is inked left to right, not faded in */
  const LEN = 1900;

  return (
    <div
      style={{
        flex: 1,
        borderRadius: 18,
        border: `1px solid ${C.line}`,
        background: C.paper,
        padding: '24px 26px 18px',
        opacity: enter,
        transform: `translateY(${((1 - enter) * 26).toFixed(2)}px)`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: F.sans, fontSize: 17, fontWeight: 600, color: C.ink }}>
          Revenu &amp; commandes · 30 j
        </span>
        <span style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: '.1em', color: C.inkFaint }}>
          CE MOIS · MOIS PRÉC.
        </span>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ marginTop: 16, display: 'block' }}>
        <defs>
          <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.atlas} stopOpacity="0.20" />
            <stop offset="100%" stopColor={C.atlas} stopOpacity="0" />
          </linearGradient>
          <clipPath id="wipe">
            <rect x="0" y="0" width={W * draw} height={H} />
          </clipPath>
        </defs>
        {[0.25, 0.5, 0.75].map((g) => (
          <line
            key={g}
            x1="0"
            x2={W}
            y1={H * g}
            y2={H * g}
            stroke={C.lineSoft}
            strokeWidth="1"
          />
        ))}
        <g clipPath="url(#wipe)">
          <path d={area} fill="url(#fill)" />
        </g>
        <path
          d={line}
          fill="none"
          stroke={C.atlas}
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={LEN}
          strokeDashoffset={LEN * (1 - draw)}
        />
      </svg>
    </div>
  );
};

export const DonutCard: React.FC<{ enter: number; fill: number }> = ({ enter, fill }) => {
  const R = 62;
  const CIRC = 2 * Math.PI * R;
  const pct = 0.68 * fill;
  return (
    <div
      style={{
        flex: '0 0 340px',
        borderRadius: 18,
        background: C.ink,
        padding: '24px 26px',
        opacity: enter,
        transform: `translateY(${((1 - enter) * 26).toFixed(2)}px)`,
      }}
    >
      <div
        style={{
          fontFamily: F.mono,
          fontSize: 11,
          letterSpacing: '.15em',
          color: 'rgba(247,245,240,.42)',
        }}
      >
        MIX DE PAIEMENT · 30 J
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 22, marginTop: 16 }}>
        <svg width="150" height="150" viewBox="0 0 150 150">
          <circle cx="75" cy="75" r={R} fill="none" stroke="rgba(247,245,240,.10)" strokeWidth="15" />
          <circle
            cx="75"
            cy="75"
            r={R}
            fill="none"
            stroke={C.mint}
            strokeWidth="15"
            strokeLinecap="round"
            strokeDasharray={`${(CIRC * pct).toFixed(1)} ${CIRC}`}
            transform="rotate(-90 75 75)"
          />
          <text
            x="75"
            y="75"
            textAnchor="middle"
            dominantBaseline="central"
            fill={C.paper}
            style={{ fontFamily: F.sans, fontSize: 30, fontWeight: 600 }}
          >
            {Math.round(pct * 100)}%
          </text>
        </svg>
        <div style={{ flex: 1 }}>
          {[
            ['Cartes', '212 640', C.mint],
            ['Espèces', '96 462', 'rgba(247,245,240,.55)'],
            ['Kiwi Pay', '31 819', C.atlas],
          ].map(([k, v, col]) => (
            <div
              key={k}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 13,
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span
                  style={{ width: 8, height: 8, borderRadius: '50%', background: col as string }}
                />
                <span
                  style={{
                    fontFamily: F.sans,
                    fontSize: 14.5,
                    color: 'rgba(247,245,240,.74)',
                  }}
                >
                  {k}
                </span>
              </span>
              <span
                style={{
                  fontFamily: F.mono,
                  fontSize: 13,
                  color: C.paper,
                }}
              >
                {v}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ── the live transaction feed ─────────────────────────────────────────── */

const ROWS: [string, string, string, string][] = [
  ['14:36:02', 'Kiwi Tap · iPhone de Youssef', 'Visa ••4519', '148,00'],
  ['14:35:41', 'Kiwi Station · Terrasse', 'MC ••1284', '492,50'],
  ['14:34:58', 'Lien de paiement', 'CIH ••6023', '1 240,00'],
  ['14:33:12', 'Kiwi Tap · Comptoir', 'Espèces', '86,00'],
  ['14:31:47', 'Kiwi Station · Salle', 'Visa ••7731', '318,40'],
];

export const FeedCard: React.FC<{ enter: number; rows: number }> = ({ enter, rows }) => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        margin: '0 52px',
        marginTop: 20,
        borderRadius: 18,
        border: `1px solid ${C.line}`,
        background: C.paper,
        overflow: 'hidden',
        opacity: enter,
        transform: `translateY(${((1 - enter) * 22).toFixed(2)}px)`,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '18px 26px',
          borderBottom: `1px solid ${C.lineSoft}`,
        }}
      >
        <span style={{ fontFamily: F.sans, fontSize: 17, fontWeight: 600, color: C.ink }}>
          Transactions
        </span>
        <span
          style={{
            fontFamily: F.mono,
            fontSize: 10.5,
            letterSpacing: '.14em',
            color: C.atlas,
            padding: '4px 9px',
            borderRadius: 999,
            background: 'rgba(11,110,79,.09)',
          }}
        >
          ● LIVE
        </span>
      </div>
      {ROWS.map((r, i) => {
        /* rows drop in one after another, newest at the top */
        const born = i * 7;
        const s = spring({
          frame: frame - born,
          fps,
          config: SPRING,
          durationInFrames: 26,
        });
        const shown = i < rows ? s : 0;
        return (
          <div
            key={r[0]}
            style={{
              display: 'grid',
              gridTemplateColumns: '132px 1fr 210px 150px',
              alignItems: 'center',
              padding: '15px 26px',
              borderBottom: i === ROWS.length - 1 ? 'none' : `1px solid ${C.lineSoft}`,
              opacity: shown,
              transform: `translateY(${((1 - shown) * -12).toFixed(2)}px)`,
            }}
          >
            <span style={{ fontFamily: F.mono, fontSize: 13, color: C.inkFaint }}>{r[0]}</span>
            <span style={{ fontFamily: F.sans, fontSize: 15.5, color: C.ink, fontWeight: 500 }}>
              {r[1]}
            </span>
            <span style={{ fontFamily: F.mono, fontSize: 13, color: C.inkMute }}>{r[2]}</span>
            <span
              style={{
                fontFamily: F.sans,
                fontSize: 16,
                fontWeight: 600,
                color: C.ink,
                textAlign: 'right',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {r[3]} MAD
            </span>
          </div>
        );
      })}
    </div>
  );
};
