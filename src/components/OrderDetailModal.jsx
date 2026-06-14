// [v0.5] Order detail modal — แก้/ดูทุก field + จัดการ items
// [v0.8] เพิ่ม typeahead autocomplete สำหรับเพิ่มเมนู
import { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, AlertTriangle, CheckCircle2, Trash2, Plus, MapPin, Phone, Clock, Save, Megaphone } from 'lucide-react';
import { api } from '../lib/api';

const statusOptions = [
  { value:'preparing', label:'🍰 กำลังทำ' },
  { value:'ready',     label:'✅ พร้อมส่ง' },
  { value:'🚗 ออกส่ง', label:'🚗 ออกส่ง'   },
  { value:'completed', label:'🎉 ส่งแล้ว'  }
];

// [#orderlog] แปลง action เป็นภาษาไทย
const ACTION_LABEL = {
  update:'แก้ข้อมูล', status:'เปลี่ยนสถานะ', paid:'ชำระเงิน', urgent:'ตั้ง/ปลดด่วน',
  cancel:'ยกเลิก', note:'แก้โน้ต', additem:'เพิ่มเมนู', removeitem:'ลบเมนู', announce:'ประกาศกลุ่ม'
};
const TH_MONTHS_ = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
function fmtLogTime(raw) {
  const m = String(raw||'').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (m) return `${+m[1]} ${TH_MONTHS_[+m[2]-1]} ${m[4].padStart(2,'0')}:${m[5]}`;
  return String(raw||'-');
}

