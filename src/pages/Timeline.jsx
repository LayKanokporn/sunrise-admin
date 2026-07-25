// มุมมองแกนเวลา — วางออเดอร์ตามเวลาส่ง เห็นชั่วโมงพีคของวัน
import { useQuery } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { api } from '../lib/api';
import { useModals } from '../App';
import { Clock, AlertTriangle } from 'lucide-react';
import { SkeletonBox } from '../components/Skeleton';

function isoOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
const HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 08:00–20:00

// ดึงชั่วโมงจาก deliveryTime "HH:MM" → number | null
function hourOf(t) {
  const m = String(t || '').match(/^(\d{1,2}):/);
  if (!m) return null;
  const h = +m[1];
  return h >= 0 && h <= 23 ? h : null;
}

export default function Timeline() {
  const [date, setDate] = useState(isoOffset(0));
  const modals = useModals();

  const { data, isLoading } = useQuery({
    queryKey: ['orders', date],
    queryFn: () => api.orders({ date })
  });

  const orders = (data?.orders || []).filter((o) => o.status !== '❌ ยกเลิก');

  const { byHour, noTime, peakHour, maxCount } = useMemo(() => {
    const map = {};
    HOURS.forEach((h) => (map[h] = []));
    const noTime = [];
    let early = [], late = [];
    orders.forEach((o) => {
      const h = hourOf(o.deliveryTime);
      if (h === null) { noTime.push(o); return; }
      if (h < 8) early.push(o);
      else if (h > 20) late.push(o);
      else map[h].push(o);
    });
    // ก่อน 8 โมงยัดแถว 8, หลัง 20 ยัดแถว 20
    map[8] = [...early, ...map[8]];
    map[20] = [...map[20], ...late];
    let peakHour = null, maxCount = 0;
    HOURS.forEach((h) => { if (map[h].length > maxCount) { maxCount = map[h].length; peakHour = h; } });
    return { byHour: map, noTime, peakHour, maxCount };
  }, [orders]);

  const quick = [['เมื่อวาน', -1], ['วันนี้', 0], ['พรุ่งนี้', 1]];

  return (
    <div className="space-y-4">
      {/* date quick nav */}
      <div className="flex items-center gap-2 flex-wrap">
        {quick.map(([label, off]) => {
          const v = isoOffset(off);
          const active = v === date;
          return (
            <button key={label} onClick={() => setDate(v)}
              className={'btn text-sm ' + (active ? 'btn-primary' : 'btn-ghost border border-slate-200')}>
              {label}
            </button>
          );
        })}
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm" />
        <div className="text-sm text-slate-500 ml-auto">
          {orders.length} ออเดอร์{peakHour !== null && maxCount > 0 ? ` · พีค ${peakHour}:00 (${maxCount})` : ''}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3,4,5].map((i) => <SkeletonBox key={i} className="h-12 w-full" />)}</div>
      ) : (
        <div className="card !p-0 overflow-hidden">
          {/* ไม่ระบุเวลา — ไว้บนสุดให้เห็นง่าย (ต้องเช็ค/เติมเวลา) */}
          {noTime.length > 0 && (
            <div className="flex border-b-2 border-amber-300 bg-amber-50/60">
              <div className="w-14 sm:w-16 shrink-0 px-2 py-3 text-right border-r border-slate-100 text-xs text-amber-600 font-bold">
                ไม่ระบุ<br/>เวลา
              </div>
              <div className="flex-1 p-2 flex flex-wrap gap-1.5">
                {noTime.map((o) => (
                  <button key={o.orderId} onClick={() => modals.openOrder(o)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border bg-white border-amber-200 text-slate-700 hover:shadow-sm">
                    {o.isUrgent && <AlertTriangle size={11} className="text-red-500" />}
                    <span className="truncate max-w-[120px]">{o.customerName || '-'}</span>
                    <span className="text-sunrise-600">฿{(o.grandTotal||0).toLocaleString()}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {HOURS.map((h) => {
            const list = byHour[h];
            const isPeak = h === peakHour && maxCount > 0;
            return (
              <div key={h} className={'flex border-b border-slate-100 last:border-b-0 ' + (isPeak ? 'bg-sunrise-50/60' : '')}>
                {/* แกนเวลา */}
                <div className="w-14 sm:w-16 shrink-0 px-2 py-3 text-right border-r border-slate-100">
                  <div className={'text-sm font-semibold ' + (isPeak ? 'text-sunrise-600' : 'text-slate-500')}>
                    {String(h).padStart(2,'0')}:00
                  </div>
                  {list.length > 0 && <div className="text-[10px] text-slate-400">{list.length} ใบ</div>}
                </div>
                {/* ออเดอร์ในชั่วโมงนี้ */}
                <div className="flex-1 p-2 flex flex-wrap gap-1.5 min-h-[44px]">
                  {list.map((o) => (
                    <button key={o.orderId} onClick={() => modals.openOrder(o)}
                      className={'inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border transition-colors hover:shadow-sm ' +
                        (o.isUrgent ? 'bg-red-50 border-red-200 text-red-700' : 'bg-slate-50 border-slate-200 text-slate-700')}>
                      {o.isUrgent && <AlertTriangle size={11} />}
                      <Clock size={11} className="text-slate-400" />
                      <span className="font-semibold">{o.deliveryTime || '?'}</span>
                      <span className="truncate max-w-[120px]">{o.customerName || '-'}</span>
                      <span className="text-sunrise-600">฿{(o.grandTotal||0).toLocaleString()}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}

          {orders.length === 0 && (
            <div className="text-center text-slate-400 py-12 text-sm">— ไม่มีออเดอร์วันนี้ —</div>
          )}
        </div>
      )}
    </div>
  );
}
