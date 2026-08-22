import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const paper = read('assets/print-paper.css');
const printer = read('assets/printer-bridge.js');
const barcode = read('assets/barcode.js');
const receipt = read('assets/receipt.js');
const operational = read('assets/operational-print.js');
const escpos = read('assets/escpos.js');
const invoice = read('assets/invoicing.js');
const qr = read('assets/order-qr.js');
const report = read('assets/report.js');
const caisse = read('kiwi-caisse.html');
const dashboard = read('dashboard.html');
const sw = read('kiwi-sw.js');
const bridgeSrv = read('bridge/server.js');
const bridgeDoc = read('bridge/README.md');
const bridgeVersion = (bridgeSrv.match(/const VERSION = '([\d.]+)'/) || [])[1] || '';

const controls = [
  ['pressing ticket preview', paper.includes('.px-receipt')],
  ['pressing garment label preview', paper.includes('.px-tag')],
  ['compact thermal labels retain article and service', escpos.includes("if (o.sub) b.bold(true).line(fit(o.sub, paper)).bold(false)")],
  ['thermal receipts can mark workshop copies', escpos.includes("if (o.copy) b.bold(true).size(1, 2).line(fit(o.copy, paper))")],
  ['restaurant receipt preview', paper.includes('.receipt-paper')],
  ['other vertical print previews', ['.ff-receipt', '.ht-facture', '.lb-receipt', '.ph-receipt', '.fl-receipt', '.bq-avoir'].every((s) => paper.includes(s))],
  ['customer card and handover slip', paper.includes('.fl-card-preview') && paper.includes('.ho-slip')],
  ['paper background is white', paper.includes('background: #fff !important')],
  ['paper colour scheme is light', paper.includes('color-scheme: light !important')],
  ['generic browser print root', printer.includes("#kpr-print-root{display:block!important;position:static!important;background:#fff!important;color:#000!important;color-scheme:light!important;}")],
  ['barcode page does not use theme surface', !barcode.includes('html, body { background: var(--surface)') && barcode.includes('color-scheme: light !important')],
  ['shared receipt print root', receipt.includes("#kr-print-root{display:block!important;position:static!important;background:#fff!important;color:#000!important;color-scheme:light!important;}")],
  ['operational documents', operational.includes('html,body{color-scheme:light;background:#fff;color:#0A0F0D}')],
  ['invoice window', invoice.includes('color-scheme:light;background:#fff;color:#102019')],
  ['QR print sheet', qr.includes('html, body { color-scheme: light; background: #fff; color: #0A0F0D; }')],
  ['A4 report', report.includes('color-scheme:light!important;background:#fff!important')],
  ['both apps and offline shell load contract', caisse.includes('assets/print-paper.css?v=1') && dashboard.includes('assets/print-paper.css?v=1') && sw.includes("'/assets/print-paper.css?v=1'")],
  // Le pont préfère le nom d'imprimante OS à l'IP : chaque enregistrement doit
  // effacer l'autre cible, sinon l'une des deux reste morte en silence.
  ['saving a network IP clears the saved OS printer', printer.includes("setConfig(Object.assign(f, { osPrinter: '' }))")],
  ['choosing an OS printer clears the saved IP', printer.includes("setConfig({ osPrinter: sel.value, ip: '' })")],
  // Garde-fous du chemin réseau : validation avant écriture, test qui vise
  // vraiment l'IP saisie, et messages d'échec en français utile.
  ['saving validates the IP and the port first', /validIp\(f\.ip\)/.test(printer) && /validPort\(f\.port\)/.test(printer)],
  ['the network test targets the typed IP explicitly', /var target = \{ ip: f\.ip, port: Number\(f\.port\) \|\| 9100 \}/.test(printer) && /bridgePrintBytes\(slip, target\)/.test(printer)],
  ['bridge failures are worded for humans', printer.includes('function frReason(') && printer.includes('Pont introuvable')],
  ['the active print target is spelled out in the panel', printer.includes("$('#kpr-target')") && printer.includes('Cible actuelle')],
  // Découverte réseau : le pont balaie son propre sous-réseau privé, jamais plus.
  ['bridge exposes /kiwi/scan', bridgeSrv.includes("url === '/kiwi/scan'") && printer.includes("'/kiwi/scan'")],
  ['the sweep is fenced to RFC1918 subnets', bridgeSrv.includes('function isPrivateV4') && /a\.internal \|\| !isPrivateV4\(a\.address\)/.test(bridgeSrv)],
  // Anti-dérive : le README dit la version RÉELLE du pont et la plage de ports
  // que le client scanne vraiment ; l'aide console reste dans cette plage.
  ['README states the real bridge version', bridgeVersion !== '' && bridgeDoc.includes('v' + bridgeVersion)],
  ['client and server agree on the port scan range', printer.includes('[9110, 9111, 9112, 9113, 9114]') && bridgeSrv.includes('[9110, 9111, 9112, 9113, 9114]') && bridgeDoc.includes('9110–9114')],
  ['the console port hint stays inside the scanned range', /KIWI_BRIDGE_PORT=911[0-4]/.test(bridgeSrv) && !/KIWI_BRIDGE_PORT=9115/.test(bridgeSrv)],
  // La caisse n'a pas window.Kiwi.toast : l'avis de repli doit savoir se
  // fabriquer tout seul, sinon il est muet sur le comptoir.
  ['the fallback notice does not depend on window.Kiwi.toast', printer.includes('function fallbackNotice(') && /fallbackNotice\('Imprimante '/.test(printer) && !/Kiwi\.toast\('Imprimante /.test(printer)],
];

for (const [name, ok] of controls) assert.equal(ok, true, name);
console.log(`print-paper-test: ${controls.length} controls passed`);
