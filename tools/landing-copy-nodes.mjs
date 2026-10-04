// Static copy inventory includes SVG captions and descriptive attributes.
// Runtime JS/CSS, machine URLs and decorative empty alternatives are excluded.
export function copyNodes(html) {
  const rows = [];
  const stack = [];
  const decode = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, '\u00a0').replace(/&#(\d+);/g, (_,n)=>String.fromCodePoint(+n));
  for (const token of html.matchAll(/<!--[\s\S]*?-->|<[^>]+>|[^<]+/g)) {
    const text = token[0];
    if (text.startsWith('<!--')) continue;
    if (text.startsWith('</')) { stack.pop(); continue; }
    if (text.startsWith('<')) {
      const tag = text.match(/^<([\w-]+)/)?.[1]?.toLowerCase();
      if (!tag) continue;
      for (const attr of text.matchAll(/\b(aria-label|alt|placeholder|title|content)="([^"]*)"/g)) {
        if (attr[1] === 'content' && !/name="description"|(?:property|name)="(?:og|twitter):(?:title|description)"/.test(text)) continue;
        const value = decode(attr[2]).trim();
        if (value) rows.push({kind:attr[1],tag,text:value,offset:token.index});
      }
      if (!['meta','link','img','input','br','hr','source','wbr'].includes(tag) && !text.endsWith('/>')) stack.push(tag);
      continue;
    }
    if (stack.includes('script') || stack.includes('style')) continue;
    const value = decode(text).trim();
    if (value) rows.push({kind:'text',tag:stack.at(-1),text:value,offset:token.index});
  }
  return rows;
}
