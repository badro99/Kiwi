/* Load hook for tools/coverage-probe.mjs: in a tools/*.mjs module that carries
 * `// coverage: surface=… locale=… viewport=…` lines, put a call to
 * globalThis.__kiwiCoverageCell before the comment, on the same line. The
 * annotation rule (tools/coverage-map.mjs) already requires the next line to be
 * an awaited open/goto, so the line sits between statements. */
const ANNOTATION = /^([ \t]*)(\/\/ coverage: surface=([\w-]+) locale=([a-z]+) viewport=(phone|tablet|desktop)[ \t]*)$/gm;

export function mark(source) {
  return source.replace(ANNOTATION, (_, indent, comment, surface, locale, viewport) =>
    `${indent}globalThis.__kiwiCoverageCell?.(${JSON.stringify(surface + '|' + locale + '|' + viewport)}); ${comment}`);
}

export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (!/^file:.*\/tools\/[^/]+\.mjs$/.test(url) || result.source == null) return result;
  const source = typeof result.source === 'string' ? result.source : Buffer.from(result.source).toString('utf8');
  if (!source.includes('// coverage: surface=')) return result;
  return { ...result, source: mark(source), shortCircuit: true };
}
