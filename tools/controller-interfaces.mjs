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
export function entryPointCount(source) {
 return new Set([...source.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(match => match[1])).size;
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
