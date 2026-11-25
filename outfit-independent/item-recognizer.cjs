'use strict';
const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp');
const garment=require('./garment.cjs');
// Suggestions describe visible style, never brand, exact fabric, price or actual warmth.
const types=[
 ['tshirt','a short sleeved T-shirt','短袖T恤','上装','夏季',['短袖','休闲']],
 ['longtee','a long sleeved T-shirt','长袖T恤','上装','春秋',['长袖','休闲']],
 ['shirt','a long sleeved button up shirt','长袖衬衫','上装','春秋',['长袖']],
 ['shortshirt','a short sleeved button up shirt','短袖衬衫','上装','夏季',['短袖']],
 ['blouse','a lightweight blouse','轻薄上衣','上装','春夏',['轻薄']],
 ['tank','a sleeveless tank top','无袖上衣','上装','夏季',['无袖']],
 ['sweater','a knitted pullover sweater','针织上衣','上装','秋冬',['针织']],
 ['hoodie','a hooded sweatshirt hoodie','连帽卫衣','上装','春秋',['休闲']],
 ['sweatshirt','a crew neck sweatshirt','圆领卫衣','上装','春秋',['休闲']],
 ['cardigan','a knitted cardigan with an open front','针织开衫','外套','春秋',['针织']],
 ['puffer','a quilted puffer winter jacket','绗缝保暖外套','外套','冬季',['保暖']],
 ['vest','a padded sleeveless puffer vest','保暖马甲','外套','秋冬',['保暖']],
 ['coat','a long winter coat','长款大衣','外套','秋冬',[]],
 ['trench','a trench coat','风衣外套','外套','春秋',[]],
 ['denimjacket','a denim jacket','牛仔外套','外套','春秋',['牛仔']],
 ['blazer','a suit blazer jacket','西装外套','外套','春秋',['通勤']],
 ['jacket','a short casual zip up jacket','休闲夹克','外套','春秋',['休闲']],
 ['jeans','a pair of denim jeans','牛仔裤','下装','春秋',['牛仔']],
 ['trousers','a pair of straight leg long trousers','直筒长裤','下装','春秋',[]],
 ['widepants','a pair of wide leg trousers','阔腿长裤','下装','春秋',[]],
 ['sweatpants','a pair of casual sweatpants','休闲运动裤','下装','春秋',['休闲']],
 ['shorts','a pair of shorts','短裤','下装','春夏',[]],
 ['shortskirt','a short skirt','短款半身裙','下装','春夏',[]],
 ['longskirt','a long skirt','长款半身裙','下装','春秋',[]],
 ['dress','a sleeveless summer dress','轻薄连衣裙','连衣裙','夏季',[]],
 ['longdress','a long sleeved dress','长袖连衣裙','连衣裙','春秋',[]],
 ['knitdress','a knitted sweater dress','针织连衣裙','连衣裙','秋冬',['针织']],
 ['sneakers','a pair of sneakers athletic shoes','运动鞋','鞋履','四季',['休闲']],
 ['loafers','a pair of loafers','乐福鞋','鞋履','春秋',[]],
 ['boots','a pair of boots','短靴','鞋履','秋冬',[]],
 ['sandals','a pair of open toe sandals','凉鞋','鞋履','夏季',[]],
 ['slippers','a pair of slippers','拖鞋','鞋履','夏季',[]],
 ['heels','a pair of high heel shoes','高跟鞋','鞋履','四季',[]],
 ['flats','a pair of flat ballet shoes','平底鞋','鞋履','春秋',[]],
 ['backpack','a backpack bag','双肩包','包袋','四季',[]],
 ['shoulderbag','a small shoulder bag','单肩包','包袋','四季',[]],
 ['totebag','a tote bag','托特包','包袋','四季',[]],
 ['scarf','a winter scarf','围巾','配饰','秋冬',[]],
 ['cap','a baseball cap','棒球帽','配饰','四季',[]],
 ['beanie','a warm knitted beanie hat','针织帽','配饰','冬季',['针织']],
 ['sunglasses','a pair of sunglasses','太阳镜','配饰','春夏',[]],
 ['belt','a belt','腰带','配饰','四季',[]],
 ['jewelry','a necklace or jewelry accessory','首饰配饰','配饰','四季',[]],
 ['other','an empty scene, scenery, food or a household object, not a clothing item','待确认单品','其他','四季',[]]
].map(([id,label,name,category,season,tags])=>({id,label,name,category,season,tags}));
const labelCategory={'Upper-clothes':'上装','Pants':'下装','Skirt':'下装','Dress':'连衣裙','Left-shoe':'鞋履','Right-shoe':'鞋履','Bag':'包袋','Hat':'配饰','Sunglasses':'配饰','Belt':'配饰','Scarf':'配饰'};
let classifierPromise;
function modelReady(){const base=path.join(__dirname,'models/Xenova/clip-vit-base-patch32');return ['config.json','tokenizer.json','preprocessor_config.json','onnx/model_quantized.onnx'].every(f=>fs.existsSync(path.join(base,f)));}
async function classify(buffer,candidates){
 if(!modelReady())throw Error('款式识别模型尚未准备');
 if(!classifierPromise)classifierPromise=(async()=>{
   const {pipeline,env,RawImage}=await import('@huggingface/transformers');env.allowRemoteModels=false;env.localModelPath=path.join(__dirname,'models')+path.sep;
   return {pipe:await pipeline('zero-shot-image-classification','Xenova/clip-vit-base-patch32',{dtype:'q8',device:'cpu',local_files_only:true}),RawImage};
 })().catch(e=>{classifierPromise=null;throw e;});
 const {pipe,RawImage}=await classifierPromise,image=await sharp(buffer).rotate().resize({width:600,height:600,fit:'inside',withoutEnlargement:true}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 return pipe(new RawImage(new Uint8ClampedArray(image.data),image.info.width,image.info.height,4),candidates.map(t=>t.label),{hypothesis_template:'a photo of {}'});
}
function subject(segments,image,forced){
 const {width,height}=image.info,total=width*height,stats=new Map();
 for(const layer of segments||[]){if(!labelCategory[layer.label]||!layer.mask||layer.mask.width!==width||layer.mask.height!==height||layer.mask.data.length!==total)continue;let count=0;for(const x of layer.mask.data)if(x>127)count++;const category=labelCategory[layer.label];stats.set(category,(stats.get(category)||0)+count);}
 const ordered=[...stats].filter(([,n])=>n>total*.015).sort((a,b)=>b[1]-a[1]);
 const category=forced||ordered[0]?.[0];if(!category)return {category:'其他',mask:null,multiple:false};
 let mask;try{mask=garment.selectedMask(segments,category,width,height).mask;}catch{mask=null;}
 const multiple=ordered.length>1&&ordered[1][1]>ordered[0][1]*.5&&ordered[1][1]>total*.06&&!(ordered.length===2&&ordered.every(([c])=>['上装','连衣裙'].includes(c)));
 return {category,mask,multiple};
}
function colorName(r,g,b){
 const max=Math.max(r,g,b)/255,min=Math.min(r,g,b)/255,d=max-min,s=max?d/max:0;
 if(max<.23)return '黑色';
 if(s<.09)return max>.87?'白色':max<.42?'深灰色':'灰色';
 let h=0;if(d){const R=r/255,G=g/255,B=b/255;h=max===R?(G-B)/d+(G<B?6:0):max===G?(B-R)/d+2:(R-G)/d+4;h*=60;}
 if(h>=25&&h<70&&max>.78&&s<.23)return '米白';
 if(h<18||h>=345)return max<.57?'酒红色':s<.42&&max>.73?'粉色':'红色';
 if(h<48)return max<.65?'棕色':s<.47?'卡其色':'橙色';
 if(h<72)return s<.35&&max<.84?'卡其色':'黄色';
 if(h<175)return '绿色';
 if(h<265)return max<.45?'藏蓝':s<.49&&max>.58?'浅蓝':'蓝色';
 return s<.35&&max>.72?'淡紫色':'紫色';
}
function dominantColor(image,mask){
 if(!mask)return '';
 const bins=new Map(),step=Math.max(1,Math.floor(mask.length/50000));let total=0;
 for(let i=0;i<mask.length;i+=step){const p=i*4;if(mask[i]<128||image.data[p+3]<128)continue;const c=colorName(image.data[p],image.data[p+1],image.data[p+2]);bins.set(c,(bins.get(c)||0)+1);total++;}
 if(total<15)return '';
 const ranked=[...bins].sort((a,b)=>b[1]-a[1]);const main=ranked[0];
 return ranked[1]&&ranked[1][1]/total>.28&&main[1]/total<.68?main[0]+' / '+ranked[1][0]:main[0];
}
function chooseType(predictions,coarse,forced){
 const ranked=(Array.isArray(predictions)?predictions:[]).filter(p=>p&&Number.isFinite(p.score)&&types.some(t=>t.label===p.label)).sort((a,b)=>b.score-a.score);
 const top=ranked[0],picked=top&&types.find(t=>t.label===top.label),margin=top?top.score-(ranked[1]?.score||0):0;
 const compatible=!picked||coarse==='其他'||picked.category===coarse||['上装','外套','连衣裙'].includes(picked.category)&&['上装','外套','连衣裙'].includes(coarse);
 const review=!picked||picked.category==='其他'||top.score<.24||margin<.055||!compatible;
 if(!picked||!compatible||(picked.category==='其他'&&coarse!=='其他'))return {type:{name:coarse==='鞋履'?'鞋子':coarse==='其他'?'待确认单品':coarse,category:forced||coarse,season:'四季',tags:[]},review:true};
 return {type:{...picked,category:forced||picked.category},review};
}
function attributesFor(type,color,review,warnings){
 const prefix=color.includes('/')?color.split('/').map(c=>c.trim().replace(/色$/,'')).join('')+'配色':color;
 return {name:(prefix+type.name).slice(0,40),category:type.category,color,season:type.season,tags:type.tags,source:'local-vision',seasonEstimated:true,needsReview:!!review,warnings:[...new Set(warnings)].slice(0,5)};
}
async function analyze(input,{category,segment=garment.segment,classifyImage=classify,makeProduct=garment.productImage}={}){
 if(category&&!['上装','下装','外套','连衣裙','鞋履','包袋','配饰','其他'].includes(category))throw Object.assign(Error('衣物类别不正确'),{status:400});
 let image;try{image=await sharp(input,{limitInputPixels:25e6}).rotate().resize({width:1400,height:1400,fit:'inside',withoutEnlargement:true}).ensureAlpha().raw().toBuffer({resolveWithObject:true});}catch{throw Object.assign(Error('图片内容无法读取，请换一张清晰照片'),{status:400});}
 const warnings=[];let layers=[];try{layers=await segment(image);}catch{warnings.push('衣物轮廓暂未识别，已保留原图。');}
 const detected=subject(layers,image,category);let product=null,cutoutMessage='';
 if(detected.mask)try{product=await makeProduct(input,detected.category,{segment:async()=>layers});}catch(e){cutoutMessage=e.status?e.message:'暂未生成完整单品图，保留原图。';}
 let predictions=[];
 const candidates=category?types.filter(t=>t.category===category||t.id==='other'):types;
 try{predictions=await classifyImage(product?.buffer||input,candidates);}catch{warnings.push('款式识别暂不可用，已按可见轮廓填写大类，请检查名称和季节。');}
 const choice=chooseType(predictions,detected.category,category),color=dominantColor(image,detected.mask);
 if(detected.multiple)warnings.push('照片里有多件单品，已优先识别画面中较大的这一件。');
 if(!color)warnings.push('主色暂不确定，可手动补充。');
 if(choice.review)warnings.push('款式存在不确定性，请核对自动填写的结果。');
 if(!category&&choice.type.category!==detected.category&&detected.mask&&!(['上装','外套'].includes(choice.type.category)&&['上装','外套'].includes(detected.category))){
   try{product=await makeProduct(input,choice.type.category,{segment:async()=>layers});cutoutMessage='';}catch(e){product=null;cutoutMessage=e.status?e.message:'保留原图。';}
 }
 if(!product&&!cutoutMessage)cutoutMessage='衣物轮廓不够清晰，当前保留原图。';
 return {attributes:attributesFor(choice.type,color,choice.review||detected.multiple,warnings),image:product?{contentType:'image/png',base64:product.buffer.toString('base64')}:null,cutoutMessage,processing:'local'};
}
async function recognizeItem(input,options){return garment.imageJob(()=>analyze(input,options));}
module.exports={recognizeItem,analyze,types,modelReady,dominantColor,colorName,chooseType,attributesFor};
