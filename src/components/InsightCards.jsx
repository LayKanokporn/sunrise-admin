// Insight cards — ย้ายออกจาก Calendar มารวมที่เดียว ใช้ทั้งหน้า KPI และที่อื่น
//   AOV / Pacing / Channel / TrendChart / RevenueRange + helper computeMonthInsight
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DollarSign } from 'lucide-react';
import { api } from '../lib/api';
import { prefs } from '../lib/prefs';

// local date → ISO (เลี่ยง UTC bug)
function fmtISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
function parseISO(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(NaN);
}

// รวม stat ของเดือน (revenue/aov/channel/pacing) — ใช้ logic เดียวกับ Calendar เดิม
export function computeMonthInsight(allOrders, year, month, today, salesGoal) {
  const orders = (allOrders || []).filter((o) => {
    const d = parseISO(o.deliveryDateISO);
    return d.getFullYear() === year && d.getMonth() === month;
  });
  const valid = orders.filter((o) => o.status !== '❌ ยกเลิก');
  const revenue = valid.reduce((s, o) => s + (o.grandTotal || 0), 0);
  const aov = valid.length ? Math.round(revenue / valid.length) : 0;
  const lineCount = valid.filter((o) => (o.channel || '').toUpperCase() === 'LINE').length;
  const fbCount   = valid.filter((o) => (o.channel || '').toUpperCase() === 'FB').length;

  let pacing = null;
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();
  if (salesGoal > 0 && isCurrentMonth) {
    const dayOfMonth = today.getDate();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const timeElapsedPct = Math.round((dayOfMonth / daysInMonth) * 100);
    const goalProgressPct = Math.round((revenue / salesGoal) * 100);
    const projectedClose = Math.round((revenue / dayOfMonth) * daysInMonth);
    pacing = { timeElapsedPct, goalProgressPct, projectedClose, isBehind: goalProgressPct < timeElapsedPct };
  }

  return { count: valid.length, revenue, aov, lineCount, fbCount, pacing };
}

// ยอดขายเฉลี่ยต่อออเดอร์ของเดือน
export function AovCard({ aov, revenue }) {
  return (
    <div className="card !p-2 sm:!p-3 flex flex-col">
      <div className="text-[10px] sm:text-xs text-slate-500 mb-1">AOV เฉลี่ย/ออเดอร์</div>
      <div className="font-bold text-base sm:text-lg text-emerald-600">฿{aov.toLocaleString()}</div>
      <div className="text-[10px] text-slate-400 truncate">ยอดรวมเดือน ฿{revenue.toLocaleString()}</div>
    </div>
  );
}

// [Pacing] เป้าเดือน vs เวลาผ่าน — เก็บ goal ใน localStorage (ไม่มี backend field)
export function PacingCard({ pacing, goal }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');

  if (!goal) {
    return (
      <div className="card !p-2 sm:!p-3 flex flex-col">
        <div className="text-[10px] sm:text-xs text-slate-500 mb-1">เป้าเดือน</div>
        {editing ? (
          <div className="flex gap-1">
            <input type="number" value={val} onChange={(e) => setVal(e.target.value)}
              placeholder="เช่น 300000" autoFocus
              className="w-full px-1.5 py-1 text-xs rounded border border-slate-300 min-w-0" />
            <button onClick={() => { prefs.setSalesGoal(val); setEditing(false); }}
              className="text-xs px-2 bg-sunrise-500 text-white rounded shrink-0">ตั้ง</button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} className="text-xs text-sunrise-600 underline text-left">+ ตั้งเป้า</button>
        )}
      </div>
    );
  }

  if (!pacing) {
    return (
      <div className="card !p-2 sm:!p-3 flex flex-col">
        <div className="text-[10px] sm:text-xs text-slate-500 mb-1">เป้าเดือน</div>
        <div className="text-xs text-slate-400">ดูได้เฉพาะเดือนปัจจุบัน</div>
      </div>
    );
  }

  const { timeElapsedPct, goalProgressPct, projectedClose, isBehind } = pacing;
  return (
    <div className="card !p-2 sm:!p-3 flex flex-col relative">
      <button onClick={() => prefs.setSalesGoal(0)} title="ล้างเป้า"
        className="absolute top-1.5 right-1.5 text-[10px] text-slate-300 hover:text-slate-500">✕</button>
      <div className="text-[10px] sm:text-xs text-slate-500 mb-1 flex items-center gap-1">
        เป้าเดือน {isBehind ? <span className="text-amber-500">⚠</span> : <span className="text-emerald-500">✓</span>}
      </div>
      <div className="font-bold text-base sm:text-lg">{goalProgressPct}%</div>
      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mt-1 relative">
        <div className="h-full rounded-full bg-sunrise-500 transition-all" style={{ width: `${Math.min(100, Math.max(0, goalProgressPct))}%` }} />
        <div className="absolute top-0 h-full w-px bg-slate-500" style={{ left: `${Math.min(100, timeElapsedPct)}%` }} />
      </div>
      <div className="text-[10px] text-slate-400 mt-1 truncate">เวลาผ่าน {timeElapsedPct}% • คาดปิด ฿{projectedClose.toLocaleString()}</div>
    </div>
  );
}

