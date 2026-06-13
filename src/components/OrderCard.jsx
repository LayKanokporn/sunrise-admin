// [v0.9] OrderCard — inline action buttons + color code + bulk select + customer click
import { Phone, MapPin, Clock, CreditCard, CheckCircle2, AlertTriangle, Pencil, Banknote } from 'lucide-react';
import { useOrderActions } from '../lib/useOrderActions';

// [D2] color code ตาม status — เห็นปุ๊บรู้ปั๊บ
function getCardStyle(order) {
  if (order.status === '❌ ยกเลิก')
    return { border: 'border-l-slate-400', bg: 'bg-slate-50 opacity-60', badge: '❌ ยกเลิก', badgeColor: 'bg-slate-200 text-slate-600' };
  const st = (order.status || '').toLowerCase();
  if (/completed|delivered|ส่งแล้ว/.test(st))
    return { border: 'border-l-slate-400', bg: 'bg-slate-50 opacity-70', badge: '🎉 ส่งแล้ว', badgeColor: 'bg-slate-200 text-slate-600' };
  if (order.isUrgent)
    return { border: 'border-l-red-500', bg: 'bg-red-50/40', badge: '🚨 ด่วน', badgeColor: 'bg-red-100 text-red-700' };
  if (order.isPassed)
    return { border: 'border-l-orange-400', bg: 'bg-orange-50/40', badge: '⏰ เลยเวลา', badgeColor: 'bg-orange-100 text-orange-700' };
  if (/enroute|ออกส่ง/.test(st))
    return { border: 'border-l-indigo-500', bg: '', badge: '🚗 ออกส่ง', badgeColor: 'bg-indigo-100 text-indigo-700' };
  if (/ready|พร้อมส่ง|รับงาน/.test(st))
    return { border: 'border-l-blue-500', bg: '', badge: '✅ พร้อมส่ง', badgeColor: 'bg-blue-100 text-blue-700' };
  return { border: 'border-l-amber-400', bg: '', badge: '🍰 กำลังทำ', badgeColor: 'bg-amber-100 text-amber-700' };
}

export default function OrderCard({
  order,
  compact = false,
  onClick,
  selected = false,
  onToggleSelect,
  onCustomerClick,
  showInlineActions = true   // [B1] ปุ่มบนการ์ด
}) {
  const actions = useOrderActions();
  const isPaid = (order.paymentStatus || '').toLowerCase() === 'paid';
  const isDelivered = /completed|delivered|ส่งแล้ว/.test((order.status || '').toLowerCase());
  const isCancelled = order.status === '❌ ยกเลิก';
  const style = getCardStyle(order);
  const itemCount = (order.items || []).length;
  const firstItems = (order.items || []).slice(0, 3);
  const moreItems = itemCount - firstItems.length;

  const stop = (e) => e.stopPropagation();

  return (
    <div
      onClick={(e) => {
        if (e.target.closest('[data-no-card-click]')) return;
        onClick?.();
      }}
      className={
        'card relative overflow-hidden cursor-pointer hover:shadow-md transition-shadow border-l-4 ' +
        style.border + ' ' + style.bg + ' ' +
        (selected ? 'ring-2 ring-sunrise-500 ' : '')
      }>

      {/* badge มุมขวาบน */}
      <div className={'absolute top-0 right-0 px-2 py-0.5 text-xs font-bold rounded-bl-lg ' + style.badgeColor}>
        {style.badge}
      </div>

      {/* customer + checkbox + time */}
      <div className="flex items-start justify-between gap-2 mb-2 pr-16">
        {onToggleSelect && (
          <label data-no-card-click onClick={stop} className="flex items-center pt-1 cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect(order.orderId)}
              className="w-4 h-4 rounded border-slate-300 text-sunrise-500 focus:ring-sunrise-500"
            />
          </label>
        )}
        <div className="min-w-0 flex-1">
          <button
            data-no-card-click
            onClick={(e) => { stop(e); onCustomerClick?.(order.customerName); }}
            disabled={!onCustomerClick}
            className={'font-bold truncate text-left max-w-full block ' +
              (onCustomerClick ? 'hover:text-sunrise-600 hover:underline' : '')}>
            {order.customerName || '-'}
          </button>
          <div className="text-xs text-slate-500 truncate">{order.orderId}</div>
        </div>
        {order.deliveryTime && (
          <div className="text-sm font-medium text-slate-700 flex items-center gap-1 shrink-0">
            <Clock size={14} /> {order.deliveryTime}
          </div>
        )}
      </div>

      {!compact && (
        <>
          <div className="text-sm space-y-1 mb-2">
            {firstItems.map((it, i) => (
              <div key={i} className="flex justify-between gap-2 text-slate-700">
                <span className="truncate">• {it.menuName}</span>
                <span className="text-slate-500 shrink-0">{it.qty} {it.unit}</span>
              </div>
            ))}
            {moreItems > 0 && <div className="text-xs text-slate-400">+ อีก {moreItems} รายการ</div>}
          </div>
          <div className="space-y-1 text-xs text-slate-500">
            {order.phone     && <div className="flex items-center gap-1"><Phone size={12} /> {order.phone}</div>}
            {order.location  && <div className="flex items-start gap-1"><MapPin size={12} className="mt-0.5" /> <span className="line-clamp-2">{order.location}</span></div>}
          </div>
        </>
      )}

      {/* payment + total */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
        {isPaid
          ? <span className="badge bg-green-100 text-green-700"><CheckCircle2 size={12} className="mr-0.5"/> ชำระแล้ว</span>
          : <span className="badge bg-amber-100 text-amber-700"><CreditCard size={12} className="mr-0.5"/> รอชำระ</span>
        }
        <div className="font-bold text-sunrise-600">฿{order.grandTotal.toLocaleString()}</div>
      </div>

      {/* [B1] inline action buttons — กดบนการ์ดเลย */}
      {showInlineActions && !isCancelled && (
        <div data-no-card-click onClick={stop} className="flex gap-1.5 mt-2 pt-2 border-t border-slate-100">
          {/* [v0.13] ปุ่มชำระแล้ว — โชว์เฉพาะออเดอร์ที่ยังค้างชำระ (badge เด้งเขียวทันที) */}
          {!isPaid && (
            <button
              onClick={() => actions.markPaid(order)}
              className="flex-1 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700 transition-colors flex items-center justify-center gap-1">
              <Banknote size={13} /> ชำระแล้ว
            </button>
          )}
          {!isDelivered ? (
            <button
              onClick={() => actions.markDelivered(order)}
              className="flex-1 py-1.5 rounded-lg bg-indigo-500 text-white text-xs font-medium hover:bg-indigo-600 transition-colors flex items-center justify-center gap-1">
              <CheckCircle2 size={13} /> ส่งแล้ว
            </button>
          ) : (
            <div className="flex-1 py-1.5 rounded-lg bg-slate-100 text-slate-400 text-xs text-center">✓ ส่งแล้ว</div>
          )}
          <button
            onClick={() => actions.toggleUrgent(order)}
            className={'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1 ' +
              (order.isUrgent ? 'bg-slate-200 text-slate-600' : 'bg-red-500 text-white hover:bg-red-600')}>
            <AlertTriangle size={13} /> {order.isUrgent ? 'ปลด' : 'ด่วน'}
          </button>
          <button
            onClick={() => onClick?.()}
            className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-medium hover:bg-slate-200 transition-colors flex items-center justify-center">
            <Pencil size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
