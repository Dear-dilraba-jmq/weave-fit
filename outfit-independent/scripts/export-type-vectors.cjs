'use strict';
// 网页版款式识别用的文字向量：网页只下载 CLIP 的视觉部分（约 89 MB），款式文字一侧在这里预先算好，省掉约 65 MB 的文字模型。
// 用 App 本机的 CLIP 模型（与网页版同一版本）计算 "a photo of <款式>" 的单位文字向量和打分倍数，写到 homepage/clip-type-vectors.json。
// 修改 public/garment-rules.js 的 types 后重新运行（在 outfit-independent/ 中，需先运行 setup-item-recognizer.cjs 下载模型）：
//   node scripts/export-type-vectors.cjs [模型目录，默认 ./models]
const fs=require('node:fs'),path=require('node:path');
const {types}=require('../public/garment-rules.js');
const MODEL='Xenova/clip-vit-base-patch32',REVISION='6b7c523703ae26e39be4b03774966f8571c7f523',TEMPLATE='a photo of {}';
const output=path.join(__dirname,'..','..','homepage','clip-type-vectors.json');
function unit(data,offset,dims){let n=0;for(let j=0;j<dims;j++)n+=data[offset+j]**2;n=Math.sqrt(n)||1;return Array.from({length:dims},(_,j)=>data[offset+j]/n);}
async function main(){
  const modelsDir=path.resolve(process.argv[2]||path.join(__dirname,'..','models'));
  const {AutoTokenizer,AutoProcessor,CLIPModel,RawImage,env}=require('@huggingface/transformers');
  env.allowRemoteModels=false;env.localModelPath=modelsDir+path.sep;
  const tokenizer=await AutoTokenizer.from_pretrained(MODEL,{local_files_only:true});
  const processor=await AutoProcessor.from_pretrained(MODEL,{local_files_only:true});
  const model=await CLIPModel.from_pretrained(MODEL,{local_files_only:true,dtype:'q8',device:'cpu'});
  const texts=types.map(t=>TEMPLATE.replace('{}',t.label));
  // CLIP 的合并模型需要同时输入图片；用一张灰图，只取文字向量，并用它反推打分倍数（logit scale）
  const image=await processor(new RawImage(new Uint8ClampedArray(224*224*3).fill(128),224,224,3));
  const out=await model({...tokenizer(texts,{padding:true,truncation:true}),...image});
  const dims=out.text_embeds.dims[1],vectors=types.map((_,i)=>unit(out.text_embeds.data,i*dims,dims)),pic=unit(out.image_embeds.data,0,dims);
  const cosine=pic.reduce((sum,v,j)=>sum+v*vectors[0][j],0),scale=out.logits_per_image.data[0]/cosine;
  if(!(scale>50&&scale<150))throw Error('打分倍数异常：'+scale);
  const packed=Buffer.from(new Float32Array(vectors.flat()).buffer).toString('base64');
  fs.writeFileSync(output,JSON.stringify({model:MODEL,revision:REVISION,template:TEMPLATE,scale:Number(scale.toFixed(4)),dims,labels:types.map(t=>t.label),vectors:packed})+'\n');
  console.log('Wrote '+types.length+' style vectors ('+dims+' dims, scale '+scale.toFixed(2)+') to '+path.relative(process.cwd(),output));
}
main().catch(e=>{console.error(e.message||e);process.exit(1);});
