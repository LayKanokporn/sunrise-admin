// entry — main.jsx mounts QueryClient + App
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './index.css';

// กันหน่วงบนมือถือ:
//   - ปิด refetchInterval global — เดิมทุก query (calendar/kanban/production) poll พร้อมกันทุก 60s
//     เบื้องหลังตลอด ทำให้มือถือ LINE หน่วง + เปลือง quota
//     → ให้ poll เฉพาะ newcount (เบา) ใน TopBar พอ
//   - ปิด refetchOnWindowFocus — เดิมเปิด LINE ใหม่/สลับแอป = refetch ทุก query พร้อมกัน spike
//     → มี pull-to-refresh + ปุ่ม refresh + newcount poll แทนแล้ว
//   staleTime/gcTime คงไว้ — สลับ tab กลับมาใช้ cache ทันที
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 60_000,           // ← ใช้ cached ทันทีถ้าน้อยกว่า 60s
      gcTime: 5 * 60_000,          // ← เก็บ cache ใน memory 5 นาที (เปลี่ยน tab กลับมาเร็ว)
      retry: 1
    }
  }
});

// Persist cache ลง localStorage — เปิดเว็บเห็นข้อมูลรอบก่อนทันที (0ms) แล้ว refetch เงียบๆ
// TTL = 5 นาที (ยาวพอที่จะ instant-load หลังเปิดซ้ำ แต่ไม่นานจนข้อมูลเก่าค้าง)
// หลัง restore → invalidate ทันที เพื่อให้ React Query refetch ใน background โดยไม่ block UI
const PERSIST_KEY = 'sunrise_qcache_v1';
const PERSIST_TTL = 5 * 60_000;
try {
  const saved = localStorage.getItem(PERSIST_KEY);
  if (saved) {
    const { ts, data } = JSON.parse(saved);
    if (Date.now() - ts < PERSIST_TTL) {
      Object.entries(data).forEach(([k, v]) => queryClient.setQueryData(JSON.parse(k), v));
      // invalidate ทันที — ทำให้ UI แสดงข้อมูลเก่าก่อน (0ms) แล้ว refetch เงียบๆ ทันที
      // ป้องกัน React Query คิดว่า data fresh (เพราะ setQueryData ตั้ง dataUpdatedAt = now)
      setTimeout(() => queryClient.invalidateQueries(), 0);
      console.log('[INFO] [main] cache restored + invalidated for background refetch');
    }
  }
} catch (_) {}

let _persistTimer = null;
queryClient.getQueryCache().subscribe(() => {
  clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => {
    try {
      const data = {};
      queryClient.getQueryCache().getAll()
        .filter(q => q.state.data != null)
        .forEach(q => { data[JSON.stringify(q.queryKey)] = q.state.data; });
      localStorage.setItem(PERSIST_KEY, JSON.stringify({ ts: Date.now(), data }));
    } catch (_) {}
  }, 500); // debounce — ไม่เขียนทุก micro-update
});

console.log('[INFO] [main] mounting app');

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>
);

// PWA — register service worker (production เท่านั้น)
// auto-update: เช็คเวอร์ชันใหม่ทุกครั้งที่เปิดแอป เจอ build ใหม่ → reload ให้อัตโนมัติ
//   เดิมไม่มีส่วนนี้ → SW เก่าคุมต่อไปเรื่อย ๆ ผู้ใช้ต้อง clear cache เองถึงเห็นของใหม่
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => {
        console.log('[INFO] [main] service worker registered');
        reg.update();
        reg.addEventListener('updatefound', () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener('statechange', () => {
            // installed + มี SW เดิมคุมอยู่ = มี build ใหม่จริง (ไม่ใช่การติดตั้งครั้งแรก)
            if (sw.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('[INFO] [main] new build detected — reloading');
              window.location.reload();
            }
          });
        });
      })
      .catch((e) => console.log('[WARN] [main] sw register failed: ' + e.message));
  });
}
