'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function worker(overrides={}){
 const callbacks={},removed=[],puts=[];
 const context={URL,Response,self:{location:{origin:'http://localhost:8090'},addEventListener:(name,fn)=>{callbacks[name]=fn;},skipWaiting:async()=>{},clients:{claim:async()=>{}}},
  caches:{keys:async()=>['unrelated-cache','outfit-mirror-independent-v1'],delete:async k=>{removed.push(k);},open:async()=>({match:async()=>undefined,put:async(k,v)=>{puts.push(k);}})},fetch:async()=>{throw Error('offline');},...overrides};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/sw.js'),'utf8'),context);
 return {callbacks,removed,puts,context};
}
test('worker never intercepts private account, image, backup or generated data requests',()=>{
 const w=worker();let intercepted=false;
 for(const target of ['/api/auth/session','/api/files?path=users/test/face.png','/api/backup','/api/outfits/generate','https://img.alicdn.com/example.jpg']){
  w.callbacks.fetch({request:{method:'GET',url:new URL(target,'http://localhost:8090').href,mode:'cors',destination:'image'},respondWith:()=>{intercepted=true;},waitUntil:()=>{}});
 }
 assert.equal(intercepted,false);
});
test('worker activation removes only this application older static caches',async()=>{
 const w=worker();let pending;w.callbacks.activate({waitUntil:p=>{pending=p;}});await pending;
 assert.deepEqual(w.removed,['outfit-mirror-independent-v1']);
});
test('worker returns fresh application scripts online and cached shell only on network failure',async()=>{
 const fresh={ok:true,redirected:false,type:'basic',clone:()=>({copy:true})},cached={cached:true};
 let online=true;const w=worker({fetch:async()=>{if(online)return fresh;throw Error('offline');},caches:{open:async()=>({match:async()=>cached,put:async()=>{}})}});
 async function read(){let response;const pending=[];w.callbacks.fetch({request:{method:'GET',url:'http://localhost:8090/app.js',mode:'cors',destination:'script'},respondWith:p=>{response=p;},waitUntil:p=>pending.push(p)});const value=await response;await Promise.all(pending);return value;}
 assert.equal(await read(),fresh);online=false;assert.equal(await read(),cached);
});
test('browser cache-storage failure still permits direct online loading',async()=>{
 const fresh={ok:true};const w=worker({caches:{open:async()=>{throw Error('cache storage unavailable');}},fetch:async()=>fresh});
 let response;w.callbacks.fetch({request:{method:'GET',url:'http://localhost:8090/styles.css',mode:'cors',destination:'style'},respondWith:p=>{response=p;},waitUntil:()=>{}});
 assert.equal(await response,fresh);
});
