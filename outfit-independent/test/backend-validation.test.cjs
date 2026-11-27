'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createApp}=require('../server.cjs');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=','base64');
async function fixture(t,options={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'outfit-backend-audit-'));
 const app=createApp({...options,dataDir:dir,env:{LLM_API_BASE:'',LLM_API_KEY:'',LLM_MODEL:'',...(options.env||{})}});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
 t.after(async()=>{await app.close();fs.rmSync(dir,{recursive:true,force:true});});
 async function req(route,{cookie='',json,method='GET',data,headers={}}={}){
  const r=await fetch(base+route,{method:json===undefined?method:'POST',headers:{...(cookie?{Cookie:cookie}:{}),...(json!==undefined?{'Content-Type':'application/json'}:{}),...headers},body:json===undefined?data:JSON.stringify(json)});
  return {status:r.status,value:r.headers.get('content-type')?.includes('application/json')?await r.json():await r.arrayBuffer(),cookie:r.headers.get('set-cookie')?.split(';')[0],headers:r.headers};
 }
 async function register(name){const r=await req('/api/auth/register',{json:{username:name,password:'synthetic-password-123'}});assert.equal(r.status,200);return {id:r.value.data.user.id,cookie:r.cookie};}
 const record=(user,table,mode,row,id)=>req('/api/records',{cookie:user.cookie,json:{table,mode,row,id}});
 async function image(user,name='photo'){const p='users/'+user.id+'/'+name+'.png';assert.equal((await req('/api/files?path='+encodeURIComponent(p),{cookie:user.cookie,method:'PUT',data:png})).status,200);return p;}
 function rawHost(host){return new Promise((resolve,reject)=>{require('node:http').get(base+'/api/health',{headers:{Host:host}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));}).on('error',reject);});}
 return {app,req,register,record,image,rawHost};
}
test('malformed input receives explicit 400; record types and ranges cannot corrupt persisted data',async t=>{
 const {req,register,record,rawHost}=await fixture(t),a=await register('validation-alice');
 for(const route of ['/api/auth/login','/api/records','/api/import','/api/outfits/generate','/api/outfits/manual','/api/tryon','/api/shopping/search','/api/auth/password'])for(const json of [null,[],7])assert.equal((await req(route,{cookie:a.cookie,json})).status,400,route);
 assert.equal((await req('/api/auth/login',{json:{username:1234,password:'synthetic-password-123'}})).status,400);
 for(const row of [{height_cm:119},{weight_kg:181},{height_cm:'158'},{nickname:{}},{style_prefs:'学院'},{nickname:'x'.repeat(25)}])assert.equal((await record(a,'profiles','insert',row)).status,400);
 for(const row of [{name:[]},{category:'非法类别'},{cutout:'yes'},{tags:[{}]}])assert.equal((await record(a,'wardrobe_items','insert',row)).status,400);
 for(const payload of [null,[],{items:'bad'},{gaps:[null]}])assert.equal((await record(a,'outfits','insert',{title:'Invalid payload',payload})).status,400);
 for(const row of [{},{name:' ',category:'上装'},{name:'Missing category'}])assert.equal((await record(a,'wardrobe_items','insert',row)).status,400);
 for(const row of [{},{title:' ',payload:{}},{title:'Missing payload'},{payload:{}}])assert.equal((await record(a,'outfits','insert',row)).status,400);
 const missing='users/'+a.id+'/missing.png';assert.equal((await record(a,'profiles','insert',{face_photo_path:missing})).status,400);
 assert.equal((await record(a,'profiles','insert',{height_cm:null,weight_kg:null,nickname:'valid'})).status,200);
 assert.equal((await req('/api/records',{cookie:a.cookie,json:{table:'profiles',mode:'select',limit:-1}})).status,400);
 assert.equal((await req('/api/auth/login',{cookie:a.cookie})).status,405);
 assert.equal((await req('/api/files?path='+encodeURIComponent(missing),{cookie:a.cookie,json:{}})).status,405);
 assert.equal((await req('/api/chat',{cookie:a.cookie,json:{messages:[null]}})).status,400);
 assert.equal((await req('/api/records',{cookie:a.cookie,json:{table:'profiles',mode:'select'},headers:{Origin:'not a URL'}})).status,403);
 assert.equal(await rawHost('user@localhost'),400);
 assert.equal((await record(a,'profiles','select')).value.data[0].nickname,'valid');
 const health=await req('/api/health');assert.equal(health.value.service,'outfit-mirror-independent');
 const status=await req('/api/status',{cookie:a.cookie});assert.equal(status.value.data.storage.ready,true);assert.equal(status.value.data.planner.ready,true);assert.equal(status.value.data.textAI.configured,false);assert.equal(JSON.stringify(status.value).includes('AppSecret'),false);
});
test('image bytes must decode and referenced photos survive wardrobe deletion until all snapshots are gone',async t=>{
 const {req,register,record,image}=await fixture(t),a=await register('photo-validation'),p=await image(a);
 const broken=Buffer.concat([png.subarray(0,8),Buffer.from('not a png')]);
 assert.equal((await req('/api/files?path='+encodeURIComponent('users/'+a.id+'/broken.png'),{cookie:a.cookie,method:'PUT',data:broken})).status,400);
 const item=await record(a,'wardrobe_items','insert',{name:'Stored shirt',category:'上装',image_path:p}),itemId=item.value.data[0].id;
 const saved=await record(a,'outfits','insert',{title:'Stored look',payload:{items:[{id:itemId,image_path:p}],lookImage:p}});
 assert.equal((await record(a,'wardrobe_items','update',{name:'  '},itemId)).status,400);
 assert.equal((await record(a,'outfits','update',{title:''},saved.value.data[0].id)).status,400);
 assert.equal((await record(a,'wardrobe_items','delete',undefined,String(itemId))).status,200,'DOM data-set ids remain compatible');
 assert.equal((await req('/api/files?path='+encodeURIComponent(p),{cookie:a.cookie,method:'DELETE'})).status,409);
 assert.equal((await req('/api/files?path='+encodeURIComponent(p),{cookie:a.cookie})).status,200);
 assert.equal((await req('/api/files?path='+encodeURIComponent(p),{cookie:a.cookie,method:'HEAD'})).headers.get('content-type'),'image/png');
 await record(a,'outfits','delete',undefined,saved.value.data[0].id);
 assert.equal((await req('/api/files?path='+encodeURIComponent(p),{cookie:a.cookie,method:'DELETE'})).status,200);
 assert.equal((await req('/api/files?path='+encodeURIComponent(p),{cookie:a.cookie})).status,404);
});
test('password change verifies the old password and revokes every session of only that account',async t=>{
 const {req,register}=await fixture(t),a=await register('password-alice'),b=await register('password-bob');
 const extra=await req('/api/auth/login',{json:{username:'password-alice',password:'synthetic-password-123'}});
 assert.equal((await req('/api/auth/password',{cookie:a.cookie,json:{currentPassword:'incorrect-password',newPassword:'replacement-password-123'}})).status,400);
 assert.equal((await req('/api/auth/password',{cookie:a.cookie,json:{currentPassword:'synthetic-password-123',newPassword:42}})).status,400);
 const changed=await req('/api/auth/password',{cookie:a.cookie,json:{currentPassword:'synthetic-password-123',newPassword:'replacement-password-123'}});assert.equal(changed.status,200);assert.match(changed.headers.get('set-cookie'),/Max-Age=0/);
 for(const cookie of [a.cookie,extra.cookie])assert.equal((await req('/api/auth/session',{cookie})).value.data,null);
 assert.equal((await req('/api/auth/session',{cookie:b.cookie})).value.data.user.id,b.id);
 assert.equal((await req('/api/auth/login',{json:{username:'password-alice',password:'synthetic-password-123'}})).status,401);
 assert.equal((await req('/api/auth/login',{json:{username:'password-alice',password:'replacement-password-123'}})).status,200);
});
test('bad backups fail before inserting any records or images',async t=>{
 const {req,register}=await fixture(t),a=await register('invalid-import');
 const blank={format:'outfit-mirror-backup',version:1,tables:{profiles:[],wardrobe_items:[],outfits:[]},files:[]};
 for(const files of [[null],[{}],[{path:'bad',base64:'not-base64'}]])assert.equal((await req('/api/import',{cookie:a.cookie,json:{...blank,files}})).status,400);
 assert.equal((await req('/api/import',{cookie:a.cookie,json:{...blank,tables:{...blank.tables,profiles:[null]}}})).status,400);
 const backup=(await req('/api/backup',{cookie:a.cookie})).value;assert.equal(backup.files.length,0);assert.equal(backup.tables.profiles.length,0);
});
test('concurrent imports recheck emptiness in the transaction instead of merging backups',async t=>{
 const {req,register}=await fixture(t),a=await register('concurrent-import');
 const backup={format:'outfit-mirror-backup',version:1,tables:{profiles:[{id:1,nickname:'original',face_photo_path:'legacy-photo'}],wardrobe_items:[],outfits:[]},files:[{path:'legacy-photo',base64:png.toString('base64')}]};
 const results=await Promise.all([req('/api/import',{cookie:a.cookie,json:backup}),req('/api/import',{cookie:a.cookie,json:backup})]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const stored=(await req('/api/backup',{cookie:a.cookie})).value;assert.equal(stored.files.length,1);assert.equal(stored.tables.profiles.length,1);
});
test('credential-bearing AI endpoint URLs are rejected without sending an upstream request',async t=>{
 let calls=0;const {req,register}=await fixture(t,{env:{LLM_API_BASE:'https://name:synthetic-secret@text.example/v1',LLM_API_KEY:'synthetic-key',LLM_MODEL:'synthetic-model'},textFetch:async()=>{calls++;return Response.json({});}}),a=await register('invalid-ai-url');
 const result=await req('/api/chat',{cookie:a.cookie,json:{messages:[{role:'user',content:'hello'}]}});assert.equal(result.status,503);assert.equal(calls,0);assert.equal(JSON.stringify(result.value).includes('synthetic-secret'),false);
});
module.exports={fixture};
