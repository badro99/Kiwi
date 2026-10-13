import { registerPlugin } from '@capacitor/core';
import type { KiwiHapticsPlugin } from './definitions';

export const KiwiHaptics = registerPlugin<KiwiHapticsPlugin>('KiwiHaptics');
export * from './definitions';
