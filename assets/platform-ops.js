/* Kiwi operational adapters: uploads, product truth, routing, collaboration,
 * analytics and search. Loaded after platform-kernel.js. */
(function () {
  'use strict';
  /* La petite copie d'une photo (≈400 px, ~25 Ko) que les tuiles de caisse
   * affichent à la place de la grande (1600 px, 300 Ko à 1,4 Mo) : même nom
   * suivi de « -t.webp » (functions/api/media/[[key]].js thumbKey). attrs()
   * pose la petite et garde la grande en secours si la petite manque. Défini
   * avant le garde-fou K pour que les caisses l'aient toujours. */
  var THUMB_RX = /^(\/api\/media\/(?!(?:media\/)?[^/]+\/hotel-room\/)[^?#"'<>]+?)\.(?:jpe?g|png|webp|avif)$/i;
  function thumbUrl(u) { u = String(u == null ? '' : u); var m = THUMB_RX.exec(u); return m && !/-t$/.test(m[1]) ? m[1] + '-t.webp' : u; }
  function attrEsc(v) { return String(v).replace(/[&<>"']/g, function (c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]); }); }
  window.KiwiThumb = window.KiwiThumb || {
    url: thumbUrl,
    attrs: function (u) { u = String(u == null ? '' : u); var t = thumbUrl(u); return 'src="' + attrEsc(t) + '"' + (t !== u ? ' data-full="' + attrEsc(u) + '" onerror="if(this.dataset.full){this.src=this.dataset.full;this.removeAttribute(\'data-full\')}"' : ''); },
  };

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

  /* Rétrécir dans le navigateur. createImageBitmap suit l'orientation EXIF et
   * Safari décode le HEIC. Un PNG (souvent un détourage transparent) part en
   * WebP quand le navigateur sait l'écrire, sinon il reste PNG ; une photo
   * opaque part en JPEG. Rien qu'on n'arrive pas à décoder n'est bloqué : le
   * fichier part tel quel. `keep` : en dessous, inutile de recoder. */
  var PHOTO_EDGE=1600, THUMB_EDGE=400, PHOTO_KEEP=700*1024;
  function decodePhoto(file){
    if(typeof createImageBitmap==='function')return createImageBitmap(file,{imageOrientation:'from-image'}).catch(function(){return createImageBitmap(file);});
    return new Promise(function(res,rej){var u=URL.createObjectURL(file),im=new Image();im.onload=function(){URL.revokeObjectURL(u);res(im);};im.onerror=function(){URL.revokeObjectURL(u);rej(new Error('decode'));};im.src=u;});
  }
  function toBlob(canvas,type,q){return new Promise(function(res){try{canvas.toBlob(function(b){res(b);},type,q);}catch(_){res(null);}});}
  function shrinkPhoto(file,edge,keep){
    var type=(file&&file.type)||'';
    if(!/^image\/(jpeg|png|webp|avif|heic|heif)$/.test(type)||typeof document==='undefined')return Promise.resolve(file);
    if(keep&&file.size<=keep&&!/hei[cf]/.test(type))return Promise.resolve(file);
    return decodePhoto(file).then(function(src){
      var w=src.width||src.naturalWidth||0,h=src.height||src.naturalHeight||0; if(!w||!h)return file;
      var sc=Math.min(1,edge/Math.max(w,h)),c=document.createElement('canvas'); c.width=Math.max(1,Math.round(w*sc)); c.height=Math.max(1,Math.round(h*sc));
      var ctx=c.getContext('2d'); if(!ctx)return file; ctx.drawImage(src,0,0,c.width,c.height); if(src.close)try{src.close();}catch(_){}
      var alpha=/png|webp|avif/.test(type);
      return toBlob(c,'image/webp',0.8).then(function(b){
        if(b&&b.type==='image/webp')return b;
        return toBlob(c,alpha?'image/png':'image/jpeg',0.82);
      }).then(function(b){
        if(!b||(b.size>=file.size&&!/hei[cf]/.test(type)))return file;
        var ext=b.type==='image/webp'?'webp':b.type==='image/png'?'png':'jpg',name=String(file.name||'photo').replace(/\.[A-Za-z0-9]{1,6}$/,'')+'.'+ext;
        try{return new File([b],name,{type:b.type,lastModified:Date.now()});}catch(_){b.name=name;return b;}
      });
    }).catch(function(){return file;});
  }

  var uploads = {
    engine:'Kiwi R2 resilient uploader', available:function(){return typeof XMLHttpRequest==='function';},
    /* Toute photo passe ici (tableau de bord et caisses) : on garde la photo
     * du commerçant en bonne qualité (1600 px, plafonds inchangés) et on range
     * à côté sa petite copie pour les tuiles de caisse. Un échec de la petite
     * copie ne fait jamais échouer l'envoi : la tuile prendra la grande. */
    upload:function(file,opts){
      opts=opts||{}; var self=this, hotel=opts.scope==='hotel-room';
      var ready=file;
      return shrinkPhoto(file,PHOTO_EDGE,PHOTO_KEEP).then(function(r){ready=r||file;return self.send(ready,opts);}).then(function(body){
        if(hotel||!body||!body.key||!/^image\/(jpeg|png|webp|avif)$/.test((ready&&ready.type)||''))return body;
        return shrinkPhoto(ready,THUMB_EDGE,0).then(function(small){
          if(!small||small===ready)return body;
          return self.send(small,{merchant:opts.merchant,thumbOf:body.key}).then(function(t){body.thumb=t&&t.url;return body;},function(){return body;});
        },function(){return body;});
      });
    },
    send:function(file,opts){
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
        var mediaUrl='/api/media?name='+encodeURIComponent(clean(file.name,120));
        if(opts.merchant)mediaUrl+='&merchant='+encodeURIComponent(clean(opts.merchant,64));
        if(opts.scope==='hotel-room')mediaUrl+='&scope=hotel-room';
        if(opts.thumbOf)mediaUrl+='&thumbOf='+encodeURIComponent(clean(opts.thumbOf,200));
        xhr.open('POST',mediaUrl,true); xhr.setRequestHeader('Content-Type',file.type);
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
