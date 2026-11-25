'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createApp}=require('../server.cjs');
async function fixture(t,extra={}){
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'outfit-public-test-'));
 const app=createApp({dataDir,env:{LLM_API_BASE:'',LLM_API_KEY:'',LLM_MODEL:'',APP_HOSTS:'wardrobe-public.example',COOKIE_SECURE:'1',PUBLIC_HTTPS_ONLY:'1',TRUST_LOOPBACK_PROXY:'1',...extra}});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
 t.after(async()=>{await app.close();fs.rmSync(dataDir,{recursive:true,force:true});});
 return (route,body,headers={})=>new Promise((resolve,reject)=>{
   const req=require('node:http').request(base+route,{method:body===undefined?'GET':'POST',headers:{Host:'wardrobe-public.example','X-Forwarded-Proto':'https',...(body===undefined?{}:{'Content-Type':'application/json',Origin:'https://wardrobe-public.example'}),...headers}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:res.headers})));});
   req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body));
 });
}
test('public entry enforces HTTPS, secure session cookies, same-origin actions and private data protection',async t=>{
 const request=await fixture(t);
 const redirect=await request('/?next=test',undefined,{'X-Forwarded-Proto':'http'});assert.equal(redirect.status,302);assert.equal(redirect.headers.get('location'),'https://wardrobe-public.example/?next=test');
 assert.equal((await request('/api/auth/register',{username:'public-synthetic',password:'synthetic-password-123'},{'X-Forwarded-Proto':'http'})).status,403);
 assert.equal((await request('/api/auth/register',{username:'public-synthetic',password:'synthetic-password-123'},{Origin:'https://attacker.example'})).status,403);
 assert.equal((await request('/api/auth/register',{username:'public-synthetic',password:'synthetic-password-123'},{Origin:'http://wardrobe-public.example'})).status,403);
 const register=await request('/api/auth/register',{username:'public-synthetic',password:'synthetic-password-123'});assert.equal(register.status,200);
 const cookie=register.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);assert.match(cookie,/; Secure/);
 assert.equal((await request('/api/status',undefined,{Cookie:cookie.split(';')[0]})).status,200);
 for(const route of ['/api/backup','/api/status','/api/files?path=users/other/face.png'])assert.equal((await request(route)).status,401);
 assert.equal((await request('/data/outfit.sqlite')).status,404);assert.equal((await request('/.env')).status,404);
 assert.equal((await request('/',undefined,{Host:'attacker.example'})).status,403);
});
test('public login throttling separates visitors only behind the explicitly trusted loopback proxy',async t=>{
 const request=await fixture(t);const invalid={username:'x',password:'synthetic-password-123'};
 for(let i=0;i<20;i++)assert.equal((await request('/api/auth/login',invalid,{'X-Forwarded-For':'203.0.113.1'})).status,400);
 assert.equal((await request('/api/auth/login',invalid,{'X-Forwarded-For':'spoofed, 203.0.113.1'})).status,429);
 assert.equal((await request('/api/auth/login',invalid,{'X-Forwarded-For':'203.0.113.2'})).status,400);
 const untrusted=await fixture(t,{TRUST_LOOPBACK_PROXY:''});
 for(let i=0;i<20;i++)assert.equal((await untrusted('/api/auth/login',invalid,{'X-Forwarded-For':'203.0.113.'+(i+1)})).status,400);
 assert.equal((await untrusted('/api/auth/login',invalid,{'X-Forwarded-For':'203.0.113.99'})).status,429);
});
