'use strict';
// Bound provider responses while streaming, rather than after allocating an unlimited string.
async function readJson(response,maxBytes=1024*1024){
  const announced=Number(response.headers?.get('content-length'));
  if(Number.isFinite(announced)&&announced>maxBytes)throw Error('Provider response too large');
  if(!response.body?.getReader){const text=await response.text();if(Buffer.byteLength(text)>maxBytes)throw Error('Provider response too large');return JSON.parse(text);}
  const reader=response.body.getReader(),chunks=[];let total=0;
  try{
    while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>maxBytes){await reader.cancel();throw Error('Provider response too large');}chunks.push(Buffer.from(value));}
    return JSON.parse(Buffer.concat(chunks,total).toString('utf8'));
  }finally{reader.releaseLock();}
}
module.exports={readJson};
