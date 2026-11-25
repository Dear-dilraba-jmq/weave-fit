const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createApp}=require('../server.cjs');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');

test('independent backend: persistence, auth, private photos, backup and migration',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'outfit-independent-test-'));
  let app=createApp({dataDir:dir,env:{LLM_API_BASE:'',LLM_API_KEY:'',LLM_MODEL:''}});
  async function start(){await new Promise(r=>app.server.listen(0,'127.0.0.1',r));return 'http://127.0.0.1:'+app.server.address().port;}
  let base=await start();
  t.after(async()=>{await app.close();fs.rmSync(dir,{recursive:true,force:true});});
  async function req(p,{cookie='',json,method='GET',body,headers={}}={}){
    const r=await fetch(base+p,{method:json?'POST':method,headers:{...(cookie?{Cookie:cookie}:{}),...(json?{'Content-Type':'application/json'}:{}),...headers},body:json?JSON.stringify(json):body});
    const data=r.headers.get('content-type')?.includes('application/json')?await r.json():Buffer.from(await r.arrayBuffer());
    return {status:r.status,data,cookie:r.headers.get('set-cookie')?.split(';')[0],headers:r.headers};
  }
  const reg=async name=>req('/api/auth/register',{json:{username:name,password:'long-test-password-123'}});
  const record=(cookie,table,mode,row,id)=>req('/api/records',{cookie,json:{table,mode,row,id}});
  assert.equal((await req('/api/health')).data.aiConfigured,false);
  assert.equal((await req('/api/records',{json:{table:'profiles',mode:'select'}})).status,401);
  assert.equal((await reg('bad')).status,200);
  const a=await reg('alice'),b=await reg('bob');
  assert.equal(a.status,200);assert.equal(b.status,200);
  assert.match(a.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
  const alice=a.cookie,bob=b.cookie;
  const user=a.data.data.user.id;
  assert.equal((await req('/api/auth/login',{json:{username:'alice',password:'wrong-password-123'}})).status,401);
  assert.equal((await req('/api/auth/session',{cookie:alice})).data.data.user.id,user);
  assert.equal((await record(alice,'users','select')).status,400);
  assert.equal((await req('/api/records',{cookie:alice,json:{table:'profiles',mode:'insert',row:{}},headers:{Origin:'https://attacker.example'}})).status,403);

  const p='users/'+user+'/face/a.png';
  assert.equal((await req('/api/files?path='+encodeURIComponent(p),{cookie:alice,method:'PUT',body:png,headers:{'Content-Type':'image/png'}})).status,200);
  assert.equal((await req('/api/files?path='+encodeURIComponent(p))).status,401);
  assert.equal((await req('/api/files?path='+encodeURIComponent(p),{cookie:bob})).status,400);
  const photo=await req('/api/files?path='+encodeURIComponent(p),{cookie:alice});
  assert.equal(photo.status,200);assert.deepEqual(photo.data,png);
  assert.equal((await req('/api/files?path='+encodeURIComponent('users/'+user+'/bad.svg'),{cookie:alice,method:'PUT',body:'<svg onload="alert(1)"/>',headers:{'Content-Type':'image/svg+xml'}})).status,400);
  assert.equal((await record(alice,'profiles','insert',{nickname:'Alice',face_photo_path:p,owner_id:'fake-owner'})).status,200);
  const item=await record(alice,'wardrobe_items','insert',{name:'衬衫',category:'上装',image_path:p});
  const itemId=item.data.data[0].id;
  assert.equal((await record(bob,'wardrobe_items','select')).data.data.length,0);
  assert.equal((await record(bob,'wardrobe_items','update',{name:'stolen'},itemId)).data.data.length,0);
  assert.equal((await record(alice,'wardrobe_items','select')).data.data[0].name,'衬衫');
  assert.equal((await record(alice,'wardrobe_items','delete',null)).status,400);
  assert.equal((await record(alice,'outfits','insert',{title:'收藏',payload:{items:[{id:itemId,image_path:p}],lookImage:p}})).status,200);
  assert.deepEqual((await req('/api/models',{cookie:alice})).data.data,[]);
  assert.equal((await req('/api/chat',{cookie:alice,json:{messages:[]}})).status,503);
  for(const file of ['/server.cjs','/.env','/data/outfit.sqlite','/../server.cjs'])assert.equal((await req(file)).status,404);

  const backup=(await req('/api/backup',{cookie:alice})).data;
  assert.equal(backup.files.length,1);
  assert.equal(backup.tables.profiles[0].nickname,'Alice');
  assert.equal(JSON.stringify(backup).includes('password_hash'),false);
  assert.equal((await req('/api/import',{cookie:alice,json:backup})).status,409);
  assert.equal((await req('/api/import',{cookie:bob,json:backup})).status,200);
  const migrated=(await req('/api/backup',{cookie:bob})).data;
  assert.notEqual(migrated.files[0].path,p);
  assert.equal(migrated.tables.profiles[0].face_photo_path,migrated.files[0].path);
  assert.equal(migrated.tables.outfits[0].payload.items[0].id,migrated.tables.wardrobe_items[0].id);
  assert.equal(migrated.tables.outfits[0].payload.lookImage,migrated.files[0].path);
  assert.equal((await req('/api/import',{cookie:bob,json:backup})).status,409);
  const c=await reg('carol');
  const broken=structuredClone(backup);broken.tables.wardrobe_items[0].image_path='missing-photo';
  assert.equal((await req('/api/import',{cookie:c.cookie,json:broken})).status,400);
  const rolled=(await req('/api/backup',{cookie:c.cookie})).data;
  assert.equal(rolled.files.length,0);assert.equal(rolled.tables.profiles.length,0);

  await app.close();app=createApp({dataDir:dir,env:{LLM_API_BASE:'',LLM_API_KEY:'',LLM_MODEL:''}});base=await start();
  assert.equal((await req('/api/auth/session',{cookie:alice})).data.data.user.id,user);
  assert.equal((await record(alice,'wardrobe_items','select')).data.data[0].id,itemId);
  assert.equal((await req('/api/auth/logout',{cookie:alice,json:{}})).status,200);
  assert.equal((await req('/api/auth/session',{cookie:alice})).data.data,null);
});
