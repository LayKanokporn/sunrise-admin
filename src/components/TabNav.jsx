import { Calendar, LayoutGrid, ChefHat, History, Clock } from 'lucide-react';

// [v0.2] ปฏิทิน → Kanban → ผลิต → [v0.9] ประวัติ
// [v0.12/M5] มือถือ: bottom navigation (นิ้วโป้งกดถึง) / จอใหญ่: top tabs เหมือนเดิม
const tabs = [
  { key: 'calendar',   label: 'ปฏิทิน',   Icon: Calendar   },
  { key: 'kanban',     label: 'Kanban',   Icon: LayoutGrid },
  { key: 'timeline',   label: 'ไทม์ไลน์', Icon: Clock      },
  { key: 'production', label: 'ผลิต',     Icon: ChefHat    },
  { key: 'audit',      label: 'ประวัติ',  Icon: History    }
];

export default function TabNav({ value, onChange }) {
  return (
    <>
      {/* ── จอใหญ่ (≥640px): top tabs ── */}
      <nav className="hidden sm:block sticky top-[57px] z-10 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-2 flex">
          {tabs.map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => onChange(key)}
              className={
                'flex-none px-4 py-3 flex items-center justify-center gap-2 text-sm font-medium border-b-2 transition-colors ' +
                (value === key
                  ? 'border-sunrise-500 text-sunrise-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800')
              }>
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
      </nav>

      {/* ── มือถือ (<640px): bottom navigation ── */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]"
           style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex">
          {tabs.map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => onChange(key)}
              className={
                'flex-1 py-2 flex flex-col items-center gap-0.5 text-[10px] font-medium transition-colors ' +
                (value === key ? 'text-sunrise-600' : 'text-slate-400')
              }>
              <Icon size={20} strokeWidth={value === key ? 2.4 : 2} />
              {label}
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}
