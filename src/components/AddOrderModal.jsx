// Add Order — paste text เหมือนในไลน์ → ระบบ parse + save
import { useState, useEffect, useMemo } from 'react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { X, Sparkles, Send, UserSearch } from 'lucide-react';
import { api } from '../lib/api';

const DAY_NAMES = ['จันทร์','อังคาร','พุธ','พฤหัส','ศุกร์','เสาร์','อาทิตย์'];

function detectWarnings(text) {
  const warnings = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    // qty spike: "N x M = Z" pattern — Z likely parsed as qty
    const mulM = line.match(/(\d+)\s*[xX×]\s*(\d+)\s*=\s*(\d+)/);
    if (mulM && +mulM[3] > 50)
      warnings.push(`จำนวน ${mulM[3]} ในบรรทัด "${line}" อาจเป็นผลคูณ ไม่ใช่ qty จริง`);
    // "รวม" line may be parsed as item
    if (/^รวม[\s฿\d]/.test(line))
      warnings.push(`บรรทัด "${line}" อาจถูก parse เป็นเมนู "รวม" — ตรวจสอบหลัง save`);
    // CE year (< 2500)
    const yearM = line.match(/\b(20\d{2})\b/);
    if (yearM)
      warnings.push(`ปี ค.ศ. ${yearM[1]} — ควรเป็นปี พ.ศ. ${+yearM[1]+543} (เช่น "2569" ไม่ใช่ "${yearM[1]}")`);
    // day-name only (no full date)
    if (DAY_NAMES.some(d => line === d || line === `วัน${d}`))
      warnings.push(`"${line}" — ชื่อวันเดี่ยว ควรระบุวันที่ครบ เช่น "จันทร์ที่ 16 มิถุนายน 2569"`);
  }
  return warnings;
}

// bigram similarity — ใช้ sort fuzzy match ใน CustomerQuickFill
function bigramSim(a, b) {
  const norm = (s) => s.replace(/\s/g, '').toLowerCase();
  const na = norm(a), nb = norm(b);
  if (!na || !nb) return 0;
  const bigrams = (s) => new Set([...Array(Math.max(0, s.length - 1))].map((_, i) => s[i] + s[i + 1]));
  const ba = bigrams(na), bb = bigrams(nb);
  const inter = [...ba].filter((x) => bb.has(x)).length;
  return (2 * inter) / ((ba.size + bb.size) || 1);
}

const SAMPLE = `ออเดอร์รอบส่ง 12 มิถุนายน 2569 @ตัวอย่างร้าน

มะพร้าวลูก 3 ชิ้น 300฿
ทีรามิสุ 2 ชิ้น 150฿

รวม 450฿`;

const THAI_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
function isoToThaiDate(iso) {
  const [y, m, d] = (iso||'').split('-');
  return `${+d} ${THAI_MONTHS[+m-1]} ${+y+543}`;
}

export default function AddOrderModal({ onClose, defaultDate }) {
  const qc = useQueryClient();
  const [text, setText] = useState(defaultDate ? `ออเดอร์รอบส่ง ${isoToThaiDate(defaultDate)}\n\n` : '');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [dupConfirm, setDupConfirm] = useState(null);

  const warnings = useMemo(() => detectWarnings(text), [text]);

  async function submit(force = false) {
    if (!text.trim()) return;
    setBusy(true); setResult(null); setDupConfirm(null);
    try {
      const r = await api.parseSave(text, force);
      if (r.ok) {
        setResult({ type:'success', msg:`✅ บันทึก ${r.orderId} | ${r.customer} | ${r.items} รายการ | ฿${r.total.toLocaleString()}` });
        setText('');
        qc.invalidateQueries({ refetchType: 'all' });
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

          {/* เลือกลูกค้าเก่า → เติมหัวออเดอร์ให้ */}
          <CustomerQuickFill onPick={(c) => {
            const head = `ออเดอร์รอบส่ง  @${c.customerName}\n` +
              (c.phone ? c.phone + '\n' : '') +
              (c.location ? c.location + '\n' : '') + '\n';
            setText((prev) => prev ? prev : head);
          }} />

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

          {warnings.length > 0 && (
            <div className="p-3 rounded-lg text-sm bg-yellow-50 text-yellow-800 border border-yellow-200 space-y-1">
              <div className="font-semibold">⚠️ ตรวจพบปัญหาที่อาจเกิดขึ้น</div>
              {warnings.map((w, i) => <div key={i} className="text-xs">• {w}</div>)}
            </div>
          )}

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

// ค้นลูกค้าเก่า → dedupe ตามชื่อ → เลือกแล้วเติมเบอร์/ที่อยู่ล่าสุด
function CustomerQuickFill({ onPick }) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const { data } = useQuery({
    queryKey: ['quickadd-search', debounced],
    queryFn: () => api.search(debounced, 20),
    enabled: debounced.length >= 2,
    staleTime: 60_000
  });

  // dedupe ตามชื่อลูกค้า → เก็บออเดอร์ล่าสุด → sort fuzzy ตาม q
  const customers = useMemo(() => {
    const seen = new Map();
    (data?.orders || []).forEach((o) => {
      const key = (o.customerName || '').trim();
      if (!key) return;
      const cur = seen.get(key);
      if (!cur || (o.deliveryDateISO || '') > (cur.deliveryDateISO || '')) seen.set(key, o);
    });
    const list = [...seen.values()];
    if (debounced) {
      list.sort((a, b) => bigramSim(debounced, b.customerName) - bigramSim(debounced, a.customerName));
    }
    return list.slice(0, 8);
  }, [data, debounced]);

  return (
    <div className="relative">
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 bg-slate-50">
        <UserSearch size={16} className="text-slate-400 shrink-0" />
        <input
          type="text"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          placeholder="ลูกค้าเก่า? พิมพ์ชื่อเพื่อเติมเบอร์/ที่อยู่ให้..."
          className="flex-1 bg-transparent text-sm focus:outline-none"
        />
      </div>
      {open && debounced.length >= 2 && customers.length > 0 && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {customers.map((c, i) => (
            <button
              key={i}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onPick(c); setOpen(false); setQ(''); }}
              className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 border-b border-slate-100 last:border-b-0">
              <div className="font-medium truncate">{c.customerName}</div>
              <div className="text-[11px] text-slate-400 truncate">
                {[c.phone, c.location].filter(Boolean).join(' · ') || 'ไม่มีเบอร์/ที่อยู่'}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
