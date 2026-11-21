/* Rapports · les données de la démo (assets/pages-pro/reports-hub.js).
 *
 * La démo n'a ni boutique sur le serveur ni ventes dans D1 : le hub lui
 * montrait « Aucun établissement ouvert ». Ce fichier fabrique, dans le
 * navigateur et sans rien envoyer, les mêmes réponses que /api/reports pour les
 * trois établissements de la démo (Café Atlas, Maison Mansour, Spa Bahia) :
 * mêmes formes, mêmes phrases (copiées de functions/api/_reports-words.js par
 * tools/build-shared-rules.mjs), même CSV (_reports-csv.js).
 *
 * Les chiffres sont tirés d'un générateur à graine : la même journée donne
 * toujours les mêmes ventes, d'un rapport à l'autre et d'un rechargement à
 * l'autre, et chaque total est la somme de ses parties (heures, produits,
 * établissements). Le hub ne l'appelle que pour une session de démo
 * (KiwiEnv.isReal() faux) : un vrai commerçant ne voit jamais ces chiffres.
 *
 * Publie window.KiwiReportDemo. Dépendance de la section paresseuse du hub
 * (assets/pages-pro.js › LAZY_SECTIONS). */
(() => {
  'use strict';
  /* GENERATED SHARED KiwiReportWords BEGIN */
  /* Copy of functions/api/_reports-words.js made by tools/build-shared-rules.mjs. Edit the source, then run the tool. */
  var KiwiReportWords = (function () {
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
    function money(cents, lang) {
      const v = Math.round((Number(cents) || 0) / 100);
      if (lang === 'en') return group(v, ',') + ' MAD';
      if (lang === 'ar') return group(v, ' ') + ' درهم';
      return group(v, NBSP) + NBSP + 'MAD';
    }
    function pct(v, lang) {
      const r = Math.round(Math.abs(v));
      return lang === 'fr' ? r + NBSP + '%' : r + '%';
    }
    function deltaPct(cur, prev) {
      if (!(prev > 0)) return null;
      return ((cur - prev) / prev) * 100;
    }

    const WEEKDAY = {
      fr: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'],
      en: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      ar: ['الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'],
    };
    const weekdayName = (i, lang) => (WEEKDAY[lang] || WEEKDAY.fr)[i] || '';

    /* Les moments de la journée, sur l'heure locale. */
    function daypart(hour) {
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
    function slotName(slot, lang) {
      if (!slot) return '';
      if (slot.weekday == null) return (PART_ALONE[lang] || PART_ALONE.fr)[slot.part];
      const wd = weekdayName(slot.weekday, lang), part = (PART[lang] || PART.fr)[slot.part];
      if (lang === 'en') return wd + ' ' + part;
      if (lang === 'ar') return slot.part === 'night' ? 'آخر الليل يوم ' + wd : part + ' ' + wd;
      return 'le ' + wd + ' ' + part;
    }

    /* « par rapport à … » selon la période. */
    function versus(period, lang) {
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
    function frVersus(vs) {
      return vs.startsWith('les ') ? 'par rapport aux ' + vs.slice(4) : vs.startsWith('le ') ? 'par rapport au ' + vs.slice(3) : 'par rapport à ' + vs;
    }

    function each(fn) { const out = {}; for (const l of LANGS) out[l] = fn(l); return out; }
    const join2 = (a, b, lang) => (a && b ? a + (lang === 'ar' ? ' و' : lang === 'en' ? ' and ' : ' et ') + b : a || b || '');

    /* Une seule journée : l'heure de pointe, après la tendance. */
    function peak(d, lang) {
      if (!d.peakHour) return '';
      const h = d.peakHour.hour;
      return { fr: ` Pic de la journée à ${h} h.`, en: ` Busiest hour: ${h}:00.`, ar: ` ذروة اليوم على الساعة ${h}:00.` }[lang];
    }

    /* Le résumé : la tendance des ventes nettes, puis ce qui l'explique. */
    function summarySentence(d) {
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
    function rankingSentence(kind, d) {
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

    function heatmapSentence(d) {
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

    function vatSentence(d) {
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
    return { money, pct, deltaPct, weekdayName, daypart, slotName, versus, frVersus, summarySentence, rankingSentence, heatmapSentence, vatSentence };
  })();
  /* GENERATED SHARED KiwiReportWords END */
  /* GENERATED SHARED KiwiReportCsv BEGIN */
  /* Copy of functions/api/_reports-csv.js made by tools/build-shared-rules.mjs. Edit the source, then run the tool. */
  var KiwiReportCsv = (function () {
    // L'export CSV des rapports. Les mêmes règles que le dossier du mois
    // (assets/month-report.js › csv) : un BOM UTF-8 en tête pour qu'Excel lise
    // l'arabe et les accents, le point-virgule (Excel en français), CRLF, chaque
    // cellule entre guillemets, un guillemet doublé, et un texte qui commence par
    // = + - @ précédé d'une apostrophe pour qu'aucune cellule ne devienne une
    // formule. Les montants sont en MAD avec la virgule décimale, sans séparateur
    // de milliers : un tableur les lit comme des nombres.

    const BOM = '﻿';

    function cell(v) {
      if (v == null) return '""';
      if (typeof v === 'object' && v.n != null) return '"' + v.n + '"';
      let s = String(v);
      if (/^[\s]*[=+\-@\t\r]/.test(s)) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    }
    /* Un montant en centimes → « 1234,50 » (marqué nombre : pas d'apostrophe sur
       un montant négatif). */
    const mad = (cents) => (cents == null ? null : { n: (Math.round(Number(cents) || 0) / 100).toFixed(2).replace('.', ',') });
    const qty = (q) => (q == null ? null : { n: String(Math.round((Number(q) || 0) * 1000) / 1000).replace('.', ',') });
    const pc = (p) => (p == null || !Number.isFinite(p) ? null : { n: (Math.round(p * 10) / 10).toFixed(1).replace('.', ',') });

    function toCsv(header, rows) {
      return BOM + [header].concat(rows).map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';
    }

    const H = {
      fr: { day: 'Journée', net: 'Ventes nettes (MAD)', prevDay: 'Journée comparée', prevNet: 'Ventes nettes comparées (MAD)',
        name: 'Nom', category: 'Catégorie', qty: 'Quantité', prevQty: 'Quantité comparée', gross: 'Brut des lignes (MAD)', share: 'Part (%)', change: 'Évolution (%)',
        tickets: 'Tickets', cost: 'Coût (MAD)', margin: 'Marge (MAD)', marginPct: 'Marge (%)', sales: 'Ventes (MAD)', prevSales: 'Ventes comparées (MAD)', basket: 'Panier moyen (MAD)',
        discounts: 'Remises (MAD)', refunds: 'Remboursements (MAD)', refundCount: 'Nombre de remboursements', tips: 'Pourboires (MAD)',
        method: 'Moyen de paiement', amount: 'Encaissé (MAD)', count: 'Nombre', prevAmount: 'Encaissé comparé (MAD)', channel: 'Canal',
        rate: 'Taux TVA (%)', ht: 'HT (MAD)', vat: 'TVA (MAD)', ttc: 'TTC (MAD)', unknownRate: 'Taux inconnu',
        customer: 'Client', spend: 'Dépense (MAD)', last: 'Dernière visite', prevSpend: 'Dépense comparée (MAD)', site: 'Établissement',
        weekday: 'Jour', hour: 'Heure', metric: 'Indicateur', value: 'Valeur', prevValue: 'Valeur comparée',
        unassigned: 'Sans vendeur', none: 'Sans catégorie', total: 'Total',
        sold: 'Vendu avant retours (MAD)', refunded: 'Retours (MAD)', unattributed: 'Ventes sans détail d’article et retours non rattachés', vsAvg: 'Écart à la moyenne du groupe (%)' },
      en: { day: 'Business day', net: 'Net sales (MAD)', prevDay: 'Compared day', prevNet: 'Compared net sales (MAD)',
        name: 'Name', category: 'Category', qty: 'Quantity', prevQty: 'Compared quantity', gross: 'Line gross (MAD)', share: 'Share (%)', change: 'Change (%)',
        tickets: 'Tickets', cost: 'Cost (MAD)', margin: 'Margin (MAD)', marginPct: 'Margin (%)', sales: 'Sales (MAD)', prevSales: 'Compared sales (MAD)', basket: 'Average basket (MAD)',
        discounts: 'Discounts (MAD)', refunds: 'Refunds (MAD)', refundCount: 'Refund count', tips: 'Tips (MAD)',
        method: 'Payment method', amount: 'Collected (MAD)', count: 'Count', prevAmount: 'Compared collected (MAD)', channel: 'Channel',
        rate: 'VAT rate (%)', ht: 'Excl. VAT (MAD)', vat: 'VAT (MAD)', ttc: 'Incl. VAT (MAD)', unknownRate: 'Unknown rate',
        customer: 'Customer', spend: 'Spend (MAD)', last: 'Last visit', prevSpend: 'Compared spend (MAD)', site: 'Location',
        weekday: 'Day', hour: 'Hour', metric: 'Metric', value: 'Value', prevValue: 'Compared value',
        unassigned: 'No seller', none: 'No category', total: 'Total',
        sold: 'Sold before returns (MAD)', refunded: 'Returns (MAD)', unattributed: 'Sales without item detail and unlinked refunds', vsAvg: 'vs group average (%)' },
      ar: { day: 'اليوم التجاري', net: 'المبيعات الصافية (درهم)', prevDay: 'يوم المقارنة', prevNet: 'المبيعات الصافية للمقارنة (درهم)',
        name: 'الاسم', category: 'القسم', qty: 'الكمية', prevQty: 'الكمية للمقارنة', gross: 'إجمالي السطور (درهم)', share: 'الحصة (%)', change: 'التطور (%)',
        tickets: 'التذاكر', cost: 'التكلفة (درهم)', margin: 'الهامش (درهم)', marginPct: 'الهامش (%)', sales: 'المبيعات (درهم)', prevSales: 'المبيعات للمقارنة (درهم)', basket: 'متوسط السلة (درهم)',
        discounts: 'التخفيضات (درهم)', refunds: 'المرجوعات (درهم)', refundCount: 'عدد المرجوعات', tips: 'البقشيش (درهم)',
        method: 'وسيلة الأداء', amount: 'المحصّل (درهم)', count: 'العدد', prevAmount: 'المحصّل للمقارنة (درهم)', channel: 'القناة',
        rate: 'نسبة الضريبة (%)', ht: 'دون ضريبة (درهم)', vat: 'الضريبة (درهم)', ttc: 'بالضريبة (درهم)', unknownRate: 'نسبة غير معروفة',
        customer: 'الزبون', spend: 'الإنفاق (درهم)', last: 'آخر زيارة', prevSpend: 'الإنفاق للمقارنة (درهم)', site: 'المؤسسة',
        weekday: 'اليوم', hour: 'الساعة', metric: 'المؤشر', value: 'القيمة', prevValue: 'القيمة للمقارنة',
        unassigned: 'بدون بائع', none: 'بدون قسم', total: 'المجموع',
        sold: 'المبيعات قبل المرجوعات (درهم)', refunded: 'المرجوعات (درهم)', unattributed: 'مبيعات بدون تفاصيل المنتجات ومرجوعات غير مرتبطة بتذكرتها', vsAvg: 'الفرق مع متوسط المجموعة (%)' },
    };
    const METRICS = {
      fr: { gross: 'Ventes brutes (MAD)', discounts: 'Remises (MAD)', refunds: 'Remboursements (MAD)', net: 'Ventes nettes (MAD)', vat: 'TVA collectée (MAD)',
        cogs: 'Coût des ventes (MAD)', margin: 'Marge brute (MAD)', marginPct: 'Marge brute (%)', costCoverage: 'Ventes au coût connu (%)', tickets: 'Tickets',
        basket: 'Panier moyen (MAD)', itemsPerTicket: 'Articles par ticket', tips: 'Pourboires (MAD)', refundCount: 'Remboursements' },
      en: { gross: 'Gross sales (MAD)', discounts: 'Discounts (MAD)', refunds: 'Refunds (MAD)', net: 'Net sales (MAD)', vat: 'VAT collected (MAD)',
        cogs: 'Cost of goods (MAD)', margin: 'Gross margin (MAD)', marginPct: 'Gross margin (%)', costCoverage: 'Sales with known cost (%)', tickets: 'Tickets',
        basket: 'Average basket (MAD)', itemsPerTicket: 'Items per ticket', tips: 'Tips (MAD)', refundCount: 'Refunds' },
      ar: { gross: 'المبيعات الإجمالية (درهم)', discounts: 'التخفيضات (درهم)', refunds: 'المرجوعات (درهم)', net: 'المبيعات الصافية (درهم)', vat: 'الضريبة المحصّلة (درهم)',
        cogs: 'تكلفة المبيعات (درهم)', margin: 'الهامش الإجمالي (درهم)', marginPct: 'الهامش الإجمالي (%)', costCoverage: 'مبيعات بتكلفة معروفة (%)', tickets: 'التذاكر',
        basket: 'متوسط السلة (درهم)', itemsPerTicket: 'منتجات في كل تذكرة', tips: 'البقشيش (درهم)', refundCount: 'المرجوعات' },
    };
    const MONEY = new Set(['gross', 'discounts', 'refunds', 'net', 'vat', 'cogs', 'margin', 'basket', 'tips']);

    function metricRows(cur, prev, lang) {
      const M = METRICS[lang] || METRICS.fr;
      return Object.keys(M).map((k) => {
        const fmt = (K) => {
          const v = k === 'vat' ? (K.vat && K.vat.vat) : K[k];
          return MONEY.has(k) ? mad(v) : k === 'tickets' || k === 'refundCount' ? (v == null ? null : { n: String(v) }) : pc(v);
        };
        return [M[k], fmt(cur), fmt(prev), pc(k === 'net' ? deltaOf(cur.net, prev.net) : null)];
      });
    }
    const deltaOf = (a, b) => (b > 0 ? ((a - b) / b) * 100 : null);

    /* Le CSV d'un rapport déjà construit. `labels` donne les noms lisibles des
       moyens de paiement et des canaux. */
    function reportCsv(name, data, lang, labels) {
      const h = H[lang] || H.fr;
      if (name === 'summary') {
        const head = [h.metric, h.value, h.prevValue, h.change];
        const series = data.series.map((s) => [s.day, mad(s.net), s.prevDay, mad(s.prevNet), pc(deltaOf(s.net, s.prevNet))]);
        if (data.hourly) {
          const hours = data.hourly.map((x) => [String(x.hour).padStart(2, '0') + ':00', mad(x.net), { n: String(x.tickets) }, mad(x.prevNet), pc(deltaOf(x.net, x.prevNet))]);
          return toCsv(head, metricRows(data.totals.cur, data.totals.prev, lang).concat([[]], [[h.hour, h.net, h.tickets, h.prevNet, h.change]], hours));
        }
        return toCsv(head, metricRows(data.totals.cur, data.totals.prev, lang).concat([[]], [[h.day, h.net, h.prevDay, h.prevNet, h.change]], series));
      }
      if (name === 'products' || name === 'categories') {
        const head = [h.name, h.category, h.qty, h.sold, h.refunded, h.net, h.share, h.prevQty, h.prevNet, h.change, h.tickets, h.cost, h.margin, h.marginPct];
        const rows = data.rows.map((r) => [name === 'categories' && !r.name ? h.none : r.name, r.category, qty(r.qty), mad(r.sold), mad(r.refunded), mad(r.net), pc(r.share),
          qty(r.prevQty), mad(r.prevNet), pc(r.change), { n: String(r.tickets) }, mad(r.cost), mad(r.margin), pc(r.marginPct)]);
        /* La ligne qui raccorde le classement au résumé, puis le total : la
           colonne des ventes nettes s'additionne jusqu'aux ventes nettes du
           résumé. */
        const t = data.totals || {};
        if (t.unattributed) rows.push([h.unattributed, '', null, null, null, mad(t.unattributed), null, null, mad(t.prevUnattributed), null, null, null, null, null]);
        rows.push([h.total, '', null, null, mad(t.refunded), mad(t.net), pc(100), null, mad(t.prevNet), pc(deltaOf(t.net, t.prevNet)), null, null, null, null]);
        return toCsv(head, rows);
      }
      if (name === 'staff') {
        const head = [h.name, h.tickets, h.sales, h.share, h.basket, h.discounts, h.refunds, h.refundCount, h.tips, h.prevSales, h.change];
        return toCsv(head, data.rows.map((r) => [r.unassigned ? h.unassigned : (r.name || r.id), { n: String(r.tickets) }, mad(r.sales), pc(r.share), mad(r.basket),
          mad(r.discounts), mad(r.refunds), { n: String(r.refundCount) }, mad(r.tips), mad(r.prevSales), pc(r.change)]));
      }
      if (name === 'payments') {
        const head = [h.method, h.amount, h.count, h.share, h.refunds, h.prevAmount, h.change];
        return toCsv(head, data.rows.map((r) => [labels.method(r.method), mad(r.cents), { n: String(r.count) }, pc(r.share), mad(r.refunds), mad(r.prevCents), pc(r.change)]));
      }
      if (name === 'channels') {
        const head = [h.channel, h.sales, h.count, h.share, h.prevSales, h.change];
        return toCsv(head, data.rows.map((r) => [labels.channel(r.channel), mad(r.cents), { n: String(r.count) }, pc(r.share), mad(r.prevCents), pc(r.change)]));
      }
      if (name === 'heatmap') {
        const head = [h.weekday].concat(Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0') + ':00'));
        return toCsv(head, data.grid.map((row, wd) => [labels.weekday(wd)].concat(row.map(mad))));
      }
      if (name === 'vat') {
        const head = [h.rate, h.ht, h.vat, h.ttc];
        const rows = data.rows.map((r) => [r.rate == null ? h.unknownRate : pc(r.rate), mad(r.ht), mad(r.vat), mad(r.ttc)]);
        rows.push([h.total, mad(data.totals.ht), mad(data.totals.vat), mad(data.totals.ttc)]);
        return toCsv(head, rows);
      }
      if (name === 'customers') {
        const head = [h.customer, h.tickets, h.spend, h.basket, h.last, h.prevSpend, h.change];
        return toCsv(head, data.rows.map((r) => [r.name || r.id, { n: String(r.tickets) }, mad(r.spend), mad(r.basket),
          r.last ? new Date(r.last).toISOString().slice(0, 10) : '', mad(r.prevSpend), pc(r.change)]));
      }
      if (name === 'sites') {
        const M = METRICS[lang] || METRICS.fr;
        const head = [h.site, M.net, h.share, h.vsAvg, M.tickets, M.basket, M.discounts, M.refunds, h.prevNet, h.change];
        const rows = data.rows.map((r) => [r.name || r.merchant, mad(r.cur.net), pc(r.share), pc(r.vsAverage && r.vsAverage.net), { n: String(r.cur.tickets) }, mad(r.cur.basket),
          mad(r.cur.discounts), mad(r.cur.refunds), mad(r.prev.net), pc(r.change)]);
        const t = data.totals;
        rows.push([h.total, mad(t.cur.net), pc(100), null, { n: String(t.cur.tickets) }, mad(t.cur.basket), mad(t.cur.discounts), mad(t.cur.refunds), mad(t.prev.net), pc(t.change)]);
        return toCsv(head, rows);
      }
      return toCsv([h.name], []);
    }
    return { BOM, cell, mad, qty, pc, toCsv, reportCsv };
  })();
  /* GENERATED SHARED KiwiReportCsv END */
  const Words = KiwiReportWords;
  const DAY = 86400000, CUT = 5;

  /* [nom, rayon, prix MAD, poids, coût unitaire MAD] */
  const SITES = [
    { merchant: 'cafeAtlas', name: 'Café Atlas', base: 940000, basket: 9800, tips: 0.024, ipt: 2.6, vat: 10,
      wk: [0.86, 0.9, 0.94, 1, 1.12, 1.34, 1.2],
      hours: { 7: 2, 8: 5, 9: 6, 10: 5, 11: 4, 12: 8, 13: 10, 14: 7, 15: 3, 16: 3, 17: 4, 18: 4, 19: 6, 20: 8, 21: 7, 22: 4, 23: 1 },
      pay: { cash: 0.55, card: 0.37, wallet: 0.08 }, ch: { surplace: 0.57, emporter: 0.25, glovo: 0.18 },
      staff: [['Salma', 0.34], ['Yassine', 0.29], ['Imane', 0.22], ['Omar', 0.15]],
      products: [['Tajine kefta', 'Plats', 95, 13, 34], ['Couscous royal', 'Plats', 120, 9, 44], ['Pastilla au poulet', 'Plats', 110, 6, 41],
        ['Msemen au miel', 'Petit-déjeuner', 22, 12, 6], ['Petit-déjeuner beldi', 'Petit-déjeuner', 65, 8, 21], ['Thé à la menthe', 'Boissons', 18, 22, 3],
        ['Jus d’orange pressé', 'Boissons', 25, 14, 7], ['Café noss-noss', 'Boissons', 16, 18, 3], ['Corne de gazelle', 'Pâtisserie', 12, 10, 4]] },
    { merchant: 'maisonMansour', name: 'Maison Mansour', base: 1420000, basket: 46000, tips: 0, ipt: 1.7, vat: 20,
      wk: [0.72, 0.8, 0.86, 0.95, 1.08, 1.42, 1.17],
      hours: { 10: 3, 11: 5, 12: 6, 13: 5, 14: 5, 15: 7, 16: 9, 17: 10, 18: 10, 19: 8, 20: 4 },
      pay: { card: 0.58, cash: 0.31, transfer: 0.06, credit: 0.05 }, ch: { walkin: 0.82, storefront: 0.11, whatsapp: 0.07 },
      staff: [['Kenza', 0.41], ['Hamza', 0.33], ['Rania', 0.26]],
      products: [['Caftan brodé', 'Caftans', 1850, 4, 820], ['Djellaba en lin', 'Djellabas', 690, 7, 290], ['Babouches cuir', 'Accessoires', 240, 12, 85],
        ['Sac en raphia', 'Accessoires', 320, 8, 120], ['Gandoura coton', 'Djellabas', 420, 9, 160], ['Foulard en soie', 'Accessoires', 180, 10, 55],
        ['Kimono tissé main', 'Caftans', 960, 5, 410]] },
    { merchant: 'spaBahia', name: 'Spa Bahia', base: 720000, basket: 52000, tips: 0.04, ipt: 1.3, vat: 20,
      wk: [0.78, 0.82, 0.9, 0.96, 1.1, 1.36, 1.28],
      hours: { 10: 3, 11: 5, 12: 5, 13: 4, 14: 6, 15: 8, 16: 9, 17: 9, 18: 7, 19: 5, 20: 2 },
      pay: { card: 0.62, cash: 0.3, transfer: 0.08 }, ch: { direct: 0.64, whatsapp: 0.36 },
      staff: [['Nora', 0.38], ['Ghita', 0.35], ['Aya', 0.27]],
      products: [['Hammam traditionnel', 'Hammam', 250, 14, 55], ['Gommage au savon noir', 'Hammam', 180, 9, 35], ['Massage à l’argan 60 min', 'Massages', 480, 10, 120],
        ['Massage duo', 'Massages', 900, 4, 230], ['Soin du visage', 'Soins', 390, 6, 95], ['Huile d’argan 100 ml', 'Boutique', 160, 7, 60]] },
  ];
  const CUSTOMERS = ['Nadia Bennani', 'Karim El Idrissi', 'Leila Amrani', 'Mehdi Tazi', 'Sofia Rahmouni', 'Youssef Kettani', 'Hiba Mernissi', 'Anas Lahlou',
    'Meryem Zniber', 'Reda Hajji', 'Zineb Ouazzani', 'Adam Sefrioui', 'Sara Fassi', 'Amine Chraibi', 'Lina Daoudi', 'Othmane Guessous', 'Rim Jaidi',
    'Ilyas Naciri', 'Douae Benjelloun', 'Badr Squalli'];

  /* Hasard reproductible : la même clé donne toujours le même nombre. */
  function rnd(key) {
    let h = 2166136261;
    for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
    h += 0x6D2B79F5; let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const ms = (day) => Date.parse(day + 'T00:00:00Z');
  const add = (day, n) => new Date(ms(day) + n * DAY).toISOString().slice(0, 10);
  const span = (a, b) => Math.round((ms(b) - ms(a)) / DAY) + 1;
  const weekday = (day) => (new Date(ms(day)).getUTCDay() + 6) % 7;
  const month = (day, n) => { const d = new Date(ms(day.slice(0, 8) + '01')); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
  const r0 = Math.round;
  const pctOf = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

  /* Les périodes, comme functions/api/_reports-period.js (Maroc en UTC+0,
     journée commerciale de 05:00 à 05:00). */
  function period(st, now) {
    const today = new Date(now - CUT * 3600000).toISOString().slice(0, 10);
    let f = today, t = today, pf, pt, live = false, cutH = 24;
    switch (st.preset) {
      case 'aujourdhui': live = true; cutH = Math.max(1, Math.ceil((now - ms(today) - CUT * 3600000) / 3600000)); pf = pt = add(today, -1); break;
      case 'hier': f = t = add(today, -1); pf = pt = add(today, -2); break;
      case 'trenteJours': f = add(today, -29); break;
      case 'moisDernier': f = month(today, -1); t = add(month(today, 0), -1); pf = month(today, -2); pt = add(f, -1); break;
      case 'trimestre': f = month(today, -(Number(today.slice(5, 7)) - 1) % 3); pf = month(f, -3); pt = add(pf, span(f, t) - 1); break;
      case 'annee': f = today.slice(0, 4) + '-01-01'; pf = (Number(today.slice(0, 4)) - 1) + '-01-01'; pt = add(pf, span(f, t) - 1); break;
      case 'personnalise': if (st.from && st.to && st.to <= today) { f = st.from; t = st.to; } else f = add(today, -6); break;
      default: f = add(today, -6);
    }
    const days = span(f, t);
    if (!pf) { pf = add(f, -days); pt = add(f, -1); }
    return { preset: st.preset, fromDay: f, toDay: t, days, live, today, cutH,
      prev: { fromDay: pf, toDay: pt, days: span(pf, pt) } };
  }

  /* Les heures d'une journée d'un établissement : [heure locale, centimes]. */
  function dayHours(site, day, cutH) {
    const idx = Math.round(ms(day) / DAY);
    const net = site.base * site.wk[weekday(day)] * (0.86 + 0.28 * rnd(site.merchant + day)) * (1 + 0.00032 * (idx - 20400));
    const total = Object.values(site.hours).reduce((a, b) => a + b, 0);
    const out = [];
    for (let i = 0; i < Math.min(24, cutH); i++) {
      const h = (CUT + i) % 24, w = site.hours[h];
      if (w) out.push([h, r0((net * w * (0.8 + 0.4 * rnd(site.merchant + day + h))) / total)]);
    }
    return out;
  }

  /* Les indicateurs d'un établissement sur une période, avec ses heures. */
  function measure(site, from, n, cutH) {
    const k = { sales: 0, refunds: 0, refundCount: 0, discounts: 0, tips: 0, tickets: 0, byDay: [], cells: [] };
    for (let i = 0; i < n; i++) {
      const day = add(from, i);
      let dayNet = 0;
      for (const [h, c] of dayHours(site, day, cutH)) {
        const tickets = Math.max(1, r0((c / site.basket) * (0.85 + 0.3 * rnd(site.merchant + day + 't' + h))));
        k.sales += c; k.tickets += tickets; dayNet += c;
        k.cells.push({ day, hour: h, wd: weekday(day), c, tickets });
      }
      const refund = rnd(site.merchant + day + 'r') < 0.35 ? r0(dayNet * (0.01 + 0.03 * rnd(site.merchant + day + 'rv'))) : 0;
      k.refunds += refund; k.refundCount += refund ? 1 : 0;
      k.discounts += r0(dayNet * 0.034);
      k.tips += r0(dayNet * site.tips);
      k.byDay.push({ day, net: dayNet - refund });
    }
    const mix = site.products.reduce((a, p) => [a[0] + p[3] * p[4], a[1] + p[3] * p[2]], [0, 0]);
    const net = k.sales - k.refunds, cogs = r0(net * (mix[0] / mix[1]));
    return Object.assign(k, {
      gross: k.sales + k.discounts, net, basket: k.tickets ? r0(k.sales / k.tickets) : 0,
      items: r0(k.tickets * site.ipt), itemsPerTicket: k.tickets ? site.ipt : null, detailed: k.tickets, knownClients: r0(k.tickets * 0.41),
      cogs, costCoverage: 100, margin: net - cogs, marginPct: net > 0 ? Math.round(((net - cogs) / net) * 1000) / 10 : null,
      vat: { ttc: net, vat: net - r0(net / (1 + site.vat / 100)), ht: r0(net / (1 + site.vat / 100)), unknown: 0 },
    });
  }
  const KEYS = ['sales', 'refunds', 'refundCount', 'discounts', 'tips', 'tickets', 'gross', 'net', 'items', 'detailed', 'knownClients', 'cogs', 'margin'];
  function sum(list) {
    const k = {};
    KEYS.forEach((key) => { k[key] = list.reduce((a, x) => a + x[key], 0); });
    k.basket = k.tickets ? r0(k.sales / k.tickets) : 0;
    k.itemsPerTicket = k.detailed ? Math.round((k.items / k.detailed) * 10) / 10 : null;
    k.costCoverage = 100; k.marginPct = k.net > 0 ? Math.round((k.margin / k.net) * 1000) / 10 : null;
    k.vat = ['ttc', 'vat', 'ht', 'unknown'].reduce((o, key) => (o[key] = list.reduce((a, x) => a + x.vat[key], 0), o), {});
    return k;
  }
  const strip = (k) => { const o = Object.assign({}, k); delete o.byDay; delete o.cells; return o; };

  /* Les lignes d'un établissement : chaque produit prend sa part des ventes
     et des retours ; la somme des produits refait les ventes nettes. */
  function lines(site, k, key) {
    const raw = site.products.map((p) => p[3] * (0.8 + 0.4 * rnd(site.merchant + p[0] + key)));
    const tot = raw.reduce((a, b) => a + b, 0);
    let soldLeft = k.sales, refLeft = k.refunds;
    return site.products.map((p, i) => {
      const last = i === site.products.length - 1;
      const sold = last ? soldLeft : r0((k.sales * raw[i]) / tot), refunded = last ? refLeft : r0((k.refunds * raw[i]) / tot);
      soldLeft -= sold; refLeft -= refunded;
      const qty = Math.round(((sold - refunded) / (p[2] * 100)) * 10) / 10, cost = r0(qty * p[4] * 100);
      return { name: p[0], category: p[1], sold, refunded, net: sold - refunded, qty, refundedQty: Math.round((refunded / (p[2] * 100)) * 10) / 10, cost };
    });
  }

  function build(st, now) {
    const p = period(st, now);
    const anchor = SITES.find((s) => s.merchant === st.anchor) || SITES[0];
    const chosen = st.report === 'sites' || st.site === 'all' ? SITES : [SITES.find((s) => s.merchant === st.site) || anchor];
    const cut = p.live ? p.cutH : 24;
    const per = chosen.map((site) => ({ site, cur: measure(site, p.fromDay, p.days, cut), prev: measure(site, p.prev.fromDay, p.prev.days, cut) }));
    const cur = sum(per.map((x) => x.cur)), prev = sum(per.map((x) => x.prev));
    const env = { report: st.report, merchant: anchor.merchant, scope: chosen.length > 1 ? 'all' : 'site', site: chosen.length > 1 ? 'all' : chosen[0].merchant,
      sites: SITES.map((s) => ({ merchant: s.merchant, name: s.name })), demo: true, showCost: true, generatedAt: now,
      period: { preset: p.preset, fromDay: p.fromDay, toDay: p.toDay, days: p.days, live: p.live, today: p.today }, previous: p.prev };
    const cells = (pd) => per.flatMap((x) => x[pd].cells);
    const allLines = (pd) => per.flatMap((x) => lines(x.site, x[pd], pd === 'cur' ? p.fromDay : p.prev.fromDay));
    const page = (rows) => { const o = st.csv ? 0 : st.offset || 0, l = st.csv ? rows.length || 1 : 50; return { rows: rows.slice(o, o + l), page: { offset: o, limit: l, total: rows.length } }; };
    const pick = (list, name) => list.filter((l) => l.name === name);
    let data;
    if (st.report === 'summary') {
      const series = Array.from({ length: p.days }, (_, i) => ({ day: add(p.fromDay, i), net: per.reduce((a, x) => a + x.cur.byDay[i].net, 0),
        prevDay: add(p.prev.fromDay, i), prevNet: i < p.prev.days ? per.reduce((a, x) => a + (x.prev.byDay[i] ? x.prev.byDay[i].net : 0), 0) : null }));
      let hourly = null, peakHour = null;
      if (p.days === 1) {
        hourly = Array.from({ length: 24 }, (_, i) => (CUT + i) % 24).map((hour) => {
          const c = cells('cur').filter((x) => x.hour === hour), q = cells('prev').filter((x) => x.hour === hour);
          return { hour, net: c.reduce((a, x) => a + x.c, 0), tickets: c.reduce((a, x) => a + x.tickets, 0), prevNet: q.reduce((a, x) => a + x.c, 0) };
        });
        /* Les remboursements de la journée sur leur heure du soir, pour que les heures refassent le net. */
        const last = hourly.filter((x) => x.net > 0).pop();
        if (last) last.net -= cur.refunds;
        const lastPrev = hourly.filter((x) => x.prevNet > 0).pop();
        if (lastPrev) lastPrev.prevNet -= prev.refunds;
        const top = hourly.reduce((b, x) => (x.net > 0 && (!b || x.net > b.net) ? x : b), null);
        if (top) peakHour = { hour: top.hour, net: top.net, tickets: top.tickets };
      }
      const lc = allLines('cur'), lp = allLines('prev');
      const deltas = lc.map((l) => ({ name: l.name, d: l.net - pick(lp, l.name).reduce((a, x) => a + x.net, 0) })).sort((a, b) => b.d - a.d);
      const slots = new Map();
      for (const [pd, sign] of [['cur', 1], ['prev', -1]]) for (const c of cells(pd)) {
        const key = (p.days % 7 === 0 ? c.wd + ':' : '') + Words.daypart(c.hour);
        slots.set(key, (slots.get(key) || 0) + sign * c.c);
      }
      const slot = (want) => { let best = null; for (const [k, v] of slots) if (want * v > 0 && (!best || want * v > want * best[1])) best = [k, v];
        if (!best) return null; const parts = best[0].split(':'); return parts.length === 2 ? { weekday: +parts[0], part: parts[1] } : { weekday: null, part: parts[0] }; };
      const drivers = { up: deltas[0] && deltas[0].d > 0 ? { name: deltas[0].name, delta: deltas[0].d } : null,
        down: deltas[deltas.length - 1] && deltas[deltas.length - 1].d < 0 ? { name: deltas[deltas.length - 1].name, delta: deltas[deltas.length - 1].d } : null };
      const d = { period: p, cur, prev, drivers, slots: { up: slot(1), down: slot(-1) }, peakHour };
      data = { totals: { cur: strip(cur), prev: strip(prev), change: Words.deltaPct(cur.net, prev.net) }, series, hourly, peakHour, drivers, slots: d.slots,
        perSite: per.map((x) => ({ merchant: x.site.merchant, name: x.site.name, cur: strip(x.cur), prev: strip(x.prev) })), headline: Words.summarySentence(d) };
    } else if (st.report === 'products' || st.report === 'categories') {
      const key = st.report === 'products' ? 'name' : 'category';
      const fold = (list) => { const m = new Map(); for (const l of list) { const g = m.get(l[key]) || { name: l[key], category: l.category, sold: 0, refunded: 0, net: 0, qty: 0, refundedQty: 0, cost: 0 };
        ['sold', 'refunded', 'net', 'qty', 'refundedQty', 'cost'].forEach((f) => { g[f] += l[f]; }); m.set(l[key], g); } return m; };
      const c = fold(allLines('cur')), q = fold(allLines('prev'));
      const rows = [...c.values()].map((r) => { const pr = q.get(r.name) || { net: 0, qty: 0 };
        return Object.assign(r, { key: r.name, qty: Math.round(r.qty * 10) / 10, prevQty: Math.round(pr.qty * 10) / 10, prevNet: pr.net, gross: r.sold, tickets: r0(r.qty / 1.3) || 1,
          share: pctOf(r.net, cur.net), change: Words.deltaPct(r.net, pr.net), margin: r.net - r.cost, marginPct: r.net > 0 ? Math.round(((r.net - r.cost) / r.net) * 1000) / 10 : null }); })
        .sort((a, b) => b.net - a.net);
      const mover = rows.filter((r) => r.net > r.prevNet).sort((a, b) => (b.net - b.prevNet) - (a.net - a.prevNet))[0];
      data = Object.assign(page(rows), { totals: { lines: cur.net, prevLines: prev.net, refunded: cur.refunds, unattributed: 0, prevUnattributed: 0, net: cur.net, prevNet: prev.net },
        headline: Words.rankingSentence(st.report, { top: rows[0] && { name: rows[0].name, value: rows[0].net, prev: rows[0].prevNet }, total: cur.net,
          mover: mover && { name: mover.name, delta: mover.net - mover.prevNet } }) });
    } else if (st.report === 'staff') {
      const rows = per.flatMap((x) => x.site.staff.map(([name, w], i) => ({ id: x.site.merchant + name, name, unassigned: false,
        tickets: r0(x.cur.tickets * w), sales: r0(x.cur.sales * w), discounts: r0(x.cur.discounts * w), refunds: i ? 0 : x.cur.refunds, refundCount: i ? 0 : x.cur.refundCount,
        tips: r0(x.cur.tips * w), prevSales: r0(x.prev.sales * w * (0.9 + 0.2 * rnd(name + p.fromDay))), prevTickets: r0(x.prev.tickets * w) })))
        .map((r) => Object.assign(r, { basket: r.tickets ? r0(r.sales / r.tickets) : 0, share: pctOf(r.sales, cur.sales), change: Words.deltaPct(r.sales, r.prevSales) }))
        .sort((a, b) => b.sales - a.sales);
      data = { rows, totals: { sales: cur.sales }, headline: Words.rankingSentence('staff', { top: rows[0] && { name: rows[0].name, value: rows[0].sales, prev: rows[0].prevSales, basket: rows[0].basket }, total: cur.sales }) };
    } else if (st.report === 'payments' || st.report === 'channels') {
      const field = st.report === 'payments' ? 'pay' : 'ch', V = window.KiwiReportViews;
      const m = new Map();
      for (const x of per) for (const [code, w] of Object.entries(x.site[field])) {
        const r = m.get(code) || { code, cents: 0, count: 0, prevCents: 0, prevCount: 0, refunds: 0 };
        r.cents += r0(x.cur.sales * w); r.count += r0(x.cur.tickets * w); r.prevCents += r0(x.prev.sales * w * (0.92 + 0.16 * rnd(code + p.fromDay))); r.prevCount += r0(x.prev.tickets * w);
        if (code === 'cash' || code === 'card') r.refunds += r0(x.cur.refunds * (code === 'cash' ? 0.6 : 0.4));
        m.set(code, r);
      }
      const rows = [...m.values()].sort((a, b) => b.cents - a.cents).map((r) => Object.assign(r, { [st.report === 'payments' ? 'method' : 'channel']: r.code,
        share: pctOf(r.cents, cur.sales), change: Words.deltaPct(r.cents, r.prevCents) }));
      const tri = st.report === 'payments' ? V.methodTri : V.channelTri;
      data = { rows, totals: { cents: cur.sales, refunds: rows.reduce((a, r) => a + r.refunds, 0) },
        headline: Words.rankingSentence(st.report, { top: rows[0] && { name: tri(rows[0].code), value: rows[0].cents, prev: rows[0].prevCents }, total: cur.sales }) };
    } else if (st.report === 'heatmap') {
      const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
      for (const c of cells('cur')) grid[c.wd][c.hour] += c.c;
      const occurrences = Array(7).fill(0);
      for (let i = 0; i < p.days; i++) occurrences[weekday(add(p.fromDay, i))]++;
      const byWeekday = grid.map((r) => r.reduce((a, b) => a + b, 0)), byHour = Array.from({ length: 24 }, (_, h) => grid.reduce((a, r) => a + r[h], 0));
      let peak = null;
      grid.forEach((row, wd) => row.forEach((cents, hour) => { if (cents > 0 && (!peak || cents > peak.cents)) peak = { weekday: wd, hour, cents }; }));
      const open = byWeekday.map((v, i) => ({ v, i })).filter((x) => x.v > 0);
      const total = byWeekday.reduce((a, b) => a + b, 0);
      data = { grid, byWeekday, byHour, occurrences, peak, total, headline: Words.heatmapSentence({ peak, total, quiet: open.length > 1 ? open.sort((a, b) => a.v - b.v)[0].i : null }) };
    } else if (st.report === 'vat') {
      const m = new Map();
      for (const x of per) { const r = m.get(x.site.vat) || { rate: x.site.vat, ht: 0, vat: 0, ttc: 0 }; ['ht', 'vat', 'ttc'].forEach((f) => { r[f] += x.cur.vat[f]; }); m.set(x.site.vat, r); }
      const rows = [...m.values()].sort((a, b) => a.rate - b.rate);
      data = { rows, totals: Object.assign({}, cur.vat), prevTotals: Object.assign({}, prev.vat),
        headline: Words.vatSentence({ vat: cur.vat.vat, ttc: cur.vat.ttc, unknown: 0 }) };
    } else if (st.report === 'customers') {
      const attributed = r0(cur.sales * 0.44), weights = CUSTOMERS.map((_, i) => 1 / Math.pow(i + 1.4, 0.9) * (0.85 + 0.3 * rnd(CUSTOMERS[i] + p.fromDay)));
      const wsum = weights.reduce((a, b) => a + b, 0);
      const rows = CUSTOMERS.map((name, i) => { const spend = r0((attributed * weights[i]) / wsum), prevSpend = r0(spend * (0.7 + 0.5 * rnd(name + 'p')));
        const tickets = Math.max(1, r0(spend / 21000));
        return { id: 'demo-' + i, name, spend, tickets, basket: r0(spend / tickets), last: now - r0(rnd(name + 'l') * Math.min(p.days, 20)) * DAY, prevSpend, prevTickets: tickets,
          change: Words.deltaPct(spend, prevSpend), site: 0 }; }).sort((a, b) => b.spend - a.spend);
      const top10 = rows.slice(0, 10).reduce((a, r) => a + r.spend, 0), known = r0(cur.tickets * 0.41);
      data = Object.assign(page(rows), { totals: { tickets: cur.tickets, attributedTickets: known, attributedCents: attributed,
        anonymousShare: pctOf(cur.tickets - known, cur.tickets), topTenCents: top10 },
        headline: Words.rankingSentence('customers', { top: { name: rows[0].name, value: rows[0].spend, prev: rows[0].prevSpend }, total: cur.sales, topTenShare: (top10 / attributed) * 100 }) });
    } else {
      const rows = per.map((x) => ({ merchant: x.site.merchant, name: x.site.name, cur: strip(x.cur), prev: strip(x.prev), change: Words.deltaPct(x.cur.net, x.prev.net), share: pctOf(x.cur.net, cur.net) }));
      const average = { net: r0(cur.net / rows.length), basket: r0(rows.reduce((a, r) => a + r.cur.basket, 0) / rows.length), tickets: r0(cur.tickets / rows.length) };
      rows.forEach((r) => { r.vsAverage = { net: Words.deltaPct(r.cur.net, average.net), basket: Words.deltaPct(r.cur.basket, average.basket) }; });
      const ranked = rows.slice().sort((a, b) => b.cur.net - a.cur.net);
      const mover = rows.filter((r) => r.cur.net > r.prev.net).sort((a, b) => (b.cur.net - b.prev.net) - (a.cur.net - a.prev.net))[0];
      data = { rows, totals: { cur: strip(cur), prev: strip(prev), change: Words.deltaPct(cur.net, prev.net) }, average, best: ranked[0].merchant, worst: ranked[ranked.length - 1].merchant,
        headline: Words.rankingSentence('sites', { top: { name: ranked[0].name, value: ranked[0].cur.net, prev: ranked[0].prev.net }, total: cur.net,
          mover: mover && { name: mover.name, delta: mover.cur.net - mover.prev.net } }) };
    }
    return Object.assign(env, data);
  }

  /* Le CSV de la démo : le même que celui du serveur, fait ici. */
  function csv(data, lang) {
    const V = window.KiwiReportViews;
    const i = lang === 'en' ? 'en' : lang === 'ar' ? 'ar' : 'fr';
    const labels = { method: (m) => V.methodTri(m)[i], channel: (c) => V.channelTri(c)[i], weekday: (w) => Words.weekdayName(w, i) };
    return KiwiReportCsv.reportCsv(data.report, data, i, labels);
  }

  window.KiwiReportDemo = { SITES: SITES.map((s) => ({ merchant: s.merchant, name: s.name })), build, csv };
})();
