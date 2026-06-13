// [v0.8] TopBar — refresh + search + notification badge
import { useState, useEffect } from 'react';
import { useQuery, useQueryClient, useIsFetching } from '@tanstack/react-query';
import { RefreshCw, Search, Bell, Settings, Rows3, Rows2, Eye } from 'lucide-react';
import { api } from '../lib/api';
import { prefs, usePrefs } from '../lib/prefs';

const LAST_SEEN_KEY = 'sunrise.lastSeenTimestamp';

export default function TopBar({ profile, onOpenSearch }) {
  const qc = useQueryClient();
  const isFetching = useIsFetching();   // [v0.13/U1] >0 = มี query กำลังโหลด
  const p = usePrefs();                 // [#prefs] density / color-blind
  const [showSettings, setShowSettings] = useState(false);
  const [lastSeen, setLastSeen] = useState(
    () => localStorage.getItem(LAST_SEEN_KEY) || new Date(Date.now() - 24*3600*1000).toISOString()
  );

  // [v0.8] poll new orders every 60s
  const { data: newData } = useQuery({
    queryKey: ['newcount', lastSeen],
    queryFn: () => api.newcount(lastSeen),
    refetchInterval: 60_000,
    staleTime: 30_000
  });

  const newCount = newData?.count || 0;

  const refetchAll = () => { if (navigator.vibrate) navigator.vibrate(8); qc.invalidateQueries(); };
  const markAllSeen = () => {
    const now = new Date().toISOString();
    localStorage.setItem(LAST_SEEN_KEY, now);
    setLastSeen(now);
    refetchAll();
  };

  return (
    <header className="sticky top-0 z-20 bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🐔</span>
          <div>
            <div className="font-bold leading-tight">Sunrise Admin</div>
            <div className="text-xs text-slate-500 leading-tight">Dashboard</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onOpenSearch} className="btn btn-ghost p-2" aria-label="search">
            <Search size={18} />
          </button>
          <button onClick={markAllSeen} className="btn btn-ghost p-2 relative" aria-label="notifications" title={newCount ? `${newCount} ใหม่ — กดเพื่อ mark ว่าเห็นแล้ว` : 'ไม่มีออเดอร์ใหม่'}>
            <Bell size={18} />
            {newCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white animate-bounce">
                {newCount > 9 ? '9+' : newCount}
              </span>
            )}
          </button>
          <button onClick={refetchAll} className="btn btn-ghost p-2" aria-label="refresh" title="รีเฟรชข้อมูล">
            <RefreshCw size={18} className={isFetching ? 'animate-spin text-sunrise-500' : ''} />
          </button>

          {/* [#prefs] ตั้งค่าการแสดงผล */}
          <div className="relative">
            <button onClick={() => setShowSettings((s) => !s)} className="btn btn-ghost p-2" aria-label="settings" title="ตั้งค่าการแสดงผล">
              <Settings size={18} className={showSettings ? 'text-sunrise-500' : ''} />
            </button>
            {showSettings && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowSettings(false)} />
                <div className="absolute right-0 mt-1 z-40 w-56 bg-white rounded-xl shadow-lg border border-slate-200 p-2 text-sm">
                  <div className="px-2 py-1 text-[11px] font-semibold text-slate-400">การแสดงผล</div>
                  <button onClick={() => prefs.toggleDensity()}
                    className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-slate-50">
                    {p.density === 'compact' ? <Rows3 size={16} /> : <Rows2 size={16} />}
                    <span className="flex-1 text-left">ความหนาแน่น</span>
                    <span className="text-xs text-sunrise-600 font-medium">
                      {p.density === 'compact' ? 'กะทัดรัด' : 'สบายตา'}
                    </span>
                  </button>
                  <button onClick={() => prefs.toggleColorBlind()}
                    className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-slate-50">
                    <Eye size={16} />
                    <span className="flex-1 text-left">โหมดตาบอดสี</span>
                    <span className={'text-xs font-medium ' + (p.colorBlind ? 'text-green-600' : 'text-slate-400')}>
                      {p.colorBlind ? 'เปิด' : 'ปิด'}
                    </span>
                  </button>
                </div>
              </>
            )}
          </div>

          {profile?.pictureUrl && (
            <img src={profile.pictureUrl} alt="" className="w-8 h-8 rounded-full ml-1" />
          )}
        </div>
      </div>

      {/* [v0.8] new order preview banner */}
      {newCount > 0 && newData?.preview?.length > 0 && (
        <div className="bg-sunrise-50 border-t border-sunrise-100 px-4 py-2 text-xs text-sunrise-700 flex items-center justify-between">
          <span>🆕 ออเดอร์ใหม่ {newCount}: {newData.preview.join(', ')}{newData.preview.length < newCount ? '...' : ''}</span>
          <button onClick={markAllSeen} className="underline text-xs">เห็นแล้ว</button>
        </div>
      )}
    </header>
  );
}
