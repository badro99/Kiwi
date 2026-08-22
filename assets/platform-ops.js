/* Kiwi operational adapters: uploads, product truth, routing, collaboration,
 * analytics and search. Loaded after platform-kernel.js. */
(function () {
  'use strict';
  var K = window.KiwiPlatform; if (!K) return;
  var PRODUCT_CACHE = 'kiwiProductTruth:v1';

  function clean(v, n) { return String(v == null ? '' : v).trim().slice(0, n || 120); }
  function esc(v) { return clean(v, 500).replace(/[&<>"']/g, function (c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]); }); }
  function readCache() { try { var d=JSON.parse(localStorage.getItem(PRODUCT_CACHE)||'{}'); return d&&typeof d==='object'?d:{}; } catch (_) { return {}; } }
  function writeCache(d) { try { localStorage.setItem(PRODUCT_CACHE, JSON.stringify(d)); } catch (_) {} }
  function timeout(ms) { var c=new AbortController(); var id=setTimeout(function(){c.abort();},ms); return { signal:c.signal, clear:function(){clearTimeout(id);} }; }

  var products = {
    engine: 'Open Food Facts + Kiwi cache', available: function () { return typeof fetch === 'function'; },
    lookup: async function (barcode, opts) {
      barcode = clean(barcode, 32).replace(/\s+/g,'');
      if (!/^\d{8,14}$/.test(barcode)) return { ok:false, found:false, reason:'invalid-barcode' };
      var cache=readCache(), cached=cache[barcode], maxAge=7*86400000;
      if (cached && Date.now()-cached.cachedAt<maxAge && !(opts&&opts.refresh)) return Object.assign({ok:true,source:'cache'},cached.value);
      if (navigator.onLine === false) return cached ? Object.assign({ok:true,source:'stale-cache',stale:true},cached.value) : {ok:false,found:false,reason:'offline'};
      var span=K.telemetry.start('product.lookup',{capability:'products',engine:'open-food-facts'}), timer=timeout(7000);
      try {
        var url='https://world.openfoodfacts.org/api/v2/product/'+encodeURIComponent(barcode)+'.json?fields=code,product_name,product_name_fr,brands,categories_tags,image_front_small_url,quantity,nutriments';
        var res=await fetch(url,{signal:timer.signal,headers:{Accept:'application/json'}});
        if (!res.ok) { span.end('http-error',{status:res.status}); return {ok:false,found:false,reason:'http-'+res.status}; }
        var json=await res.json(), p=json&&json.product;
        if (!p || json.status===0) { span.end('not-found'); return {ok:true,found:false,source:'open-food-facts'}; }
        var value={found:true,barcode:barcode,name:clean(p.product_name_fr||p.product_name,100),brand:clean(p.brands,80),quantity:clean(p.quantity,40),image:/^https:\/\//.test(String(p.image_front_small_url||''))?clean(p.image_front_small_url,500):'',categories:Array.isArray(p.categories_tags)?p.categories_tags.slice(0,8).map(function(x){return clean(String(x).replace(/^..:/,''),60);}):[],nutrition:{energyKcal:Number(p.nutriments&&p.nutriments['energy-kcal_100g'])||0,sugars100g:Number(p.nutriments&&p.nutriments.sugars_100g)||0},source:'open-food-facts'};
        cache[barcode]={cachedAt:Date.now(),value:value}; var keys=Object.keys(cache); if(keys.length>300) keys.sort(function(a,b){return cache[a].cachedAt-cache[b].cachedAt;}).slice(0,keys.length-300).forEach(function(k){delete cache[k];}); writeCache(cache);
        span.end('success'); return Object.assign({ok:true},value);
      } catch (err) { span.end(err&&err.name==='AbortError'?'timeout':'network-error'); return cached?Object.assign({ok:true,source:'stale-cache',stale:true},cached.value):{ok:false,found:false,reason:err&&err.name==='AbortError'?'timeout':'network'}; }
      finally { timer.clear(); }
    }
  };
  K.register('products',products);

  var uploads = {
    engine:'Kiwi R2 resilient uploader', available:function(){return typeof XMLHttpRequest==='function';},
    upload:function(file,opts){
      opts=opts||{}; return new Promise(function(resolve,reject){
        /* Un refus doit porter SA raison et SES chiffres jusqu'à l'écran. Les
         * codes ci-dessous sont exactement ceux du serveur
         * (functions/api/media/index.js) et non des synonymes : un
         * `unsupported-type` local en face d'un `bad-type` distant, et
         * l'appelant retombe sur « envoi impossible, réessayez » pour un
         * fichier qui ne passera jamais. Le détail (taille réelle, plafond,
         * type, extension) voyage sur l'erreur elle-même, sinon le message
         * final ne peut pas dire de combien on dépasse. */
        var isVideo=/^video\//.test((file&&file.type)||''),limit=isVideo?48*1024*1024:16*1024*1024;
        function fail(code,extra){
          var e=new Error(code); e.code=code;
          e.detail={name:(file&&file.name)||'',type:(file&&file.type)||'',size:(file&&file.size)||0,max:limit,kind:isVideo?'video':'photo'};
          if(extra)for(var k in extra)if(extra[k]!=null)e.detail[k]=extra[k];
          reject(e);
        }
        if(!file||!file.size){fail('empty');return;}
        if(!/^(image\/(jpeg|png|webp|gif|avif)|video\/(mp4|webm|quicktime))$/.test(file.type||'')){fail('bad-type');return;}
        if(file.size>limit){fail('too-large');return;}
        if(navigator.onLine===false){fail('offline');return;}
        var span=K.telemetry.start('media.upload',{capability:'uploads',bytes:file.size}),xhr=new XMLHttpRequest();
        xhr.open('POST','/api/media?name='+encodeURIComponent(clean(file.name,120)),true); xhr.setRequestHeader('Content-Type',file.type);
        xhr.upload.onprogress=function(e){if(e.lengthComputable&&typeof opts.progress==='function')opts.progress(Math.round(e.loaded/e.total*100));};
        xhr.onerror=function(){span.end('network-error');fail('network');};
        xhr.onabort=function(){span.end('cancelled');fail('cancelled');};
        xhr.onload=function(){var body={};try{body=JSON.parse(xhr.responseText||'{}');}catch(_){}if(xhr.status>=200&&xhr.status<300&&body.url){span.end('success',{status:xhr.status});resolve(body);}else{span.end('http-error',{status:xhr.status});fail(body.error||'upload-failed',{status:xhr.status,max:body.max});}};
        xhr.send(file); if(opts.signal)opts.signal.addEventListener('abort',function(){xhr.abort();},{once:true});
      });
    }
  };
  K.register('uploads',uploads);

  var routes={
    engine:'OSRM route service', available:function(){return typeof fetch==='function';},
    plan:async function(stops,opts){
      opts=opts||{}; stops=(Array.isArray(stops)?stops:[]).map(function(s){return {lng:Number(s.lng),lat:Number(s.lat),id:clean(s.id,60)};}).filter(function(s){return Number.isFinite(s.lng)&&Number.isFinite(s.lat)&&Math.abs(s.lng)<=180&&Math.abs(s.lat)<=90;});
      if(stops.length<2||stops.length>50)return {ok:false,reason:'invalid-stops'};
      if(navigator.onLine===false)return {ok:false,reason:'offline'};
      var timer=timeout(9000),span=K.telemetry.start('route.plan',{capability:'routes',count:stops.length,engine:'osrm'});
      try{var coords=stops.map(function(s){return s.lng+','+s.lat;}).join(';');var base=clean(window.KIWI_OSRM_ENDPOINT||'https://router.project-osrm.org',300).replace(/\/$/,'');var res=await fetch(base+'/route/v1/driving/'+coords+'?overview=full&geometries=geojson&steps=false',{signal:timer.signal});if(!res.ok){span.end('http-error',{status:res.status});return {ok:false,reason:'http-'+res.status};}var body=await res.json(),route=body&&body.routes&&body.routes[0];if(!route){span.end('no-route');return {ok:false,reason:'no-route'};}span.end('success');return {ok:true,verified:true,engine:'osrm',distanceMeters:Math.round(route.distance||0),durationSeconds:Math.round(route.duration||0),geometry:route.geometry,waypoints:stops};}catch(err){span.end(err&&err.name==='AbortError'?'timeout':'network-error');return {ok:false,reason:err&&err.name==='AbortError'?'timeout':'network'};}finally{timer.clear();}
    }
  };
  K.register('routes',routes);

  /* Yjs-inspired shared documents using the merge functions Kiwi already owns.
     CloudDoc supplies revision checks and server persistence; BroadcastChannel
     supplies immediate same-device collaboration. */
  var collaboration={
    engine:'Kiwi CloudDoc collaborative merge',available:function(){return !!(window.KiwiCloudDoc&&window.KiwiCloudDoc.attach);},
    attach:function(opts){
      opts=opts||{};if(!opts.feature||typeof opts.read!=='function'||typeof opts.write!=='function'||typeof opts.merge!=='function')throw new Error('invalid-collaborative-document');
      var cloud=window.KiwiCloudDoc&&window.KiwiCloudDoc.attach({feature:clean(opts.feature,30),slug:opts.slug||function(){return K.tenant();},localKey:opts.localKey,read:opts.read,write:opts.write,merge:opts.merge,isEmpty:opts.isEmpty||function(v){return !v;}});
      if(!cloud)return {available:false,reason:'cloud-doc-unavailable'}; try{cloud.bind();}catch(_){}
      var unsub=K.subscribe(function(e){if(e.type==='document'&&e.detail&&e.detail.feature===opts.feature&&typeof opts.onRemote==='function')opts.onRemote(e.detail);});
      return {available:true,push:function(){var r=cloud.push&&cloud.push(0);K.emit('document',{feature:opts.feature});return r;},pull:function(){return cloud.pull&&cloud.pull();},destroy:function(){unsub();}};
    }
  };
  K.register('collaboration',collaboration);

  var analytics={
    engine:'Kiwi accessible charts',available:true,
    render:function(target,config){
      if(typeof target==='string')target=document.querySelector(target);if(!target)return false;config=config||{};var rows=(config.data||[]).map(function(x){return {label:clean(x.label,40),value:Math.max(0,Number(x.value)||0)};}).slice(0,30),max=Math.max.apply(Math,rows.map(function(x){return x.value;}).concat([1]));
      if(window.echarts&&typeof window.echarts.init==='function'){var chart=window.echarts.getInstanceByDom(target)||window.echarts.init(target);chart.setOption({animationDuration:420,tooltip:{trigger:'axis'},grid:{left:8,right:8,top:16,bottom:24,containLabel:true},xAxis:{type:'category',data:rows.map(function(x){return x.label;}),axisLine:{show:false},axisTick:{show:false}},yAxis:{type:'value',splitLine:{lineStyle:{color:'rgba(127,127,127,.16)'}}},series:[{type:config.type==='line'?'line':'bar',data:rows.map(function(x){return x.value;}),smooth:true,itemStyle:{color:'#0B6E4F'},lineStyle:{color:'#0B6E4F'},areaStyle:config.type==='line'?{color:'rgba(11,110,79,.10)'}:undefined}]});return chart;}
      target.setAttribute('role','img');target.setAttribute('aria-label',clean(config.label||'Graphique',120));target.innerHTML='<div class="kpf-bars">'+rows.map(function(row){return '<div class="kpf-bar" title="'+esc(row.label+' · '+row.value)+'"><i style="height:'+Math.max(3,Math.round(row.value/max*100))+'%"></i><span>'+esc(row.label)+'</span><b>'+esc(row.value)+'</b></div>';}).join('')+'</div>';return true;
    }
  };
  K.register('analytics',analytics);

  /* Existing pages and catalogue become a useful zero-server index today. A
     future Meilisearch endpoint can register an additional provider without
     changing the search contract. */
  K.search.register('navigation',function(){return Array.from(document.querySelectorAll('[data-nav],[data-page]')).map(function(el){return {id:el.getAttribute('data-nav')||el.getAttribute('data-page')||'',title:clean(el.textContent,100),subtitle:'Kiwi',action:function(){el.click();}};}).filter(function(x){return x.id&&x.title;});});
  K.search.register('catalog',function(){try{var C=window.KiwiBoutiqueCatalog;if(!C)return[];return(C.listProducts()||[]).map(function(p){return{id:p.id,title:p.name,subtitle:'Catalogue',keywords:[p.sku,p.ean,p.categoryId].filter(Boolean).join(' '),data:p};});}catch(_){return[];}});

  window.KiwiPlatformOps={products:products,uploads:uploads,routes:routes,collaboration:collaboration,analytics:analytics};
})();
