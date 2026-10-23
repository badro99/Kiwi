/** Tenant identities. A brand records identity kind, not authorization. */
export type MerchantSlug = string & { readonly __brand: 'MerchantSlug' };
export type AccountId = string & { readonly __brand: 'AccountId' };
export type DeviceId = string & { readonly __brand: 'DeviceId' };
export type EmployeeId = string & { readonly __brand: 'EmployeeId' };
/** Legacy boundary inputs may be raw strings, but never another identity kind. */
export type RawIdentity = string & { readonly __brand?: never };
export type MerchantInput = MerchantSlug | RawIdentity;
export type AccountInput = AccountId | RawIdentity;
export type DeviceInput = DeviceId | RawIdentity;
export type EmployeeInput = EmployeeId | RawIdentity;
export interface AccountSession { aid: AccountId; exp: number; sid: string; sv?: number }
export interface EmployeeSession { merchant: MerchantSlug; staffId: EmployeeId; exp: number; av?: number }
export interface StaffIdentity { id: EmployeeId; name: string; role: string }
export interface EmployeeCredential extends StaffIdentity {
  merchant: MerchantSlug; status: string; type?: string; authVersion: number;
  ambiguous?: never;
}
export interface AmbiguousCredential { ambiguous: true; id?: never; merchant?: never; name?: never; role?: never; status?: never; type?: never; authVersion?: never }
export interface ActiveEmployee { session: EmployeeSession; member: Record<string, any>; merchant: MerchantSlug }
export type PinResult = { ok: boolean; error?: string; status?: number; response?: Response; configured?: boolean; staff?: StaffIdentity; merchant?: MerchantSlug };
export interface TillVerification { ok: boolean; unavailable?: boolean; revoked?: boolean; legacy?: boolean; deviceId?: DeviceId }
/** All private fields removed by stripTeamCodes. */
export type TeamSecrets = 'password' | 'pinCode' | 'baseSalary' | 'hourlyRate' | 'cin' | 'iban' | 'address' | 'emergencyName' | 'emergencyPhone';
export type StoredTeamMember = { id?: EmployeeId; [key: string]: unknown } & Partial<Record<TeamSecrets, string | number>>;
export type TillTeamMember = { id?: EmployeeId; [key: string]: unknown } & Partial<Record<TeamSecrets, never>>;
export interface StoredTeamDocument { members?: StoredTeamMember[]; [key: string]: unknown }
export interface TillTeamDocument { members?: TillTeamMember[]; [key: string]: unknown }

export interface StaffClaims { merchant?: MerchantInput; staffId?: EmployeeInput; staffName?: string; staffRole?: string }
export interface RefundClaims extends StaffClaims { refundId?: string; originalSaleId?: string; amountCents?: number; refundMethod?: string }
export interface StockClaims extends StaffClaims { movementIds?: string[] }
export interface ManagerProof { v: number; merchant: MerchantSlug; staffId: EmployeeId; staffName: string; staffRole: string; exp: number }
export interface RefundProof extends ManagerProof { refundId: string; originalSaleId: string; amountCents: number; refundMethod: string }
export interface StockProof extends ManagerProof { scope: string }
export interface TillActor extends StaffIdentity { merchant: MerchantSlug; exp: number }
