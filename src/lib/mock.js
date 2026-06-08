// [v0.4] Mock data — ใช้เมื่อ VITE_USE_MOCK=true (พัฒนา UI โดยไม่ต้องต่อ API)
const today = new Date();
const fmtISO = (d) => d.toISOString().slice(0,10);
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
    note: '',
    googleMap: '',
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
  // [v0.5] write — mock just mutates the in-memory array
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
  parseSave: (text) => {
    // mock: ไม่ parse จริง — แค่สร้างออเดอร์ปลอม
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
  }
};
