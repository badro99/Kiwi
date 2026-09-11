/* Kiwi — real, local image capture for operational proofs.
 *
 * The vertical caisses used to animate a shutter and then claim a photo had
 * been saved without ever asking the device for one.  This helper opens the
 * native camera/file picker, downsizes the chosen image before persistence,
 * and returns a small serialisable record suitable for the vertical state
 * document.  Nothing is uploaded merely by choosing a photo.
 */
(function imageProofModule(global) {
  'use strict';

  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '')); };
      reader.onerror = function () { reject(reader.error || new Error('Lecture de la photo impossible')); };
      reader.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('Photo illisible')); };
      img.src = src;
    });
  }

  async function compact(file, options) {
    var source = await readFile(file);
    var img = await loadImage(source);
    var max = Math.max(320, Number(options.maxDimension || 720));
    var scale = Math.min(1, max / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
    var width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
    var height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Compression de la photo indisponible');
    ctx.drawImage(img, 0, 0, width, height);
    return {
      dataUrl: canvas.toDataURL('image/jpeg', Number(options.quality || 0.68)),
      name: String(file.name || 'photo.jpg'),
      originalType: String(file.type || 'image/*'),
      width: width,
      height: height,
      capturedAt: new Date().toISOString()
    };
  }

  function pick(options) {
    options = options || {};
    return new Promise(function (resolve, reject) {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      /* Leave capture unset by default so mobile offers camera AND library.
         A caller may force a camera with { camera: 'environment' }. */
      if (options.camera) input.setAttribute('capture', options.camera === true ? 'environment' : options.camera);
      input.style.position = 'fixed';
      input.style.left = '-10000px';
      input.setAttribute('aria-hidden', 'true');
      document.body.appendChild(input);
      var done = false;
      function finish(value, err) {
        if (done) return;
        done = true;
        input.remove();
        if (err) reject(err); else resolve(value || null);
      }
      input.addEventListener('cancel', function () { finish(null); }, { once: true });
      input.addEventListener('change', function () {
        var file = input.files && input.files[0];
        if (!file) { finish(null); return; }
        compact(file, options).then(function (photo) { finish(photo); }, function (err) { finish(null, err); });
      }, { once: true });
      input.click();
    });
  }

  global.KiwiImageProof = { pick: pick, compact: compact };
})(window);
