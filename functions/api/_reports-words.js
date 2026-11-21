// La phrase d'ouverture de chaque rapport, en français, anglais et arabe.
//
// Un rapport s'ouvre sur ce qui a changé, dit simplement, avant le moindre
// tableau : « Ventes nettes en hausse de 12 % par rapport aux 7 jours
// précédents, portées par Tajine kefta et le samedi soir. » Les chiffres de la
// phrase sont ceux du rapport, rien n'est arrondi autrement ni inventé : sans
// période de comparaison, la phrase le dit au lieu d'afficher +∞ %.
//
// L'arabe est écrit pour être lu, pas traduit mot à mot. Les chiffres restent
// latins, comme sur le ticket et dans le tableau de bord.

const NBSP = ' ';
const LANGS = ['fr', 'en', 'ar'];

function group(n, sep) {
  const s = String(Math.abs(Math.round(n)));
  return (n < 0 ? '-' : '') + s.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}
export function money(cents, lang) {
  const v = Math.round((Number(cents) || 0) / 100);
  if (lang === 'en') return group(v, ',') + ' MAD';
  if (lang === 'ar') return group(v, ' ') + ' درهم';
  return group(v, NBSP) + NBSP + 'MAD';
}
export function pct(v, lang) {
  const r = Math.round(Math.abs(v));
  return lang === 'fr' ? r + NBSP + '%' : r + '%';
}
export function deltaPct(cur, prev) {
  if (!(prev > 0)) return null;
  return ((cur - prev) / prev) * 100;
}

const WEEKDAY = {
  fr: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'],
  en: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  ar: ['الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'],
};
export const weekdayName = (i, lang) => (WEEKDAY[lang] || WEEKDAY.fr)[i] || '';

/* Les moments de la journée, sur l'heure locale. */
export function daypart(hour) {
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 15) return 'noon';
  if (hour >= 15 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 23) return 'evening';
  return 'night';
}
const PART = {
  fr: { morning: 'matin', noon: 'midi', afternoon: 'après-midi', evening: 'soir', night: 'nuit' },
  en: { morning: 'morning', noon: 'lunchtime', afternoon: 'afternoon', evening: 'evening', night: 'night' },
  ar: { morning: 'صباح', noon: 'ظهيرة', afternoon: 'عشية', evening: 'مساء', night: 'ليلة' },
};
const PART_ALONE = {
  fr: { morning: 'le matin', noon: 'le midi', afternoon: 'l’après-midi', evening: 'le soir', night: 'la nuit' },
  en: { morning: 'the morning', noon: 'lunchtime', afternoon: 'the afternoon', evening: 'the evening', night: 'the night' },
  ar: { morning: 'الصباح', noon: 'وقت الظهيرة', afternoon: 'العشية', evening: 'المساء', night: 'الليل' },
};
/* « le samedi soir », « Saturday evening », « مساء السبت » ; sans jour : « le soir ». */
export function slotName(slot, lang) {
  if (!slot) return '';
  if (slot.weekday == null) return (PART_ALONE[lang] || PART_ALONE.fr)[slot.part];
  const wd = weekdayName(slot.weekday, lang), part = (PART[lang] || PART.fr)[slot.part];
  if (lang === 'en') return wd + ' ' + part;
  if (lang === 'ar') return slot.part === 'night' ? 'آخر الليل يوم ' + wd : part + ' ' + wd;
  return 'le ' + wd + ' ' + part;
}

