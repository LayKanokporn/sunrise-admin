// Service Worker — cache static assets ให้เปิดซ้ำเร็ว
// นโยบาย:
//   - static (js/css/font/icon): cache-first — ชื่อไฟล์มี hash เปลี่ยน build = เปลี่ยนชื่อ
//   - API (script.google.com): network-only — ข้อมูลออเดอร์ต้องสดเสมอ ห้าม cache
//   - HTML: network-first fallback cache (offline ยังเปิด shell ได้)
//
// BUILD ถูก stamp ตอน build โดย plugin ใน vite.config.js — เปลี่ยนค่าทุก deploy
//   เดิมชื่อ cache fix ไว้ที่ 'sunrise-admin-v1' ตลอด → activate ไม่เคยลบอะไรเลย
//   (filter k !== CACHE ไม่เคยเป็นจริง) + ตัวไฟล์ sw.js ไม่เคยเปลี่ยน byte
//   → browser ไม่ re-install SW → ผู้ใช้ค้างอยู่กับ build เก่าถาวร
const BUILD = '__BUILD_ID__';
const CACHE = 'sunrise-admin-' + BUILD;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/icon.svg', '/manifest.webmanifest'])));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // API → network เท่านั้น (ไม่ cache ข้อมูลออเดอร์)
  if (url.hostname.includes('script.google.com') || url.hostname.includes('googleusercontent.com')) return;

  // HTML navigation → network-first
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((res) => { caches.open(CACHE).then((c) => c.put('/', res.clone())); return res; })
        .catch(() => caches.match('/'))
    );
    return;
  }

  // static assets → cache-first
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok && (url.origin === location.origin || url.hostname.includes('fonts.g'))) {
        const clone = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, clone));
      }
      return res;
    }))
  );
});
