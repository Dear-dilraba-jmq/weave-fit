/* 穿搭魔镜：本机衣物识别和白底单品图。原图不做颜色阈值擦除。 */
(function () {
  'use strict';


  function loadBitmap(src) {
    if (window.createImageBitmap && src instanceof Blob) {
      return createImageBitmap(src, { imageOrientation: 'from-image' }).catch(function () {
        return loadHtmlImage(src);
      });
    }
    return loadHtmlImage(src);
  }

  function loadHtmlImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var objectUrl = null;
      img.onload = function () {
        if (objectUrl) setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 1000);
        resolve(img);
      };
      img.onerror = function () {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        reject(new Error('图片读取失败，换一张试试'));
      };
      if (src instanceof Blob) {
        objectUrl = URL.createObjectURL(src);
        img.src = objectUrl;
      } else {
        img.crossOrigin = 'anonymous';
        img.src = src;
      }
    });
  }

  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  function drawScaled(bitmap, maxSide) {
    var iw = bitmap.width || bitmap.naturalWidth;
    var ih = bitmap.height || bitmap.naturalHeight;
    if (!iw || !ih) throw new Error('图片尺寸异常');
    var scale = Math.min(1, maxSide / Math.max(iw, ih));
    var w = Math.max(1, Math.round(iw * scale));
    var h = Math.max(1, Math.round(ih * scale));
    var c = makeCanvas(w, h);
    var ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, w, h);
    if (bitmap.close) bitmap.close();
    return { canvas: c, ctx: ctx, w: w, h: h };
  }

  function toBlob(canvas, type, quality) {
    return new Promise(function (resolve, reject) {
      if (!canvas.toBlob) { reject(new Error('当前浏览器不支持图片导出')); return; }
      canvas.toBlob(function (b) {
        if (b) resolve(b);
        else reject(new Error('图片导出失败'));
      }, type, quality);
    });
  }

  /* 只压缩，不改内容：用于面部参考照、以及「保留原图」选项 */
  async function prepare(file, maxSide, quality) {
    var bmp = await loadBitmap(file);
    var d = drawScaled(bmp, maxSide || 1280);
    var blob = await toBlob(d.canvas, 'image/jpeg', quality || 0.86);
    return { blob: blob, width: d.w, height: d.h };
  }

  /* 在本机后台按衣物类别分割，输出居中的 1080×1080 白底单品图。 */
  async function cutout(file, category) {
    var response = await window.OutfitBackend.fetch('/api/garment?category=' + encodeURIComponent(category || '上装'), {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file
    });
    if (!response.ok) {
      var error = await response.json().catch(function () { return {}; });
      throw new Error(error.error && error.error.message || '衣物处理失败，请重试');
    }
    return { blob: await response.blob(), mode: 'garment', width: 1080, height: 1080 };
  }

  async function analyze(file,options) {
    options=options||{};var response;
    for(var attempt=0;attempt<8;attempt++){
      if(options.signal&&options.signal.aborted)throw new DOMException('识别已取消','AbortError');
      response=await window.OutfitBackend.fetch('/api/wardrobe/analyze'+(options.category?'?category='+encodeURIComponent(options.category):''),{method:'POST',signal:options.signal,headers:{'Content-Type':file.type||'application/octet-stream'},body:file});
      if(response.status!==429||!response.headers.get('Retry-After')||attempt===7)break;
      await response.json().catch(function(){return {};});await new Promise(function(resolve){setTimeout(resolve,1000);});
    }
    var value=await response.json();if(!response.ok||!value.data)throw Error(value.error&&value.error.message||'照片识别暂不可用，请重试');
    var data=value.data,blob=null;
    if(data.image&&data.image.contentType==='image/png'&&typeof data.image.base64==='string'){
      if(data.image.base64.length>8*1024*1024)throw Error('单品图过大，请换一张清晰照片');
      var binary=atob(data.image.base64),bytes=new Uint8Array(binary.length);for(var i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
      blob=new Blob([bytes],{type:'image/png'});
    }
    return {attributes:data.attributes,blob:blob,mode:blob?'garment':'raw',message:data.cutoutMessage||''};
  }

  window.OutfitImage = {
    prepare: prepare,
    cutout: cutout,
    analyze: analyze,
    toBlob: toBlob,
    loadBitmap: loadBitmap,
    blobUrl: function (blob) { return URL.createObjectURL(blob); }
  };
})();
