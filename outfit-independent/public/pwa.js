/* 穿搭魔镜 — 手机 App 化：Service Worker 注册 + 添加到主屏幕引导 */
(function () {
  'use strict';

  /* HTTPS 与受信任的本机地址；普通局域网 HTTP 仍可使用网页。 */
  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).catch(function () {
        /* 注册失败不影响正常使用 */
      });
    });
  }

  /* 2. 安装引导 */
  var bar = document.getElementById('installBar');
  var title = bar && bar.querySelector('.ib-txt b');
  var sub = document.getElementById('installSub');
  var go = document.getElementById('installGoBtn');
  var closeBtn = document.getElementById('installCloseBtn');
  if (!bar || !title || !sub || !go || !closeBtn) return;

  var ua = navigator.userAgent || '';
  var isiOS = /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isWechat = /MicroMessenger/i.test(ua);
  var standalone = window.navigator.standalone === true ||
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  var deferred = null;
  var localHttp = location.protocol === 'http:' && !window.isSecureContext;
  var explained = false;
  var dismissed = false;
  try { dismissed = localStorage.getItem('om_install_dismissed') === '1'; } catch (e) {}

  function hide(remember) {
    bar.hidden = true;
    if (remember) { dismissed=true;try { localStorage.setItem('om_install_dismissed', '1'); } catch (e) {} }
  }

  function show() {
    if (standalone || dismissed) { bar.hidden = true; return; }
    var appView = document.getElementById('appView');
    bar.classList.toggle('at-auth', !(appView && !appView.hidden));
    if (localHttp && !isWechat) {
      title.textContent = '手机浏览器快捷访问';
      sub.textContent = '当前为局域网网页，可收藏地址；完整 App 安装需要 HTTPS。电脑服务需保持运行。';
      go.textContent = '知道了';
    } else if (isWechat) {
      title.textContent = '建议在浏览器中打开';
      sub.textContent = '点右上角「···」→ 在浏览器打开，就能把穿搭魔镜装到桌面';
      go.textContent = '知道了';
    } else if (isiOS) {
      title.textContent = '把穿搭魔镜装到桌面';
      sub.textContent = '点 Safari 底部「分享」→ 添加到主屏幕，即可全屏使用';
      go.textContent = '怎么装';
    } else {
      title.textContent = '把穿搭魔镜装到桌面';
      sub.textContent = deferred
        ? '一键安装，像 App 一样全屏打开，出门前随手搭一套'
        : '像 App 一样全屏打开，出门前随手搭一套';
      go.textContent = '安装';
    }
    explained = false;
    bar.hidden = false;
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    show();
  });

  window.addEventListener('appinstalled', function () { hide(true); });

  go.addEventListener('click', function () {
    if(localHttp&&!isWechat){hide(false);return;}
    if (deferred && !isiOS && !isWechat) {
      try{Promise.resolve(deferred.prompt()).catch(function(){hide(false);});}catch(e){deferred=null;hide(false);return;}
      if (deferred.userChoice && deferred.userChoice.then) {
        deferred.userChoice.then(function (choice) {
          if (choice && choice.outcome === 'accepted') hide(true);
          else hide(false);
        }).catch(function(){hide(false);});
      } else { hide(false); }
      deferred = null;
      return;
    }
    if (!explained) {
      if (isWechat) {
        sub.textContent = '微信内无法安装：请点右上角「···」→「在浏览器打开」，再添加到主屏幕';
      } else if (isiOS) {
        sub.textContent = '① 点底部中间的分享按钮 ② 下滑找到「添加到主屏幕」 ③ 右上角点「添加」';
      } else {
        sub.textContent = 'Chrome / Edge 地址栏右侧有安装图标，或在菜单中选「安装穿搭魔镜」';
      }
      go.textContent = '知道了';
      explained = true;
      return;
    }
    hide(false);
  });

  closeBtn.addEventListener('click', function () { hide(true); });

  if (!standalone && !dismissed) {
    window.setTimeout(show, 1800);
  } else {
    bar.hidden = true;
  }
})();
