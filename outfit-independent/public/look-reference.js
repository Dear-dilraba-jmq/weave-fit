/* Local, deterministic style illustrations. Never presented as product photos. */
(function(root){
  'use strict';
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function itemHtml(item){
    return '<figure class="gap-reference"><div class="gap-reference-image">'+illustration(item)+'</div><figcaption>款式轮廓示意 · 非真实商品</figcaption></figure>';
  }
  function color(item){
    var colors=[[/米白|奶白|乳白/,'#eee6d5'],[/白/,'#f4f3ef'],[/深灰|炭灰/,'#575a5b'],[/灰/,'#a4a29f'],[/黑/,'#303135'],[/深棕|巧克力/,'#604737'],[/驼|卡其|米色/,'#c1a47e'],[/棕|咖/,'#9a7155'],[/藏蓝|深蓝|海军蓝/,'#29384e'],[/浅蓝|淡蓝/,'#a5c3d6'],[/牛仔|蓝/,'#58738b'],[/绿/,'#7c8871'],[/粉/,'#d3aaa7'],[/酒红|枣红/,'#743344'],[/红/,'#a95f54'],[/紫/,'#a598ae'],[/黄/,'#d2b77c']];
    var levels=[String(item.color||''),String(item.name||'')];
    for(var n=0;n<levels.length;n++)for(var i=0;i<colors.length;i++)if(colors[i][0].test(levels[n]))return colors[i][1];
    var category=categoryFor(item);
    return category==='下装'?'#65676c':category==='鞋履'?'#755b48':category==='包袋'?'#aa805e':'#e6dac7';
  }
  function categoryFor(item){
    var name=String(item.name||''),category=String(item.category||'');
    if(/连衣裙|衬衫裙|吊带裙|背心裙/.test(name)||/连衣裙/.test(category))return '连衣裙';
    if(/裙|裤/.test(name))return '下装';
    if(/外套|大衣|夹克|羽绒服|棉服|风衣|西装/.test(name))return '外套';
    if(/鞋|靴|凉拖/.test(name))return '鞋履';
    if(/包/.test(name))return '包袋';
    if(/针织|毛衣|衬衫|卫衣|T恤|[Tt] ?恤|短袖|打底衫|上衣|背心/.test(name))return '上装';
    if(/围巾|帽|袜|项链|耳环|腰带|领带|雨伞/.test(name))return '配饰';
    return category;
  }
  function illustration(item){
    var c=color(item),stroke='#655c51',attrs='fill="'+c+'" stroke="'+stroke+'" stroke-width="2.3" stroke-linejoin="round"';
    var category=categoryFor(item),name=String(item.name||''),shape='';
    if(/下装/.test(category)&&/裙/.test(name)&&!/裙裤/.test(name)){
      var longSkirt=/长裙|中裙|中长|长款|及踝/.test(name),top=longSkirt?40:72,hem=longSkirt?258:218;
      shape='<path '+attrs+' d="M104 '+top+'H196L230 '+hem+'H70Z"/><path d="M102 '+(top+22)+'H198M116 '+(top+28)+'L99 '+(hem-10)+'M150 '+(top+26)+'V'+(hem-10)+'M184 '+(top+28)+'L201 '+(hem-10)+'" fill="none" stroke="'+stroke+'" opacity=".35" stroke-width="2"/>';
      if(/百褶/.test(name))shape+='<path d="M128 '+(top+27)+'L124 '+(hem-7)+'M139 '+(top+27)+'L137 '+(hem-7)+'M161 '+(top+27)+'L163 '+(hem-7)+'M172 '+(top+27)+'L176 '+(hem-7)+'" fill="none" stroke="'+stroke+'" opacity=".4" stroke-width="2"/>';
    }
    else if(/下装/.test(category)&&/短裤|五分裤/.test(name))shape='<path '+attrs+' d="M95 75H205L223 221H166L150 153 134 221H77Z"/><path d="M96 99H204M150 77V145M107 105L103 127M193 105L197 127" fill="none" stroke="'+stroke+'" opacity=".4" stroke-width="2"/>';
    else if(/下装/.test(category))shape='<path '+attrs+' d="M91 39H211L222 111 231 264H169L150 137 131 264H69L79 111Z"/><path d="M91 66H211M150 41V118M99 75L91 100M202 75L211 100M114 135L100 254M185 135L200 254" fill="none" stroke="'+stroke+'" opacity=".4" stroke-width="2"/>';
    else if(/连衣裙/.test(category))shape='<path '+attrs+' d="M116 32 138 43H162L184 32 210 78 183 95 175 83 172 121 221 264H79L128 121 125 83 117 95 90 78Z"/><path d="M128 121H172M112 234L135 143M186 234L166 143" fill="none" stroke="'+stroke+'" opacity=".4" stroke-width="2"/>';
    else if(/外套/.test(category)&&/羽绒|棉服|棉衣|夹克/.test(name)){
      shape='<path '+attrs+' d="M110 54 128 44V30H172V44L190 54 224 80 245 214 212 224 187 124 193 238H107L113 124 88 224 55 214 76 80Z"/><path d="M150 32V238M109 224H191M129 45H171" fill="none" stroke="'+stroke+'" stroke-width="2.3"/>';
      if(/羽绒|棉服|棉衣/.test(name))shape+='<path d="M100 95H200M108 128H192M108 162H192M108 196H192M70 132L98 139M202 139L230 132M63 172L89 180M211 180L237 172" fill="none" stroke="'+stroke+'" stroke-width="2" opacity=".4"/>';
    }
    else if(/外套/.test(category))shape='<path '+attrs+' d="M112 36 134 29 150 47 166 29 188 36 235 80 216 188 185 183 186 87 197 263H103L114 87 115 183 84 188 65 80Z"/><path d="M134 29 114 66 140 90 150 47 160 90 186 66 166 29M150 47V263M114 179H138V211H113M162 179H186V211H162" fill="none" stroke="'+stroke+'" stroke-width="2.5"/><circle cx="155" cy="135" r="3" fill="'+stroke+'"/><circle cx="155" cy="166" r="3" fill="'+stroke+'"/>';
    else if(/鞋/.test(category)&&/靴/.test(name))shape='<g '+attrs+'><path d="M63 60H124V172L155 199 158 225H51V208L59 176Z"/><path d="M175 60H236L241 176 249 208V225H142L145 199 176 172Z"/><path d="M55 225H157V235H51V225M144 225H245V235H142V225"/></g>';
    else if(/鞋/.test(category)&&/乐福|玛丽珍/.test(name))shape='<g '+attrs+'><path d="M46 147Q55 105 103 109L134 155 138 200Q89 221 43 200Z"/><path d="M164 155 195 109Q243 105 252 147L255 200Q209 221 160 200Z"/><path d="M44 189Q88 209 135 189M163 189Q210 209 254 189M53 148H128M172 148H247" fill="none" stroke-width="5"/><path d="M72 141H104V153H72ZM195 141H227V153H195Z" fill="none"/></g>';
    else if(/鞋/.test(category))shape='<g '+attrs+'><path d="M54 101 76 89 111 103 127 130 187 151Q230 153 245 172L242 191H48L43 167Z"/><path d="M59 193H240V202H48V191M77 153L86 119M102 160L112 132M124 165L135 145" fill="none"/><path d="M73 64 96 54 125 67 139 90 201 110Q242 112 256 132L254 149H150L130 130 63 112Z" opacity=".7"/></g>';
    else if(/包/.test(category)&&/肩包|腋下包|弯月/.test(name))shape='<path '+attrs+' d="M62 137Q148 176 238 137L224 230Q150 265 76 230Z"/><path d="M82 151V100C82 18 218 18 218 100V151" fill="none" stroke="'+stroke+'" stroke-width="13"/><path d="M82 151V100C82 18 218 18 218 100V151" fill="none" stroke="'+c+'" stroke-width="7"/>';
    else if(/包/.test(category))shape='<path '+attrs+' d="M72 107H228L241 247H59Z"/><path d="M107 113V83C107 24 193 24 193 83V113" fill="none" stroke="'+stroke+'" stroke-width="12"/><path d="M112 113V82C112 38 188 38 188 82V113" fill="none" stroke="'+c+'" stroke-width="6"/><path d="M75 150H225M130 150V179H170V150" fill="none" stroke="'+stroke+'" stroke-width="3"/>';
    else if(/配饰/.test(category)&&/雨伞/.test(name))shape='<path '+attrs+' d="M48 143Q150 -20 252 143Q223 123 199 143Q175 122 150 143Q125 122 101 143Q76 123 48 143Z"/><path d="M150 30V236Q150 266 124 250M101 141Q110 69 150 30Q190 69 199 141" fill="none" stroke="'+stroke+'" stroke-width="5"/>';
    else if(/配饰/.test(category)&&/围巾/.test(name))shape='<path '+attrs+' d="M91 43H153V201H84ZM153 70H205V253H145Z"/><path d="M90 198V218M107 198V218M124 198V218M143 249V268M163 250V268M183 250V268M202 248V268" stroke="'+stroke+'" stroke-width="3"/>';
    else if(/配饰/.test(category)&&/帽/.test(name))shape='<path '+attrs+' d="M77 167Q74 51 150 51Q226 51 223 167L252 189Q150 235 48 189Z"/><path d="M76 161Q150 185 224 161" fill="none" stroke="'+stroke+'" stroke-width="3"/>';
    else if(/配饰/.test(category)&&/眼镜|墨镜/.test(name))shape='<g '+attrs+'><ellipse cx="91" cy="148" rx="46" ry="36"/><ellipse cx="209" cy="148" rx="46" ry="36"/><path d="M137 143Q150 133 163 143M45 137 26 119M255 137 274 119" fill="none" stroke-width="7"/></g>';
    else if(/配饰/.test(category)&&/袜/.test(name))shape='<g '+attrs+'><path d="M65 47H113V179L139 209Q144 241 104 241H63Q41 225 61 204Z"/><path d="M184 47H232L236 204Q256 225 234 241H193Q153 241 158 209L184 179Z"/><path d="M65 66H113M184 66H232" fill="none" stroke-width="4"/></g>';
    else if(/配饰/.test(category))shape='<path d="M77 75C56 210 244 210 223 75M96 88C90 189 210 189 204 88" fill="none" stroke="'+c+'" stroke-width="7"/><path d="M150 178 172 204 150 231 128 204Z" '+attrs+'/>';
    else {
      var knit=/针织|毛衣|卫衣/.test(name),shortSleeves=/短袖|无袖|背心/.test(name)&&!/长袖/.test(name);
      var silhouette=shortSleeves?'M112 45 132 34Q150 59 168 34L188 45 240 87 215 127 189 110 193 250H107L111 110 85 127 60 87Z':'M112 45 132 34Q150 59 168 34L188 45 220 74 245 216 218 225 186 117 193 250H107L114 117 82 225 55 216 80 74Z';
      shape='<path '+attrs+' d="'+silhouette+'"/>';
      if(knit){
        shape+='<path d="M132 35Q150 66 168 35M107 234H193'+(shortSleeves?'M64 91L85 127M215 127L236 91':'M57 204L85 213M215 213L243 204')+'" fill="none" stroke="'+stroke+'" opacity=".45" stroke-width="3"/>';
        if(/开衫/.test(name))shape+='<path d="M150 58V249" fill="none" stroke="'+stroke+'" opacity=".5" stroke-width="2"/>';
        if(/衬衫领|翻领/.test(name))shape+='<path d="M132 34 119 69 142 81 150 58 158 81 181 69 168 34" fill="none" stroke="'+stroke+'" stroke-width="2.3"/>';
      }else if(/衬衫/.test(name)||!name){
        shape+='<path d="M132 34 119 69 142 81 150 58 158 81 181 69 168 34M150 58V250M169 108H185V133H169" fill="none" stroke="'+stroke+'" opacity=".65" stroke-width="2.2"/>';
      }else shape+='<path d="M132 35Q150 66 168 35M108 237H192" fill="none" stroke="'+stroke+'" opacity=".45" stroke-width="2"/>';
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300"><title>'+esc(item.name||item.category||'单品')+' · 款式轮廓示意</title><ellipse cx="150" cy="274" rx="88" ry="8" fill="#8c7760" opacity=".08"/>'+shape+'</svg>';
  }
  function parts(plan){
    return (plan.items||[]).map(function(i){return Object.assign({},i,{origin:'owned'});}).concat((plan.gaps||[]).map(function(i){return Object.assign({},i,{origin:'gap'});})).slice(0,18);
  }
  function sourceLabel(item,hasPhoto){return item.origin==='gap'?'待补款式 · 示意':hasPhoto?'我的衣橱 · 实拍':'我的衣橱 · 款式示意';}
  function boardHtml(plan,resolve){
    var list=parts(plan);
    if(!list.length)return '<p class="hint">这套方案暂未包含可展示的单品，请重新生成。</p>';
    return '<div class="outfit-board">'+list.map(function(item){
      var url=item.origin==='owned'&&item.image_path?resolve(item.image_path):'';
      var visual=url?'<img src="'+esc(url)+'" alt="'+esc(item.name)+'" loading="eager">':illustration(item);
      return '<figure class="board-piece '+(url?'photo':'reference')+'"><div class="board-image">'+visual+'</div><figcaption><span class="board-source">'+sourceLabel(item,!!url)+'</span><b>'+esc(item.name)+'</b><small>'+esc(item.category)+'</small></figcaption></figure>';
    }).join('')+'</div>';
  }
  function posterSvg(plan,photos){
    var list=parts(plan),rows=Math.ceil(list.length/2),height=Math.max(1000,320+rows*415+130);
    var svg='<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="'+height+'" viewBox="0 0 1080 '+height+'"><rect width="1080" height="'+height+'" fill="#fcf8ef"/><g font-family="Microsoft YaHei,PingFang SC,sans-serif"><text x="60" y="70" font-size="22" fill="#916538">OUTFIT MIRROR · 穿搭魔镜</text><text x="60" y="139" font-size="42" font-weight="700" fill="#463525">'+esc(String(plan.title||'今天穿这一套').slice(0,24))+'</text><text x="60" y="191" font-size="24" fill="#8c7760">'+esc([plan.style,plan.occasion,plan.temperature!=null?plan.temperature+'°C':'',plan.weather].filter(Boolean).join(' · '))+'</text><text x="60" y="244" font-size="21" fill="#8c7760">衣橱实拍与待补款式分开标注，按这张图看整套组合</text>';
    list.forEach(function(item,index){
      var x=60+(index%2)*490,y=290+Math.floor(index/2)*415;
      var photo=photos&&photos[item.image_path],ok=typeof photo==='string'&&/^data:image\/(png|jpe?g|webp|avif|gif);base64,/.test(photo);
      svg+='<g transform="translate('+x+' '+y+')"><rect width="460" height="390" rx="24" fill="#fff" stroke="#eadcc6"/>';
      svg+=ok?'<image x="25" y="15" width="410" height="278" preserveAspectRatio="xMidYMid meet" href="'+photo+'"/>':illustration(item).replace('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">','<svg x="80" y="5" width="300" height="280" viewBox="0 0 300 300">');
      svg+='<text x="24" y="314" font-size="18" fill="#9c6431">'+sourceLabel(item,ok)+'</text><text x="24" y="350" font-size="24" font-weight="700" fill="#463525">'+esc(String(item.name||item.category||'单品').slice(0,16))+'</text><text x="24" y="375" font-size="17" fill="#9a8875">'+esc(item.category)+'</text></g>';
    });
    svg+='<text x="60" y="'+(height-70)+'" font-size="20" fill="#8c7760">参考图用于搭配组合；示意部分不代表真实商品或真人试穿。</text><text x="60" y="'+(height-34)+'" font-size="18" fill="#8c7760">'+esc(new Date(plan.createdAt||Date.now()).toLocaleDateString('zh-CN'))+' · 穿搭魔镜</text></g></svg>';
    return svg;
  }
  var api={color:color,illustration:illustration,parts:parts,boardHtml:boardHtml,posterSvg:posterSvg,itemHtml:itemHtml};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.OutfitReference=api;
})(typeof window!=='undefined'?window:globalThis);
