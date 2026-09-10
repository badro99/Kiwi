(function () {
  'use strict';

  const API = '/api/tickets';
  const MAX_IMAGES = 6;
  const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
  const state = {
    tickets: [], files: [], followupFiles: [], followupTicketId: null,
    loading: true, saving: false, savingFollowup: false,
  };
  const $ = (id) => document.getElementById(id);
  const board = $('ticketBoard');
  const composer = $('composer');
  const form = $('ticketForm');
  const fileInput = $('ticketImages');
  const followupComposer = $('followupComposer');
  const followupForm = $('followupForm');
  const followupFileInput = $('followupImages');
  const lists = { problem: $('listProblem'), testing: $('listTesting'), done: $('listDone') };
  let toastTimer = 0;
  let previewUrls = [];
  let followupPreviewUrls = [];

  const icons = {
    clock: '<img class="material-icon" src="assets/icons/material/schedule.svg" alt="" aria-hidden="true" />',
    photo: '<img class="material-icon" src="assets/icons/material/photo_frame.svg" alt="" aria-hidden="true" />',
  };

  function showToast(message, isError) {
    const toast = $('toast');
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.toggle('is-error', Boolean(isError));
    toast.classList.add('is-visible');
    toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2600);
  }

  function make(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function formatTime(timestamp) {
    const date = new Date(timestamp);
    const today = new Date();
    const sameDay = date.toDateString() === today.toDateString();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(date);
    if (sameDay) return 'Today, ' + time;
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday, ' + time;
    return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' }).format(date);
  }

  function daysRemaining(timestamp) {
    return Math.max(0, Math.ceil((timestamp - Date.now()) / 86400000));
  }

  function actionButton(ticket) {
    if (ticket.status === 'done') return null;
    const button = make('button', 'move-button' + (ticket.status === 'testing' ? ' move-testing' : ''));
    button.type = 'button';
    button.dataset.action = ticket.status === 'problem' ? 'fixed' : 'tested';
    button.dataset.id = String(ticket.id);
    const label = ticket.status === 'problem' ? 'Fixed' : 'Tested';
    button.setAttribute('aria-label', `${label}, move ticket ${ticket.number}`);
    button.append(document.createTextNode(label));
    return button;
  }

  function actionArea(ticket) {
    if (ticket.status === 'done') return null;
    const actions = make('div', 'ticket-actions' + (ticket.status === 'testing' ? ' has-failed-action' : ''));
    if (ticket.status === 'testing') {
      const failed = make('button', 'failed-test-button', 'Test failed');
      failed.type = 'button';
      failed.dataset.action = 'test-failed';
      failed.dataset.id = String(ticket.id);
      failed.setAttribute('aria-label', `Test failed, add notes to ticket ${ticket.number}`);
      actions.append(failed);
    }
    actions.append(actionButton(ticket));
    return actions;
  }

  function copyButton(kind, ticket, image) {
    const button = make('button', 'copy-button');
    button.type = 'button';
    button.dataset.action = kind === 'text' ? 'copy-text' : 'copy-image';
    button.dataset.id = String(ticket.id);
    if (image) button.dataset.url = image.url;
    button.append(document.createTextNode(kind === 'text' ? 'Copy text' : 'Copy image'));
    button.setAttribute('aria-label', `${kind === 'text' ? 'Copy text from' : 'Copy image from'} ticket ${ticket.number}`);
    return button;
  }

  function imageGallery(ticket, images, labelPrefix) {
    if (!images || !images.length) return null;
    const gallery = make('div', 'ticket-gallery');
    gallery.classList.toggle('is-single', images.length === 1);
    images.forEach((image, index) => {
      const figure = make('figure', 'ticket-photo');
      const img = document.createElement('img');
      img.src = image.url;
      img.alt = `${ticket.number} ${labelPrefix || 'attachment'} ${index + 1}`;
      img.loading = 'lazy';
      img.decoding = 'async';
      figure.append(img, copyButton('image', ticket, image));
      gallery.append(figure);
    });
    return gallery;
  }

  function followupHistory(ticket) {
    if (!ticket.followups || !ticket.followups.length) return null;
    const history = make('div', 'ticket-followups');
    ticket.followups.forEach((followup, index) => {
      const item = make('section', 'ticket-followup');
      const head = make('div', 'ticket-followup-head');
      head.append(make('strong', '', `Test failed${ticket.followups.length > 1 ? ` · ${index + 1}` : ''}`));
      head.append(make('span', '', formatTime(followup.createdAt)));
      item.append(head, make('p', '', followup.body));
      const gallery = imageGallery(ticket, followup.images, 'failed test attachment');
      if (gallery) item.append(gallery);
      history.append(item);
    });
    return history;
  }

  function ticketCard(ticket) {
    const card = make('article', 'ticket-card' + (ticket.status === 'done' ? ' ticket-done' : ''));
    card.dataset.ticketId = String(ticket.id);
    const meta = make('div', 'ticket-meta');
    meta.append(make('span', 'ticket-number', ticket.number));
    meta.append(make('span', '', formatTime(ticket.createdAt)));
    card.append(meta);

    if (ticket.status === 'done') {
      card.append(make('p', '', ticket.body));
      const history = followupHistory(ticket);
      if (history) card.append(history);
      const expiry = make('div', 'expiry');
      expiry.insertAdjacentHTML('afterbegin', icons.clock);
      const days = daysRemaining(ticket.expiresAt);
      expiry.append(document.createTextNode(days === 0 ? 'Deletes today' : `Deletes in ${days} day${days === 1 ? '' : 's'}`));
      card.append(expiry);
      return card;
    }

    const copyRow = make('div', 'copy-row');
    copyRow.append(make('p', '', ticket.body));
    copyRow.append(copyButton('text', ticket));
    card.append(copyRow);

    const gallery = imageGallery(ticket, ticket.images, 'attachment');
    if (gallery) card.append(gallery);
    const history = followupHistory(ticket);
    if (history) card.append(history);
    card.append(actionArea(ticket));
    return card;
  }

  function emptyState(status) {
    const empty = make('div', 'empty-state');
    empty.insertAdjacentHTML('afterbegin', status === 'done' ? icons.clock : icons.photo);
    const messages = {
      problem: ['No open problems', 'New reports will appear here.'],
      testing: ['Nothing to test', 'Fixed problems move here first.'],
      done: ['Nothing completed yet', 'Tested tickets stay here for 20 days.'],
    };
    empty.append(make('strong', '', messages[status][0]), make('span', '', messages[status][1]));
    return empty;
  }

  function render() {
    ['problem', 'testing', 'done'].forEach((status) => {
      const tickets = state.tickets.filter((ticket) => ticket.status === status);
      lists[status].replaceChildren();
      if (!tickets.length) lists[status].append(emptyState(status));
      else tickets.forEach((ticket) => lists[status].append(ticketCard(ticket)));
      const suffix = status === 'problem' ? 'Problem' : status === 'testing' ? 'Testing' : 'Done';
      $('count' + suffix).textContent = String(tickets.length);
      $('tabCount' + suffix).textContent = String(tickets.length);
    });
  }

  function renderLoading() {
    Object.values(lists).forEach((list) => {
      const loading = make('div', 'loading-card');
      loading.innerHTML = '<span></span><span></span><span></span>';
      list.replaceChildren(loading);
    });
  }

  function friendlyError(code) {
    const errors = {
      'schema-not-ready': 'The ticket database is being prepared. Try again shortly.',
      'no-media': 'Image storage is not available right now.',
      'text-required': 'Write a short description before publishing.',
      'note-required': 'Add a short note about what still fails.',
      'text-too-long': 'The description is too long.',
      'too-many-images': 'You can attach up to 6 images.',
      'image-too-large': 'One image is larger than 10 MB.',
      'images-too-large': 'The selected images are too large together.',
      'bad-image-type': 'Use JPEG, PNG, WebP, or GIF images.',
      'wrong-status': 'That ticket was already moved on another device.',
      'changed-elsewhere': 'That ticket changed on another device. The board has been refreshed.',
      'not-found': 'That ticket no longer exists. The board has been refreshed.',
    };
    return errors[code] || 'Something went wrong. Please try again.';
  }

  async function loadTickets(options) {
    if (!options || !options.quiet) renderLoading();
    try {
      const response = await fetch(API, { headers: { Accept: 'application/json' }, cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error(data.error || 'read-failed'), { code: data.error });
      state.tickets = Array.isArray(data.tickets) ? data.tickets : [];
      state.loading = false;
      render();
    } catch (error) {
      state.loading = false;
      if (options && options.quiet) return;
      Object.values(lists).forEach((list) => {
        const failed = make('div', 'error-state');
        failed.append(make('strong', '', 'Could not load tickets'), make('span', '', friendlyError(error.code)));
        const retry = make('button', '', 'Try again');
        retry.type = 'button';
        retry.addEventListener('click', () => loadTickets());
        failed.append(retry);
        list.replaceChildren(failed);
      });
    }
  }

  function openComposer() {
    $('formError').textContent = '';
    composer.showModal();
    window.setTimeout(() => $('ticketBody').focus(), 80);
  }

  function resetComposer() {
    form.reset();
    state.files = [];
    previewUrls.forEach((url) => URL.revokeObjectURL(url));
    previewUrls = [];
    $('selectedImages').replaceChildren();
    $('imageCounter').textContent = '0 / 6';
    $('formError').textContent = '';
  }

  function closeComposer() {
    if (state.saving) return;
    composer.close();
    resetComposer();
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
      img.alt = file.name || `Selected image ${index + 1}`;
      const remove = make('button');
      remove.type = 'button';
      remove.dataset.removeFile = String(index);
      remove.setAttribute('aria-label', `Remove ${file.name || 'image'}`);
      remove.textContent = '×';
      item.append(img, remove);
      container.append(item);
    });
    $('imageCounter').textContent = `${state.files.length} / ${MAX_IMAGES}`;
  }

  function addFiles(fileList) {
    const incoming = Array.from(fileList || []);
    const accepted = [];
    let error = '';
    for (const file of incoming) {
      if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
        error = 'Use JPEG, PNG, WebP, or GIF images.';
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        error = `${file.name || 'An image'} is larger than 10 MB.`;
        continue;
      }
      if (!state.files.some((current) => fileKey(current) === fileKey(file))) accepted.push(file);
    }
    const before = state.files.length;
    state.files = state.files.concat(accepted).slice(0, MAX_IMAGES);
    if (incoming.length + before > MAX_IMAGES) error = 'You can attach up to 6 images.';
    $('formError').textContent = error;
    fileInput.value = '';
    renderSelectedImages();
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
      img.alt = file.name || `Selected follow-up image ${index + 1}`;
      const remove = make('button');
      remove.type = 'button';
      remove.dataset.removeFollowupFile = String(index);
      remove.setAttribute('aria-label', `Remove ${file.name || 'image'}`);
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
        error = 'Use JPEG, PNG, WebP, or GIF images.';
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        error = `${file.name || 'An image'} is larger than 10 MB.`;
        continue;
      }
      if (!state.followupFiles.some((current) => fileKey(current) === fileKey(file))) accepted.push(file);
    }
    const before = state.followupFiles.length;
    state.followupFiles = state.followupFiles.concat(accepted).slice(0, MAX_IMAGES);
    if (incoming.length + before > MAX_IMAGES) error = 'You can attach up to 6 images.';
    $('followupError').textContent = error;
    followupFileInput.value = '';
    renderFollowupImages();
  }

  async function publish(event) {
    event.preventDefault();
    if (state.saving) return;
    const text = $('ticketBody').value.trim();
    if (!text) {
      $('formError').textContent = 'Write a short description before publishing.';
      $('ticketBody').focus();
      return;
    }
    state.saving = true;
    const button = $('publishTicket');
    const oldLabel = button.textContent;
    button.disabled = true;
    button.textContent = state.files.length ? 'Uploading…' : 'Publishing…';
    $('formError').textContent = '';
    const data = new FormData();
    data.append('body', text);
    state.files.forEach((file) => data.append('images', file, file.name));
    try {
      const response = await fetch(API, { method: 'POST', body: data });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error(result.error || 'publish-failed'), { code: result.error });
      composer.close();
      resetComposer();
      showToast(`${result.number} published`);
      await loadTickets({ quiet: true });
      activateTab('problem');
    } catch (error) {
      $('formError').textContent = friendlyError(error.code);
    } finally {
      state.saving = false;
      button.disabled = false;
      button.textContent = oldLabel;
    }
  }

  async function publishFollowup(event) {
    event.preventDefault();
    if (state.savingFollowup) return;
    const ticket = state.tickets.find((item) => item.id === state.followupTicketId);
    if (!ticket) {
      closeFollowup();
      await loadTickets({ quiet: true });
      return;
    }
    const note = $('followupBody').value.trim();
    if (!note) {
      $('followupError').textContent = 'Add a short note about what still fails.';
      $('followupBody').focus();
      return;
    }
    state.savingFollowup = true;
    const button = $('publishFollowup');
    const oldLabel = button.textContent;
    button.disabled = true;
    button.textContent = state.followupFiles.length ? 'Uploading…' : 'Saving…';
    $('followupError').textContent = '';
    const data = new FormData();
    data.append('action', 'failed');
    data.append('note', note);
    state.followupFiles.forEach((file) => data.append('images', file, file.name));
    try {
      const response = await fetch(`${API}/${ticket.id}`, {
        method: 'PATCH',
        headers: { Accept: 'application/json' },
        body: data,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error(result.error || 'update-failed'), { code: result.error });
      followupComposer.close();
      resetFollowup();
      showToast(`${ticket.number} sent back as still broken`);
      await loadTickets({ quiet: true });
      activateTab('problem');
    } catch (error) {
      $('followupError').textContent = friendlyError(error.code);
      if (error.code === 'wrong-status' || error.code === 'changed-elsewhere' || error.code === 'not-found') {
        await loadTickets({ quiet: true });
      }
    } finally {
      state.savingFollowup = false;
      button.disabled = false;
      button.textContent = oldLabel;
    }
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
      showToast(`${ticket.number} text copied`);
    } catch (_) {
      showToast('Could not copy the text', true);
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
    button.textContent = 'Copying…';
    try {
      if (!navigator.clipboard || !navigator.clipboard.write || !window.ClipboardItem || !window.isSecureContext) throw new Error('clipboard-unavailable');
      const png = fetch(url, { cache: 'no-store' }).then((response) => {
        if (!response.ok) throw new Error('image-unavailable');
        return response.blob();
      }).then(blobToPng);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
      showToast(`${ticket.number} image copied`);
    } catch (_) {
      showImageCopyFallback(url);
    } finally {
      button.disabled = false;
      button.innerHTML = original;
    }
  }

  async function moveTicket(ticket, action, button) {
    button.disabled = true;
    const original = button.innerHTML;
    button.textContent = action === 'fixed' ? 'Moving…' : 'Deleting images…';
    try {
      const response = await fetch(`${API}/${ticket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ action }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error(result.error || 'update-failed'), { code: result.error });
      showToast(action === 'fixed' ? `${ticket.number} ready to test` : `${ticket.number} completed — images deleted`);
      await loadTickets({ quiet: true });
    } catch (error) {
      showToast(friendlyError(error.code), true);
      await loadTickets({ quiet: true });
    } finally {
      if (button.isConnected) {
        button.disabled = false;
        button.innerHTML = original;
      }
    }
  }

  function activateTab(status) {
    board.dataset.mobileStatus = status;
    document.querySelectorAll('.mobile-tab').forEach((item) => {
      const active = item.dataset.status === status;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-pressed', String(active));
    });
  }

  $('openComposer').addEventListener('click', openComposer);
  $('closeComposer').addEventListener('click', closeComposer);
  $('cancelComposer').addEventListener('click', closeComposer);
  form.addEventListener('submit', publish);
  fileInput.addEventListener('change', () => addFiles(fileInput.files));
  $('selectedImages').addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-file]');
    if (!button) return;
    state.files.splice(Number(button.dataset.removeFile), 1);
    renderSelectedImages();
  });
  $('closeFollowup').addEventListener('click', closeFollowup);
  $('cancelFollowup').addEventListener('click', closeFollowup);
  followupForm.addEventListener('submit', publishFollowup);
  followupFileInput.addEventListener('change', () => addFollowupFiles(followupFileInput.files));
  $('followupSelectedImages').addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-followup-file]');
    if (!button) return;
    state.followupFiles.splice(Number(button.dataset.removeFollowupFile), 1);
    renderFollowupImages();
  });
  $('mobileTabs').addEventListener('click', (event) => {
    const tab = event.target.closest('[data-status]');
    if (tab) activateTab(tab.dataset.status);
  });
  board.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const ticket = state.tickets.find((item) => item.id === Number(button.dataset.id));
    if (!ticket) return;
    if (button.dataset.action === 'copy-text') copyText(ticket);
    else if (button.dataset.action === 'copy-image') copyImage(button.dataset.url, ticket, button);
    else if (button.dataset.action === 'test-failed') openFollowup(ticket);
    else moveTicket(ticket, button.dataset.action, button);
  });
  composer.addEventListener('click', (event) => { if (event.target === composer) closeComposer(); });
  followupComposer.addEventListener('click', (event) => { if (event.target === followupComposer) closeFollowup(); });
  $('closeImageFallback').addEventListener('click', () => $('imageCopyFallback').close());
  $('imageCopyFallback').addEventListener('click', (event) => { if (event.target === $('imageCopyFallback')) $('imageCopyFallback').close(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadTickets({ quiet: true }); });
  window.setInterval(() => { if (!document.hidden) loadTickets({ quiet: true }); }, 30000);
  loadTickets();
})();
