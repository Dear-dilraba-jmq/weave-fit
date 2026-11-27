'use strict';
// 导出主页「拍照入橱」演示数据：用 App 本机的 SegFormer + CLIP 处理 homepage/photos/scan-编号.jpg，
// 输出可粘贴进 homepage/home.js 的 scanData 条目，并把白底单品图写到 homepage/photos/cutout-编号.jpg。
// 用法（在 outfit-independent/ 中，需先下载两个本机模型）：node scripts/export-scan-demo.cjs 7:外套 16:包袋
const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp');
const garment=require('../garment.cjs'),recognizer=require('../item-recognizer.cjs');
const photos=path.resolve(__dirname,'../../homepage/photos');
const jobs=process.argv.slice(2).map(arg=>{const [id,category]=arg.split(':');return {id:Number(id),category};});
if(!jobs.length||jobs.some(j=>!Number.isInteger(j.id)||!j.category)){console.error('用法：node scripts/export-scan-demo.cjs <编号>:<类别> ...');process.exit(1);}
(async()=>{
  for(const {id,category} of jobs){
    const name=String(id).padStart(2,'0'),input=fs.readFileSync(path.join(photos,'scan-'+name+'.jpg'));
    const image=await sharp(input,{limitInputPixels:25e6}).rotate().resize({width:1400,height:1400,fit:'inside',withoutEnlargement:true}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const {width:w,height:h}=image.info,segments=await garment.segment(image);
    const mask=garment.selectedMask(segments,category,w,h).mask;garment.cleanMask(mask,w,h);
    const crop=garment.bounds(mask,w,h),pct=v=>+(v*100).toFixed(1);
    const result=await recognizer.analyze(input,{category,segment:async()=>segments});
    if(!result.image){console.error(id+': 没有生成白底单品图（'+result.cutoutMessage+'），不能用于演示');continue;}
    const png=Buffer.from(result.image.base64,'base64'),raw=await sharp(png).ensureAlpha().raw().toBuffer();
    let r=0,g=0,b=0,n=0;
    for(let i=0;i<raw.length;i+=4){if(raw[i+3]<200||(raw[i]>248&&raw[i+1]>248&&raw[i+2]>248))continue;r+=raw[i];g+=raw[i+1];b+=raw[i+2];n++;}
    const hex='#'+[r,g,b].map(v=>Math.round(v/n).toString(16).padStart(2,'0')).join('');
    await sharp(png).resize(600,600).flatten({background:'#fff'}).jpeg({quality:82}).toFile(path.join(photos,'cutout-'+name+'.jpg'));
    const a=result.attributes;
    console.log(id+":{box:["+[pct(crop.left/w),pct(crop.top/h),pct(crop.width/w),pct(crop.height/h)]+"],size:["+w+","+h+"],name:'"+a.name+"',category:'"+a.category+"',color:'"+a.color+"',hex:'"+hex+"',season:'"+a.season+"'}"+(a.needsReview?' // 模型提示需要核对':''));
  }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
