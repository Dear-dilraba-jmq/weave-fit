'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net');
const {spawn,execFile}=require('node:child_process');

function launchConfig(env=process.env){
  const raw=env.PORT===undefined?'8090':String(env.PORT).trim();
  if(!/^\d+$/.test(raw)||Number(raw)<1||Number(raw)>65535)throw Error('PORT 必须为 1–65535 的端口号');
  const host=String(env.HOST||'0.0.0.0').replace(/^\[|\]$/g,'');
  if(host!=='localhost'&&!net.isIP(host))throw Error('HOST 请填写本机 IP、localhost 或 0.0.0.0');
  const connectHost=['0.0.0.0','::'].includes(host)?'127.0.0.1':host;
  return {host,port:Number(raw),url:'http://'+(net.isIP(connectHost)===6?'['+connectHost+']':connectHost)+':'+Number(raw)+'/'};
}
async function ready(url){
  try{const r=await fetch(url+'api/health',{signal:AbortSignal.timeout(1200)});const b=await r.json();return r.ok&&b.storage==='sqlite'&&b.version===1&&(!b.service||b.service==='outfit-mirror-independent');}catch{return false;}
}
async function dailyBackup(dataDir){
  if(!fs.existsSync(path.join(dataDir,'outfit.sqlite')))return;
  const stamp=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const marker=path.join(dataDir,'backups','startup-'+stamp+'.json');
  if(fs.existsSync(marker))return;
  const result=await require('./scripts/backup-database.cjs').backupDatabase({dataDir});
  try{fs.writeFileSync(marker,JSON.stringify({file:path.basename(result.path),integrity:result.integrity}),{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}
}
function openBrowser(url){
  const done=e=>{if(e)console.log('请在浏览器打开上面的地址。');};
  if(process.platform==='win32')execFile('rundll32.exe',['url.dll,FileProtocolHandler',url],{windowsHide:true},done);
  else execFile(process.platform==='darwin'?'open':'xdg-open',[url],done);
}
async function launch({open=true}={}){
  if(Number(process.versions.node.split('.')[0])<24)throw Error('独立版需要 Node.js 24 或更新版本，请安装后再启动。');
  if(fs.existsSync(path.join(__dirname,'.env')))process.loadEnvFile(path.join(__dirname,'.env'));
  const cfg=launchConfig(),dataDir=path.join(__dirname,'data'),logs=path.join(dataDir,'logs');
  fs.mkdirSync(logs,{recursive:true});
  const logFile=path.join(logs,'server.log');
  if(!await ready(cfg.url)){
    const diagnostic=require('./scripts/diagnose.cjs').diagnose();
    if(!diagnostic.coreReady)throw Error('运行环境不完整：'+diagnostic.checks.filter(c=>!c.ready&&!c.optional).map(c=>c.name).join('、')+'。请运行 node scripts/diagnose.cjs 检查。');
    await dailyBackup(dataDir);
    if(fs.existsSync(logFile)&&fs.statSync(logFile).size>2*1024*1024)fs.renameSync(logFile,path.join(logs,'server-'+Date.now()+'.log'));
    const fd=fs.openSync(logFile,'a');let child;
    try{child=spawn(process.execPath,['--env-file-if-exists=.env',path.join(__dirname,'server.cjs')],{cwd:__dirname,env:{...process.env,HOST:cfg.host,PORT:String(cfg.port)},windowsHide:true,detached:true,stdio:['ignore',fd,fd]});}finally{fs.closeSync(fd);}
    let spawnError,exited=false;child.on('error',e=>{spawnError=e;});child.on('exit',()=>{exited=true;});child.unref();
    let started=false;
    for(let i=0;i<25;i++){if(spawnError)throw spawnError;if(await ready(cfg.url)){started=true;break;}if(exited)break;await new Promise(r=>setTimeout(r,200));}
    if(!started)throw Error('独立版启动失败，端口可能被占用。诊断日志：'+logFile);
  }
  console.log('电脑访问：'+cfg.url);
  if(['0.0.0.0','::'].includes(cfg.host)){for(const a of Object.values(os.networkInterfaces()).flat())if(a&&a.family==='IPv4'&&!a.internal&&/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address))console.log('手机同一 Wi-Fi：http://'+a.address+':'+cfg.port+'/');}
  else if(['127.0.0.1','::1','localhost'].includes(cfg.host))console.log('当前仅监听本机；手机访问需将 HOST 配置为 0.0.0.0。');
  else console.log('手机同一 Wi-Fi：'+cfg.url);
  if(open)openBrowser(cfg.url+'?v='+Date.now());
  return cfg;
}
module.exports={launch,launchConfig,dailyBackup};
if(require.main===module)launch({open:!process.argv.includes('--no-open')}).catch(e=>{console.error(e.message);process.exitCode=1;});
