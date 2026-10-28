/* Bounded ledger DOM; the caller calculates the balance over the full book. */
export function historyPage(entries, page = 0) {
  return entries.slice(page * 50, (page + 1) * 50);
}
export function bindHistoryPages(host, entries, renderRow, icons) {
  entries = entries.map(entry => entry && typeof entry === 'object' ? { ...entry } : entry);
  let page = 0;
  const lang = document.documentElement.lang;
  const labels = lang === 'ar' ? ['السابق', 'التالي'] : lang === 'en' ? ['Previous', 'Next'] : ['Précédent', 'Suivant'];
  const list = host.querySelector('.ep-htl');
  const nav = document.createElement('div');
  nav.className = 'ep-dt-actions';
  nav.innerHTML = `<button type="button" class="ep-btn ghost">${labels[0]}</button><span role="status"></span><button type="button" class="ep-btn ghost">${labels[1]}</button>`;
  list.after(nav);
  const [previous, next] = nav.querySelectorAll('button');
  function draw() {
    list.innerHTML = historyPage(entries, page).map(renderRow).join('');
    previous.disabled = page === 0;
    next.disabled = (page + 1) * 50 >= entries.length;
    nav.querySelector('[role=status]').textContent = `${page + 1} / ${Math.max(1, Math.ceil(entries.length / 50))}`;
    icons();
  }
  previous.onclick = () => { page--; draw(); if (previous.disabled) next.focus(); };
  next.onclick = () => { page++; draw(); if (next.disabled) previous.focus(); };
  draw();
}
