import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { C, F } from '../theme';
import { Bokeh, Grain, Vignette, useShotFade } from '../grade';

/* D · LE SYSTÈME — four surfaces, one system, in true 3D.
 *
 * The camera orbits a constellation of devices while a single sale travels
 * between them along a light line. This is the beat that says "not four
 * products" without a word of voiceover. */

type Node = { label: string; sub: string; x: number; y: number; z: number; w: number; h: number };

const NODES: Node[] = [
  { label: 'Caisse', sub: 'le comptoir', x: -430, y: 40, z: 120, w: 400, h: 262 },
  { label: 'Serveur', sub: 'la salle', x: 210, y: -190, z: -140, w: 210, h: 400 },
  { label: 'Client', sub: 'le QR sur la table', x: 400, y: 190, z: 180, w: 190, h: 330 },
  { label: 'Patron', sub: 'le tableau de bord', x: -160, y: -240, z: -300, w: 460, h: 290 },
];

export const D_Systeme: React.FC<{ dur?: number }> = ({ dur = 300 }) => {
  const frame = useCurrentFrame();
  const fade = useShotFade(dur);

  /* one continuous orbit — the shot is the move */
  const orbit = interpolate(frame, [0, dur], [-26, 22]);
  const tilt = interpolate(frame, [0, dur], [14, -6]);
  const dolly = interpolate(frame, [0, dur], [-560, -120]);

  /* the sale travels caisse → serveur → patron */
  const travel = interpolate(frame, [96, 246], [0, 3], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ background: '#04120D', opacity: fade, overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(64% 54% at 50% 44%, #0B3527 0%, #061A13 58%, #020806 100%)',
        }}
      />
      <Bokeh count={12} hue="125,242,176" seed="sys" drift={0.7} />

      <AbsoluteFill style={{ perspective: 1700, perspectiveOrigin: '50% 48%' }}>
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transformStyle: 'preserve-3d',
            transform:
              `translateZ(${dolly.toFixed(1)}px) ` +
              `rotateX(${tilt.toFixed(2)}deg) rotateY(${orbit.toFixed(2)}deg)`,
          }}
        >
          {NODES.map((n, i) => {
            const born = 10 + i * 14;
            const app = interpolate(frame, [born, born + 30], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            /* each plane breathes on its own phase so the cluster never locks */
            const bob = Math.sin(frame / 64 + i * 1.9) * 16;
            const lit = travel > i - 0.5 && travel < i + 0.9;
            return (
              <div
                key={n.label}
                style={{
                  position: 'absolute',
                  width: n.w,
                  height: n.h,
                  marginLeft: -n.w / 2,
                  marginTop: -n.h / 2,
                  transformStyle: 'preserve-3d',
                  transform:
                    `translate3d(${n.x}px, ${(n.y + bob).toFixed(1)}px, ${n.z}px) ` +
                    `rotateY(${(-orbit * 0.55).toFixed(2)}deg) ` +
                    `scale(${(0.82 + app * 0.18).toFixed(3)})`,
                  opacity: app,
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: 20,
                    background: 'linear-gradient(158deg, rgba(20,64,49,.94), rgba(5,26,19,.96))',
                    border: `1px solid rgba(125,242,176,${lit ? 0.55 : 0.16})`,
                    boxShadow: lit
                      ? '0 0 70px -8px rgba(125,242,176,.45), 0 50px 90px -40px rgba(0,0,0,.9)'
                      : '0 50px 90px -40px rgba(0,0,0,.9)',
                    padding: '20px 22px',
                    backdropFilter: 'blur(2px)',
                  }}
                >
                  <div
                    style={{
                      fontFamily: F.mono,
                      fontSize: 11,
                      letterSpacing: '.22em',
                      color: lit ? C.mint : 'rgba(247,245,240,.38)',
                    }}
                  >
                    {n.sub.toUpperCase()}
                  </div>
                  <div
                    style={{
                      fontFamily: F.sans,
                      fontSize: 30,
                      fontWeight: 600,
                      letterSpacing: '-0.03em',
                      color: C.paper,
                      marginTop: 7,
                    }}
                  >
                    {n.label}
                  </div>
                  {/* a few abstracted UI rules — legible as software, not as a mock */}
                  {new Array(4).fill(0).map((_, r) => (
                    <div
                      key={r}
                      style={{
                        height: 7,
                        borderRadius: 4,
                        marginTop: r === 0 ? 22 : 11,
                        width: `${88 - r * 13}%`,
                        background: `rgba(247,245,240,${0.16 - r * 0.025})`,
                      }}
                    />
                  ))}
                  <div
                    style={{
                      position: 'absolute',
                      left: 22,
                      bottom: 20,
                      right: 22,
                      height: 30,
                      borderRadius: 9,
                      background: lit ? C.mint : 'rgba(125,242,176,.20)',
                      opacity: lit ? 0.92 : 0.4,
                    }}
                  />
                </div>
              </div>
            );
          })}

          {/* the sale itself, a mint point running the chain */}
          {travel > 0 && travel < 3.2 && (
            <div
              style={{
                position: 'absolute',
                width: 20,
                height: 20,
                marginLeft: -10,
                marginTop: -10,
                borderRadius: '50%',
                background: C.mint,
                boxShadow: '0 0 34px 12px rgba(125,242,176,.72), 0 0 90px 34px rgba(125,242,176,.28)',
                transform: (() => {
                  const i = Math.min(2, Math.floor(travel));
                  const t = travel - i;
                  const a = NODES[i];
                  const b = NODES[i + 1] ?? NODES[i];
                  const x = a.x + (b.x - a.x) * t;
                  const y = a.y + (b.y - a.y) * t;
                  const z = a.z + (b.z - a.z) * t;
                  /* lift the arc off the straight line between planes */
                  const lift = Math.sin(t * Math.PI) * -120;
                  return `translate3d(${x.toFixed(1)}px, ${(y + lift).toFixed(1)}px, ${z.toFixed(1)}px)`;
                })(),
              }}
            />
          )}
        </div>
      </AbsoluteFill>

      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 86,
          textAlign: 'center',
          opacity: interpolate(frame, [200, 228], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
        }}
      >
        <span style={{ fontFamily: F.sans, fontSize: 40, fontWeight: 500, color: C.paper }}>
          Quatre écrans.{' '}
          <span style={{ fontFamily: F.serif, fontStyle: 'normal', fontSize: 44, color: C.mint }}>
            Un seul système.
          </span>
        </span>
      </div>

      <Vignette strength={0.82} />
      <Grain opacity={0.06} />
    </AbsoluteFill>
  );
};
