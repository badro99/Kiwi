/* Local only: complete image blobs, six images / 10 MiB each, never uploaded
   before Send. IndexedDB quota failures are surfaced by the composer. */
export function draftKey(scope) {
  if (!scope?.tenant || !scope?.operator) throw new Error('draft-scope');
  return JSON.stringify(['kiwi-ticket-draft-v1', scope.tenant, scope.operator]);
}
export function indexedDraftBackend(indexedDB = globalThis.indexedDB) {
  let database;
  function open() {
    return database ||= new Promise((resolve, reject) => {
      const request = indexedDB.open('kiwi-ticket-drafts', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('drafts');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('draft-blocked'));
    });
  }
  async function run(method, key, value) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', method === 'get' ? 'readonly' : 'readwrite');
      const store = tx.objectStore('drafts');
      const request = method === 'put' ? store.put(value, key) : store[method](key);
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = tx.onerror = () => reject(tx.error || new Error('draft-storage'));
    });
  }
  return {get: key => run('get', key), put: (key, value) => run('put', key, value), delete: key => run('delete', key)};
}
export function createDraftStore(scope, backend = indexedDraftBackend()) {
  const key = draftKey(scope);
  let pending = Promise.resolve();
  const enqueue = task => (pending = pending.catch(() => {}).then(task));
  return {
    load: () => enqueue(async () => {
      const value = await backend.get(key);
      if (value) value.files = (value.files || []).map(file => new File([file.blob], file.name, {type: file.type, lastModified: file.lastModified}));
      return value;
    }),
    save: value => { const snapshot = structuredClone({...value, files: (value.files || []).map(file => ({blob: file, name: file.name, type: file.type, lastModified: file.lastModified}))}); return enqueue(() => backend.put(key, snapshot)); },
    clear: () => enqueue(() => backend.delete(key)),
  };
}

export function composerDraft({ $, state, composer, syncComposerSubkinds, renderSelectedImages, resetComposer, t, backend }) {
  let draftStore = null, draftScopeKey = '', restoring, storageFailed = false;
  function draftSnapshot() {
    return { body: $('ticketBody').value, kind: $('ticketKind').value, area: $('ticketArea').value,
      subkind: $('ticketSubkind').value, risk: $('ticketMoneyRisk').checked,
      files: state.files, attempt: state.publishAttempt };
  }
  async function saveDraft() {
    try {
      if (!draftStore) throw new Error('draft-unavailable');
      await draftStore.save(draftSnapshot());
      storageFailed = false;
    } catch (_) { storageFailed = true; $('formError').textContent = t('draft.failed'); }
  }
  function restoreDraft(scope) {
    if (JSON.stringify(scope) === draftScopeKey) return restoring;
    return restoring = loadDraft(scope);
  }
  async function loadDraft(scope) {
    const key = JSON.stringify(scope);
    const changed = !!draftScopeKey;
    draftScopeKey = key;
    draftStore = null;
    if (changed) { composer.close(); resetComposer(); state.publishAttempt = null; }
    try {
      const store = createDraftStore(scope, backend);
      const draft = await store.load();
      if (key !== draftScopeKey) return;
      draftStore = store;
      storageFailed = false;
      if (!draft) return;
      $('ticketBody').value = draft.body || '';
      $('ticketKind').value = draft.kind || 'unsorted';
      $('ticketArea').value = draft.area || '';
      syncComposerSubkinds(draft.subkind || '');
      $('ticketMoneyRisk').checked = !!draft.risk;
      state.files = draft.files || [];
      state.publishAttempt = draft.attempt || null;
      renderSelectedImages();
    } catch (_) { storageFailed = true; $('formError').textContent = t('draft.failed'); }
  }

  return {saveDraft, restoreDraft, get store() { return draftStore; }, get available() { return !!draftStore && !storageFailed; }};
}
