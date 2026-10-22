// Declaration boundaries from live scripts. Node's parser validates candidates,
// including braces inside strings, templates, comments and regular expressions.
const vm = require('node:vm');
const cache = new Map();
function declaration(source, name) {
  if (!cache.has(source)) cache.set(source, new Map());
  const found = cache.get(source);
  if (found.has(name)) return found.get(name);
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const starts = new RegExp('(?:^|\\n)[ \\t]*((?:async\\s+)?function\\s+\\*?\\s*' + escaped + '\\s*\\(|(?:const|let|var)\\s+' + escaped + '\\s*=)', 'g');
  for (const match of source.matchAll(starts)) {
    const start = match.index + match[0].indexOf(match[1]);
    try { new vm.Script(source.slice(0, start)); }
    catch (error) { if (error instanceof SyntaxError) continue; throw error; }
    // A complete declaration is the first parser-accepted closing delimiter.
    // Delimiters in literals/comments cannot finish a syntactically valid prefix.
    const variable = /^(?:const|let|var)\b/.test(match[1]);
    for (let end = start; end < source.length; end++) {
      if (source[end] !== (variable ? ';' : '}')) continue;
      const text = source.slice(start, end + 1);
      try {
        new vm.Script(text);
        found.set(name, text);
        return text;
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
      }
    }
  }
  throw Error('Declaration not found: ' + name);
}
module.exports = { declaration };
