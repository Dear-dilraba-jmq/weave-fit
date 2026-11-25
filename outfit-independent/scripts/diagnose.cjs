'use strict';
const fs=require('node:fs'),path=require('node:path');
function diagnose(base=path.resolve(__dirname,'..')){
  const checks=[];
  checks.push({name:'Node.js 24+',ready:Number(process.versions.node.split('.')[0])>=24});
  for(const name of ['sharp','@huggingface/transformers']){
    try{require.resolve(name,{paths:[base]});checks.push({name:name,ready:true});}catch{checks.push({name:name,ready:false});}
  }
  const model=path.join(base,'models/Xenova/segformer_b2_clothes');
  checks.push({name:'本地衣物模型',optional:true,ready:['config.json','preprocessor_config.json','onnx/model_quantized.onnx'].every(p=>fs.existsSync(path.join(model,p)))});
  const recognizer=path.join(base,'models/Xenova/clip-vit-base-patch32');checks.push({name:'单品款式识别模型',optional:true,ready:['config.json','tokenizer.json','preprocessor_config.json','onnx/model_quantized.onnx'].every(p=>fs.existsSync(path.join(recognizer,p)))});
  checks.push({name:'服务入口',ready:fs.existsSync(path.join(base,'server.cjs'))&&fs.existsSync(path.join(base,'public/index.html'))});
  return {node:process.version,coreReady:checks.filter(c=>!c.optional).every(c=>c.ready),checks};
}
module.exports={diagnose};
if(require.main===module){const result=diagnose();console.log(JSON.stringify(result,null,2));if(!result.coreReady)process.exitCode=1;}
