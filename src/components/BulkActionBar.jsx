// [v0.9] BulkActionBar — confirm รวมครั้งเดียว + optimistic + progress
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { X, CheckCircle2, AlertTriangle, Loader2, Truck } from 'lucide-react';
import { api } from '../lib/api';
import { toast } from '../lib/toast';

export default function BulkActionBar({ selectedIds, onClear }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null); // {label, fn}
  const count = selectedIds.size;

  if (count === 0) return null;

  // [D3] กดปุ่ม → เปิด confirm รวม (ไม่ใช่ confirm ทีละใบ)
  function ask(label, icon, fn) {
    setConfirm({ label, icon, fn });
  }

  async function execute() {
    if (!confirm) return;
    setBusy(true);
    const ids = [...selectedIds];
    let ok = 0, fail = 0;
    // ยิงขนานกัน (เร็วกว่าทีละใบ)
    await Promise.all(ids.map(async (id) => {
      try {
        const r = await confirm.fn(id);
        if (r?.ok !== false) ok++; else fail++;
      } catch (e) { fail++; }
    }));
    setBusy(false);
    setConfirm(null);
    qc.invalidateQueries();
    if (fail === 0) toast.success(`${confirm.label} สำเร็จ ${ok} ใบ`);
    else toast.error(`สำเร็จ ${ok}, ล้มเหลว ${fail}`);
    onClear();
  }

  return (
    <>
      {/* bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t-2 border-sunrise-500 shadow-2xl p-3">
        <div className="max-w-7xl mx-auto flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-sunrise-500 text-white flex items-center justify-center font-bold text-sm">
              {count}
            </div>
            <span className="font-medium text-sm hidden sm:inline">เลือก</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap flex-1">
            <button onClick={() => ask('ส่งแล้ว', '✅', (id) => api.status(id, 'completed'))}
              className="btn bg-emerald-500 text-white text-sm flex items-center gap-1">
              <CheckCircle2 size={14} /> ส่งแล้ว
            </button>
            <button onClick={() => ask('พร้อมส่ง', '📦', (id) => api.status(id, 'ready'))}
              className="btn bg-blue-500 text-white text-sm flex items-center gap-1">
              <Truck size={14} /> พร้อมส่ง
            </button>
            <button onClick={() => ask('mark ชำระ', '💰', (id) => api.paid(id))}
              className="btn bg-amber-500 text-white text-sm">💰 ชำระ</button>
            <button onClick={() => ask('ตั้งด่วน', '🚨', (id) => api.urgent(id, true))}
              className="btn bg-red-500 text-white text-sm flex items-center gap-1">
              <AlertTriangle size={14} /> ด่วน
            </button>
          </div>

          <button onClick={onClear} className="btn btn-ghost p-2" aria-label="clear">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* [D3] confirm dialog รวม */}
      {confirm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !busy && setConfirm(null)}>
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full text-center" onClick={(e) => e.stopPropagation()}>
            <div className="text-4xl mb-2">{confirm.icon}</div>
            <div className="font-bold text-lg mb-1">{confirm.label}</div>
            <div className="text-sm text-slate-600 mb-4">{count} ออเดอร์ พร้อมกัน</div>
            <div className="flex gap-2">
              <button onClick={() => setConfirm(null)} disabled={busy}
                className="btn btn-ghost flex-1 border border-slate-200">ยกเลิก</button>
              <button onClick={execute} disabled={busy}
                className="btn btn-primary flex-1 flex items-center justify-center gap-2">
                {busy ? <><Loader2 size={16} className="animate-spin" /> กำลังทำ...</> : 'ยืนยัน'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
