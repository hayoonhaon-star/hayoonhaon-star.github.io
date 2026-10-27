/*
 * 오프라인 캐시 (sw.js)
 * - 앱 파일만 기기에 저장해 인터넷 없이 실행되도록 합니다.
 * - 점검 기록은 캐시하지 않으며(IndexedDB 별도 보관) 외부 주소로 요청을 보내지 않습니다.
 * - 앱 파일을 수정해 배포할 때는 CACHE 값을 올려야 기존 기기에 새 버전이 반영됩니다.
 */
const CACHE = 'ci-v1.1.3';
const FILES = [
  './', './index.html', './manifest.webmanifest',
  './css/app.css', './css/print.css',
  './js/config/criteria.js', './js/engine.js', './js/storage.js', './js/xlsx.js', './js/docread.js', './js/vendor/pdfjs/pdf.min.js', './js/vendor/pdfjs/pdf.worker.min.js',
  './js/vendor/pdfjs/cmaps/Adobe-Korea1-0.bcmap', './js/vendor/pdfjs/cmaps/Adobe-Korea1-1.bcmap', './js/vendor/pdfjs/cmaps/Adobe-Korea1-2.bcmap', './js/vendor/pdfjs/cmaps/Adobe-Korea1-UCS2.bcmap', './js/vendor/pdfjs/cmaps/KSC-EUC-H.bcmap', './js/vendor/pdfjs/cmaps/KSC-EUC-V.bcmap', './js/vendor/pdfjs/cmaps/KSC-H.bcmap', './js/vendor/pdfjs/cmaps/KSC-Johab-H.bcmap', './js/vendor/pdfjs/cmaps/KSC-Johab-V.bcmap', './js/vendor/pdfjs/cmaps/KSC-V.bcmap', './js/vendor/pdfjs/cmaps/KSCms-UHC-H.bcmap', './js/vendor/pdfjs/cmaps/KSCms-UHC-HW-H.bcmap', './js/vendor/pdfjs/cmaps/KSCms-UHC-HW-V.bcmap', './js/vendor/pdfjs/cmaps/KSCms-UHC-V.bcmap', './js/vendor/pdfjs/cmaps/KSCpc-EUC-H.bcmap', './js/vendor/pdfjs/cmaps/KSCpc-EUC-V.bcmap', './js/vendor/pdfjs/cmaps/UniKS-UCS2-H.bcmap', './js/vendor/pdfjs/cmaps/UniKS-UCS2-V.bcmap', './js/vendor/pdfjs/cmaps/UniKS-UTF16-H.bcmap', './js/vendor/pdfjs/cmaps/UniKS-UTF16-V.bcmap', './js/vendor/pdfjs/cmaps/UniKS-UTF32-H.bcmap', './js/vendor/pdfjs/cmaps/UniKS-UTF32-V.bcmap', './js/vendor/pdfjs/cmaps/UniKS-UTF8-H.bcmap', './js/vendor/pdfjs/cmaps/UniKS-UTF8-V.bcmap', './js/report.js', './js/samples.js', './js/app.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('ci-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// 인터넷이 되면 항상 새 파일을 먼저 받고(수정 즉시 반영), 안 되면 기기에 저장된 파일로 실행
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // 외부 요청은 처리하지 않음
  const vendor = url.pathname.includes('/js/vendor/'); // 용량 큰 PDF 도구는 바뀌지 않으므로 저장본 우선
  const fromCache = () => caches.match(e.request, { ignoreSearch: true }).then(hit => hit || (e.request.mode === 'navigate' ? caches.match('./index.html') : undefined));
  const fromNet = () => fetch(e.request, { cache: 'no-cache' }).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  });
  e.respondWith(vendor ? fromCache().then(h => h || fromNet()) : fromNet().catch(() => fromCache()));
});
