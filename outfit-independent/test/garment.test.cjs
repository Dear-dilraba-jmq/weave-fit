const {test}=require('node:test'),assert=require('node:assert/strict');
const sharp=require('sharp');
const {productImage,selectedMask,cleanMask}=require('../garment.cjs');

test('light clothing is preserved by class mask, person and background are excluded, white square output',async()=>{
  const w=200,h=240,pixels=Buffer.alloc(w*h*4);
  for(let i=0;i<w*h;i++)pixels.set([220,210,195,255],i*4);
  const clothing=new Uint8Array(w*h),face=new Uint8Array(w*h);
  for(let y=70;y<210;y++)for(let x=40;x<160;x++){clothing[y*w+x]=255;pixels.set([248,245,225,255],(y*w+x)*4);}
  for(let y=10;y<60;y++)for(let x=80;x<120;x++){face[y*w+x]=255;pixels.set([190,110,80,255],(y*w+x)*4);}
  const source=await sharp(pixels,{raw:{width:w,height:h,channels:4}}).png().toBuffer();
  const result=await productImage(source,'外套',{segment:async image=>{
    assert.equal(image.info.width,w);
    return [{label:'Upper-clothes',mask:{width:w,height:h,data:clothing}},{label:'Face',mask:{width:w,height:h,data:face}}];
  }});
  const out=await sharp(result.buffer).raw().toBuffer({resolveWithObject:true});
  assert.equal(out.info.width,1080);assert.equal(out.info.height,1080);
  assert.deepEqual([...out.data.subarray(0,3)],[255,255,255]);
  const center=(540*1080+540)*out.info.channels;
  assert.deepEqual([...out.data.subarray(center,center+3)],[248,245,225]);
  assert.equal(result.mode,'garment');
});
test('missing garment class fails explicitly instead of saving a damaged mask',()=>{
  assert.throws(()=>selectedMask([{label:'Face',mask:{width:10,height:10,data:new Uint8Array(100).fill(255)}}],'上装',10,10),/未识别/);
});
test('category filter keeps both shoes but not face or shirt',()=>{
  const layer=label=>({label,mask:{width:10,height:10,data:new Uint8Array(100).fill(255)}});
  assert.equal(selectedMask([layer('Face'),layer('Upper-clothes'),layer('Left-shoe'),layer('Right-shoe')],'鞋履',10,10).count,100);
});
test('standalone jacket can span shirt and dress classes without being erased',()=>{
  const shirt=new Uint8Array(100),dress=new Uint8Array(100);
  shirt.fill(255,0,50);dress.fill(255,50);
  const result=selectedMask([{label:'Upper-clothes',mask:{width:10,height:10,data:shirt}},{label:'Dress',mask:{width:10,height:10,data:dress}}],'外套',10,10);
  assert.equal(result.hasPerson,false);assert.equal(result.count,100);
});

test('standalone shoes and bags never merge unrelated shirts or skirts',()=>{
 const layer=(label,start,end)=>{const data=new Uint8Array(400);data.fill(255,start,end);return {label,mask:{width:20,height:20,data}};};
 const segments=[layer('Upper-clothes',0,200),layer('Left-shoe',200,250),layer('Right-shoe',250,300),layer('Bag',300,400)];
 assert.equal(selectedMask(segments,'鞋履',20,20).count,100);assert.equal(selectedMask(segments,'包袋',20,20).count,100);
 assert.throws(()=>selectedMask([{label:'Bag',mask:{width:20,height:20,data:new Uint8Array(2)}}],'包袋',20,20),{status:422});
});
test('large amounts of isolated segmentation noise are removed without a spread-argument overflow',()=>{
 const w=600,h=600,mask=new Uint8Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++)if((x+y)%2===0)mask[y*w+x]=255;
 assert.equal(cleanMask(mask,w,h).some(Boolean),false);
});
test('an already clean white product image keeps a cuff that the parser misclassified as background',async()=>{
 const w=200,h=240,pixels=Buffer.alloc(w*h*4,255),clothing=new Uint8Array(w*h),background=new Uint8Array(w*h).fill(255);
 for(let y=50;y<210;y++)for(let x=40;x<160;x++){const i=y*w+x;pixels.set([240,235,220,255],i*4);clothing[i]=255;background[i]=0;}
 for(let y=190;y<210;y++)for(let x=140;x<160;x++){const i=y*w+x;pixels.set([100,120,160,255],i*4);clothing[i]=0;background[i]=255;}
 const input=await sharp(pixels,{raw:{width:w,height:h,channels:4}}).png().toBuffer();
 const result=await productImage(input,'外套',{segment:async()=>[{label:'Upper-clothes',mask:{width:w,height:h,data:clothing}},{label:'Background',mask:{width:w,height:h,data:background}}]});
 assert.equal(result.preservedWhiteBackground,true);
 const out=await sharp(result.buffer).raw().toBuffer({resolveWithObject:true}),point=(918*1080+810)*out.info.channels;
 assert.deepEqual([...out.data.subarray(point,point+3)],[100,120,160]);
});
