'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {DatabaseSync,backup}=require('node:sqlite');

async function backupDatabase({dataDir=path.join(__dirname,'../data'),destination}={}){
  const source=path.resolve(dataDir,'outfit.sqlite');
  if(!fs.existsSync(source))throw new Error('数据库尚未创建，请先启动独立版');
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const target=path.resolve(destination||path.join(dataDir,'backups','outfit-'+stamp+'-'+crypto.randomBytes(3).toString('hex')+'.sqlite'));
  if(target===source||fs.existsSync(target))throw new Error('备份目标必须是新的文件，不能覆盖数据库或已有备份');
  fs.mkdirSync(path.dirname(target),{recursive:true});
  const sourceDb=new DatabaseSync(source,{readOnly:true});
  try{await backup(sourceDb,target);}finally{sourceDb.close();}
  const copied=new DatabaseSync(target,{readOnly:true});
  try{
    const check=copied.prepare('PRAGMA quick_check').all();
    if(check.some(row=>Object.values(row)[0]!=='ok'))throw new Error('备份完整性检查未通过，请保留原数据库');
  }finally{copied.close();}
  const hasher=crypto.createHash('sha256');
  await new Promise((resolve,reject)=>{const stream=fs.createReadStream(target);stream.on('data',chunk=>hasher.update(chunk));stream.on('error',reject);stream.on('end',resolve);});
  const meta={format:'outfit-mirror-sqlite-backup',version:1,createdAt:new Date().toISOString(),file:path.basename(target),bytes:fs.statSync(target).size,sha256:hasher.digest('hex'),integrity:'ok'};
  fs.writeFileSync(target+'.json',JSON.stringify(meta,null,2),{flag:'wx'});
  return {path:target,...meta};
}
module.exports={backupDatabase};
if(require.main===module)backupDatabase().then(result=>console.log(JSON.stringify(result,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});
