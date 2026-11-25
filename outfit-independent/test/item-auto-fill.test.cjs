'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom'),{createApp}=require('../server.cjs');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn){for(let i=0;i<200;i++){if(fn())return;await sleep(25);}throw Error('Automatic item UI timed out');}
test('upload fills four fields, respects edits, saves canonical metadata and ignores cancelled photos and accounts',async t=>{
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'outfit-item-auto-'));let holdNext=false,release,started=false,calls=0;
 const app=createApp({dataDir,env:{LLM_API_BASE:'',LLM_API_KEY:'',LLM_MODEL:'',IMAGE_API_KEY:'',OPENAI_API_KEY:''},itemRecognize:async(input,options)=>{
   const call=++calls;if(holdNext){holdNext=false;started=true;await new Promise(r=>{release=r;});}
   return {attributes:{name:call>2?'浅蓝新照片衬衫':'浅蓝短袖衬衫',category:options.category||'上装',color:'浅蓝',season:'夏季',tags:['短袖'],warnings:[],needsReview:false},image:{contentType:'image/png',base64:png.toString('base64')},cutoutMessage:''};
 }});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;let cookie='',dom;const errors=[];
 t.after(async()=>{release?.();dom?.window.close();await app.close();fs.rmSync(dataDir,{recursive:true,force:true});});
 async function fetchLocal(url,options={}){const target=new URL(url,base);assert.equal(target.origin,base,'Photos must never go to an outside service');const r=await fetch(target,{...options,headers:{...options.headers,...(cookie?{Cookie:cookie}:{}),Origin:base}});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return r;}
 const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8').replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g,'');const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 dom=new JSDOM(html,{url:base,runScripts:'outside-only',virtualConsole:vc});const w=dom.window,$=s=>w.document.querySelector(s);
 w.scrollTo=()=>{};w.Element.prototype.scrollIntoView=()=>{};w.confirm=()=>true;w.fetch=fetchLocal;w.Blob=Blob;w.File=File;w.URL.createObjectURL=URL.createObjectURL;w.URL.revokeObjectURL=URL.revokeObjectURL;w.AbortController=AbortController;w.AbortSignal=AbortSignal;
 for(const file of ['local-api.js','cutout.js','style-guide.js','outfit-plan.js','look-reference.js','shopping.js'])w.eval(fs.readFileSync(path.join(__dirname,'../public',file),'utf8'));
 w.OutfitImage.prepare=async file=>({blob:file});w.OutfitLook={render:async()=>new Blob([png],{type:'image/png'})};w.eval(fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8'));
 await until(()=>!$('#authView').hidden);$('[data-auth-mode="register"]').click();$('#localUsername').value='auto-item-owner';$('#localPassword').value='synthetic-password-123';$('#localLoginBtn').click();await until(()=>!$('#appView').hidden&&!$('#localLoginBtn').disabled);
 function choosePhoto(){Object.defineProperty($('#itemImage'),'files',{value:[new File([png],'synthetic.png',{type:'image/png'})],configurable:true});$('#itemImage').dispatchEvent(new w.Event('change',{bubbles:true}));}
 function input(id,value){$('#'+id).value=value;$('#'+id).dispatchEvent(new w.Event('input',{bubbles:true}));}
 $('[data-nav="closet"]').click();$('#openAddBtn').click();choosePhoto();await until(()=>!$('#saveItemBtn').disabled);assert.match($('#itemAutoStatus').textContent,/已按照片/,$('#cutoutStatus').textContent);
 assert.equal($('#itemName').value,'浅蓝短袖衬衫');assert.equal($('#itemCategory').value,'上装');assert.equal($('#itemColor').value,'浅蓝');assert.equal($('#itemSeason').value,'夏季');assert.ok($('#uploadPreview img'));
 $('#saveItemBtn').click();await until(()=>$('#addPanel').hidden&&$('#closetGrid .closet-card'));
 const backup=await (await fetchLocal('/api/backup')).json(),item=backup.tables.wardrobe_items[0];assert.equal(item.name,'浅蓝短袖衬衫');assert.equal(item.color,'浅蓝');assert.equal(item.season,'夏季');assert.equal(item.cutout,true);assert.ok(item.original_path);
 // Existing metadata remains unchanged when a replacement photo is selected.
 $('[data-edit]').click();input('itemName','我的手动命名');choosePhoto();await until(()=>!$('#saveItemBtn').disabled&&$('#itemAutoStatus').textContent.includes('已按照片'));assert.equal($('#itemName').value,'我的手动命名');$('#cancelItemBtn').click();
 // A user edit made while inference is pending must win over its late response.
 $('#openAddBtn').click();holdNext=true;started=false;choosePhoto();await until(()=>started);input('itemName','我刚写的名字');input('itemSeason','冬季');release();await until(()=>!$('#saveItemBtn').disabled);assert.equal($('#itemName').value,'我刚写的名字');assert.equal($('#itemSeason').value,'冬季');
 // Explicit re-fill overwrites prior entries but still requires the Save click.
 $('#autoFillItemBtn').click();await until(()=>!$('#saveItemBtn').disabled&&$('#itemName').value==='浅蓝新照片衬衫');assert.equal($('#itemSeason').value,'夏季');assert.equal((await (await fetchLocal('/api/backup')).json()).tables.wardrobe_items.length,1);
 // A cancelled photo cannot replace the new photo's attributes.
 holdNext=true;started=false;choosePhoto();await until(()=>started);const oldRelease=release;choosePhoto();await until(()=>!$('#saveItemBtn').disabled&&calls>=6);oldRelease();await sleep(50);assert.equal($('#itemName').value,'浅蓝新照片衬衫');
 // Switching accounts clears both the in-flight inference and its draft fields.
 holdNext=true;started=false;choosePhoto();await until(()=>started);const accountRelease=release;$('#logoutBtn').click();await until(()=>!$('#authView').hidden&&!$('#localLoginBtn').disabled);
 $('[data-auth-mode="register"]').click();$('#localUsername').value='auto-item-empty';$('#localPassword').value='synthetic-password-123';$('#localLoginBtn').click();await until(()=>!$('#appView').hidden&&$('#sideName').textContent==='auto-item-empty');accountRelease();await sleep(50);$('#openAddBtn').click();assert.equal($('#itemName').value,'');assert.equal($('#itemColor').value,'');assert.equal($('#itemSeason').value,'四季');assert.equal($('#autoFillItemBtn').disabled,true);assert.equal($('#uploadPreview img'),null);assert.deepEqual(errors,[]);
});
test('analysis API requires the current account and validates image bytes and category before processing',async t=>{
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'outfit-item-api-'));let calls=0;const app=createApp({dataDir,itemRecognize:async()=>{calls++;return {attributes:{name:'测试单品',category:'上装',color:'白色',season:'四季'},image:null};}});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;t.after(async()=>{await app.close();fs.rmSync(dataDir,{recursive:true,force:true});});
 const request=(route,options)=>fetch(base+route,options),auth=await request('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'auto-api',password:'synthetic-password-123'})}),cookie=auth.headers.get('set-cookie').split(';')[0];
 assert.equal((await request('/api/wardrobe/analyze',{method:'POST',body:png})).status,401);assert.equal((await request('/api/wardrobe/analyze',{headers:{Cookie:cookie}})).status,405);
 assert.equal((await request('/api/wardrobe/analyze',{method:'POST',headers:{Cookie:cookie},body:'not an image'})).status,400);
 assert.equal((await request('/api/wardrobe/analyze?category=invalid',{method:'POST',headers:{Cookie:cookie},body:png})).status,400);
 assert.equal(calls,0);assert.equal((await request('/api/wardrobe/analyze',{method:'POST',headers:{Cookie:cookie,'X-Outfit-Owner':'another-account'},body:png})).status,409);
 assert.equal((await request('/api/wardrobe/analyze',{method:'POST',headers:{Cookie:cookie},body:png})).status,200);assert.equal(calls,1);
});
