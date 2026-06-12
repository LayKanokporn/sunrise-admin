// [v0.11/W3] Pull-to-refresh — ลากลงจากบนสุดของหน้าเพื่อ refetch ทุก query
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

const THRESHOLD = 70; // px ที่ต้องลากถึงจึง trigger

export function usePullToRefresh() {
  const qc = useQueryClient();
  const [pull, setPull] = useState(0);        // ระยะลากปัจจุบัน
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let startY = 0;
    let pulling = false;

    function onTouchStart(e) {
      // เริ่มจับเฉพาะเมื่อ scroll อยู่บนสุด
      if (window.scrollY <= 0) {
        startY = e.touches[0].clientY;
        pulling = true;
      }
    }
    function onTouchMove(e) {
      if (!pulling) return;
      const dy = e.touches[0].clientY - startY;
      if (dy > 0 && window.scrollY <= 0) {
        setPull(Math.min(dy * 0.5, 110)); // damping
      } else {
        pulling = false;
        setPull(0);
      }
    }
    async function onTouchEnd() {
      if (!pulling) return;
      pulling = false;
      setPull((p) => {
        if (p >= THRESHOLD) {
          console.log(`[${new Date().toISOString()}] [INFO] [pullToRefresh] triggered — invalidating queries`);
          setRefreshing(true);
          qc.invalidateQueries().finally(() => setTimeout(() => setRefreshing(false), 600));
        }
        return 0;
      });
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [qc]);

  return { pull, refreshing, threshold: THRESHOLD };
}
