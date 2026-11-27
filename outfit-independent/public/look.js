/* Export the same reference board shown on screen, with embedded private photos. */
(function(){
  'use strict';
  async function photoData(url){
    if(!url)return '';
    try{
      var response=await window.OutfitBackend.fetch(url,{credentials:'same-origin'});if(!response.ok)return '';
      var blob=await response.blob();
      return await new Promise(function(resolve){var reader=new FileReader(),timer=setTimeout(function(){try{reader.abort();}catch(e){}resolve('');},15000);function done(value){clearTimeout(timer);resolve(value);}reader.onload=function(){done(reader.result);};reader.onerror=reader.onabort=function(){done('');};reader.readAsDataURL(blob);});
    }catch(e){return '';}
  }
  async function render(plan,resolve){
    var photos={};
    await Promise.all((plan.items||[]).map(async function(item){if(item.image_path)photos[item.image_path]=await photoData(resolve(item.image_path));}));
    var svg=window.OutfitReference.posterSvg(plan,photos);
    var url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
    try{
      var image=await new Promise(function(resolve,reject){var im=new Image(),timer=setTimeout(function(){im.onload=im.onerror=null;reject(new Error('参考图绘制超时，请重新导出'));},20000);im.onload=function(){clearTimeout(timer);resolve(im);};im.onerror=function(){clearTimeout(timer);reject(new Error('参考图导出失败'));};im.src=url;});
      var canvas=document.createElement('canvas');canvas.width=image.naturalWidth||image.width;canvas.height=image.naturalHeight||image.height;
      var context=canvas.getContext('2d');if(!context)throw new Error('当前浏览器暂不支持参考图导出，请更换浏览器');context.drawImage(image,0,0);
      return await new Promise(function(resolve,reject){var timer=setTimeout(function(){reject(new Error('参考图保存超时，请重试'));},15000);canvas.toBlob(function(blob){clearTimeout(timer);if(blob)resolve(blob);else reject(new Error('参考图导出失败'));},'image/png');});
    }finally{URL.revokeObjectURL(url);}
  }
  window.OutfitLook={render:render};
})();
