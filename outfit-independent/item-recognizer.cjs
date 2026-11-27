'use strict';
const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp');
const garment=require('./garment.cjs');
// 款式表、颜色命名、款式选择与整套识别流程和网页版共用，见 public/garment-rules.js；这里只负责模型推理和图片解码。
const {types,CATEGORIES,colorName,dominantColor,chooseType,attributesFor,analyzeGarment}=require('./public/garment-rules.js');
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
async function analyze(input,{category,segment=garment.segment,classifyImage=classify,makeProduct=garment.productImage}={}){
 if(category&&!CATEGORIES.includes(category))throw Object.assign(Error('衣物类别不正确'),{status:400});
 let image;try{image=await sharp(input,{limitInputPixels:25e6}).rotate().resize({width:1400,height:1400,fit:'inside',withoutEnlargement:true}).ensureAlpha().raw().toBuffer({resolveWithObject:true});}catch{throw Object.assign(Error('图片内容无法读取，请换一张清晰照片'),{status:400});}
 const result=await analyzeGarment(image,{
   category,
   segment,
   makeProduct:(chosen,layers)=>makeProduct(input,chosen,{segment:async()=>layers}),
   classify:(product,candidates)=>classifyImage(product?.buffer||input,candidates)
 });
 return {attributes:result.attributes,image:result.product?{contentType:'image/png',base64:result.product.buffer.toString('base64')}:null,cutoutMessage:result.cutoutMessage,processing:'local'};
}
async function recognizeItem(input,options){return garment.imageJob(()=>analyze(input,options));}
module.exports={recognizeItem,analyze,types,modelReady,dominantColor,colorName,chooseType,attributesFor};
