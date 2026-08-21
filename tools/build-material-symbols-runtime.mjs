import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = path.join(root, 'assets');

const aliases = {
  'account-balance': 'account_balance', 'activity': 'monitoring',
  'alert-circle': 'error', 'alert-triangle': 'warning',
  'apple': 'nutrition', 'archive': 'archive', 'archive-restore': 'settings_backup_restore',
  'armchair': 'chair',
  'arrow-down-to-line': 'download', 'arrow-left': 'arrow_back',
  'arrow-left-right': 'sync_alt', 'arrow-right': 'arrow_forward',
  'arrow-right-left': 'swap_horiz', 'arrow-up-from-line': 'upload',
  'arrow-up-right': 'north_east', 'badge-check': 'verified',
  'badge-percent': 'percent', 'ban': 'block', 'banknote': 'payments',
  'baby': 'child_care', 'bar-chart-3': 'bar_chart', 'bell': 'notifications',
  'bell-ring': 'notifications_active', 'bike': 'two_wheeler',
  'book': 'menu_book', 'book-open': 'menu_book', 'boxes': 'inventory_2',
  'briefcase-business': 'business_center', 'battery-medium': 'battery_5_bar',
  'bed-double': 'bed',
  'building-2': 'apartment', 'cake': 'cake', 'calculator': 'calculate',
  'calendar': 'calendar_month', 'calendar-check': 'event_available',
  'calendar-clock': 'event', 'calendar-days': 'calendar_month',
  'calendar-off': 'event_busy', 'calendar-x': 'event_busy', 'camera': 'photo_camera',
  'chart-no-axes-column-increasing': 'bar_chart', 'check': 'check',
  'check-check': 'done_all', 'check-circle-2': 'check_circle',
  'chef-hat': 'skillet', 'chevron-left': 'chevron_left',
  'chevron-right': 'chevron_right', 'circle': 'radio_button_unchecked',
  'clipboard-check': 'assignment_turned_in', 'clipboard-list': 'assignment',
  'clock': 'schedule', 'coffee': 'local_cafe', 'coins': 'paid',
  'contact': 'contacts', 'contactless': 'contactless',
  'cooking-pot': 'skillet', 'copy': 'content_copy',
  'corner-up-left': 'reply',
  'credit-card': 'credit_card', 'croissant': 'bakery_dining',
  'cross': 'medical_services', 'delete': 'backspace', 'dialpad': 'dialpad',
  'divide': 'calculate',
  'door-open': 'door_open', 'droplets': 'water_drop', 'dumbbell': 'fitness_center',
  'edit-3': 'edit', 'equal': 'drag_handle', 'external-link': 'open_in_new',
  'eye': 'visibility', 'file-plus-2': 'note_add', 'file-text': 'description',
  'flame': 'local_fire_department', 'flower': 'local_florist', 'folder': 'folder',
  'flower-2': 'local_florist', 'gavel': 'gavel',
  'git-branch': 'account_tree', 'gift': 'redeem',
  'globe': 'language',
  'glass-water': 'local_bar', 'graduation-cap': 'school', 'hand-coins': 'payments',
  'hand-platter': 'room_service', 'heart': 'favorite', 'history': 'history',
  'inbox': 'inbox', 'info': 'info', 'inventory-2': 'inventory_2',
  'keyboard': 'keyboard', 'key-round': 'key',
  'languages': 'translate', 'layers': 'layers', 'layout-dashboard': 'dashboard',
  'layout-grid': 'grid_view', 'leaf': 'eco', 'lightbulb': 'lightbulb',
  'link': 'link', 'list': 'list', 'list-checks': 'checklist',
  'list-filter': 'filter_list', 'loader': 'progress_activity',
  'lock': 'lock', 'log-in': 'login', 'log-out': 'logout', 'map-pin': 'location_on',
  'maximize': 'fullscreen', 'megaphone': 'campaign', 'merge': 'merge',
  'message-circle': 'chat_bubble', 'message-square': 'chat',
  'message-square-text': 'chat', 'minimize': 'fullscreen_exit', 'minus': 'remove',
  'monitor': 'desktop_windows', 'moon': 'dark_mode',
  'more-horizontal': 'more_horiz', 'more-vertical': 'more_vert',
  'move-horizontal': 'swap_horiz', 'navigation': 'navigation',
  'nfc': 'nfc', 'notebook': 'menu_book', 'notebook-tabs': 'menu_book',
  'package': 'inventory_2', 'package-check': 'inventory',
  'package-minus': 'inventory_2', 'package-open': 'inventory_2',
  'package-plus': 'add_box', 'package-x': 'inventory',
  'party-popper': 'celebration', 'pause': 'pause', 'pencil': 'edit',
  'pencil-line': 'edit_note', 'percent': 'percent', 'phone': 'call',
  'pill': 'medication', 'pizza': 'local_pizza', 'play': 'play_arrow',
  'plus': 'add', 'plus-circle': 'add_circle', 'power': 'power_settings_new',
  'printer': 'print', 'qr-code': 'qr_code_2', 'receipt': 'receipt',
  'receipt-text': 'receipt_long', 'refresh-cw': 'refresh', 'repeat': 'repeat',
  'rotate-ccw': 'undo', 'rotate-cw': 'rotate_right', 'ruler': 'straighten',
  'sandwich': 'lunch_dining', 'scale': 'balance', 'scan-barcode': 'barcode_scanner',
  'scan-line': 'document_scanner', 'scissors': 'content_cut', 'search': 'search',
  'search-x': 'search_off', 'send': 'send', 'send-horizontal': 'send',
  'share-2': 'share', 'shield-alert': 'gpp_maybe',
  'shield-check': 'verified_user', 'shirt': 'checkroom',
  'shopping-bag': 'shopping_bag', 'shopping-basket': 'shopping_basket',
  'shopping-cart': 'shopping_cart', 'smartphone': 'smartphone',
  'snowflake': 'ac_unit', 'sparkles': 'auto_awesome', 'split': 'call_split',
  'split-square-vertical': 'vertical_split', 'sprout': 'eco', 'star': 'star',
  'stethoscope': 'stethoscope', 'sticky-note': 'note', 'store': 'storefront',
  'swap-vert': 'swap_vert',
  'sun': 'light_mode', 'sun-moon': 'brightness_6', 'tag': 'sell', 'tags': 'sell',
  'target': 'track_changes', 'thermometer': 'thermometer',
  'thumbs-down': 'thumb_down', 'thumbs-up': 'thumb_up',
  'ticket': 'confirmation_number',
  'timer': 'timer', 'trash-2': 'delete', 'trending-up': 'trending_up',
  'triangle-alert': 'warning', 'truck': 'local_shipping', 'trophy': 'emoji_events',
  'unlock': 'lock_open', 'user': 'person', 'user-check': 'how_to_reg',
  'user-plus': 'person_add', 'user-round-plus': 'person_add',
  'user-round-x': 'person_remove', 'user-x': 'person_remove', 'users': 'groups',
  'utensils': 'restaurant', 'utensils-crossed': 'restaurant',
  'volume-2': 'volume_up', 'wallet': 'account_balance_wallet',
  'wand-2': 'auto_fix_high', 'wheat': 'grass', 'x': 'close',
  'x-circle': 'cancel', 'zap': 'bolt'
};

