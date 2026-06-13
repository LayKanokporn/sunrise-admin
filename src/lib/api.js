// [v0.1] API client — ห่อ fetch + log + error handling
// [v0.4] รองรับ VITE_USE_MOCK=true → ใช้ mock data ไม่ต่อ API จริง
// ตามมาตรฐาน CLAUDE.md Habit 5: log ทุก request

import { mock } from './mock';

const API_BASE = import.meta.env.VITE_API_URL;
const USE_MOCK = String(import.meta.env.VITE_USE_MOCK||'').toLowerCase() === 'true';

function log(level, fn, msg, ctx) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] [api/${fn}] ${msg}` + (ctx ? ' | ' + JSON.stringify(ctx) : '');
  console.log(line);
}

async function call(action, params = {}) {
  const t0 = performance.now();
  const url = new URL(API_BASE);
  url.searchParams.set('api', action);
  Object.entries(params).forEach(([k,v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  });

  log('INFO', action, 'request', { params });
  try {
    const res = await fetch(url.toString(), { method: 'GET' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    // [v0.11/B3] duplicate ไม่ใช่ error — ส่งกลับให้ UI ถามยืนยัน
    if (!json.ok && !json.duplicate) throw new Error(json.error || 'API returned ok=false');
    log('TRACE', action, `${Math.round(performance.now()-t0)}ms`);
    return json;
  } catch(e) {
    log('ERROR', action, e.message, { params });
    throw e;
  }
}

if (USE_MOCK) console.log('[INFO] [api] MOCK MODE — ไม่ต่อ API จริง');

// [v0.5] เก็บ uid ของ admin ปัจจุบัน — write APIs ต้องใช้
let _currentUid = '';
export function setAuthUid(uid) { _currentUid = uid || ''; }

export const api = USE_MOCK ? mock : {
  verify: (uid) => call('verify', { uid }),
  orders: (params) => call('orders', params),
  production: (from, to) => call('production', { from, to }),
  stats: (month) => call('stats', { month }),
  ping: () => call('ping'),
  // write
  update:     (orderId, fields) => call('update', { uid:_currentUid, orderId, ...fields }),
  urgent:     (orderId, on)     => call('urgent', { uid:_currentUid, orderId, on: on?1:0 }),
  paid:       (orderId, slip)   => call('paid',   { uid:_currentUid, orderId, slip:slip||'', on:1 }),
  unpaid:     (orderId)         => call('paid',   { uid:_currentUid, orderId, on:0 }),
  cancel:     (orderId)         => call('cancel', { uid:_currentUid, orderId }),
  status:     (orderId, value)  => call('status', { uid:_currentUid, orderId, value }),
  note:       (orderId, value)  => call('note',   { uid:_currentUid, orderId, value }),
  addItem:    (orderId, item)   => call('addItem', { uid:_currentUid, orderId, ...item }),
  removeItem: (orderId, menu)   => call('removeItem', { uid:_currentUid, orderId, menu }),
  parseSave:  (text, force)     => call('parseSave', { uid:_currentUid, text, force: force ? 1 : '' }),
  // [v0.8] new endpoints
  search:     (q, limit)        => call('search', { q, limit }),
  customer:   (name)            => call('customer', { name }),
  menus:      ()                => call('menus'),
  newcount:   (since)           => call('newcount', { since }),
  audit:      (limit)           => call('audit', { limit })
};
