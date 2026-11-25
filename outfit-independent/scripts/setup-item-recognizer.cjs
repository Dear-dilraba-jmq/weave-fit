'use strict';
// Downloads public model files only. Uploaded photographs never leave this machine.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Readable,Transform}=require('node:stream'),{pipeline}=require('node:stream/promises');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
const repo='Xenova/clip-vit-base-patch32',revision='6b7c523703ae26e39be4b03774966f8571c7f523';
const files=[
 {name:'config.json',size:4524,gitSha1:'e79bad158b04c235740f9b2ec320b17f4030f7a5'},
 {name:'preprocessor_config.json',size:520,gitSha1:'e0675735fd0052745f2f7b7291e4aa7859389998'},
 {name:'special_tokens_map.json',size:472,gitSha1:'2c2130b544c0c5a72d5d00da071ba130a9800fb2'},
 {name:'tokenizer.json',size:2224119,gitSha1:'bc1f77d20440541dd073ebae6f6c401087c7d34e'},
 {name:'tokenizer_config.json',size:775,gitSha1:'c9b2a711cbdd039529fa5a66f1965e13eb14451d'},
 {name:'onnx/model_quantized.onnx',size:153695702,sha256:'0898a3facfdb27f0a041e57649b4989cfd094e4a0040d6ae75ed69917dfc7328'}
];
async function verify(file,target){
 if(fs.statSync(target).size!==file.size)throw Error('模型文件大小不正确：'+file.name);
 const digest=crypto.createHash(file.sha256?'sha256':'sha1');if(file.gitSha1)digest.update('blob '+file.size+'\0');
 for await(const chunk of fs.createReadStream(target))digest.update(chunk);
 if(digest.digest('hex')!==(file.sha256||file.gitSha1))throw Error('模型校验失败：'+file.name);
 if(file.name.endsWith('.json'))JSON.parse(fs.readFileSync(target,'utf8'));
}
async function setup(){
 const root=path.resolve(__dirname,'../models',repo);
 for(const file of files){
   const target=path.join(root,file.name);if(fs.existsSync(target)){await verify(file,target);console.log('Verified: '+file.name);continue;}
   fs.mkdirSync(path.dirname(target),{recursive:true});console.log('Downloading '+file.name+' ('+file.size+' bytes)');
   const url='https://huggingface.co/'+repo+'/resolve/'+revision+'/'+file.name,partial=target+'.part';
   try{
     const response=await fetch(url,{signal:AbortSignal.timeout(300000)});if(!response.ok||!response.body)throw Error('模型下载失败 HTTP '+response.status);
     let size=0;const limiter=new Transform({transform(chunk,encoding,done){size+=chunk.length;done(size>file.size?Error('模型响应超过预期大小'):null,chunk);}});
     await pipeline(Readable.fromWeb(response.body),limiter,fs.createWriteStream(partial));
   }catch(e){
     if(process.platform!=='win32')throw e;
     const quote=s=>"'"+s.replaceAll("'","''")+"'";
     console.log('Using Windows HTTPS downloader for '+file.name);
     await promisify(execFile)('powershell.exe',['-NoProfile','-Command',"$ProgressPreference='SilentlyContinue'; $ErrorActionPreference='Stop'; Invoke-WebRequest -UseBasicParsing -TimeoutSec 300 -Uri "+quote(url)+' -OutFile '+quote(partial)],{windowsHide:true,timeout:320000,maxBuffer:100000});
   }
   await verify(file,partial);fs.renameSync(partial,target);console.log('Verified: '+file.name);
 }
 console.log('本机单品款式识别模型已准备完成。');
}
module.exports={repo,revision,files,setup};
if(require.main===module)setup().catch(e=>{console.error(e.message);process.exitCode=1;});
