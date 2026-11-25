(function(){
  'use strict';
  var base='./outfit-independent/public/';
  var rows=[
    {key:'top',label:'上装',items:[{name:'米白圆领针织衫',category:'上装',color:'米白',image:'reference-cream-knit-v1.png'},{name:'浅蓝短袖衬衫',category:'上装',color:'浅蓝'},{name:'白色短袖 T 恤',category:'上装',color:'白色'}]},
    {key:'bottom',label:'下装',items:[{name:'浅蓝直筒牛仔裤',category:'下装',color:'浅蓝',image:'reference-light-blue-jeans-v1.png'},{name:'藏蓝百褶短裙',category:'下装',color:'藏蓝'},{name:'奶白休闲长裤',category:'下装',color:'奶白'}]},
    {key:'shoes',label:'鞋子',items:[{name:'白色运动鞋',category:'鞋履',color:'白色',image:'reference-white-sneakers-v1.png'},{name:'黑色乐福鞋',category:'鞋履',color:'黑色'}]}
  ];
  var choices={top:0,bottom:0,shoes:0},timers={};
  function esc(s){return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function track(row){return document.querySelector('[data-track="'+row.key+'"]');}
  function width(el){return el.getBoundingClientRect().width||el.clientWidth;}
  function update(){
    rows.forEach(function(row){var selected=choices[row.key];document.querySelector('[data-row="'+row.key+'"] .previous').disabled=selected===0;document.querySelector('[data-row="'+row.key+'"] .next').disabled=selected===row.items.length-1;Array.from(track(row).children).forEach(function(el,n){el.setAttribute('aria-current',String(n===selected));});});
    document.getElementById('demoSummary').textContent=rows.map(function(row){return row.items[choices[row.key]].name;}).join(' ＋ ');
  }
  function move(row,delta){var n=Math.max(0,Math.min(row.items.length-1,choices[row.key]+delta));choices[row.key]=n;update();track(row).scrollTo({left:n*width(track(row)),behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}
  document.getElementById('demoRows').innerHTML=rows.map(function(row){return '<section class="demo-row" data-row="'+row.key+'"><h3 id="label-'+row.key+'">'+row.label+'</h3><div class="row-carousel"><button type="button" class="switch previous" aria-label="上一件'+row.label+'">‹</button><div class="demo-track" data-track="'+row.key+'" tabindex="0" aria-labelledby="label-'+row.key+'">'+row.items.map(function(item){return '<div class="demo-slide"><div>'+(item.image?'<img src="'+base+item.image+'" alt="'+esc(item.name)+'参考">':window.OutfitReference.illustration(item))+'</div><strong>'+esc(item.name)+'</strong><small>'+(item.image?'AI 款式参考':'款式轮廓示意')+'</small></div>';}).join('')+'</div><button type="button" class="switch next" aria-label="下一件'+row.label+'">›</button></div></section>';}).join('');
  rows.forEach(function(row){
    var el=track(row),container=el.closest('[data-row]');container.querySelector('.previous').addEventListener('click',function(){move(row,-1);});container.querySelector('.next').addEventListener('click',function(){move(row,1);});
    el.addEventListener('scroll',function(){clearTimeout(timers[row.key]);timers[row.key]=setTimeout(function(){var w=width(el);if(w){choices[row.key]=Math.max(0,Math.min(row.items.length-1,Math.round(el.scrollLeft/w)));update();}},90);},{passive:true});
    el.addEventListener('keydown',function(e){if(['ArrowLeft','ArrowRight','Home','End'].indexOf(e.key)<0)return;e.preventDefault();move(row,e.key==='ArrowLeft'?-1:e.key==='ArrowRight'?1:e.key==='Home'?-row.items.length:row.items.length);});
  });
  document.getElementById('resetDemo').addEventListener('click',function(){rows.forEach(function(row){clearTimeout(timers[row.key]);choices[row.key]=0;track(row).scrollLeft=0;});update();});
  window.addEventListener('resize',function(){rows.forEach(function(row){track(row).scrollLeft=choices[row.key]*width(track(row));});});
  update();
})();
