// Global search — ค้นทั่วระบบ debounce 300ms
import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Search, Loader2 } from 'lucide-react';
import { api } from '../lib/api';

export default function SearchModal({ onClose, onPickOrder }) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const { data, isLoading } = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => api.search(debounced, 30),
    enabled: debounced.length >= 2,
    staleTime: 30_000
  });

  const orders = data?.orders || [];

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-0 sm:p-4 sm:pt-16" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl max-h-[95vh] flex flex-col"
           onClick={(e) => e.stopPropagation()}>
        <div className="p-3 border-b border-slate-200 flex items-center gap-2">
          <Search size={20} className="text-slate-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหา ชื่อร้าน / เบอร์ / เมนู / ORD-..."
            className="flex-1 outline-none text-base"
          />
          {isLoading && <Loader2 size={18} className="animate-spin text-slate-400" />}
          <button onClick={onClose} className="btn btn-ghost p-1"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {debounced.length < 2 && (
            <div className="text-center text-slate-400 py-12 text-sm">
              พิมพ์อย่างน้อย 2 ตัวอักษร
            </div>
          )}
          {debounced.length >= 2 && !isLoading && orders.length === 0 && (
            <div className="text-center text-slate-400 py-12 text-sm">
              ไม่พบ "{debounced}"
            </div>
          )}
          <div className="space-y-2">
            {orders.map((o) => (
              <button
                key={o.orderId}
                onClick={() => { onPickOrder(o); onClose(); }}
                className={'w-full text-left p-3 rounded-lg border transition-colors hover:bg-slate-50 ' +
                  (o.isUrgent ? 'border-red-200 bg-red-50/30' : 'border-slate-200')}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium truncate flex-1">
                    {o.isUrgent && '🚨 '}{o.customerName || '-'}
                  </span>
                  <span className="text-sunrise-600 font-bold shrink-0 ml-2">฿{o.grandTotal.toLocaleString()}</span>
                </div>
                <div className="text-xs text-slate-500 flex items-center gap-3">
                  <span>📅 {o.deliveryDate}</span>
                  {o.deliveryTime && <span>⏰ {o.deliveryTime}</span>}
                  <span className="font-mono">{o.orderId.slice(-12)}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {data && (
          <div className="px-3 py-2 border-t border-slate-200 text-xs text-slate-500">
            พบ {data.count} ผลลัพธ์
          </div>
        )}
      </div>
    </div>
  );
}
