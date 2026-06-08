// [v0.1] Auth + LIFF init context
import { createContext, useContext, useEffect, useState } from 'react';
import liff from '@line/liff';
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
      try {
        const liffId = import.meta.env.VITE_LIFF_ID;
        if (!liffId) throw new Error('VITE_LIFF_ID not set in .env');

        await liff.init({ liffId });
        log('INFO', 'init', 'LIFF initialized');

        if (!liff.isLoggedIn()) {
          log('WARN', 'init', 'not logged in → redirecting');
          liff.login();
          return;
        }

        const profile = await liff.getProfile();
        log('INFO', 'init', 'got profile', { userId: profile.userId.substring(0,8) + '...' });

        const verify = await api.verify(profile.userId);
        log('INFO', 'init', 'verify result', { isAdmin: verify.isAdmin });
        if (verify.isAdmin) setAuthUid(profile.userId);

        setState({
          loading: false,
          isAdmin: verify.isAdmin,
          profile,
          error: null
        });
      } catch(e) {
        log('ERROR', 'init', e.message, { stack: e.stack });
        setState({ loading: false, isAdmin: false, profile: null, error: e.message });
      }
    })();
  }, []);

  return <AuthCtx.Provider value={state}>{children}</AuthCtx.Provider>;
}
