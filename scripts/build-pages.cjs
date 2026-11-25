'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),destination=path.join(root,'docs');
const files=['index.html','homepage/home.css','homepage/home.js',...['icon.svg','look-reference.js','reference-cream-knit-v1.png','reference-light-blue-jeans-v1.png','reference-white-sneakers-v1.png'].map(n=>'outfit-independent/public/'+n)];
for(const file of files){const from=path.join(root,file),to=path.join(destination,file);if(!fs.statSync(from).isFile())throw Error('Missing homepage asset: '+file);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to);}
fs.writeFileSync(path.join(destination,'.nojekyll'),'');
console.log('Prepared GitHub Pages in docs/: '+files.length+' public homepage files, no private data.');
