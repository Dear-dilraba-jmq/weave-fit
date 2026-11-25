'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {createApp}=require('../server.cjs');
const {search,sign,productsFrom,safeUrl}=require('../shopping.cjs');
const env={TAOBAO_APP_KEY:'synthetic-app',TAOBAO_APP_SECRET:'synthetic-secret',TAOBAO_ADZONE_ID:'123456'};
const row={item_id:'opaque-test-item-id',item_basic_info:{title:'合成测试白色运动鞋',pict_url:'//img.alicdn.com/test-shoes.jpg',shop_title:'合成测试店',user_type:1},publish_info:{click_url:'//item.taobao.com/item.htm?id=1234567890'},price_promotion_info:{zk_final_price:'129.9',final_promotion_price:'80'}};
const fixture=rows=>({tbk_dg_material_optional_upgrade_response:{result_list:{map_data:rows}}});
test('same-record images and product links only; no search links, unsafe URLs or invented prices',()=>{
  const products=productsFrom(fixture([row,row,{...row,item_id:'bad',publish_info:{click_url:'https://s.taobao.com/search?q=shoes'}},{...row,item_id:'bad2',item_basic_info:{...row.item_basic_info,pict_url:'https://evil.example/a.jpg'}}]));
  assert.equal(products.length,1);assert.equal(products[0].price,'129.90');assert.equal(products[0].platform,'天猫');
  assert.equal(products[0].image,'https://img.alicdn.com/test-shoes.jpg');assert.equal(products[0].url,'https://item.taobao.com/item.htm?id=1234567890');
  assert.equal(safeUrl('javascript:alert(1)','product'),null);assert.equal(safeUrl('https://item.taobao.com.evil.example/item.htm?id=2','product'),null);
  assert.equal(productsFrom(fixture([{...row,price_promotion_info:{}}]))[0].price,null);
});
test('TOP signing, Asia/Shanghai time, no personal fields, safe upstream failures',async()=>{
  assert.equal(sign({b:'2',a:'1'},'secret'),crypto.createHash('md5').update('secreta1b2secret').digest('hex').toUpperCase());
  const now=new Date('2026-11-23T02:03:04Z');
  const result=await search({env,input:{keyword:'白色简约运动鞋',face:'private-face',height_cm:158},now,fetchImpl:async(url,opt)=>{
    assert.equal(url,'https://eco.taobao.com/router/rest');
    const p=Object.fromEntries(opt.body);assert.equal(p.timestamp,'2026-11-23 10:03:04');assert.equal(p.sign,sign(p,env.TAOBAO_APP_SECRET));assert.equal(p.q,'白色简约运动鞋');
    assert.equal(opt.body.has('face'),false);assert.equal(opt.body.has('height_cm'),false);assert.equal(opt.body.has('app_secret'),false);
    return Response.json(fixture([row]));
  }});
  assert.equal(result.products.length,1);assert.equal(result.checkedAt,now.toISOString());assert.equal(JSON.stringify(result).includes('synthetic-secret'),false);
  await assert.rejects(search({env:{},input:{keyword:'鞋'}}),{status:503});
  await assert.rejects(search({env,input:{keyword:''}}),{status:400});
  await assert.rejects(search({env,input:{keyword:'鞋'},fetchImpl:async()=>Response.json({error_response:{sub_msg:'synthetic-secret'}})}),e=>e.status===502&&!e.message.includes('synthetic-secret'));
  await assert.rejects(search({env,input:{keyword:'鞋'},fetchImpl:async()=>{throw Error('network');}}),{status:502});
});
test('shopping endpoints require login and return real-source card data without credentials',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'outfit-shopping-test-'));let calls=0;
  const app=createApp({dataDir:dir,env,shoppingFetch:async()=>{calls++;return Response.json(fixture([row]));}});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
  t.after(async()=>{await app.close();fs.rmSync(dir,{recursive:true,force:true});});
  assert.equal((await fetch(base+'/api/shopping/status')).status,401);
  const reg=await fetch(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'shopping-test',password:'synthetic-password-long'})});
  const cookie=reg.headers.get('set-cookie').split(';')[0];await reg.json();
  const status=await (await fetch(base+'/api/shopping/status',{headers:{Cookie:cookie}})).json();assert.deepEqual(status,{configured:true});
  const r=await fetch(base+'/api/shopping/search',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({keyword:'白色运动鞋'})});
  assert.equal(r.status,200);const data=await r.json();assert.equal(data.data.products[0].title,row.item_basic_info.title);assert.equal(calls,1);
  assert.equal(JSON.stringify(data).includes(env.TAOBAO_APP_KEY),false);assert.equal(JSON.stringify(data).includes(env.TAOBAO_APP_SECRET),false);
});
