'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),sharp=require('sharp');
const {analyze,types,dominantColor}=require('../item-recognizer.cjs');
function imageFixture(){const w=80,h=100,data=Buffer.alloc(w*h*4),mask=new Uint8Array(w*h);for(let i=0;i<w*h;i++)data.set([240,40,30,255],i*4);for(let y=15;y<90;y++)for(let x=15;x<65;x++){const i=y*w+x;mask[i]=255;data.set([238,232,210,255],i*4);}return {data,info:{width:w,height:h,channels:4},mask};}
const prediction=id=>[{label:types.find(t=>t.id===id).label,score:.9},{label:types.find(t=>t.id==='other').label,score:.01}];
test('automatic attributes use garment pixels rather than a busy background and distinguish outerwear from tops',async()=>{
 const f=imageFixture(),input=await sharp(f.data,{raw:f.info}).png().toBuffer();
 const result=await analyze(input,{segment:async()=>[{label:'Upper-clothes',mask:{width:80,height:100,data:f.mask}}],classifyImage:async()=>prediction('puffer')});
 assert.equal(result.attributes.category,'外套');assert.equal(result.attributes.color,'米白');assert.equal(result.attributes.season,'冬季');assert.match(result.attributes.name,/米白.*保暖外套/);assert.equal(result.attributes.seasonEstimated,true);assert.ok(result.image.base64.length);assert.equal(result.attributes.name.includes('品牌'),false);
});
test('cutout failure still provides metadata and original images are retained; missing fine model is explicit',async()=>{
 const f=imageFixture(),input=await sharp(f.data,{raw:f.info}).png().toBuffer(),segment=async()=>[{label:'Upper-clothes',mask:{width:80,height:100,data:f.mask}}];
 const result=await analyze(input,{segment,classifyImage:async()=>prediction('shortshirt'),makeProduct:async()=>{throw Object.assign(Error('遮挡过多，保留原图'),{status:422});}});
 assert.equal(result.image,null);assert.equal(result.attributes.category,'上装');assert.equal(result.attributes.season,'夏季');assert.match(result.cutoutMessage,/保留原图/);
 const fallback=await analyze(input,{segment,classifyImage:async()=>{throw Error('model missing');}});assert.equal(fallback.attributes.category,'上装');assert.equal(fallback.attributes.needsReview,true);assert.equal(fallback.attributes.season,'四季');assert.ok(fallback.attributes.warnings.some(s=>s.includes('款式识别暂不可用')));
});
test('unclear foreground never borrows background color and multiple visible garments require review',async()=>{
 const f=imageFixture(),input=await sharp(f.data,{raw:f.info}).png().toBuffer();
 const unknown=await analyze(input,{segment:async()=>[],classifyImage:async()=>prediction('other')});assert.equal(unknown.attributes.category,'其他');assert.equal(unknown.attributes.color,'');assert.equal(unknown.attributes.needsReview,true);assert.equal(unknown.image,null);
 assert.equal(dominantColor(f,null),'');
 const multiple=await analyze(input,{segment:async()=>[{label:'Upper-clothes',mask:{width:80,height:100,data:f.mask}},{label:'Pants',mask:{width:80,height:100,data:f.mask}}],classifyImage:async()=>prediction('shirt')});assert.ok(multiple.attributes.warnings.some(s=>s.includes('多件单品')));
});
test('malformed images and invalid category overrides are rejected before inference',async()=>{
 await assert.rejects(analyze(Buffer.from('bad image')),{status:400});await assert.rejects(analyze(Buffer.from('bad image'),{category:'不存在的分类'}),{status:400});
});
