/* 穿搭魔镜 Service Worker
   只缓存本站静态文件；登录 / 数据库 / 存储 / 大模型等云接口一律走网络，绝不缓存。 */
var CACHE = 'outfit-mirror-independent-v14';
var STATIC = {
  '/': true,
  '/index.html': true,
  '/styles.css': true,
  '/app.js': true,
  '/local-api.js': true,
  '/pwa.js': true,
  '/cutout.js': true,
  '/look.js': true,
  '/outfit-plan.js': true,
  '/style-guide.js': true,
  '/style-source-spring-v1.jpg': true,
  '/style-source-summer-v1.jpg': true,
  '/style-source-autumn-v1.jpg': true,
  '/style-source-winter-v1.jpg': true,
  '/shopping.js': true,
  '/taobao-connect.html': true,
  '/taobao-connect.js': true,
  '/look-reference.js': true,
  '/reference-cream-knit-v1.png': true,
  '/reference-light-blue-jeans-v1.png': true,
  '/reference-white-sneakers-v1.png': true,
  '/reference-light-grey-bag-v1.png': true,
  '/manifest.webmanifest': true,
  '/icon.svg': true,
  '/icon-192.png': true,
  '/icon-512.png': true,
  '/apple-touch-icon.png': true
};

self.addEventListener('install', function () { self.skipWaiting(); });

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k.startsWith('outfit-mirror-independent-') && k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;   // CDN SDK、OAuth、云接口
  if (!STATIC[url.pathname]) return;                 // 同源云 API 路径，直连网络
  if (req.mode !== 'navigate' &&
      !/^(script|style|image|manifest|document)$/.test(req.destination)) return;

  event.respondWith(
    caches.open(CACHE).then(function (cache) {
      var key = url.pathname;
      var network = fetch(req).then(function (res) {
        if (res && res.ok && !res.redirected && res.type === 'basic') {
          try { event.waitUntil(cache.put(key, res.clone()).catch(function(){})); } catch (e) {}
        }
        return res;
      });
      return cache.match(key).then(function (cached) {
        if (req.mode === 'navigate') {
          return network.catch(function () { return cached || Response.error(); });
        }
        return network.catch(function () { return cached || Response.error(); });
      });
    }).catch(function(){return fetch(req);})
  );
});
