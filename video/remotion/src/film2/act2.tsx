import React from 'react';
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, F } from '../theme';
import { Bokeh, Grain, KeyLight, Vignette } from '../grade';
import { BlobWipe, ClickRing, Cursor, TiltPanel } from '../kit';
import { Chip, Headline, PhotoScene, Tag, fmtEN } from './photo';

/* ACT II — the product at work: one sale travels from the button to the
 * kitchen, photographed from both sides of the counter. */

const LINES: { n: string; p: string; img?: string }[] = [
  { n: 'Espresso ×2', p: '24.00' },
  { n: 'Msemen with honey', p: '17.00', img: 'photos/menu-msemen.jpg' },
  { n: 'Orange juice ×2', p: '48.00', img: 'photos/menu-juice.jpg' },
  { n: 'Mint tea ×3', p: '36.00', img: 'photos/menu-tea.jpg' },
  { n: 'Almond ghriba', p: '23.00', img: 'photos/menu-ghriba.jpg' },
];

/* F04 · THE TILL — the cursor clicks Charge and the till blooms out of the
 * click. The order lines carry real photographs of the menu. */
export const F04_Till: React.FC<{ dur?: number }> = ({ dur = 660 }) => {
  const frame = useCurrentFrame();

  const flyT = interpolate(frame, [10, 70], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fly = 1 - Math.pow(1 - flyT, 2.8);
  const cx = interpolate(fly, [0, 1], [1720, 985]);
  const cy = interpolate(fly, [0, 1], [130, 545]) + Math.sin(fly * Math.PI) * 150;
  const press = interpolate(frame, [70, 76, 84], [0, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const countT = interpolate(frame, [160, 240], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const total = fmtEN(148 * (1 - Math.pow(1 - countT, 3.2)));

  const outT = interpolate(frame, [dur - 28, dur], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const out = Math.pow(outT, 2.4);

  const drift = Math.sin(frame / 90) * 1.6;

  return (
    <AbsoluteFill style={{ background: '#050E09' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(78% 64% at 50% 34%, #0B3A2A 0%, #05190F 55%, #030B07 100%)',
        }}
      />
      <Bokeh count={12} seed="till2" />

      {/* the button the film clicks */}
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            padding: '32px 84px',
            borderRadius: 200,
            background: `linear-gradient(168deg, #128159 0%, ${C.atlas} 46%, ${C.riad} 100%)`,
            boxShadow:
              '0 50px 100px -30px rgba(0,0,0,.85), 0 0 70px rgba(125,242,176,.2), inset 0 2px 0 rgba(255,255,255,.3), inset 0 -12px 30px rgba(0,0,0,.32)',
            transform: `scale(${(1 - press * 0.05).toFixed(3)})`,
            fontFamily: F.sans,
            fontWeight: 600,
            fontSize: 54,
            letterSpacing: '-0.02em',
            color: C.paper,
          }}
        >
          Charge · 148.00 MAD
        </div>
      </AbsoluteFill>

      <ClickRing at={72} x={985} y={560} />

      {/* the till blooms out of the click */}
      <BlobWipe at={78} x="51%" y="52%" dur={32}>
        <AbsoluteFill
          style={{
            background: 'radial-gradient(78% 64% at 50% 34%, #0B3A2A 0%, #05190F 55%, #030B07 100%)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Bokeh count={10} seed="till2b" />
          <TiltPanel
            rotX={6 + drift * 0.4}
            rotY={-9 + drift}
            travel={out * 24}
            style={{
              width: 840,
              background: 'linear-gradient(163deg, #0E2C21 0%, #082017 60%, #061711 100%)',
              transform: `perspective(1700px) rotateX(${(6 + drift * 0.4).toFixed(2)}deg) rotateY(${(
                -9 + drift
              ).toFixed(2)}deg) scale(${(1 + out * 0.85).toFixed(3)})`,
              opacity: 1 - out * 0.95,
            }}
          >
            <div style={{ padding: '34px 44px 40px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  {['#E0574F', '#E0A23E', '#37B871'].map((c) => (
                    <div key={c} style={{ width: 12, height: 12, borderRadius: 6, background: c, opacity: 0.85 }} />
                  ))}
                </div>
                <div
                  style={{
                    marginLeft: 14,
                    fontFamily: F.mono,
                    fontSize: 15,
                    letterSpacing: '.28em',
                    color: 'rgba(247,245,240,.55)',
                  }}
                >
                  TILL · CAFÉ ATLAS
                </div>
                <div style={{ marginLeft: 'auto', fontFamily: F.mono, fontSize: 14, letterSpacing: '.2em', color: C.mint }}>
                  TABLE 4
                </div>
              </div>

              <div style={{ marginTop: 26 }}>
                {LINES.map((l, i) => {
                  const t = interpolate(frame, [112 + i * 10, 126 + i * 10], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  });
                  const e = 1 - Math.pow(1 - t, 3);
                  return (
                    <div
                      key={l.n}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 18,
                        padding: '13px 0',
                        borderBottom: '1px solid rgba(247,245,240,.08)',
                        opacity: e,
                        transform: `translateX(${((1 - e) * 40).toFixed(1)}px)`,
                      }}
                    >
                      {l.img ? (
                        <Img
                          src={staticFile(l.img)}
                          style={{ width: 48, height: 48, borderRadius: 24, objectFit: 'cover', flexShrink: 0 }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 48,
                            height: 48,
                            borderRadius: 24,
                            background: C.atlas,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontFamily: F.mono,
                            fontSize: 18,
                            color: C.paper,
                            flexShrink: 0,
                          }}
                        >
                          E
                        </div>
                      )}
                      <span style={{ fontFamily: F.sans, fontWeight: 500, fontSize: 27, color: 'rgba(247,245,240,.92)' }}>
                        {l.n}
                      </span>
                      <span
                        style={{
                          marginLeft: 'auto',
                          fontFamily: F.sans,
                          fontWeight: 500,
                          fontSize: 27,
                          color: 'rgba(247,245,240,.65)',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {l.p}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 26 }}>
                <span style={{ fontFamily: F.mono, fontSize: 16, letterSpacing: '.28em', color: 'rgba(247,245,240,.55)' }}>
                  TOTAL
                </span>
                <span
                  style={{
                    marginLeft: 'auto',
                    fontFamily: F.sans,
                    fontWeight: 600,
                    fontSize: 66,
                    letterSpacing: '-0.04em',
                    color: C.paper,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {total.grouped}
                  <span style={{ fontSize: 36, opacity: 0.6 }}>.{total.cent}</span>
                  <span style={{ fontSize: 30, color: C.mint, marginLeft: 12 }}>MAD</span>
                </span>
              </div>

              <div style={{ display: 'flex', gap: 16, marginTop: 24 }}>
                {frame >= 268 && (
                  <div
                    style={{
                      padding: '12px 26px',
                      borderRadius: 100,
                      background: 'rgba(125,242,176,.1)',
                      border: '1px solid rgba(125,242,176,.5)',
                      fontFamily: F.mono,
                      fontSize: 16,
                      letterSpacing: '.22em',
                      color: C.mint,
                      transform: `scale(${spring2(frame - 268).toFixed(3)})`,
                    }}
                  >
                    PAID · CARD
                  </div>
                )}
                {frame >= 336 && (
                  <div
                    style={{
                      padding: '12px 26px',
                      borderRadius: 100,
                      background: 'rgba(247,245,240,.05)',
                      border: '1px solid rgba(247,245,240,.2)',
                      fontFamily: F.mono,
                      fontSize: 16,
                      letterSpacing: '.22em',
                      color: 'rgba(247,245,240,.7)',
                      transform: `scale(${spring2(frame - 336).toFixed(3)})`,
                    }}
                  >
                    RECEIPT PRINTED
                  </div>
                )}
              </div>
            </div>
          </TiltPanel>
        </AbsoluteFill>
      </BlobWipe>

      {frame >= 6 && frame < 108 && <Cursor x={cx} y={cy} press={press} size={112} />}

      <KeyLight x="60%" y="8%" color="180,255,214" opacity={0.13} />
      <Vignette strength={0.7} />
      <Grain opacity={0.065} />
    </AbsoluteFill>
  );
};

/* cheap deterministic pop for chips inside the till — a spring shape without
 * the hook plumbing */
const spring2 = (f: number) => {
  const t = Math.min(1, f / 14);
  return 1 + Math.sin(Math.min(1, t) * Math.PI) * 0.12 * (1 - t);
};

/* F05 · THE TAP — the physical half of the payment. */
export const F05_CardTap: React.FC<{ dur?: number }> = ({ dur = 330 }) => {
  return (
    <PhotoScene src="photos/card-tap.jpg" dur={dur} zoom={[1.05, 1.15]} focus={[46, 58]}>
      <ClickRing at={56} x={880} y={600} />
      <ClickRing at={66} x={880} y={600} />
      <Chip at={86} x="49%" y="34%" text="148.00 MAD · Approved" mint />
      <Headline at={150} parts={[{ t: 'Three seconds. ' }, { t: 'Paid.', serif: true }]} bottom={130} />
    </PhotoScene>
  );
};

/* F06 · QR AT THE TABLE — guests order without waiting. */
export const F06_QR: React.FC<{ dur?: number }> = ({ dur = 390 }) => {
  const frame = useCurrentFrame();
  const glow = 0.5 + 0.5 * Math.sin(frame / 11);
  return (
    <PhotoScene src="photos/qr-table.jpg" dur={dur} zoom={[1.05, 1.17]} focus={[62, 54]}>
      <div
        style={{
          position: 'absolute',
          left: '54%',
          top: '38%',
          width: 420,
          height: 420,
          borderRadius: '50%',
          background: `radial-gradient(circle, rgba(125,242,176,${(0.16 + glow * 0.1).toFixed(3)}) 0%, rgba(125,242,176,0) 62%)`,
          pointerEvents: 'none',
        }}
      />
      <Chip at={60} x="20%" y="24%" text="Scan" size={18} />
      <Chip at={100} x="20%" y="33%" text="Order" size={18} />
      <Chip at={140} x="20%" y="42%" text="Pay" size={18} mint />
      <Headline at={190} parts={[{ t: 'Guests order ' }, { t: 'from the table.', serif: true }]} bottom={140} />
      <Tag at={260} text="NO APP · NO WAITING" bottom={62} x={52} />
    </PhotoScene>
  );
};

/* F07 · SERVICE — the point of all of it. */
export const F07_Service: React.FC<{ dur?: number }> = ({ dur = 330 }) => {
  return (
    <PhotoScene src="photos/tea-service.jpg" dur={dur} zoom={[1.07, 1.16]} focus={[50, 46]}>
      <Chip at={40} x="58%" y="14%" text="Table 4 · sent to the kitchen" />
      <Headline at={110} parts={[{ t: 'Service stays ' }, { t: 'human.', serif: true }]} bottom={130} />
    </PhotoScene>
  );
};

/* a KDS ticket sliding down over the kitchen pass — the digital echo of the
 * paper tickets hanging in the photograph */
const KDSTicket: React.FC<{
  at: number;
  x: string;
  table: string;
  time: string;
  lines: string[];
  readyAt?: number;
}> = ({ at, x, table, time, lines, readyAt }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - at, fps, config: { damping: 16, mass: 0.7, stiffness: 150 } });
  if (frame < at) return null;
  const ready = readyAt !== undefined && frame >= readyAt;
  const fill = interpolate(frame, [at + 10, readyAt ?? at + 160], [0, 100], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: 60,
        width: 250,
        padding: '20px 22px',
        borderRadius: 18,
        background: 'linear-gradient(165deg, rgba(10,34,25,.94), rgba(5,17,12,.92))',
        boxShadow: `0 34px 60px -20px rgba(0,0,0,.8), 0 0 0 1px rgba(125,242,176,${ready ? '.55' : '.2'})`,
        transform: `translateY(${((1 - s) * -160).toFixed(1)}px)`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: F.mono, fontSize: 15 }}>
        <span style={{ color: C.mint, letterSpacing: '.2em' }}>{table}</span>
        <span style={{ color: 'rgba(247,245,240,.5)', letterSpacing: '.1em' }}>{time}</span>
      </div>
      {lines.map((l) => (
        <div
          key={l}
          style={{ marginTop: 10, fontFamily: F.sans, fontWeight: 500, fontSize: 20, color: 'rgba(247,245,240,.88)' }}
        >
          {l}
        </div>
      ))}
      <div style={{ marginTop: 14, height: 7, borderRadius: 4, background: 'rgba(247,245,240,.1)', overflow: 'hidden' }}>
        <div
          style={{
            width: `${fill.toFixed(0)}%`,
            height: '100%',
            background: `linear-gradient(90deg, ${C.atlas}, ${C.mint})`,
          }}
        />
      </div>
      {ready ? (
        <div
          style={{
            marginTop: 12,
            fontFamily: F.mono,
            fontSize: 14,
            letterSpacing: '.24em',
            color: C.mint,
          }}
        >
          READY
        </div>
      ) : null}
    </div>
  );
};

/* F08 · THE KITCHEN — paper tickets in the photo, live tickets over it. */
export const F08_Kitchen: React.FC<{ dur?: number }> = ({ dur = 420 }) => {
  return (
    <PhotoScene src="photos/kitchen-pass.jpg" dur={dur} zoom={[1.05, 1.17]} focus={[44, 56]} topShade={0.42}>
      <KDSTicket at={120} x="52%" table="T4" time="12:41" lines={['Tagine ×1', 'Mint tea ×3']} readyAt={300} />
      <KDSTicket at={152} x="68%" table="T7" time="12:43" lines={['Msemen ×2']} />
      <KDSTicket at={184} x="84%" table="BAR" time="12:44" lines={['Espresso ×2']} />
      <Headline at={44} parts={[{ t: 'The kitchen sees it ' }, { t: 'instantly.', serif: true }]} bottom={130} />
      <Tag at={250} text="KITCHEN DISPLAY · REAL TIME" bottom={62} x={52} />
    </PhotoScene>
  );
};
