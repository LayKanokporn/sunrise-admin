// [LOG] entry — main.jsx mounts QueryClient + App
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.jsx';
import './index.css';

// [v0.7] cache aggressive — Apps Script ช้า + ใช้ response cache 60s server-side
//   staleTime 60s = ข้อมูลถือว่าสด 1 นาที (ไม่ refetch ทันทีตอน mount component อื่น)
//   refetchInterval 60s = poll ทุก 1 นาที (ลดจาก 30s — ประหยัด quota)
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: 60_000,
      refetchOnWindowFocus: true,
      staleTime: 60_000,           // ← ใช้ cached ทันทีถ้าน้อยกว่า 60s
      gcTime: 5 * 60_000,          // ← เก็บ cache ใน memory 5 นาที (เปลี่ยน tab กลับมาเร็ว)
      retry: 1
    }
  }
});

console.log('[INFO] [main] mounting app');

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
);
