'use strict';
const fs=require('node:fs'),path=require('node:path');
const configPath=path.join(__dirname,'../data/public/bridge.json');
function readBridge(){
  if(!fs.existsSync(configPath))return null;
  const config=JSON.parse(fs.readFileSync(configPath,'utf8')),url=new URL(config.url);
  if(url.protocol!=='https:'||url.username||url.password||!url.hostname.endsWith('.chatgpt.site')||url.pathname!=='/'||url.search||url.hash||typeof config.token!=='string'||config.token.length<48)throw Error('固定入口配置无效');
  return {...config,url:url.origin};
}
async function updateBridge(origin){
  const config=readBridge();if(!config)return null;
  const response=await fetch(config.url+'/__bridge/connect',{method:'POST',headers:{Authorization:'Bearer '+config.token,'Content-Type':'application/json'},body:JSON.stringify({origin}),signal:AbortSignal.timeout(12000),redirect:'error'});
  if(!response.ok){await response.body?.cancel();throw Error('固定入口连接更新未成功（'+response.status+'）');}
  const result=await response.json();if(!result.data?.connected)throw Error('固定入口未确认连接');return config.url;
}
module.exports={readBridge,updateBridge};
