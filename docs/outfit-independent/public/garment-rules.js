/* 衣物识别的纯规则，完整 App 的服务端与网页版共用这一份：
   Node 里由 garment.cjs（抠图）和 item-recognizer.cjs（自动填写）require，浏览器里由项目主页加载。
   这里不做模型推理和图片编解码：分割结果与像素由调用方提供。像素为 RGBA（image = {data, info:{width,height}}），mask 为 0/255 的 Uint8Array。 */
(function(root){
'use strict';
const groups={
  '上装':['Upper-clothes'], '外套':['Upper-clothes'],
  '下装':['Pants','Skirt'], '连衣裙':['Dress'],
  '鞋履':['Left-shoe','Right-shoe'], '包袋':['Bag'],
  '配饰':['Hat','Sunglasses','Belt','Scarf']
};
const garmentLabels=Object.values(groups).flat();
const CATEGORIES=['上装','下装','外套','连衣裙','鞋履','包袋','配饰','其他'];
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

/* ---------- 抠图：选出该类别的衣物区域并清理 ---------- */
function selectedMask(segments,category,width,height){
  if(!Array.isArray(segments)||!segments.length)throw Object.assign(new Error('衣物识别没有返回结果，请换一张清晰照片'),{status:422});
  for(const layer of segments)if(!layer||!layer.mask||layer.mask.width!==width||layer.mask.height!==height||layer.mask.data?.length!==width*height)throw Object.assign(new Error('衣物识别尺寸不一致，请重试'),{status:422});
  const personPixels=segments.filter(s=>['Face','Hair','Left-arm','Right-arm','Left-leg','Right-leg'].includes(s.label)).reduce((sum,s)=>sum+s.mask.data.reduce((a,v)=>a+(v>127),0),0);
  const hasPerson=personPixels>width*height*0.015;
  // On standalone garments the parser may split a long jacket into shirt/dress labels.
  // Merge clothing classes only when the image has no substantial human parts.
  const base=groups[category]||garmentLabels;
  const targets=!hasPerson&&['上装','外套','连衣裙'].includes(category)?['Upper-clothes','Dress']:base;
  const mask=new Uint8Array(width*height);
  let count=0;
  for(const layer of segments){
    if(!targets.includes(layer.label))continue;
    if(layer.mask.width!==width||layer.mask.height!==height)throw new Error('衣物识别尺寸不一致，请重试');
    for(let i=0;i<mask.length;i++)if(layer.mask.data[i]>127&&!mask[i]){mask[i]=255;count++;}
  }
  if(count<width*height*0.015)throw Object.assign(new Error('未识别到该类别的完整衣物，请确认类别，或换一张衣服更清晰的照片'),{status:422});
  return {mask,count,hasPerson};
}
function fillHoles(mask,w,h){
  const outside=new Uint8Array(mask.length),queue=new Int32Array(mask.length);let head=0,tail=0;
  function add(i){if(!mask[i]&&!outside[i]){outside[i]=1;queue[tail++]=i;}}
  for(let x=0;x<w;x++){add(x);add((h-1)*w+x);}
  for(let y=0;y<h;y++){add(y*w);add(y*w+w-1);}
  while(head<tail){const i=queue[head++],x=i%w,y=Math.floor(i/w);if(x)add(i-1);if(x<w-1)add(i+1);if(y)add(i-w);if(y<h-1)add(i+w);}
  // Fill only small segmentation pinholes; preserve neck openings and garment gaps.
  const seen=new Uint8Array(mask.length),maximum=Math.max(1,Math.floor(mask.length*0.005));
  for(let i=0;i<mask.length;i++)if(!mask[i]&&!outside[i]&&!seen[i]){
    head=0;tail=1;queue[0]=i;seen[i]=1;
    while(head<tail){const p=queue[head++],x=p%w,y=Math.floor(p/w);for(const q of [x?p-1:-1,x<w-1?p+1:-1,y?p-w:-1,y<h-1?p+w:-1])if(q>=0&&!mask[q]&&!outside[q]&&!seen[q]){seen[q]=1;queue[tail++]=q;}}
    if(tail<=maximum)for(let p=0;p<tail;p++)mask[queue[p]]=255;
  }
}
// Retain meaningful pieces (e.g. two shoes) and remove isolated classification noise.
function cleanMask(mask,w,h){
  const labels=new Int32Array(mask.length),queue=new Int32Array(mask.length),sizes=[0];let largest=0,label=0;
  for(let i=0;i<mask.length;i++){
    if(!mask[i]||labels[i])continue;
    label++;let head=0,tail=1;queue[0]=i;labels[i]=label;
    while(head<tail){const p=queue[head++],x=p%w,y=Math.floor(p/w);
      for(const q of [x?p-1:-1,x<w-1?p+1:-1,y?p-w:-1,y<h-1?p+w:-1])if(q>=0&&mask[q]&&!labels[q]){labels[q]=label;queue[tail++]=q;}}
    sizes.push(tail);largest=Math.max(largest,tail);
  }
  const minimum=Math.max(20,largest*0.025);
  for(let i=0;i<mask.length;i++)if(mask[i]&&sizes[labels[i]]<minimum)mask[i]=0;
  return mask;
}
function bounds(mask,w,h){
  let x0=w,y0=h,x1=-1,y1=-1,count=0;
  for(let i=0;i<mask.length;i++)if(mask[i]>127){const x=i%w,y=Math.floor(i/w);x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);count++;}
  if(count<w*h*0.015||x1<=x0||y1<=y0)throw Object.assign(new Error('识别结果不完整，请换一张衣服更清楚的照片'),{status:422});
  return {left:x0,top:y0,width:x1-x0+1,height:y1-y0+1};
}
function cleanWhiteBackdrop(image,segments,category){
  const {width:w,height:h}=image.info,pixels=image.data,total=w*h;
  const targets=['上装','外套','连衣裙'].includes(category)?['Upper-clothes','Dress']:(groups[category]||garmentLabels);
  function white(i){const p=i*4;return pixels[p+3]<10||(pixels[p]>=249&&pixels[p+1]>=249&&pixels[p+2]>=249);}
  let edges=0,whiteEdges=0;
  for(let x=0;x<w;x++){edges+=2;whiteEdges+=white(x)+white((h-1)*w+x);}
  for(let y=1;y<h-1;y++){edges+=2;whiteEdges+=white(y*w)+white(y*w+w-1);}
  if(whiteEdges<edges*0.995)return null;
  let background=0,whiteBackground=0;
  for(const layer of segments){
    if(garmentLabels.includes(layer.label)&&!targets.includes(layer.label)&&layer.mask.data.reduce((sum,v)=>sum+(v>127),0)>total*0.015)return null;
    if(layer.label==='Background')for(let i=0;i<total;i++)if(layer.mask.data[i]>127){background++;whiteBackground+=white(i);}
  }
  if(background<total*0.15||whiteBackground<background*0.97)return null;
  const foreground=new Uint8Array(total);for(let i=0;i<total;i++)if(!white(i))foreground[i]=255;
  try{return bounds(foreground,w,h);}catch{return null;}
}
/* 白底单品图怎么做：本来就是白底的商品图只裁切（mode 'white'）；否则按清理后的衣物区域抠出（mode 'mask'）。
   人物遮挡衣服较多时直接报错，调用方保留原图。图片合成由调用方完成（服务端用 sharp，网页版用 canvas）。 */
function productPlan(image,segments,category){
  const w=image.info.width,h=image.info.height;
  const {mask,hasPerson}=selectedMask(segments,category,w,h);
  const labels=segments.filter(s=>(groups[category]||garmentLabels).includes(s.label)).map(s=>s.label);
  const preservedCrop=!hasPerson?cleanWhiteBackdrop(image,segments,category):null;
  if(preservedCrop)return {mode:'white',crop:preservedCrop,labels};
  cleanMask(mask,w,h);
  if(!hasPerson&&['上装','外套','下装','连衣裙'].includes(category))fillHoles(mask,w,h);
  const crop=bounds(mask,w,h);
  if(hasPerson){
    let skinInside=0,garmentArea=0;
    for(const v of mask)if(v)garmentArea++;
    for(const layer of segments.filter(s=>['Face','Left-arm','Right-arm','Left-leg','Right-leg'].includes(s.label)))
      for(let y=crop.top;y<crop.top+crop.height;y++)for(let x=crop.left;x<crop.left+crop.width;x++)if(layer.mask.data[y*w+x]>127)skinInside++;
    if(skinInside>garmentArea*0.025)throw Object.assign(new Error('人物遮挡衣服较多，直接抠图会留下缺口。请换成平铺、悬挂或无遮挡的照片；当前保留原图'),{status:422});
  }
  return {mode:'mask',mask,crop,labels};
}

/* ---------- 自动填写：大类、主色、款式、名称 ---------- */
function subject(segments,image,forced){
 const {width,height}=image.info,total=width*height,stats=new Map();
 for(const layer of segments||[]){if(!labelCategory[layer.label]||!layer.mask||layer.mask.width!==width||layer.mask.height!==height||layer.mask.data.length!==total)continue;let count=0;for(const x of layer.mask.data)if(x>127)count++;const category=labelCategory[layer.label];stats.set(category,(stats.get(category)||0)+count);}
 const ordered=[...stats].filter(([,n])=>n>total*.015).sort((a,b)=>b[1]-a[1]);
 const category=forced||ordered[0]?.[0];if(!category)return {category:'其他',mask:null,multiple:false};
 let mask;try{mask=selectedMask(segments,category,width,height).mask;}catch{mask=null;}
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
/* 一张照片的完整识别流程。分割、抠图、款式分类由调用方注入：
   segment(image) → 分割层；makeProduct(category, layers) → 白底单品图（失败时抛错）；classify(product, candidates) → [{label, score}] */
async function analyzeGarment(image,{category,segment,makeProduct,classify}){
 const warnings=[];let layers=[];try{layers=await segment(image);}catch{warnings.push('衣物轮廓暂未识别，已保留原图。');}
 const detected=subject(layers,image,category);let product=null,cutoutMessage='';
 if(detected.mask)try{product=await makeProduct(detected.category,layers);}catch(e){cutoutMessage=e.status?e.message:'暂未生成完整单品图，保留原图。';}
 let predictions=[];
 const candidates=category?types.filter(t=>t.category===category||t.id==='other'):types;
 try{predictions=await classify(product,candidates);}catch{warnings.push('款式识别暂不可用，已按可见轮廓填写大类，请检查名称和季节。');}
 const choice=chooseType(predictions,detected.category,category),color=dominantColor(image,detected.mask);
 if(detected.multiple)warnings.push('照片里有多件单品，已优先识别画面中较大的这一件。');
 if(!color)warnings.push('主色暂不确定，可手动补充。');
 if(choice.review)warnings.push('款式存在不确定性，请核对自动填写的结果。');
 if(!category&&choice.type.category!==detected.category&&detected.mask&&!(['上装','外套'].includes(choice.type.category)&&['上装','外套'].includes(detected.category))){
   try{product=await makeProduct(choice.type.category,layers);cutoutMessage='';}catch(e){product=null;cutoutMessage=e.status?e.message:'保留原图。';}
 }
 if(!product&&!cutoutMessage)cutoutMessage='衣物轮廓不够清晰，当前保留原图。';
 return {attributes:attributesFor(choice.type,color,choice.review||detected.multiple,warnings),product,cutoutMessage,mask:detected.mask};
}

const api={groups,garmentLabels,CATEGORIES,types,labelCategory,selectedMask,fillHoles,cleanMask,bounds,cleanWhiteBackdrop,productPlan,subject,colorName,dominantColor,chooseType,attributesFor,analyzeGarment};
if(typeof module==='object'&&module.exports)module.exports=api;else root.GarmentRules=api;
})(typeof window!=='undefined'?window:globalThis);
