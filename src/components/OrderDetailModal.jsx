// [v0.5] Order detail modal — แก้/ดูทุก field + จัดการ items
import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, AlertTriangle, CheckCircle2, Trash2, Plus, MapPin, Phone, Clock, Save } from 'lucide-react';
import { api } from '../lib/api';

const statusOptions = [
  { value:'preparing', label:'🍰 กำลังทำ' },
  { value:'ready',     label:'✅ พร้อมส่ง' },
  { value:'🚗 ออกส่ง', label:'🚗 ออกส่ง'   },
  { value:'completed', label:'🎉 ส่งแล้ว'  }
];

export default function OrderDetailModal({ order, onClose }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState('detail');
  const [edit, setEdit] = useState({});
  const [newItem, setNewItem] = useState({ menu:'', qty:1, unit:'ชิ้น', price:0 });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    setEdit({
      customer: order.customerName || '',
      phone: order.phone || '',
      time: order.deliveryTime || '',
      location: order.location || '',
      note: order.note || ''
    });
  }, [order.orderId]);

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

  const saveFields = () => run('บันทึก', () => api.update(order.orderId, edit));
  const toggleUrgent = () => run(order.isUrgent ? 'ปลดด่วน' : 'ตั้งด่วน',
    () => api.urgent(order.orderId, !order.isUrgent));
  const markPaid = () => run('mark ชำระแล้ว', () => api.paid(order.orderId));
  const changeStatus = (v) => run('เปลี่ยนสถานะ', () => api.status(order.orderId, v));
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
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl max-h-[95vh] flex flex-col"
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
          {['detail','items','action'].map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={'flex-1 py-2 text-sm font-medium ' +
                (tab === t ? 'border-b-2 border-sunrise-500 text-sunrise-600' : 'text-slate-500')}>
              {t === 'detail' ? '📝 ข้อมูล' : t === 'items' ? '🍰 รายการ' : '⚡ จัดการ'}
            </button>
          ))}
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto p-4">

          {tab === 'detail' && (
            <div className="space-y-3">
              <Field label="ลูกค้า"     icon={<Phone size={14}/>} value={edit.customer} onChange={(v) => setEdit({...edit, customer:v})} />
              <Field label="เบอร์โทร"  value={edit.phone}    onChange={(v) => setEdit({...edit, phone:v})}    />
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
                <div className="space-y-2">
                  <input type="text" placeholder="ชื่อเมนู"
                    value={newItem.menu} onChange={(e) => setNewItem({...newItem, menu:e.target.value})}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
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
                  <button onClick={addItem} disabled={busy} className="btn btn-primary w-full flex items-center justify-center gap-2">
                    <Plus size={16} /> เพิ่มเมนู
                  </button>
                </div>
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

                <button onClick={markPaid} disabled={busy || isPaid}
                  className={'btn w-full flex items-center justify-center gap-2 ' +
                    (isPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-500 text-white')}>
                  <CheckCircle2 size={16} />
                  {isPaid ? 'ชำระแล้ว ✓' : 'mark ชำระแล้ว'}
                </button>

                <button onClick={cancelOrder} disabled={busy}
                  className="btn w-full bg-red-50 text-red-700 border border-red-200 flex items-center justify-center gap-2">
                  <Trash2 size={16} /> ยกเลิกออเดอร์
                </button>
              </div>
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
          value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          rows={2}
          className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm resize-none" />
      ) : (
        <input
          type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
      )}
    </label>
  );
}
