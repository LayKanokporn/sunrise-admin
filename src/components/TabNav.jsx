import { Calendar, LayoutGrid, ChefHat, History, Clock, BarChart3 } from 'lucide-react';

// [v0.2] ปฏิทิน → Kanban → ผลิต → [v0.9] ประวัติ → [#kpi] KPI
// [#nav] จัดกลุ่มแท็บ (จอใหญ่) — แทนแถวเดียว พอแท็บเยอะจะหาง่ายขึ้น
// [v0.12/M5] มือถือ: bottom navigation (นิ้วโป้งกดถึง) — flat ไม่จัดกลุ่ม (พื้นที่จำกัด)
const groups = [
  { label: 'หน้าหลัก', items: [
    { key: 'calendar', label: 'ปฏิทิน', Icon: Calendar }
  ]},
  { label: 'ออเดอร์', items: [
    { key: 'kanban',     label: 'Kanban', Icon: LayoutGrid },
    { key: 'production', label: 'ผลิต',   Icon: ChefHat }
  ]},
  { label: 'วิเคราะห์', items: [
    { key: 'kpi', label: 'KPI', Icon: BarChart3 }
  ]},
  { label: 'ประวัติ', items: [
    { key: 'timeline', label: 'ไทม์ไลน์', Icon: Clock },
    { key: 'audit',    label: 'ประวัติ',  Icon: History }
  ]}
];

// flat list สำหรับ bottom nav มือถือ
const flatTabs = groups.flatMap((g) => g.items);

export default function TabNav({ value, onChange }) {
  return (
    <>
      {/* ── จอใหญ่ (≥640px): top tabs จัดกลุ่ม ── */}
      <nav className="hidden sm:block sticky top-[57px] z-10 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-2 flex items-stretch">
          {groups.map((g, gi) => (
            <div key={g.label} className="flex items-center">
              {gi > 0 && <div className="self-center h-6 w-px bg-slate-200 mx-1" />}
              <div className="flex flex-col justify-center px-1">
                <div className="text-[9px] uppercase tracking-wide text-slate-300 px-2 pt-1 leading-none">{g.label}</div>
                <div className="flex">
                  {g.items.map(({ key, label, Icon }) => (
                    <button
                      key={key}
                      onClick={() => onChange(key)}
                      className={
                        'flex-none px-3 py-2 flex items-center justify-center gap-1.5 text-sm font-medium border-b-2 transition-colors ' +
                        (value === key
                          ? 'border-sunrise-500 text-sunrise-600'
                          : 'border-transparent text-slate-500 hover:text-slate-800')
                      }>
                      <Icon size={16} />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </nav>

      {/* ── มือถือ (<640px): bottom navigation ── */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]"
           style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex">
          {flatTabs.map(({ key, label, Icon }) => (
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
