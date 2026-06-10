// [v0.9] InlineStatusBar — ปุ่มเลื่อนสถานะบนการ์ด kanban (ไม่ต้องเปิด modal)
//   preparing → ready → enroute → done  (กด → next)
import { ChevronRight } from 'lucide-react';
import { useOrderActions } from '../lib/useOrderActions';

const flow = [
  { key: 'preparing', label: '🍰 ทำ',    next: 'ready',     nextLabel: 'พร้อมส่ง' },
  { key: 'ready',     label: '✅ พร้อม',  next: '🚗 ออกส่ง', nextLabel: 'ออกส่ง' },
  { key: 'enroute',   label: '🚗 ส่ง',    next: 'completed', nextLabel: 'ส่งแล้ว' },
  { key: 'done',      label: '🎉 เสร็จ',  next: null,        nextLabel: null }
];

function currentStage(order) {
  const st = (order.status || '').toLowerCase();
  if (/completed|delivered|ส่งแล้ว/.test(st) || order.isPassed) return 3;
  if (/enroute|ออกส่ง/.test(st)) return 2;
  if (/ready|พร้อมส่ง|รับงาน/.test(st)) return 1;
  return 0;
}

export default function InlineStatusBar({ order }) {
  const actions = useOrderActions();
  const stage = currentStage(order);
  const cur = flow[stage];

  if (!cur.next) {
    return <div className="text-[11px] text-slate-400 text-center py-1">🎉 ส่งเรียบร้อย</div>;
  }

  const nextStatus = stage === 2 ? 'completed' : (stage === 1 ? '🚗 ออกส่ง' : 'ready');

  return (
    <button
      data-no-card-click
      onClick={(e) => { e.stopPropagation(); actions.setStatus(order, nextStatus, 'เลื่อน → ' + cur.nextLabel); }}
      className="w-full mt-1.5 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-medium text-slate-700 hover:border-sunrise-400 hover:text-sunrise-600 transition-colors flex items-center justify-center gap-1">
      {cur.label} <ChevronRight size={13} /> {cur.nextLabel}
    </button>
  );
}
