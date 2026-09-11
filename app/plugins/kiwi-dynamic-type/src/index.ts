import { registerPlugin } from '@capacitor/core';
import type { KiwiDynamicTypePlugin } from './definitions';

export const KiwiDynamicType = registerPlugin<KiwiDynamicTypePlugin>('KiwiDynamicType');
export * from './definitions';
