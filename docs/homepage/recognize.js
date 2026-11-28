/* 网页版拍照入橱的自动识别：在访客的浏览器里运行与完整 App 相同的两个模型（相同版本），照片不离开设备。
   - 衣物分割 Xenova/segformer_b2_clothes（q8，约 29 MB）：大类、衣物区域、白底单品图
   - 款式识别 Xenova/clip-vit-base-patch32 的视觉部分（q8，约 89 MB）+ clip-type-vectors.json 里预先算好的款式文字向量：名称、季节
   - 推理库 transformers.js 与 ONNX 运行时（约 22 MB）从 jsDelivr 按固定版本加载
   识别规则（大类、颜色、款式选择、名称格式与整套流程）来自 outfit-independent/public/garment-rules.js，与 App 服务端同一份。
   模型按 App 安装脚本里固定的版本下载：先连 Hugging Face，连不上时再用国内镜像 hf-mirror.com
   （镜像对境外访问只回一个跳转、不带跨域头，并行试连会在控制台留下一条被拦截的请求）；浏览器缓存后直接用缓存所在的地址，不再联网试连。 */
const LIBRARY='https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js';
const SEGMENTER={id:'Xenova/segformer_b2_clothes',revision:'cb6ac44e641faa309f29561c1afe08d87ef52631',file:'onnx/model_quantized.onnx',bytes:28837959};
const CLIP={id:'Xenova/clip-vit-base-patch32',revision:'6b7c523703ae26e39be4b03774966f8571c7f523',file:'onnx/vision_model_quantized.onnx',bytes:89117001};
const HOSTS=['https://huggingface.co/','https://hf-mirror.com/'];
const RUNTIME_BYTES=22500000;
export const DOWNLOAD_MB=Math.round((SEGMENTER.bytes+CLIP.bytes+RUNTIME_BYTES)/1e6);

let loading=null,vectors=null;
const rules=()=>window.GarmentRules;
const fileUrl=(host,model)=>host+model.id+'/resolve/'+model.revision+'/'+model.file;

/* 两个模型文件都已在浏览器缓存里时返回缓存所在的下载地址（transformers.js 用 Cache Storage「transformers-cache」，键是下载地址） */
async function cachedHost(){
  try{
    if(!('caches' in window))return null;
    const cache=await caches.open('transformers-cache');
    for(const host of HOSTS){
      const hits=await Promise.all([SEGMENTER,CLIP].map(model=>cache.match(fileUrl(host,model))));
      if(hits.every(Boolean))return host;
    }
  }catch{/* 隐私模式等情况下 Cache Storage 不可用，当作没有缓存 */}
  return null;
}
export async function modelsCached(){return !!loading||!!(await cachedHost());}
/* 有缓存就用缓存所在的地址；否则按顺序试连，第一个能正常回应的排在最前，都连不上时仍按原顺序整体试一遍 */
async function pickHosts(){
  const order=first=>[first].concat(HOSTS.filter(h=>h!==first));
  const cached=await cachedHost();if(cached)return order(cached);
  for(const host of HOSTS){
    const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),6000);
    try{const r=await fetch(host+SEGMENTER.id+'/resolve/'+SEGMENTER.revision+'/config.json',{signal:ctrl.signal});if(r.ok)return order(host);}catch{/* 换下一个地址 */}
    finally{clearTimeout(timer);}
  }
  return HOSTS.slice();
}
async function loadModels(onProgress){
  const t=await import(LIBRARY);
  t.env.allowLocalModels=false;t.env.allowRemoteModels=true;t.env.useBrowserCache=true;
  const loaded={},big={[SEGMENTER.file]:SEGMENTER.bytes,[CLIP.file]:CLIP.bytes},total=SEGMENTER.bytes+CLIP.bytes;
  const progress=e=>{
    if(!e||!e.file||!(e.file in big))return;
    if(e.status==='progress'&&Number.isFinite(e.loaded))loaded[e.name+'/'+e.file]=e.loaded;
    if(e.status==='done')loaded[e.name+'/'+e.file]=big[e.file];
    if(onProgress)onProgress(Math.min(99,Math.round(Object.values(loaded).reduce((a,b)=>a+b,0)/total*100)));
  };
  let lastError;
  for(const host of await pickHosts()){
    t.env.remoteHost=host;
    try{
      const segmenter=await t.pipeline('image-segmentation',SEGMENTER.id,{revision:SEGMENTER.revision,dtype:'q8',device:'wasm',progress_callback:progress});
      const processor=await t.AutoProcessor.from_pretrained(CLIP.id,{revision:CLIP.revision});
      const vision=await t.CLIPVisionModelWithProjection.from_pretrained(CLIP.id,{revision:CLIP.revision,dtype:'q8',device:'wasm',progress_callback:progress});
      return {t,segmenter,processor,vision};
    }catch(e){lastError=e;}
  }
  throw Object.assign(new Error('识别模型下载失败，请检查网络后再试'),{cause:lastError});
}
export function prepare(onProgress){
  if(!loading)loading=loadModels(onProgress).catch(e=>{loading=null;throw e;});
  return loading;
}
async function styleVectors(){
  if(!vectors)vectors=fetch(new URL('./clip-type-vectors.json',import.meta.url)).then(r=>{if(!r.ok)throw Error('款式向量缺失');return r.json();}).then(v=>{
    const data=new Float32Array(Uint8Array.from(atob(v.vectors),c=>c.charCodeAt(0)).buffer),index={};
    v.labels.forEach((label,i)=>{index[label]=data.subarray(i*v.dims,(i+1)*v.dims);});
    return {scale:v.scale,dims:v.dims,index};
  }).catch(e=>{vectors=null;throw e;});
  return vectors;
}

