import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { C, F } from '../theme';
import { Grain, KeyLight, Vignette } from '../grade';

/* S6 · LE SYSTÈME — a camera in true 3D orbit around four surfaces, and a
 * single mint sale that travels the chain: the serveur takes it, the caisse
 * rings it, the client pays it, the patron sees it. */

type Node = { label: string; sub: string; x: number; y: number; z: number };
const NODES: Node[] = [
  { label: 'SERVEUR', sub: 'commande prise', x: -640, y: -60, z: -140 },
  { label: 'CAISSE', sub: 'vente encaissée', x: -215, y: 110, z: 70 },
  { label: 'CLIENT', sub: 'paiement carte', x: 250, y: -90, z: -50 },
  { label: 'PATRON', sub: 'vu en direct', x: 690, y: 80, z: 130 },
];

export const S6_Systeme: React.FC<{ dur?: number }> = ({ dur = 222 }) => {
  const frame = useCurrentFrame();

  const orbit = interpolate(frame, [0, dur], [-26, 20]);
  const dollyT = interpolate(frame, [0, 110], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const dolly = interpolate(1 - Math.pow(1 - dollyT, 2.6), [0, 1], [-520, -120]);

  /* the sale-point travels the chain */
  const salePathT = interpolate(frame, [34, 172], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const seg = Math.min(2.999, salePathT * 3);
  const si = Math.floor(seg);
  const st = seg - si;
  const ease = st * st * (3 - 2 * st);
  const sx = NODES[si].x + (NODES[si + 1].x - NODES[si].x) * ease;
  const sy = NODES[si].y + (NODES[si + 1].y - NODES[si].y) * ease - Math.sin(ease * Math.PI) * 120;
  const sz = NODES[si].z + (NODES[si + 1].z - NODES[si].z) * ease;

  const cap = interpolate(frame, [172, 194], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: '#040F0A' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(70% 58% at 50% 34%, #0A3226 0%, #051A12 55%, #030B08 100%)',
        }}
      />

      <AbsoluteFill style={{ perspective: 1700, perspectiveOrigin: '50% 46%' }}>
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transformStyle: 'preserve-3d',
            transform: `translateZ(${dolly.toFixed(1)}px) rotateY(${orbit.toFixed(2)}deg) rotateX(6deg)`,
          }}
        >
          {NODES.map((n, i) => {
            const arriveF = 34 + (i / 3) * 138;
            const lit = interpolate(frame, [arriveF - 6, arriveF + 8], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            const inT = interpolate(frame, [i * 7, i * 7 + 16], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            const e = 1 - Math.pow(1 - inT, 3);
            return (
              <div
                key={n.label}
                style={{
                  position: 'absolute',
                  left: n.x - 190,
                  top: n.y - 130,
                  width: 380,
                  height: 260,
                  borderRadius: 26,
                  transformStyle: 'preserve-3d',
                  transform: `translateZ(${n.z}px) translateY(${((1 - e) * 90).toFixed(1)}px)`,
                  background: `linear-gradient(160deg, ${lit > 0.5 ? '#17604A' : '#103527'} 0%, #092219 100%)`,
                  boxShadow: `0 60px 100px -40px rgba(0,0,0,.9), 0 0 0 1px rgba(125,242,176,${(0.14 + lit * 0.3).toFixed(2)})${
                    lit > 0.5 ? ', 0 0 90px rgba(125,242,176,.22)' : ''
                  }`,
                  opacity: e,
                  padding: '32px 34px',
                }}
              >
                <div style={{ fontFamily: F.mono, fontSize: 18, letterSpacing: '.28em', color: C.mint, opacity: 0.6 + lit * 0.4 }}>
                  {n.label}
                </div>
                <div
                  style={{
                    marginTop: 16,
                    fontFamily: F.sans,
                    fontSize: 30,
                    fontWeight: 500,
                    color: `rgba(247,245,240,${(0.45 + lit * 0.5).toFixed(2)})`,
                  }}
                >
                  {n.sub}
                </div>
                <div
                  style={{
                    marginTop: 26,
                    height: 9,
                    borderRadius: 4,
                    background: 'rgba(247,245,240,.1)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${(lit * 100).toFixed(0)}%`,
                      height: '100%',
                      background: `linear-gradient(90deg, ${C.atlas}, ${C.mint})`,
                    }}
                  />
                </div>
              </div>
            );
          })}

          {/* the sale */}
          {salePathT > 0 && salePathT < 1 && (
            <div
              style={{
                position: 'absolute',
                left: sx - 23,
                top: sy - 23,
                width: 46,
                height: 46,
                borderRadius: 24,
                transform: `translateZ(${(sz + 50).toFixed(1)}px)`,
                background: C.mint,
                boxShadow: '0 0 60px rgba(125,242,176,.95), 0 0 140px rgba(125,242,176,.5)',
              }}
            />
          )}
        </div>
      </AbsoluteFill>

      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 88, textAlign: 'center', opacity: cap }}>
        <span style={{ fontFamily: F.sans, fontSize: 42, fontWeight: 500, color: C.paper }}>
          Quatre écrans.{' '}
          <span style={{ fontFamily: F.serif, fontStyle: 'normal', fontSize: 47, color: C.mint }}>Un seul système.</span>
        </span>
      </div>

      <KeyLight x="50%" y="6%" color="180,255,214" opacity={0.13} />
      <Vignette strength={0.72} />
      <Grain opacity={0.07} />
    </AbsoluteFill>
  );
};
