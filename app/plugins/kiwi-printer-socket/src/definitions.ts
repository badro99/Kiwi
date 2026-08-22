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

export interface KiwiPrinterSocketPlugin {
  send(options: SendOptions): Promise<SendResult | PrinterSocketError>;
  probe(options: ProbeOptions): Promise<ProbeResult | PrinterSocketError>;
  scan(options?: ScanOptions): Promise<ScanResult | PrinterSocketError>;
}
