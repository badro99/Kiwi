/* Shared image preparation and bounded AI import transport. */
(function () {
  'use strict';
  const MAX_IMG_EDGE = 1600;
  function downscaleImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(1, MAX_IMG_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
          const w = Math.max(1, Math.round(img.naturalWidth * scale));
          const h = Math.max(1, Math.round(img.naturalHeight * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          URL.revokeObjectURL(url);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        } catch (e) { URL.revokeObjectURL(url); reject(e); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
      img.src = url;
    });
  }

  async function callApi(endpoint, payload, signal) {
    const controller = new AbortController();
    let timer, cancel;
    const stopped = new Promise((_, reject) => {
      cancel = () => { controller.abort(); reject(new Error('cancelled')); };
      if (signal) signal.addEventListener('abort', cancel, { once: true });
      timer = setTimeout(() => { controller.abort(); reject(new Error('timeout')); }, 45000);
    });
    try {
      if (signal && signal.aborted) { cancel(); return await stopped; }
      return await Promise.race([stopped, (async () => {
        const venue = (window.Kiwi && Kiwi.venue && Kiwi.venue()) || '';
        const res = await fetch(endpoint, {
          method: 'POST', signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(Object.assign({ merchant: venue }, payload)),
        });
        let data = null;
        try { data = await res.json(); } catch (_) {}
        if (res.status === 401) throw new Error('auth');
        if (res.status === 429) throw new Error('quota');
        if (!res.ok) throw new Error('server');
        if (!data || !data.ok) throw new Error((data && (data.reason || data.error)) || 'unparsed');
        return data;
      })()]);
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', cancel);
    }
  }

  function busyHtml(prefix, title, sub) {
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    return '<div class="' + prefix + '-busy"><div class="sp"></div><b>' + esc(title) + '</b><span>' + esc(sub) + '</span></div>';
  }
  window.KiwiAiImageImport = Object.freeze({ downscaleImage, callApi, busyHtml });
})();