async function sourceFiles() {
  const rootFiles = (await readdir(root)).filter((name) => name.endsWith('.html'));
  const assetFiles = (await readdir(assetsDir))
    .filter((name) => name.endsWith('.js') && name !== 'lucide.min.js');
  return [
    ...rootFiles.map((name) => path.join(root, name)),
    ...assetFiles.map((name) => path.join(assetsDir, name))
  ];
}

async function iconNames() {
  const names = new Set(Object.keys(aliases));
  for (const file of await sourceFiles()) {
    const text = await readFile(file, 'utf8');
    for (const match of text.matchAll(/data-lucide\s*=\s*\\?["']([a-z0-9-]+)\\?["']/gi)) names.add(match[1]);
    for (const match of text.matchAll(/\bicon\s*:\s*["']([a-z0-9-]+)["']/gi)) names.add(match[1]);
  }
  return [...names].sort();
}

async function fetchPath(name) {
  const url = `https://fonts.gstatic.com/s/i/short-term/release/materialsymbolsrounded/${name}/default/24px.svg`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  const svg = await response.text();
  const match = svg.match(/<path d="([^"]+)"/);
  if (!match) throw new Error(`${name}: no path`);
  return match[1];
}

const lucideNames = await iconNames();
const materialNames = [...new Set(lucideNames.map((name) => aliases[name] || name.replaceAll('-', '_')))];
const paths = {};
const failures = [];

let cursor = 0;
await Promise.all(Array.from({ length: 12 }, async () => {
  while (cursor < materialNames.length) {
    const name = materialNames[cursor++];
    try { paths[name] = await fetchPath(name); }
    catch (error) { failures.push(error.message); }
  }
}));

if (!paths.help) paths.help = await fetchPath('help');

const runtime = `/*! Google Material Symbols Rounded compatibility runtime.
 * Replaces Lucide's createIcons() contract with official Google paths.
 * Source: google/material-design-icons · Apache-2.0.
 * Generated by tools/build-material-symbols-runtime.mjs. */
(function () {
  'use strict';
  const PATHS = Object.freeze(${JSON.stringify(paths, null, 2)});
  const ALIASES = Object.freeze(${JSON.stringify(aliases, null, 2)});
  const NS = 'http://www.w3.org/2000/svg';

  function createIcon(element) {
    const original = element.getAttribute('data-lucide') || 'help';
    const material = ALIASES[original] || original.replace(/-/g, '_');
    if (element.tagName.toLowerCase() === 'svg' && element.getAttribute('data-material-symbol') === material) return;

    const svg = document.createElementNS(NS, 'svg');
    for (const attr of Array.from(element.attributes)) {
      if (attr.name !== 'data-material-symbol') svg.setAttribute(attr.name, attr.value);
    }
    const classes = new Set((svg.getAttribute('class') || '').split(/\\s+/).filter(Boolean));
    classes.add('lucide');
    classes.add('lucide-' + original);
    classes.add('material-symbol-rounded');
    svg.setAttribute('class', Array.from(classes).join(' '));
    svg.setAttribute('data-material-symbol', material);
    svg.setAttribute('viewBox', '0 -960 960 960');
    svg.setAttribute('fill', 'currentColor');
    svg.setAttribute('stroke', 'none');
    if (!svg.hasAttribute('width')) svg.setAttribute('width', '24');
    if (!svg.hasAttribute('height')) svg.setAttribute('height', '24');
    if (!svg.hasAttribute('aria-label')) svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');

    const shape = document.createElementNS(NS, 'path');
    shape.setAttribute('d', PATHS[material] || PATHS.help);
    svg.appendChild(shape);
    element.replaceWith(svg);
  }

  function createIcons() {
    document.querySelectorAll('[data-lucide]').forEach(createIcon);
  }

  function svg(name, size, className) {
    const original = name || 'help';
    const material = ALIASES[original] || original.replace(/-/g, '_');
    const px = Number(size) || 24;
    const cls = className ? ' class="' + String(className).replace(/"/g, '&quot;') + '"' : '';
    return '<svg' + cls + ' data-material-symbol="' + material + '" viewBox="0 -960 960 960" width="' + px + '" height="' + px + '" fill="currentColor" stroke="none" aria-hidden="true" focusable="false"><path d="' + (PATHS[material] || PATHS.help) + '"></path></svg>';
  }

  window.lucide = { createIcons, icons: Object.freeze({}) };
  window.KiwiIcon = Object.freeze({ svg });
  let queued = false;
  new MutationObserver(function () {
    if (queued) return;
    queued = true;
    queueMicrotask(function () { queued = false; createIcons(); });
  }).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', createIcons);
  else queueMicrotask(createIcons);
})();
`;

await writeFile(path.join(assetsDir, 'lucide.min.js'), runtime);
console.log(`Material runtime: ${lucideNames.length} aliases, ${Object.keys(paths).length} paths.`);
if (failures.length) console.log(`Unavailable Material names (fallback to help):\n${failures.sort().join('\n')}`);
