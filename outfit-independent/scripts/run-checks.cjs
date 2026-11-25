'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const suites=[['--test',...fs.readdirSync(path.join(root,'test')).filter(f=>f.endsWith('.test.cjs')).sort().map(f=>'test/'+f)],['test/ui-check.cjs'],['test/account-switch-check.cjs']];
try{require.resolve('jsdom');}catch{console.error('缺少测试依赖，请先在项目目录安装依赖（包含 devDependencies）。');process.exit(1);}
for(const args of suites){
  const result=spawnSync(process.execPath,args,{cwd:root,env:{...process.env,LLM_API_BASE:'',LLM_API_KEY:'',LLM_MODEL:'',IMAGE_API_KEY:'',OPENAI_API_KEY:'',TAOBAO_APP_KEY:'',TAOBAO_APP_SECRET:'',TAOBAO_ADZONE_ID:''},stdio:'inherit',windowsHide:true});
  if(result.error){console.error(result.error.message);process.exit(1);}
  if(result.status!==0)process.exit(result.status||1);
}
console.log('全部后台与页面流程检查通过。');
