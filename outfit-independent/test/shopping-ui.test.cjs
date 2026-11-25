'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(path.join(__dirname,'../public/shopping.js'),'utf8');
const wait=async fn=>{for(let i=0;i<60;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}throw Error('Shopping UI did not settle');};
test('unconfigured shopping provides a precise web search without claiming a real product listing',async t=>{
 const dom=new JSDOM('<details><summary>商品</summary><div id="root"><div data-shopping-gap="0"></div></div></details>',{runScripts:'outside-only',url:'http://127.0.0.1/'}),w=dom.window,calls=[];t.after(()=>w.close());
 w.fetch=async url=>{calls.push(url);return {ok:true,json:async()=>({configured:false})};};w.eval(source);
 w.OutfitShopping.mount(w.document.querySelector('#root'),{gaps:[{name:'藏蓝高腰 A 字短裙',keyword:'参考图风格 夏季 半身裙'}]});
 await wait(()=>w.document.querySelector('.shopping-message')?.textContent.includes('尚未配置'));
 const link=w.document.querySelector('.shopping-search'),url=new URL(link.href);
 assert.equal(url.hostname,'s.taobao.com');assert.equal(url.pathname,'/search');assert.ok(url.searchParams.get('q').includes('藏蓝高腰 A 字短裙'));assert.equal(url.searchParams.get('q').includes('参考图风格'),false);
 assert.match(link.textContent,/搜索/);assert.match(w.document.body.textContent,/不是某一件商品的购买链接/);assert.equal(w.document.querySelector('.product-card'),null);assert.equal(w.document.querySelector('details').open,true);
 assert.deepEqual(calls,['/api/shopping/status']);
});
test('search stays available on upstream failure and late results cannot fill a replaced account view',async t=>{
 const dom=new JSDOM('<div id="root"><div data-shopping-gap="0"></div></div>',{runScripts:'outside-only',url:'http://127.0.0.1/'}),w=dom.window;let release;
 t.after(()=>w.close());w.fetch=async url=>url.endsWith('/status')?{ok:true,json:async()=>({configured:true})}:await new Promise(r=>{release=r;});w.eval(source);
 const root=w.document.querySelector('#root');w.OutfitShopping.mount(root,{gaps:[{name:'浅蓝短袖衬衫'}]});
 await wait(()=>release);assert.ok(root.querySelector('.shopping-search'));
 root.innerHTML='<p>另一个账号的新页面</p>';release({ok:true,json:async()=>({data:{products:[{title:'旧账号结果',url:'https://item.taobao.com/item.htm?id=123',image:'https://img.alicdn.com/a.jpg'}]}})});
 await new Promise(r=>setTimeout(r,10));assert.equal(root.textContent,'另一个账号的新页面');
 root.innerHTML='<div data-shopping-gap="0"></div>';w.fetch=async()=>{throw Error('synthetic connection error');};w.OutfitShopping.mount(root,{gaps:[{name:'米白上衣'}]});
 await wait(()=>root.querySelector('.shopping-retry'));assert.ok(root.querySelector('.shopping-search'));assert.equal(root.querySelector('.product-card'),null);
});