/* « par rapport à … » selon la période. */
export function versus(period, lang) {
  const n = period.days;
  const T = {
    aujourdhui: { fr: 'hier à la même heure', en: 'yesterday at the same time', ar: 'أمس في الساعة نفسها' },
    hier: { fr: 'la veille', en: 'the day before', ar: 'اليوم السابق' },
    moisDernier: { fr: 'le mois d’avant', en: 'the month before', ar: 'الشهر السابق' },
    trimestre: { fr: 'le trimestre précédent au même stade', en: 'last quarter at the same point', ar: 'الربع السابق في المرحلة نفسها' },
    annee: { fr: 'l’an dernier à la même date', en: 'last year to the same date', ar: 'السنة الماضية إلى التاريخ نفسه' },
  }[period.preset];
  if (T) return T[lang] || T.fr;
  if (lang === 'en') return n === 1 ? 'the day before' : `the previous ${n} days`;
  if (lang === 'ar') return n === 1 ? 'اليوم السابق' : n === 7 ? 'الأيام السبعة السابقة' : `الـ${n} يوما السابقة`;
  return n === 1 ? 'la veille' : `les ${n} jours précédents`;
}
/* « par rapport aux 7 jours précédents », « par rapport au mois d’avant ». */
export function frVersus(vs) {
  return vs.startsWith('les ') ? 'par rapport aux ' + vs.slice(4) : vs.startsWith('le ') ? 'par rapport au ' + vs.slice(3) : 'par rapport à ' + vs;
}

function each(fn) { const out = {}; for (const l of LANGS) out[l] = fn(l); return out; }
const join2 = (a, b, lang) => (a && b ? a + (lang === 'ar' ? ' و' : lang === 'en' ? ' and ' : ' et ') + b : a || b || '');

/* Le raccord avec le Z : pourquoi deux nets. Un retour rendu en avoir ne fait
   sortir aucun argent : l'argent reste en caisse, mais il est dû au client.
   Le Z ne le déduit pas encore, ce rapport le déduit. `tickets` : les retours
   entièrement rendus en avoir, que le Z compte comme des ventes à 0 et que ce
   rapport ne compte pas comme tickets. */
export function reconcileNote(tickets) {
  const n = Math.max(0, Math.round(Number(tickets) || 0));
  const arCount = n === 1 ? 'منها مرجوع واحد بالرصيد، لا يُحتسب هنا كتذكرة'
    : n === 2 ? 'منها مرجوعان بالرصيد، لا يُحتسبان هنا كتذكرتين'
      : n <= 10 ? `منها ${n} مرجوعات بالرصيد، لا تُحتسب هنا كتذاكر` : `منها ${n} مرجوعا بالرصيد، لا تُحتسب هنا كتذاكر`;
  return {
    note: {
      fr: 'Le Z et l’accueil ne déduisent que l’argent rendu. Ce rapport déduit aussi les retours rendus en avoir : cet argent reste en caisse, mais il est dû au client.',
      en: 'The Z and the home page only deduct money handed back. This report also deducts returns given as store credit: that money stays in the till, but it is owed to the customer.',
      ar: 'التقرير اليومي (Z) والصفحة الرئيسية لا يخصمان إلا المال الذي رُدّ للزبون. أما هذا التقرير فيخصم أيضا المرجوعات التي رُدّت رصيدا: هذا المال يبقى في الصندوق، لكنه دَين عليك للزبون.',
    },
    ticketsNote: n ? {
      fr: n === 1 ? 'dont 1 retour en avoir, non compté comme ticket ici' : `dont ${n} retours en avoir, non comptés comme tickets ici`,
      en: n === 1 ? 'including 1 store-credit return, not counted as a ticket here' : `including ${n} store-credit returns, not counted as tickets here`,
      ar: arCount,
    } : null,
  };
}

/* Une seule journée : l'heure de pointe, après la tendance. */
function peak(d, lang) {
  if (!d.peakHour) return '';
  const h = d.peakHour.hour;
  return { fr: ` Pic de la journée à ${h} h.`, en: ` Busiest hour: ${h}:00.`, ar: ` ذروة اليوم على الساعة ${h}:00.` }[lang];
}

