/* Tickets thread. Exports: followupHistory, openFollowup, resetFollowup, closeFollowup, renderFollowupImages, addFollowupFiles.
 * Reads injected: $, MAX_IMAGES, MAX_IMAGE_BYTES, fileKey, followupComposer, followupFileInput, followupForm, formatTime, imageGallery, make, state, t. Browser APIs are declared in split.json.
 * Mutable shared fields belong to the data owner; other modules receive its view. */
export function createThread({ $, MAX_IMAGES, MAX_IMAGE_BYTES, fileKey, followupComposer, followupFileInput, followupForm, formatTime, imageGallery, make, state, t }) {
  let followupPreviewUrls = [];
  function followupHistory(ticket) {
    if (!ticket.followups || !ticket.followups.length) return null;
    const history = make('div', 'ticket-followups');
    ticket.followups.forEach((followup, index) => {
      const item = make('section', 'ticket-followup');
      const head = make('div', 'ticket-followup-head');
      head.append(make('strong', '', `${t('action.failed')}${ticket.followups.length > 1 ? ` · ${index + 1}` : ''}`));
      head.append(make('span', '', formatTime(followup.createdAt)));
      item.append(head, make('p', '', followup.body));
      const gallery = imageGallery(ticket, followup.images, 'image.followupAlt');
      if (gallery) item.append(gallery);
      history.append(item);
    });
    return history;
  }

  function openFollowup(ticket) {
    state.followupTicketId = ticket.id;
    $('followupTicketNumber').textContent = ticket.number;
    $('followupError').textContent = '';
    followupComposer.showModal();
    window.setTimeout(() => $('followupBody').focus(), 80);
  }

  function resetFollowup() {
    followupForm.reset();
    state.followupFiles = [];
    state.followupTicketId = null;
    followupPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
    followupPreviewUrls = [];
    $('followupSelectedImages').replaceChildren();
    $('followupImageCounter').textContent = '0 / 6';
    $('followupError').textContent = '';
  }

  function closeFollowup() {
    if (state.savingFollowup) return;
    followupComposer.close();
    resetFollowup();
  }

  function renderFollowupImages() {
    followupPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
    followupPreviewUrls = [];
    const container = $('followupSelectedImages');
    container.replaceChildren();
    state.followupFiles.forEach((file, index) => {
      const item = make('div', 'selected-image');
      const img = document.createElement('img');
      const url = URL.createObjectURL(file);
      followupPreviewUrls.push(url);
      img.src = url;
      img.alt = file.name || t('file.followupAlt', { index: index + 1 });
      const remove = make('button');
      remove.type = 'button';
      remove.dataset.removeFollowupFile = String(index);
      remove.setAttribute('aria-label', t('file.remove', { name: file.name || t('file.image') }));
      remove.textContent = '×';
      item.append(img, remove);
      container.append(item);
    });
    $('followupImageCounter').textContent = `${state.followupFiles.length} / ${MAX_IMAGES}`;
  }

  function addFollowupFiles(fileList) {
    const incoming = Array.from(fileList || []);
    const accepted = [];
    let error = '';
    for (const file of incoming) {
      if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
        error = t('error.bad-image-type');
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        error = file.name ? t('file.tooLarge', { name: file.name }) : t('error.image-too-large');
        continue;
      }
      if (!state.followupFiles.concat(accepted).some((current) => fileKey(current) === fileKey(file))) accepted.push(file);
    }
    const before = state.followupFiles.length;
    state.followupFiles = state.followupFiles.concat(accepted).slice(0, MAX_IMAGES);
    if (accepted.length + before > MAX_IMAGES) error = t('error.too-many-images');
    $('followupError').textContent = error;
    followupFileInput.value = '';
    renderFollowupImages();
  }

  return Object.freeze({ followupHistory, openFollowup, resetFollowup, closeFollowup, renderFollowupImages, addFollowupFiles });
}
