'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),destination=path.join(root,'docs');
// 主页照片随主页一起发布，页面不依赖外部图床：示例衣橱 item-*.jpg，人物形象照 look-*.webp，拼贴单品 piece-*.webp，登录 / 注册页背景 auth-*.webp。
const photos=fs.readdirSync(path.join(root,'homepage/photos')).filter(n=>/\.(jpg|webp)$/i.test(n)).sort().map(n=>'homepage/photos/'+n);
// 网页版：主页、登录 / 注册页、本机账号与数据（store.js）、自动识别（recognize.js + 预先算好的款式向量），以及和完整 App 共用的搭配规则与识别规则。
const files=['index.html','login.html','register.html','download.html',
  ...['home.css','home.js','download.css','download.js','store.js','account.js','recognize.js','clip-type-vectors.json'].map(n=>'homepage/'+n),
  ...photos,
  ...['icon.svg','style-guide.js','outfit-plan.js','garment-rules.js'].map(n=>'outfit-independent/public/'+n)];
for(const file of files)if(!fs.statSync(path.join(root,file),{throwIfNoEntry:false})?.isFile())throw Error('Missing homepage asset: '+file);
// docs/homepage 与 docs/outfit-independent 只由本脚本生成：先清空再复制，主页不再使用的旧文件不会留在发布目录；docs/ 下的其他文件保持不变。
for(const dir of ['homepage','outfit-independent'])fs.rmSync(path.join(destination,dir),{recursive:true,force:true});
for(const file of files){const to=path.join(destination,file);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(path.join(root,file),to);}
fs.writeFileSync(path.join(destination,'.nojekyll'),'');
console.log('Prepared GitHub Pages in docs/: '+files.length+' public homepage files, no private data.');