// [Channel] สัดส่วน LINE vs FB ของเดือน
export function ChannelCard({ line, fb }) {
  const total = line + fb;
  const linePct = total > 0 ? Math.round((line / total) * 100) : 0;
  return (
    <div className="card !p-2 sm:!p-3 flex flex-col">
      <div className="text-[10px] sm:text-xs text-slate-500 mb-1">ช่องทาง</div>
      <div className="flex items-baseline gap-1 font-bold text-sm">
        <span className="text-emerald-600">{line}</span><span className="text-[10px] text-slate-400 font-normal">LINE</span>
        <span className="text-slate-300 font-normal">/</span>
        <span className="text-blue-600">{fb}</span><span className="text-[10px] text-slate-400 font-normal">FB</span>
      </div>
      {total > 0 && (
        <div className="h-1.5 rounded-full overflow-hidden mt-1.5 flex">
          <div className="bg-emerald-400 h-full" style={{ width: `${linePct}%` }} />
          <div className="bg-blue-400 h-full" style={{ width: `${100 - linePct}%` }} />
        </div>
      )}
    </div>
  );
}

// [TrendChart] กราฟแท่งยอดขาย/ออเดอร์ 14 วันล่าสุด — toggle เปิด-ปิดประหยัดพื้นที่
export function TrendChart({ orders, today, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const [metric, setMetric] = useState('revenue');

  const days = useMemo(() => {
    const arr = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const iso = fmtISO(d);
      const dayOrders = orders.filter((o) => o.deliveryDateISO === iso && o.status !== '❌ ยกเลิก');
      arr.push({ iso, label: d.getDate(), revenue: dayOrders.reduce((s, o) => s + (o.grandTotal || 0), 0), count: dayOrders.length });
    }
    return arr;
  }, [orders, today]);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs text-slate-500 underline hover:text-slate-700 px-1">
        📊 ดูกราฟเทรนด์ 14 วัน
      </button>
    );
  }

  const max = Math.max(1, ...days.map((d) => d[metric]));
  const W = 600, H = 100, barW = W / days.length;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="font-bold text-sm">เทรนด์ 14 วันล่าสุด</div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 text-xs">
            <button onClick={() => setMetric('revenue')}
              className={'px-2 py-0.5 rounded ' + (metric === 'revenue' ? 'bg-sunrise-500 text-white' : 'bg-slate-100 text-slate-600')}>ยอดขาย</button>
            <button onClick={() => setMetric('count')}
              className={'px-2 py-0.5 rounded ' + (metric === 'count' ? 'bg-sunrise-500 text-white' : 'bg-slate-100 text-slate-600')}>ออเดอร์</button>
          </div>
          {!defaultOpen && <button onClick={() => setOpen(false)} className="text-xs text-slate-400 hover:text-slate-600">ปิด ✕</button>}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H + 20}`} className="w-full" style={{ height: 120 }}>
        {days.map((d, i) => {
          const h = (d[metric] / max) * H;
          const x = i * barW + barW * 0.15;
          const w = barW * 0.7;
          const isToday = i === days.length - 1;
          return (
            <g key={d.iso}>
              <rect x={x} y={H - h} width={w} height={h} rx={2} fill={isToday ? '#f97316' : '#fdba74'} />
              <text x={x + w / 2} y={H + 14} fontSize="9" textAnchor="middle" fill="#94a3b8">{d.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// [RevenueRange] ยอดขายรวมตามช่วงวันที่เลือกเอง — ดึง api.orders({from,to}) แล้วรวมเอง
export function RevenueRange({ today }) {
  const y = today.getFullYear(), m = today.getMonth();
  const firstOfMonth = fmtISO(new Date(y, m, 1));
  const endOfMonth   = fmtISO(new Date(y, m + 1, 0));
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo]     = useState(fmtISO(today));

  const setRange = (f, t) => { setFrom(f); setTo(t); };
  const presets = [
    { label: '1-15',      f: fmtISO(new Date(y, m, 1)),  t: fmtISO(new Date(y, m, 15)) },
    { label: '16-สิ้นเดือน', f: fmtISO(new Date(y, m, 16)), t: endOfMonth },
    { label: 'ทั้งเดือน',   f: firstOfMonth, t: endOfMonth },
    { label: 'เดือนก่อน',   f: fmtISO(new Date(y, m - 1, 1)), t: fmtISO(new Date(y, m, 0)) }
  ];

  const { data, isFetching } = useQuery({
    queryKey: ['revenue-range', from, to],
    queryFn: () => api.orders({ from, to }),
    enabled: !!from && !!to && from <= to,
    staleTime: 60_000
  });

  const stats = useMemo(() => {
    const valid = (data?.orders || []).filter((o) => o.status !== '❌ ยกเลิก');
    const revenue = valid.reduce((s, o) => s + (o.grandTotal || 0), 0);
    const paidRevenue = valid.filter((o) => (o.paymentStatus || '').toLowerCase() === 'paid').reduce((s, o) => s + (o.grandTotal || 0), 0);
    return { revenue, count: valid.length, aov: valid.length ? Math.round(revenue / valid.length) : 0, unpaidRevenue: revenue - paidRevenue };
  }, [data]);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="font-bold text-sm flex items-center gap-1">
          <DollarSign size={16} className="text-emerald-600" /> ยอดขายตามช่วงวันที่
        </div>
        <div className="flex gap-1 flex-wrap">
          {presets.map((p) => (
            <button key={p.label} onClick={() => setRange(p.f, p.t)}
              className={'px-2 py-0.5 rounded text-xs ' +
                (from === p.f && to === p.t ? 'bg-sunrise-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)}
          className="px-2 py-1.5 rounded-lg border border-slate-300 text-sm" />
        <span className="text-slate-400 text-sm">ถึง</span>
        <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)}
          className="px-2 py-1.5 rounded-lg border border-slate-300 text-sm" />
        {isFetching && <span className="text-xs text-slate-400">⏳</span>}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="bg-emerald-50 rounded-lg p-2.5">
          <div className="text-[10px] text-slate-500">ยอดขายรวม</div>
          <div className="font-bold text-lg text-emerald-600">฿{stats.revenue.toLocaleString()}</div>
        </div>
        <div className="bg-slate-50 rounded-lg p-2.5">
          <div className="text-[10px] text-slate-500">ออเดอร์</div>
          <div className="font-bold text-lg">{stats.count} ใบ</div>
        </div>
        <div className="bg-slate-50 rounded-lg p-2.5">
          <div className="text-[10px] text-slate-500">เฉลี่ย/ใบ</div>
          <div className="font-bold text-lg">฿{stats.aov.toLocaleString()}</div>
        </div>
        <div className="bg-amber-50 rounded-lg p-2.5">
          <div className="text-[10px] text-slate-500">ค้างชำระ</div>
          <div className="font-bold text-lg text-amber-600">฿{stats.unpaidRevenue.toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
}
