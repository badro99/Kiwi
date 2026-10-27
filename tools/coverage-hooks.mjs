/* Load hook for tools/coverage-probe.mjs. In a tools/ module it puts one call
 * to globalThis.__kiwiCoverageCell on a line, before what is there, same line:
 *   · each `// coverage: surface=… locale=… viewport=…` annotation (the
 *     annotation rule in tools/coverage-map.mjs already requires the next line
 *     to be an awaited open/goto, so the line sits between statements);
 *   · each landing claim anchor of tools/landing-claims-map.json in that file,
 *     key `claim:<path>#<n>` (landing-claims-test requires every anchor to be
 *     unique and to start a statement). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ANNOTATION = /^([ \t]*)(\/\/ coverage: surface=([\w-]+) locale=([a-z]+) viewport=(phone|tablet|desktop)[ \t]*)$/gm;
const call = (key) => `globalThis.__kiwiCoverageCell?.(${JSON.stringify(key)}); `;

let claimsMemo = null;
/* Anchors by repo-relative test file: [{ assertion, key }]. */
export function claimAnchors(root = path.resolve(HERE, '..')) {
  if (claimsMemo && claimsMemo.root === root) return claimsMemo.byFile;
  const byFile = new Map();
  try {
    const map = JSON.parse(fs.readFileSync(path.join(root, 'tools', 'landing-claims-map.json'), 'utf8'));
    for (const [claim, entry] of Object.entries(map.claims || {})) {
      (entry.contracts || []).forEach((c, i) => {
        if (!byFile.has(c.file)) byFile.set(c.file, []);
        byFile.get(c.file).push({ assertion: c.assertion, key: `claim:${claim}#${i}` });
      });
    }
  } catch (_) {}
  claimsMemo = { root, byFile };
  return byFile;
}

export function mark(source, anchors = []) {
  let out = source.replace(ANNOTATION, (_, indent, comment, surface, locale, viewport) =>
    `${indent}${call(surface + '|' + locale + '|' + viewport)}${comment}`);
  if (!anchors.length) return out;
  const lines = out.split('\n');
  for (const a of anchors) {
    const at = lines.findIndex((l) => l.includes(a.assertion));
    if (at < 0) continue;
    const indent = lines[at].match(/^[ \t]*/)[0];
    lines[at] = indent + call(a.key) + lines[at].slice(indent.length);
  }
  return lines.join('\n');
}

export function transform(file, source) {
  const posix = String(file).split(path.sep).join('/');
  if (!/\/tools\/[^/]+\.(?:mjs|js|cjs)$/.test(posix)) return null;
  const rel = path.relative(path.resolve(HERE, '..'), file).split(path.sep).join('/');
  const anchors = claimAnchors().get(rel) || [];
  if (!anchors.length && !source.includes('// coverage: surface=')) return null;
  return mark(source, anchors);
}

export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (!url.startsWith('file:') || result.source == null || result.format === 'commonjs') return result;
  const source = typeof result.source === 'string' ? result.source : Buffer.from(result.source).toString('utf8');
  const marked = transform(fileURLToPath(url), source);
  return marked == null ? result : { ...result, source: marked, shortCircuit: true };
}
