const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createApp}=require('../server.cjs');
const {normalizePlan,settings}=require('../tryon.cjs');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
test('personal try-on uses owned face/body/garments, requires consent, and privately saves output',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'outfit-tryon-test-'));let calls=0;
 const app=createApp({dataDir:dir,env:{IMAGE_API_KEY:'synthetic-test-only-key'},imageFetch:async(url,options)=>{
  calls++;assert.equal(url.hostname,'api.openai.com');
  assert.equal(options.body.getAll('image[]').length,2);
  const prompt=options.body.get('prompt');assert.match(prompt,/20–30/);assert.match(prompt,/158 cm/);assert.match(prompt,/54 kg/);assert.match(prompt,/cream coat/);
  return new Response(JSON.stringify({data:[{b64_json:png.toString('base64')}]}),{headers:{'Content-Type':'application/json'}});
 }});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
 t.after(async()=>{await app.close();fs.rmSync(dir,{recursive:true,force:true});});
 async function post(url,cookie,json){const r=await fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(json)});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 const a=await post('/api/auth/register','',{username:'image-user',password:'synthetic-test-password'}),owner=a.data.data.user.id,cookie=a.cookie;
 assert.equal((await post('/api/tryon','',{consent:true,plan:{items:[]}})).status,401);
 assert.equal((await post('/api/tryon',cookie,{consent:false,plan:{items:[]}})).status,400);assert.equal(calls,0);
 const face='users/'+owner+'/face/test.png',coat='users/'+owner+'/wardrobe/test.png';
 for(const p of [face,coat]){const r=await fetch(base+'/api/files?path='+encodeURIComponent(p),{method:'PUT',headers:{Cookie:cookie,'Content-Type':'image/png'},body:png});assert.equal(r.status,200);await r.arrayBuffer();}
 await post('/api/records',cookie,{table:'profiles',mode:'insert',row:{height_cm:158,weight_kg:54,face_photo_path:face,body_shape:'苹果形'}});
 const item=await post('/api/records',cookie,{table:'wardrobe_items',mode:'insert',row:{name:'cream coat',category:'外套',image_path:coat}});
 const plan={title:'清爽冬日',style:'清爽休闲',occasion:'日常出行',temperature:10,season:'冬季',items:[{id:item.data.data[0].id,name:'forged title',image_path:'users/another-owner/face.jpg'}],gaps:[{name:'米白保暖针织上衣',category:'上装'},{name:'深灰加厚长裤',category:'下装'},{name:'黑色包脚短靴',category:'鞋履'}]};
 const result=await post('/api/tryon',cookie,{consent:true,plan});assert.equal(result.status,200);assert.equal(calls,1);assert.ok(result.data.data.path.startsWith('users/'+owner+'/tryon/'));
 const stored=result.data.data.outfit;assert.equal(stored.payload.tryonProfile.height_cm,158);assert.equal(stored.payload.tryonSource,'image-api');
 assert.equal(stored.payload.items[0].name,'cream coat');assert.equal(stored.payload.items[0].image_path,coat);assert.equal(JSON.stringify(stored).includes('forged title'),false);
 let image=await fetch(base+'/api/files?path='+encodeURIComponent(result.data.data.path),{headers:{Cookie:cookie}});assert.equal(image.status,200);await image.arrayBuffer();
 const b=await post('/api/auth/register','',{username:'other-user',password:'synthetic-test-password'});
 image=await fetch(base+'/api/files?path='+encodeURIComponent(result.data.data.path),{headers:{Cookie:b.cookie}});assert.equal(image.status,400);await image.arrayBuffer();
 const foreign=await post('/api/tryon',b.cookie,{consent:true,plan});assert.equal(foreign.status,400);assert.equal(calls,1);
 const backup=await fetch(base+'/api/backup',{headers:{Cookie:cookie}});const data=await backup.json();assert.ok(data.files.some(f=>f.path===result.data.data.path));
 assert.equal(JSON.stringify(data).includes('synthetic-test-only-key'),false);
});

test('try-on plan validates temperature, categories and layers before using an image provider',()=>{
 const good={items:[],gaps:[{name:'白色短袖',category:'上装'},{name:'灰色长裤',category:'下装'},{name:'白色鞋',category:'鞋履'}]};
 for(const bad of [null,[],{...good,items:[[]]},{...good,temperature:'30'},{...good,temperature:99},{...good,gaps:[{name:'x',category:'bad'}]},{...good,gaps:[{name:'x',category:'上装',role:'execute'}]},{...good,tips:'bad'}])assert.throws(()=>normalizePlan(bad),{status:400});
 const safe=normalizePlan({...good,tryonImage:'users/foreign/photo.jpg',lookImage:'users/foreign/board.png',secret:'should not persist'});
 assert.equal(safe.tryonImage,undefined);assert.equal(safe.lookImage,undefined);assert.equal(safe.secret,undefined);assert.equal(safe.temperature,22);
 assert.throws(()=>settings({IMAGE_API_URL:'not a URL'}),{status:503});
 assert.throws(()=>settings({IMAGE_API_URL:'https://user:secret@example.com/edit'}),{status:503});
});

