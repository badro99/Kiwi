/* tools/native-runtime-source.mjs — le runtime natif tel que l'app l'exécute.
 *
 * app/src/native-runtime.js n'est plus qu'une entrée : le runtime est découpé
 * par sujet (appairage, cycle de vie, navigation…) en scripts classiques que
 * l'app charge dans l'ordre de tools/app-bundle-manifest.json › runtimeScripts
 * (tools/build-app-www.mjs › NATIVE_RUNTIME_TAGS). Les tests lisent ou exécutent
 * l'ensemble par ici, dans ce même ordre, pour ne jamais en tester qu'un morceau.
 *
 *   readNativeRuntime()            → tout le source, concaténé dans l'ordre
 *   nativeRuntimeFiles()           → [{ name, file, source }] dans l'ordre
 *   runNativeRuntime(context)      → chaque script dans un contexte vm, l'un après l'autre
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function nativeRuntimeFiles(root = DEFAULT_ROOT) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'tools', 'app-bundle-manifest.json'), 'utf8'));
  return manifest.runtimeScripts.map((name) => {
    const file = manifest.servedAtRoot + name;
    return { name, file, source: fs.readFileSync(path.join(root, file), 'utf8') };
  });
}

export function readNativeRuntime(root = DEFAULT_ROOT) {
  return nativeRuntimeFiles(root).map((f) => f.source).join('\n');
}

export function runNativeRuntime(context, root = DEFAULT_ROOT) {
  for (const f of nativeRuntimeFiles(root)) new vm.Script(f.source, { filename: f.file }).runInContext(context);
}
