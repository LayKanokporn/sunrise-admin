// [v0.2] Calendar Main Dashboard — month grid + summary + day detail
// [v0.8] เพิ่ม filter chips + bulk select + customer profile
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, TrendingUp, Package, DollarSign, AlertCircle, Megaphone } from 'lucide-react';
import { api } from '../lib/api';
import { toast } from '../lib/toast';
import { useModals } from '../App';
import OrderCard from '../components/OrderCard';
import AddOrderModal from '../components/AddOrderModal';
import FilterChips, { ORDER_FILTERS, applyOrderFilters } from '../components/FilterChips';
import { usePrefs, sortPinned } from '../lib/prefs';
import BulkActionBar from '../components/BulkActionBar';
import { SkeletonOrderCard, SkeletonStatCard } from '../components/Skeleton';
import { Plus } from 'lucide-react';

const dayHeaders = ['จ','อ','พ','พฤ','ศ','ส','อา'];
const monthNamesTH = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

// ISO week number (Mon-based)
function getISOWeek(date) {
  const d = new Date(date); d.setHours(0,0,0,0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const w1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - w1) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7);
}
// heat shading: เข้มตามจำนวนออเดอร์ต่อวัน
function heatBg(count, max) {
  if (!count || !max) return '';
  const r = count / max;
  if (r > 0.75) return 'bg-orange-100';
  if (r > 0.4)  return 'bg-orange-50';
  return 'bg-amber-50/50';
}

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
  // [v0.10] รับ deep link ?month=YYYY-MM
  //   อ่าน URL ตรง ๆ ก่อน (Calendar mount ก่อน App effect เขียน sessionStorage)
  //   sessionStorage เป็น fallback กรณีสลับแท็บแล้วกลับมา
  const initialAnchor = useMemo(() => {
    try {
      const fromUrl = new URLSearchParams(window.location.search).get('month');
      const m = (fromUrl && /^\d{4}-\d{2}$/.test(fromUrl))
        ? fromUrl
        : sessionStorage.getItem('sunrise_deeplink_month');
      if (m && /^\d{4}-\d{2}$/.test(m)) {
        sessionStorage.removeItem('sunrise_deeplink_month');
        const [y, mo] = m.split('-');
        return new Date(+y, +mo - 1, 1);
      }
    } catch(_) {}
    return new Date();
  }, []);
  const [anchor, setAnchor] = useState(initialAnchor);
  const [picked, setPicked] = useState(fmtISO(today));
  // [v0.5] modal state — false=ปิด | null=เปิดไม่ pre-fill | 'YYYY-MM-DD'=เปิด+pre-fill
  const [addWithDate, setAddWithDate] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  // [M3] month/year picker popover บน header
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const modals = useModals();
  // [v0.6] auto-scroll ลง detail เมื่อเลือกวัน (เฉพาะจอใหญ่)
  const detailRef = useRef(null);
  function pickDate(iso) {
    setPicked(iso);
    if (window.matchMedia('(max-width: 639px)').matches) {
      setSheetOpen(true);
    } else if (!window.matchMedia('(min-width: 1024px)').matches) {
      // sm-lg: scroll ลงหา detail (ยังไม่ split-screen)
      setTimeout(() => detailRef.current?.scrollIntoView({ behavior:'smooth', block:'start' }), 100);
    }
    // lg+: detail อยู่ข้างๆ — ไม่ต้อง scroll
  }
  // [v0.13] ประกาศรายการของวันที่เลือกเข้ากลุ่ม LINE
  const [announcing, setAnnouncing] = useState(false);
  async function announceDay() {
    if (!confirm('ประกาศรายการส่งของวันนี้เข้ากลุ่ม LINE?')) return;
    if (navigator.vibrate) navigator.vibrate(12);
    setAnnouncing(true);
    try {
      const r = await api.announceDay(picked);
      if (r.ok === false) throw new Error(r.error || 'failed');
      toast.success('ประกาศเข้ากลุ่มแล้ว' + (r.count ? ' (' + r.count + ' ออเดอร์)' : ''));
    } catch(e) {
      toast.error('ประกาศไม่สำเร็จ: ' + e.message);
    } finally { setAnnouncing(false); }
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

  // [#longpress] กดค้างที่วัน → popover ดูลิสต์ออเดอร์ ไม่ต้องเปิด sheet เต็มจอ
  const [preview, setPreview] = useState(null); // { iso, x, y } | null
  const lpTimer = useRef(null);
  const lpFired = useRef(false);
  const startLongPress = (iso, e) => {
    lpFired.current = false;
    const pt = e.touches?.[0] || e;
    const x = pt.clientX, y = pt.clientY;
    lpTimer.current = setTimeout(() => {
      lpFired.current = true;
      if (navigator.vibrate) navigator.vibrate(12);
      setPreview({ iso, x, y });
    }, 420);
  };
  const cancelLongPress = () => { if (lpTimer.current) { clearTimeout(lpTimer.current); lpTimer.current = null; } };

  // [#swipe] ปัดซ้าย-ขวาบนกริดเดือน = เปลี่ยนเดือน (มือถือ) — กันชน scroll แนวตั้ง
  const touchRef = useRef(null);
  const gridTouchStart = (e) => { const t = e.touches[0]; touchRef.current = { x:t.clientX, y:t.clientY }; };
  const gridTouchEnd = (e) => {
    const s = touchRef.current; if (!s) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      setAnchor((a) => addMonths(a, dx < 0 ? 1 : -1));
      if (navigator.vibrate) navigator.vibrate(8);
    }
    touchRef.current = null;
  };

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

  // [v0.13/P1] วันที่เลือกดึงจาก monthQ ตรง ๆ (ออเดอร์อยู่ในกริดอยู่แล้ว ไม่ต้องยิง network ซ้ำ)
  //   → กดวันแล้ว bottom sheet เด้งทันที ไม่รอโหลด
  const dayQ = useMemo(() => {
    const orders = (monthQ.data?.orders || []).filter((o) => o.deliveryDateISO === picked);
    return {
      data: monthQ.data ? { count: orders.length, orders } : undefined,
      isLoading: monthQ.isLoading
    };
  }, [monthQ.data, monthQ.isLoading, picked]);

  // [v0.4] group by ISO date — เก็บ orders จริงเพื่อแสดง mini card ใน grid
  const byDate = useMemo(() => {
    const m = {};
    (monthQ.data?.orders || []).forEach((o) => {
      const k = o.deliveryDateISO || '';
      if (!m[k]) m[k] = { count:0, urgent:0, pending:0, orders:[] };
      m[k].count++;
      if (o.isUrgent) m[k].urgent++;
      if ((o.paymentStatus || '').toLowerCase() !== 'paid') m[k].pending++;
      m[k].orders.push(o);
    });
    return m;
  }, [monthQ.data]);

  // KPI ของเดือน
  const todayKey = fmtISO(today);
  const tomorrowKey = useMemo(() => {
    const d = new Date(today); d.setDate(d.getDate() + 1); return fmtISO(d);
  }, [today]);

  const p = usePrefs(); // [#pin] re-render เมื่อปัก/ปลดหมุด → จัดเรียงใหม่ทันที + [#goal] salesGoal

  const monthStats = useMemo(() => {
    const all = (monthQ.data?.orders || []);
    const orders = all.filter(o => {
      const d = parseISO(o.deliveryDateISO);
      return d.getFullYear() === year && d.getMonth() === month;
    });
    const validOrders = orders.filter(o => o.status !== '❌ ยกเลิก');

    // 7 วันล่าสุด vs 7 วันก่อนหน้า (week comparison)
    const last7 = [], prev7 = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i); last7.push(fmtISO(d));
    }
    for (let i = 13; i >= 7; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i); prev7.push(fmtISO(d));
    }

    const dayCount = (keys, predFn = () => true) => keys.map(k =>
      all.filter(o => o.deliveryDateISO === k && predFn(o)).length
    );

    const sparkOrders  = dayCount(last7);
    const sparkUrgent  = dayCount(last7, o => o.isUrgent);
    const sparkPending = dayCount(last7, o => (o.paymentStatus || '').toLowerCase() !== 'paid');

    const sumArr = (arr) => arr.reduce((s, x) => s + x, 0);
    const thisWeek = sumArr(sparkOrders);
    const prevWeek = sumArr(dayCount(prev7));
    const weekDelta = prevWeek === 0 ? null : Math.round((thisWeek - prevWeek) / prevWeek * 100);

    const pending = orders.filter(o => (o.paymentStatus || '').toLowerCase() !== 'paid').length;
    const count   = orders.length;

    // [AOV] ยอดขายรวม / AOV ของเดือน (ไม่รวมออเดอร์ที่ยกเลิก)
    const revenue = sumArr(validOrders.map(o => o.grandTotal || 0));
    const aov = validOrders.length > 0 ? Math.round(revenue / validOrders.length) : 0;

    // [Channel] LINE vs FB
    const lineCount = validOrders.filter(o => (o.channel || '').toUpperCase() === 'LINE').length;
    const fbCount   = validOrders.filter(o => (o.channel || '').toUpperCase() === 'FB').length;

    // [Pacing] เป้าเดือน vs เวลาผ่าน — เฉพาะเดือนปัจจุบัน (เดือนอื่นไม่มีความหมาย)
    let pacing = null;
    if (p.salesGoal > 0 && year === today.getFullYear() && month === today.getMonth()) {
      const dayOfMonth = today.getDate();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const timeElapsedPct = Math.round((dayOfMonth / daysInMonth) * 100);
      const goalProgressPct = Math.round((revenue / p.salesGoal) * 100);
      const projectedClose = Math.round((revenue / dayOfMonth) * daysInMonth);
      pacing = {
        timeElapsedPct, goalProgressPct, projectedClose,
        isBehind: goalProgressPct < timeElapsedPct
      };
    }

    return {
      count, urgent: orders.filter(o => o.isUrgent).length, pending,
      tomorrow: all.filter(o => o.deliveryDateISO === tomorrowKey).length,
      sparkOrders, sparkUrgent, sparkPending,
      weekDelta, revenue, aov, lineCount, fbCount, pacing
    };
  }, [monthQ.data, year, month, tomorrowKey, p.salesGoal]);

  // maxDayCount สำหรับ heat shading
  const maxDayCount = useMemo(() =>
    Math.max(1, ...Object.values(byDate).map(d => d.count))
  , [byDate]);

  // แบ่ง cells เป็นแถว 7 วัน สำหรับเลขสัปดาห์
  const calRows = useMemo(() => {
    const rows = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [cells]);

  // [E2] keyboard nav: ←→ เปลี่ยนเดือน, Esc ปิด panel/sheet
  useEffect(() => {
    function onKey(e) {
      if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
      if (e.key === 'ArrowLeft')  setAnchor(a => addMonths(a, -1));
      if (e.key === 'ArrowRight') setAnchor(a => addMonths(a, 1));
      if (e.key === 'Escape')     setSheetOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="space-y-4">
      {/* [v0.4] KPI — โฟกัสที่ออเดอร์ที่ต้องทำ (ไม่เอายอดเงิน) */}
      {/* [v0.12/M1] มือถือ: 4 ใบแถวเดียวแบบ compact — เห็นปฏิทินทันทีไม่ต้อง scroll */}
      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        <StatCard icon={<Package size={18}/>}     label="ออเดอร์"  value={monthStats.count}   color="text-sunrise-600 bg-sunrise-50"
          spark={monthStats.sparkOrders}  delta={monthStats.weekDelta}
          onClick={() => pickDate(todayKey)} />
        <StatCard icon={<TrendingUp size={18}/>}  label="พรุ่งนี้" value={monthStats.tomorrow} color="text-blue-600 bg-blue-50"
          onClick={() => pickDate(tomorrowKey)} />
        <StatCard icon={<AlertCircle size={18}/>} label="ด่วน"     value={monthStats.urgent}  color="text-red-600 bg-red-50"
          spark={monthStats.sparkUrgent}  active={filters.has('urgent')}
          onClick={() => toggleFilter('urgent')} />
        <StatCard icon={<DollarSign size={18}/>}  label="ค้างชำระ" value={monthStats.pending} color="text-amber-600 bg-amber-50"
          spark={monthStats.sparkPending} active={filters.has('pending')}
          progress={{ value: monthStats.pending, total: monthStats.count }}
          onClick={() => toggleFilter('pending')} />
      </div>

      {/* [#kpi] insight ยอดขาย (AOV/เป้า/ช่องทาง/กราฟ/ช่วงวันที่) ย้ายไปหน้า "KPI" แล้ว */}

      {/* [W4] split layout: ปฏิทินซ้าย + รายการวันขวา บน lg+ */}
      <div className="lg:flex lg:gap-6 lg:items-start">
      <div className="flex-1 min-w-0 space-y-4">

      {/* ── Month nav ── [v0.12/M4] sticky — เปลี่ยนเดือนได้ตลอดเวลา scroll */}
      <div className="card flex items-center justify-between sticky top-[57px] sm:top-[106px] z-20 shadow-sm">
        <button onClick={() => setAnchor(addMonths(anchor, -1))} className="btn btn-ghost p-2"><ChevronLeft size={20} /></button>
        <div className="text-center relative">
          {/* [M3] กดชื่อเดือน → month picker */}
          <button
            onClick={() => setShowMonthPicker(v => !v)}
            className="font-bold text-lg hover:text-sunrise-600 transition-colors">
            {monthNamesTH[month]} {year + 543}
          </button>
          {monthQ.isFetching && <div className="text-xs text-slate-400">⏳ โหลด...</div>}
          {showMonthPicker && (
            <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-40 bg-white rounded-xl shadow-2xl border border-slate-200 p-3 w-56"
                 onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-2">
                <button onClick={() => setAnchor(new Date(year-1, month, 1))} className="btn btn-ghost p-1"><ChevronLeft size={14}/></button>
                <span className="font-bold text-sm">{year + 543}</span>
                <button onClick={() => setAnchor(new Date(year+1, month, 1))} className="btn btn-ghost p-1"><ChevronRight size={14}/></button>
              </div>
              <div className="grid grid-cols-3 gap-1">
                {monthNamesTH.map((m, i) => (
                  <button key={i}
                    onClick={() => { setAnchor(new Date(year, i, 1)); setShowMonthPicker(false); }}
                    className={'text-xs py-1.5 rounded-lg font-medium transition-colors ' +
                      (i === month ? 'bg-sunrise-500 text-white' : 'hover:bg-slate-100 text-slate-700')}>
                    {m.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <button onClick={() => setAnchor(addMonths(anchor, 1))} className="btn btn-ghost p-2"><ChevronRight size={20} /></button>
      </div>

      {/* ── Summary bar ── สรุปจำนวนออเดอร์แยกตามสถานะ */}
      {monthQ.data && (() => {
        const all = (monthQ.data.orders || []).filter(o => {
          const d = parseISO(o.deliveryDateISO);
          return d.getFullYear() === year && d.getMonth() === month;
        });
        const active = all.filter(o => o.status !== '❌ ยกเลิก');
        const urgent = active.filter(o => o.isUrgent).length;
        const paid = active.filter(o => (o.paymentStatus||'').toLowerCase() === 'paid').length;
        const pending = active.filter(o => (o.paymentStatus||'').toLowerCase() !== 'paid').length;
        const cancelled = all.length - active.length;
        const completed = active.filter(o => o.status === '✅ ส่งแล้ว').length;
        return (
          <div className="card !py-2 !px-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="font-semibold text-slate-700">รวม {active.length} ออเดอร์</span>
            <span className="text-slate-300">|</span>
            {urgent > 0 && <span className="text-red-600 font-medium">🚨 {urgent} ด่วน</span>}
            {completed > 0 && <span className="text-emerald-600 font-medium">✅ {completed} ส่งแล้ว</span>}
            {paid > 0 && <span className="text-green-600 font-medium">💰 {paid} ชำระแล้ว</span>}
            {pending > 0 && <span className="text-amber-600 font-medium">⏳ {pending} ค้างชำระ</span>}
            {cancelled > 0 && <span className="text-slate-400">❌ {cancelled} ยกเลิก</span>}
          </div>
        );
      })()}

      {/* ── Day headers ── */}
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5 text-center text-xs font-medium text-slate-500">
        {dayHeaders.map((d) => <div key={d} className="py-1">{d}</div>)}
      </div>

      {/* ── Month grid ── CONT-style: mini order cards inside each cell */}
      <div
        className="grid grid-cols-7 gap-1 sm:gap-1.5"
        style={{ gridAutoRows: 'minmax(80px, auto)' }}
        onTouchStart={gridTouchStart} onTouchEnd={gridTouchEnd}>
        {calRows.map((row, wi) =>
          row.map((cell, ci) => {
            const info = byDate[cell.isoKey];
            const isPicked = picked === cell.isoKey;
            const isToday = cell.isoKey === todayKey;
            const isPast  = cell.inMonth && cell.isoKey < todayKey;
            const hasUrgent  = info?.urgent > 0;
            const isEmpty = !info && cell.inMonth;
            return (
              <button
                key={`${wi}-${ci}`}
                onClick={() => {
                  if (lpFired.current) { lpFired.current = false; return; }
                  if (isEmpty) { setAddWithDate(cell.isoKey); }
                  else { pickDate(cell.isoKey); }
                }}
                onPointerDown={(e) => startLongPress(cell.isoKey, e)}
                onPointerUp={cancelLongPress}
                onPointerLeave={cancelLongPress}
                onPointerMove={cancelLongPress}
                className={
                  'rounded-lg p-1.5 sm:p-2 text-left overflow-hidden transition-all border w-full flex flex-col ' +
                  (!cell.inMonth ? 'opacity-20 pointer-events-none ' :
                    isPast ? 'opacity-60 ' : '') +
                  (isToday ? 'bg-sunrise-50/50 ' : 'bg-white ') +
                  (isPicked ? 'ring-2 ring-sunrise-500 border-sunrise-500 ' : 'border-slate-200 hover:border-slate-300 ') +
                  (hasUrgent ? 'border-red-300 ' : '')
                }>
                {/* วันที่ */}
                <div className="flex items-center justify-between mb-1">
                  <span className={'text-xs sm:text-sm font-semibold ' +
                    (isToday ? 'text-sunrise-600' : isPast ? 'text-slate-400' : 'text-slate-700')}>
                    {cell.date.getDate()}
                  </span>
                  {info && (
                    <span className="text-[9px] sm:text-[10px] text-slate-400 font-medium">{info.count}</span>
                  )}
                </div>
                {/* mini order cards */}
                {info && (
                  <div className="flex-1 space-y-0.5 overflow-hidden">
                    {/* มือถือ: แสดง badge จำนวน */}
                    <div className="sm:hidden flex justify-center">
                      <span className={'inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full text-[10px] font-bold ' +
                        (hasUrgent ? 'bg-red-100 text-red-600' :
                         info.pending > 0 ? 'bg-amber-100 text-amber-700' :
                                            'bg-emerald-100 text-emerald-600')}>
                        {info.count}
                      </span>
                    </div>
                    {/* desktop: mini cards with left border */}
                    <div className="hidden sm:block space-y-0.5">
                      {info.orders.slice(0, 4).map((o) => {
                        const borderColor = o.isUrgent ? 'border-l-red-500' :
                          o.status === '✅ ส่งแล้ว' ? 'border-l-emerald-500' :
                          o.status === '❌ ยกเลิก' ? 'border-l-slate-300' :
                          (o.paymentStatus||'').toLowerCase() === 'paid' ? 'border-l-green-400' :
                          'border-l-amber-400';
                        const name = String(o.customerName||'').replace(/^(FB|Line OA)\s*[:\-]?\s*/i,'').trim();
                        return (
                          <div key={o.orderId}
                            className={'border-l-[3px] pl-1.5 pr-0.5 py-0.5 rounded-r bg-slate-50/80 text-[10px] leading-tight truncate ' + borderColor}>
                            <span className="text-slate-400 mr-1">{o.deliveryTime || ''}</span>
                            <span className="text-slate-700">{name || o.orderId}</span>
                          </div>
                        );
                      })}
                      {info.orders.length > 4 && (
                        <div className="text-[9px] text-slate-400 pl-2">+{info.orders.length - 4} อีก</div>
                      )}
                    </div>
                  </div>
                )}
                {isEmpty && !isPast && (
                  <div className="hidden sm:flex flex-1 items-center justify-center text-slate-200 text-lg">+</div>
                )}
              </button>
            );
          })
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 text-[10px] sm:text-xs text-slate-500 flex-wrap px-1">
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-red-500 rounded"/> ด่วน</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-amber-400 rounded"/> ค้างชำระ</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-green-400 rounded"/> ชำระแล้ว</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-emerald-500 rounded"/> ส่งแล้ว</span>
        <span className="hidden sm:inline text-slate-400">• กดช่องว่าง = เพิ่มออเดอร์</span>
      </div>
      </div>{/* end LEFT column */}

      {/* RIGHT column: day detail — sm+ only, sticky บน lg+ */}
      <div ref={detailRef} className="hidden sm:block lg:w-[400px] lg:shrink-0 lg:sticky lg:top-[106px] lg:self-start lg:max-h-[calc(100vh-120px)] lg:overflow-y-auto card scroll-mt-32">
        {/* [#sticky] หัววันที่เกาะบนตอนเลื่อนดูลิสต์ยาว */}
        <div className="sticky top-0 z-10 bg-white -mx-4 px-4 pt-1 pb-3 mb-3 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
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
          <div className="flex items-center gap-1">
            <button onClick={announceDay} disabled={announcing || !dayQ.data?.orders?.length}
              className="btn bg-sky-500 text-white text-sm px-3 flex items-center gap-1 disabled:opacity-40">
              <Megaphone size={14} /> ประกาศเข้ากลุ่ม
            </button>
            <button onClick={() => setPicked(todayKey)} className="btn btn-ghost text-sm">↻ วันนี้</button>
          </div>
        </div>

        <div className="mb-3">
          <FilterChips chips={ORDER_FILTERS} active={filters} onToggle={toggleFilter} />
        </div>

        {dayQ.isLoading && (
          <div className="grid grid-cols-1 gap-3">
            {[1,2,3].map(i => <SkeletonOrderCard key={i} />)}
          </div>
        )}
        {dayQ.data?.orders.length === 0 && (
          <div className="text-center text-slate-400 py-8">— ไม่มีออเดอร์วันนี้ —</div>
        )}

        <div className="grid grid-cols-1 gap-3">
          {sortPinned(applyOrderFilters(dayQ.data?.orders || [], filters)).map((o) => (
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
      </div>{/* end split layout */}

      {/* [C3] ปุ่มวันนี้ลอย — แสดงเมื่อ anchor ไม่ใช่เดือนปัจจุบัน */}
      {(anchor.getFullYear() !== today.getFullYear() || anchor.getMonth() !== today.getMonth()) && (
        <button
          onClick={() => { setAnchor(new Date()); pickDate(todayKey); }}
          className="fixed bottom-36 sm:bottom-20 right-4 sm:right-24 z-30 px-3 py-2 rounded-full bg-white border border-slate-300 shadow-md text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-1">
          ↻ วันนี้
        </button>
      )}

      {/* [v0.12/M3] มือถือ: day detail เป็น bottom sheet */}
      {sheetOpen && (
        <div className="sm:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSheetOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 bg-white rounded-t-2xl max-h-[80vh] flex flex-col">
            {/* handle + ปุ่มปิด */}
            <div className="flex-none pt-2 pb-1 flex flex-col items-center" onClick={() => setSheetOpen(false)}>
              <div className="w-10 h-1 rounded-full bg-slate-300" />
            </div>
            <div className="flex-none px-4 pb-2 flex items-center justify-between">
              <div>
                <div className="font-bold">
                  {parseISO(picked).toLocaleDateString('th-TH', { weekday:'long', day:'numeric', month:'long' })}
                </div>
                {dayQ.data && (
                  <div className="text-sm text-slate-500">
                    {dayQ.data.count} ออเดอร์
                    {dayQ.data.orders.length > 0 && ' • ฿' + dayQ.data.orders.reduce((s,o)=>s+o.grandTotal,0).toLocaleString()}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button onClick={announceDay} disabled={announcing || !dayQ.data?.orders?.length}
                  className="btn bg-sky-500 text-white text-sm px-2 flex items-center gap-1 disabled:opacity-40">
                  <Megaphone size={14} /> ประกาศ
                </button>
                <button onClick={() => setSheetOpen(false)} className="btn btn-ghost text-sm">ปิด ✕</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-3">
              <FilterChips chips={ORDER_FILTERS} active={filters} onToggle={toggleFilter} />
              {dayQ.isLoading && [1,2].map(i => <SkeletonOrderCard key={i} />)}
              {dayQ.data?.orders.length === 0 && (
                <div className="text-center text-slate-400 py-8">— ไม่มีออเดอร์วันนี้ —</div>
              )}
              {sortPinned(applyOrderFilters(dayQ.data?.orders || [], filters)).map((o) => (
                <OrderCard
                  key={o.orderId}
                  order={o}
                  onClick={() => modals.openOrder(o)}
                  selected={selectedIds.has(o.orderId)}
                  onToggleSelect={toggleSelect}
                  onCustomerClick={modals.openCustomer}
                />
              ))}
              {dayQ.data?.orders?.length > 0 && applyOrderFilters(dayQ.data.orders, filters).length === 0 && (
                <div className="text-center text-slate-400 py-8 text-sm">— filter ทำให้ไม่เหลือออเดอร์ —</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* [#longpress] popover ดูลิสต์ออเดอร์แบบเร็ว */}
      {preview && (() => {
        const list = (monthQ.data?.orders || []).filter((o) => o.deliveryDateISO === preview.iso && o.status !== '❌ ยกเลิก');
        const left = Math.min(Math.max(preview.x - 130, 8), window.innerWidth - 268);
        const top = Math.min(preview.y + 12, window.innerHeight - 280);
        return (
          <div className="fixed inset-0 z-[60]" onClick={() => setPreview(null)}>
            <div className="absolute w-[260px] max-h-[260px] overflow-y-auto bg-white rounded-xl shadow-2xl border border-slate-200 p-3"
                 style={{ left, top }} onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-2">
                <div className="font-bold text-sm">
                  {parseISO(preview.iso).toLocaleDateString('th-TH', { weekday:'short', day:'numeric', month:'short' })}
                </div>
                <span className="text-xs text-slate-400">{list.length} ออเดอร์</span>
              </div>
              {list.length === 0 ? (
                <div className="text-center text-slate-400 text-xs py-4">— ไม่มีออเดอร์ —</div>
              ) : (
                <div className="space-y-1">
                  {list.map((o) => (
                    <button key={o.orderId}
                      onClick={() => { setPreview(null); modals.openOrder(o); }}
                      className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 text-xs">
                      {o.isUrgent && <span className="text-red-500">🚨</span>}
                      <span className="text-slate-500 font-medium w-10 shrink-0">{o.deliveryTime || '—'}</span>
                      <span className="truncate flex-1">{o.customerName || '-'}</span>
                      <span className="text-sunrise-600 shrink-0">฿{(o.grandTotal||0).toLocaleString()}</span>
                    </button>
                  ))}
                </div>
              )}
              <button onClick={() => { setPreview(null); pickDate(preview.iso); }}
                className="w-full mt-2 text-xs text-sunrise-600 font-medium hover:underline">
                เปิดเต็ม →
              </button>
            </div>
          </div>
        );
      })()}

      {/* [v0.5] Floating Add button — [M5] มือถือยกขึ้นพ้น bottom nav */}
      <button
        onClick={() => setAddWithDate(null)}
        className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-30 w-14 h-14 rounded-full bg-sunrise-500 text-white shadow-lg hover:bg-sunrise-600 flex items-center justify-center transition-transform hover:scale-110 active:scale-95"
        aria-label="เพิ่มออเดอร์">
        <Plus size={28} />
      </button>

      {/* [v0.8] Bulk action bar */}
      <BulkActionBar selectedIds={selectedIds} onClear={() => setSelectedIds(new Set())} />

      {/* AddOrder modal — เฉพาะตัวนี้ ไม่ใช่ global — addWithDate: ISO date สำหรับ pre-fill */}
      {addWithDate !== false && (
        <AddOrderModal
          onClose={() => setAddWithDate(false)}
          defaultDate={addWithDate || undefined}
        />
      )}
    </div>
  );
}

// [v0.12/M1] มือถือ: แนวตั้ง compact (เลข + label เล็ก, ไม่มี icon) / จอใหญ่: เหมือนเดิม
function Sparkline({ data, color }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(1, ...data);
  const W = 40, H = 16;
  const pts = data.map((v, i) =>
    `${(i / (data.length - 1)) * W},${H - (v / max) * H}`
  ).join(' ');
  return (
    <svg width={W} height={H} className="opacity-60">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
        className={color.replace('bg-', 'text-').replace(/\s+bg-\S+/, '')} />
    </svg>
  );
}

function StatCard({ icon, label, value, color, onClick, delta, spark, progress, active }) {
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      onClick={onClick}
      className={
        'card !p-2 sm:!p-3 flex flex-col text-left relative overflow-hidden transition-all w-full ' +
        (onClick ? 'hover:shadow-md active:scale-[0.97] cursor-pointer ' : '') +
        (active ? 'ring-2 ring-offset-1 ring-current ' : '')
      }
    >
      {/* icon + delta row */}
      <div className="flex items-center justify-between mb-1">
        <div className={'p-1.5 rounded-lg ' + color}>{icon}</div>
        {delta !== null && delta !== undefined && (
          <span className={'text-[10px] font-semibold ' + (delta >= 0 ? 'text-green-600' : 'text-red-500')}>
            {delta >= 0 ? '▲' : '▼'}{Math.abs(delta)}%
          </span>
        )}
      </div>
      {/* value + label */}
      <div className="font-bold text-base sm:text-lg leading-tight">{value}</div>
      <div className="flex items-end justify-between gap-1">
        <div className="text-[10px] sm:text-xs text-slate-500 leading-tight">{label}</div>
        {spark && <Sparkline data={spark} color={color} />}
      </div>
      {/* progress bar */}
      {progress && progress.total > 0 && (
        <div className="mt-1.5 h-1 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-amber-400 transition-all"
            style={{ width: `${Math.round((progress.value / progress.total) * 100)}%` }}
          />
        </div>
      )}
    </Wrapper>
  );
}
