// Downloads model weights only; never sends images. Pinned upstream revision.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const repo='Xenova/segformer_b2_clothes',revision='cb6ac44e641faa309f29561c1afe08d87ef52631';
const root=path.join(__dirname,'../models',repo);
const checksums={
  'config.json':'afe72a34cd87509e2118f4c2ba99afc1c9ba807f852d77676b5437c11bfccdec',
  'preprocessor_config.json':'e5a25d8fc054bf780be930e161b47d188bec1b0bf0a44fd5fdfb3f3312c0be0b',
  'onnx/model_quantized.onnx':'2b18fbdd196a7ee12702c2fceaa6f812fe70d1154573a43bd62667b9157ee48d'
};
(async()=>{
  const files=['config.json','preprocessor_config.json','onnx/model_quantized.onnx'];
  for(const file of files){
    const target=path.join(root,file);if(fs.existsSync(target)){
      if(crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex')!==checksums[file])throw new Error('Existing model checksum mismatch: '+file);
      console.log('Verified: '+file);continue;
    }
    fs.mkdirSync(path.dirname(target),{recursive:true});
    console.log('Downloading '+file);
    const r=await fetch('https://huggingface.co/'+repo+'/resolve/'+revision+'/'+file,{signal:AbortSignal.timeout(180000)});
    if(!r.ok)throw new Error('Model download HTTP '+r.status);
    const data=Buffer.from(await r.arrayBuffer());
    if(crypto.createHash('sha256').update(data).digest('hex')!==checksums[file])throw new Error('Model checksum mismatch: '+file);
    if(file.endsWith('.json'))JSON.parse(data.toString());
    else if(data.length<20*1024*1024)throw new Error('Model file is incomplete');
    fs.writeFileSync(target+'.part',data);fs.renameSync(target+'.part',target);
    console.log(file+': '+data.length+' bytes SHA256 '+crypto.createHash('sha256').update(data).digest('hex'));
  }
  console.log('Local garment model ready.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
