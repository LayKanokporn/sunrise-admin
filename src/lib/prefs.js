// [#prefs] Preferences store — density / pinned orders
//   pub/sub แบบเดียวกับ toast.js, persist ใน localStorage
//   logging: console ทุกการเปลี่ยน (Habit 5)
import { useEffect, useState } from 'react';

const KEY = 'sunrise.prefs';

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    const p = raw ? JSON.parse(raw) : {};
    return {
      density: p.density === 'compact' ? 'compact' : 'comfortable',
      pins: Array.isArray(p.pins) ? p.pins : []
    };
  } catch (e) {
    console.log(`[${new Date().toISOString()}] [WARN] [prefs/load] ${e.message}`);
    return { density: 'comfortable', pins: [] };
  }
}

let state = load();
const listeners = new Set();

function emit() {
  listeners.forEach((fn) => fn(state));
}
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { console.log(`[${new Date().toISOString()}] [ERROR] [prefs/persist] ${e.message}`); }
}
function set(patch) {
  state = { ...state, ...patch };
  console.log(`[${new Date().toISOString()}] [INFO] [prefs/set] ${JSON.stringify(patch)}`);
  persist();
  emit();
}

export const prefs = {
  get: () => state,
  setDensity: (d) => set({ density: d === 'compact' ? 'compact' : 'comfortable' }),
  toggleDensity: () => set({ density: state.density === 'compact' ? 'comfortable' : 'compact' }),
  // pin/unpin order
  togglePin: (orderId) => {
    const has = state.pins.includes(orderId);
    const pins = has ? state.pins.filter((x) => x !== orderId) : [orderId, ...state.pins];
    set({ pins });
    return !has;
  },
  isPinned: (orderId) => state.pins.includes(orderId)
};

// React hook — re-render เมื่อ prefs เปลี่ยน
export function usePrefs() {
  const [s, setS] = useState(state);
  useEffect(() => {
    const fn = (next) => setS(next);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);
  return s;
}

// เรียงออเดอร์: ปักหมุดขึ้นบนสุด (คงลำดับเดิมที่เหลือ)
export function sortPinned(orders) {
  const pins = state.pins;
  if (!pins.length) return orders;
  return [...orders].sort((a, b) => {
    const pa = pins.includes(a.orderId) ? 0 : 1;
    const pb = pins.includes(b.orderId) ? 0 : 1;
    return pa - pb;
  });
}
