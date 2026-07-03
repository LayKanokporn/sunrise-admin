// [LOG] entry — main.jsx mounts QueryClient + App
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './index.css';

// [v0.13/P2+P3] กันหน่วงบนมือถือ:
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

// [W1] Persist cache ลง localStorage — เปิดเว็บเห็นข้อมูลรอบก่อนทันที (0ms) แล้ว refetch เงียบๆ
const PERSIST_KEY = 'sunrise_qcache_v1';
const PERSIST_TTL = 10 * 60_000; // ใช้ cache เก่าได้สูงสุด 10 นาที
try {
  const saved = localStorage.getItem(PERSIST_KEY);
  if (saved) {
    const { ts, data } = JSON.parse(saved);
    if (Date.now() - ts < PERSIST_TTL) {
      Object.entries(data).forEach(([k, v]) => queryClient.setQueryData(JSON.parse(k), v));
      console.log('[INFO] [main] cache restored from localStorage');
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

// [v0.11/W2] PWA — register service worker (production เท่านั้น)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(() => console.log('[INFO] [main] service worker registered'))
      .catch((e) => console.log('[WARN] [main] sw register failed: ' + e.message));
  });
}