test('try-on provider malformed JSON, oversized response and unreadable output return safe 502 errors',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'outfit-tryon-errors-'));let mode='json',calls=0;
 const app=createApp({dataDir:dir,env:{IMAGE_API_KEY:'synthetic-provider-secret'},imageFetch:async()=>{calls++;if(mode==='json')return new Response('{synthetic-provider-secret');if(mode==='large')return new Response('{}',{headers:{'Content-Length':String(25*1024*1024)}});return Response.json({data:[{b64_json:Buffer.from('not an image').toString('base64')}]});}});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
 t.after(async()=>{await app.close();fs.rmSync(dir,{recursive:true,force:true});});
 async function post(url,cookie,json){const r=await fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(json)});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 const user=await post('/api/auth/register','',{username:'provider-errors-user',password:'synthetic-test-password'}),cookie=user.cookie,face='users/'+user.data.data.user.id+'/face.png';
 const upload=await fetch(base+'/api/files?path='+encodeURIComponent(face),{method:'PUT',headers:{Cookie:cookie,'Content-Type':'image/png'},body:png});await upload.arrayBuffer();
 await post('/api/records',cookie,{table:'profiles',mode:'insert',row:{face_photo_path:face,height_cm:158,weight_kg:54}});
 const plan={items:[],gaps:[{name:'白色短袖',category:'上装'},{name:'灰色长裤',category:'下装'},{name:'白色运动鞋',category:'鞋履'}]};
 for(const value of ['json','large','image']){mode=value;const r=await post('/api/tryon',cookie,{consent:true,plan});assert.equal(r.status,502);assert.equal(JSON.stringify(r.data).includes('synthetic-provider-secret'),false);}
 assert.equal(calls,3);const backup=await(await fetch(base+'/api/backup',{headers:{Cookie:cookie}})).json();assert.equal(backup.tables.outfits.length,0);assert.equal(backup.files.length,1);
});
test('empty wardrobe and owned clothing without photos both generate using face plus clothing specifications',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'outfit-tryon-no-clothes-test-')),forms=[];
 const app=createApp({dataDir:dir,env:{IMAGE_API_KEY:'synthetic-test-only-key'},imageFetch:async(url,options)=>{
  forms.push(options.body);return new Response(JSON.stringify({data:[{b64_json:png.toString('base64')}]}),{headers:{'Content-Type':'application/json'}});
 }});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
 t.after(async()=>{await app.close();fs.rmSync(dir,{recursive:true,force:true});});
 async function post(url,cookie,json){const r=await fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(json)});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 const user=await post('/api/auth/register','',{username:'face-only-user',password:'synthetic-test-password'}),cookie=user.cookie,owner=user.data.data.user.id;
 const face='users/'+owner+'/face/test.png';
 const image=await fetch(base+'/api/files?path='+encodeURIComponent(face),{method:'PUT',headers:{Cookie:cookie,'Content-Type':'image/png'},body:png});assert.equal(image.status,200);await image.arrayBuffer();
 await post('/api/records',cookie,{table:'profiles',mode:'insert',row:{height_cm:158,weight_kg:54,face_photo_path:face}});
 const gaps=[{name:'米白圆领针织上衣',category:'上装'},{name:'浅蓝牛仔裤',category:'下装'},{name:'白色运动鞋',category:'鞋履'}];
 const proposed=await post('/api/tryon',cookie,{consent:true,plan:{title:'全部是推荐款',items:[],gaps}});
 assert.equal(proposed.status,200);assert.equal(forms[0].getAll('image[]').length,1);
 assert.match(forms[0].get('prompt'),/There are no garment photos/);
 for(const gap of gaps)assert.ok(forms[0].get('prompt').includes(gap.name));
 assert.equal(proposed.data.data.outfit.payload.tryonItems.length,3);
 assert.ok(proposed.data.data.outfit.payload.tryonItems.every(i=>i.ownership==='suggested'));
 const row=await post('/api/records',cookie,{table:'wardrobe_items',mode:'insert',row:{name:'已有蓝衬衫但没拍照',category:'上装',color:'浅蓝'}});
 const owned=await post('/api/tryon',cookie,{consent:true,plan:{title:'已有款无照片',items:[{id:row.data.data[0].id}],gaps:gaps.slice(1)}});
 assert.equal(owned.status,200);assert.equal(forms[1].getAll('image[]').length,1);
 assert.match(forms[1].get('prompt'),/已有蓝衬衫但没拍照/);
 assert.deepEqual(owned.data.data.outfit.payload.tryonItems[0],{name:'已有蓝衬衫但没拍照',category:'上装',ownership:'owned',reference:'description'});
 const empty=await post('/api/tryon',cookie,{consent:true,plan:{items:[],gaps:[]}});assert.equal(empty.status,400);assert.equal(forms.length,2);
});
