// [v0.1] App shell — Auth + Tab nav + pages
// [v0.8] Search + OrderDetail + CustomerProfile (global modals)
// [v0.9] Toast + deep link + audit tab
import { useState, useEffect, createContext, useContext } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './lib/auth';
import { api } from './lib/api';
import TopBar from './components/TopBar';
import TabNav from './components/TabNav';
import SearchModal from './components/SearchModal';
import OrderDetailModal from './components/OrderDetailModal';
import CustomerProfileModal from './components/CustomerProfileModal';
import ToastContainer from './components/ToastContainer';
import Kanban from './pages/Kanban';
import CalendarPage from './pages/Calendar';
import Production from './pages/Production';
import AuditLog from './pages/AuditLog';

const ModalCtx = createContext(null);
export const useModals = () => useContext(ModalCtx);

function AppInner() {
  const { loading, isAdmin, profile, error } = useAuth();
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
  useEffect(() => {
    if (!isAdmin) return;
    const params = new URLSearchParams(window.location.search);
    const oid = params.get('order');
    if (oid) {
      api.search(oid, 1).then((r) => {
        const o = (r.orders || []).find((x) => x.orderId === oid) || r.orders?.[0];
        if (o) setSelectedOrder(o);
      }).catch(() => {});
      // ล้าง param ออกจาก URL (ไม่ให้เปิดซ้ำตอน refetch)
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
            ติดต่อพี่หม่อนเพื่อขอสิทธิ์
          </div>
          {profile && (
            <div className="mt-4 text-xs text-slate-400 font-mono">
              {profile.userId.substring(0,8)}...{profile.userId.substring(28)}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <ModalCtx.Provider value={modals}>
      <div className="min-h-screen pb-20">
        <TopBar profile={profile} onOpenSearch={() => setShowSearch(true)} />
        <TabNav value={tab} onChange={setTab} />
        <main className="max-w-7xl mx-auto p-4">
          {tab === 'calendar'   && <CalendarPage />}
          {tab === 'kanban'     && <Kanban />}
          {tab === 'production' && <Production />}
          {tab === 'audit'      && <AuditLog />}
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
