/* Kiwi haptics plugin, the contract with the native side (spec §15).
 *
 * `mode: 'stock'` reproduces @capacitor/haptics exactly: a new feedback
 * generator for every call, no prepare(). `mode: 'prepared'` keeps one
 * long-lived generator per style so prepare() can warm the Taptic Engine
 * (owner decision 9). Either way `play` resolves with the native clock read
 * right after the generator call returned, which is what the latency gate
 * measures. */
export type KiwiHapticKind = 'impact' | 'notification' | 'selection';
export type KiwiHapticMode = 'stock' | 'prepared';

export interface KiwiHapticsPlayOptions {
  kind: KiwiHapticKind;
  /** impact: LIGHT | MEDIUM | HEAVY | SOFT | RIGID. notification: SUCCESS | WARNING | ERROR.
   *  selection: start | changed | end. */
  style?: string;
  mode?: KiwiHapticMode;
}

export interface KiwiHapticsPrepareOptions {
  kind: KiwiHapticKind;
  style?: string;
  /** Only 'prepared' does anything; in 'stock' (the default) prepare is a no-op. */
  mode?: KiwiHapticMode;
}

/** Seconds on the native monotonic clock: CACurrentMediaTime() on iOS,
 *  SystemClock.uptimeMillis() / 1000 on Android. */
export interface KiwiHapticsClock {
  t: number;
}

export interface KiwiHapticsPlugin {
  play(options: KiwiHapticsPlayOptions): Promise<KiwiHapticsClock>;
  clock(): Promise<KiwiHapticsClock>;
  prepare(options: KiwiHapticsPrepareOptions): Promise<void>;
}
