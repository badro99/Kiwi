import { registerPlugin } from '@capacitor/core';
import type { KiwiPrinterSocketPlugin } from './definitions';

export const KiwiPrinterSocket = registerPlugin<KiwiPrinterSocketPlugin>('KiwiPrinterSocket');
export * from './definitions';
