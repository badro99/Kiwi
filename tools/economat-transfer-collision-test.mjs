import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createHotelRequestHarness, MERCHANT } from './fixtures/hotel-request-db.mjs';
const hash = text => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
};
for (const slots of [0, 1, 8, 9, 10, -1]) {
  const h = await createHotelRequestHarness();
  try {
    const id = `collision-${slots}`, key = `confirm:${id}`;
    await h.ready(id, 'cola', 2);
    const base = 'inv-transfer-' + hash([MERCHANT, `request:${id}:${key}`, 0, 'cola', slots >= 9 ? 'in' : 'out'].join('|'));
    for (let i = 0; i < Math.min(slots, 9); i++) h.addMovement({ id: i ? `${base}-c${i}` : base, itemId: 'foreign', qty: 7 });
    const fallback = 'inv-transfer-s-' + createHash('sha256').update(JSON.stringify([MERCHANT, `request:${id}:${key}`, id, 0, 'cola', 'transfer-in', 0])).digest('hex');
    if (slots === 10) h.addMovement({ id: fallback, itemId: 'foreign', qty: 7 });
    // All preoccupied ids belong to another merchant; their rows must stay intact.
    h.raw.exec("UPDATE inventory_movements SET merchant = 'other-merchant' WHERE item_id = 'foreign'");
    let foreign;
    if (slots === -1) {
      const batch = h.DB.batch.bind(h.DB);
      let injected = false;
      h.DB.batch = async statements => {
        if (!injected) {
          injected = true;
          h.addMovement({ id: base, itemId: 'foreign', qty: 7 });
          foreign = h.rows("SELECT * FROM inventory_movements WHERE item_id = 'foreign'");
        }
        return batch(statements);
      };
    }
    foreign = h.rows("SELECT * FROM inventory_movements WHERE item_id = 'foreign'");
    const before = h.rows('SELECT * FROM hotel_internal_requests WHERE id = ?', id);
    const linesBefore = h.rows('SELECT * FROM hotel_internal_request_lines WHERE request_id = ?', id);
    const holdsBefore = h.rows('SELECT * FROM inventory_request_reservations WHERE request_id = ?', id);
    const body = { action: 'confirm', merchant: MERCHANT, id, revision: 4, idempotencyKey: key,
      data: { lines: [{ itemId: 'cola', qtyReceived: 2 }] } };
    const response = await h.post(body);
    if (slots === 10) {
      assert.equal(response.status, 503);
      assert.equal((await response.json()).error, 'write-failed');
      assert.deepEqual(h.rows('SELECT * FROM hotel_internal_requests WHERE id = ?', id), before);
      assert.equal(h.rows("SELECT * FROM inventory_movements WHERE ref_type = 'transfer'").length, 0);
      assert.equal(h.rows("SELECT * FROM hotel_internal_request_events WHERE event = 'confirm'").length, 0);
      assert.equal(h.balance('cola', 'u-economat'), 24);
      assert.deepEqual(h.rows('SELECT * FROM hotel_internal_request_lines WHERE request_id = ?', id), linesBefore);
      assert.deepEqual(h.rows('SELECT * FROM inventory_request_reservations WHERE request_id = ?', id), holdsBefore);
    } else {
      assert.equal(response.status, 200);
      const result = await response.json();
      assert(result.movements.every(m => m.id.length <= 80), 'ids survive client ledger normalization');
      const expected = slots === 9 ? fallback : slots ? `${base}-c${Math.max(1, slots)}` : base;
      assert(result.movements.some(m => m.id === expected));
      assert.equal(h.one('SELECT qty_milli FROM inventory_movements WHERE id = ?', expected).qty_milli, slots === 9 ? 2000 : -2000);
      assert.equal(h.balance('cola', 'u-economat'), 22);
      assert.equal(h.balance('cola', 'u-bar-rooftop'), 2);
      for (const [location, cents] of [['u-economat', 8800], ['u-bar-rooftop', 800]]) {
        assert.equal(h.one('SELECT SUM(qty_milli * unit_cost_cents) / 1000 AS cents FROM inventory_movements WHERE merchant = ? AND item_id = ? AND location_id = ?', MERCHANT, 'cola', location).cents, cents);
      }
      if (slots === 1 || slots === 9) {
        // Replay a pre-deploy identity without the new piece metadata or event shortcut.
        h.raw.exec("UPDATE inventory_movements SET meta = json_remove(meta, '$.transferPiece') WHERE ref_type = 'transfer'");
        h.raw.prepare("DELETE FROM hotel_internal_request_events WHERE event = 'confirm'").run();
        const prior = before[0];
        h.raw.prepare(`UPDATE hotel_internal_requests SET ${Object.keys(prior).map(k => k + ' = ?').join(',')} WHERE id = ?`)
          .run(...Object.values(prior), id);
        h.raw.prepare('UPDATE hotel_internal_request_lines SET qty_received = 0 WHERE request_id = ?').run(id);
        if (slots === 9) {
          // A formerly occupied short id becomes free: replay must still find the digest row.
          h.raw.prepare("DELETE FROM inventory_movements WHERE item_id = 'foreign'").run();
          foreign = [];
        }
        const legacyRows = h.rows('SELECT * FROM inventory_movements ORDER BY id');
        const legacy = await h.post(body);
        assert.equal(legacy.status, 200);
        assert((await legacy.json()).movements.some(m => m.id === expected));
        assert.deepEqual(h.rows('SELECT * FROM inventory_movements ORDER BY id'), legacyRows);
      }
      const snapshot = h.rows('SELECT * FROM inventory_movements ORDER BY id');
      const replay = await h.post(body);
      assert.equal(replay.status, 200);
      assert.equal((await replay.json()).replayed, true);
      assert.deepEqual(h.rows('SELECT * FROM inventory_movements ORDER BY id'), snapshot);
    }
    assert.deepEqual(h.rows("SELECT * FROM inventory_movements WHERE item_id = 'foreign'"), foreign);
    console.log(`ok collision slots=${slots}: legacy id, stock, replay or atomic exhaustion`);
  } finally { h.raw.close(); }
}
