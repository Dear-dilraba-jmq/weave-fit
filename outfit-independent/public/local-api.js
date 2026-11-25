/* Same-origin client: every private request belongs to one account generation. */
(function () {
  'use strict';
  var nativeFetch=window.fetch.bind(window),owner=null,generation=0,controllers=new Set(),listeners=[];
  var channel=null,signalKey='outfit-account-change-v1';
  function accountError(message,code,status){var e=new Error(message);e.code=code||'ACCOUNT_CHANGED';e.status=status||409;return e;}
  function snapshot(){return {owner:owner,generation:generation};}
  function stale(context){return context.generation!==generation;}
  function check(context){if(stale(context))throw accountError('账号已切换，已取消上一账号的操作','ACCOUNT_CHANGED');}
  function notify(event){listeners.slice().forEach(function(fn){try{fn(event);}catch(e){/* A subscriber cannot block account invalidation. */}});}
  function invalidate(event){
    generation++;owner=null;
    controllers.forEach(function(controller){controller.abort();});controllers.clear();
    if(event)notify(event);
  }
  function broadcast(){
    var signal={type:'changed',nonce:Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)};
    try{if(channel)channel.postMessage(signal);else window.localStorage.setItem(signalKey,JSON.stringify(signal));}catch(e){/* Private browsing may disable both transports. */}
  }
  function externalChange(){invalidate('SESSION_CHANGED');}
  try{
    if(typeof window.BroadcastChannel==='function'){
      channel=new window.BroadcastChannel(signalKey);channel.onmessage=function(event){if(event.data&&event.data.type==='changed')externalChange();};
    }else window.addEventListener('storage',function(event){if(event.key===signalKey&&event.newValue)externalChange();});
  }catch(e){window.addEventListener('storage',function(event){if(event.key===signalKey&&event.newValue)externalChange();});}
  function errorResult(e){return {data:null,error:{message:e.message||'请求失败',code:e.code,status:e.status}};}
  function headersWithOwner(headers,expected){
    var result={};
    if(headers&&typeof headers.forEach==='function')headers.forEach(function(value,key){result[key]=value;});
    else if(Array.isArray(headers))headers.forEach(function(pair){result[pair[0]]=pair[1];});
    else Object.assign(result,headers||{});
    Object.keys(result).forEach(function(key){if(key.toLowerCase()==='x-outfit-owner')delete result[key];});
    if(expected)result['X-Outfit-Owner']=expected;
    return result;
  }
  async function fetchOwned(url,options,context,expectedOwner){
    context=context||snapshot();check(context);
    if(window.location.protocol==='file:')throw accountError('当前直接打开了网页文件，请通过「启动独立版.cmd」进入。','FILE_ENTRY',0);
    var target=new URL(url,window.location.href);
    if(target.origin!==window.location.origin)throw accountError('账号资料只能向本站发送','INVALID_ORIGIN',400);
    var auth=/^\/api\/auth\/(session|login|register|logout|password)$/.test(target.pathname);
    var privateApi=target.pathname.startsWith('/api/')&&!auth&&target.pathname!=='/api/health';
    var expected=expectedOwner===undefined?context.owner:expectedOwner;
    if(privateApi&&!expected)throw accountError('请先登录当前账号','AUTH_REQUIRED',401);
    var controller=new AbortController(),external=options&&options.signal;
    var aborted=function(){controller.abort();};
    if(external){if(external.aborted)controller.abort();else external.addEventListener('abort',aborted,{once:true});}
    controllers.add(controller);
    function cleanup(){controllers.delete(controller);if(external)external.removeEventListener('abort',aborted);}
    try{
      var settings=Object.assign({},options||{},{credentials:'same-origin',headers:headersWithOwner(options&&options.headers,expected),signal:controller.signal});
      var response=await nativeFetch(target.href,settings);check(context);
      if(response.status===409&&response.headers.get('X-Outfit-Account-Mismatch')==='1'){
        invalidate('SESSION_CHANGED');throw accountError('账号已在其他页面切换，请重新登录','ACCOUNT_CHANGED',409);
      }
      if(privateApi&&response.status===401){invalidate('SIGNED_OUT');throw accountError('登录状态已失效，请重新登录','AUTH_REQUIRED',401);}
      // Keep a native Response, but reject body reads that finish after an account change.
      ['json','blob','text','arrayBuffer','formData'].forEach(function(method){
        if(typeof response[method]!=='function')return;
        var original=response[method].bind(response);
        response[method]=async function(){
          try{check(context);var value=await original();check(context);return value;}
          finally{cleanup();}
        };
      });
      return response;
    }catch(e){cleanup();if(stale(context)&&!e.code)throw accountError('账号已切换，已取消上一账号的操作','ACCOUNT_CHANGED');throw e;}
  }
  async function request(url,options,context,expectedOwner){
    context=context||snapshot();
    try{
      var response=await fetchOwned(url,options,context,expectedOwner),value=await response.json();check(context);
      return response.ok?value:{data:null,error:value.error||{message:'请求失败：'+response.status,status:response.status}};
    }catch(e){
      if(stale(context)&&!e.code)e=accountError('账号已切换，已取消上一账号的操作','ACCOUNT_CHANGED');
      if(!e.code)e=accountError('连接不到独立版服务。请在电脑上双击「启动独立版.cmd」，启动后刷新此页面；手机请使用电脑显示的同一 Wi-Fi 地址。','CONNECTION_FAILED',0);
      return errorResult(e);
    }
  }
  function post(url,data,context,expectedOwner){return request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)},context,expectedOwner);}
  async function getSession(){
    var context=snapshot(),r=await request('/api/auth/session',null,context);
    if(r.error)return r;
    if(stale(context))return errorResult(accountError('账号已切换，请重新登录'));
    var next=r.data&&r.data.user&&r.data.user.id||null;
    if(context.owner&&next!==context.owner){
      invalidate(next?'SESSION_CHANGED':'SIGNED_OUT');owner=next;
      return next?errorResult(accountError('账号已在其他页面切换，请重新登录')):r;
    }
    owner=next;return r;
  }
  async function signIn(username,password,register){
    invalidate();var context=snapshot();
    var r=await post('/api/auth/'+(register?'register':'login'),{username:username,password:password},context);
    if(r.error)return r;
    if(stale(context))return errorResult(accountError('账号已切换，请重新登录'));
    if(!r.data||!r.data.user||!r.data.user.id)return errorResult(accountError('登录结果无效，请重试','INVALID_SESSION',500));
    owner=r.data.user.id;broadcast();return r;
  }
  async function signOut(){
    var previousOwner=owner;invalidate('SIGNED_OUT');broadcast();
    if(!previousOwner)return {data:null};
    return post('/api/auth/logout',{},snapshot(),previousOwner);
  }
  async function changePassword(currentPassword,newPassword){
    var r=await post('/api/auth/password',{currentPassword:currentPassword,newPassword:newPassword});
    if(!r.error){invalidate('SIGNED_OUT');broadcast();}
    return r;
  }
  function Query(table){this.query={table:table,mode:'select'};this.context=snapshot();}
  Query.prototype.select=function(){return this;};
  Query.prototype.order=function(){return this;};
  Query.prototype.limit=function(n){this.query.limit=n;return this;};
  Query.prototype.eq=function(key,value){if(key!=='id')throw new Error('不支持此筛选');this.query.id=value;return this;};
  Query.prototype.maybeSingle=function(){this.query.single=true;return this;};
  ['insert','update'].forEach(function(mode){Query.prototype[mode]=function(row){this.query.mode=mode;this.query.row=row;return this;};});
  Query.prototype.delete=function(){this.query.mode='delete';return this;};
  Query.prototype.then=function(resolve,reject){return post('/api/records',this.query,this.context).then(resolve,reject);};
  function signedPath(path,context){
    check(context);
    if(!context.owner||typeof path!=='string'||!path.startsWith('users/'+context.owner+'/'))throw accountError('图片不属于当前账号','INVALID_OWNER',403);
    return '/api/files?path='+encodeURIComponent(path);
  }
  var cloud={
    fetch:function(url,options){return fetchOwned(url,options,snapshot());},
    auth:{
      getSession:getSession,signIn:signIn,signOut:signOut,changePassword:changePassword,
      onAuthStateChange:function(fn){listeners.push(fn);var unsubscribe=function(){var i=listeners.indexOf(fn);if(i>=0)listeners.splice(i,1);};unsubscribe.unsubscribe=unsubscribe;return unsubscribe;}
    },
    database:{from:function(table){return new Query(table);}},
    storage:{
      userPath:function(owner,p){return 'users/'+owner+'/'+p;},
      upload:function(p,file,opts){return request('/api/files?path='+encodeURIComponent(p),{method:'PUT',headers:{'Content-Type':opts.contentType},body:file});},
      createSignedUrl:async function(p){try{return {data:{signedUrl:signedPath(p,snapshot())}};}catch(e){return errorResult(e);}},
      createSignedUrls:async function(ps){var context=snapshot();try{return {data:ps.map(function(p){return {path:p,signedUrl:signedPath(p,context)};})};}catch(e){return errorResult(e);}},
      remove:function(ps){var context=snapshot();return Promise.all(ps.map(function(p){return request('/api/files?path='+encodeURIComponent(p),{method:'DELETE'},context);}));}
    },
    llm:{
      models:{list:async function(){var r=await request('/api/models');if(r.error)throw Object.assign(new Error(r.error.message),r.error);return r.data;}},
      chat:{completions:{create:function(input){var context=snapshot();return (async function*(){var r=await post('/api/chat',input,context);if(r.error)throw Object.assign(new Error(r.error.message),r.error);check(context);yield {choices:[{delta:{content:r.data.choices[0].message.content}}]};})();}}}
    }
  };
  window.OutfitBackend=cloud;
})();
