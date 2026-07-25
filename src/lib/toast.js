// Toast store — module-level pub/sub (ไม่พึ่ง lib)
//   รองรับ: success / error / undo (มีปุ่มเลิกทำ + countdown)
let toasts = [];
const listeners = new Set();
let nextId = 1;

function emit() {
  listeners.forEach((fn) => fn(toasts));
}

export function subscribeToasts(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getToasts() {
  return toasts;
}

function add(toast) {
  const id = nextId++;
  const t = { id, ...toast };
  toasts = [...toasts, t];
  emit();
  if (toast.duration !== 0) {
    setTimeout(() => dismiss(id), toast.duration || 2500);
  }
  return id;
}

export function dismiss(id) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export const toast = {
  success: (msg) => add({ type: 'success', msg, duration: 2200 }),
  error:   (msg) => add({ type: 'error',   msg, duration: 3500 }),
  info:    (msg) => add({ type: 'info',    msg, duration: 2500 }),
  // undo toast — มีปุ่ม "เลิกทำ" + countdown 5s
  undo: (msg, onUndo) => add({ type: 'undo', msg, onUndo, duration: 5000 })
};
