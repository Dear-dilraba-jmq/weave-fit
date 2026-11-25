/* 穿搭魔镜 — 前端逻辑
   云服务模块：Auth / Database / Storage / LLM（统一使用同一个 cloud 实例） */
(function () {
  'use strict';

  var cloud = window.OutfitBackend;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var uid = function () { return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9); };

  var STYLES = ['参考图风格', '极简', '通勤', '街头', '学院', '甜酷', '轻熟', '度假', '复古', '运动'];
  var OCCASIONS = ['日常通勤', '约会', '朋友聚会', '面试', '周末出行', '旅行', '校园上课', '运动', '正式晚宴'];
  var CATEGORIES = ['全部', '上装', '下装', '外套', '连衣裙', '鞋履', '包袋', '配饰', '其他'];
  var TITLES = {
    today: ['DAILY LOOK', '今日搭配'],
    closet: ['MY WARDROBE', '我的衣橱'],
    profile: ['ABOUT YOU', '个人档案'],
    saved: ['SAVED LOOKS', '搭配收藏']
  };

  var state = {
    session: null, profile: null, wardrobe: [], saved: [], current: null,
    style: '参考图风格', occasion: '日常通勤', selected: new Set(),
    filter: '全部', profileStyles: new Set(),
    imageUrls: {}, pendingOtp: null, otpChannel: 'email',
    modelId: null, lastGenAt: 0, generating: false, nav: 'today',
    codeTimer: null,
    pendingImage: null,   // 新增单品：{ rawBlob, cutBlob, mode, active, urls }
    facePending: null,    // 待保存的面部照片（压缩后的 Blob）
    lookPromise: null,    // 当前方案效果图的生成任务
    lookUrls: {},         // 效果图 path -> 本地 blob URL
    tryonConfig: null, tryonGenerating: false, dataReady:false, services:null,
    itemSaving:false, editingItemId:null, profilePromise:null, deleting:new Set(), savingBackup:false,
    outfitMode:'auto', manualChoices:{}, manualTimers:{}, manualBusy:false, planRequest:0
  };
  var accountVersion = 0;
  function accountTicket() { return {version:accountVersion,owner:state.session && state.session.user.id}; }
  function isCurrentAccount(ticket) { return ticket.version === accountVersion && ticket.owner === (state.session && state.session.user.id); }
  function assertAccount(ticket) { if (!isCurrentAccount(ticket)) throw Object.assign(new Error('账号已切换，旧操作已取消'),{cancelled:true}); }
  function resetAccount(session) {
    accountVersion++;
    Object.keys(state.manualTimers).forEach(function(k){clearTimeout(state.manualTimers[k]);});
    state.outfitMode='auto';state.manualChoices={};state.manualTimers={};state.manualBusy=false;state.planRequest=0;
    clearPendingImage(); clearFacePending();
    [state.imageUrls,state.lookUrls].forEach(function(map){Object.keys(map).forEach(function(k){if(String(map[k]).startsWith('blob:'))URL.revokeObjectURL(map[k]);});});
    state.session=session || null;state.profile=null;state.wardrobe=[];state.saved=[];state.current=null;
    state.selected=new Set();state.profileStyles=new Set();state.imageUrls={};state.lookUrls={};state.lookPromise=null;
    state.modelId=null;state.lastGenAt=0;state.generating=false;state.tryonGenerating=false;state.tryonConfig=null;
    state.dataReady=false;state.services=null;state.itemSaving=false;state.editingItemId=null;state.profilePromise=null;state.deleting=new Set();state.savingBackup=false;
    state.filter='全部';state.style='参考图风格';state.occasion='日常通勤';state.planVariant=0;state.profileSignature='';
    $('#resultArea').innerHTML='';$('#resultArea').hidden=true;
    $('#toastBox').innerHTML='';$('#genStatus').textContent='';$('#genStatus').className='gen-status';
    $('#generateBtn').disabled=false;$('#generateBtn').textContent='生成我的搭配';
    $('#autoTryon').checked=false;$('#autoTryon').disabled=true;$('#autoTryonInfo').textContent='';
    ['itemName','itemColor','itemTags','itemNote','itemImage','itemCamera','faceImage','faceCamera','extraInput','importBackup'].forEach(function(id){$('#'+id).value='';});
    $('#faceImage').disabled=false;$('#faceCamera').disabled=false;$('#importBackup').disabled=false;
    $('#uploadFaceBtn').disabled=true;$('#uploadFaceBtn').textContent='保存这张照片';
    $('#faceUploadStatus').textContent='请选择并保存本账号的面部参考照片。';
    $('#saveItemBtn').disabled=false;$('#saveItemBtn').textContent='保存到衣橱';$('#itemCategory').disabled=false;
    $('#itemCategory').value='上装';$('#itemSeason').value='四季';
    $('#uploadPreview').innerHTML='<svg><use href="#i-hanger"/></svg>';$('#cutoutBar').hidden=true;$('#addPanel').hidden=true;
    $('#profileSaveNote').textContent='';$('#importStatus').textContent='';$('#saveProfileBtn').textContent='保存我的档案';
    $('#appLoadError').hidden=true;$('#serviceStatusList').innerHTML='';$('#serviceStatusMessage').textContent='';$('#refreshServicesBtn').disabled=false;
    ['passwordCurrent','passwordNew','passwordConfirm'].forEach(function(id){$('#'+id).value='';});$('#passwordStatus').textContent='';$('#changePasswordBtn').disabled=false;
    $('#itemPanelTitle').textContent='新增一件单品';$('#saveProfileBtn').disabled=false;$('#exportBackupBtn').disabled=false;
    $$('#addPanel input, #addPanel select, #addPanel button').forEach(function(el){el.disabled=false;});
    $('#sideName').textContent=session ? session.user.name : '我的账号';$('#sideAvatar').textContent=session ? String(session.user.name).slice(0,1) : '我';
    renderAll();
  }

  /* ---------------- 通用 UI ---------------- */
  function runTask(fn) {
    var ticket=accountTicket();
    Promise.resolve().then(fn).catch(function(e){if(isCurrentAccount(ticket)&&!e.cancelled&&e.code!=='ACCOUNT_CHANGED')toast(e.message||'操作失败，请重试','err');});
  }
  function toast(msg, kind) {
    var box = $('#toastBox');
    var el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(function () { el.remove(); }, 4200);
  }
  function authError(msg) {
    var el = $('#authError');
    if (!msg) { el.hidden = true; el.textContent = ''; return; }
    el.hidden = false; el.textContent = msg;
  }
  function showAuth() {
    $('#bootView').hidden = true;
    $('#appView').hidden = true;
    $('#authView').hidden = false;
  }
  function showApp() {
    $('#bootView').hidden = true;
    $('#authView').hidden = true;
    $('#appView').hidden = false;
  }
  function switchNav(name) {
    if (!TITLES[name]) name = 'today';
    state.nav = name;
    $$('.nav-item, .tabbar-item').forEach(function (b) { b.classList.toggle('active', b.dataset.nav === name); });
    $$('.page').forEach(function (p) { p.hidden = true; });
    $('#page-' + name).hidden = false;
    $('#topEyebrow').textContent = TITLES[name][0];
    $('#topTitle').textContent = TITLES[name][1];
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function chipsHtml(list, active, multi) {
    return list.map(function (x) {
      var on = multi ? active.has(x) : active === x;
      return '<button type="button" class="chip' + (on ? ' on' : '') + '" data-value="' + esc(x) + '">' + esc(x) + '</button>';
    }).join('');
  }
  function imgTag(path, cls) {
    var url = state.imageUrls[path];
    if (url) return '<img src="' + esc(url) + '" alt="">';
    return '<svg class="' + (cls || '') + '"><use href="#i-hanger"/></svg>';
  }

  async function ensureSession() {
    var ticket=accountTicket();
    var r = await cloud.auth.getSession();
    if(!isCurrentAccount(ticket))return null;
    if (r.error || !r.data) {
      toast('登录状态已失效，请重新登录', 'err');
      resetAccount(null);
      showAuth();
      return null;
    }
    if(r.data.user.id!==ticket.owner){resetAccount(null);showAuth();authError('账号已在其他窗口切换，请重新登录');return null;}
    state.session = r.data;
    return r.data;
  }

  /* ---------------- 启动 & 登录 ---------------- */
  async function boot() {
    var version=accountVersion;
    if (window.location.protocol === 'file:') {
      showAuth();
      $('#fileOpenHelp').hidden = false;
      $('#localLoginBtn').disabled = true;
      $('#localLoginBtn').textContent = '请从上方入口打开独立版';
      return;
    }
    var r = await cloud.auth.getSession();
    if(version!==accountVersion)return;
    if (r.error) {
      showAuth();
      authError(r.error.message || '登录状态读取失败，请重试。');
      return;
    }
    if (!r.data) { showAuth(); return; }
    resetAccount(r.data);
    await enterApp();
  }

  async function enterApp() {
    var ticket=accountTicket();
    $('#appView').hidden=true;$('#authView').hidden=true;$('#bootView').hidden=false;
    var u = state.session.user || {};
    var name = u.name || (state.profile && state.profile.nickname) || '我的账号';
    $('#sideName').textContent = name;
    $('#sideSub').textContent = '已登录 · 数据仅自己可见';
    $('#sideAvatar').textContent = String(name).slice(0, 1);
    var d = new Date();
    $('#topDate').textContent = d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();
    switchNav('today');
    try{await loadData();}catch(e){
      if(!isCurrentAccount(ticket))return;
      $('#appLoadError').hidden=false;$('#appLoadMessage').textContent=e.message||'账号数据读取失败，请重试';
      $('#generateBtn').disabled=true;$('#saveProfileBtn').disabled=true;showApp();return;
    }
    if(!isCurrentAccount(ticket))return;
    var models;
    try{models=await cloud.llm.models.list();}catch(e){if(!isCurrentAccount(ticket))return;models=[];}
    if(!isCurrentAccount(ticket))return;
    $('#engineState').textContent=models.length?'AI 搭配引擎已配置':'内置规则搭配已就绪';
    try {
      var imageStatus=await cloud.fetch('/api/tryon/status'),cfg=await imageStatus.json();
      if(!imageStatus.ok)throw Error(cfg.error&&cfg.error.message||'图像服务状态读取失败');
      if(!isCurrentAccount(ticket))return;
      state.tryonConfig=cfg;
      $('#autoTryon').disabled=!state.tryonConfig.configured;
      $('#autoTryonInfo').textContent=state.tryonConfig.configured
        ? '勾选后，每次生成将面部照片、身材资料和本套衣服图发送至 '+state.tryonConfig.provider+'，并自动保存人像图。'
        : '自动真人生图尚未配置图像 API；仅展示本账号已保存的人像图。';
    } catch(e) { if(!isCurrentAccount(ticket))return;$('#autoTryonInfo').textContent='图像服务状态读取失败，请稍后刷新'; }
    if (!state.current) {
      var latest=state.saved.find(function(s){return s.payload && s.payload.tryonImage;});
      if(latest){state.current=Object.assign({},latest.payload,{savedId:latest.id});renderResult();}
    }
    refreshServiceStatus();
    if(isCurrentAccount(ticket))showApp();
  }

  var authMode = 'login';
  async function localLogin() {
    var btn = $('#localLoginBtn');
    if (btn.disabled) return;
    authError(''); btn.disabled=true; btn.textContent='请稍候…';
    resetAccount(null);
    var version=accountVersion;
    try {
      var r=await cloud.auth.signIn($('#localUsername').value.trim(),$('#localPassword').value,authMode==='register');
      if(version!==accountVersion)return;
      if (r.error) { authError(r.error.message); return; }
      resetAccount(r.data); version=accountVersion;$('#localPassword').value='';
      await enterApp();
    } catch(e) {if(version===accountVersion){showAuth();authError(e.message||'登录失败，请重试');}
    } finally { if(version===accountVersion||!state.session){btn.disabled=false; btn.textContent=authMode==='register'?'注册并进入':'登录';} }
  }

  /* ---------------- 数据读取 ---------------- */
  async function loadData() {
    var ticket=accountTicket();
    var results = await Promise.all([
      cloud.database.from('profiles').select('*').maybeSingle(),
      cloud.database.from('wardrobe_items').select('*').order('created_at', { ascending: false }).limit(1000),
      cloud.database.from('outfits').select('*').order('created_at', { ascending: false }).limit(1000)
    ]);
    if(!isCurrentAccount(ticket))return;
    var failed=results.find(function(r){return r.error;});if(failed)throw new Error('账号数据读取失败：'+failed.error.message);
    state.profile = results[0].data || null;
    state.wardrobe = results[1].data || [];
    state.saved = results[2].data || [];
    state.dataReady=true;$('#appLoadError').hidden=true;$('#generateBtn').disabled=false;$('#saveProfileBtn').disabled=false;
    state.profileStyles = new Set((state.profile && state.profile.style_prefs) || []);

    var paths = state.wardrobe.map(function (i) { return i.image_path; });
    if (state.profile && state.profile.face_photo_path) paths.push(state.profile.face_photo_path);
    state.saved.forEach(function (s) {
      (Array.isArray(s.payload && s.payload.items)?s.payload.items:[]).forEach(function (i) { if (i&&i.image_path) paths.push(i.image_path); });
      if(s.payload && s.payload.tryonImage)paths.push(s.payload.tryonImage);
      if(s.payload && s.payload.lookImage)paths.push(s.payload.lookImage);
    });
    await refreshImages(paths);
    if(!isCurrentAccount(ticket))return;
    renderAll();
    if (!state.profile) toast('先去「个人档案」填一下基础数据，搭配会更准', 'warn');
  }

  async function refreshImages(paths) {
    var ticket=accountTicket();
    var prefix='users/'+ticket.owner+'/';
    var need = Array.from(new Set((paths || []).filter(function(p){return typeof p==='string'&&p.startsWith(prefix)&&!state.imageUrls[p];})));
    if (!need.length) return;
    try {
      var r = await cloud.storage.createSignedUrls(need, 3600);
      if(!isCurrentAccount(ticket))return;
      if (r.error || !r.data) return;
      r.data.forEach(function (row, idx) {
        var u = row && (row.signedUrl || row.signedURL);
        var p = (row && row.path) || need[idx];
        if (u && p) state.imageUrls[p] = u;
      });
    } catch (e) { /* 图片加载失败不阻塞主流程 */ }
  }

  function renderAll() {
    renderSideUser();
    $('#styleChips').innerHTML = chipsHtml(STYLES, state.style, false);
    $('#occasionChips').innerHTML = chipsHtml(OCCASIONS, state.occasion, false);
    $('#filterChips').innerHTML = chipsHtml(CATEGORIES, state.filter, false);
    $('#pfStyleChips').innerHTML = chipsHtml(STYLES, state.profileStyles, true);
    renderPicker();
    renderManual();setOutfitMode(state.outfitMode);
    renderReference();
    renderProfileForm();
    renderCloset();
    renderSaved();
    updateCounts();
    renderResult();
  }

  function renderSideUser() {
    var u = (state.session && state.session.user) || {};
    var name = u.name || (state.profile && state.profile.nickname) || '我的账号';
    $('#sideName').textContent = name;
    $('#sideAvatar').textContent = String(name).slice(0, 1);
  }
  function updateCounts() {
    $('#navClosetCount').textContent = state.wardrobe.length;
    $('#navSavedCount').textContent = state.saved.length;
    var tc = $('#tabClosetCount'), ts = $('#tabSavedCount');
    if (tc) tc.textContent = state.wardrobe.length ? state.wardrobe.length : '';
    if (ts) ts.textContent = state.saved.length ? state.saved.length : '';
  }

  function renderPicker() {
    var el = $('#pickerList');
    if (!state.wardrobe.length) {
      el.innerHTML = '<div class="picker-empty">衣橱还是空的。可先添加常穿单品，也可以生成一套待购款式参考，再到淘宝搜索选购。</div>';
      return;
    }
    el.innerHTML = state.wardrobe.map(function (i) {
      var on = state.selected.has(Number(i.id));
      return '<button type="button" class="pick' + (on ? ' on' : '') + '" data-id="' + esc(i.id) + '" title="' + esc(i.name) + '">' +
        '<span class="thumb">' + (i.image_path ? imgTag(i.image_path) : '<svg><use href="#i-hanger"/></svg>') + '</span>' +
        '<span>' + esc(i.name) + '</span></button>';
    }).join('');
  }

  /* ---------------- 三行滑动手动搭配 ---------------- */
  var MANUAL_ROWS=[{key:'top',label:'上装',categories:['上装','外套']},{key:'bottom',label:'下装',categories:['下装']},{key:'shoes',label:'鞋子',categories:['鞋履']}];
  function manualItems(row){return state.wardrobe.filter(function(i){return row.categories.indexOf(i.category)>=0;});}
  function manualTrackWidth(track){return track.getBoundingClientRect().width||track.clientWidth;}
  function manualSelection(){return MANUAL_ROWS.map(function(row){return manualItems(row).find(function(i){return String(i.id)===String(state.manualChoices[row.key]);});});}
  function setOutfitMode(mode){
    state.outfitMode=mode==='manual'?'manual':'auto';
    $('#manualBuilder').hidden=state.outfitMode!=='manual';$('#autoBuilder').hidden=state.outfitMode!=='auto';
    $$('[data-outfit-mode]').forEach(function(button){var on=button.dataset.outfitMode===state.outfitMode;button.classList.toggle('on',on);button.setAttribute('aria-selected',String(on));button.tabIndex=on?0:-1;});
    if(state.outfitMode==='manual')alignManualRows();
  }
  function alignManualRows(){
    MANUAL_ROWS.forEach(function(row){var track=$('[data-manual-track="'+row.key+'"]');if(!track)return;var index=manualItems(row).findIndex(function(i){return String(i.id)===String(state.manualChoices[row.key]);});track.scrollLeft=Math.max(0,index)*manualTrackWidth(track);});
  }
  function renderManual(){
    if(!MANUAL_ROWS)return;
    Object.keys(state.manualTimers).forEach(function(k){clearTimeout(state.manualTimers[k]);});state.manualTimers={};
    $('#manualRows').innerHTML=MANUAL_ROWS.map(function(row,index){
      var list=state.dataReady?manualItems(row):[];
      if(!list.some(function(i){return String(i.id)===String(state.manualChoices[row.key]);}))state.manualChoices[row.key]=list.length?list[0].id:null;
      var slides=list.map(function(item,n){var photo=item.image_path&&state.imageUrls[item.image_path];return '<div class="manual-slide" data-manual-id="'+esc(item.id)+'" role="group" aria-roledescription="单品" aria-label="'+(n+1)+' / '+list.length+'：'+esc(item.name)+'"><div class="manual-photo">'+(photo?'<img src="'+esc(photo)+'" alt="'+esc(item.name)+'" draggable="false">':window.OutfitReference.illustration(item))+'</div><div class="manual-caption"><b>'+esc(item.name)+'</b><small>'+esc(item.color||item.category)+(photo?' · 衣橱实拍':' · 暂无照片，款式示意')+'</small></div></div>';}).join('');
      return '<section class="manual-row manual-row-'+row.key+'" data-manual-row="'+row.key+'"><div class="manual-row-head"><h4 id="manualLabel-'+row.key+'"><span>0'+(index+1)+'</span>'+row.label+'</h4><span class="manual-count" data-manual-count="'+row.key+'"></span></div>'+(list.length?'<div class="manual-carousel"><button type="button" class="manual-arrow prev" data-manual-step="-1" data-manual-key="'+row.key+'" aria-label="上一件'+row.label+'">‹</button><div class="manual-track" data-manual-track="'+row.key+'" tabindex="0" aria-labelledby="manualLabel-'+row.key+'" aria-roledescription="可左右滑动的单品列表">'+slides+'</div><button type="button" class="manual-arrow next" data-manual-step="1" data-manual-key="'+row.key+'" aria-label="下一件'+row.label+'">›</button></div>':'<div class="manual-empty"><svg><use href="#i-hanger"/></svg><p>'+(state.dataReady?'还没有'+row.label+'，先把喜欢的单品放进衣橱':'正在等待衣橱数据载入')+'</p><button type="button" class="btn-ghost" data-manual-add="'+row.categories[0]+'" '+(!state.dataReady?'disabled':'')+'>添加'+row.label+'</button></div>')+'</section>';
    }).join('');
    $$('[data-manual-track]').forEach(function(track){
      var ticket=accountTicket(),key=track.dataset.manualTrack;
      track.addEventListener('scroll',function(){clearTimeout(state.manualTimers[key]);state.manualTimers[key]=setTimeout(function(){if(isCurrentAccount(ticket)&&track.isConnected)settleManualTrack(track);},90);},{passive:true});
      track.addEventListener('keydown',function(e){if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight'&&e.key!=='Home'&&e.key!=='End')return;e.preventDefault();var row=MANUAL_ROWS.find(function(r){return r.key===key;}),n=manualItems(row).length;moveManual(key,e.key==='ArrowLeft'?-1:e.key==='ArrowRight'?1:e.key==='Home'?-n:n);});
      track.addEventListener('error',function(e){if(e.target.tagName!=='IMG')return;var slide=e.target.closest('[data-manual-id]'),item=state.wardrobe.find(function(i){return String(i.id)===slide.dataset.manualId;});if(item){e.target.parentNode.innerHTML=window.OutfitReference.illustration(item);$('.manual-caption small',slide).textContent='图片暂不可用 · 款式示意';}},true);
    });
    updateManualSummary();if(state.outfitMode==='manual')alignManualRows();
  }
  function settleManualTrack(track){
    var width=manualTrackWidth(track);if(!width)return;
    var row=MANUAL_ROWS.find(function(r){return r.key===track.dataset.manualTrack;}),list=manualItems(row),index=Math.max(0,Math.min(list.length-1,Math.round(track.scrollLeft/width)));
    if(list[index]){state.manualChoices[row.key]=list[index].id;updateManualSummary();}
  }
  function moveManual(key,step){
    var row=MANUAL_ROWS.find(function(r){return r.key===key;});if(!row)return;
    var list=manualItems(row),index=list.findIndex(function(i){return String(i.id)===String(state.manualChoices[key]);}),next=Math.max(0,Math.min(list.length-1,index+step)),track=$('[data-manual-track="'+key+'"]');
    if(!list[next]||!track)return;
    state.manualChoices[key]=list[next].id;updateManualSummary();
    var left=next*manualTrackWidth(track);if(track.scrollTo)track.scrollTo({left:left,behavior:window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});else track.scrollLeft=left;
  }
  function updateManualSummary(){
    if(!MANUAL_ROWS)return;
    var selected=manualSelection(),climate=window.OutfitPlanner.climateFor(climateOptions());
    MANUAL_ROWS.forEach(function(row){var list=manualItems(row),index=list.findIndex(function(i){return String(i.id)===String(state.manualChoices[row.key]);}),count=$('[data-manual-count="'+row.key+'"]');if(count)count.textContent=list.length?(index+1)+' / '+list.length:'0 件';
      $$('[data-manual-key="'+row.key+'"]').forEach(function(button){button.disabled=Number(button.dataset.manualStep)<0?index<=0:index>=list.length-1;});
      $$('[data-manual-track="'+row.key+'"] [data-manual-id]').forEach(function(slide){slide.setAttribute('aria-current',String(slide.dataset.manualId===String(state.manualChoices[row.key])));});
    });
    var missing=MANUAL_ROWS.filter(function(row,index){return !selected[index];}).map(function(row){return row.label;});
    $('#manualApplyBtn').disabled=!state.dataReady||!!missing.length||state.manualBusy;
    $('#manualApplyBtn').textContent=state.manualBusy?'正在整理这套…':'查看这套搭配';
    $('#manualSummary').textContent=!state.dataReady?'衣橱尚未载入，请先完成数据载入。':missing.length?'还差'+missing.join('、')+'，添加后就能组合搭配。':selected.map(function(i){return i.name;}).join(' ＋ ');
    var warnings=selected.filter(Boolean).map(function(i){var reason=window.OutfitPlanner.unsuitable(i,climate);return reason?'「'+i.name+'」'+reason:'';}).filter(Boolean);
    $('#manualWarnings').textContent=warnings.length?'温度提醒：'+warnings.join('；')+'。保留你的选择。':climate.temperature+'°C · '+climate.advice;
    $('#manualSeason').value=$('#seasonSel').value;$('#manualTemperature').value=$('#tempRange').value;$('#manualWeather').value=$('#weatherSel').value;
  }
  function manualSignature(){return JSON.stringify({ids:MANUAL_ROWS.map(function(row){return state.manualChoices[row.key];}),climate:climateOptions()});}
  function editManualPlan(){
    var plan=state.current,missing=false;
    if(plan&&plan.source==='manual'){
      MANUAL_ROWS.forEach(function(row){var item=(plan.items||[]).find(function(i){return row.categories.indexOf(i.category)>=0;});if(item&&manualItems(row).some(function(i){return String(i.id)===String(item.id);}))state.manualChoices[row.key]=item.id;else missing=true;});
      if(['春季','夏季','秋季','冬季'].indexOf(plan.season)>=0)$('#seasonSel').value=plan.season;
      if(Number.isFinite(plan.temperature))$('#tempRange').value=plan.temperature;
      if(['晴','多云','阴','小雨','雨雪','大风'].indexOf(plan.weather)>=0)$('#weatherSel').value=plan.weather;
      syncClimateControls(false);renderManual();
      if(missing)toast('部分原单品已移出衣橱，请在对应行重新选择','warn');
    }
    setOutfitMode('manual');$('#manualBuilder').scrollIntoView({behavior:'smooth',block:'start'});
  }
  async function applyManual(){
    if(state.manualBusy||!state.dataReady)return;
    $$('[data-manual-track]').forEach(settleManualTrack);
    var items=manualSelection();if(items.some(function(i){return !i;})){toast('先为上装、下装和鞋子各添加一件单品','warn');return;}
    var ticket=accountTicket(),request=++state.planRequest,signature=manualSignature(),options=climateOptions();options.itemIds=items.map(function(i){return Number(i.id);});
    state.manualBusy=true;updateManualSummary();
    try{
      var response=await cloud.fetch('/api/outfits/manual',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(options)}),result=await response.json();assertAccount(ticket);
      if(request!==state.planRequest)return;
      if(!response.ok)throw Error(result.error&&result.error.message||'这套搭配整理失败，请重试');
      if(signature!==manualSignature()){toast('你刚刚换了单品或温度，请点击查看最新组合','warn');return;}
      state.current=result.data;renderResult();startLook(state.current);
      $('#resultArea').scrollIntoView({behavior:'smooth',block:'start'});
    }finally{if(isCurrentAccount(ticket)){state.manualBusy=false;updateManualSummary();}}
  }

  function renderReference() {
    var p = state.profile || {};
    var face = p.face_photo_path && state.imageUrls[p.face_photo_path];
    $('#removeFaceBtn').disabled=!p.face_photo_path;
    ['#facePreview', '#facePreview2'].forEach(function (sel) {
      var pending = state.facePending;
      $(sel).innerHTML = pending ? '<img src="' + esc(pending.url) + '" alt="面部参考预览">'
        : face ? '<img src="' + esc(face) + '" alt="我的面部参考">' : '<svg><use href="#i-user"/></svg>';
    });
    if (!state.facePending) $('#faceNote').textContent = face ? '已设置面部参考照片' : '还没有上传面部参考照片';
    var rows = [
      ['身高 / 体重', (p.height_cm ? p.height_cm + ' cm' : '—') + ' / ' + (p.weight_kg ? p.weight_kg + ' kg' : '—')],
      ['肤色', p.skin_tone || '未填写'],
      ['身形', p.body_shape || '未填写'],
      ['常穿风格', (p.style_prefs || []).join(' · ') || '未填写'],
      ['衣橱单品', state.wardrobe.length + ' 件']
    ];
    $('#profileSummary').innerHTML = rows.map(function (r) {
      return '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>';
    }).join('');
  }

  function renderProfileForm() {
    var p = state.profile || {};
    $('#pfNickname').value = p.nickname || '';
    $('#pfGender').value = p.gender || '未填写';
    $('#pfHeight').value = p.height_cm || '';
    $('#pfWeight').value = p.weight_kg || '';
    $('#pfShape').value = p.body_shape || '未填写';
    $('#pfSkin').value = p.skin_tone || '未填写';
    $('#pfHair').value = p.hair_color || '未填写';
    updateBmi();
  }
  function updateBmi() {
    var h = parseFloat($('#pfHeight').value), w = parseFloat($('#pfWeight').value);
    $('#pfBmi').value = (h > 0 && w > 0) ? (w / Math.pow(h / 100, 2)).toFixed(1) : '填写身高体重后自动计算';
  }

  function renderCloset() {
    var list = state.filter === '全部' ? state.wardrobe : state.wardrobe.filter(function (i) { return i.category === state.filter; });
    $('#closetStat').textContent = '共 ' + state.wardrobe.length + ' 件单品' + (state.filter !== '全部' ? ' · 当前显示 ' + list.length + ' 件' : '');
    var grid = $('#closetGrid');
    if (!list.length) {
      grid.innerHTML = '<div class="closet-empty" style="grid-column:1/-1">' + (state.wardrobe.length ? '这个分类下还没有单品' : '衣橱空空的，点右上角「添加单品」把常穿的衣服放进来吧') + '</div>';
      return;
    }
    grid.innerHTML = list.map(function (i) {
      var tags = (Array.isArray(i.tags)?i.tags:[]).slice(0, 3).map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('');
      return '<div class="closet-card">' +
        '<div class="pic">' + (i.image_path ? imgTag(i.image_path) : '<svg><use href="#i-hanger"/></svg>') +
        '<span class="cat">' + esc(i.category) + '</span>' +
        '<button type="button" class="del" data-del="' + esc(i.id) + '" title="移除"><svg><use href="#i-trash"/></svg></button>' +
        (i.image_path ? '<button type="button" class="cut" data-cutout="' + esc(i.id) + '">制作单品图</button>' : '') +
        '</div>' +
        '<div class="body"><div class="nm">' + esc(i.name) + '</div>' +
        '<div class="meta">' + esc(i.color || '未填颜色') + ' · ' + esc(i.season || '四季') + (i.cutout ? ' · 单品图' : '') + '</div>' +
        (tags ? '<div class="tags">' + tags + '</div>' : '') + '<button class="btn-ghost closet-edit" type="button" data-edit="'+esc(i.id)+'">编辑单品</button></div></div>';
    }).join('');
  }

  function renderSaved() {
    var grid = $('#savedGrid');
    if (!state.saved.length) {
      grid.innerHTML = '<div class="saved-empty" style="grid-column:1/-1">还没有收藏的搭配。生成一套喜欢的方案后，点「收藏这套」就能存到这里。</div>';
      return;
    }
    grid.innerHTML = state.saved.map(function (s) {
      var p = s.payload || {};
      var when = new Date(s.created_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      return '<div class="saved-card"><div class="when">' + esc(when) + ' · ' + esc(s.style || '') + ' / ' + esc(s.occasion || '') + '</div>' +
        '<h4>' + esc(s.title) + '</h4>' +
        '<div class="sub">' + esc((p.concept || '').slice(0, 78)) + '…</div>' +
        '<div class="btns"><button type="button" data-view="' + esc(s.id) + '">查看方案</button>' +
        '<button type="button" data-undel="' + esc(s.id) + '">删除</button></div></div>';
    }).join('');
  }

  /* ---------------- 图片上传 ---------------- */
  function allowedImage(file) {
    if (!file) return false;
    if (!file.type) return true;   // 个别手机拍照不返回 MIME
    return /^image\/(png|jpeg|jpg|webp|gif|avif|heic|heif)$/i.test(file.type);
  }

  async function uploadImage(file, kind, extHint) {
    var ticket=accountTicket();
    if (!file) return '';
    if (!allowedImage(file)) throw new Error('只支持 JPG / PNG / WebP 等图片格式');
    if (file.size > 8 * 1024 * 1024) throw new Error('图片请控制在 8MB 以内');
    var ext = (extHint || (file.name || '').split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    if (ext === 'jpeg') ext = 'jpg';
    var u = state.session.user || {};
    if (!u.id) throw new Error('登录状态异常，请重新登录后再上传');
    var mime = file.type && /^image\//i.test(file.type) ? file.type : 'image/' + (ext === 'jpg' ? 'jpeg' : ext);
    var path = cloud.storage.userPath(u.id, kind + '/' + uid() + '.' + ext);
    var up = await cloud.storage.upload(path, file, { contentType: mime, upsert: false });
    assertAccount(ticket);
    if (up.error) throw new Error(up.error.message || '图片上传失败');
    var signed = await cloud.storage.createSignedUrl(path, 3600);
    assertAccount(ticket);
    if (signed.data && signed.data.signedUrl) state.imageUrls[path] = signed.data.signedUrl;
    return path;
  }

  /* ---------------- 拍照 / 相册 / 智能去背 ---------------- */
  function clearPendingImage() {
    var p = state.pendingImage;
    if (p && p.urls) Object.keys(p.urls).forEach(function (k) {
      if (p.urls[k]) { try { URL.revokeObjectURL(p.urls[k]); } catch (e) {} }
    });
    state.pendingImage = null;
  }

  function showItemPreview(url) {
    $('#uploadPreview').innerHTML = '<img src="' + esc(url) + '" alt="照片预览">';
  }

  async function handleItemImage(file) {
    if (!file) return;
    if (!allowedImage(file)) { toast('这张不是支持的图片格式', 'err'); return; }
    clearPendingImage();
    var bar = $('#cutoutBar');
    bar.hidden = false;
    $('#cutoutStatus').textContent = '正在本机识别衣物、排除人物与杂物，制作白底单品图…';
    $('#saveItemBtn').disabled = true;
    $('#itemCategory').disabled = true;
    $$('#cutoutBar .cutout-switch button').forEach(function (b) {
      b.disabled = true;
      b.classList.toggle('on', b.dataset.cutmode === 'cut');
    });
    var pending = {
      rawFile: file, rawBlob: null, cutBlob: null, mode: 'skip', active: 'cut', processing: true,
      urls: { raw: URL.createObjectURL(file), cut: '' }
    };
    state.pendingImage = pending;
    showItemPreview(pending.urls.raw);
    try {
      var prepared = await window.OutfitImage.prepare(file, 1200, 0.88);
      if (state.pendingImage !== pending) return;
      pending.rawBlob = prepared.blob;
      try {
        var res = await window.OutfitImage.cutout(prepared.blob, $('#itemCategory').value);
        if (state.pendingImage !== pending) return;
        pending.cutBlob = res.blob;
        pending.mode = res.mode;
        pending.urls.cut = URL.createObjectURL(res.blob);
        $('#cutoutStatus').textContent = '白底单品图已生成 · 请检查衣服是否完整，再保存到衣橱。遮挡部分不会自动补画。';
        showItemPreview(pending.urls.cut);
      } catch (e) {
        if (state.pendingImage !== pending) return;
        pending.active = 'raw';
        $('#cutoutStatus').textContent = '未生成单品图：' + e.message + '。当前保留原图，可修改类别后重新处理。';
      }
    } catch (e) {
      if (state.pendingImage !== pending) return;
      pending.active = 'raw';
      $('#cutoutStatus').textContent = '图片处理失败，将保留原图：' + (e.message || '');
    }
    if (state.pendingImage !== pending) return;
    pending.processing = false;
    $('#saveItemBtn').disabled = false;
    $('#itemCategory').disabled = false;
    $$('#cutoutBar .cutout-switch button').forEach(function (b) {
      b.disabled = !!(b.dataset.cutmode === 'cut' && !state.pendingImage.cutBlob);
      b.classList.toggle('on', b.dataset.cutmode === state.pendingImage.active);
    });
  }

  function setCutMode(mode) {
    var p = state.pendingImage;
    if (!p) return;
    if (mode === 'cut' && !p.cutBlob) { toast('这张图还未生成单品图，请确认类别后重试', 'warn'); return; }
    p.active = mode;
    var url = mode === 'cut' ? p.urls.cut : p.urls.raw;
    if (url) showItemPreview(url);
    $$('#cutoutBar .cutout-switch button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.cutmode === mode);
    });
  }

  function faceStatus(message, kind) {
    $('#faceUploadStatus').textContent = message;
    $('#faceUploadStatus').dataset.kind = kind || '';
    $('#faceNote').textContent = message;
  }

  function clearFacePending() {
    var p = state.facePending;
    if (p) {
      URL.revokeObjectURL(p.url);
      if (p.rawUrl !== p.url) URL.revokeObjectURL(p.rawUrl);
    }
    state.facePending = null;
  }

  async function handleFaceImage(file) {
    if (!file) return;
    if (!allowedImage(file)) { faceStatus('请选择 JPG、PNG 等图片文件', 'err'); return; }
    clearFacePending();
    var rawUrl = URL.createObjectURL(file);
    var html = '<img src="' + esc(rawUrl) + '" alt="面部参考预览">';
    $('#facePreview').innerHTML = html;
    $('#facePreview2').innerHTML = html;
    var pending = { file: file, rawUrl: rawUrl, url: rawUrl, blob: null, processing: true };
    state.facePending = pending;
    $('#uploadFaceBtn').disabled = true;
    faceStatus('正在处理照片，请稍候…');
    try {
      var p = await window.OutfitImage.prepare(file, 1200, 0.86);
      if (state.facePending !== pending) return;
      pending.blob = p.blob;
      pending.url = URL.createObjectURL(p.blob);
      URL.revokeObjectURL(rawUrl);
      var h2 = '<img src="' + esc(pending.url) + '" alt="面部参考预览">';
      $('#facePreview').innerHTML = h2;
      $('#facePreview2').innerHTML = h2;
    } catch (e) { /* 压缩失败就用原图，不影响上传 */ }
    if (state.facePending !== pending) return;
    pending.processing = false;
    if ((pending.blob || file).size > 8 * 1024 * 1024) {
      faceStatus('照片处理后仍超过 8MB，请换一张较小的 JPG 或 PNG 照片', 'err');
      return;
    }
    $('#uploadFaceBtn').disabled = false;
    faceStatus('照片已选好，点击「保存这张照片」上传。');
  }

  /* 旧单品：一键智能去背 */
  async function recutItem(id) {
    var key='cut:'+id;if(state.deleting.has(key)||state.itemSaving)return;state.deleting.add(key);
    var ticket=accountTicket();
    if (!await ensureSession() || !isCurrentAccount(ticket)) return;
    var item = state.wardrobe.find(function (i) { return String(i.id) === String(id); });
    if (!item || !item.image_path) { state.deleting.delete(key);toast('这件单品没有照片', 'warn'); return; }
    var btn = $('[data-cutout="' + id + '"]');
    if (btn) { btn.disabled = true; btn.textContent = '处理中…'; }
    try {
      await refreshImages([item.image_path]);
      if(!isCurrentAccount(ticket))return;
      var original = item.original_path || item.image_path;
      await refreshImages([original]);
      if(!isCurrentAccount(ticket))return;
      var url = state.imageUrls[original];
      if (!url) throw new Error('取不到这张照片，请刷新后重试');
      var resp = await cloud.fetch(url, { mode: 'cors' });
      if(!isCurrentAccount(ticket))return;
      if (!resp.ok) throw new Error('照片下载失败');
      var src = await resp.blob();
      if(!isCurrentAccount(ticket))return;
      var res = await window.OutfitImage.cutout(src, item.category);
      if(!isCurrentAccount(ticket))return;
      var ext = res.blob.type === 'image/png' ? 'png' : 'webp';
      var newPath = await uploadImage(res.blob, 'wardrobe', ext);
      if(!isCurrentAccount(ticket))return;
      var r = await cloud.database.from('wardrobe_items')
        .update({ image_path: newPath, cutout: true, original_path: original })
        .eq('id', id).select();
      if(!isCurrentAccount(ticket))return;
      if (r.error || !r.data || !r.data.length) throw new Error('更新失败，请重新登录后再试');
      var idx = state.wardrobe.findIndex(function (i) { return String(i.id) === String(id); });
      if (idx >= 0) state.wardrobe[idx] = r.data[0];
      renderCloset(); renderPicker(); renderManual();
      if (state.current && state.current.items) {
        state.current.items.forEach(function (it) {
          if (String(it.id) === String(id)) it.image_path = newPath;
        });
        renderResult();
      }
      toast('白底单品图已更新，原图仍保留', 'ok');
    } catch (e) {
      if(!isCurrentAccount(ticket))return;
      toast(e.message || '去背失败，请重试', 'err');
      if (btn) { btn.disabled = false; btn.textContent = '制作单品图'; }
    }finally{if(isCurrentAccount(ticket))state.deleting.delete(key);}
  }

  /* ---------------- 衣橱增删改 ---------------- */
  function setItemFormBusy(busy){
    $$('#addPanel input, #addPanel select, #addPanel button').forEach(function(el){el.disabled=busy;});
    $('#saveItemBtn').textContent=busy?'保存中…':state.editingItemId?'保存修改':'保存到衣橱';
  }
  function openItemEditor(id){
    if(!state.dataReady || state.itemSaving)return;
    var item=id?state.wardrobe.find(function(i){return String(i.id)===String(id);}):null;
    if(id&&!item){toast('这件单品已不存在，请刷新衣橱','warn');return;}
    clearPendingImage();state.editingItemId=item?item.id:null;
    $('#itemPanelTitle').textContent=item?'编辑衣橱单品':'新增一件单品';
    $('#itemName').value=item&&item.name||'';$('#itemCategory').value=item&&item.category||'上装';
    $('#itemColor').value=item&&item.color||'';$('#itemSeason').value=item&&item.season||'四季';
    $('#itemTags').value=(item&&item.tags||[]).join(', ');$('#itemNote').value=item&&item.note||'';
    $('#itemImage').value='';$('#itemCamera').value='';$('#cutoutBar').hidden=true;
    $('#uploadPreview').innerHTML=item&&item.image_path?imgTag(item.image_path):'<svg><use href="#i-hanger"/></svg>';
    setItemFormBusy(false);$('#addPanel').hidden=false;$('#addPanel').scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  function cancelItemEditor(){
    if(state.itemSaving)return;clearPendingImage();state.editingItemId=null;
    $('#itemImage').value='';$('#itemCamera').value='';$('#uploadPreview').innerHTML='<svg><use href="#i-hanger"/></svg>';
    $('#cutoutBar').hidden=true;$('#addPanel').hidden=true;
  }
  async function addItem() {
    if(state.itemSaving || !state.dataReady)return;
    if(state.pendingImage&&state.pendingImage.processing){toast('照片还在处理中，请稍候','warn');return;}
    var ticket=accountTicket(),editing=state.editingItemId;
    var old=editing?state.wardrobe.find(function(i){return String(i.id)===String(editing);}):null;
    var row={name:$('#itemName').value.trim(),category:$('#itemCategory').value,color:$('#itemColor').value.trim(),season:$('#itemSeason').value,
      tags:$('#itemTags').value.split(/[,，]/).map(function(t){return t.trim();}).filter(Boolean).slice(0,10),note:$('#itemNote').value.trim(),owner_name:state.session.user.name};
    if(!row.name){toast('先给这件单品起个名字','warn');return;}
    if(editing&&!old){toast('这件单品已不存在，请重新载入衣橱','warn');return;}
    if(editing&&state.deleting.has('cut:'+editing)){toast('单品图正在处理中，请稍候再保存修改','warn');return;}
    var pending=state.pendingImage,useCut=!!(pending&&pending.active==='cut'&&pending.cutBlob),chosen=pending?(useCut?pending.cutBlob:pending.rawBlob||pending.rawFile):null;
    state.itemSaving=true;setItemFormBusy(true);
    try{
      if(!await ensureSession()||!isCurrentAccount(ticket))return;
      row.image_path=old&&old.image_path||null;row.original_path=old&&old.original_path||null;row.cutout=!!(old&&old.cutout);
      if(chosen){
        row.image_path=await uploadImage(chosen,'wardrobe',useCut?(chosen.type==='image/png'?'png':'webp'):'jpg');assertAccount(ticket);
        row.original_path=useCut?await uploadImage(pending.rawBlob||pending.rawFile,'wardrobe','jpg'):null;assertAccount(ticket);row.cutout=useCut;
      }
      var query=cloud.database.from('wardrobe_items');
      var r=editing?await query.update(row).eq('id',editing).select():await query.insert(row).select();assertAccount(ticket);
      if(r.error||!r.data||!r.data.length)throw new Error(r.error&&r.error.message||'保存失败，单品可能已被删除');
      if(editing)state.wardrobe=state.wardrobe.map(function(i){return String(i.id)===String(editing)?r.data[0]:i;});else state.wardrobe.unshift(r.data[0]);
      clearPendingImage();state.editingItemId=null;$('#addPanel').hidden=true;$('#itemImage').value='';$('#itemCamera').value='';
      renderCloset();renderPicker();renderManual();renderReference();updateCounts();toast(editing?'单品修改已保存':'单品已保存到衣橱','ok');
    }catch(e){if(isCurrentAccount(ticket))toast(e.message||'保存失败，请重试','err');}
    finally{if(isCurrentAccount(ticket)){state.itemSaving=false;setItemFormBusy(false);}}
  }

  async function deleteItem(id) {
    var key='item:'+id;if(state.deleting.has(key)||state.deleting.has('cut:'+id)||(state.itemSaving&&String(state.editingItemId)===String(id)))return;state.deleting.add(key);
    var ticket=accountTicket();
    try{
    if (!await ensureSession() || !isCurrentAccount(ticket)) return;
    if (!window.confirm('确定把这件单品从衣橱移除吗？')) return;
    var r = await cloud.database.from('wardrobe_items').delete().eq('id', id).select();
    if(!isCurrentAccount(ticket))return;
    var removed = Array.isArray(r.data) ? r.data : [];
    if (r.error || !removed.length) { toast('移除失败，可能登录已失效', 'err'); return; }
    // Keep photo snapshots used by saved outfits. Server-side cleanup handles unreferenced files.
    state.wardrobe = state.wardrobe.filter(function (i) { return String(i.id) !== String(id); });
    state.selected.delete(Number(id));
    renderCloset(); renderPicker(); renderManual(); renderReference(); updateCounts();
    toast('已移除', 'ok');
    }finally{if(isCurrentAccount(ticket))state.deleting.delete(key);}
  }

  /* ---------------- 个人档案 ---------------- */
  function profileRow() {
    var h = parseInt($('#pfHeight').value, 10);
    var w = parseFloat($('#pfWeight').value);
    return {
      nickname: $('#pfNickname').value.trim(),
      gender: $('#pfGender').value,
      height_cm: Number.isFinite(h) && h > 0 ? h : null,
      weight_kg: Number.isFinite(w) && w > 0 ? w : null,
      body_shape: $('#pfShape').value,
      skin_tone: $('#pfSkin').value,
      hair_color: $('#pfHair').value,
      style_prefs: Array.from(state.profileStyles),
      owner_name: (state.session.user || {}).name || null,
      updated_at: new Date().toISOString()
    };
  }

  function validProfileRow(){
    var height=$('#pfHeight').value.trim(),weight=$('#pfWeight').value.trim();
    if(height&&(!Number.isInteger(Number(height))||Number(height)<120||Number(height)>220))throw Error('身高请填写 120–220 之间的整数，或留空');
    if(weight&&(!Number.isFinite(Number(weight))||Number(weight)<30||Number(weight)>180))throw Error('体重请填写 30–180 kg 之间的数字，或留空');
    return profileRow();
  }
  function persistProfile(extra) {
    if(!state.dataReady)return Promise.resolve(false);
    var ticket=accountTicket(),row;
    try{row=Object.assign(validProfileRow(),extra||{});}catch(e){toast(e.message,'err');$('#profileSaveNote').textContent=e.message;return Promise.resolve(false);}
    var signature=JSON.stringify(row);if(state.profilePromise&&state.profileSignature===signature)return state.profilePromise;
    var previous=state.profilePromise;
    $('#saveProfileBtn').disabled=true;$('#saveProfileBtn').textContent='保存中…';
    var job=(async function(){
      if(previous)await previous;assertAccount(ticket);
      if(!await ensureSession()||!isCurrentAccount(ticket))return false;
      var query=cloud.database.from('profiles');
      var r=state.profile&&state.profile.id?await query.update(row).eq('id',state.profile.id).select():await query.insert(row).select();assertAccount(ticket);
      if(r.error||!r.data||!r.data.length)throw new Error(r.error&&r.error.message||'档案保存失败，请重试');
      state.profile=r.data[0];renderSideUser();renderReference();
      $('#profileSaveNote').textContent='已保存 · '+new Date().toLocaleTimeString('zh-CN');toast('档案已保存','ok');return true;
    })().catch(function(e){if(isCurrentAccount(ticket)){toast(e.message||'档案保存失败','err');$('#profileSaveNote').textContent=e.message;}return false;}).finally(function(){
      if(isCurrentAccount(ticket)&&state.profilePromise===job){state.profilePromise=null;state.profileSignature='';$('#saveProfileBtn').disabled=false;$('#saveProfileBtn').textContent='保存我的档案';}
    });
    state.profilePromise=job;state.profileSignature=signature;return job;
  }

  async function uploadFace() {
    var ticket=accountTicket();
    var pending = state.facePending;
    if (pending && pending.processing) return;
    var file = pending ? (pending.blob || pending.file) : ($('#faceImage').files[0] || null);
    if(!state.dataReady)return;
    try{validProfileRow();}catch(e){faceStatus(e.message,'err');return;}
    if (!file) { toast('先点「拍照」或「从相册选」选一张照片', 'warn'); return; }
    var btn = $('#uploadFaceBtn');
    if (btn.disabled) return;
    btn.disabled = true; btn.textContent = '上传中…';
    $('#faceImage').disabled = true; $('#faceCamera').disabled = true;
    faceStatus('正在上传并保存照片…');
    try {
      if (!await ensureSession()) throw new Error('登录已失效，请重新登录后保存照片');
      if(!isCurrentAccount(ticket))return;
      var ext = (file.type || '').split('/')[1] || 'jpg';
      var path = await uploadImage(file, 'face', ext);
      if(!isCurrentAccount(ticket))return;
      var old = state.profile && state.profile.face_photo_path;
      var ok = await persistProfile({ face_photo_path: path });
      if(!isCurrentAccount(ticket))return;
      // Retain previous private photos if a saved outfit still references them.
      if (ok) {
        clearFacePending();
        $('#faceImage').value = ''; $('#faceCamera').value = '';
        renderReference();
        faceStatus('已保存面部参考照片。');
      } else faceStatus('照片尚未保存，请检查登录状态后重试。', 'err');
    } catch (e) {
      if(!isCurrentAccount(ticket))return;
      faceStatus(e.message || '照片上传失败，请重试', 'err');
      toast(e.message || '照片上传失败', 'err');
    } finally {
      if(isCurrentAccount(ticket)){btn.disabled = !state.facePending; btn.textContent = '保存这张照片';
      $('#faceImage').disabled = false; $('#faceCamera').disabled = false;}
    }
  }

  /* ---------------- 服务端搭配 ---------------- */
  function climateOptions() {
    return {temperature:Number($('#tempRange').value),season:$('#seasonSel').value,weather:$('#weatherSel').value,style:state.style,occasion:state.occasion,variant:state.planVariant || 0};
  }
  function syncClimateControls(reset) {
    if(reset)$('#tempRange').value=window.OutfitPlanner.seasonDefaults[$('#seasonSel').value];
    var c=window.OutfitPlanner.climateFor(climateOptions());
    $('#tempVal').textContent=c.temperature+'°C';
    $('#climateHint').textContent=c.label+'：'+c.advice+' 季节默认值仅作示例；修改后点击生成更新搭配。';
    updateManualSummary();
  }
  async function generate() {
    var ticket=accountTicket();
    if(state.generating || !state.dataReady)return;
    var request=++state.planRequest;
    state.generating=true;
    var btn=$('#generateBtn');btn.disabled=true;btn.textContent='正在生成…';
    $('#genStatus').className='gen-status loading';$('#genStatus').textContent='后台正在按季节、温度与当前衣橱整理搭配…';
    try{
      if(!await ensureSession() || !isCurrentAccount(ticket))return;
      var options=climateOptions();options.extra=$('#extraInput').value.trim().slice(0,120);
      options.variant=(state.planVariant || 0)+1;
      options.selectedIds=state.wardrobe.filter(function(i){return state.selected.has(Number(i.id));}).map(function(i){return Number(i.id);});
      var response=await cloud.fetch('/api/outfits/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(options)});
      var result=await response.json();assertAccount(ticket);
      if(request!==state.planRequest)return;
      if(!response.ok)throw new Error(result.error&&result.error.message || '搭配生成失败，请重试');
      if(!result.data || !Array.isArray(result.data.items) || !Array.isArray(result.data.gaps))throw new Error('搭配数据不完整，请重试');
      var plan=result.data;
      await refreshImages(plan.items.map(function(i){return i.image_path;}));assertAccount(ticket);
      if(request!==state.planRequest)return;
      state.planVariant=options.variant;state.current=plan;
      renderResult();startLook(plan);
      $('#genStatus').className='gen-status';$('#genStatus').textContent=plan.source==='ai'?'已由后台 AI 生成，并检查衣橱与温度适配。':'已由后台内置规则生成；无需外部 AI 即可使用。';
      if($('#autoTryon').checked && state.tryonConfig && state.tryonConfig.configured)runTask(function(){return startTryon(plan,true);});
      setTimeout(function(){if(isCurrentAccount(ticket)&&state.current===plan)$('#resultArea').scrollIntoView({behavior:'smooth',block:'start'});},120);
    }catch(e){if(isCurrentAccount(ticket)){var message=e.message||'生成失败，请重试';$('#genStatus').className='gen-status';$('#genStatus').textContent=message;toast(message,'err');}}
    finally{if(isCurrentAccount(ticket)){state.generating=false;btn.disabled=false;btn.textContent='生成我的搭配';}}
  }

  /* ---------------- 整套穿搭效果图 ---------------- */
  function tryonHtml(c) {
    var url=c.tryonImage && state.imageUrls[c.tryonImage];
    var busy=state.tryonGenerating;
    return '<div class="tryon-head"><div><span class="eyebrow">YOUR PERSONAL LOOK</span><h3>我的全身穿搭图</h3></div><span class="badge">20–30 岁 · 自然日常</span></div>'+
      (url?'<img class="tryon-image" src="'+esc(url)+'" alt="根据你的面部参考与身材资料生成的全身穿搭图">':'<div class="tryon-empty"><svg><use href="#i-user"/></svg><b>'+(busy?'正在生成你的全身穿搭图…':'你的衣服和推荐款，都能组成完整穿搭图')+'</b><p>基于你的面部和身材资料：有照片的衣服按实拍还原，没有照片或尚未购买的款式按搭配建议生成。衣橱为空也能生成参考。</p></div>')+
      '<div class="tryon-piece-list">'+(c.items||[]).map(function(i){return '<span class="badge">已有 · '+esc(i.name)+'</span>';}).join('')+(c.gaps||[]).map(function(i){return '<span class="badge">待购参考 · '+esc(i.name)+'</span>';}).join('')+'</div>'+
      '<p class="tryon-note">AI 生成的视觉参考，可能存在面部、比例或服装细节偏差，不代表真实试穿或准确尺码。</p>'+
      '<p class="tryon-status" role="status">'+esc(c.tryonMessage || (!state.tryonConfig?.configured?(url?'这是本账号保存的穿搭图；自动生图 API 尚未配置。':'本账号还没有这套穿搭图；自动生图 API 尚未配置。'):''))+'</p>'+
      '<div class="tryon-actions">'+(url?'<a class="btn-primary" href="'+esc(url)+'" download="我的全身穿搭.webp">保存全身图</a>':'')+
      '<button type="button" class="btn-ghost" data-action="tryon" '+(busy||!state.tryonConfig?.configured?'disabled':'')+'>'+(busy?'正在生成…':url?'重新生成本人穿搭图':'生成本人穿搭图')+'</button></div>'+
      (state.tryonConfig?.configured?'<label class="tryon-consent"><input type="checkbox" id="tryonConsent">同意将本次面部照片、身材资料和衣服参考图发送至 '+esc(state.tryonConfig.provider)+' 用于生图，结果自动保存到搭配收藏。</label>':'');
  }

  async function startTryon(c,consent) {
    var ticket=accountTicket();
    if(state.tryonGenerating)return;
    if(!consent){toast('请先勾选本次生图资料使用确认','warn');return;}
    if(!state.profile?.face_photo_path||!state.profile.height_cm||!state.profile.weight_kg){toast('请先保存面部照片、身高和体重','warn');switchNav('profile');return;}
    state.tryonGenerating=true;c.tryonMessage='正在生成全身图，通常需要一两分钟，请保留页面。';
    $('#tryonBox').innerHTML=tryonHtml(c);
    try {
      var res=await cloud.fetch('/api/tryon',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({consent:true,plan:c})});
      var response=await res.json();if(!res.ok)throw new Error(response.error?.message||'生图失败');
      if(!isCurrentAccount(ticket))return;
      c.tryonImage=response.data.path;c.savedId=response.data.outfit.id;
      state.saved.unshift(response.data.outfit);updateCounts();renderSaved();
      await refreshImages([c.tryonImage]);if(!isCurrentAccount(ticket))return;c.tryonMessage='全身图已生成，并保存到搭配收藏。';
    }catch(e){if(!isCurrentAccount(ticket))return;c.tryonMessage=e.message;toast(e.message,'err');}
    finally{if(isCurrentAccount(ticket)){state.tryonGenerating=false;if(state.current===c && $('#tryonBox'))$('#tryonBox').innerHTML=tryonHtml(c);}}
  }

  function lookSource(plan) {
    if (!plan || !plan.lookImage) return '';
    return state.lookUrls[plan.lookImage] || state.imageUrls[plan.lookImage] || '';
  }

  function lookHtml(c) {
    var src = lookSource(c);
    var visual = window.OutfitReference.boardHtml(c,function(path){return state.imageUrls[path] || '';});
    return '<div class="look-head"><div><span class="lk-title">这套怎么搭 · 图片参考</span>' +
      '<span class="lk-sub">先看组合，再看搭配说明</span></div>' +
      '<span class="lk-sub">' + esc((c.items || []).length) + ' 件单品</span></div>' +
      visual +
      '<div class="look-actions">' +
      (src ? '<button type="button" class="btn-primary" data-action="download-look">下载整套参考图</button>' : '<span class="hint">'+(c.lookFailed?'参考板可查看；导出失败，可重试。':c.lookBuilding?'正在准备下载图片…':'参考板可直接查看，也可导出保存。')+'</span>') +
      '<button type="button" class="btn-ghost" data-action="regen-look" '+(c.lookBuilding?'disabled':'')+'>'+(c.lookBuilding?'正在导出…':'导出整套参考图')+'</button></div>' +
      '<div class="look-note">「衣橱 · 实拍」来自你上传的照片；「款式示意」用于展示缺少的单品或暂无照片的单品，不是真实商品照片或真人试穿效果。</div>';
  }

  function renderLook() {
    var box = $('#lookBox');
    if (!box || !state.current) return;
    box.innerHTML = lookHtml(state.current);
  }

  async function buildLook(plan) {
    var ticket=accountTicket();
    if (!window.OutfitLook) throw new Error('效果图模块没有加载');
    var blob = await window.OutfitLook.render(plan, function (path) { return state.imageUrls[path] || ''; });
    assertAccount(ticket);
    var path = await uploadImage(blob, 'looks', 'png');
    assertAccount(ticket);
    state.lookUrls[path] = URL.createObjectURL(blob);
    plan.lookImage = path;
    return path;
  }

  function startLook(plan) {
    if(plan.lookBuilding)return state.lookPromise;
    var ticket=accountTicket();
    plan.lookFailed = false;plan.lookBuilding=true;
    state.lookPromise = buildLook(plan).catch(function () {
      if(isCurrentAccount(ticket))plan.lookFailed = true;
      return null;
    }).then(function () {
      if(isCurrentAccount(ticket))plan.lookBuilding=false;
      if (isCurrentAccount(ticket) && state.current === plan) renderLook();
    });
    return state.lookPromise;
  }

  function downloadLook() {
    var src = lookSource(state.current);
    if (!src) { toast('效果图还在生成中，稍等一下', 'warn'); return; }
    var a = document.createElement('a');
    a.href = src;
    a.download = '穿搭魔镜-' + String((state.current && state.current.title) || '今日搭配').replace(/[\\/:*?"<>|]/g, '') + '.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast('效果图已保存', 'ok');
  }

  function renderResult() {
    var c = state.current;
    if (!c || !state.session) { $('#resultArea').innerHTML='';$('#resultArea').hidden = true; return; }
    c.items = Array.isArray(c.items) ? c.items.filter(function(i){return i&&typeof i==='object'&&!Array.isArray(i);}) : [];
    c.gaps = Array.isArray(c.gaps) ? c.gaps.filter(function(i){return i&&typeof i==='object'&&!Array.isArray(i);}) : [];
    c.tips = Array.isArray(c.tips) ? c.tips : [];
    c.warnings=Array.isArray(c.warnings)?c.warnings:[];
    var itemsHtml = c.items.length
      ? '<div class="outfit-items">' + c.items.map(function (i) {
          return '<div class="outfit-item"><div class="pic">' +
            (i.image_path && state.imageUrls[i.image_path] ? '<img src="' + esc(state.imageUrls[i.image_path]) + '" alt="">' : '<svg><use href="#i-hanger"/></svg>') +
            '</div><div class="info"><div class="cat">' + esc(i.category) + '</div>' +
            '<div class="nm" title="' + esc(i.name) + '">' + esc(i.name) + '</div>' +
            '<div class="why">' + esc(i.why || '衣橱里的这一件，负责撑起整套的基调。') + '</div></div></div>';
        }).join('') + '</div>'
      : '<div class="closet-empty">这套方案暂时没有用到衣橱单品。去「我的衣橱」添加几件常穿的衣服，就能让 AI 优先用你已有的东西来搭。</div>';

    var gapsHtml = '<div class="gaps">' + c.gaps.map(function (g, index) {
      return '<div class="gap"><div class="gap-summary">'+window.OutfitReference.itemHtml(g)+'<div class="gap-copy"><div class="top"><span class="nm">' + esc(g.name) + '</span><span class="budget">' + esc(g.budget) + '</span></div>' +
        '<div class="advice">' + esc(g.advice) + '</div><p class="gap-reference-note">先看颜色与款式，再看整套搭配效果。图片仅作风格参考。</p></div></div>' +
        '<details class="gap-shopping"><summary>淘宝商品与购买链接</summary><div class="shopping-slot" data-shopping-gap="' + index + '"></div></details></div>';
    }).join('') + '</div>';

    var tipsHtml = c.tips.length ? '<div class="sec-title">穿搭小技巧</div><ul class="tips">' + c.tips.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' : '';

    $('#resultArea').innerHTML =
      '<div class="result-head"><div><div class="eyebrow">' + (c.source === 'manual' ? 'MY OWN COMBINATION' : c.source === 'ai' ? 'AI OUTFIT PLAN' : 'RULE-BASED PLAN') + '</div>' +
      '<h3>' + esc(c.title) + '</h3></div><div class="result-actions">' +
      '<button type="button" class="btn-ghost" data-action="'+(c.source==='manual'?'edit-manual':'regen')+'">'+(c.source==='manual'?'继续滑动换单品':'换一套')+'</button>' +
      '<button type="button" class="btn-primary" data-action="save" '+(c.saving?'disabled':'')+'>'+(c.saving?'收藏中…':c.savedId?'已收藏':'收藏这套')+'</button></div></div>' +
      (c.source==='manual'?'':'<div class="tryon-visual" id="tryonBox">'+tryonHtml(c)+'</div>')+
      '<details class="look-details"'+(c.source==='manual'?' open':'')+'><summary>查看这套的单品照片与补购参考</summary><div class="look-visual" id="lookBox">' + lookHtml(c) + '</div></details>' +
      (c.source==='manual'?'<div class="tryon-visual" id="tryonBox">'+tryonHtml(c)+'</div>':'')+
      '<div class="result-card">' +
      '<div class="badge-row"><span class="badge hot">' + esc(c.style) + '</span><span class="badge">' + esc(c.occasion) + '</span>' +
      '<span class="badge">' + esc(c.temperature) + '°C · ' + esc(c.weather) + '</span>' +
      (c.season?'<span class="badge">'+esc(c.season)+'</span>':'')+
      '<span class="badge">来自你的衣橱 ' + c.items.length + ' 件</span><span class="badge">待补 ' + c.gaps.length + ' 件</span></div>' +
      '<p class="concept">' + esc(c.concept) + '</p>' +
      (c.climate?'<div class="climate-result"><b>'+esc(c.climate.label)+' · '+esc(c.styleGuide||c.style)+'</b><p>'+esc(c.climate.advice)+'</p><small>按你设置的温度选材质与层次；季节默认值是示例，不是天气预报。</small></div>':'')+
      (c.climate&&/参考图|学院|复古|甜酷/.test(c.style)?'<details class="style-source"><summary>查看风格灵感图库</summary><a href="'+window.OutfitStyleGuide.referenceFor(c.climate)+'" target="_blank" rel="noopener"><img src="'+window.OutfitStyleGuide.referenceFor(c.climate)+'" alt="学院与甜酷穿搭灵感拼图" loading="lazy"></a><p>这是服装风格示例，不是本人试穿结果。借鉴配色、领型与版型，保暖层次以本套建议为准。点击图片可放大。</p></details>':'')+
      ((c.warnings||[]).length?'<ul class="climate-warnings">'+c.warnings.map(function(w){return '<li>'+esc(w)+'</li>';}).join('')+'</ul>':'')+
      '<div class="notes">' +
      '<div class="note"><b>配色逻辑</b><p>' + esc(c.color_logic) + '</p></div>' +
      '<div class="note"><b>身形与面部适配</b><p>' + esc(c.fit_note) + '</p></div>' +
      '<div class="note"><b>场合提示</b><p>' + esc(c.occasion_note) + '</p></div>' +
      '</div>' +
      '<div class="sec-title">用你衣橱里的这些 <small>已选单品会优先出现</small></div>' + itemsHtml +
      (c.gaps.length ? '<div class="sec-title">缺少的单品 · 图片参考 <small>文字与对应款式一起看</small></div>' + gapsHtml +
      '<div class="tb-note">商品卡展示淘宝款式候选；人像图与款式示意仅供搭配参考。预算为选型参考，购买前请核对实物颜色与尺码。</div>' : '') +
      tipsHtml + '</div>';
    $('#resultArea').hidden = false;
    if(window.OutfitShopping)window.OutfitShopping.mount($('#resultArea'),c);
  }

  async function saveOutfit() {
    var ticket=accountTicket();
    if (!state.current || state.current.saving) return;
    if (state.current.savedId) { toast('这套已经保存在搭配收藏','ok'); return; }
    var c=state.current;c.saving=true;renderResult();
    try{
    if (!await ensureSession() || !isCurrentAccount(ticket)) return;
    if (state.lookPromise) { try { await state.lookPromise; } catch (e) { /* 效果图失败不阻塞收藏 */ } }
    if(!isCurrentAccount(ticket))return;
    var payload=Object.assign({},c);delete payload.saving;delete payload.lookBuilding;
    var r = await cloud.database.from('outfits').insert({
      title: c.title, style: c.style, occasion: c.occasion,
      payload: payload, owner_name: (state.session.user || {}).name || null
    }).select();
    if(!isCurrentAccount(ticket))return;
    if (r.error || !r.data || !r.data.length) { toast('收藏失败：' + (r.error ? r.error.message : '请重新登录'), 'err'); return; }
    state.saved.unshift(r.data[0]);
    c.savedId=r.data[0].id;
    renderSaved(); updateCounts();
    toast('已收藏到「搭配收藏」', 'ok');
    }finally{if(isCurrentAccount(ticket)){c.saving=false;if(state.current===c)renderResult();}}
  }

  async function deleteSaved(id) {
    var key='outfit:'+id;if(state.deleting.has(key))return;state.deleting.add(key);
    var ticket=accountTicket();
    try{
    if (!await ensureSession() || !isCurrentAccount(ticket)) return;
    if (!window.confirm('删除这套收藏的搭配吗？')) return;
    var r = await cloud.database.from('outfits').delete().eq('id', id).select();
    if(!isCurrentAccount(ticket))return;
    var removed = Array.isArray(r.data) ? r.data : [];
    if (r.error || !removed.length) { toast('删除失败，可能登录已失效', 'err'); return; }
    state.saved = state.saved.filter(function (s) { return String(s.id) !== String(id); });
    if(state.current&&String(state.current.savedId)===String(id)){delete state.current.savedId;renderResult();}
    renderSaved(); updateCounts();
    toast('已删除', 'ok');
    }finally{if(isCurrentAccount(ticket))state.deleting.delete(key);}
  }

  function viewSaved(id) {
    var ticket=accountTicket();
    var row = state.saved.find(function (s) { return String(s.id) === String(id); });
    if (!row || !row.payload) { toast('这套方案的内容不完整', 'warn'); return; }
    state.planRequest++;
    state.current = Object.assign({},row.payload,{savedId:row.id});
    var paths = (Array.isArray(state.current.items)?state.current.items:[]).filter(Boolean).map(function (i) { return i.image_path; });
    if (state.current.lookImage) paths.push(state.current.lookImage);
    if (state.current.tryonImage) paths.push(state.current.tryonImage);
    refreshImages(paths).then(function () {
      if(!isCurrentAccount(ticket))return;
      switchNav('today');
      renderResult();
      setTimeout(function () { if(isCurrentAccount(ticket))$('#resultArea').scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 150);
    });
  }

  async function refreshServiceStatus(){
    var ticket=accountTicket(),button=$('#refreshServicesBtn');button.disabled=true;$('#serviceStatusMessage').textContent='正在读取后台状态…';
    try{
      var response=await cloud.fetch('/api/status'),value=await response.json();assertAccount(ticket);
      if(!response.ok||!value.data)throw Error(value.error&&value.error.message||'后台状态读取失败');
      var s=value.data;state.services=s;
      var rows=[['数据存储',s.storage&&s.storage.ready?'SQLite 已就绪':'不可用'],['季节温度搭配',s.planner&&s.planner.ready?'本地后台已就绪':'不可用'],['衣物单品处理',s.garment&&s.garment.modelPresent?'本机模型文件已准备':'未准备，可保留原图'],['文字 AI',s.textAI&&s.textAI.configured?'已配置，调用时验证':'未配置，使用本地搭配规则'],['本人穿搭图',s.tryon&&s.tryon.configured?'已配置，生成时验证':'未配置，自动生图不可用'],['淘宝真实商品',s.shopping&&s.shopping.configured?'已配置，查询时验证':'未配置，可直接打开淘宝网页搜索']];
      $('#serviceStatusList').innerHTML=rows.map(function(row){return '<div><dt>'+esc(row[0])+'</dt><dd>'+esc(row[1])+'</dd></div>';}).join('');
      $('#serviceStatusMessage').textContent='后台版本 '+s.version+' · 配置状态不代表外部服务已通过真实调用验证。';
    }catch(e){if(isCurrentAccount(ticket))$('#serviceStatusMessage').textContent=e.message||'后台检查失败，请重试';}
    finally{if(isCurrentAccount(ticket))button.disabled=false;}
  }
  async function removeFace(){
    var ticket=accountTicket();if(!state.profile?.face_photo_path)return;
    if(!window.confirm('移除当前账号的面部参考照片？已收藏的穿搭图仍会保留。'))return;
    var button=$('#removeFaceBtn');button.disabled=true;
    try{if(await persistProfile({face_photo_path:null})){assertAccount(ticket);clearFacePending();$('#faceImage').value='';$('#faceCamera').value='';renderReference();faceStatus('面部参考照片已移除。');}}
    finally{if(isCurrentAccount(ticket))button.disabled=!state.profile?.face_photo_path;}
  }
  async function exportBackup(){
    if(state.savingBackup)return;var ticket=accountTicket();state.savingBackup=true;$('#exportBackupBtn').disabled=true;$('#importStatus').textContent='正在导出本账号备份…';
    try{
      var response=await cloud.fetch('/api/backup');if(!response.ok){var error=await response.json();throw Error(error.error&&error.error.message||'备份导出失败');}
      var blob=await response.blob();assertAccount(ticket);var url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='穿搭魔镜备份-'+new Date().toISOString().slice(0,10)+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},1000);$('#importStatus').textContent='备份已生成，请妥善保存下载文件。';
    }catch(e){if(isCurrentAccount(ticket))$('#importStatus').textContent=e.message||'备份导出失败';}
    finally{if(isCurrentAccount(ticket)){state.savingBackup=false;$('#exportBackupBtn').disabled=false;}}
  }
  async function changePassword(){
    var ticket=accountTicket();
    var button=$('#changePasswordBtn');if(button.disabled)return;
    var current=$('#passwordCurrent').value,next=$('#passwordNew').value,confirm=$('#passwordConfirm').value;
    if(current.length<10||current.length>200||next.length<10||next.length>200){$('#passwordStatus').textContent='当前密码和新密码都应为 10–200 位';return;}
    if(next!==confirm){$('#passwordStatus').textContent='两次输入的新密码不一致';return;}
    button.disabled=true;$('#passwordStatus').textContent='正在修改密码…';
    try{
      var r=await cloud.auth.changePassword(current,next);
      if(r.error){if(isCurrentAccount(ticket)&&r.error.code!=='ACCOUNT_CHANGED')$('#passwordStatus').textContent=r.error.message;return;}
      resetAccount(null);showAuth();authError('密码已修改，请使用新密码重新登录。');$('#localPassword').value='';
    }catch(e){if(isCurrentAccount(ticket))$('#passwordStatus').textContent=e.message||'密码修改失败';}
    finally{if(isCurrentAccount(ticket)||!state.session)button.disabled=false;}
  }

  /* ---------------- 事件绑定 ---------------- */
  function bindEvents() {
    $('#authModeTabs').addEventListener('click',function(e){
      var t=e.target.closest('[data-auth-mode]'); if(!t) return;
      authMode=t.dataset.authMode;
      $$('#authModeTabs .tab').forEach(function(b){b.classList.toggle('active',b===t);});
      $('#localLoginBtn').textContent=authMode==='register'?'注册并进入':'登录';
      $('#localPassword').autocomplete=authMode==='register'?'new-password':'current-password';
      authError('');
    });
    $('#localLoginBtn').addEventListener('click',function(){runTask(localLogin);});
    $('#localPassword').addEventListener('keydown',function(e){if(e.key==='Enter')runTask(localLogin);});
    $('#importBackup').addEventListener('change',async function(){
      if(this.disabled)return;
      var ticket=accountTicket();
      var file=this.files[0]; if(!file) return;
      var status=$('#importStatus');
      if(file.size>64*1024*1024){status.textContent='备份不能超过 64MB';return;}
      if(!state.dataReady){status.textContent='请先完成账号数据载入';this.value='';return;}
      if(state.profile||state.wardrobe.length||state.saved.length){status.textContent='为避免覆盖，备份只能导入一个空账号。';this.value='';return;}
      if(!window.confirm('导入会写入当前空账号，请确认这是你自己的备份。'+(state.facePending||state.pendingImage?' 尚未保存的图片选择会被清除。':''))){this.value='';return;}
      clearPendingImage();clearFacePending();
      this.disabled=true;status.textContent='正在校验并导入…';
      try {
        var parsed=JSON.parse(await file.text());
        if(!isCurrentAccount(ticket))return;
        var r=await cloud.fetch('/api/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(parsed)});
        var value=await r.json();if(!r.ok)throw new Error(value.error.message);
        if(!isCurrentAccount(ticket))return;
        state.imageUrls={};await loadData();if(isCurrentAccount(ticket))status.textContent='备份已导入。';
      }catch(e){if(isCurrentAccount(ticket))status.textContent='导入失败：'+e.message;}
      finally{if(isCurrentAccount(ticket)){this.disabled=false;this.value='';}}
    });
    $('#logoutBtn').addEventListener('click', async function () {
      resetAccount(null);
      authError(''); showAuth();
      $('#localLoginBtn').disabled=true;
      var r=await cloud.auth.signOut();
      $('#localLoginBtn').disabled=false;
      if(r.error)authError(r.error.message);
    });

    document.addEventListener('click', function (e) {
      var nav = e.target.closest('[data-nav]');
      if (nav) { switchNav(nav.dataset.nav); return; }
      var outfitMode=e.target.closest('[data-outfit-mode]');if(outfitMode){setOutfitMode(outfitMode.dataset.outfitMode);return;}
      var manualStep=e.target.closest('[data-manual-step]');if(manualStep){moveManual(manualStep.dataset.manualKey,Number(manualStep.dataset.manualStep));return;}
      var manualAdd=e.target.closest('[data-manual-add]');if(manualAdd){switchNav('closet');openItemEditor(null);$('#itemCategory').value=manualAdd.dataset.manualAdd;return;}

      var chip = e.target.closest('.chip');
      if (chip && chip.parentElement) {
        var box = chip.parentElement;
        var v = chip.dataset.value;
        if (box.id === 'styleChips') { state.style = v; box.innerHTML = chipsHtml(STYLES, state.style, false); }
        else if (box.id === 'occasionChips') { state.occasion = v; box.innerHTML = chipsHtml(OCCASIONS, state.occasion, false); }
        else if (box.id === 'filterChips') { state.filter = v; box.innerHTML = chipsHtml(CATEGORIES, state.filter, false); renderCloset(); }
        else if (box.id === 'pfStyleChips') {
          if (state.profileStyles.has(v)) state.profileStyles.delete(v); else state.profileStyles.add(v);
          box.innerHTML = chipsHtml(STYLES, state.profileStyles, true);
        }
        return;
      }

      var pick = e.target.closest('.pick');
      if (pick) {
        var id = Number(pick.dataset.id);
        if (state.selected.has(id)) state.selected.delete(id); else state.selected.add(id);
        pick.classList.toggle('on', state.selected.has(id));
        return;
      }
      var del = e.target.closest('[data-del]');
      if (del) { runTask(function(){return deleteItem(del.dataset.del);}); return; }
      var edit=e.target.closest('[data-edit]');if(edit){openItemEditor(edit.dataset.edit);return;}
      var cutBtn = e.target.closest('[data-cutout]');
      if (cutBtn) { runTask(function(){return recutItem(cutBtn.dataset.cutout);}); return; }
      var modeBtn = e.target.closest('[data-cutmode]');
      if (modeBtn) { setCutMode(modeBtn.dataset.cutmode); return; }
      var view = e.target.closest('[data-view]');
      if (view) { viewSaved(view.dataset.view); return; }
      var undel = e.target.closest('[data-undel]');
      if (undel) { runTask(function(){return deleteSaved(undel.dataset.undel);}); return; }
      var act = e.target.closest('[data-action]');
      if (act) {
        if (act.dataset.action === 'tryon') runTask(function(){return startTryon(state.current,!!$('#tryonConsent')?.checked);});
        if (act.dataset.action === 'save') runTask(saveOutfit);
        if (act.dataset.action === 'regen') runTask(generate);
        if (act.dataset.action === 'edit-manual') editManualPlan();
        if (act.dataset.action === 'download-look') downloadLook();
        if (act.dataset.action === 'regen-look' && state.current) {
          if(state.current.lookBuilding)return;
          state.current.lookImage = '';
          startLook(state.current);
          renderLook();
        }
        return;
      }
    });

    $('#tempRange').addEventListener('input', function () { syncClimateControls(false); });
    $('#manualApplyBtn').addEventListener('click',function(){runTask(applyManual);});
    $('#manualSeason').addEventListener('change',function(){$('#seasonSel').value=this.value;syncClimateControls(true);});
    $('#manualWeather').addEventListener('change',function(){$('#weatherSel').value=this.value;syncClimateControls(false);});
    $('#manualTemperature').addEventListener('change',function(){if(!this.validity.valid||this.value===''){this.value=$('#tempRange').value;toast('温度请填写 -10 到 40°C','warn');return;}$('#tempRange').value=String(Math.round(Number(this.value)));syncClimateControls(false);});
    $('.outfit-mode-tabs').addEventListener('keydown',function(e){if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();var mode=e.key==='Home'?'auto':e.key==='End'?'manual':state.outfitMode==='auto'?'manual':'auto';setOutfitMode(mode);$('[data-outfit-mode="'+mode+'"]').focus();});
    window.addEventListener('resize',function(){if(state.outfitMode==='manual')alignManualRows();});
    $('#seasonSel').addEventListener('change',function(){syncClimateControls(true);});
    $('#weatherSel').addEventListener('change',function(){syncClimateControls(false);});
    $('#seasonSel').value=window.OutfitPlanner.currentSeason(new Date().getMonth()+1);
    syncClimateControls(true);
    $('#generateBtn').addEventListener('click',function(){runTask(generate);});
    $('#openAddBtn').addEventListener('click',function(){openItemEditor(null);});
    $('#cancelItemBtn').addEventListener('click',cancelItemEditor);
    $('#retryDataBtn').addEventListener('click',function(){runTask(enterApp);});
    $('#refreshServicesBtn').addEventListener('click',function(){runTask(refreshServiceStatus);});
    $('#changePasswordBtn').addEventListener('click',function(){runTask(changePassword);});
    $('#exportBackupBtn').addEventListener('click',function(){runTask(exportBackup);});
    $('#removeFaceBtn').addEventListener('click',function(){runTask(removeFace);});
    $('#itemCategory').addEventListener('change', function () {
      var p = state.pendingImage;
      if (p) handleItemImage(p.rawFile);
    });
    $('#retryGarmentBtn').addEventListener('click', function () {
      var p=state.pendingImage;
      if (p && !p.processing) handleItemImage(p.rawFile);
    });
    ['#itemImage', '#itemCamera'].forEach(function (sel) {
      $(sel).addEventListener('click', function () { this.value = ''; });
      $(sel).addEventListener('change', function () { handleItemImage(this.files[0]); });
    });
    $('#saveItemBtn').addEventListener('click',function(){runTask(addItem);});
    $('#saveProfileBtn').addEventListener('click', function () { runTask(function(){return persistProfile({});}); });
    $('#pfHeight').addEventListener('input', updateBmi);
    $('#pfWeight').addEventListener('input', updateBmi);
    ['#faceImage', '#faceCamera'].forEach(function (sel) {
      // 点击的是原生文件框；不调用 click()/showPicker()，保留手机的用户手势。
      $(sel).addEventListener('click', function () { this.value = ''; });
      $(sel).addEventListener('change', function () { handleFaceImage(this.files[0]); });
    });
    $('#uploadFaceBtn').addEventListener('click',function(){runTask(uploadFace);});

    cloud.auth.onAuthStateChange(function (event) {
      if (event === 'SIGNED_OUT' || event === 'SESSION_CHANGED') {
        resetAccount(null);
        authError('');
        showAuth();
      }
    });
    window.addEventListener('focus',function(){if(state.session)runTask(ensureSession);});
    document.addEventListener('visibilitychange',function(){if(!document.hidden && state.session)runTask(ensureSession);});
    window.addEventListener('pageshow',function(e){if(e.persisted){resetAccount(null);showAuth();runTask(boot);}});
  }

  bindEvents();
  boot().catch(function (e) {
    showAuth();
    authError('初始化失败：' + (e && e.message ? e.message : '请刷新页面重试'));
  });
})();
