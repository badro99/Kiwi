/* Published owners of the pinned controllers are closed sets. New features
 * publish from their own module; internal fixes do not expand this interface.
 * Includes dot and literal bracket exports, handler registration and named
 * functions are capped separately as internal entry points. */
export function interfaceOwners(source) {
 const owners = new Set();
 const patterns = [
  /\b(?:window|globalThis)\.([A-Za-z_$][\w$]*)\s*(?:=|\?\?=|\|\|=)/g,
  /\b(?:window|globalThis)\[['"]([^'"]+)['"]\]\s*=/g,
  /\b(?:Kiwi\.)?handlers\.([A-Za-z_$][\w$]*)\s*=/g,
  /\b(?:Kiwi\.)?handlers\[['"]([^'"]+)['"]\]\s*=/g,
 ];
 for (const pattern of patterns) for (const match of source.matchAll(pattern)) owners.add(match[1]);
 return [...owners].sort();
}
/* A GENERATED SHARED block is a copy of a pure rule module under functions/
 * (tools/shared-rules.json): its functions are that module's, checked by
 * tools/shared-rules-test.mjs, not entry points of the file it is copied into. */
export function withoutSharedCopies(source) {
 return source.replace(/\/\* GENERATED SHARED (\w+) BEGIN \*\/[\s\S]*?\/\* GENERATED SHARED \1 END \*\//g, '');
}
export function entryPointCount(source) {
 return new Set([...withoutSharedCopies(source).matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(match => match[1])).size;
}
export function checkInterfaces(read, baseline) {
 const failures = [];
 for (const [file, pin] of Object.entries(baseline)) {
  const source = read(file);
  const added = interfaceOwners(source).filter(owner => !pin.owners.includes(owner));
  if (entryPointCount(source) > pin.entryPoints) failures.push(`${file}: named entry points exceed ${pin.entryPoints}. Extract the new responsibility.`);
  if (added.length) failures.push(`${file}: new controller owners/interfaces ${added.join(', ')}. Put the feature in its own module.`);
 }
 return failures;
}
