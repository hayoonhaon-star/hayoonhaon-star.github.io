/*
 * 오프라인 캐시 (sw.js)
 * - 앱 파일만 기기에 저장해 인터넷 없이 실행되도록 합니다.
 * - 점검 기록은 캐시하지 않으며(IndexedDB 별도 보관) 외부 주소로 요청을 보내지 않습니다.
 * - 앱 파일을 수정해 배포할 때는 CACHE 값을 올려야 기존 기기에 새 버전이 반영됩니다.
 */
const CACHE = 'ci-v1.0.1';
const FILES = [
  './', './index.html', './manifest.webmanifest',
  './css/app.css', './css/print.css',
  './js/config/criteria.js', './js/engine.js', './js/storage.js', './js/xlsx.js', './js/report.js', './js/samples.js', './js/app.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('ci-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // 외부 요청은 처리하지 않음
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
