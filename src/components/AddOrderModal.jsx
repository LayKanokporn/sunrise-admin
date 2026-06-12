// [v0.5] Add Order — paste text เหมือนในไลน์ → ระบบ parse + save
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { X, Sparkles, Send } from 'lucide-react';
import { api } from '../lib/api';

const SAMPLE = `ออเดอร์รอบส่ง 12 มิถุนายน 2569 @ตัวอย่างร้าน

มะพร้าวลูก 3 ชิ้น 300฿
ทีรามิสุ 2 ชิ้น 150฿

รวม 450฿`;

export default function AddOrderModal({ onClose }) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  // [v0.11/B3] duplicate guard — server ตอบ duplicate:true → ถามยืนยันก่อนบันทึกซ้ำ
  const [dupConfirm, setDupConfirm] = useState(null);

  async function submit(force = false) {
    if (!text.trim()) return;
    setBusy(true); setResult(null); setDupConfirm(null);
    try {
      const r = await api.parseSave(text, force);
      if (r.ok) {
        setResult({ type:'success', msg:`✅ บันทึก ${r.orderId} | ${r.customer} | ${r.items} รายการ | ฿${r.total.toLocaleString()}` });
        setText('');
        qc.invalidateQueries();
        setTimeout(() => { onClose(); }, 1800);
      } else if (r.duplicate) {
        setDupConfirm({ msg: r.error, existingOrderId: r.existingOrderId });
      } else {
        setResult({ type:'error', msg:'❌ ' + (r.error || 'ไม่สามารถบันทึก') });
      }
    } catch(e) {
      // api.js throw เมื่อ ok=false — เช็คว่าเป็น duplicate message ไหม
      if (/ที่บันทึกไปแล้ว|อยู่แล้ว/.test(e.message)) {
        setDupConfirm({ msg: e.message, existingOrderId: null });
      } else {
        setResult({ type:'error', msg:'❌ ' + e.message });
      }
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl max-h-[95vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}>

        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={20} className="text-sunrise-600" />
            <div className="font-bold text-lg">เพิ่มออเดอร์</div>
          </div>
          <button onClick={onClose} className="btn btn-ghost p-1"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="text-sm text-slate-600">
            paste ข้อความออเดอร์เหมือนที่ส่งในไลน์ — ระบบจะ parse อัตโนมัติ
          </div>

          <textarea
            value={text} onChange={(e) => setText(e.target.value)}
            placeholder={SAMPLE}
            rows={12}
            className="w-full px-3 py-3 rounded-lg border border-slate-300 text-sm font-mono resize-none focus:border-sunrise-500 focus:outline-none focus:ring-2 focus:ring-sunrise-200" />

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <button
              onClick={() => setText(SAMPLE)}
              className="text-xs text-slate-500 underline hover:text-slate-700">
              ใส่ตัวอย่าง
            </button>
            <div className="text-xs text-slate-400">{text.length} ตัวอักษร</div>
          </div>

          {dupConfirm && (
            <div className="p-3 rounded-lg text-sm bg-amber-50 text-amber-800 border border-amber-200 space-y-2">
              <div className="font-semibold">⚠️ พบออเดอร์ซ้ำ</div>
              <div>{dupConfirm.msg}</div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => submit(true)} disabled={busy}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50">
                  บันทึกซ้ำยืนยัน
                </button>
                <button onClick={() => setDupConfirm(null)}
                  className="px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-xs font-semibold">
                  ยกเลิก
                </button>
              </div>
            </div>
          )}

          {result && (
            <div className={'p-3 rounded-lg text-sm ' +
              (result.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                            'bg-red-50 text-red-700 border border-red-200')}>
              {result.msg}
            </div>
          )}

          <div className="text-xs text-slate-500 space-y-1 bg-slate-50 p-3 rounded-lg">
            <div className="font-medium text-slate-700">📌 รูปแบบที่รับได้:</div>
            <div>• ออเดอร์รอบส่ง / รอบส่ง + วัน + @ชื่อร้าน + เมนู + รวม</div>
            <div>• เมนู: <code>มะพร้าว 3 ชิ้น 300฿</code> หรือ <code>เค้ก 600฿</code></div>
            <div>• ฟอร์มมาตรฐาน 5 บรรทัด (วันที่/ชื่อ/เบอร์/ที่อยู่/รายการ)</div>
            <div>• ไม่จำเป็นต้องมี "รวม" — ระบบคำนวณให้</div>
          </div>
        </div>

        <div className="p-3 border-t border-slate-200">
          <button
            onClick={() => submit(false)}
            disabled={busy || !text.trim()}
            className="btn btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
            <Send size={16} />
            {busy ? 'กำลังบันทึก...' : 'parse + บันทึก'}
          </button>
        </div>
      </div>
    </div>
  );
}
