// [v0.8] BulkActionBar — lazy bar ที่ลอยมาเมื่อเลือกหลายออเดอร์
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { X, CheckCircle2, AlertTriangle, Trash2, Loader2 } from 'lucide-react';
import { api } from '../lib/api';

export default function BulkActionBar({ selectedIds, onClear }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const count = selectedIds.size;

  if (count === 0) return null;

  async function runBulk(label, fn) {
    if (!confirm(label + ' ' + count + ' ออเดอร์ ใช่ไหม?')) return;
    setBusy(true); setMsg(null);
    let ok = 0, fail = 0;
    for (const id of selectedIds) {
      try {
        const r = await fn(id);
        if (r?.ok !== false) ok++; else fail++;
      } catch(e) { fail++; }
    }
    setBusy(false);
    setMsg(`${label} สำเร็จ ${ok}/${count}` + (fail ? ` (ล้มเหลว ${fail})` : ''));
    qc.invalidateQueries();
    setTimeout(() => { setMsg(null); onClear(); }, 2000);
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t-2 border-sunrise-500 shadow-2xl p-3 animate-in slide-in-from-bottom">
      <div className="max-w-7xl mx-auto flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-sunrise-500 text-white flex items-center justify-center font-bold text-sm">
            {count}
          </div>
          <span className="font-medium text-sm">เลือก</span>
        </div>

        <div className="flex items-center gap-2 flex-wrap flex-1">
          <button
            onClick={() => runBulk('mark ชำระ', (id) => api.paid(id))}
            disabled={busy}
            className="btn bg-emerald-500 text-white text-sm flex items-center gap-1">
            <CheckCircle2 size={14} /> mark ชำระ
          </button>
          <button
            onClick={() => runBulk('ตั้งด่วน', (id) => api.urgent(id, true))}
            disabled={busy}
            className="btn bg-red-500 text-white text-sm flex items-center gap-1">
            <AlertTriangle size={14} /> ตั้งด่วน
          </button>
          <button
            onClick={() => runBulk('ส่งครัว (ready)', (id) => api.status(id, 'ready'))}
            disabled={busy}
            className="btn bg-blue-500 text-white text-sm">
            ✅ พร้อมส่ง
          </button>
          <button
            onClick={() => runBulk('ปลดด่วน', (id) => api.urgent(id, false))}
            disabled={busy}
            className="btn bg-slate-200 text-slate-700 text-sm">
            ปลดด่วน
          </button>
        </div>

        {busy && <Loader2 size={18} className="animate-spin text-slate-400" />}

        {msg && <span className="text-xs text-emerald-600">{msg}</span>}

        <button onClick={onClear} className="btn btn-ghost p-2 ml-auto" aria-label="clear">
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
