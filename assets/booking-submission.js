/* Booking submission. Exports: phoneValue, emailOk, badEmailMsg, paymentNote, details, submit, success, hotelDetails, submitHotel, hotelSuccess.
 * Reads only the declared context below and standard browser APIs.
 * Shared booking state belongs to the entry owner; counters stay private. */
export function createBookingSubmission(context) {
  'use strict';
  const { owner, app, merchant, takesCovers, party, times, loadHotelRooms, hotelRoomList, hotelSummary, rememberManage, manageBlock, wireManageBlock, ssGet, ssSet, ssDel, t, ht, esc, money, fmt, layout, head } = context;
  const state = owner.getState();
  const retryRefs = {};
  function retryRef(key, prefix, form) {
    /* The ref follows what is booked (merchant, service, slot, stay, party, price).
       Contact and note edits keep it: a guest who fixes a phone typo after a lost
       answer must reach the same booking, not create a second one. */
    const intent = JSON.stringify([merchant, state.service?.id, state.slot, state.checkIn, state.checkOut, party(), state.partySize, state.service?.total]);
    const saved = ssGet(key + 'Intent');
    const ref = (retryRefs[key]?.intent === intent ? retryRefs[key].ref : saved === intent ? ssGet(key) : '') || (prefix + crypto.randomUUID());
    retryRefs[key] = { intent, ref };
    let kept = false;
    try { ssSet(key + 'Intent', intent); ssSet(key, ref); kept = ssGet(key) === ref; } catch (_) {}
    if (!kept) form.querySelector('[data-error]').textContent = retryWarning();
    return ref;
  }
  function retryWarning() {
    return state.lang === 'ar' ? 'لم يُحفظ المرجع. احتفظ بهذه الصفحة مفتوحة. قد تؤدي إعادة المحاولة بعد إغلاقها إلى حجز مكرر.' : state.lang === 'en' ? 'Reference not saved. Keep this page open. Retrying after closing it may duplicate your booking.' : 'Référence non enregistrée. Gardez cette page ouverte. Réessayer après fermeture peut créer une réservation en double.';
  }

  async function submitRequest(form, key, ref, payload, onSuccess) {
    form.querySelector('[type=submit]').disabled=true;
    const { deadlineFetch } = await import('./request-deadline.mjs');
    /* Once the request left this page, a dropped connection says nothing about
       what the server did: it is uncertain, never a plain "unable to load". The
       deadline keeps its own message (retry with the same details, same ref). A
       server answer carrying an error code is neither. */
    let response;
    try {
      response = await deadlineFetch('/api/booking', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchant, ref, lang: state.lang, ...payload })
      });
    } catch (error) { throw error.message === 'request-timeout' ? error : Object.assign(new Error('transport-uncertain'), { cause: error }); }
    const result = await response.json().catch((error) => { if (error.message === 'request-timeout') throw error; throw new Error('response-uncertain'); });
    if (!response.ok) throw new Error((result && result.error) || 'error');
    /* A 2xx without a booking code is not a confirmation: keep the retry identity
       and say the outcome is uncertain, never render a false success. */
    if (!result || typeof result !== 'object' || typeof result.code !== 'string' || !result.code.trim()) throw new Error('response-uncertain');
    delete retryRefs[key]; ssDel(key); ssDel(key + 'Intent'); state.guest = null;
    onSuccess(result);
  }

  function uncertainReply() {
    return state.lang === 'ar' ? 'تعذّر قراءة تأكيد الحجز. قد يكون الحجز قد سُجّل. أعد المحاولة من هذه الصفحة بنفس المرجع.' : state.lang === 'en' ? 'Booking confirmation could not be read. Your booking may have been saved. Retry from this page with the same reference.' : 'Confirmation illisible. Votre réservation a peut-être été enregistrée. Réessayez depuis cette page avec la même référence.';
  }

  function transportUncertain() {
    return state.lang === 'ar' ? 'انقطع الاتصال أثناء الإرسال. قد يكون الحجز قد سُجّل. أعد المحاولة من هذه الصفحة بنفس المرجع.' : state.lang === 'en' ? 'The connection dropped while sending. Your booking may have been saved. Retry from this page with the same reference.' : 'Connexion interrompue pendant l’envoi. Votre réservation a peut-être été enregistrée. Réessayez depuis cette page avec la même référence.';
  }

  /* An error under the form is kept as a KIND, not as text: switching language
     redraws the page, and an uncertain-send message that vanished (or stayed in
     the old language) would hide that the booking may already exist. */
  function formErrorText(e) {
    var base=e.kind==='response-uncertain'? uncertainReply():e.kind==='transport-uncertain'? transportUncertain():e.kind==='request-timeout'? t('timeout'):e.kind==='room-unavailable'? ht('taken'):e.kind==='slot-unavailable'? t('taken'):t('error');
    return e.warn? base+' '+retryWarning():base
  }
  function showFormError(form, kind, warn) {
    state.formError={ kind: kind, warn: !!warn };
    form.querySelector('[data-error]').textContent=formErrorText(state.formError)
  }
  /* Called when a details form is drawn: only a language switch (state.keepFormError,
     set by the language buttons) carries the error over, any other visit starts clean. */
  function repaintFormError(form) {
    if(state.formError&&state.keepFormError) form.querySelector('[data-error]').textContent=formErrorText(state.formError);
    else state.formError=null;
    state.keepFormError=false
  }

  /* What the guest typed survives a trip back to the slot list (the automatic
     return after a taken slot included). */
  function keepGuest(form) {
    const read = () => { state.guest = {}; ['name', 'phone', 'email', 'note'].forEach((k) => { const el = form.elements && form.elements[k]; if (el) state.guest[k] = el.value; }); };
    form.addEventListener('input', read);
    return read;
  }
  function restoreGuest(form) {
    const g = state.guest || {};
    ['name', 'phone', 'email', 'note'].forEach((k) => { const el = form.elements && form.elements[k]; if (el && g[k]) el.value = g[k]; });
  }

  function phoneValue(v) {
    var s=String(v||'').trim();
    return !s? '':(window.KiwiPhone? window.KiwiPhone.normalize(s):s)
  }

  /* Le même test que le serveur, posé ici pour corriger la faute de frappe
     pendant que la cliente est encore devant le champ. `type=email` accepte
     « marie@gmail » : sans domaine complet, personne ne pourra la joindre. */
  function emailOk(v) {
    return /^[^\s@,;:<>()[\]\\"]+@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,24}$/.test(String(v||'').trim().toLowerCase())
  }

  function badEmailMsg() {
    return state.lang==='ar'? 'تحقّق من بريدك الإلكتروني: لا يمكن إرسال التأكيد إلى هذا العنوان.':state.lang==='en'? 'Check your email address: a confirmation cannot be delivered to it.':'Vérifiez votre e-mail : une confirmation ne peut pas être remise à cette adresse.'
  }

  // Booking records reserve a slot; the API does not collect a payment.
  function paymentNote() {
    return state.lang==='ar'? 'لا يتم تحصيل أي دفعة عبر الإنترنت. اتفق مع المؤسسة على دفع العربون.':state.lang==='en'? 'No payment is collected online. Arrange any deposit with the venue.':'Aucun paiement n’est encaissé en ligne. Convenez du règlement de l’acompte avec l’établissement.'
  }

  function details() {
    state.step=3;
    layout('<div class="bk-panel">'+head(t('details'),t('detailsSub'))+'<form class="bk-form" data-form><div class="bk-fields"><label class="bk-field"><span>'+esc(t('name'))+'</span><input name="name" maxlength="100" autocomplete="name" required></label><label class="bk-field"><span>'+esc(t('phone'))+'</span><input name="phone" maxlength="32" inputmode="tel" autocomplete="tel" placeholder="06… / +33…"></label><label class="bk-field full"><span>'+esc(t('email'))+'</span><input name="email" maxlength="160" type="email" autocomplete="email"></label><label class="bk-field full"><span>'+esc(t('note'))+'</span><textarea name="note" maxlength="600"></textarea></label></div><aside class="bk-summary"><div class="bk-summary-head">'+esc(t('recap'))+'</div><div><span>'+esc(t('service'))+'</span><strong>'+esc(state.service.name)+'</strong></div>'+(takesCovers()? '<div><span>'+esc(t('guests'))+'</span><strong>'+party()+'</strong></div>':'')+'<div><span>'+esc(t('when'))+'</span><strong>'+esc(fmt(state.slot,{
      weekday: 'long',day: 'numeric',month: 'long',hour: '2-digit',minute: '2-digit'
    }
    ))+'</strong></div><div><span>'+esc(t('price'))+'</span><strong>'+(+state.service.price>0? esc(money(state.service.price)):esc(t('free')))+'</strong></div>'+(+state.service.deposit>0? '<div data-deposit><span>'+esc(t('deposit'))+'</span><strong>'+esc(money(state.service.deposit))+'</strong></div>':'')+'<p data-payment-note>'+esc(paymentNote())+'</p></aside><div class="bk-error full" data-error role="alert" aria-live="assertive"></div><div class="bk-actions full"><button type="button" class="bk-btn" data-back>'+esc(t('back'))+'</button><button class="bk-btn primary" type="submit">'+esc(t('confirm'))+'</button></div></form></div>');
    var form=app.querySelector('[data-form]');
    restoreGuest(form);
    repaintFormError(form);
    const saveGuest=keepGuest(form);
    app.querySelector('[data-back]').onclick=function() { saveGuest(); times() };
    form.onsubmit=submit
  }

  async function submit(e) {
    e.preventDefault();
    var form=e.currentTarget,fd=new FormData(form),name=String(fd.get('name')||'').trim(),rawPhone=String(fd.get('phone')||'').trim(),phone=phoneValue(rawPhone),email=String(fd.get('email')||'').trim();
    if(email&&!emailOk(email)) {
      form.querySelector('[data-error]').textContent=badEmailMsg();
      return
    }
    if(!name||(!rawPhone&&!email)||rawPhone&&!phone) {
      form.querySelector('[data-error]').textContent=rawPhone&&!phone? (state.lang==='ar'? 'أدخل رقم الهاتف مع رمز الدولة، مثل +33 أو +49.':state.lang==='en'? 'Include the country code for foreign numbers, such as +33 or +49.':'Pour un numéro étranger, ajoutez l’indicatif pays, par exemple +33 ou +49.'):t('invalid');
      return
    }
    var btn=form.querySelector('[type=submit]'),ref;
    try {
      ref=retryRef('kiwiBookingRef','web_',form);
      await submitRequest(form, 'kiwiBookingRef', ref, {
          serviceId: state.service.id,startAt: state.slot,partySize:party(),customer: {
            name: name,phone: phone,email: email
          }
          ,note: fd.get('note')
      }, success);
    }
    catch(err) {
      btn.disabled=false;
      showFormError(form, err.message, ssGet('kiwiBookingRef') !== ref);
      if(err.message==='slot-unavailable') setTimeout(times,900)
    }
  }


  function success(j) {
    rememberManage(j);
    var requested=j.status==='requested';
    layout('<div class="bk-success"><div class="bk-success-mark">✓</div><h2>'+esc(requested? t('requested'):t('success'))+'</h2><p>'+esc(t('successSub'))+'</p><div class="bk-code"><span>'+esc(t('reference'))+'</span><strong>'+esc(j.code)+'</strong></div><div class="bk-summary"><div><span>'+esc(t('service'))+'</span><strong>'+esc(state.service.name)+'</strong></div>'+(takesCovers()? '<div><span>'+esc(t('guests'))+'</span><strong>'+party()+'</strong></div>':'')+'<div><span>'+esc(t('when'))+'</span><strong>'+esc(fmt(j.startAt,{
      weekday: 'long',day: 'numeric',month: 'long',hour: '2-digit',minute: '2-digit'
    }
    ))+'</strong></div></div>'+manageBlock(j)+'</div>');
    wireManageBlock()
  }

  function hotelDetails() {
    state.step=3;
    layout('<div class="bk-panel">'+head(ht('details'),ht('detailsSub'))+'<form class="bk-form" data-hotel-form><div class="bk-fields"><label class="bk-field"><span>'+esc(t('name'))+'</span><input name="name" maxlength="100" autocomplete="name" required></label><label class="bk-field"><span>'+esc(t('phone'))+'</span><input name="phone" maxlength="32" inputmode="tel" autocomplete="tel" placeholder="06… / +33…"></label><label class="bk-field full"><span>'+esc(t('email'))+'</span><input name="email" maxlength="160" type="email" autocomplete="email"></label><label class="bk-field full"><span>'+esc(t('note'))+'</span><textarea name="note" maxlength="600"></textarea></label></div>'+hotelSummary()+'<div class="bk-error full" data-error role="alert" aria-live="assertive"></div><div class="bk-actions full"><button type="button" class="bk-btn" data-back>'+esc(t('back'))+'</button><button class="bk-btn primary" type="submit">'+esc(ht('confirm'))+'</button></div></form></div>');
    var form=app.querySelector('[data-hotel-form]');
    restoreGuest(form);
    repaintFormError(form);
    const saveGuest=keepGuest(form);
    app.querySelector('[data-back]').onclick=function() { saveGuest(); hotelRoomList() };
    form.onsubmit=submitHotel
  }

  async function submitHotel(e) {
    e.preventDefault();
    var form=e.currentTarget,fd=new FormData(form),name=String(fd.get('name')||'').trim(),rawPhone=String(fd.get('phone')||'').trim(),phone=phoneValue(rawPhone),email=String(fd.get('email')||'').trim();
    if(email&&!emailOk(email)) {
      form.querySelector('[data-error]').textContent=badEmailMsg();
      return
    }
    if(!name||(!rawPhone&&!email)||rawPhone&&!phone) {
      form.querySelector('[data-error]').textContent=rawPhone&&!phone? (state.lang==='ar'? 'أدخل رقم الهاتف مع رمز الدولة، مثل +33 أو +49.':state.lang==='en'? 'Include the country code for foreign numbers, such as +33 or +49.':'Pour un numéro étranger, ajoutez l’indicatif pays, par exemple +33 ou +49.'):t('invalid');
      return
    }
    var btn=form.querySelector('[type=submit]'),ref;
    try {
      ref=retryRef('kiwiHotelBookingRef','hotel_',form);
      await submitRequest(form, 'kiwiHotelBookingRef', ref, {
          roomTypeId:state.service.id,checkIn: state.checkIn,checkOut: state.checkOut,partySize: state.partySize,expectedTotal: state.service.total,customer: {
            name: name,phone: phone,email: email
          }
          ,note: fd.get('note')
      }, hotelSuccess);
    }
    catch(err) {
      btn.disabled=false;
      if(err.message==='rate-changed') {
        form.querySelector('[data-error]').textContent=state.lang==='ar'? 'تغيّر السعر. ارجع وراجع السعر الجديد قبل التأكيد.':state.lang==='en'? 'The rate changed. Go back and review the new total before confirming.':'Le tarif a changé. Revenez vérifier le nouveau total avant de confirmer.';
        app.querySelector('[data-back]').onclick=loadHotelRooms;
        return
      }
      showFormError(form, err.message, ssGet('kiwiHotelBookingRef') !== ref);
      if(err.message==='room-unavailable') setTimeout(loadHotelRooms,900)
    }
  }

  function hotelSuccess(j) {
    rememberManage(j);
    var requested=j.status==='requested';
    if(Number.isFinite(+j.total)) state.service.total=+j.total;
    layout('<div class="bk-success"><div class="bk-success-mark">✓</div><h2>'+esc(requested? ht('requested'):ht('success'))+'</h2><p>'+esc(t('successSub'))+'</p><div class="bk-code"><span>'+esc(t('reference'))+'</span><strong>'+esc(j.code)+'</strong></div>'+hotelSummary()+manageBlock(j)+'</div>');
    wireManageBlock()
  }

  return Object.freeze({ phoneValue, emailOk, badEmailMsg, paymentNote, details, submit, success, hotelDetails, submitHotel, hotelSuccess });
}
