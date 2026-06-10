// [v0.9] useOrderActions — central hook ทำทุก action บนออเดอร์
//   A1: Optimistic update — UI เปลี่ยนทันที, rollback ถ้า fail
//   D1: Undo toast — กดผิดเลิกทำได้ 5 วิ
import { useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { toast } from './toast';

export function useOrderActions() {
  const qc = useQueryClient();

  // หา query keys ที่มี orders แล้ว patch ใน cache (optimistic)
  function patchOrderInCache(orderId, patch) {
    const snapshots = [];
    qc.getQueryCache().getAll().forEach((q) => {
      const data = q.state.data;
      if (!data?.orders) return;
      const idx = data.orders.findIndex((o) => o.orderId === orderId);
      if (idx === -1) return;
      snapshots.push({ key: q.queryKey, data });
      const newOrders = data.orders.map((o) =>
        o.orderId === orderId ? { ...o, ...patch } : o
      );
      qc.setQueryData(q.queryKey, { ...data, orders: newOrders });
    });
    return snapshots; // สำหรับ rollback
  }

  function rollback(snapshots) {
    snapshots.forEach(({ key, data }) => qc.setQueryData(key, data));
  }

  // core runner — optimistic + call API + undo support
  async function run({ orderId, patch, apiCall, successMsg, undo }) {
    const snapshots = patchOrderInCache(orderId, patch);   // ① UI เปลี่ยนทันที
    try {
      const res = await apiCall();                          // ② call server
      if (res?.ok === false) throw new Error(res.error || res.message || 'failed');

      // ③ success — แสดง toast (undo ถ้ามี)
      if (undo) {
        toast.undo(successMsg, async () => {
          // กดเลิกทำ → patch กลับ + call undo API
          patchOrderInCache(orderId, undo.patch);
          try { await undo.apiCall(); } catch(e) { toast.error('เลิกทำไม่สำเร็จ'); }
          qc.invalidateQueries();
        });
      } else {
        toast.success(successMsg);
      }
      // refetch เงียบๆ เพื่อ sync ตัวเลขจริง
      setTimeout(() => qc.invalidateQueries(), 300);
      return res;
    } catch (e) {
      rollback(snapshots);                                 // ④ fail → คืนค่าเดิม
      toast.error('ล้มเหลว: ' + e.message);
      throw e;
    }
  }

  return {
    // ✅ เปลี่ยนสถานะ
    setStatus: (order, status, label) => run({
      orderId: order.orderId,
      patch: { status },
      apiCall: () => api.status(order.orderId, status),
      successMsg: (label || 'เปลี่ยนสถานะ') + ' ' + (order.customerName || ''),
      undo: { patch: { status: order.status }, apiCall: () => api.status(order.orderId, order.status || 'preparing') }
    }),

    // 🚨 toggle urgent
    toggleUrgent: (order) => run({
      orderId: order.orderId,
      patch: { isUrgent: !order.isUrgent },
      apiCall: () => api.urgent(order.orderId, !order.isUrgent),
      successMsg: (!order.isUrgent ? '🚨 ตั้งด่วน ' : 'ปลดด่วน ') + (order.customerName || ''),
      undo: { patch: { isUrgent: order.isUrgent }, apiCall: () => api.urgent(order.orderId, order.isUrgent) }
    }),

    // 💰 mark paid
    markPaid: (order) => run({
      orderId: order.orderId,
      patch: { paymentStatus: 'Paid' },
      apiCall: () => api.paid(order.orderId),
      successMsg: '💰 ชำระแล้ว ' + (order.customerName || ''),
      undo: null  // mark paid ไม่ undo (slip จริง)
    }),

    // ✅ ส่งแล้ว (shortcut)
    markDelivered: (order) => run({
      orderId: order.orderId,
      patch: { status: 'completed', isPassed: true },
      apiCall: () => api.status(order.orderId, 'completed'),
      successMsg: '🎉 ส่งแล้ว ' + (order.customerName || ''),
      undo: { patch: { status: order.status, isPassed: order.isPassed }, apiCall: () => api.status(order.orderId, order.status || 'preparing') }
    }),

    // 🗑️ cancel
    cancel: (order) => run({
      orderId: order.orderId,
      patch: { status: '❌ ยกเลิก' },
      apiCall: () => api.cancel(order.orderId),
      successMsg: 'ยกเลิก ' + (order.customerName || ''),
      undo: { patch: { status: order.status }, apiCall: () => api.status(order.orderId, order.status || 'preparing') }
    }),

    // raw access เผื่อต้องใช้
    qc, patchOrderInCache, rollback
  };
}
