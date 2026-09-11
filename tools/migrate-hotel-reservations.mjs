#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Migration standalone : store_docs ('reservations') -> hotel_reservations
 *
 * Chunks historical hotel bookings from store_docs JSON documents into the
 * relational table `hotel_reservations`, then compacts the document to the
 * operational window ([-3j, +14j], max 250 réservations).
 *
 * Usage:
 *   node tools/migrate-hotel-reservations.mjs [--dry-run] [--db <path>]
 * ─────────────────────────────────────────────────────────────────────────── */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pruneReservationsDoc } from '../functions/api/hotel/stays.js';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const dbIndex = args.indexOf('--db');
const dbPath = dbIndex >= 0 ? args[dbIndex + 1] : ':memory:';

export async function migrateHotelReservations(sql, options = {}) {
  const isDryRun = !!options.dryRun;
  const docs = sql.prepare("SELECT merchant, data, rev FROM store_docs WHERE feature = 'reservations'").all();
  let totalStaysFound = 0;
  let totalStaysMigrated = 0;
  let totalDocsCompacted = 0;

  for (const row of docs) {
    const merchant = String(row.merchant);
    let doc;
    try { doc = JSON.parse(row.data); } catch (_) { continue; }
    if (!doc || !Array.isArray(doc.bookings) || !doc.bookings.length) continue;

    const hotelStays = doc.bookings.filter((b) => b && b.id && b.hotel);
    if (!hotelStays.length) continue;

    totalStaysFound += hotelStays.length;

    // Batch upsert stays into hotel_reservations in chunks of 50
    const CHUNK_SIZE = 50;
    for (let i = 0; i < hotelStays.length; i += CHUNK_SIZE) {
      const chunk = hotelStays.slice(i, i + CHUNK_SIZE);
      if (!isDryRun) {
        sql.exec('BEGIN IMMEDIATE');
        try {
          const insertStmt = sql.prepare(
            "INSERT INTO hotel_reservations (" +
            "merchant, id, code, room_id, room_type_id, start_at, end_at, check_in, check_out, " +
            "status, channel, external_ref, customer_name, customer_phone, customer_email, " +
            "party_size, rate, total, raw_json, created_ts, updated_ts" +
            ") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) " +
            "ON CONFLICT (merchant, id) DO UPDATE SET " +
            "code = excluded.code, " +
            "room_id = excluded.room_id, " +
            "room_type_id = excluded.room_type_id, " +
            "start_at = excluded.start_at, " +
            "end_at = excluded.end_at, " +
            "check_in = excluded.check_in, " +
            "check_out = excluded.check_out, " +
            "status = excluded.status, " +
            "channel = excluded.channel, " +
            "external_ref = excluded.external_ref, " +
            "customer_name = excluded.customer_name, " +
            "customer_phone = excluded.customer_phone, " +
            "customer_email = excluded.customer_email, " +
            "party_size = excluded.party_size, " +
            "rate = excluded.rate, " +
            "total = excluded.total, " +
            "raw_json = excluded.raw_json, " +
            "updated_ts = excluded.updated_ts"
          );

          for (const stay of chunk) {
            const h = stay.hotel || {};
            const cust = stay.customer || {};
            const now = Date.now();
            insertStmt.run(
              merchant,
              String(stay.id),
              String(stay.code || ''),
              String(stay.resourceId || ''),
              String(stay.serviceId || ''),
              Math.max(0, Number(stay.startAt) || 0),
              Math.max(0, Number(stay.endAt) || 0),
              String(h.checkIn || ''),
              String(h.checkOut || ''),
              String(stay.status || 'confirmed'),
              String(h.channel || 'direct'),
              String(h.externalRef || ''),
              String(cust.name || ''),
              String(cust.phone || ''),
              String(cust.email || ''),
              Math.max(1, Number(stay.partySize) || 1),
              Math.max(0, Number(h.rate) || 0),
              Math.max(0, Number(h.total) || 0),
              JSON.stringify(stay),
              Math.max(1, Number(stay.createdAt) || now),
              Math.max(1, Number(stay.updatedAt) || now)
            );
            totalStaysMigrated++;
          }
          sql.exec('COMMIT');
        } catch (err) {
          sql.exec('ROLLBACK');
          throw err;
        }
      } else {
        totalStaysMigrated += chunk.length;
      }
    }

    // Now prune the document
    const beforeCount = doc.bookings.length;
    pruneReservationsDoc(doc, Date.now());
    const afterCount = doc.bookings.length;

    if (afterCount !== beforeCount && !isDryRun) {
      const nextRev = (Number(row.rev) || 0) + 1;
      sql.prepare(
        "UPDATE store_docs SET data = ?, rev = ?, updated_ts = ? WHERE merchant = ? AND feature = 'reservations' AND rev = ?"
      ).run(JSON.stringify(doc), nextRev, Date.now(), merchant, row.rev);
      totalDocsCompacted++;
    } else if (afterCount !== beforeCount) {
      totalDocsCompacted++;
    }
  }

  return {
    merchantsScanned: docs.length,
    totalStaysFound,
    totalStaysMigrated,
    totalDocsCompacted,
  };
}

if (process.argv[1] && process.argv[1].endsWith('migrate-hotel-reservations.mjs')) {
  if (dbPath !== ':memory:') {
    const sql = new DatabaseSync(dbPath);
    console.log(`Démarrage migration hotel_reservations sur ${dbPath} (dryRun=${DRY_RUN})...`);
    migrateHotelReservations(sql, { dryRun: DRY_RUN }).then((res) => {
      console.log('Migration terminée :', res);
    }).catch((err) => {
      console.error('Erreur migration :', err);
      process.exit(1);
    });
  } else {
    console.log('Spécifiez --db <chemin_sqlite> pour exécuter la migration sur une base existante.');
  }
}
