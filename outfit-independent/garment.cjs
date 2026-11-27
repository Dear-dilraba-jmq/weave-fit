'use strict';
const path=require('node:path');
const sharp=require('sharp');
// 选区、清理与白底判断等纯规则和网页版共用，见 public/garment-rules.js；这里只负责模型推理和 sharp 合成。
const {selectedMask,cleanMask,bounds,productPlan}=require('./public/garment-rules.js');
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
async function productImage(input,category,options={}){
  const image=await sharp(input,{limitInputPixels:25e6}).rotate().resize({width:1400,height:1400,fit:'inside',withoutEnlargement:true}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const w=image.info.width,h=image.info.height;
  const segments=await (options.segment||segment)(image);
  const plan=productPlan(image,segments,category);
  if(plan.mode==='white'){
    const source=await sharp(image.data,{raw:{width:w,height:h,channels:4}}).extract(plan.crop).resize({width:864,height:864,fit:'inside'}).png().toBuffer({resolveWithObject:true});
    const buffer=await sharp({create:{width:1080,height:1080,channels:3,background:'#ffffff'}}).composite([{input:source.data,left:Math.round((1080-source.info.width)/2),top:Math.round((1080-source.info.height)/2)}]).png().toBuffer();
    return {buffer,width:1080,height:1080,mode:'garment',preservedWhiteBackground:true,labels:plan.labels};
  }
  const alpha=await sharp(plan.mask,{raw:{width:w,height:h,channels:1}}).blur(0.5).greyscale().raw().toBuffer();
  for(let i=0;i<plan.mask.length;i++)image.data[i*4+3]=Math.round(image.data[i*4+3]*alpha[i]/255);
  const garment=await sharp(image.data,{raw:{width:w,height:h,channels:4}}).extract(plan.crop).resize({width:864,height:864,fit:'inside'}).png().toBuffer({resolveWithObject:true});
  const white=await sharp({create:{width:1080,height:1080,channels:3,background:'#ffffff'}}).composite([{input:garment.data,left:Math.round((1080-garment.info.width)/2),top:Math.round((1080-garment.info.height)/2)}]).png().toBuffer();
  return {buffer:white,width:1080,height:1080,mode:'garment',labels:plan.labels};
}
// A single CPU job at a time; no unbounded inference queue or photo retention.
let busy=false;
async function imageJob(work){
  if(busy)throw Object.assign(new Error('正在处理另一张照片，请稍后重试'),{status:429,code:'IMAGE_BUSY'});
  busy=true;
  try{return await work();}finally{busy=false;}
}
async function processGarment(input,category){
  try{return await imageJob(()=>productImage(input,category));}
  catch(e){if(e.status)throw e;throw Object.assign(new Error('衣物处理暂不可用，请检查本地模型是否已安装，或尝试 JPG / PNG 照片'),{status:503});}
}
module.exports={productImage,processGarment,selectedMask,cleanMask,bounds,segment,imageJob};
