/* Compact, backward-compatible price-list state stored inside the existing carte JSON. */
export const DEFAULT_PRICE_LIST_ID = 'default';

const MAX_LISTS = 12;
const MAX_PRICE = 10000000;
const text = (value, max) => String(value == null ? '' : value).trim().slice(0, max);
const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
const amount = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(MAX_PRICE, Math.round(number * 100) / 100));
};
const plainObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

function sanitizePriceMap(raw, validIds) {
  const output = {};
  if (!plainObject(raw)) return output;
  Object.keys(raw).slice(0, 1200).forEach((id) => {
    if (!validIds.has(id)) return;
    const price = amount(raw[id]);
    if (price != null) output[id] = price;
  });
  return output;
}
function sanitizeAvailability(raw, validIds) {
  const output = {};
  if (!plainObject(raw)) return output;
  Object.keys(raw).slice(0, 1200).forEach((id) => {
    if (validIds.has(id)) output[id] = raw[id] !== false;
  });
  return output;
}
function sanitizeOptionPrices(raw, validKeys) {
  const output = {};
  if (!plainObject(raw)) return output;
  Object.keys(raw).slice(0, 1600).forEach((key) => {
    if (!validKeys.has(key)) return;
    const price = amount(raw[key]);
    if (price != null) output[key] = price;
  });
  return output;
}
function sanitizeFormulaExtras(raw) {
  const output = {};
  if (!plainObject(raw)) return output;
  Object.keys(raw).slice(0, 2400).forEach((key) => {
    if (!/^items\/[A-Za-z0-9_.:-]{1,40}\/formula(?:\/[A-Za-z0-9_.:-]{1,80})*\/extra$/.test(key)) return;
    const price = amount(raw[key]);
    if (price != null) output[key] = price;
  });
  return output;
}
function sanitizeUndo(raw, validIds) {
  if (!plainObject(raw) || !Array.isArray(raw.changes)) return null;
  const changes = raw.changes.slice(0, 1200).map((change) => {
    const itemId = text(change && change.itemId, 40);
    const before = amount(change && change.before);
    const after = amount(change && change.after);
    return validIds.has(itemId) && before != null && after != null ? { itemId, before, after } : null;
  }).filter(Boolean);
  if (!changes.length) return null;
  return {
    id: text(raw.id, 50),
    at: Math.max(0, Number(raw.at) || 0),
    mode: raw.mode === 'percent' ? 'percent' : 'fixed',
    value: Math.max(0, Number(raw.value) || 0),
    roundUp: !!raw.roundUp,
    changes,
  };
}

export function sanitizeMenuPriceLists(raw, menu) {
  raw = plainObject(raw) ? raw : {};
  menu = plainObject(menu) ? menu : {};
  const itemIds = new Set((menu.items || []).map((item) => item && item.id).filter(Boolean));
  const optionKeys = new Set();
  (menu.opts || []).forEach((group) => (group.choices || []).forEach((choice) => {
    if (group && group.id && choice && choice.id) optionKeys.add(group.id + ':' + choice.id);
  }));
  const seen = new Set();
  const priceLists = (Array.isArray(raw.priceLists) ? raw.priceLists : []).slice(0, MAX_LISTS).map((entry) => {
    const id = text(entry && entry.id, 40);
    const name = text(entry && entry.name, 80);
    if (!id || id === DEFAULT_PRICE_LIST_ID || !name || seen.has(id)) return null;
    seen.add(id);
    return {
      id,
      name,
      active: !!entry.active,
      createdTs: Math.max(0, Number(entry.createdTs) || 0),
      updatedTs: Math.max(0, Number(entry.updatedTs) || 0),
      prices: sanitizePriceMap(entry.prices, itemIds),
      availability: sanitizeAvailability(entry.availability, itemIds),
      optionPrices: sanitizeOptionPrices(entry.optionPrices, optionKeys),
      formulaExtras: sanitizeFormulaExtras(entry.formulaExtras),
      lastBulk: sanitizeUndo(entry.lastBulk, itemIds),
    };
  }).filter(Boolean);
  const activeIds = new Set(priceLists.filter((entry) => entry.active).map((entry) => entry.id));
  const terminalMenus = {};
  if (plainObject(raw.terminalMenus)) Object.keys(raw.terminalMenus).slice(0, 160).forEach((terminalId) => {
    const cleanTerminal = text(terminalId, 120);
    const listId = text(raw.terminalMenus[terminalId], 40);
    if (cleanTerminal && activeIds.has(listId)) terminalMenus[cleanTerminal] = listId;
  });
  return {
    priceListSeq: Math.max(0, Math.min(1000000, Number(raw.priceListSeq) || 0)),
    bulkSeq: Math.max(0, Math.min(1000000, Number(raw.bulkSeq) || 0)),
    priceLists,
    terminalMenus,
    defaultPriceUndo: sanitizeUndo(raw.defaultPriceUndo, itemIds),
  };
}

export function stripMenuPriceLists(menu) {
  const output = clone(menu || {});
  delete output.priceListSeq;
  delete output.bulkSeq;
  delete output.priceLists;
  delete output.terminalMenus;
  delete output.defaultPriceUndo;
  return output;
}

function applyFormulaExtras(value, path, extras) {
  if (!value || typeof value !== 'object') return;
  const key = path + '/extra';
  if (Object.prototype.hasOwnProperty.call(extras || {}, key)) value.extra = extras[key];
  Object.keys(value).forEach((name) => {
    if (name !== 'extra' && value[name] && typeof value[name] === 'object') applyFormulaExtras(value[name], path + '/' + name, extras);
  });
}

export function resolveCaisseMenu(menu, terminalId) {
  const source = clone(menu || {});
  const defaultMenu = stripMenuPriceLists(source);
  const assignedId = plainObject(source.terminalMenus) ? text(source.terminalMenus[terminalId], 40) : '';
  const entry = (source.priceLists || []).find((candidate) => candidate && candidate.id === assignedId && candidate.active);
  if (!entry) {
    return {
      menu: clone(defaultMenu),
      defaultMenu,
      activeMenu: { id: DEFAULT_PRICE_LIST_ID, name: 'Menu principal', fallback: !!assignedId },
    };
  }
  const effective = clone(defaultMenu);
  effective.items = (effective.items || []).map((item) => {
    const next = clone(item);
    if (Object.prototype.hasOwnProperty.call(entry.prices || {}, item.id)) next.price = entry.prices[item.id];
    if (Object.prototype.hasOwnProperty.call(entry.availability || {}, item.id)) next.avail = entry.availability[item.id] !== false;
    if (next.formula) applyFormulaExtras(next.formula, 'items/' + item.id + '/formula', entry.formulaExtras || {});
    return next;
  });
  effective.opts = (effective.opts || []).map((group) => {
    const next = clone(group);
    next.choices = (next.choices || []).map((choice) => {
      const choiceNext = clone(choice);
      const key = group.id + ':' + choice.id;
      if (Object.prototype.hasOwnProperty.call(entry.optionPrices || {}, key)) choiceNext.price = entry.optionPrices[key];
      return choiceNext;
    });
    return next;
  });
  return {
    menu: effective,
    defaultMenu,
    activeMenu: { id: entry.id, name: entry.name, fallback: false },
  };
}