/* Le résumé : la tendance des ventes nettes, puis ce qui l'explique. */
export function summarySentence(d) {
  const cur = d.cur.net, prev = d.prev.net, change = deltaPct(cur, prev);
  return each((lang) => {
    const vs = versus(d.period, lang);
    if (!d.cur.tickets && !d.cur.refundCount) {
      return { fr: 'Aucune vente enregistrée sur cette période.', en: 'No sales recorded in this period.', ar: 'لا توجد أي مبيعات مسجّلة في هذه الفترة.' }[lang];
    }
    if (change == null) {
      return {
        fr: `${money(cur, 'fr')} de ventes nettes sur la période. Pas de vente à comparer sur la période précédente.`,
        en: `${money(cur, 'en')} in net sales this period. No sales in the previous period to compare with.`,
        ar: `${money(cur, 'ar')} من المبيعات الصافية في هذه الفترة. لا توجد مبيعات في الفترة السابقة للمقارنة.`,
      }[lang] + peak(d, lang);
    }
    const up = change >= 0;
    const product = up ? d.drivers.up : d.drivers.down;
    const slot = up ? d.slots.up : d.slots.down;
    const why = join2(product ? product.name : '', slotName(slot, lang), lang);
    if (Math.abs(change) < 1) {
      return {
        fr: `Ventes nettes stables à ${money(cur, 'fr')} ${frVersus(vs)}.`,
        en: `Net sales steady at ${money(cur, 'en')} vs ${vs}.`,
        ar: `المبيعات الصافية مستقرة عند ${money(cur, 'ar')} مقارنة مع ${vs}.`,
      }[lang] + peak(d, lang);
    }
    if (lang === 'en') return `Net sales ${up ? 'up' : 'down'} ${pct(change, lang)} vs ${vs}${why ? (up ? ', driven by ' : ', dragged by ') + why : ''}.` + peak(d, lang);
    if (lang === 'ar') return `${up ? 'ارتفعت' : 'انخفضت'} المبيعات الصافية بـ${pct(change, lang)} مقارنة مع ${vs}${why ? (up ? '، بفضل ' : '، بسبب تراجع ') + why : ''}.` + peak(d, lang);
    return `Ventes nettes en ${up ? 'hausse' : 'baisse'} de ${pct(change, 'fr')} ${frVersus(vs)}${why ? (up ? ', portées par ' : ', freinées par ') + why : ''}.` + peak(d, lang);
  });
}

/* Un classement (produits, rayons, vendeurs, moyens, canaux, clients, sites). */
export function rankingSentence(kind, d) {
  const total = d.total;
  return each((lang) => {
    let top = d.top;
    if (!top || !(total > 0)) {
      return { fr: 'Rien à classer sur cette période.', en: 'Nothing to rank in this period.', ar: 'لا شيء للترتيب في هذه الفترة.' }[lang];
    }
    const share = pct((top.value / total) * 100, lang);
    const name = top.name && typeof top.name === 'object' ? (top.name[lang] || top.name.fr) : top.name;
    top = Object.assign({}, top, { name });
    const ch = deltaPct(top.value, top.prev);
    const trend = ch == null || Math.abs(ch) < 1 ? '' : {
      fr: `, ${ch > 0 ? 'en hausse' : 'en baisse'} de ${pct(ch, 'fr')}`,
      en: `, ${ch > 0 ? 'up' : 'down'} ${pct(ch, 'en')}`,
      ar: `، ${ch > 0 ? 'بارتفاع' : 'بانخفاض'} ${pct(ch, 'ar')}`,
    }[lang];
    const mover = d.mover && d.mover.name !== top.name ? d.mover : null;
    const moverText = !mover ? '' : {
      fr: ` ${mover.name} progresse le plus (${mover.delta > 0 ? '+' : ''}${money(mover.delta, 'fr')}).`,
      en: ` ${mover.name} grew the most (${mover.delta > 0 ? '+' : ''}${money(mover.delta, 'en')}).`,
      ar: ` أكبر تقدم كان من نصيب ${mover.name} (${mover.delta > 0 ? '+' : ''}${money(mover.delta, 'ar')}).`,
    }[lang];
    const lead = {
      products: { fr: `${top.name} mène avec ${share} des ventes nettes`, en: `${top.name} leads with ${share} of net sales`, ar: `${top.name} في الصدارة بـ${share} من المبيعات الصافية` },
      categories: { fr: `Le rayon ${top.name} pèse ${share} des ventes nettes`, en: `${top.name} makes up ${share} of net sales`, ar: `حصة قسم ${top.name} من المبيعات الصافية ${share}` },
      staff: { fr: `${top.name} a encaissé ${share} des ventes, panier moyen ${money(top.basket, 'fr')}`, en: `${top.name} rang up ${share} of sales, average basket ${money(top.basket, 'en')}`, ar: `حصة ${top.name} من المبيعات ${share}، بمتوسط سلة ${money(top.basket, 'ar')}` },
      payments: { fr: `${top.name} représente ${share} des encaissements`, en: `${top.name} accounts for ${share} of payments`, ar: `حصة ${top.name} من المداخيل ${share}` },
      channels: { fr: `${top.name} apporte ${share} des ventes`, en: `${top.name} brings ${share} of sales`, ar: `حصة ${top.name} من المبيعات ${share}` },
      customers: { fr: `Vos 10 meilleurs clients font ${pct(d.topTenShare || 0, 'fr')} des ventes rattachées à un client ; ${top.name} arrive en tête`, en: `Your top 10 customers make ${pct(d.topTenShare || 0, 'en')} of sales tied to a customer; ${top.name} comes first`, ar: `أفضل 10 زبناء عندك يمثلون ${pct(d.topTenShare || 0, 'ar')} من المبيعات المرتبطة بزبون، وفي مقدمتهم ${top.name}` },
      sites: { fr: `${top.name} mène avec ${share} des ventes nettes du groupe`, en: `${top.name} leads with ${share} of group net sales`, ar: `${top.name} في الصدارة بـ${share} من المبيعات الصافية للمجموعة` },
    }[kind];
    const tail = kind === 'customers' ? '' : trend;
    return (lead ? lead[lang] : top.name) + tail + '.' + (moverText || '');
  });
}

