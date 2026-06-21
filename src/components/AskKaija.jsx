// [#drq] ผู้ช่วยนำทางลอย "ถามไก่จ๋า" — อิงไอเดียจากน้อง DrQ (CONT)
//   rule-based ก่อน (ยังไม่ต่อ AI) — ตอบคำถาม "ปุ่มไหนทำอะไร" + ลัดไปหน้าที่ต้องการ
//   logging: console ทุกครั้งที่ผู้ใช้ถาม (Habit 5)
import { useState, useRef, useEffect } from 'react';
import { X, Send } from 'lucide-react';

function log(level, fn, msg, ctx) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [${level}] [AskKaija/${fn}] ${msg}` + (ctx ? ' | ' + JSON.stringify(ctx) : ''));
}

// ลัดไปแต่ละหน้า — แสดงเป็นปุ่มในพาเนล
const QUICK = [
  { label: '📅 ปฏิทินส่ง',   tab: 'calendar' },
  { label: '🗂️ Kanban',      tab: 'kanban'   },
  { label: '🍰 ของต้องทำ',   tab: 'production' },
  { label: '📈 ยอดขาย/KPI',  tab: 'kpi'      },
  { label: '🕘 ประวัติ',     tab: 'audit'    }
];

// ฐานความรู้ rule-based — keyword → คำตอบ (+ action ถ้ามี)
const KB = [
  { kw: ['ยอด','ขาย','เงิน','รายได้','aov','เป้า','kpi'], a: 'ดูยอดขาย/เป้าเดือน/AOV ได้ที่แท็บ "KPI" — เลือกเดือนได้ มีกราฟ 14 วัน และยอดขายตามช่วงวันที่ด้วย', tab: 'kpi' },
  { kw: ['เพิ่ม','สร้าง','ออเดอร์ใหม่','กรอก','paste'], a: 'เพิ่มออเดอร์: กดปุ่ม + สีส้มมุมขวาล่างในหน้าปฏิทิน แล้ว paste ข้อความออเดอร์ ระบบ parse ให้อัตโนมัติ', tab: 'calendar' },
  { kw: ['ค้นหา','หา','search','ลูกค้า'], a: 'ค้นหาออเดอร์/ลูกค้า: กดแว่นขยายบนแถบบนสุด หรือพิมพ์ชื่อร้านได้เลย', search: true },
  { kw: ['ค้างชำระ','ยังไม่จ่าย','จ่าย','ชำระ'], a: 'ออเดอร์ค้างชำระ: ในปฏิทินกดการ์ด "ค้างชำระ" จะ filter ให้ — ออเดอร์ที่ส่งแล้วแต่ยังไม่จ่ายจะขึ้น badge แดง', tab: 'calendar' },
  { kw: ['ด่วน','urgent'], a: 'ออเดอร์ด่วน: กดการ์ด "ด่วน" ในปฏิทินเพื่อ filter หรือปัดขวาบนการ์ดออเดอร์เพื่อตั้งด่วน (มือถือ)', tab: 'calendar' },
  { kw: ['ผลิต','ทำเค้ก','รวมเมนู','อบ'], a: 'รวมเมนูที่ต้องทำ + จำนวน: ดูที่แท็บ "ผลิต" เลือกช่วงวันได้ (วันนี้/พรุ่งนี้/3วัน/7วัน)', tab: 'production' },
  { kw: ['แก้','เปลี่ยนวัน','เลื่อน','reschedule'], a: 'แก้ออเดอร์: กดที่ออเดอร์ → แท็บ "ข้อมูล" แก้วันส่ง/เวลา/ที่อยู่ได้ ไม่ต้องยกเลิกแล้วสร้างใหม่' },
  { kw: ['ปฏิทิน','วันส่ง','calendar'], a: 'ปฏิทินส่ง: กดวันเพื่อดูออเดอร์วันนั้น กดชื่อเดือนเพื่อข้ามเดือน กดช่องว่างเพื่อเพิ่มออเดอร์วันนั้น', tab: 'calendar' },
  { kw: ['ประกาศ','กลุ่ม','line','แจ้ง'], a: 'ประกาศเข้ากลุ่ม LINE: เปิดออเดอร์ → ปุ่ม "ประกาศเข้ากลุ่ม" หรือในปฏิทินกด "ประกาศ" เพื่อส่งทั้งวัน' }
];

function answer(text) {
  const q = text.toLowerCase();
  const hit = KB.find((r) => r.kw.some((k) => q.includes(k)));
  if (hit) return hit;
  return { a: 'ลองถามเช่น "ดูยอดขาย", "เพิ่มออเดอร์", "ค้างชำระ", "ของต้องทำวันนี้" หรือกดปุ่มลัดด้านบนได้เลย' };
}

export default function AskKaija({ onNavigate, onOpenSearch }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [msgs, setMsgs] = useState([
    { from: 'bot', text: 'สวัสดีค่ะ 🐔 ไก่จ๋าช่วยนำทางเอง — อยากทำอะไร พิมพ์ถามหรือกดปุ่มลัดได้เลย' }
  ]);
  const bodyRef = useRef(null);

  useEffect(() => {
    if (open) bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs, open]);

  function send(text) {
    const q = (text ?? input).trim();
    if (!q) return;
    log('INFO', 'send', 'ask', { q });
    const res = answer(q);
    setMsgs((m) => [...m, { from: 'me', text: q }, { from: 'bot', text: res.a, action: res }]);
    setInput('');
  }

  function doAction(action) {
    if (action.tab) { onNavigate(action.tab); setOpen(false); }
    else if (action.search) { onOpenSearch(); setOpen(false); }
  }

  return (
    <>
      {/* ปุ่มลอย — มุมซ้ายล่าง (เลี่ยงชน FAB เพิ่มออเดอร์มุมขวา) */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-20 sm:bottom-6 left-4 z-30 flex items-center gap-1.5 pl-2 pr-3 py-2 rounded-full bg-white border border-slate-200 shadow-lg hover:shadow-xl transition-shadow"
          title="ถามไก่จ๋า ผู้ช่วยนำทาง">
          <span className="text-xl">🐔</span>
          <span className="text-sm font-semibold text-slate-700">ถามไก่จ๋า</span>
        </button>
      )}

      {/* พาเนลแชท */}
      {open && (
        <div className="fixed bottom-20 sm:bottom-6 left-4 right-4 sm:right-auto sm:w-[360px] z-40 bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[70vh]">
          <div className="flex items-center justify-between p-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="text-xl">🐔</span>
              <div className="font-bold text-sm">ถามไก่จ๋า</div>
            </div>
            <button onClick={() => setOpen(false)} className="btn btn-ghost p-1"><X size={18} /></button>
          </div>

          {/* ปุ่มลัด */}
          <div className="flex gap-1.5 flex-wrap p-3 pb-2 border-b border-slate-100">
            {QUICK.map((q) => (
              <button key={q.tab} onClick={() => { onNavigate(q.tab); setOpen(false); }}
                className="px-2 py-1 rounded-full bg-slate-100 hover:bg-sunrise-100 text-xs font-medium text-slate-700">
                {q.label}
              </button>
            ))}
          </div>

          {/* ข้อความ */}
          <div ref={bodyRef} className="flex-1 overflow-y-auto p-3 space-y-2">
            {msgs.map((m, i) => (
              <div key={i} className={m.from === 'me' ? 'text-right' : ''}>
                <div className={'inline-block px-3 py-2 rounded-2xl text-sm max-w-[85%] text-left ' +
                  (m.from === 'me' ? 'bg-sunrise-500 text-white' : 'bg-slate-100 text-slate-700')}>
                  {m.text}
                </div>
                {m.action && (m.action.tab || m.action.search) && (
                  <div className="mt-1">
                    <button onClick={() => doAction(m.action)}
                      className="text-xs text-sunrise-600 font-semibold underline">
                      ไปที่นั่นเลย →
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* input */}
          <div className="p-2 border-t border-slate-100 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
              placeholder="พิมพ์คำถาม… เช่น ดูยอดขาย"
              className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:border-sunrise-500"
            />
            <button onClick={() => send()} className="btn btn-primary px-3"><Send size={16} /></button>
          </div>
        </div>
      )}
    </>
  );
}
