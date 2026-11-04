/* A TAR of Blob parts keeps attachments binary without materialising their bytes. */
function draftArchive(snapshot, files) {
  const encoder = new TextEncoder(), parts = [];
  function entry(name, blob) {
    if (blob.size > 0o77777777777) throw new Error('draft-size');
    const header = new Uint8Array(512);
    const field = (offset, value) => header.set(encoder.encode(value), offset);
    field(0, name); field(100, '0000644\0'); field(108, '0000000\0'); field(116, '0000000\0');
    field(124, blob.size.toString(8).padStart(11, '0') + '\0');
    field(136, '00000000000\0'); field(148, '        '); field(156, '0'); field(257, 'ustar\0'); field(263, '00');
    field(148, header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, '0') + '\0 ');
    parts.push(header, blob, new Uint8Array((512 - blob.size % 512) % 512));
  }
  const manifest = { ...snapshot, files: files.map((file, i) => ({ name: file.name, type: file.type, path: 'attachments/' + i })) };
  entry('draft.json', new Blob([JSON.stringify(manifest)], { type: 'application/json' }));
  files.forEach((file, i) => entry('attachments/' + i, file));
  parts.push(new Uint8Array(1024));
  return new Blob(parts, { type: 'application/x-tar' });
}

export function draftFallback({ $, state, t }) {
    function saveDraft() {
      const error = $('formError'); error.textContent = t('draft.failed');
      const button = document.createElement('button'); button.type = 'button'; button.textContent = t('draft.export');
      button.onclick = async () => {
        try {
        const snapshot = { body: $('ticketBody').value, kind: $('ticketKind').value, area: $('ticketArea').value,
          subkind: $('ticketSubkind').value, risk: $('ticketMoneyRisk').checked, attempt: state.publishAttempt };
        const href = URL.createObjectURL(draftArchive(snapshot, state.files));
        const link = document.createElement('a'); link.href = href; link.download = 'kiwi-ticket-draft.tar'; link.click();
        setTimeout(() => URL.revokeObjectURL(href), 1500);
        } catch (_) { error.textContent = t('draft.failed'); error.appendChild(button); }
      };
      error.appendChild(button);
    }
    return { store: null, saveDraft, restoreDraft: saveDraft };
  }

