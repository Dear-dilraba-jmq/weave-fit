'use strict';
// An isolated browser-check instance. Never opens or copies the user's database.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createApp}=require('../server.cjs');
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'outfit-browser-audit-'));
const app=createApp({dataDir,env:{LLM_API_BASE:'',LLM_API_KEY:'',LLM_MODEL:'',IMAGE_API_KEY:'',OPENAI_API_KEY:'',TAOBAO_APP_KEY:'',TAOBAO_APP_SECRET:'',TAOBAO_ADZONE_ID:''}});
app.server.listen(8092,'127.0.0.1',()=>console.log(JSON.stringify({url:'http://localhost:8092/',dataDir,pid:process.pid})));
app.server.on('error',e=>{console.error(e.message);app.db.close();process.exitCode=1;});
let stopping=false;async function stop(){if(stopping)return;stopping=true;await app.close();if(!path.resolve(dataDir).startsWith(path.resolve(os.tmpdir())+path.sep))throw Error('Unsafe temporary path');fs.rmSync(dataDir,{recursive:true,force:true});}
for(const s of ['SIGINT','SIGTERM'])process.on(s,()=>stop().catch(e=>{console.error(e.message);process.exitCode=1;}));