export function heatmapSentence(d) {
  return each((lang) => {
    if (!d.peak || !(d.total > 0)) return { fr: 'Aucune vente sur cette période, pas encore de rythme à lire.', en: 'No sales in this period, no rhythm to read yet.', ar: 'لا مبيعات في هذه الفترة، ولا إيقاع يمكن قراءته بعد.' }[lang];
    const share = pct((d.peak.cents / d.total) * 100, lang);
    const h = d.peak.hour, h2 = (h + 1) % 24;
    const wd = weekdayName(d.peak.weekday, lang);
    if (lang === 'en') return `Your busiest hour is ${wd} from ${h}:00 to ${h2}:00, with ${share} of sales. ${d.quiet ? `${weekdayName(d.quiet, 'en')} is the quietest day.` : ''}`.trim();
    if (lang === 'ar') return `أقوى ساعة عندك هي يوم ${wd} بين ${h}:00 و${h2}:00، بـ${share} من المبيعات.${d.quiet != null ? ` وأهدأ يوم هو ${weekdayName(d.quiet, 'ar')}.` : ''}`;
    return `Votre heure la plus forte est le ${wd} entre ${h} h et ${h2} h, avec ${share} des ventes.${d.quiet != null ? ` Le ${weekdayName(d.quiet, 'fr')} est le jour le plus calme.` : ''}`;
  });
}

export function vatSentence(d) {
  return each((lang) => {
    if (!(d.ttc > 0)) return { fr: 'Aucune vente taxable sur cette période.', en: 'No taxable sales in this period.', ar: 'لا توجد مبيعات خاضعة للضريبة في هذه الفترة.' }[lang];
    const unknown = d.unknown > 0 ? {
      fr: ` ${pct((d.unknown / d.ttc) * 100, 'fr')} des ventes n’ont pas de taux connu : réglez la TVA du ticket ou les taux par rayon.`,
      en: ` ${pct((d.unknown / d.ttc) * 100, 'en')} of sales have no known rate: set the receipt VAT or rates per category.`,
      ar: ` ${pct((d.unknown / d.ttc) * 100, 'ar')} من المبيعات بدون نسبة معروفة: حدّد الضريبة في التذكرة أو نسبة كل قسم.`,
    }[lang] : '';
    return {
      fr: `TVA collectée : ${money(d.vat, 'fr')} sur ${money(d.ttc, 'fr')} de ventes TTC.`,
      en: `VAT collected: ${money(d.vat, 'en')} on ${money(d.ttc, 'en')} of sales incl. VAT.`,
      ar: `الضريبة المحصّلة: ${money(d.vat, 'ar')} على ${money(d.ttc, 'ar')} من المبيعات بالضريبة.`,
    }[lang] + unknown;
  });
}
