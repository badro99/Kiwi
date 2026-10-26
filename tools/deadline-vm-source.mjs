import fs from 'node:fs';
// VM scripts cannot resolve browser imports; execute the same helper in their realm.
export function deadlineVmSource(source) {
  const helper = fs.readFileSync(new URL('../assets/request-deadline.mjs', import.meta.url), 'utf8').replace('export ', '');
  return 'var __deadlineNet = (() => {\n' + helper + '\nreturn {deadlineFetch}; })();\n' +
    source.replace(/import\('[^']*request-deadline.mjs'\)/g, 'Promise.resolve(__deadlineNet)');
}
