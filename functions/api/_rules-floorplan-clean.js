/* Floor plan: every value a renderer may put in markup.
 *
 * The floor-plan document is written by the owner's editor AND by a paired
 * till, and both the editor and the till build HTML from it: ids land in
 * data-* attributes and selectors, colours and geometry in style attributes,
 * shapes and statuses in classes and data-*. A value carrying a quote or an
 * angle bracket would break out of the attribute (stored XSS from a till into
 * the owner's dashboard). So this rule keeps what Kiwi itself writes and
 * rewrites anything else, whatever its type:
 *   - ids (and id lists): characters outside [A-Za-z0-9_.:-] become '_'
 *     (deterministic, so a table and its references still agree);
 *   - colours: a hex value, else null (the renderer's default);
 *   - geometry and counts: a finite number, else 0;
 *   - display text (names, labels, notes) stays as typed: renderers escape it;
 *   - every other string (type, shape, status, role, table number...) has
 *     its quotes turned into typographic ones and loses < > ` &;
 *   - object keys follow the id rule, and anything nested deeper than a plan
 *     ever is becomes null.
 *
 * The server applies it on every floor-plan write (functions/api/store.js);
 * the editor and the till apply the copy in assets/floorplan-core.js to what
 * they read, which covers documents stored before this rule. It changes the
 * document in place and returns it.
 */
const ID_KEYS = ['id', 'zone', 'zoneId', 'group', 'floor', 'room', 'server', 'plane', 'servers'];
const COLOR_KEYS = ['color', 'fill', 'accent'];
const NUMBER_KEYS = ['x', 'y', 'w', 'h', 'r', 'rot', 'deg', 'angle', 'z', 'seats', 'wallW', 'cx', 'cy',
  'width', 'height', 'zoom', 'scale', 'covers', 'minSeats', 'maxSeats'];
const TEXT_KEYS = ['name', 'label', 'note', 'notes', 'title', 'description', 'desc', 'text', 'comment', 'reason'];
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const plain = (text) => text.replace(/'/g, '\u2019').replace(/"/g, '\u201d').replace(/[<>`&]/g, '');
const MAX_DEPTH = 12;

export const safeId = (value) => String(value).replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 80);

export const safeHex = (value) => (typeof value === 'string' && HEX.test(value.trim()) ? value.trim() : null);

const safeNumber = (value) => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
};

function cleanId(value, depth) {
  if (value == null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') return safeId(value);
  if (depth > MAX_DEPTH) return null;
  if (Array.isArray(value)) return value.map((v) => cleanId(v, depth + 1));
  clean(value, depth + 1);
  return value;
}

function cleanValue(key, value, depth) {
  if (value == null || typeof value === 'boolean') return value;
  if (ID_KEYS.includes(key)) return cleanId(value, depth);
  if (COLOR_KEYS.includes(key)) return safeHex(value);
  if (NUMBER_KEYS.includes(key)) return safeNumber(value);
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') return TEXT_KEYS.includes(key) ? value : plain(value);
  if (depth > MAX_DEPTH) return null;
  clean(value, depth + 1);
  return value;
}

function clean(node, depth) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) node[i] = cleanValue('', node[i], depth + 1);
    return;
  }
  for (const key of Object.keys(node)) {
    const value = node[key];
    const safeKey = /^[A-Za-z0-9_.:-]*$/.test(key) ? key : safeId(key);
    if (safeKey !== key) delete node[key];
    node[safeKey] = cleanValue(key, value, depth);
  }
}

export function cleanFloorplan(doc) {
  clean(doc, 0);
  return doc;
}
