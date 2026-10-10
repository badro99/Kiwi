window.__kiwiSweep = async function () {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const navs = [...document.querySelectorAll('.sidebar [data-nav]')].map((a) => a.getAttribute('data-nav')).filter((v, i, a) => a.indexOf(v) === i);
  const report = {};
  const errs = [];
  const onErr = (e) => errs.push(String(e.message || e.reason || e));
  window.addEventListener('error', onErr);
  window.addEventListener('unhandledrejection', onErr);
  for (const nav of navs) {
    const a = document.querySelector('.sidebar [data-nav="' + nav + '"]');
    if (!a) continue;
    const before = errs.length;
    try { a.click(); } catch (e) { errs.push(nav + ': ' + e.message); }
    await wait(1900);
    document.querySelectorAll('.kiwi-modal-close').forEach((b) => b.click());
    const drawer = [...document.querySelectorAll('.kiwi-drawer')].find((d) => d.getBoundingClientRect().width > 50);
    const page = document.querySelector('.dash-genpage');
    const root = drawer || (page && page.getBoundingClientRect().height > 50 ? page : null) || document.querySelector('main') || document.body;
    const title = ((drawer && (drawer.querySelector('h2,h3,.kiwi-drawer-title')?.textContent)) || (page && page.querySelector('h1')?.textContent) || document.querySelector('.dr-label')?.textContent || '').trim().slice(0, 40) + (drawer ? ' (drawer)' : '');
    const found = window.__kiwiAudit(root);
    report[nav] = { title, errors: errs.slice(before), findings: found };
    if (drawer) { drawer.querySelector('.kiwi-drawer-close, [data-close], .kiwi-modal-close')?.click(); document.querySelector('.kiwi-drawer-backdrop')?.click(); await wait(400); }
  }
  window.removeEventListener('error', onErr);
  window.removeEventListener('unhandledrejection', onErr);
  return report;
};
window.__kiwiSummary = function (rep) {
  const lines = [];
  for (const [nav, r] of Object.entries(rep)) {
    const by = {};
    r.findings.forEach((f) => { (by[f.kind] = by[f.kind] || []).push(f); });
    const parts = Object.entries(by).map(([k, v]) => k + ':' + v.length);
    lines.push(nav + ' [' + r.title + '] ' + (parts.join(' ') || 'clean') + (r.errors.length ? ' ERR:' + r.errors.length : ''));
  }
  return lines;
};
'ok';
