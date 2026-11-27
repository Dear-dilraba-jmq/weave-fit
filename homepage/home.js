/* 穿搭魔镜 · 项目主页交互（产品官网版）：首屏今日搭配、拍照入橱识别演示、看天穿衣、自己滑着搭、数字衣橱。
   单品用真实照片（Unsplash，见页脚署名）；搭配规则复用完整 App 的 outfit-plan.js，这里不重复实现规则。 */
(function(){
  'use strict';
  var doc=document,root=doc.documentElement;
  root.classList.add('js-ready');
  var Planner=window.OutfitPlanner;
  var motionQuery=window.matchMedia?window.matchMedia('(prefers-reduced-motion: reduce)'):{matches:false};
  function reduced(){return !!motionQuery.matches;}
  function $(id){return doc.getElementById(id);}
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function animate(el,frames,options){return el&&!reduced()&&typeof el.animate==='function'?el.animate(frames,options):null;}
  function icon(id){return '<svg aria-hidden="true"><use href="#'+id+'"/></svg>';}
  function scrollToEl(el){if(el)el.scrollIntoView({behavior:reduced()?'auto':'smooth',block:'start'});}
  var ease='cubic-bezier(.2,.75,.2,1)';

  /* 示例衣橱：首屏和四个功能演示共用这一份数据，季节取值与完整 App 的单品表单一致。
     单品照片全部来自 Unsplash（Unsplash License：可免费使用，无需另行授权），已下载到 homepage/photos/ 随主页发布；文件末尾按 page 与 by 把每张的原图链接和摄影师写进页脚署名。
     photo 是该图在 images.unsplash.com 的编号，rect 为可选的裁切区域（原图像素 x,y,宽,高，用来避开同框的其他衣服）：两者记录本地照片的来源，重新下载时使用（见 WORKFLOW.md 3.5）；
     size 与 box 只给「拍照入橱」演示用：原图尺寸，以及衣物所在区域（占原图宽高的百分比 x,y,宽,高）。 */
  var closet=[
    {id:1,name:'白色纯色短袖 T 恤',category:'上装',color:'白色',hex:'#f3f1ec',season:'夏季',photo:'1722310752951-4d459d28c678',page:'a-white-t-shirt-hanging-on-a-white-wall-fiA7sq2PdnQ',by:'Jonathan Mattson'},
    {id:2,name:'浅蓝亚麻短袖衬衫',category:'上装',color:'浅蓝',hex:'#b7c3d8',season:'夏季',photo:'1713881842156-3d9ef36418cc',page:'a-blue-shirt-hanging-on-a-clothes-line-SI7Hmk8MXQU',by:'tian dayong'},
    {id:3,name:'米白亚麻短袖衬衫',category:'上装',color:'米白',hex:'#ebe5d8',season:'夏季',photo:'1713881587420-113c1c43e28a',page:'a-white-shirt-hanging-on-a-clothes-line-S4f4apZd-hA',by:'tian dayong'},
    {id:4,name:'奶白高领厚针织毛衣',category:'上装',color:'奶白',hex:'#eee8de',season:'秋冬',photo:'1687275161342-8699c61e4364',page:'a-white-sweater-hanging-on-a-clothes-rack-m2chM9O-ZHs',by:'Ihor Rapita'},
    {id:5,name:'香芋紫圆领毛衣',category:'上装',color:'香芋紫',hex:'#b39ac8',season:'春秋',photo:'1687275164205-732738f0c7bc',page:'a-purple-sweater-hanging-on-a-rack-next-to-a-vase-with-dried-flowers-HDsXgLf4w5Q',by:'Ihor Rapita'},
    {id:6,name:'焦糖棕马海毛针织衫',category:'上装',color:'焦糖棕',hex:'#7b4a33',season:'秋冬',photo:'1773747310662-e7cc9e681226',page:'a-brown-knitted-sweater-hangs-on-a-white-hanger-g3AwbdZut70',by:'Yuliia Pakhomova'},
    {id:7,name:'米白长款风衣',category:'外套',color:'米白',hex:'#e3dbcc',season:'春秋',photo:'1722859031306-4c81e8d83957',rect:'0,350,2900,2900',size:[4000,6000],box:[9,11,61,89],page:'a-coat-rack-with-coats-hanging-on-it-_Ssh8Z8ENQM',by:'Lisa Anna'},
    {id:8,name:'灰色人字纹厚羊毛大衣',category:'外套',color:'灰色',hex:'#8c8a87',season:'冬季',photo:'1722858958066-97deb3471c89',size:[4000,6000],box:[33,6,60,77],page:'a-coat-hanging-on-a-coat-rack-in-a-closet-pvCjWi5bATg',by:'Lisa Anna'},
    {id:9,name:'浅蓝水洗牛仔夹克',category:'外套',color:'浅蓝',hex:'#9cb2c8',season:'春秋',photo:'1543076447-215ad9ba6923',page:'blue-washed-jacket-hanging-on-white-door-_BDBEP0ePQc',by:'kemal alkan'},
    {id:10,name:'深蓝直筒牛仔裤',category:'下装',color:'深蓝',hex:'#2f3f55',season:'四季',photo:'1754555009601-498e9873197e',page:'jeans-hang-on-a-wooden-hanger-nC4-PXzKZcI',by:'Pesce Huang'},
    {id:11,name:'浅蓝卷边牛仔裤',category:'下装',color:'浅蓝',hex:'#5d7ea6',season:'四季',photo:'1714143136372-ddaf8b606da7',page:'a-pair-of-blue-jeans-on-a-white-background-9yoXrG6Er_g',by:'TuanAnh Blue'},
    {id:12,name:'焦糖色纱质中长裙',category:'下装',color:'焦糖色',hex:'#8a5a3b',season:'春秋',photo:'1527332042004-0b1a4d8646a3',size:[4016,6016],box:[44,36,47,44],page:'brown-skirt-hanged-on-wall-1PKjyPsH8sw',by:'Gaelle Marcel'},
    {id:13,name:'白色简约板鞋',category:'鞋履',color:'白色',hex:'#f1f1ef',season:'四季',photo:'1725271741216-743c37073437',size:[3536,5657],box:[1,45,98,25],page:'a-white-sneaker-with-a-black-and-white-star-on-the-side-wHUlMvFHEbA',by:'SJ'},
    {id:14,name:'棕色麂皮乐福鞋',category:'鞋履',color:'棕色',hex:'#9a6a3f',season:'春秋',photo:'1676121270762-47c8d3a7b9d5',page:'a-pair-of-brown-suede-loafers-with-gold-hardwares-KOavcW0p7oc',by:'Nelibar Shoes'},
    {id:15,name:'棕色切尔西短靴',category:'鞋履',color:'棕色',hex:'#a5622e',season:'秋冬',photo:'1773425975272-35f0900a9d8f',page:'a-tan-leather-chelsea-boot-against-a-white-background-F9O-R3RF5Xs',by:'roberto saborizado'},
    {id:16,name:'焦糖色皮质托特包',category:'包袋',color:'焦糖色',hex:'#9b5a2a',season:'四季',photo:'1624687943971-e86af76d57de',size:[4000,6000],box:[18,15,63,68],page:'brown-leather-handbag-on-white-table-XwjrPFW7xw0',by:'Ugluk Potroshitel'},
    {id:17,name:'米白帆布托特包',category:'包袋',color:'米白',hex:'#e7e3d9',season:'四季',photo:'1574365569389-a10d488ca3fb',page:'white-reusable-bag-on-gray-surface-smTDI-z1rlY',by:'Brando Makes Branding'},
    {id:18,name:'灰色皮质剑桥包',category:'包袋',color:'浅灰',hex:'#8d8991',season:'四季',photo:'1605733513597-a8f8341084e6',page:'grey-leather-satchel-with-gold-buckles-J4DnKxz_3sA',by:'mostafa mahmoudi'}
  ];
  var byId={};closet.forEach(function(item){byId[item.id]=item;});
  var bandColors=['#6d88ab','#93abc2','#a9b597','#cdb384','#d49a66','#b9694b'];
  var weatherIcons={'晴':'i-sun','多云':'i-cloud','大风':'i-wind','小雨':'i-rain','雨雪':'i-snow'};
  var weatherNames={'晴':'晴','多云':'多云','大风':'大风','小雨':'小雨','雨雪':'雨雪'};

  /* 单品照片：item-编号.jpg 是 480×480 的正方形缩略图，首屏、列表和衣橱共用；scan-编号.jpg 是不裁切的 960px 宽整张图（拍照入橱演示用）。
     规则给出的「待补」单品不在衣橱里，没有照片，只显示衣架占位。 */
  function photoUrl(item,full){return 'homepage/photos/'+(full?'scan-':'item-')+(item.id<10?'0':'')+item.id+'.jpg';}
  function visual(item,eager){
    if(!item||!item.photo)return '<span class="ph-gap">'+icon('i-hanger')+'</span>';
    return '<img class="ph" src="'+photoUrl(item)+'" alt="" width="480" height="480"'+(eager?'':' loading="lazy"')+' decoding="async">';
  }
  function preload(items){items.forEach(function(item){if(item&&item.photo)new Image().src=photoUrl(item);});}
  function suggest(o){return Planner?Planner.suggest(closet,[],o):null;}
  function slotsOf(plan){
    var slots={};
    plan.items.forEach(function(entry){var item=byId[entry.id];if(!item)return;var g=Planner.group(item);if(!slots[g])slots[g]=item;});
    return slots;
  }

  /* ---------- 顶栏：滚动描边、手机菜单、导航高亮 ---------- */
  var header=$('siteHeader'),menuToggle=$('menuToggle'),nav=$('siteNav');
  function setMenu(open){
    if(!header||!menuToggle)return;
    header.classList.toggle('nav-open',open);
    menuToggle.setAttribute('aria-expanded',String(open));
    menuToggle.setAttribute('aria-label',open?'关闭导航菜单':'打开导航菜单');
    var use=menuToggle.querySelector('use');if(use)use.setAttribute('href',open?'#i-close':'#i-menu');
  }
  if(menuToggle)menuToggle.addEventListener('click',function(){setMenu(!header.classList.contains('nav-open'));});
  if(nav)nav.addEventListener('click',function(e){if(e.target.closest('a'))setMenu(false);});
  doc.addEventListener('keydown',function(e){if(e.key==='Escape'&&header&&header.classList.contains('nav-open')){setMenu(false);menuToggle.focus();}});
  if(window.matchMedia){var wide=window.matchMedia('(min-width: 981px)');var onWide=function(){if(wide.matches)setMenu(false);};if(wide.addEventListener)wide.addEventListener('change',onWide);else if(wide.addListener)wide.addListener(onWide);}

  var spyLinks=Array.from(doc.querySelectorAll('[data-spy]')),spyTargets=spyLinks.map(function(a){return $(a.dataset.spy);}),spyFrame=false;
  function updateSpy(){
    spyFrame=false;
    if(header)header.classList.toggle('is-scrolled',window.scrollY>8);
    /* 目标可能嵌套（看天穿衣、自己搭都在功能区内）：取视口 45% 线上最后一个命中的，也就是最具体的一节 */
    var line=window.innerHeight*.45,active=-1;
    spyTargets.forEach(function(el,n){if(!el)return;var r=el.getBoundingClientRect();if(r.top<=line&&r.bottom>line)active=n;});
    spyLinks.forEach(function(a,n){var on=n===active;a.classList.toggle('is-active',on);if(on)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');});
  }
  window.addEventListener('scroll',function(){if(!spyFrame){spyFrame=true;requestAnimationFrame(updateSpy);}},{passive:true});
  updateSpy();

  /* ---------- 首屏：今日搭配样机按几组天气轮播，点按钮可手动切换 ----------
     variant 相当于在 App 里点了几次「换一套」，让四组天气尽量展示衣橱里不同的单品 */
  var heroPresets=[
    {label:'20° 多云',season:'春季',temperature:20,weather:'多云',style:'学院',variant:0},
    {label:'14° 小雨',season:'秋季',temperature:14,weather:'小雨',style:'极简',variant:0},
    {label:'30° 晴',season:'夏季',temperature:30,weather:'晴',style:'极简',variant:0},
    {label:'4° 大风',season:'冬季',temperature:4,weather:'大风',style:'复古',variant:3}
  ];
  var heroBoard=$('heroBoard'),heroPresetBox=$('heroPresets'),heroSection=doc.querySelector('.hero'),heroVisual=doc.querySelector('.hero-visual');
  var heroIndex=0,heroAuto=!reduced(),heroVisible=true,heroHover=false,heroTimer=null,heroSwap=null;
  function heroPlan(p){return suggest({season:p.season,temperature:p.temperature,weather:p.weather,style:p.style,occasion:'日常通勤',variant:p.variant});}
  function renderHero(n,fade){
    var p=heroPresets[n],plan=heroPlan(p);
    heroIndex=n;
    if(heroPresetBox)Array.from(heroPresetBox.children).forEach(function(b,i){b.setAttribute('aria-pressed',String(i===n));});
    if(!plan||!heroBoard){if($('heroWhy'))$('heroWhy').textContent='规则脚本未能加载，请刷新页面后再试。';return;}
    /* 四格看板：有外套时放外套、上装、下装、鞋；没有外套时由包补上第四格 */
    var c=plan.climate,slots=slotsOf(plan);
    var keys=(slots.dress?['outer','dress','shoes','bag']:['outer','top','bottom','shoes','bag']).filter(function(k){return slots[k];}).slice(0,4);
    var html=keys.map(function(k){return '<figure class="bd-item"><span class="bd-role">'+esc(slots[k].category)+'</span>'+visual(slots[k],true)+'</figure>';}).join('');
    function paint(){
      heroBoard.innerHTML=html;
      if(fade)Array.from(heroBoard.children).forEach(function(el,i){animate(el,[{opacity:0,transform:'translateY(10px) scale(.97)'},{opacity:1,transform:'none'}],{duration:480,delay:i*60,easing:ease,fill:'backwards'});});
    }
    clearTimeout(heroSwap);
    if(fade&&!reduced()&&heroBoard.children.length){Array.from(heroBoard.children).forEach(function(el){el.classList.add('is-leaving');});heroSwap=setTimeout(paint,280);}
    else paint();
    var card=$('heroWeather');
    if(card){card.style.setProperty('--band',bandColors[c.band]);var use=card.querySelector('use');if(use)use.setAttribute('href','#'+weatherIcons[p.weather]);}
    $('heroTemp').textContent=c.temperature+'°C · '+weatherNames[p.weather];
    $('heroBand').textContent=c.label+' · '+p.style;
    var gaps=plan.gaps.map(function(g){return g.name;});
    $('heroWhy').textContent=c.advice+(gaps.length?' 待补：'+gaps.join('、')+'。':'');
  }
  function heroTick(){if(heroAuto&&heroVisible&&!heroHover&&!doc.hidden)renderHero((heroIndex+1)%heroPresets.length,true);}
  if(heroPresetBox){
    heroPresetBox.innerHTML=heroPresets.map(function(p,i){return '<button type="button" aria-pressed="false" data-preset="'+i+'">'+icon(weatherIcons[p.weather])+esc(p.label)+'</button>';}).join('');
    heroPresetBox.addEventListener('click',function(e){var b=e.target.closest('[data-preset]');if(!b)return;heroAuto=false;clearInterval(heroTimer);renderHero(Number(b.dataset.preset),true);});
  }
  renderHero(0,false);
  /* 预先取好其余几组天气的照片，轮播切换时不出现空白格 */
  heroPresets.forEach(function(p){var plan=heroPlan(p);if(plan)preload(plan.items.map(function(e){return byId[e.id];}));});
  if(heroAuto)heroTimer=setInterval(heroTick,4600);
  if(heroVisual){heroVisual.addEventListener('pointerenter',function(){heroHover=true;});heroVisual.addEventListener('pointerleave',function(){heroHover=false;});}
  if(heroSection&&'IntersectionObserver' in window)new IntersectionObserver(function(entries){entries.forEach(function(entry){heroVisible=entry.isIntersecting;heroSection.classList.toggle('is-paused',!heroVisible);});}).observe(heroSection);
  var heroCloset=$('heroCloset');
  if(heroCloset)heroCloset.innerHTML=[4,10,13,7,5,14,2,12,16].map(function(id){return '<span>'+visual(byId[id],true)+'</span>';}).join('');
  if($('heroClosetCount'))$('heroClosetCount').textContent=closet.length+' 件';
  if($('heroScanThumb'))$('heroScanThumb').innerHTML=visual(byId[4],true);
  if($('heroScanText'))$('heroScanText').textContent=[byId[4].name,byId[4].category,byId[4].season].join(' · ');

  /* ---------- 01 拍照入橱：演示识别流程——先框出照片里衣物所在的区域，再依次填好名称、类别、主色和季节 ---------- */
  var scanIds=[7,16,12,8,13],scanIndex=0,scanStage=$('scanStage'),scanToken=0;
  /* 照片以 cover 方式铺满 4:5 画面，把原图上的百分比区域换算成画面坐标 */
  function scanBox(item){
    var a=item.size[0]/item.size[1],s=.8,b=item.box,dw=100,dh=100,ox=0,oy=0;
    if(a>s){dw=a/s*100;ox=(dw-100)/2;}else{dh=s/a*100;oy=(dh-100)/2;}
    function clamp(v){return Math.max(0,Math.min(100,v));}
    var l=clamp(b[0]*dw/100-ox),t=clamp(b[1]*dh/100-oy),r=clamp((b[0]+b[2])*dw/100-ox),btm=clamp((b[1]+b[3])*dh/100-oy);
    return {left:l+'%',top:t+'%',width:(r-l)+'%',height:(btm-t)+'%'};
  }
  function renderScan(){
    var item=byId[scanIds[scanIndex]],photo=$('scanPhoto'),box=$('scanBox'),list=$('scanFields'),tag=$('scanTag'),token=++scanToken;
    if(!item||!photo)return;
    var target=scanBox(item);
    tag.textContent='识别中…';
    list.innerHTML='';
    box.style.opacity='0';
    photo.alt='示例照片：'+item.name;
    photo.src=photoUrl(item,true);
    function reveal(){
      if(token!==scanToken)return;
      Object.keys(target).forEach(function(k){box.style[k]=target[k];});
      box.style.opacity='1';
      animate(photo,[{opacity:.35},{opacity:1}],{duration:380,easing:ease});
      animate($('scanBeam'),[{top:'0%',opacity:1},{top:'100%',opacity:0}],{duration:900,easing:'ease-in-out'});
      animate(box,[{left:'0%',top:'0%',width:'100%',height:'100%',opacity:0},{left:target.left,top:target.top,width:target.width,height:target.height,opacity:1}],{duration:760,delay:160,easing:ease,fill:'backwards'});
      var fields=[['名称',esc(item.name)],['类别',esc(item.category)],['主色','<i style="background:'+item.hex+'"></i>'+esc(item.color)],['季节',esc(item.season)]];
      list.innerHTML=fields.map(function(f){return '<span><small>'+f[0]+'</small>'+f[1]+'</span>';}).join('');
      Array.from(list.children).forEach(function(el,i){animate(el,[{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'none'}],{duration:360,delay:700+i*120,easing:ease,fill:'backwards'});});
      setTimeout(function(){if(token===scanToken)tag.textContent='已填写 · 可以再改';},reduced()?0:1100);
    }
    if(photo.decode)photo.decode().then(reveal,reveal);else if(photo.complete)reveal();else photo.onload=photo.onerror=reveal;
  }
  if(scanStage){
    renderScan();
    $('scanNext').addEventListener('click',function(){scanIndex=(scanIndex+1)%scanIds.length;renderScan();});
    /* 预先取好其余几张示例照片 */
    scanIds.slice(1).forEach(function(id){new Image().src=photoUrl(byId[id],true);});
  }

  /* ---------- 02 看天穿衣：完整 App 的 outfit-plan.js 规则在浏览器内运行 ---------- */
  var wState={season:'春季',temperature:18,weather:'晴',style:'极简',occasion:'日常通勤',variant:0};
  var tempRange=$('wTemp'),currentPlan=null,lastPlanKey='',pendingFrame=false;
  function climate(){return Planner?Planner.climateFor({season:wState.season,temperature:wState.temperature,weather:wState.weather}):null;}
  function renderWeather(variantTried){
    if(!tempRange)return;
    $('wTempValue').textContent=wState.temperature+'°C';
    var c=climate();
    if(!c){$('wAdvice').textContent='规则脚本未能加载，请刷新页面后再试。';return;}
    $('wBand').textContent=c.label;
    tempRange.setAttribute('aria-valuetext',wState.temperature+'°C，'+c.label);
    root.style.setProperty('--band',bandColors[c.band]);
    Array.from($('wBandScale').children).forEach(function(li,n){li.classList.toggle('is-active',n===c.band);});
    var use=$('wIcon').querySelector('use');if(use)use.setAttribute('href','#'+weatherIcons[wState.weather]);
    var plan=suggest(wState);
    $('wTitle').textContent=c.label+' · '+c.temperature+'°C · '+weatherNames[wState.weather];
    $('wAdvice').textContent=c.advice;
    var pieces=plan.items.map(function(entry){return byId[entry.id]?{item:byId[entry.id],gap:false}:null;}).filter(Boolean)
      .concat(plan.gaps.map(function(gap){return {item:gap,gap:true};}));
    var key=pieces.map(function(p){return p.gap?'gap:'+p.item.name:p.item.id;}).join('|'),list=$('wList');
    if(key!==lastPlanKey){
      lastPlanKey=key;
      list.innerHTML=pieces.map(function(p){
        var item=p.item;
        return '<li'+(p.gap?' class="gap"':'')+'><div class="result-visual"><span class="result-role">'+esc(p.gap?'待补':item.category)+'</span>'+visual(p.gap?null:item)+'</div><b title="'+esc(item.name)+'">'+esc(item.name)+'</b><small>'+(p.gap?esc(item.category)+' · 建议添置':'示例衣橱')+'</small></li>';
      }).join('');
      Array.from(list.children).forEach(function(el,n){animate(el,[{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'none'}],{duration:360,delay:n*45,easing:ease,fill:'backwards'});});
    }else if(variantTried){
      animate(list,[{transform:'translateX(0)'},{transform:'translateX(-5px)'},{transform:'translateX(4px)'},{transform:'translateX(0)'}],{duration:340,easing:'ease-out'});
    }
    var tips=(plan.warnings||[]).map(function(t){return '<li class="warn">'+esc(t)+'</li>';})
      .concat(plan.gaps.map(function(g){return '<li class="warn">待补「'+esc(g.name)+'」：'+esc(g.advice)+'完整 App 可直接去淘宝搜索这款。</li>';}))
      .concat((plan.tips||[]).slice(1).map(function(t){return '<li>'+esc(t)+'</li>';}));
    if(variantTried&&key===lastPlanKey&&wState.variant>0)tips.unshift('<li>示例衣橱在这一档只有这一套最合适，换个温度、风格或场合再试。</li>');
    if(!tips.length)tips.push('<li>'+(c.needsOuter?'温差大，外搭可以随时穿脱。':'这套不需要额外的外套，出门前看一眼天气即可。')+'</li>');
    $('wTips').innerHTML=tips.join('');
    currentPlan=plan;
    renderMixCheck();
  }
  if(tempRange){
    tempRange.addEventListener('input',function(){
      wState.temperature=Number(tempRange.value);wState.variant=0;
      if(pendingFrame)return;pendingFrame=true;
      requestAnimationFrame(function(){pendingFrame=false;renderWeather();});
    });
    doc.querySelectorAll('input[name="wSeason"]').forEach(function(input){input.addEventListener('change',function(){
      wState.season=input.value;wState.variant=0;
      if(Planner&&Planner.seasonDefaults[input.value]!==undefined)wState.temperature=Planner.seasonDefaults[input.value];
      tempRange.value=String(wState.temperature);renderWeather();
    });});
    doc.querySelectorAll('input[name="wWeather"]').forEach(function(input){input.addEventListener('change',function(){wState.weather=input.value;wState.variant=0;renderWeather();});});
    $('wStyle').addEventListener('change',function(e){wState.style=e.target.value;wState.variant=0;renderWeather();});
    $('wOccasion').addEventListener('change',function(e){wState.occasion=e.target.value;wState.variant=0;renderWeather();});
    $('wVariant').addEventListener('click',function(){wState.variant+=1;renderWeather(true);});
    $('wApply').addEventListener('click',applyPlan);
  }

  /* ---------- 03 自己滑着搭：三行独立滑动（沿用原演示的滑动、按钮、键盘、随机与重置逻辑） ---------- */
  var rows=[
    {key:'top',label:'上装 / 外套',items:closet.filter(function(i){return i.category==='上装'||i.category==='外套';})},
    {key:'bottom',label:'下装',items:closet.filter(function(i){return i.category==='下装';})},
    {key:'shoes',label:'鞋子',items:closet.filter(function(i){return i.category==='鞋履';})}
  ];
  var choices={top:0,bottom:0,shoes:0},timers={},mixRows=$('mixRows');
  function track(row){return doc.querySelector('[data-track="'+row.key+'"]');}
  function width(el){return el.getBoundingClientRect().width||el.clientWidth;}
  function picked(){return rows.map(function(row){return row.items[choices[row.key]];});}
  function renderMixCheck(){
    var box=$('mixCheck'),c=climate();
    if(!box||!mixRows)return;
    if($('mixTemp'))$('mixTemp').textContent=c?c.temperature+'°C · '+weatherNames[wState.weather]:'';
    if(!c){box.textContent='';return;}
    var items=picked(),head='按 '+c.temperature+'°C · '+c.label+' 检查：';
    var issues=items.map(function(item){var reason=Planner.unsuitable(item,c);return reason?'「'+item.name+'」'+reason:'';}).filter(Boolean);
    if(issues.length){box.className='mix-check is-warn';box.textContent=head+issues.join('；')+'。只提醒，不替换你的选择。';}
    else if(c.needsOuter&&items[0].category!=='外套'){
      /* 只推荐示例衣橱里此刻真正合适的外套 */
      var outers=rows[0].items.filter(function(i){return i.category==='外套'&&!Planner.unsuitable(i,c);}).map(function(i){return '「'+i.name+'」';});
      box.className='mix-check is-warn';box.textContent=head+'当前温度或风力需要外搭'+(outers.length?'，第一行可以换成'+outers.join('或'):'')+'。';
    }
    else{box.className='mix-check';box.textContent=head+'这套都合适'+(items[0].category==='外套'?'，外套里记得配一件内搭。':'。');}
  }
  function updateMix(){
    rows.forEach(function(row){
      var selected=choices[row.key],box=doc.querySelector('[data-row="'+row.key+'"]');
      box.querySelector('.previous').disabled=selected===0;
      box.querySelector('.next').disabled=selected===row.items.length-1;
      box.querySelector('[data-count]').textContent=(selected+1)+' / '+row.items.length;
      Array.from(track(row).children).forEach(function(el,n){el.setAttribute('aria-current',String(n===selected));});
    });
    $('mixSummary').textContent=picked().map(function(item){return item.name;}).join(' ＋ ');
    renderMixCheck();
  }
  function scrollRow(row,smooth){var el=track(row);el.scrollTo({left:choices[row.key]*width(el),behavior:smooth&&!reduced()?'smooth':'auto'});}
  function move(row,delta){choices[row.key]=Math.max(0,Math.min(row.items.length-1,choices[row.key]+delta));updateMix();scrollRow(row,true);}
  function selectItem(id,scroll){
    rows.forEach(function(row){var n=row.items.findIndex(function(i){return i.id===id;});if(n>=0)choices[row.key]=n;});
    updateMix();
    rows.forEach(function(row){scrollRow(row,false);});
    if(scroll)scrollToEl($('mix'));
  }
  function applyPlan(){
    if(!currentPlan)return;
    var items=currentPlan.items.map(function(entry){return byId[entry.id];}).filter(Boolean);
    function first(category){for(var i=0;i<items.length;i++)if(items[i].category===category)return items[i];return null;}
    /* 方案里有外套时，上装行放最外层的外套 */
    var picks={top:first('外套')||first('上装'),bottom:first('下装'),shoes:first('鞋履')};
    rows.forEach(function(row){var item=picks[row.key];if(!item)return;var n=row.items.indexOf(item);if(n>=0)choices[row.key]=n;});
    updateMix();
    rows.forEach(function(row){scrollRow(row,false);});
    scrollToEl($('mix'));
  }
  if(mixRows){
    mixRows.innerHTML=rows.map(function(row){
      return '<section class="mix-row" data-row="'+row.key+'"><div class="mix-row-head"><h4 id="mix-label-'+row.key+'">'+row.label+'</h4><span data-count="'+row.key+'"></span></div>'+
        '<div class="mix-carousel"><button type="button" class="switch previous" aria-label="上一件'+row.label+'">‹</button>'+
        '<div class="mix-track" data-track="'+row.key+'" tabindex="0" aria-labelledby="mix-label-'+row.key+'">'+
        row.items.map(function(item,n){return '<div class="mix-slide" aria-label="第 '+(n+1)+' 件，共 '+row.items.length+' 件：'+esc(item.name)+'"><div class="mix-visual">'+visual(item)+'</div><strong>'+esc(item.name)+'</strong></div>';}).join('')+
        '</div><button type="button" class="switch next" aria-label="下一件'+row.label+'">›</button></div></section>';
    }).join('');
    rows.forEach(function(row){
      var el=track(row),container=el.closest('[data-row]');
      container.querySelector('.previous').addEventListener('click',function(){move(row,-1);});
      container.querySelector('.next').addEventListener('click',function(){move(row,1);});
      el.addEventListener('scroll',function(){clearTimeout(timers[row.key]);timers[row.key]=setTimeout(function(){var w=width(el);if(w){var n=Math.max(0,Math.min(row.items.length-1,Math.round(el.scrollLeft/w)));if(n!==choices[row.key]){choices[row.key]=n;updateMix();}}},90);},{passive:true});
      el.addEventListener('keydown',function(e){if(['ArrowLeft','ArrowRight','Home','End'].indexOf(e.key)<0)return;e.preventDefault();move(row,e.key==='ArrowLeft'?-1:e.key==='ArrowRight'?1:e.key==='Home'?-row.items.length:row.items.length);});
    });
    $('mixReset').addEventListener('click',function(){rows.forEach(function(row){clearTimeout(timers[row.key]);choices[row.key]=0;track(row).scrollLeft=0;});updateMix();});
    $('mixShuffle').addEventListener('click',function(){
      rows.forEach(function(row){var n=row.items.length,next=Math.floor(Math.random()*n);if(n>1&&next===choices[row.key])next=(next+1+Math.floor(Math.random()*(n-1)))%n;choices[row.key]=next;});
      updateMix();rows.forEach(function(row){scrollRow(row,true);});
    });
    window.addEventListener('resize',function(){rows.forEach(function(row){track(row).scrollLeft=choices[row.key]*width(track(row));});});
    /* 默认一套与「看天穿衣」初始方案一致，演示之间互相呼应 */
    var start=suggest(wState);
    if(start){var s=slotsOf(start);[['top',s.outer||s.top],['bottom',s.bottom],['shoes',s.shoes]].forEach(function(pair){var row=rows.filter(function(r){return r.key===pair[0];})[0],n=pair[1]?row.items.indexOf(pair[1]):-1;if(n>=0)choices[row.key]=n;});}
    updateMix();
    requestAnimationFrame(function(){rows.forEach(function(row){scrollRow(row,false);});});
  }
  renderWeather();

  /* ---------- 04 数字衣橱：按类别筛选，点一件放进「自己滑着搭」 ---------- */
  var closetChips=$('closetChips'),closetGrid=$('closetGrid'),closetFilter='全部',closetNoteTimer=null;
  var categories=['全部','上装','外套','下装','鞋履','包袋'];
  function countText(){var n=closetFilter==='全部'?closet.length:closet.filter(function(i){return i.category===closetFilter;}).length;return (closetFilter==='全部'?'共 ':closetFilter+' · ')+n+' 件';}
  function renderCloset(fade){
    var list=closet.filter(function(i){return closetFilter==='全部'||i.category===closetFilter;});
    closetGrid.innerHTML=list.map(function(item){
      var inMix=item.category!=='包袋';
      return '<li><button type="button" data-id="'+item.id+'" aria-label="'+esc(item.name)+(inMix?'，放进自己滑着搭':'，包袋会在规则搭配里自动搭配')+'"><span class="closet-tile">'+visual(item)+'</span><b>'+esc(item.name)+'</b><small>'+esc(item.category)+' · '+esc(item.season)+'</small></button></li>';
    }).join('');
    Array.from(closetChips.children).forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.cat===closetFilter));});
    $('closetCount').textContent=countText();
    if(fade)Array.from(closetGrid.children).forEach(function(el,n){animate(el,[{opacity:0,transform:'scale(.95)'},{opacity:1,transform:'none'}],{duration:300,delay:n*28,easing:ease,fill:'backwards'});});
  }
  if(closetChips&&closetGrid){
    closetChips.innerHTML=categories.map(function(cat){var n=cat==='全部'?closet.length:closet.filter(function(i){return i.category===cat;}).length;return '<button type="button" data-cat="'+cat+'" aria-pressed="false">'+cat+'<small>'+n+'</small></button>';}).join('');
    closetChips.addEventListener('click',function(e){var b=e.target.closest('[data-cat]');if(!b||b.dataset.cat===closetFilter)return;closetFilter=b.dataset.cat;renderCloset(true);});
    closetGrid.addEventListener('click',function(e){
      var b=e.target.closest('[data-id]');if(!b)return;
      var item=byId[Number(b.dataset.id)];
      if(item.category==='包袋'){
        clearTimeout(closetNoteTimer);$('closetCount').textContent='包袋不在三行滑动里，规则搭配会自动配上';
        closetNoteTimer=setTimeout(function(){$('closetCount').textContent=countText();},2600);return;
      }
      selectItem(item.id,true);
    });
    renderCloset(false);
  }

  /* ---------- 页脚：单品照片署名（Unsplash License 不强制署名，这里仍逐张注明摄影师与原图链接） ---------- */
  var credits=$('photoCredits');
  if(credits)credits.innerHTML=closet.map(function(item){
    return '<li><a href="https://unsplash.com/photos/'+encodeURIComponent(item.page)+'" target="_blank" rel="noopener noreferrer">'+esc(item.name)+'</a> · 摄影 '+esc(item.by)+'</li>';
  }).join('');

  /* ---------- 复制启动命令 ---------- */
  function fallbackCopy(text){
    var area=doc.createElement('textarea');area.value=text;area.setAttribute('readonly','');area.style.position='fixed';area.style.opacity='0';
    doc.body.appendChild(area);area.select();var ok=false;try{ok=doc.execCommand('copy');}catch(e){ok=false;}area.remove();return ok;
  }
  var copyButton=$('copyCode');
  if(copyButton)copyButton.addEventListener('click',function(){
    var text=$(copyButton.dataset.copy).textContent,status=$('copyStatus'),label=copyButton.querySelector('span');
    function done(ok){label.textContent=ok?'已复制':'复制失败';if(status)status.textContent=ok?'启动命令已复制':'复制失败，请手动选择命令';setTimeout(function(){label.textContent='复制';},1800);}
    if(navigator.clipboard&&window.isSecureContext)navigator.clipboard.writeText(text).then(function(){done(true);},function(){done(fallbackCopy(text));});
    else done(fallbackCopy(text));
  });

  /* ---------- 滚动出现 ---------- */
  var reveals=doc.querySelectorAll('.reveal');
  if(reduced()||!('IntersectionObserver' in window))reveals.forEach(function(el){el.classList.add('is-in');});
  else{
    var appear=new IntersectionObserver(function(entries){entries.forEach(function(entry){if(entry.isIntersecting){entry.target.classList.add('is-in');appear.unobserve(entry.target);}});},{rootMargin:'0px 0px -8% 0px',threshold:.12});
    reveals.forEach(function(el){appear.observe(el);});
  }
})();
