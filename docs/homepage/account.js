/* 登录 / 注册页：本机账号由 store.js 管理（与主页同一个数据库），成功后回到主页的「我的衣橱」。
   注册和用找回码重设密码后，先显示一次找回码，访客确认记下后再进入衣橱。 */
(function(){
  'use strict';
  var doc=document,Store=window.WeaveStore,page=doc.body.dataset.page;
  /* 字体样式表先按打印样式加载，脚本里再启用：本页的内容安全策略不允许内联事件 */
  doc.querySelectorAll('link[data-font]').forEach(function(link){link.media='all';});
  function $(id){return doc.getElementById(id);}
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  var form=$('authForm'),status=$('status'),submit=$('submit'),busy=false;
  function say(text,error,el){el=el||status;el.textContent=text;el.classList.toggle('is-error',!!error);}
  function done(message){
    try{sessionStorage.setItem('weave-fit-welcome',message);}catch(e){}
    location.href='./index.html#closet';
  }
  function remember(id){try{localStorage.setItem('weave-fit-last-account',id);}catch(e){}}
  /* 找回码只显示这一次：确认记下后才进入衣橱 */
  function showCode(code,lead,message){
    var card=doc.createElement('section');
    card.className='auth-card';card.setAttribute('aria-labelledby','codeTitle');
    card.innerHTML='<p class="index-cell">找回码 · RECOVERY</p><h1 id="codeTitle" tabindex="-1">记下你的找回码</h1><p class="auth-lead"></p>'+
      '<p class="recovery-code" id="codeValue"></p>'+
      '<div class="auth-code-actions"><button type="button" class="button ghost small" id="codeCopy">复制找回码</button></div>'+
      '<label class="auth-check"><input type="checkbox" id="codeSaved">我已经抄下或截图保存好了</label>'+
      '<button type="button" class="button primary auth-submit" id="codeDone" disabled>进入我的衣橱</button>'+
      '<p class="auth-status" id="codeStatus" role="status" aria-live="polite"></p>'+
      '<p class="auth-note">找回码只显示这一次。忘记密码时，在登录页点「忘记密码？」用它重设；丢了可以登录后在「个人档案 · 账号与安全」里换一个新的。</p>';
    card.querySelector('.auth-lead').textContent=lead;
    card.querySelector('#codeValue').textContent=code;
    Array.from(doc.querySelectorAll('main form')).forEach(function(f){f.hidden=true;});
    $('main').appendChild(card);
    $('codeSaved').addEventListener('change',function(){$('codeDone').disabled=!this.checked;});
    $('codeDone').addEventListener('click',function(){done(message);});
    $('codeCopy').addEventListener('click',function(){
      var copied=navigator.clipboard&&navigator.clipboard.writeText?navigator.clipboard.writeText(code):Promise.reject();
      copied.then(function(){say('已复制，记得粘贴到备忘录等安全的地方。',false,$('codeStatus'));},function(){
        var range=doc.createRange();range.selectNodeContents($('codeValue'));var sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);
        say('浏览器不允许自动复制，已选中找回码，请手动复制。',false,$('codeStatus'));
      });
    });
    $('codeTitle').focus();
  }
  Store.isVolatile().then(function(volatile){if(volatile)say('这个浏览器现在不能保存数据（可能是无痕窗口），关闭页面后账号和衣橱都会消失。',true);});
  /* 不是安全来源时浏览器不提供密码哈希所需的 WebCrypto：直接说明，不让访客白填表单 */
  if(!Store.secure){say(Store.INSECURE+'。',true);submit.disabled=true;}

  if(page==='login'){
    var list=$('peopleList'),field=$('peopleField'),empty=$('noPeople'),resetForm=$('resetForm'),resetStatus=$('resetStatus'),people=[];
    function chosen(){var picked=form.querySelector('input[name="person"]:checked');return picked?people.find(function(p){return p.id===picked.value;}):null;}
    Store.listPeople().then(function(all){
      people=all;
      var last=null;try{last=localStorage.getItem('weave-fit-last-account');}catch(e){}
      if(!people.length){field.hidden=true;empty.hidden=false;submit.disabled=true;$('password').disabled=true;$('forgotLink').hidden=true;return;}
      var pick=people.some(function(p){return p.id===last;})?last:people[people.length-1].id;
      list.innerHTML=people.map(function(p){return '<label class="auth-person"><input type="radio" name="person" value="'+esc(p.id)+'"'+(p.id===pick?' checked':'')+'><span>'+esc(p.nickname)+'</span></label>';}).join('');
      $('password').focus();
      return Store.currentPerson().then(function(me){if(me)say('你现在已经以「'+me.nickname+'」登录，可以直接回到衣橱，也可以在这里换一个账号。');});
    });
    form.addEventListener('submit',function(e){
      e.preventDefault();if(busy)return;
      var person=chosen();
      if(!person){say('先选一个账号',true);return;}
      busy=true;submit.disabled=true;say('正在登录…');
      Store.login({id:person.id,password:$('password').value,remember:$('remember').checked}).then(function(me){
        remember(me.id);done('欢迎回来，'+me.nickname+'。');
      },function(err){busy=false;submit.disabled=false;say(err.message||'登录失败',true);$('password').select();});
    });
    /* 忘记密码：针对上面选中的账号，用找回码设新密码 */
    $('forgotLink').addEventListener('click',function(){
      var person=chosen();
      if(!person){say('先在上面选一个账号',true);return;}
      $('resetLead').textContent='为「'+person.nickname+'」重设密码：输入注册时网页给你的找回码（形如 ABCD-EFGH-JKMN）。';
      form.hidden=true;resetForm.hidden=false;say('',false,resetStatus);$('resetCode').focus();
    });
    $('backToLogin').addEventListener('click',function(){resetForm.hidden=true;form.hidden=false;$('password').focus();});
    resetForm.addEventListener('submit',function(e){
      e.preventDefault();if(busy)return;
      var person=chosen(),password=$('resetPassword').value;
      if(!person){resetForm.hidden=true;form.hidden=false;return;}
      if(password!==$('resetConfirm').value){say('两次输入的新密码不一样',true,resetStatus);$('resetConfirm').focus();return;}
      busy=true;$('resetSubmit').disabled=true;say('正在重设…',false,resetStatus);
      Store.resetPassword({id:person.id,code:$('resetCode').value,password:password,remember:$('remember').checked}).then(function(result){
        remember(result.person.id);
        showCode(result.recoveryCode,'「'+result.person.nickname+'」的密码已经重设。刚才用过的找回码已经失效，这是新的找回码：','密码已重设，欢迎回来，'+result.person.nickname+'。');
      },function(err){busy=false;$('resetSubmit').disabled=false;say(err.message||'重设失败',true,resetStatus);});
    });
  }

  if(page==='register'){
    form.addEventListener('submit',function(e){
      e.preventDefault();if(busy)return;
      var password=$('password').value;
      if(password!==$('confirm').value){say('两次输入的密码不一样',true);$('confirm').focus();return;}
      busy=true;submit.disabled=true;say('正在注册…');
      Store.register({nickname:$('nickname').value,password:password,remember:$('remember').checked}).then(function(result){
        remember(result.person.id);
        showCode(result.recoveryCode,'注册好了，'+result.person.nickname+'。忘记密码时，要用下面这个找回码重设：',
          '注册好了，'+result.person.nickname+'。'+(result.adopted?'这台设备上原来的 '+result.adopted+' 件衣服已经放进你的衣橱。':'先拍几件常穿的衣服吧。'));
      },function(err){busy=false;submit.disabled=false;say(err.message||'注册失败',true);});
    });
  }
})();
