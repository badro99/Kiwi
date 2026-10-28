#!/usr/bin/env node
/* Réécrit, dans assets/briefing.js, la copie des seuils du point du matin à
 * partir de la table commune functions/api/_briefing-limits.js (celle que le
 * serveur lit aussi). `--check` ne touche à rien : il sort 1 si la copie du
 * navigateur n'est plus celle de la table (tools/briefing-limits-test.mjs).
 *
 *   node tools/build-briefing-limits.mjs          réécrit la copie
 *   node tools/build-briefing-limits.mjs --check  vérifie seulement
 *
 * Après une réécriture, le fichier a changé : `node tools/bump-stamp.js assets/briefing.js`. */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const TARGET = path.join(ROOT, 'assets/briefing.js');
export const BEGIN = '  /* briefing-limits:begin · copie générée de functions/api/_briefing-limits.js par tools/build-briefing-limits.mjs : ne pas modifier ici */';
export const END = '  /* briefing-limits:end */';

const json = (value) => JSON.stringify(value);

/* Le texte exact qui doit se trouver entre les repères. */
export async function renderBlock() {
  const { BRIEFING_FIELDS, BRIEFING_GROUPS } = await import(pathToFileURL(path.join(ROOT, 'functions/api/_briefing-limits.js')).href);
  const keys = Object.keys(BRIEFING_FIELDS);
  const rows = (fn) => keys.map((k) => `    ${json(k)}: ${fn(BRIEFING_FIELDS[k])}`).join(',\n');
  return [
    BEGIN,
    '  /* clé : [réglage d\'usine, minimum, maximum, nom fr, nom en, nom ar] */',
    '  var LIMITS = {',
    rows((f) => json([f.value, f.min, f.max, ...f.label])),
    '  };',
    '  /* clé : [aide fr, aide en, aide ar], une phrase pour le réglage */',
    '  var HELP = {',
    rows((f) => json(f.help)),
    '  };',
    '  /* les clés qui doivent rester entières */',
    `  var INTEGER = ${json(Object.fromEntries(keys.filter((k) => BRIEFING_FIELDS[k].integer).map((k) => [k, true])))};`,
    '  /* par règle, dans l\'ordre de RULES : les clés qu\'elle lit */',
    `  var GROUPS = ${json(BRIEFING_GROUPS)};`,
    END,
  ].join('\n');
}

/* Remplace le bloc dans `source`. Renvoie null si les repères manquent. */
export function splice(source, block) {
  const a = source.indexOf(BEGIN), b = source.indexOf(END);
  if (a < 0 || b < a) return null;
  return source.slice(0, a) + block + source.slice(b + END.length);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const current = readFileSync(TARGET, 'utf8');
  const next = splice(current, await renderBlock());
  if (next == null) { console.error('briefing-limits : repères introuvables dans assets/briefing.js'); process.exit(2); }
  if (process.argv.includes('--check')) {
    if (next !== current) { console.error('briefing-limits : la copie de assets/briefing.js n\'est plus celle de functions/api/_briefing-limits.js. Lancez : node tools/build-briefing-limits.mjs'); process.exit(1); }
    console.log('briefing-limits : copie à jour');
  } else if (next !== current) { writeFileSync(TARGET, next); console.log('briefing-limits : assets/briefing.js réécrit'); }
  else console.log('briefing-limits : rien à changer');
}
