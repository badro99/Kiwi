/* Tickets data. Exports: loadTickets, newIdempotencyKey, publish, publishFollowup, moveTicket, saveClassification.
 * Reads injected: $, API, activateTab, closeFollowup, composer, configureComposerClassification, draft, draftController, followupComposer, friendlyError, lists, make, render, renderLoading, resetComposer, resetFollowup, showToast, state, t. Browser APIs are declared in split.json.
 * Mutable shared fields belong to the data owner; other modules receive its view. */
export function createData({ $, API, activateTab, closeFollowup, composer, configureComposerClassification, draft, draftController, followupComposer, friendlyError, lists, make, render, renderLoading, resetComposer, resetFollowup, showToast, state, t }) {
  async function request(url, options, timeout, fallback = 'update-failed') {
    try {
      const { deadlineFetch } = await import('./request-deadline.mjs');
      /* Once a write has left the page, a lost connection or a deadline says nothing
         about what the server did: it is an uncertain write, like an unreadable body. */
      const response = await deadlineFetch(url, options, timeout).catch(error => {
        if (options?.method) throw Object.assign(error, { code: 'uncertain-write', uncertain: true });
        throw error;
      });
      const result = await response.json().catch(error => {
        throw Object.assign(error, { code: options?.method ? 'uncertain-write' : error.code || 'read-failed', uncertain: !!options?.method });
      });
      if (!result || typeof result !== 'object' || Array.isArray(result)) throw Object.assign(new Error('invalid-response'), { code: options?.method ? 'uncertain-write' : 'read-failed' });
      if (!response.ok) throw Object.assign(new Error(result.error || fallback), { code: result.error });
      return result;
    } catch (error) {
      error.translatedMessage = friendlyError(error.code);
      throw error;
    }
  }

  async function loadTickets(options) { const seq = loadTickets.seq = (loadTickets.seq || 0) + 1;
    if (!options || !options.quiet) renderLoading();
    try {
      const result = await request(API, { headers: { Accept: 'application/json' }, cache: 'no-store' }, undefined, 'read-failed');
      const data = result; if (seq !== loadTickets.seq) return;
      let cursor = data.nextCursor;
      while (cursor) {
        const page = await request(API + '?cursor=' + encodeURIComponent(cursor), { headers: { Accept: 'application/json' }, cache: 'no-store' }, undefined, 'read-failed');
        if (seq !== loadTickets.seq) return;
        data.tickets.push(...page.tickets);
        cursor = page.nextCursor;
      }
      data.tickets?.sort((a, b) => Number(b.moneyAtRisk) - Number(a.moneyAtRisk) || b.id - a.id);
      if (!data.taxonomy || !Array.isArray(data.taxonomy.kinds) || !Array.isArray(data.taxonomy.areas)) {
        throw Object.assign(new Error('taxonomy-missing'), { code: 'taxonomy-missing' });
      }
      const taxonomyChanged = !state.taxonomy || state.taxonomy.version !== data.taxonomy.version;
      state.taxonomy = data.taxonomy;
      if (state.filters.kind && !state.taxonomy.kinds.some((item) => item.id === state.filters.kind)) state.filters.kind = '';
      if (state.filters.area && !state.taxonomy.areas.some((item) => item.id === state.filters.area)) state.filters.area = '';
      state.tickets = Array.isArray(data.tickets) ? data.tickets.map((ticket) => ({
        ...ticket,
        kind: ticket.kind || 'unsorted',
        area: ticket.area || null,
        subkind: ticket.subkind || null,
        moneyAtRisk: Boolean(ticket.moneyAtRisk),
      })) : [];
      if (taxonomyChanged) configureComposerClassification();
      if (data.draftScope) await draft.restore(data.draftScope);
      if (seq !== loadTickets.seq) return;
      state.loading = false; state.stale = false;
      render();
    } catch (error) {
      if (seq !== loadTickets.seq) return; state.loading = false;
      if (options && options.quiet) { state.stale = true; Object.values(lists).forEach(list => { list.querySelector('[data-tickets-stale]')?.remove(); const note = make('div', 'error-state', t('load.failed')); note.dataset.ticketsStale = ''; note.setAttribute('role', 'status'); list.prepend(note); }); showToast(t('load.failed') + ': ' + (error.translatedMessage || friendlyError(error.code)), true); return; }
      Object.values(lists).forEach((list) => {
        const failed = make('div', 'error-state');
        failed.append(make('strong', '', t('load.failed')), make('span', '', error.translatedMessage || friendlyError(error.code)));
        const retry = make('button', '', t('common.retry'));
        retry.type = 'button';
        retry.addEventListener('click', () => loadTickets());
        failed.append(retry);
        list.replaceChildren(failed);
      });
    }
  }

  function newIdempotencyKey() {
    try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (_) {}
    return 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  }

  async function publish(event) {
    /* Identity of an image is its bytes: a different picture with the same name and
       size must not inherit the idempotency key of an earlier, uncertain attempt. */
    async function fileDigest(file) {
      try {
        const digest = await globalThis.crypto.subtle.digest('SHA-256', await file.arrayBuffer());
        return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
      } catch (_) { return file.name + ':' + file.size + ':' + (file.lastModified || 0); }
    }
    event.preventDefault();
    if (state.saving) return;
    const text = $('ticketBody').value.trim();
    if (!text) {
      $('formError').textContent = t('error.text-required');
      $('ticketBody').focus();
      return;
    }
    state.saving = true;
    const sendingDraft = (await draftController).store;
    const button = $('publishTicket');
    const oldLabel = button.textContent;
    button.disabled = true;
    button.textContent = t(state.files.length ? 'busy.uploading' : 'busy.publishing');
    $('formError').textContent = '';
    const data = new FormData();
    data.append('body', text);
    data.append('kind', $('ticketKind').value || 'unsorted');
    if ($('ticketArea').value) data.append('area', $('ticketArea').value);
    if (!$('ticketSubkindField').hidden && $('ticketSubkind').value) data.append('subkind', $('ticketSubkind').value);
    data.append('money_at_risk', $('ticketMoneyRisk').checked ? '1' : '0');
    state.files.forEach((file) => data.append('images', file, file.name));
    /* Une clé par envoi : le même contenu renvoyé après une réponse perdue
       retrouve le premier ticket au lieu d'en créer un second. Un contenu
       modifié reçoit une clé neuve. */
    const digests = await Promise.all(state.files.map(fileDigest));
    const fingerprint = [text, $('ticketKind').value, $('ticketArea').value, $('ticketSubkind').value,
      $('ticketMoneyRisk').checked, ...state.files.map((file, index) => file.name + ':' + file.size + ':' + digests[index])].join('\u0001');
    if (!state.publishAttempt || state.publishAttempt.fingerprint !== fingerprint) {
      state.publishAttempt = { fingerprint, key: newIdempotencyKey() };
    }
    data.append('idempotency_key', state.publishAttempt.key);
    await draft.save();
    try {
      const result = await request(API, { method: 'POST', body: data }, 60000, 'publish-failed');
      if (sendingDraft) await sendingDraft.clear();
      composer.close();
      resetComposer();
      state.publishAttempt = null;
      showToast(t(result.classificationStored === false ? 'toast.publishedPending' : 'toast.published', { number: result.number }));
      await loadTickets({ quiet: true });
      activateTab('problem');
    } catch (error) {
      $('formError').textContent = error.translatedMessage || friendlyError(error.code);
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
      $('followupError').textContent = t('error.note-required');
      $('followupBody').focus();
      return;
    }
    state.savingFollowup = true;
    const button = $('publishFollowup');
    const oldLabel = button.textContent;
    button.disabled = true;
    button.textContent = t(state.followupFiles.length ? 'busy.uploading' : 'busy.saving');
    $('followupError').textContent = '';
    const data = new FormData();
    data.append('action', 'failed');
    data.append('note', note);
    state.followupFiles.forEach((file) => data.append('images', file, file.name));
    try {
      const result = await request(`${API}/${ticket.id}`, {
        method: 'PATCH',
        headers: { Accept: 'application/json' },
        body: data,
      }, 60000);
      followupComposer.close();
      resetFollowup();
      showToast(t('toast.sentBack', { number: ticket.number }));
      await loadTickets({ quiet: true });
      activateTab('problem');
    } catch (error) {
      $('followupError').textContent = error.translatedMessage || friendlyError(error.code);
      if (error.code === 'wrong-status' || error.code === 'changed-elsewhere' || error.code === 'not-found') {
        await loadTickets({ quiet: true });
      }
    } finally {
      state.savingFollowup = false;
      button.disabled = false;
      button.textContent = oldLabel;
    }
  }

  async function moveTicket(ticket, action, button) {
    button.disabled = true;
    const original = button.innerHTML;
    button.textContent = t(action === 'fixed' ? 'busy.moving' : 'busy.deletingImages');
    try {
      const result = await request(`${API}/${ticket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ action }),
      });
      showToast(t(action === 'fixed' ? 'toast.readyToTest' : 'toast.completed', { number: ticket.number }));
      await loadTickets({ quiet: true });
    } catch (error) {
      showToast(error.translatedMessage || friendlyError(error.code), true);
      await loadTickets({ quiet: true });
    } finally {
      if (button.isConnected) {
        button.disabled = false;
        button.innerHTML = original;
      }
    }
  }

  async function saveClassification(event) {
    event.preventDefault();
    if (state.savingClassification) return;
    const editor = event.target.closest('[data-classification-form]');
    if (!editor) return;
    const ticket = state.tickets.find((item) => item.id === Number(editor.dataset.classificationForm));
    if (!ticket) return;
    const data = new FormData(editor);
    const button = editor.querySelector('.classification-save');
    state.savingClassification = true;
    button.disabled = true;
    const oldLabel = button.textContent;
    button.textContent = t('busy.saving');
    try {
      const result = await request(`${API}/${ticket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          action: 'classify',
          kind: String(data.get('kind') || 'unsorted'),
          area: String(data.get('area') || ''),
          subkind: String(data.get('subkind') || ''),
          money_at_risk: data.get('money_at_risk') === 'on',
        }),
      });
      if (result.classificationStored === false) {
        showToast(t('toast.classPending'), true);
      } else {
        showToast(t('toast.classified', { number: ticket.number }));
      }
      await loadTickets({ quiet: true });
    } catch (error) {
      showToast(error.translatedMessage || friendlyError(error.code), true);
    } finally {
      state.savingClassification = false;
      if (button.isConnected) {
        button.disabled = false;
        button.textContent = oldLabel;
      }
    }
  }

  return Object.freeze({ loadTickets, newIdempotencyKey, publish, publishFollowup, moveTicket, saveClassification });
}

export function createTicketState({ readFilters }) {
  const state = {
    tickets: [], files: [], followupFiles: [], followupTicketId: null,
    taxonomy: null, filters: readFilters(),
    loading: true, saving: false, savingFollowup: false, savingClassification: false,
    publishAttempt: null,
  };
  return Object.freeze({
    read: key => state[key],
    write: (key, value) => { state[key] = value; },
    view: () => state,
  });
}
