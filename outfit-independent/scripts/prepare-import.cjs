// Usage: node scripts/prepare-import.cjs <single-user-export-dir> <output.json>
// Expected: profiles.json, wardrobe_items.json, outfits.json, images/<original storage path>.
const fs=require('node:fs'),path=require('node:path');
const [source,output]=process.argv.slice(2);
if(!source||!output){console.error('用法：node scripts/prepare-import.cjs <单账号导出目录> <备份输出.json>');process.exit(1);}
try{
  const root=path.resolve(source), imageRoot=path.join(root,'images');
  const tables={}, paths=new Set(), owners=new Set();
  const collect=value=>{if(!value||typeof value!=='object')return;for(const [k,v]of Object.entries(value)){if(['face_photo_path','image_path','original_path','lookImage','tryonImage'].includes(k)&&typeof v==='string'&&v)paths.add(v);else if(v&&typeof v==='object')collect(v);}};
  for(const table of ['profiles','wardrobe_items','outfits']){
    const value=JSON.parse(fs.readFileSync(path.join(root,table+'.json'),'utf8'));
    const rows=Array.isArray(value)?value:value.data;
    if(!Array.isArray(rows))throw new Error(table+' 必须是记录数组');
    for(const row of rows){if(row.owner_id)owners.add(String(row.owner_id));if(typeof row.payload==='string')row.payload=JSON.parse(row.payload);collect(row);}
    tables[table]=rows;
  }
  if(owners.size>1)throw new Error('导出包含多个账号，请按 owner_id 分开后转换');
  if(tables.profiles.length>1)throw new Error('每个备份只能包含一份个人档案');
  const files=[...paths].map(p=>{
    if(/^https?:/i.test(p))throw new Error('需要原始存储路径和原图，不接受临时签名图片网址');
    const file=path.resolve(imageRoot,p);
    if(!file.startsWith(imageRoot+path.sep))throw new Error('图片路径超出导出目录');
    return {path:p,base64:fs.readFileSync(file).toString('base64')};
  });
  fs.writeFileSync(path.resolve(output),JSON.stringify({format:'outfit-mirror-backup',version:1,exported_at:new Date().toISOString(),tables,files}),{flag:'wx'});
  console.log('已转换 '+files.length+' 张图片及单账号档案/衣橱/收藏；可在独立版空账号导入。');
}catch(e){console.error(e.message);process.exitCode=1;}
