/* Kiwi · numéros de ticket boutique (play-test Amira, 2026-10-29).
 * 22504 et 22563 manquaient sans ticket annulé : le numéro était pris à la
 * création du panier, et vider le ticket, recharger la caisse ou abandonner un
 * échange le jetait. Il se tire maintenant à l'encaissement, et un numéro
 * abandonné revient à la série s'il est encore le dernier tiré.
 * Lance le vrai module sur une série simulée. */
let failed = 0;
const ok = (name, cond) => { console.log((cond ? '  ✓ ' : '  ✗ ') + name); if (!cond) failed++; };
{
  /* Le vrai module, sur une série simulée : un numéro rendu n'est réutilisé que
     s'il est le dernier tiré, jamais s'il a déjà servi à une vente. */
  const { releaseNumber, prepareNumber } = await import(new URL('../assets/pos-boutique/ticket-number.js', import.meta.url).href);
  let lease = { next: 22505, end: 22999 }, seq = 22505, saved = 0;
  const sales = [];
  const io = { demo: false, lock: (w) => Promise.resolve().then(w), lease: () => lease, save: () => (saved++, true),
    seq: () => seq, setSeq: (n) => { seq = n; }, sales: () => sales, ensure: () => Promise.resolve(lease), render() {} };
  ok('le dernier numéro tiré revient à la série', (await releaseNumber('22504', io)) === true && lease.next === 22504 && seq === 22504 && saved === 1);
  ok('un numéro qui n’est plus le dernier ne revient pas', (await releaseNumber('22502', io)) === false && lease.next === 22504);
  lease = { next: 22505, end: 22999 }; seq = 22505; sales.push({ id: '22504' });
  ok('un numéro déjà encaissé ne revient jamais', (await releaseNumber('22504', io)) === false && lease.next === 22505);
  ok('une référence non numérique ne touche pas la série', (await releaseNumber('OFF-1', io)) === false);
  const t = { num: '', lines: [] };
  await prepareNumber(t, io);
  ok('préparer la série ne pose aucun numéro sur le panier', t.num === '' && !t.numbering && !t.numError && lease.next === 22505);
  const bad = { num: '', lines: [] };
  await prepareNumber(bad, Object.assign({}, io, { ensure: () => Promise.reject(new Error('offline')) })).catch(() => {});
  ok('une série introuvable se voit tout de suite', bad.numError === true && bad.num === '');
}

if (failed) { console.error(failed + ' échec(s)'); process.exit(1); }
console.log('✓ numéros de ticket boutique');
