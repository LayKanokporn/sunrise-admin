// [v0.11/W1] OfflineBanner — แจ้งเมื่อเน็ตหลุด + refetch อัตโนมัติเมื่อกลับมา
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export default function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine);
  const [justBack, setJustBack] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    const goOffline = () => {
      console.log(`[${new Date().toISOString()}] [WARN] [OfflineBanner] network offline`);
      setOnline(false);
    };
    const goOnline = () => {
      console.log(`[${new Date().toISOString()}] [INFO] [OfflineBanner] network back online — refetching`);
      setOnline(true);
      setJustBack(true);
      qc.invalidateQueries({ refetchType: 'all' });
      setTimeout(() => setJustBack(false), 3000);
    };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, [qc]);

  if (online && !justBack) return null;

  return (
    <div className={`fixed top-0 inset-x-0 z-[100] text-center text-sm font-semibold py-2 text-white ${online ? 'bg-emerald-500' : 'bg-slate-700'}`}>
      {online ? 'กลับมาออนไลน์แล้ว กำลังอัปเดตข้อมูล...' : 'ออฟไลน์อยู่ — ข้อมูลอาจไม่ล่าสุด จะอัปเดตเมื่อต่อเน็ตอีกครั้ง'}
    </div>
  );
}
