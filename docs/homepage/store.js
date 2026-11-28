/* 网页版的本机数据与本机账号，主页（home.js）和登录 / 注册页（account.js）共用这一份。
   IndexedDB「weave-fit-web」第 2 版有三个表：
     people  本机账号：昵称、密码哈希与找回码哈希（PBKDF2-SHA256，随机盐）、个人档案、面部参考照片（Blob）
     items   单品：owner 为账号 id；image（白底单品图或照片）、original（原图）为 Blob
     looks   搭配收藏：owner 为账号 id
   第 1 版留下的单品和收藏没有 owner，由这台设备上第一个注册的账号认领。
   当前登录的账号：勾选「记住我」时记在 localStorage，否则记在 sessionStorage（关闭浏览器即退出）。
   数据只在这台设备的这个浏览器里；密码用来区分家人、防止误操作，数据本身没有加密。 */
(function(root){
'use strict';
const NAME='weave-fit-web',VERSION=2,SESSION_KEY='weave-fit-session',ITERATIONS=210000;
const STORES=['items','looks','people'];
let dbPromise=null,volatile=false,memorySession=null;
const memory={items:new Map(),looks:new Map(),people:new Map()};

function open(){
  if(dbPromise)return dbPromise;
  dbPromise=new Promise(resolve=>{
    try{
      const req=root.indexedDB.open(NAME,VERSION);
      req.onupgradeneeded=()=>{const d=req.result;STORES.forEach(name=>{if(!d.objectStoreNames.contains(name))d.createObjectStore(name,{keyPath:'id'});});};
      req.onsuccess=()=>{const d=req.result;d.onversionchange=()=>d.close();resolve(d);};
      req.onerror=req.onblocked=()=>resolve(null);
    }catch(e){resolve(null);}
  }).then(d=>{if(!d)volatile=true;return d;});
  return dbPromise;
}
function request(d,name,mode,run){
  return new Promise((resolve,reject)=>{
    const t=d.transaction(name,mode),req=run(t.objectStore(name));
    t.oncomplete=()=>resolve(req?req.result:undefined);
    t.onerror=t.onabort=()=>reject(t.error||new Error('浏览器拒绝了保存'));
  });
}
async function all(name){const d=await open();if(!d)return [...memory[name].values()];const rows=await request(d,name,'readonly',s=>s.getAll());return Array.isArray(rows)?rows:[];}
async function get(name,id){const d=await open();if(!d)return memory[name].get(id)||null;return (await request(d,name,'readonly',s=>s.get(id)))||null;}
async function put(name,value){const d=await open();if(!d){memory[name].set(value.id,value);return;}await request(d,name,'readwrite',s=>s.put(value));}
async function remove(name,id){const d=await open();if(!d){memory[name].delete(id);return;}await request(d,name,'readwrite',s=>s.delete(id));}
function newId(prefix){return prefix+Date.now().toString(36)+Math.random().toString(36).slice(2,7);}

/* ---------- 本机账号 ---------- */
const encoder=new TextEncoder();
/* 浏览器只在安全来源（HTTPS 或本机 127.0.0.1 / localhost）提供 crypto.subtle；用局域网 IP 的 http 地址打开时账号功能不可用 */
const secure=!!(root.crypto&&root.crypto.subtle);
const INSECURE='账号功能需要通过 HTTPS（或本机 127.0.0.1）打开这个网页';
function hex(buffer){return Array.from(new Uint8Array(buffer),b=>b.toString(16).padStart(2,'0')).join('');}
async function derive(password,saltHex,iterations){
  if(!secure)throw new Error(INSECURE);
  const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
  const salt=new Uint8Array(saltHex.match(/../g).map(h=>parseInt(h,16)));
  return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations},key,256));
}
function same(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
function cleanNickname(value){const name=String(value==null?'':value).replace(/\s+/g,' ').trim();if(!name||name.length>24)throw new Error('昵称需要 1–24 个字');return name;}
function checkPassword(value){if(typeof value!=='string'||value.length<10||value.length>200)throw new Error('密码需要 10–200 位');}
function publicPerson(p){return p?{id:p.id,nickname:p.nickname,created:p.created,profile:p.profile||{},face:p.face instanceof Blob?p.face:null}:null;}
async function hashFor(password){const salt=hex(crypto.getRandomValues(new Uint8Array(16)));return {salt,iterations:ITERATIONS,hash:await derive(password,salt,ITERATIONS)};}
/* 校验失败统一等 600ms 再报错，减慢在页面上逐个试密码 */
async function check(secret,record,message){
  const ok=typeof secret==='string'&&secret!==''&&record&&typeof record.salt==='string'&&same(await derive(secret,record.salt,record.iterations||ITERATIONS),record.hash);
  if(!ok){await new Promise(r=>setTimeout(r,600));throw new Error(message);}
}
function verify(person,password){return check(password,person,'密码不对，请再试一次');}
/* 找回码：12 位，去掉容易看错的 0 O 1 I L，按 4 位一组显示；只保存哈希，只在生成时显示一次 */
const CODE_ALPHABET='ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function recoveryCode(){
  const out=[];
  while(out.length<12)for(const b of crypto.getRandomValues(new Uint8Array(16)))if(b<248&&out.length<12)out.push(CODE_ALPHABET[b%31]);
  return out.join('').replace(/(.{4})(?=.)/g,'$1-');
}
function normalizeCode(code){return String(code==null?'':code).toUpperCase().replace(/[^A-Z0-9]/g,'');}
async function issueRecovery(person){const code=recoveryCode();person.recovery=await hashFor(normalizeCode(code));return code;}
async function listPeople(){return (await all('people')).map(p=>({id:p.id,nickname:p.nickname,created:p.created})).sort((a,b)=>a.created-b.created);}
/* 第 1 版留下、还没有主人的单品和收藏，交给这个账号 */
async function adopt(owner){
  let count=0;
  for(const name of ['items','looks'])for(const row of await all(name))if(!row.owner){row.owner=owner;await put(name,row);if(name==='items')count++;}
  return count;
}
async function register({nickname,password,remember}){
  const name=cleanNickname(nickname);checkPassword(password);
  const people=await all('people');
  if(people.some(p=>p.nickname.toLowerCase()===name.toLowerCase()))throw new Error('这台设备上已经有叫「'+name+'」的账号，换个昵称或直接登录');
  const person=Object.assign({id:newId('p'),nickname:name,created:Date.now(),profile:{},face:null},await hashFor(password));
  const code=await issueRecovery(person);
  await put('people',person);
  const adopted=people.length?0:await adopt(person.id);
  setSession(person.id,remember!==false);
  return {person:publicPerson(person),adopted,recoveryCode:code};
}
/* 忘记密码：用找回码设新密码并登录；用过的找回码作废，换发一个新的 */
async function resetPassword({id,code,password,remember}){
  const person=await get('people',id);
  if(!person)throw new Error('没有找到这个账号');
  checkPassword(password);
  await check(normalizeCode(code),person.recovery,'找回码不对，请核对后再试');
  Object.assign(person,await hashFor(password));
  const next=await issueRecovery(person);
  await put('people',person);
  setSession(person.id,remember!==false);
  return {person:publicPerson(person),recoveryCode:next};
}
/* 已登录时换一个新的找回码（需要当前密码），旧的随即失效 */
async function renewRecoveryCode(id,password){
  const person=await get('people',id);await verify(person,password);
  const code=await issueRecovery(person);await put('people',person);return code;
}
async function login({id,password,remember}){
  const person=await get('people',id);
  if(!person)throw new Error('没有找到这个账号');
  await verify(person,password);
  setSession(person.id,remember!==false);
  return publicPerson(person);
}
function setSession(id,remember){
  const value=JSON.stringify({id,at:Date.now()});memorySession=id;
  try{(remember?root.localStorage:root.sessionStorage).setItem(SESSION_KEY,value);(remember?root.sessionStorage:root.localStorage).removeItem(SESSION_KEY);}catch{/* 存储不可用时只在本页记住 */}
}
function logout(){memorySession=null;try{root.localStorage.removeItem(SESSION_KEY);root.sessionStorage.removeItem(SESSION_KEY);}catch{}}
function sessionId(){
  try{const raw=root.sessionStorage.getItem(SESSION_KEY)||root.localStorage.getItem(SESSION_KEY);if(raw)return JSON.parse(raw).id||null;}catch{}
  return memorySession;
}
async function currentPerson(){const id=sessionId();if(!id)return null;const person=await get('people',id);if(!person){logout();return null;}return publicPerson(person);}
/* 保存个人档案；face 为 undefined 时不改面部参考照片，null 时删除；nickname 给出时同时改昵称 */
async function saveProfile(id,profile,face,nickname){
  const person=await get('people',id);if(!person)throw new Error('账号不存在，请重新登录');
  if(nickname!==undefined){
    const name=cleanNickname(nickname),people=await all('people');
    if(people.some(p=>p.id!==id&&p.nickname.toLowerCase()===name.toLowerCase()))throw new Error('这台设备上已经有叫「'+name+'」的账号');
    person.nickname=name;
  }
  person.profile=profile&&typeof profile==='object'?profile:{};
  if(face!==undefined)person.face=face instanceof Blob?face:null;
  await put('people',person);return publicPerson(person);
}
async function changePassword(id,current,next){
  const person=await get('people',id);await verify(person,current);checkPassword(next);
  Object.assign(person,await hashFor(next));await put('people',person);
}
/* 删除账号：连同这个账号的单品和收藏一起删除 */
async function deleteAccount(id,password){
  const person=await get('people',id);await verify(person,password);
  for(const name of ['items','looks'])for(const row of await all(name))if(row.owner===id)await remove(name,row.id);
  await remove('people',id);
  if(sessionId()===id)logout();
}

root.WeaveStore={SESSION_KEY,secure,INSECURE,all,get,put,remove,newId,isVolatile:()=>open().then(()=>volatile),listPeople,register,login,resetPassword,renewRecoveryCode,logout,sessionId,currentPerson,saveProfile,changePassword,deleteAccount};
})(window);
