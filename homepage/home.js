/* 穿搭魔镜 · 项目主页交互：衣橱开门、魔镜试搭、看天穿衣。
   单品插画复用 look-reference.js，温度规则复用完整 App 的 outfit-plan.js，这里不重复实现规则。 */
(function(){
  'use strict';
  var doc=document,root=doc.documentElement;
  root.classList.add('js-ready');
  var Ref=window.OutfitReference,Planner=window.OutfitPlanner,Fabric=window.WeaveFabric;
  var motionQuery=window.matchMedia?window.matchMedia('(prefers-reduced-motion: reduce)'):{matches:false};
  function reduced(){return !!motionQuery.matches;}
  function $(id){return doc.getElementById(id);}
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function animate(el,frames,options){return el&&!reduced()&&typeof el.animate==='function'?el.animate(frames,options):null;}
  var ease='cubic-bezier(.2,.75,.2,1)';

  /* 示例衣橱：同一份数据供衣柜、三行演示和规则搭配使用。季节取值与完整 App 的单品表单一致；
     look 指定 fabric.js 的面料画法；规则给出的“待补”单品没有 look，仍用款式轮廓示意。 */
  var closet=[
    {id:1,name:'米白圆领针织衫',category:'上装',color:'米白',season:'春秋',look:'crew-knit'},
    {id:2,name:'浅蓝短袖衬衫',category:'上装',color:'浅蓝',season:'夏季',look:'shirt'},
    {id:3,name:'白色短袖 T 恤',category:'上装',color:'白色',season:'夏季',look:'tee'},
    {id:4,name:'酒红衬衫领针织衫',category:'上装',color:'酒红',season:'秋冬',look:'collar-knit'},
    {id:5,name:'灰色保暖长袖打底衫',category:'上装',color:'灰色',season:'冬季',look:'thermal'},
    {id:6,name:'灰色针织开衫',category:'外套',color:'灰色',season:'春秋',look:'cardigan'},
    {id:7,name:'藏蓝羽绒服',category:'外套',color:'藏蓝',season:'冬季',look:'puffer'},
    {id:8,name:'浅蓝直筒牛仔裤',category:'下装',color:'浅蓝',season:'四季',look:'jeans'},
    {id:9,name:'藏蓝百褶短裙',category:'下装',color:'藏蓝',season:'春夏',look:'pleat-mini'},
    {id:10,name:'奶白休闲长裤',category:'下装',color:'奶白',season:'春秋',look:'chino'},
    {id:11,name:'灰色百褶中裙',category:'下装',color:'灰色',season:'秋冬',look:'pleat-midi'},
    {id:12,name:'深灰加绒直筒长裤',category:'下装',color:'深灰',season:'冬季',look:'wool-trousers'},
    {id:13,name:'白色运动鞋',category:'鞋履',color:'白色',season:'四季',look:'sneaker'},
    {id:14,name:'黑色乐福鞋',category:'鞋履',color:'黑色',season:'四季',look:'loafer'},
    {id:15,name:'酒红玛丽珍鞋',category:'鞋履',color:'酒红',season:'春秋',look:'maryjane'},
    {id:16,name:'棕色短靴',category:'鞋履',color:'棕色',season:'秋冬',look:'boot'},
    {id:17,name:'浅灰腋下包',category:'包袋',color:'浅灰',season:'四季',look:'shoulder-bag'}
  ];
  var byId={};closet.forEach(function(item){byId[item.id]=item;});
  var state={season:'春季',temperature:18,weather:'晴',variant:0};

  function svgFor(item){
    if(Fabric&&Fabric.has(item))return Fabric.svg(item);
    return Ref?Ref.illustration(item):'<span class="fallback-name">'+esc(item.name)+'</span>';
  }
  function climate(){return Planner?Planner.climateFor({season:state.season,temperature:state.temperature,weather:state.weather}):null;}

  /* ---------- 衣柜：开门、挂衣、点一件放进魔镜 ---------- */
  /* x 为衣架中心（em）；面料图是 300×300 方形画布，上装肩线约在 15.7% 高度、下装腰头在 13.3% 高度，
     mt 让肩线/腰头落在衣架上；hook 是下装夹式衣架占画布宽度的比例。 */
  var heroLayout=[
    {id:6,x:3,w:7.6,h:7.6,mt:-1.31,tilt:-1.4,dur:4.9,delay:-.6},
    {id:1,x:6.15,w:7.4,h:7.4,mt:-1.28,tilt:1,dur:5.6,delay:-2.1},
    {id:4,x:9.3,w:7.4,h:7.4,mt:-1.28,tilt:-.5,dur:4.4,delay:-1.3},
    {id:2,x:12.4,w:7.2,h:7.2,mt:-1.25,tilt:1.2,dur:5.1,delay:-3},
    {id:9,x:15.3,w:8.4,h:8.4,mt:-1.32,hook:43,tilt:-1,dur:4.7,delay:-.2},
    {id:8,x:17.9,w:11.8,h:11.8,mt:-1.77,hook:40,tilt:.6,dur:5.8,delay:-1.8}
  ];
  var shoeLayout=[{id:13,w:4.6,drop:1.32},{id:14,w:4.6,drop:1.32},{id:15,w:4.6,drop:1.23},{id:16,w:4.6,drop:1.23}];
  function hookSvg(kind){
    var hook='<path d="M50 '+(kind==='bottom'?26:16)+'V10C50 6.5 56 6 56 2.8C56 0 52.5-1 50 .6" fill="none" stroke="#d8b36c" stroke-width="2.6" stroke-linecap="round"/>';
    var bar=kind==='bottom'
      ?'<path d="M10 26H90" stroke="#7a5233" stroke-width="5.4" stroke-linecap="round"/><path d="M10 26H90" stroke="#e0bf8c" stroke-width="3.6" stroke-linecap="round"/><rect x="15" y="25" width="7" height="10" rx="1.5" fill="#b08a4c"/><rect x="78" y="25" width="7" height="10" rx="1.5" fill="#b08a4c"/>'
      :'<path d="M5 33C18 27 36 19 50 16C64 19 82 27 95 33" fill="none" stroke="#7a5233" stroke-width="5.6" stroke-linecap="round"/><path d="M5 33C18 27 36 19 50 16C64 19 82 27 95 33" fill="none" stroke="#e0bf8c" stroke-width="3.8" stroke-linecap="round"/>';
    return '<svg class="hook" viewBox="0 0 100 36" aria-hidden="true">'+hook+bar+'</svg>';
  }
  function renderWardrobe(){
    var hangers=$('heroHangers'),shoes=$('heroShoes');
    if(!hangers||!shoes)return;
    hangers.innerHTML=heroLayout.map(function(p){
      var item=byId[p.id];
      return '<li class="hanger-item" style="--x:'+p.x+';--w:'+p.w+';--h:'+p.h+';--mt:'+p.mt+';--tilt:'+p.tilt+'deg;--dur:'+p.dur+'s;--delay:'+p.delay+'s'+(p.hook?';--hook:'+p.hook+'%':'')+'"><button type="button" class="hanger" data-id="'+item.id+'" aria-label="把「'+esc(item.name)+'」放进魔镜">'+hookSvg(item.category==='下装'?'bottom':'top')+'<span class="garment">'+svgFor(item)+'</span><span class="tag" aria-hidden="true">'+esc(item.name)+' · 放进魔镜</span></button></li>';
    }).join('');
    shoes.innerHTML=shoeLayout.map(function(p){
      var item=byId[p.id];
      return '<li class="shoe-item" style="--w:'+p.w+';--drop:'+p.drop+'"><button type="button" class="hanger shoe" data-id="'+item.id+'" aria-label="把「'+esc(item.name)+'」放进魔镜"><span class="garment">'+svgFor(item)+'</span><span class="tag" aria-hidden="true">'+esc(item.name)+'</span></button></li>';
    }).join('');
    $('shelfHat').innerHTML=svgFor({name:'棕色贝雷帽',category:'配饰',color:'棕色',look:'beret'});
    $('shelfBag').innerHTML=svgFor(byId[17]);
  }
  var wardrobe=$('wardrobe'),doorToggle=$('doorToggle'),interior=$('wardrobeInterior'),stage=$('stage'),swayTimer;
  function setDoors(open){
    if(!wardrobe)return;
    wardrobe.dataset.state=open?'open':'closed';
    if(interior)interior.inert=!open;
    if(doorToggle){doorToggle.textContent=open?'关上衣橱':'打开衣橱';doorToggle.setAttribute('aria-expanded',String(open));}
    clearTimeout(swayTimer);
    if(open)swayTimer=setTimeout(function(){wardrobe.classList.add('is-swaying');},reduced()?0:1400);
    else wardrobe.classList.remove('is-swaying');
  }
  renderWardrobe();
  if(wardrobe){
    setDoors(false);
    if(reduced())setDoors(true);
    else requestAnimationFrame(function(){requestAnimationFrame(function(){setTimeout(function(){setDoors(true);},420);});});
    wardrobe.addEventListener('click',function(e){
      var button=e.target.closest('.hanger');
      if(!button){if(wardrobe.dataset.state!=='open')setDoors(true);return;}
      var item=button.parentNode;
      item.classList.remove('is-picked');void item.offsetWidth;item.classList.add('is-picked');
      setTimeout(function(){selectItem(Number(button.dataset.id),true);},reduced()?0:260);
    });
  }
  if(doorToggle)doorToggle.addEventListener('click',function(){setDoors(wardrobe.dataset.state!=='open');});
  if(stage&&'IntersectionObserver' in window)new IntersectionObserver(function(entries){entries.forEach(function(entry){stage.classList.toggle('is-paused',!entry.isIntersecting);});}).observe(stage);

  /* ---------- 魔镜试搭：三行独立滑动（沿用原演示的滑动、按钮、键盘与重置逻辑） ---------- */
  var rows=[
    {key:'top',label:'上装',items:closet.filter(function(i){return i.category==='上装'||i.category==='外套';})},
    {key:'bottom',label:'下装',items:closet.filter(function(i){return i.category==='下装';})},
    {key:'shoes',label:'鞋子',items:closet.filter(function(i){return i.category==='鞋履';})}
  ];
  var choices={top:0,bottom:0,shoes:0},timers={},mirrorShown={};
  function track(row){return doc.querySelector('[data-track="'+row.key+'"]');}
  function width(el){return el.getBoundingClientRect().width||el.clientWidth;}
  function picked(){return rows.map(function(row){return row.items[choices[row.key]];});}
  function renderMirror(){
    var holder=$('mirrorOutfit');
    if(!holder)return;
    if(!holder.children.length)holder.innerHTML=rows.map(function(row){return '<div class="mo-piece mo-'+row.key+'" data-slot="'+row.key+'"></div>';}).join('');
    rows.forEach(function(row){
      var item=row.items[choices[row.key]],el=holder.querySelector('[data-slot="'+row.key+'"]');
      if(mirrorShown[row.key]===item.id)return;
      var first=mirrorShown[row.key]===undefined;
      mirrorShown[row.key]=item.id;
      el.innerHTML=svgFor(item);
      if(!first)animate(el,[{opacity:0,transform:'translateY(-7%) scale(.94)'},{opacity:1,transform:'none'}],{duration:420,easing:ease});
    });
  }
  function flashMirror(){animate(doc.querySelector('.mirror-shine'),[{transform:'translateX(-60%)'},{transform:'translateX(60%)'}],{duration:950,easing:'ease-in-out'});}
  function renderCheck(){
    var box=$('mirrorCheck'),c=climate();
    if(!box)return;
    if(!c){box.textContent='';return;}
    var items=picked(),head='按 '+c.temperature+'°C · '+c.label+' 检查：';
    var issues=items.map(function(item){var reason=Planner.unsuitable(item,c);return reason?'「'+item.name+'」'+reason:'';}).filter(Boolean);
    if(issues.length){box.className='mirror-check is-warn';box.innerHTML=esc(head+issues.join('；')+'。')+'完整 App 同样只提示、不替换你的手选。 <a href="#climate">调整温度</a>';}
    else if(c.needsOuter&&items[0].category!=='外套'){box.className='mirror-check is-warn';box.innerHTML=esc(head+'当前温度或风力需要外搭，可以把上装换成开衫或羽绒服。')+' <a href="#climate">调整温度</a>';}
    else{box.className='mirror-check';box.innerHTML=esc(head+'这套都合适。')+' <a href="#climate">换个温度试试</a>';}
  }
  function update(){
    rows.forEach(function(row){
      var selected=choices[row.key],box=doc.querySelector('[data-row="'+row.key+'"]');
      box.querySelector('.previous').disabled=selected===0;
      box.querySelector('.next').disabled=selected===row.items.length-1;
      box.querySelector('[data-count]').textContent=(selected+1)+' / '+row.items.length;
      Array.from(track(row).children).forEach(function(el,n){el.setAttribute('aria-current',String(n===selected));});
    });
    $('demoSummary').textContent=picked().map(function(item){return item.name;}).join(' ＋ ');
    renderMirror();
    renderCheck();
  }
  function scrollRow(row,smooth){var el=track(row);el.scrollTo({left:choices[row.key]*width(el),behavior:smooth&&!reduced()?'smooth':'auto'});}
  function move(row,delta){choices[row.key]=Math.max(0,Math.min(row.items.length-1,choices[row.key]+delta));update();scrollRow(row,true);}
  function scrollToStage(){var target=doc.querySelector('.demo-stage');if(target)target.scrollIntoView({behavior:reduced()?'auto':'smooth',block:'start'});}
  function selectItem(id,scroll){
    rows.forEach(function(row){var n=row.items.findIndex(function(i){return i.id===id;});if(n>=0)choices[row.key]=n;});
    update();
    rows.forEach(function(row){scrollRow(row,false);});
    if(scroll)scrollToStage();
    flashMirror();
  }
  var demoRows=$('demoRows');
  if(demoRows){
    demoRows.innerHTML=rows.map(function(row){
      return '<section class="demo-row" data-row="'+row.key+'"><div class="row-head"><h3 id="label-'+row.key+'">'+row.label+'</h3><span class="row-count" data-count="'+row.key+'"></span></div><div class="row-carousel"><button type="button" class="switch previous" aria-label="上一件'+row.label+'">‹</button><div class="demo-track" data-track="'+row.key+'" tabindex="0" aria-labelledby="label-'+row.key+'">'+row.items.map(function(item){return '<div class="demo-slide"><div class="slide-visual">'+svgFor(item)+'</div><strong>'+esc(item.name)+'</strong><small>面料质感示意</small></div>';}).join('')+'</div><button type="button" class="switch next" aria-label="下一件'+row.label+'">›</button></div></section>';
    }).join('');
    rows.forEach(function(row){
      var el=track(row),container=el.closest('[data-row]');
      container.querySelector('.previous').addEventListener('click',function(){move(row,-1);});
      container.querySelector('.next').addEventListener('click',function(){move(row,1);});
      el.addEventListener('scroll',function(){clearTimeout(timers[row.key]);timers[row.key]=setTimeout(function(){var w=width(el);if(w){var n=Math.max(0,Math.min(row.items.length-1,Math.round(el.scrollLeft/w)));if(n!==choices[row.key]){choices[row.key]=n;update();}}},90);},{passive:true});
      el.addEventListener('keydown',function(e){if(['ArrowLeft','ArrowRight','Home','End'].indexOf(e.key)<0)return;e.preventDefault();move(row,e.key==='ArrowLeft'?-1:e.key==='ArrowRight'?1:e.key==='Home'?-row.items.length:row.items.length);});
    });
    $('resetDemo').addEventListener('click',function(){rows.forEach(function(row){clearTimeout(timers[row.key]);choices[row.key]=0;track(row).scrollLeft=0;});update();});
    $('shuffleDemo').addEventListener('click',function(){
      rows.forEach(function(row){var n=row.items.length,next=Math.floor(Math.random()*n);if(n>1&&next===choices[row.key])next=(next+1+Math.floor(Math.random()*(n-1)))%n;choices[row.key]=next;});
      update();rows.forEach(function(row){scrollRow(row,true);});flashMirror();
    });
    window.addEventListener('resize',function(){rows.forEach(function(row){track(row).scrollLeft=choices[row.key]*width(track(row));});});
    update();
  }

  /* ---------- 看天穿衣：完整 App 的 outfit-plan.js 规则在浏览器内运行 ---------- */
  var tempRange=$('tempRange'),bandColors=['#6d88ab','#93abc2','#a9b597','#cdb384','#d49a66','#b9694b'];
  var weatherNames={'晴':'晴朗','多云':'多云','大风':'大风','小雨':'小雨','雨雪':'雨雪'};
  var currentPlan=null,lastPlanKey='',pendingFrame=false;
  function renderForecast(c,variantTried){
    var plan=Planner.suggest(closet,[],{season:state.season,temperature:state.temperature,weather:state.weather,variant:state.variant});
    var pieces=plan.items.map(function(entry){return byId[entry.id]?{item:byId[entry.id],gap:false}:null;}).filter(Boolean)
      .concat(plan.gaps.map(function(gap){return {item:gap,gap:true};}));
    var key=pieces.map(function(p){return p.gap?'gap:'+p.item.name:p.item.id;}).join('|'),board=$('forecastBoard');
    $('forecastTitle').textContent=c.label+' · '+c.temperature+'°C · '+weatherNames[state.weather];
    $('forecastAdvice').textContent=c.advice;
    if(key!==lastPlanKey){
      lastPlanKey=key;
      board.innerHTML=pieces.map(function(p){
        var item=p.item;
        return '<figure class="fc-piece'+(p.gap?' gap':'')+'"><span class="fc-role">'+esc(p.gap?'待补 · '+item.category:item.category)+'</span><div class="fc-visual">'+svgFor(item)+'</div><figcaption><b>'+esc(item.name)+'</b><small>'+(p.gap?'待补款式 · 示意':'示例衣橱 · '+esc(item.season))+'</small></figcaption></figure>';
      }).join('');
      Array.from(board.children).forEach(function(el,n){animate(el,[{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'none'}],{duration:380,delay:n*45,easing:ease,fill:'backwards'});});
    }else if(variantTried){
      animate(board,[{transform:'translateX(0)'},{transform:'translateX(-6px)'},{transform:'translateX(5px)'},{transform:'translateX(0)'}],{duration:360,easing:'ease-out'});
    }
    var tips=(plan.warnings||[]).map(function(t){return '<li class="warn">'+esc(t)+'</li>';}).concat((plan.tips||[]).map(function(t){return '<li>'+esc(t)+'</li>';}));
    if(variantTried&&key===lastPlanKey&&state.variant>0)tips.push('<li>示例衣橱在这一档只有这一套最合适，换个温度或天气再试。</li>');
    $('forecastTips').innerHTML=tips.join('');
    currentPlan=plan;
  }
  function renderClimate(variantTried){
    if(!tempRange)return;
    $('tempValue').textContent=state.temperature+'°C';
    var c=climate();
    if(!c){$('forecastAdvice').textContent='规则脚本未能加载，请刷新页面后再试。';return;}
    $('bandLabel').textContent=c.label;
    tempRange.setAttribute('aria-valuetext',state.temperature+'°C，'+c.label);
    root.style.setProperty('--band-color',bandColors[c.band]);
    Array.from($('bandScale').children).forEach(function(li,n){li.classList.toggle('is-active',n===c.band);});
    renderForecast(c,variantTried);
    renderCheck();
  }
  function applyPlan(){
    if(!currentPlan)return;
    var items=currentPlan.items.map(function(entry){return byId[entry.id];}).filter(Boolean);
    function first(category){for(var i=0;i<items.length;i++)if(items[i].category===category)return items[i];return null;}
    /* 魔镜照出最外层：方案里有外套时上装行放外套 */
    var picks={top:first('外套')||first('上装'),bottom:first('下装'),shoes:first('鞋履')};
    rows.forEach(function(row){var item=picks[row.key];if(!item)return;var n=row.items.indexOf(item);if(n>=0)choices[row.key]=n;});
    update();
    rows.forEach(function(row){scrollRow(row,false);});
    scrollToStage();
    flashMirror();
  }
  if(tempRange){
    tempRange.addEventListener('input',function(){
      state.temperature=Number(tempRange.value);state.variant=0;
      if(pendingFrame)return;pendingFrame=true;
      requestAnimationFrame(function(){pendingFrame=false;renderClimate();});
    });
    doc.querySelectorAll('input[name="season"]').forEach(function(input){input.addEventListener('change',function(){
      state.season=input.value;state.variant=0;
      if(Planner&&Planner.seasonDefaults[input.value]!==undefined)state.temperature=Planner.seasonDefaults[input.value];
      tempRange.value=String(state.temperature);renderClimate();
    });});
    doc.querySelectorAll('input[name="weather"]').forEach(function(input){input.addEventListener('change',function(){state.weather=input.value;state.variant=0;renderClimate();});});
    $('variantButton').addEventListener('click',function(){state.variant+=1;renderClimate(true);});
    $('applyForecast').addEventListener('click',applyPlan);
    renderClimate();
  }

  /* ---------- 复制命令、顶栏状态、导航高亮与滚动出现 ---------- */
  function fallbackCopy(text){
    var area=doc.createElement('textarea');area.value=text;area.setAttribute('readonly','');area.style.position='fixed';area.style.opacity='0';
    doc.body.appendChild(area);area.select();var ok=false;try{ok=doc.execCommand('copy');}catch(e){ok=false;}area.remove();return ok;
  }
  var copyButton=$('copyCode');
  if(copyButton)copyButton.addEventListener('click',function(){
    var text=$(copyButton.dataset.copy).textContent,status=$('copyStatus');
    function done(ok){copyButton.textContent=ok?'已复制':'复制失败';if(status)status.textContent=ok?'启动命令已复制':'复制失败，请手动选择命令';setTimeout(function(){copyButton.textContent='复制';},1800);}
    if(navigator.clipboard&&window.isSecureContext)navigator.clipboard.writeText(text).then(function(){done(true);},function(){done(fallbackCopy(text));});
    else done(fallbackCopy(text));
  });
  var header=$('siteHeader');
  function onScroll(){if(header)header.classList.toggle('is-scrolled',window.scrollY>8);}
  window.addEventListener('scroll',onScroll,{passive:true});onScroll();
  var reveals=doc.querySelectorAll('.reveal');
  if('IntersectionObserver' in window){
    var links={};
    doc.querySelectorAll('[data-spy]').forEach(function(a){links[a.dataset.spy]=a;});
    function activate(id){Object.keys(links).forEach(function(key){var on=key===id;links[key].classList.toggle('is-active',on);if(on)links[key].setAttribute('aria-current','location');else links[key].removeAttribute('aria-current');});}
    var spy=new IntersectionObserver(function(entries){entries.forEach(function(entry){if(entry.isIntersecting)activate(links[entry.target.id]?entry.target.id:'');});},{rootMargin:'-45% 0px -50% 0px'});
    Object.keys(links).concat('main').forEach(function(id){var el=id==='main'?doc.querySelector('.hero'):$(id);if(el)spy.observe(el);});
    if(reduced())reveals.forEach(function(el){el.classList.add('is-in');});
    else{
      var appear=new IntersectionObserver(function(entries){entries.forEach(function(entry){if(entry.isIntersecting){entry.target.classList.add('is-in');appear.unobserve(entry.target);}});},{rootMargin:'0px 0px -8% 0px',threshold:.12});
      reveals.forEach(function(el){appear.observe(el);});
    }
  }else reveals.forEach(function(el){el.classList.add('is-in');});
})();
