// Type-only guard file: never runs, never shipped. Each line under an
// expect-error directive is a tenant mix-up that MUST stay a type error. If a brand
// in types/tenant.d.ts is weakened, the directive goes unused, TypeScript
// reports it here, and tools/typecheck-ratchet-test.mjs goes red.
import { readManagerStockProof } from '../functions/auth/_lib.js';

/** @type {import('./tenant').AccountId} */
const accountId = /** @type {any} */ ('acc_fixture');
/** @type {import('./tenant').DeviceId} */
const deviceId = /** @type {any} */ ('dev_fixture');
/** @type {import('./tenant').MerchantSlug} */
const merchant = /** @type {any} */ ('fixture-store');

// A store slug or a raw request string is accepted.
readManagerStockProof('token', 'secret', merchant);
readManagerStockProof('token', 'secret', 'fixture-store');
// @ts-expect-error an account id is not a store slug
readManagerStockProof('token', 'secret', accountId);
// @ts-expect-error a device id is not a store slug
readManagerStockProof('token', 'secret', deviceId);

/** @param {import('./tenant').TillTeamDocument} doc */
function sendToTill(doc) { return doc; }
/** @type {import('./tenant').StoredTeamDocument} */
const stored = { members: [{ name: 'Fixture', pinCode: 'redacted-in-fixture' }] };
/** @type {import('./tenant').TillTeamDocument} */
const redacted = { members: [{ name: 'Fixture' }] };
sendToTill(redacted);
// @ts-expect-error the stored roster carries personal codes; a till gets the redacted one
sendToTill(stored);
