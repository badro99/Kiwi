import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHotelTenant, UNITS } from './fixtures/hotel-tenant.mjs';
import {
  hasConfiguredHotelUnits,
  isHotelMerchantType,
  validateHotelUnits,
} from '../functions/api/_hotel-units.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
let checks = 0;

function check(name, fn) {
  fn();
  checks += 1;
  process.stdout.write(`  ok ${checks} - ${name}\n`);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const canonical = { units: clone(UNITS) };
const accepted = validateHotelUnits(canonical);

check('canonical five-unit hotel fixture is accepted', () => {
  assert.equal(accepted.ok, true);
  assert.equal(accepted.value.units.length, 5);
  assert.equal(accepted.value.units.filter((unit) => unit.kind === 'economat').length, 1);
});

check('a second economat is refused', () => {
  const next = clone(canonical);
  next.units.find((unit) => unit.kind !== 'economat').kind = 'economat';
  assert.equal(validateHotelUnits(next).detail, 'exactly-one-economat-required');
});

check('a unit location id is immutable', () => {
  const next = clone(accepted.value);
  next.units[1].locationId = 'u-replacement';
  assert.match(validateHotelUnits(next, accepted.value).detail, /^location-id-immutable:/);
});

check('an existing unit cannot be removed and must be deactivated instead', () => {
  const next = clone(accepted.value);
  const removed = next.units.pop();
  assert.equal(validateHotelUnits(next, accepted.value).detail, `unit-removal-forbidden:${removed.id}`);
});

check('an existing referenced unit can be deactivated', () => {
  const next = clone(accepted.value);
  next.units.find((unit) => unit.kind === 'outlet').active = false;
  assert.equal(validateHotelUnits(next, accepted.value).ok, true);
});

check('a location id can never be reissued', () => {
  const next = clone(accepted.value);
  const retired = next.units.find((unit) => unit.kind === 'outlet');
  retired.active = false;
  next.units.push({
    id: 'replacement-outlet',
    name: 'Replacement outlet',
    kind: 'outlet',
    storeType: retired.storeType,
    locationId: retired.locationId,
    active: true,
  });
  assert.equal(validateHotelUnits(next, accepted.value).detail, `duplicate-location-id:${retired.locationId}`);
});

/* `storeType` se corrige : sans écran de gestion ni suppression, le figer
   rendait définitive la moindre faute de frappe. La spec ne gèle que
   l'identité de lieu. */
check('store type can be corrected after unit creation', () => {
  const next = clone(accepted.value);
  next.units[1].storeType = 'restaurant';
  const result = validateHotelUnits(next, accepted.value);
  assert.equal(result.ok, true);
  assert.equal(result.value.units[1].storeType, 'restaurant');
});

check('correcting a store type never loosens the identity that is frozen', () => {
  const next = clone(accepted.value);
  next.units[1].storeType = 'restaurant';
  next.units[1].locationId = 'u-somewhere-else';
  assert.match(validateHotelUnits(next, accepted.value).detail, /^location-id-immutable:/);
});

/* L'économat doit rester ACTIF, pas seulement exister : compter par `kind`
   laissait passer un hôtel sans fournisseur interne, et le trou ne se serait
   vu qu'à la phase 5, quand une demande n'aurait eu nulle part où aller. */
check('deactivating the only economat is refused', () => {
  const next = clone(accepted.value);
  next.units.find((unit) => unit.kind === 'economat').active = false;
  assert.equal(validateHotelUnits(next, accepted.value).detail, 'active-economat-required');
});

check('a hotel cannot be created with an inactive economat either', () => {
  const next = clone(canonical);
  next.units.find((unit) => unit.kind === 'economat').active = false;
  assert.equal(validateHotelUnits(next).detail, 'active-economat-required');
});

check('outlets and departments stay freely deactivable', () => {
  const next = clone(accepted.value);
  next.units.find((unit) => unit.kind === 'outlet').active = false;
  next.units.find((unit) => unit.kind === 'department').active = false;
  assert.equal(validateHotelUnits(next, accepted.value).ok, true);
});

check('tenant identity cannot be embedded in a child unit', () => {
  const next = clone(canonical);
  next.units[0].merchant = 'second-tenant';
  assert.equal(validateHotelUnits(next).detail, 'unexpected-unit-key:merchant');
});

check('zero configured units remain byte-identical and inactive', () => {
  const empty = { units: [] };
  const result = validateHotelUnits(empty);
  assert.equal(result.ok, true);
  assert.equal(JSON.stringify(result.value), JSON.stringify(empty));
  assert.equal(hasConfiguredHotelUnits(result.value), false);
});

check('only the authoritative hotel merchant type enables the registry', () => {
  assert.equal(isHotelMerchantType('hotel'), true);
  assert.equal(isHotelMerchantType('restaurant'), false);
  assert.equal(isHotelMerchantType('retail'), false);
});

check('registry validation cannot mutate the seeded hotel tenant', () => {
  const tenant = createHotelTenant();
  const before = JSON.stringify(tenant.units);
  assert.equal(validateHotelUnits(canonical).ok, true);
  assert.equal(JSON.stringify(tenant.units), before);
});

const storeSource = fs.readFileSync(join(root, 'functions/api/store.js'), 'utf8');
const checkerSource = fs.readFileSync(join(root, 'tools/check.js'), 'utf8');

check('the registry is an additive store_docs feature', () => {
  assert.match(storeSource, /HOTEL_UNITS_FEATURE/);
  assert.match(storeSource, /INSERT INTO store_docs/);
  assert.doesNotMatch(storeSource, /INSERT INTO merchant_config/);
});

check('hotel unit writes require the existing owner or operator guard', () => {
  assert.match(storeSource, /OWNER_EDIT_FEATURES\.has\(feature\).*editsRoster/s);
});

check('the focused suite is part of the whole-project checker', () => {
  assert.match(checkerSource, /hotel-units-test\.mjs/);
});

process.stdout.write(`hotel-units-test: ${checks} checks passed\n`);
