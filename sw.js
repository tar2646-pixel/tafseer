// عامل الخدمة: يجعل الموقع قابلاً للتثبيت ويعمل دون إنترنت (اختبار الحفظ وآخر بنك أسئلة محفوظ)
const VERSION = 'tq-v8';
const SHELL = [
  './', './index.html', './app.js?v=8', './plan.js?v=8', './account.js?v=8', './config.js?v=8', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'
];
const CDN = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // بيانات Supabase تُطلب دائماً من الشبكة
  if (url.hostname.endsWith('supabase.co') || url.hostname.endsWith('supabase.in')) return;

  // ملفات المكتبات والخطوط ونص القرآن: روابط ثابتة الإصدار، تُقرأ من الذاكرة أولاً
  if (CDN.includes(url.hostname)) {
    e.respondWith(
      caches.open(VERSION).then(async c => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') c.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  // ملفات الموقع: من الشبكة أولاً (لتصل التحديثات)، ومن الذاكرة عند انقطاع الاتصال
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req).then(res => {
        if (res.ok) caches.open(VERSION).then(c => c.put(req, res.clone()));
        return res;
      }).catch(async () => (await caches.match(req)) || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))
    );
  }
});
