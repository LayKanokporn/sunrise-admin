// [v0.9] Toast UI — แสดง toast stack มุมล่าง + ปุ่ม undo
import { useSyncExternalStore } from 'react';
import { CheckCircle2, XCircle, Info, Undo2, X } from 'lucide-react';
import { subscribeToasts, getToasts, dismiss } from '../lib/toast';

const styles = {
  success: { bg: 'bg-emerald-600', Icon: CheckCircle2 },
  error:   { bg: 'bg-red-600',     Icon: XCircle },
  info:    { bg: 'bg-slate-700',   Icon: Info },
  undo:    { bg: 'bg-slate-800',   Icon: Undo2 }
};

export default function ToastContainer() {
  const toasts = useSyncExternalStore(subscribeToasts, getToasts, getToasts);

  return (
    <div className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 w-[92vw] max-w-md pointer-events-none">
      {toasts.map((t) => {
        const s = styles[t.type] || styles.info;
        return (
          <div
            key={t.id}
            className={`pointer-events-auto ${s.bg} text-white rounded-xl shadow-lg px-4 py-3 flex items-center gap-3 animate-in slide-in-from-bottom-2`}>
            <s.Icon size={18} className="shrink-0" />
            <span className="flex-1 text-sm">{t.msg}</span>

            {t.type === 'undo' && t.onUndo && (
              <button
                onClick={() => { t.onUndo(); dismiss(t.id); }}
                className="shrink-0 bg-white/20 hover:bg-white/30 rounded-lg px-3 py-1 text-sm font-medium flex items-center gap-1">
                <Undo2 size={14} /> เลิกทำ
              </button>
            )}

            <button onClick={() => dismiss(t.id)} className="shrink-0 opacity-70 hover:opacity-100">
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
