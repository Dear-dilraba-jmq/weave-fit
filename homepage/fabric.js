/* 穿搭魔镜 · 主页面料渲染：给示例衣橱画出有布料质感的单品（针织罗纹、牛仔斜纹、褶裥、羽绒绗缝、皮革光泽）。
   只服务主页演示；完整 App 仍用 look-reference.js 的款式轮廓示意，二者互不替代。
   每件单品输出 300×300 viewBox 的 SVG 字符串，与 OutfitReference.illustration 的尺寸约定一致，可直接替换显示。 */
(function(root){
  'use strict';
  var doc=root.document,uid=0,CX=150;
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function rgb(c){c=c.replace('#','');return [0,2,4].map(function(i){return parseInt(c.substr(i,2),16);});}
  function mix(a,b,t){var x=rgb(a),y=rgb(b);return '#'+x.map(function(v,i){return ('0'+Math.round(v+(y[i]-v)*t).toString(16)).slice(-2);}).join('');}
  function dk(c,t){return mix(c,'#1b120b',t);}
  function lt(c,t){return mix(c,'#ffffff',t);}
  function P(p){return p[0]+' '+p[1];}

  /* ---------- 共享材质：噪声凹凸光照 × 底色，按面料调频率与起伏 ---------- */
  /* k1·光照 + k2 ≈ 1：平整处保持原色，只让纱线起伏产生明暗 */
  function material(id,freq,oct,scale,k1,k2){
    return '<filter id="wf-'+id+'" filterUnits="userSpaceOnUse" x="-8" y="-8" width="316" height="316" color-interpolation-filters="sRGB">'+
      '<feTurbulence type="fractalNoise" baseFrequency="'+freq+'" numOctaves="'+oct+'" seed="'+(id.length*13+5)+'" result="t"/>'+
      '<feDiffuseLighting in="t" surfaceScale="'+scale+'" diffuseConstant="1" lighting-color="#fff" result="l"><feDistantLight azimuth="225" elevation="55"/></feDiffuseLighting>'+
      '<feComposite in="SourceGraphic" in2="l" operator="arithmetic" k1="'+k1+'" k2="'+k2+'" result="m"/>'+
      '<feComposite in="m" in2="SourceAlpha" operator="in"/>'+
      '</filter>';
  }
  function blur(id,sd){return '<filter id="wf-b'+id+'" filterUnits="userSpaceOnUse" x="-20" y="-20" width="340" height="340"><feGaussianBlur stdDeviation="'+sd+'"/></filter>';}
  var DEFS='<svg id="wf-defs" aria-hidden="true" focusable="false" style="position:absolute;width:0;height:0;overflow:hidden"><defs>'+
    material('knit','.42 .2',2,1.1,.4,.67)+
    material('weave','.8',2,.55,.3,.75)+
    material('denim','.7 .1',3,1.6,.5,.59)+
    material('nylon','.18',1,.7,.2,.84)+
    material('leather','.55',2,1,.25,.8)+
    material('felt','.35',3,1.4,.45,.63)+
    blur(2,1.4)+blur(4,3.2)+blur(8,6.5)+
    '<linearGradient id="wf-light" x1="0" y1="0" x2=".75" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".24"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".2"/></linearGradient>'+
    '<radialGradient id="wf-gloss" cx=".35" cy=".3" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></radialGradient>'+
    '<pattern id="wf-rib" patternUnits="userSpaceOnUse" width="3.4" height="12"><rect width="1.5" height="12" fill="#000" fill-opacity=".2"/><rect x="1.9" width="1" height="12" fill="#fff" fill-opacity=".2"/></pattern>'+
    '<pattern id="wf-knitst" patternUnits="userSpaceOnUse" width="4.4" height="4.6"><path d="M.2 0L2.2 3L4.2 0" fill="none" stroke="#000" stroke-opacity=".16" stroke-width=".8"/><path d="M.2 1.6L2.2 4.6L4.2 1.6" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width=".7"/></pattern>'+
    '<pattern id="wf-twill" patternUnits="userSpaceOnUse" width="3" height="3" patternTransform="rotate(-32)"><rect width="3" height="1" fill="#fff" fill-opacity=".1"/><rect y="1.6" width="3" height=".8" fill="#000" fill-opacity=".07"/></pattern>'+
    '</defs></svg>';
  function ensureDefs(){if(doc&&doc.body&&!doc.getElementById('wf-defs'))doc.body.insertAdjacentHTML('afterbegin',DEFS);}

  /* ---------- 绘制工具 ---------- */
  /* 右半边轮廓镜像回左半边：segs 从 start 出发，返回从镜像终点走回镜像起点的路径 */
  function mirror(start,segs){
    var nodes=[start],out='',m=function(q){return P([300-q[0],q[1]]);};
    segs.forEach(function(s){nodes.push(s[s.length-1]);});
    for(var i=segs.length-1;i>=0;i--){var s=segs[i];out+=s.length===1?'L'+m(nodes[i]):'C'+m(s[1])+' '+m(s[0])+' '+m(nodes[i]);}
    return out;
  }
  function trace(segs){return segs.map(function(s){return (s.length===1?'L':'C')+s.map(P).join(' ');}).join('');}
  function flip(d){return d.replace(/(-?\d+(?:\.\d+)?)[ ,](-?\d+(?:\.\d+)?)/g,function(_,x,y){return (300-Number(x))+' '+y;});}
  function both(d){return d+flip(d);}
  /* 褶皱：[路径, 'd' 暗 | 'l' 亮, 宽度, 不透明度] → 柔化笔触 */
  function folds(list){
    return list.map(function(f){var dark=f[1]==='d',w=f[2]||8;return '<path d="'+f[0]+'" fill="none" stroke="'+(dark?'#1b120b':'#fff')+'" stroke-opacity="'+(f[3]||(dark?.2:.18))+'" stroke-width="'+w+'" stroke-linecap="round" filter="url(#wf-b'+(w>14?8:w>5?4:2)+')"/>';}).join('');
  }
  function seam(d,o){return '<path d="'+d+'" fill="none" stroke="#1b120b" stroke-opacity="'+(o||.3)+'" stroke-width="1.5"/><path d="'+d+'" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="1" transform="translate(.9 1)"/>';}
  function stitch(d,color,o){return '<path d="'+d+'" fill="none" stroke="'+color+'" stroke-opacity="'+(o||.75)+'" stroke-width="1.1" stroke-dasharray="2.4 1.8"/>';}
  function rib(d,c,shade){return '<path d="'+d+'" fill="'+dk(c,shade||.05)+'"/><path d="'+d+'" fill="url(#wf-rib)"/>';}
  function button(x,y,r,c){return '<circle cx="'+x+'" cy="'+y+'" r="'+r+'" fill="'+c+'"/><circle cx="'+x+'" cy="'+y+'" r="'+r+'" fill="url(#wf-gloss)"/><circle cx="'+x+'" cy="'+y+'" r="'+r+'" fill="none" stroke="#1b120b" stroke-opacity=".35" stroke-width=".8"/>';}

  /* 组装：底色 → 受光 → 局部（罗纹/口袋） → 褶皱 → 边缘体积阴影 → 缝线；over 画在轮廓外（领子、扣子） */
  function layer(o){
    var id='wf-c'+(++uid);
    return '<defs><clipPath id="'+id+'"><path d="'+o.sil+'"/></clipPath></defs>'+
      '<g filter="url(#wf-'+o.mat+')"'+(o.transform?' transform="'+o.transform+'"':'')+'><path d="'+o.sil+'" fill="'+o.color+'"/><g clip-path="url(#'+id+')">'+
      '<rect width="300" height="300" fill="url(#wf-light)"/>'+(o.under||'')+folds(o.folds||[])+
      '<path d="'+o.sil+'" fill="none" stroke="#1b120b" stroke-opacity="'+(o.edge||.3)+'" stroke-width="'+(o.edgeW||16)+'" filter="url(#wf-b8)"/>'+(o.detail||'')+
      '</g>'+(o.over||'')+'</g>';
  }
  function wrap(title,body,groundY,groundW){
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" class="wf"><title>'+esc(title)+'</title>'+
      (groundY?'<ellipse cx="150" cy="'+groundY+'" rx="'+(groundW||80)+'" ry="7" fill="#3a2a1a" opacity=".1" filter="url(#wf-b4)"/>':'')+body+'</svg>';
  }
  function garment(o){return wrap(o.title,layer(o),o.groundY,o.groundW);}

  /* ---------- 上装：长袖/短袖、圆领/衬衫领/V 领开衫/立领羽绒 ---------- */
  function top(c,o){
    var W=o.W||56,L=o.L||250,n=o.n||24,longS=o.sleeve!=='short',cx=CX;
    var start=[cx+n,38],segs=[[[cx+W+14,47]],[[cx+W+24,51],[cx+W+30,60],[cx+W+33,76]]];
    if(longS)segs.push([[cx+W+44,228]],[[cx+W+20,238]],[[cx+W+4,110]]);
    else segs.push([[cx+W+52,124]],[[cx+W+26,136]],[[cx+W+4,106]]);
    segs.push([[cx+W+2,L-(o.tail||0)]]);
    var hemDip=o.tail?L+8:L+4;
    var sil='M'+P(start)+trace(segs)+'C'+(cx+30)+' '+hemDip+' '+(cx-30)+' '+hemDip+' '+(cx-W-2)+' '+(L-(o.tail||0))+mirror(start,segs)+'C'+(cx-n+12)+' 44 '+(cx+n-12)+' 44 '+P(start)+'Z';
    var under='',detail='',over='',f=[];
    /* 领口内侧（看到后片里布） */
    var neckIn='M'+(cx-n)+' 38C'+(cx-n+12)+' 44 '+(cx+n-12)+' 44 '+(cx+n)+' 38C'+(cx+n-6)+' 52 '+(cx+10)+' 60 '+cx+' 60C'+(cx-10)+' 60 '+(cx-n+6)+' 52 '+(cx-n)+' 38Z';
    if((o.mat||'knit')==='knit')under+='<rect width="300" height="300" fill="url(#wf-knitst)"/>';
    under+='<path d="'+neckIn+'" fill="'+dk(c,.3)+'"/>';
    f.push(['M'+(cx-W+6)+' 118C'+(cx-W+14)+' 160 '+(cx-W+10)+' 200 '+(cx-W+8)+' '+(L-6),'d',14,.22]);
    f.push([flip('M'+(cx-W+6)+' 118C'+(cx-W+14)+' 160 '+(cx-W+10)+' 200 '+(cx-W+8)+' '+(L-6)),'d',14,.2]);
    f.push(['M'+(cx-4)+' 76C'+(cx-10)+' 130 '+(cx+6)+' 180 '+(cx-2)+' '+(L-8),'l',26,.13]);
    f.push(['M'+(cx-W-4)+' 112C'+(cx-W-2)+' 140 '+(cx-W+2)+' 170 '+(cx-W)+' '+(L-10),'d',5,.28],[flip('M'+(cx-W-4)+' 112C'+(cx-W-2)+' 140 '+(cx-W+2)+' 170 '+(cx-W)+' '+(L-10)),'d',5,.28]);
    f.push(['M'+(cx-26)+' 96C'+(cx-18)+' 110 '+(cx-6)+' 116 '+(cx+8)+' 118','d',9,.08],['M'+(cx+18)+' 150C'+(cx+24)+' 170 '+(cx+20)+' 196 '+(cx+24)+' 222','d',9,.08]);
    if(longS){
      f.push(['M'+(cx-W-22)+' 92C'+(cx-W-28)+' 140 '+(cx-W-34)+' 180 '+(cx-W-37)+' 222','l',9,.2],[flip('M'+(cx-W-22)+' 92C'+(cx-W-28)+' 140 '+(cx-W-34)+' 180 '+(cx-W-37)+' 222'),'l',9,.12]);
      f.push(['M'+(cx-W-34)+' 152C'+(cx-W-28)+' 160 '+(cx-W-20)+' 162 '+(cx-W-12)+' 160','d',4,.2],[flip('M'+(cx-W-36)+' 168C'+(cx-W-28)+' 176 '+(cx-W-20)+' 178 '+(cx-W-12)+' 176'),'d',4,.2]);
    }else f.push(['M'+(cx-W-26)+' 86C'+(cx-W-34)+' 100 '+(cx-W-40)+' 112 '+(cx-W-44)+' 124','l',8,.18]);
    /* 袖窿缝 */
    detail+=seam(both('M'+(cx-W-14)+' 47C'+(cx-W-16)+' 70 '+(cx-W-12)+' 92 '+(cx-W-4)+' '+(longS?110:106)),.22);
    if(o.rib){
      if(longS)detail+=rib(both('M'+(cx-W-42)+' 210L'+(cx-W-44)+' 228L'+(cx-W-20)+' 238L'+(cx-W-17)+' 220Z'),c)+seam(both('M'+(cx-W-42)+' 210L'+(cx-W-17)+' 220'),.25);
      detail+=rib('M'+(cx-W-6)+' '+(L-17)+'C'+(cx-30)+' '+(L-13)+' '+(cx+30)+' '+(L-13)+' '+(cx+W+6)+' '+(L-17)+'L'+(cx+W+8)+' '+(L+12)+'L'+(cx-W-8)+' '+(L+12)+'Z',c)+seam('M'+(cx-W-6)+' '+(L-17)+'C'+(cx-30)+' '+(L-13)+' '+(cx+30)+' '+(L-13)+' '+(cx+W+6)+' '+(L-17),.25);
    }else{
      detail+=stitch('M'+(cx-W)+' '+(L-9)+'C'+(cx-30)+' '+(L-5)+' '+(cx+30)+' '+(L-5)+' '+(cx+W)+' '+(L-9),dk(c,.4),.45);
      if(!longS)detail+=stitch(both('M'+(cx-W-49)+' 117L'+(cx-W-24)+' 129'),dk(c,.4),.45);
    }
    if(o.neck==='crew'||o.neck==='collar'){
      var band='M'+(cx-n)+' 38C'+(cx-n+6)+' 52 '+(cx-10)+' 60 '+cx+' 60C'+(cx+10)+' 60 '+(cx+n-6)+' 52 '+(cx+n)+' 38L'+(cx+n+(o.band||7))+' 40C'+(cx+n)+' 60 '+(cx+12)+' '+(60+(o.band||7)+2)+' '+cx+' '+(60+(o.band||7)+2)+'C'+(cx-12)+' '+(60+(o.band||7)+2)+' '+(cx-n)+' 60 '+(cx-n-(o.band||7))+' 40Z';
      detail+=(o.plainBand?'<path d="'+band+'" fill="'+dk(c,.05)+'"/>':rib(band,c,.02))+'<path d="'+band+'" fill="none" stroke="#1b120b" stroke-opacity=".18" stroke-width="1.2"/>';
    }
    if(o.neck==='collar'){
      /* 衬衫领：两片领尖压在领口上 */
      var wing='M'+(cx+1)+' 62C'+(cx+10)+' 52 '+(cx+n-2)+' 44 '+(cx+n+2)+' 35L'+(cx+n+10)+' 41C'+(cx+n+6)+' 56 '+(cx+24)+' 70 '+(cx+14)+' 82Z';
      over='<path d="'+both(wing)+'" fill="'+lt(c,.04)+'"/>'+'<path d="'+both(wing)+'" fill="none" stroke="#1b120b" stroke-opacity=".28" stroke-width="1.3"/>'+folds([[both('M'+(cx+6)+' 66C'+(cx+14)+' 62 '+(cx+20)+' 58 '+(cx+n)+' 46'),'d',5,.18]])+(o.knitCollar?'':stitch(both('M'+(cx+4)+' 64C'+(cx+12)+' 56 '+(cx+n-4)+' 47 '+(cx+n+4)+' 40'),dk(c,.3),.4));
    }
    if(o.neck==='v'){
      var vIn='M'+(cx-n)+' 38C'+(cx-n+12)+' 44 '+(cx+n-12)+' 44 '+(cx+n)+' 38L'+cx+' 128Z';
      under+='<path d="'+vIn+'" fill="'+dk(c,.42)+'"/>';
      var placket='M'+(cx-n)+' 38L'+(cx-1)+' 128V'+(L+12)+'H'+(cx-9)+'V132L'+(cx-n-9)+' 40Z';
      detail+=rib(placket,c,.03)+rib(flip(placket),c,.03)+seam(both('M'+(cx-n-9)+' 40L'+(cx-9)+' 132V'+(L+10)),.3);
      for(var b=0;b<5;b++)over+=button(cx-4,138+b*24,3.4,dk(c,.45));
    }
    if(o.placket){
      var pEnd=o.placketTo||L+8;
      detail+=seam('M'+(cx-6)+' 64V'+pEnd+(o.placketTo?'H'+(cx+6):''),.25)+seam('M'+(cx+6)+' 66V'+pEnd,.2);
      for(var k=0;k<o.placket;k++)over+=button(cx,(o.btnFrom||88)+k*(o.btnGap||30),2.8,lt(c,.5));
    }
    if(o.pocket)detail+=seam('M'+(cx+16)+' 104H'+(cx+40)+'V128Q'+(cx+28)+' 134 '+(cx+16)+' 128Z',.3)+folds([['M'+(cx+17)+' 129Q'+(cx+28)+' 134 '+(cx+39)+' 129','d',3,.2]]);
    if(o.quilt){
      for(var q=0;q<o.quilt.length;q++){var y=o.quilt[q];
        /* 每格羽绒：缝线处收紧变暗，上半格受光鼓起，下一条缝线前落入阴影 */
        detail+=folds([['M'+(cx-W+12)+' '+(y+12)+'C'+(cx-20)+' '+(y+9)+' '+(cx+20)+' '+(y+9)+' '+(cx+W-12)+' '+(y+12),'l',11,.24],['M'+(cx-W-2)+' '+(y+31)+'H'+(cx+W+2),'d',7,.26],['M'+(cx-W-2)+' '+(y+2)+'H'+(cx+W+2),'d',3,.4]])+'<path d="M'+(cx-W-2)+' '+y+'H'+(cx+W+2)+'" stroke="#1b120b" stroke-opacity=".55" stroke-width="1.2"/>';
        if(y<220){var sy=y+8,sl=both('M'+(cx-W-28)+' '+sy+'L'+(cx-W-6)+' '+(sy+4));
          detail+=folds([[both('M'+(cx-W-27)+' '+(sy+10)+'L'+(cx-W-6)+' '+(sy+14)),'l',10,.26],[both('M'+(cx-W-28)+' '+(sy+28)+'L'+(cx-W-6)+' '+(sy+32)),'d',8,.26],[sl,'d',4,.4]])+'<path d="'+sl+'" stroke="#1b120b" stroke-opacity=".5" stroke-width="1.1"/>';}
      }
      detail+=folds([['M'+(cx-W+4)+' 70C'+(cx-W)+' 120 '+(cx-W+6)+' 170 '+(cx-W+10)+' 230','l',26,.12]])+'<path d="M'+cx+' 40V'+(L+6)+'" stroke="'+dk(c,.55)+'" stroke-width="3.2"/><path d="M'+cx+' 40V'+(L+6)+'" stroke="'+lt(c,.4)+'" stroke-opacity=".6" stroke-width="1.2" stroke-dasharray="1.4 1.4"/>';
      var collar='M'+(cx-27)+' 28C'+(cx-10)+' 25 '+(cx+10)+' 25 '+(cx+27)+' 28L'+(cx+n+8)+' 46C'+(cx+12)+' 52 '+(cx-12)+' 52 '+(cx-n-8)+' 46Z';
      over+='<path d="'+collar+'" fill="'+lt(c,.03)+'"/>'+folds([['M'+(cx-24)+' 37C'+(cx-8)+' 34 '+(cx+8)+' 34 '+(cx+24)+' 37','l',7,.26],['M'+(cx-28)+' 45C'+(cx-10)+' 49 '+(cx+10)+' 49 '+(cx+28)+' 45','d',5,.3]])+'<path d="'+collar+'" fill="none" stroke="#1b120b" stroke-opacity=".3" stroke-width="1.2"/>'+
        '<path d="M'+cx+' 26V50" stroke="'+dk(c,.55)+'" stroke-width="3"/><rect x="'+(cx-2.6)+'" y="50" width="5.2" height="13" rx="2" fill="#c9c4bc"/><rect x="'+(cx-2.6)+'" y="50" width="5.2" height="13" rx="2" fill="url(#wf-gloss)"/>';
    }
    return garment({title:o.title,color:c,mat:o.mat||'knit',sil:sil,under:under,folds:f.concat(o.folds||[]),detail:detail,over:over,edge:o.edge,edgeW:o.edgeW,groundY:L+30,groundW:W+24});
  }

  /* ---------- 下装：直筒裤（牛仔五袋 / 西裤压线）与百褶裙 ---------- */
  function pants(c,o){
    var cx=CX,wt=o.wt||50,hip=o.hip||57,ho=o.ho||52,hi=o.hi||5,H=o.H||276,cr=o.crotch||130;
    var start=[cx+wt,40],segs=[[[cx+wt+3,70],[cx+hip,96],[cx+hip,120]],[[cx+ho,H]],[[cx+hi,H]],[[cx+2,cr+4]]];
    var sil='M'+P(start)+trace(segs)+'Q'+cx+' '+(cr-4)+' '+(cx-2)+' '+(cr+4)+mirror(start,segs)+'Z';
    var thread=o.denim?'#c9964c':dk(c,.35),under=o.denim||o.twill?'<rect width="300" height="300" fill="url(#wf-twill)"/>':'',detail='',over='';
    var f=[[both('M'+(cx-2)+' '+(cr+8)+'L'+(cx-hi-1)+' '+(H-2)),'d',4,.3],[both('M'+(cx-42)+' 132C'+(cx-40)+' 180 '+(cx-45)+' 222 '+(cx-43)+' '+(H-8)),'d',7,.13]];
    if(o.denim){
      under+='<g filter="url(#wf-b8)" fill="#fff"><ellipse cx="'+(cx-29)+'" cy="168" rx="13" ry="44" opacity=".24"/><ellipse cx="'+(cx+29)+'" cy="168" rx="13" ry="44" opacity=".2"/><ellipse cx="'+(cx-30)+'" cy="104" rx="16" ry="14" opacity=".16"/><ellipse cx="'+(cx+30)+'" cy="104" rx="16" ry="14" opacity=".14"/></g>';
      f.push([both('M'+(cx-46)+' 106Q'+(cx-30)+' 112 '+(cx-12)+' 114'),'l',3,.34],[both('M'+(cx-44)+' 118Q'+(cx-30)+' 122 '+(cx-16)+' 125'),'l',3,.28],[both('M'+(cx-40)+' 129Q'+(cx-30)+' 132 '+(cx-20)+' 135'),'l',2.5,.22]);
      f.push([both('M'+(cx-52)+' '+(H-26)+'Q'+(cx-30)+' '+(H-21)+' '+(cx-6)+' '+(H-27)),'d',4,.2],[both('M'+(cx-52)+' '+(H-18)+'Q'+(cx-30)+' '+(H-14)+' '+(cx-6)+' '+(H-19)),'l',4,.2]);
    }
    if(o.crease)f.push([both('M'+(cx-30)+' 58L'+(cx-28)+' '+(H-4)),'l',5,.3],[both('M'+(cx-31.5)+' 60L'+(cx-29.5)+' '+(H-4)),'d',1.6,.3]);
    /* 腰头、裤袢、门襟、口袋 */
    detail+='<path d="M'+(cx-wt-2)+' 40H'+(cx+wt+2)+'L'+(cx+wt+3)+' 54H'+(cx-wt-3)+'Z" fill="'+dk(c,.05)+'"/>'+seam('M'+(cx-wt-3)+' 54H'+(cx+wt+3),.32)+
      stitch('M'+(cx-wt)+' 42.6H'+(cx+wt),thread,.8)+stitch('M'+(cx-wt)+' 51.4H'+(cx+wt),thread,.8);
    [6-wt,-16,16,wt-6].forEach(function(x){detail+='<rect x="'+(cx+x-2.4)+'" y="38" width="4.8" height="18" rx="1" fill="'+lt(c,.04)+'"/><path d="M'+(cx+x-2.4)+' 38v18M'+(cx+x+2.4)+' 38v18" stroke="#1b120b" stroke-opacity=".3" stroke-width=".9"/>';});
    detail+=(o.denim?stitch('M'+(cx+12)+' 55V100Q'+(cx+12)+' 112 '+(cx+2)+' 116',thread,.85)+stitch('M'+(cx+15)+' 55V100Q'+(cx+15)+' 115 '+(cx+3)+' 120',thread,.6):seam('M'+(cx+11)+' 55V100Q'+(cx+11)+' 112 '+(cx+2)+' 116',.3))+seam('M'+cx+' 54V'+(cr-2),.3);
    if(o.denim){
      detail+=seam(both('M'+(cx-22)+' 55C'+(cx-24)+' 74 '+(cx-36)+' 86 '+(cx-hip+1)+' 90'),.35)+stitch(both('M'+(cx-25)+' 55C'+(cx-27)+' 76 '+(cx-38)+' 89 '+(cx-hip+1)+' 93'),thread,.8);
      detail+=stitch('M'+(cx+24)+' 56V69Q'+(cx+31)+' 72 '+(cx+38)+' 68V56',thread,.8)+'<g fill="#b48a4a"><circle cx="'+(cx-hip+4)+'" cy="89" r="1.7"/><circle cx="'+(cx+hip-4)+'" cy="89" r="1.7"/><circle cx="'+(cx+24)+'" cy="57" r="1.4"/></g>';
      detail+=stitch(both('M'+(cx-ho+1)+' '+(H-8)+'L'+(cx-hi-1)+' '+(H-8)),thread,.8)+stitch(both('M'+(cx-hip+3)+' 100L'+(cx-ho+3)+' '+(H-10)),thread,.45);
      over+=button(cx+6,47,4.4,'#b9924f');
    }else{
      detail+=seam(both('M'+(cx-30)+' 55L'+(cx-hip+2)+' 96'),.32)+stitch(both('M'+(cx-ho+1)+' '+(H-7)+'L'+(cx-hi-1)+' '+(H-7)),thread,.4);
      over+=button(cx+6,47,3,dk(c,.25));
    }
    return garment({title:o.title,color:c,mat:o.mat||(o.denim?'denim':'weave'),sil:sil,under:under,folds:f,detail:detail,over:over,edge:.26,groundY:H+10,groundW:70});
  }
  function skirt(c,o){
    var cx=CX,wt=o.wt||44,wh=o.wh||86,H=o.H||172,N=o.N||12,i;
    var sil='M'+(cx-wt)+' 40H'+(cx+wt)+'C'+(cx+wt+4)+' 70 '+(cx+wh-10)+' '+(H-50)+' '+(cx+wh)+' '+H;
    for(i=1;i<=N;i++)sil+='L'+(cx+wh-i*2*wh/N).toFixed(1)+' '+(H+(i%2?2.5:0));
    sil+='C'+(cx-wh+10)+' '+(H-50)+' '+(cx-wt-4)+' 70 '+(cx-wt)+' 40Z';
    var under='',lines='';
    for(i=0;i<N;i++){
      var xa=cx-wt+i*2*wt/N,xb=xa+2*wt/N,Xa=cx-wh+i*2*wh/N,Xb=Xa+2*wh/N,xm=(xa+xb)/2,Xm=(Xa+Xb)/2;
      under+='<path d="M'+xm.toFixed(1)+' 52L'+xb.toFixed(1)+' 52L'+Xb.toFixed(1)+' '+(H+8)+'L'+Xm.toFixed(1)+' '+(H+8)+'Z" fill="#1b120b" fill-opacity=".15" filter="url(#wf-b2)"/>'+
        '<path d="M'+xa.toFixed(1)+' 52L'+((xa+xm)/2).toFixed(1)+' 52L'+((Xa+Xm)/2).toFixed(1)+' '+(H+8)+'L'+Xa.toFixed(1)+' '+(H+8)+'Z" fill="#fff" fill-opacity=".1" filter="url(#wf-b2)"/>';
      if(i)lines+='<path d="M'+xa.toFixed(1)+' 54L'+Xa.toFixed(1)+' '+(H+3)+'" stroke="#1b120b" stroke-opacity=".3" stroke-width="1"/>';
    }
    var detail=lines+'<path d="M'+(cx-wt-2)+' 40H'+(cx+wt+2)+'L'+(cx+wt+2.5)+' 53H'+(cx-wt-2.5)+'Z" fill="'+dk(c,.06)+'"/>'+seam('M'+(cx-wt-2)+' 53H'+(cx+wt+2),.35)+stitch('M'+(cx-wt)+' 50.5H'+(cx+wt),dk(c,.4),.4);
    var f=[['M'+(cx-wh+12)+' '+(H-20)+'Q'+cx+' '+(H-8)+' '+(cx+wh-12)+' '+(H-20),'d',10,.08],['M'+(cx-20)+' 60L'+(cx-34)+' '+(H-6),'l',16,.1]];
    return garment({title:o.title,color:c,mat:o.mat||'weave',sil:sil,under:'<rect width="300" height="300" fill="url(#wf-twill)" opacity=".7"/>'+under,folds:f,detail:detail,edge:.24,groundY:H+16,groundW:wh});
  }

  /* ---------- 鞋：侧面一双（远处一只错位、略暗），鞋底与鞋面分层 ---------- */
  var SHOES={
    sneaker:{sole:function(){return '#efebe2';},
      soleSil:'M50 184H250C257 186 260 192 258 199C256 207 249 212 238 212H66C55 212 49 206 48 197C47 191 48 187 50 184Z',
      upper:'M52 186L50 146C50 134 56 126 66 126L84 130C94 132 102 128 108 122L122 120C130 128 150 140 180 152C214 158 242 164 252 176C256 180 257 183 256 186Z',
      folds:[['M52 148C60 136 72 130 86 132','d',4,.26],['M184 158C214 164 238 170 250 180','l',7,.55],['M64 140C62 160 64 174 68 186','d',8,.12],['M120 172C150 180 190 182 236 184','d',10,.14]],
      soleDetail:function(c){return '<path d="M50 192H257" stroke="#1b120b" stroke-opacity=".16" stroke-width="1.2"/><path d="M58 211H244" stroke="#1b120b" stroke-opacity=".3" stroke-width="2"/>'+stitch('M54 188.5H253',dk(c,.3),.45);},
      detail:function(c){var s=seam('M204 158C202 170 206 180 214 186',.3)+seam('M108 126C120 146 146 164 178 172C192 175 200 170 204 158',.26)+seam('M80 130C76 150 78 170 86 186',.26),j;
        for(j=0;j<5;j++)s+='<circle cx="'+(124+j*12.5)+'" cy="'+(128+j*6)+'" r="1.7" fill="#1b120b" fill-opacity=".42"/>';
        for(j=0;j<4;j++)s+='<circle cx="'+(222+j*7)+'" cy="'+(170+j*2.2)+'" r=".9" fill="#1b120b" fill-opacity=".3"/>';
        return s;},
      over:function(c){var s='<path d="M104 124C104 110 114 102 126 104L134 126Z" fill="'+dk(c,.03)+'"/>'+seam('M104 124C104 110 114 102 126 104L134 126',.28),j;
        for(j=0;j<5;j++){var x=124+j*12.5,y=128+j*6;s+='<path d="M'+x+' '+y+'l6 -7" stroke="#1b120b" stroke-opacity=".25" stroke-width="3.6" stroke-linecap="round"/><path d="M'+x+' '+y+'l6 -7" stroke="#fbfaf6" stroke-width="2.2" stroke-linecap="round"/>';}
        return s;}},
    loafer:{sole:function(c){return dk(c,.25);},
      soleSil:'M50 192H252C258 194 260 200 257 205C254 210 248 212 238 212H96V217H58V207C52 205 49 199 50 192Z',
      upper:'M54 194L56 168C57 158 64 152 76 152L112 156C140 150 196 150 228 162C246 169 256 180 256 194Z',
      folds:[['M190 160C214 164 236 172 248 184','l',7,.55],['M64 176C64 168 68 162 76 160','l',4,.45],['M120 180C150 186 200 186 240 188','d',10,.2],['M100 159C110 157 120 156 128 157','l',3,.3]],
      soleDetail:function(c){return '<path d="M96 204V212" stroke="#000" stroke-opacity=".35" stroke-width="1.4"/>'+stitch('M56 196H252',lt(c,.25),.5);},
      detail:function(c){return '<path d="M60 156C80 161 100 161 114 157" stroke="'+dk(c,.75)+'" stroke-width="5" stroke-linecap="round" fill="none"/>'+seam('M126 154C150 148 200 150 232 164C242 170 248 180 250 192',.4)+stitch('M128 158C150 152 198 154 228 167',lt(c,.3),.55);},
      over:function(c){return '<path d="M116 157C140 166 172 168 202 162L201 171C172 177 142 175 114 166Z" fill="'+dk(c,.1)+'"/><path d="M118 159C142 167 172 169 200 164" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="1.2"/><path d="M150 168C155 170 165 170 170 168" stroke="#000" stroke-opacity=".6" stroke-width="2.4" stroke-linecap="round"/>';}},
    maryjane:{sole:function(c){return dk(c,.4);},
      soleSil:'M52 196H250C257 198 259 203 256 207C253 211 247 212 238 212H92V218H62V208C55 206 51 202 52 196Z',
      upper:'M56 198L58 174C59 166 66 162 76 163L110 168C130 172 150 172 172 168C204 162 234 168 248 180C254 185 256 190 256 198Z',
      folds:[['M190 170C214 170 234 176 246 186','l',7,.55],['M66 184C66 176 70 170 78 168','l',4,.45],['M110 186C150 192 200 192 240 194','d',10,.2]],
      soleDetail:function(){return '';},
      detail:function(c){return '<path d="M70 166C100 172 140 176 170 170" stroke="'+dk(c,.6)+'" stroke-width="5" stroke-linecap="round" fill="none"/>';},
      over:function(c){return '<path d="M108 170C110 152 122 140 136 140C146 140 152 148 152 160L146 162C146 152 142 147 136 147C126 147 118 156 116 171Z" fill="'+dk(c,.06)+'"/><path d="M111 166C113 152 123 143 136 143" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width="1.2"/><rect x="104" y="162" width="9" height="7" rx="1.5" fill="none" stroke="#d9c08a" stroke-width="1.6"/>';}},
    boot:{sole:function(c){return dk(c,.5);},
      soleSil:'M50 200H250C257 202 259 207 256 211C253 215 247 216 238 216H98V222H56V210C51 208 49 204 50 200Z',
      upper:'M56 202L58 96C58 88 63 84 72 84H124C131 84 135 89 135 96L137 146C166 154 206 160 234 172C248 178 256 188 256 202Z',
      folds:[['M112 150C122 156 134 158 146 156','d',4,.32],['M118 162C130 166 142 168 154 166','d',3,.24],['M70 116C72 150 72 180 74 200','l',10,.2],['M200 168C220 172 238 180 248 192','l',6,.34]],
      soleDetail:function(){return '<path d="M98 212H244" stroke="#000" stroke-opacity=".3" stroke-width="1.2"/>';},
      detail:function(c){return rib('M100 86L108 148H128L126 86Z',dk(c,.3),.1)+seam('M100 86L108 148M126 86L128 148',.35)+stitch('M60 196C110 200 190 196 250 198',lt(c,.2),.4);},
      over:function(c){return '<path d="M62 86C60 76 66 70 74 72L76 88" fill="none" stroke="'+dk(c,.25)+'" stroke-width="4"/>';}}
  };
  function shoes(c,kind,title){
    var k=SHOES[kind];
    function one(transform,shade){
      var base=shade?dk(c,shade):c;
      return layer({sil:k.soleSil,color:k.sole(base),mat:'leather',detail:k.soleDetail(base),edge:.2,edgeW:6,transform:transform})+
        layer({sil:k.upper,color:base,mat:'leather',folds:k.folds,detail:k.detail(base),over:k.over(base),edge:.32,edgeW:12,transform:transform});
    }
    return wrap(title,one('translate(12 -12)',.16)+one('',0),224,110);
  }

  /* ---------- 包与帽 ---------- */
  function bag(c,title){
    var strap='M78 152C76 70 116 38 150 38C184 38 224 70 222 152L209 150C211 84 180 52 150 52C120 52 89 84 91 150Z';
    var body='M58 146C100 168 200 168 242 146C247 180 237 214 223 232C190 254 110 254 77 232C63 214 53 180 58 146Z';
    return wrap(title,
      layer({sil:strap,color:dk(c,.04),mat:'leather',edge:.25,edgeW:6,detail:stitch('M84.5 150C82 78 118 45 150 45C182 45 218 78 215.5 150',dk(c,.45),.55)})+
      layer({sil:body,color:c,mat:'leather',edge:.3,folds:[['M80 172C90 200 110 220 140 232','l',14,.26],['M222 172C214 204 196 224 170 236','d',12,.18]],
        detail:'<path d="M72 158C112 174 188 174 228 158" fill="none" stroke="'+dk(c,.5)+'" stroke-width="3.4"/><path d="M72 158C112 174 188 174 228 158" fill="none" stroke="'+lt(c,.35)+'" stroke-width="1.6" stroke-dasharray="1.2 1.3"/>'+stitch('M64 154C104 176 196 176 236 154',dk(c,.4),.4),
        over:'<g fill="none" stroke="#d3cabb" stroke-width="2.4"><circle cx="85" cy="152" r="5"/><circle cx="215" cy="152" r="5"/></g><rect x="200" y="161" width="5" height="13" rx="2" fill="#cfc6b6" transform="rotate(-18 202 167)"/>'}),
      258,92);
  }
  function beret(c,title){
    var sil='M64 168C52 124 98 90 156 90C214 90 255 122 241 164C228 184 92 190 64 168Z';
    return wrap(title,layer({sil:sil,color:c,mat:'felt',edge:.34,
      folds:[['M90 150C110 120 150 104 200 108','l',22,.18],['M80 160C130 172 190 170 234 156','d',12,.22]],
      detail:'<path d="M66 160C104 178 200 176 240 158L242 172C202 190 104 192 66 176Z" fill="'+dk(c,.14)+'"/>'+seam('M66 160C104 178 200 176 240 158',.3),
      over:'<path d="M151 92C150 83 154 78 160 78C162 83 161 89 160 94Z" fill="'+dk(c,.1)+'"/>'}),190,90);
  }

  /* ---------- 单品款式表：示例衣橱用 look 指定画法 ---------- */
  var looks={
    'crew-knit':function(c,t){return top(c,{title:t,neck:'crew',rib:true,n:23});},
    'shirt':function(c,t){return top(c,{title:t,sleeve:'short',neck:'collar',plainBand:true,mat:'weave',placket:6,btnFrom:84,btnGap:30,pocket:true,tail:8,edge:.22,n:20,band:5});},
    'tee':function(c,t){return top(c,{title:t,sleeve:'short',neck:'crew',mat:'weave',n:22,band:6,edge:.22});},
    'collar-knit':function(c,t){return top(c,{title:t,neck:'collar',knitCollar:true,rib:true,placket:2,btnFrom:76,btnGap:16,placketTo:104,n:21});},
    'thermal':function(c,t){return top(c,{title:t,neck:'crew',rib:true,W:50,n:21,band:5});},
    'cardigan':function(c,t){return top(c,{title:t,neck:'v',rib:true,W:58,n:25});},
    'puffer':function(c,t){return top(c,{title:t,neck:'stand',mat:'nylon',W:64,n:26,quilt:[80,114,148,182,216],edge:.42,edgeW:24});},
    'jeans':function(c,t){return pants(c,{title:t,denim:true,wt:41,hip:47,ho:43,hi:4,H:284});},
    'chino':function(c,t){return pants(c,{title:t,crease:true,twill:true,wt:42,hip:49,ho:42,hi:5,H:284});},
    'wool-trousers':function(c,t){return pants(c,{title:t,crease:true,mat:'felt',wt:42,hip:49,ho:45,hi:5,H:284});},
    'pleat-mini':function(c,t){return skirt(c,{title:t,H:172,N:14,wh:84,wt:44});},
    'pleat-midi':function(c,t){return skirt(c,{title:t,H:262,N:16,wh:94,wt:42});},
    'sneaker':function(c,t){return shoes(c,'sneaker',t);},
    'loafer':function(c,t){return shoes(c,'loafer',t);},
    'maryjane':function(c,t){return shoes(c,'maryjane',t);},
    'boot':function(c,t){return shoes(c,'boot',t);},
    'shoulder-bag':bag,
    'beret':beret
  };
  root.WeaveFabric={
    has:function(item){return !!(item&&looks[item.look]);},
    svg:function(item){
      ensureDefs();
      var c=root.OutfitReference?root.OutfitReference.color(item):'#e6dac7';
      return looks[item.look](c,(item.name||'单品')+' · 面料示意');
    }
  };
})(window);
