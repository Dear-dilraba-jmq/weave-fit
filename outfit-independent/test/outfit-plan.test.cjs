const {test}=require('node:test'),assert=require('node:assert/strict');
const {suggest}=require('../public/outfit-plan.js');
const {climateFor,validate}=require('../public/outfit-plan.js');
const wardrobe=[{id:1,category:'上装',name:'白衬衫',image_path:'shirt',season:'四季'},{id:2,category:'下装',name:'灰裤子',image_path:'pants'},{id:3,category:'鞋履',name:'棕鞋',image_path:'shoe'},{id:4,category:'包袋',name:'棕包',image_path:'bag'},{id:5,category:'外套',name:'大衣',image_path:'coat',season:'冬'}];
test('vacation selects a suitable dress before generic separates and offers a warm-weather or cool-weather reference as needed',()=>{
 const options={temperature:30,style:'度假',occasion:'旅行'};
 const dress={id:10,category:'连衣裙',name:'浅蓝碎花短袖连衣裙'};
 const office={id:11,category:'连衣裙',name:'黑色通勤西装裙'};
 const clothes=[...wardrobe,dress,office];
 const owned=suggest(clothes,[],options);
 assert.ok(owned.items.some(item=>item.id===dress.id));
 assert.ok(!owned.items.some(item=>[1,2,11].includes(item.id)));
 const cool={...options,temperature:18,weather:'小雨'};
 const missing=suggest(clothes,[],cool);
 assert.ok(missing.gaps.some(item=>item.category==='连衣裙'&&/长袖/.test(item.name)));
 assert.ok(!missing.items.some(item=>[1,2,10,11].includes(item.id)));
 assert.deepEqual(validate(missing,clothes,cool),[]);
 const picked=suggest(clothes,[wardrobe[0]],options);
 assert.ok(picked.items.some(item=>item.id===1));
 assert.ok(!picked.gaps.some(item=>item.category==='连衣裙'));
});
test('30°C skips a plain sweatshirt and 18°C skips a short-sleeve top',()=>{
 const sweatshirt={id:6,category:'上装',name:'灰色连帽卫衣',season:'四季',tags:['运动']};
 const tee={id:7,category:'上装',name:'白色短袖 T 恤',season:'四季'};
 const clothes=[...wardrobe,sweatshirt,tee];
 for(const [temperature,piece] of [[30,sweatshirt],[18,tee]]){
  const options={temperature,style:'运动'};
  const plan=suggest(clothes,[piece],options);
  assert.equal(plan.items.some(item=>item.id===piece.id),false);
  assert.ok(plan.warnings.length);
  assert.deepEqual(validate(plan,clothes,options),[]);
  assert.ok(validate({...plan,items:[...plan.items,piece]},clothes,options).some(reason=>reason.includes(piece.name)));
 }
 const rainy=suggest([],[],{temperature:18,weather:'小雨',style:'运动'});
 assert.ok(rainy.gaps.some(item=>item.category==='外套'&&/防水/.test(item.name)));
 assert.ok(rainy.gaps.some(item=>item.category==='上装'&&/长袖/.test(item.name)));
});
test('rules select actual photographed wardrobe items without manual preselection',()=>{
 const r=suggest(wardrobe,[],{temperature:22,style:'极简'});
 assert.deepEqual(r.items.map(i=>i.id),[1,2,3,4]);assert.equal(r.gaps.length,0);
});
test('cold outfits include a coat; selected core pieces are preserved',()=>{
 const r=suggest(wardrobe,[wardrobe[0]],{temperature:5});assert.ok(r.items.some(i=>i.id===5));assert.equal(r.items[0].id,1);
});
test('missing categories become references, existing categories are not duplicated as gaps',()=>{
 const r=suggest([wardrobe[0]],[],{temperature:22});assert.deepEqual(r.items.map(i=>i.id),[1]);assert.deepEqual(r.gaps.map(g=>g.category),['下装','鞋履','包袋']);
});
test('a dress replaces top and bottom; no fabricated wardrobe IDs',()=>{
 const r=suggest([{id:7,category:'连衣裙',image_path:'dress'}],[],{temperature:25});assert.deepEqual(r.items.map(i=>i.id),[7]);assert.ok(r.gaps.every(g=>g.category!=='上装'&&g.category!=='下装'));
});

