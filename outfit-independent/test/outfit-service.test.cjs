'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createApp}=require('../server.cjs');
async function fixture(t,options={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'outfit-plan-api-')),app=createApp({...options,dataDir:dir,env:{LLM_API_BASE:'',LLM_API_KEY:'',LLM_MODEL:'',...(options.env||{})}});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
 t.after(async()=>{await app.close();fs.rmSync(dir,{recursive:true,force:true});});
 async function post(route,json,cookie=''){const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(json)});return {status:r.status,value:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 const register=name=>post('/api/auth/register',{username:name,password:'synthetic-password-123'});
 return {post,register};
}
test('server plan uses only the active wardrobe and returns a complete temperature-aware plan without AI',async t=>{
 const {post,register}=await fixture(t),a=await register('plan-alice'),b=await register('plan-bob');
 const own=await post('/api/records',{table:'wardrobe_items',mode:'insert',row:{name:'A 私有薄衬衫',category:'上装',season:'夏季'}},a.cookie),foreign=await post('/api/records',{table:'wardrobe_items',mode:'insert',row:{name:'B 私有衣服',category:'上装'}},b.cookie);
 assert.equal((await post('/api/outfits/generate',{})).status,401);
 assert.equal((await post('/api/outfits/generate',{selectedIds:[foreign.value.data[0].id]},a.cookie)).status,400);
 for(const input of [{temperature:41},{temperature:'22'},{season:'other'},{selectedIds:[{}]}])assert.equal((await post('/api/outfits/generate',input,a.cookie)).status,400);
 const hot=await post('/api/outfits/generate',{style:'参考图风格',season:'冬季',temperature:32,selectedIds:[own.value.data[0].id],wardrobe:[{id:foreign.value.data[0].id}],profile:{height_cm:200}},a.cookie);
 assert.equal(hot.status,200);const plan=hot.value.data;assert.equal(plan.source,'rules');assert.equal(plan.climate.band,5);assert.equal(plan.items[0].name,'A 私有薄衬衫');assert.equal(JSON.stringify(plan).includes('B 私有'),false);assert.equal(plan.fit_note.includes('200'),false);assert.ok(plan.gaps.some(g=>g.category==='鞋履'));assert.ok(plan.gaps.every(g=>!/羽绒|毛衣|厚针织/.test(g.name)));
 const cold=await post('/api/outfits/generate',{season:'夏季',temperature:3,selectedIds:[own.value.data[0].id]},a.cookie);assert.equal(cold.status,200);assert.ok(cold.value.data.warnings.some(w=>w.includes('预选')));assert.ok(cold.value.data.gaps.some(g=>/羽绒/.test(g.name)));
});
test('AI responses are checked and provider failure or invented garment ids fall back to rules',async t=>{
 let mode='unknown';const {post,register}=await fixture(t,{env:{LLM_API_BASE:'https://text.example/v1',LLM_API_KEY:'synthetic-secret',LLM_MODEL:'synthetic-model'},textFetch:async(url,options)=>{
   assert.equal(new URL(url).hostname,'text.example');assert.ok(options.body.includes('20–30'));
   if(mode==='network')throw Error('synthetic-secret');
   return Response.json({choices:[{message:{content:JSON.stringify({items:[{id:999999}],gaps:[]})}}]});
 }}),a=await register('plan-ai');
 for(mode of ['unknown','network']){const r=await post('/api/outfits/generate',{temperature:30},a.cookie);assert.equal(r.status,200);assert.equal(r.value.data.source,'rules');assert.ok(r.value.data.warnings.length);assert.equal(JSON.stringify(r.value).includes('synthetic-secret'),false);}
});
test('oversized provider streams are cancelled before allocating an unlimited response',async()=>{
 const {readJson}=require('../provider-json.cjs');let cancelled=false;
 const body=new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(400));},cancel(){cancelled=true;}});
 await assert.rejects(readJson(new Response(body),512),/too large/);assert.equal(cancelled,true);
});

test('manual combination keeps exact ordered choices and warns about temperature without calling AI',async t=>{
 const {post,register}=await fixture(t,{textFetch:()=>{throw Error('Manual selection must never call a provider');}}),a=await register('manual-alice');
 const ids=[];for(const row of [{name:'厚针织毛衣',category:'上装',color:'奶白',season:'冬季'},{name:'加绒长裤',category:'下装',color:'黑色',season:'冬季'},{name:'雪地靴',category:'鞋履',season:'冬季'}]){const r=await post('/api/records',{table:'wardrobe_items',mode:'insert',row},a.cookie);ids.push(r.value.data[0].id);}
 const r=await post('/api/outfits/manual',{itemIds:ids,temperature:30,season:'夏季',items:[{name:'客户端伪造名称'}]},a.cookie);
 assert.equal(r.status,200);const plan=r.value.data;
 assert.equal(plan.source,'manual');assert.equal(plan.style,'手动搭配');assert.deepEqual(plan.items.map(i=>i.id),ids);assert.equal(plan.items[0].name,'厚针织毛衣');assert.deepEqual(plan.gaps,[]);assert.ok(plan.warnings.some(w=>/偏热|炎热/.test(w)));
 const saved=await post('/api/records',{table:'outfits',mode:'insert',row:{title:plan.title,style:plan.style,occasion:plan.occasion,payload:plan}},a.cookie);assert.equal(saved.status,200);
 await post('/api/records',{table:'wardrobe_items',mode:'delete',id:ids[0]},a.cookie);
 const read=await post('/api/records',{table:'outfits',mode:'select'},a.cookie);assert.equal(read.value.data[0].payload.items[0].name,'厚针织毛衣');
 assert.equal((await post('/api/outfits/manual',{itemIds:ids},a.cookie)).status,400);
});

test('manual combination rejects anonymous, foreign, missing, duplicate and wrong-category choices',async t=>{
 const {post,register}=await fixture(t),a=await register('manual-owner'),b=await register('manual-other');
 const ids=[];for(const category of ['上装','下装','鞋履']){const r=await post('/api/records',{table:'wardrobe_items',mode:'insert',row:{name:category,category}},a.cookie);ids.push(r.value.data[0].id);}
 const foreign=await post('/api/records',{table:'wardrobe_items',mode:'insert',row:{name:'不能泄露的其他账号上装',category:'上装'}},b.cookie);
 assert.equal((await post('/api/outfits/manual',{itemIds:ids})).status,401);
 for(const itemIds of [undefined,[],[ids[0],ids[1]],[ids[0],ids[1],ids[0]],[ids[1],ids[0],ids[2]],[foreign.value.data[0].id,ids[1],ids[2]],[String(ids[0]),ids[1],ids[2]]]){const r=await post('/api/outfits/manual',{itemIds},a.cookie);assert.equal(r.status,400);assert.equal(JSON.stringify(r.value).includes('不能泄露'),false);}
 assert.equal((await post('/api/outfits/manual',{itemIds:ids,temperature:80},a.cookie)).status,400);
});
