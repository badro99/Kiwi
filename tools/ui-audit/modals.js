/* Opens the safe "opener" buttons on each sidebar page (new / add / configure / edit / view)
 * and audits the modal or drawer they open. Never clicks anything that saves or deletes. */
window.__kiwiModalSweep = async function (navs) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const OPEN = /^(\+\s*)?(nouve|ajouter|créer|configurer|modifier|lien de|importer|exporter|r[eè]gles|param|voir|ouvrir|détail)/i;
  const BAN = /(supprim|effacer|archiv|lancer|envoy|valider|confirmer|enregistr|appliquer|payer|rembours|annuler|déconnect|fermer)/i;
  const closeAll = async () => {
    for (let i = 0; i < 3; i++) {
      document.querySelectorAll('.kiwi-modal-close, .kiwi-drawer-close, [data-dismiss], [data-close]').forEach((b) => { if (b.getBoundingClientRect().width) b.click(); });
      document.querySelector('.kiwi-drawer-backdrop, .kiwi-modal-backdrop')?.click();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await wait(250);
    }
  };
  const overlay = () => [...document.querySelectorAll('.kiwi-modal, .kiwi-drawer, [role="dialog"]')].find((d) => { const r = d.getBoundingClientRect(); return r.width > 200 && r.height > 120 && getComputedStyle(d).visibility !== 'hidden'; });
  navs = navs || [...document.querySelectorAll('.sidebar [data-nav]')].map((a) => a.getAttribute('data-nav')).filter((v, i, a) => a.indexOf(v) === i);
  const out = [];
  for (const nav of navs) {
    await closeAll();
    document.querySelector('.sidebar [data-nav="' + nav + '"]')?.click();
    await wait(1600);
    const host = overlay() || document.querySelector('.dash-genpage') || document.querySelector('main');
    if (!host) continue;
    const btns = [...host.querySelectorAll('button, [role="button"], a[data-action]')].filter((b) => {
      const t = (b.innerText || '').trim().replace(/\s+/g, ' ');
      const r = b.getBoundingClientRect();
      return r.width > 0 && t && t.length < 40 && OPEN.test(t) && !BAN.test(t) && !b.disabled;
    }).map((b) => (b.innerText || '').trim().replace(/\s+/g, ' ')).filter((v, i, a) => a.indexOf(v) === i).slice(0, 6);
    for (const label of btns) {
      await closeAll();
      document.querySelector('.sidebar [data-nav="' + nav + '"]')?.click();
      await wait(1300);
      const h = overlay() || document.querySelector('.dash-genpage') || document.querySelector('main');
      const b = [...h.querySelectorAll('button, [role="button"], a[data-action]')].find((x) => (x.innerText || '').trim().replace(/\s+/g, ' ') === label);
      if (!b) continue;
      const before = overlay();
      try { b.click(); } catch (e) { out.push({ nav, label, err: e.message }); continue; }
      await wait(1100);
      const o = overlay();
      if (!o || o === before) { out.push({ nav, label, opened: false }); continue; }
      const title = (o.querySelector('h1,h2,h3,.kiwi-modal-title,.kiwi-drawer-title')?.textContent || '').trim().slice(0, 50);
      out.push({ nav, label, title, findings: window.__kiwiAudit(o).filter((f) => !/tiny-text/.test(f.kind)) });
    }
  }
  await closeAll();
  return out;
};
'ok';
