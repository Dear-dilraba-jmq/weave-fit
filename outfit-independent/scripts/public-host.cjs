'use strict';
// Explicitly launched public access. Only this application's loopback port is forwarded.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),directory=path.join(root,'data','public'),statePath=path.join(directory,'state.json'),port=8093;
let app,child,heartbeat,stopping=false,bridgeUpdating=false,queue=Promise.resolve();
const {readBridge,updateBridge}=require('./public-bridge.cjs');
let state={status:'starting',pid:process.pid,port,startedAt:new Date().toISOString(),provider:'localhost.run'};
function save(){fs.mkdirSync(directory,{recursive:true});const temporary=statePath+'.tmp';fs.writeFileSync(temporary,JSON.stringify(state,null,2));fs.renameSync(temporary,statePath);}
function log(message){console.log(new Date().toISOString()+' '+message);}
function publicAddress(address){
  if(typeof address!=='string'||address.length>253||!/^([a-z0-9]+[a-z0-9-]*\.)*(?:lhr\.life|localhost\.run)$/.test(address))throw Error('公网服务返回的域名无效');
  return new URL('https://'+address).origin;
}
async function register(address){
  if(stopping)return;
  const url=publicAddress(address);if(state.status==='ready'&&state.url===url)return;
  state.status='connecting';save();
  if(app)app.setPublicHost(new URL(url).hostname);
  else{
    app=require('../server.cjs').createApp({dataDir:path.join(root,'data'),env:{APP_HOSTS:new URL(url).hostname,COOKIE_SECURE:'1',PUBLIC_HTTPS_ONLY:'1',TRUST_LOOPBACK_PROXY:'1'}});
    await new Promise((resolve,reject)=>{app.server.once('error',reject);app.server.listen(port,'127.0.0.1',resolve);});
  }
  state={...state,status:'ready',url,tunnelPid:child.pid,updatedAt:new Date().toISOString()};save();
  const bridge=readBridge(),displayUrl=bridge?bridge.url:url;state.publicUrl=displayUrl;save();
  fs.writeFileSync(path.join(root,'..','手机公网链接.txt'),'穿搭魔镜公网入口\r\n\r\n'+displayUrl+'/\r\n\r\n可通过手机流量或不同 Wi-Fi 访问，请用现有独立版账号登录。\r\n电脑和公网通道需要保持运行。\r\n这不是永久云部署。停止时双击“停止公网访问.cmd”。\r\n');
  log('公网入口已就绪 '+url+'/');
  await refreshBridge();
}
async function refreshBridge(){
  if(stopping||!state.url||bridgeUpdating)return;bridgeUpdating=true;
  try{const url=await updateBridge(state.url);if(url){state.publicUrl=url;state.bridgeConnectedAt=new Date().toISOString();delete state.bridgeError;save();}}
  catch(e){if(state.bridgeError!==e.message)log(e.message);state.bridgeError=e.message;save();}
  finally{bridgeUpdating=false;}
}
async function stop(reason){
  if(stopping)return;stopping=true;
  clearInterval(heartbeat);
  state.status='stopping';save();if(child&&!child.killed)child.kill();
  try{await queue;}catch{}
  if(app){await app.close();app=null;}
  state.status='stopped';state.stoppedAt=new Date().toISOString();if(reason)state.message=reason;save();
}
async function main(){
  if(fs.existsSync(path.join(root,'.env')))process.loadEnvFile(path.join(root,'.env'));
  fs.mkdirSync(directory,{recursive:true});save();
  const probe=net.createServer();await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(port,'127.0.0.1',()=>probe.close(resolve));});
  if(fs.existsSync(path.join(root,'data','outfit.sqlite')))await require('./backup-database.cjs').backupDatabase({dataDir:path.join(root,'data')});
  const known=path.join(root,'tools','localhost-run-hostkey.txt');if(!fs.existsSync(known)||!fs.readFileSync(known,'utf8').trim())throw Error('公网主机标识文件缺失，请先完成连接准备');
  const executable=process.platform==='win32'?path.join(process.env.SystemRoot||'C:\\Windows','System32','OpenSSH','ssh.exe'):'ssh';
  const args=['-T','-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','IdentityFile=none','-o','UserKnownHostsFile='+known,'-o','GlobalKnownHostsFile=none','-o','StrictHostKeyChecking=yes','-o','ExitOnForwardFailure=yes','-o','ConnectTimeout=15','-o','ServerAliveInterval=30','-o','ServerAliveCountMax=3','-R','80:127.0.0.1:'+port,'nokey@localhost.run','--','--output','json','--inject-http-proxy-headers'];
  child=spawn(executable,args,{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});state.tunnelPid=child.pid;save();
  let pending='';child.stdout.on('data',chunk=>{
    pending+=chunk.toString();if(pending.length>262144){child.kill();return;}
    const lines=pending.split('\n');pending=lines.pop();
    for(const line of lines){if(!line.trim().startsWith('{'))continue;try{const event=JSON.parse(line);if(event.type==='run.localhost.tunnel.registered'&&event.data?.address)queue=queue.then(()=>register(event.data.address)).catch(e=>{log(e.message);stop(e.message);});}catch{}}
  });
  child.stderr.on('data',chunk=>{const message=chunk.toString().replace(/[\r\n]+/g,' ').slice(0,600);if(message.trim())log(message);});
  child.once('error',e=>{log(e.message);stop('公网进程启动失败');});
  child.once('exit',code=>{if(!stopping){log('公网连接已断开 '+code);stop('公网连接已断开，请重新启动公网访问');}});
  heartbeat=setInterval(refreshBridge,20000);
}
module.exports={publicAddress};
if(require.main===module){for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>stop());main().catch(async e=>{log(e.message);await stop(e.message);process.exitCode=1;});}
