import { Calendar, LayoutGrid, ChefHat } from 'lucide-react';

// [v0.2] reorder: ปฏิทินก่อน (main dashboard) → Kanban → ผลิต
const tabs = [
  { key: 'calendar',   label: 'ปฏิทิน',  Icon: Calendar   },
  { key: 'kanban',     label: 'Kanban',  Icon: LayoutGrid },
  { key: 'production', label: 'ผลิต',    Icon: ChefHat    }
];

export default function TabNav({ value, onChange }) {
  return (
    <nav className="sticky top-[57px] z-10 bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-2 flex">
        {tabs.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={
              'flex-1 sm:flex-none px-4 py-3 flex items-center justify-center gap-2 text-sm font-medium border-b-2 transition-colors ' +
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
  );
}
