/* Kiwi · Moroccan fixed-date public-holiday calendar.
 *
 * This is scheduling context, not a payroll engine. Fixed civil/national
 * dates are deterministic; lunar religious holidays remain manager-confirmed
 * opening-hour exceptions because their Gregorian date follows the official
 * announcement. A holiday never closes a venue by itself and never invents a
 * wage premium. */
(function (root) {
  'use strict';

  const FIXED = Object.freeze({
    '01-01': { fr:'Nouvel An', en:'New Year’s Day', ar:'رأس السنة الميلادية' },
    '01-11': { fr:'Manifeste de l’indépendance', en:'Independence Manifesto Day', ar:'ذكرى تقديم وثيقة الاستقلال' },
    '01-14': { fr:'Nouvel An amazigh', en:'Amazigh New Year', ar:'رأس السنة الأمازيغية' },
    '05-01': { fr:'Fête du Travail', en:'Labour Day', ar:'عيد الشغل' },
    '07-30': { fr:'Fête du Trône', en:'Throne Day', ar:'عيد العرش' },
    '08-14': { fr:'Récupération de Oued Eddahab', en:'Recovery of Oued Eddahab', ar:'ذكرى استرجاع وادي الذهب' },
    '08-20': { fr:'Révolution du Roi et du Peuple', en:'Revolution of the King and the People', ar:'ثورة الملك والشعب' },
    '08-21': { fr:'Fête de la Jeunesse', en:'Youth Day', ar:'عيد الشباب' },
    '10-31': { fr:'Fête de l’Unité', en:'Unity Day', ar:'عيد الوحدة' },
    '11-06': { fr:'Marche Verte', en:'Green March Day', ar:'ذكرى المسيرة الخضراء' },
    '11-18': { fr:'Fête de l’Indépendance', en:'Independence Day', ar:'عيد الاستقلال' }
  });

  const RELIGIOUS = Object.freeze({
    fr:['Aïd Al-Fitr','Nouvel An de l’Hégire','Aïd Al-Adha','Aïd Al-Mawlid'],
    en:['Eid Al-Fitr','Hijri New Year','Eid Al-Adha','Eid Al-Mawlid'],
    ar:['عيد الفطر','فاتح محرم','عيد الأضحى','عيد المولد النبوي']
  });

  function iso(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return [value.getFullYear(), String(value.getMonth()+1).padStart(2,'0'), String(value.getDate()).padStart(2,'0')].join('-');
    }
    const text = String(value || '').slice(0,10);
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
  }

  function info(value, lang) {
    const day = iso(value);
    const row = day && FIXED[day.slice(5)];
    if (!row) return null;
    const language = lang === 'en' || lang === 'ar' ? lang : 'fr';
    return { day, type:'public-holiday', fixed:true, label:row[language], labels:Object.assign({}, row), payroll:'review' };
  }

  root.KiwiMoroccoCalendar = Object.freeze({
    info,
    isHoliday(value) { return !!info(value); },
    between(days, lang) { return (days || []).map((day) => info(day, lang)).filter(Boolean); },
    religiousNames(lang) { return (RELIGIOUS[lang === 'en' || lang === 'ar' ? lang : 'fr'] || RELIGIOUS.fr).slice(); },
    fixed: FIXED
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
