/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · assets/kit/actions.js · the one router for kit actions (spec §20.4).
 *
 *   window.KiwiActions = { on(name, fn), off(name), has(name), names(), last }
 *
 * Every kit component reports a user action as one composed
 *   CustomEvent('kiwi:action', { detail: { action, id, value } })
 * named k.<component>.<verb>. This file adds ONE listener on document and
 * keeps a registry of adapters, one per name: a second registration throws,
 * so two surfaces can never both own a name. An action with no adapter is
 * reported to KiwiReportError and shown nowhere.
 *
 * It never touches Kiwi.handlers or any data-action listener: a surface keeps
 * its legacy dispatcher until every control it serves has moved, and a kit
 * host never carries data-action (kit-lint), so a click inside a kit root
 * reaches only this path. One path per action, never two.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var doc = root.document;
  if (!doc || root.KiwiActions) return;

  var adapters = {};
  var NAME = /^k\.[a-z0-9-]+\.[a-z0-9-]+$/;

  function on(name, fn) {
    if (!NAME.test(name)) throw new Error('KiwiActions: a kit action is k.<component>.<verb>: ' + name);
    if (typeof fn !== 'function') throw new Error('KiwiActions: an adapter is a function: ' + name);
    if (adapters[name]) throw new Error('KiwiActions: ' + name + ' already has an adapter');
    adapters[name] = fn;
    return function () { if (adapters[name] === fn) delete adapters[name]; };
  }
  function off(name) { delete adapters[name]; }
  function has(name) { return !!adapters[name]; }
  function names() { return Object.keys(adapters).sort(); }

  var api = { on: on, off: off, has: has, names: names, last: null, unhandled: [] };

  doc.addEventListener('kiwi:action', function (e) {
    var d = e.detail || {};
    api.last = { action: d.action, id: d.id, at: Date.now() };
    var fn = adapters[d.action];
    if (!fn) {
      api.unhandled.push(d.action);
      if (api.unhandled.length > 50) api.unhandled.shift();
      if (typeof root.KiwiReportError === 'function') {
        try { root.KiwiReportError(new Error('kit action without adapter: ' + d.action), 'kit:actions'); } catch (_) {}
      }
      return;
    }
    try { fn(d, e); }
    catch (err) {
      if (typeof root.KiwiReportError === 'function') { try { root.KiwiReportError(err, 'kit:' + d.action); } catch (_) {} }
      else setTimeout(function () { throw err; });
    }
  });

  root.KiwiActions = api;
})(typeof window !== 'undefined' ? window : globalThis);
