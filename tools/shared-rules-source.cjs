// Load the generated dependencies alongside declarations extracted by a VM harness.
module.exports = source => [...source.matchAll(/^[ \t]*\/\* GENERATED SHARED (Kiwi\w+) BEGIN \*\/[\s\S]*?^[ \t]*\/\* GENERATED SHARED \1 END \*\//gm)].map(m => m[0]).join('\n');
