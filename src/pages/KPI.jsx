// [#kpi] หน้า KPI — รวม insight ยอดขายไว้ที่เดียว (เลือกเดือนได้)
//   ย้ายการ์ดที่เคยกระจายใน Calendar มารวมที่นี่ + กราฟ + ยอดขายช่วงวันที่
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, BarChart3 } from 'lucide-react';
import { api } from '../lib/api';
import { usePrefs } from '../lib/prefs';
import { SkeletonStatCard } from '../components/Skeleton';
import { computeMonthInsight, AovCard, PacingCard, ChannelCard, TrendChart, RevenueRange } from '../components/InsightCards';

const monthNamesTH = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
function fmtISO(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
function addMonths(d, n) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }

export default function KPI() {
  const today = useMemo(() => new Date(), []);
  const [anchor, setAnchor] = useState(new Date());
  const p = usePrefs();
  const year = anchor.getFullYear(), month = anchor.getMonth();

  const from = fmtISO(new Date(year, month, 1));
  const to   = fmtISO(new Date(year, month + 1, 0));

  const { data, isLoading } = useQuery({
    queryKey: ['kpi-month', from, to],
    queryFn: () => api.orders({ from, to }),
    staleTime: 60_000
  });

  const orders = data?.orders || [];
  const stats = useMemo(
    () => computeMonthInsight(orders, year, month, today, p.salesGoal),
    [orders, year, month, today, p.salesGoal]
  );

  const paidCount = orders.filter((o) => o.status !== '❌ ยกเลิก' && (o.paymentStatus || '').toLowerCase() === 'paid').length;

  return (
    <div className="space-y-4">
      {/* หัวข้อ + เลือกเดือน */}
      <div className="card flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 size={20} className="text-sunrise-600" />
          <div className="font-bold text-lg">สรุปยอดขาย</div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setAnchor(addMonths(anchor, -1))} className="btn btn-ghost p-1.5"><ChevronLeft size={18} /></button>
          <div className="font-semibold text-sm w-28 text-center">{monthNamesTH[month]} {year + 543}</div>
          <button onClick={() => setAnchor(addMonths(anchor, 1))} className="btn btn-ghost p-1.5"><ChevronRight size={18} /></button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          {[1,2,3,4].map((i) => <SkeletonStatCard key={i} />)}
        </div>
      ) : (
        <>
          {/* แถวสรุปหลัก */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            <div className="card !p-2 sm:!p-3 flex flex-col">
              <div className="text-[10px] sm:text-xs text-slate-500 mb-1">ยอดขายเดือนนี้</div>
              <div className="font-bold text-base sm:text-lg text-emerald-600">฿{stats.revenue.toLocaleString()}</div>
            </div>
            <div className="card !p-2 sm:!p-3 flex flex-col">
              <div className="text-[10px] sm:text-xs text-slate-500 mb-1">ออเดอร์</div>
              <div className="font-bold text-base sm:text-lg">{stats.count} ใบ</div>
              <div className="text-[10px] text-slate-400">ชำระแล้ว {paidCount}</div>
            </div>
            <AovCard aov={stats.aov} revenue={stats.revenue} />
            <ChannelCard line={stats.lineCount} fb={stats.fbCount} />
          </div>

          {/* เป้าเดือน (กว้างเต็ม) */}
          <PacingCard pacing={stats.pacing} goal={p.salesGoal} />

          {/* กราฟเทรนด์ 14 วัน — เปิดค้างไว้ในหน้านี้ */}
          <TrendChart orders={orders} today={today} defaultOpen />

          {/* ยอดขายตามช่วงวันที่ */}
          <RevenueRange today={today} />
        </>
      )}
    </div>
  );
}
