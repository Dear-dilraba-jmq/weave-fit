'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {backupDatabase}=require('../scripts/backup-database.cjs');
const {launchConfig}=require('../launch.cjs');
const {resetLocalPassword}=require('../scripts/reset-local-password.cjs');
test('launcher validates ports and gives reachable loopback / specific-host addresses',()=>{
 assert.equal(launchConfig({}).url,'http://127.0.0.1:8090/');
 assert.equal(launchConfig({HOST:'localhost'}).url,'http://localhost:8090/');
 assert.equal(launchConfig({HOST:'192.168.1.2',PORT:'8123'}).url,'http://192.168.1.2:8123/');
 assert.equal(launchConfig({HOST:'::1',PORT:'8123'}).url,'http://[::1]:8123/');
 for(const PORT of ['0','65536','abc','8090x',''])assert.throws(()=>launchConfig({PORT}),/PORT/);
 assert.throws(()=>launchConfig({HOST:'http://localhost'}),/HOST/);
});
test('online backup includes committed WAL data and never overwrites the source or another backup',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'outfit-backup-test-'));
  const db=new DatabaseSync(path.join(dir,'outfit.sqlite'));
  t.after(()=>{db.close();if(!path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep))throw Error('Unsafe temporary path');fs.rmSync(dir,{recursive:true,force:true});});
  db.exec("PRAGMA journal_mode=WAL; CREATE TABLE check_rows(id INTEGER PRIMARY KEY,value TEXT); INSERT INTO check_rows(value) VALUES('synthetic committed record');");
  const result=await backupDatabase({dataDir:dir});assert.equal(result.integrity,'ok');assert.equal(result.sha256.length,64);
  const copy=new DatabaseSync(result.path,{readOnly:true});try{assert.equal(copy.prepare('SELECT value FROM check_rows').get().value,'synthetic committed record');}finally{copy.close();}
  await assert.rejects(backupDatabase({dataDir:dir,destination:path.join(dir,'outfit.sqlite')}),/覆盖/);
  await assert.rejects(backupDatabase({dataDir:dir,destination:result.path}),/覆盖/);
});
test('local account recovery backs up data and revokes only the selected account sessions',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'outfit-recovery-test-')),db=new DatabaseSync(path.join(dir,'outfit.sqlite'));
 t.after(()=>{db.close();if(!path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep))throw Error('Unsafe temporary path');fs.rmSync(dir,{recursive:true,force:true});});
 db.exec("CREATE TABLE users(id TEXT PRIMARY KEY,username TEXT,salt TEXT,password_hash TEXT); CREATE TABLE sessions(token_hash TEXT,owner TEXT); INSERT INTO users VALUES('a','synthetic-a','old','old'),('b','synthetic-b','untouched','untouched'); INSERT INTO sessions VALUES('one','a'),('two','b');");
 const result=await resetLocalPassword({dataDir:dir,username:'synthetic-a',newPassword:'synthetic-new-password'});
 assert.equal(result.changed,true);assert.ok(fs.existsSync(result.backup));
 const a=db.prepare('SELECT * FROM users WHERE id=?').get('a');assert.notEqual(a.salt,'old');assert.equal(a.password_hash.length,128);
 const hash=require('node:crypto').scryptSync('synthetic-new-password',a.salt,64).toString('hex');assert.equal(a.password_hash,hash);
 assert.equal(db.prepare('SELECT count(*) AS n FROM sessions WHERE owner=?').get('a').n,0);
 assert.equal(db.prepare('SELECT count(*) AS n FROM sessions WHERE owner=?').get('b').n,1);
 assert.equal(db.prepare('SELECT password_hash FROM users WHERE id=?').get('b').password_hash,'untouched');
 await assert.rejects(resetLocalPassword({dataDir:dir,username:'synthetic-a',newPassword:'short'}),/10/);
});
