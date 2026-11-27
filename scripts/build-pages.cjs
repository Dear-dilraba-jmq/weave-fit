'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),destination=path.join(root,'docs');
// 示例衣橱照片（homepage/photos/*.jpg）随主页一起发布，页面不依赖外部图床。
const photos=fs.readdirSync(path.join(root,'homepage/photos')).filter(n=>/\.jpg$/i.test(n)).sort().map(n=>'homepage/photos/'+n);
const files=['index.html','homepage/home.css','homepage/home.js',...photos,...['icon.svg','style-guide.js','outfit-plan.js'].map(n=>'outfit-independent/public/'+n)];
for(const file of files)if(!fs.statSync(path.join(root,file),{throwIfNoEntry:false})?.isFile())throw Error('Missing homepage asset: '+file);
// docs/homepage 与 docs/outfit-independent 只由本脚本生成：先清空再复制，主页不再使用的旧文件不会留在发布目录；docs/ 下的其他文件保持不变。
for(const dir of ['homepage','outfit-independent'])fs.rmSync(path.join(destination,dir),{recursive:true,force:true});
for(const file of files){const to=path.join(destination,file);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(path.join(root,file),to);}
fs.writeFileSync(path.join(destination,'.nojekyll'),'');
console.log('Prepared GitHub Pages in docs/: '+files.length+' public homepage files, no private data.');
