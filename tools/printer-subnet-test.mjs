// Recherche d'imprimante dans l'app native : l'adresse Wi-Fi de l'appareil donne son /24 (audit du 26 nov. 2026).
//
// Sans `subnet`, scan() part de l'adresse de l'appareil (192.168.1.37), et
// subnetPrefix refusait toute adresse complète dont le dernier octet n'est pas
// 0 : « aucune imprimante » à chaque recherche, et la redécouverte après trois
// impressions ratées ne retrouvait jamais une imprimante qui a changé d'adresse.
// Aucun appelant JS ne passe `subnet`. La fonction Swift a été exécutée telle
// quelle (192.168.1.37 → 192.168.1) ; ce fichier tient les deux sources.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const body = (src, start) => { const i = src.indexOf(start); assert.ok(i >= 0, start); return src.slice(i, src.indexOf('\n    }\n', i)); };
const swift = body(read('app/plugins/kiwi-printer-socket/ios/Sources/KiwiPrinterSocket/KiwiPrinterSocketPlugin.swift'), 'private static func subnetPrefix');
const java = body(read('app/plugins/kiwi-printer-socket/android/src/main/java/com/kiwios/printersocket/KiwiPrinterSocketPlugin.java'), 'private String subnetPrefix');
let checks = 0;
const ok = (v, m) => { assert.ok(v, m); checks += 1; };
ok(!/octets\[3\]\s*!=\s*0/.test(swift), 'iOS: a full device address is not refused for its last octet');
ok(!/octets\[3\]\s*!=\s*0/.test(java), 'Android: a full device address is not refused for its last octet');
ok(/octets\.prefix\(3\)/.test(swift) && /octets\[0\] \+ "\." \+ octets\[1\] \+ "\." \+ octets\[2\]/.test(java), 'both keep the first three octets');
ok(/parts\.count == 3 \|\| parts\.count == 4/.test(swift) && /parts\.length != 3 && parts\.length != 4/.test(java), 'both still refuse anything that is not an IPv4 address or /24');
ok(/\(0\.\.\.255\)\.contains/.test(swift) && /octets\[i\] < 0 \|\| octets\[i\] > 255/.test(java), 'both still refuse an octet out of range');
console.log(`✓ printer-subnet-test : ${checks} contrôles (l'adresse de l'appareil donne le /24 à balayer, iOS et Android)`);
