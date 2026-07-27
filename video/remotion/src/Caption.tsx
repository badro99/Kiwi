import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { C, F } from './theme';

/* The kinetic caption line that runs under every beat.
 *
 * The accent word is set in Instrument Serif, ROMAN. The reference cut slanted
 * it, and at 34px in Inter Tight a slant is the single fastest-read "made by a
 * machine" tell there is — CLAUDE.md locks type to roman for exactly that
 * reason. The serif face carries the same editorial emphasis upright, which is
 * the documented Kiwi way to accent a word. */
export const Caption: React.FC<{
  head: string;
  accent: string;
  tail?: string;
  /* frame this caption starts on, relative to its Sequence */
  from?: number;
  hold?: number;
  dark?: boolean;
}> = ({ head, accent, tail = '', from = 0, hold = 120, dark = false }) => {
  const frame = useCurrentFrame() - from;

  /* one word-blur reveal in, one clean fade out */
  const t = interpolate(frame, [0, 26], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const out = interpolate(frame, [hold, hold + 20], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const opacity = t * out;
  const blur = (1 - t) * 9;
  const y = (1 - t) * 16;

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 96,
        textAlign: 'center',
        opacity,
        filter: `blur(${blur.toFixed(2)}px)`,
        transform: `translateY(${y.toFixed(2)}px)`,
      }}
    >
      <span
        style={{
          fontFamily: F.sans,
          fontSize: 42,
          fontWeight: 500,
          letterSpacing: '-0.022em',
          color: dark ? C.paper : C.ink,
        }}
      >
        {head}{' '}
        <span
          style={{
            fontFamily: F.serif,
            fontStyle: 'normal',
            fontSize: 46,
            color: dark ? C.mint : C.atlas,
          }}
        >
          {accent}
        </span>
        {tail}
      </span>
    </div>
  );
};
