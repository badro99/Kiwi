/* Booking manage. Exports: rememberManage, manageHref, manageBlock, wireManageBlock, mt, statusLabel, manageRows, renderManage, cancelBooking, openManage.
 * Reads only the declared context below and standard browser APIs.
 * Shared booking state belongs to the entry owner; counters stay private. */
export function createBookingManage(context) {
  'use strict';
  const { owner, app, merchant, manageToken, t, ht, esc, money, fmt, layout, closed } = context;
  const state = owner.getState();

  /* ── LE LIEN DE GESTION ────────────────────────────────────────────────────
   * Le serveur frappait un jeton de gestion que personne ne recevait : la page
   * l'ignorait, effaçait la référence de session et n'affichait le code qu'une
   * fois. Fermer l'onglet rendait la réservation inatteignable pour toujours.
   * On garde donc le lien ici — visible, copiable, et rangé dans ce navigateur
   * pour qu'un retour sur la page le retrouve tout seul. */
  function rememberManage(j) {
    if(!j||!j.manageToken) return;
    try {
      var all=JSON.parse(localStorage.getItem('kiwiBookingManage')||'{}');
      if(!all||typeof all!=='object') all={
      }
        ;
      all[merchant+':'+j.code]={
        merchant: merchant,code: j.code,token: j.manageToken,at: Date.now(),sent: !!j.confirmationSent
      }
        ;
      /* Retention is per venue first: bookings at another venue must never push
         out the only recoverable link of this one. A browser-wide cap stays as a
         guard, and when it bites, links already e-mailed to the guest go first. */
      var byAge=Object.keys(all).filter(function(k) {
        return all[k]&&all[k].token
      }
      ).sort(function(a,b) {
        return (all[b].at||0)-(all[a].at||0)
      }
      ),dropped=0,kept={
      }
        ;
      /* Over a cap, links already e-mailed to the guest go first (oldest first);
         an unemailed link, the guest's only way back in, is dropped last, never
         the one just stored, and the drop is counted so the page can say so. */
      var trim=function(keys,limit) {
        var over=keys.length-limit;
        if(over<=0) return keys;
        var drop={
        }
          ;
        var mine=merchant+':'+j.code;
        keys.slice().reverse().filter(function(k) {
          return all[k].sent&&k!==mine
        }
        ).concat(keys.slice().reverse().filter(function(k) {
          return !all[k].sent&&k!==mine
        }
        )).slice(0,over).forEach(function(k) {
          drop[k]=1;
          if(!all[k].sent) dropped++
        }
        );
        return keys.filter(function(k) {
          return !drop[k]
        }
        )
      }
        ,groups={
        }
        ;
      byAge.forEach(function(k) {
        var v=String(all[k].merchant||k.split(':')[0]);
        (groups[v]=groups[v]||[]).push(k)
      }
      );
      var pool=[];
      Object.keys(groups).forEach(function(v) {
        pool=pool.concat(trim(groups[v],20))
      }
      );
      pool=trim(pool.sort(function(a,b) {
        return (all[b].at||0)-(all[a].at||0)
      }
      ),120);
      rememberManage.evictedUnsent=dropped;
      pool.forEach(function(k) {
        kept[k]=all[k]
      }
      );
      localStorage.setItem('kiwiBookingManage',JSON.stringify(kept)); rememberManage.storageFailed = false;
    }
    catch(_) {
      rememberManage.storageFailed = true; console.warn("[booking] recovery-link storage unavailable");
    }
  }

  function manageHref(j) {
    if(!j||!j.manageToken) return '';
    return j.manageUrl||(location.origin+location.pathname+'?merchant='+encodeURIComponent(merchant)+'&manage='+encodeURIComponent(j.manageToken))
  }

  function manageBlock(j) {
    var href=manageHref(j);
    if(!href) return '';
    var sent=!!j.confirmationSent;
    return '<div class="bk-manage-link"><p>'+esc(mt('keep'))+(rememberManage.storageFailed? ' '+esc(mt('notStored')):'')+(rememberManage.evictedUnsent? ' '+esc(mt('evicted')):'')+(sent? ' '+esc(mt('sent')):'')+'</p><a href="'+esc(href)+'">'+esc(mt('open'))+'</a><button type="button" data-copy-manage data-href="'+esc(href)+'">'+esc(mt('copy'))+'</button></div>'
  }

  function wireManageBlock() {
    var b=app.querySelector('[data-copy-manage]');
    if(!b) return;
    b.onclick=function() {
      var done=function() {
        b.textContent=mt('copied')
      }
        ,fallback=function() {
          var i=app.querySelector('[data-manage-copy-fallback]');
          if(!i) {
            i=document.createElement('input');
            i.setAttribute('data-manage-copy-fallback','');
            i.readOnly=true;
            i.setAttribute('aria-label',mt('open'));
            b.parentNode.appendChild(i)
          }
          i.value=b.dataset.href;
          b.textContent=mt('copyFailed');
          i.focus();
          i.select();
        }
        ;
      try {
        if(navigator.clipboard&&navigator.clipboard.writeText) {
          navigator.clipboard.writeText(b.dataset.href).then(done,fallback)
        }
        else {
          var i=document.createElement('input');
          i.value=b.dataset.href;
          document.body.appendChild(i);
          i.select();
          var copied=false;
          try {
            copied=document.execCommand('copy')
          }
          finally {
            i.remove()
          }
          if(copied) done();
          else fallback();
        }
      }
      catch(_) {
        fallback()
      }
    }
      ;
  }

  var M={
    fr: {
      uncertain: 'Connexion interrompue. Votre annulation a peut-être été enregistrée. Rouvrez ce lien pour vérifier, ou réessayez : une annulation répétée est sans effet.',notStored: 'Lien non enregistré sur ce navigateur. Copiez-le avant de fermer cette page.',evicted: 'Un ancien lien de réservation non envoyé par e-mail a été retiré de ce navigateur pour faire de la place.',keep: 'Conservez ce lien pour retrouver ou annuler votre réservation.',sent: 'Il vous a aussi été envoyé par e-mail.',open: 'Ouvrir ma réservation',copy: 'Copier le lien',copied: 'Lien copié',copyFailed: 'Copie impossible. Sélectionnez et copiez ce lien.',title: 'Votre réservation',cancel: 'Annuler ma réservation',cancelSure: 'Confirmer l’annulation',keepIt: 'Garder ma réservation',cancelled: 'Réservation annulée',cancelledSub: 'L’établissement en a été informé.',notFound: 'Ce lien de réservation n’est plus valide.',closedWindow: 'Le délai d’annulation en ligne est passé. Appelez l’établissement.',until: 'Annulable en ligne jusqu’au {d}',statusRequested: 'En attente de confirmation',statusConfirmed: 'Confirmée',statusCancelled: 'Annulée',statusOther: 'Traitée par l’établissement',failed: 'L’annulation n’a pas pu être enregistrée. Réessayez.'
    }
    ,en: {
      uncertain: 'The connection dropped. Your cancellation may already be saved. Reopen this link to check, or try again: repeating a cancellation has no effect.',notStored: 'Link not saved in this browser. Copy it before closing this page.',evicted: 'An older booking link that was not e-mailed to you was removed from this browser to make room.',keep: 'Keep this link to view or cancel your booking.',sent: 'It was also emailed to you.',open: 'Open my booking',copy: 'Copy link',copied: 'Link copied',copyFailed: 'Unable to copy. Select and copy this link.',title: 'Your booking',cancel: 'Cancel my booking',cancelSure: 'Confirm cancellation',keepIt: 'Keep my booking',cancelled: 'Booking cancelled',cancelledSub: 'The venue has been notified.',notFound: 'This booking link is no longer valid.',closedWindow: 'The online cancellation window has closed. Please call the venue.',until: 'Cancellable online until {d}',statusRequested: 'Awaiting confirmation',statusConfirmed: 'Confirmed',statusCancelled: 'Cancelled',statusOther: 'Handled by the venue',failed: 'The cancellation could not be saved. Please try again.'
    }
    ,ar: {
      uncertain: 'انقطع الاتصال. قد يكون الإلغاء قد سُجّل. أعد فتح هذا الرابط للتحقق أو حاول مرة أخرى: تكرار الإلغاء لا يؤثر.',notStored: 'لم يُحفظ الرابط في هذا المتصفح. انسخه قبل إغلاق هذه الصفحة.',evicted: 'أُزيل من هذا المتصفح رابط حجز قديم لم يُرسل إليك بالبريد لإفساح المجال.',keep: 'احتفظ بهذا الرابط لعرض حجزك أو إلغائه.',sent: 'وقد أُرسل إليك أيضاً بالبريد الإلكتروني.',open: 'فتح حجزي',copy: 'نسخ الرابط',copied: 'تم نسخ الرابط',copyFailed: 'تعذر النسخ. حدد هذا الرابط وانسخه.',title: 'حجزك',cancel: 'إلغاء الحجز',cancelSure: 'تأكيد الإلغاء',keepIt: 'الاحتفاظ بالحجز',cancelled: 'تم إلغاء الحجز',cancelledSub: 'تم إخبار المؤسسة.',notFound: 'هذا الرابط لم يعد صالحاً.',closedWindow: 'انتهت مهلة الإلغاء عبر الإنترنت. اتصل بالمؤسسة.',until: 'يمكن الإلغاء عبر الإنترنت حتى {d}',statusRequested: 'في انتظار التأكيد',statusConfirmed: 'مؤكّد',statusCancelled: 'ملغى',statusOther: 'بعهدة المؤسسة',failed: 'تعذّر تسجيل الإلغاء. حاول مرة أخرى.'
    }
  }
    ;

  function mt(k) {
    return (M[state.lang]||M.fr)[k]||k
  }

  /* ── L'ÉCRAN DE GESTION ────────────────────────────────────────────────────
   * Une réservation, son état, et le seul geste que la cliente peut faire
   * seule : annuler — tant que le délai publié par l'établissement le permet.
   * Passé ce délai, on ne montre pas un bouton qui échouerait : on dit
   * d'appeler. */
  function statusLabel(s) {
    return s==='requested'? mt('statusRequested'):s==='confirmed'? mt('statusConfirmed'):s==='cancelled'? mt('statusCancelled'):mt('statusOther')
  }

  function manageRows(bk) {
    var rows=[];
    if(bk.hotel) {
      rows.push([ht('room'),bk.hotel.roomTypeName]);
      rows.push([ht('stay'),esc(fmt(Date.parse(bk.hotel.checkIn+'T12:00:00'),{
        day: 'numeric',month: 'short'
      }
      ))+' → '+esc(fmt(Date.parse(bk.hotel.checkOut+'T12:00:00'),{
        day: 'numeric',month: 'short'
      }
      ))]);
      if(Number.isFinite(+bk.hotel.total)) rows.push([ht('total'),money(bk.hotel.total)])
    }
    else {
      rows.push([t('when'),fmt(bk.startAt,{
        weekday: 'long',day: 'numeric',month: 'long',hour: '2-digit',minute: '2-digit'
      }
      )]);
      if(+bk.partySize>1) rows.push([t('guests'),String(bk.partySize)])
    }
    return rows.map(function(r) {
      return '<div><span>'+esc(r[0])+'</span><strong>'+esc(r[1])+'</strong></div>'
    }
    ).join('')
  }

  function renderManage(data,mode,message) {
    var bk=data.booking,open=(bk.status==='requested'||bk.status==='confirmed'),inWindow=Date.now()<=+data.cancellableUntil;
    state.step=3;
    var actions='';
    if(bk.status==='cancelled') actions='';
    else if(!open) actions='';
    else if(!inWindow) actions='<p class="bk-manage-note">'+esc(mt('closedWindow'))+'</p>';
    else if(mode==='confirm') actions='<div class="bk-actions"><button class="bk-btn" data-manage-keep>'+esc(mt('keepIt'))+'</button><button class="bk-btn primary" data-manage-do>'+esc(mt('cancelSure'))+'</button></div>';
    else actions='<p class="bk-manage-note">'+esc(mt('until').replace('{d}',fmt(+data.cancellableUntil,{
      day: 'numeric',month: 'long',hour: '2-digit',minute: '2-digit'
    }
    )))+'</p><div class="bk-actions"><button class="bk-btn" data-manage-ask>'+esc(mt('cancel'))+'</button></div>';
    layout('<div class="bk-panel"><header class="bk-head"><span>'+esc(statusLabel(bk.status))+'</span><h2>'+esc(bk.status==='cancelled'? mt('cancelled'):mt('title'))+'</h2><p>'+esc(bk.status==='cancelled'? mt('cancelledSub'):(data.name||''))+'</p></header><div class="bk-code"><span>'+esc(t('reference'))+'</span><strong>'+esc(bk.code)+'</strong></div><div class="bk-summary">'+manageRows(bk)+'</div>'+(message? '<div class="bk-error">'+esc(message)+'</div>':'')+actions+'</div>');
    var ask=app.querySelector('[data-manage-ask]');
    if(ask) ask.onclick=function() {
      renderManage(data,'confirm','')
    }
      ;
    var keep=app.querySelector('[data-manage-keep]');
    if(keep) keep.onclick=function() {
      renderManage(data,'','')
    }
      ;
    state.manageData=data;
    var go=app.querySelector('[data-manage-do]');
    if(go) go.onclick=function() {
      go.disabled=true;
      cancelBooking(data)
    }
      ;
  }

  async function cancelBooking(data) {
    var sent=false;
    try {
      var deadline=await import('./request-deadline.mjs'),r;
      sent=true;
      r=await deadline.deadlineFetch('/api/booking',{
        method: 'DELETE',headers: {
          'Content-Type': 'application/json'
        }
        ,body: JSON.stringify({
          merchant: merchant,manageToken: manageToken
        }
        )
      }
      );
      var j=await r.json().catch(function() {
        throw new Error('response-uncertain')
      }
      );
      if(!r.ok) throw Object.assign(new Error(j.error||'error'),{ answered: true });
      data.booking.status='cancelled';
      renderManage(data,'','');
    }
    catch(err) {
      /* Once the DELETE left this page, a lost answer says nothing about what the
         server did. Look the booking up again: if it is cancelled, say so; if not,
         the outcome is uncertain, never "could not be saved". */
      if(sent&&!err.answered&&err.message!=='request-timeout') {
        try {
          var g=await (await import('./request-deadline.mjs')).deadlineFetch('/api/booking?merchant='+encodeURIComponent(merchant)+'&manage='+encodeURIComponent(manageToken),{
            credentials: 'omit'
          }
          ),gj=await g.json();
          if(g.ok&&gj&&gj.booking&&gj.booking.status==='cancelled') {
            state.config=gj&&gj.booking&&gj.booking.hotel? Object.assign({},gj,{kind:'hotel'}):gj;
            renderManage(gj,'','');
            return
          }
        }
        catch(_) {
        }
        renderManage(data,'',mt('uncertain'));
        return
      }
      renderManage(data,'',err.message==='request-timeout'? t('timeout'):err.message==='cancellation-closed'? mt('closedWindow'):mt('failed'));
    }
  }

  async function openManage() {
    try {
      var r=await (await import('./request-deadline.mjs')).deadlineFetch('/api/booking?merchant='+encodeURIComponent(merchant)+'&manage='+encodeURIComponent(manageToken),{
        credentials: 'omit'
      }
      ),j=await r.json();
      if(!r.ok) throw new Error(j.error||'error');
      /* B25 · un séjour garde la présentation de l'hôtel sur sa page de gestion. */
      state.config=j&&j.booking&&j.booking.hotel? Object.assign({},j,{kind:'hotel'}):j;
      renderManage(j,'','');
    }
    catch(err) {
      closed(err.message==='request-timeout'? t('timeout'):err.message==='not-found'? mt('notFound'):t('error'))
    }
  }

  return Object.freeze({ rememberManage, manageHref, manageBlock, wireManageBlock, mt, statusLabel, manageRows, renderManage, cancelBooking, openManage });
}
