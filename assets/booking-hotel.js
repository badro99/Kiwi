/* Booking hotel. Exports: plusDays, hotelNights, hotelDates, hotelSearch, loadHotelRooms, hotelFacts, hotelPhotoUrl, hotelVisual, hotelRoomList, hotelSummary.
 * Reads only the declared context below and standard browser APIs.
 * Shared booking state belongs to the entry owner; counters stay private. */
export function createBookingHotel(context) {
  'use strict';
  const { owner, app, merchant, hotelDetails, t, ht, esc, money, ymd, fmt, venueToday, layout, head } = context;
  const state = owner.getState();
  var hotelSeq=0;

  function plusDays(value,n) {
    var d=new Date(value+'T12:00:00');
    d.setDate(d.getDate()+n);
    return ymd(d)
  }

  function hotelNights() {
    return Math.max(0,Math.round((Date.parse(state.checkOut+'T12:00:00Z')-Date.parse(state.checkIn+'T12:00:00Z'))/86400000))
  }

  function hotelDates() {
    return esc(fmt(Date.parse(state.checkIn+'T12:00:00'),{
      day: 'numeric',month: 'short'
    }
    ))+' → '+esc(fmt(Date.parse(state.checkOut+'T12:00:00'),{
      day: 'numeric',month: 'short'
    }
    ))
  }

  function hotelSearch() {
    state.step=1;
    state.service=null;
    if(!state.checkIn) {
      state.checkIn=plusDays(venueToday(),1);
      state.checkOut=plusDays(state.checkIn,1)
    }
    var max=plusDays(venueToday(),Number((state.config.settings||{
    }
    ).windowDays||60));
    layout('<div class="bk-panel">'+head(ht('search'),ht('searchSub'))+'<form class="bk-hotel-search" data-hotel-search><label class="bk-field"><span>'+esc(ht('checkIn'))+'</span><input name="checkIn" type="date" min="'+venueToday()+'" max="'+max+'" value="'+esc(state.checkIn)+'" required></label><label class="bk-field"><span>'+esc(ht('checkOut'))+'</span><input name="checkOut" type="date" min="'+esc(plusDays(state.checkIn,1))+'" max="'+esc(plusDays(max,365))+'" value="'+esc(state.checkOut)+'" required></label><label class="bk-field"><span>'+esc(ht('guests'))+'</span><select name="guests">'+[1,2,3,4,5,6,7,8,9,10,11,12].map(function(n) {
      return '<option value="'+n+'"'+(n===state.partySize? ' selected':'')+'>'+n+'</option>'
    }
    ).join('')+'</select></label><button class="bk-btn primary" type="submit">'+esc(ht('find'))+'</button><p class="bk-error" data-error role="alert" aria-live="assertive"></p></form></div>');
    var form=app.querySelector('[data-hotel-search]'),ci=form.elements.checkIn,co=form.elements.checkOut;
    ci.onchange=function() {
      co.min=plusDays(ci.value,1);
      if(!co.value||co.value<=ci.value) co.value=plusDays(ci.value,1)
    }
      ;
    form.onsubmit=function(e) {
      e.preventDefault();
      state.checkIn=ci.value;
      state.checkOut=co.value;
      state.partySize=+form.elements.guests.value||1;
      if(!state.checkIn||!state.checkOut||state.checkOut<=state.checkIn) {
        form.querySelector('[data-error]').textContent=ht('invalidDates');
        return
      }
      loadHotelRooms()
    }
  }

  async function loadHotelRooms() {
    var seq=++hotelSeq;
    state.step=2;
    state.loading=true;
    state.error='';
    state.hotelRooms=[];
    hotelRoomList();
    try {
      var u='/api/booking?merchant='+encodeURIComponent(merchant)+'&checkIn='+encodeURIComponent(state.checkIn)+'&checkOut='+encodeURIComponent(state.checkOut)+'&guests='+encodeURIComponent(state.partySize),r=await (await import('./request-deadline.mjs').catch(function() {
        return {
          deadlineFetch: function(u,o) {
            return fetch(u,o);
          }
        }
          ;
      }
      )).deadlineFetch(u,{
        credentials: 'omit'
      }
      ),j=await r.json();
      if(!r.ok) throw new Error(j.error||'error');
      if(seq!==hotelSeq) return;
      state.config=j;
      state.hotelRooms=(j.hotel&&j.hotel.categories)||[];
      state.loading=false;
      hotelRoomList()
    }
    catch(err) {
      if(seq!==hotelSeq) return;
      state.loading=false;
      state.error=err.message==='request-timeout'? t('timeout'):err.message==='invalid-dates'? ht('invalidDates'):t('error');
      hotelRoomList()
    }
  }

  function hotelFacts(room) {
    var facts=[];
    if(room.beds) facts.push('<span><b>'+esc(ht('beds'))+'</b>'+esc(room.beds)+'</span>');
    if(room.sizeM2) facts.push('<span><b>'+esc(ht('size'))+'</b>'+esc(room.sizeM2)+' m²</span>');
    if(room.view) facts.push('<span><b>'+esc(ht('view'))+'</b>'+esc(room.view)+'</span>');
    return facts.join('')
  }

  function hotelPhotoUrl(v) {
    v=String(v||'');
    return /^\/api\/media\/(?:media\/)?[a-z0-9][a-z0-9-]{2,63}\/(?:hotel-room\/)?[a-z0-9-]{6,80}\.(?:jpe?g|png|webp|gif|avif)$/i.test(v)? v:''
  }

  function hotelVisual(room) {
    var photos=(room.photos||[]).map(function(p) {
      return {
        url: hotelPhotoUrl(p&&p.url),alt: String(p&&p.alt||room.name||'').slice(0,120)
      }
    }
    ).filter(function(p) {
      return p.url
    }
    ).slice(0,8),fallback='<span class="bk-room-letter">'+esc(room.name.slice(0,1).toUpperCase())+'</span><small>'+esc(room.view||room.beds||'Kiwi')+'</small>';
    if(!photos.length) return '<div class="bk-room-visual">'+fallback+'</div>';
    return '<div class="bk-room-visual has-photo" data-hotel-gallery="'+esc(room.id)+'">'+fallback+'<img class="bk-room-cover" src="'+esc(photos[0].url)+'" alt="'+esc(photos[0].alt||room.name)+'" loading="lazy" decoding="async"><div class="bk-room-thumbs">'+photos.map(function(p,i) {
      return '<button type="button" class="'+(i? '':'on')+'" data-hotel-photo="'+esc(room.id)+'" data-src="'+esc(p.url)+'" data-alt="'+esc(p.alt||room.name)+'" aria-label="Photo '+(i+1)+' / '+photos.length+'"><img src="'+esc(p.url)+'" alt="" loading="lazy"></button>'
    }
    ).join('')+'</div></div>'
  }

  function hotelRoomList() {
    layout('<div class="bk-panel">'+head(ht('rooms'),ht('roomsSub'))+'<div class="bk-stay-chip"><strong>'+hotelDates()+'</strong><span>'+state.partySize+' '+esc(ht('guests').toLowerCase())+'</span><button data-hotel-back>'+esc(t('change'))+'</button></div>'+(state.loading? '<div class="bk-loading bk-inline-loading"><span></span></div>':'<div class="bk-room-grid">'+(state.hotelRooms.length? state.hotelRooms.map(function(room) {
      var available=+room.available||0;
      return '<article class="bk-room-card'+(available? '':' is-full')+'">'+hotelVisual(room)+'<div class="bk-room-copy"><div class="bk-room-title"><div><h3>'+esc(room.name)+'</h3><p>'+esc(room.description||'')+'</p></div><span class="bk-room-stock">'+esc(available? ht('available').replace('{n}',available):ht('full'))+'</span></div><div class="bk-room-facts">'+hotelFacts(room)+'</div>'+(room.amenities&&room.amenities.length? '<div class="bk-amenities">'+room.amenities.map(function(x) {
        return '<span>'+esc(x)+'</span>'
      }
      ).join('')+'</div>':'')+'<footer><div><strong>'+esc(money(room.rate))+'</strong><small>'+esc(ht('perNight'))+' · '+hotelNights()+' '+esc(hotelNights()===1? ht('night'):ht('nights'))+'</small></div><div class="bk-room-total"><span>'+esc(ht('total'))+'</span><b>'+esc(money(room.total))+'</b></div><button class="bk-btn primary" data-hotel-room="'+esc(room.id)+'"'+(available? '':' disabled')+'>'+esc(t('next'))+'</button></footer></div></article>'
    }
    ).join(''):'<div class="bk-empty">'+esc(state.error||ht('none'))+'</div>')+'</div>')+'<div class="bk-actions"><button class="bk-btn" data-hotel-back>'+esc(t('back'))+'</button></div></div>');
    app.querySelectorAll('[data-hotel-back]').forEach(function(b) {
      b.onclick=hotelSearch
    }
    );
    app.querySelectorAll('[data-hotel-room]').forEach(function(b) {
      b.onclick=function() {
        state.service=state.hotelRooms.find(function(x) {
          return x.id===b.dataset.hotelRoom
        }
        );
        hotelDetails()
      }
    }
    );
    app.querySelectorAll('[data-hotel-photo]').forEach(function(b) {
      b.onclick=function() {
        var gallery=app.querySelector('[data-hotel-gallery="'+CSS.escape(b.dataset.hotelPhoto)+'"]'),cover=gallery&&gallery.querySelector('.bk-room-cover');
        if(!cover) return;
        cover.src=b.dataset.src;
        cover.alt=b.dataset.alt||'';
        gallery.querySelectorAll('[data-hotel-photo]').forEach(function(x) {
          x.classList.toggle('on',x===b);
          x.setAttribute('aria-pressed',String(x===b))
        }
        )
      }
    }
    );
    app.querySelectorAll('.bk-room-cover,.bk-room-thumbs img').forEach(function(img) {
      img.onerror=function() {
        if(img.classList.contains('bk-room-cover')) img.remove();
        else img.closest('button')&&img.closest('button').remove()
      }
    }
    )
  }

  function hotelSummary() {
    return '<aside class="bk-summary"><div class="bk-summary-head">'+esc(t('recap'))+'</div><div><span>'+esc(ht('room'))+'</span><strong>'+esc(state.service.name)+'</strong></div><div><span>'+esc(ht('stay'))+'</span><strong>'+hotelDates()+' · '+hotelNights()+' '+esc(hotelNights()===1? ht('night'):ht('nights'))+'</strong></div><div><span>'+esc(ht('guests'))+'</span><strong>'+state.partySize+'</strong></div><div><span>'+esc(ht('total'))+'</span><strong>'+esc(money(state.service.total))+'</strong></div></aside>'
  }

  return Object.freeze({ plusDays, hotelNights, hotelDates, hotelSearch, loadHotelRooms, hotelFacts, hotelPhotoUrl, hotelVisual, hotelRoomList, hotelSummary });
}
