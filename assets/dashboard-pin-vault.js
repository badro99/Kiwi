/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · LE COFFRE DES CODES DU DASHBOARD — window.KiwiDashPinVault
 * ---------------------------------------------------------------------------
 * La porte du dashboard compare un code de quatre chiffres à /api/pin/verify,
 * et à rien d'autre quand le réseau répond (CLAUDE.md §6). Ce fichier ne
 * garde donc JAMAIS un code : il garde, pour un patron dont le réseau est
 * tombé, de quoi reconnaître un code que le serveur a déjà prouvé.
 *
 * Avant : `kiwiPins` portait { role, code, name } EN CLAIR dans localStorage,
 * écrit par l'assistant d'installation, et la porte comparait le code frappé à
 * ce code, avant même d'interroger le serveur. Tout code d'un navigateur où le
 * patron s'était installé (une caisse comprise) y restait lisible, et un code
 * changé ou retiré ouvrait encore la porte, réseau ou pas.
 *
 * Maintenant, la même forme que la caisse (assets/caisse-pairing.js
 * rememberOfflinePin / verifyOfflinePin) :
 *   · une ligne = un sel + SHA-256(« dashboard:compte:sel:code ») + l'identité
 *     prouvée (id, nom, rôle). Jamais le code.
 *   · écrite SEULEMENT après que le serveur a dit oui (remember est appelé par
 *     la porte sur une réponse 200, nulle part ailleurs).
 *   · 7 jours depuis la dernière preuve en ligne, 12 lignes au plus.
 *   · lue SEULEMENT quand le serveur n'a pas pu répondre. Un « non » du
 *     serveur est définitif et efface au passage la ligne de ce code.
 *   · rangée par compte (kiwiAccountKey, dans la clé ET dans le condensat), et
 *     sous le préfixe `kiwi:` que la purge de locataire emporte.
 *
 * Limite assumée : un code a quatre chiffres, donc dix mille possibilités ; un
 * condensat salé ne les protège pas d'une attaque de quelqu'un qui lit déjà le
 * stockage, il ôte seulement le code lisible. C'est le même compromis que la
 * caisse, borné de la même façon (7 jours, 12 lignes, un compte).
 *
 * Migration : `kiwiPins` (clair) est SUPPRIMÉ au chargement, sans conversion.
 * Ces codes n'ont jamais été prouvés par le serveur ; en faire des lignes aurait
 * donné sept jours d'ouverture hors ligne à un code peut-être changé depuis.
 * Le premier déverrouillage en ligne écrit la vraie ligne.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var KEY = 'kiwi:dashboard:offline-pins:v1:';
  var LEGACY_KEY = 'kiwiPins';
  var TTL = 7 * 24 * 60 * 60 * 1000;
  var MAX_ROWS = 12;
  var CODE = /^\d{4}$/;
  /* Hors ligne, rien ne compte les essais côté serveur : le pavé les compte ici.
     Cinq refus de suite et la ligne salée ne répond plus pendant cinq minutes
     (dix mille codes possibles ≈ une semaine d'essais au lieu de quelques
     secondes). Ce n'est pas une barrière contre qui lit déjà le stockage, c'est
     celle d'une personne devant l'écran. Même préfixe, donc même purge. */
  var FAILS_KEY = 'kiwi:dashboard:offline-fails:v1:';
  var MAX_MISSES = 5;
  var LOCK_MS = 5 * 60 * 1000;

  function ls(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function put(k, v) { try { localStorage.setItem(k, v); return true; } catch (_) { return false; } }
  function del(k) { try { localStorage.removeItem(k); } catch (_) {} }

  /* Le compte de ce navigateur. Sans lui, rien n'est écrit ni lu : un
     condensat qu'on ne sait rattacher à personne ne doit ouvrir aucune porte. */
  function scope() { return String(ls('kiwiAccountKey') || '').trim().toLowerCase(); }
  function rowsKey(sc) { return KEY + encodeURIComponent(sc); }

  function readRows(sc) {
    if (!sc) return [];
    try {
      var rows = JSON.parse(ls(rowsKey(sc)) || '[]');
      var now = Date.now();
      return Array.isArray(rows) ? rows.filter(function (r) {
        return r && typeof r.digest === 'string' && r.digest && typeof r.salt === 'string'
          && Number(r.expiresAt || 0) > now && r.staff && typeof r.staff === 'object';
      }) : [];
    } catch (_) { return []; }
  }
  function readFails(sc) {
    try {
      var f = JSON.parse(ls(FAILS_KEY + encodeURIComponent(sc)) || 'null');
      return f && typeof f === 'object' ? { n: Number(f.n) || 0, until: Number(f.until) || 0 } : { n: 0, until: 0 };
    } catch (_) { return { n: 0, until: 0 }; }
  }
  function writeFails(sc, f) {
    if (!f.n && !f.until) del(FAILS_KEY + encodeURIComponent(sc));
    else put(FAILS_KEY + encodeURIComponent(sc), JSON.stringify(f));
  }
  /* Secondes restantes avant la prochaine tentative hors ligne ; 0 = libre. */
  function lockedFor() {
    var sc = scope();
    if (!sc) return 0;
    var left = readFails(sc).until - Date.now();
    return left > 0 ? Math.ceil(left / 1000) : 0;
  }
  function noteMiss(sc) {
    var f = readFails(sc);
    if (f.until && f.until <= Date.now()) f = { n: 0, until: 0 };
    f.n += 1;
    if (f.n >= MAX_MISSES) f = { n: 0, until: Date.now() + LOCK_MS };
    writeFails(sc, f);
  }
  function writeRows(sc, rows) {
    if (!rows.length) { del(rowsKey(sc)); return true; }
    return put(rowsKey(sc), JSON.stringify(rows.slice(-MAX_ROWS)));
  }

  function webcrypto() {
    return typeof crypto !== 'undefined' ? crypto : (typeof window !== 'undefined' ? window.crypto : null);
  }
  function hex(bytes) {
    return Array.prototype.map.call(new Uint8Array(bytes), function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }
  function digestOf(sc, salt, code) {
    var c = webcrypto();
    if (!(c && c.subtle && typeof TextEncoder !== 'undefined')) return Promise.resolve('');
    var material = new TextEncoder().encode('dashboard:' + sc + ':' + salt + ':' + code);
    return c.subtle.digest('SHA-256', material).then(hex, function () { return ''; });
  }
  function freshSalt() {
    try { return hex(webcrypto().getRandomValues(new Uint8Array(16))); } catch (_) { return ''; }
  }

  /* Pour chaque ligne : son condensat est-il celui de ce code ? */
  function matching(sc, rows, code) {
    return Promise.all(rows.map(function (r) {
      return digestOf(sc, r.salt, code).then(function (d) { return !!d && d === r.digest; });
    }));
  }
  function digestsWhere(rows, flags) {
    var out = {};
    rows.forEach(function (r, i) { if (flags[i]) out[r.digest] = true; });
    return out;
  }

  /* Le serveur vient de prouver ce code : la ligne est (ré)écrite. Une personne
     n'a qu'une ligne (un code changé remplace l'ancien) et un code n'a qu'une
     identité. Résout true si une ligne est bien écrite. */
  function remember(code, staff) {
    code = String(code || '');
    var sc = scope();
    if (!sc || !CODE.test(code) || !staff) return Promise.resolve(false);
    var salt = freshSalt();
    if (!salt) return Promise.resolve(false);
    return digestOf(sc, salt, code).then(function (digest) {
      if (!digest) return false;
      var before = readRows(sc);
      return matching(sc, before, code).then(function (same) {
        var stale = digestsWhere(before, same);
        var id = String(staff.id || '');
        /* Relu APRÈS le hachage : un autre onglet a pu écrire entre-temps. */
        var kept = readRows(sc).filter(function (r) {
          return !stale[r.digest] && !(id && String(r.staff.id || '') === id);
        });
        kept.push({
          salt: salt, digest: digest, expiresAt: Date.now() + TTL,
          staff: {
            id: id.slice(0, 80), name: String(staff.name || '').slice(0, 80),
            role: String(staff.role || '').slice(0, 80),
          },
        });
        return writeRows(sc, kept);
      });
    }).catch(function () { return false; });
  }

  /* Le serveur n'a pas pu répondre : ce code est-il l'un de ceux qu'il a prouvés
     ici ? Résout l'identité { id, name, role } ou null. */
  function verify(code) {
    code = String(code || '');
    var sc = scope();
    if (!sc || !CODE.test(code)) return Promise.resolve(null);
    var rows = readRows(sc);
    if (!rows.length) return Promise.resolve(null);
    if (lockedFor() > 0) return Promise.resolve(null);       // pause : on ne hache même pas
    return matching(sc, rows, code).then(function (same) {
      for (var i = 0; i < rows.length; i++) if (same[i]) { writeFails(sc, { n: 0, until: 0 }); return rows[i].staff; }
      noteMiss(sc);
      return null;
    }).catch(function () { return null; });
  }

  /* Le serveur a dit NON à ce code : plus aucune ligne ne doit le reconnaître. */
  function forget(code) {
    code = String(code || '');
    var sc = scope();
    if (!sc || !CODE.test(code)) return Promise.resolve(0);
    var rows = readRows(sc);
    if (!rows.length) return Promise.resolve(0);
    return matching(sc, rows, code).then(function (same) {
      var stale = digestsWhere(rows, same);
      var dropped = same.filter(Boolean).length;
      if (dropped) writeRows(sc, readRows(sc).filter(function (r) { return !stale[r.digest]; }));
      return dropped;
    }).catch(function () { return 0; });
  }

  /* Combien de codes prouvés ici ? Synchrone, sans rien hacher : la porte s'en
     sert pour savoir si ce navigateur connaît quelqu'un, jamais pour comparer. */
  function count() { return readRows(scope()).length; }

  function dropLegacy() {
    var had = ls(LEGACY_KEY) !== null;
    if (had) del(LEGACY_KEY);
    return had;
  }

  /* Au chargement : le clair part, sans conversion. */
  dropLegacy();

  window.KiwiDashPinVault = {
    remember: remember, verify: verify, forget: forget, count: count, lockedFor: lockedFor,
    dropLegacy: dropLegacy, TTL: TTL, MAX_ROWS: MAX_ROWS, MAX_MISSES: MAX_MISSES, LOCK_MS: LOCK_MS,
    storageKey: function () { return rowsKey(scope()); },
  };
})();
