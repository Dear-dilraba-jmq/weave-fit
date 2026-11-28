'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createApp}=require('../server.cjs');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=','base64');

async function fixture(t){
  const tempRoot=path.resolve(os.tmpdir()),dir=fs.mkdtempSync(path.join(tempRoot,'outfit-account-owner-'));
  const app=createApp({dataDir:dir,env:{LLM_API_BASE:'',LLM_API_KEY:'',LLM_MODEL:''}});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+app.server.address().port;
  t.after(async()=>{
    await app.close();
    const resolved=path.resolve(dir);
    assert.ok(resolved.startsWith(tempRoot+path.sep)&&path.basename(resolved).startsWith('outfit-account-owner-'));
    fs.rmSync(resolved,{recursive:true,force:true});
  });
  async function req(route,{cookie='',owner,json,method='GET',body,headers={}}={}){
    const response=await fetch(base+route,{method:json===undefined?method:'POST',headers:{...(cookie?{Cookie:cookie}:{}),...(owner===undefined?{}:{'X-Outfit-Owner':owner}),...(json===undefined?{}:{'Content-Type':'application/json'}),...headers},body:json===undefined?body:JSON.stringify(json)});
    const data=response.headers.get('content-type')?.includes('application/json')?await response.json():Buffer.from(await response.arrayBuffer());
    return {status:response.status,data,headers:response.headers,cookie:response.headers.get('set-cookie')?.split(';')[0]};
  }
  async function register(name,options={}){
    const r=await req('/api/auth/register',{...options,json:{username:name,password:'synthetic-owner-password'}});
    assert.equal(r.status,200);return {cookie:r.cookie,id:r.data.data.user.id};
  }
  const record=(user,table,mode,row,id)=>req('/api/records',{cookie:user.cookie,owner:user.id,json:{table,mode,row,id}});
  async function upload(user,name){
    const imagePath='users/'+user.id+'/'+name+'.png';
    assert.equal((await req('/api/files?path='+encodeURIComponent(imagePath),{cookie:user.cookie,owner:user.id,method:'PUT',body:png,headers:{'Content-Type':'image/png'}})).status,200);
    return imagePath;
  }
  return {app,req,register,record,upload};
}

test('expected-owner header blocks stale reads, writes and logout without affecting the active account',async t=>{
  const {req,register}=await fixture(t),a=await register('owner-header-alice');
  // Login/register intentionally allow the old tab's identity while changing accounts.
  const b=await register('owner-header-bob',{cookie:a.cookie,owner:a.id});
  for(const [route,json] of [['/api/auth/session',undefined],['/api/records',{table:'outfits',mode:'insert',row:{title:'stale-write'}}],['/api/auth/logout',{}]]){
    const stale=await req(route,{cookie:b.cookie,owner:a.id,json});
    assert.equal(stale.status,409);assert.equal(stale.headers.get('x-outfit-account-mismatch'),'1');
    assert.equal(stale.headers.get('set-cookie'),null,'An old window must not clear the active account cookie');
  }
  const session=await req('/api/auth/session',{cookie:b.cookie,owner:b.id});
  assert.equal(session.data.data.user.id,b.id);
  assert.deepEqual((await req('/api/records',{cookie:b.cookie,owner:b.id,json:{table:'outfits',mode:'select'}})).data.data,[]);
  assert.equal((await req('/api/auth/session',{cookie:b.cookie})).status,200,'Legacy clients without the header still work');
  const relogin=await req('/api/auth/login',{cookie:b.cookie,owner:b.id,json:{username:'owner-header-alice',password:'synthetic-owner-password'}});
  assert.equal(relogin.status,200);assert.equal(relogin.data.data.user.id,a.id);
  const noSession=await req('/api/auth/session',{owner:b.id});assert.equal(noSession.status,409);assert.equal(noSession.headers.get('x-outfit-account-mismatch'),'1');
  assert.equal((await req('/api/auth/logout',{cookie:b.cookie,owner:b.id,json:{}})).status,200);
  assert.equal((await req('/api/auth/session',{cookie:b.cookie})).data.data,null);
});

