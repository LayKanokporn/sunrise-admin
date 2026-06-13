// [v0.1] App shell — Auth + Tab nav + pages
// [v0.8] Search + OrderDetail + CustomerProfile (global modals)
// [v0.9] Toast + deep link + audit tab
import { useState, useEffect, createContext, useContext, lazy, Suspense } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './lib/auth';
import { api } from './lib/api';
import TopBar from './components/TopBar';
import TabNav from './components/TabNav';
import SearchModal from './components/SearchModal';
import OrderDetailModal from './components/OrderDetailModal';
import CustomerProfileModal from './components/CustomerProfileModal';
import ToastContainer from './components/ToastContainer';
import OfflineBanner from './components/OfflineBanner';
import { usePullToRefresh } from './lib/usePullToRefresh';
import { usePrefs } from './lib/prefs';
// [v0.13/S1] ปฏิทินเป็นหน้าแรก → โหลด static / แท็บที่เหลือ lazy (โหลดเมื่อกดเข้า)
//   ลด JS bundle แรกที่ต้อง parse ตอนเปิดเว็บ
import CalendarPage from './pages/Calendar';
const Kanban     = lazy(() => import('./pages/Kanban'));
const Timeline   = lazy(() => import('./pages/Timeline'));
const Production = lazy(() => import('./pages/Production'));
const AuditLog   = lazy(() => import('./pages/AuditLog'));

const ModalCtx = createContext(null);
export const useModals = () => useContext(ModalCtx);

// [v0.11/W3] ตัวบอกสถานะ pull-to-refresh (มือถือ: ลากลงจากบนสุด)
function PullIndicator() {
  const { pull, refreshing, threshold } = usePullToRefresh();
  if (!pull && !refreshing) return null;
  const ready = pull >= threshold;
  return (
    <div className="fixed top-0 inset-x-0 z-[90] flex justify-center pointer-events-none"
         style={{ transform: `translateY(${refreshing ? 12 : Math.max(pull - 30, 0)}px)`, transition: refreshing ? 'transform .2s' : 'none' }}>
      <div className={`rounded-full shadow px-4 py-2 text-xs font-semibold bg-white ${ready || refreshing ? 'text-orange-600' : 'text-slate-400'}`}>
        {refreshing ? 'กำลังอัปเดต...' : ready ? 'ปล่อยเพื่ออัปเดต' : 'ลากลงเพื่ออัปเดต'}
      </div>
    </div>
  );
}

function AppInner() {
  const { loading, isAdmin, profile, error } = useAuth();
  const prefs = usePrefs();
  const qc = useQueryClient();
  const [tab, setTab] = useState('calendar');
  const [showSearch, setShowSearch] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  const modals = {
    openOrder: (o) => setSelectedOrder(o),
    openCustomer: (name) => setSelectedCustomer(name),
    openSearch: () => setShowSearch(true)
  };

  // [Deep link] ?order=ORD-... → เปิด modal ใบนั้นทันที
  // [Deep link] ?month=YYYY-MM → ไปแท็บ Calendar ของเดือนนั้น
  // [Deep link] ?tab=kanban|production|audit|calendar → สลับแท็บ
  useEffect(() => {
    if (!isAdmin) return;
    const params = new URLSearchParams(window.location.search);

    const reqTab = params.get('tab');
    if (reqTab && ['calendar','kanban','timeline','production','audit'].includes(reqTab)) {
      setTab(reqTab);
    }

    const month = params.get('month');
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      setTab('calendar');
      try { sessionStorage.setItem('sunrise_deeplink_month', month); } catch(_) {}
    }

    const oid = params.get('order');
    if (oid) {
      api.search(oid, 1).then((r) => {
        const o = (r.orders || []).find((x) => x.orderId === oid) || r.orders?.[0];
        if (o) setSelectedOrder(o);
      }).catch(() => {});
    }

    if (oid || month || reqTab) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [isAdmin]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        <div className="text-center">
          <div className="text-2xl mb-2">🐔</div>
          <div>กำลังโหลด...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="card max-w-md text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <div className="font-bold text-lg text-red-600 mb-2">เกิดข้อผิดพลาด</div>
          <div className="text-sm text-slate-600 mb-4">{error}</div>
          <button onClick={() => location.reload()} className="btn btn-primary">ลองใหม่</button>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="card max-w-md text-center">
          <div className="text-4xl mb-3">🔒</div>
          <div className="font-bold text-lg mb-2">ไม่มีสิทธิ์เข้าใช้งาน</div>
          <div className="text-sm text-slate-600">
            ระบบนี้สำหรับแอดมินเท่านั้น<br/>
            ส่ง User ID ด้านล่างให้พี่หม่อนเพื่อขอสิทธิ์
          </div>
          {profile && (
            <div className="mt-4">
              <div className="text-xs text-slate-400 mb-1">User ID ของคุณ (33 ตัว)</div>
              {/* แสดงเต็ม + กดเพื่อ copy */}
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(profile.userId);
                  alert('คัดลอก User ID แล้ว:\n' + profile.userId);
                }}
                className="w-full bg-slate-100 hover:bg-slate-200 rounded-lg p-3 font-mono text-xs break-all text-slate-700 transition-colors">
                {profile.userId}
                <div className="text-[10px] text-sunrise-600 mt-1">📋 แตะเพื่อคัดลอก</div>
              </button>
              <div className="text-[10px] text-slate-400 mt-2">
                ความยาว: {profile.userId.length} ตัว
                {profile.userId.length !== 33 && ' ⚠️ ควรเป็น 33'}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <ModalCtx.Provider value={modals}>
      <div className="min-h-screen pb-20" data-density={prefs.density} data-cb={prefs.colorBlind ? '1' : '0'}>
        <OfflineBanner />
        <PullIndicator />
        <TopBar profile={profile} onOpenSearch={() => setShowSearch(true)} />
        <TabNav value={tab} onChange={setTab} />
        {/* [#split] เมื่อมี order panel ค้างขวา (lg) → เว้นที่ไม่ให้ทับลิสต์ */}
        <main className={'max-w-7xl mx-auto p-4 transition-[padding] ' + (selectedOrder ? 'lg:pr-[440px]' : '')}>
          {tab === 'calendar' && <CalendarPage />}
          {tab !== 'calendar' && (
            <Suspense fallback={<div className="text-center text-slate-400 py-12">กำลังโหลด...</div>}>
              {tab === 'kanban'     && <Kanban />}
              {tab === 'timeline'   && <Timeline />}
              {tab === 'production' && <Production />}
              {tab === 'audit'      && <AuditLog />}
            </Suspense>
          )}
        </main>

        {showSearch && (
          <SearchModal onClose={() => setShowSearch(false)} onPickOrder={(o) => setSelectedOrder(o)} />
        )}
        {selectedOrder && (
          <OrderDetailModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />
        )}
        {selectedCustomer && (
          <CustomerProfileModal
            customerName={selectedCustomer}
            onClose={() => setSelectedCustomer(null)}
            onPickOrder={(o) => setSelectedOrder(o)}
          />
        )}

        {/* [v0.9] global toast */}
        <ToastContainer />
      </div>
    </ModalCtx.Provider>
  );
}

export default function App() {
  return <AuthProvider><AppInner /></AuthProvider>;
}
