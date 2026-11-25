(function(){
  'use strict';
  var status=document.getElementById('connectionStatus'),button=document.getElementById('testProducts');
  async function check(){
    button.disabled=true;
    var session=await window.OutfitBackend.auth.getSession();
    if(session.error||!session.data){status.textContent='请先登录穿搭魔镜，再检查本机商品连接。淘宝联盟入口和申请步骤可直接查看。';return;}
    try{
      var r=await window.OutfitBackend.fetch('/api/shopping/status');if(!r.ok)throw Error('读取连接状态失败');
      var config=await r.json();
      status.textContent=config.configured?'本机已配置淘宝应用凭证，尚需查询真实商品验证权限和网络。':'尚未连接：本机未完整配置淘宝应用凭证和推广位，暂时不能自动获取真实商品。';
      button.disabled=!config.configured;
    }catch(e){status.textContent=e.message;}
  }
  document.getElementById('recheck').onclick=check;
  button.onclick=function(){
    var keyword=document.getElementById('testKeyword').value.trim();if(!keyword){status.textContent='请输入商品关键词';return;}
    var root=document.getElementById('productTest');root.innerHTML='<div data-shopping-gap="0"></div>';
    window.OutfitShopping.mount(root,{gaps:[{name:keyword,keyword:keyword}]});
  };
  window.OutfitBackend.auth.onAuthStateChange(function(){button.disabled=true;document.getElementById('productTest').innerHTML='';status.textContent='账号已变化，请重新登录后检查连接。';});
  check();
})();
