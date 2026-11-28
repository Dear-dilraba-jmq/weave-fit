'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const sharp=require('sharp');
const {illustration,boardHtml,posterSvg,itemHtml,color,parts}=require('../public/look-reference.js');
async function pixels(item){
  const {data,info}=await sharp(Buffer.from(illustration(item))).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  return (x,y)=>data[(y*info.width+x)*4+3];
}

test('explicit garment color takes precedence over coordination advice',()=>{
 assert.equal(color({name:'藏蓝短裙',advice:'搭配奶白上衣和白色袜子'}),'#29384e');
 assert.equal(color({name:'米白圆领针织上衣',color:'黑色'}),'#303135');
});
test('the complete reference board includes all supported owned and proposed pieces',()=>{
 const plan={items:Array.from({length:9},(_,i)=>({id:i+1,name:'已有单品'+i,category:'上装'})),gaps:Array.from({length:9},(_,i)=>({name:'补充单品'+i,category:'配饰'}))};
 assert.equal(parts(plan).length,18);assert.equal((boardHtml(plan,()=>null).match(/<figure /g)||[]).length,18);assert.ok(posterSvg(plan,{}).includes('补充单品8'));
});
test('umbrella and winter boot illustrations have distinct visible silhouettes rather than a necklace or sneaker',async()=>{
 const umbrella=await pixels({name:'轻便折叠雨伞',category:'配饰'}),boots=await pixels({name:'黑色保暖短靴',category:'鞋履'}),sneakers=await pixels({name:'白色运动鞋',category:'鞋履'});
 assert.ok(umbrella(150,60)>240,'umbrella canopy covers the center top');assert.ok(boots(67,80)>240,'boot shaft extends above the ankle');assert.equal(sneakers(67,80),0,'low-top sneakers have no tall shaft');
});
test('A-line short skirts have one continuous skirt hem rather than trouser legs',async()=>{
  const short={name:'藏蓝高腰 A 字短裙',category:'下装'},skirt=await pixels(short),pants=await pixels({name:'深灰直筒长裤',category:'下装'}),longSkirt=await pixels({name:'深灰格纹 A 字中长裙'});
  assert.ok(skirt(150,190)>240,'skirt fabric must cover the center where trouser legs separate');
  assert.equal(pants(150,190),0,'trouser legs must remain separate');
  assert.equal(skirt(100,244),0,'short skirt hem must end above the full-length trouser hem');
  assert.ok(pants(100,244)>240);assert.ok(longSkirt(100,244)>240);
  assert.equal(illustration(short),illustration({name:short.name}),'the item name must identify a skirt even without a category');
  assert.match(itemHtml(short),/款式轮廓示意.*非真实商品/);
});
test('short-sleeved shirts and long-sleeved knitwear have different sleeve coverage',async()=>{
  const shirt=await pixels({name:'浅蓝短袖衬衫',category:'上装'}),knit=await pixels({name:'奶白长袖针织上衣',category:'上装'});
  for(const [x,y]of [[80,185],[225,190]]){assert.equal(shirt(x,y),0,'short sleeve must not reach the forearm');assert.ok(knit(x,y)>240,'long sleeve must cover the forearm');}
  assert.equal(illustration({name:'浅蓝短袖衬衫'}),illustration({name:'浅蓝短袖衬衫',category:'上装'}));
});
test('proposed pieces are always drawn outlines, never photos; owned photos are shown as photos',()=>{
  const gap={name:'浅蓝高腰直筒牛仔裤',category:'下装'};
  assert.match(itemHtml(gap),/<svg[\s\S]*款式轮廓示意 · 非真实商品/);
  assert.equal(/<img/.test(itemHtml(gap)),false);
  const planWithGap=boardHtml({items:[],gaps:[gap]},()=>'');
  assert.equal(/<img/.test(planWithGap),false);assert.ok(planWithGap.includes('待补款式 · 示意'));assert.equal(planWithGap.includes('AI'),false);
  const item={name:'米白圆领针织上衣',category:'上装',image_path:'users/synthetic/wardrobe/item.png'};
  const html=boardHtml({items:[item],gaps:[]},()=>'/api/files?path=synthetic-owned-photo');
  assert.ok(html.includes('/api/files?path=synthetic-owned-photo'));assert.ok(html.includes('我的衣橱 · 实拍'));
  const skirt={name:'藏蓝高腰 A 字短裙',category:'下装'};
  assert.ok(posterSvg({gaps:[skirt]}).includes('<svg x="80" y="5" width="300" height="280"'),'poster export must still embed the same garment illustration');
});
