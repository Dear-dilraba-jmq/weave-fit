'use strict';
const fields={
  profiles:['nickname','gender','height_cm','weight_kg','body_shape','skin_tone','hair_color','style_prefs','full_body_photo_path','face_photo_path','owner_name','updated_at'],
  wardrobe_items:['name','category','color','season','tags','image_path','cutout','original_path','note','owner_name'],
  outfits:['title','style','occasion','payload','owner_name']
};
const categories=['上装','下装','外套','连衣裙','鞋履','包袋','配饰','其他'];
function fail(status,message){throw Object.assign(new Error(message),{status});}
function object(value,label='数据'){if(!value||typeof value!=='object'||Array.isArray(value))fail(400,label+'必须是对象');return value;}
function string(value,label,max,{nullable=false}={}){if(nullable&&value===null)return;if(typeof value!=='string'||value.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value))fail(400,label+'需为最多 '+max+' 字的文字');}
function number(value,label,min,max,nullable=false){if(nullable&&value===null)return;if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)fail(400,label+'需在 '+min+'–'+max+' 范围内');}
function strings(value,label,max=10,itemMax=40){if(!Array.isArray(value)||value.length>max)fail(400,label+'需为不超过 '+max+' 项的列表');value.forEach(v=>string(v,label,itemMax));}
function boundedJson(value){
  const stack=[{value,depth:0}];let nodes=0;
  while(stack.length){const {value:v,depth}=stack.pop();if(++nodes>5000||depth>16)fail(400,'搭配内容过于复杂');if(typeof v==='string'&&v.length>5000)fail(400,'搭配文字过长');if(v&&typeof v==='object'){const values=Object.values(v);if(values.length>200)fail(400,'搭配内容项目过多');for(const x of values)stack.push({value:x,depth:depth+1});}}
  if(Buffer.byteLength(JSON.stringify(value))>262144)fail(400,'搭配内容过大');
}
function structure(value){const stack=[{value,depth:0}];let count=0;while(stack.length){const {value:v,depth}=stack.pop();if(++count>100000||depth>32)fail(400,'请求内容过于复杂');if(v&&typeof v==='object')for(const x of Object.values(v))stack.push({value:x,depth:depth+1});}}
function clean(table,row){
  object(row);const result=Object.fromEntries(fields[table].filter(k=>Object.hasOwn(row,k)).map(k=>[k,row[k]]));
  const limits={nickname:24,gender:20,body_shape:40,skin_tone:40,hair_color:40,name:80,category:20,color:40,season:20,note:500,title:80,style:40,occasion:80,owner_name:80,updated_at:40};
  for(const [key,max] of Object.entries(limits))if(Object.hasOwn(result,key))string(result[key],key,max,{nullable:key==='owner_name'});
  for(const key of ['image_path','original_path','full_body_photo_path','face_photo_path'])if(Object.hasOwn(result,key))string(result[key],key,350,{nullable:true});
  if(Object.hasOwn(result,'height_cm'))number(result.height_cm,'身高',120,220,true);
  if(Object.hasOwn(result,'weight_kg'))number(result.weight_kg,'体重',30,180,true);
  for(const key of ['style_prefs','tags'])if(Object.hasOwn(result,key))strings(result[key],key);
  if(Object.hasOwn(result,'category')&&!categories.includes(result.category))fail(400,'衣物类别不正确');
  if(Object.hasOwn(result,'cutout')&&typeof result.cutout!=='boolean')fail(400,'单品图标记必须为布尔值');
  if(Object.hasOwn(result,'payload')){
    object(result.payload,'搭配内容');boundedJson(result.payload);
    for(const key of ['items','gaps','tips','warnings'])if(Object.hasOwn(result.payload,key)&&!Array.isArray(result.payload[key]))fail(400,key+'必须是列表');
    for(const key of ['items','gaps'])if(result.payload[key]&&(result.payload[key].length>20||result.payload[key].some(i=>!i||typeof i!=='object'||Array.isArray(i))))fail(400,'搭配单品格式不正确');
  }
  return result;
}
function planInput(input){
  object(input,'搭配请求');const result={style:'极简',occasion:'日常通勤',season:'',temperature:22,weather:'晴',extra:'',selectedIds:[],variant:0};
  for(const [key,max]of Object.entries({style:40,occasion:80,season:20,weather:30,extra:200}))if(Object.hasOwn(input,key)){string(input[key],key,max);result[key]=input[key];}
  if(!['','春季','夏季','秋季','冬季'].includes(result.season))fail(400,'穿搭季节不正确');
  if(Object.hasOwn(input,'temperature')){number(input.temperature,'温度',-10,40);result.temperature=input.temperature;}
  if(Object.hasOwn(input,'variant')){number(input.variant,'搭配序号',0,1000000);if(!Number.isInteger(input.variant))fail(400,'搭配序号需为整数');result.variant=input.variant;}
  if(Object.hasOwn(input,'selectedIds')){if(!Array.isArray(input.selectedIds)||input.selectedIds.length>20||input.selectedIds.some(i=>!Number.isSafeInteger(i)||i<1))fail(400,'预选单品编号不正确');result.selectedIds=[...new Set(input.selectedIds)];}
  return result;
}
function required(table,row,{legacy=false}={}){
  if(table==='wardrobe_items'){
    if(typeof row.name!=='string'||!row.name.trim())fail(400,'请填写单品名称');row.name=row.name.trim();
    if(legacy&&row.category===undefined)row.category='其他';
    if(!categories.includes(row.category))fail(400,'请选择单品类别');
  }
  if(table==='outfits'){
    if(legacy&&row.title===undefined)row.title=typeof row.payload?.title==='string'&&row.payload.title.trim()?row.payload.title.trim().slice(0,80):'导入的搭配';
    if(typeof row.title!=='string'||!row.title.trim())fail(400,'搭配名称不能为空');row.title=row.title.trim();object(row.payload,'搭配内容');
  }
  return row;
}
module.exports={fields,categories,fail,object,string,number,strings,clean,planInput,structure,required};
