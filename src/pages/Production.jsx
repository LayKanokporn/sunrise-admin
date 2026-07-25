// Production view — รวมเมนูที่ต้องอบ พร้อมเลือกช่วงวัน
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../lib/api';
import { SkeletonBox } from '../components/Skeleton';

// FIX timezone — use local date components instead of UTC
function fmtISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${dd}`;
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate()+n); return x; }

const presets = [
  { key: 'today',  label: 'วันนี้',   days: 0 },
  { key: 'tom',    label: 'พรุ่งนี้', days: 1 },
  { key: '3d',     label: '3 วัน',    days: 3 },
  { key: '7d',     label: '7 วัน',    days: 7 }
];

export default function Production() {
  const [preset, setPreset] = useState('today');
  const today = new Date();
  const days = presets.find(p => p.key === preset)?.days ?? 0;
  const from = fmtISO(today);
  const to   = fmtISO(addDays(today, days));

  const { data, isLoading, error } = useQuery({
    queryKey: ['production', from, to],
    queryFn: () => api.production(from, to)
  });

  const totals = data?.totals || [];
  const days_ = data?.days || [];
  const maxQty = totals[0]?.qty || 1;

  return (
    <div className="space-y-4">
      {/* preset selector */}
      <div className="flex gap-2 flex-wrap">
        {presets.map(p => (
          <button key={p.key} onClick={() => setPreset(p.key)}
            className={'btn text-sm ' + (preset === p.key ? 'btn-primary' : 'btn-ghost border border-slate-200')}>
            {p.label}
          </button>
        ))}
        <div className="text-sm text-slate-500 self-center ml-auto">
          {isLoading ? '⏳' : `จาก ${data?.totalRows || 0} รายการสั่ง`}
        </div>
      </div>

      {error && <div className="card text-red-600">⚠️ {error.message}</div>}

      {/* totals — bar chart */}
      <div className="card">
        <div className="font-bold mb-3">🍰 รวมต้องผลิต</div>
        {isLoading && (
          <div className="space-y-2">
            {[1,2,3,4].map(i => (
              <div key={i}>
                <div className="flex justify-between mb-1">
                  <SkeletonBox className="h-3 w-32" />
                  <SkeletonBox className="h-3 w-12" />
                </div>
                <SkeletonBox className="h-2 w-full" />
              </div>
            ))}
          </div>
        )}
        {!isLoading && totals.length === 0 && (
          <div className="text-center py-6 text-slate-400">
            <div className="text-2xl mb-2">☕</div>
            <div className="text-sm">ยังไม่มีรายการต้องอบ — พักแป๊บ</div>
          </div>
        )}
        <div className="space-y-2">
          {totals.map((m, i) => (
            <div key={m.menuName + m.unit}>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium">{i+1}. {m.menuName}</span>
                <span className="text-sunrise-600 font-bold">{m.qty} {m.unit}</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-sunrise-500 rounded-full"
                  style={{ width: `${Math.max(8, (m.qty/maxQty)*100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* per-day breakdown */}
      {days_.length > 1 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {days_.map((d) => (
            <div key={d.date} className="card">
              <div className="flex items-center justify-between mb-2">
                <div className="font-bold text-sm">{d.dateTH}</div>
                <span className="badge bg-slate-100 text-slate-700">{d.totalQty}</span>
              </div>
              <div className="space-y-1 text-sm">
                {d.menus.slice(0, 8).map((m, i) => (
                  <div key={i} className="flex justify-between text-slate-700">
                    <span className="truncate">• {m.menuName}</span>
                    <span className="text-slate-500 shrink-0">{m.qty} {m.unit}</span>
                  </div>
                ))}
                {d.menus.length > 8 && (
                  <div className="text-xs text-slate-400">+ อีก {d.menus.length-8} เมนู</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
