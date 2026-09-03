export type PrinterSocketErrorCode =
  | 'timeout'
  | 'refused'
  | 'unreachable'
  | 'local-network-denied'
  | 'bad-args';

export interface PrinterSocketError {
  ok: false;
  code: PrinterSocketErrorCode;
  message: string;
}

export interface SendOptions {
  host: string;
  port: number;
  data: string;
  timeoutMs?: number;
}

export interface ProbeOptions {
  host: string;
  port: number;
  timeoutMs?: number;
}

export interface ScanOptions {
  port?: number;
  timeoutMs?: number;
  subnet?: string;
}

export interface SendResult {
  ok: true;
  bytes: number;
  ms: number;
}

export interface ProbeResult {
  ok: true;
  ms: number;
}

export interface ScanHost {
  host: string;
  ms: number;
}

export interface ScanResult {
  ok: true;
  hosts: ScanHost[];
}

export interface SecureKeyOptions { key: string; }
export interface SecureValueOptions extends SecureKeyOptions { value: string; }
export interface SecureGetResult { value: string | null; }
export interface DeviceIdentityResult { id: string; }
export interface LedgerOptions { name: string; }
export interface LedgerWriteOptions extends LedgerOptions { value: string; }
export interface LedgerReadResult { value: string | null; }
export interface DynamicTypeResult { scale: number; category: string; }

export interface KiwiPrinterSocketPlugin {
  send(options: SendOptions): Promise<SendResult | PrinterSocketError>;
  probe(options: ProbeOptions): Promise<ProbeResult | PrinterSocketError>;
  scan(options?: ScanOptions): Promise<ScanResult | PrinterSocketError>;
  secureGet(options: SecureKeyOptions): Promise<SecureGetResult>;
  secureSet(options: SecureValueOptions): Promise<void>;
  secureRemove(options: SecureKeyOptions): Promise<void>;
  deviceIdentity(): Promise<DeviceIdentityResult>;
  ledgerRead(options: LedgerOptions): Promise<LedgerReadResult>;
  ledgerWrite(options: LedgerWriteOptions): Promise<void>;
  getDynamicTypeScale(): Promise<DynamicTypeResult>;
}
