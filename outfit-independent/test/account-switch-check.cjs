// Optional jsdom acceptance check. Uses only an isolated database and synthetic images.
// NODE_PATH=<jsdom package directory> node test/account-switch-check.cjs
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {JSDOM,VirtualConsole}=require('jsdom');
const {createApp}=require('../server.cjs');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){for(let i=0;i<150;i++){if(fn())return;await delay(25);}throw Error('Timed out: '+label);}

(async()=>{
  const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'outfit-account-switch-'));
  const app=createApp({dataDir,env:{LLM_API_BASE:'',LLM_API_KEY:'',LLM_MODEL:'',IMAGE_API_KEY:'',OPENAI_API_KEY:''}});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+app.server.address().port;
  let cookie='',dom,delayNextLook=false,releaseLook,lookStarted=false,activeRequests=0;
  const errors=[];
  const password='synthetic-account-test-password';
  const names={a:'isolation-owner-a',b:'isolation-owner-b'};
  async function api(url,{json,method='GET',data,headers={},useCookie=cookie}={}){
    const r=await fetch(base+url,{method:json?'POST':method,headers:{...(json?{'Content-Type':'application/json'}:{}),...headers,...(useCookie?{Cookie:useCookie}:{}),Origin:base},body:json?JSON.stringify(json):data});
    const value=r.headers.get('Content-Type')?.includes('application/json')?await r.json():await r.arrayBuffer();
    return {status:r.status,value,cookie:r.headers.get('set-cookie')?.split(';')[0]};
  }
  try{
    const a=await api('/api/auth/register',{json:{username:names.a,password},useCookie:''});
    assert.equal(a.status,200);cookie=a.cookie;
    const owner=a.value.data.user.id,face='users/'+owner+'/face/synthetic.png',coat='users/'+owner+'/wardrobe/synthetic.png',tryon='users/'+owner+'/tryon/synthetic.png';
    for(const file of [face,coat,tryon])assert.equal((await api('/api/files?path='+encodeURIComponent(file),{method:'PUT',data:png,headers:{'Content-Type':'image/png'}})).status,200);
    assert.equal((await api('/api/records',{json:{table:'profiles',mode:'insert',row:{nickname:'Synthetic A profile',height_cm:158,weight_kg:54,face_photo_path:face}}})).status,200);
    const item=await api('/api/records',{json:{table:'wardrobe_items',mode:'insert',row:{name:'Synthetic A coat',category:'外套',image_path:coat}}});
    const plan={title:'Synthetic A private outfit',style:'极简',occasion:'日常通勤',temperature:10,weather:'晴',items:[{id:item.value.data[0].id,name:'Synthetic A coat',category:'外套',image_path:coat}],gaps:[],tips:[],source:'rules',tryonImage:tryon};
    assert.equal((await api('/api/records',{json:{table:'outfits',mode:'insert',row:{title:plan.title,style:plan.style,occasion:plan.occasion,payload:plan}}})).status,200);

    const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8').replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g,'');
    const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
    dom=new JSDOM(html,{url:base,runScripts:'outside-only',virtualConsole:vc});
    const w=dom.window,$=s=>w.document.querySelector(s);
    w.scrollTo=()=>{};w.Element.prototype.scrollIntoView=()=>{};w.confirm=()=>true;
    w.URL.createObjectURL=URL.createObjectURL;w.URL.revokeObjectURL=URL.revokeObjectURL;
    w.AbortController=AbortController;w.AbortSignal=AbortSignal;
    const broadcastChannels=[];
    if(typeof w.BroadcastChannel==='function')w.BroadcastChannel=class {
      constructor(name){this.name=name;broadcastChannels.push(this);}
      postMessage(){}
      close(){}
    };
    w.OutfitImage={prepare:async file=>({blob:file})};
    w.OutfitLook={render:async()=>{
      if(delayNextLook){delayNextLook=false;lookStarted=true;await new Promise(r=>{releaseLook=r;});}
      return new Blob([png],{type:'image/png'});
    }};
    w.fetch=async(u,options={})=>{
      const target=new URL(u,base);assert.equal(target.origin,base,'Test must not contact any outside provider');
      const headers=new Headers(options.headers||{});if(cookie)headers.set('Cookie',cookie);headers.set('Origin',base);
      activeRequests++;
      try{const res=await fetch(target,{...options,headers});if(res.headers.get('set-cookie'))cookie=res.headers.get('set-cookie').split(';')[0];return res;}
      finally{activeRequests--;}
    };
    for(const script of ['local-api.js','style-guide.js','outfit-plan.js','look-reference.js','shopping.js','app.js'])w.eval(fs.readFileSync(path.join(__dirname,'../public',script),'utf8'));
    async function ready(name){const displayName=name===names.a?'Synthetic A profile':name;await until(()=>!$('#appView').hidden&&$('#sideName').textContent===displayName&&!$('#localLoginBtn').disabled,'account '+name+' is ready');await until(()=>activeRequests===0,'requests settled');await delay(50);}
    async function logout(){ $('#logoutBtn').click();await until(()=>!$('#authView').hidden,'logout screen');await until(()=>activeRequests===0,'logout request settled');}
    async function login(name,register){
      $('[data-auth-mode="'+(register?'register':'login')+'"]').click();$('#localUsername').value=name;$('#localPassword').value=password;$('#localLoginBtn').click();await ready(name);
    }
    function assertEmptyAccount(){
      assert.equal($('#resultArea').hidden,true,'new account must hide the previous outfit result');
      assert.equal($('#resultArea').innerHTML,'','old private outfit markup must be removed, not merely hidden');
      assert.equal($('#pfNickname').value,'','old profile input must be cleared');
      assert.equal($('#facePreview img'),null,'old face preview must be removed');
      assert.equal($('#facePreview2 img'),null,'old profile face must be removed');
      assert.equal($('#navClosetCount').textContent,'0');assert.equal($('#navSavedCount').textContent,'0');
      assert.equal($('#savedGrid .saved-card'),null,'empty account must not retain saved cards');
      assert.equal(Array.from(w.document.querySelectorAll('img')).some(img=>(img.getAttribute('src')||'').includes(owner)),false,'no old owner image URL may remain in the DOM');
      assert.equal(w.document.body.textContent.includes(plan.title),false,'old private outfit title must not remain in the DOM');
    }

    await ready(names.a);await until(()=>!!$('#tryonBox .tryon-image'),'A personal image');
    assert.ok($('#tryonBox .tryon-image').getAttribute('src').includes(encodeURIComponent(owner)));assert.equal($('#pfNickname').value,'Synthetic A profile');assert.equal($('#navSavedCount').textContent,'1');
    await logout();await login(names.b,true);assertEmptyAccount();
    const foreign=await api('/api/files?path='+encodeURIComponent(tryon));assert.ok([400,401,403,404].includes(foreign.status),'B must not fetch A private image');
    let backup=(await api('/api/backup')).value;assert.equal(backup.tables.profiles.length,0);assert.equal(backup.tables.wardrobe_items.length,0);assert.equal(backup.tables.outfits.length,0);assert.equal(backup.files.length,0);
    console.log('PASS: switching A -> empty B clears old DOM, face, profile, wardrobe and image; backend rejects B reading A files');

    await logout();await login(names.a,false);await until(()=>!!$('#tryonBox .tryon-image'),'A image restored');
    assert.equal($('#pfNickname').value,'Synthetic A profile');assert.equal($('#navSavedCount').textContent,'1');assert.ok($('#resultArea').textContent.includes(plan.title));
    console.log('PASS: signing back into A restores only A own saved data');

    delayNextLook=true;$('[data-action="regen-look"]').click();await until(()=>lookStarted,'A delayed reference export starts');
    await logout();await login(names.b,false);assertEmptyAccount();
    releaseLook();await delay(200);await until(()=>activeRequests===0,'old render completion settles');assertEmptyAccount();
    backup=(await api('/api/backup')).value;assert.equal(backup.files.length,0,'A delayed export must not upload into B');assert.equal(backup.tables.outfits.length,0,'A delayed export must not create B outfits');
    console.log('PASS: delayed A reference rendering cannot revive A images or write a file into B after switching');

    await logout();await login(names.a,false);await until(()=>!!$('#tryonBox .tryon-image'),'A image before another tab changes account');
    const beforeExternalChange=(await api('/api/backup')).value;
    const staleQuery=w.OutfitBackend.database.from('wardrobe_items').insert({name:'must-not-write-after-tab-switch',category:'上装'}).select();
    const unreadResponse=await w.OutfitBackend.fetch('/api/records',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({table:'profiles',mode:'select'})});
    assert.equal(unreadResponse.status,200);assert.equal(unreadResponse.bodyUsed,false,'response body remains unread until after account invalidation');
    if(broadcastChannels.length){
      const channel=broadcastChannels.find(c=>c.name==='outfit-account-change-v1');assert.ok(channel?.onmessage,'account channel has a change listener');
      channel.onmessage({data:{type:'changed'}});
    }else w.dispatchEvent(new w.StorageEvent('storage',{key:'outfit-account-change-v1',newValue:'{"type":"changed"}'}));
    assert.equal($('#authView').hidden,false,'another tab changing account must immediately show login');
    assert.equal($('#appView').hidden,true,'another tab changing account must immediately hide the private app');
    assertEmptyAccount();
    const staleResult=await staleQuery;assert.equal(staleResult.error?.code,'ACCOUNT_CHANGED','a query created before the change must not execute');
    await assert.rejects(unreadResponse.json(),e=>e.code==='ACCOUNT_CHANGED','a previously received response body must not expose old account data');
    const afterExternalChange=(await api('/api/backup')).value;
    assert.equal(afterExternalChange.tables.wardrobe_items.length,beforeExternalChange.tables.wardrobe_items.length,'stale query must not write a record');
    assert.equal(afterExternalChange.tables.wardrobe_items.some(i=>i.name==='must-not-write-after-tab-switch'),false);
    console.log('PASS: cross-tab account changes clear private DOM immediately and invalidate old queries and unread response bodies');
    assert.deepEqual(errors,[]);
  }finally{releaseLook?.();dom?.window.close();await app.close();fs.rmSync(dataDir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
