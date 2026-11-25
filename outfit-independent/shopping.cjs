'use strict';
// Official TOP API: https://developer.alibaba.com/docs/api.htm?apiId=64759
const crypto=require('node:crypto');
const error=(status,message)=>Object.assign(new Error(message),{status});
function configured(env={}){return !!(env.TAOBAO_APP_KEY&&env.TAOBAO_APP_SECRET&&/^\d+$/.test(env.TAOBAO_ADZONE_ID||''));}
function sign(params,secret){
  const text=Object.keys(params).filter(k=>k!=='sign').sort().map(k=>k+params[k]).join('');
  return crypto.createHash('md5').update(secret+text+secret,'utf8').digest('hex').toUpperCase();
}
function safeUrl(value,kind){
  if(typeof value!=='string'||value.length>8192)return null;
  try{
    const u=new URL(value.startsWith('//')?'https:'+value:value);
    if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.port)return null;
    const h=u.hostname.toLowerCase();
    if(kind==='image'){
      if(!(h==='alicdn.com'||h.endsWith('.alicdn.com')||h==='taobaocdn.com'||h.endsWith('.taobaocdn.com')))return null;
    }else if(!((h==='item.taobao.com'&&u.pathname==='/item.htm'&&u.searchParams.get('id')?.trim())||
      (h==='detail.tmall.com'&&u.pathname==='/item.htm'&&u.searchParams.get('id')?.trim())||
      (h==='s.click.taobao.com'&&u.pathname!=='/')||
      (h==='uland.taobao.com'&&u.pathname.startsWith('/coupon/'))))return null;
    u.protocol='https:';return u.href;
  }catch{return null;}
}
function productsFrom(data){
  const rows=data?.tbk_dg_material_optional_upgrade_response?.result_list?.map_data;
  if(rows===undefined)return [];
  if(!Array.isArray(rows))throw error(502,'淘宝商品数据格式异常，请稍后重试');
  const seen=new Set(),products=[];
  for(const r of rows){
    if(!r||typeof r!=='object'||Array.isArray(r))continue;
    const b=r.item_basic_info||{},p=r.price_promotion_info||{};
    const url=safeUrl(r.publish_info?.click_url,'product'),image=safeUrl(b.pict_url,'image');
    const title=typeof b.title==='string'?b.title.trim().slice(0,200):'';
    if(!url||!image||!title||seen.has(String(r.item_id||url)))continue;
    seen.add(String(r.item_id||url));
    // Display the ordinary sale price, without assuming coupon/quantity eligibility.
    const price=/^\d+(\.\d{1,2})?$/.test(String(p.zk_final_price))?Number(p.zk_final_price).toFixed(2):null;
    products.push({id:String(r.item_id||url),title,image,url,price,shop:String(b.shop_title||'').slice(0,100),platform:Number(b.user_type)===1?'天猫':'淘宝',affiliate:true});
    if(products.length===3)break;
  }
  return products;
}
async function search({env,input,fetchImpl=fetch,now=new Date()}){
  const keyword=typeof input?.keyword==='string'?input.keyword.trim():'';
  if(!keyword||keyword.length>100||/[\x00-\x1f]/.test(keyword))throw error(400,'请提供有效的单品关键词（最多 100 字）');
  if(!configured(env))throw error(503,'淘宝商品源尚未配置，暂时无法展示真实商品图片和购买链接');
  const params={method:'taobao.tbk.dg.material.optional.upgrade',app_key:env.TAOBAO_APP_KEY,adzone_id:env.TAOBAO_ADZONE_ID,
    timestamp:new Date(now.getTime()+8*3600000).toISOString().slice(0,19).replace('T',' '),format:'json',v:'2.0',sign_method:'md5',q:keyword,page_size:'20',page_no:'1',biz_scene_id:'1',sort:'match_des'};
  params.sign=sign(params,env.TAOBAO_APP_SECRET);
  let data;
  try{
    const res=await fetchImpl('https://eco.taobao.com/router/rest',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=utf-8'},body:new URLSearchParams(params),signal:AbortSignal.timeout(15000),redirect:'error'});
    if(!res.ok)throw new Error('upstream');
    data=await res.json();
  }catch{throw error(502,'淘宝商品服务暂时无法连接，请稍后重试');}
  if(data?.error_response)throw error(502,'淘宝商品查询未获授权或暂时不可用，请检查应用的物料搜索权限');
  if(!data?.tbk_dg_material_optional_upgrade_response)throw error(502,'淘宝商品数据格式异常，请稍后重试');
  return {keyword,products:productsFrom(data),checkedAt:now.toISOString(),source:'taobao-top'};
}
module.exports={configured,sign,safeUrl,productsFrom,search};
