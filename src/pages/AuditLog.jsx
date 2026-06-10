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

      {isLoading && <div className="text-center text-slate-500 py-8">⏳ กำลังโหลด...</div>}

      <div className="card divide-y divide-slate-100">
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
                <div className="text-xs text-slate-500">{e.updatedAt.split(' ')[1] || e.updatedAt}</div>
                <div className={'badge text-[10px] mt-0.5 ' + badgeForBy(e.updatedBy)}>{e.updatedBy}</div>
              </div>
            </button>
          );
        })}
        {!isLoading && entries.length === 0 && (
          <div className="text-center text-slate-400 py-8">— ยังไม่มีประวัติ —</div>
        )}
      </div>
    </div>
  );
}