test('all seasons and temperature boundaries create coherent complete outfits',()=>{
 for(const season of ['春季','夏季','秋季','冬季'])for(const temperature of [-10,0,5,6,11,12,17,18,23,24,28,29,40])for(const weather of ['晴','小雨','大风']){
  const o={season,temperature,weather,style:'参考图风格'},plan=suggest([],[],o);
  assert.deepEqual(validate(plan,[],o),[],JSON.stringify(o));
  if(temperature<=11)assert.ok(plan.gaps.some(i=>i.category==='外套'));
  if(temperature>=29)assert.ok(plan.gaps.every(i=>!(/羽绒|加绒|厚针织|毛衣/.test(i.name))));
 }
});
test('temperature overrides season labels and unsuitable preselected garments',()=>{
 const clothes=[{id:10,category:'外套',name:'厚羽绒服',season:'冬季',image_path:'photo'},{id:11,category:'上装',name:'薄款短袖',season:'夏季'},{id:12,category:'下装',name:'超短裙',season:'夏季'}];
 const hot=suggest(clothes,[clothes[0]],{season:'冬季',temperature:32});
 assert.equal(hot.items.some(i=>i.id===10),false);assert.ok(hot.warnings[0].includes('预选'));
 const cold=suggest(clothes,[clothes[1],clothes[2]],{season:'夏季',temperature:3});
 assert.ok(cold.items.some(i=>i.id===10));assert.equal(cold.items.some(i=>i.id===11||i.id===12),false);assert.equal(cold.warnings.length,2);
 assert.ok(cold.gaps.some(i=>/保暖长袖打底/.test(i.name)));
});
test('reference style retains preppy details but adapts layers, skirts and rain shoes',()=>{
 const mild=suggest([],[],{season:'春季',temperature:20,style:'参考图风格'});assert.ok(mild.gaps.some(i=>/衬衫|百褶/.test(i.name)));
 const cool=suggest([],[],{season:'秋季',temperature:15,style:'参考图风格'});assert.ok(cool.gaps.some(i=>/连裤袜/.test(i.name)));
 const rain=suggest([{id:1,category:'鞋履',name:'白色帆布鞋'}],[],{temperature:25,weather:'小雨'});assert.equal(rain.items.length,0);assert.ok(rain.gaps.some(i=>/雨伞/.test(i.name)));
 assert.equal(climateFor({season:'夏季',temperature:5}).band,0);
});

test('already selected thermal tights and umbrella are used without duplicate suggested purchases',()=>{
 const clothes=[{id:1,category:'配饰',name:'深灰保暖连裤袜'},{id:2,category:'配饰',name:'折叠雨伞'}];
 const plan=suggest(clothes,clothes,{temperature:15,weather:'小雨',style:'学院'});
 assert.equal(plan.items.filter(i=>i.id===1).length,1);assert.equal(plan.items.filter(i=>i.id===2).length,1);
 assert.equal(plan.gaps.some(i=>/连裤袜|雨伞/.test(i.name)),false);assert.deepEqual(validate(plan,clothes,{temperature:15,weather:'小雨'}),[]);
});
test('cold thermal base layer gets a warm middle layer and conflicting outfit bodies are not combined',()=>{
 const clothes=[{id:1,category:'上装',name:'保暖长袖打底衫'},{id:2,category:'连衣裙',name:'夏季连衣裙'},{id:3,category:'下装',name:'灰色直筒裤'}];
 const winter=suggest(clothes,[clothes[0]],{temperature:0});assert.ok(winter.gaps.some(i=>i.role==='mid'));assert.equal(winter.gaps.some(i=>i.role==='inner'),false);assert.deepEqual(validate(winter,clothes,{temperature:0}),[]);
 const summer=suggest(clothes,[clothes[1],clothes[2]],{temperature:27});assert.ok(summer.items.some(i=>i.id===2));assert.equal(summer.items.some(i=>i.id===3),false);assert.ok(summer.warnings.length);
});
