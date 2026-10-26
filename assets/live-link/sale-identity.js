/* Full SHA-256 of the framed receipt identity, within D1's 64-character key.
 * Legacy queued commands already contain their id and remain untouched. */
(function () {
  function digest(text) {
    var bytes = unescape(encodeURIComponent(text)), words = [], length = bytes.length * 8;
    for (var i = 0; i < bytes.length; i++) words[i >> 2] = (words[i >> 2] || 0) | bytes.charCodeAt(i) << (24 - (i % 4) * 8);
    words[length >> 5] = (words[length >> 5] || 0) | 0x80 << (24 - length % 32);
    words[((length + 64 >> 9) << 4) + 15] = length;
    var primes = [], initial = [], constants = [];
    for (var n = 2; constants.length < 64; n++) {
      if (primes.some(function (p) { return n % p === 0; })) continue;
      primes.push(n);
      if (initial.length < 8) initial.push(Math.sqrt(n) * 0x100000000 | 0);
      constants.push(Math.cbrt(n) * 0x100000000 | 0);
    }
    function rot(x, n) { return x >>> n | x << (32 - n); }
    for (var offset = 0; offset < words.length; offset += 16) {
      var w = [], h = initial.slice();
      for (i = 0; i < 64; i++) {
        var a = w[i - 15], b = w[i - 2];
        w[i] = i < 16 ? words[offset + i] | 0 : ((rot(a, 7) ^ rot(a, 18) ^ a >>> 3) + w[i - 16] + (rot(b, 17) ^ rot(b, 19) ^ b >>> 10) + w[i - 7]) | 0;
        var t = (h[7] + (rot(h[4], 6) ^ rot(h[4], 11) ^ rot(h[4], 25)) + (h[4] & h[5] ^ ~h[4] & h[6]) + constants[i] + w[i]) | 0;
        var u = ((rot(h[0], 2) ^ rot(h[0], 13) ^ rot(h[0], 22)) + (h[0] & h[1] ^ h[0] & h[2] ^ h[1] & h[2])) | 0;
        h = [(t + u) | 0, h[0], h[1], h[2], (h[3] + t) | 0, h[4], h[5], h[6]];
      }
      initial = initial.map(function (v, j) { return (v + h[j]) | 0; });
    }
    return initial.map(function (v) { return (v >>> 0).toString(16).padStart(8, '0'); }).join('');
  }
  window.KiwiSaleIdentity = function (merchant, entry) {
    return digest(JSON.stringify([String(merchant || ''), String(entry.ref || ''), String(entry.idDay || '')]));
  };
})();
