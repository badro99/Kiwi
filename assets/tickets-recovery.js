export function draftFallback({ $, state, t }) {
    function saveDraft() {
      const error = $('formError'); error.textContent = t('draft.failed');
      const button = document.createElement('button'); button.type = 'button'; button.textContent = t('draft.export');
      button.onclick = async () => {
        const files = await Promise.all(state.files.map(async file => ({ name: file.name, type: file.type,
          data: Array.from(new Uint8Array(await file.arrayBuffer())) })));
        const snapshot = { body: $('ticketBody').value, kind: $('ticketKind').value, area: $('ticketArea').value,
          subkind: $('ticketSubkind').value, risk: $('ticketMoneyRisk').checked, files, attempt: state.publishAttempt };
        const href = URL.createObjectURL(new Blob([JSON.stringify(snapshot)], { type: 'application/json' }));
        const link = document.createElement('a'); link.href = href; link.download = 'kiwi-ticket-draft.json'; link.click();
        setTimeout(() => URL.revokeObjectURL(href), 1500);
      };
      error.appendChild(button);
    }
    return { store: null, saveDraft, restoreDraft: saveDraft };
  }

