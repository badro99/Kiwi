/* Floor plan: identifiers and colours a renderer may put in markup.
 *
 * The floor-plan document is written by the owner's editor AND by a paired
 * till, and both the editor and the till build HTML from it: table, zone and
 * element ids land in data-* attributes and selectors, colours in style
 * attributes. A value carrying a quote or an angle bracket would break out of
 * the attribute (stored XSS from a till into the owner's dashboard). The ids
 * Kiwi makes are short [A-Za-z0-9_-] tokens and every colour is a hex value, so
 * this rule keeps those and rewrites anything else: unsafe characters in an
 * id become '_' (deterministic, so a table and its references still agree),
 * a colour that is not hex becomes null (the renderer's default), and markup
 * characters are dropped from a table number.
 *
 * The server applies it on every floor-plan write (functions/api/store.js);
 * the editor and the till apply the copy in assets/floorplan-core.js to what
 * they read, which covers documents stored before this rule. It changes the
 * document in place and returns it.
 */
const ID_KEYS = ['id', 'zone', 'zoneId', 'group', 'floor', 'room', 'server', 'plane'];
const ID_LIST_KEYS = ['servers'];
const COLOR_KEYS = ['color', 'fill', 'accent'];
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const MAX_DEPTH = 16;

export const safeId = (value) => String(value).replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 80);

export const safeHex = (value) => (typeof value === 'string' && HEX.test(value.trim()) ? value.trim() : null);

function clean(node, depth) {
  if (!node || typeof node !== 'object' || depth > MAX_DEPTH) return;
  if (Array.isArray(node)) {
    for (const item of node) clean(item, depth + 1);
    return;
  }
  for (const key of Object.keys(node)) {
    const value = node[key];
    if (typeof value === 'string') {
      if (ID_KEYS.includes(key)) node[key] = safeId(value);
      else if (COLOR_KEYS.includes(key)) node[key] = safeHex(value);
      else if (key === 'num') node[key] = value.replace(/[<>"'`&]/g, '');
    } else if (Array.isArray(value) && ID_LIST_KEYS.includes(key)) {
      node[key] = value.map((v) => (typeof v === 'string' ? safeId(v) : v));
    } else if (value && typeof value === 'object') {
      clean(value, depth + 1);
    }
  }
}

export function cleanFloorplan(doc) {
  clean(doc, 0);
  return doc;
}
