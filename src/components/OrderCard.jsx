// [v0.8] OrderCard — เพิ่ม checkbox (bulk select) + clickable customer name (profile)
import { Phone, MapPin, Clock, CreditCard, CheckCircle2 } from 'lucide-react';

export default function OrderCard({
  order,
  compact = false,
  onClick,
  selected = false,
  onToggleSelect,        // optional — เปิด bulk mode
  onCustomerClick        // optional — เปิด customer profile
}) {
  const isPaid = (order.paymentStatus || '').toLowerCase() === 'paid';
  const itemCount = (order.items || []).length;
  const firstItems = (order.items || []).slice(0, 3);
  const moreItems = itemCount - firstItems.length;

  const cardClick = (e) => {
    if (onToggleSelect && (e.target.closest('[data-bulk-checkbox]'))) return;
    if (onCustomerClick && e.target.closest('[data-customer-name]')) return;
    onClick?.();
  };

  return (
    <div
      onClick={cardClick}
      className={
      'card relative overflow-hidden cursor-pointer hover:shadow-md transition-shadow ' +
      (selected ? 'ring-2 ring-sunrise-500 ' : '') +
      (order.isUrgent ? 'border-l-4 border-l-red-500 bg-red-50/30' : '') +
      (order.isPassed ? ' opacity-60' : '')
    }>
      {order.isUrgent && (
        <div className="absolute top-0 right-0 px-2 py-0.5 bg-red-500 text-white text-xs font-bold rounded-bl-lg">
          🚨 ด่วน
        </div>
      )}

      {/* customer + time + checkbox */}
      <div className="flex items-start justify-between gap-2 mb-2">
        {onToggleSelect && (
          <label
            data-bulk-checkbox
            onClick={(e) => e.stopPropagation()}
            className="flex items-center pt-1 cursor-pointer shrink-0">
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
            data-customer-name
            onClick={(e) => { e.stopPropagation(); onCustomerClick?.(order.customerName); }}
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

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
        <div className="flex items-center gap-1">
          {isPaid
            ? <span className="badge bg-green-100 text-green-700"><CheckCircle2 size={12} className="mr-0.5"/> ชำระแล้ว</span>
            : <span className="badge bg-amber-100 text-amber-700"><CreditCard size={12} className="mr-0.5"/> รอชำระ</span>
          }
        </div>
        <div className="font-bold text-sunrise-600">฿{order.grandTotal.toLocaleString()}</div>
      </div>
    </div>
  );
}
