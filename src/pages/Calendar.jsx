// [v0.2] Calendar Main Dashboard — month grid + summary + day detail
// [v0.8] เพิ่ม filter chips + bulk select + customer profile
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState, useRef } from 'react';
import { ChevronLeft, ChevronRight, TrendingUp, Package, DollarSign, AlertCircle } from 'lucide-react';
import { api } from '../lib/api';
import { useModals } from '../App';
import OrderCard from '../components/OrderCard';
import AddOrderModal from '../components/AddOrderModal';
import FilterChips, { ORDER_FILTERS, applyOrderFilters } from '../components/FilterChips';
import BulkActionBar from '../components/BulkActionBar';
import { SkeletonOrderCard, SkeletonStatCard } from '../components/Skeleton';
import { Plus } from 'lucide-react';

const dayHeaders = ['จ','อ','พ','พฤ','ศ','ส','อา'];
const monthNamesTH = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

// [v0.7] FIX timezone bug — เดิมใช้ toISOString() แปลงเป็น UTC ทำให้วันที่ลด 1
function fmtISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${dd}`;
}
// parse ISO "2026-06-10" → Date object ใน local timezone (ไม่ใช่ UTC)
function parseISO(iso) {
  const m = String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return new Date(NaN);
  return new Date(+m[1], +m[2]-1, +m[3]);
}
function addMonths(d, n) { const x = new Date(d); x.setMonth(x.getMonth()+n); return x; }

// คำนวณ matrix ของเดือน — start Monday
function getMonthMatrix(year, month) {
  const first = new Date(year, month, 1);
  const last  = new Date(year, month + 1, 0);
  // first.getDay(): 0=Sun, 1=Mon ... → offset เป็น Mon-start
  const startOffset = (first.getDay() + 6) % 7;
  const totalCells = Math.ceil((last.getDate() + startOffset) / 7) * 7;
  const cells = [];
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - startOffset + 1;
    const inMonth = dayNum >= 1 && dayNum <= last.getDate();
    const d = inMonth ? new Date(year, month, dayNum) : new Date(year, month, dayNum);
    cells.push({ date: d, inMonth, isoKey: fmtISO(d) });
  }
  return cells;
}

export default function CalendarPage() {
  const today = useMemo(() => new Date(), []);
  const [anchor, setAnchor] = useState(today);
  const [picked, setPicked] = useState(fmtISO(today));
  // [v0.5] modal state
  const [showAdd, setShowAdd] = useState(false);
  const modals = useModals();
  // [v0.6] auto-scroll ลง detail เมื่อเลือกวัน
  const detailRef = useRef(null);
  function pickDate(iso) {
    setPicked(iso);
    setTimeout(() => detailRef.current?.scrollIntoView({ behavior:'smooth', block:'start' }), 100);
  }
  // [v0.8] filter + bulk state
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

  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const cells = useMemo(() => getMonthMatrix(year, month), [year, month]);
  const first = cells[0].date;
  const last  = cells[cells.length - 1].date;

  // ดึงออเดอร์ทั้ง grid (Mon ของสัปดาห์แรก → Sun ของสัปดาห์สุดท้าย)
  const monthQ = useQuery({
    queryKey: ['orders-month', fmtISO(first), fmtISO(last)],
    queryFn: () => api.orders({ from: fmtISO(first), to: fmtISO(last) })
  });

  const dayQ = useQuery({
    queryKey: ['orders', picked],
    queryFn: () => api.orders({ date: picked })
  });

  // [v0.4] group by ISO date — โฟกัสที่ร้านไหน วันไหน (ไม่เอายอดเงิน mini-bar)
  const byDate = useMemo(() => {
    const m = {};
    (monthQ.data?.orders || []).forEach((o) => {
      const k = o.deliveryDateISO || '';
      if (!m[k]) m[k] = { count:0, urgent:0, pending:0, shops:[] };
      m[k].count++;
      if (o.isUrgent) m[k].urgent++;
      if ((o.paymentStatus || '').toLowerCase() !== 'paid') m[k].pending++;
      // เก็บชื่อร้านสั้นๆ (ตัด FB:/Line OA prefix ออก)
      const name = String(o.customerName||'').replace(/^(FB|Line OA)\s*[:\-]?\s*/i,'').trim();
      if (name && !m[k].shops.includes(name)) m[k].shops.push(name);
    });
    return m;
  }, [monthQ.data]);

  // KPI ของเดือน
  const monthStats = useMemo(() => {
    const orders = (monthQ.data?.orders || []).filter(o => {
      const d = parseISO(o.deliveryDateISO);
      return d.getFullYear() === year && d.getMonth() === month;
    });
    return {
      count: orders.length,
      shops: new Set(orders.map(o => o.customerName).filter(Boolean)).size,
      urgent: orders.filter(o => o.isUrgent).length,
      pending: orders.filter(o => (o.paymentStatus || '').toLowerCase() !== 'paid').length
    };
  }, [monthQ.data, year, month]);

  const todayKey = fmtISO(today);

  return (
    <div className="space-y-4">
      {/* [v0.4] KPI — โฟกัสที่ออเดอร์ที่ต้องทำ (ไม่เอายอดเงิน) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={<Package size={18}/>}     label="ออเดอร์เดือนนี้" value={monthStats.count}   color="text-sunrise-600 bg-sunrise-50" />
        <StatCard icon={<TrendingUp size={18}/>}  label="ร้าน"            value={monthStats.shops}   color="text-blue-600 bg-blue-50" />
        <StatCard icon={<AlertCircle size={18}/>} label="ด่วน"            value={monthStats.urgent}  color="text-red-600 bg-red-50" />
        <StatCard icon={<DollarSign size={18}/>}  label="ค้างชำระ"       value={monthStats.pending} color="text-amber-600 bg-amber-50" />
      </div>

      {/* ── Month nav ── */}
      <div className="card flex items-center justify-between">
        <button onClick={() => setAnchor(addMonths(anchor, -1))} className="btn btn-ghost p-2"><ChevronLeft size={20} /></button>
        <div className="text-center">
          <div className="font-bold text-lg">{monthNamesTH[month]} {year + 543}</div>
          {monthQ.isFetching && <div className="text-xs text-slate-400">⏳ โหลด...</div>}
        </div>
        <button onClick={() => setAnchor(addMonths(anchor, 1))} className="btn btn-ghost p-2"><ChevronRight size={20} /></button>
      </div>

      {/* ── Day headers ── */}
      <div className="grid grid-cols-7 gap-1 sm:gap-2 text-center text-xs font-medium text-slate-500">
        {dayHeaders.map((d) => <div key={d}>{d}</div>)}
      </div>

      {/* ── Month grid ── */}
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {cells.map((cell, i) => {
          const info = byDate[cell.isoKey];
          const isPicked = picked === cell.isoKey;
          const isToday = cell.isoKey === todayKey;
          const hasUrgent = info?.urgent > 0;

          return (
            <button
              key={i}
              onClick={() => pickDate(cell.isoKey)}
              className={
                'rounded-lg p-1.5 sm:p-2 text-left min-h-[75px] sm:min-h-[110px] transition-all border ' +
                (!cell.inMonth ? 'opacity-40 ' : '') +
                (isToday ? 'bg-sunrise-50 ' : 'bg-white ') +
                (isPicked ? 'ring-2 ring-sunrise-500 border-sunrise-500 ' : 'border-slate-200 hover:border-slate-300 ') +
                (hasUrgent ? 'border-red-300 ' : '')
              }>
              <div className="flex items-center justify-between">
                <span className={'text-xs sm:text-sm font-semibold ' + (isToday ? 'text-sunrise-600' : 'text-slate-700')}>
                  {cell.date.getDate()}
                </span>
                {hasUrgent && <span className="text-xs">🚨</span>}
              </div>
              {info && (
                <div className="mt-1 space-y-0.5">
                  {/* [v0.4] focus: จำนวนออเดอร์ + ชื่อร้าน */}
                  <div className="text-[10px] sm:text-xs font-bold text-sunrise-600">
                    {info.count} ออเดอร์
                  </div>
                  {/* show 1-2 ชื่อร้าน truncate */}
                  <div className="text-[9px] sm:text-[10px] text-slate-600 space-y-0.5">
                    {info.shops.slice(0, 2).map((s, i) => (
                      <div key={i} className="truncate leading-tight">• {s}</div>
                    ))}
                    {info.shops.length > 2 && (
                      <div className="text-slate-400 leading-tight">+{info.shops.length - 2} ร้าน</div>
                    )}
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* [v0.4] Legend สั้นๆ */}
      <div className="flex items-center gap-3 text-[10px] sm:text-xs text-slate-500 flex-wrap px-1">
        <div>🚨 = มีด่วน • เลขส้ม = จำนวน • ชื่อร้านใต้เลข • กดช่อง = ดูรายละเอียด</div>
      </div>

      {/* ── Day detail ── */}
      <div ref={detailRef} className="card scroll-mt-32">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <div className="font-bold">
              {parseISO(picked).toLocaleDateString('th-TH', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
            </div>
            {dayQ.data && (
              <div className="text-sm text-slate-500">
                {dayQ.data.count} ออเดอร์
                {dayQ.data.orders.length > 0 && ' • ฿' + dayQ.data.orders.reduce((s,o)=>s+o.grandTotal,0).toLocaleString()}
              </div>
            )}
          </div>
          <button onClick={() => setPicked(todayKey)} className="btn btn-ghost text-sm">↻ วันนี้</button>
        </div>

        {/* [v0.8] filter chips */}
        <div className="mb-3">
          <FilterChips chips={ORDER_FILTERS} active={filters} onToggle={toggleFilter} />
        </div>

        {dayQ.isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[1,2,3].map(i => <SkeletonOrderCard key={i} />)}
          </div>
        )}
        {dayQ.data?.orders.length === 0 && (
          <div className="text-center text-slate-400 py-8">— ไม่มีออเดอร์วันนี้ —</div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {applyOrderFilters(dayQ.data?.orders || [], filters).map((o) => (
            <OrderCard
              key={o.orderId}
              order={o}
              onClick={() => modals.openOrder(o)}
              selected={selectedIds.has(o.orderId)}
              onToggleSelect={toggleSelect}
              onCustomerClick={modals.openCustomer}
            />
          ))}
        </div>
        {dayQ.data?.orders?.length > 0 && applyOrderFilters(dayQ.data.orders, filters).length === 0 && (
          <div className="text-center text-slate-400 py-8 text-sm">— filter ทำให้ไม่เหลือออเดอร์ —</div>
        )}
      </div>

      {/* [v0.5] Floating Add button */}
      <button
        onClick={() => setShowAdd(true)}
        className="fixed bottom-6 right-6 z-30 w-14 h-14 rounded-full bg-sunrise-500 text-white shadow-lg hover:bg-sunrise-600 flex items-center justify-center transition-transform hover:scale-110"
        aria-label="เพิ่มออเดอร์">
        <Plus size={28} />
      </button>

      {/* [v0.8] Bulk action bar */}
      <BulkActionBar selectedIds={selectedIds} onClear={() => setSelectedIds(new Set())} />

      {/* AddOrder modal — เฉพาะตัวนี้ ไม่ใช่ global */}
      {showAdd && <AddOrderModal onClose={() => setShowAdd(false)} />}
    </div>
  );
}

function StatCard({ icon, label, value, color }) {
  return (
    <div className="card flex items-center gap-3">
      <div className={'p-2 rounded-lg ' + color}>{icon}</div>
      <div className="min-w-0">
        <div className="text-xs text-slate-500 truncate">{label}</div>
        <div className="font-bold text-lg leading-tight truncate">{value}</div>
      </div>
    </div>
  );
}

