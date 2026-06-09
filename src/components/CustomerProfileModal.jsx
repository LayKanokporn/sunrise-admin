// [v0.8] Customer profile — รวมประวัติออเดอร์ลูกค้าคนเดียว
import { useQuery } from '@tanstack/react-query';
import { X, Package, DollarSign, TrendingUp } from 'lucide-react';
import { api } from '../lib/api';
import OrderCard from './OrderCard';

export default function CustomerProfileModal({ customerName, onClose, onPickOrder }) {
  const { data, isLoading } = useQuery({
    queryKey: ['customer', customerName],
    queryFn: () => api.customer(customerName),
    enabled: !!customerName,
    staleTime: 120_000
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-3xl sm:rounded-2xl rounded-t-2xl max-h-[95vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-sunrise-500 to-sunrise-600 rounded-t-2xl text-white">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-xs opacity-80 mb-1">👤 ลูกค้า</div>
              <div className="font-bold text-xl truncate">{customerName}</div>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-white/20 rounded"><X size={20} /></button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading && <div className="text-center text-slate-500 py-8">⏳ กำลังโหลด...</div>}

          {data && (
            <>
              {/* KPI */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                <Stat icon={<Package size={16}/>}    label="ออเดอร์" value={data.orderCount}   color="text-sunrise-600 bg-sunrise-50" />
                <Stat icon={<DollarSign size={16}/>} label="ยอดรวม" value={'฿' + (data.totalSpent/1000).toFixed(1) + 'K'} color="text-emerald-600 bg-emerald-50" />
                <Stat icon={<TrendingUp size={16}/>} label="ชิ้น"   value={data.totalItems}    color="text-blue-600 bg-blue-50" />
              </div>

              {/* Top menus */}
              {data.topMenus?.length > 0 && (
                <div className="card mb-4">
                  <div className="font-bold text-sm mb-2">🍰 เมนูที่สั่งบ่อย</div>
                  <div className="space-y-1">
                    {data.topMenus.map((m, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span>{i+1}. {m.name}</span>
                        <span className="text-sunrise-600 font-medium">{m.qty} ชิ้น</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Orders list */}
              <div className="font-bold text-sm mb-2">📋 ออเดอร์ทั้งหมด ({data.orderCount})</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(data.orders || []).map((o) => (
                  <OrderCard
                    key={o.orderId}
                    order={o}
                    compact
                    onClick={() => { onPickOrder(o); onClose(); }}
                  />
                ))}
              </div>

              {data.orders?.length === 0 && (
                <div className="text-center text-slate-400 py-8">— ไม่มีออเดอร์ —</div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, color }) {
  return (
    <div className="card flex items-center gap-2 p-3">
      <div className={'p-2 rounded-lg ' + color}>{icon}</div>
      <div className="min-w-0">
        <div className="text-[10px] text-slate-500 truncate">{label}</div>
        <div className="font-bold text-sm leading-tight truncate">{value}</div>
      </div>
    </div>
  );
}
