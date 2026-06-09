// [v0.1] Kanban — 4 columns: รอทำ / กำลังทำ / พร้อมส่ง / ส่งแล้ว
// Phase 1: read-only. Phase 2 จะมีปุ่ม "→ ขั้นถัดไป"
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../lib/api';
import OrderCard from '../components/OrderCard';
import OrderDetailModal from '../components/OrderDetailModal';
import AddOrderModal from '../components/AddOrderModal';
import { Plus } from 'lucide-react';

const columns = [
  { key: 'preparing', title: '🍰 กำลังทำ',  color: 'bg-amber-50',  match: (o) => /preparing|กำลังทำ|รอทำ/.test(o.status) || /รอทำ/.test(o.kitchenStatus) },
  { key: 'ready',     title: '✅ พร้อมส่ง', color: 'bg-blue-50',   match: (o) => /ready|พร้อมส่ง|รับงาน/.test(o.status) || /รับงาน/.test(o.kitchenStatus) },
  { key: 'enroute',   title: '🚗 ออกส่ง',   color: 'bg-indigo-50', match: (o) => /enroute|ออกส่ง/.test(o.status) },
  { key: 'done',      title: '🎉 ส่งแล้ว',  color: 'bg-green-50',  match: (o) => /completed|ส่งแล้ว|delivered/.test(o.status) || o.isPassed }
];

function todayISO() {
  // [v0.7] FIX timezone — use local date components
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${dd}`;
}

export default function Kanban() {
  const [date, setDate] = useState(todayISO());
  // [v0.5] modal state
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['orders', date],
    queryFn: () => api.orders({ date })
  });

  const orders = data?.orders || [];
  const buckets = columns.map(c => ({
    ...c,
    orders: orders.filter(c.match)
  }));
  // ออเดอร์ที่ตกทุก match → ใส่ default bucket แรก
  const unmatched = orders.filter(o => !columns.some(c => c.match(o)));
  if (unmatched.length) buckets[0].orders.push(...unmatched);

  return (
    <div className="space-y-4">
      {/* date picker */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
        />
        <button onClick={() => setDate(todayISO())} className="btn btn-ghost text-sm">วันนี้</button>
        <div className="text-sm text-slate-500">
          {isLoading ? '⏳' : `ทั้งหมด ${orders.length} ออเดอร์`}
        </div>
      </div>

      {error && <div className="card text-red-600">⚠️ {error.message}</div>}

      {/* 4 columns: mobile = 1 col, tablet = 2, desktop = 4 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {buckets.map((col) => (
          <div key={col.key} className={`rounded-xl ${col.color} p-3 min-h-[200px]`}>
            <div className="flex items-center justify-between mb-3">
              <div className="font-bold text-sm">{col.title}</div>
              <span className="badge bg-white text-slate-700">{col.orders.length}</span>
            </div>
            <div className="space-y-3">
              {col.orders.map((o) => (
                <OrderCard key={o.orderId} order={o} compact onClick={() => setSelectedOrder(o)} />
              ))}
              {col.orders.length === 0 && (
                <div className="text-xs text-slate-400 text-center py-4">— ว่าง —</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* [v0.5] Floating Add button */}
      <button
        onClick={() => setShowAdd(true)}
        className="fixed bottom-6 right-6 z-30 w-14 h-14 rounded-full bg-sunrise-500 text-white shadow-lg hover:bg-sunrise-600 flex items-center justify-center transition-transform hover:scale-110"
        aria-label="เพิ่มออเดอร์">
        <Plus size={28} />
      </button>

      {/* [v0.5] Modals */}
      {selectedOrder && (
        <OrderDetailModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />
      )}
      {showAdd && (
        <AddOrderModal onClose={() => setShowAdd(false)} />
      )}
    </div>
  );
}
