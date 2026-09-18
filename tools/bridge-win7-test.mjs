#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Le pont d'impression doit démarrer sur Windows 7
 *
 * Beaucoup de caisses marocaines tournent encore sur un Windows 7 avec une
 * imprimante thermique USB installée par le revendeur. Sur ces machines le pont
 * échouait deux fois, et jamais avec un message utile :
 *
 * 1 · L'exécutable était compilé pour Node 18, qui ne DÉMARRE pas sur Windows 7
 *     (Node 12 est la dernière ligne qui le supporte). Le commerçant double-clique
 *     et Windows répond « ce programme n'est pas une application Win32 valide ».
 *
 * 2 · Même lancé, la file par défaut restait vide : Windows 7 livre PowerShell
 *     2.0, où les cmdlets CIM (Get-CimInstance) n'existent pas. Le pont ne
 *     demandait QUE du CIM pour l'imprimante par défaut.
 *
 * Cette suite tient les deux invariants — et la compatibilité Node 12 du code
 * lui-même, qui est la chose la plus facile à casser sans s'en apercevoir : une
 * seule `?.` ajoutée un jour de plus rend le binaire Windows 7 inutilisable, et
 * personne ici n'a de Windows 7 pour s'en rendre compte.
 * ─────────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRV = fs.readFileSync(path.join(ROOT, 'bridge/server.js'), 'utf8');
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'bridge/package.json'), 'utf8'));

let passed = 0;
const failures = [];
function ok(cond, msg) {
  if (cond) passed++;
  else { failures.push(msg); console.error(`  ✗ ${msg}`); }
}

console.log('■ Pont d\'impression · Windows 7');

/* ═══ 1 · un binaire que Windows 7 sait lancer ════════════════════════════ */
{
  const build = String(PKG.scripts?.['build:win7'] || '');
  ok(/node12-win-x64/.test(build),
    'une cible node12 64 bits existe : au-delà, l\'exécutable refuse de démarrer sur Windows 7');
  ok(/node12-win-x86/.test(build),
    'et une cible 32 bits : beaucoup de ces tills sont des Windows 7 x86, où un binaire x64 ne s\'ouvre pas du tout');
  ok(!/node1[4-9]-win|node2[0-9]-win/.test(build),
    'la recette Windows 7 ne retombe pas sur une ligne Node que Windows 7 ne supporte pas');
  ok(/^>=\s*12$/.test(String(PKG.engines?.node || '').trim()),
    'le manifeste annonce Node 12 comme plancher, sinon un npm install honnête refuse la machine');
}

/* ═══ 2 · PowerShell 2.0 n'a pas les cmdlets CIM ══════════════════════════ */
{
  const def = SRV.slice(SRV.indexOf('async function defaultPrinter()'),
    SRV.indexOf('// Microsoft\'s RawPrinterHelper'));
  ok(/Get-CimInstance/.test(def), 'le chemin moderne reste tenté en premier : Windows 10 répond du premier coup');
  ok(/Get-WmiObject[^\n]*Default=True/.test(def),
    'et un repli WMI existe : c\'est la SEULE façon de lire la file par défaut sous PowerShell 2.0');
  ok(def.indexOf('Get-CimInstance') < def.indexOf('Get-WmiObject'),
    'dans cet ordre — on ne dégrade pas les machines récentes pour arranger les anciennes');

  const list = SRV.slice(SRV.indexOf('async function listPrinters()'), SRV.indexOf('async function defaultPrinter()'));
  ok(/Get-WmiObject/.test(list), 'l\'énumération garde elle aussi son repli WMI');
  ok(/winPrinterQuery/.test(list),
    'et elle retient la requête qui a répondu : sinon chaque ticket paie trois lancements de PowerShell sur un Windows 7');
  ok(/winPrinterQuery = attempts\.indexOf\(a\)/.test(list), 'le mémo enregistre bien la ligne gagnante');
  ok(/attempts\.filter\(\(_, i\) => i !== winPrinterQuery\)/.test(list),
    'et l\'échelle complète reste re-tentée : une imprimante installée plus tard n\'est jamais masquée par le mémo');
}

/* ═══ 3 · le C# inliné doit compiler sous .NET 3.5 (PowerShell 2.0) ═══════ */
{
  const cs = SRV.slice(SRV.indexOf('const WIN_RAW_PS'), SRV.indexOf('function winRawPrint'));
  ok(/Add-Type -Language CSharp/.test(cs), 'Add-Type est appelé avec un langage explicite, comme PowerShell 2.0 l\'exige');
  ok(!/\bvar\s+\w+\s*=/.test(cs.replace(/\$\w+/g, '')), 'pas de `var` C# : le compilateur de PowerShell 2.0 vise C# 2.0');
  ok(!/=>/.test(cs), 'pas de lambda C# non plus, pour la même raison');
  ok(!/\bdynamic\b|\basync\b|\bawait\b/.test(cs), 'ni de constructions postérieures à .NET 3.5');
}

/* ═══ 4 · le JavaScript lui-même doit tourner sur Node 12 ═════════════════ */
{
  /* Les chaînes et commentaires sont retirés d'abord : une `?.` citée dans un
     commentaire n'a jamais empêché personne d'imprimer. */
  const code = SRV
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/`(?:\\[\s\S]|[^`\\])*`/g, '``')
    .replace(/'(?:\\[\s\S]|[^'\\\n])*'/g, "''")
    .replace(/"(?:\\[\s\S]|[^"\\\n])*"/g, '""');

  const banned = [
    [/\?\./, 'chaînage optionnel `?.` (Node 14)'],
    [/\?\?/, 'coalescence `??` (Node 14)'],
    [/\|\|=|&&=|\?\?=/, 'affectation logique (Node 15)'],
    [/\.replaceAll\s*\(/, 'String.replaceAll (Node 15)'],
    [/\bPromise\.any\s*\(/, 'Promise.any (Node 15)'],
    [/\bAbortController\b/, 'AbortController (Node 15)'],
    [/\bObject\.hasOwn\s*\(/, 'Object.hasOwn (Node 16)'],
    [/\bstructuredClone\s*\(/, 'structuredClone (Node 17)'],
    [/(^|[^.\w])fetch\s*\(/, 'fetch global (Node 18)'],
    [/require\(\s*['"]node:/, 'préfixe `node:` (Node 16)'],
    [/\bat\s*\(\s*-/, 'Array.prototype.at (Node 16)'],
  ];
  for (const [re, what] of banned) {
    ok(!re.test(code), `le pont n'utilise pas ${what} : ce serait un binaire Windows 7 mort-né`);
  }
  ok(/require\('https'\)/.test(SRV),
    'les appels au relais passent par le module https, pas par le fetch global qui n\'existe pas sur Node 12');
}

if (failures.length) {
  console.error(`\n✗ ${failures.length} échec(s) sur ${passed + failures.length} contrôles`);
  process.exit(1);
}
console.log(`  ✓ ${passed} contrôles`);
