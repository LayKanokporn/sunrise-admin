// [v0.9] Audit Log — ใครทำอะไร เมื่อไหร่ (#10)
import { useQuery } from '@tanstack/react-query';
import { useModals } from '../App';
import { api } from '../lib/api';
import { History } from 'lucide-react';

function badgeForBy(by) {
  if (by.includes('เว็บ'))  return 'bg-blue-100 text-blue-700';
  if (by.includes('LINE')) return 'bg-green-100 text-green-700';
  if (by.includes('Sheet'))return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-600';
}

// [v0.13] แปลง timestamp เป็นวันเวลาไทย — รองรับ 2 format ที่ GAS ส่งมา:
//   1) ISO UTC "2569-06-13T04:02:08.000Z" (ปี พ.ศ. + Z) → แปลง UTC เป็นเวลาไทย (+7)
//   2) Thai "13/06/2569 11:02:08" (เวลาไทยอยู่แล้ว) → จัดรูปใหม่
const TH_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
function formatThaiDateTime(raw) {
  if (!raw) return '-';
  const s = String(raw);
  // ── ISO ──
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(\.\d+)?(Z)?/);
  if (m) {
    let y = +m[1]; if (y > 2500) y -= 543;            // พ.ศ. → ค.ศ.
    const mo = +m[2], d = +m[3], hh = +m[4], mi = +m[5], se = +(m[6] || 0);
    if (m[8]) { // มี Z = UTC → แปลงเป็นเวลาไทยด้วย timeZone
      const date = new Date(Date.UTC(y, mo - 1, d, hh, mi, se));
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Bangkok', day: 'numeric', month: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false
      }).formatToParts(date);
      const g = (t) => parts.find((x) => x.type === t)?.value;
      return `${+g('day')} ${TH_MONTHS[+g('month') - 1]} ${g('hour')}:${g('minute')}`;
    }
    return `${d} ${TH_MONTHS[mo - 1]} ${String(hh).padStart(2,'0')}:${m[5]}`;
  }
  // ── Thai DD/MM/YYYY HH:MM(:SS) ──
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (m) return `${+m[1]} ${TH_MONTHS[+m[2] - 1]} ${m[4].padStart(2,'0')}:${m[5]}`;
  return s;
}

function statusBadge(e) {
  if (e.isCancelled) return { t: '❌ ยกเลิก', c: 'bg-slate-200 text-slate-600' };
  const st = (e.status || '').toLowerCase();
  if (/completed|ส่งแล้ว/.test(st)) return { t: '🎉 ส่งแล้ว', c: 'bg-slate-200 text-slate-600' };
  if (e.isUrgent) return { t: '🚨 ด่วน', c: 'bg-red-100 text-red-700' };
  if (/ready|พร้อม/.test(st)) return { t: '✅ พร้อม', c: 'bg-blue-100 text-blue-700' };
  if (/enroute|ออกส่ง/.test(st)) return { t: '🚗 ส่ง', c: 'bg-indigo-100 text-indigo-700' };
  return { t: '🍰 ทำ', c: 'bg-amber-100 text-amber-700' };
}

export default function AuditLog() {
  const modals = useModals();
  const { data, isLoading } = useQuery({
    queryKey: ['audit'],
    queryFn: () => api.audit(80),
    staleTime: 30_000
  });

  const entries = data?.entries || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <History size={20} className="text-slate-600" />
        <div>
          <div className="font-bold">ประวัติการแก้ไข</div>
          <div className="text-xs text-slate-500">ใครทำอะไร เรียงล่าสุด</div>
        </div>
      </div>


      <div className="card divide-y divide-slate-100">
        {isLoading && [1,2,3,4,5].map(i => (
          <div key={'sk'+i} className="py-3 first:pt-0 last:pb-0 flex items-center gap-3">
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-32 bg-slate-200 rounded animate-pulse" />
              <div className="h-2 w-48 bg-slate-100 rounded animate-pulse" />
            </div>
            <div className="h-3 w-20 bg-slate-200 rounded animate-pulse" />
          </div>
        ))}
        {entries.map((e, i) => {
          const sb = statusBadge(e);
          return (
            <button
              key={e.orderId + i}
              onClick={() => modals.openCustomer(e.customerName)}
              className="w-full text-left py-3 first:pt-0 last:pb-0 flex items-center gap-3 hover:bg-slate-50 -mx-1 px-1 rounded">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{e.customerName || '-'}</span>
                  <span className={'badge text-[10px] ' + sb.c}>{sb.t}</span>
                </div>
                <div className="text-xs text-slate-400 truncate">{e.orderId} · ฿{e.grandTotal.toLocaleString()}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs text-slate-500">{formatThaiDateTime(e.updatedAt)}</div>
                <div className={'badge text-[10px] mt-0.5 ' + badgeForBy(e.updatedBy)}>{e.updatedBy}</div>
              </div>
            </button>
          );
        })}
        {!isLoading && entries.length === 0 && (
          <div className="text-center text-slate-400 py-8">
            <div className="text-2xl mb-2">📜</div>
            <div className="text-sm">ยังไม่มีประวัติ — เริ่มต้นด้วยการแก้ไขออเดอร์</div>
          </div>
        )}
      </div>
    </div>
  );
}
