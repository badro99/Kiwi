#!/usr/bin/env node
import assert from 'node:assert/strict';
import { cleanupHotelMedia, cleanupHotelMediaAll, hotelRoomMediaKey } from '../functions/api/hotel/_media_cleanup.js';
const now=Date.UTC(2026,7,31),merchant='riad-clean';
const rooms={roomTypes:[{id:'type-a',photos:[{url:'/api/media/media/riad-clean/hotel-room/live-photo-01.jpg'},{url:'/api/media/riad-clean/hotel-room/legacy-live-01.jpg'}]}]};
const configs=[{merchant:'riad-clean',type:'hotel',status:'active'},{merchant:'shop-clean',type:'boutique',status:'active'}];
const objects=[
  {key:'media/riad-clean/hotel-room/live-photo-01.jpg',uploaded:new Date(now-20*86400000)},
  {key:'riad-clean/hotel-room/legacy-live-01.jpg',uploaded:new Date(now-20*86400000)},
  {key:'media/riad-clean/hotel-room/orphan-new-prefix-01.jpg',uploaded:new Date(now-9*86400000)},
  {key:'riad-clean/hotel-room/orphan-old-01.jpg',uploaded:new Date(now-8*86400000)},
  {key:'riad-clean/hotel-room/orphan-new-01.jpg',uploaded:new Date(now-2*86400000)},
  {key:'riad-clean/product-photo-01.jpg',uploaded:new Date(now-50*86400000)},
];
let deleted=[];
const DB={prepare(text){let args=[];return{bind(...v){args=v;return this},async first(){if(text.includes("feature='rooms'")&&args[0]===merchant)return{data:JSON.stringify(rooms)};return null},async all(){return{results:text.includes('merchant_config')?configs.filter((x)=>x.type==='hotel').map((x)=>({merchant:x.merchant})):[]}}}}};
const MEDIA={async list({prefix}){return{objects:objects.filter((x)=>x.key.startsWith(prefix)),truncated:false}},async delete(keys){deleted.push(...keys)}};
const env={DB,MEDIA};let n=0;const ok=(v,l)=>{assert.ok(v,l);n++;console.log('  ✓ '+l)};
ok(hotelRoomMediaKey('/api/media/media/riad-clean/hotel-room/live-photo-01.jpg',merchant)==='media/riad-clean/hotel-room/live-photo-01.jpg'&&hotelRoomMediaKey('/api/media/riad-clean/hotel-room/legacy-live-01.jpg',merchant)==='riad-clean/hotel-room/legacy-live-01.jpg'&&!hotelRoomMediaKey('/api/media/riad-clean/product-photo-01.jpg',merchant),'candidate parser accepts new and legacy tenant hotel-room prefixes only');
let result=await cleanupHotelMedia(env,{merchant,dryRun:true,now});
ok(result.candidates===2&&result.keys.some((x)=>x.endsWith('orphan-old-01.jpg'))&&result.keys.some((x)=>x.endsWith('orphan-new-prefix-01.jpg'))&&deleted.length===0,'dry run covers old unreferenced photos in both namespace generations');
result=await cleanupHotelMedia(env,{merchant,dryRun:false,now});
ok(result.deleted===2&&deleted.length===2&&deleted.every((x)=>!x.includes('live-photo')&&!x.includes('legacy-live')),'real cleanup preserves live, recent and non-hotel objects across both namespaces');
result=await cleanupHotelMediaAll(env,{now});
ok(result.processed===1&&result.failed===0,'scheduled sweep selects active hotel merchants and excludes boutiques');
console.log(`hotel-media-cleanup-test: ${n} controls passed`);
