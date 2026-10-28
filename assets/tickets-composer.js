/* Tickets composer. Exports: syncComposerSubkinds, configureComposerClassification, openComposer, resetComposer, closeComposer, fileKey, renderSelectedImages, addFiles, fallbackCopyText, copyText, blobToPng, showImageCopyFallback, copyImage.
 * Reads injected: $, MAX_IMAGES, MAX_IMAGE_BYTES, composer, draft, draftController, fileInput, form, make, replaceSelectOptions, showToast, state, subkindsFor, t. Browser APIs are declared in split.json.
 * Mutable shared fields belong to the data owner; other modules receive its view. */
export function createComposer({ $, MAX_IMAGES, MAX_IMAGE_BYTES, composer, draft, draftController, fileInput, form, make, replaceSelectOptions, showToast, state, subkindsFor, t }) {
  let previewUrls = [];
  function syncComposerSubkinds(selected) {
    const kind = $('ticketKind').value || 'unsorted';
    const items = subkindsFor(kind);
    replaceSelectOptions($('ticketSubkind'), items, t('subkind.none'), selected || '');
    $('ticketSubkindField').hidden = items.length === 0;
  }

  function configureComposerClassification() {
    replaceSelectOptions($('ticketKind'), state.taxonomy.kinds, null, 'unsorted');
    replaceSelectOptions($('ticketArea'), state.taxonomy.areas, t('area.none'), '');
    syncComposerSubkinds('');
  }

  async function openComposer() {
    if (state.loading) return;
    $('formError').textContent = t((await draftController).available ? 'draft.policy' : 'draft.failed');
    composer.showModal();
    window.setTimeout(() => $('ticketBody').focus(), 80);
  }

  function resetComposer() {
    form.reset();
    $('ticketKind').value = 'unsorted';
    $('ticketArea').value = '';
    $('ticketMoneyRisk').checked = false;
    syncComposerSubkinds('');
    state.files = [];
    previewUrls.forEach((url) => URL.revokeObjectURL(url));
    previewUrls = [];
    $('selectedImages').replaceChildren();
    $('imageCounter').textContent = '0 / 6';
    $('formError').textContent = '';
  }

  function closeComposer() {
    if (state.saving) return;
    draft.save();
    composer.close();
  }

  function fileKey(file) {
    return [file.name, file.size, file.lastModified].join(':');
  }

  function renderSelectedImages() {
    previewUrls.forEach((url) => URL.revokeObjectURL(url));
    previewUrls = [];
    const container = $('selectedImages');
    container.replaceChildren();
    state.files.forEach((file, index) => {
      const item = make('div', 'selected-image');
      const img = document.createElement('img');
      const url = URL.createObjectURL(file);
      previewUrls.push(url);
      img.src = url;
      img.alt = file.name || t('file.selectedAlt', { index: index + 1 });
      const remove = make('button');
      remove.type = 'button';
      remove.dataset.removeFile = String(index);
      remove.setAttribute('aria-label', t('file.remove', { name: file.name || t('file.image') }));
      remove.textContent = '×';
      item.append(img, remove);
      container.append(item);
    });
    $('imageCounter').textContent = `${state.files.length} / ${MAX_IMAGES}`;
  }

  function addFiles(fileList) {
    const incoming = Array.from(fileList || []);
    const accepted = [];
    const errors = [];
    for (const file of incoming) {
      if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
        errors.push(t('error.bad-image-type'));
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        errors.push(file.name ? t('file.tooLarge', { name: file.name }) : t('error.image-too-large'));
        continue;
      }
      if (!state.files.concat(accepted).some((current) => fileKey(current) === fileKey(file))) accepted.push(file);
    }
    const before = state.files.length;
    state.files = state.files.concat(accepted).slice(0, MAX_IMAGES);
    if (accepted.length + before > MAX_IMAGES) errors.push(t('error.too-many-images'));
    $('formError').textContent = errors.filter((message, index) => errors.indexOf(message) === index).join(' · ');
    fileInput.value = '';
    renderSelectedImages();
    draft.save();
  }

  function fallbackCopyText(text) {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    area.setSelectionRange(0, area.value.length);
    const copied = document.execCommand('copy');
    area.remove();
    return copied;
  }

  async function copyText(ticket) {
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(ticket.body);
      else if (!fallbackCopyText(ticket.body)) throw new Error('copy-blocked');
      showToast(t('toast.textCopied', { number: ticket.number }));
    } catch (_) {
      showToast(t('toast.copyFailed'), true);
    }
  }

  function blobToPng(blob) {
    if (blob.type === 'image/png') return Promise.resolve(blob);
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const context = canvas.getContext('2d');
        context.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        canvas.toBlob((png) => png ? resolve(png) : reject(new Error('conversion-failed')), 'image/png');
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode-failed')); };
      img.src = url;
    });
  }

  function showImageCopyFallback(url) {
    $('copyFallbackImage').src = url;
    $('imageCopyFallback').showModal();
  }

  async function copyImage(url, ticket, button) {
    const original = button.innerHTML;
    button.disabled = true;
    button.textContent = t('busy.copying');
    try {
      if (!navigator.clipboard || !navigator.clipboard.write || !window.ClipboardItem || !window.isSecureContext) throw new Error('clipboard-unavailable');
      const png = fetch(url, { cache: 'no-store' }).then((response) => {
        if (!response.ok) throw new Error('image-unavailable');
        return response.blob();
      }).then(blobToPng);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
      showToast(t('toast.imageCopied', { number: ticket.number }));
    } catch (_) {
      showImageCopyFallback(url);
    } finally {
      button.disabled = false;
      button.innerHTML = original;
    }
  }

  return Object.freeze({ syncComposerSubkinds, configureComposerClassification, openComposer, resetComposer, closeComposer, fileKey, renderSelectedImages, addFiles, fallbackCopyText, copyText, blobToPng, showImageCopyFallback, copyImage });
}
