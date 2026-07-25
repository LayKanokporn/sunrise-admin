// FilterChips — เลือกหลายอันพร้อมกัน (toggle)
//   active = Set<string>
import { Check } from 'lucide-react';

export default function FilterChips({ chips, active, onToggle }) {
  return (
    <div className="flex gap-2 flex-wrap items-center">
      {chips.map(({ key, label, color }) => {
        const isActive = active.has(key);
        return (
          <button
            key={key}
            onClick={() => onToggle(key)}
            className={
              'px-3 py-1.5 rounded-full text-xs font-medium border transition-all flex items-center gap-1 ' +
              (isActive
                ? (color || 'bg-sunrise-500 text-white border-sunrise-500')
                : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400')
            }>
            {isActive && <Check size={12} />}
            {label}
          </button>
        );
      })}
      {active.size > 0 && (
        <button
          onClick={() => chips.forEach(c => active.has(c.key) && onToggle(c.key))}
          className="text-xs text-slate-500 underline ml-auto">
          ล้าง
        </button>
      )}
    </div>
  );
}

// presets ใช้ซ้ำได้
export const ORDER_FILTERS = [
  { key: 'urgent',  label: '🚨 ด่วน',       color: 'bg-red-500 text-white border-red-500' },
  { key: 'pending', label: '💳 ค้างชำระ',  color: 'bg-amber-500 text-white border-amber-500' },
  { key: 'paid',    label: '✅ ชำระแล้ว',  color: 'bg-emerald-500 text-white border-emerald-500' },
  { key: 'passed',  label: '🎉 ส่งแล้ว',   color: 'bg-slate-500 text-white border-slate-500' }
];

// utility: apply filters to orders
export function applyOrderFilters(orders, active) {
  if (!active.size) return orders;
  return orders.filter(o => {
    if (active.has('urgent')  && !o.isUrgent) return false;
    if (active.has('pending') && (o.paymentStatus || '').toLowerCase() === 'paid') return false;
    if (active.has('paid')    && (o.paymentStatus || '').toLowerCase() !== 'paid') return false;
    if (active.has('passed')  && !o.isPassed) return false;
    return true;
  });
}
