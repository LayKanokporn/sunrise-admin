// [v0.1] Auth + LIFF init context
// [v0.13/S2] LIFF dynamic import — โหลด @line/liff เฉพาะตอนต้อง init จริง
//   (visit ที่มี cache / mock mode ข้ามไป ไม่ต้อง parse lib ที่หนัก)
import { createContext, useContext, useEffect, useState } from 'react';
import { api, setAuthUid } from './api';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

function log(level, fn, msg, ctx) {
  console.log(`[${new Date().toISOString()}] [${level}] [auth/${fn}] ${msg}` + (ctx ? ' | ' + JSON.stringify(ctx) : ''));
}

export function AuthProvider({ children }) {
  const [state, setState] = useState({
    loading: true,
    isAdmin: false,
    profile: null,
    error: null
  });

  useEffect(() => {
    (async () => {
      log('INFO', 'init', 'starting LIFF + admin check');
      // [v0.4] mock mode — skip LIFF ทั้งหมด
      if (String(import.meta.env.VITE_USE_MOCK||'').toLowerCase() === 'true') {
        log('INFO', 'init', 'MOCK MODE — skipping LIFF');
        setState({ loading:false, isAdmin:true,
          profile:{ userId:'Umock0000000000000000000000mock00', displayName:'Mock Admin', pictureUrl:null },
          error:null });
        return;
      }

      // [v0.10] sessionStorage cache — ลด GAS cold start สำหรับ visit ซ้ำในวันเดียวกัน
      const CACHE_KEY = 'sunrise_auth_v1';
      const CACHE_TTL = 8 * 60 * 60 * 1000; // 8 ชั่วโมง
      try {
        const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
        if (cached && Date.now() - cached.ts < CACHE_TTL) {
          log('INFO', 'init', 'using cached auth', { userId: cached.profile.userId.substring(0,8)+'...' });
          if (cached.isAdmin) setAuthUid(cached.profile.userId);
          setState({ loading: false, isAdmin: cached.isAdmin, profile: cached.profile, error: null });
          return;
        }
      } catch(_) { sessionStorage.removeItem(CACHE_KEY); }

      try {
        const liffId = import.meta.env.VITE_LIFF_ID;
        if (!liffId) throw new Error('VITE_LIFF_ID not set in .env');

        // โหลด LIFF SDK เมื่อจำเป็นเท่านั้น (ไม่อยู่ใน bundle แรก)
        const liff = (await import('@line/liff')).default;
        await liff.init({ liffId });
        log('INFO', 'init', 'LIFF initialized');

        if (!liff.isLoggedIn()) {
          log('WARN', 'init', 'not logged in → redirecting');
          liff.login();
          return;
        }

        const profile = await liff.getProfile();
        log('INFO', 'init', 'got profile', { userId: profile.userId.substring(0,8) + '...' });

        // [v0.10] OPEN_ACCESS mode — ข้าม verify ทั้งหมด ทุกคนเป็น admin
        const openAccess = String(import.meta.env.VITE_OPEN_ACCESS||'').toLowerCase() === 'true';
        let isAdmin = openAccess;
        if (!openAccess) {
          const verify = await api.verify(profile.userId);
          log('INFO', 'init', 'verify result', { isAdmin: verify.isAdmin });
          isAdmin = verify.isAdmin;
        } else {
          log('INFO', 'init', 'OPEN_ACCESS=true — skipping verify');
        }

        if (isAdmin) setAuthUid(profile.userId);

        // บันทึก cache
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), isAdmin, profile }));
        } catch(_) {}

        setState({ loading: false, isAdmin, profile, error: null });
      } catch(e) {
        log('ERROR', 'init', e.message, { stack: e.stack });
        setState({ loading: false, isAdmin: false, profile: null, error: e.message });
      }
    })();
  }, []);

  return <AuthCtx.Provider value={state}>{children}</AuthCtx.Provider>;
}
