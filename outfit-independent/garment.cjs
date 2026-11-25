'use strict';
const path=require('node:path');
const sharp=require('sharp');
const groups={
  '上装':['Upper-clothes'], '外套':['Upper-clothes'],
  '下装':['Pants','Skirt'], '连衣裙':['Dress'],
  '鞋履':['Left-shoe','Right-shoe'], '包袋':['Bag'],
  '配饰':['Hat','Sunglasses','Belt','Scarf']
};
const garmentLabels=Object.values(groups).flat();
let segmenterPromise;
async function segment(image){
  if(!segmenterPromise)segmenterPromise=(async()=>{
    const {pipeline,env,RawImage}=await import('@huggingface/transformers');
    env.allowRemoteModels=false;
    env.localModelPath=path.join(__dirname,'models')+path.sep;
    const pipe=await pipeline('image-segmentation','Xenova/segformer_b2_clothes',{dtype:'q8',device:'cpu',local_files_only:true});
    return {pipe,RawImage};
  })().catch(e=>{segmenterPromise=null;throw e;});
  const {pipe,RawImage}=await segmenterPromise;
  return pipe(new RawImage(new Uint8ClampedArray(image.data),image.info.width,image.info.height,image.info.channels));
}
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
async function productImage(input,category,options={}){
  const image=await sharp(input,{limitInputPixels:25e6}).rotate().resize({width:1400,height:1400,fit:'inside',withoutEnlargement:true}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const w=image.info.width,h=image.info.height;
  const segments=await (options.segment||segment)(image);
  const {mask,hasPerson}=selectedMask(segments,category,w,h);
  const preservedCrop=!hasPerson?cleanWhiteBackdrop(image,segments,category):null;
  if(preservedCrop){
    const source=await sharp(image.data,{raw:{width:w,height:h,channels:4}}).extract(preservedCrop).resize({width:864,height:864,fit:'inside'}).png().toBuffer({resolveWithObject:true});
    const buffer=await sharp({create:{width:1080,height:1080,channels:3,background:'#ffffff'}}).composite([{input:source.data,left:Math.round((1080-source.info.width)/2),top:Math.round((1080-source.info.height)/2)}]).png().toBuffer();
    return {buffer,width:1080,height:1080,mode:'garment',preservedWhiteBackground:true,labels:segments.filter(s=>(groups[category]||garmentLabels).includes(s.label)).map(s=>s.label)};
  }
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
  const alpha=await sharp(mask,{raw:{width:w,height:h,channels:1}}).blur(0.5).greyscale().raw().toBuffer();
  for(let i=0;i<mask.length;i++)image.data[i*4+3]=Math.round(image.data[i*4+3]*alpha[i]/255);
  const garment=await sharp(image.data,{raw:{width:w,height:h,channels:4}}).extract(crop).resize({width:864,height:864,fit:'inside'}).png().toBuffer({resolveWithObject:true});
  const white=await sharp({create:{width:1080,height:1080,channels:3,background:'#ffffff'}}).composite([{input:garment.data,left:Math.round((1080-garment.info.width)/2),top:Math.round((1080-garment.info.height)/2)}]).png().toBuffer();
  return {buffer:white,width:1080,height:1080,mode:'garment',labels:segments.filter(s=>(groups[category]||garmentLabels).includes(s.label)).map(s=>s.label)};
}
// A single CPU job at a time; no unbounded inference queue or photo retention.
let busy=false;
async function processGarment(input,category){
  if(busy)throw Object.assign(new Error('正在处理另一张照片，请稍后重试'),{status:429});
  busy=true;
  try{return await productImage(input,category);}
  catch(e){if(e.status)throw e;throw Object.assign(new Error('衣物处理暂不可用，请检查本地模型是否已安装，或尝试 JPG / PNG 照片'),{status:503});}
  finally{busy=false;}
}
module.exports={productImage,processGarment,selectedMask,cleanMask,bounds};
