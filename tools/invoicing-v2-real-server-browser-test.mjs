#!/usr/bin/env node
/* La même traversée que invoicing-v2-browser-test.mjs, mais contre le VRAI
 * serveur (functions/api/invoices.js, base SQLite au schéma réel, session
 * propriétaire) au lieu du faux serveur du contrat. Le client et le serveur ont
 * été écrits en parallèle sur le même contrat : ce banc prouve qu'ils se parlent. */
process.env.INV_SERVER = 'real';
await import('./invoicing-v2-browser-test.mjs');
