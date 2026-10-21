/* Une heure de service fixe pour les suites qui lisent le « aujourd'hui » de la
 * démo.
 *
 * La caisse et le tableau de bord comptent la journée à partir de 5 h. Entre
 * 5 h et la première vente de la démo, « aujourd'hui » est donc vide, et c'est
 * juste : rien n'est encore vendu, et il n'y a pas de « vs hier » honnête à
 * afficher. Mais une suite qui attend « 6 ventes », un montant du jour ou une
 * comparaison passait à 4 h 50 et tombait à 5 h 05 (mesuré le 2026-10-21 :
 * 13 échecs d'un coup, tous présents sur main intact).
 *
 * `pinTradingHour(page)` fige l'horloge de la page à 15 h, le même jour, avant
 * tout chargement : `Date.now()` et `new Date()` sans argument avancent à partir
 * de là, à la vitesse réelle. Les dates données explicitement (`new Date(ts)`)
 * ne bougent pas. La suite teste alors le comportement d'une après-midi de
 * service, quelle que soit l'heure à laquelle on la lance.
 */
export function tradingHourMs(hour = 15, now = new Date()) {
  const d = new Date(now.getTime());
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

export async function pinTradingHour(page, hour = 15) {
  const target = tradingHourMs(hour);
  await page.evaluateOnNewDocument((targetMs) => {
    const RealDate = Date;
    const offset = targetMs - RealDate.now();
    function FakeDate(...args) {
      if (!new.target) return new RealDate(RealDate.now() + offset).toString();
      return args.length ? new RealDate(...args) : new RealDate(RealDate.now() + offset);
    }
    FakeDate.prototype = RealDate.prototype;
    FakeDate.now = () => RealDate.now() + offset;
    FakeDate.UTC = RealDate.UTC;
    FakeDate.parse = RealDate.parse;
    Object.defineProperty(FakeDate, 'name', { value: 'Date' });
    globalThis.Date = FakeDate;
  }, target);
  return target;
}