test('private image references cannot be written across accounts; new accounts cannot read old photos',async t=>{
  const {req,register,record,upload}=await fixture(t),a=await register('image-owner-alice'),b=await register('image-owner-bob');
  const aPhoto=await upload(a,'private-face'),bPhoto=await upload(b,'own-face');
  const photo=await req('/api/files?path='+encodeURIComponent(aPhoto),{cookie:a.cookie,owner:a.id});
  assert.equal(photo.status,200);assert.deepEqual(photo.data,png);assert.equal(photo.headers.get('cache-control'),'no-store');
  assert.equal((await req('/api/files?path='+encodeURIComponent(aPhoto),{cookie:b.cookie,owner:b.id})).status,400);
  assert.equal((await req('/api/files?path='+encodeURIComponent(aPhoto))).status,401);
  assert.equal((await record(b,'profiles','insert',{face_photo_path:aPhoto})).status,400);
  assert.equal((await record(b,'wardrobe_items','insert',{name:'cross-account',category:'上装',image_path:aPhoto})).status,400);
  assert.equal((await record(b,'wardrobe_items','insert',{name:'cross-account-original',category:'上装',image_path:bPhoto,original_path:aPhoto})).status,400);
  for(const payload of [{tryonImage:aPhoto},{lookImage:aPhoto},{items:[{name:'old',image_path:aPhoto}]},{layers:[{original_path:aPhoto}]}]){
    assert.equal((await record(b,'outfits','insert',{title:'rejected',payload})).status,400);
  }
  for(const invalid of ['reference-cream-knit-v1.png','https://example.test/photo.png','blob:private-image','data:image/png;base64,AA==','users/'+b.id+'/../outside.png']){
    assert.equal((await record(b,'outfits','insert',{title:'Invalid photo',payload:{tryonImage:invalid}})).status,400);
  }
  const ownProfile=await record(b,'profiles','insert',{face_photo_path:bPhoto});assert.equal(ownProfile.status,200);
  assert.equal((await record(b,'profiles','update',{face_photo_path:aPhoto},ownProfile.data.data[0].id)).status,400);
  assert.equal((await record(b,'profiles','select')).data.data[0].face_photo_path,bPhoto);
  const owned=await record(b,'outfits','insert',{title:'Historical snapshot',payload:{tryonImage:bPhoto,lookImage:'',items:[{id:999999,name:'Deleted garment snapshot',image_path:bPhoto}]}});
  assert.equal(owned.status,200,'Historical outfits may retain deleted garment IDs');
  assert.equal((await record(b,'outfits','update',{payload:{tryonImage:aPhoto}},owned.data.data[0].id)).status,400);
  assert.equal((await record(b,'outfits','select')).data.data[0].payload.tryonImage,bPhoto);
  assert.equal((await record(b,'outfits','insert',{title:'Snapshot without photo',payload:{tryonImage:null,lookImage:'',items:[{image_path:'',original_path:null}]}})).status,200);
});

test('imports validate every image before writing and remap valid backups into the destination account',async t=>{
  const {app,req,register,record,upload}=await fixture(t),a=await register('import-owner-alice'),b=await register('import-owner-bob');
  const face=await upload(a,'face'),coat=await upload(a,'coat');
  assert.equal((await record(a,'profiles','insert',{nickname:'Synthetic owner',face_photo_path:face})).status,200);
  const garment=await record(a,'wardrobe_items','insert',{name:'Synthetic coat',category:'外套',image_path:coat,original_path:coat});
  assert.equal((await record(a,'outfits','insert',{title:'Synthetic outfit',payload:{tryonImage:face,lookImage:coat,items:[{id:garment.data.data[0].id,image_path:coat,original_path:coat},{id:999999,name:'Deleted garment snapshot',image_path:coat}]}})).status,200);
  const backup=(await req('/api/backup',{cookie:a.cookie,owner:a.id})).data;
  let imageOrRecordInserts=0;
  const prepare=app.db.prepare.bind(app.db);
  app.db.prepare=function(sql){if(/^INSERT INTO (files|records)\b/.test(sql))imageOrRecordInserts++;return prepare(sql);};
  for(const badPath of ['users/another-account/unknown.png','users/'+b.id+'/missing-from-backup.png']){
    const invalid=structuredClone(backup);invalid.tables.outfits[0].payload.lookImage=badPath;
    const r=await req('/api/import',{cookie:b.cookie,owner:b.id,json:invalid});assert.equal(r.status,400);
    assert.equal(imageOrRecordInserts,0,'Invalid image references must fail before any file or record INSERT');
    const empty=(await req('/api/backup',{cookie:b.cookie,owner:b.id})).data;
    assert.equal(empty.files.length,0);assert.equal(empty.tables.profiles.length,0);assert.equal(empty.tables.outfits.length,0);
  }
  // Legacy file paths may be non-private; they must be rewritten from the supplied file map.
  const legacy=structuredClone(backup),oldCoat=legacy.files.find(f=>f.path===coat);oldCoat.path='legacy-storage/coat.png';
  delete legacy.tables.wardrobe_items[0].category;delete legacy.tables.outfits[0].title;
  const replace=value=>typeof value==='string'?(value===coat?'legacy-storage/coat.png':value):Array.isArray(value)?value.map(replace):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,replace(v)])):value;
  legacy.tables=replace(legacy.tables);
  assert.equal((await req('/api/import',{cookie:b.cookie,owner:b.id,json:legacy})).status,200);
  const imported=(await req('/api/backup',{cookie:b.cookie,owner:b.id})).data,paths=new Set(imported.files.map(f=>f.path));
  assert.ok(imported.files.every(f=>f.path.startsWith('users/'+b.id+'/')));
  const payload=imported.tables.outfits[0].payload;
  assert.equal(imported.tables.wardrobe_items[0].category,'其他');assert.equal(imported.tables.outfits[0].title,'导入的搭配');
  for(const p of [imported.tables.profiles[0].face_photo_path,imported.tables.wardrobe_items[0].image_path,imported.tables.wardrobe_items[0].original_path,payload.tryonImage,payload.lookImage,payload.items[0].image_path,payload.items[0].original_path])assert.ok(paths.has(p));
  assert.equal(payload.items[0].id,imported.tables.wardrobe_items[0].id);assert.equal(payload.items[1].id,undefined);assert.equal(payload.items[1].name,'Deleted garment snapshot');
  assert.equal((await req('/api/files?path='+encodeURIComponent(payload.tryonImage),{cookie:b.cookie,owner:b.id})).status,200);
  assert.equal((await req('/api/files?path='+encodeURIComponent(face),{cookie:b.cookie,owner:b.id})).status,400);
});
