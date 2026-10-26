/* Tickets data. Exports: loadTickets, newIdempotencyKey, publish, publishFollowup, moveTicket, saveClassification.
 * Reads injected: $, API, activateTab, closeFollowup, composer, configureComposerClassification, draft, draftController, followupComposer, friendlyError, lists, make, render, renderLoading, resetComposer, resetFollowup, showToast, state, t. Browser APIs are declared in split.json.
 * Mutable shared fields belong to the data owner; other modules receive its view. */
export function createData({ $, API, activateTab, closeFollowup, composer, configureComposerClassification, draft, draftController, followupComposer, friendlyError, lists, make, render, renderLoading, resetComposer, resetFollowup, showToast, state, t }) {
  async function loadTickets(options) { const seq = loadTickets.seq = (loadTickets.seq || 0) + 1;
    if (!options || !options.quiet) renderLoading();
    try {
      const response = await (await import('./request-deadline.mjs').catch(function () { return { deadlineFetch: function (u, o) { return fetch(u, o); } }; })).deadlineFetch(API, { headers: { Accept: 'application/json' }, cache: 'no-store' });
      const data = await response.json().catch((error) => { if (error.code === 'request-timeout') throw error; return {}; }); if (seq !== loadTickets.seq) return;
      if (!response.ok) throw Object.assign(new Error(data.error || 'read-failed'), { code: data.error });
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
      state.loading = false;
      render();
    } catch (error) {
      if (seq !== loadTickets.seq) return; state.loading = false;
      if (options && options.quiet) return;
      Object.values(lists).forEach((list) => {
        const failed = make('div', 'error-state');
        failed.append(make('strong', '', t('load.failed')), make('span', '', friendlyError(error.code)));
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
    const fingerprint = [text, $('ticketKind').value, $('ticketArea').value, $('ticketSubkind').value,
      $('ticketMoneyRisk').checked, ...state.files.map((file) => file.name + ':' + file.size)].join('\u0001');
    if (!state.publishAttempt || state.publishAttempt.fingerprint !== fingerprint) {
      state.publishAttempt = { fingerprint, key: newIdempotencyKey() };
    }
    data.append('idempotency_key', state.publishAttempt.key);
    await draft.save();
    try {
      const response = await (await import('./request-deadline.mjs').catch(function () { return { deadlineFetch: function (u, o) { return fetch(u, o); } }; })).deadlineFetch(API, { method: 'POST', body: data }, 60000);
      const result = await response.json().catch((error) => { if (error.code === 'request-timeout') throw error; return {}; });
      if (!response.ok) throw Object.assign(new Error(result.error || 'publish-failed'), { code: result.error });
      if (sendingDraft) await sendingDraft.clear();
      composer.close();
      resetComposer();
      state.publishAttempt = null;
      showToast(t(result.classificationStored === false ? 'toast.publishedPending' : 'toast.published', { number: result.number }));
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
      const response = await (await import('./request-deadline.mjs').catch(function () { return { deadlineFetch: function (u, o) { return fetch(u, o); } }; })).deadlineFetch(`${API}/${ticket.id}`, {
        method: 'PATCH',
        headers: { Accept: 'application/json' },
        body: data,
      }, 60000);
      const result = await response.json().catch((error) => { if (error.code === 'request-timeout') throw error; return {}; });
      if (!response.ok) throw Object.assign(new Error(result.error || 'update-failed'), { code: result.error });
      followupComposer.close();
      resetFollowup();
      showToast(t('toast.sentBack', { number: ticket.number }));
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

  async function moveTicket(ticket, action, button) {
    button.disabled = true;
    const original = button.innerHTML;
    button.textContent = t(action === 'fixed' ? 'busy.moving' : 'busy.deletingImages');
    try {
      const response = await (await import('./request-deadline.mjs').catch(function () { return { deadlineFetch: function (u, o) { return fetch(u, o); } }; })).deadlineFetch(`${API}/${ticket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ action }),
      });
      const result = await response.json().catch((error) => { if (error.code === 'request-timeout') throw error; return {}; });
      if (!response.ok) throw Object.assign(new Error(result.error || 'update-failed'), { code: result.error });
      showToast(t(action === 'fixed' ? 'toast.readyToTest' : 'toast.completed', { number: ticket.number }));
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
      const response = await (await import('./request-deadline.mjs').catch(function () { return { deadlineFetch: function (u, o) { return fetch(u, o); } }; })).deadlineFetch(`${API}/${ticket.id}`, {
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
      const result = await response.json().catch((error) => { if (error.code === 'request-timeout') throw error; return {}; });
      if (!response.ok) throw Object.assign(new Error(result.error || 'update-failed'), { code: result.error });
      if (result.classificationStored === false) {
        showToast(t('toast.classPending'), true);
      } else {
        showToast(t('toast.classified', { number: ticket.number }));
      }
      await loadTickets({ quiet: true });
    } catch (error) {
      showToast(friendlyError(error.code), true);
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
