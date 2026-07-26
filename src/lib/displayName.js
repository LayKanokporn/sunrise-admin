// ชื่อที่ใช้แสดงบนการ์ด/ปฏิทิน
// ปัญหาที่แก้: บางออเดอร์ไม่มีชื่อลูกค้า หรือ parser ดันเอาวันที่ไปใส่ช่องชื่อ
//   ทำให้ปฏิทินขึ้นเป็น "15 กรกฎาคม 256..." แทนที่จะเป็นชื่อร้าน
// ทางออก: ถ้าชื่อใช้ไม่ได้ ให้ดึงชื่อช่องทาง (Line:PalmJi / FB:Thanabodee) จากที่อยู่มาแสดงแทน

// "15 กรกฎาคม 2569" / "15/07/2569" / "15-07-2569" -> ถือว่าไม่ใช่ชื่อคน
function looksLikeDate(s) {
  return /^\d{1,2}\s*[/\-]\s*\d{1,2}\s*[/\-]\s*\d{2,4}/.test(s)
      || /^\d{1,2}\s*[ก-๙.]{2,}\s*\d{4}/.test(s);
}

// จับ "Line:PalmJi" "FB: Thanabodee" "IG:xxx" — เว้นวรรคหลัง : ได้ (เจอในข้อมูลจริง)
const HANDLE = /((?:FB|Facebook|IG|Line|LINE)\s*[:：]\s*[^\s,|]+)/i;

function pickHandle(...sources) {
  for (const src of sources) {
    const m = String(src || '').match(HANDLE);
    if (m) return m[1].replace(/\s*[:：]\s*/, ':').trim();
  }
  return '';
}

export function orderDisplayName(order) {
  if (!order) return '-';
  const raw = String(order.customerName || '').trim();
  // ตัด prefix ช่องทางที่ไม่ได้บอกอะไร ("FB:" / "Line OA:" ลอย ๆ หน้าชื่อจริง)
  const clean = raw.replace(/^(FB|Line OA)\s*[:\-]?\s*/i, '').trim();

  if (clean && !looksLikeDate(clean)) return clean;

  // ชื่อว่าง หรือชื่อเป็นวันที่ -> ใช้ชื่อช่องทางแทน
  // ถ้าหา handle ไม่เจอก็ใช้ orderId — ไม่ถอยกลับไปโชว์ clean เพราะถึงตรงนี้
  // clean มีแต่ค่าว่างหรือวันที่ ซึ่งวันที่คือตัวปัญหาที่ทำให้ปฏิทินอ่านไม่รู้เรื่อง
  return pickHandle(order.location, order.note, raw) || order.orderId || '-';
}
