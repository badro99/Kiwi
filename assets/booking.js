(async function() {
  'use strict';
  var app=document.getElementById('booking-app'),q=new URLSearchParams(location.search),merchant=String(q.get('merchant')||'').trim().toLowerCase(),manageToken=String(q.get('manage')||'').trim().toLowerCase();
  /* Stockage refusé (navigation privée stricte, cookies bloqués, iframe tiers) :
   * y toucher lève une SecurityError. La page publique doit s'afficher quand
   * même ; elle oublie simplement la langue choisie et la référence d'envoi. */
  function lsGet(k) {
    try {
      return localStorage.getItem(k)
    }
    catch(_) {
      return null
    }
  }
  function lsSet(...args) { return parts.view.lsSet(...args); }
  function ssGet(...args) { return parts.view.ssGet(...args); }
  function ssSet(...args) { return parts.view.ssSet(...args); }
  function ssDel(...args) { return parts.view.ssDel(...args); }
  /* French is the predictable first visit for Kiwi Morocco. Browser language
   * used to turn an unpublished café into an English dead-end; visitors can
   * still choose EN or Arabic and that explicit choice is remembered. */
  var state={
    lang: (lsGet('kiwiBookingLang')||document.documentElement.lang||'fr').slice(0,2),step: 1,config: null,service: null,date: '',slot: null,partySize: 2,checkIn: '',checkOut: '',hotelRooms: [],loading: false,error: ''
  }
    ;
  if(['fr','en','ar'].indexOf(state.lang)<0) state.lang='fr';
  /* booking view declaration 4 */
  /* booking view declaration 5 */
  function t(...args) { return parts.view.t(...args); }
  function ht(...args) { return parts.view.ht(...args); }
  function esc(...args) { return parts.view.esc(...args); }
  function money(...args) { return parts.view.money(...args); }
  function phoneValue(...args) { return parts.submission.phoneValue(...args); }
  function emailOk(...args) { return parts.submission.emailOk(...args); }
  function badEmailMsg(...args) { return parts.submission.badEmailMsg(...args); }
  /* booking view declaration 10 */
  function vtz(...args) { return parts.view.vtz(...args); }
  function ymd(...args) { return parts.view.ymd(...args); }
  function fmt(...args) { return parts.view.fmt(...args); }
  function venueToday(...args) { return parts.view.venueToday(...args); }
  function venueHour(...args) { return parts.view.venueHour(...args); }
  function isHotel(...args) { return parts.view.isHotel(...args); }
  function layout(...args) { return parts.view.layout(...args); }
  function head(...args) { return parts.view.head(...args); }
  function seatCap(...args) { return parts.service.seatCap(...args); }
  function venueCap(...args) { return parts.service.venueCap(...args); }
  function partyCap(...args) { return parts.service.partyCap(...args); }
  function capsDiffer(...args) { return parts.service.capsDiffer(...args); }
  function takesCovers(...args) { return parts.service.takesCovers(...args); }
  function party(...args) { return parts.service.party(...args); }
  function partyControl(...args) { return parts.service.partyControl(...args); }
  function syncParty(...args) { return parts.service.syncParty(...args); }
  function wireParty(...args) { return parts.service.wireParty(...args); }
  /* booking service declaration 9 */
  function queueSlots(...args) { return parts.service.queueSlots(...args); }
  function priceTag(...args) { return parts.service.priceTag(...args); }
  function contextChip(...args) { return parts.service.contextChip(...args); }
  function slotGroups(...args) { return parts.service.slotGroups(...args); }
  function services(...args) { return parts.service.services(...args); }
  function dateButtons(...args) { return parts.service.dateButtons(...args); }
  /* Choisir une autre date ne repeint plus toute la page d'un coup : la rangée
     reste en place, la lentille glisse vers la date choisie (liquid-lens.js),
     les créneaux d'avant pâlissent le temps de la réponse, puis la page se
     repeint quand la lentille est posée. Un clic plus récent gagne toujours :
     une réponse en retard ne repeint plus la date d'avant. */
  /* booking counters are private to search owners */
  function loadSlots(...args) { return parts.service.loadSlots(...args); }
  function times(...args) { return parts.service.times(...args); }
  function renderTimes(...args) { return parts.service.renderTimes(...args); }
  function paymentNote(...args) { return parts.submission.paymentNote(...args); }
  function details(...args) { return parts.submission.details(...args); }
  function submit(...args) { return parts.submission.submit(...args); }
  function rememberManage(...args) { return parts.manage.rememberManage(...args); }
  function manageHref(...args) { return parts.manage.manageHref(...args); }
  function manageBlock(...args) { return parts.manage.manageBlock(...args); }
  function wireManageBlock(...args) { return parts.manage.wireManageBlock(...args); }
  /* booking manage declaration 4 */
  function mt(...args) { return parts.manage.mt(...args); }
  function success(...args) { return parts.submission.success(...args); }
  function plusDays(...args) { return parts.hotel.plusDays(...args); }
  function hotelNights(...args) { return parts.hotel.hotelNights(...args); }
  function hotelDates(...args) { return parts.hotel.hotelDates(...args); }
  function hotelSearch(...args) { return parts.hotel.hotelSearch(...args); }
  function loadHotelRooms(...args) { return parts.hotel.loadHotelRooms(...args); }
  function hotelFacts(...args) { return parts.hotel.hotelFacts(...args); }
  function hotelPhotoUrl(...args) { return parts.hotel.hotelPhotoUrl(...args); }
  function hotelVisual(...args) { return parts.hotel.hotelVisual(...args); }
  function hotelRoomList(...args) { return parts.hotel.hotelRoomList(...args); }
  function hotelSummary(...args) { return parts.hotel.hotelSummary(...args); }
  function hotelDetails(...args) { return parts.submission.hotelDetails(...args); }
  function submitHotel(...args) { return parts.submission.submitHotel(...args); }
  function hotelSuccess(...args) { return parts.submission.hotelSuccess(...args); }
  function statusLabel(...args) { return parts.manage.statusLabel(...args); }
  function manageRows(...args) { return parts.manage.manageRows(...args); }
  function renderManage(...args) { return parts.manage.renderManage(...args); }
  function cancelBooking(...args) { return parts.manage.cancelBooking(...args); }
  function openManage(...args) { return parts.manage.openManage(...args); }

  app.addEventListener('keydown',function(e) {
    var b=e.target.closest('[data-date],[data-slot]');
    if(!b) return;
    var date=b.hasAttribute('data-date'),keys=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'];
    if(keys.indexOf(e.key)<0) return;
    var all=[...app.querySelectorAll(date? '[data-date]':'[data-slot]')],i=all.indexOf(b),rtl=state.lang==='ar',delta=e.key==='ArrowDown'? (date? 7:4):e.key==='ArrowUp'? (date? -7:-4):e.key==='ArrowRight'? (rtl? -1:1):(rtl? 1:-1);
    var n=e.key==='Home'? 0:e.key==='End'? all.length-1:Math.max(0,Math.min(all.length-1,i+delta));
    e.preventDefault();
    all[n]?.focus();
  }
  );
  function wireGlobal(...args) { return parts.view.wireGlobal(...args); }
  function closed(...args) { return parts.view.closed(...args); }
  async function init() {
    if(!merchant) {
      closed(t('closed'));
      return
    }
    if(manageToken) {
      openManage();
      return
    }
    try {
      var r=await (await import('./request-deadline.mjs').catch(function() {
        return {
          deadlineFetch: function(u,o) {
            return fetch(u,o);
          }
        }
          ;
      }
      )).deadlineFetch('/api/booking?merchant='+encodeURIComponent(merchant),{
        credentials: 'omit'
      }
      ),j=await r.json();
      if(!r.ok) throw new Error(j.error||'error');
      state.config=j;
      if(j.kind==='hotel') {
        if(!j.hotel||!j.hotel.categories||!j.hotel.categories.length) throw new Error('booking-closed');
        hotelSearch();
        return
      }
      if(!j.services||!j.services.length) throw new Error('booking-closed');
      if(j.hoursSet===false) {
        state.closedKey='noHours';
        closed(t('noHours'));
        return
      }
      services()
    }
    catch(err) {
      closed(err.message==='request-timeout'? t('timeout'):err.message==='booking-closed'? t('closed'):t('error'))
    }
  }
  const owner = Object.freeze({ getState() { return state; } });
  const parts = {};
  await Promise.all([
    import('/assets/booking-service.js?v=2').then(module => { parts.service = module.createBookingService({ owner, app, merchant, plusDays, details, t, esc, money, fmt, venueToday, venueHour, layout, head }); }),
    import('/assets/booking-hotel.js?v=2').then(module => { parts.hotel = module.createBookingHotel({ owner, app, merchant, hotelDetails, t, ht, esc, money, ymd, fmt, venueToday, layout, head }); }),
    import('/assets/booking-submission.js?v=5').then(module => { parts.submission = module.createBookingSubmission({ owner, app, merchant, takesCovers, party, times, loadHotelRooms, hotelRoomList, hotelSummary, rememberManage, manageBlock, wireManageBlock, ssGet, ssSet, ssDel, t, ht, esc, money, fmt, layout, head }); }),
    import('/assets/booking-manage.js?v=2').then(module => { parts.manage = module.createBookingManage({ owner, app, merchant, manageToken, t, ht, esc, money, fmt, layout, closed }); }),
    import('/assets/booking-view.js?v=2').then(module => { parts.view = module.createBookingView({ owner, app, services, times, hotelSearch, hotelRoomList, details, success, hotelDetails, renderManage }); })
  ]);
  init();
}
  ());
