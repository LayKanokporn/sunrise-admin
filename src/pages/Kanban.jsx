// [v0.1] Kanban — 4 columns: รอทำ / กำลังทำ / พร้อมส่ง / ส่งแล้ว
// [v0.8] filter chips + bulk select + customer profile + global modals
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../lib/api';
import { useModals } from '../App';
import OrderCard from '../components/OrderCard';
import InlineStatusBar from '../components/InlineStatusBar';
import AddOrderModal from '../components/AddOrderModal';
import FilterChips, { ORDER_FILTERS, applyOrderFilters } from '../components/FilterChips';
import BulkActionBar from '../components/BulkActionBar';
import { SkeletonOrderCard } from '../components/Skeleton';
import { Plus } from 'lucide-react';

const columns = [
  { key: 'preparing', title: '🍰 กำลังทำ',  color: 'bg-amber-50',  match: (o) => /preparing|กำลังทำ|รอทำ/.test(o.status) || /รอทำ/.test(o.kitchenStatus) },
  { key: 'ready',     title: '✅ พร้อมส่ง', color: 'bg-blue-50',   match: (o) => /ready|พร้อมส่ง|รับงาน/.test(o.status) || /รับงาน/.test(o.kitchenStatus) },
  { key: 'enroute',   title: '🚗 ออกส่ง',   color: 'bg-indigo-50', match: (o) => /enroute|ออกส่ง/.test(o.status) },
  { key: 'done',      title: '🎉 ส่งแล้ว',  color: 'bg-green-50',  match: (o) => /completed|ส่งแล้ว|delivered/.test(o.status) || o.isPassed }
];

function isoOffset(days) {
  // [v0.7] local date components
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
const todayISO = () => isoOffset(0);

export default function Kanban() {
  const [date, setDate] = useState(todayISO());
  const [showAdd, setShowAdd] = useState(false);
  const modals = useModals();
  // [v0.8] filter + bulk
  const [filters, setFilters] = useState(() => new Set());
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const toggleFilter = (key) => setFilters(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });
  const toggleSelect = (id) => setSelectedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['orders', date],
    queryFn: () => api.orders({ date })
  });

  const orders = applyOrderFilters(data?.orders || [], filters);
  const buckets = columns.map(c => ({
    ...c,
    orders: orders.filter(c.match)
  }));
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
        {/* [v0.13/U3] ปุ่มลัดวัน */}
        <div className="flex gap-1">
          {[['เมื่อวาน',-1],['วันนี้',0],['พรุ่งนี้',1]].map(([label,off]) => {
            const iso = isoOffset(off);
            return (
              <button key={label} onClick={() => setDate(iso)}
                className={'btn text-sm ' + (date === iso ? 'btn-primary' : 'btn-ghost border border-slate-200')}>
                {label}
              </button>
            );
          })}
        </div>
        <div className="text-sm text-slate-500">
          {isLoading ? '⏳' : `${orders.length} ออเดอร์` + (filters.size ? ` (filter ${filters.size})` : '')}
        </div>
      </div>

      {/* [v0.8] filter chips */}
      <FilterChips chips={ORDER_FILTERS} active={filters} onToggle={toggleFilter} />

      {error && <div className="card text-red-600">⚠️ {error.message}</div>}

      {/* 4 columns */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {buckets.map((col) => (
          <div key={col.key} className={`rounded-xl ${col.color} p-3 min-h-[200px]`}>
            <div className="flex items-center justify-between mb-3">
              <div className="font-bold text-sm">{col.title}</div>
              <span className="badge bg-white text-slate-700">{col.orders.length}</span>
            </div>
            <div className="space-y-3">
              {isLoading && [1,2].map(i => <SkeletonOrderCard key={'sk'+i} />)}
              {col.orders.map((o) => (
                <div key={o.orderId}>
                  <OrderCard
                    order={o}
                    compact
                    showInlineActions={false}
                    onClick={() => modals.openOrder(o)}
                    selected={selectedIds.has(o.orderId)}
                    onToggleSelect={toggleSelect}
                    onCustomerClick={modals.openCustomer}
                  />
                  {/* [inline status] กดเลื่อนสถานะบนการ์ดเลย */}
                  <InlineStatusBar order={o} />
                </div>
              ))}
              {!isLoading && col.orders.length === 0 && (
                <div className="text-xs text-slate-400 text-center py-4">🌤️ ยังว่าง</div>
              )}
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={() => setShowAdd(true)}
        className="fixed bottom-6 right-6 z-30 w-14 h-14 rounded-full bg-sunrise-500 text-white shadow-lg hover:bg-sunrise-600 flex items-center justify-center transition-transform hover:scale-110"
        aria-label="เพิ่มออเดอร์">
        <Plus size={28} />
      </button>

      <BulkActionBar selectedIds={selectedIds} onClear={() => setSelectedIds(new Set())} />

      {showAdd && <AddOrderModal onClose={() => setShowAdd(false)} />}
    </div>
  );
}
