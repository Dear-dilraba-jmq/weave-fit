'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const directory=path.join(__dirname,'data','public'),statePath=path.join(directory,'state.json');
function read(){try{return JSON.parse(fs.readFileSync(statePath,'utf8'));}catch{return null;}}
async function ready(state){
  if(!state||state.status!=='ready'||!Number.isSafeInteger(state.pid)||state.port!==8093)return false;
  try{const url=require('./scripts/public-host.cjs').publicAddress(new URL(state.url).hostname);if(url!==state.url)return false;
    process.kill(state.pid,0);const r=await fetch('http://127.0.0.1:8093/api/health',{headers:{Host:new URL(url).host,'X-Forwarded-Proto':'https'},signal:AbortSignal.timeout(1800)});return r.ok&&(await r.json()).service==='outfit-mirror-independent';
  }catch{return false;}
}
(async()=>{
  if(!process.argv.includes('--enable')){console.log('当前按你的选择保留本地版，公网连接未启用。请使用“启动独立版.cmd”。');return;}
  let state=read();if(await ready(state)){console.log('手机公网地址：'+(state.publicUrl||state.url)+'/');console.log('电脑和公网通道需保持运行。');return;}
  if(state&&['starting','connecting','ready'].includes(state.status)){let exists=false;try{process.kill(state.pid,0);exists=true;}catch{}if(exists)throw Error('公网进程仍在运行或重新连接，请稍后再试；需要重建时先运行“停止公网访问.cmd”。');}
  fs.mkdirSync(directory,{recursive:true});const logfile=path.join(directory,'host-'+Date.now()+'.log'),fd=fs.openSync(logfile,'a');
  let child;try{child=spawn(process.execPath,[path.join(__dirname,'scripts','public-host.cjs')],{cwd:__dirname,windowsHide:true,detached:true,stdio:['ignore',fd,fd]});}finally{fs.closeSync(fd);}
  let spawnError;child.once('error',e=>{spawnError=e;});child.unref();
  for(let i=0;i<80;i++){if(spawnError)throw spawnError;state=read();if(state&&state.pid===child.pid&&state.status==='stopped')throw Error(state.message||'公网通道未能建立');if(state&&state.pid===child.pid&&await ready(state)){console.log('手机公网地址：'+(state.publicUrl||state.url)+'/');console.log('已保存到上一级目录“手机公网链接.txt”。电脑需保持开机。');return;}await new Promise(r=>setTimeout(r,500));}
  throw Error('公网连接仍未就绪，请查看 data/public 中最新日志后再试。');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
