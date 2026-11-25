/* Temperature controls warmth; season controls palette and styling. */
(function(root){
'use strict';
var guide=typeof module==='object'&&module.exports?require('./style-guide.js'):root.OutfitStyleGuide;
var defaults={'春季':18,'夏季':30,'秋季':18,'冬季':5};
function currentSeason(m){return m>=3&&m<=5?'春季':m>=6&&m<=8?'夏季':m>=9&&m<=11?'秋季':'冬季';}
function climateFor(o){
 o=o||{};var season=defaults[o.season]!==undefined?o.season:'',temp=Number(o.temperature);
 if(!Number.isFinite(temp))temp=defaults[season]===undefined?22:defaults[season];temp=Math.max(-10,Math.min(40,temp));
 var band=temp<=5?0:temp<=11?1:temp<=17?2:temp<=23?3:temp<=28?4:5;
 var labels=['寒冷保暖','偏冷叠穿','凉爽外搭','温和轻装','偏热透气','炎热清凉'];
 var advice=['保暖打底、厚针织与羽绒外层；厚长裤和包脚鞋，减少裸露。','针织或卫衣配保暖外套，优先厚长裤与包脚鞋。','长袖配可脱外搭；裙装增加腿部保暖。','薄针织或衬衫配轻便下装，不默认添加厚外套。','短袖或薄衬衫配薄裙、轻薄裤，减少叠穿。','优先棉麻或轻薄短袖与轻薄下装，不安排厚针织和保暖外套。'];
 var weather=o.weather||'晴朗';return {season:season,temperature:temp,band:band,label:labels[band],advice:advice[band],weather:weather,rain:/雨|雪/.test(weather),wind:/风/.test(weather),needsOuter:band<=2||(/风/.test(weather)&&temp<=23)};
}
function text(i){return [i.name,i.color,i.note,(Array.isArray(i.tags)?i.tags:[]).join(' ')].filter(Boolean).join(' ');}
function group(i){var c=i.category||'';return c==='外套'?'outer':c==='上装'?'top':c==='下装'?'bottom':c==='连衣裙'?'dress':c==='鞋履'?'shoes':c==='包袋'?'bag':'acc';}
function unsuitable(i,c){
 var s=text(i),g=group(i),season=i.season||'',summerOnly=/夏/.test(season)&&!/春|秋|冬|四季/.test(season),winterOnly=/冬/.test(season)&&!/春|夏|秋|四季/.test(season);
 var heavy=/羽绒|棉服|棉衣|加绒|厚毛衣|厚针织|羊羔绒|羊毛大衣|毛呢大衣|保暖/.test(s);
 if(c.band>=4&&(heavy||(winterOnly&&['top','bottom','outer','dress','shoes'].includes(g))))return '当前温度偏热，不适合保暖厚款';
 if(c.band===5&&(/毛衣|针织|皮衣|长靴|雪地靴/.test(s)||(g==='outer'&&!/防晒|薄衬衫/.test(s))))return '炎热天气应减少厚材质和外层';
 if(c.band>=3&&g==='outer'&&/羽绒|棉服|棉衣|厚|羊羔绒|大衣/.test(s))return '当前温度不需要厚重外套';
 if(c.band<=1&&summerOnly&&['top','bottom','dress'].includes(g))return '低温不适合单独使用夏季薄款';
 if(c.band<=1&&['top','bottom','dress'].includes(g)&&/轻薄|薄款|棉麻|雪纺|短袖|吊带/.test(s)&&!/保暖|加绒/.test(s))return '低温需要更保暖的内搭与下装';
 if(c.band===0&&g==='outer'&&/轻薄|防晒|薄款|牛仔/.test(s)&&!/羽绒|棉服|厚|保暖/.test(s))return '寒冷天气需要保暖外层';
 if(c.band<=1&&/短裙|迷你裙|短裤|超短|吊带裙|露肩/.test(s))return '低温优先保暖长裤或长裙';
 if(c.band<=2&&g==='shoes'&&/凉鞋|拖鞋|露趾/.test(s))return '低温需要包脚鞋';
 if(c.rain&&g==='shoes'&&/麂皮|绒面|帆布|毛绒/.test(s))return '雨雪天优先易打理、防滑的包脚鞋';return '';
}
function template(c,o){
 var preppy=/参考图|学院|复古|甜酷/.test(o.style||'参考图风格'),sport=/街头|运动/.test(o.style||''),v=Math.abs(Number(o.variant)||0)%2,formal=/面试|晚宴/.test(o.occasion||'');
 var top=['米白高领厚针织上衣','奶白保暖针织上衣','米白长袖针织上衣','米白圆领针织上衣','米白棉质短袖上衣','白色轻薄棉质短袖上衣'][c.band];
 var bottom=c.band<=1?'深灰加厚直筒长裤':c.band===2?'深灰直筒长裤':c.band===3?'浅蓝高腰直筒牛仔裤':'浅灰轻薄直筒长裤';
 if(preppy){
  top=c.band<=1?(v?'藏蓝保暖针织上衣':'奶白高领厚针织上衣'):c.band===2?(v?'酒红色圆领针织上衣':'奶白衬衫领针织上衣'):c.band===3?(v?'浅蓝长袖衬衫':'奶白圆领薄针织上衣'):(v?'浅蓝短袖衬衫':'奶白短袖翻领上衣');
  if(c.band>=2&&!formal)bottom=c.band===2?'深灰格纹 A 字中长裙':v?'藏蓝高腰 A 字短裙':'深灰轻薄百褶短裙';
  if(c.season==='春季'&&c.band===3)top='浅蓝长袖衬衫';if(c.season==='秋季'&&c.band===3)top='酒红色圆领薄针织上衣';
 }
 if(sport){top=c.band<=1?'灰色加绒卫衣':c.band<=3?'灰色长袖棉质卫衣':'白色宽松棉质短袖';bottom=c.band<=1?'深灰加绒直筒运动裤':c.band<=3?'深灰直筒休闲裤':'浅灰轻薄运动长裤';}
 var outer=c.band===0?'奶白短款保暖羽绒服':c.band===1?'藏蓝保暖短棉服':preppy?'藏蓝短款夹克':'米色轻薄夹克';if(c.rain&&c.band>=2)outer='轻薄防风防水外套';
 var shoes=c.band<=1?'黑色保暖防滑短靴':preppy?'黑色平底乐福鞋':'白色简约运动鞋';if(c.band===5&&!preppy)shoes='白色透气运动鞋';if(c.rain)shoes=c.band<=1?'黑色防滑保暖短靴':'黑色防滑包脚休闲鞋';
 return {preppy:preppy,top:top,bottom:bottom,outer:outer,shoes:shoes,bag:preppy?'黑色小号肩包':'浅灰休闲腋下包'};
}
function suggest(wardrobe,picked,o){
 wardrobe=Array.isArray(wardrobe)?wardrobe.filter(function(i){return i&&typeof i==='object';}):[];
 o=o||{};var c=climateFor(o),t=template(c,o),style=o.style||'参考图风格',chosen=[],seen=new Set(),used=new Set(),warnings=[];
 function add(i,why){if(!i||seen.has(String(i.id)))return;seen.add(String(i.id));used.add(group(i));chosen.push({id:i.id,why:why});}
 (Array.isArray(picked)?picked:[]).forEach(function(i){if(!i)return;var owned=wardrobe.find(function(w){return String(w.id)===String(i.id);});if(!owned)return;var reason=unsuitable(owned,c),g=group(owned);if(reason)warnings.push('你预选的「'+owned.name+'」：'+reason+'，本套已换成合适款式。');else if((g==='dress'&&(used.has('top')||used.has('bottom')))||((g==='top'||g==='bottom')&&used.has('dress'))||(g==='bottom'&&used.has('bottom')))warnings.push('你预选的「'+owned.name+'」与已选主体重复，本套保留先选的主体单品。');else add(owned,'你指定的单品，并已检查当前温度适配');});
 function score(i){var s=text(i),n=i.image_path?2:0;if((Array.isArray(i.tags)?i.tags:[]).some(function(tag){return String(tag).includes(style);}))n+=5;if(c.season&&String(i.season||'').includes(c.season.slice(0,1)))n+=1;if(t.preppy)guide.keywords.forEach(function(k){if(s.includes(k))n+=2;});if(c.band<=1&&/厚|保暖|加绒|针织|羽绒/.test(s))n+=5;if(c.band>=4&&/轻薄|薄款|短袖|棉麻|透气/.test(s))n+=5;return n;}
 function candidates(g){return wardrobe.filter(function(i){return group(i)===g&&!seen.has(String(i.id))&&!unsuitable(i,c);});}
 function choose(g){if(used.has(g))return;var list=candidates(g);list.sort(function(a,b){return score(b)-score(a)||Number(a.id)-Number(b.id);});if(list.length){var pool=list.filter(function(i){return score(i)>=score(list[0])-1;});add(pool[(Math.abs(Number(o.variant)||0))%pool.length],'按'+c.temperature+'°C的'+c.label+'需求，从衣橱选择');}}
 if(!used.has('dress')&&!used.has('top')&&!used.has('bottom')&&!(candidates('top').length&&candidates('bottom').length)&&candidates('dress').length)choose('dress');
 if(!used.has('dress')){choose('top');choose('bottom');}if(c.needsOuter)choose('outer');choose('shoes');choose('bag');
 var required=used.has('dress')?[]:[['top','上装',t.top],['bottom','下装',t.bottom]];if(c.needsOuter)required.push(['outer','外套',t.outer]);required.push(['shoes','鞋履',t.shoes],['bag','包袋',t.bag]);
 var gaps=required.filter(function(r){return !used.has(r[0]);}).map(function(r){return {category:r[1],name:r[2],role:r[0],advice:r[0]==='outer'?'外搭可按室内外冷暖穿脱。'+c.advice:r[0]==='bag'?'用小体积肩包收住配色，避免配饰过多。':c.advice,budget:r[0]==='outer'?'¥200-600':'¥80-300',keyword:style+' '+r[2]};});
 function extra(role,category,name,advice){
  function matches(i){var s=text(i),g=group(i);return !unsuitable(i,c)&&((g==='top'&&role==='inner'&&/保暖.*打底|打底.*保暖/.test(s))||(g==='top'&&role==='mid'&&/针织|毛衣|加绒卫衣/.test(s)&&!/打底/.test(s))||(g==='acc'&&role==='legs'&&/保暖.*(连裤袜|打底裤)|加绒.*(连裤袜|打底裤)/.test(s))||(g==='acc'&&role==='rain'&&/雨伞/.test(s)));}
  if(wardrobe.some(function(i){return seen.has(String(i.id))&&matches(i);}))return;
  var owned=wardrobe.find(function(i){return !seen.has(String(i.id))&&matches(i);});if(owned)add(owned,advice);else gaps.push({role:role,category:category,name:name,advice:advice,budget:'¥40-180',keyword:name});
 }
 function selectedText(groups){return chosen.map(function(i){return wardrobe.find(function(w){return String(w.id)===String(i.id);});}).filter(function(i){return groups.includes(group(i));}).map(text).join(' ')+gaps.filter(function(i){return groups.includes(group(i));}).map(text).join(' ');}
 var topText=selectedText(['top','dress']);if(c.band<=1&&!/针织|毛衣|卫衣/.test(topText))extra('mid','上装','奶白保暖厚针织上衣','在衬衫与外套之间增加保暖中层。');if(c.band===0&&!/保暖.*打底|打底.*保暖/.test(topText))extra('inner','上装','保暖长袖打底衫','作为贴身内层，外面仍穿针织和羽绒服。');
 if(c.band<=2&&(/裙/.test(selectedText(['bottom','dress']))||used.has('dress')))extra('legs','配饰','深灰保暖连裤袜','低温穿裙装时补足腿部保暖。');if(c.rain)extra('rain','配饰','轻便折叠雨伞','雨天带伞；裤脚避免拖地，鞋底注意防滑。');
 return {items:chosen,gaps:gaps,warnings:warnings,climate:c,styleGuide:t.preppy?guide.title:'清爽年轻日常',palette:t.preppy?guide.palette:'用浅色与中性色协调，鞋包呼应，不依赖固定一套衣服。'};
}
function validate(plan,wardrobe,o){
 plan=plan||{};wardrobe=Array.isArray(wardrobe)?wardrobe:[];
 if(!Array.isArray(plan.items)||!Array.isArray(plan.gaps))return ['搭配单品格式不正确'];
 var c=climateFor(o),all=plan.items.map(function(i){return wardrobe.find(function(w){return i&&String(w.id)===String(typeof i==='object'?i.id:i);});}).filter(Boolean).concat(plan.gaps.filter(function(i){return i&&typeof i==='object';})),reasons=all.map(function(i){var r=unsuitable(i,c);return r?'「'+i.name+'」'+r:'';}).filter(Boolean);
 if(plan.items.some(function(i){return !i||!wardrobe.some(function(w){return String(w.id)===String(typeof i==='object'?i.id:i);});}))reasons.push('搭配引用了不存在的衣橱单品');
 if(plan.gaps.some(function(i){return !i||typeof i!=='object'||typeof i.name!=='string'||!i.name.trim()||!['上装','下装','外套','连衣裙','鞋履','包袋','配饰','其他'].includes(i.category);}))reasons.push('推荐单品缺少有效名称或类别');
 var groups=new Set(all.map(group));if(!groups.has('dress')&&(!groups.has('top')||!groups.has('bottom')))reasons.push('方案需要完整上装与下装');if(!groups.has('shoes'))reasons.push('方案缺少鞋履');
 if(groups.has('dress')&&groups.has('bottom'))reasons.push('连衣裙与另一件下装重复，请选择一个主体');
 if(c.needsOuter&&!groups.has('outer'))reasons.push('当前温度或风力需要外搭');
 if(c.band<=1&&!all.some(function(i){return (group(i)==='top'||group(i)==='dress')&&/针织|毛衣|卫衣/.test(text(i));}))reasons.push('低温方案缺少保暖中层');
 if(c.band===0&&!all.some(function(i){return group(i)==='top'&&/保暖.*打底|打底.*保暖/.test(text(i));}))reasons.push('寒冷方案缺少保暖打底层');
 if(c.band<=2&&all.some(function(i){return group(i)==='dress'||(group(i)==='bottom'&&/裙/.test(text(i)));})&&!all.some(function(i){return /保暖连裤袜|保暖打底裤|加绒连裤袜/.test(text(i));}))reasons.push('低温裙装缺少腿部保暖');
 return reasons;
}
var api={suggest:suggest,group:group,climateFor:climateFor,unsuitable:unsuitable,validate:validate,currentSeason:currentSeason,seasonDefaults:defaults};if(typeof module==='object'&&module.exports)module.exports=api;else root.OutfitPlanner=api;
})(typeof window!=='undefined'?window:globalThis);