function canvasOf(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
function fitInside(w,h,max,enlarge){const s=Math.min(max/w,max/h);return enlarge||s<1?s:1;}
function pixelsOf(canvas){const ctx=canvas.getContext('2d',{willReadFrequently:true});return ctx.getImageData(0,0,canvas.width,canvas.height).data;}
/* 与服务端同样的白底单品图：1080×1080 白底，单品按比例缩放到 864×864 以内居中 */
function compose(source,crop){
  const out=canvasOf(1080,1080),ctx=out.getContext('2d'),s=fitInside(crop.width,crop.height,864,true),w=Math.round(crop.width*s),h=Math.round(crop.height*s);
  ctx.fillStyle='#fff';ctx.fillRect(0,0,1080,1080);
  ctx.imageSmoothingQuality='high';
  ctx.drawImage(source,crop.left,crop.top,crop.width,crop.height,Math.round((1080-w)/2),Math.round((1080-h)/2),w,h);
  return out;
}
function product(sourceCanvas,image,layers,category){
  const plan=rules().productPlan(image,layers,category),w=image.info.width,h=image.info.height;
  if(plan.mode==='white')return {canvas:compose(sourceCanvas,plan.crop),preservedWhiteBackground:true};
  /* 用衣物区域做透明度（边缘轻微模糊），再合成到白底上 */
  const maskCanvas=canvasOf(w,h),maskData=new ImageData(w,h);
  for(let i=0;i<plan.mask.length;i++)maskData.data[i*4+3]=plan.mask[i];
  maskCanvas.getContext('2d').putImageData(maskData,0,0);
  const cut=canvasOf(w,h),ctx=cut.getContext('2d');
  ctx.drawImage(sourceCanvas,0,0);
  ctx.globalCompositeOperation='destination-in';
  if('filter' in ctx)ctx.filter='blur(0.5px)';
  ctx.drawImage(maskCanvas,0,0);
  return {canvas:compose(cut,plan.crop)};
}
async function classify(models,canvas,candidates){
  const {t,processor,vision}=models,v=await styleVectors();
  const s=fitInside(canvas.width,canvas.height,600,false),w=Math.max(1,Math.round(canvas.width*s)),h=Math.max(1,Math.round(canvas.height*s)),small=canvasOf(w,h);
  small.getContext('2d').drawImage(canvas,0,0,w,h);
  const {image_embeds:embeds}=await vision(await processor(new t.RawImage(pixelsOf(small),w,h,4)));
  const e=embeds.data;let n=0;for(let j=0;j<v.dims;j++)n+=e[j]*e[j];n=Math.sqrt(n)||1;
  const usable=candidates.filter(c=>v.index[c.label]);
  const logits=usable.map(c=>{const t2=v.index[c.label];let dot=0;for(let j=0;j<v.dims;j++)dot+=e[j]/n*t2[j];return dot*v.scale;});
  const max=Math.max(...logits),exp=logits.map(x=>Math.exp(x-max)),sum=exp.reduce((a,b)=>a+b,0);
  return usable.map((c,i)=>({label:c.label,score:exp[i]/sum})).sort((a,b)=>b.score-a.score);
}
/* 主色的色块：取衣物区域里与主色同名的像素平均色 */
function swatch(image,mask,colorText){
  if(!mask||!colorText)return '';
  const main=colorText.split('/')[0].trim(),d=image.data,step=Math.max(1,Math.floor(mask.length/40000));let r=0,g=0,b=0,n=0;
  for(let i=0;i<mask.length;i+=step){const p=i*4;if(mask[i]<128||d[p+3]<128||rules().colorName(d[p],d[p+1],d[p+2])!==main)continue;r+=d[p];g+=d[p+1];b+=d[p+2];n++;}
  if(!n)return '';
  return '#'+[r,g,b].map(x=>('0'+Math.round(x/n).toString(16)).slice(-2)).join('');
}

/* 识别一张照片：返回自动填写的字段、白底单品图（JPEG）和提示，流程与完整 App 的 item-recognizer 相同 */
export async function recognize(file,{category,onProgress}={}){
  const models=await prepare(onProgress);
  const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});
  const s=fitInside(bitmap.width,bitmap.height,1400,false),w=Math.max(1,Math.round(bitmap.width*s)),h=Math.max(1,Math.round(bitmap.height*s)),source=canvasOf(w,h);
  source.getContext('2d').drawImage(bitmap,0,0,w,h);bitmap.close&&bitmap.close();
  const image={data:pixelsOf(source),info:{width:w,height:h,channels:4}};
  const result=await rules().analyzeGarment(image,{
    category,
    segment:async img=>models.segmenter(new models.t.RawImage(img.data,w,h,4)),
    makeProduct:async(chosen,layers)=>product(source,image,layers,chosen),
    classify:(made,candidates)=>classify(models,made?made.canvas:source,candidates)
  });
  const cutout=result.product?await new Promise(resolve=>result.product.canvas.toBlob(resolve,'image/jpeg',.9)):null;
  return {attributes:result.attributes,cutout,cutoutMessage:result.cutoutMessage,hex:swatch(image,result.mask,result.attributes.color)};
}
