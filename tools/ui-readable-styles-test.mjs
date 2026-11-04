// Interpret stylesheet declarations, including nested media blocks, without a browser.
import assert from 'node:assert/strict';
import {read} from './ui-runtime-harness.mjs';
function declarations(css) {
 const result=[];let text='',quote='',comment=false,paren=0;
 for(let i=0;i<css.length;i++) {
  const c=css[i],next=css[i+1];
  if(comment){if(c==='*'&&next==='/'){comment=false;i++;}continue;}
  if(quote){text+=c;if(c===quote&&css[i-1]!=='\\')quote='';continue;}
  if(c==='/'&&next==='*'){comment=true;i++;continue;}
  if(c==='"'||c==="'"){quote=c;text+=c;continue;}
  if(c==='(')paren++;if(c===')')paren--;
  if(!paren&&(c===';'||c==='}')) {
   const colon=text.indexOf(':');
   if(colon>0)result.push([text.slice(0,colon).trim(),text.slice(colon+1).trim()]);
   text='';continue;
  }
  if(!paren&&c==='{'){text='';continue;}
  text+=c;
 }
 return result;
}
for(const file of ['assets/orderpro-page.css']) {
 const rules=declarations(read(file));let labels=0;
 for(const [property,value] of rules) {
  if(property==='font-size'&&value.endsWith('px')) {assert.ok(parseFloat(value)>=12,file+': readable font size '+value);labels++;}
 }
 assert.ok(labels>20,'exercised stylesheet font declarations');
}
console.log('✓ stylesheet interpretation: OrderPro pixel labels, including allergen chips, >=12px');
