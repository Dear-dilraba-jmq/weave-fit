'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const net = require('node:net');
const { promisify } = require('node:util');
const { DatabaseSync } = require('node:sqlite');
const validation = require('./validation.cjs');
const sharp = require('sharp');
const scrypt = promisify(crypto.scrypt);
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const collections = ['profiles', 'wardrobe_items', 'outfits'];
const fields = validation.fields;
function fail(status, message) { throw Object.assign(new Error(message), { status }); }
function clean(collection, row) {
  return validation.clean(collection,row);
}
function imageType(data) {
  if (data.subarray(0, 3).equals(Buffer.from([255,216,255]))) return 'image/jpeg';
  if (data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (data.toString('ascii',0,4) === 'RIFF' && data.toString('ascii',8,12) === 'WEBP') return 'image/webp';
  if (/^GIF8[79]a$/.test(data.toString('ascii',0,6))) return 'image/gif';
  if (data.toString('ascii',4,8) === 'ftyp') {
    const brands = data.toString('ascii',8,40);
    if (/avif|avis/.test(brands)) return 'image/avif';
    if (/heic|heix|hevc|mif1|msf1/.test(brands)) return 'image/heic';
  }
  fail(400, '请选择有效的 JPG、PNG、WebP 等图片');
}
async function body(req, limit = 1024 * 1024) {
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) fail(413, '上传内容过大');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function jsonBody(req, limit) {
  if ((req.headers['content-type'] || '').split(';')[0].trim().toLowerCase()!=='application/json') fail(415, '需要 JSON 请求');
  try { const input=validation.object(JSON.parse((await body(req, limit)).toString()),'请求内容');validation.structure(input);return input; }
  catch (e) { if (e.status) throw e; fail(400, 'JSON 格式不正确'); }
}
async function verifiedImage(data) {
  const type=imageType(data);
  try {const meta=await sharp(data,{limitInputPixels:25e6}).metadata();if(!meta.width||!meta.height)fail(400,'图片内容无法读取，请重新选择照片');}
  catch(e){if(e.status)throw e;fail(400,'图片内容损坏或格式不支持，请重新选择照片');}
  return type;
}

function createApp(options = {}) {
  const started=Date.now();
  const config = { ...process.env, ...(options.env || {}) };
  const dataDir = options.dataDir || path.join(__dirname, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'outfit.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, password_hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS records(id INTEGER PRIMARY KEY AUTOINCREMENT, owner TEXT NOT NULL REFERENCES users(id), collection TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS records_owner ON records(owner,collection);
    CREATE UNIQUE INDEX IF NOT EXISTS one_profile ON records(owner) WHERE collection='profiles';
    CREATE TABLE IF NOT EXISTS files(path TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users(id), content_type TEXT NOT NULL, data BLOB NOT NULL);
    CREATE TABLE IF NOT EXISTS imports(owner TEXT NOT NULL, digest TEXT NOT NULL, PRIMARY KEY(owner,digest));`);
  const limits = new Map();
  const tryonJobs=new Set();
  const secure = config.COOKIE_SECURE === '1';
  const allowedHosts = new Set(['localhost','127.0.0.1','[::1]',...Object.values(os.networkInterfaces()).flat().filter(Boolean).map(a=>a.address),...(config.APP_HOSTS || '').split(',').filter(Boolean)]);
  function rate(key, max, windowMs) {
    const now = Date.now();
    if (limits.size > 10000) for (const [k,v] of limits) if (v.until <= now) limits.delete(k);
    const current = limits.get(key);
    if (!current || current.until <= now) { limits.set(key, { count:1, until:now+windowMs }); return; }
    if (++current.count > max) fail(429, '操作太频繁，请稍后再试');
  }
  function session(req) {
    const token = /(?:^|;\s*)outfit_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
    if (!token) return null;
    const row = db.prepare('SELECT u.id,u.username FROM sessions s JOIN users u ON u.id=s.owner WHERE s.token_hash=? AND s.expires>?').get(digest(token), Date.now());
    return row ? { user: { id:row.id, name:row.username } } : null;
  }
  const rowValue = row => ({ ...JSON.parse(row.payload), id:row.id, created_at:row.created_at });
  const filePath = (owner, value) => {
    if (typeof value !== 'string' || value.length > 350 || !value.startsWith('users/'+owner+'/') || /\.\.|\\|\0/.test(value)) fail(400, '图片路径不正确');
    return value;
  };
  function validateImageReferences(table, row, owner, importedPaths) {
    function check(value) {
      if (value === undefined || value === null || value === '') return;
      filePath(owner, value);
      if (importedPaths && !importedPaths.has(value)) fail(400, '备份缺少引用的图片，请补齐后导入');
      if (!importedPaths && !db.prepare('SELECT 1 FROM files WHERE owner=? AND path=?').get(owner,value)) fail(400,'引用的图片不存在，请重新上传');
    }
    if (table === 'profiles') check(row.face_photo_path);
    if (table === 'wardrobe_items') {
      check(row.image_path);
      check(row.original_path);
    }
    if (table === 'outfits') {
      const imageFields = new Set(['face_photo_path','image_path','original_path','tryonImage','lookImage']);
      const visit = value => {
        if (Array.isArray(value)) { value.forEach(visit); return; }
        if (!value || typeof value !== 'object') return;
        for (const [key, child] of Object.entries(value)) {
          if (imageFields.has(key)) check(child);
          else visit(child);
        }
      };
      visit(row.payload);
    }
  }
  function imageReferenced(owner,target) {
    const imageFields=new Set(['face_photo_path','image_path','original_path','tryonImage','lookImage']);
    const visit=value=>{
      if(Array.isArray(value))return value.some(visit);
      if(!value||typeof value!=='object')return false;
      return Object.entries(value).some(([key,child])=>imageFields.has(key)?child===target:visit(child));
    };
    return db.prepare('SELECT payload FROM records WHERE owner=?').all(owner).some(r=>visit(JSON.parse(r.payload)));
  }
  const llmConfigured = () => !!(config.LLM_API_BASE && config.LLM_API_KEY && config.LLM_MODEL);
  const staticFiles = new Set(fs.readdirSync(path.join(__dirname,'public')).filter(f => /\.(html|js|css|png|jpe?g|svg|webmanifest)$/.test(f)));
  const mime = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.webmanifest':'application/manifest+json' };
  const server = http.createServer(async (req,res) => {
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Cache-Control','no-store');
    const send = (status, value) => { res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify(value)); };
    try {
      let requestHost;
      if(typeof req.headers.host!=='string'||req.headers.host.length>300||/[\s\/@\\?#%]/.test(req.headers.host))fail(400,'访问地址不正确');
      try { requestHost = new URL('http://'+req.headers.host).hostname; } catch { fail(400,'访问地址不正确'); }
      if (!allowedHosts.has(requestHost)) fail(403,'此域名未配置，请使用本机或局域网地址');
      const url = new URL(req.url, 'http://localhost');
      const route = url.pathname;
      if(config.PUBLIC_HTTPS_ONLY==='1'){
        res.setHeader('Strict-Transport-Security','max-age=86400');
        if(req.headers['x-forwarded-proto']!=='https'){
          if(['GET','HEAD'].includes(req.method)){res.writeHead(302,{Location:'https://'+req.headers.host+req.url});return res.end();}
          fail(403,'请通过 HTTPS 公开链接操作');
        }
      }
      const methods={'/api/health':['GET'],'/api/auth/register':['POST'],'/api/auth/login':['POST'],'/api/auth/logout':['POST'],'/api/auth/session':['GET'],'/api/auth/password':['POST'],'/api/status':['GET'],'/api/shopping/status':['GET'],'/api/shopping/search':['POST'],'/api/tryon/status':['GET'],'/api/tryon':['POST'],'/api/garment':['POST'],'/api/records':['POST'],'/api/files':['GET','HEAD','PUT','DELETE'],'/api/models':['GET'],'/api/chat':['POST'],'/api/backup':['GET'],'/api/import':['POST'],'/api/outfits/generate':['POST']};
      methods['/api/outfits/manual']=['POST'];
      if(methods[route]&&!methods[route].includes(req.method)){res.setHeader('Allow',methods[route].join(', '));fail(405,'此接口不支持该请求方式');}
      if (!['GET','HEAD','POST','PUT','DELETE'].includes(req.method)) fail(405,'不支持的请求方式');
      if (!['GET','HEAD'].includes(req.method)) {
        const origin = req.headers.origin;
        if (origin) {
          let parsed;try{parsed = new URL(origin);}catch{fail(403,'来源地址不正确');}
          if(config.PUBLIC_HTTPS_ONLY==='1'&&parsed.protocol!=='https:')fail(403,'请从 HTTPS 本站页面操作');
          if (!['http:','https:'].includes(parsed.protocol) || parsed.host !== req.headers.host || parsed.username || parsed.password || parsed.pathname!=='/' || parsed.search || parsed.hash) fail(403,'请从本站页面操作');
        }
        if (req.headers['sec-fetch-site'] === 'cross-site') fail(403,'请从本站页面操作');
      }
      if (['/api/auth/register','/api/auth/login'].includes(route) && req.method === 'POST') {
        let clientAddress=req.socket.remoteAddress;
        if(config.TRUST_LOOPBACK_PROXY==='1'&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(clientAddress)){
          const forwarded=String(req.headers['x-forwarded-for']||'').split(',').at(-1).trim();
          if(net.isIP(forwarded))clientAddress=forwarded;
        }
        rate('auth:'+clientAddress,20,600000);
        const input = await jsonBody(req,16384);
        if(typeof input.username!=='string'||typeof input.password!=='string')fail(400,'账号和密码必须为文字');
        const username = input.username.trim().toLowerCase();
        const password = input.password;
        if (!/^[\p{L}\p{N}_@.\-]{3,80}$/u.test(username) || password.length < 10 || password.length > 200) fail(400,'账号需为 3–80 位文字或数字，密码需为 10–200 位');
        let user = db.prepare('SELECT * FROM users WHERE username=?').get(username);
        if (route.endsWith('register')) {
          if (user) fail(409,'账号已存在，请直接登录');
          const salt = crypto.randomBytes(16).toString('hex');
          const hash = (await scrypt(password,salt,64)).toString('hex');
          user = { id:crypto.randomUUID(),username,salt,password_hash:hash };
          try { db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(user.id,username,salt,hash); }
          catch { fail(409,'账号已存在，请直接登录'); }
        } else {
          const hash = await scrypt(password,user?.salt || 'nonexistent-account-salt',64);
          if (!user || !crypto.timingSafeEqual(hash,Buffer.from(user.password_hash,'hex'))) fail(401,'账号或密码不正确');
        }
        db.prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now());
        const token = crypto.randomBytes(32).toString('hex');
        db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(token),user.id,Date.now()+7*86400000);
        res.setHeader('Set-Cookie',`outfit_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${secure?'; Secure':''}`);
        return send(200,{data:{user:{id:user.id,name:user.username}}});
      }
      const active = session(req);
      if (Object.hasOwn(req.headers, 'x-outfit-owner') && req.headers['x-outfit-owner'] !== active?.user.id) {
        res.setHeader('X-Outfit-Account-Mismatch', '1');
        fail(409, '登录账号已变化，请刷新页面后重试');
      }
      if (route === '/api/health' && req.method === 'GET') return send(200,{ok:true,service:'outfit-mirror-independent',version:1,aiConfigured:llmConfigured(),storage:'sqlite'});
      if (route === '/api/auth/session' && req.method === 'GET') return send(200,{data:active});
      if (route === '/api/auth/logout' && req.method === 'POST') {
        const token = /(?:^|;\s*)outfit_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
        if (token) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token));
        res.setHeader('Set-Cookie',`outfit_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure?'; Secure':''}`);
        return send(200,{data:null});
      }
      if (route.startsWith('/api/')) {
        if (!active) fail(401,'请先登录');
        const owner = active.user.id;
        if(route==='/api/status')return send(200,{data:{version:'1.2.0',schemaVersion:1,uptimeSeconds:Math.floor((Date.now()-started)/1000),storage:{engine:'sqlite',ready:true},planner:{ready:true,mode:'local'},garment:{modelPresent:fs.existsSync(path.join(__dirname,'models/Xenova/segformer_b2_clothes/onnx/model_quantized.onnx'))},textAI:{configured:llmConfigured()},tryon:{configured:!!(config.IMAGE_API_KEY||config.OPENAI_API_KEY)},shopping:{configured:require('./shopping.cjs').configured(config)}}});
        if(route==='/api/auth/password'){
          rate('password:'+owner,5,600000);
          const input=await jsonBody(req,16384);
          for(const key of ['currentPassword','newPassword'])if(typeof input[key]!=='string'||input[key].length<10||input[key].length>200)fail(400,'当前密码与新密码需为10–200位文字');
          const user=db.prepare('SELECT * FROM users WHERE id=?').get(owner),hash=await scrypt(input.currentPassword,user.salt,64);
          if(!crypto.timingSafeEqual(hash,Buffer.from(user.password_hash,'hex')))fail(400,'当前密码不正确');
          if(input.currentPassword===input.newPassword)fail(400,'新密码不能与当前密码相同');
          const salt=crypto.randomBytes(16).toString('hex'),next=(await scrypt(input.newPassword,salt,64)).toString('hex');
          db.exec('BEGIN IMMEDIATE');
          try{if(session(req)?.user.id!==owner||db.prepare('SELECT password_hash FROM users WHERE id=?').get(owner).password_hash!==user.password_hash)fail(409,'登录状态或密码已变化，请重新登录');db.prepare('UPDATE users SET salt=?,password_hash=? WHERE id=?').run(salt,next,owner);db.prepare('DELETE FROM sessions WHERE owner=?').run(owner);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
          res.setHeader('Set-Cookie',`outfit_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure?'; Secure':''}`);
          return send(200,{data:{changed:true}});
        }
        if(route==='/api/outfits/manual'){
          rate('manual:'+owner,30,60000);
          return send(200,{data:require('./outfit-service.cjs').manual({db,owner,input:await jsonBody(req,16384)})});
        }
        if(route==='/api/outfits/generate'){
          rate('plan:'+owner,12,60000);
          const input=await jsonBody(req,16384);
          return send(200,{data:await require('./outfit-service.cjs').generate({db,owner,input,env:config,fetchImpl:options.textFetch||fetch})});
        }
        if(route==='/api/shopping/status'&&req.method==='GET')return send(200,{configured:require('./shopping.cjs').configured(config)});
        if(route==='/api/shopping/search'&&req.method==='POST'){
          rate('shopping:'+owner,30,60000);
          const input=await jsonBody(req,2048);
          return send(200,{data:await require('./shopping.cjs').search({env:config,input,fetchImpl:options.shoppingFetch||fetch})});
        }
        if(route==='/api/tryon/status'&&req.method==='GET'){
          const cfg=require('./tryon.cjs').settings(config);
          return send(200,{configured:!!cfg.key,provider:new URL(cfg.endpoint).hostname,model:cfg.model});
        }
        if(route==='/api/tryon'&&req.method==='POST'){
          const input=await jsonBody(req,131072);
          if(input.consent!==true)fail(400,'请先确认向图像服务发送面部照片、身材资料和衣服参考图');
          if(tryonJobs.has(owner))fail(409,'当前穿搭图仍在生成，请稍候');
          rate('tryon:'+owner,3,600000);
          tryonJobs.add(owner);
          try{return send(200,{data:await require('./tryon.cjs').generateTryon({db,owner,plan:input.plan,env:config,fetchImpl:options.imageFetch||fetch})});}
          finally{tryonJobs.delete(owner);}
        }
        if (route === '/api/garment' && req.method === 'POST') {
          rate('garment:'+owner,12,60000);
          const category=url.searchParams.get('category') || '上装';
          if (!['上装','外套','下装','连衣裙','鞋履','包袋','配饰','其他'].includes(category)) fail(400,'请选择衣物类别');
          const input=await body(req,8*1024*1024);
          imageType(input);
          const {processGarment}=require('./garment.cjs');
          const result=await processGarment(input,category);
          res.writeHead(200,{'Content-Type':'image/png','Content-Length':result.buffer.length,'X-Outfit-Image-Mode':'garment'});
          return res.end(result.buffer);
        }
        if (route === '/api/records' && req.method === 'POST') {
          const q = await jsonBody(req);
          if (!collections.includes(q.table)) fail(400,'数据表不正确');
          if(typeof q.id==='string'&&/^[1-9]\d*$/.test(q.id))q.id=Number(q.id);
          if(q.id!==undefined&&(!Number.isSafeInteger(q.id)||q.id<1))fail(400,'记录编号不正确');
          if(q.limit!==undefined&&(!Number.isSafeInteger(q.limit)||q.limit<1||q.limit>1000))fail(400,'每页数量需为1–1000的整数');
          if(q.single!==undefined&&typeof q.single!=='boolean')fail(400,'单条读取标记不正确');
          const rows = db.prepare('SELECT * FROM records WHERE owner=? AND collection=? ORDER BY id DESC').all(owner,q.table);
          let selected = rows.filter(r => q.id === undefined || String(r.id) === String(q.id));
          if (q.mode === 'insert') {
            const row = clean(q.table,q.row);
            validation.required(q.table,row);
            if(Object.hasOwn(row,'owner_name'))row.owner_name=active.user.name;
            validateImageReferences(q.table,row,owner);
            if (q.table === 'profiles' && rows.length) fail(409,'档案已存在，请刷新后重试');
            const created = new Date().toISOString();
            const result = db.prepare('INSERT INTO records(owner,collection,payload,created_at) VALUES(?,?,?,?)').run(owner,q.table,JSON.stringify(row),created);
            return send(200,{data:[{...row,id:Number(result.lastInsertRowid),created_at:created}]});
          }
          if (q.mode === 'update' || q.mode === 'delete') {
            if (!Number.isSafeInteger(Number(q.id)) || Number(q.id) < 1) fail(400,'缺少记录编号');
            const result = selected.map(rowValue);
            if (q.mode === 'delete') db.prepare('DELETE FROM records WHERE owner=? AND collection=? AND id=?').run(owner,q.table,Number(q.id));
            else {
              const changes = clean(q.table,q.row);
              if(Object.hasOwn(changes,'owner_name'))changes.owner_name=active.user.name;
              validateImageReferences(q.table,changes,owner);
              for (const row of result) {
                Object.assign(row,changes);
                validation.required(q.table,row);
                validateImageReferences(q.table,row,owner);
                db.prepare('UPDATE records SET payload=? WHERE owner=? AND collection=? AND id=?').run(JSON.stringify(clean(q.table,row)),owner,q.table,row.id);
              }
            }
            return send(200,{data:result});
          }
          if (q.mode !== 'select') fail(400,'操作不正确');
          const cap = Math.max(1,Math.min(1000,Number(q.limit)||1000));
          selected = selected.slice(0,cap).map(rowValue);
          return send(200,{data:q.single?(selected[0] || null):selected});
        }
        if (route === '/api/files') {
          const p = filePath(owner,url.searchParams.get('path'));
          if (req.method === 'PUT') {
            const data = await body(req,8*1024*1024);
            const type = await verifiedImage(data);
            if (db.prepare('SELECT path FROM files WHERE path=?').get(p)) fail(409,'图片已存在');
            db.prepare('INSERT INTO files VALUES(?,?,?,?)').run(p,owner,type,data);
            return send(200,{data:{path:p}});
          }
          if (req.method === 'GET' || req.method === 'HEAD') {
            const file = db.prepare('SELECT * FROM files WHERE owner=? AND path=?').get(owner,p);
            if (!file) fail(404,'图片不存在');
            res.writeHead(200,{'Content-Type':file.content_type,'Content-Length':file.data.length});
            return res.end(req.method==='HEAD'?undefined:file.data);
          }
          if (req.method === 'DELETE') { if(imageReferenced(owner,p))fail(409,'照片仍被档案、衣橱或收藏使用，已保留原图');db.prepare('DELETE FROM files WHERE owner=? AND path=?').run(owner,p); return send(200,{data:[]}); }
        }
        if (route === '/api/models' && req.method === 'GET') return send(200,{data:llmConfigured()?[{id:config.LLM_MODEL}]:[]});
        if (route === '/api/chat' && req.method === 'POST') {
          rate('chat:'+owner,6,60000);
          const input = await jsonBody(req,131072);
          if (!Array.isArray(input.messages) || input.messages.length>10 || input.messages.some(m=>!m||!['system','user','assistant'].includes(m.role)||typeof m.content!=='string'||m.content.length>60000)) fail(400,'AI 请求格式不正确');
          if (!llmConfigured()) fail(503,'未配置 AI API，当前使用内置规则搭配');
          let base;try{base=new URL(config.LLM_API_BASE.replace(/\/$/, '')+'/chat/completions');}catch{fail(503,'文字 AI 服务地址配置不正确');}
          if (base.username || base.password || base.protocol !== 'https:' && !['127.0.0.1','localhost','[::1]'].includes(base.hostname)) fail(503,'AI 服务地址需要 HTTPS 且不能包含登录凭证');
          let upstream;try{upstream=await (options.textFetch||fetch)(base,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+config.LLM_API_KEY},body:JSON.stringify({model:config.LLM_MODEL,messages:input.messages,stream:false,temperature:0.8,max_tokens:3500}),signal:AbortSignal.timeout(45000),redirect:'error'});}catch{fail(502,'暂时无法连接文字 AI 服务，请稍后重试');}
          if (!upstream.ok) fail(502,'AI 服务返回错误 '+upstream.status+'，请检查服务端配置');
          let response;try{response=await require('./provider-json.cjs').readJson(upstream);if(typeof response.choices?.[0]?.message?.content!=='string')throw Error('format');}catch{fail(502,'文字 AI 服务返回了不可用内容，请稍后重试');}
          return send(200,{data:response});
        }
        if (route === '/api/backup' && req.method === 'GET') {
          const backup = { format:'outfit-mirror-backup',version:1,exported_at:new Date().toISOString(),tables:{},files:[] };
          db.exec('BEGIN');try{for (const table of collections) backup.tables[table]=db.prepare('SELECT * FROM records WHERE owner=? AND collection=?').all(owner,table).map(rowValue);backup.files=db.prepare('SELECT * FROM files WHERE owner=?').all(owner).map(f=>({path:f.path,type:f.content_type,base64:Buffer.from(f.data).toString('base64')}));db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
          res.setHeader('Content-Disposition','attachment; filename="outfit-backup.json"');
          return send(200,backup);
        }
        if (route === '/api/import' && req.method === 'POST') {
          const input = await jsonBody(req,64*1024*1024);
          if (input.format!=='outfit-mirror-backup' || input.version!==1 || !input.tables || !Array.isArray(input.files)) fail(400,'请选择支持的穿搭魔镜备份文件');
          validation.object(input.tables,'备份数据表');
          const key = digest(JSON.stringify(input));
          if (db.prepare('SELECT 1 FROM imports WHERE owner=? AND digest=?').get(owner,key)) fail(409,'这份备份已经导入过');
          if (collections.some(t=>!Array.isArray(input.tables[t]) || input.tables[t].length>1000) || input.files.length>1000) fail(400,'备份记录格式不正确或数量过多');
          if (db.prepare('SELECT 1 FROM records WHERE owner=? LIMIT 1').get(owner) || db.prepare('SELECT 1 FROM files WHERE owner=? LIMIT 1').get(owner)) fail(409,'为避免覆盖，请将备份导入一个空账号');
          const paths = new Map(), ids = new Map();
          const validatedFiles = [];
          for(const f of input.files){
            if (!f || typeof f!=='object' || typeof f.path!=='string' || f.path.length>1000 || typeof f.base64!=='string' || f.base64.length%4!==0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(f.base64)) fail(400,'备份图片格式不正确');
            const data=Buffer.from(f.base64,'base64');
            if (data.length>8*1024*1024) fail(413,'备份包含过大的图片');
            const type=await verifiedImage(data), p='users/'+owner+'/import/'+crypto.randomUUID();
            if (paths.has(f.path)) fail(400,'备份图片路径重复');
            paths.set(f.path,p);validatedFiles.push({p,type,data});
          }
          const rewrite = value => {
            if (typeof value==='string' && paths.has(value)) return paths.get(value);
            if (Array.isArray(value)) return value.map(rewrite);
            if (value && typeof value==='object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,rewrite(v)]));
            return value;
          };
          const importedPaths = new Set(paths.values());
          const validatedRows = [];
          if (input.tables.profiles.length > 1) fail(400,'一份备份只能包含一个个人档案');
          const oldWardrobeIds=new Set();
          for (const table of collections) for (const old of input.tables[table]) {
            const row = clean(table,rewrite(old));
            validation.required(table,row,{legacy:true});
            if(old.created_at!==undefined&&(typeof old.created_at!=='string'||!Number.isFinite(Date.parse(old.created_at))))fail(400,'备份记录日期不正确');
            if(table==='wardrobe_items'&&old.id!=null){const key=String(old.id);if(oldWardrobeIds.has(key))fail(400,'备份单品编号重复');oldWardrobeIds.add(key);}
            validateImageReferences(table,row,owner,importedPaths);
            validatedRows.push({table,oldId:old.id,created:old.created_at || new Date().toISOString(),row});
          }
          db.exec('BEGIN IMMEDIATE');
          try {
            if(db.prepare('SELECT 1 FROM records WHERE owner=? LIMIT 1').get(owner)||db.prepare('SELECT 1 FROM files WHERE owner=? LIMIT 1').get(owner))fail(409,'账号已写入新数据，为避免覆盖请换用空账号导入');
            if(db.prepare('SELECT 1 FROM imports WHERE owner=? AND digest=?').get(owner,key))fail(409,'这份备份已经导入过');
            for (const f of validatedFiles) db.prepare('INSERT INTO files VALUES(?,?,?,?)').run(f.p,owner,f.type,f.data);
            for (const {table,oldId,created,row} of validatedRows) {
              if (table==='outfits' && Array.isArray(row.payload?.items)) row.payload.items.forEach(i=>{
                if (!i || typeof i !== 'object' || i.id == null) return;
                if (ids.has(String(i.id))) i.id=ids.get(String(i.id));
                else delete i.id; // Retain historical snapshots without reusing an unrelated old record ID.
              });
              const result=db.prepare('INSERT INTO records(owner,collection,payload,created_at) VALUES(?,?,?,?)').run(owner,table,JSON.stringify(row),created);
              if (table==='wardrobe_items') ids.set(String(oldId),Number(result.lastInsertRowid));
            }
            db.prepare('INSERT INTO imports VALUES(?,?)').run(owner,key);
            db.exec('COMMIT');
          } catch(e) {db.exec('ROLLBACK'); throw e;}
          return send(200,{data:{imported:true}});
        }
        fail(404,'接口不存在');
      }
      if (!['GET','HEAD'].includes(req.method)) fail(405,'不支持的请求方式');
      let file;try{file=route==='/'?'index.html':decodeURIComponent(route.slice(1));}catch{fail(400,'网页地址编码不正确');}
      if (!staticFiles.has(file)) fail(404,'页面不存在');
      const data = fs.readFileSync(path.join(__dirname,'public',file));
      res.writeHead(200,{'Content-Type':mime[path.extname(file)]});
      res.end(req.method==='HEAD'?undefined:data);
    } catch(e) {
      if (!res.headersSent) send(e.status || 500,{error:{message:e.status?e.message:'服务暂时出错，请重试'}});
      else res.end();
    }
  });
  server.requestTimeout=60000;
  return {server,db,setPublicHost:(host)=>{
    if(config.PUBLIC_HTTPS_ONLY!=='1'||typeof host!=='string'||host.length>253||!/^([a-z0-9-]+\.)+[a-z]+$/.test(host))throw Error('公开域名配置无效');
    String(config.APP_HOSTS||'').split(',').filter(Boolean).forEach(h=>allowedHosts.delete(h));config.APP_HOSTS=host;allowedHosts.add(host);
  },close:()=>new Promise(resolve=>server.close(()=>{db.close();resolve();}))};
}
if (require.main===module) {
  const app=createApp();
  const host=process.env.HOST || '127.0.0.1', port=process.env.PORT===undefined?8090:Number(process.env.PORT);
  if(!Number.isSafeInteger(port)||port<1||port>65535){console.error('PORT 必须为1–65535之间的整数');app.db.close();process.exitCode=1;}else{
  app.server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'端口 '+port+' 已被占用，请关闭旧服务或更换端口':e.message);app.db.close();process.exitCode=1;});
  app.server.listen(port,host,()=>console.log('穿搭魔镜独立版：http://'+(host==='0.0.0.0'?'127.0.0.1':host)+':'+port));
  let stopping=false;for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{if(stopping)return;stopping=true;app.close().catch(()=>{process.exitCode=1;});});
  }
}
module.exports={createApp};
