// Mock data — ใช้เมื่อ VITE_USE_MOCK=true (พัฒนา UI โดยไม่ต้องต่อ API)
const today = new Date();
// FIX timezone — local date components
const fmtISO = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${dd}`;
};
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
const fmtTH = (d) => {
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const yy = d.getFullYear() + 543;
  return `${dd}/${mm}/${yy}`;
};

const shops = ['บ้านปู่ส่วนย่า คาแฟ่','ทูบา เอกมัย','April Cafe','ข้าวฟ่างคาเฟ่','Trust อารีย์','Sloth\'s Cafe','FB: Nootook'];
const menus = [
  { name:'มะพร้าวลูก',   unit:'ชิ้น', price:75 },
  { name:'ทีรามิสุ',     unit:'ชิ้น', price:75 },
  { name:'เอิร์ลเกรย์',  unit:'ชิ้น', price:75 },
  { name:'เค้กส้ม',      unit:'วง',   price:750 },
  { name:'ชีสเค้กหน้าไหม้', unit:'วง', price:850 },
  { name:'เรดเวลเวท',    unit:'วง',   price:750 }
];

function makeOrder(i, dayOffset) {
  const d = addDays(today, dayOffset);
  const shop = shops[i % shops.length];
  const itemCount = 1 + (i % 4);
  const items = Array.from({length: itemCount}, (_, k) => {
    const m = menus[(i+k) % menus.length];
    const qty = 1 + (k % 3);
    return { menuName:m.name, unit:m.unit, qty, unitPrice:m.price, itemTotal:m.price*qty };
  });
  const grandTotal = items.reduce((s,x) => s+x.itemTotal, 0);
  return {
    orderId: `ORD-${fmtISO(d).replace(/-/g,'')}-${String(i*1111).padStart(6,'0')}`,
    customerName: shop,
    phone: `08${String(i*7777).padStart(8,'0').slice(0,8)}`,
    channel: i % 2 === 0 ? 'LINE' : 'FB',
    deliveryDate: fmtTH(d),
    deliveryDateISO: fmtISO(d),
    deliveryTime: ['10:00','14:00','16:30','18:00'][i % 4],
    deliveryType: 'Delivery',
    location: `${i+10}/${i*2} หมู่บ้านตัวอย่าง ลำลูกกา ปทุมธานี`,
    grandTotal,
    deliveryFee: 0,
    paymentStatus: i % 3 === 0 ? 'Paid' : 'Pending',
    status: 'preparing',
    kitchenStatus: i % 2 ? 'รอทำ' : 'รับงานแล้ว',
    isUrgent: i % 7 === 0,
    isPassed: dayOffset < 0,
    note: i % 5 === 0 ? 'ลูกค้าขอไม่ใส่ถั่ว แพ้นม' : '',
    googleMap: '',
    updatedAt: fmtTH(d) + ' 09:00:00',
    updatedBy: 'liff:mockadmin',
    items
  };
}

// สร้าง mock 30 วัน (ย้อนหลัง 10 ถึงล่วงหน้า 20)
function genAll() {
  const all = [];
  let id = 1;
  for (let off = -10; off <= 20; off++) {
    const cnt = 1 + (Math.abs(off) % 5);
    for (let i = 0; i < cnt; i++) {
      all.push(makeOrder(id++, off));
    }
  }
  return all;
}

const ALL = genAll();

export const mock = {
  verify: () => Promise.resolve({ ok:true, isAdmin:true, uid:'mock...' }),
  orders: (params) => {
    let rows = ALL;
    if (params.date) rows = rows.filter(o => o.deliveryDateISO === params.date);
    if (params.from && params.to) rows = rows.filter(o => o.deliveryDateISO >= params.from && o.deliveryDateISO <= params.to);
    return Promise.resolve({ ok:true, count:rows.length, orders:rows });
  },
  production: (from, to) => {
    const rows = ALL.filter(o => o.deliveryDateISO >= from && o.deliveryDateISO <= to);
    const agg = {};
    const byDay = {};
    rows.forEach(o => {
      if (!byDay[o.deliveryDateISO]) byDay[o.deliveryDateISO] = {};
      o.items.forEach(it => {
        const k = it.menuName+'|'+it.unit;
        agg[k] = agg[k] || { menuName:it.menuName, unit:it.unit, qty:0 };
        agg[k].qty += it.qty;
        byDay[o.deliveryDateISO][k] = byDay[o.deliveryDateISO][k] || { menuName:it.menuName, unit:it.unit, qty:0 };
        byDay[o.deliveryDateISO][k].qty += it.qty;
      });
    });
    return Promise.resolve({
      ok:true, from, to,
      days: Object.keys(byDay).sort().map(d => ({
        date:d, dateTH:fmtTH(new Date(d)),
        menus: Object.values(byDay[d]).sort((a,b)=>b.qty-a.qty),
        totalQty: Object.values(byDay[d]).reduce((s,m)=>s+m.qty,0)
      })),
      totals: Object.values(agg).sort((a,b)=>b.qty-a.qty),
      totalRows: rows.length
    });
  },
  ping: () => Promise.resolve({ ok:true, ts:new Date().toISOString() }),
  // write — mock just mutates the in-memory array
  update: (orderId, fields) => {
    const o = ALL.find(x => x.orderId === orderId);
    if (!o) return Promise.resolve({ ok:false, error:'not found' });
    Object.assign(o, fields);
    return Promise.resolve({ ok:true });
  },
  urgent: (orderId, on) => {
    const o = ALL.find(x => x.orderId === orderId);
    if (o) o.isUrgent = !!on;
    return Promise.resolve({ ok:true });
  },
  paid: (orderId) => {
    const o = ALL.find(x => x.orderId === orderId);
    if (o) o.paymentStatus = 'Paid';
    return Promise.resolve({ ok:true });
  },
  unpaid: (orderId) => {
    const o = ALL.find(x => x.orderId === orderId);
    if (o) o.paymentStatus = 'Pending';
    return Promise.resolve({ ok:true });
  },
  announce: (orderId) => Promise.resolve({ ok:true, mode:'single', groups:1 }),
  announceDay: (date) => Promise.resolve({ ok:true, mode:'today', count:3, groups:1 }),
  cancel: (orderId) => {
    const i = ALL.findIndex(x => x.orderId === orderId);
    if (i >= 0) ALL.splice(i, 1);
    return Promise.resolve({ ok:true });
  },
  status: (orderId, value) => {
    const o = ALL.find(x => x.orderId === orderId);
    if (o) o.status = value;
    return Promise.resolve({ ok:true });
  },
  note: (orderId, value) => {
    const o = ALL.find(x => x.orderId === orderId);
    if (o) o.note = value;
    return Promise.resolve({ ok:true });
  },
  addItem: (orderId, item) => {
    const o = ALL.find(x => x.orderId === orderId);
    if (!o) return Promise.resolve({ ok:false });
    o.items.push({ menuName:item.menu, unit:item.unit, qty:+item.qty, unitPrice:Math.round(item.price/item.qty), itemTotal:+item.price });
    o.grandTotal += +item.price;
    return Promise.resolve({ ok:true, newGrand:o.grandTotal });
  },
  removeItem: (orderId, menu) => {
    const o = ALL.find(x => x.orderId === orderId);
    if (!o) return Promise.resolve({ ok:false });
    const i = o.items.findIndex(x => x.menuName === menu);
    if (i >= 0) { o.grandTotal -= o.items[i].itemTotal; o.items.splice(i,1); }
    return Promise.resolve({ ok:true, newGrand:o.grandTotal });
  },
  // new mocks
  search: (q, limit) => {
    const qq = (q||'').toLowerCase();
    const rows = ALL.filter(o =>
      (o.customerName||'').toLowerCase().includes(qq) ||
      (o.phone||'').includes(qq) ||
      (o.orderId||'').toLowerCase().includes(qq) ||
      (o.items||[]).some(it => (it.menuName||'').toLowerCase().includes(qq))
    ).slice(0, limit||30);
    return Promise.resolve({ ok:true, count:rows.length, query:q, orders:rows });
  },
  customer: (name) => {
    const nameLow = (name||'').toLowerCase().replace(/\s+/g,'');
    const rows = ALL.filter(o => {
      const c = (o.customerName||'').toLowerCase().replace(/\s+/g,'');
      return c === nameLow || c.includes(nameLow) || nameLow.includes(c);
    });
    let totalSpent = 0, totalItems = 0;
    const menuFreq = {};
    rows.forEach(o => {
      totalSpent += o.grandTotal;
      (o.items||[]).forEach(it => {
        totalItems += it.qty;
        menuFreq[it.menuName] = (menuFreq[it.menuName]||0) + it.qty;
      });
    });
    const topMenus = Object.keys(menuFreq).map(k => ({name:k, qty:menuFreq[k]}))
      .sort((a,b)=>b.qty-a.qty).slice(0,5);
    return Promise.resolve({
      ok:true, name, orderCount:rows.length, totalSpent, totalItems, topMenus,
      orders: rows.sort((a,b)=>b.deliveryDateISO.localeCompare(a.deliveryDateISO))
    });
  },
  menus: () => {
    const list = [
      { name:'เค้กมะพร้าว',       perPiece:75,  perWong:750, defaultUnit:'วง', usedCount:25 },
      { name:'ทีรามิสุ',         perPiece:75,  perWong:750, defaultUnit:'ชิ้น', usedCount:20 },
      { name:'ชีสเค้กหน้าไหม้',  perPiece:85,  perWong:850, defaultUnit:'วง', usedCount:18 },
      { name:'เรดเวลเวท',        perPiece:75,  perWong:750, defaultUnit:'วง', usedCount:15 },
      { name:'เอิร์ลเกรย์',      perPiece:75,  perWong:0,   defaultUnit:'ชิ้น', usedCount:12 },
      { name:'ชีสทาร์ตบลูเบอร์รี่', perPiece:75, perWong:750, defaultUnit:'วง', usedCount:10 },
      { name:'เค้กช็อกโกแลต',    perPiece:75,  perWong:750, defaultUnit:'วง', usedCount:8 },
      { name:'เค้กส้ม',          perPiece:75,  perWong:750, defaultUnit:'วง', usedCount:6 },
      { name:'นิวยอร์กชีสเค้ก',  perPiece:85,  perWong:850, defaultUnit:'วง', usedCount:5 }
    ];
    return Promise.resolve({ ok:true, count:list.length, menus:list });
  },
  newcount: (since) => Promise.resolve({
    ok:true, count: Math.floor(Math.random()*5), since,
    preview: ['ทูบา', 'บ้านปูสวน', 'April Cafe'].slice(0, Math.floor(Math.random()*4))
  }),
  parseSave: (text) => {
    const id = 'ORD-' + Date.now();
    ALL.unshift({
      orderId: id, customerName: '(mock จาก parseSave)', phone: '', channel: 'LIFF',
      deliveryDate: fmtTH(today), deliveryDateISO: fmtISO(today),
      deliveryTime: '', deliveryType: 'Delivery', location: '',
      grandTotal: 500, deliveryFee: 0, paymentStatus: 'Pending', status: 'preparing',
      kitchenStatus: 'รอทำ', isUrgent: false, isPassed: false, note: '', googleMap: '',
      items: [{ menuName:'(mock item)', unit:'ชิ้น', qty:1, unitPrice:500, itemTotal:500 }]
    });
    return Promise.resolve({ ok:true, orderId:id, customer:'(mock)', total:500, items:1 });
  },
  // new endpoints
  search: (q, limit) => {
    const ql = q.toLowerCase();
    const found = ALL.filter(o =>
      o.customerName.toLowerCase().includes(ql) ||
      o.phone.includes(q) ||
      o.orderId.includes(q) ||
      o.items.some(it => it.menuName.toLowerCase().includes(ql))
    ).slice(0, limit || 30);
    return Promise.resolve({ ok:true, count:found.length, query:q, orders:found });
  },
  customer: (name) => {
    const nameLow = name.toLowerCase().replace(/\s+/g,'');
    const found = ALL.filter(o => o.customerName.toLowerCase().replace(/\s+/g,'').includes(nameLow));
    const totalSpent = found.reduce((s,o) => s + o.grandTotal, 0);
    const totalItems = found.reduce((s,o) => s + o.items.reduce((s2,it)=>s2+it.qty,0), 0);
    const menuFreq = {};
    found.forEach(o => o.items.forEach(it => menuFreq[it.menuName] = (menuFreq[it.menuName]||0) + it.qty));
    const topMenus = Object.entries(menuFreq).map(([name,qty])=>({name,qty}))
      .sort((a,b)=>b.qty-a.qty).slice(0,5);
    return Promise.resolve({
      ok:true, name, orderCount:found.length, totalSpent, totalItems,
      topMenus, orders:found.sort((a,b)=>(b.deliveryDateISO||'').localeCompare(a.deliveryDateISO||''))
    });
  },
  menus: () => Promise.resolve({
    ok:true,
    menus: menus.map(m => ({
      name:m.name, perPiece:m.unit==='ชิ้น'?m.price:0, perWong:m.unit==='วง'?m.price:0,
      defaultUnit:m.unit, source:'master', usedCount:Math.floor(Math.random()*30)
    }))
  }),
  audit: (limit) => Promise.resolve({
    ok:true,
    entries: ALL.slice(0, limit || 50).map((o, i) => ({
      orderId:o.orderId, customerName:o.customerName, status:o.status,
      grandTotal:o.grandTotal, isUrgent:o.isUrgent, isCancelled:false,
      updatedAt: fmtTH(today) + ' ' + String(10+(i%12)).padStart(2,'0') + ':' + String((i*7)%60).padStart(2,'0') + ':00',
      updatedBy: i%3===0 ? '📱 เว็บ (U4e4f3fa)' : i%3===1 ? '💬 LINE' : '📄 Sheet'
    }))
  }),
  // timeline ราย order (mock)
  orderlog: (orderId) => Promise.resolve({
    ok: true, orderId,
    entries: [
      { at: fmtTH(today) + ' 11:02:08', action: 'status',  by: '📱 เว็บ (พี่หม่อน)' },
      { at: fmtTH(today) + ' 10:45:30', action: 'paid',    by: '📱 เว็บ (พี่หม่อน)' },
      { at: fmtTH(today) + ' 09:12:00', action: 'update',  by: '💬 LINE' }
    ]
  }),
  // mock
  team: () => Promise.resolve({
    ok: true, onlineCount: 2,
    members: [
      { userId:'u1', name:'พี่หม่อน', role:'แอดมิน', avatar:'👩‍🍳', online:true, lastActiveAt:Date.now(), points:12, breakdown:{created:8,delivered:3,urgent_ontime:1} },
      { userId:'u2', name:'น้องมิ้นท์', role:'คนส่ง', avatar:'🛵', online:true, lastActiveAt:Date.now()-60000, points:8, breakdown:{created:3,delivered:5} },
      { userId:'u3', name:'พี่แจ็ค', role:'แม่ครัว', avatar:'👨‍🍳', online:false, lastActiveAt:Date.now()-3600000, points:5, breakdown:{created:5} }
    ]
  }),
  teamHeartbeat: () => Promise.resolve({ ok:true }),
  teamProfile: () => Promise.resolve({ ok:true })
};
