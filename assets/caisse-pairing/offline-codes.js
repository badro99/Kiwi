
  var TERMINAL_KEY = 'kiwi:caisse:terminal-id:v1';
  var OFFLINE_PIN_KEY = 'kiwi:caisse:offline-pins:v1:';
  var OFFLINE_PIN_TTL = 72 * 60 * 60 * 1000;
  function terminalId() {
    var current = '';
    try { current = localStorage.getItem(TERMINAL_KEY) || ''; } catch (_) {}
    if (/^[A-Za-z0-9_-]{12,80}$/.test(current)) return current;
    try { current = 'term_' + crypto.randomUUID().replace(/-/g, ''); }
    catch (_) { current = 'term_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 18); }
    try { localStorage.setItem(TERMINAL_KEY, current); } catch (_) {}
    return current;
  }

  function env() { return window.KiwiEnv || { demosAllowed: true }; }
  function hosted() { return env().demosAllowed === false; }
  function ls(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }
  function del(k) { try { localStorage.removeItem(k); } catch (_) {} }
  function readMap() { try { return JSON.parse(ls('kiwiPairings') || '{}') || {}; } catch (_) { return {}; } }

  /* A real till must keep authorizations usable during a network outage, but
   * never bank the four-digit code itself. After the server proves a code, keep
   * a tenant-scoped PBKDF2-SHA-256 verifier plus the proven identity for 72
   * hours. A candidate typed offline is hashed again and compared locally. The
   * short TTL limits a revoked code's offline lifetime; the next successful
   * online verification refreshes it. */
  function offlinePinKey(merchant) { return OFFLINE_PIN_KEY + encodeURIComponent(String(merchant || '')); }
  /* `keep`, when given, drops the rows it refuses as well (a roster that no
     longer holds them, a code the server just refused); any such drop also
     cancels verifiers being written in flight. */
  function offlinePinRows(merchant, keep) {
    try {
      var rows = JSON.parse(ls(offlinePinKey(merchant)) || '[]');
      var at = (window.KiwiTrustedClock || Date).now(); /* horloge ancrée sur le serveur (pairing-commit.js) */
      var kept = Array.isArray(rows) ? rows.filter(function (row) {
        return row && (row.v === 2 && row.hash) && Number(row.expiresAt || 0) > at && at - Number(row.provenAt || (Number(row.expiresAt) - 7 * 86400000)) < OFFLINE_PIN_TTL;
      }) : [];
      if (keep) {
        var held = kept.filter(function (row) { try { return !!keep(row); } catch (_) { return false; } });
        if (held.length !== kept.length) offlinePinEpoch++;
        kept = held;
      }
      if (JSON.stringify(kept) !== JSON.stringify(rows)) set(offlinePinKey(merchant), JSON.stringify(kept));
      return kept;
    } catch (_) { return []; }
  }
  function bytesHex(bytes) {
    return Array.from(new Uint8Array(bytes)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }
  /* 1M PBKDF2-SHA-256 rounds: about 85 ms on a recent Mac, a few hundred ms on
     a cheap tablet. A four-digit code cannot be made unguessable offline; this
     moves enumerating a copied cache from milliseconds to many minutes. Every
     row of one till shares one salt, so an unlock costs ONE derivation however
     many staff are cached (twelve rows used to mean twelve). */
  var PIN_ITERATIONS = 1000000;
  function hasSubtle() { return !!(window.crypto && window.crypto.subtle && window.TextEncoder); }
  function pinDigest(merchant, salt, code, iterations) {
    if (!hasSubtle()) return Promise.resolve('');
    var subtle = window.crypto.subtle;
    var bytes = new Uint8Array(salt.match(/../g).map(function (h) { return parseInt(h, 16); }));
    return subtle.importKey('raw', new TextEncoder().encode(String(merchant) + ':' + code),
      'PBKDF2', false, ['deriveBits']).then(function (key) {
      return subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: bytes, iterations: iterations }, key, 256);
    }).then(bytesHex);
  }
  function sameDigest(a, b) {
    if (!/^[a-f0-9]{64}$/.test(a) || !/^[a-f0-9]{64}$/.test(b)) return false;
    var diff = 0;
    for (var i = 0; i < 64; i += 2) diff |= parseInt(a.slice(i, i + 2), 16) ^ parseInt(b.slice(i, i + 2), 16);
    return diff === 0;
  }
  var offlinePinEpoch = 0;
  function rememberOfflinePin(merchant, code, staff, expiresAt) {
    var epoch = offlinePinEpoch, provenAt = (window.KiwiTrustedClock || Date).now();
    if (!staff || !/^\d{4}$/.test(String(code || ''))) return Promise.resolve(staff);
    // In an insecure context subtle is absent: retain the existing behaviour
    // (no local verification or new cache entry), never a JS PBKDF2 fallback.
    if (!hasSubtle()) return Promise.resolve(staff);
    return Promise.resolve().then(function () {
      var shared = offlinePinRows(merchant).find(function (row) {
        return row.v === 2 && row.it === PIN_ITERATIONS && /^[a-f0-9]{32}$/.test(row.salt);
      });
      var salt = shared ? shared.salt : bytesHex(window.crypto.getRandomValues(new Uint8Array(16)));
      return pinDigest(merchant, salt, code, PIN_ITERATIONS).then(function (hash) {
        /* The derivation ran behind the unlock: if the till was unpaired or
           moved to another store meanwhile, this store's verifier must not
           come back after its purge. */
        var still = activeVenue();
        if (epoch !== offlinePinEpoch || !still || String(still.merchant || '') !== String(merchant)) return staff;
        var rows = offlinePinRows(merchant).filter(function (row) {
          return String(row.staff && row.staff.id || '') !== String(staff.id || '');
        });
        rows.push({ v: 2, kdf: 'pbkdf2-sha256', it: PIN_ITERATIONS, salt: salt, hash: hash,
          provenAt: provenAt, expiresAt: expiresAt || provenAt + OFFLINE_PIN_TTL,
          staff: { id: String(staff.id || '').slice(0, 80), name: String(staff.name || '').slice(0, 80),
            role: String(staff.role || '').slice(0, 80) } });
        set(offlinePinKey(merchant), JSON.stringify(rows.slice(-12))); // Bounded: each cached verifier is one more offline guess target.
        return staff;
      });
    }).catch(function () { return staff; }); // Cache failure cannot reject a server-proven unlock.
  }
  function verifyOfflinePin(merchant, code) {
    var epoch = offlinePinEpoch;
    if (!hasSubtle()) return Promise.resolve(null);
    if (window.KiwiTrustedClock && window.KiwiTrustedClock.rolledBack()) return Promise.resolve(null); /* clock moved back: wait for the server */
    var rows = offlinePinRows(merchant);
    /* One derivation per (salt, rounds) pair, not per row. */
    var derived = {};
    function derive(row) {
      var k = row.it + ':' + row.salt;
      if (!derived[k]) derived[k] = pinDigest(merchant, row.salt, code, row.it);
      return derived[k];
    }
    return Promise.all(rows.map(function (row) {
      if (row.v !== 2 || row.kdf !== 'pbkdf2-sha256' || !Number.isSafeInteger(row.it) || row.it < PIN_ITERATIONS ||
          row.it > 2000000 || !/^[a-f0-9]{32}$/.test(row.salt)) return null;
      return derive(row).then(function (digest) {
        var nowMs = (window.KiwiTrustedClock || Date).now(); if (epoch !== offlinePinEpoch || !sameDigest(digest, row.hash) || nowMs >= row.expiresAt ||
            nowMs - Number(row.provenAt || (row.expiresAt - 7 * 86400000)) >= OFFLINE_PIN_TTL) return null;
        var who = Object.assign({}, row.staff, { provenAt: Number(row.provenAt || (Number(row.expiresAt) - 7 * 86400000)), offline: true });
        return who;
      }).catch(function () { return null; });
    })).then(function (matches) { return matches.find(Boolean) || null; });
  }
