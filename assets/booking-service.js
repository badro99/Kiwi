/* Booking service. Exports: seatCap, venueCap, partyCap, capsDiffer, takesCovers, party, partyControl, syncParty, wireParty, queueSlots, priceTag, contextChip, slotGroups, services, dateButtons, loadSlots, times, renderTimes.
 * Reads only the declared context below and standard browser APIs.
 * Shared booking state belongs to the entry owner; counters stay private. */
export function createBookingService(context) {
  'use strict';
  const { owner, app, merchant, plusDays, details, t, esc, money, fmt, venueToday, venueHour, layout, head } = context;
  const state = owner.getState();
  var slotSeq=0;

  /* Whether the venue counts covers is a fact about its tables, not about the
   * free-text trade label — that label is blank on most merchants, and gating
   * the stepper on a regex over it silently sent every restaurant booking to
   * the venue as a party of one. maxParty comes from the resources. */
  function seatCap(s) {
    return Math.max(1,Number(s&&s.maxParty||0)|0)
  }

  function venueCap() {
    var m=1;
    ((state.config&&state.config.services)||[]).forEach(function(x) {
      var c=seatCap(x);
      if(c>m) m=c
    }
    );
    return m
  }

  function partyCap() {
    return state.service? seatCap(state.service):venueCap()
  }

  /* Most venues seat every service from the same tables, so a ceiling printed
   * on each card would repeat the same number seven times and differentiate
   * nothing. Print it only where the services really differ. */
  function capsDiffer() {
    var v=((state.config&&state.config.services)||[]).map(seatCap);
    return v.some(function(c) {
      return c!==v[0]
    }
    )
  }

  function takesCovers() {
    return partyCap()>1
  }

  function party() {
    return takesCovers()? Math.min(Math.max(1,state.partySize),partyCap()):1
  }

  function partyControl() {
    return takesCovers()? '<div class="bk-party"><span>'+esc(t('guests'))+'</span><button type="button" data-party-dec aria-label="'+esc(t('guests'))+' −"'+(party()<=1? ' disabled':'')+'>−</button><strong>'+party()+'</strong><button type="button" data-party-inc aria-label="'+esc(t('guests'))+' +"'+(party()>=partyCap()? ' disabled':'')+'>+</button></div>':''
  }

  /* Patch the stepper in place rather than re-rendering the panel: a fresh DOM
 * node on every press throws away keyboard focus, so a guest tabbing to + can
 * only ever add one cover. */
  function syncParty() {
    var active=document.activeElement,n=app.querySelector('.bk-party strong'),dec=app.querySelector('[data-party-dec]'),inc=app.querySelector('[data-party-inc]');
    if(n) n.textContent=party();
    if(dec) dec.disabled=party()<=1;
    if(inc) inc.disabled=party()>=partyCap();
    if(active===dec&&dec.disabled&&inc&&!inc.disabled) inc.focus();
    else if(active===inc&&inc.disabled&&dec&&!dec.disabled) dec.focus()
  }

  function wireParty(after) {
    var dec=app.querySelector('[data-party-dec]'),inc=app.querySelector('[data-party-inc]');
    function step(n) {
      var was=party();
      state.partySize=Math.min(partyCap(),Math.max(1,was+n));
      if(party()===was) return;
      syncParty();
      if(after) after()
    }
    if(dec) dec.onclick=function() {
      step(-1)
    }
      ;
    if(inc) inc.onclick=function() {
      step(1)
    }
  }

  /* Stepping 2 -> 20 is eighteen presses; without this it was eighteen availability
   * calls. Grey the stale grid immediately so nobody books a slot that no longer
   * fits, then ask the server once the guest has settled on a number. */
  var partyTimer=0;

  function queueSlots() {
    state.error='';
    state.slot=null;
    clearTimeout(partyTimer);
    var g=app.querySelector('.bk-slot-groups');
    if(g) {
      g.setAttribute('data-stale','');
      g.querySelectorAll('[data-slot]').forEach(function(b) {
        b.setAttribute('aria-disabled','true')
      }
      )
    }
    partyTimer=setTimeout(loadSlots,300)
  }

  /* Un prix nul n'est pas un prix : on écrit « sans frais » en neutre plutôt que « 0 MAD » en vert. */
  function priceTag(s) {
    return +s.price>0? '<b class="bk-price">'+esc(money(s.price))+'</b>':'<b class="bk-price is-free">'+esc(t('free'))+'</b>'
  }

  /* Rappel du choix en cours sur les étapes suivantes, avec retour direct. */
  function contextChip() {
    var s=state.service;
    if(!s) return '';
    return '<div class="bk-context"><strong>'+esc(s.name)+'</strong><i class="bk-dot"></i><span>'+esc(s.duration)+' min</span>'+(+s.price>0? '<i class="bk-dot"></i><span>'+esc(money(s.price))+'</span>':'')+'<button type="button" data-back>'+esc(t('change'))+'</button></div>'
  }

  /* Vingt-sept créneaux en une grille se lisent mal ; groupés par moment de la journée ils se lisent d'un coup d'œil. */
  function slotGroups(slots) {
    var groups=[['periodMorning',0,12],['periodNoon',12,14],['periodAfternoon',14,18],['periodEvening',18,24]];
    return '<div class="bk-slot-groups">'+groups.map(function(g) {
      var rows=slots.filter(function(s) {
        var h=venueHour(s.startAt);
        return h>=g[1]&&h<g[2]
      }
      );
      if(!rows.length) return '';
      return '<div class="bk-slot-group"><div class="bk-period">'+esc(t(g[0]))+'</div><div class="bk-slots">'+rows.map(function(s) {
        return '<button class="bk-slot" data-slot="'+s.startAt+'">'+esc(fmt(s.startAt,{
          hour: '2-digit',minute: '2-digit'
        }
        ))+'</button>'
      }
      ).join('')+'</div></div>'
    }
    ).join('')+'</div>'
  }

  function services() {
    state.service=null;
    state.step=1;
    layout('<div class="bk-panel">'+head(t('choose'),t('chooseSub'))+partyControl()+'<div class="bk-grid">'+state.config.services.map(function(s) {
      return '<button class="bk-choice" data-service="'+esc(s.id)+'"><div class="bk-choice-body"><strong>'+esc(s.name)+'</strong><p>'+esc(s.duration)+' min'+(capsDiffer()&&seatCap(s)>1? ' · '+esc(t('upTo')).replace('{n}',seatCap(s)):'')+'</p></div><div class="bk-choice-side"><div>'+priceTag(s)+(s.deposit? '<small>'+esc(t('deposit'))+' '+esc(money(s.deposit))+'</small>':'')+'</div><i class="bk-go" aria-hidden="true"></i></div></button>'
    }
    ).join('')+'</div></div>');
    wireParty();
    app.querySelectorAll('[data-service]').forEach(function(b) {
      b.onclick=function() {
        state.service=state.config.services.find(function(s) {
          return s.id===b.dataset.service
        }
        );
        state.partySize=party();
        state.date=plusDays(venueToday(),1);
        state.slot=null;
        times()
      }
    }
    )
  }

  function dateButtons() {
    var out=[],today=venueToday();
    for(var i=0;
      i<=Number((state.config.settings||{
      }
      ).windowDays||60);
      i++) {
      var v=plusDays(today,i),d=Date.parse(v+'T12:00:00Z');
      out.push('<button class="bk-date'+(v===state.date? ' on':'')+'" data-date="'+v+'" aria-pressed="'+(v===state.date)+'"><span>'+esc(fmt(d,{
        weekday: 'short'
      }
      ))+'</span><strong>'+esc(+v.slice(8))+'</strong><small>'+esc(fmt(d,{
        month: 'short'
      }
      ))+'</small></button>')
    }
    return out.join('')
  }

  async function loadSlots(o) {
    var seq=++slotSeq,glide=!!(o&&o.glide),settle=glide? new Promise(function(r) {
      setTimeout(r,330)
    }
    ):null;
    state.loading=true;
    state.error='';
    if(glide) {
      var old=app.querySelector('.bk-slot-groups,.bk-slots,.bk-empty');
      if(old) {
        old.setAttribute('data-stale','');
        old.querySelectorAll('[data-slot]').forEach(function(b) {
          b.setAttribute('aria-disabled','true')
        }
        )
      }
    }
    else renderTimes([]);
    try {
      var r=await (await import('./request-deadline.mjs').catch(function() {
        return {
          deadlineFetch: function(u,o) {
            return fetch(u,o);
          }
        }
          ;
      }
      )).deadlineFetch('/api/booking?merchant='+encodeURIComponent(merchant)+'&service='+encodeURIComponent(state.service.id)+'&date='+encodeURIComponent(state.date)+'&partySize='+encodeURIComponent(party()),{
        credentials: 'omit'
      }
      ),j=await r.json();
      if(!r.ok) throw new Error(j.error||'error');
      if(settle) await settle;
      if(seq!==slotSeq) return;
      var keep=state.service&&state.service.id;
      state.config=j;
      if(keep) state.service=(j.services||[]).find(function(s) {
        return s.id===keep
      }
      )||state.service;
      state.loading=false;
      renderTimes(j.slots||[])
    }
    catch(err) {
      if(settle) await settle;
      if(seq!==slotSeq) return;
      state.loading=false;
      state.error=err.message==='request-timeout'? t('timeout'):t('error');
      renderTimes([])
    }
  }

  function times() {
    state.step=2;
    loadSlots()
  }

  function renderTimes(slots) {
    var oldRow=app.querySelector('.bk-date-row'),sl=oldRow? oldRow.scrollLeft:0;
    layout('<div class="bk-panel">'+head(t('time'),t('timeSub'))+contextChip()+partyControl()+'<div class="bk-date-row">'+dateButtons()+'</div>'+(state.loading? '<div class="bk-loading" style="min-height:180px"><span></span></div>':slots.length? slotGroups(slots):'<div class="bk-empty">'+esc(state.error||t('noSlots'))+'</div>')+'<div class="bk-actions"><button class="bk-btn" data-back>'+esc(t('back'))+'</button></div></div>');
    var row=app.querySelector('.bk-date-row');
    if(row&&sl) row.scrollLeft=sl;
    wireParty(queueSlots);
    app.querySelectorAll('[data-date]').forEach(function(b) {
      b.onclick=function() {
        if(b.dataset.date===state.date&&!state.loading) return;
        state.date=b.dataset.date;
        state.error='';
        state.slot=null;
        app.querySelectorAll('[data-date]').forEach(function(x) {
          x.classList.toggle('on',x===b);
          x.setAttribute('aria-pressed',String(x===b))
        }
        );
        loadSlots({
          glide: true
        }
        )
      }
    }
    );
    app.querySelectorAll('[data-slot]').forEach(function(b) {
      b.onclick=function() {
        if(state.loading||b.closest('[data-stale]')) return;
        state.slot=+b.dataset.slot;
        details()
      }
    }
    );
    app.querySelectorAll('[data-back]').forEach(function(b) {
      b.onclick=services
    }
    )
  }

  return Object.freeze({ seatCap, venueCap, partyCap, capsDiffer, takesCovers, party, partyControl, syncParty, wireParty, queueSlots, priceTag, contextChip, slotGroups, services, dateButtons, loadSlots, times, renderTimes });
}
