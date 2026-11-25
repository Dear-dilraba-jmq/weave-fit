/* Visual observations from 17 user-provided collages, not model training. */
(function(root){
  var guide={version:1,count:17,title:'复古学院 · 甜酷日常',
    summary:'衬衫领、针织开衫、格纹与百褶是主线，搭长袜、乐福鞋、玛丽珍或短靴；也保留宽松直筒裤与清爽衬衫的日常感。',
    palette:'灰、奶白、藏蓝和棕色作底色，用酒红、浅蓝或浅粉点缀；每套集中使用一种图案。',
    silhouette:'自然高腰线，短上装配 A 字裙或直筒阔腿裤，松紧有对比，不夸大腿长。',
    rules:'保持20–30岁的年轻日常感。领口、袖口或裙摆露出少量层次，领带、蝴蝶结、围巾、包挂挑一到两处。低温改用厚裤或保暖长裙，不照搬厚外套配裸腿；夏天保留学院配色和领型，减少叠穿。只参考服装，不复制图中人物的脸或身材。',
    keywords:['学院','格纹','百褶','针织','衬衫','乐福','玛丽珍','领带','蝴蝶结','酒红','藏蓝'],
    referenceFor:function(c){var id=c.band<=1?'winter':c.band===2?'autumn':c.band===3?'spring':'summer';return 'style-source-'+id+'-v1.jpg';},
    prompt:function(){return this.title+'。'+this.summary+this.palette+this.silhouette+this.rules;}};
  if(typeof module==='object'&&module.exports)module.exports=guide;else root.OutfitStyleGuide=guide;
})(typeof window!=='undefined'?window:globalThis);
