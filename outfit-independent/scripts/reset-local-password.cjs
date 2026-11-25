'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{promisify}=require('node:util');
const {DatabaseSync}=require('node:sqlite');
async function resetLocalPassword({dataDir=path.join(__dirname,'../data'),username,newPassword}){
  if(typeof username!=='string'||!/^[\p{L}\p{N}_@.\-]{3,80}$/u.test(username.trim()))throw Error('账号格式不正确');
  if(typeof newPassword!=='string'||newPassword.length<10||newPassword.length>200)throw Error('密码需为 10–200 位');
  const database=path.resolve(dataDir,'outfit.sqlite');if(!fs.existsSync(database))throw Error('数据库不存在');
  const db=new DatabaseSync(database);db.exec('PRAGMA busy_timeout=5000');
  try{
    const user=db.prepare('SELECT id FROM users WHERE username=?').get(username.trim().toLowerCase());
    if(!user)throw Error('账号不存在，请核对');
    const salt=crypto.randomBytes(16).toString('hex'),hash=(await promisify(crypto.scrypt)(newPassword,salt,64)).toString('hex');
    const backup=await require('./backup-database.cjs').backupDatabase({dataDir});
    db.exec('BEGIN IMMEDIATE');
    try{db.prepare('UPDATE users SET salt=?,password_hash=? WHERE id=?').run(salt,hash,user.id);db.prepare('DELETE FROM sessions WHERE owner=?').run(user.id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
    return {changed:true,backup:backup.path};
  }finally{db.close();}
}
module.exports={resetLocalPassword};
if(require.main===module)(async()=>{
  if(!process.stdin.isTTY)throw Error('请在本机交互终端运行，不接受命令行或管道中的明文密码');
  const {Writable}=require('node:stream'),readline=require('node:readline');let muted=false;
  const output=new Writable({write(chunk,encoding,done){if(!muted)process.stdout.write(chunk);done();}});
  const input=readline.createInterface({input:process.stdin,output,terminal:true});
  const ask=prompt=>new Promise(resolve=>input.question(prompt,resolve));
  async function secret(prompt){process.stdout.write(prompt);muted=true;try{return await ask('');}finally{muted=false;process.stdout.write('\n');}}
  try{
    console.log('本机管理工具：重设指定账号密码并使该账号退出所有设备；操作前自动备份。');
    const username=await ask('账号：');
    if(await ask('确认操作请输入 RESET：')!=='RESET'){console.log('已取消');return;}
    const password=await secret('新密码（不回显）：'),confirmation=await secret('再次输入：');
    if(password!==confirmation)throw Error('两次密码不一致，未作修改');
    const result=await resetLocalPassword({username,newPassword:password});console.log('密码已重设。备份：'+result.backup);
  }finally{input.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
