'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom'),{createApp}=require('../server.cjs');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=','base64');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<160;i++){if(fn())return;await sleep(25);}throw Error('Manual UI condition timed out');}

test('three wardrobe rows select independently by buttons, keyboard and touch-scroll; save and account reset work',async t=>{
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'outfit-manual-ui-')),app=createApp({dataDir,env:{LLM_API_BASE:'',LLM_API_KEY:'',LLM_MODEL:'',IMAGE_API_KEY:'',OPENAI_API_KEY:''}});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
 let cookie='',dom,holdManual=false,releaseManual;const errors=[];
 t.after(async()=>{dom?.window.close();await app.close();fs.rmSync(dataDir,{recursive:true,force:true});});
 async function localFetch(url,options={}){const target=new URL(url,base);assert.equal(target.origin,base);const r=await fetch(target,{...options,headers:{...options.headers,...(cookie?{Cookie:cookie}:{}),Origin:base}});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];if(holdManual&&target.pathname==='/api/outfits/manual')await new Promise(resolve=>{releaseManual=resolve;});return r;}
 const auth=await (await localFetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'manual-ui-owner',password:'synthetic-password-123'})})).json();
 const image='users/'+auth.data.user.id+'/wardrobe/test.png';assert.equal((await localFetch('/api/files?path='+encodeURIComponent(image),{method:'PUT',headers:{'Content-Type':'image/png'},body:png})).status,200);
 async function insert(row){const r=await localFetch('/api/records',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({table:'wardrobe_items',mode:'insert',row})});assert.equal(r.status,200);return (await r.json()).data[0];}
 const top1=await insert({name:'浅蓝衬衫',category:'上装',color:'浅蓝',image_path:image}),top2=await insert({name:'白色短袖',category:'上装',color:'白色',season:'夏季'});
 const bottom1=await insert({name:'浅灰长裤',category:'下装'}),bottom2=await insert({name:'藏蓝短裙',category:'下装'}),shoes=await insert({name:'白色运动鞋',category:'鞋履'});
 const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8').replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g,'');
 const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));dom=new JSDOM(html,{url:base,runScripts:'outside-only',virtualConsole:vc});
 const w=dom.window,$=s=>w.document.querySelector(s);w.fetch=localFetch;w.scrollTo=()=>{};w.Element.prototype.scrollIntoView=()=>{};w.confirm=()=>true;
 w.URL.createObjectURL=URL.createObjectURL;w.URL.revokeObjectURL=URL.revokeObjectURL;w.AbortController=AbortController;w.AbortSignal=AbortSignal;
 w.OutfitLook={render:async()=>new Blob([png],{type:'image/png'})};w.OutfitImage={prepare:async file=>({blob:file})};
 for(const name of ['local-api.js','style-guide.js','outfit-plan.js','look-reference.js','shopping.js','app.js'])w.eval(fs.readFileSync(path.join(__dirname,'../public',name),'utf8'));
 await until(()=>!$('#appView').hidden);
 $('#manualModeTab').click();assert.equal($('#manualBuilder').hidden,false);assert.equal($('#autoBuilder').hidden,true);
 assert.deepEqual(Array.from(w.document.querySelectorAll('[data-manual-row]')).map(el=>el.dataset.manualRow),['top','bottom','shoes']);
 const selected=key=>$('[data-manual-track="'+key+'"] [aria-current="true"]').dataset.manualId;
 assert.equal(selected('top'),String(top2.id));assert.equal(selected('bottom'),String(bottom2.id));assert.equal(selected('shoes'),String(shoes.id));
 assert.equal($('[data-manual-key="shoes"][data-manual-step="1"]').disabled,true);
 $('[data-manual-key="top"][data-manual-step="1"]').click();assert.equal(selected('top'),String(top1.id));assert.equal(selected('bottom'),String(bottom2.id));
 assert.ok($('[data-manual-track="top"] img'));assert.ok($('[data-manual-track="top"] svg'));
 const bottomTrack=$('[data-manual-track="bottom"]');bottomTrack.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));assert.equal(selected('bottom'),String(bottom1.id));assert.equal(selected('top'),String(top1.id));
 Object.defineProperty(bottomTrack,'clientWidth',{value:300,configurable:true});bottomTrack.scrollLeft=0;bottomTrack.dispatchEvent(new w.Event('scroll'));await until(()=>selected('bottom')===String(bottom2.id));
 $('#manualSeason').value='冬季';$('#manualSeason').dispatchEvent(new w.Event('change'));assert.equal($('#manualTemperature').value,'5');assert.equal($('#tempRange').value,'5');
 $('#manualTemperature').value='30';$('#manualTemperature').dispatchEvent(new w.Event('change'));assert.equal($('#tempRange').value,'30');
 holdManual=true;$('#manualApplyBtn').click();await until(()=>!!releaseManual);$('[data-manual-key="top"][data-manual-step="-1"]').click();releaseManual();
 await until(()=>!$('#manualApplyBtn').disabled);assert.equal($('#resultArea').hidden,true,'a response for the old combination must not replace the new selection');
 holdManual=false;$('[data-manual-key="top"][data-manual-step="1"]').click();$('#manualApplyBtn').click();await until(()=>!$('#resultArea').hidden&&!$('#manualApplyBtn').disabled);
 assert.equal($('#resultArea .eyebrow').textContent,'MY OWN COMBINATION');assert.equal($('#resultArea [data-action="regen"]'),null);assert.ok($('#resultArea #lookBox'));assert.equal($('#resultArea').lastElementChild.id,'tryonBox');assert.equal($('#personalReference').hidden,true);assert.equal($('#resultArea .notes'),null);assert.equal($('#resultArea .climate-result'),null);
 $('[data-action="save"]').click();await until(()=>$('#navSavedCount').textContent==='1');
 const backup=await (await localFetch('/api/backup')).json(),plan=backup.tables.outfits[0].payload;
 assert.equal(plan.source,'manual');assert.deepEqual(plan.items.map(i=>i.id),[top1.id,bottom2.id,shoes.id]);assert.deepEqual(plan.gaps,[]);
 $('[data-manual-key="top"][data-manual-step="-1"]').click();$('[data-action="edit-manual"]').click();assert.equal(selected('top'),String(top1.id),'continue editing restores the viewed outfit choices');
 // Removing a selected piece refreshes only its row and leaves the other choices intact.
 $('[data-nav="closet"]').click();$('[data-del="'+bottom2.id+'"]').click();await until(()=>!$('#closetGrid [data-del="'+bottom2.id+'"]'));
 assert.equal(selected('bottom'),String(bottom1.id));assert.equal(selected('top'),String(top1.id));
 $('#logoutBtn').click();await until(()=>!$('#authView').hidden&&!$('#localLoginBtn').disabled);
 $('[data-auth-mode="register"]').click();$('#localUsername').value='manual-ui-empty';$('#localPassword').value='synthetic-password-123';$('#localLoginBtn').click();await until(()=>!$('#appView').hidden&&$('#sideName').textContent==='manual-ui-empty');
 $('#manualModeTab').click();assert.equal(w.document.querySelectorAll('[data-manual-id]').length,0);assert.equal($('#manualApplyBtn').disabled,true);assert.equal($('#manualBuilder').textContent.includes('浅蓝衬衫'),false);assert.equal($('#resultArea').hidden,true);
 $('[data-manual-add="鞋履"]').click();assert.equal($('#page-closet').hidden,false);assert.equal($('#itemCategory').value,'鞋履');assert.equal($('#addPanel').hidden,false);
 assert.deepEqual(errors,[]);
});