export default function OrderDetailModal({ order, onClose }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState('detail');
  const [edit, setEdit] = useState({});
  const [newItem, setNewItem] = useState({ menu:'', qty:1, unit:'ชิ้น', price:0 });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  // [#conflict] เวลาแก้ล่าสุดตอนเปิด — ใช้ตรวจว่ามีคนอื่นแก้ทับระหว่างนี้ไหม
  const [baseUpdatedAt, setBaseUpdatedAt] = useState(order.updatedAt || '');

  useEffect(() => {
    setEdit({
      customer: order.customerName || '',
      phone: order.phone || '',
      date: order.deliveryDateISO || '',
      time: order.deliveryTime || '',
      location: order.location || '',
      note: order.note || ''
    });
    setBaseUpdatedAt(order.updatedAt || '');
  }, [order.orderId]);

  // [#orderlog] timeline การแก้ไขของออเดอร์นี้ — โหลดเมื่อเข้าแท็บประวัติ
  const logQ = useQuery({
    queryKey: ['orderlog', order.orderId],
    queryFn: () => api.orderlog(order.orderId),
    enabled: tab === 'log',
    staleTime: 15_000
  });

  // [#conflict] ก่อนบันทึก เช็คว่ามีคนแก้ทับหรือยัง (เทียบ updatedAt ปัจจุบันกับตอนเปิด)
  async function checkConflict() {
    if (!baseUpdatedAt || !order.deliveryDateISO) return true; // ไม่มี baseline → ผ่าน
    try {
      const r = await api.orders({ date: order.deliveryDateISO });
      const fresh = (r.orders || []).find((o) => o.orderId === order.orderId);
      if (fresh && fresh.updatedAt && fresh.updatedAt !== baseUpdatedAt) {
        const who = (fresh.updatedBy || '').replace(/^liff:/, '') || 'คนอื่น';
        const ok = confirm(`⚠️ มีการแก้ออเดอร์นี้หลังจากคุณเปิด\nล่าสุด: ${fmtLogTime(fresh.updatedAt)} โดย ${who}\n\nบันทึกทับต่อไหม?`);
        if (ok) setBaseUpdatedAt(fresh.updatedAt); // ยอมรับ → อัปเดต baseline
        return ok;
      }
    } catch(_) { /* เช็คไม่ได้ → ปล่อยผ่าน ไม่บล็อกงาน */ }
    return true;
  }

  const refetchAll = () => qc.invalidateQueries();
  const flash = (text, type='success') => {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 2500);
  };

  async function run(label, fn) {
    setBusy(true);
    try {
      const r = await fn();
      if (r.ok === false) throw new Error(r.error || r.message || 'failed');
      flash(label + ' สำเร็จ');
      refetchAll();
    } catch(e) {
      flash(label + ' ล้มเหลว: ' + e.message, 'error');
    } finally { setBusy(false); }
  }

  const saveFields = async () => {
    if (!(await checkConflict())) { flash('ยกเลิกการบันทึก', 'error'); return; }
    run('บันทึก', () => api.update(order.orderId, edit));
  };
  const toggleUrgent = () => run(order.isUrgent ? 'ปลดด่วน' : 'ตั้งด่วน',
    () => api.urgent(order.orderId, !order.isUrgent));
  const markPaid = () => run('mark ชำระแล้ว', () => api.paid(order.orderId));
  const unmarkPaid = () => {
    if (!confirm('ยกเลิกสถานะชำระของ ' + order.orderId + ' ใช่ไหม? (กลับเป็นค้างชำระ)')) return;
    run('ยกเลิกชำระ', () => api.unpaid(order.orderId));
  };
  const changeStatus = (v) => run('เปลี่ยนสถานะ', () => api.status(order.orderId, v));
  const announce = () => {
    if (!confirm('ประกาศออเดอร์นี้เข้ากลุ่ม LINE?\n(' + (order.customerName||'-') + ' ส่ง ' + (order.deliveryDate||'-') + ')')) return;
    run('ประกาศเข้ากลุ่ม', () => api.announce(order.orderId));
  };
  const cancelOrder = () => {
    if (!confirm('ยกเลิกออเดอร์ ' + order.orderId + ' ใช่ไหม?')) return;
    run('ยกเลิก', () => api.cancel(order.orderId)).then(() => onClose());
  };
  const addItem = () => {
    if (!newItem.menu || newItem.qty <= 0 || newItem.price <= 0) {
      flash('กรอกข้อมูลเมนูให้ครบ', 'error'); return;
    }
    run('เพิ่มเมนู', () => api.addItem(order.orderId, newItem)).then(() => {
      setNewItem({ menu:'', qty:1, unit:'ชิ้น', price:0 });
    });
  };
  const removeItem = (menuName) => {
    if (!confirm('ลบ "' + menuName + '" ใช่ไหม?')) return;
    run('ลบเมนู', () => api.removeItem(order.orderId, menuName));
  };

  const isPaid = (order.paymentStatus || '').toLowerCase() === 'paid';

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4 lg:bg-transparent lg:pointer-events-none lg:p-0 lg:block" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl max-h-[95vh] flex flex-col lg:pointer-events-auto lg:fixed lg:inset-y-0 lg:right-0 lg:w-[420px] lg:max-w-none lg:max-h-screen lg:rounded-none lg:rounded-l-2xl lg:shadow-2xl lg:border-l lg:border-slate-200"
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className={'p-4 rounded-t-2xl ' + (order.isUrgent ? 'bg-red-50 border-b-2 border-red-200' : 'bg-slate-50 border-b border-slate-200')}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              {order.isUrgent && <div className="text-xs font-bold text-red-600 mb-1">🚨 ออเดอร์ด่วน</div>}
              <div className="font-bold text-lg truncate">{order.customerName || '-'}</div>
              <div className="text-xs text-slate-500 font-mono">{order.orderId}</div>
            </div>
            <button onClick={onClose} className="btn btn-ghost p-1"><X size={20} /></button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200">
          {['detail','items','action','log'].map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={'flex-1 py-2 text-sm font-medium ' +
                (tab === t ? 'border-b-2 border-sunrise-500 text-sunrise-600' : 'text-slate-500')}>
              {t === 'detail' ? '📝 ข้อมูล' : t === 'items' ? '🍰 รายการ' : t === 'action' ? '⚡ จัดการ' : '🕘 ประวัติ'}
            </button>
          ))}
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto p-4">

          {tab === 'detail' && (
            <div className="space-y-3">
              <Field label="ลูกค้า"     icon={<Phone size={14}/>} value={edit.customer} onChange={(v) => setEdit({...edit, customer:v})} />
              <Field label="เบอร์โทร"  value={edit.phone}    onChange={(v) => setEdit({...edit, phone:v})}    />
              <label className="block">
                <div className="text-xs text-slate-500 mb-1">📅 วันส่ง</div>
                <input type="date" value={edit.date||''} onChange={(e) => setEdit({...edit, date:e.target.value})}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
              </label>
              <Field label="เวลาส่ง"   icon={<Clock size={14}/>} value={edit.time}     onChange={(v) => setEdit({...edit, time:v})}     placeholder="HH:MM" />
              <Field label="ที่อยู่"   icon={<MapPin size={14}/>} value={edit.location} onChange={(v) => setEdit({...edit, location:v})} multiline />
              <Field label="หมายเหตุ"  value={edit.note}     onChange={(v) => setEdit({...edit, note:v})}     multiline />
              <button onClick={saveFields} disabled={busy} className="btn btn-primary w-full flex items-center justify-center gap-2">
                <Save size={16} /> บันทึกการแก้ไข
              </button>
            </div>
          )}

          {tab === 'items' && (
            <div className="space-y-3">
              <div className="space-y-2">
                {(order.items || []).map((it, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{it.menuName}</div>
                      <div className="text-xs text-slate-500">{it.qty} {it.unit} × ฿{it.unitPrice}</div>
                    </div>
                    <div className="font-bold text-sunrise-600 shrink-0">฿{it.itemTotal.toLocaleString()}</div>
                    <button onClick={() => removeItem(it.menuName)} className="btn btn-ghost p-1 text-red-500" disabled={busy}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="border-t border-slate-200 pt-3">
                <div className="font-medium text-sm mb-2">➕ เพิ่มเมนูใหม่</div>
                <MenuTypeahead
                  newItem={newItem}
                  setNewItem={setNewItem}
                  onAdd={addItem}
                  busy={busy}
                />
              </div>
            </div>
          )}

          {tab === 'action' && (
            <div className="space-y-3">
              <div>
                <div className="text-sm font-medium mb-2">สถานะปัจจุบัน</div>
                <div className="grid grid-cols-2 gap-2">
                  {statusOptions.map(s => (
                    <button key={s.value} onClick={() => changeStatus(s.value)} disabled={busy}
                      className={'btn text-sm ' +
                        (order.status === s.value ? 'btn-primary' : 'btn-ghost border border-slate-200')}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-slate-200 pt-3 space-y-2">
                <button onClick={toggleUrgent} disabled={busy}
                  className={'btn w-full flex items-center justify-center gap-2 ' +
                    (order.isUrgent ? 'bg-slate-200 text-slate-700' : 'bg-red-500 text-white')}>
                  <AlertTriangle size={16} />
                  {order.isUrgent ? 'ปลด urgent' : 'ตั้งเป็นด่วน'}
                </button>

                {/* [v0.13] กดผิดย้อนได้ — ชำระแล้ว → กดเพื่อยกเลิกชำระ */}
                {isPaid ? (
                  <div className="flex gap-2">
                    <div className="flex-1 btn bg-emerald-100 text-emerald-700 flex items-center justify-center gap-2 pointer-events-none">
                      <CheckCircle2 size={16} /> ชำระแล้ว ✓
                    </div>
                    <button onClick={unmarkPaid} disabled={busy}
                      className="btn bg-amber-50 text-amber-700 border border-amber-200 px-3 text-sm whitespace-nowrap">
                      ยกเลิกชำระ
                    </button>
                  </div>
                ) : (
                  <button onClick={markPaid} disabled={busy}
                    className="btn w-full bg-emerald-500 text-white flex items-center justify-center gap-2">
                    <CheckCircle2 size={16} /> mark ชำระแล้ว
                  </button>
                )}

                {/* [v0.13] ประกาศออเดอร์นี้เข้ากลุ่ม LINE */}
                <button onClick={announce} disabled={busy}
                  className="btn w-full bg-sky-500 text-white flex items-center justify-center gap-2">
                  <Megaphone size={16} /> ประกาศเข้ากลุ่ม LINE
                </button>

                <button onClick={cancelOrder} disabled={busy}
                  className="btn w-full bg-red-50 text-red-700 border border-red-200 flex items-center justify-center gap-2">
                  <Trash2 size={16} /> ยกเลิกออเดอร์
                </button>
              </div>
            </div>
          )}

          {/* [#orderlog] ประวัติการแก้ไขของออเดอร์นี้ */}
          {tab === 'log' && (
            <div className="space-y-2">
              {logQ.isLoading && <div className="text-center text-slate-400 py-8 text-sm">⏳ กำลังโหลด...</div>}
              {!logQ.isLoading && (logQ.data?.entries || []).length === 0 && (
                <div className="text-center text-slate-400 py-8 text-sm">
                  — ยังไม่มีประวัติการแก้ไข —<br/>
                  <span className="text-[11px]">(บันทึกเริ่มนับจากการแก้ครั้งถัดไป)</span>
                </div>
              )}
              {(logQ.data?.entries || []).map((e, i) => (
                <div key={i} className="flex items-start gap-3 py-2 border-b border-slate-100 last:border-b-0">
                  <div className="w-2 h-2 rounded-full bg-sunrise-400 mt-1.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{ACTION_LABEL[e.action] || e.action}</div>
                    <div className="text-xs text-slate-400">{e.by}</div>
                  </div>
                  <div className="text-xs text-slate-500 shrink-0">{fmtLogTime(e.at)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer total */}
        <div className="p-3 border-t border-slate-200 bg-slate-50 flex justify-between items-center rounded-b-2xl">
          <span className="text-sm text-slate-500">รวม</span>
          <span className="font-bold text-lg text-sunrise-600">฿{order.grandTotal.toLocaleString()}</span>
        </div>

        {/* Flash msg */}
        {msg && (
          <div className={'absolute top-4 right-4 px-4 py-2 rounded-lg text-sm shadow-lg ' +
            (msg.type === 'error' ? 'bg-red-500 text-white' : 'bg-emerald-500 text-white')}>
            {msg.text}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, multiline, icon }) {
  return (
    <label className="block">
      <div className="text-xs text-slate-500 mb-1 flex items-center gap-1">
        {icon} {label}
      </div>
      {multiline ? (
        <textarea
          value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          rows={2}
          className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm resize-none" />
      ) : (
        <input
          type="text" value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
      )}
    </label>
  );
}

// [v0.8] MenuTypeahead — autocomplete ชื่อเมนูจาก /?api=menus
//   suggestions filter ตามที่พิมพ์ + auto-fill หน่วย+ราคา เมื่อคลิก
function MenuTypeahead({ newItem, setNewItem, onAdd, busy }) {
  const [showList, setShowList] = useState(false);

  const { data } = useQuery({
    queryKey: ['menus'],
    queryFn: () => api.menus(),
    staleTime: 10 * 60_000,    // 10 นาที (เปลี่ยนไม่บ่อย)
    gcTime: 30 * 60_000
  });

  const allMenus = data?.menus || [];
  const q = newItem.menu.trim().toLowerCase();

  const suggestions = useMemo(() => {
    if (!q) return allMenus.slice(0, 8);
    return allMenus
      .filter(m => m.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [q, allMenus]);

  function pick(m) {
    const unit = m.defaultUnit || 'ชิ้น';
    const price = unit === 'วง' ? (m.perWong || m.perPiece) : (m.perPiece || m.perWong);
    setNewItem({ ...newItem, menu: m.name, unit, price: price * (newItem.qty || 1) });
    setShowList(false);
  }

  return (
    <div className="space-y-2 relative">
      <div className="relative">
        <input
          type="text"
          placeholder="พิมพ์เพื่อค้นหาเมนู..."
          value={newItem.menu}
          onChange={(e) => { setNewItem({ ...newItem, menu: e.target.value }); setShowList(true); }}
          onFocus={() => setShowList(true)}
          onBlur={() => setTimeout(() => setShowList(false), 200)}
          className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
        />
        {showList && suggestions.length > 0 && (
          <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
            {suggestions.map((m, i) => (
              <button
                key={i}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(m)}
                className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 flex items-center justify-between border-b border-slate-100 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{m.name}</div>
                  <div className="text-[10px] text-slate-400">
                    {m.source === 'master' ? '⭐ มาตรฐาน' : `📊 ใช้ ${m.usedCount} ครั้ง`}
                  </div>
                </div>
                <div className="text-xs text-slate-500 shrink-0 ml-2">
                  {m.perPiece > 0 && <span>฿{m.perPiece}/ชิ้น </span>}
                  {m.perWong > 0 && <span>฿{m.perWong}/วง</span>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <input type="number" placeholder="จำนวน" min={1}
          value={newItem.qty} onChange={(e) => setNewItem({...newItem, qty:+e.target.value})}
          className="px-3 py-2 rounded-lg border border-slate-300 text-sm" />
        <select value={newItem.unit} onChange={(e) => setNewItem({...newItem, unit:e.target.value})}
          className="px-3 py-2 rounded-lg border border-slate-300 text-sm">
          <option>ชิ้น</option><option>วง</option><option>ปอนด์</option><option>กล่อง</option>
        </select>
        <input type="number" placeholder="ราคารวม" min={0}
          value={newItem.price} onChange={(e) => setNewItem({...newItem, price:+e.target.value})}
          className="px-3 py-2 rounded-lg border border-slate-300 text-sm" />
      </div>
      <button onClick={onAdd} disabled={busy} className="btn btn-primary w-full flex items-center justify-center gap-2">
        <Plus size={16} /> เพิ่มเมนู
      </button>
    </div>
  );
}
