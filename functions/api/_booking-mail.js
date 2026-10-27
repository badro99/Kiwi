// Le courriel de confirmation d'une réservation publique : dans la langue où la
// cliente a réservé (FR, EN, AR) et à l'heure du commerce, jamais en ISO UTC.
//
// Un fichier préfixé `_` n'est pas routé : il est seulement importé. Pur, sans
// réseau : functions/api/booking.js l'appelle puis remet le texte à sendMail.
import { DateTimeFormat } from './_cached-clock.js';
import { DEFAULT_ZONE, validZone } from './_business-day.js';

export const MAIL_LANGS = ['fr', 'en', 'ar'];

/* La langue demandée par la page de réservation (corps de la requête), sinon la
 * première langue acceptée par le navigateur, sinon le français : la langue
 * d'origine de Kiwi, jamais un échec. */
export function mailLang(asked, acceptLanguage) {
  const pick = (v) => {
    const code = String(v || '').trim().toLowerCase().slice(0, 2);
    return MAIL_LANGS.includes(code) ? code : '';
  };
  const direct = pick(asked);
  if (direct) return direct;
  for (const part of String(acceptLanguage || '').split(',')) {
    const found = pick(part.split(';')[0]);
    if (found) return found;
  }
  return 'fr';
}

// Chiffres latins en arabe aussi : c'est l'usage du Maroc (et celui du site).
const LOCALE = { fr: 'fr-FR', en: 'en-GB', ar: 'ar-MA-u-nu-latn' };

const TEXT = {
  fr: {
    venue: 'Votre établissement',
    requested: 'Votre demande de réservation a bien été reçue. Elle vous sera confirmée par l\'établissement.',
    confirmed: 'Votre réservation est confirmée.',
    reference: 'Référence', date: 'Date', room: 'Chambre', party: 'Personnes',
    manage: 'Consulter ou annuler votre réservation :',
    personal: 'Ce lien est personnel. Ne le transmettez pas.',
    subjectRequested: 'demande reçue', subjectConfirmed: 'réservation confirmée',
    at: 'à',
    nights: (n) => `${n} nuit${n > 1 ? 's' : ''}`,
  },
  en: {
    venue: 'Your venue',
    requested: 'Your booking request has been received. The venue will confirm it with you.',
    confirmed: 'Your booking is confirmed.',
    reference: 'Reference', date: 'Date', room: 'Room', party: 'Guests',
    manage: 'View or cancel your booking:',
    personal: 'This link is personal. Please do not share it.',
    subjectRequested: 'request received', subjectConfirmed: 'booking confirmed',
    at: 'at',
    nights: (n) => `${n} night${n > 1 ? 's' : ''}`,
  },
  ar: {
    venue: 'مؤسستك',
    requested: 'تم استلام طلب الحجز الخاص بك. ستؤكده لك المؤسسة.',
    confirmed: 'تم تأكيد حجزك.',
    reference: 'المرجع', date: 'التاريخ', room: 'الغرفة', party: 'عدد الأشخاص',
    manage: 'لعرض حجزك أو إلغائه:',
    personal: 'هذا الرابط شخصي. لا تشاركه مع أحد.',
    subjectRequested: 'تم استلام الطلب', subjectConfirmed: 'تم تأكيد الحجز',
    at: 'على الساعة',
    nights: (n) => (n === 1 ? 'ليلة واحدة' : n === 2 ? 'ليلتان' : n >= 3 && n <= 10 ? `${n} ليال` : `${n} ليلة`),
  },
};

/* Le jour d'un séjour (« 2026-11-14 ») est un jour civil sans heure : on le met
 * en forme en UTC pour qu'aucun fuseau ne le décale. */
function stayDay(iso, lang) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return String(iso || '');
  const at = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return new DateTimeFormat(LOCALE[lang], { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(at);
}

/* Le créneau, à l'heure du commerce (la loi de zone de Kiwi compte, voir
 * _zone-law.js : un ICU ancien met encore le Maroc à +01). */
export function slotLabel(startAt, zone, lang) {
  const timeZone = validZone(zone) || DEFAULT_ZONE;
  const L = LOCALE[lang] ? lang : 'fr';
  const day = new DateTimeFormat(LOCALE[L], { timeZone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(startAt);
  const time = new DateTimeFormat(LOCALE.en, { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(startAt);
  return `${day} ${TEXT[L].at} ${time}`;
}

/* → { subject, text } */
export function bookingMail({ lang, venue, rec, zone, manageUrl }) {
  const L = MAIL_LANGS.includes(lang) ? lang : 'fr';
  const t = TEXT[L];
  const name = String(venue || '').trim() || t.venue;
  const requested = rec.status === 'requested';
  const when = rec.hotel
    ? `${stayDay(rec.hotel.checkIn, L)} → ${stayDay(rec.hotel.checkOut, L)} (${t.nights(Number(rec.hotel.nights) || 1)})`
    : slotLabel(rec.startAt, zone, L);
  const lines = [
    name,
    '',
    requested ? t.requested : t.confirmed,
    '',
    `${t.reference} : ${rec.code}`,
    `${t.date} : ${when}`,
    rec.hotel ? `${t.room} : ${rec.hotel.roomTypeName}` : `${t.party} : ${rec.partySize}`,
    '',
    t.manage,
    manageUrl,
    '',
    t.personal,
  ];
  return {
    subject: `${name} · ${requested ? t.subjectRequested : t.subjectConfirmed} · ${rec.code}`,
    text: lines.join('\n'),
  };
}
