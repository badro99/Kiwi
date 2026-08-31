#!/usr/bin/env node
import assert from 'node:assert/strict';
import { cleanupHotelMedia, cleanupHotelMediaAll, hotelRoomMediaKey } from '../functions/api/hotel/_media_cleanup.js';
const now=Date.UTC(2026,7,31),merchant='riad-clean';
const rooms={roomTypes:[{id:'type-a',photos:[{url:'/api/media/riad-clean/hotel-room/live-photo-01.jpg'},{url:'/api/media/riad-clean/legacy-photo-01.jpg'}]}]};
const configs=[{merchant:'riad-clean',type:'hotel',status:'active'},{merchant:'shop-clean',type:'boutique',status:'active'}];
const objects=[
  {key:'riad-clean/hotel-room/live-photo-01.jpg',uploaded:new Date(now-20*86400000)},
  {key:'riad-clean/hotel-room/orphan-old-01.jpg',uploaded:new Date(now-8*86400000)},
  {key:'riad-clean/hotel-room/orphan-new-01.jpg',uploaded:new Date(now-2*86400000)},
  {key:'riad-clean/product-photo-01.jpg',uploaded:new Date(now-50*86400000)},
];
let deleted=[];
const DB={prepare(text){let args=[];return{bind(...v){args=v;return this},async first(){if(text.includes("feature='rooms'")&&args[0]===merchant)return{data:JSON.stringify(rooms)};return null},async all(){return{results:text.includes('merchant_config')?configs.filter((x)=>x.type==='hotel').map((x)=>({merchant:x.merchant})):[]}}}}};
const MEDIA={async list({prefix}){return{objects:objects.filter((x)=>x.key.startsWith(prefix)),truncated:false}},async delete(keys){deleted.push(...keys)}};
const env={DB,MEDIA};let n=0;const ok=(v,l)=>{assert.ok(v,l);n++;console.log('  ✓ '+l)};
ok(hotelRoomMediaKey('/api/media/riad-clean/hotel-room/live-photo-01.jpg',merchant)==='riad-clean/hotel-room/live-photo-01.jpg'&&!hotelRoomMediaKey('/api/media/riad-clean/product-photo-01.jpg',merchant),'candidate parser admits only the dedicated tenant hotel-room prefix');
let result=await cleanupHotelMedia(env,{merchant,dryRun:true,now});
ok(result.candidates===1&&result.keys[0].endsWith('orphan-old-01.jpg')&&deleted.length===0,'dry run reports only unreferenced photos older than seven days');
result=await cleanupHotelMedia(env,{merchant,dryRun:false,now});
ok(result.deleted===1&&deleted.length===1&&!deleted[0].includes('live-photo'),'real cleanup preserves live, recent and non-hotel objects');
result=await cleanupHotelMediaAll(env,{now});
ok(result.processed===1&&result.failed===0,'scheduled sweep selects active hotel merchants and excludes boutiques');
console.log(`hotel-media-cleanup-test: ${n} controls passed`);
