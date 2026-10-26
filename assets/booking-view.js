/* Booking view. Exports: lsSet, ssGet, ssSet, ssDel, wireGlobal, t, ht, esc, money, vtz, ymd, fmt, venueToday, venueHour, isHotel, layout, head, closed.
 * Reads only the declared context below and standard browser APIs.
 * Shared booking state belongs to the entry owner; counters stay private. */
export function createBookingView(context) {
  'use strict';
  const { owner, app, services, times, hotelSearch, hotelRoomList, details, success, hotelDetails, renderManage } = context;
  const state = owner.getState();

  function lsSet(k,v) {
    try {
      localStorage.setItem(k,v)
    }
    catch(_) {
    }
  }

  function ssGet(k) {
    try {
      return sessionStorage.getItem(k)
    }
    catch(_) {
      return null
    }
  }

  function ssSet(k,v) {
    try {
      sessionStorage.setItem(k,v)
    }
    catch(_) {
    }
  }

  function ssDel(k) {
    try {
      sessionStorage.removeItem(k)
    }
    catch(_) {
    }
  }

  var C={
    fr: {
      aside: 'Réservez sans appeler, sans attendre.',sub: 'Choisissez votre service et l’heure qui vous convient. La disponibilité est confirmée par l’établissement.',trust: 'Réservation sécurisée par Kiwi',choose: 'Que souhaitez-vous réserver ?',chooseSub: 'Les prix et durées sont ceux publiés par l’établissement.',time: 'Choisissez votre horaire',timeSub: 'Seuls les créneaux réellement disponibles apparaissent.',details: 'Vos coordonnées',detailsSub: 'Elles servent uniquement à confirmer et gérer cette réservation.',name: 'Nom complet',phone: 'Téléphone',email: 'E-mail',note: 'Demande particulière',back: 'Retour',next: 'Continuer',confirm: 'Confirmer la réservation',price: 'Prix',deposit: 'Acompte',duration: 'Durée',guests: 'Personnes',upTo: 'jusqu’à {n} personnes',free: 'Sans frais',periodMorning: 'Matin',periodNoon: 'Midi',periodAfternoon: 'Après-midi',periodEvening: 'Soir',change: 'Modifier',recap: 'Récapitulatif',noSlots: 'Aucun créneau disponible ce jour-là.',closed: 'Les réservations en ligne ne sont pas disponibles pour cet établissement.',noHours: 'Cet établissement n’a pas encore publié ses horaires de réservation.',timeout: 'Délai de réponse dépassé. Réessayez avec les mêmes coordonnées.',error: 'Impossible de charger les disponibilités.',invalid: 'Indiquez votre nom et au moins un téléphone ou un e-mail.',taken: 'Ce créneau vient d’être réservé. Choisissez-en un autre.',success: 'Votre réservation est confirmée',requested: 'Votre demande a bien été envoyée',successSub: "Conservez cette référence. L’établissement retrouve votre réservation instantanément.",reference: 'Référence',when: 'Date',service: 'Service',powered: 'propulsé par Kiwi'
    }
    ,en: {
      timeout: 'The request timed out. Retry with the same details.',aside: 'Book without calling or waiting.',sub: 'Choose the service and time that suits you. Availability is confirmed by the venue.',trust: 'Secure booking by Kiwi',choose: 'What would you like to book?',chooseSub: 'Prices and durations are published by the venue.',time: 'Choose a time',timeSub: 'Only genuinely available slots are shown.',details: 'Your details',detailsSub: 'Used only to confirm and manage this booking.',name: 'Full name',phone: 'Phone',email: 'Email',note: 'Special request',back: 'Back',next: 'Continue',confirm: 'Confirm booking',price: 'Price',deposit: 'Deposit',duration: 'Duration',guests: 'Guests',upTo: 'up to {n} guests',free: 'No charge',periodMorning: 'Morning',periodNoon: 'Midday',periodAfternoon: 'Afternoon',periodEvening: 'Evening',change: 'Change',recap: 'Summary',noSlots: 'No slots are available on this day.',closed: 'Online booking is not available for this venue.',noHours: 'This venue has not published its booking hours yet.',error: 'Unable to load availability.',invalid: 'Enter your name and at least a phone number or email.',taken: 'That slot was just taken. Choose another.',success: 'Your booking is confirmed',requested: 'Your request was sent',successSub: 'Keep this reference. The venue can find your booking instantly.',reference: 'Reference',when: 'Date',service: 'Service',powered: 'powered by Kiwi'
    }
    ,ar: {
      aside: 'احجز دون اتصال أو انتظار.',sub: 'اختر الخدمة والوقت المناسب لك. تؤكد المؤسسة التوفر مباشرة.',trust: 'حجز آمن عبر Kiwi',choose: 'ما الخدمة التي تريد حجزها؟',chooseSub: 'الأسعار والمدد منشورة من طرف المؤسسة.',time: 'اختر الموعد',timeSub: 'تظهر فقط المواعيد المتاحة فعلياً.',details: 'معلوماتك',detailsSub: 'تُستخدم فقط لتأكيد هذا الحجز وإدارته.',name: 'الاسم الكامل',phone: 'الهاتف',email: 'البريد الإلكتروني',note: 'طلب خاص',back: 'رجوع',next: 'متابعة',confirm: 'تأكيد الحجز',price: 'السعر',deposit: 'العربون',duration: 'المدة',guests: 'الأشخاص',upTo: 'إلى غاية {n} أشخاص',free: 'بدون رسوم',periodMorning: 'الصباح',periodNoon: 'الظهيرة',periodAfternoon: 'بعد الظهر',periodEvening: 'المساء',change: 'تعديل',recap: 'الملخّص',noSlots: 'لا توجد مواعيد متاحة في هذا اليوم.',closed: 'الحجز عبر الإنترنت غير متاح لهذه المؤسسة.',noHours: 'لم تنشر هذه المؤسسة مواعيد الحجز بعد.',timeout: 'انتهت مهلة الطلب. أعد المحاولة بنفس المعلومات.',error: 'تعذر تحميل المواعيد.',invalid: 'أدخل اسمك ورقم هاتف أو بريداً إلكترونياً.',taken: 'تم حجز هذا الموعد للتو. اختر موعداً آخر.',success: 'تم تأكيد حجزك',requested: 'تم إرسال طلب الحجز',successSub: 'احتفظ بهذا المرجع. ستجد المؤسسة حجزك فوراً.',reference: 'المرجع',when: 'التاريخ',service: 'الخدمة',powered: 'بواسطة Kiwi'
    }
  }
    ;

  var H={
    fr: {
      aside: 'Votre séjour commence ici.',sub: 'Choisissez vos dates et votre chambre. Les disponibilités et tarifs viennent directement de l’hôtel.',search: 'Préparez votre séjour',searchSub: 'Indiquez vos dates et le nombre de voyageurs.',checkIn: 'Arrivée',checkOut: 'Départ',guests: 'Voyageurs',find: 'Voir les chambres',rooms: 'Choisissez votre chambre',roomsSub: 'Seules les catégories disponibles pour tout le séjour peuvent être réservées.',night: 'nuit',nights: 'nuits',perNight: 'par nuit',available: '{n} disponible(s)',full: 'Complet à ces dates',beds: 'Couchage',size: 'Surface',view: 'Vue',amenities: 'Équipements',total: 'Total du séjour',details: 'Vos coordonnées',detailsSub: 'L’hôtel les utilisera pour confirmer et préparer votre arrivée.',room: 'Chambre',stay: 'Séjour',confirm: 'Confirmer le séjour',invalidDates: 'Choisissez une arrivée et un départ valides.',none: 'Aucune chambre ne correspond à ces dates et au nombre de voyageurs.',taken: 'Cette dernière chambre vient d’être réservée. Relancez la recherche.',success: 'Votre séjour est confirmé',requested: 'Votre demande de séjour a été envoyée'
    }
    ,en: {
      aside: 'Your stay starts here.',sub: 'Choose your dates and room. Availability and rates come directly from the hotel.',search: 'Plan your stay',searchSub: 'Enter your dates and number of guests.',checkIn: 'Check-in',checkOut: 'Check-out',guests: 'Guests',find: 'See rooms',rooms: 'Choose your room',roomsSub: 'Only categories available for the entire stay can be booked.',night: 'night',nights: 'nights',perNight: 'per night',available: '{n} available',full: 'Sold out for these dates',beds: 'Beds',size: 'Size',view: 'View',amenities: 'Amenities',total: 'Stay total',details: 'Your details',detailsSub: 'The hotel will use them to confirm and prepare your arrival.',room: 'Room',stay: 'Stay',confirm: 'Confirm stay',invalidDates: 'Choose valid check-in and check-out dates.',none: 'No room matches these dates and guest count.',taken: 'The last room was just booked. Search again.',success: 'Your stay is confirmed',requested: 'Your stay request was sent'
    }
    ,ar: {
      aside: 'إقامتك تبدأ هنا.',sub: 'اختر التواريخ والغرفة. التوفر والأسعار تأتي مباشرة من الفندق.',search: 'حضّر إقامتك',searchSub: 'حدد تاريخ الوصول والمغادرة وعدد الضيوف.',checkIn: 'الوصول',checkOut: 'المغادرة',guests: 'الضيوف',find: 'عرض الغرف',rooms: 'اختر غرفتك',roomsSub: 'يمكن حجز الفئات المتاحة طوال مدة الإقامة فقط.',night: 'ليلة',nights: 'ليالٍ',perNight: 'لليلة',available: 'متاح: {n}',full: 'مكتمل في هذه التواريخ',beds: 'الأسرة',size: 'المساحة',view: 'الإطلالة',amenities: 'المرافق',total: 'إجمالي الإقامة',details: 'معلوماتك',detailsSub: 'سيستخدمها الفندق لتأكيد وصولك والاستعداد له.',room: 'الغرفة',stay: 'الإقامة',confirm: 'تأكيد الإقامة',invalidDates: 'اختر تاريخ وصول ومغادرة صالحين.',none: 'لا توجد غرفة مناسبة لهذه التواريخ وعدد الضيوف.',taken: 'تم حجز آخر غرفة للتو. أعد البحث.',success: 'تم تأكيد إقامتك',requested: 'تم إرسال طلب إقامتك'
    }
  }
    ;

  function t(k) {
    return (C[state.lang]||C.fr)[k]||k
  }

  function ht(k) {
    return (H[state.lang]||H.fr)[k]||k
  }

  function esc(v) {
    return String(v==null? '':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
  }

  function money(n) {
    return Number(n||0).toLocaleString(state.lang==='ar'? 'ar-MA':'fr-FR')+' MAD'
  }

  /* Les créneaux sont calculés à l'heure de l'établissement (Casablanca).
     Ils s'affichaient à l'heure du VISITEUR : depuis Paris, une table de
     11:00 se lisait 12:00, et la dernière avant la fermeture passait après.
     Un touriste qui réserve avant d'arriver venait une heure en retard sur
     la table qu'on lui gardait. Tout ce qui est montré passe donc par le
     fuseau de l'établissement. */
  var VENUE_TZ='Africa/Casablanca';

  function vtz() {
    return (state.config&&state.config.tz)||VENUE_TZ
  }

  function ymd(d) {
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')
  }

  function fmt(ts,opt) {
    var o=Object.assign({
      timeZone: vtz()
    }
      ,opt||{
      }
    );
    o.timeZone=globalThis.KiwiZoneLaw?.effectiveZone(o.timeZone,ts)||o.timeZone;
    return new Date(ts).toLocaleString(state.lang==='ar'? 'ar-MA':state.lang,o)
  }

  function venueToday() {
    try {
      return new (globalThis.KiwiZoneLaw?.DateTimeFormat||Intl.DateTimeFormat)('en-CA',{
        timeZone: vtz(),year: 'numeric',month: '2-digit',day: '2-digit'
      }
      ).format(new Date())
    }
    catch(_) {
      return ymd(new Date())
    }
  }

  function venueHour(ts) {
    try {
      return +new (globalThis.KiwiZoneLaw?.DateTimeFormat||Intl.DateTimeFormat)('en-GB',{
        timeZone: vtz(),hour: '2-digit',hourCycle: 'h23'
      }
      ).format(new Date(ts))
    }
    catch(_) {
      return new Date(ts).getHours()
    }
  }

  function isHotel() {
    return !!(state.config&&state.config.kind==='hotel')
  }

  function layout(content) {
    var active=document.activeElement,owned=app.contains(active),key=owned&&[...active.attributes].filter(function(a) {
      return /^(data-|name$)/.test(a.name)
    }
    ).map(function(a) {
      return '['+a.name+'="'+CSS.escape(a.value)+'"]'
    }
    ).join('');
    document.documentElement.lang=state.lang;
    document.documentElement.dir=state.lang==='ar'? 'rtl':'ltr';
    app.innerHTML='<div class="bk-shell'+(isHotel()? ' bk-hotel':'')+'"><aside class="bk-aside"><div class="bk-brand"><img src="assets/kiwi-newlogo.svg" alt="Kiwi"><span></span><strong>'+esc(state.config&&state.config.name||'')+'</strong></div><div class="bk-aside-copy"><span class="bk-kicker">KIWI RESERVATIONS</span><h1>'+esc(isHotel()? ht('aside'):t('aside'))+'</h1><p>'+esc(isHotel()? ht('sub'):t('sub'))+'</p></div><div class="bk-trust">'+esc(t('trust'))+'</div></aside><section class="bk-main"><div class="bk-top"><div class="bk-steps" role="list">'+[1,2,3].map(function(x) {
      var label=isHotel()? ht(['search','rooms','details'][x-1]):t(['choose','time','details'][x-1]);
      return '<span role="listitem" aria-label="'+esc(label)+'"'+(x===state.step? ' aria-current="step"':'')+' class="bk-step-dot'+(x<=state.step? ' on':'')+'"></span>'
    }
    ).join('')+'</div><div class="bk-lang">'+['fr','en','ar'].map(function(l) {
      return '<button data-lang="'+l+'" class="'+(l===state.lang? 'on':'')+'">'+l.toUpperCase()+'</button>'
    }
    ).join('')+'</div></div>'+content+'</section></div>';
    wireGlobal();
    if(owned) {
      var next=key&&app.querySelector(key);
      if(!next) next=app.querySelector('input[name=name],.bk-date.on,[data-service],[data-hotel-room],[data-hotel-search] input,[data-manage-keep]');
      if(next) next.focus()
    }
  }

  function head(title,sub) {
    return '<header class="bk-head"><span>0'+state.step+' / 03</span><h2>'+esc(title)+'</h2><p>'+esc(sub)+'</p></header>'
  }

  function wireGlobal() {
    app.querySelectorAll('[data-lang]').forEach(function(b) {
      b.onclick=function() {
        var form=app.querySelector('[data-form],[data-hotel-form]'),draft=form? {
        }
          :null;
        if(form) ['name','phone','email','note'].forEach(function(k) {
          draft[k]=form.elements[k].value
        }
        );
        state.lang=b.dataset.lang;
        lsSet('kiwiBookingLang',state.lang);
        if(state.manageData) {
          renderManage(state.manageData,'','');
          return
        }
        if(isHotel()) {
          if(state.step===1) hotelSearch();
          else if(state.step===2) hotelRoomList();
          else hotelDetails()
        }
        else if(state.step===1) services();
        else if(state.step===2) times();
        else details();
        if(draft) {
          var next=app.querySelector('[data-form],[data-hotel-form]');
          if(next) Object.keys(draft).forEach(function(k) {
            next.elements[k].value=draft[k]
          }
          )
        }
      }
    }
    )
  }

  function closed(message) {
    document.documentElement.lang=state.lang;
    document.documentElement.dir=state.lang==='ar'? 'rtl':'ltr';
    app.innerHTML='<section class="bk-closed"><div class="bk-closed-top"><img src="assets/kiwi-newlogo.svg" alt="Kiwi"><div class="bk-lang">'+['fr','en','ar'].map(function(l) {
      return '<button data-closed-lang="'+l+'" class="'+(l===state.lang? 'on':'')+'">'+l.toUpperCase()+'</button>'
    }
    ).join('')+'</div></div><div class="bk-closed-mark" aria-hidden="true"><span></span></div><p class="bk-kicker">KIWI RESERVATIONS</p><h1>'+esc(message)+'</h1><p class="bk-closed-note">'+esc(state.closedKey==='noHours'? (state.lang==='ar'? 'ستظهر المواعيد المتاحة هنا فور تحديد المؤسسة لساعات الحجز.':state.lang==='en'? 'Available times will appear here once the venue sets its booking hours.':'Les créneaux apparaîtront ici dès que l’établissement aura renseigné ses horaires.'):(state.lang==='ar'? 'ستظهر خدمات المؤسسة ومواعيدها هنا فور تفعيل الحجز.':state.lang==='en'? 'The venue’s services and available times will appear here as soon as booking is enabled.':'Les services et les créneaux de l’établissement apparaîtront ici dès l’activation des réservations.'))+'</p></section>';
    app.querySelectorAll('[data-closed-lang]').forEach(function(b) {
      b.onclick=function() {
        state.lang=b.dataset.closedLang;
        lsSet('kiwiBookingLang',state.lang);
        closed(t(state.closedKey||'closed'))
      }
    }
    );
  }

  return Object.freeze({ lsSet, ssGet, ssSet, ssDel, wireGlobal, t, ht, esc, money, vtz, ymd, fmt, venueToday, venueHour, isHotel, layout, head, closed });
}
