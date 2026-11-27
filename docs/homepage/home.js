/* 穿搭魔镜 · 网页版（ALP1NE 版式）：打开就能用，不用下载、安装或注册。
   顶栏时钟与手机菜单；一个 requestAnimationFrame 循环驱动首屏换装、底部标题、视差拼贴和风格卡；
   之后是网页版衣橱：拍照入橱（在浏览器里缩小照片、取主色）、看天穿衣、自己滑着搭、我的衣橱 / 示例衣橱 / 搭配收藏、备份导出与导入。
   访客添加的衣服和收藏只保存在这台设备的浏览器里（IndexedDB），本站不接收任何数据。
   示例衣橱的单品用真实照片（Unsplash，见页脚署名）；搭配规则复用完整 App 的 outfit-plan.js，这里不重复实现规则。 */
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

  /* 示例衣橱：还没添加自己的衣服时，看天穿衣、自己滑着搭和衣橱都用这一份。季节取值与完整 App 的单品表单一致。
     单品照片全部来自 Unsplash（Unsplash License：可免费使用，无需另行授权），已下载到 homepage/photos/ 随网页发布；文件末尾按 page 与 by 把每张的原图链接和摄影师写进页脚署名。
     photo 是该图在 images.unsplash.com 的编号，rect 为可选的裁切区域（原图像素 x,y,宽,高，用来避开同框的其他衣服）：两者记录本地照片的来源，重新下载时使用（见 WORKFLOW.md 3.5）。 */
  var closet=[
    {id:1,name:'白色纯色短袖 T 恤',category:'上装',color:'白色',hex:'#f3f1ec',season:'夏季',photo:'1722310752951-4d459d28c678',page:'a-white-t-shirt-hanging-on-a-white-wall-fiA7sq2PdnQ',by:'Jonathan Mattson'},
    {id:2,name:'浅蓝亚麻短袖衬衫',category:'上装',color:'浅蓝',hex:'#b7c3d8',season:'夏季',photo:'1713881842156-3d9ef36418cc',page:'a-blue-shirt-hanging-on-a-clothes-line-SI7Hmk8MXQU',by:'tian dayong'},
    {id:3,name:'米白亚麻短袖衬衫',category:'上装',color:'米白',hex:'#ebe5d8',season:'夏季',photo:'1713881587420-113c1c43e28a',page:'a-white-shirt-hanging-on-a-clothes-line-S4f4apZd-hA',by:'tian dayong'},
    {id:4,name:'奶白高领厚针织毛衣',category:'上装',color:'奶白',hex:'#eee8de',season:'秋冬',photo:'1687275161342-8699c61e4364',page:'a-white-sweater-hanging-on-a-clothes-rack-m2chM9O-ZHs',by:'Ihor Rapita'},
    {id:5,name:'香芋紫圆领毛衣',category:'上装',color:'香芋紫',hex:'#b39ac8',season:'春秋',photo:'1687275164205-732738f0c7bc',page:'a-purple-sweater-hanging-on-a-rack-next-to-a-vase-with-dried-flowers-HDsXgLf4w5Q',by:'Ihor Rapita'},
    {id:6,name:'焦糖棕马海毛针织衫',category:'上装',color:'焦糖棕',hex:'#7b4a33',season:'秋冬',photo:'1773747310662-e7cc9e681226',page:'a-brown-knitted-sweater-hangs-on-a-white-hanger-g3AwbdZut70',by:'Yuliia Pakhomova'},
    {id:7,name:'米白长款风衣',category:'外套',color:'米白',hex:'#e3dbcc',season:'春秋',photo:'1722859031306-4c81e8d83957',rect:'0,350,2900,2900',page:'a-coat-rack-with-coats-hanging-on-it-_Ssh8Z8ENQM',by:'Lisa Anna'},
    {id:8,name:'灰色人字纹厚羊毛大衣',category:'外套',color:'灰色',hex:'#8c8a87',season:'冬季',photo:'1722858958066-97deb3471c89',page:'a-coat-hanging-on-a-coat-rack-in-a-closet-pvCjWi5bATg',by:'Lisa Anna'},
    {id:9,name:'浅蓝水洗牛仔夹克',category:'外套',color:'浅蓝',hex:'#9cb2c8',season:'春秋',photo:'1543076447-215ad9ba6923',page:'blue-washed-jacket-hanging-on-white-door-_BDBEP0ePQc',by:'kemal alkan'},
    {id:10,name:'深蓝直筒牛仔裤',category:'下装',color:'深蓝',hex:'#2f3f55',season:'四季',photo:'1754555009601-498e9873197e',page:'jeans-hang-on-a-wooden-hanger-nC4-PXzKZcI',by:'Pesce Huang'},
    {id:11,name:'浅蓝卷边牛仔裤',category:'下装',color:'浅蓝',hex:'#5d7ea6',season:'四季',photo:'1714143136372-ddaf8b606da7',page:'a-pair-of-blue-jeans-on-a-white-background-9yoXrG6Er_g',by:'TuanAnh Blue'},
    {id:12,name:'焦糖色纱质中长裙',category:'下装',color:'焦糖色',hex:'#8a5a3b',season:'春秋',photo:'1527332042004-0b1a4d8646a3',page:'brown-skirt-hanged-on-wall-1PKjyPsH8sw',by:'Gaelle Marcel'},
    {id:13,name:'白色简约板鞋',category:'鞋履',color:'白色',hex:'#f1f1ef',season:'四季',photo:'1725271741216-743c37073437',page:'a-white-sneaker-with-a-black-and-white-star-on-the-side-wHUlMvFHEbA',by:'SJ'},
    {id:14,name:'棕色麂皮乐福鞋',category:'鞋履',color:'棕色',hex:'#9a6a3f',season:'春秋',photo:'1676121270762-47c8d3a7b9d5',page:'a-pair-of-brown-suede-loafers-with-gold-hardwares-KOavcW0p7oc',by:'Nelibar Shoes'},
    {id:15,name:'棕色切尔西短靴',category:'鞋履',color:'棕色',hex:'#a5622e',season:'秋冬',photo:'1773425975272-35f0900a9d8f',page:'a-tan-leather-chelsea-boot-against-a-white-background-F9O-R3RF5Xs',by:'roberto saborizado'},
    {id:16,name:'焦糖色皮质托特包',category:'包袋',color:'焦糖色',hex:'#9b5a2a',season:'四季',photo:'1624687943971-e86af76d57de',page:'brown-leather-handbag-on-white-table-XwjrPFW7xw0',by:'Ugluk Potroshitel'},
    {id:17,name:'米白帆布托特包',category:'包袋',color:'米白',hex:'#e7e3d9',season:'四季',photo:'1574365569389-a10d488ca3fb',page:'white-reusable-bag-on-gray-surface-smTDI-z1rlY',by:'Brando Makes Branding'},
    {id:18,name:'灰色皮质剑桥包',category:'包袋',color:'浅灰',hex:'#8d8991',season:'四季',photo:'1605733513597-a8f8341084e6',page:'grey-leather-satchel-with-gold-buckles-J4DnKxz_3sA',by:'mostafa mahmoudi'}
  ];
  var bandColors=['#6d88ab','#93abc2','#a9b597','#cdb384','#d49a66','#b9694b'];
  var weatherIcons={'晴':'i-sun','多云':'i-cloud','大风':'i-wind','小雨':'i-rain','雨雪':'i-snow'};
  var weatherNames={'晴':'晴','多云':'多云','大风':'大风','小雨':'小雨','雨雪':'雨雪'};

  /* ---------- 衣橱数据：示例衣橱 + 我的衣橱（访客自己添加，只存在本机浏览器）。source 决定看天穿衣和自己滑着搭用哪一个 ---------- */
  var CATEGORIES=['上装','外套','下装','连衣裙','鞋履','包袋','配饰','其他'],SEASONS=['四季','春季','夏季','秋季','冬季','春秋','春夏','秋冬'];
  var mine=[],saved=[],source='sample',index={};
  function reindex(){index={};closet.concat(mine).forEach(function(item){index[String(item.id)]=item;});}
  function find(id){return index[String(id)]||null;}
  function wardrobe(){return source==='mine'?mine:closet;}
  function sourceName(){return source==='mine'?'我的衣橱':'示例衣橱';}
  reindex();

  /* 单品图：访客的单品用浏览器里保存的照片（src），示例单品是 480×480 的本地照片（photo），没有照片的单品显示成该颜色的衣架；规则给出的「待补」单品只有虚线衣架 */
  function photoUrl(item){return 'homepage/photos/item-'+(item.id<10?'0':'')+item.id+'.jpg';}
  function visual(item,eager){
    var lazy=eager?'':' loading="lazy"';
    if(item&&item.src)return '<img class="ph" src="'+esc(item.src)+'" alt=""'+lazy+' decoding="async">';
    if(item&&item.photo)return '<img class="ph" src="'+photoUrl(item)+'" alt="" width="480" height="480"'+lazy+' decoding="async">';
    if(item&&item.hex)return '<span class="ph-gap ph-own" style="--hex:'+esc(item.hex)+'">'+icon('i-hanger')+'</span>';
    return '<span class="ph-gap">'+icon('i-hanger')+'</span>';
  }
  function suggest(o){return Planner?Planner.suggest(wardrobe(),[],o):null;}
  function slotsOf(plan){
    var slots={};
    plan.items.forEach(function(entry){var item=find(entry.id);if(!item)return;var g=Planner.group(item);if(!slots[g])slots[g]=item;});
    return slots;
  }

  /* ---------- 顶栏：时钟（浏览器本地时间，每秒刷新）与手机 / 平板菜单 ---------- */
  var clocks=Array.from(doc.querySelectorAll('[data-clock]')),weekdays=['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
  function two(n){return (n<10?'0':'')+n;}
  function tickClock(){
    var d=new Date(),text=two(d.getHours())+':'+two(d.getMinutes())+':'+two(d.getSeconds())+' '+weekdays[d.getDay()]+' '+(d.getMonth()+1)+'月'+d.getDate()+'日 '+d.getFullYear();
    clocks.forEach(function(el){el.textContent=text;});
  }
  tickClock();setInterval(tickClock,1000);

  var menuToggle=$('menuToggle'),menu=$('mobileMenu');
  function setMenu(open){
    if(!menu||!menuToggle)return;
    menu.classList.toggle('active',open);
    menu.setAttribute('aria-hidden',String(!open));
    if(open)menu.removeAttribute('inert');else menu.setAttribute('inert','');
    menuToggle.setAttribute('aria-expanded',String(open));
    menuToggle.textContent=open?'关闭':'菜单';
  }
  if(menuToggle&&menu){
    menuToggle.addEventListener('click',function(){setMenu(!menu.classList.contains('active'));});
    menu.addEventListener('click',function(e){if(e.target.closest('a')||e.target===menu)setMenu(false);});
    doc.addEventListener('keydown',function(e){if(e.key==='Escape'&&menu.classList.contains('active')){setMenu(false);menuToggle.focus();}});
    if(window.matchMedia){var wide=window.matchMedia('(min-width: 1025px)');var onWide=function(){if(wide.matches)setMenu(false);};if(wide.addEventListener)wide.addEventListener('change',onWide);else if(wide.addListener)wide.addListener(onWide);}
  }

  /* ---------- 滚动驱动的画面（提示词里的 ALP1NE 效果）：首屏换装、底部标题、视差拼贴、风格卡展开与切换 ----------
     只有一个 requestAnimationFrame 循环：滚动或尺寸变化时启动，各数值按 lerp 逐帧逼近目标，全部追上后自动停下，不空转。
     提示词的首屏是随滚动拖动进度的视频；这里换成用户提供的人物形象照，按滚动进度依次淡入并缓慢拉远，效果相同。 */
  var still=reduced(),busy=false;
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function easeInOutCubic(t){return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;}
  function smoothstep(t){return t*t*(3-2*t);}
  /* obj[key] 每帧向目标靠近 factor 的比例；减少动态效果时直接到位 */
  function approach(obj,key,target,factor){
    var v=obj[key],next=still||Math.abs(target-v)<.0005?target:v+(target-v)*factor;
    obj[key]=next;if(next!==target)busy=true;return next;
  }
  var frames=Array.from(doc.querySelectorAll('.bg-frame')),heroSpacer=doc.querySelector('.hero-spacer'),bgWrap=$('background-wrapper'),titleWrap=$('bottomTitle'),titleText=titleWrap?titleWrap.firstElementChild:null,caption=$('lookCaption');
  var layers=Array.from(doc.querySelectorAll('[data-parallax]')).map(function(section){
    return {el:section,top:0,height:0,scale:1,p:null,items:Array.from(section.querySelectorAll('.parallax-item')).map(function(el){return {el:el,speed:Number(el.dataset.speed)||0,drift:Number(el.dataset.drift)||0,rot:Number(el.dataset.rot)||0};})};
  });
  var looks=$('looks'),looksWindow=$('looksWindow'),looksTrack=$('looksTrack'),looksCards=looksTrack?Array.from(looksTrack.children):[],looksSymbol=$('looksSymbol'),looksCta=$('looksCta');
  var looksImages=looksCards.map(function(card){return card.querySelector('img');});
  /* 与 home.css 对应：.looks 比视口高 3400px，前 700px 打开窗口，其余每 900px 换一张卡（每张先停一会儿再滑走） */
  var REVEAL_PX=700,CARD_PX=900,symbols=['◇','≠','↟','✦','⊹','∧','⟡','∴','⟶','∿'];
  var view={h:1,hero:1,looksTop:0},cur={frame:0,title:0,reveal:0,card:0},shownFrame=-1,shownCard=-1,heroHidden=false,ticking=false,symbolTimer=null;

  function measure(){
    var y=window.scrollY;
    view.h=window.innerHeight||1;
    view.hero=heroSpacer?heroSpacer.offsetHeight:view.h;
    layers.forEach(function(layer){var r=layer.el.getBoundingClientRect();layer.top=r.top+y;layer.height=r.height;layer.scale=parseFloat(getComputedStyle(layer.el).getPropertyValue('--pscale'))||1;});
    if(looks)view.looksTop=looks.getBoundingClientRect().top+y;
    kick();
  }
  function kick(){if(!ticking){ticking=true;requestAnimationFrame(tick);}}
  function showCard(i){
    var card=looksCards[i],style=card?card.dataset.style:'';
    if(looksCta&&style){looksCta.dataset.style=style;looksCta.textContent='按「'+style+'」风格搭一套 ⟶';}
    if(!looksSymbol)return;
    var next=symbols[Math.floor(Math.random()*symbols.length)];
    if(next===looksSymbol.textContent)next=symbols[(symbols.indexOf(next)+1)%symbols.length];
    clearTimeout(symbolTimer);
    if(still){looksSymbol.textContent=next;return;}
    looksSymbol.style.opacity='0';
    symbolTimer=setTimeout(function(){looksSymbol.textContent=next;looksSymbol.style.opacity='1';},150);
  }
  function tick(){
    ticking=false;busy=false;
    var y=window.scrollY;

    /* 1. 首屏：滚过 250vh 的占位区时依次换到下一套；每张停留大半段，只在中间 40% 淡入下一张，同时缓慢拉远 */
    var past=y>view.hero+view.h;
    if(frames.length&&!past){
      var f=approach(cur,'frame',clamp(y/view.hero,0,1)*(frames.length-1),.12),a=Math.floor(f),mix=smoothstep(clamp((f-a-.3)/.4,0,1));
      frames.forEach(function(el,i){
        var o=i===a?1:i===a+1?mix:0;
        el.style.opacity=o;
        if(o>0&&!still)el.style.transform='scale('+(1.1-.06*clamp((f-i+1)/2,0,1)).toFixed(4)+')';
      });
      var n=clamp(Math.round(f),0,frames.length-1);
      if(n!==shownFrame&&caption){shownFrame=n;caption.textContent='LOOK '+two(n+1)+' / '+two(frames.length)+' · '+frames[n].dataset.look;}
    }
    /* 首屏完全被后面的内容盖住后，隐藏固定层，省掉之后每一帧的合成 */
    if(past!==heroHidden){heroHidden=past;[bgWrap,titleWrap,caption].forEach(function(el){if(el)el.style.visibility=past?'hidden':'';});}

    /* 2. 底部标题：首屏前 85% 的滚动里上移 150px、缩到 0.8、模糊到 24px，30% 之后开始淡出 */
    if(titleText&&!past){
      var q=approach(cur,'title',clamp(y/(view.hero*.85),0,1),.12),op=q<.3?1:Math.max(0,1-(q-.3)/.7);
      titleText.style.opacity=op.toFixed(3);
      if(!still){titleText.style.transform='translateY('+(-150*q).toFixed(1)+'px) scale('+(1-.2*q).toFixed(4)+')';titleText.style.filter=q>.002?'blur('+(24*q).toFixed(2)+'px)':'none';}
      if(caption)caption.style.opacity=op.toFixed(3);
    }

    /* 3. 视差拼贴：区块中心与视口中心的距离归一到 -1.2…1.2，每件按自己的速度、横向漂移和旋转移动 */
    if(!still)layers.forEach(function(layer){
      var range=(layer.height+view.h)/2,target=clamp(((y+view.h/2)-(layer.top+layer.height/2))/range*1.2,-1.2,1.2);
      if(layer.p===null)layer.p=target;
      var before=layer.p,p=approach(layer,'p',target,.12),px=520*layer.scale;
      if(p===before&&layer.drawn)return;
      layer.drawn=true;
      layer.items.forEach(function(it){it.el.style.transform='translate3d('+(p*it.speed*it.drift*px).toFixed(1)+'px,'+(-p*it.speed*px).toFixed(1)+'px,0) rotate('+(p*it.rot*4).toFixed(2)+'deg)';});
    });

    /* 4. 风格卡：舞台固定后，窗口从中心展开（easeInOutCubic），之后横向切换四张卡；每张卡先停留，再在中间 60% 的距离里滑到下一张，卡内照片反向位移形成视差 */
    if(looks&&looksWindow&&looksTrack&&looksCards.length){
      var s=y-view.looksTop,count=looksCards.length;
      var rv=approach(cur,'reveal',easeInOutCubic(clamp(s/REVEAL_PX,0,1)),.15),inset=(50*(1-rv)).toFixed(3)+'%';
      var clip=rv>=.9995?'inset(0px 0px round 3px)':'inset('+inset+' '+inset+' '+inset+' '+inset+' round 3px)';
      looksWindow.style.webkitClipPath=clip;looksWindow.style.clipPath=clip;
      var raw=count>1?clamp((s-REVEAL_PX)/(CARD_PX*(count-1)),0,1)*(count-1):0,seg=Math.min(Math.floor(raw),Math.max(0,count-2));
      var pos=approach(cur,'card',count>1?seg+smoothstep(clamp((raw-seg-.2)/.6,0,1)):0,.15);
      looksTrack.style.transform='translate3d('+(-pos/count*100).toFixed(4)+'%,0,0)';
      /* 照片比卡片宽 24%（home.css 左右各多 12%），位移最多 12% 卡宽，换算成照片自身宽度的百分比 */
      looksImages.forEach(function(img,i){if(img)img.style.transform='translate3d('+((pos-i)*12/1.24).toFixed(3)+'%,0,0)';});
      var idx=clamp(Math.round(pos),0,count-1);
      if(idx!==shownCard){shownCard=idx;showCard(idx);}
    }
    if(busy)kick();
  }
  if(looksCta)looksCta.addEventListener('click',function(){useStyle(looksCta.dataset.style);});
  /* 停止滚动时如果停在两张风格卡之间（画面里还露着上一张的一条），就平滑滚到最近一张卡的停留区；展开窗口的阶段不处理 */
  var snapTimer=null;
  function settleLooks(){
    if(!looks||looksCards.length<2)return;
    var raw=(window.scrollY-view.looksTop-REVEAL_PX)/CARD_PX,near=Math.round(raw);
    if(raw<0||raw>looksCards.length-1||Math.abs(raw-near)<=.2)return;
    window.scrollTo({top:Math.round(view.looksTop+REVEAL_PX+near*CARD_PX),behavior:still?'auto':'smooth'});
  }
  if('onscrollend' in window)window.addEventListener('scrollend',settleLooks);
  else window.addEventListener('scroll',function(){clearTimeout(snapTimer);snapTimer=setTimeout(settleLooks,220);},{passive:true});
  window.addEventListener('scroll',kick,{passive:true});
  window.addEventListener('resize',measure);
  window.addEventListener('load',measure);
  if(doc.fonts&&doc.fonts.ready)doc.fonts.ready.then(measure);
  /* 常见问题展开、衣橱增减、图片和字体加载都会改变页面高度：重新量一次各区块位置 */
  if('ResizeObserver' in window)new ResizeObserver(function(){measure();}).observe(doc.body);
  measure();

  /* ---------- 浏览器本地存储（IndexedDB）。不可用时（如部分无痕窗口）只保存在这次打开的页面里，并提示访客 ---------- */
  var dbPromise=null,volatile=false,persistAsked=false;
  function openDb(){
    if(dbPromise)return dbPromise;
    dbPromise=new Promise(function(resolve){
      try{
        var req=window.indexedDB.open('weave-fit-web',1);
        req.onupgradeneeded=function(){var d=req.result;['items','looks'].forEach(function(name){if(!d.objectStoreNames.contains(name))d.createObjectStore(name,{keyPath:'id'});});};
        req.onsuccess=function(){resolve(req.result);};
        req.onerror=req.onblocked=function(){resolve(null);};
      }catch(e){resolve(null);}
    }).then(function(d){if(!d)volatile=true;return d;});
    return dbPromise;
  }
  function dbRun(name,mode,run){
    return openDb().then(function(d){
      if(!d)return null;
      return new Promise(function(resolve,reject){
        var t=d.transaction(name,mode),req=run(t.objectStore(name));
        t.oncomplete=function(){resolve(req?req.result:null);};
        t.onerror=t.onabort=function(){reject(t.error||new Error('浏览器拒绝了保存'));};
      });
    });
  }
  function dbAll(name){return dbRun(name,'readonly',function(s){return s.getAll();}).then(function(v){return Array.isArray(v)?v:[];});}
  function dbPut(name,value){return dbRun(name,'readwrite',function(s){return s.put(value);});}
  function dbDelete(name,id){return dbRun(name,'readwrite',function(s){return s.delete(id);});}
  /* 第一次保存后请浏览器尽量不要自动清理这些数据 */
  function askPersist(){if(!persistAsked&&navigator.storage&&navigator.storage.persist){persistAsked=true;navigator.storage.persist().catch(function(){});}}
  function newId(prefix){return prefix+Date.now().toString(36)+Math.random().toString(36).slice(2,7);}
  /* 写进数据库的字段；src 是页面里临时生成的照片地址，不保存 */
  function record(item){return {id:item.id,name:item.name,category:item.category,color:item.color,hex:item.hex,season:item.season,note:item.note||'',created:item.created,image:item.image||null};}
  function cleanItem(raw){
    if(!raw||typeof raw.id!=='string'||!raw.id)return null;
    var name=String(raw.name||'').trim().slice(0,40);if(!name)return null;
    var item={id:raw.id.slice(0,40),name:name,category:CATEGORIES.indexOf(raw.category)>=0?raw.category:'其他',color:String(raw.color||'').trim().slice(0,12),hex:/^#[0-9a-f]{6}$/i.test(raw.hex)?raw.hex.toLowerCase():'#d8d1c6',season:SEASONS.indexOf(raw.season)>=0?raw.season:'四季',note:String(raw.note||'').trim().slice(0,60),created:Number(raw.created)||Date.now(),image:raw.image instanceof Blob?raw.image:null};
    if(item.image)item.src=URL.createObjectURL(item.image);
    return item;
  }
  function cleanLook(raw){
    if(!raw||typeof raw.id!=='string'||!raw.id||!Array.isArray(raw.ids))return null;
    return {id:raw.id.slice(0,40),created:Number(raw.created)||Date.now(),source:raw.source==='mine'?'mine':'sample',ids:raw.ids.slice(0,8).map(String),names:Array.isArray(raw.names)?raw.names.slice(0,8).map(function(n){return String(n).slice(0,40);}):[],context:String(raw.context||'').slice(0,80)};
  }
  function byCreated(a,b){return a.created-b.created;}
  function byNewest(a,b){return b.created-a.created;}

  /* ---------- 照片在浏览器里处理：按长边 900px 缩小、转成 JPEG 保存；主色取画面中间、和背景差得多的像素里最常见的颜色 ---------- */
  function toHex(r,g,b){return '#'+[r,g,b].map(function(v){return ('0'+Math.round(clamp(v,0,255)).toString(16)).slice(-2);}).join('');}
  function mainColor(data,w,h){
    var step=Math.max(1,Math.round(Math.sqrt(w*h/60000))),edge=Math.max(2,Math.round(Math.min(w,h)*.05)),r=0,g=0,b=0,n=0,x,y,i;
    for(y=0;y<h;y+=step)for(x=0;x<w;x+=step){if(x>edge&&x<w-edge&&y>edge&&y<h-edge)continue;i=(y*w+x)*4;r+=data[i];g+=data[i+1];b+=data[i+2];n++;}
    var bg=n?[r/n,g/n,b/n]:[255,255,255],buckets={},best=null,all=[0,0,0,0];
    for(y=Math.floor(h*.15);y<h*.85;y+=step)for(x=Math.floor(w*.15);x<w*.85;x+=step){
      i=(y*w+x)*4;var pr=data[i],pg=data[i+1],pb=data[i+2];
      all[0]+=pr;all[1]+=pg;all[2]+=pb;all[3]++;
      if(Math.abs(pr-bg[0])+Math.abs(pg-bg[1])+Math.abs(pb-bg[2])<60)continue;
      var key=(pr>>5)*64+(pg>>5)*8+(pb>>5),e=buckets[key]||(buckets[key]={n:0,r:0,g:0,b:0});
      e.n++;e.r+=pr;e.g+=pg;e.b+=pb;if(!best||e.n>best.n)best=e;
    }
    if(!all[3])return '#d8d1c6';
    /* 衣服和背景颜色太接近：退回画面中间的平均色 */
    if(!best||best.n<all[3]*.04)return toHex(all[0]/all[3],all[1]/all[3],all[2]/all[3]);
    return toHex(best.r/best.n,best.g/best.n,best.b/best.n);
  }
  var COLOR_NAMES=[['白色','#f4f3ef'],['米白','#ebe4d6'],['奶白','#f1ead9'],['浅灰','#c8c6c1'],['灰色','#8d8b87'],['深灰','#4c4b48'],['黑色','#1f1e1c'],['卡其色','#b5a68c'],['驼色','#b88c5a'],['焦糖色','#8e5a35'],['棕色','#6f4a30'],['深棕','#43301f'],['酒红','#6d2230'],['红色','#bf3a32'],['粉色','#e6b3b5'],['橙色','#d9793a'],['黄色','#e3c25a'],['浅蓝','#b5c4d8'],['牛仔蓝','#5b7ca3'],['蓝色','#3a66a0'],['藏蓝','#253350'],['绿色','#4e7a4c'],['橄榄绿','#6b6a3d'],['紫色','#7d5a9e'],['香芋紫','#b29bc6']];
  function rgbOf(hex){var v=parseInt(hex.slice(1),16);return [v>>16&255,v>>8&255,v&255];}
  /* 最接近的常用颜色名（redmean 加权的 RGB 距离） */
  function colorName(hex){
    var c=rgbOf(hex),best='',min=Infinity;
    COLOR_NAMES.forEach(function(pair){var d=rgbOf(pair[1]),rm=(c[0]+d[0])/2,dr=c[0]-d[0],dg=c[1]-d[1],db=c[2]-d[2],dist=(2+rm/256)*dr*dr+4*dg*dg+(2+(255-rm)/256)*db*db;if(dist<min){min=dist;best=pair[0];}});
    return best;
  }
  function readPhoto(file){
    return new Promise(function(resolve,reject){
      if(!file||!/^image\//.test(file.type||'')){reject(new Error('请选择一张图片文件'));return;}
      var url=URL.createObjectURL(file),img=new Image();
      img.onload=function(){
        var scale=Math.min(1,900/Math.max(img.naturalWidth,img.naturalHeight)),w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale));
        var canvas=doc.createElement('canvas');canvas.width=w;canvas.height=h;
        var ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.drawImage(img,0,0,w,h);URL.revokeObjectURL(url);
        var hex=mainColor(ctx.getImageData(0,0,w,h).data,w,h);
        canvas.toBlob(function(blob){if(blob)resolve({blob:blob,hex:hex});else reject(new Error('照片处理失败，请换一张试试'));},'image/jpeg',.86);
      };
      img.onerror=function(){URL.revokeObjectURL(url);reject(new Error('这张照片打不开，请换一张（HEIC 格式可以先转成 JPG）'));};
      img.src=url;
    });
  }

  /* ---------- 01 拍照入橱：添加 / 修改 / 删除我的单品 ---------- */
  var form=$('itemForm'),f={},editing=null,pending=null,nameTouched=false,colorTyped=false,deleteArmed=null;
  var NOUNS={'上装':'上衣','外套':'外套','下装':'下装','连衣裙':'连衣裙','鞋履':'鞋','包袋':'包','配饰':'配饰','其他':'单品'};
  function suggestedName(){return (f.color.value.trim()||colorName(f.hex.value))+NOUNS[f.category.value];}
  function setStatus(html,error){if(!f.status)return;f.status.classList.toggle('is-error',!!error);f.status.innerHTML=html;}
  function showPreview(src){
    var label=f.hint.querySelector('b');
    if(src){f.preview.src=src;f.preview.hidden=false;f.drop.classList.add('has-photo');label.textContent='换一张照片';}
    else{f.preview.removeAttribute('src');f.preview.hidden=true;f.drop.classList.remove('has-photo');label.textContent='点这里拍照或选一张照片';}
  }
  function resetForm(){
    if(pending&&pending.url)URL.revokeObjectURL(pending.url);
    clearTimeout(deleteArmed);
    pending=null;editing=null;nameTouched=false;colorTyped=false;deleteArmed=null;
    form.reset();showPreview('');
    f.save.textContent='保存到我的衣橱';f.cancel.hidden=true;f.remove.hidden=true;f.remove.textContent='删除这件';
  }
  function editItem(item){
    resetForm();
    editing=item;nameTouched=true;colorTyped=true;
    f.name.value=item.name;f.category.value=item.category;f.season.value=item.season;f.hex.value=item.hex;f.color.value=item.color;f.note.value=item.note||'';
    showPreview(item.src||'');
    f.save.textContent='保存修改';f.cancel.hidden=false;f.remove.hidden=false;
    setStatus('正在修改「'+esc(item.name)+'」，可以换照片或改任何一项。');
    scrollToEl($('add'));
  }
  function handleFile(file){
    if(!file)return;
    setStatus('正在处理照片…');
    readPhoto(file).then(function(result){
      if(pending&&pending.url)URL.revokeObjectURL(pending.url);
      pending={blob:result.blob,url:URL.createObjectURL(result.blob)};
      showPreview(pending.url);
      if(!colorTyped){f.hex.value=result.hex;f.color.value=colorName(result.hex);}
      if(!nameTouched)f.name.value=suggestedName();
      setStatus('已认出主色「'+esc(f.color.value)+'」。确认名称、类别和季节后保存。');
    },function(err){setStatus(esc(err.message||'照片处理失败'),true);});
  }
  if(form){
    f={photo:$('itemPhoto'),drop:$('photoDrop'),preview:$('itemPreview'),hint:$('photoHint'),name:$('itemName'),category:$('itemCategory'),season:$('itemSeason'),hex:$('itemHex'),color:$('itemColor'),note:$('itemNote'),save:$('itemSave'),cancel:$('itemCancel'),remove:$('itemDelete'),status:$('itemStatus')};
    f.photo.addEventListener('change',function(){handleFile(f.photo.files&&f.photo.files[0]);f.photo.value='';});
    ['dragenter','dragover'].forEach(function(type){f.drop.addEventListener(type,function(e){e.preventDefault();f.drop.classList.add('is-over');});});
    ['dragleave','drop'].forEach(function(type){f.drop.addEventListener(type,function(e){e.preventDefault();f.drop.classList.remove('is-over');});});
    f.drop.addEventListener('drop',function(e){handleFile(e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0]);});
    f.name.addEventListener('input',function(){nameTouched=f.name.value.trim()!=='';});
    f.color.addEventListener('input',function(){colorTyped=f.color.value.trim()!=='';if(!nameTouched)f.name.value=suggestedName();});
    f.hex.addEventListener('input',function(){if(!colorTyped)f.color.value=colorName(f.hex.value);if(!nameTouched)f.name.value=suggestedName();});
    f.category.addEventListener('change',function(){if(!nameTouched&&(pending||f.name.value))f.name.value=suggestedName();});
    f.cancel.addEventListener('click',function(){resetForm();setStatus('已取消修改。');});
    f.remove.addEventListener('click',function(){
      if(!editing)return;
      if(!deleteArmed){f.remove.textContent='再点一次确认删除';deleteArmed=setTimeout(function(){deleteArmed=null;f.remove.textContent='删除这件';},4000);return;}
      var item=editing;
      dbDelete('items',item.id).then(function(){
        if(item.src)URL.revokeObjectURL(item.src);
        mine=mine.filter(function(i){return i.id!==item.id;});
        resetForm();
        if(!mine.length){source='sample';closetView='sample';}
        refreshAll(true);
        setStatus('已删除「'+esc(item.name)+'」。');
      },function(){setStatus('删除失败，请再试一次。',true);});
    });
    form.addEventListener('submit',function(e){
      e.preventDefault();
      var hex=/^#[0-9a-f]{6}$/i.test(f.hex.value)?f.hex.value.toLowerCase():'#d8d1c6';
      var item=editing?Object.assign({},editing):{id:newId('u'),created:Date.now(),image:null};
      item.name=(f.name.value.trim()||suggestedName()).slice(0,40);
      item.category=f.category.value;item.season=f.season.value;item.hex=hex;
      item.color=(f.color.value.trim()||colorName(hex)).slice(0,12);
      item.note=f.note.value.trim().slice(0,60);
      if(pending)item.image=pending.blob;
      var wasEditing=!!editing,photo=pending;
      f.save.disabled=true;
      dbPut('items',record(item)).then(function(){
        if(photo){if(editing&&editing.src)URL.revokeObjectURL(editing.src);item.src=photo.url;pending=null;}
        var at=mine.findIndex(function(i){return i.id===item.id;});
        if(at>=0)mine[at]=item;else mine.push(item);
        resetForm();
        source='mine';closetView='mine';
        refreshAll(true);askPersist();
        setStatus((wasEditing?'已保存修改：':'已放进我的衣橱：')+'「'+esc(item.name)+'」，现在共 '+mine.length+' 件。<a href="#closet">去衣橱看看 ↓</a>'+(volatile?'<br>这个浏览器现在不能长期保存数据（可能是无痕窗口），关闭页面后会清空，记得导出备份。':''));
      },function(err){setStatus('保存失败：'+esc(err&&err.message||'浏览器拒绝了保存，可能是存储空间不足')+'。',true);}).then(function(){f.save.disabled=false;});
    });
  }

  /* ---------- 02 看天穿衣：完整 App 的 outfit-plan.js 规则在浏览器内运行，用当前选中的衣橱 ---------- */
  var wState={season:'春季',temperature:18,weather:'晴',style:'极简',occasion:'日常通勤',variant:0};
  var tempRange=$('wTemp'),currentPlan=null,lastPlanKey='',pendingFrame=false;
  function climate(){return Planner?Planner.climateFor({season:wState.season,temperature:wState.temperature,weather:wState.weather}):null;}
  function taobao(name){return '<a href="https://s.taobao.com/search?q='+encodeURIComponent(name)+'" target="_blank" rel="noopener noreferrer">去淘宝搜</a>';}
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
    var pieces=plan.items.map(function(entry){var item=find(entry.id);return item?{item:item,gap:false}:null;}).filter(Boolean)
      .concat(plan.gaps.map(function(gap){return {item:gap,gap:true};}));
    var key=source+':'+pieces.map(function(p){return p.gap?'gap:'+p.item.name:p.item.id;}).join('|'),list=$('wList');
    if(key!==lastPlanKey){
      lastPlanKey=key;
      list.innerHTML=pieces.map(function(p){
        var item=p.item;
        return '<li'+(p.gap?' class="gap"':'')+'><div class="result-visual"><span class="result-role">'+esc(p.gap?'待补':item.category)+'</span>'+visual(p.gap?null:item)+'</div><b title="'+esc(item.name)+'">'+esc(item.name)+'</b><small>'+(p.gap?esc(item.category)+' · '+taobao(item.name):sourceName())+'</small></li>';
      }).join('');
      Array.from(list.children).forEach(function(el,n){animate(el,[{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'none'}],{duration:360,delay:n*45,easing:ease,fill:'backwards'});});
    }else if(variantTried){
      animate(list,[{transform:'translateX(0)'},{transform:'translateX(-5px)'},{transform:'translateX(4px)'},{transform:'translateX(0)'}],{duration:340,easing:'ease-out'});
    }
    var tips=(plan.warnings||[]).map(function(t){return '<li class="warn">'+esc(t)+'</li>';})
      .concat(plan.gaps.map(function(g){return '<li class="warn">待补「'+esc(g.name)+'」：'+esc(g.advice)+' '+taobao(g.name)+'</li>';}))
      .concat((plan.tips||[]).slice(1).map(function(t){return '<li>'+esc(t)+'</li>';}));
    if(variantTried&&key===lastPlanKey&&wState.variant>0)tips.unshift('<li>这个衣橱在这一档只有这一套最合适，换个温度、风格或场合再试。</li>');
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
    $('wSave').addEventListener('click',function(){
      var c=climate(),items=currentPlan?currentPlan.items.map(function(entry){return find(entry.id);}):[];
      if(!c)return;
      saveLook(items,c.temperature+'°C · '+weatherNames[wState.weather]+' · '+wState.style+' · '+wState.occasion,$('wSave'));
    });
  }
  /* 风格卡上的「按这个风格搭一套」：把风格带进看天穿衣，重新算一套，并滚到那一节 */
  function useStyle(style){
    var select=$('wStyle');
    if(!select||!style||!tempRange)return;
    select.value=style;wState.style=style;wState.variant=0;
    renderWeather();scrollToEl($('weather'));
  }

  /* ---------- 03 自己滑着搭：三行独立滑动（与完整 App 的三行相同：上装与外套、下装、鞋履），用当前选中的衣橱 ---------- */
  var MIX_ROWS=[{key:'top',label:'上装 / 外套',categories:['上装','外套']},{key:'bottom',label:'下装',categories:['下装']},{key:'shoes',label:'鞋子',categories:['鞋履']}];
  var rows=[],choices={top:0,bottom:0,shoes:0},timers={},mixRows=$('mixRows');
  function track(row){return mixRows.querySelector('[data-track="'+row.key+'"]');}
  function width(el){return el.getBoundingClientRect().width||el.clientWidth;}
  function picked(){return rows.map(function(row){return row.items[choices[row.key]]||null;});}
  function renderMixCheck(){
    var box=$('mixCheck'),c=climate();
    if(!box||!mixRows)return;
    if($('mixTemp'))$('mixTemp').textContent=c?c.temperature+'°C · '+weatherNames[wState.weather]:'';
    if(!c){box.textContent='';return;}
    var items=picked(),present=items.filter(Boolean),head='按 '+c.temperature+'°C · '+c.label+' 检查：';
    if(!present.length){box.className='mix-check';box.textContent='先在「拍照入橱」添加上装、下装或鞋子，这里就能滑着搭。';return;}
    var issues=present.map(function(item){var reason=Planner.unsuitable(item,c);return reason?'「'+item.name+'」'+reason:'';}).filter(Boolean);
    if(issues.length){box.className='mix-check is-warn';box.textContent=head+issues.join('；')+'。只提醒，不替换你的选择。';}
    else if(c.needsOuter&&items[0]&&items[0].category!=='外套'){
      /* 只推荐当前衣橱里此刻真正合适的外套 */
      var outers=rows[0].items.filter(function(i){return i.category==='外套'&&!Planner.unsuitable(i,c);}).map(function(i){return '「'+i.name+'」';});
      box.className='mix-check is-warn';box.textContent=head+'当前温度或风力需要外搭'+(outers.length?'，第一行可以换成'+outers.join('或'):'，衣橱里还没有合适的外套')+'。';
    }
    else{box.className='mix-check';box.textContent=head+'这套都合适'+(items[0]&&items[0].category==='外套'?'，外套里记得配一件内搭。':'。');}
  }
  function updateMix(){
    if(!mixRows)return;
    rows.forEach(function(row){
      var box=mixRows.querySelector('[data-row="'+row.key+'"]'),n=row.items.length,selected=choices[row.key],el=track(row);
      box.querySelector('[data-count]').textContent=n?(selected+1)+' / '+n:'0 件';
      if(!el)return;
      box.querySelector('.previous').disabled=selected<=0;
      box.querySelector('.next').disabled=selected>=n-1;
      Array.from(el.children).forEach(function(slide,i){slide.setAttribute('aria-current',String(i===selected));});
    });
    var names=picked().filter(Boolean).map(function(item){return item.name;});
    $('mixSummary').textContent=names.length?names.join(' ＋ '):'这个衣橱里还没有可以滑动的单品';
    renderMixCheck();
  }
  function scrollRow(row,smooth){var el=track(row);if(el)el.scrollTo({left:choices[row.key]*width(el),behavior:smooth&&!reduced()?'smooth':'auto'});}
  function move(row,delta){if(!row.items.length)return;choices[row.key]=clamp(choices[row.key]+delta,0,row.items.length-1);updateMix();scrollRow(row,true);}
  function selectItem(id,scroll){
    rows.forEach(function(row){var n=row.items.findIndex(function(i){return String(i.id)===String(id);});if(n>=0)choices[row.key]=n;});
    updateMix();
    rows.forEach(function(row){scrollRow(row,false);});
    if(scroll)scrollToEl($('mix'));
  }
  function applyPlan(){
    if(!currentPlan)return;
    var items=currentPlan.items.map(function(entry){return find(entry.id);}).filter(Boolean);
    function first(category){for(var i=0;i<items.length;i++)if(items[i].category===category)return items[i];return null;}
    /* 方案里有外套时，上装行放最外层的外套 */
    var picks={top:first('外套')||first('上装'),bottom:first('下装'),shoes:first('鞋履')};
    rows.forEach(function(row){var item=picks[row.key];if(!item)return;var n=row.items.indexOf(item);if(n>=0)choices[row.key]=n;});
    updateMix();
    rows.forEach(function(row){scrollRow(row,false);});
    scrollToEl($('mix'));
  }
  /* 换衣橱或衣橱有增减时重建三行；能保留的选择按单品保留，否则默认用看天穿衣当前方案里的那一套 */
  function buildMix(){
    if(!mixRows)return;
    var before=picked().map(function(item){return item?String(item.id):'';});
    rows=MIX_ROWS.map(function(r){return {key:r.key,label:r.label,items:wardrobe().filter(function(i){return r.categories.indexOf(i.category)>=0;})};});
    mixRows.innerHTML=rows.map(function(row){
      var body=row.items.length
        ?'<button type="button" class="switch previous" aria-label="上一件'+row.label+'">‹</button>'+
          '<div class="mix-track" data-track="'+row.key+'" tabindex="0" aria-labelledby="mix-label-'+row.key+'">'+
          row.items.map(function(item,n){return '<div class="mix-slide" aria-label="第 '+(n+1)+' 件，共 '+row.items.length+' 件：'+esc(item.name)+'"><div class="mix-visual">'+visual(item)+'</div><strong>'+esc(item.name)+'</strong></div>';}).join('')+
          '</div><button type="button" class="switch next" aria-label="下一件'+row.label+'">›</button>'
        :'<p class="mix-empty"><span>这个衣橱里还没有'+row.label+'，<a href="#add">去拍照入橱添加</a></span></p>';
      return '<section class="mix-row" data-row="'+row.key+'"><div class="mix-row-head"><h4 id="mix-label-'+row.key+'">'+row.label+'</h4><span data-count="'+row.key+'"></span></div><div class="mix-carousel">'+body+'</div></section>';
    }).join('');
    var start=suggest(wState),slots=start?slotsOf(start):{},defaults={top:slots.outer||slots.top,bottom:slots.bottom,shoes:slots.shoes};
    rows.forEach(function(row,ri){
      choices[row.key]=0;
      var keep=before[ri]?row.items.findIndex(function(i){return String(i.id)===before[ri];}):-1;
      var fallback=defaults[row.key]?row.items.indexOf(defaults[row.key]):-1;
      if(keep>=0)choices[row.key]=keep;else if(fallback>=0)choices[row.key]=fallback;
      var el=track(row);if(!el)return;
      var container=el.closest('[data-row]');
      container.querySelector('.previous').addEventListener('click',function(){move(row,-1);});
      container.querySelector('.next').addEventListener('click',function(){move(row,1);});
      el.addEventListener('scroll',function(){clearTimeout(timers[row.key]);timers[row.key]=setTimeout(function(){var w=width(el);if(w){var n=clamp(Math.round(el.scrollLeft/w),0,row.items.length-1);if(n!==choices[row.key]){choices[row.key]=n;updateMix();}}},90);},{passive:true});
      el.addEventListener('keydown',function(e){if(['ArrowLeft','ArrowRight','Home','End'].indexOf(e.key)<0)return;e.preventDefault();move(row,e.key==='ArrowLeft'?-1:e.key==='ArrowRight'?1:e.key==='Home'?-row.items.length:row.items.length);});
    });
    updateMix();
    requestAnimationFrame(function(){rows.forEach(function(row){scrollRow(row,false);});});
  }
  if(mixRows){
    $('mixReset').addEventListener('click',function(){rows.forEach(function(row){clearTimeout(timers[row.key]);choices[row.key]=0;var el=track(row);if(el)el.scrollLeft=0;});updateMix();});
    $('mixShuffle').addEventListener('click',function(){
      rows.forEach(function(row){var n=row.items.length,next=Math.floor(Math.random()*n);if(!n)return;if(n>1&&next===choices[row.key])next=(next+1+Math.floor(Math.random()*(n-1)))%n;choices[row.key]=next;});
      updateMix();rows.forEach(function(row){scrollRow(row,true);});
    });
    $('mixSave').addEventListener('click',function(){var c=climate();saveLook(picked(),(c?c.temperature+'°C · '+weatherNames[wState.weather]+' · ':'')+'自己搭',$('mixSave'));});
    window.addEventListener('resize',function(){rows.forEach(function(row){var el=track(row);if(el)el.scrollLeft=choices[row.key]*width(el);});});
  }

  /* ---------- 搭配收藏：只存单品编号和当时的名字；单品后来删掉了，也还能看到当时那一套叫什么 ---------- */
  function flashButton(button,text){
    if(!button)return;
    var label=button.lastChild;if(!label||label.nodeType!==3)return;
    if(!button.dataset.label)button.dataset.label=label.textContent;
    label.textContent=text;clearTimeout(button._flash);
    button._flash=setTimeout(function(){label.textContent=button.dataset.label;},1800);
  }
  function saveLook(items,context,button){
    items=items.filter(Boolean);
    if(!items.length){flashButton(button,'这一套还没有单品');return;}
    var look={id:newId('l'),created:Date.now(),source:source,ids:items.map(function(i){return String(i.id);}),names:items.map(function(i){return i.name;}),context:context};
    dbPut('looks',look).then(function(){
      saved.unshift(look);renderCounts();askPersist();
      if(closetView==='saved')renderCloset(false);
      flashButton(button,'已收藏 ✓');
    },function(){flashButton(button,'收藏失败');});
  }
  function applyLook(look){
    if(look.source!==source&&(look.source==='sample'||mine.length)){source=look.source;closetView=look.source;refreshAll(false);}
    var items=look.ids.map(find).filter(Boolean);
    if(!items.length){closetNote('这套里的单品都已经删掉了');return;}
    items.forEach(function(item){selectItem(item.id,false);});
    scrollToEl($('mix'));
  }

  /* ---------- 04 我的衣橱：我的衣橱 / 示例衣橱 / 搭配收藏；选哪个衣橱，看天穿衣和自己滑着搭就用哪个 ---------- */
  var closetView='sample',closetFilter='全部',closetNoteTimer=null;
  var closetPanel=$('closetPanel'),closetChips=$('closetChips'),closetGrid=$('closetGrid'),savedList=$('savedList'),closetEmpty=$('closetEmpty');
  function renderCounts(){if($('mineCount'))$('mineCount').textContent=mine.length;if($('savedCount'))$('savedCount').textContent=saved.length;}
  function countText(list){var n=closetFilter==='全部'?list.length:list.filter(function(i){return i.category===closetFilter;}).length;return (closetFilter==='全部'?'共 ':closetFilter+' · ')+n+' 件';}
  function closetNote(text){var el=$('closetCount');if(!el)return;clearTimeout(closetNoteTimer);el.textContent=text;closetNoteTimer=setTimeout(function(){renderCloset(false);},2800);}
  function renderCloset(fade){
    if(!closetPanel)return;
    clearTimeout(closetNoteTimer);
    Array.from(closetPanel.querySelectorAll('[data-view]')).forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.view===closetView));});
    renderCounts();
    var heading=$('closetHeading'),count=$('closetCount');
    if(closetView==='saved'){
      heading.textContent='搭配收藏';count.textContent='共 '+saved.length+' 套';
      closetChips.hidden=true;closetGrid.hidden=true;savedList.hidden=!saved.length;
      closetEmpty.hidden=!!saved.length;
      closetEmpty.innerHTML='还没有收藏。在<a href="#weather">看天穿衣</a>或<a href="#mix">自己滑着搭</a>里点「收藏」，喜欢的整套就会出现在这里。';
      savedList.innerHTML=saved.map(function(look){
        var thumbs=look.ids.slice(0,4).map(function(id,i){var item=find(id);return '<span title="'+esc(item?item.name:look.names[i]||'')+'">'+visual(item)+'</span>';}).join('');
        var names=look.ids.map(function(id,i){var item=find(id);return item?item.name:(look.names[i]||'已删除的单品');}).join(' ＋ ');
        var when=new Date(look.created);
        return '<li><div class="saved-thumbs">'+thumbs+'</div><p>'+esc(names)+'<small>'+esc(look.context)+' · '+(look.source==='mine'?'我的衣橱':'示例衣橱')+' · '+(when.getMonth()+1)+'月'+when.getDate()+'日</small></p><div class="saved-actions"><button type="button" data-apply="'+esc(look.id)+'">放进自己搭</button><button type="button" data-unsave="'+esc(look.id)+'">删除</button></div></li>';
      }).join('');
      return;
    }
    var list=closetView==='mine'?mine:closet;
    heading.textContent=closetView==='mine'?'我的衣橱':'示例衣橱';
    if(closetFilter!=='全部'&&!list.some(function(i){return i.category===closetFilter;}))closetFilter='全部';
    var cats=['全部'].concat(CATEGORIES.filter(function(cat){return list.some(function(i){return i.category===cat;});}));
    closetChips.hidden=!list.length;savedList.hidden=true;closetGrid.hidden=false;
    closetChips.innerHTML=cats.map(function(cat){var n=cat==='全部'?list.length:list.filter(function(i){return i.category===cat;}).length;return '<button type="button" data-cat="'+cat+'" aria-pressed="'+(cat===closetFilter)+'">'+cat+'<small>'+n+'</small></button>';}).join('');
    var shown=list.filter(function(i){return closetFilter==='全部'||i.category===closetFilter;});
    var add=closetView==='mine'?'<li class="add-tile"><button type="button" data-add aria-label="添加一件衣服"><span class="closet-tile">'+icon('i-plus')+'</span><b>添加一件</b><small>拍照或选图</small></button></li>':'';
    closetGrid.innerHTML=add+shown.map(function(item){
      var hint=closetView==='mine'?'，点一下修改':item.category==='包袋'?'，包袋会在规则搭配里自动搭配':'，放进自己滑着搭';
      return '<li><button type="button" data-id="'+esc(item.id)+'" aria-label="'+esc(item.name)+hint+'"><span class="closet-tile">'+visual(item)+'</span><b>'+esc(item.name)+'</b><small>'+esc(item.category)+' · '+esc(item.season)+'</small></button></li>';
    }).join('');
    closetEmpty.hidden=list.length>0;
    closetEmpty.innerHTML='还没有衣服。在上面的<a href="#add">拍照入橱</a>添加第一件；也可以先切到「示例衣橱」，把每个功能都试一遍。';
    count.textContent=countText(list);
    if(fade)Array.from(closetGrid.children).forEach(function(el,n){animate(el,[{opacity:0,transform:'scale(.95)'},{opacity:1,transform:'none'}],{duration:300,delay:Math.min(n,16)*24,easing:ease,fill:'backwards'});});
  }
  function setView(next){
    closetView=next;closetFilter='全部';
    var nextSource=next==='mine'&&mine.length?'mine':next==='sample'?'sample':source;
    if(nextSource!==source){source=nextSource;refreshAll(false);}
    renderCloset(true);
  }
  if(closetPanel){
    closetPanel.addEventListener('click',function(e){
      var tab=e.target.closest('[data-view]');if(tab){setView(tab.dataset.view);return;}
      var chip=e.target.closest('[data-cat]');if(chip){if(chip.dataset.cat!==closetFilter){closetFilter=chip.dataset.cat;renderCloset(true);}return;}
      if(e.target.closest('[data-add]')){if(editing)resetForm();scrollToEl($('add'));if(f.photo)f.photo.focus({preventScroll:true});return;}
      var itemButton=e.target.closest('[data-id]');
      if(itemButton){
        var item=find(itemButton.dataset.id);if(!item)return;
        if(closetView==='mine'){editItem(item);return;}
        if(item.category==='包袋'){closetNote('包袋不在三行滑动里，规则搭配会自动配上');return;}
        selectItem(item.id,true);return;
      }
      var apply=e.target.closest('[data-apply]');
      if(apply){var look=saved.find(function(l){return l.id===apply.dataset.apply;});if(look)applyLook(look);return;}
      var unsave=e.target.closest('[data-unsave]');
      if(unsave){var id=unsave.dataset.unsave;dbDelete('looks',id).then(function(){saved=saved.filter(function(l){return l.id!==id;});renderCloset(false);},function(){closetNote('删除失败，请再试一次');});}
    });
  }

  /* ---------- 备份：导出一个含照片的 JSON 文件；导入时逐项校验，同一编号的单品与收藏会被覆盖 ---------- */
  function blobToDataUrl(blob){return new Promise(function(resolve,reject){var reader=new FileReader();reader.onload=function(){resolve(reader.result);};reader.onerror=function(){reject(reader.error);};reader.readAsDataURL(blob);});}
  function dataUrlToBlob(url){
    var m=/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(url||'');
    if(!m)return null;
    try{var bin=atob(m[2]),bytes=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);return new Blob([bytes],{type:m[1]});}catch(e){return null;}
  }
  if($('exportBackup'))$('exportBackup').addEventListener('click',function(){
    if(!mine.length&&!saved.length){closetNote('还没有可以导出的衣服或收藏');return;}
    Promise.all(mine.map(function(item){var copy=record(item);return item.image?blobToDataUrl(item.image).then(function(url){copy.image=url;return copy;}):Promise.resolve(copy);})).then(function(items){
      var data={app:'weave-fit-web',version:1,exported:new Date().toISOString(),items:items,looks:saved};
      var blob=new Blob([JSON.stringify(data)],{type:'application/json'}),url=URL.createObjectURL(blob),link=doc.createElement('a'),d=new Date();
      link.href=url;link.download='穿搭魔镜-衣橱备份-'+d.getFullYear()+two(d.getMonth()+1)+two(d.getDate())+'.json';
      doc.body.appendChild(link);link.click();link.remove();setTimeout(function(){URL.revokeObjectURL(url);},4000);
      closetNote('已导出 '+items.length+' 件衣服、'+saved.length+' 套收藏');
    },function(){closetNote('导出失败，请再试一次');});
  });
  var importInput=$('importBackup');
  if(importInput)importInput.addEventListener('change',function(){
    var file=importInput.files&&importInput.files[0];importInput.value='';
    if(!file)return;
    if(file.size>80*1024*1024){closetNote('备份文件太大，无法导入');return;}
    file.text().then(function(text){return JSON.parse(text);}).then(function(data){
      if(!data||data.app!=='weave-fit-web'||!Array.isArray(data.items))throw new Error('这不是穿搭魔镜的备份文件');
      var items=data.items.map(function(raw){var copy=Object.assign({},raw);copy.image=typeof raw.image==='string'?dataUrlToBlob(raw.image):null;return cleanItem(copy);}).filter(Boolean);
      var looksIn=(Array.isArray(data.looks)?data.looks:[]).map(cleanLook).filter(Boolean);
      return Promise.all(items.map(function(item){return dbPut('items',record(item));}).concat(looksIn.map(function(look){return dbPut('looks',look);}))).then(function(){
        items.forEach(function(item){var at=mine.findIndex(function(i){return i.id===item.id;});if(at>=0){if(mine[at].src)URL.revokeObjectURL(mine[at].src);mine[at]=item;}else mine.push(item);});
        looksIn.forEach(function(look){var at=saved.findIndex(function(l){return l.id===look.id;});if(at>=0)saved[at]=look;else saved.push(look);});
        mine.sort(byCreated);saved.sort(byNewest);
        if(mine.length){source='mine';closetView='mine';}
        refreshAll(true);
        closetNote('已导入 '+items.length+' 件衣服、'+looksIn.length+' 套收藏');
      });
    }).catch(function(err){closetNote('导入失败：'+(err&&err.message&&!/JSON/.test(err.message)?err.message:'文件无法读取'));});
  });

  /* 衣橱换了来源或有增减：重建索引、三行滑动、规则搭配和衣橱面板 */
  function refreshAll(fade){
    reindex();
    if($('wSource'))$('wSource').textContent=sourceName();
    if($('mixSource'))$('mixSource').textContent=sourceName();
    buildMix();renderWeather();renderCloset(fade);
  }

  /* ---------- 首次渲染：先用示例衣橱，读到本机保存的衣橱后再切过去 ---------- */
  refreshAll(false);
  Promise.all([dbAll('items'),dbAll('looks')]).then(function(r){
    mine=r[0].map(cleanItem).filter(Boolean).sort(byCreated);
    saved=r[1].map(cleanLook).filter(Boolean).sort(byNewest);
  },function(){volatile=true;}).then(function(){
    if(mine.length){source='mine';closetView='mine';}
    refreshAll(false);
    if(volatile)setStatus('提示：这个浏览器现在不能长期保存数据（可能是无痕窗口），关闭页面后衣橱会清空；可以随时导出备份。');
  });

  /* ---------- 页脚：示例单品照片署名（Unsplash License 不强制署名，这里仍逐张注明摄影师与原图链接） ---------- */
  var credits=$('photoCredits');
  if(credits)credits.innerHTML=closet.map(function(item){
    return '<li><a href="https://unsplash.com/photos/'+encodeURIComponent(item.page)+'" target="_blank" rel="noopener noreferrer">'+esc(item.name)+'</a> · 摄影 '+esc(item.by)+'</li>';
  }).join('');

  /* ---------- 滚动出现 ---------- */
  var reveals=doc.querySelectorAll('.reveal');
  if(reduced()||!('IntersectionObserver' in window))reveals.forEach(function(el){el.classList.add('is-in');});
  else{
    var appear=new IntersectionObserver(function(entries){entries.forEach(function(entry){if(entry.isIntersecting){entry.target.classList.add('is-in');appear.unobserve(entry.target);}});},{rootMargin:'0px 0px -8% 0px',threshold:.12});
    reveals.forEach(function(el){appear.observe(el);});
  }
})();
