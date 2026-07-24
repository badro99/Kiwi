/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · QR — window.KiwiQR : a REAL, scannable QR-code encoder (vanilla, no deps)
 * ---------------------------------------------------------------------------
 * The growth kit's KiwiKit.qr() is decorative (a pretty pattern that does NOT
 * encode anything). This is the real thing: byte-mode QR with Reed-Solomon ECC,
 * automatic version + mask selection, rendered to a crisp, printable SVG.
 *
 * Port of Nayuki's QR Code generator (public domain,
 * https://www.nayuki.io/page/qr-code-generator-library), trimmed to byte mode
 * (enough for any URL) and wrapped in a tiny Kiwi API:
 *
 *   window.KiwiQR.svg(text, { size=256, margin=4, ecl='M', dark, light, round })
 *     → an SVG string (one <svg …>), scannable, theme-locked colours.
 *   window.KiwiQR.matrix(text, ecl)  → { size, get(x,y)->bool } (raw modules).
 *
 * ecl: 'L' | 'M' | 'Q' | 'H' (error-correction level; higher = more robust +
 * denser). Default 'M'. A short order URL lands around version 3–4.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ── Reed-Solomon over GF(256) with the QR primitive polynomial 0x11D ──────
  function rsMultiply(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z & 0xFF;
  }
  function rsDivisor(degree) {
    var result = [];
    for (var i = 0; i < degree - 1; i++) result.push(0);
    result.push(1); // start with the monomial x^0
    var root = 1;
    for (var i = 0; i < degree; i++) {
      for (var j = 0; j < result.length; j++) {
        result[j] = rsMultiply(result[j], root);
        if (j + 1 < result.length) result[j] ^= result[j + 1];
      }
      root = rsMultiply(root, 0x02);
    }
    return result;
  }
  function rsRemainder(data, divisor) {
    var result = divisor.map(function () { return 0; });
    data.forEach(function (b) {
      var factor = b ^ result.shift();
      result.push(0);
      divisor.forEach(function (coef, i) { result[i] ^= rsMultiply(coef, factor); });
    });
    return result;
  }

  // ── Per-(version, ecl) tables (standard QR spec) ─────────────────────────
  // Index [eclOrdinal][version]; version 1..40; index 0 is an illegal pad.
  // eclOrdinal: L=0, M=1, Q=2, H=3.
  var ECC_CODEWORDS_PER_BLOCK = [
    [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]
  ];
  var NUM_ERROR_CORRECTION_BLOCKS = [
    [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]
  ];
  var ECL_BITS = { L: 1, M: 0, Q: 3, H: 2 };   // 2-bit format value per level
  var ECL_ORD = { L: 0, M: 1, Q: 2, H: 3 };

  function getNumRawDataModules(ver) {
    var result = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      var numAlign = Math.floor(ver / 7) + 2;
      result -= (25 * numAlign - 10) * numAlign - 55;
      if (ver >= 7) result -= 36;
    }
    return result;
  }
  function getNumDataCodewords(ver, eclOrd) {
    return Math.floor(getNumRawDataModules(ver) / 8)
      - ECC_CODEWORDS_PER_BLOCK[eclOrd][ver] * NUM_ERROR_CORRECTION_BLOCKS[eclOrd][ver];
  }

  // ── Encode text (byte mode, UTF-8) → data codewords for a chosen version ──
  function utf8(str) {
    var out = [];
    var enc = unescape(encodeURIComponent(str)); // → each char is one byte
    for (var i = 0; i < enc.length; i++) out.push(enc.charCodeAt(i) & 0xFF);
    return out;
  }

  function buildQr(text, eclName) {
    var ecl = eclName in ECL_ORD ? eclName : 'M';
    var eclOrd = ECL_ORD[ecl];
    var bytes = utf8(text);

    // Pick the smallest version 1..40 that fits (byte mode).
    var version = 0, dataCapacityBits = 0;
    for (var v = 1; v <= 40; v++) {
      var capBits = getNumDataCodewords(v, eclOrd) * 8;
      var ccBits = (v <= 9) ? 8 : 16;              // byte-mode char-count length
      var need = 4 + ccBits + bytes.length * 8;    // mode + count + payload
      if (need <= capBits) { version = v; dataCapacityBits = capBits; break; }
    }
    if (version === 0) throw new Error('KiwiQR: data too long for a QR code');

    // Build the bit stream.
    var bits = [];
    function appendBits(val, len) { for (var i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); }
    appendBits(0x4, 4);                                   // byte mode indicator
    appendBits(bytes.length, version <= 9 ? 8 : 16);      // char count
    bytes.forEach(function (b) { appendBits(b, 8); });

    // Terminator + bit/byte padding to fill the data capacity.
    appendBits(0, Math.min(4, dataCapacityBits - bits.length));
    while (bits.length % 8 !== 0) bits.push(0);
    for (var pad = 0xEC; bits.length < dataCapacityBits; pad ^= 0xEC ^ 0x11) appendBits(pad, 8);

    // Pack into data codewords (bytes).
    var dataCodewords = [];
    for (var i = 0; i < bits.length; i += 8) {
      var b = 0;
      for (var j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      dataCodewords.push(b);
    }

    return new QrCode(version, ecl, dataCodewords);
  }

  // ── The QR symbol: draw function patterns, interleave ECC, apply best mask ─
  function QrCode(version, eclName, dataCodewords) {
    this.version = version;
    this.ecl = eclName;
    this.size = version * 4 + 17;
    var size = this.size;

    this.modules = [];
    this.isFunction = [];
    for (var y = 0; y < size; y++) {
      this.modules.push(new Array(size).fill(false));
      this.isFunction.push(new Array(size).fill(false));
    }

    this._drawFunctionPatterns();
    var allCodewords = this._addEccAndInterleave(dataCodewords);
    this._drawCodewords(allCodewords);

    // Choose the mask with the lowest penalty.
    var minPenalty = Infinity, bestMask = 0;
    for (var m = 0; m < 8; m++) {
      this._applyMask(m);
      this._drawFormatBits(m);
      var p = this._penaltyScore();
      if (p < minPenalty) { minPenalty = p; bestMask = m; }
      this._applyMask(m); // undo (XOR is its own inverse)
    }
    this._applyMask(bestMask);
    this._drawFormatBits(bestMask);
    this.mask = bestMask;
  }

  QrCode.prototype.get = function (x, y) {
    return (x >= 0 && x < this.size && y >= 0 && y < this.size) ? this.modules[y][x] : false;
  };
  QrCode.prototype._set = function (x, y, isDark, isFn) {
    this.modules[y][x] = isDark;
    if (isFn) this.isFunction[y][x] = true;
  };

  QrCode.prototype._drawFunctionPatterns = function () {
    var size = this.size, self = this;
    // Timing patterns.
    for (var i = 0; i < size; i++) {
      this._setFn(6, i, i % 2 === 0);
      this._setFn(i, 6, i % 2 === 0);
    }
    // Finder patterns (three corners) + separators.
    this._drawFinder(3, 3);
    this._drawFinder(size - 4, 3);
    this._drawFinder(3, size - 4);
    // Alignment patterns.
    var pos = this._alignPositions();
    var n = pos.length;
    for (var i = 0; i < n; i++) {
      for (var j = 0; j < n; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
        this._drawAlign(pos[i], pos[j]);
      }
    }
    // Reserve format + version areas (drawn with real bits later).
    this._drawFormatBits(0);
    this._drawVersion();
  };

  QrCode.prototype._setFn = function (x, y, isDark) {
    this.modules[y][x] = isDark;
    this.isFunction[y][x] = true;
  };

  QrCode.prototype._drawFinder = function (cx, cy) {
    for (var dy = -4; dy <= 4; dy++) {
      for (var dx = -4; dx <= 4; dx++) {
        var dist = Math.max(Math.abs(dx), Math.abs(dy));
        var xx = cx + dx, yy = cy + dy;
        if (xx >= 0 && xx < this.size && yy >= 0 && yy < this.size) {
          this._setFn(xx, yy, dist !== 2 && dist !== 4);
        }
      }
    }
  };

  QrCode.prototype._drawAlign = function (cx, cy) {
    for (var dy = -2; dy <= 2; dy++) {
      for (var dx = -2; dx <= 2; dx++) {
        this._setFn(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  };

  QrCode.prototype._alignPositions = function () {
    var ver = this.version;
    if (ver === 1) return [];
    var numAlign = Math.floor(ver / 7) + 2;
    var step = (ver === 32) ? 26 : Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
    var result = [6];
    for (var pos = this.size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
    return result;
  };

  QrCode.prototype._drawFormatBits = function (mask) {
    var eclBits = ECL_BITS[this.ecl];
    var data = (eclBits << 3) | mask;             // 5 bits
    var rem = data;
    for (var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    var bits = ((data << 10) | rem) ^ 0x5412;     // 15 bits, masked
    // First copy (around top-left).
    for (var i = 0; i <= 5; i++) this._setFn(8, i, ((bits >>> i) & 1) !== 0);
    this._setFn(8, 7, ((bits >>> 6) & 1) !== 0);
    this._setFn(8, 8, ((bits >>> 7) & 1) !== 0);
    this._setFn(7, 8, ((bits >>> 8) & 1) !== 0);
    for (var i = 9; i < 15; i++) this._setFn(14 - i, 8, ((bits >>> i) & 1) !== 0);
    // Second copy.
    var size = this.size;
    for (var i = 0; i < 8; i++) this._setFn(size - 1 - i, 8, ((bits >>> i) & 1) !== 0);
    for (var i = 8; i < 15; i++) this._setFn(8, size - 15 + i, ((bits >>> i) & 1) !== 0);
    this._setFn(8, size - 8, true); // always-dark module
  };

  QrCode.prototype._drawVersion = function () {
    if (this.version < 7) return;
    var rem = this.version;
    for (var i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
    var bits = (this.version << 12) | rem; // 18 bits
    var size = this.size;
    for (var i = 0; i < 18; i++) {
      var bit = ((bits >>> i) & 1) !== 0;
      var a = size - 11 + (i % 3), b = Math.floor(i / 3);
      this._setFn(a, b, bit);
      this._setFn(b, a, bit);
    }
  };

  QrCode.prototype._addEccAndInterleave = function (data) {
    var ver = this.version, eclOrd = ECL_ORD[this.ecl];
    var numBlocks = NUM_ERROR_CORRECTION_BLOCKS[eclOrd][ver];
    var blockEccLen = ECC_CODEWORDS_PER_BLOCK[eclOrd][ver];
    var rawCodewords = Math.floor(getNumRawDataModules(ver) / 8);
    var numShortBlocks = numBlocks - rawCodewords % numBlocks;
    var shortBlockLen = Math.floor(rawCodewords / numBlocks);

    var blocks = [];
    var rsDiv = rsDivisor(blockEccLen);
    var k = 0;
    for (var i = 0; i < numBlocks; i++) {
      var datLen = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1);
      var dat = data.slice(k, k + datLen);
      k += datLen;
      var ecc = rsRemainder(dat, rsDiv);
      if (i < numShortBlocks) dat.push(0); // pad short blocks for even interleave grid
      blocks.push(dat.concat(ecc));
    }

    var result = [];
    for (var i = 0; i < blocks[0].length; i++) {
      for (var j = 0; j < blocks.length; j++) {
        // Skip the padding cell in short blocks' data region.
        if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) {
          result.push(blocks[j][i]);
        }
      }
    }
    return result;
  };

  QrCode.prototype._drawCodewords = function (data) {
    var size = this.size, i = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) {
        for (var jj = 0; jj < 2; jj++) {
          var x = right - jj;
          var upward = ((right + 1) & 2) === 0;
          var y = upward ? size - 1 - vert : vert;
          if (!this.isFunction[y][x] && i < data.length * 8) {
            this.modules[y][x] = ((data[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
            i++;
          }
        }
      }
    }
  };

  QrCode.prototype._applyMask = function (mask) {
    for (var y = 0; y < this.size; y++) {
      for (var x = 0; x < this.size; x++) {
        if (this.isFunction[y][x]) continue;
        var invert;
        switch (mask) {
          case 0: invert = (x + y) % 2 === 0; break;
          case 1: invert = y % 2 === 0; break;
          case 2: invert = x % 3 === 0; break;
          case 3: invert = (x + y) % 3 === 0; break;
          case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: invert = (x * y) % 2 + (x * y) % 3 === 0; break;
          case 6: invert = ((x * y) % 2 + (x * y) % 3) % 2 === 0; break;
          case 7: invert = ((x + y) % 2 + (x * y) % 3) % 2 === 0; break;
        }
        if (invert) this.modules[y][x] = !this.modules[y][x];
      }
    }
  };

  QrCode.prototype._penaltyScore = function () {
    var size = this.size, score = 0, self = this;
    // Rows + columns: runs of ≥5, plus finder-like patterns.
    for (var y = 0; y < size; y++) {
      var runColor = false, runX = 0;
      var hist = [0, 0, 0, 0, 0, 0, 0];
      for (var x = 0; x < size; x++) {
        if (this.modules[y][x] === runColor) {
          runX++;
          if (runX === 5) score += 3;
          else if (runX > 5) score++;
        } else { runColor = this.modules[y][x]; runX = 1; }
      }
      score += finderPenaltyRowCol(this.modules[y]) ;
    }
    for (var x = 0; x < size; x++) {
      var col = [];
      for (var y = 0; y < size; y++) col.push(this.modules[y][x]);
      var runColor = false, runY = 0;
      for (var y = 0; y < size; y++) {
        if (col[y] === runColor) { runY++; if (runY === 5) score += 3; else if (runY > 5) score++; }
        else { runColor = col[y]; runY = 1; }
      }
      score += finderPenaltyRowCol(col);
    }
    // 2×2 blocks of same colour.
    for (var y = 0; y < size - 1; y++) {
      for (var x = 0; x < size - 1; x++) {
        var c = this.modules[y][x];
        if (c === this.modules[y][x + 1] && c === this.modules[y + 1][x] && c === this.modules[y + 1][x + 1]) score += 3;
      }
    }
    // Proportion of dark modules.
    var dark = 0;
    for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) if (this.modules[y][x]) dark++;
    var total = size * size;
    var k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    score += k * 10;
    return score;

    // Finder-pattern-like 1:1:3:1:1 runs bordered by light (both directions).
    function finderPenaltyRowCol(line) {
      var pts = 0;
      for (var i = 0; i <= size - 7; i++) {
        if (
          line[i] && !line[i + 1] && line[i + 2] && line[i + 3] && line[i + 4] && !line[i + 5] && line[i + 6]
        ) {
          var before = (i - 4 < 0) || (!line[i - 1] && !line[i - 2] && !line[i - 3] && !line[i - 4]);
          var after = (i + 10 > size) || (!line[i + 7] && !line[i + 8] && !line[i + 9] && !line[i + 10]);
          if (before || after) pts += 40;
        }
      }
      return pts;
    }
  };

  // ── Public API ────────────────────────────────────────────────────────────
  function matrix(text, ecl) {
    var qr = buildQr(String(text == null ? '' : text), ecl || 'M');
    return { size: qr.size, get: function (x, y) { return qr.get(x, y); } };
  }

  function svg(text, opts) {
    opts = opts || {};
    var qr = buildQr(String(text == null ? '' : text), opts.ecl || 'M');
    var margin = opts.margin == null ? 4 : Math.max(0, opts.margin | 0);
    var dim = qr.size + margin * 2;
    var px = opts.size || 256;
    var dark = opts.dark || '#0A0F0D';
    var light = opts.light || '#ffffff';
    var round = !!opts.round;
    var parts = [];
    for (var y = 0; y < qr.size; y++) {
      for (var x = 0; x < qr.size; x++) {
        if (qr.get(x, y)) {
          var mx = x + margin, my = y + margin;
          if (round) parts.push('<rect x="' + (mx + 0.08).toFixed(2) + '" y="' + (my + 0.08).toFixed(2) + '" width="0.84" height="0.84" rx="0.32"/>');
          else parts.push('M' + mx + ',' + my + 'h1v1h-1z');
        }
      }
    }
    var body = round
      ? '<g fill="' + dark + '">' + parts.join('') + '</g>'
      : '<path fill="' + dark + '" d="' + parts.join('') + '"/>';
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + px + '" height="' + px + '" viewBox="0 0 ' + dim + ' ' + dim + '" shape-rendering="crispEdges" role="img" aria-label="QR code">' +
      '<rect width="' + dim + '" height="' + dim + '" fill="' + light + '"/>' + body + '</svg>';
  }

  window.KiwiQR = { svg: svg, matrix: matrix, _build: buildQr };
})();
