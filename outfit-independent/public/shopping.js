/* Real Taobao product cards. Generated style illustrations are never product photos. */
(function(){
  'use strict';
  var cache=new WeakMap();
  function fetchCurrent(url,options){return window.OutfitBackend?window.OutfitBackend.fetch(url,options):window.fetch(url,options);}
  var esc=function(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
  function searchUrl(keyword){return 'https://s.taobao.com/search?q='+encodeURIComponent(String(keyword||'').trim().slice(0,160));}
  function webSearch(entry){return '<div class="shopping-web"><a class="btn-primary shopping-search" href="'+esc(searchUrl(entry.keyword))+'" target="_blank" rel="noopener noreferrer">去淘宝搜索这款 ↗</a><p class="product-caption">打开淘宝搜索结果，在淘宝查看实拍、价格和详情。该入口不是某一件商品的购买链接，淘宝可能要求登录或验证。</p></div>';}
  function cards(data){
    if(!data.products.length)return '<p class="shopping-message">暂未找到带图片和购买链接的匹配商品，可以换一组款式关键词后重试。</p>';
    return '<div class="product-grid">'+data.products.map(function(p){
      return '<a class="product-card" href="'+esc(p.url)+'" target="_blank" rel="noopener noreferrer sponsored">'+
        '<div class="product-photo"><img src="'+esc(p.image)+'" alt="'+esc(p.title)+'" loading="lazy" referrerpolicy="no-referrer"></div>'+
        '<div class="product-body"><span class="product-platform">'+esc(p.platform)+' · 待购</span><b>'+esc(p.title)+'</b><span class="product-shop">'+esc(p.shop)+'</span>'+
        '<span class="product-price">'+(p.price?'¥'+esc(p.price):'价格见商品页')+'</span><span class="product-go">查看商品 ↗</span></div></a>';
    }).join('')+'</div><p class="product-caption">淘宝联盟商品推广链接 · 查询于 '+esc(new Date(data.checkedAt).toLocaleString('zh-CN'))+'。价格、颜色尺码和库存以商品页为准；与人像效果图可能存在差异。</p>';
  }
  async function load(slot,entry){
    slot.innerHTML=webSearch(entry)+'<p class="shopping-message" role="status">正在检查应用内商品卡…</p>';
    try{
      if(!entry.promise)entry.promise=(async function(){
        var status=await fetchCurrent('/api/shopping/status');if(!status.ok)throw new Error('商品服务状态读取失败，请重新登录或稍后重试');
        var cfg=await status.json();if(!cfg.configured)return {configured:false};
        var response=await fetchCurrent('/api/shopping/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({keyword:entry.keyword})});
        var result=await response.json();if(!response.ok)throw new Error(result.error&&result.error.message||'商品查询失败');return result.data;
      })();
      var data=await entry.promise;if(slot.isConnected){
        if(data.configured===false){slot.innerHTML=webSearch(entry)+'<p class="shopping-message" role="status">应用内真实商品卡尚未配置，可直接用上方淘宝网页搜索选购。</p><details><summary>可选：自动获取商品卡</summary><a class="shopping-connect-link" href="taobao-connect.html" target="_blank" rel="noopener">查看官方接口接入说明</a><button type="button" class="btn-ghost shopping-retry">重新检查商品卡</button></details>';slot.querySelector('button').onclick=function(){entry.promise=null;load(slot,entry);};}
        else{slot.innerHTML=webSearch(entry)+cards(data);bindImages(slot);}
        var details=slot.closest('details');if(details)details.open=true;
      }
    }catch(e){
      if(!slot.isConnected)return;
      slot.innerHTML=webSearch(entry)+'<p class="shopping-message" role="status">应用内商品卡暂不可用：'+esc(e.message)+'</p><button type="button" class="btn-ghost shopping-retry">重试商品卡查询</button>';
      slot.querySelector('button').onclick=function(){entry.promise=null;load(slot,entry);};
    }
  }
  function bindImages(slot){slot.querySelectorAll('img').forEach(function(img){img.onerror=function(){var text=document.createElement('span');text.textContent='商品图片暂不可用';img.replaceWith(text);};});}
  window.OutfitShopping={searchUrl:searchUrl,mount:function(root,plan){
    var entries=cache.get(plan);if(!entries){entries=[];cache.set(plan,entries);}
    root.querySelectorAll('[data-shopping-gap]').forEach(function(slot){
      var i=Number(slot.dataset.shoppingGap),gap=plan.gaps[i];if(!gap)return;
      var name=String(gap.name||'').trim(),given=String(gap.keyword||'').replace(/参考图风格/g,'').trim();
      var keyword=(given.includes(name)?given:[name,given].filter(Boolean).join(' ')).trim().slice(0,100);
      if(!entries[i]||entries[i].keyword!==keyword)entries[i]={keyword:keyword,promise:null};
      load(slot,entries[i]);
    });
  }};
})();
