'use strict';
const fs=require('node:fs'),path=require('node:path'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
const execute=promisify(execFile),root=path.resolve(__dirname,'..'),statePath=path.join(root,'data','public','state.json');
async function processInfo(pid){
 if(!Number.isSafeInteger(pid)||pid<1)throw Error('进程编号无效');
 const result=await execute('powershell.exe',['-NoProfile','-Command','[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); Get-CimInstance Win32_Process -Filter "ProcessId='+pid+'" | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress'],{windowsHide:true});
 return result.stdout.trim()?JSON.parse(result.stdout):null;
}
(async()=>{
 if(!fs.existsSync(statePath)){console.log('公网通道尚未启动');return;}
 const state=JSON.parse(fs.readFileSync(statePath,'utf8').replace(/^\uFEFF/,''));
 const host=state.pid?await processInfo(state.pid):null,tunnel=state.tunnelPid?await processInfo(state.tunnelPid):null;
 if(host&&(host.Name!=='node.exe'||!host.CommandLine?.includes(path.join(root,'scripts','public-host.cjs'))))throw Error('公网后台进程与本项目不匹配，未停止');
 if(tunnel&&(tunnel.Name!=='ssh.exe'||!tunnel.CommandLine?.includes('nokey@localhost.run')||!tunnel.CommandLine.includes('80:127.0.0.1:8093')||!tunnel.CommandLine.includes(path.join(root,'tools','localhost-run-hostkey.txt'))))throw Error('公网通道进程与本项目不匹配，未停止');
 if(tunnel)process.kill(tunnel.ProcessId);
 await new Promise(r=>setTimeout(r,800));
 if(host){const current=await processInfo(host.ProcessId);if(current&&current.Name==='node.exe'&&current.CommandLine?.includes(path.join(root,'scripts','public-host.cjs')))process.kill(host.ProcessId);}
 state.status='stopped';state.stoppedAt=new Date().toISOString();fs.writeFileSync(statePath,JSON.stringify(state,null,2));
 fs.writeFileSync(path.join(root,'..','手机公网链接.txt'),'公网访问已停止。需要使用时双击“启动公网访问.cmd”，获得新的公开地址。\r\n');
 console.log('公网访问已停止，本机独立版保持运行。');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
