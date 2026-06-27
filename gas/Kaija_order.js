// ============================================================
// 🐔 SUNRISE ORDER BOT — v3.5
// v3.4: cleanMenuName, normalizeDateText, normalizeDeliveryTime,
//        parseAddonItem, saveOrderToSheet normalize, reviewFlag,
//        วันนี้/พรุ่งนี้/วันX, splitCustomerAndSlot, dup-check,
//        menu check, map alias, buildSaveSuccessText, test wrappers
// v3.5 PATCH:
//   [FIX-1] normalizeDateText_: serial BE year (244447) → dd/MM/yyyy BE ถูกต้อง
//   [FIX-2] normalizeDeliveryTime_: decimal fraction (0.4375) → HH:MM
//   [FIX-3] cleanMenuName_: รองรับ "- •" double prefix และ ")" prefix
//   [NEW-1]  plan 7 → buildPlan7TextFast_(): Flex Carousel (1 วัน = 1 Card, แยกร้าน)
//   [NEW-2]  plan DD/MM → ดูรายละเอียดวันที่เฉพาะแบบ Flex
//   [NEW-3]  loadAliasMaster_(): โหลด alias จาก Alias_Master sheet
//   [NEW-4]  resolveMenuAlias() เช็ก Alias_Master ก่อน MENU_ALIAS hardcode
// ============================================================

// ============================================================
// CONFIG
// ============================================================
// อ่าน token จาก Script Properties ก่อน, fallback เป็น hard-code (legacy)
// ตั้งครั้งเดียว: เรียกฟังก์ชัน setupLineToken() ใน editor หรือ Project Settings → Script Properties
//   key = LINE_CHANNEL_ACCESS_TOKEN
// แล้วลบ literal ด้านล่างทิ้งได้ (เพื่อไม่ให้ token หลุดถ้าแชร์โค้ด)
var LINE_CHANNEL_ACCESS_TOKEN = (function() {
  try {
    var fromProps = PropertiesService.getScriptProperties().getProperty("LINE_CHANNEL_ACCESS_TOKEN");
    if (fromProps) return fromProps;
  } catch(e) {}
  return "Xulquf7u1tbLgexIT2UKS7B10DljypVEI7inLTVC0hn4Ne+Y/U+dOLHRc7l86No0+EtfHDeXEw03YcvZ+M2YDApLGt+TxBciysNu9irbPKcM8Kven0sfLvJxHFgiuMIPNpqna8xEMvoVh369O0ll+gdB04t89/1O/w1cDnyilFU=";
})();
var GEMINI_API_KEY            = ""; // optional
var SHEET_NAME                = "Orders";
var LOG_SHEET_NAME            = "Message_Log";
// [#team] Gamified team board — leaderboard + heartbeat (online status)
var TEAM_SHEET_NAME           = "Team";
var TEAM_POINTS_SHEET_NAME    = "TeamPoints";
var TEAM_HEARTBEAT_PFX        = "team_hb_";
var TEAM_ONLINE_WINDOW_MS     = 5 * 60 * 1000;
var TIMEZONE                  = "Asia/Bangkok";
var SPREADSHEET_ID            = "1H8zPjxsXzHyxU4EfEfz1DQ6pS2aeKHOfGtRgiqb6Cqo";

// Drive folder สำหรับเก็บสลิปโอนเงินจากลูกค้า
// ลิงก์: https://drive.google.com/drive/folders/1p6bvrSYnC5H9wsGutBVhUjDDxzbFPyKr
var SLIP_DRIVE_FOLDER_ID      = "1p6bvrSYnC5H9wsGutBVhUjDDxzbFPyKr";

// [v3.5] ADMIN_USER_IDS — userId เต็ม 33 ตัว (เดิมตัดสั้น → push fail 400)
var ADMIN_USER_IDS = [
  "U1c711cb38826f95e3e3f4302fd089771",  // Lay
  "Uca1783c1b9dcbfc170e02d514de1ad40",  // พี่หม่อน
  "U90769956596bfd1f4216e96f092a6ecc",  // พี่สุ
  "Ufd48a13230729446ddba8e14dc5a79e9",
  "U4897fb1257b652dc1d3aaffc7e8f9282",
  "U9937d9e6dbfd3f5a007124e423812bf4"
];

// [v3.6] USER_NAMES — แสดงชื่อแทน userId ในแจ้งเตือน/audit log
var USER_NAMES = {
  "U1c711cb38826f95e3e3f4302fd089771": "Lay",
  "Uca1783c1b9dcbfc170e02d514de1ad40": "พี่หม่อน",
  "U90769956596bfd1f4216e96f092a6ecc": "พี่สุ"
};
function nameOf_(uid) {
  if (!uid) return "line";
  var u = String(uid);
  if (USER_NAMES[u]) return USER_NAMES[u];
  // รองรับกรณีถูกตัดสั้น (8-15 ตัว) จาก audit log เก่า
  var keys = Object.keys(USER_NAMES);
  for (var i=0; i<keys.length; i++) {
    if (keys[i].indexOf(u) === 0 || u.indexOf(keys[i].substring(0,8)) === 0) return USER_NAMES[keys[i]];
  }
  return u.substring(0,8) + "...";
}

// [v3.5] NOTIFY_TO_USER_IDS — รับแจ้งเตือนออเดอร์ใหม่/cancel/status
var NOTIFY_TO_USER_IDS = [
  "U1c711cb38826f95e3e3f4302fd089771",  // Lay
  "Uca1783c1b9dcbfc170e02d514de1ad40",  // พี่หม่อน
  "U90769956596bfd1f4216e96f092a6ecc",  // พี่สุ
  "Ufd48a13230729446ddba8e14dc5a79e9",
  "U4897fb1257b652dc1d3aaffc7e8f9282",
  "U9937d9e6dbfd3f5a007124e423812bf4"
];

// ── Feature flags ──
// [v3.5.6] OPEN_ACCESS — true = ใครก็ตามที่ login LINE ดู Dashboard ได้ (เปิดให้ทุกคน)
//   false = เฉพาะ ADMIN_USER_IDS + NOTIFY_TO_USER_IDS เท่านั้น (default ปลอดภัยกว่า)
var DASHBOARD_OPEN_ACCESS      = true;   // ⚠️ true = ทุก LINE user เข้า dashboard ได้ (อ่าน)
// [v3.6.5] DASHBOARD_OPEN_WRITE — true = ทุก LINE user แก้/เพิ่ม/ลบออเดอร์ได้
//   ⚠️ ปลอดภัยน้อย: คนที่ได้ link จะแก้ของกันได้
//   ⚠️ ตอนนี้ true เพราะแอดมินอยากให้ทีมเปิดออเดอร์ได้ผ่านเว็บ
var DASHBOARD_OPEN_WRITE       = true;
var ENABLE_AI_AUTO_REPLY       = false;
// [#quota] ปิดเพื่อประหยัด push quota — ทุกครั้งที่มีคนกรอก/ยกเลิกออเดอร์ ไม่ต้อง push 1:1 หาแอดมินอีก
//   เปิดกลับได้ทันทีถ้าต้องการ (set = true)
var ENABLE_PUSH_NEW_ORDER      = false;
var ENABLE_PUSH_CANCEL         = false;
var ENABLE_PUSH_STATUS         = true;
var ENABLE_PUSH_UPCOMING       = true;
var ENABLE_DIRECT_SHEET_EDIT   = true;
var GROUP_STANDBY_MINUTES      = 10;

// สลิป: ปิดในกลุ่มสนิท (รับเฉพาะแชท 1:1) — กันบอตเด้ง error ทุกรูปในกลุ่ม
var ENABLE_SLIP_FEATURE        = true;   // false = ปิดสลิปทั้งระบบ
var ENABLE_SLIP_IN_GROUP       = false;  // false = ไม่รับสลิปในกลุ่ม/room เด็ดขาด

// ── Display limits ──
var SUMMARY_MONTH_DISPLAY_LIMIT  = 4;
var LINE_REPLY_PAYLOAD_SOFT_LIMIT = 40000;
var SUMMARY_7_DAY_BUBBLE_LIMIT   = 4;
var SUMMARY_DAY_DELIVERY_LIMIT   = 4;
var SUMMARY_MENU_ROW_LIMIT       = 8;
var SUMMARY_CHANNEL_LIMIT        = 8;
var SUMMARY_TOP_MENU_LIMIT       = 8;
var ORDER_ROWS_DEFAULT_LIMIT     = 300;

// ── Cache TTL (วินาที) ──
var CACHE_TTL_SHEET    = 120;
var CACHE_TTL_HEADER   = 600;
var CACHE_TTL_INDEX    = 120;
var CACHE_TTL_MONTH    = 600;
var CACHE_TTL_SUMMARY7 = 300;

var SHOP_NAME      = "Sunrise เค้กคาเฟ่สไตล์โฮมเมดราคาส่ง";
var SHOP_HOURS     = "09:00 - 18:00";
var SHOP_AREA      = "ลำลูกกา สายไหม รังสิต";
var SHOP_MAP_URL   = "https://maps.app.goo.gl/tuUZKpKzoS99agtb9?g_st=ic";
var PLAN7_TEXT_LIMIT = 4500;

// [v3.5.5] LIFF Dashboard URL — ปุ่ม "📥 เปิด Dashboard" ใน notification
//   ใช้ liff.line.me/<LIFF_ID> เพื่อเปิดใน LINE in-app browser
//   ถ้าเปิดจาก desktop จะ redirect ไป Vercel โดยอัตโนมัติ
var LIFF_DASHBOARD_URL = "https://liff.line.me/2010252909-W29OzwLC";

// ============================================================
// ★ NEW v3.1 — MENU ALIAS (ชื่อย่อ/ชื่อเล่น → ชื่อมาตรฐาน)
// ============================================================
var MENU_ALIAS = {
  // มะพร้าว
  "มะพร้าว":    "เค้กมะพร้าว",
  "coconut":    "เค้กมะพร้าว",
  "cocoขาว":   "เค้กมะพร้าวขาว",
  // หน้าไหม้
  "หน้าไหม้":   "ชีสเค้กหน้าไหม้",
  "burnt":      "ชีสเค้กหน้าไหม้",
  "basque":     "ชีสเค้กหน้าไหม้",
  // สตรอเบอรี่
  "สตอ":        "เค้กสตรอเบอรี่",
  "สตรอ":       "เค้กสตรอเบอรี่",
  "strawberry": "เค้กสตรอเบอรี่",
  "สตรอเบอรี่": "เค้กสตรอเบอรี่",
  // เรดเวลเวท
  "เรดเวล":     "เรดเวลเวท",
  "เรด":        "เรดเวลเวท",
  "redvelvet":  "เรดเวลเวท",
  "red velvet": "เรดเวลเวท",
  // ชีสทาร์ต
  "ทาร์ต":      "ชีสทาร์ต",
  "tart":       "ชีสทาร์ต",
  "ชีสทาร์ต":   "ชีสทาร์ต",
  // บลูเบอร์รี่
  "บลู":        "ชีสทาร์ตบลูเบอร์รี่",
  "ทาร์ตบลู":   "ชีสทาร์ตบลูเบอร์รี่",
  "blue":       "ชีสทาร์ตบลูเบอร์รี่",
  // ช็อกโกแลต
  "ช็อก":       "เค้กช็อกโกแลต",
  "ช็อค":       "เค้กช็อกโกแลต",
  "choc":       "เค้กช็อกโกแลต",
  "chocolate":  "เค้กช็อกโกแลต",
  // ส้ม
  "ส้ม":        "เค้กส้ม",
  "orange":     "เค้กส้ม",
  // ทุเรียน
  "ทุเรียน":    "เค้กทุเรียน",
  "durian":     "เค้กทุเรียน",
  // กาแฟ
  "กาแฟ":       "เค้กกาแฟ",
  "coffee":     "เค้กกาแฟ",
  // นิวยอร์ก
  "นิวยอร์ก":   "นิวยอร์กชีสเค้ก",
  "ny":         "นิวยอร์กชีสเค้ก",
  "newyork":    "นิวยอร์กชีสเค้ก",
  // black forest
  "blackforest":"เค้ก Black Forest",
  "บลาคฟอร์เรส":"เค้ก Black Forest",
  // บราวนี่
  "บราวนี่":    "บราวนี่",
  "brownie":    "บราวนี่",
  // oreo banoffee
  "โอรีโอ":     "Oreo Banoffee",
  "banoffee":   "Oreo Banoffee",
  "บาน":        "Oreo Banoffee",
  // ชีสมะพร้าว
  "ชีสมะพร้าว": "ชีสเค้กมะพร้าว",
  // ผลไม้รวม
  "ผลไม้รวม":   "เค้กผลไม้รวม",
  "ผลไม้":      "เค้กผลไม้รวม",
  // มินิ
  "มินิ":       "มินิเค้กรวมรส",
  "mini":       "มินิเค้กรวมรส",
  // หมี
  "หน้าหมี":    "เค้กหน้าหมี",
  // ชีสบลู
  "ชีสบลู":     "ชีสทาร์ตบลูเบอร์รี่"
};

// ============================================================
// ★ NEW v3.1 — PRICE MASTER (ราคาต่อวง / ต่อชิ้น)
// ============================================================
var PRICE_MASTER = {
  // รูปแบบ: menuName: { perPiece: N, perWong: N, tier: "A"|"B"|"C" }
  "เค้กมะพร้าว":          { perPiece: 75,  perWong: 750,  tier: "A" },
  "เค้กมะพร้าวขาว":       { perPiece: 75,  perWong: 750,  tier: "A" },
  "ชีสเค้กหน้าไหม้":      { perPiece: 85,  perWong: 850,  tier: "B" },
  "เรดเวลเวท":            { perPiece: 75,  perWong: 750,  tier: "A" },
  "ชีสทาร์ต":             { perPiece: 75,  perWong: 750,  tier: "A" },
  "ชีสทาร์ตบลูเบอร์รี่":  { perPiece: 75,  perWong: 750,  tier: "A" },
  "เค้กช็อกโกแลต":        { perPiece: 75,  perWong: 750,  tier: "A" },
  "เค้กส้ม":              { perPiece: 75,  perWong: 750,  tier: "A" },
  "เค้กทุเรียน":           { perPiece: 85,  perWong: 850,  tier: "B" },
  "เค้กกาแฟ":             { perPiece: 75,  perWong: 750,  tier: "A" },
  "นิวยอร์กชีสเค้ก":      { perPiece: 85,  perWong: 850,  tier: "B" },
  "เค้ก Black Forest":    { perPiece: 85,  perWong: 850,  tier: "B" },
  "บราวนี่":              { perPiece: 75,  perWong: 0,    tier: "A" },
  "Oreo Banoffee":        { perPiece: 75,  perWong: 750,  tier: "A" },
  "ชีสเค้กมะพร้าว":       { perPiece: 85,  perWong: 850,  tier: "B" },
  "เค้กผลไม้รวม":         { perPiece: 85,  perWong: 850,  tier: "B" },
  "มินิเค้กรวมรส":        { perPiece: 75,  perWong: 0,    tier: "A" },
  "เค้กหน้าหมี":          { perPiece: 85,  perWong: 850,  tier: "B" },
  "เค้กสตรอเบอรี่":       { perPiece: 85,  perWong: 850,  tier: "B" },
  "เค้กวันเกิด":          { perPiece: 0,   perWong: 899,  tier: "C" },
  // add-on
  "__addon_choc__":        { perPiece: 10,  perWong: 0,    tier: "addon", label: "เพิ่มช็อก (คู่)" },
  "__addon_fruit__":       { perPiece: 0,   perWong: 50,   tier: "addon", label: "เพิ่มผลไม้" },
  "__addon_berry__":       { perPiece: 0,   perWong: 50,   tier: "addon", label: "เพิ่มสตรอเบอรี่สด" }
};

// default tier pricing (ถ้าไม่เจอใน PRICE_MASTER)
var PRICE_TIER_DEFAULT = { A: { perPiece: 75, perWong: 750 }, B: { perPiece: 85, perWong: 850 } };

// ============================================================
// ★ NEW v3.1 — DELIVERY SLOT MAP
// ============================================================
var DELIVERY_SLOT_ALIAS = {
  "เช้า":     "รอบเช้า",
  "รอบเช้า":  "รอบเช้า",
  "บ่าย":     "รอบบ่าย",
  "รอบบ่าย":  "รอบบ่าย",
  "เย็น":     "รอบเย็น",
  "รอบเย็น":  "รอบเย็น",
  "ศุกร์":    "รอบวันศุกร์",
  "เสาร์":    "รอบวันเสาร์",
  "อาทิตย์":  "รอบวันอาทิตย์",
  "พรุ่งนี้": "พรุ่งนี้",
  "วันนี้":   "วันนี้"
};

// ============================================================
// ★ NEW v3.4 — NORMALIZE HELPERS
// ============================================================

// [FIX-3] cleanMenuName_ — ลบ prefix -, •, 1.), ) หน้าชื่อเมนู (loop จนหมด)
function cleanMenuName_(name) {
  var s = String(name||"").trim();
  var prev = "";
  while (s !== prev) {
    prev = s;
    s = s.replace(/^[\s\-\–\—•*]+/, ""); // bullet/dash
    s = s.replace(/^\d+[\.\)]\s*/,  ""); // 1. หรือ 1)
    s = s.replace(/^[\)\]]\s*/,     ""); // ) หรือ ] ล้วนๆ
    s = s.trim();
  }
  return s;
}

// normalizeDateText_ — serial / ISO / slash → dd/MM/yyyy (BE)
function normalizeDateText_(value) {
  if (!value && value !== 0) return "";
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return "";
    var dd = Utilities.formatDate(value, TIMEZONE, "dd");
    var mm = Utilities.formatDate(value, TIMEZONE, "MM");
    var yy = parseInt(Utilities.formatDate(value, TIMEZONE, "yyyy"), 10);
    // [FIX-1] GAS บันทึก BE ผ่าน serial → year ที่ได้มักเกิน 2400
    // ถ้า year > 2400 → แปลงจาก serial-as-BE มาเป็น BE string ตรงๆ
    // ถ้า year <= 2400 → ปี CE → +543 → BE
    if (yy > 2400) return dd+"/"+mm+"/"+yy; // year ใหญ่ = BE อยู่แล้ว
    yy += 543; // CE → BE
    return dd+"/"+mm+"/"+yy;
  }
  var s = String(value).trim();
  if (!s) return "";
  // decimal fraction of day (0.4375 = 10:30) — ไม่ใช่วันที่ → คืน empty
  if (/^0\.\d+$/.test(s)) return "";
  // serial number (5-6 หลัก) จาก Google Sheets
  if (/^\d{5,6}$/.test(s)) {
    var serial = Number(s);
    var epoch  = new Date((serial - 25569) * 86400 * 1000);
    // [FIX-1] year จาก epoch: ถ้า > 2400 = GAS เซฟ BE เป็น serial → คงไว้
    var ey = epoch.getUTCFullYear();
    var em = epoch.getUTCMonth() + 1;
    var ed = epoch.getUTCDate();
    if (ey > 2400) {
      // BE year — คงปีไว้ แปลงเป็น dd/MM/yyyy
      return pad2(ed)+"/"+pad2(em)+"/"+ey;
    }
    // CE year → +543
    return pad2(ed)+"/"+pad2(em)+"/"+(ey+543);
  }
  // ISO string: 2026-05-15T... หรือ 2026-05-15
  var isoM = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoM) {
    var iy = parseInt(isoM[1], 10);
    var im = parseInt(isoM[2], 10);
    var id = parseInt(isoM[3], 10);
    if (iy > 2400) return pad2(id)+"/"+pad2(im)+"/"+iy; // BE ปีใหญ่ → คงไว้
    iy += 543; // CE → BE
    return pad2(id)+"/"+pad2(im)+"/"+iy;
  }
  // dd/MM/yy หรือ dd/MM/yyyy
  var slashM = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashM) {
    var sd = parseInt(slashM[1],10), sm = parseInt(slashM[2],10), sy = parseInt(slashM[3],10);
    // [FIX] 2-digit BE year: 69 = 2569 (ไม่ใช่ CE 69 → +2543=2612)
    // ตัดสินจาก context: ถ้า 2-digit มักเป็น BE ย่อ เช่น 69=2569, 70=2570
    if (sy < 100) sy += 2500;       // 69 → 2569 BE
    else if (sy < 2400) sy += 543;  // CE 4-digit → BE
    return pad2(sd)+"/"+pad2(sm)+"/"+sy;
  }
  // Thai month text
  var thM = parseThaiMonthDateFromText_(s);
  if (thM) return thM;
  return s;
}

// [FIX-2] normalizeDeliveryTime_ — decimal fraction + ห้าม serial/ISO ใน Delivery Time
function normalizeDeliveryTime_(value) {
  if (!value) return "";
  var s = String(value).trim();
  if (!s || s === "ไม่มี") return "";
  // [FIX-2] decimal fraction of day เช่น 0.4375 = 10:30, 0.5833 = 14:00
  if (/^0\.\d+$/.test(s)) {
    var frac = parseFloat(s);
    var totalMin = Math.round(frac * 24 * 60);
    var h = Math.floor(totalMin / 60);
    var m = totalMin % 60;
    return h + ":" + pad2(m);
  }
  if (/^\d{5,6}$/.test(s)) return ""; // serial number → empty
  if (/T\d{2}:\d{2}/.test(s)) return ""; // ISO datetime → empty
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return ""; // ISO date → empty
  if (/รอบเช้า|^เช้า$/.test(s)) return "รอบเช้า";
  if (/รอบบ่าย|^บ่าย$/.test(s)) return "รอบบ่าย";
  if (/รอบเย็น|^เย็น$/.test(s)) return "รอบเย็น";
  if (/^\d{1,2}:\d{2}$/.test(s)) return s; // HH:MM → คงไว้
  return s;
}

// parseAddonItem_ — parse add-on "เพิ่มช็อก 4 คู่ 40฿"
function parseAddonItem_(line) {
  var s = String(line||"").trim();
  // เพิ่มช็อก / ไวท์ช็อค / ขอตาไวท์ช็อคเพิ่ม N คู่ PRICE
  var m = s.match(/(เพิ่มช็อก|ไวท์ช็อค|ช็อคเพิ่ม|ขอตาไวท์ช็อคเพิ่ม|ช็อกเพิ่ม)\s*(\d+)\s*คู่\s*([\d,]+)/i);
  if (m) {
    var qty   = parseInt(m[2], 10);
    var total = toNumber(m[3]);
    return {
      menuName:"เพิ่มช็อก", quantity:qty, unit:"คู่",
      unitPrice: qty>0 ? Math.round(total/qty) : total, itemTotal:total,
      productCategory:"Add-on", baseProduct:"เพิ่มช็อก",
      modifier:"", isAddon:true, reviewFlag:""
    };
  }
  // เพิ่มผลไม้ / สตรอเบอรี่สด N วง
  var m2 = s.match(/(เพิ่มผลไม้|สตรอเบอรี่สด|เพิ่มสตรอ)\s*(\d*)\s*(วง|ชิ้น)?\s*([\d,]+)?/i);
  if (m2 && (m2[4]||"")) {
    var qty2  = parseInt(m2[2]||"1", 10)||1;
    var tot2  = toNumber(m2[4]||"50");
    return {
      menuName:"เพิ่มผลไม้", quantity:qty2, unit:m2[3]||"วง",
      unitPrice: qty2>0 ? Math.round(tot2/qty2) : tot2, itemTotal:tot2,
      productCategory:"Add-on", baseProduct:"เพิ่มผลไม้",
      modifier:"", isAddon:true, reviewFlag:""
    };
  }
  return null;
}

// splitCustomerAndSlot_ — "@ข้าวฟ่างคาเฟ่ เช้า" → {customer, slot}
function splitCustomerAndSlot_(rawName) {
  if (!rawName) return { customer:"", slot:"" };
  var s = String(rawName).trim();
  var slotWords = ["รอบเช้า","รอบบ่าย","รอบเย็น","เช้า","บ่าย","เย็น","ศุกร์","เสาร์","อาทิตย์","จันทร์","อังคาร","พุธ","พฤหัส"];
  var foundSlot = "";
  for (var i = 0; i < slotWords.length; i++) {
    var rx = new RegExp("\\s+("+slotWords[i]+")$");
    var m  = s.match(rx);
    if (m) { foundSlot = DELIVERY_SLOT_ALIAS[m[1]] || m[1]; s = s.replace(rx,"").trim(); break; }
  }
  return { customer: s, slot: foundSlot };
}

// isPickupDelivery_ — auto-detect รับหน้าร้าน
function isPickupDelivery_(text) {
  return /รับหน้าร้าน|รับเอง|pickup|รับที่ร้าน/i.test(String(text||""));
}

// simpleHash_ — hash raw text กันซ้ำ (lightweight)
function simpleHash_(str) {
  var s = String(str||"");
  var h = 0;
  for (var i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return "H" + Math.abs(h).toString(36).toUpperCase();
}

function isDuplicateOrder_(rawText) {
  var hash = simpleHash_(rawText);
  var props = PropertiesService.getScriptProperties();
  var key   = "rawHash_" + hash;
  var existing = props.getProperty(key);
  if (existing) return existing; // return orderId ที่ซ้ำ
  return null;
}
function markOrderHash_(rawText, orderId) {
  var hash = simpleHash_(rawText);
  PropertiesService.getScriptProperties().setProperty("rawHash_"+hash, orderId);
}

// ============================================================
// UNDO — เก็บ action ล่าสุด คืนค่าได้ใน 10 นาที (admin-only, global)
// ============================================================
var UNDO_KEY = "last_undo_action";
var UNDO_WINDOW_MIN = 10;

function recordUndo_(obj) {
  try {
    obj.ts = new Date().getTime();
    PropertiesService.getScriptProperties().setProperty(UNDO_KEY, JSON.stringify(obj));
  } catch(e) { Logger.log("[ERROR] recordUndo_: "+e.message); }
}

function handleUndo_(replyToken, userId) {
  var raw = PropertiesService.getScriptProperties().getProperty(UNDO_KEY);
  if (!raw) { replyLineWithQuickReply(replyToken, "ไม่มีรายการให้เลิกทำค่ะ", QR_MAIN); return true; }
  var undo;
  try { undo = JSON.parse(raw); } catch(e) { replyLineWithQuickReply(replyToken,"ไม่มีรายการให้เลิกทำค่ะ",QR_MAIN); return true; }

  // หมดเวลา
  var ageMin = (new Date().getTime() - (undo.ts||0)) / 60000;
  if (ageMin > UNDO_WINDOW_MIN) {
    PropertiesService.getScriptProperties().deleteProperty(UNDO_KEY);
    replyLineWithQuickReply(replyToken, "⏱️ เลยเวลาเลิกทำแล้วค่ะ (เกิน "+UNDO_WINDOW_MIN+" นาที)\nใช้ edit/cancel แทนได้", QR_MAIN);
    return true;
  }

  var result = { ok:false };
  var doneMsg = "";
  try {
    if (undo.type === "save") {
      result = cancelOrder_(undo.orderId, userId||"undo");
      doneMsg = "↩️ เลิกทำการบันทึกแล้ว\nยกเลิก Order: "+undo.orderId;
    } else if (undo.type === "cancel") {
      result = updateOrderField_(undo.orderId, {status: undo.prevStatus||"preparing"}, userId||"undo");
      doneMsg = "↩️ คืนออเดอร์ที่ยกเลิกแล้ว\nOrder: "+undo.orderId+" → "+(undo.prevStatus||"preparing");
    } else if (undo.type === "urgent") {
      result = setOrderUrgent_(undo.orderId, undo.prev, userId||"undo");
      doneMsg = "↩️ คืนสถานะด่วนแล้ว\nOrder: "+undo.orderId+" → "+(undo.prev?"ด่วน":"ปกติ");
    } else if (undo.type === "status") {
      result = updateOrderStatus_(undo.orderId, undo.prevStatus||"preparing", userId||"undo");
      doneMsg = "↩️ คืนสถานะเดิมแล้ว\nOrder: "+undo.orderId+" → "+(undo.prevStatus||"preparing");
    } else {
      replyLineWithQuickReply(replyToken, "ไม่รองรับการเลิกทำประเภทนี้ค่ะ", QR_MAIN); return true;
    }
  } catch(e) {
    Logger.log("[ERROR] handleUndo_: "+e.message);
    replyLineWithQuickReply(replyToken, "เลิกทำไม่สำเร็จค่ะ: "+e.message, QR_MAIN); return true;
  }

  PropertiesService.getScriptProperties().deleteProperty(UNDO_KEY);
  if (result.ok) {
    replyLineWithQuickReply(replyToken, doneMsg, ["search order "+undo.orderId, "plan 7", "summary"]);
  } else {
    replyLineWithQuickReply(replyToken, "เลิกทำไม่สำเร็จ: "+(result.message||""), QR_MAIN);
  }
  return true;
}

// หา active order ที่ customer + deliveryDate ตรงกัน (เผื่อลูกค้าส่ง list ใหม่ทับ)
function findActiveOrderByCustomerDate_(customerName, deliveryDate) {
  var cust = String(customerName||"").toLowerCase().replace(/\s+/g,"").trim();
  var date = normalizeDateText_(deliveryDate) || String(deliveryDate||"").trim();
  if (!cust || !date) return null;
  var rows = getOrderRowsReverse(function(r){ return !isRowCancelled(r); }, 120);
  var groups = groupRowsByOrder(rows);
  for (var i = 0; i < groups.length; i++) {
    var main = groups[i].rows.find(function(r){ return toNumber(r.grandTotal)>0; }) || groups[i].rows[0];
    var c2 = String(main.customerName||main.tableName||"").toLowerCase().replace(/\s+/g,"").trim();
    var d2 = normalizeDateText_(main.deliveryDate) || String(main.deliveryDate||"").trim();
    if (!c2 || !d2) continue;
    // match: ชื่อตรง หรือ contains กัน (กัน "ข้าวฟ่างคาเฟ่" vs "ข้าวฟ่าง คาเฟ่")
    var nameMatch = (c2 === cust) || (c2.indexOf(cust) > -1) || (cust.indexOf(c2) > -1);
    if (nameMatch && d2 === date) {
      return { orderId: groups[i].orderId, grandTotal: toNumber(main.grandTotal),
               customerName: main.customerName||main.tableName||"", deliveryDate: main.deliveryDate };
    }
  }
  return null;
}

// ============================================================
// แก้/เพิ่มออเดอร์ด้วยชื่อลูกค้า + ภาษาคน (บรรทัดเดียวจบ)
// ============================================================

// หา active order ล่าสุดของลูกค้า (fuzzy name match)
function findLatestOrderByCustomerName_(customerHint) {
  var hint = String(customerHint||"").toLowerCase().replace(/\s+/g,"").trim();
  if (!hint) return null;
  var rows = getOrderRowsReverse(function(r){ return !isRowCancelled(r); }, 150);
  var groups = groupRowsByOrder(rows);
  // groups เรียงจากใหม่→เก่าอยู่แล้ว (reverse)
  for (var i = 0; i < groups.length; i++) {
    var main = groups[i].rows.find(function(r){ return toNumber(r.grandTotal)>0; }) || groups[i].rows[0];
    var c = String(main.customerName||main.tableName||"").toLowerCase().replace(/\s+/g,"").trim();
    if (!c) continue;
    if (c === hint || c.indexOf(hint) > -1 || hint.indexOf(c) > -1) {
      return { orderId: groups[i].orderId, rows: groups[i].rows, main: main };
    }
  }
  return null;
}

// หา row ที่ menu ตรงกับ hint (fuzzy)
function findItemRowByMenu_(orderRows, menuHint) {
  var hint = resolveMenuAlias(cleanMenuName_(String(menuHint||"").trim()));
  var hintLow = String(menuHint||"").toLowerCase().replace(/\s+/g,"");
  for (var i = 0; i < orderRows.length; i++) {
    var mn = String(orderRows[i].menuName||"");
    if (!mn) continue;
    var mnLow = mn.toLowerCase().replace(/\s+/g,"");
    if (mn === hint || mnLow.indexOf(hintLow) > -1 || hintLow.indexOf(mnLow) > -1) return orderRows[i];
  }
  return null;
}

// recalc grandTotal ทุก row ของ order (เรียกหลังแก้)
function recalcOrderGrandTotal_(orderId, updatedBy) {
  var rows = findOrderRowsById_(orderId);
  if (!rows.length) return 0;
  var sheet = getSheet(); var map = getHeaderMap_();
  var fee = toNumber(rows[0].deliveryFee);
  var food = rows.reduce(function(s,r){ return s + toNumber(r.itemTotal); }, 0);
  var grand = food + fee;
  var nowTs = getTimestampTH();
  rows.forEach(function(r){
    if (map.grandTotal > 0) sheet.getRange(r.rowNumber, map.grandTotal).setValue(grand);
    if (map.lastUpdatedAt > 0) sheet.getRange(r.rowNumber, map.lastUpdatedAt).setValue(nowTs);
    if (map.lastUpdatedBy > 0) sheet.getRange(r.rowNumber, map.lastUpdatedBy).setValue(updatedBy||"line");
  });
  return grand;
}

// ลบเมนูออกจากออเดอร์
function removeItemFromOrder_(orderId, menuHint, updatedBy) {
  try {
    var rows = findOrderRowsById_(orderId);
    if (!rows.length) return { ok:false, message:"ไม่พบออเดอร์" };
    if (rows.length <= 1) return { ok:false, message:"เหลือรายการเดียว ใช้ยกเลิกทั้งใบแทน (cancel)" };
    var target = findItemRowByMenu_(rows, menuHint);
    if (!target) return { ok:false, message:"ไม่เจอเมนู \""+menuHint+"\" ในออเดอร์" };
    var removedName = target.menuName;
    getSheet().deleteRow(target.rowNumber);
    clearSheetCache();
    var newGrand = recalcOrderGrandTotal_(orderId, updatedBy);
    clearSheetCache();
    Logger.log("[INFO] removeItem | id="+orderId+" | removed="+removedName);
    return { ok:true, removed:removedName, newGrand:newGrand };
  } catch(e) {
    Logger.log("[ERROR] removeItemFromOrder_: "+e.message);
    return { ok:false, message:e.message };
  }
}

// เปลี่ยนเมนู X เป็น Y
function replaceItemInOrder_(orderId, fromHint, toMenu, updatedBy) {
  try {
    var rows = findOrderRowsById_(orderId);
    if (!rows.length) return { ok:false, message:"ไม่พบออเดอร์" };
    var target = findItemRowByMenu_(rows, fromHint);
    if (!target) return { ok:false, message:"ไม่เจอเมนู \""+fromHint+"\"" };
    var newMenu = resolveMenuAlias(cleanMenuName_(toMenu));
    var sheet = getSheet(); var map = getHeaderMap_();
    // คิดราคาใหม่ตาม qty เดิม
    var qty = toNumber(target.qty);
    var newTotal = getPriceForMenu(newMenu, target.unit||"ชิ้น", qty);
    if (map.menuName > 0)  sheet.getRange(target.rowNumber, map.menuName).setValue(newMenu);
    if (map.itemTotal > 0) sheet.getRange(target.rowNumber, map.itemTotal).setValue(newTotal);
    if (map.unitPrice > 0) sheet.getRange(target.rowNumber, map.unitPrice).setValue(qty>0?Math.round(newTotal/qty):newTotal);
    if (map.reviewFlag > 0) sheet.getRange(target.rowNumber, map.reviewFlag).setValue(isKnownMenu_(newMenu)?"":"REVIEW");
    clearSheetCache();
    var newGrand = recalcOrderGrandTotal_(orderId, updatedBy);
    clearSheetCache();
    Logger.log("[INFO] replaceItem | id="+orderId+" | "+target.menuName+"→"+newMenu);
    return { ok:true, from:target.menuName, to:newMenu, newGrand:newGrand };
  } catch(e) {
    Logger.log("[ERROR] replaceItemInOrder_: "+e.message);
    return { ok:false, message:e.message };
  }
}

// ลดจำนวนเมนูเหลือ N
function reduceItemInOrder_(orderId, menuHint, newQty, updatedBy) {
  try {
    var rows = findOrderRowsById_(orderId);
    if (!rows.length) return { ok:false, message:"ไม่พบออเดอร์" };
    var target = findItemRowByMenu_(rows, menuHint);
    if (!target) return { ok:false, message:"ไม่เจอเมนู \""+menuHint+"\"" };
    if (newQty <= 0) return removeItemFromOrder_(orderId, menuHint, updatedBy);
    var sheet = getSheet(); var map = getHeaderMap_();
    var unitP = toNumber(target.unitPrice) || (toNumber(target.qty)>0 ? Math.round(toNumber(target.itemTotal)/toNumber(target.qty)) : 0);
    var newTotal = unitP * newQty;
    if (map.qty > 0)       sheet.getRange(target.rowNumber, map.qty).setValue(newQty);
    if (map.itemTotal > 0) sheet.getRange(target.rowNumber, map.itemTotal).setValue(newTotal);
    clearSheetCache();
    var newGrand = recalcOrderGrandTotal_(orderId, updatedBy);
    clearSheetCache();
    Logger.log("[INFO] reduceItem | id="+orderId+" | "+target.menuName+"→qty "+newQty);
    return { ok:true, menu:target.menuName, qty:newQty, newGrand:newGrand };
  } catch(e) {
    Logger.log("[ERROR] reduceItemInOrder_: "+e.message);
    return { ok:false, message:e.message };
  }
}

// parse คำสั่ง "<ชื่อลูกค้า> <action> <รายละเอียด>"
function parseCustomerEditCommand_(text) {
  var t = String(text||"").trim();
  // หา action keyword + แยกชื่อลูกค้า (ก่อน action) กับ detail (หลัง action)
  var m = t.match(/^(.+?)\s+(เพิ่ม|เอาออก|เอา|ลบ|เปลี่ยน|ลด)\s*(.*)$/);
  if (!m) return null;
  var customer = m[1].trim();
  var action   = m[2];
  var detail   = m[3].trim();
  // กันชนคำสั่งระบบ — ชื่อลูกค้าต้องไม่ใช่คำสั่ง
  if (/^(summary|search|plan|edit|cancel|status|help|urgent|unurgent|delivery|setup|log|map|menu|สรุป|ค้นหา|แผน)/i.test(customer)) return null;
  return { customer: customer, action: action, detail: detail };
}

// ทับออเดอร์เดิม — ยกเลิกใบเก่า (audit trail) + save ใบใหม่
function overwriteOrder_(oldOrderId, newData, rawText, updatedBy) {
  try {
    // 1. mark ใบเก่ายกเลิก + note ว่าถูกแทนที่
    var oldRows = findOrderRowsById_(oldOrderId);
    if (oldRows.length) {
      var sheet = getSheet(); var map = getHeaderMap_(); var nowTs = getTimestampTH();
      oldRows.forEach(function(r){
        if (map.status > 0) sheet.getRange(r.rowNumber, map.status).setValue("❌ ยกเลิก");
        if (map.note > 0) {
          var cur = String(sheet.getRange(r.rowNumber, map.note).getValue()||"");
          sheet.getRange(r.rowNumber, map.note).setValue("(แทนที่ด้วยใบใหม่) "+cur);
        }
        if (map.lastUpdatedAt > 0) sheet.getRange(r.rowNumber, map.lastUpdatedAt).setValue(nowTs);
        if (map.lastUpdatedBy > 0) sheet.getRange(r.rowNumber, map.lastUpdatedBy).setValue(updatedBy||"line");
      });
    }
    // 2. save ใบใหม่ (orderId ใหม่)
    newData.orderId = generateOrderId_();
    if (newData.note) newData.note = "(แทนที่ "+oldOrderId+") " + newData.note;
    else newData.note = "(แทนที่ "+oldOrderId+")";
    var newOid = saveOrderToSheet_(newData, rawText, updatedBy||"line");
    clearSheetCache();
    Logger.log("[INFO] overwriteOrder_ | old="+oldOrderId+" → new="+newOid);
    return { ok:true, oldOrderId:oldOrderId, newOrderId:newOid };
  } catch(e) {
    Logger.log("[ERROR] overwriteOrder_ failed: "+e.message+" | stack: "+(e.stack||""));
    return { ok:false, message:e.message };
  }
}

// isKnownMenu_ — เช็คว่าเมนูอยู่ใน PRICE_MASTER หรือไม่
function isKnownMenu_(menuName) {
  if (!menuName) return false;
  if (PRICE_MASTER[menuName]) return true;
  // เช็ค alias ด้วย
  for (var alias in MENU_ALIAS) {
    if (MENU_ALIAS[alias] === menuName) return true;
  }
  return false;
}

// buildSaveSuccessText_ — summary สั้นหลัง save
// ============================================================
// URGENT FLAG HELPERS
// ใช้ marker "[🚨URGENT]" ขึ้นต้น note field — ไม่ต้องเพิ่มคอลัมน์ใน sheet
// ============================================================
var URGENT_MARKER = "[🚨URGENT]";

function isNoteUrgent_(note) {
  return String(note||"").indexOf(URGENT_MARKER) === 0;
}

function stripUrgentMarker_(note) {
  var s = String(note||"");
  if (s.indexOf(URGENT_MARKER) === 0) return s.substring(URGENT_MARKER.length).replace(/^\s+/,"");
  return s;
}

function addUrgentMarker_(note) {
  var clean = stripUrgentMarker_(note);
  return URGENT_MARKER + (clean ? " " + clean : "");
}

function setOrderUrgent_(orderId, turnOn, updatedBy) {
  try {
    var rows = findOrderRowsById_(orderId);
    if (!rows.length) return { ok:false, message:"ไม่พบ Order: "+orderId };
    var sheet = getSheet();
    var map = getHeaderMap_();
    if (!map.note) return { ok:false, message:"ไม่มีคอลัมน์ Note ใน sheet" };
    rows.forEach(function(r) {
      var cur = String(sheet.getRange(r.rowNumber, map.note).getValue()||"");
      var newNote = turnOn ? addUrgentMarker_(cur) : stripUrgentMarker_(cur);
      sheet.getRange(r.rowNumber, map.note).setValue(newNote);
      if (map.lastUpdatedAt) sheet.getRange(r.rowNumber, map.lastUpdatedAt).setValue(getTimestampTH());
      if (map.lastUpdatedBy) sheet.getRange(r.rowNumber, map.lastUpdatedBy).setValue(updatedBy||"line");
    });
    clearSheetCache(); // เดิมใช้ bumpCacheVersion_ ไม่ reset memo → plan/summary ไม่ refresh
    Logger.log("[INFO] setOrderUrgent_ | id="+orderId+" | on="+turnOn+" | rows="+rows.length);
    return { ok:true };
  } catch(e) {
    Logger.log("[ERROR] setOrderUrgent_ failed: "+e.message);
    return { ok:false, message:e.message };
  }
}

function buildSaveSuccessText_(data, orderId) {
  var isUrgent = isNoteUrgent_(data.note);
  var lines = [
    isUrgent ? "🚨 บันทึกออเดอร์ด่วนแล้วค่ะ 🚨" : "✅ บันทึกออเดอร์แล้วค่ะ",
    "",
    "Order ID: "+orderId,
    "ลูกค้า: "+(data.customerName||data.tableName||"-"),
    "วันที่ส่ง: "+(data.deliveryDate||"-"),
    "รวม: "+toNumber(data.grandTotal).toLocaleString()+"฿",
    "ครัว: "+(data.kitchenStatus||"รอทำ")
  ];
  if (isUrgent) lines.push("⚡ สถานะ: URGENT — แสดงเด่นใน plan/summary");

  // แจ้งเตือนเมนูที่ไม่รู้จัก
  var unknownMenus = (data.items||[]).filter(function(it){ return it.reviewFlag==="REVIEW"; }).map(function(it){ return it.menuName; });
  if (unknownMenus.length) {
    lines.push("","⚠️ ต้องตรวจสอบเมนู:");
    unknownMenus.forEach(function(m){ lines.push("- "+m); });
    lines.push("ระบบบันทึกไว้แล้ว แต่แนะนำให้เช็กชื่อเมนูอีกครั้ง");
  }
  lines.push("","พิมพ์:","plan 7 = ดูแผนผลิต","ส่งครัว = ครัวรับงานแล้ว","แก้ล่าสุด = แก้ออเดอร์","ลบล่าสุด = ยกเลิกออเดอร์ล่าสุด");
  if (!isUrgent) lines.push("urgent "+orderId+" = ตั้งเป็นด่วน 🚨");
  else lines.push("unurgent "+orderId+" = ปลด urgent");
  return lines.join("\n");
}

// buildDayPlanText_ — แผนผลิตวันเดียว (วันนี้/พรุ่งนี้/เสาร์นี้)
function buildDayPlanText_(targetDate, dayLabel) {
  var rows = getPlanRowsByDeliveryDateFast_(targetDate); // ★ Plan Light
  if (!rows.length) return "🧁 ไม่มีออเดอร์ "+dayLabel+" ("+targetDate+")";
  var orders   = groupRowsByOrder(rows);
  var menuAgg  = {}, customerSeen = {}, customers = [];
  orders.forEach(function(order) {
    var main = order.rows.find(function(r){ return toNumber(r.grandTotal)>0; }) || order.rows[0] || {};
    var cust = String(main.customerName||main.tableName||"ไม่ระบุ").trim();
    if (!customerSeen[cust]) { customerSeen[cust]=true; customers.push(cust); }
    order.rows.forEach(function(r) {
      if (!r.menuName) return;
      var unit = String(r.unit||"ชิ้น").trim()||"ชิ้น";
      var key  = r.menuName+"|||"+unit;
      if (!menuAgg[key]) menuAgg[key]={menuName:r.menuName,unit:unit,qty:0};
      menuAgg[key].qty += toNumber(r.qty);
    });
  });
  var menuLines = objectEntries_(menuAgg).map(function(e){ return e[1]; });
  menuLines.sort(function(a,b){ return b.qty-a.qty; });
  var out = ["🧁 แผนผลิต"+dayLabel+" ("+targetDate+")",""];
  customers.forEach(function(c) {
    out.push("👤 "+c);
    var custRows = rows.filter(function(r){ return (r.customerName||r.tableName||"")=== c; });
    custRows.forEach(function(r){ if (r.menuName) out.push("  - "+r.menuName+" "+toNumber(r.qty)+" "+(r.unit||"ชิ้น")); });
    out.push("");
  });
  out.push("รวมผลิต:");
  menuLines.forEach(function(ml){ out.push(ml.menuName+" "+ml.qty+" "+ml.unit); });
  return out.join("\n");
}

// getNextWeekday_ — หาวันถัดไปที่ตรงกับชื่อวัน
function getNextWeekday_(dayName) {
  var dayMap = {"จันทร์":1,"อังคาร":2,"พุธ":3,"พฤหัส":4,"ศุกร์":5,"เสาร์":6,"อาทิตย์":0};
  var target = dayMap[dayName];
  if (target === undefined) return null;
  var now = new Date();
  var cur = now.getDay();
  var diff = (target - cur + 7) % 7 || 7; // ถ้าวันนี้ตรงแล้ว ไปสัปดาห์หน้า
  var d = new Date(now); d.setDate(now.getDate() + diff);
  return formatDateTH(d);
}

// ============================================================
var RUNTIME_MEMO_ = {};
function resetRuntimeMemo_() { RUNTIME_MEMO_ = {}; }

// ============================================================
// CACHE VERSION
// ============================================================
function getCacheVersion_() {
  var props = PropertiesService.getScriptProperties();
  var v = props.getProperty("order_bot_cache_version");
  if (!v) { v = "1"; props.setProperty("order_bot_cache_version", v); }
  return v;
}
function bumpCacheVersion_() {
  var props = PropertiesService.getScriptProperties();
  var next = String(Number(getCacheVersion_()) + 1);
  props.setProperty("order_bot_cache_version", next);
  return next;
}
function makeCacheKey_(base) { return base + "_v" + getCacheVersion_(); }

function cacheGetJson_(key) {
  var cached = CacheService.getScriptCache().get(key);
  if (!cached) return null;
  try { return JSON.parse(cached); } catch(e) { return null; }
}
function cachePutJsonIfSmall_(key, obj, ttlSecs, maxLen) {
  try {
    var json = JSON.stringify(obj);
    if (json.length <= (maxLen || 85000)) {
      CacheService.getScriptCache().put(key, json, ttlSecs || 60);
      return true;
    }
  } catch(e) {}
  return false;
}

// ============================================================
// COLUMN MAP
// ============================================================
var COL = {
  timestamp:1, orderId:2, deliveryDate:3, paymentDate:4,
  customerName:5, phone:6, channel:7, orderType:8, tableName:9,
  deliveryType:10, deliveryTime:11, location:12, menuName:13,
  unit:14, qty:15, unitPrice:16, itemTotal:17, deliveryFee:18,
  grandTotal:19, paymentStatus:20, note:21, rawText:22,
  status:23, googleMap:24, lastUpdatedAt:25, lastUpdatedBy:26
};

var HEADER_ALIASES = {
  timestamp:     ["Timestamp"],
  orderId:       ["Order ID"],
  deliveryDate:  ["Delivery Date"],
  paymentDate:   ["Payment Date"],
  customerName:  ["Customer Name"],
  phone:         ["Phone"],
  channel:       ["Channel"],
  orderType:     ["Order Type"],
  tableName:     ["Table","Table Name"],
  deliveryType:  ["Delivery Type"],
  deliveryTime:  ["Delivery Time"],
  location:      ["Location"],
  menuName:      ["Menu Name"],
  unit:          ["Unit"],
  qty:           ["Quantity","Qty"],
  unitPrice:     ["Unit Price"],
  itemTotal:     ["Item Total"],
  deliveryFee:   ["Delivery Fee"],
  grandTotal:    ["Grand Total"],
  paymentStatus: ["Payment Status"],
  note:          ["Note"],
  rawText:       ["Raw Text"],
  status:        ["Status"],
  googleMap:     ["Google Map"],
  lastUpdatedAt: ["Last Updated At"],
  lastUpdatedBy: ["Last Updated By"]
};

var REQUIRED_HEADERS_DEFAULT = [
  "Timestamp","Order ID","Delivery Date","Delivery Time","Customer Name","Phone",
  "Channel","Order Type","Table","Delivery Type","Location",
  "Menu Name","Unit","Quantity","Unit Price","Item Total",
  "Delivery Fee","Grand Total","Payment Status","Status","Note","Raw Text",
  "Google Map","Last Updated At","Last Updated By"
];

// ============================================================
// POLYFILL
// ============================================================
function objectEntries_(obj) {
  if (typeof Object.entries === "function") return Object.entries(obj);
  return Object.keys(obj).map(function(k) { return [k, obj[k]]; });
}

// ============================================================
// NORMALIZERS
// ============================================================
function normalizeChannel(raw) {
  if (!raw) return "ไม่ระบุ";
  var v = String(raw).trim().toLowerCase();
  if (v === "fb" || v === "facebook") return "Facebook";
  if (v === "line")      return "LINE";
  if (v === "instagram") return "Instagram";
  if (v === "tiktok")    return "TikTok";
  var s = String(raw).trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function normalizeStatus(raw) {
  if (!raw) return "";
  var v = String(raw).trim().toLowerCase();
  if (v==="cancelled"||v==="cancel"||v==="❌ ยกเลิก"||v==="ยกเลิก") return "❌ ยกเลิก";
  if (v==="confirmed"||v==="✅ ยืนยันแล้ว"||v==="ยืนยันแล้ว"||v==="ยืนยัน") return "confirmed";
  if (v==="preparing"||v==="🍰 กำลังทำ"||v==="กำลังทำ") return "preparing";
  if (v==="ready"||v==="พร้อมส่ง"||v==="✅ พร้อมส่ง") return "ready";
  if (v==="completed"||v==="เสร็จแล้ว"||v==="✅ เสร็จแล้ว"||v==="done") return "completed";
  if (v==="pending"||v==="รอยืนยัน") return "pending";
  return String(raw).trim();
}

function normalizeDeliveryType(raw) {
  if (!raw) return "";
  var v = String(raw).trim().toLowerCase();
  if (v==="ส่ง"||v==="delivery"||v==="จัดส่ง") return "Delivery";
  if (v==="รับหน้าร้าน"||v==="pickup"||v==="รับเอง") return "รับหน้าร้าน";
  return String(raw).trim();
}

function normalizePhone(raw) {
  if (!raw) return "";
  var str = String(raw).trim().replace(/^(?:ผู้รับ|เบอร์|โทร|Tel|Phone)\s*[:：]\s*/i,"").trim();
  var digits = str.replace(/[^\d+\-]/g,"");
  if (/^[89]\d{8}$/.test(digits)) return "0" + digits;
  return digits || str;
}

function splitDirtyDeliveryTime(raw) {
  if (!raw) return { time:"", location:"" };
  var str = String(raw).trim();
  var seps = ["ที่อยู่จัดส่ง:","ที่อยู่:","เบอร์ผู้รับ:","สถานที่:"];
  for (var i = 0; i < seps.length; i++) {
    var idx = str.indexOf(seps[i]);
    if (idx > -1) {
      var tp = str.substring(0, idx).trim();
      var lp = str.substring(idx + seps[i].length).trim();
      var tm = tp.match(/\d{1,2}:\d{2}(?:-\d{1,2}:\d{2})?/);
      return { time: tm ? tm[0] : tp, location: lp };
    }
  }
  return { time: str, location: "" };
}

function cleanDeliveryTime(raw) { return splitDirtyDeliveryTime(raw).time; }

// ★ NEW v3.5 — loadAliasMaster_() โหลด alias จาก Alias_Master sheet
// Sheet structure: Col A=Alias, B=Standard Name, C=Category, D=Note, E=Status (Active/Inactive)
function loadAliasMaster_() {
  if (RUNTIME_MEMO_.alias_master) return RUNTIME_MEMO_.alias_master;
  var map = {};
  try {
    var ss = getSpreadsheet_();
    var sh = ss.getSheetByName("Alias_Master");
    if (!sh) { RUNTIME_MEMO_.alias_master = map; return map; }
    var values = sh.getDataRange().getValues();
    for (var i = 1; i < values.length; i++) {
      var alias    = String(values[i][0]||"").trim().toLowerCase();
      var standard = String(values[i][1]||"").trim();
      var status   = String(values[i][4]||"Active").trim();
      if (alias && standard && status === "Active") {
        map[alias] = standard;
      }
    }
  } catch(e) { Logger.log("loadAliasMaster_ error: "+e); }
  RUNTIME_MEMO_.alias_master = map;
  return map;
}

// ★ v3.5 — resolveMenuAlias: เช็ก Alias_Master → MENU_ALIAS → return as-is
function resolveMenuAlias(rawName) {
  if (!rawName) return rawName;
  var key = String(rawName).trim().toLowerCase();

  // 1. ลองจาก Alias_Master sheet ก่อน (runtime + user-editable)
  var sheetAlias = loadAliasMaster_();
  if (sheetAlias[key]) return sheetAlias[key];
  // partial match จาก sheet
  for (var sa in sheetAlias) {
    if (key.indexOf(sa) === 0 && sa.length >= 2) return sheetAlias[sa];
  }

  // 2. ลองจาก MENU_ALIAS hardcode
  for (var alias in MENU_ALIAS) {
    if (alias.toLowerCase() === key) return MENU_ALIAS[alias];
  }
  // partial match
  for (var alias2 in MENU_ALIAS) {
    if (key.indexOf(alias2.toLowerCase()) === 0 && alias2.length >= 2) return MENU_ALIAS[alias2];
  }

  // 3. คืนชื่อเดิม
  return String(rawName).trim();
}

// ============================================================
// ★ NEW v3.1 — PRICE LOOKUP
// ============================================================
function getPriceForMenu(menuName, unit, qty) {
  var resolved = resolveMenuAlias(menuName);
  var pm = PRICE_MASTER[resolved];
  if (!pm) {
    // tier default: ถ้าไม่รู้ราคา ใช้ tier A
    pm = { perPiece: 75, perWong: 750, tier: "A" };
  }
  var isWong = unit && /(วง|Wong)/i.test(unit);
  if (isWong && pm.perWong > 0) return pm.perWong * (qty || 1);
  if (pm.perPiece > 0) return pm.perPiece * (qty || 1);
  if (pm.perWong > 0)  return pm.perWong  * (qty || 1);
  return 0;
}

// ============================================================
// ★ NEW v3.1 — PATTERN DETECTOR
// detectOrderPattern_(text) → "standard_form" | "shop_summary" |
//   "short_cafe" | "short_calculated" | "loose_header" |
//   "manual_summary" | "payment_address" |
//   "modifier_edit" | "payment_notice" | "address_only" | "unknown"
// ============================================================
function detectOrderPattern_(text) {
  var t = String(text || "").trim();

  // standard form (บังคับ keyword ฟอร์ม)
  if (/วันที่ส่ง\s*:/i.test(t) || /รวมทั้งหมด\s*:/i.test(t) || /ลูกค้า.*ชื่อคนรับ\s*:/i.test(t)) return "standard_form";

  // short_calculated: "ทุเรียน 6**510฿" หรือ "ช็อคมินิ4 **375฿"
  if (/\*{1,2}\s*[\d,]+\s*฿?/.test(t) && /รวม\s*[\d,]+/.test(t)) return "short_calculated";

  // shop_summary: มี "ออเดอร์รอบส่ง/รอบส่ง" + (มี "รวม" หรือ มีบรรทัดเมนูที่มีราคา)
  // [v3.5.2 FIX] เดิมบังคับต้องมี "รวม" → ออเดอร์เมนูเดียวที่ไม่พิมพ์ "รวม" ตก unknown
  // [v3.5.4 FIX] เพิ่ม pattern "ชื่อเมนู ราคา฿" (ไม่มีจำนวน+หน่วย) — รับออเดอร์เค้กวงที่พิมพ์ราคาเฉยๆ
  var _hasItemLine = /\d+\s*(ชิ้น|วง|กล่อง|ถุง|อัน|แผ่น|ลูก|ถาด|ห่อ|ปอนด์|ปอนด์ครึ่ง|กก|กิโล|kg|เซท|set|P|คู่)\s*[\d,]+\s*฿?/i.test(t)
                  || /^[ก-๙a-zA-Z][^\n\r]{2,40}\s+[\d,]{2,5}\s*฿/im.test(t);
  if (/(ออเดอร์รอบส่ง|รอบส่ง)/i.test(t) && (/รวม\s*[\d,]+/.test(t) || _hasItemLine)) return "shop_summary";

  // [FIX] loose_header: รองรับ emoji prefix เช่น "📝 ออเดอร์ วันทร์" ด้วย  แทน ^
  if (/ออเดอร์\s+(วัน|จันทร์|อังคาร|พุธ|พฤหัส|ศุกร์|เสาร์|อาทิตย์|\d{1,2}\s*[ก-๙])/i.test(t) && /รวม\s*[\d,]+/.test(t)) return "loose_header";

  // manual_summary: บรรทัดแรกเป็นชื่อร้าน + "ส่งวัน..." แล้วมีรายการ bullet + รวม
  if (/ส่งวัน(จันทร์|อังคาร|พุธ|พฤหัส|ศุกร์|เสาร์|อาทิตย์)/i.test(t) && /รวม\s*[\d,]+/.test(t)) return "manual_summary";

  // payment_address: มีวันที่ DD/MM + เมนู + (โอน/ชำระ หรือ ชื่อคนรับ/เบอร์ผู้รับ/ที่อยู่)
  // ไม่บังคับ ^ ต้นบรรทัด (รองรับ "วันที่ 9/6/2569") และไม่บังคับคำว่าโอน ถ้ามี address markers
  var _padDate = /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(t) || /\d{1,2}\s*[ก-๙.]+\s*\d{4}/.test(t);
  var _padPay  = /(โอน|ชำระ|จ่าย|โอนเรียบร้อย)/i.test(t);
  var _padAddr = /(ชื่อคนรับ|เบอร์ผู้รับ|ที่อยู่|สถานที่จัดส่ง|Channel\s*[:：])/i.test(t);
  var _padPrice= /\d+\s*(฿|\.-|บาท)/i.test(t);
  if (_padDate && (_padPay || _padAddr) && _padPrice && /รวม\s*[:：]?\s*[\d,]+/.test(t)) return "payment_address";

  // modifier / edit
  if (/^(เอา|ลบ|เอาออก|เปลี่ยน|เพิ่ม|ลด|ขอ|แก้)/i.test(t)) return "modifier_edit";

  // payment notice
  if (/(โอน|สลิป|จ่าย|ชำระ|tranfer|transfer)/i.test(t) && !/รวม\s*[\d,]+/.test(t)) return "payment_notice";

  // short cafe: lines ส่วนใหญ่เป็น "ชื่อเมนู + ตัวเลข"
  // [FIX] ต้องมีอย่างน้อย 2 lines และ line แรกไม่ใช่ command สั้นๆ
  var lines = t.split("\n").map(function(s){return s.trim();}).filter(Boolean);
  // กัน command สั้น เช่น "plan 7" "summary 7" "help" ออก
  if (lines.length < 2) return "unknown";
  var shortCount = 0;
  for (var i = 0; i < lines.length; i++) {
    if (/^[^\d\s].{0,20}\d{1,3}$/.test(lines[i]) && !/[:：]/.test(lines[i])) shortCount++;
  }
  if (lines.length > 0 && shortCount / lines.length >= 0.5) return "short_cafe";

  return "unknown";
}

// ============================================================
// ★ NEW v3.1 — SHORT CAFE ORDER PARSER
// อ่านออเดอร์สั้น เช่น:
//   มะพร้าว12\nหน้าไหม้1\nส้ม4
//   @April Cafe\nมะพร้าว14\nกาแฟ5
// ============================================================
function parseShortCafeOrder_(text) {
  var lines   = String(text || "").replace(/\r/g, "").split("\n").map(function(s){return s.trim();}).filter(Boolean);
  var customer = "";
  var deliveryDateStr = "";
  var deliverySlot = "";
  var items = [];

  for (var i = 0; i < lines.length; i++) {
    var rawLine = lines[i];
    // strip bullet prefix ก่อนเช็คทุกกรณี (เดิม short_cafe ไม่ strip — line "- มะพร้าว14" ไม่ match)
    var line = rawLine.replace(/^[\-–—•*⁃‣▪▫◦]\s*/, "").trim();
    if (!line) continue;

    // @customer name
    if (/^@/.test(line)) { customer = line.replace(/^@/, "").trim(); continue; }

    // date line: วันที่ / เสาร์ 9 พฤษภาคม 2568 etc.
    var dateFromLine = parseThaiMonthDateFromText_(line);
    if (dateFromLine) { deliveryDateStr = dateFromLine; continue; }

    // delivery slot: เช้า/บ่าย/เย็น/ศุกร์/เสาร์
    var slotMatch = line.match(/^(รอบ)?(เช้า|บ่าย|เย็น|ศุกร์|เสาร์|อาทิตย์|พฤหัส|จันทร์)/);
    if (slotMatch) { deliverySlot = DELIVERY_SLOT_ALIAS[slotMatch[2]] || line; continue; }

    // ค่าส่ง
    if (/^ค่าส่ง/i.test(line)) continue;

    // รวม line (รับทั้ง "รวม:" และ "รวม")
    if (/^รวม\s*[:：]?\s*[\d,]+/i.test(line)) continue;

    // กันบรรทัด header / address ไม่ให้ถูก parse เป็นเมนู
    if (/^(วันที่|channel|ที่อยู่|เบอร์|note|หมายเหตุ|order|status|ลูกค้า)\s*[:：]/i.test(line)) continue;

    // item line: เมนู + ตัวเลข (+ หน่วยอาจมีหรือไม่)
    var mItem = line.match(/^(.+?)\s+(\d{1,3})\s*(วง|ชิ้น|กล่อง|ถุง|ลูก|ปอนด์|set|เซท|ถาด|ห่อ|กก|กิโล)?$/i);
    if (mItem) {
      var rawName  = mItem[1].trim();
      var qty      = parseInt(mItem[2], 10);
      var unit     = mItem[3] ? mItem[3].trim() : "";
      var menuName = resolveMenuAlias(rawName);
      // auto-assign unit: ถ้าไม่ระบุและ qty=1 → วง, qty>1 → ชิ้น
      if (!unit) unit = (qty === 1) ? "วง" : "ชิ้น";
      var totalPrice = getPriceForMenu(menuName, unit, qty);
      var unitPrice  = qty > 0 ? Math.round(totalPrice / qty) : 0;
      items.push({ menuName: menuName, unit: unit, quantity: qty, unitPrice: unitPrice, itemTotal: totalPrice });
      continue;
    }

    // เมนูชิดตัวเลข เช่น "มะพร้าว14"
    var mNoSpace = line.match(/^([^\d]+?)(\d{1,3})(วง|ชิ้น|กล่อง)?$/i);
    if (mNoSpace) {
      var rawName2  = mNoSpace[1].trim();
      var qty2      = parseInt(mNoSpace[2], 10);
      var unit2     = mNoSpace[3] ? mNoSpace[3].trim() : (qty2 === 1 ? "วง" : "ชิ้น");
      var menuName2 = resolveMenuAlias(rawName2);
      var totalPrice2 = getPriceForMenu(menuName2, unit2, qty2);
      items.push({ menuName: menuName2, unit: unit2, quantity: qty2, unitPrice: Math.round(totalPrice2/qty2)||0, itemTotal: totalPrice2 });
      continue;
    }
  }

  if (!items.length) return null;

  var grandTotal = calculateOrderTotal_(items, 0);
  return {
    orderId:       generateOrderId_(),
    deliveryDate:  deliveryDateStr || getTodayTH(),
    paymentDate:   deliveryDateStr || getTodayTH(),
    customerName:  customer || "",
    tableName:     customer || "LINE Customer",
    phone:         "",
    channel:       "LINE",
    orderType:     items.reduce(function(s,i){return s+i.quantity;},0) >= 5 ? "Wholesale" : "Retail",
    deliveryType:  "Delivery",
    deliveryTime:  deliverySlot || "",
    location:      customer || "",
    googleMap:     "",
    deliveryFee:   0,
    grandTotal:    grandTotal,
    note:          deliverySlot ? "รอบ: " + deliverySlot : "",
    paymentStatus: "Pending",
    status:        "confirmed",
    items:         items
  };
}

// ============================================================
// ★ NEW v3.3 — SHORT CALCULATED ORDER PARSER
// รองรับ: "ทุเรียน 6**510฿", "ช็อคมินิ4 **375฿", "ส้ม4 **300฿"
// Format: ชื่อเมนู + จำนวน + ** + ราคา
// ============================================================
function parseShortCalculatedOrder_(text) {
  var lines = String(text||"").replace(/\r/g,"").split("\n").map(function(s){return s.trim();}).filter(Boolean);
  var items = [];
  var customer = "", deliveryDateStr = "", deliverySlot = "", totalMatch = null;

  // rx: "ทุเรียน 6**510฿" หรือ "ช็อคมินิ4 **375฿" หรือ "ส้ม4**300"
  var rx = /^(.+?)\s*(\d{1,3})\s*\*+\s*([\d,]+)\s*฿?$/;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (/^@/.test(line)) { customer = line.replace(/^@/,"").trim(); continue; }
    var dateFromLine = parseThaiMonthDateFromText_(line);
    if (dateFromLine) { deliveryDateStr = dateFromLine; continue; }
    if (/^รวม\s*([\d,]+)/i.test(line)) { totalMatch = line.match(/^รวม\s*([\d,]+)/i); continue; }
    if (/^ค่าส่ง/i.test(line)) continue;

    var m = line.replace(/^[-•]\s*/,"").match(rx);
    if (m) {
      var rawName = m[1].trim();
      var qty     = parseInt(m[2], 10);
      var tt      = toNumber(m[3]);
      var mn      = resolveMenuAlias(rawName);
      items.push({ menuName:mn, unit:"ชิ้น", quantity:qty, unitPrice:qty>0?Math.round(tt/qty):0, itemTotal:tt });
    }
  }

  if (!items.length) return null;
  var gt = totalMatch ? toNumber(totalMatch[1]) : calculateOrderTotal_(items, 0);
  return {
    orderId:      generateOrderId_(),
    deliveryDate: deliveryDateStr || getTodayTH(),
    paymentDate:  deliveryDateStr || getTodayTH(),
    customerName: customer || "",
    tableName:    customer || "",
    phone:"", channel:"LINE", orderType:"Wholesale",
    deliveryType:"Delivery", deliveryTime:deliverySlot,
    location:customer||"", googleMap:"", deliveryFee:0,
    grandTotal:gt, note:"", paymentStatus:"Not Required",
    status:"preparing", kitchenStatus:"รอทำ",
    patternType:"short_calculated", parsedStatus:"OK",
    items:items
  };
}

// ============================================================
// ★ NEW v3.3 — LOOSE HEADER ORDER PARSER
// รองรับ: "ออเดอร์ วันทร์ 11 พฤษภาคม 2569@Sloth's"
//         ไม่บังคับ "รอบส่ง" ก่อนวัน
// ============================================================
function parseLooseHeaderOrder_(text) {
  var normalized = String(text||"").replace(/\r/g,"");

  // parse customerName จาก @ (ทั้ง inline และ line-start)
  var taggedName = parseTaggedLocation_(normalized);

  // parse วันที่จาก header line แรก
  var deliveryDateStr = parseThaiMonthDateFromText_(normalized);

  // parse deliverySlot จาก header (เช่น "วันทร์" "วันศุกร์" ฯลฯ)
  // [FIX] เพิ่ม วันทร์(จันทร์ย่อ), พฤหัสบดี, ราย slot ย่อทั้งหมด
  var DAY_SLOT_MAP_ = {"วันทร์":"จันทร์","จันทร์":"จันทร์","วันจันทร์":"จันทร์","อังคาร":"อังคาร","วันอังคาร":"อังคาร","พุธ":"พุธ","วันพุธ":"พุธ","พฤหัส":"พฤหัส","วันพฤหัส":"พฤหัส","พฤหัสบดี":"พฤหัส","ศุกร์":"ศุกร์","วันศุกร์":"ศุกร์","เสาร์":"เสาร์","วันเสาร์":"เสาร์","อาทิตย์":"อาทิตย์","วันอาทิตย์":"อาทิตย์"};
  var slotM = normalized.match(/(?:ออเดอร์)?\s*(วันทร์|วันจันทร์|จันทร์|วันอังคาร|อังคาร|วันพุธ|พุธ|วันพฤหัส|พฤหัส|พฤหัสบดี|วันศุกร์|ศุกร์|วันเสาร์|เสาร์|วันอาทิตย์|อาทิตย์)/i);
  var deliverySlot = slotM ? (DAY_SLOT_MAP_[slotM[1]] || slotM[1]) : "";

  // parse ค่าส่ง
  var feeM = normalized.match(/ค่าส่ง\s*[:：]?\s*(ปลายทาง|[\d,]+)/i);
  var deliveryFee = 0;
  var deliveryFeeNote = "";
  if (feeM) {
    if (/ปลายทาง/i.test(feeM[1])) { deliveryFeeNote = "ค่าส่งปลายทาง"; }
    else { deliveryFee = toNumber(feeM[1]); }
  }

  var totalM   = normalized.match(/รวม\s*([\d,]+)\s*฿?/i);
  var items    = parseItemsFlexible_(normalized);
  var grandTotal = totalM ? toNumber(totalM[1]) : calculateOrderTotal_(items, deliveryFee);

  return {
    orderId:      generateOrderId_(),
    deliveryDate: deliveryDateStr || getTodayTH(),
    paymentDate:  deliveryDateStr || getTodayTH(),
    customerName: taggedName || "",
    tableName:    taggedName || "",
    phone:"", channel:"LINE", orderType:"Wholesale",
    deliveryType:"Delivery", deliveryTime:deliverySlot,
    location:taggedName||"", googleMap:"", deliveryFee:deliveryFee,
    grandTotal:grandTotal,
    note:deliveryFeeNote,
    paymentStatus:"Not Required", status:"preparing", kitchenStatus:"รอทำ",
    patternType:"loose_header",
    parsedStatus:(taggedName && items.length>0) ? "OK" : "NEED_REVIEW",
    reviewFlag:(taggedName && items.length>0) ? "" : "REVIEW",
    items:items
  };
}

// ============================================================
// ★ NEW v3.3 — MANUAL SUMMARY PARSER (ไม่มี 📝 icon)
// รองรับ: "บ้านปูสวนย์คาเฟ่ ส่งวันเสาร์ 10:00\n• มะพร้าว 1 วง 750฿\n..."
// ============================================================
function parseManualSummaryOrder_(text) {
  var normalized = String(text||"").replace(/\r/g,"");
  var lines = normalized.split("\n").map(function(s){return s.trim();}).filter(Boolean);

  var customer = "", deliverySlot = "", deliveryTime = "", deliveryDateStr = "";

  // บรรทัดแรก: "บ้านปูสวนย์คาเฟ่ ส่งวันเสาร์ 10:00"
  var firstLine = lines[0] || "";
  var slotInFirst = firstLine.match(/ส่งวัน(จันทร์|อังคาร|พุธ|พฤหัส|ศุกร์|เสาร์|อาทิตย์)\s*(\d{1,2}:\d{2})?/i);
  if (slotInFirst) {
    customer     = firstLine.replace(/\s*ส่งวัน.*/i,"").trim();
    deliverySlot = slotInFirst[1];
    deliveryTime = slotInFirst[2] || "";
  } else {
    customer = firstLine;
  }

  // parse วันที่จากทั้งข้อความ
  deliveryDateStr = parseThaiMonthDateFromText_(normalized);

  // parse ค่าส่ง + ปลายทาง
  var feeM = normalized.match(/ค่าส่ง\s*[:：]?\s*(ปลายทาง|[\d,]+)/i);
  var deliveryFee = 0, deliveryFeeNote = "";
  if (feeM) {
    if (/ปลายทาง/i.test(feeM[1])) deliveryFeeNote = "ค่าส่งปลายทาง";
    else deliveryFee = toNumber(feeM[1]);
  }

  var totalM = normalized.match(/รวม\s*([\d,]+)\s*฿?/i);
  var items  = parseItemsFlexible_(normalized);
  var grandTotal = totalM ? toNumber(totalM[1]) : calculateOrderTotal_(items, deliveryFee);

  return {
    orderId:      generateOrderId_(),
    deliveryDate: deliveryDateStr || getTodayTH(),
    paymentDate:  deliveryDateStr || getTodayTH(),
    customerName: customer || "",
    tableName:    customer || "",
    phone:"", channel:"LINE", orderType:"Wholesale",
    deliveryType:"Delivery",
    // [FIX Bug 3] deliveryTime = เวลาจริง (10:00), deliverySlot = วัน (เสาร์)
    deliveryTime: deliveryTime || "",
    deliverySlot: deliverySlot || deliveryTime || "",
    location:customer||"", googleMap:"", deliveryFee:deliveryFee,
    grandTotal:grandTotal,
    note:deliveryFeeNote,
    paymentStatus:"Not Required", status:"preparing", kitchenStatus:"รอทำ",
    patternType:"manual_summary",
    parsedStatus:(customer && items.length>0) ? "OK" : "NEED_REVIEW",
    reviewFlag:(customer && items.length>0) ? "" : "REVIEW",
    items:items
  };
}

// ============================================================
// ★ NEW v3.3 — PAYMENT ADDRESS ORDER PARSER
// รองรับ: "12/05/69\nเค้กชีสหน้าไหม้ 1 P 899.-\nโอนเรียบร้อย\nที่อยู่..."
// ============================================================
function parsePaymentAddressOrder_(text) {
  try {
    var normalized = String(text||"").replace(/\r/g,"");
    var lines = normalized.split("\n").map(function(s){return s.trim();}).filter(Boolean);

    // parse วันที่ (DD/MM/YY หรือ DD/MM/YYYY หรือ Thai month)
    var deliveryDateStr = "";
    var slashDateM = normalized.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (slashDateM) {
      var dd=parseInt(slashDateM[1],10), mm=parseInt(slashDateM[2],10), yy=parseInt(slashDateM[3],10);
      if (yy < 100) yy += 2500;
      else if (yy < 2400) yy += 543;
      deliveryDateStr = pad2(dd)+"/"+pad2(mm)+"/"+yy;
    } else {
      deliveryDateStr = parseThaiMonthDateFromText_(normalized);
    }

    // Channel : XXX → channel + customer name
    var channelVal = "LINE", customerVal = "";
    var chM = normalized.match(/Channel\s*[:：]\s*([^\n\r]+)/i);
    if (chM) {
      var chRaw = chM[1].trim();
      var chParts = chRaw.split(":");
      if (chParts.length >= 2) {
        channelVal  = chParts[0].trim() || "LINE";
        customerVal = chParts.slice(1).join(":").trim();
      } else {
        channelVal = chRaw || "LINE";
      }
    }

    // field-aware extraction พร้อม stop-words
    var STOP_ = "เบอร์|วันที่|Channel|รวม|ค่าส่ง|รายการ|ชื่อคนรับ|ที่อยู่|สถานที่|หมายเหตุ|Note|payment|order\\s*type";

    // ชื่อคนรับ: <ชื่อ> — รับ multi-line จนถึง stop-word
    var customerNameFromForm = "";
    var nameM = normalized.match(new RegExp("ชื่อคนรับ\\s*[:：]\\s*([^\\n\\r]+(?:\\n(?!"+STOP_+")[^\\n\\r]+)*)","i"));
    if (nameM) {
      var nameRaw = nameM[1].trim();
      // ถ้าดูเหมือนชื่อจริง (ไม่ขึ้นต้นด้วยตัวเลข, สั้น) → customer
      if (!/^\d/.test(nameRaw) && nameRaw.length < 60) customerNameFromForm = nameRaw;
      else customerNameFromForm = ""; // ถ้ายาว/ขึ้นต้นตัวเลข เก็บเป็น location แทน
    }
    if (customerNameFromForm && !customerVal) customerVal = customerNameFromForm;

    // ที่อยู่: <address> — เป็นฟิลด์แยก
    var location = "";
    var addrM = normalized.match(new RegExp("(?:ที่อยู่|สถานที่จัดส่ง|สถานที่)\\s*[:：]?\\s*([^\\n\\r]+(?:\\n(?!"+STOP_+")[^\\n\\r]+)*)","i"));
    if (addrM) location = addrM[1].trim();
    else if (nameM && !customerNameFromForm) {
      // ชื่อคนรับ ที่ยาว/ขึ้นต้นตัวเลข → ใช้เป็น location แทน
      location = nameM[1].trim();
    }

    var phoneVal = "";
    var phM = normalized.match(/เบอร์(?:ผู้รับ|โทร|ติดต่อ)?\s*[:：]?\s*([\d\-\s]{8,15})/i);
    if (phM) phoneVal = phM[1].replace(/\s/g,"").trim();

    // หมายเหตุ
    var noteVal = "";
    var noteM = normalized.match(new RegExp("(?:หมายเหตุ|Note)\\s*[:：]\\s*([^\\n\\r]+(?:\\n(?!"+STOP_+")[^\\n\\r]+)*)","i"));
    if (noteM) {
      var nr = noteM[1].trim();
      // ตัด placeholder ของฟอร์มออก
      if (!/^\(.*\)$/.test(nr)) noteVal = nr;
    }

    // เมนู: line ที่มี unit P หรือ ชิ้น หรือ ปอนด์ และราคา
    var items = [];
    var itemRx = /^(.+?)\s+(\d+)\s*(P|ชิ้น|วง|ปอนด์|กล่อง|set|เซท|ลูก|ถาด)?\s+([\d,]+)(?:[.\-]{0,2})\s*(?:฿|บาท)?\s*(?:\(.*\))?\s*$/i;
    lines.forEach(function(line) {
      // strip bullet ⁃ (U+2043) + อื่นๆ
      var clean = line.replace(/^[\-–—•*⁃‣▪▫◦]\s*/,"");
      var m = clean.match(itemRx);
      if (m) {
        var rawName = m[1].trim();
        var qty     = parseInt(m[2],10);
        var unit    = m[3] ? (m[3].toUpperCase()==="P"?"ปอนด์":m[3]) : "ชิ้น";
        var tt      = toNumber(m[4]);
        var mn      = resolveMenuAlias(rawName);
        items.push({ menuName:mn, unit:unit, quantity:qty,
                     unitPrice:qty>0?Math.round(tt/qty):0, itemTotal:tt,
                     reviewFlag: isKnownMenu_(mn) ? "" : "REVIEW" });
      }
    });

    // grand total รับ "รวม: 258" + "รวมทั้งหมด: 258"
    var totalM = normalized.match(/รวม(?:ทั้งหมด)?\s*[:：]?\s*([\d,]+)\s*฿?/i);
    var grandTotal = totalM ? toNumber(totalM[1]) : calculateOrderTotal_(items, 0);
    if (!grandTotal && items.length) grandTotal = calculateOrderTotal_(items, 0);

    // paymentStatus: Paid เฉพาะเมื่อมีคำว่าโอน/ชำระ/จ่าย
    var paid = /(โอนเรียบร้อย|โอนแล้ว|ชำระแล้ว|จ่ายแล้ว|โอน|ชำระ|จ่าย)/i.test(normalized);

    return {
      orderId:      generateOrderId_(),
      deliveryDate: deliveryDateStr || getTodayTH(),
      paymentDate:  deliveryDateStr || getTodayTH(),
      customerName: customerVal || "",
      tableName:    customerVal || "",
      phone:        phoneVal,
      channel:      channelVal,
      orderType:    items.reduce(function(s,i){return s+(i.quantity||0);},0) >= 5 ? "Wholesale" : "Retail",
      deliveryType:"Delivery", deliveryTime:"",
      location:location||"", googleMap:"", deliveryFee:0,
      grandTotal:grandTotal,
      note: noteVal || (location?"ที่อยู่: "+location:""),
      paymentStatus: paid ? "Paid" : "Pending",
      status:"preparing", kitchenStatus:"รอทำ",
      patternType:"payment_address",
      parsedStatus:items.length>0 ? "OK" : "NEED_REVIEW",
      reviewFlag:items.length>0 ? "" : "REVIEW",
      items:items
    };
  } catch(e) {
    Logger.log("[ERROR] parsePaymentAddressOrder_ failed: "+e.message+" | stack: "+(e.stack||""));
    return null;
  }
}

// ============================================================
// ★ NEW v3.1 — MODIFIER PARSER
// อ่านข้อความแก้ออเดอร์กลางแชท
// ============================================================
function parseModifier_(text) {
  var t = String(text || "").trim().toLowerCase();
  var result = { action: "", menuName: "", qty: 0, price: 0, raw: text };

  // เพิ่ม/เพิ่มช็อก
  if (/^เพิ่ม/.test(t)) {
    result.action = "add";
    var mAdd = text.match(/^เพิ่ม\s*(.+?)\s*(\d+)?\s*(คู่|ชิ้น|วง)?\s*(\d+)?฿?/i);
    if (mAdd) {
      result.menuName = mAdd[1] ? resolveMenuAlias(mAdd[1].trim()) : "";
      result.qty      = mAdd[2] ? parseInt(mAdd[2], 10) : 1;
      result.price    = mAdd[4] ? toNumber(mAdd[4]) : getPriceForMenu(result.menuName, mAdd[3] || "ชิ้น", result.qty);
    }
    return result;
  }

  // เอาออก/ลบ
  if (/^(เอา|ลบ|เอาออก)/.test(t)) {
    result.action = "remove";
    var mRem = text.match(/^(?:เอา|ลบ|เอาออก)\s*(.+?)(?:ออก)?$/i);
    if (mRem) result.menuName = resolveMenuAlias(mRem[1].trim());
    return result;
  }

  // เปลี่ยน X เป็น Y
  if (/^เปลี่ยน/.test(t)) {
    result.action = "replace";
    var mChg = text.match(/^เปลี่ยน\s*(.+?)\s*เป็น\s*(.+)$/i);
    if (mChg) {
      result.fromMenu = resolveMenuAlias(mChg[1].trim());
      result.menuName = resolveMenuAlias(mChg[2].trim());
    }
    return result;
  }

  // ลดเหลือ X
  if (/^ลด/.test(t)) {
    result.action = "reduce";
    var mRed = text.match(/^ลด\s*(.+?)\s*เหลือ\s*(\d+)/i);
    if (mRed) { result.menuName = resolveMenuAlias(mRed[1].trim()); result.qty = parseInt(mRed[2], 10); }
    return result;
  }

  return result;
}

// ============================================================
// ★ NEW v3.1 — AUTO CALCULATE ORDER TOTAL
// ============================================================
function calculateOrderTotal_(items, deliveryFee) {
  var total = (items || []).reduce(function(s, item) { return s + toNumber(item.itemTotal); }, 0);
  return total + toNumber(deliveryFee || 0);
}

// ============================================================
// ★ NEW v3.1 — CUSTOMER SUMMARY GENERATOR
// สร้างข้อความสรุปออเดอร์แบบที่ร้านใช้จริง
// ============================================================
function generateCustomerSummary_(data) {
  var lines = [];

  // header
  var deliveryLabel = "";
  if (data.deliveryDate) {
    var d = thDateToDate(data.deliveryDate);
    if (d) {
      var dayNames = ["อาทิตย์","จันทร์","อังคาร","พุธ","พฤหัส","ศุกร์","เสาร์"];
      var thMonths = ["","มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
      deliveryLabel = dayNames[d.getDay()] + " " + d.getDate() + " " + thMonths[d.getMonth()+1] + " " + (d.getFullYear()+543);
    }
  }

  var headerLine = "📝 ออเดอร์รอบส่ง " + (deliveryLabel || data.deliveryDate || "-");
  if (data.deliveryTime) headerLine += " " + data.deliveryTime;
  if (data.customerName || data.tableName || data.location) {
    headerLine += " @" + (data.customerName || data.tableName || data.location);
  }
  lines.push(headerLine);
  lines.push("");

  // items
  (data.items || []).forEach(function(item) {
    var menuLine = item.menuName + " " + item.quantity + " " + (item.unit || "ชิ้น");
    if (toNumber(item.itemTotal) > 0) menuLine += " " + toNumber(item.itemTotal).toLocaleString() + "฿";
    lines.push(menuLine);
  });

  lines.push("");

  // delivery fee
  if (toNumber(data.deliveryFee) > 0) {
    lines.push("ค่าส่ง " + toNumber(data.deliveryFee).toLocaleString() + "฿");
  }

  // total
  lines.push("รวม " + toNumber(data.grandTotal).toLocaleString() + "฿");

  // payment status
  if (data.paymentStatus === "Paid") {
    lines.push("✅ ชำระแล้ว");
  } else {
    lines.push("💳 รอชำระค่ะ");
  }

  return lines.join("\n");
}

// ============================================================
// DATE / TIME UTILS
// ============================================================
function pad2(n) { return String(n).padStart(2,"0"); }
function isIsoDateTimeString(str) { return /^\d{4}-\d{2}-\d{2}T/.test(String(str||"").trim()); }

function parseSlashDateParts(str) {
  var m = String(str||"").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  var dd=parseInt(m[1],10), mm=parseInt(m[2],10), yy=parseInt(m[3],10);
  if (yy < 100) yy += 2000;
  if (yy < 2400) yy += 543;
  return { day:dd, month:mm, yearBE:yy };
}

function formatDateFromDateObject(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return "";
  var dd   = Utilities.formatDate(d, TIMEZONE, "dd");
  var mm   = Utilities.formatDate(d, TIMEZONE, "MM");
  var yyyy = parseInt(Utilities.formatDate(d, TIMEZONE, "yyyy"), 10);
  if (yyyy < 2400) yyyy += 543;
  return dd + "/" + mm + "/" + yyyy;
}

function formatDateTH(value) {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date) return formatDateFromDateObject(value);
  var str = String(value).trim();
  if (!str) return "";
  var slash = parseSlashDateParts(str);
  if (slash) return pad2(slash.day) + "/" + pad2(slash.month) + "/" + slash.yearBE;
  if (str.indexOf("GMT") > -1 || str.indexOf("UTC") > -1 || isIsoDateTimeString(str)) {
    var iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) {
      var iy = parseInt(iso[1], 10);
      if (iy >= 2400) return iso[3] + "/" + iso[2] + "/" + iy;
    }
    var p = new Date(str);
    if (!isNaN(p.getTime())) return formatDateFromDateObject(p);
    return "";
  }
  var parsed = new Date(str);
  if (!isNaN(parsed.getTime())) return formatDateFromDateObject(parsed);
  return "";
}

function formatTimeTH(value) {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return "";
    var hm = Utilities.formatDate(value, TIMEZONE, "H:mm");
    return hm === "0:00" ? "" : hm;
  }
  var str = String(value).trim();
  if (!str) return "";
  var tp = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (tp) return parseInt(tp[1],10) + ":" + tp[2];
  if (str.indexOf("GMT") > -1 || str.indexOf("UTC") > -1 || isIsoDateTimeString(str)) {
    var p2 = new Date(str);
    if (!isNaN(p2.getTime())) {
      var h2 = Utilities.formatDate(p2, TIMEZONE, "H:mm");
      return h2 === "0:00" ? "" : h2;
    }
    return "";
  }
  var p3 = new Date(str);
  if (!isNaN(p3.getTime())) {
    var h3 = Utilities.formatDate(p3, TIMEZONE, "H:mm");
    return h3 === "0:00" ? "" : h3;
  }
  return str;
}

function normalizeMonthInput(value) {
  var cleaned = String(value||"").replace(/[\[\]]/g,"").trim();
  var m = cleaned.match(/^(\d{1,2})\/(\d{2,4})$/);
  if (!m) return cleaned;
  var mm = pad2(m[1]);
  var yyyy = parseInt(m[2],10);
  if (yyyy < 100) yyyy += 2000;
  if (yyyy < 2400) yyyy += 543;
  return mm + "/" + yyyy;
}

function getTodayTH()     { return formatDateTH(new Date()); }
function getTomorrowTH()  { var d = new Date(); d.setDate(d.getDate()+1); return formatDateTH(d); }
function getTimestampTH() {
  var now = new Date();
  return formatDateTH(now) + " " +
    parseInt(Utilities.formatDate(now,TIMEZONE,"H"),10) + ":" +
    Utilities.formatDate(now,TIMEZONE,"mm") + ":" +
    Utilities.formatDate(now,TIMEZONE,"ss");
}

function thDateToDate(s) {
  if (!s) return null;
  var parts = String(s).trim().split("/");
  if (parts.length !== 3) return null;
  var y = parseInt(parts[2],10);
  if (y > 2500) y -= 543;
  var d = new Date(y, parseInt(parts[1],10)-1, parseInt(parts[0],10));
  return isNaN(d.getTime()) ? null : d;
}


function isDeliveryPassed(deliveryDateTH, deliveryTimeRaw) {
  var d = thDateToDate(deliveryDateTH);
  if (!d) return false;
  var now = new Date();
  var today  = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var delDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (delDay < today) return true;
  if (delDay > today) return false;
  var ts = formatTimeTH(deliveryTimeRaw);
  if (ts) {
    var tp = ts.match(/^(\d{1,2}):(\d{2})/);
    if (tp) {
      if (parseInt(tp[1],10) < now.getHours()) return true;
      if (parseInt(tp[1],10) === now.getHours() && parseInt(tp[2],10) <= now.getMinutes()) return true;
    }
  }
  return false;
}

function deliveryDateSortKey(thDateStr) {
  var d = thDateToDate(thDateStr);
  return d ? d.getTime() : 0;
}

// ============================================================
// SHEET / HEADERS
// ============================================================
function getSpreadsheet_() {
  return SPREADSHEET_ID && SPREADSHEET_ID !== "YOUR_SPREADSHEET_ID"
    ? SpreadsheetApp.openById(SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet() {
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0)
    sh.getRange(1,1,1,REQUIRED_HEADERS_DEFAULT.length).setValues([REQUIRED_HEADERS_DEFAULT]);
  return sh;
}

function getLogSheet_() {
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName(LOG_SHEET_NAME);
  if (!sh) sh = ss.insertSheet(LOG_SHEET_NAME);
  if (sh.getLastRow() === 0)
    sh.getRange(1,1,1,10).setValues([[
      "Timestamp","Date TH","Source Type","User ID","Message ID",
      "Reply Token","Text","Resolved Text","Intent","Handled By"
    ]]);
  return sh;
}

function getHeaderMap_() {
  if (RUNTIME_MEMO_.header_map) return RUNTIME_MEMO_.header_map;
  var cacheKey = makeCacheKey_("header_map_v2");
  var cached   = cacheGetJson_(cacheKey);
  if (cached) { RUNTIME_MEMO_.header_map = cached; return cached; }

  var sh      = getSheet();
  var headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0]
                  .map(function(v){ return String(v||"").trim(); });
  var map = {};
  for (var key in HEADER_ALIASES) {
    if (!HEADER_ALIASES.hasOwnProperty(key)) continue;
    map[key] = -1;
    var aliases = HEADER_ALIASES[key];
    for (var i = 0; i < aliases.length; i++) {
      var idx = headers.indexOf(aliases[i]);
      if (idx >= 0) { map[key] = idx + 1; break; }
    }
  }
  RUNTIME_MEMO_.header_map = map;
  cachePutJsonIfSmall_(cacheKey, map, CACHE_TTL_HEADER, 12000);
  return map;
}

function clearSheetCache() {
  var cache = CacheService.getScriptCache();
  var v = getCacheVersion_();
  var keys = [
    "sheet_data_v2","header_map_v2","index_rows_v2","plan_index_light_v1",
    "sheet_data_v2_v"+v, "header_map_v2_v"+v,
    "index_rows_v2_v"+v, "plan_index_light_v1_v"+v
  ];
  keys.forEach(function(k){ cache.remove(k); });
  resetRuntimeMemo_();
  bumpCacheVersion_();
}

function getSheetDataCached() {
  if (RUNTIME_MEMO_.sheet_data) return RUNTIME_MEMO_.sheet_data;
  var cacheKey = makeCacheKey_("sheet_data_v2");
  var cached   = cacheGetJson_(cacheKey);
  if (cached) { RUNTIME_MEMO_.sheet_data = cached; return cached; }

  var sh      = getSheet();
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow <= 1 || lastCol <= 0) { RUNTIME_MEMO_.sheet_data = []; return []; }

  var usedCols = Math.min(lastCol, 26);
  var data     = sh.getRange(2, 1, lastRow-1, usedCols).getValues();
  var safe     = new Array(data.length);
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var nr  = new Array(row.length);
    for (var j = 0; j < row.length; j++)
      nr[j] = (row[j] instanceof Date) ? row[j].toISOString() : row[j];
    safe[i] = nr;
  }

  RUNTIME_MEMO_.sheet_data = safe;
  cachePutJsonIfSmall_(cacheKey, safe, CACHE_TTL_SHEET, 85000);
  return safe;
}

function rowArrayToObject_(row, rowNumber, map) {
  function v(name) { var c = map[name]; return c > 0 ? row[c-1] : ""; }
  // normalize ตั้งแต่ต้น ไม่ว่า sheet จะเก็บเป็น serial / ISO / slash
  return {
    rowNumber:     rowNumber,
    timestamp:     v("timestamp"),
    orderId:       v("orderId"),
    deliveryDate:  normalizeDateText_(v("deliveryDate")),
    paymentDate:   normalizeDateText_(v("paymentDate")),
    customerName:  v("customerName"),
    phone:         normalizePhone(v("phone")),
    channel:       normalizeChannel(v("channel")),
    orderType:     v("orderType"),
    tableName:     v("tableName"),
    deliveryType:  normalizeDeliveryType(v("deliveryType")),
    deliveryTime:  normalizeDeliveryTime_(cleanDeliveryTime(v("deliveryTime"))),
    location:      v("location"),
    menuName:      cleanMenuName_(v("menuName")),
    unit:          v("unit"),
    qty:           v("qty"),
    unitPrice:     v("unitPrice"),
    itemTotal:     v("itemTotal"),
    deliveryFee:   v("deliveryFee"),
    grandTotal:    v("grandTotal"),
    paymentStatus: v("paymentStatus"),
    note:          v("note"),
    rawText:       v("rawText"),
    status:        normalizeStatus(v("status")),
    googleMap:     v("googleMap"),
    lastUpdatedAt: v("lastUpdatedAt"),
    lastUpdatedBy: v("lastUpdatedBy")
  };
}

function isRowEffectivelyEmpty_(row) {
  if (!row || !row.length) return true;
  for (var i = 0; i < row.length; i++)
    if (row[i] !== "" && row[i] !== null && row[i] !== undefined) return false;
  return true;
}

function hasMeaningfulOrderData_(obj) {
  return !!(obj && (obj.orderId || obj.customerName || obj.menuName ||
                    obj.deliveryDate || obj.phone || obj.tableName || obj.rawText));
}

function isRowCancelled(r) {
  return normalizeStatus(r.status || "") === "❌ ยกเลิก";
}

function getOrderRows(filterFn, limit) {
  var data    = getSheetDataCached();
  var map     = getHeaderMap_();
  if (!data || !data.length) return [];
  var rows    = [];
  var maxRows = (limit && limit > 0) ? limit : ORDER_ROWS_DEFAULT_LIMIT;
  for (var i = 0; i < data.length; i++) {
    if (maxRows > 0 && rows.length >= maxRows) break;
    var raw = data[i];
    if (isRowEffectivelyEmpty_(raw)) continue;
    var obj = rowArrayToObject_(raw, i+2, map);
    if (!hasMeaningfulOrderData_(obj)) continue;
    if (!filterFn || filterFn(obj)) rows.push(obj);
  }
  return rows;
}

function getOrderRowsReverse(filterFn, limit) {
  var data    = getSheetDataCached();
  var map     = getHeaderMap_();
  if (!data || !data.length) return [];
  var rows    = [];
  var maxRows = limit || 50;
  for (var i = data.length-1; i >= 0; i--) {
    if (rows.length >= maxRows) break;
    var raw = data[i];
    if (isRowEffectivelyEmpty_(raw)) continue;
    var obj = rowArrayToObject_(raw, i+2, map);
    if (!hasMeaningfulOrderData_(obj)) continue;
    if (!filterFn || filterFn(obj)) rows.push(obj);
  }
  return rows;
}

function groupRowsByOrder(rows) {
  var map = {};
  for (var i = 0; i < rows.length; i++) {
    var r   = rows[i];
    var key = String(r.orderId || "");
    if (!key) continue;
    if (!map[key]) map[key] = { orderId:key, rows:[] };
    map[key].rows.push(r);
  }
  return Object.keys(map).map(function(k){ return map[k]; });
}

function findOrderRowsById_(orderId) {
  return getOrderRows(function(r){
    return String(r.orderId||"").toLowerCase() === String(orderId||"").toLowerCase();
  }, 50);
}

function getLatestUniqueOrderRows_(limit) {
  var maxScan = Math.max((limit||5) * 8, 80);
  var rows    = getOrderRowsReverse(function(r){ return !isRowCancelled(r); }, maxScan);
  if (!rows.length) return [];
  var groups   = groupRowsByOrder(rows);
  var selected = groups.slice(0, limit||5);
  var out      = [];
  for (var i = 0; i < selected.length; i++) out = out.concat(selected[i].rows);
  return out;
}

function getLatestActiveOrdersFast_(limit, userId, customerName) {
  var maxScan      = Math.max((limit||3) * 10, 50);
  var customerNorm = customerName ? safeLower_(customerName).trim() : "";
  var seen = {}, orderIds = [];

  getOrderRowsReverse(function(r) {
    if (isRowCancelled(r)) return false;
    var oid = String(r.orderId||"");
    if (!oid || seen[oid]) return false;
    if (customerNorm && safeLower_(r.customerName).indexOf(customerNorm) === -1) return false;
    seen[oid] = true;
    orderIds.push(oid);
    return true;
  }, maxScan);

  if (!orderIds.length) return [];
  var oidSet = {};
  orderIds.slice(0, limit||3).forEach(function(oid){ oidSet[oid] = true; });
  var rows     = getOrderRows(function(r){ return !!oidSet[String(r.orderId||"")]; }, 200);
  var grouped  = groupRowsByOrder(rows);
  grouped.sort(function(a,b){
    return orderIds.indexOf(String(a.orderId)) - orderIds.indexOf(String(b.orderId));
  });
  return grouped;
}

// ============================================================
// INDEX CACHE
// ============================================================
function getIndexedRowsCache_() {
  if (RUNTIME_MEMO_.index_rows) return RUNTIME_MEMO_.index_rows;
  var cacheKey = makeCacheKey_("index_rows_v2");
  var cached   = cacheGetJson_(cacheKey);
  if (cached) { RUNTIME_MEMO_.index_rows = cached; return cached; }

  var data   = getSheetDataCached();
  var map    = getHeaderMap_();
  var byDate = {}, byMonth = {};

  for (var i = 0; i < data.length; i++) {
    var raw = data[i];
    if (isRowEffectivelyEmpty_(raw)) continue;
    var r = rowArrayToObject_(raw, i+2, map);
    if (!hasMeaningfulOrderData_(r) || isRowCancelled(r)) continue;
    // rowArrayToObject_ normalize แล้ว → r.deliveryDate พร้อมใช้ตรงๆ
    var d = r.deliveryDate;
    if (!d) continue;
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(r);
    var parts = d.split("/");
    if (parts.length === 3) {
      var mk = parts[1] + "/" + parts[2];
      if (!byMonth[mk]) byMonth[mk] = [];
      byMonth[mk].push(r);
    }
  }

  var idx = { byDate:byDate, byMonth:byMonth };
  RUNTIME_MEMO_.index_rows = idx;
  cachePutJsonIfSmall_(cacheKey, idx, CACHE_TTL_INDEX, 85000);
  return idx;
}

function getRowsByDeliveryDateFast_(targetDate) {
  return getIndexedRowsCache_().byDate[targetDate] || [];
}
function getRowsByMonthFast_(monthKey) {
  return getIndexedRowsCache_().byMonth[monthKey] || [];
}

function getNextActiveDates_(limit) {
  var idx      = getIndexedRowsCache_();
  var todayKey = deliveryDateSortKey(getTodayTH());
  return Object.keys(idx.byDate || {})
    .filter(function(d){ return deliveryDateSortKey(d) >= todayKey && (idx.byDate[d]||[]).length > 0; })
    .sort(function(a,b){ return deliveryDateSortKey(a) - deliveryDateSortKey(b); })
    .slice(0, limit||7);
}

// ============================================================
// ★ v3.5 — PLAN 7 LIGHT INDEX
// อ่านเฉพาะ column ที่จำเป็น ไม่อ่าน Raw Text (col V)
// เร็วกว่า getIndexedRowsCache_ เพราะ payload เล็กกว่ามาก
// ============================================================
function getPlanIndexCache_() {
  if (RUNTIME_MEMO_.plan_index) return RUNTIME_MEMO_.plan_index;
  var cacheKey = makeCacheKey_("plan_index_light_v1");
  var cached   = cacheGetJson_(cacheKey);
  if (cached) { RUNTIME_MEMO_.plan_index = cached; return cached; }

  var tA = new Date().getTime();
  var sh      = getSheet();
  var lastRow = sh.getLastRow();
  if (lastRow <= 1) {
    var empty = { byDate:{} };
    RUNTIME_MEMO_.plan_index = empty;
    return empty;
  }
  var rowCount = lastRow - 1;
  var lastCol  = Math.max(sh.getLastColumn(), 26);

  // [Speed Fix] อ่านครั้งเดียว A:lastCol — skip col V (index 21) ใน loop
  var allData = sh.getRange(2, 1, rowCount, lastCol).getDisplayValues();
  var tB = new Date().getTime();
  Logger.log("PlanIdx: rows="+rowCount+" | single read="+(tB-tA)+"ms");

  var byDate = {};

  for (var i = 0; i < rowCount; i++) {
    var row = allData[i];
    // col index (0-based): A=0,B=1,C=2...K=10,L=11,M=12...U=20,V=21(skip),W=22
    var deliveryDate = normalizeDateText_(row[2]);   // C = Delivery Date
    if (!deliveryDate) continue;
    var status = normalizeStatus(row[22]);            // W = Status
    if (status === "❌ ยกเลิก") continue;
    var menuName = cleanMenuName_(row[12]);           // M = Menu Name
    var orderId  = String(row[1]||"").trim();         // B = Order ID
    if (!orderId && !menuName) continue;

    var rowObj = {
      rowNumber:    i + 2,
      orderId:      orderId,
      deliveryDate: deliveryDate,
      customerName: String(row[4]||"").trim(),        // E
      tableName:    String(row[8]||"").trim(),         // I
      deliveryType: normalizeDeliveryType(row[9]),     // J
      deliveryTime: normalizeDeliveryTime_(row[10]),   // K
      location:     String(row[11]||"").trim(),        // L
      menuName:     menuName,
      unit:         row[13],                           // N
      qty:          row[14],                           // O
      itemTotal:    row[16],                           // Q
      deliveryFee:  row[17],                           // R
      grandTotal:   row[18],                           // S
      paymentStatus:row[19],                           // T
      note:         row[20],                           // U
      status:       status
      // ไม่เก็บ: timestamp, phone, channel, orderType, paymentDate,
      //           unitPrice, googleMap, lastUpdatedAt, lastUpdatedBy
      // เพื่อให้ JSON เล็ก → cache ได้จริง
    };

    if (!byDate[deliveryDate]) byDate[deliveryDate] = [];
    byDate[deliveryDate].push(rowObj);
  }

  var tC = new Date().getTime();
  Logger.log("PlanIdx: loop="+(tC-tB)+"ms | keys="+Object.keys(byDate).length+" | total="+(tC-tA)+"ms");

  var idx = { byDate:byDate };
  RUNTIME_MEMO_.plan_index = idx;
  var putOk = cachePutJsonIfSmall_(cacheKey, idx, 600, 85000);
  Logger.log("PlanIdx: cache put="+putOk);
  return idx;
}

function getPlanRowsByDeliveryDateFast_(targetDate) {
  var dateKey = normalizeDateText_(targetDate) || targetDate;
  return getPlanIndexCache_().byDate[dateKey] || [];
}

function getNextActivePlanDates_(limit) {
  var idx      = getPlanIndexCache_();
  var todayKey = deliveryDateSortKey(getTodayTH());
  return Object.keys(idx.byDate || {})
    .filter(function(d){ return deliveryDateSortKey(d) >= todayKey && (idx.byDate[d]||[]).length > 0; })
    .sort(function(a,b){ return deliveryDateSortKey(a) - deliveryDateSortKey(b); })
    .slice(0, limit||7);
}

// ============================================================
// MONTH ANALYTICS (cached 600s)
// ============================================================
function getMonthAnalyticsCached_(monthKey) {
  var memoKey  = "month_analytics_" + monthKey;
  if (RUNTIME_MEMO_[memoKey]) return RUNTIME_MEMO_[memoKey];
  var cacheKey = makeCacheKey_("month_analytics_v4_" + monthKey);
  var cached   = cacheGetJson_(cacheKey);
  if (cached) { RUNTIME_MEMO_[memoKey] = cached; return cached; }

  var rows = getRowsByMonthFast_(monthKey);
  var grandTotal=0, totalQty=0, orderCount=0;
  var menuQty={}, dateCount={}, channelData={}, menuRevenue={}, topDates={};
  var seenOrder={}, recentOrdersLite=[];

  for (var i = 0; i < rows.length; i++) {
    var r   = rows[i];
    var qty = toNumber(r.qty);
    totalQty += qty;
    if (r.menuName) {
      menuQty[r.menuName]     = (menuQty[r.menuName]||0) + qty;
      menuRevenue[r.menuName] = (menuRevenue[r.menuName]||0) + toNumber(r.itemTotal);
    }
    // r.deliveryDate normalized by rowArrayToObject_
    var d = r.deliveryDate;
    if (d) {
      dateCount[d] = (dateCount[d]||0) + 1;
      topDates[d]  = (topDates[d]||0) + qty;
    }
    var oid = String(r.orderId||"");
    if (!oid || seenOrder[oid]) continue;
    seenOrder[oid] = true;
    orderCount++;
    var g = toNumber(r.grandTotal);
    grandTotal += g;
    var ch = r.channel || "ไม่ระบุ";
    if (!channelData[ch]) channelData[ch] = {count:0,total:0};
    channelData[ch].count++;
    channelData[ch].total += g;
    recentOrdersLite.push({
      orderId:      oid,
      customerName: r.customerName||"-",
      deliveryDate: d,
      deliveryTime: r.deliveryTime, // normalized by rowArrayToObject_
      grandTotal:   g,
      passed:       isDeliveryPassed(d, r.deliveryTime)
    });
  }

  recentOrdersLite.sort(function(a,b){
    var pA=a.passed?1:0, pB=b.passed?1:0;
    return pA-pB || deliveryDateSortKey(a.deliveryDate)-deliveryDateSortKey(b.deliveryDate);
  });
  recentOrdersLite = recentOrdersLite.slice(0, Math.max(2, SUMMARY_MONTH_DISPLAY_LIMIT));

  var analytics = {
    monthKey:monthKey, orderCount:orderCount, rowCount:rows.length,
    grandTotal:grandTotal, totalQty:totalQty,
    activeDays:Object.keys(dateCount).length,
    menuQty:menuQty, menuRevenue:menuRevenue, channelData:channelData,
    topDates:topDates, recentOrdersLite:recentOrdersLite
  };
  RUNTIME_MEMO_[memoKey] = analytics;
  cachePutJsonIfSmall_(cacheKey, analytics, CACHE_TTL_MONTH, 45000);
  return analytics;
}

// ============================================================
// SUMMARY 7 DAYS
// ============================================================
function buildDeliveryPreviewLite_(orderRows) {
  var main = orderRows.find(function(r){ return toNumber(r.grandTotal)>0; }) || orderRows[0] || {};
  return {
    customer:   main.customerName||"-",
    location:   main.location||main.deliveryType||"-",
    time:       main.deliveryTime, // normalized by rowArrayToObject_
    items:      orderRows.slice(0,2).map(function(r){ return r.menuName+" "+toNumber(r.qty)+" ชิ้น"; }).join(", "),
    itemCount:  orderRows.length,
    total:      toNumber(main.grandTotal)
  };
}

function getSummary7DaysDataCached_() {
  var today   = getTodayTH();
  var memoKey = "summary7_" + today;
  if (RUNTIME_MEMO_[memoKey]) return RUNTIME_MEMO_[memoKey];
  var cacheKey = makeCacheKey_("summary7_v4_" + today);
  var cached   = cacheGetJson_(cacheKey);
  if (cached) { RUNTIME_MEMO_[memoKey] = cached; return cached; }

  var nextDates = getNextActiveDates_(7);
  var dayLabels = ["วันนี้","พรุ่งนี้","มะรืน"];
  var dayData   = [];

  for (var i = 0; i < nextDates.length; i++) {
    var targetDate = nextDates[i];
    var rows       = getRowsByDeliveryDateFast_(targetDate);
    var orders     = groupRowsByOrder(rows);
    var totalQty=0, grandTotalAll=0, menuQty={}, deliveries=[];
    for (var j = 0; j < rows.length; j++) {
      totalQty += toNumber(rows[j].qty);
      if (rows[j].menuName) menuQty[rows[j].menuName] = (menuQty[rows[j].menuName]||0) + toNumber(rows[j].qty);
    }
    for (var k = 0; k < orders.length; k++) {
      var main = orders[k].rows.find(function(r){ return toNumber(r.grandTotal)>0; }) || orders[k].rows[0];
      grandTotalAll += toNumber(main.grandTotal);
      if (deliveries.length < 3) deliveries.push(buildDeliveryPreviewLite_(orders[k].rows));
    }
    dayData.push({
      date:targetDate, label:dayLabels[i]||("ลำดับ "+(i+1)),
      orders:orders.length, totalQty:totalQty, grandTotal:grandTotalAll,
      menuQty:menuQty, deliveries:deliveries
    });
  }

  var allMenuQty = {};
  for (var d = 0; d < dayData.length; d++) {
    Object.keys(dayData[d].menuQty).forEach(function(k){
      allMenuQty[k] = (allMenuQty[k]||0) + dayData[d].menuQty[k];
    });
  }

  var result = {
    today:today, basedOn:nextDates.length>0?nextDates[0]:today,
    dayData:dayData,
    totalOrders7: dayData.reduce(function(s,d){ return s+d.orders; },0),
    totalQty7:    dayData.reduce(function(s,d){ return s+d.totalQty; },0),
    totalBaht7:   dayData.reduce(function(s,d){ return s+d.grandTotal; },0),
    allMenuQty:allMenuQty
  };
  RUNTIME_MEMO_[memoKey] = result;
  cachePutJsonIfSmall_(cacheKey, result, CACHE_TTL_SUMMARY7, 35000);
  return result;
}

// ============================================================
// GENERAL HELPERS
// ============================================================
function toNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  var n = Number(String(value).replace(/[,฿\s]/g,""));
  return isNaN(n) ? 0 : n;
}
function safeLower_(v) { return String(v||"").toLowerCase(); }

function isDuplicate(messageId) {
  var props = PropertiesService.getScriptProperties();
  var key   = "msg_" + messageId;
  if (props.getProperty(key)) return true;
  props.setProperty(key, getTodayTH());
  return false;
}

function getUserIdFromEvent_(event) {
  return event && event.source ? (event.source.userId||"") : "";
}

function uniqArray_(arr) {
  var seen={}, out=[];
  arr.forEach(function(v){ var s=String(v||""); if(!s||seen[s]) return; seen[s]=true; out.push(s); });
  return out;
}
function getNotifyRecipients_() { return uniqArray_([].concat(ADMIN_USER_IDS||[],NOTIFY_TO_USER_IDS||[])); }

// ============================================================
// MESSAGE LOGGING
// ============================================================
function appendMessageLog_(event, text, resolvedText, intent, handledBy) {
  try {
    getLogSheet_().appendRow([
      getTimestampTH(), getTodayTH(),
      event&&event.source?(event.source.type||""):"",
      event&&event.source?(event.source.userId||""):"",
      event&&event.message?(event.message.id||""):"",
      event?(event.replyToken||""):"",
      text||"", resolvedText||"", intent||"", handledBy||""
    ]);
  } catch(e) { Logger.log("appendMessageLog_ error: "+e); }
}

// ============================================================
// QUICK REPLY
// ============================================================
// เพิ่มปุ่ม urgent ใน quick reply หลัง save → admin กดได้ทันที
function qrAfterSave(orderId) { return ["เพิ่มเมนู "+orderId,"แก้ "+orderId,"urgent "+orderId,"↩️ เลิกทำ","plan 7"]; }
function qrAfterSearch(keyword) {
  var base = ["search today","summary","summary 7","help"];
  if (keyword) base.unshift("search "+keyword);
  return base.slice(0,5);
}
var QR_MAIN      = ["summary","summary 7","search today","search latest","help"];
var QR_SEARCH    = ["search today","search latest","summary","summary 7","help"];
var QR_SUMMARY   = ["plan 7","summary","summary 7","summary month","summary channel","summary top menu","summary pending"];
var QR_HELP      = ["summary","summary 7","search today","search latest","log today","help"];
var QR_NO_ORDERS = ["📋 คัดลอกฟอร์ม","summary 7","help"];
var QR_CUSTOMER_MAIN = ["ดูเมนูเค้ก","สั่งเค้ก","เช็คสถานะ","แจ้งโอนเงิน","help"];

// ============================================================
// GROUP STANDBY
// ============================================================
function getGroupStandbyKey(source) {
  if (!source) return "";
  if (source.type==="group") return "standby_group_"+source.groupId;
  if (source.type==="room")  return "standby_room_"+source.roomId;
  return "";
}
function enableGroupStandby(source, minutes) {
  var key = getGroupStandbyKey(source); if (!key) return;
  PropertiesService.getScriptProperties().setProperty(key, String(Date.now()+minutes*60000));
}
function disableGroupStandby(source) {
  var key = getGroupStandbyKey(source); if (!key) return;
  PropertiesService.getScriptProperties().deleteProperty(key);
}
function isGroupStandbyActive(source) {
  var key = getGroupStandbyKey(source); if (!key) return false;
  var val = PropertiesService.getScriptProperties().getProperty(key);
  if (!val) return false;
  if (Date.now() > Number(val)) { PropertiesService.getScriptProperties().deleteProperty(key); return false; }
  return true;
}
function isWakeWordOnly(text)     { return String(text||"").trim().toLowerCase() === "ไก่จ๋า"; }
function isStopWakeWord(text)     { var t=String(text||"").trim().toLowerCase(); return t==="ปิดไก่จ๋า"||t==="ไก่จ๋า stop"||t==="ไก่จ๋า off"; }
function startsWithWakeWord(text) { return String(text||"").trim().toLowerCase().startsWith("ไก่จ๋า "); }
function stripWakeWord(text)      { return String(text||"").replace(/^ไก่จ๋า\s*/i,"").trim(); }

// ============================================================
// COMMAND ALIAS / INTENT
// ============================================================
var COMMAND_ALIASES = {
  "ออเดอร์วันนี้":"search today","ดูออเดอร์วันนี้":"search today","วันนี้":"search today",
  "ล่าสุด":"search latest","ออเดอร์ล่าสุด":"search latest","ดูล่าสุด":"search latest",
  "shop":"ดูร้านส่ง","shops":"ดูร้านส่ง","ร้าน":"ดูร้านส่ง","ดูร้าน":"ดูร้านส่ง","รายชื่อร้าน":"ดูร้านส่ง","ค้างส่ง":"ดูร้านส่ง",
  "สรุปวันนี้":"summary","ดูสรุป":"summary",
  "สรุปพรุ่งนี้":"summary พรุ่งนี้","พรุ่งนี้":"summary พรุ่งนี้",
  "สรุปเดือน":"summary month","สรุปช่องทาง":"summary channel",
  "เมนูยอดนิยม":"summary top menu","ท็อปเมนู":"summary top menu",
  "7วัน":"summary 7","สรุป7วัน":"summary 7","7 วัน":"summary 7",
  "แผน7วัน":"plan 7","ล่วงหน้า":"plan 7","แผนการผลิต":"plan 7","แผนผลิต":"plan 7",
  "production 7":"plan 7","plan 7":"plan 7",
  "คำสั่ง":"help","เมนู":"help","ช่วยด้วย":"help",
  "ล้างล็อก":"clear log","ล้าง log":"clear log",
  "ค้างชำระ":"summary pending","ยอดค้าง":"summary pending",
  "srarch today":"search today","serach today":"search today",
  "summry":"summary","sumarry":"summary","hlep":"help","hlp":"help"
};

function resolveAlias(text) {
  var lower   = String(text||"").toLowerCase().trim();
  var compact = lower.replace(/\s+/g,"");
  if (/^(summary|search|cancel|status|edit|log)\s+\S/i.test(lower)) return null;
  if (COMMAND_ALIASES[lower]) return COMMAND_ALIASES[lower];
  for (var alias in COMMAND_ALIASES) {
    if (COMMAND_ALIASES.hasOwnProperty(alias) && alias.replace(/\s+/g,"") === compact)
      return COMMAND_ALIASES[alias];
  }
  if (/(ออเดอร์|order).*(วันนี้|today)/.test(lower))            return "search today";
  if (/(ออเดอร์|order).*(ล่าสุด|latest)/.test(lower))           return "search latest";
  if (/(สรุป|summary).*(พรุ่งนี้|tomorrow)/.test(lower))        return "summary พรุ่งนี้";
  if (/(สรุป|summary).*(เดือน|month)/.test(lower))              return "summary month";
  if (/(สรุป|summary).*(channel|ช่องทาง)/.test(lower))          return "summary channel";
  if (/(top|ยอดนิยม|นิยม).*(เมนู|menu)/.test(lower))            return "summary top menu";
  if (/(plan\s*7|production\s*7|ล่วงหน้า|แผนผลิต|แผนการผลิต)/.test(lower)) return "plan 7";
  if (/(7\s*วัน|7\s*day)/.test(lower))                          return "summary 7";
  if (/(คำสั่ง|help)/.test(lower))                              return "help";
  if (/(ค้างชำระ|ยอดค้าง|pending)/.test(lower))                 return "summary pending";
  // Thai aliases
  if (/(ออเดอร์|order)?\s*ด่วน|urgent/.test(lower) && !/[A-Z]+-\d/.test(text)) return "summary urgent";
  if (/(ค้นหา|หา|ค้น)\s*วันนี้/.test(lower))                    return "search today";
  if (/(ค้นหา|หา|ค้น)\s*ล่าสุด/.test(lower))                    return "search latest";
  // ค้นวันที่ XX/XX/XXXX → search date XX/XX/XXXX
  var thaiDateSearch = lower.match(/^(?:ค้นหา|หา|ค้น)\s*(?:วัน|วันที่)\s*\[?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s*\]?/);
  if (thaiDateSearch) return "search date " + thaiDateSearch[1];
  if (/^สรุป\s*วันนี้$/.test(lower))                            return "summary";
  if (/^สรุป\s*7\s*วัน?$/.test(lower))                         return "summary 7";

  // ภาษาธรรมชาติ — ถามแบบคนพูด
  if (/(ใคร|มีใคร).*(ค้าง|ยังไม่จ่าย|ยังไม่ชำระ|ไม่จ่าย)/.test(lower)) return "summary pending";
  if (/ค้างเงิน|ค้างจ่าย|ใครค้าง/.test(lower))                  return "summary pending";
  if (/(พรุ่งนี้).*(ส่ง|มี|กี่|เจ้า|ออเดอร์)/.test(lower))      return "summary พรุ่งนี้";
  if (/(วันนี้).*(ส่ง|มี|กี่|เจ้า|ออเดอร์)/.test(lower))        return "search today";
  if (/(ขายดี|ขายดีสุด|เมนูฮิต|ฮิตสุด|นิยมสุด)/.test(lower))    return "summary top menu";
  if (/(ยอด|รายได้|ขายได้).*(เดือนนี้|เดือน)/.test(lower))      return "summary month";
  if (/(รายได้|ยอดขาย).*(สัปดาห์|อาทิตย์)/.test(lower))         return "weekly summary";
  if (/(แผน|ผลิต|ทำ).*(วันนี้|กี่อัน)/.test(lower) && !/7/.test(lower)) return "วันนี้";
  if (/(เมนู).*(ตรวจ|เช็ค|ไม่รู้จัก)/.test(lower))              return "menu check";

  return null;
}

function detectIntent_(text) {
  var lower = String(text||"").trim().toLowerCase();
  if (/^(ดูเมนูเค้ก|เมนูเค้ก|เมนู เค้ก|menu)$/.test(lower))                     return "customer_menu";
  if (/^(สั่งเค้ก|สั่ง|order|สั่งเลย)$/.test(lower))                             return "customer_order";
  if (/^(เช็คสถานะ|สถานะ|check status)$/.test(lower))                            return "customer_status";
  if (/^(แจ้งโอนเงิน|โอนเงิน|payment|แจ้งชำระ)$/.test(lower))                    return "customer_payment";
  if (/^summary\b/i.test(lower))  return "admin_summary";
  if (/^search\b/i.test(lower))   return "admin_search";
  if (/^(log|clear log)\b/i.test(lower)) return "admin_log";
  if (/^(cancel|status|edit)\b/i.test(lower)) return "admin_edit";
  if (/รายการ\s*:/i.test(text)||/รวมทั้งหมด\s*:/i.test(text)||/ลูกค้า.*ชื่อคนรับ\s*:/i.test(text)||/วันที่ส่ง\s*:/i.test(text)) return "order_form";
  // ★ NEW
  if (detectOrderPattern_(text) === "short_cafe") return "short_cafe_order";
  if (detectOrderPattern_(text) === "shop_summary") return "shop_summary_order";
  if (detectOrderPattern_(text) === "modifier_edit") return "modifier_edit";
  return "chat";
}

// ============================================================
// PARSE ORDER (standard form)
// ============================================================
var UNIT_WORDS = "(ชิ้น|วง|กล่อง|ถุง|อัน|แผ่น|ลูก|ถาด|ห่อ|ปอนด์|ปอนด์ครึ่ง|กก|กิโล|kg|ปอนด์ใหญ่|ปอนด์เล็ก|เซท|set)";
var itemRegexWithUnit  = new RegExp("^(?:\\d+\\.|[•\\-])\\s*(.+?)\\s+(\\d+)\\s*("+UNIT_WORDS.replace(/[()]/g,"")+ ")\\s*=\\s*([\\d,]+)\\s*฿?$","i");
var itemRegexSimple    = /^(?:\d+\.|[•\-])\s*(.+?)\s+(\d+)\s*=\s*([\d,]+)\s*฿?$/i;
var itemRegexInformal  = /^(?:[•\-\d\.]+)\s*(.+?)\s*\|\s*Qty:\s*(\d+)\s*\|\s*Unit Price:\s*([\d,]+)/i;
var itemRegexNoDash    = /^(.+?)\s+(\d+)\s*(?:ชิ้น|วง|กล่อง|ถุง|อัน|แผ่น|ลูก|ถาด|ห่อ|ปอนด์|กก|กิโล|kg|เซท|set)\s*=\s*([\d,]+)\s*฿?$/i;

function normalizeItemLines(text) {
  var lines  = String(text||"").split("\n").map(function(s){return s.trim();}).filter(Boolean);
  var merged = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    while (i+1 < lines.length &&
      !/^(วันที่ส่ง|payment date|ลูกค้า\(ชื่อคนรับ\)|เบอร์|channel|order type|table\(ชื่อไลน์ลูกค้า\)|ประเภท|เวลาส่ง|สถานที่|ค่าส่ง|รวมทั้งหมด|note|รายการ|google\s*map)\s*:/i.test(lines[i+1]) &&
      (new RegExp("^"+UNIT_WORDS+"\\s*=\\s*[\\d,]+\\s*฿?$","i").test(lines[i+1]) ||
       /^=\s*[\d,]+\s*฿?$/i.test(lines[i+1]) || /^[\d,]+\s*฿?$/i.test(lines[i+1]))
    ) { line += " " + lines[i+1]; i++; }
    merged.push(line);
  }
  return merged;
}

function parseItems(text) {
  var lines = normalizeItemLines(text), items = [];
  for (var li = 0; li < lines.length; li++) {
    var t = lines[li].trim(); if (!t) continue;
    var m = t.match(itemRegexWithUnit);
    if (m) {
      var q=toNumber(m[2]),tt=toNumber(m[4]);
      var mn = resolveMenuAlias(m[1].trim());
      items.push({menuName:mn,unit:m[3].trim(),quantity:q,unitPrice:q>0?Math.round(tt/q):0,itemTotal:tt});
      continue;
    }
    m = t.match(itemRegexInformal);
    if (m) { var q2=toNumber(m[2]),up=toNumber(m[3]); var mn2=resolveMenuAlias(m[1].trim()); items.push({menuName:mn2,unit:"ชิ้น",quantity:q2,unitPrice:up,itemTotal:q2*up}); continue; }
    m = t.match(itemRegexSimple);
    if (m) { var q3=toNumber(m[2]),tt2=toNumber(m[3]); var mn3=resolveMenuAlias(m[1].trim()); items.push({menuName:mn3,unit:"ชิ้น",quantity:q3,unitPrice:q3>0?Math.round(tt2/q3):0,itemTotal:tt2}); continue; }
    m = t.match(itemRegexNoDash);
    if (m) { var q4=toNumber(m[2]),tt3=toNumber(m[3]); var mn4=resolveMenuAlias(m[1].trim()); items.push({menuName:mn4,unit:"ชิ้น",quantity:q4,unitPrice:q4>0?Math.round(tt3/q4):0,itemTotal:tt3}); }
  }
  return items;
}

function getThaiMonthMap_() {
  return {
    "มกราคม":1,"ม.ค.":1,"มค":1,"กุมภาพันธ์":2,"ก.พ.":2,"กพ":2,
    "มีนาคม":3,"มี.ค.":3,"มีค":3,"เมษายน":4,"เม.ย.":4,"เมย":4,
    "พฤษภาคม":5,"พ.ค.":5,"พค":5,"มิถุนายน":6,"มิ.ย.":6,"มิย":6,
    "กรกฎาคม":7,"ก.ค.":7,"กค":7,"สิงหาคม":8,"ส.ค.":8,"สค":8,
    "กันยายน":9,"ก.ย.":9,"กย":9,"ตุลาคม":10,"ต.ค.":10,"ตค":10,
    "พฤศจิกายน":11,"พ.ย.":11,"พย":11,"ธันวาคม":12,"ธ.ค.":12,"ธค":12
  };
}

function parseThaiMonthDateFromText_(text) {
  var mm = getThaiMonthMap_();
  var s = String(text||"").replace(/\r?\n/g," ");

  // เดิม regex จับ month เป็น token เดียว ([ก-๙.]+) — ถ้าชื่อเดือนติดกับคำอื่น
  // เช่น "เสาร์06มิถุนายน" หรือมี zero-width char คั่น → mm[token] ไม่เจอ → คืน "" → fallback today
  // วิธีใหม่: หา "เลข + เดือน(ตรงตาม map) + ปี" ตรงๆ จากทุกชื่อเดือนที่รู้จัก

  // 1) พยายาม match แบบเดิมก่อน (เร็วสุด)
  var m = s.match(/(\d{1,2})\s*([ก-๙][ก-๙.]*?)\s*(\d{4})/);
  if (m && mm[m[2]]) {
    return _buildThaiDate_(parseInt(m[1],10), mm[m[2]], parseInt(m[3],10));
  }

  // 2) loop ทุกชื่อเดือน — หา "dd <month> yyyy" โดยตรง (robust กับ token ติดกัน)
  var monthNames = Object.keys(mm).sort(function(a,b){ return b.length-a.length; }); // ยาวก่อน กัน "มิย" ชน "มิถุนายน"
  for (var i = 0; i < monthNames.length; i++) {
    var mn = monthNames[i];
    var esc = mn.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    var rx = new RegExp("(\\d{1,2})\\s*" + esc + "\\s*[\\.]?\\s*(\\d{4})");
    var mm2 = s.match(rx);
    if (mm2) {
      Logger.log("[INFO] parseThaiMonthDate matched: dd="+mm2[1]+" month="+mn+"("+mm[mn]+") yy="+mm2[2]);
      return _buildThaiDate_(parseInt(mm2[1],10), mm[mn], parseInt(mm2[2],10));
    }
  }

  Logger.log("[WARN] parseThaiMonthDate ไม่เจอวันที่ใน: "+s.substring(0,80));
  return "";
}

function _buildThaiDate_(dd, mo, yy) {
  if (!mo || isNaN(dd) || isNaN(yy)) return "";
  if (yy < 2400) yy += 543;
  return pad2(dd)+"/"+pad2(mo)+"/"+yy;
}

function parseTaggedLocation_(text) {
  var t = String(text||"");
  var rawName = "";
  // 1. @Name ขึ้นต้นบรรทัด: "@April Cafe\n..."
  var mLine = t.match(/^\s*@([^\n\r]+)/m);
  if (mLine) rawName = mLine[1].trim();
  else {
    // 2. @Name อยู่กลางบรรทัด: "...2569@Trust อารีย์"
    // [FIX] ใช้ regex ที่ match @ที่ตามด้วย non-space ทันที (GAS-compatible, ไม่ใช้ lookbehind)
    // pattern: [ไม่ใช่ space]@ หรือ ขึ้นต้นด้วย @ ตามด้วย non-space
    var mInline = t.match(/\S@([^\n\r@,\s][^\n\r@,]*)/);
    if (!mInline) {
      // fallback: หา @ ที่ไม่มี space ตามหลัง
      mInline = t.match(/@([^\n\r@,\s][^\n\r@,]*)/);
    }
    if (mInline) rawName = mInline[1].trim();
  }
  if (!rawName) return "";
  // ตัดชื่อ slot ออกจาก customer name
  var split = splitCustomerAndSlot_(rawName);
  return split.customer || rawName;
}

// [v3.5.1] _stripLineNoise_ — ลบ whitespace, zero-width, emoji, bullet, numbered prefix
// รับ text แบบไหนก็ปกติ: "  📝 - 1. มะพร้าว..." → "มะพร้าว..."
function _stripLineNoise_(s) {
  if (!s) return "";
  var out = String(s);
  // 1. zero-width + BOM + line/para separators + NBSP
  out = out.replace(/[\u200B-\u200F\u2028\u2029\uFEFF\u00A0]/g, " ");
  // 2. trim whitespace
  out = out.replace(/^\s+|\s+$/g, "");
  // 3. loop strip emoji/symbol/bullet/numbered prefix
  for (var loop = 0; loop < 10; loop++) {
    var before = out;
    // surrogate pair emoji (U+10000+)
    out = out.replace(/^[\uD800-\uDBFF][\uDC00-\uDFFF][\uFE0F\u200D]?\s*/, "");
    // BMP symbol ranges: arrows, dingbats, misc symbols
    out = out.replace(/^[\u2190-\u21FF\u2300-\u23FF\u2460-\u24FF\u25A0-\u25FF\u2600-\u26FF\u2700-\u27BF\u2B00-\u2BFF]\uFE0F?\s*/, "");
    // bullet / dash variants
    out = out.replace(/^[\-\u2013\u2014\u2022\*\u2043\u2023\u25AA\u25AB\u25E6]\s*/, "");
    // numbered list: "1." "1)" "(1)"
    out = out.replace(/^\(?\d+[\.\)]\s*/, "");
    out = out.replace(/^\s+/, "");
    if (out === before) break;
  }
  return out;
}

function parseItemsFlexible_(text) {
  // [v3.5.5] รับ user-typed orders แบบสุดยืดหยุ่น
  //   normalize whitespace: NBSP/tab → space, multiple spaces collapse
  var normalized = String(text||"").replace(/\r/g,"").replace(/[\u00A0\t]/g," ");
  var lines = normalized.split("\n");
  var items = [];

  // หน่วยที่รับได้
  var up1 = "(ชิ้น|วง|กล่อง|ถุง|อัน|แผ่น|ลูก|ถาด|ห่อ|ปอนด์|ปอนด์ครึ่ง|กก|กิโล|kg|เซท|set|P|คู่|แท่ง|ถ้วย|กระปุก)";
  // ราคา suffix: ฿ | บาท | .- | optional
  var price = "([\\d,]+)(?:\\s*[\\.]\\-|\\s*\\-)?\\s*(?:฿|บาท)?";
  // separator ระหว่างชื่อกับ qty: space | : | - | = (optional)
  var sep = "\\s*[:：=\\-\\u2013\\u2014]?\\s+";

  // ── PATTERNS (specific → general) ──
  var rx1 = new RegExp("^(.+?)"+sep+"(\\d+)\\s*"+up1+"\\s+"+price+"\\s*(?:\\(.+\\))?$","i");
  var rx2 = new RegExp("^(.+?)(\\d+)\\s*"+up1+"\\s+"+price+"\\s*(?:\\(.+\\))?$","i");
  var rx3 = new RegExp("^(.+?)\\s*[xX\\u00D7]\\s*(\\d+)\\s*[=\\-]?\\s*"+price+"$","i");
  var rx4 = /^(.+?)\s+(\d+)\s+([\d,]+)\s*(?:฿|บาท)$/i;
  var rx5 = /^(.+?)\s+(\d+)\s*=\s*([\d,]+)$/;
  var rx6 = new RegExp("^(.+?)\\s+(\\d+)\\s*"+up1+"\\s*@\\s*"+price+"$","i");
  var rx7 = /^(.{3,40}?)\s+([\d,]{2,5})\s*(?:฿|บาท|\.\-|\-)\s*(?:\(.+\))?$/;

  for (var i = 0; i < lines.length; i++) {
    var s = _stripLineNoise_(lines[i]); if (!s) continue;
    if (/^(ออเดอร์รอบส่ง|รอบส่ง|ออเดอร์\s|รวม\b|ค่าส่ง\b|@|\()/i.test(s)) continue;
    if (/(เบอร์|โทร|ที่อยู่|tel|phone|address|รหัสไปรษณีย์|หมู่บ้าน|เลขที่|ซอย|ถนน|ตำบล|อำเภอ|จังหวัด|เวลา|วันที่|note|หมายเหตุ|channel|ส่งที่|เวลาจัดส่ง|โน๊ต|โน้ต|ข้อความ)\s*[\u2026:：\.]/i.test(s)) continue;

    var addonItem = parseAddonItem_(s);
    if (addonItem) { items.push(addonItem); continue; }

    var sClean = s;
    var matched = null;
    var m;
    if ((m = sClean.match(rx1))) {
      matched = {menu:m[1], qty:toNumber(m[2]), unit:m[3], total:toNumber(m[4])};
    } else if ((m = sClean.match(rx2))) {
      matched = {menu:m[1], qty:toNumber(m[2]), unit:m[3], total:toNumber(m[4])};
    } else if ((m = sClean.match(rx3))) {
      var t3 = toNumber(m[3]); var q3 = toNumber(m[2]);
      matched = {menu:m[1], qty:q3, unit: (t3/q3)>=300?"วง":"ชิ้น", total:t3};
    } else if ((m = sClean.match(rx4))) {
      var t4 = toNumber(m[3]); var q4 = toNumber(m[2]);
      matched = {menu:m[1], qty:q4, unit: (t4/q4)>=300?"วง":"ชิ้น", total:t4};
    } else if ((m = sClean.match(rx5))) {
      var t5 = toNumber(m[3]); var q5 = toNumber(m[2]);
      matched = {menu:m[1], qty:q5, unit: (t5/q5)>=300?"วง":"ชิ้น", total:t5};
    } else if ((m = sClean.match(rx6))) {
      var per = toNumber(m[4]); var q6 = toNumber(m[2]);
      matched = {menu:m[1], qty:q6, unit:m[3], total: per*q6};
    } else if ((m = sClean.match(rx7))) {
      var price7 = toNumber(m[2]);
      if (price7 < 30 || price7 > 9999) continue;
      matched = {menu:m[1], qty:1, unit: price7>=300?"วง":"ชิ้น", total:price7};
    }

    if (matched) {
      var mn = resolveMenuAlias(cleanMenuName_(matched.menu));
      if (!mn || mn.length < 2) continue;
      items.push({
        menuName: mn, unit: matched.unit, quantity: matched.qty,
        unitPrice: matched.qty>0 ? Math.round(matched.total/matched.qty) : matched.total,
        itemTotal: matched.total,
        isAddon:false, baseProduct:mn, modifier:"",
        productCategory: matched.unit==="วง" ? "เค้กวง" : "เค้กชิ้น",
        reviewFlag: isKnownMenu_(mn) ? "" : "REVIEW"
      });
    }
  }
  return items;
}

function looksLikeStandardOrderText_(text) {
  return /รายการ\s*:/i.test(text)||/รวมทั้งหมด\s*:/i.test(text)||/ลูกค้า.*ชื่อคนรับ\s*:/i.test(text)||/วันที่ส่ง\s*:/i.test(text);
}

function looksLikeFlexibleOrderText_(text) {
  // รองรับทั้ง "รอบส่ง" และ "ออเดอร์ วัน..." (loose header)
  var hasOrderHeader = /ออเดอร์รอบส่ง|รอบส่ง/i.test(text) ||
                       (/^ออเดอร์\s+/im.test(text) && /\d{1,2}\s*[ก-๙.]+\s*\d{4}/.test(text));
  // [v3.5.2 FIX] "รวม" เป็น optional — ออเดอร์เมนูเดียวที่ไม่พิมพ์ "รวม" ก็ต้องรับได้
  //   จุดยืนยันว่าเป็นออเดอร์ = header + มีบรรทัดเมนูที่มีจำนวน+หน่วย+ราคา
  // [v3.5.4 FIX] เพิ่ม pattern "ชื่อเมนู ราคา฿" (ไม่มีจำนวน+หน่วย)
  var hasItemLine = /\d+\s*(ชิ้น|วง|กล่อง|ถุง|อัน|แผ่น|ลูก|ถาด|ห่อ|ปอนด์|ปอนด์ครึ่ง|กก|กิโล|kg|เซท|set|P|คู่)\s*[\d,]+\s*฿?/i.test(text)
                 || /^[ก-๙a-zA-Z][^\n\r]{2,40}\s+[\d,]{2,5}\s*฿/im.test(text);
  return hasOrderHeader && hasItemLine;
}

// [v3.5.2] _normalizeIncomingText_ — ลบตัวอักษรล่องหนทุกชนิดจากข้อความที่ user ส่งเข้ามา
//   สาเหตุ: ฟอนต์ตกแต่ง/คีย์บอร์ดพิเศษ (เช่นชื่อ "Layylaliss•𐐪ї𐑂") แทรก:
//     U+200B zero-width space, U+200C/D zero-width joiner, U+200E/F LTR/RTL mark,
//     U+FEFF BOM, U+2060 word joiner, U+00A0 NBSP, U+2028/9 line/para separator
//   ตัวพวกนี้ทำให้ \s ใน regex ไม่ match → parser/detector พังเงียบ
function _normalizeIncomingText_(s) {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/[\u200B\u200C\u200D\u200E\u200F\u2060\uFEFF]/g, "")
    .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, " ")
    .replace(/[\u2028\u2029]/g, "\n")
    .replace(/\r\n?/g, "\n");
}

function isOrderLikeText_(text) {
  var pat = detectOrderPattern_(text);
  return looksLikeStandardOrderText_(text) ||
         looksLikeFlexibleOrderText_(text) ||
         pat === "shop_summary" ||      // [v3.5.2 FIX] เดิมพึ่ง looksLikeFlexible อย่างเดียว → ตัวล่องหนใน item ทำให้ false
         pat === "short_cafe" ||
         pat === "short_calculated" ||
         pat === "loose_header" ||
         pat === "manual_summary" ||
         pat === "payment_address";
}

function parseChatStyleOrder_(text) {
  var normalized = String(text||"").replace(/\r/g,"");
  var taggedName = parseTaggedLocation_(normalized);
  var items      = parseItemsFlexible_(normalized);

  // parse deliverySlot จาก header เช่น "รอบส่ง ศุกร์" หรือ "รอบส่ง 15 พฤษภาคม"
  var slotMatch  = normalized.match(/(?:ออเดอร์รอบส่ง|รอบส่ง)\s+([^\n\r@]+)/i);
  var slotRaw    = slotMatch ? slotMatch[1].replace(/@.*/,"").trim() : "";
  var deliverySlot = slotRaw ? (DELIVERY_SLOT_ALIAS[slotRaw] || slotRaw) : "";

  var totalMatch = normalized.match(/รวม\s*([\d,]+)\s*฿?/i);
  var feeMatch   = normalized.match(/ค่าส่ง\s*[:：]?\s*([\d,]+)/i);
  var deliveryFee = feeMatch ? toNumber(feeMatch[1]) : 0;
  var gt = totalMatch ? toNumber(totalMatch[1]) : calculateOrderTotal_(items, deliveryFee);

  var patternType = detectOrderPattern_(text) || "shop_summary";

  return {
    deliveryDate:  parseThaiMonthDateFromText_(normalized) || getTodayTH(),
    paymentDate:   parseThaiMonthDateFromText_(normalized) || getTodayTH(),
    customerName:  taggedName||"",
    phone:"",channel:"LINE",orderType:"Wholesale",
    tableName:taggedName||"",deliveryType:"Delivery",
    deliveryTime:deliverySlot,
    location:taggedName||"",googleMap:"",
    deliveryFee:   deliveryFee,
    grandTotal:    gt,
    note:          "",
    // shop_summary = ไม่ต้องรอชำระ → preparing ทันที
    paymentStatus: "Not Required",
    status:        "preparing",
    kitchenStatus: "รอทำ",
    deliverySlot:  deliverySlot,
    patternType:   patternType,
    parsedStatus:  (taggedName && items.length > 0) ? "OK" : "NEED_REVIEW",
    reviewFlag:    (taggedName && items.length > 0) ? "" : "REVIEW",
    items:items, orderId:generateOrderId_()
  };
}

function parseField_(text, regexes) {
  for (var i = 0; i < regexes.length; i++) {
    var m = text.match(regexes[i]);
    if (m && m[1] !== undefined) return String(m[1]).trim();
  }
  return "";
}

function parseOrderText_(text) {
  var n = String(text||"").replace(/\r/g,"");
  var data = {
    deliveryDate:  parseField_(n,[/^วันที่ส่ง\s*:\s*(.+)$/im,/^delivery\s*date\s*:\s*(.+)$/im]),
    paymentDate:   parseField_(n,[/^payment\s*date\s*:\s*(.+)$/im]),
    customerName:  parseField_(n,[/^ลูกค้า\(ชื่อคนรับ\)\s*:\s*(.+)$/im,/^customer\s*:\s*(.+)$/im]),
    phone:         parseField_(n,[/^เบอร์\s*:\s*(.+)$/im,/^phone\s*:\s*(.+)$/im]),
    channel:       parseField_(n,[/^channel\s*:\s*(.+)$/im]),
    orderType:     parseField_(n,[/^order\s*type\s*:\s*(.+)$/im]),
    tableName:     parseField_(n,[/^table\(ชื่อไลน์ลูกค้า\)\s*:\s*(.+)$/im,/^table\s*:\s*(.+)$/im]),
    deliveryType:  parseField_(n,[/^ประเภท\s*:\s*(.+)$/im,/^delivery\s*type\s*:\s*(.+)$/im]),
    deliveryTime:  parseField_(n,[/^เวลาส่ง\s*:\s*(.+)$/im,/^delivery\s*time\s*:\s*(.+)$/im]),
    location:      parseField_(n,[/^สถานที่\s*:\s*(.+)$/im,/^location\s*:\s*(.+)$/im]),
    googleMap:     parseField_(n,[/^google\s*map\s*:\s*(.+)$/im,/^map\s*:\s*(.+)$/im]),
    deliveryFee:   toNumber(parseField_(n,[/^ค่าส่ง\s*:\s*(.+)$/im,/^delivery\s*fee\s*:\s*(.+)$/im])),
    grandTotal:    toNumber(parseField_(n,[/^รวมทั้งหมด\s*:\s*(.+)$/im,/^grand\s*total\s*:\s*(.+)$/im])),
    note:          parseField_(n,[/^note\s*:\s*(.+)$/im]),
    paymentStatus:"Pending", status:"confirmed"
  };
  data.deliveryDate = formatDateTH(data.deliveryDate);
  data.paymentDate  = formatDateTH(data.paymentDate || data.deliveryDate);
  data.deliveryTime = formatTimeTH(data.deliveryTime);
  data.items   = parseItems(n);
  data.orderId = generateOrderId_();
  // ★ auto-calculate if grandTotal missing
  if (!data.grandTotal && data.items && data.items.length > 0) {
    data.grandTotal = calculateOrderTotal_(data.items, data.deliveryFee);
  }
  return data;
}

function parseOrder(text) {
  var raw = String(text||"");
  var pat = detectOrderPattern_(raw);

  // helper: เรียก parser แต่ละตัวแบบ safe — ตัวเดียวพังไม่ทำให้ทั้ง pipeline ล่ม
  function tryParse_(label, fn) {
    try {
      var r = fn(raw);
      if (r && r.items && r.items.length > 0) {
        if (!String(r.customerName||"").trim() && r.tableName) r.customerName = r.tableName;
        if (!String(r.tableName||"").trim() && r.customerName) r.tableName = r.customerName;
        return r;
      }
    } catch(e) {
      Logger.log("[ERROR] parser '"+label+"' failed: "+e.message+" | text="+raw.substring(0,80).replace(/\n/g," "));
    }
    return null;
  }

  var result = null;

  // 1. standard form
  if (looksLikeStandardOrderText_(raw)) {
    result = tryParse_("standard", parseOrderText_);
    if (result) return result;
  }

  // 2. shop summary / loose header (flexible)
  if (looksLikeFlexibleOrderText_(raw) || pat === "loose_header") {
    var flexParser = (pat === "loose_header") ? parseLooseHeaderOrder_ : parseChatStyleOrder_;
    result = tryParse_("flexible/"+pat, flexParser);
    if (result) return result;
  }

  // 3. short_calculated
  if (pat === "short_calculated") {
    result = tryParse_("short_calculated", parseShortCalculatedOrder_);
    if (result) return result;
  }

  // 4. manual_summary
  if (pat === "manual_summary") {
    result = tryParse_("manual_summary", parseManualSummaryOrder_);
    if (result) return result;
  }

  // 5. payment_address
  if (pat === "payment_address") {
    result = tryParse_("payment_address", parsePaymentAddressOrder_);
    if (result) return result;
  }

  // 6. short cafe
  if (pat === "short_cafe") {
    result = tryParse_("short_cafe", parseShortCafeOrder_);
    if (result) return result;
  }

  // safety net — ลองทุก parser ที่เหลือ ก่อนยอมแพ้ (เผื่อ detect ผิด pattern)
  var allParsers = [
    ["payment_address", parsePaymentAddressOrder_],
    ["loose_header", parseLooseHeaderOrder_],
    ["manual_summary", parseManualSummaryOrder_],
    ["short_calculated", parseShortCalculatedOrder_],
    ["short_cafe", parseShortCafeOrder_],
    ["chatStyle", parseChatStyleOrder_]
  ];
  for (var i = 0; i < allParsers.length; i++) {
    result = tryParse_("fallback:"+allParsers[i][0], allParsers[i][1]);
    if (result) {
      Logger.log("[INFO] parseOrder fallback matched: "+allParsers[i][0]+" (detect ผิด pattern="+pat+")");
      return result;
    }
  }

  // สุดท้าย: standard anyway (อาจคืน items ว่าง → validate จับเอง)
  try { return parseOrderText_(raw); }
  catch(e) {
    Logger.log("[ERROR] parseOrder final fallback failed: "+e.message);
    return { items:[], grandTotal:0, deliveryDate:getTodayTH(), channel:"LINE",
             orderType:"Retail", parsedStatus:"PARSE_FAILED", orderId:generateOrderId_() };
  }
}

function validateOrder_(data) {
  var errors = [];
  if (!data.deliveryDate)                errors.push("วันที่ส่ง");
  if (!data.channel)                     errors.push("Channel");
  if (!data.orderType)                   errors.push("Order Type");
  if (!data.items || !data.items.length) errors.push("รายการ");
  if (!data.grandTotal)                  errors.push("รวมทั้งหมด");
  if (!( String(data.customerName||"").trim() || String(data.tableName||"").trim() || String(data.location||"").trim() ))
    errors.push("ลูกค้า(ชื่อคนรับ)");
  return errors;
}

function shouldAskForCustomerName_(orderData, errors) {
  return !!(orderData && errors && errors.length===1 && errors[0]==="ลูกค้า(ชื่อคนรับ)" &&
            orderData.deliveryDate && orderData.items && orderData.items.length>0 && orderData.grandTotal);
}

function generateOrderId_() {
  var now = new Date();
  return "ORD-" + Utilities.formatDate(now,TIMEZONE,"ddMMyyyy") + "-" + Utilities.formatDate(now,TIMEZONE,"HHmmss");
}

// ============================================================
// SAVE / UPDATE / CANCEL
// ============================================================
function saveOrderToSheet_(data, rawText, updatedBy) {
  var sheet  = getSheet();
  var map    = getHeaderMap_();
  var nowTs  = getTimestampTH();
  var colLen = sheet.getLastColumn();

  // normalize ก่อน save ทุกครั้ง
  data.deliveryDate = normalizeDateText_(data.deliveryDate) || getTodayTH();
  data.paymentDate  = normalizeDateText_(data.paymentDate  || data.deliveryDate) || data.deliveryDate;
  data.deliveryTime = normalizeDeliveryTime_(data.deliveryTime);
  data.deliverySlot = data.deliverySlot || data.deliveryTime || "";
  data.channel      = data.channel      || "LINE";
  data.orderType    = data.orderType    || "Wholesale";
  data.paymentStatus= data.paymentStatus|| "Not Required";
  data.status       = data.status       || "preparing";
  data.kitchenStatus= data.kitchenStatus|| "รอทำ";
  data.patternType  = data.patternType  || "unknown";
  data.parsedStatus = data.parsedStatus || "OK";

  // auto-detect รับหน้าร้าน
  if (isPickupDelivery_(data.location||data.deliveryType||"")) {
    data.deliveryType = "รับหน้าร้าน";
    data.deliveryFee  = 0;
    data.location     = data.location || "รับหน้าร้าน";
  }

  var rows = data.items.map(function(item) {
    var record = new Array(colLen).fill("");
    function setByName(name, value) { var c=map[name]; if(c>0) record[c-1]=value; }

    // cleanMenuName ก่อน save
    var cleanedMenuName = resolveMenuAlias(cleanMenuName_(item.menuName||""));
    item.menuName    = cleanedMenuName;
    item.baseProduct = cleanMenuName_(item.baseProduct||cleanedMenuName);

    // reviewFlag: เตือนเมนูที่ไม่อยู่ใน PRICE_MASTER
    var itemReviewFlag = item.isAddon ? "" :
      (isKnownMenu_(cleanedMenuName) ? (item.reviewFlag||"") : "REVIEW");
    if (itemReviewFlag === "REVIEW") data.parsedStatus = "NEED_REVIEW";

    setByName("timestamp",     nowTs);
    setByName("orderId",       data.orderId);
    setByName("deliveryDate",  data.deliveryDate);
    setByName("deliveryTime",  data.deliveryTime);
    setByName("paymentDate",   data.paymentDate);
    setByName("customerName",  data.customerName||"");
    setByName("phone",         data.phone||"");
    setByName("channel",       data.channel);
    setByName("orderType",     data.orderType);
    setByName("tableName",     data.tableName||data.customerName||"");
    setByName("deliveryType",  data.deliveryType||"Delivery");
    setByName("location",      data.location||"");
    setByName("menuName",      cleanedMenuName);
    setByName("unit",          item.unit||"ชิ้น");
    setByName("qty",           toNumber(item.quantity));
    setByName("unitPrice",     toNumber(item.unitPrice));
    setByName("itemTotal",     toNumber(item.itemTotal));
    setByName("deliveryFee",   toNumber(data.deliveryFee));
    setByName("grandTotal",    toNumber(data.grandTotal));
    setByName("paymentStatus", data.paymentStatus);
    setByName("note",          data.note||"");
    setByName("rawText",       rawText||"");
    setByName("status",        data.status);
    setByName("googleMap",     data.googleMap||"");
    setByName("lastUpdatedAt", nowTs);
    setByName("lastUpdatedBy", updatedBy||"system");
    // v3.2/v3.3/v3.4 columns
    setByName("patternType",     data.patternType);
    setByName("parsedStatus",    data.parsedStatus);
    setByName("kitchenStatus",   data.kitchenStatus);
    setByName("deliverySlot",    data.deliverySlot);
    setByName("route",           data.route||data.location||"");
    setByName("productCategory", item.isAddon ? "Add-on" : (item.unit==="วง"?"เค้กวง":"เค้กชิ้น"));
    setByName("baseProduct",     item.baseProduct||cleanedMenuName);
    setByName("modifier",        item.modifier||"");
    setByName("isAddon",         item.isAddon ? "TRUE" : "FALSE");
    setByName("reviewFlag",      itemReviewFlag);
    return record;
  });

  sheet.getRange(sheet.getLastRow()+1, 1, rows.length, rows[0].length).setValues(rows);
  clearSheetCache();
  try { invalidateMonthIndex_(data.deliveryDate); } catch(_) {}
  // mark hash กันซ้ำ
  if (rawText) markOrderHash_(rawText, data.orderId);
  return data.orderId;
}

function updateOrderField_(orderId, fieldMap, updatedBy) {
  var rows = findOrderRowsById_(orderId);
  if (!rows||!rows.length) return { ok:false, message:"ไม่พบ Order ID" };
  var sheet = getSheet();
  var map   = getHeaderMap_();
  var nowTs = getTimestampTH();
  function setCell(rowNumber, fieldName, value) {
    var col = map[fieldName]; if (col>0) sheet.getRange(rowNumber,col).setValue(value);
  }
  rows.forEach(function(r) {
    if (fieldMap.deliveryDate  !== undefined) setCell(r.rowNumber,"deliveryDate",  formatDateTH(fieldMap.deliveryDate));
    if (fieldMap.paymentDate   !== undefined) setCell(r.rowNumber,"paymentDate",   formatDateTH(fieldMap.paymentDate));
    if (fieldMap.customerName  !== undefined) setCell(r.rowNumber,"customerName",  fieldMap.customerName);
    if (fieldMap.phone         !== undefined) setCell(r.rowNumber,"phone",         fieldMap.phone);
    if (fieldMap.channel       !== undefined) setCell(r.rowNumber,"channel",       fieldMap.channel);
    if (fieldMap.orderType     !== undefined) setCell(r.rowNumber,"orderType",     fieldMap.orderType);
    if (fieldMap.tableName     !== undefined) setCell(r.rowNumber,"tableName",     fieldMap.tableName);
    if (fieldMap.deliveryType  !== undefined) setCell(r.rowNumber,"deliveryType",  fieldMap.deliveryType);
    if (fieldMap.deliveryTime  !== undefined) setCell(r.rowNumber,"deliveryTime",  formatTimeTH(fieldMap.deliveryTime));
    if (fieldMap.location      !== undefined) setCell(r.rowNumber,"location",      fieldMap.location);
    if (fieldMap.deliveryFee   !== undefined) setCell(r.rowNumber,"deliveryFee",   toNumber(fieldMap.deliveryFee));
    if (fieldMap.grandTotal    !== undefined) setCell(r.rowNumber,"grandTotal",    toNumber(fieldMap.grandTotal));
    if (fieldMap.paymentStatus !== undefined) setCell(r.rowNumber,"paymentStatus", fieldMap.paymentStatus);
    if (fieldMap.note          !== undefined) setCell(r.rowNumber,"note",          fieldMap.note);
    if (fieldMap.status        !== undefined) setCell(r.rowNumber,"status",        fieldMap.status);
    if (fieldMap.googleMap     !== undefined) setCell(r.rowNumber,"googleMap",     fieldMap.googleMap);
    setCell(r.rowNumber,"lastUpdatedAt", nowTs);
    setCell(r.rowNumber,"lastUpdatedBy", updatedBy||"system");
  });
  clearSheetCache();
  try { invalidateMonthIndex_(rows[0].deliveryDate); } catch(_) {}
  return { ok:true, message:"อัปเดตแล้ว", orderId:orderId };
}

function cancelOrder_(orderId, updatedBy) {
  var res = updateOrderField_(orderId, { status:"❌ ยกเลิก" }, updatedBy||"system");
  if (res.ok && ENABLE_PUSH_CANCEL) pushNotifyText_("❌ ยกเลิกออเดอร์แล้ว\nOrder ID: "+orderId);
  return res;
}

// ============================================================
// APPEND ITEMS TO EXISTING ORDER
// เพิ่มรายการเข้าออเดอร์เดิม (หลายบรรทัดทีเดียว) + คำนวณยอดรวมใหม่
// ============================================================
function appendItemsToOrder_(orderId, newItems, updatedBy) {
  try {
    if (!newItems || !newItems.length) return { ok:false, message:"ไม่มีรายการที่จะเพิ่ม" };
    var existing = findOrderRowsById_(orderId);
    if (!existing.length) return { ok:false, message:"ไม่พบ Order: "+orderId };

    // ดึงข้อมูล header ของ order เดิม (จาก row แรกที่มี grandTotal)
    var mainRow = existing.find(function(r){ return toNumber(r.grandTotal)>0; }) || existing[0];
    var sheet   = getSheet();
    var map     = getHeaderMap_();
    var colLen  = sheet.getLastColumn();
    var nowTs   = getTimestampTH();

    // ยอดเดิม + ค่าส่งเดิม
    var oldFoodTotal = existing.reduce(function(s,r){ return s + toNumber(r.itemTotal); }, 0);
    var deliveryFee  = toNumber(mainRow.deliveryFee);
    var addFoodTotal = newItems.reduce(function(s,it){ return s + toNumber(it.itemTotal); }, 0);
    var newGrand     = oldFoodTotal + addFoodTotal + deliveryFee;

    // สร้าง rows ใหม่ — copy header จาก order เดิม
    var rows = newItems.map(function(item) {
      var record = new Array(colLen).fill("");
      function setByName(name, value) { var c=map[name]; if(c>0) record[c-1]=value; }
      var cleanedMenu = resolveMenuAlias(cleanMenuName_(item.menuName||""));
      setByName("timestamp",     nowTs);
      setByName("orderId",       orderId);
      setByName("deliveryDate",  mainRow.deliveryDate);
      setByName("deliveryTime",  mainRow.deliveryTime);
      setByName("paymentDate",   mainRow.paymentDate||mainRow.deliveryDate);
      setByName("customerName",  mainRow.customerName||"");
      setByName("phone",         mainRow.phone||"");
      setByName("channel",       mainRow.channel||"LINE");
      setByName("orderType",     mainRow.orderType||"Wholesale");
      setByName("tableName",     mainRow.tableName||mainRow.customerName||"");
      setByName("deliveryType",  mainRow.deliveryType||"Delivery");
      setByName("location",      mainRow.location||"");
      setByName("menuName",      cleanedMenu);
      setByName("unit",          item.unit||"ชิ้น");
      setByName("qty",           toNumber(item.quantity));
      setByName("unitPrice",     toNumber(item.unitPrice));
      setByName("itemTotal",     toNumber(item.itemTotal));
      setByName("deliveryFee",   deliveryFee);
      setByName("grandTotal",    newGrand);
      setByName("paymentStatus", mainRow.paymentStatus||"Not Required");
      setByName("note",          mainRow.note||"");
      setByName("status",        mainRow.status||"preparing");
      setByName("googleMap",     mainRow.googleMap||"");
      setByName("lastUpdatedAt", nowTs);
      setByName("lastUpdatedBy", updatedBy||"line");
      setByName("kitchenStatus", "รอทำ");
      setByName("productCategory", item.unit==="วง"?"เค้กวง":"เค้กชิ้น");
      setByName("baseProduct",   cleanedMenu);
      setByName("reviewFlag",    isKnownMenu_(cleanedMenu) ? "" : "REVIEW");
      return record;
    });
    sheet.getRange(sheet.getLastRow()+1, 1, rows.length, rows[0].length).setValues(rows);

    // อัปเดต grandTotal ของ row เดิมทุกแถวให้ตรงกัน
    existing.forEach(function(r){
      if (map.grandTotal > 0) sheet.getRange(r.rowNumber, map.grandTotal).setValue(newGrand);
      if (map.lastUpdatedAt > 0) sheet.getRange(r.rowNumber, map.lastUpdatedAt).setValue(nowTs);
      if (map.lastUpdatedBy > 0) sheet.getRange(r.rowNumber, map.lastUpdatedBy).setValue(updatedBy||"line");
    });

    clearSheetCache();
    Logger.log("[INFO] appendItemsToOrder_ | id="+orderId+" | +"+newItems.length+" items | newGrand="+newGrand);
    return { ok:true, orderId:orderId, addedCount:newItems.length, addedTotal:addFoodTotal, newGrand:newGrand };
  } catch(e) {
    Logger.log("[ERROR] appendItemsToOrder_ failed: "+e.message+" | stack: "+(e.stack||""));
    return { ok:false, message:e.message };
  }
}

// แสดงรายการออเดอร์ล่าสุดให้เลือกแก้/เพิ่ม
// [v3.5.4] buildShopsListFlex_ — list ร้านที่มีออเดอร์ค้างส่ง พร้อมปุ่ม "ดูร้านนี้"
//   แสดงเฉพาะ status != ส่งแล้ว/completed/ยกเลิก และ deliveryDate ยังไม่ผ่าน
function buildShopsListFlex_() {
  // ดึงออเดอร์ที่ยังไม่ยกเลิก ใน range วันนี้ → +14 วัน
  var rows = getOrderRows(function(r){
    if (isRowCancelled(r)) return false;
    // กรอง: ส่งแล้ว/completed = ไม่นับ
    var st = String(r.status||"").toLowerCase();
    if (/completed|delivered|ส่งแล้ว/.test(st)) return false;
    // วันส่งต้องไม่ผ่าน (หรือเป็นวันนี้)
    return !isDeliveryPassed(r.deliveryDate, r.deliveryTime) && r.grandTotal !== "";
  }, 200);

  if (!rows.length) {
    return {type:"flex", altText:"ไม่มีร้านค้างส่ง",
      contents:buildAlertFlex("✅ ไม่มีร้านค้างส่ง","ทุกออเดอร์ส่งครบแล้วค่ะ","#4CAF50")};
  }

  // group by orderId ก่อน (เพื่อให้นับ 1 ออเดอร์ = 1 unit)
  var orders = groupRowsByOrder(rows);

  // group by customer (ชื่อร้าน) — สร้างข้อมูลสรุปต่อร้าน
  var shopMap = {};
  orders.forEach(function(o) {
    var main = o.rows.find(function(r){ return toNumber(r.grandTotal)>0; }) || o.rows[0];
    var shop = String(main.customerName||main.tableName||"ไม่ระบุ").trim();
    if (!shop) shop = "ไม่ระบุ";
    if (!shopMap[shop]) shopMap[shop] = {
      name: shop, orders: [], totalAmount: 0, urgentCount: 0,
      earliestDate: "9999/99/99", nextDateTH: "", itemCount: 0
    };
    var sm = shopMap[shop];
    sm.orders.push(o.orderId);
    sm.totalAmount += toNumber(main.grandTotal);
    if (isNoteUrgent_(main.note)) sm.urgentCount++;
    sm.itemCount += o.rows.filter(function(r){return r.menuName;}).length;
    // หา deliveryDate ที่ใกล้ที่สุด
    var sortKey = String(main.deliveryDate||"").split("/").reverse().join("/");
    if (sortKey < sm.earliestDate) {
      sm.earliestDate = sortKey;
      sm.nextDateTH = main.deliveryDate;
    }
  });

  // sort by: urgent → earliest date → count
  var shops = Object.keys(shopMap).map(function(k){return shopMap[k];}).sort(function(a,b){
    if (a.urgentCount !== b.urgentCount) return b.urgentCount - a.urgentCount;
    if (a.earliestDate !== b.earliestDate) return a.earliestDate.localeCompare(b.earliestDate);
    return b.orders.length - a.orders.length;
  });

  var MAX = 11; // เผื่อ summary 1 bubble
  var bubbles = shops.slice(0, MAX).map(function(s) {
    var hasUrgent = s.urgentCount > 0;
    var headerColor = hasUrgent ? "#D32F2F" : "#1565C0";
    var custCmd = "ดู order ของ " + s.name;
    return {
      type:"bubble", size:"kilo",
      header:{type:"box", layout:"vertical", backgroundColor:headerColor, paddingAll:"14px", contents:[
        {type:"text", text: hasUrgent?"🚨 มีด่วน":"🏪 ร้านค้างส่ง",
          size:"xs", color:"#FFE0E0", weight:"bold"},
        {type:"text", text:s.name, size:"md", color:"#FFFFFF", weight:"bold", wrap:true}
      ]},
      body:{type:"box", layout:"vertical", paddingAll:"14px", spacing:"sm", contents:[
        {type:"box", layout:"horizontal", contents:[
          {type:"text", text:"📦 ออเดอร์", size:"sm", color:"#888888", flex:2},
          {type:"text", text:s.orders.length+" ใบ", size:"md", color:headerColor, weight:"bold", flex:2, align:"end"}
        ]},
        {type:"box", layout:"horizontal", contents:[
          {type:"text", text:"🍰 รายการ", size:"xs", color:"#888888", flex:2},
          {type:"text", text:s.itemCount+" รายการ", size:"xs", color:"#666666", flex:2, align:"end"}
        ]},
        {type:"box", layout:"horizontal", contents:[
          {type:"text", text:"📅 ส่งแรกสุด", size:"xs", color:"#888888", flex:2},
          {type:"text", text:s.nextDateTH||"-", size:"xs", color:"#666666", flex:2, align:"end"}
        ]},
        {type:"box", layout:"horizontal", contents:[
          {type:"text", text:"💰 ยอดรวม", size:"xs", color:"#888888", flex:2},
          {type:"text", text:s.totalAmount.toLocaleString()+"฿", size:"sm", color:"#4CAF50", weight:"bold", flex:2, align:"end"}
        ]},
        hasUrgent ? {type:"text", text:"🚨 "+s.urgentCount+" ออเดอร์ด่วน",
          size:"xs", color:"#D32F2F", weight:"bold", margin:"sm"} : null
      ].filter(Boolean)},
      footer:{type:"box", layout:"vertical", spacing:"sm", paddingAll:"10px", contents:[
        {type:"button", style:"primary", color:headerColor, height:"sm",
          action:{type:"message", label:"👁️ ดูร้านนี้", text:custCmd}}
      ]}
    };
  });

  // summary bubble หัวสุด
  var totalShops = shops.length;
  var totalOrders = shops.reduce(function(s,x){return s+x.orders.length;},0);
  var totalAmount = shops.reduce(function(s,x){return s+x.totalAmount;},0);
  var totalUrgent = shops.reduce(function(s,x){return s+x.urgentCount;},0);

  var summaryBubble = {
    type:"bubble", size:"kilo",
    header:{type:"box", layout:"vertical", backgroundColor:"#37474F", paddingAll:"14px", contents:[
      {type:"text", text:"📋 สรุปร้านค้างส่ง", size:"xs", color:"#B0BEC5", weight:"bold"},
      {type:"text", text:totalShops+" ร้าน", size:"xxl", color:"#FFFFFF", weight:"bold"}
    ]},
    body:{type:"box", layout:"vertical", paddingAll:"14px", spacing:"sm", contents:[
      {type:"box", layout:"horizontal", spacing:"sm", contents:[
        buildStatBox("📦",String(totalOrders),"ออเดอร์","#ECEFF1"),
        buildStatBox("💰", totalAmount>=1000?(totalAmount/1000).toFixed(1)+"K":String(totalAmount),"บาท","#E8F5E9")
      ]},
      totalUrgent > 0 ? {type:"box", layout:"horizontal", backgroundColor:"#FFEBEE",
        paddingAll:"10px", cornerRadius:"8px", margin:"sm", contents:[
        {type:"text", text:"🚨 มีออเดอร์ด่วน", size:"sm", color:"#D32F2F", weight:"bold", flex:3},
        {type:"text", text:String(totalUrgent)+" รายการ", size:"sm", color:"#D32F2F", weight:"bold", flex:2, align:"end"}
      ]} : null,
      {type:"separator", margin:"md"},
      {type:"text", text:"กดปุ่มร้านที่ต้องการดูรายการ →", size:"xxs", color:"#AAAAAA", margin:"sm"}
    ].filter(Boolean)}
  };

  var allBubbles = [summaryBubble].concat(bubbles);
  if (shops.length > MAX) {
    allBubbles.push({type:"bubble", size:"kilo",
      body:{type:"box", layout:"vertical", justifyContent:"center", alignItems:"center", height:"200px", contents:[
        {type:"text", text:"+"+(shops.length-MAX), size:"5xl", weight:"bold", color:"#CCCCCC"},
        {type:"text", text:"ร้านเพิ่มเติม", size:"sm", color:"#AAAAAA", margin:"md"},
        {type:"text", text:"พิมพ์ search <ชื่อร้าน>", size:"xxs", color:"#AAAAAA", margin:"md"}
      ]}
    });
  }

  return {type:"flex", altText:"🏪 ร้านค้างส่ง "+totalShops+" ร้าน "+totalOrders+" ออเดอร์",
    contents:{type:"carousel", contents:allBubbles}};
}

function buildOrderPickerFlex_(mode) {
  // mode: "add" = เพิ่มเมนู, "edit" = แก้ไข
  var groups = groupRowsByOrder(getLatestUniqueOrderRows_(6));
  if (!groups.length) {
    return {type:"flex", altText:"ไม่มีออเดอร์", contents:buildAlertFlex("ไม่มีออเดอร์ล่าสุด","ลองส่งออเดอร์ใหม่ก่อนค่ะ","#FF9500")};
  }
  var isAdd = (mode !== "edit");
  var title = isAdd ? "➕ เลือกออเดอร์ที่จะเพิ่มเมนู" : "✏️ เลือกออเดอร์ที่จะแก้ไข";
  var headerColor = isAdd ? "#4CAF50" : "#FF9800";

  var cards = groups.map(function(g) {
    var main = g.rows.find(function(r){ return toNumber(r.grandTotal)>0; }) || g.rows[0];
    var cust = String(main.customerName||main.tableName||"-").trim();
    var itemCount = g.rows.filter(function(r){ return r.menuName; }).length;
    var actionCmd = isAdd ? ("เพิ่มเมนู "+g.orderId) : ("แก้ "+g.orderId);
    var actionLabel = isAdd ? "➕ เพิ่มเมนูใบนี้" : "✏️ แก้ใบนี้";
    return {type:"box", layout:"vertical", margin:"sm", paddingAll:"10px",
      backgroundColor:"#F9F9F9", cornerRadius:"8px", borderWidth:"1px", borderColor:"#E0E0E0",
      contents:[
        {type:"text", text:"👤 "+cust, size:"sm", weight:"bold", color:"#333333", wrap:true},
        {type:"text", text:"🆔 "+g.orderId, size:"xxs", color:"#AAAAAA"},
        {type:"box", layout:"horizontal", margin:"xs", contents:[
          {type:"text", text:"📅 "+main.deliveryDate, size:"xs", color:"#888888", flex:3},
          {type:"text", text:itemCount+" รายการ • "+toNumber(main.grandTotal).toLocaleString()+"฿", size:"xs", color:"#666666", flex:4, align:"end"}
        ]},
        {type:"button", margin:"sm", height:"sm",
          style:"primary", color:headerColor,
          action:{type:"message", label:actionLabel, text:actionCmd}}
      ]};
  });

  return {type:"flex", altText:title,
    contents:{type:"bubble", size:"giga",
      header:{type:"box", layout:"vertical", backgroundColor:headerColor, paddingAll:"16px", contents:[
        {type:"text", text:title, size:"md", color:"#FFFFFF", weight:"bold", wrap:true},
        {type:"text", text:"แตะปุ่มใต้ออเดอร์ที่ต้องการ", size:"xs", color:"#FFFFFF", margin:"xs"}
      ]},
      body:{type:"box", layout:"vertical", paddingAll:"12px", spacing:"none", contents:cards}
    }};
}

function updateOrderStatus_(orderId, status, updatedBy) {
  // เพิ่ม delivery statuses เข้า whitelist (เดิม reject ปุ่ม รับงาน/ออกส่ง/ส่งแล้ว)
  var allowed = [
    "confirmed","preparing","ready","completed","❌ ยกเลิก",
    DELIVERY_STATUS.RECEIVED, DELIVERY_STATUS.ENROUTE,
    DELIVERY_STATUS.DELIVERED, DELIVERY_STATUS.FAILED
  ];
  if (allowed.indexOf(status) === -1) return { ok:false, message:"status ไม่ถูกต้อง: "+status };
  var res = updateOrderField_(orderId, { status:status }, updatedBy||"system");
  // [v3.6.2] ปิด broadcast "เปลี่ยนสถานะ" ทั้งหมด
  //   - user action: ผู้กดเห็นใน reply อยู่แล้ว
  //   - system trigger: เปลี่ยนใน sheet เงียบ ๆ ไม่รบกวนใคร
  // (ถ้าต้องการ broadcast cron กลับมา ให้ลบ "false &&" ออก)
  if (false && res.ok && ENABLE_PUSH_STATUS) {
    pushNotifyText_("🔔 เปลี่ยนสถานะ\nOrder ID: "+orderId+"\nStatus: "+status+"\nโดย: "+nameOf_(updatedBy));
  }
  return res;
}

function parseEditCommand_(text) {
  var m = String(text||"").match(/^edit\s+(\S+)\s+(.+)$/i);
  if (!m) return null;
  var orderId    = m[1].trim();
  var rawFields  = m[2].split("|");
  var fieldMap   = {};
  var fieldAlias = {
    "deliverydate":"deliveryDate","date":"deliveryDate","วันที่ส่ง":"deliveryDate",
    "paymentdate":"paymentDate","วันที่จ่าย":"paymentDate",
    "customer":"customerName","ลูกค้า":"customerName",
    "phone":"phone","เบอร์":"phone","channel":"channel",
    "ordertype":"orderType","type":"orderType",
    "table":"tableName","deliverytype":"deliveryType","ประเภท":"deliveryType",
    "deliverytime":"deliveryTime","time":"deliveryTime","เวลาส่ง":"deliveryTime",
    "location":"location","สถานที่":"location",
    "deliveryfee":"deliveryFee","ค่าส่ง":"deliveryFee",
    "grandtotal":"grandTotal","total":"grandTotal","รวมทั้งหมด":"grandTotal",
    "paymentstatus":"paymentStatus","note":"note","status":"status",
    "map":"googleMap","googlemap":"googleMap"
  };
  rawFields.forEach(function(part) {
    var eq  = part.split("=");
    if (eq.length < 2) return;
    var key = String(eq[0]).trim().toLowerCase();
    var val = eq.slice(1).join("=").trim();
    if (fieldAlias[key]) fieldMap[fieldAlias[key]] = val;
  });
  return { orderId:orderId, fieldMap:fieldMap };
}

// ============================================================
// SMART SEARCH
// ============================================================
function smartSearch(keyword) {
  var k = String(keyword||"").trim().toLowerCase();
  if (!k) return [];
  var rows = getOrderRows(function(r) {
    var fields = [r.orderId,r.customerName,r.phone,r.channel,r.orderType,
                  r.tableName,r.deliveryType,r.location,r.menuName,r.note];
    for (var i = 0; i < fields.length; i++)
      if (String(fields[i]||"").toLowerCase().indexOf(k) > -1) return true;
    return false;
  }, 200);
  var groups = groupRowsByOrder(rows);
  groups.sort(function(a,b) {
    var aTs = String((a.rows.find(function(r){return r.lastUpdatedAt||r.timestamp;})||a.rows[0]).lastUpdatedAt||"");
    var bTs = String((b.rows.find(function(r){return r.lastUpdatedAt||r.timestamp;})||b.rows[0]).lastUpdatedAt||"");
    return bTs.localeCompare(aTs);
  });
  var out = [];
  groups.slice(0,10).forEach(function(g){ out=out.concat(g.rows); });
  return out;
}

function handleSmartSearchFilter(filterStr, replyToken) {
  var ci = filterStr.indexOf(":");
  if (ci < 0) return false;
  var key = filterStr.substring(0,ci).trim().toLowerCase();
  var val = filterStr.substring(ci+1).trim().toLowerCase();
  var rows, label;
  if (key==="type"||key==="ordertype") {
    rows = getOrderRows(function(r){ return safeLower_(r.orderType).indexOf(val)>-1; }, 200);
    label = "Order Type: "+val;
  } else if (key==="delivery"||key==="deliverytype") {
    rows = getOrderRows(function(r){ return normalizeDeliveryType(r.deliveryType).toLowerCase().indexOf(val)>-1; }, 200);
    label = "Delivery: "+val;
  } else if (key==="status") {
    rows = getOrderRows(function(r){ return normalizeStatus(r.status).toLowerCase().indexOf(val)>-1; }, 200);
    label = "Status: "+val;
  } else if (key==="channel") {
    rows = getOrderRows(function(r){ return normalizeChannel(r.channel).toLowerCase().indexOf(val)>-1; }, 200);
    label = "Channel: "+val;
  } else if (key==="payment"||key==="paymentstatus") {
    rows = getOrderRows(function(r){ return safeLower_(r.paymentStatus).indexOf(val)>-1; }, 200);
    label = "Payment: "+val;
  } else {
    return false;
  }
  replyFlexWithQuickReply(replyToken, buildOrderListFlex(rows, label), QR_SEARCH);
  return true;
}

function parseDateRange(rangeStr) {
  var parts = String(rangeStr||"").split(/\s*-\s*/);
  if (parts.length < 2) return null;
  var start = thDateToDate(parts[0].trim());
  var end   = thDateToDate(parts.slice(1).join("-").trim());
  if (!start||!end) return null;
  return { start:start, end:end, startStr:parts[0].trim(), endStr:parts.slice(1).join("-").trim() };
}

function getOrderRowsByDateRange(startDate, endDate) {
  return getOrderRows(function(r) {
    var d = thDateToDate(r.deliveryDate); // r.deliveryDate normalized
    return d && d >= startDate && d <= endDate;
  }, 500);
}

// ============================================================
// FLEX / TEMPLATES
// ============================================================
function buildStatBox(icon, value, label, bgColor) {
  return {type:"box",layout:"vertical",flex:1,alignItems:"center",paddingAll:"8px",backgroundColor:bgColor,cornerRadius:"8px",
    contents:[
      {type:"text",text:String(icon),size:"xl",align:"center"},
      {type:"text",text:String(value),size:"lg",weight:"bold",color:"#333333",align:"center"},
      {type:"text",text:String(label),size:"xxs",color:"#888888",align:"center"}
    ]};
}

function buildAlertFlex(title, subtitle, color) {
  return {type:"bubble",size:"kilo",body:{type:"box",layout:"vertical",justifyContent:"center",alignItems:"center",paddingAll:"24px",spacing:"md",contents:[
    {type:"text",text:String(title),size:"lg",weight:"bold",color:color,align:"center"},
    {type:"text",text:String(subtitle||""),size:"sm",color:"#888888",align:"center",wrap:true}
  ]}};
}

function makeInfoRow(label, value, passed) {
  return {type:"box",layout:"horizontal",margin:"xs",contents:[
    {type:"text",text:String(label),size:"xs",color:passed?"#BDBDBD":"#888888",flex:2},
    {type:"text",text:String(value),size:"xs",color:passed?"#9E9E9E":"#333333",flex:3,align:"end",wrap:true}
  ]};
}

function getOrderFormTemplate() {
  // ฟอร์มแบบใหม่ — เลิก English mix, ลดฟิลด์, ใส่ตัวอย่างจริงให้แก้ง่าย
  // หมายเหตุ: ใช้ "วันที่:" (ไม่ใช่ "วันที่ส่ง:") เพื่อ route ไปที่ payment_address parser ที่ flexible กว่า
  var t = getTodayTH();
  return [
    "📝 ฟอร์มสั่งเค้ก (ก๊อปแล้วแก้ตามจริงได้เลยค่ะ)",
    "─────────────",
    "วันที่: " + t,
    "ชื่อคนรับ: คุณมิว",
    "เบอร์: 097-1234567",
    "ที่อยู่: 99/9 ถ.พหลโยธิน แขวงสามเสนใน เขตพญาไท กรุงเทพฯ 10400",
    "",
    "รายการ:",
    "- มะพร้าวอ่อนครีมสด 1 ชิ้น 129฿",
    "- ช็อกโกแลตครีมสด 1 ชิ้น 129฿",
    "",
    "รวม: 258฿",
    "หมายเหตุ: (ถ้ามี เช่น ส่งก่อน 14:00)"
  ].join("\n");
}

function buildCakeMenuCarousel() {
  return {type:"flex",altText:"🍰 เมนูเค้ก",contents:{type:"carousel",contents:[{
    type:"bubble",
    header:{type:"box",layout:"vertical",backgroundColor:"#FFB6C1",paddingAll:"14px",contents:[{type:"text",text:"🍰 เมนูเค้ก",size:"lg",weight:"bold",color:"#FFFFFF"}]},
    body:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"16px",contents:[
      {type:"text",text:"• มินิเค้กรวมรส",size:"sm",wrap:true},
      {type:"text",text:"• เค้กช็อกโกแลต",size:"sm",wrap:true},
      {type:"text",text:"• เค้กส้ม",size:"sm",wrap:true},
      {type:"text",text:"• บราวนี่",size:"sm",wrap:true},
      {type:"text",text:"• เค้กวันเกิด / pre-order",size:"sm",wrap:true}
    ]},
    footer:{type:"box",layout:"horizontal",contents:[{type:"button",style:"primary",color:"#FF6B6B",action:{type:"message",label:"สั่งเค้ก",text:"สั่งเค้ก"}}]}
  }]}};
}

function buildOrderCardFlex(orderId, rows) {
  var mainRow = rows.find(function(r){ return toNumber(r.grandTotal)>0; }) || rows[0];
  var grandTotal    = toNumber(mainRow.grandTotal);
  var deliveryFee   = toNumber(mainRow.deliveryFee);
  var foodTotal     = grandTotal - deliveryFee;
  // [Fix v3.5] mainRow normalized by rowArrayToObject_
  var deliveryDateStr = mainRow.deliveryDate;
  var deliveryTimeStr = mainRow.deliveryTime;
  var passed   = isDeliveryPassed(deliveryDateStr, mainRow.deliveryTime);
  var isCancelled = mainRow.status==="❌ ยกเลิก";
  // [v3.6.6] เช็ค status ว่าส่งแล้วไหม — รวมเทาเมื่อ delivered (แม้ยังไม่ถึงเวลา)
  var statusLow = String(mainRow.status||"").toLowerCase();
  var isDelivered = /completed|delivered|ส่งแล้ว/.test(statusLow);
  var isDone = passed || isCancelled || isDelivered;   // เทาเมื่อจบงาน
  // urgent detection — เปลี่ยน header เป็นแดงเข้ม + icon
  var isUrgent = isNoteUrgent_(mainRow.note) && !isDone;
  var headerBg = isUrgent ? "#D32F2F" :
                 isDone ? "#37474F" : "#FF6B6B";
  var statusBadge = isCancelled ? "❌ ยกเลิก" :
                    isDelivered ? "🎉 ส่งแล้ว" :
                    passed ? "✅ ส่งแล้ว" :
                    isUrgent ? "🚨 URGENT" : "";

  var itemRows = rows.map(function(r) {
    var qty  = toNumber(r.qty);
    var price = toNumber(r.unitPrice)*qty || toNumber(r.itemTotal);
    return {type:"box",layout:"horizontal",margin:"sm",contents:[
      {type:"text",text:"• "+r.menuName,size:"sm",color:isDone?"#9E9E9E":"#555555",flex:3,wrap:true},
      {type:"text",text:qty+" "+(r.unit||"ชิ้น"),size:"sm",color:isDone?"#BDBDBD":"#888888",flex:1,align:"center"},
      {type:"text",text:price.toLocaleString()+"฿",size:"sm",color:isDone?"#9E9E9E":"#333333",flex:2,align:"end",weight:"bold"}
    ]};
  });

  var infoRows = [];
  if (mainRow.phone)        infoRows.push(makeInfoRow("📞 เบอร์",    String(mainRow.phone),       isDone));
  if (mainRow.channel)      infoRows.push(makeInfoRow("📡 Channel",  mainRow.channel,              isDone));
  if (mainRow.orderType)    infoRows.push(makeInfoRow("📋 ประเภท",   mainRow.orderType,            isDone));
  if (mainRow.deliveryType) infoRows.push(makeInfoRow("🚗 จัดส่ง",   mainRow.deliveryType,         isDone));
  if (deliveryTimeStr)      infoRows.push(makeInfoRow("⏰ เวลาส่ง",   deliveryTimeStr,              isDone));
  if (mainRow.location)     infoRows.push(makeInfoRow("📍 สถานที่",   String(mainRow.location),    isDone));
  if (mainRow.googleMap)    infoRows.push(makeInfoRow("🗺️ Map",       "ดูแผนที่",                  isDone));
  if (mainRow.note)         infoRows.push(makeInfoRow("📝 Note",      String(mainRow.note),        isDone));

  var bodyContents = [
    {type:"box",layout:"horizontal",contents:[
      {type:"text",text:"Order ID",size:"xs",color:"#AAAAAA",flex:2},
      {type:"text",text:String(orderId),size:"xs",color:isDone?"#9E9E9E":"#FF6B6B",flex:3,align:"end",weight:"bold"}
    ]},
    statusBadge ? {type:"text",text:statusBadge,size:"xs",color:isCancelled?"#F44336":(isDelivered?"#4CAF50":"#4CAF50"),align:"end",margin:"xs"} : null,
    {type:"separator",margin:"sm"}
  ].concat(infoRows.length > 0 ? [{type:"separator",margin:"sm"}] : [])
   .concat(infoRows)
   .concat([
    infoRows.length > 0 ? {type:"separator",margin:"sm"} : null,
    {type:"box",layout:"horizontal",margin:"sm",contents:[
      {type:"text",text:"รายการ",size:"xs",color:"#AAAAAA",flex:3,weight:"bold"},
      {type:"text",text:"จำนวน",size:"xs",color:"#AAAAAA",flex:1,align:"center",weight:"bold"},
      {type:"text",text:"ราคา",size:"xs",color:"#AAAAAA",flex:2,align:"end",weight:"bold"}
    ]}
  ]).concat(itemRows).concat([
    {type:"separator",margin:"md"},
    deliveryFee>0 ? {type:"box",layout:"horizontal",contents:[{type:"text",text:"🍰 ค่าอาหาร",size:"sm",color:"#888888",flex:3},{type:"text",text:foodTotal.toLocaleString()+"฿",size:"sm",color:"#888888",flex:2,align:"end"}]} : null,
    deliveryFee>0 ? {type:"box",layout:"horizontal",contents:[{type:"text",text:"🚚 ค่าส่ง",size:"sm",color:"#888888",flex:3},{type:"text",text:deliveryFee.toLocaleString()+"฿",size:"sm",color:"#888888",flex:2,align:"end"}]} : null,
    {type:"box",layout:"horizontal",margin:"sm",contents:[
      {type:"text",text:"💰 รวมทั้งหมด",size:"md",color:isDone?"#9E9E9E":"#333333",flex:3,weight:"bold"},
      {type:"text",text:grandTotal.toLocaleString()+"฿",size:"md",color:isDone?"#9E9E9E":"#FF6B6B",flex:2,align:"end",weight:"bold"}
    ]}
  ]).filter(Boolean);

  var bubble = {
    type:"bubble",size:"kilo",
    header:{type:"box",layout:"vertical",backgroundColor:headerBg,paddingAll:"16px",contents:[
      {type:"text",
        text: isUrgent ? "🚨 ออเดอร์ด่วน 🚨" :
              isDelivered ? "🎉 ออเดอร์ (ส่งแล้ว)" :
              passed ? "🧾 ออเดอร์ (เลยเวลา)" : "🧾 ออเดอร์",
        size:"xs", color: isUrgent ? "#FFFFFF" : (isDone?"#90A4AE":"#FFE0E0"), weight:"bold"},
      {type:"text",text:(isUrgent?"⚡ ":"") + "@" + (mainRow.customerName||"-"), size:"lg", color:"#FFFFFF", weight:"bold", wrap:true},
      {type:"text",text:"📅 "+deliveryDateStr+(deliveryTimeStr?"  ⏰ "+deliveryTimeStr:""),
        size:"xs", color: isUrgent ? "#FFCDD2" : (isDone?"#78909C":"#FFD0D0"), margin:"sm"}
    ]},
    body:{type:"box",layout:"vertical",paddingAll:"16px",spacing:"md",contents:bodyContents}
  };
  // [v3.6.3] footer — เพิ่มปุ่ม "✅ ส่งแล้ว" + แสดงปุ่มแม้ passed
  //   ก่อนหน้า: ถ้า passed ไม่แสดงปุ่มเลย → user mark ส่งแล้วไม่ได้ในการ์ดที่เลยเวลา
  //   ตอนนี้: passed ก็ยังกดได้ (อาจส่งช้า หรือเพิ่งกลับมา mark)
  //   ยกเลิกแล้วเท่านั้น ที่ไม่มีปุ่ม
  if (!isCancelled) {
    var statusLow = String(mainRow.status||"").toLowerCase();
    var alreadyDelivered = /completed|ส่งแล้ว|delivered/.test(statusLow);

    var urgentCmd   = isUrgent ? ("unurgent "+orderId) : ("urgent "+orderId);
    var urgentLabel = isUrgent ? "✅ ปลดด่วน" : "🚨 ตั้งด่วน";

    var footerContents = [];

    // แถว 1: ส่งแล้ว (เด่นสุด) — disable ถ้า delivered แล้ว
    if (alreadyDelivered) {
      footerContents.push({type:"button", height:"sm", style:"secondary",
        action:{type:"message", label:"✅ ส่งแล้ว (เรียบร้อย)", text:"search order "+orderId}});
    } else {
      footerContents.push({type:"button", height:"sm", style:"primary", color:"#4CAF50",
        action:{type:"message", label:"✅ ส่งแล้ว", text:"delivery "+orderId+" ส่งแล้ว"}});
    }

    // แถว 2: ตั้งด่วน + เพิ่มเมนู
    footerContents.push({type:"box", layout:"horizontal", spacing:"sm", contents:[
      {type:"button", flex:1, height:"sm",
        style:isUrgent?"primary":"secondary", color:isUrgent?"#9E9E9E":undefined,
        action:{type:"message", label:urgentLabel, text:urgentCmd}},
      {type:"button", flex:1, height:"sm", style:"secondary",
        action:{type:"message", label:"➕ เพิ่มเมนู", text:"เพิ่มเมนู "+orderId}}
    ]});

    // แถว 3: แก้ไข
    footerContents.push({type:"button", height:"sm", style:"secondary",
      action:{type:"message", label:"✏️ แก้ไข", text:"แก้ "+orderId}});

    bubble.footer = {type:"box", layout:"vertical", spacing:"sm", paddingAll:"10px",
      contents: footerContents};
  }
  return bubble;
}

function buildOrderListFlex(rows, label) {
  if (!rows.length) return {type:"flex",altText:"🔍 ไม่พบออเดอร์ "+label,contents:buildAlertFlex("🔍 ไม่พบออเดอร์",label,"#FF9500")};
  var orders = groupRowsByOrder(rows);
  // [v3.6.6] sort: urgent ก่อน → not done → date asc
  //   done = ส่งแล้ว/เลยเวลา/ยกเลิก → ไปท้าย
  function _isDoneRow_(m) {
    if (m.status === "❌ ยกเลิก") return true;
    if (/completed|delivered|ส่งแล้ว/i.test(String(m.status||""))) return true;
    return isDeliveryPassed(m.deliveryDate, m.deliveryTime);
  }
  orders.sort(function(a,b) {
    var mA=a.rows[0], mB=b.rows[0];
    var dA=_isDoneRow_(mA)?1:0;
    var dB=_isDoneRow_(mB)?1:0;
    var uA=isNoteUrgent_(mA.note) && !dA ? 0 : 1;
    var uB=isNoteUrgent_(mB.note) && !dB ? 0 : 1;
    if (uA!==uB) return uA-uB;
    if (dA!==dB) return dA-dB;
    return deliveryDateSortKey(mA.deliveryDate) - deliveryDateSortKey(mB.deliveryDate);
  });
  var limit   = 12;
  var bubbles = orders.slice(0,limit).map(function(o){ return buildOrderCardFlex(o.orderId,o.rows); });
  if (orders.length > limit)
    bubbles.push({type:"bubble",size:"kilo",body:{type:"box",layout:"vertical",justifyContent:"center",alignItems:"center",height:"200px",contents:[
      {type:"text",text:"+"+(orders.length-limit),size:"5xl",weight:"bold",color:"#CCCCCC"},
      {type:"text",text:"ออเดอร์เพิ่มเติม",size:"sm",color:"#AAAAAA",margin:"md"}
    ]}});
  if (bubbles.length===1) return {type:"flex",altText:"🔍 "+label,contents:bubbles[0]};
  return {type:"flex",altText:"🔍 "+label+" ("+orders.length+" ออเดอร์)",contents:{type:"carousel",contents:bubbles}};
}

// "ส่งวันนี้" — to-do ส่งของหน้าจอเดียว (ที่อยู่+เบอร์+เวลา+สถานะ)
// ซ่อนออเดอร์ที่ส่งแล้ว/เลยเวลาไปแล้ว เหลือเฉพาะที่ "ยังต้องส่ง"
function buildDeliveryTodayFlex_(targetDate, label, includeAll) {
  var rows = getRowsByDeliveryDateFast_(targetDate).filter(function(r){ return !isRowCancelled(r); });
  var orders = groupRowsByOrder(rows);

  // กรอง: เอาเฉพาะที่ยังต้องส่ง (ไม่ส่งแล้ว + ไม่เลยเวลา) เว้นแต่ includeAll
  var pending = orders.filter(function(o){
    var main = o.rows.find(function(r){ return toNumber(r.grandTotal)>0; }) || o.rows[0];
    if (includeAll) return true;
    if (isOrderAlreadyDelivered_(main)) return false;       // ส่งแล้ว/ส่งไม่สำเร็จ → ซ่อน
    if (isDeliveryPassed(main.deliveryDate, main.deliveryTime)) return false; // เลยเวลา → ซ่อน
    return true;
  });

  if (!pending.length) {
    return {type:"flex", altText:"✅ ส่งครบแล้ว "+label,
      contents:buildAlertFlex("✅ ส่งครบแล้วค่ะ", label+" — ไม่มีออเดอร์ค้างส่ง", "#4CAF50")};
  }

  // เรียงตามเวลาส่ง (เช้า→เย็น) urgent ก่อน
  pending.sort(function(a,b){
    var mA=a.rows[0], mB=b.rows[0];
    var uA=isNoteUrgent_(mA.note)?0:1, uB=isNoteUrgent_(mB.note)?0:1;
    if (uA!==uB) return uA-uB;
    return String(mA.deliveryTime||"99:99").localeCompare(String(mB.deliveryTime||"99:99"));
  });

  var cards = pending.slice(0,15).map(function(o){
    var main = o.rows.find(function(r){ return toNumber(r.grandTotal)>0; }) || o.rows[0];
    var cust = String(main.customerName||main.tableName||"-").trim();
    var isUrgent = isNoteUrgent_(main.note);
    var st = String(main.status||"");
    var stColor = st.indexOf("ออกส่ง")>-1 ? "#2196F3" : st.indexOf("รับงาน")>-1 ? "#FF9800" : "#9E9E9E";
    var stText  = st.indexOf("ออกส่ง")>-1 ? "🚗 กำลังส่ง" : st.indexOf("รับงาน")>-1 ? "🛵 เตรียมส่ง" : "⏳ รอส่ง";

    var menuAgg = {};
    o.rows.forEach(function(r){ if(r.menuName){ var k=r.menuName; menuAgg[k]=(menuAgg[k]||0)+toNumber(r.qty); } });
    var menuText = objectEntries_(menuAgg).map(function(e){ return e[0]+" ×"+e[1]; }).join(", ");

    var info = [
      {type:"box", layout:"horizontal", contents:[
        {type:"text", text:(isUrgent?"🚨 ":"👤 ")+cust, size:"sm", weight:"bold",
          color:isUrgent?"#D32F2F":"#333333", flex:4, wrap:true},
        {type:"text", text:main.deliveryTime?("⏰ "+main.deliveryTime):"⏰ -", size:"xs",
          color:"#FF6B35", flex:2, align:"end", weight:"bold"}
      ]},
      {type:"text", text:stText, size:"xxs", color:stColor, weight:"bold", margin:"xs"}
    ];
    if (menuText) info.push({type:"text", text:"🍰 "+menuText, size:"xs", color:"#666666", wrap:true, margin:"xs"});
    if (main.phone) info.push({type:"text", text:"📞 "+main.phone, size:"xs", color:"#555555", margin:"xs"});
    if (main.location) info.push({type:"text", text:"📍 "+String(main.location).substring(0,70), size:"xs", color:"#555555", wrap:true, margin:"xs"});
    // ปุ่มอัปสถานะส่ง
    info.push({type:"box", layout:"horizontal", spacing:"sm", margin:"sm", contents:[
      {type:"button", flex:1, height:"sm", style:"primary", color:"#4CAF50",
        action:{type:"message", label:"✅ ส่งแล้ว", text:"delivery "+o.orderId+" ส่งแล้ว"}},
      {type:"button", flex:1, height:"sm", style:"secondary",
        action:{type:"message", label:"🔍 ดู", text:"search order "+o.orderId}}
    ]});

    return {type:"box", layout:"vertical", margin:"sm", paddingAll:"10px",
      backgroundColor:isUrgent?"#FFEBEE":"#F9F9F9", cornerRadius:"8px",
      borderWidth:isUrgent?"2px":"1px", borderColor:isUrgent?"#D32F2F":"#E0E0E0",
      contents:info};
  });

  var hiddenCount = orders.length - pending.length;
  var headerNote = hiddenCount>0 ? (pending.length+" เจ้าต้องส่ง • ซ่อนที่ส่งแล้ว "+hiddenCount) : (pending.length+" เจ้าต้องส่ง");

  return {type:"flex", altText:"🚗 ส่งวันนี้ "+pending.length+" เจ้า",
    contents:{type:"bubble", size:"giga",
      header:{type:"box", layout:"vertical", backgroundColor:"#FF6B35", paddingAll:"16px", contents:[
        {type:"text", text:"🚗 ต้องส่งวันนี้", size:"lg", color:"#FFFFFF", weight:"bold"},
        {type:"text", text:label+" • "+headerNote, size:"xs", color:"#FFE0D0", margin:"xs", wrap:true}
      ]},
      body:{type:"box", layout:"vertical", paddingAll:"12px", spacing:"none", contents:cards},
      footer:{type:"box", layout:"horizontal", spacing:"sm", paddingAll:"10px", contents:[
        {type:"button", flex:1, height:"sm", style:"secondary",
          action:{type:"message", label:"🔄 รีเฟรช", text:"ส่งวันนี้"}},
        {type:"button", flex:1, height:"sm", style:"secondary",
          action:{type:"message", label:"📋 ดูทั้งหมด", text:"ส่งวันนี้ทั้งหมด"}}
      ]}
    }};
}

function buildSummaryDateFlex(targetDate, label) {
  var rows   = getRowsByDeliveryDateFast_(targetDate);
  if (!rows.length) return {type:"flex",altText:"📊 ไม่มีออเดอร์"+label,contents:buildAlertFlex("📊 ไม่มีออเดอร์",label,"#AAAAAA")};
  var orders = groupRowsByOrder(rows);
  var grandTotalAll=0, totalQty=0, menuCount={}, channelCount={};
  rows.forEach(function(r) {
    grandTotalAll += toNumber(r.grandTotal);
    totalQty      += toNumber(r.qty);
    if (r.menuName) menuCount[r.menuName]   = (menuCount[r.menuName]||0)   + toNumber(r.qty);
    if (r.channel)  channelCount[r.channel] = (channelCount[r.channel]||0) + 1;
  });

  // สร้างส่วนแยกร้าน — urgent ก่อน → เวลาเช้า→เย็น
  var shopList = orders.map(function(o){
    var main = o.rows.find(function(r){ return toNumber(r.grandTotal)>0; }) || o.rows[0] || {};
    var cust = String(main.customerName||main.tableName||main.location||"ไม่ระบุ").trim();
    var agg = {};
    o.rows.forEach(function(r){ if(r.menuName){ var k=r.menuName+"|"+(r.unit||"ชิ้น");
      if(!agg[k]) agg[k]={n:r.menuName,u:r.unit||"ชิ้น",q:0}; agg[k].q+=toNumber(r.qty); } });
    var items = objectEntries_(agg).map(function(e){return e[1];}).sort(function(a,b){return b.q-a.q;});
    return {cust:cust, time:main.deliveryTime||"", urgent:isNoteUrgent_(main.note),
            baht:toNumber(main.grandTotal), items:items};
  });
  shopList.sort(function(a,b){
    if (a.urgent!==b.urgent) return a.urgent?-1:1;
    return String(a.time||"99:99").localeCompare(String(b.time||"99:99"));
  });
  var shopSection = [{type:"separator"},{type:"text",text:"📋 แยกร้าน",size:"sm",weight:"bold",color:"#FF6B35"}];
  shopList.slice(0,10).forEach(function(s){
    shopSection.push({type:"box",layout:"horizontal",margin:"sm",contents:[
      {type:"text",text:(s.urgent?"🚨 ":"👤 ")+s.cust+(s.time?" ("+s.time+")":""),
        size:"xs",weight:"bold",color:s.urgent?"#D32F2F":"#333333",flex:5,wrap:true},
      {type:"text",text:s.baht.toLocaleString()+"฿",size:"xs",color:"#4CAF50",flex:2,align:"end",weight:"bold"}
    ]});
    var itemText = s.items.map(function(it){ return it.n+" ×"+it.q; }).join(", ");
    // กัน text ว่าง → LINE reject flex 400 → reply เงียบ
    if (itemText) shopSection.push({type:"text",text:"   "+itemText,size:"xxs",color:"#888888",wrap:true});
  });

  var summaryBubble = {type:"bubble",size:"mega",
    header:{type:"box",layout:"vertical",backgroundColor:"#4CAF50",paddingAll:"16px",contents:[
      {type:"text",text:"📊 สรุปยอด",size:"xs",color:"#C8E6C9",weight:"bold"},
      {type:"text",text:label,size:"xl",color:"#FFFFFF",weight:"bold"},
      {type:"text",text:targetDate,size:"xs",color:"#A5D6A7",margin:"xs"}
    ]},
    body:{type:"box",layout:"vertical",paddingAll:"16px",spacing:"md",contents:[
      {type:"box",layout:"horizontal",spacing:"sm",contents:[
        buildStatBox("🧾",String(orders.length),"ออเดอร์","#E8F5E9"),
        buildStatBox("📦",String(totalQty),"ชิ้น","#E3F2FD"),
        buildStatBox("💰",grandTotalAll>=1000?(grandTotalAll/1000).toFixed(1)+"K":String(grandTotalAll),"บาท","#FFF3E0")
      ]}
    ].concat(shopSection).concat([
      {type:"separator"},
      {type:"text",text:"🏭 ผลิตรวมทุกเจ้า",size:"sm",weight:"bold",color:"#2E7D32"}
    ]).concat(objectEntries_(menuCount).sort(function(a,b){return b[1]-a[1];}).map(function(e){
      return {type:"box",layout:"horizontal",contents:[
        {type:"text",text:"• "+e[0],size:"sm",color:"#555555",flex:4,wrap:true},
        {type:"text",text:e[1]+" ชิ้น",size:"sm",color:"#4CAF50",flex:2,align:"end",weight:"bold"}
      ]};
    })).concat([
      {type:"separator"},{type:"text",text:"📡 Channel",size:"sm",weight:"bold",color:"#555555"}
    ]).concat(objectEntries_(channelCount).map(function(e){
      return {type:"box",layout:"horizontal",contents:[
        {type:"text",text:e[0],size:"sm",color:"#555555",flex:3},
        {type:"text",text:e[1]+" ออเดอร์",size:"sm",color:"#2196F3",flex:2,align:"end"}
      ]};
    })).concat([{type:"separator"},{type:"box",layout:"horizontal",backgroundColor:"#F1F8E9",paddingAll:"10px",cornerRadius:"8px",contents:[
      {type:"text",text:"💰 รวมทั้งสิ้น",size:"md",weight:"bold",color:"#388E3C",flex:3},
      {type:"text",text:grandTotalAll.toLocaleString()+" บาท",size:"md",weight:"bold",color:"#4CAF50",flex:3,align:"end"}
    ]}])}
  };
  // ลด 11→6 การ์ด กัน payload ใหญ่/ช้า → reply token timeout → เงียบ
  // (รายร้านครบใน summaryBubble แล้ว — การ์ดรายใบไว้ดูปุ่มแก้/เพิ่ม)
  var orderBubbles = orders.slice(0,6).map(function(o){ return buildOrderCardFlex(o.orderId,o.rows); });
  return {type:"flex",altText:"📊 สรุป"+label+" | "+orders.length+" ออเดอร์ | "+grandTotalAll.toLocaleString()+" บาท",
    contents:{type:"carousel",contents:[summaryBubble].concat(orderBubbles)}};
}

// ★ v3.5 FAST — buildPlan7TextFast_(): text reply ไวกว่า Flex 3-5x
// ถ้าต้องการ Flex รายละเอียด ให้ใช้ plan DD/MM แทน
function buildPlan7TextFast_() {
  var dates = getNextActivePlanDates_(7); // ★ ใช้ Plan Light Index
  if (!dates||!dates.length) return SHOP_NAME+"\n🧁 แผนผลิต 7 วันข้างหน้า\n\nยังไม่มีออเดอร์ล่วงหน้าค่ะ";

  var dayNames = ["อา","จ","อ","พ","พฤ","ศ","ส"];
  var out = ["🧁 แผนผลิต 7 วัน (แยกร้าน)\n"];

  dates.forEach(function(dateKey) {
    var rows = getPlanRowsByDeliveryDateFast_(dateKey); // ★ Plan Light Index (กรองยกเลิกแล้ว)
    if (!rows.length) return;

    var dObj = thDateToDate(dateKey);
    var dayLabel = dObj ? dayNames[dObj.getDay()] : "";

    // แยกร้าน — group by order/customer + เก็บเวลาส่ง + urgent
    var orders = groupRowsByOrder(rows);
    var totalQty = 0;
    var shops = orders.map(function(order) {
      var main = order.rows.find(function(r){ return toNumber(r.grandTotal)>0; }) || order.rows[0] || {};
      var cust = String(main.customerName||main.tableName||main.location||"ไม่ระบุ").trim();
      var time = main.deliveryTime || "";
      var urgent = isNoteUrgent_(main.note);
      // รวมเมนูของร้านนี้
      var agg = {};
      order.rows.forEach(function(r){
        if (!r.menuName) return;
        var unit = r.unit||"ชิ้น";
        var k = r.menuName+"|||"+unit;
        if (!agg[k]) agg[k]={menuName:r.menuName,unit:unit,qty:0};
        agg[k].qty += toNumber(r.qty);
        totalQty += toNumber(r.qty);
      });
      var items = objectEntries_(agg).map(function(e){return e[1];}).sort(function(a,b){return b.qty-a.qty;});
      return {cust:cust, time:time, urgent:urgent, items:items};
    });
    // urgent ก่อน → เวลาเช้า→เย็น
    shops.sort(function(a,b){
      if (a.urgent!==b.urgent) return a.urgent?-1:1;
      return String(a.time||"99:99").localeCompare(String(b.time||"99:99"));
    });

    out.push("━━━━━━━━━━━━━━━");
    out.push("📅 "+dayLabel+" "+dateKey+" | "+shops.length+" ร้าน | "+totalQty+" ชิ้น");
    shops.forEach(function(s){
      var head = "👤 "+s.cust+(s.time?" ("+s.time+")":"")+(s.urgent?" 🚨":"");
      out.push(head);
      s.items.forEach(function(it){ out.push("   - "+it.menuName+" "+it.qty+" "+it.unit); });
    });
    out.push("");
  });

  var msg = out.join("\n");
  if (msg.length > 4500) msg = msg.substring(0, 4470)+"\n... (ยาวเกิน — ดูเจาะวันด้วย plan DD/MM)";
  return msg;
}


// ★ v3.5 — buildDayDetailFlex_(): แสดงรายละเอียดวันเดียวแบบ Flex (plan DD/MM)
// buildDayDetailFlex_ — แสดงรายออเดอร์แยกใบ + ปุ่ม 🚨 toggle ต่อใบ
function buildDayDetailFlex_(dateKey, dayLabel) {
  var rows = getPlanRowsByDeliveryDateFast_(dateKey);
  if (!rows.length) return {type:"flex",altText:"🧁 ไม่มีออเดอร์ "+dayLabel,
    contents:buildAlertFlex("🧁 ไม่มีออเดอร์ "+(dayLabel||dateKey),"",  "#AAAAAA")};

  var orders = groupRowsByOrder(rows);

  // sort: urgent ก่อน → time asc
  orders.sort(function(a, b) {
    var mA=a.rows[0], mB=b.rows[0];
    var uA = isNoteUrgent_(mA.note) ? 0 : 1;
    var uB = isNoteUrgent_(mB.note) ? 0 : 1;
    if (uA !== uB) return uA - uB;
    var tA = String(mA.deliveryTime||"99:99");
    var tB = String(mB.deliveryTime||"99:99");
    return tA.localeCompare(tB);
  });

  // 1 order = 1 box (clickable card) — limit 15 orders/วัน
  var MAX_ORDERS = 15;
  var orderBoxes = orders.slice(0, MAX_ORDERS).map(function(order) {
    var main = order.rows.find(function(r){ return toNumber(r.grandTotal)>0; }) || order.rows[0] || {};
    var oid  = order.orderId;
    var cust = String(main.customerName||main.tableName||main.location||"ไม่ระบุ").trim();
    var time = main.deliveryTime || "";
    var isUrgent = isNoteUrgent_(main.note);
    var bgColor  = isUrgent ? "#FFEBEE" : "#F9F9F9";
    var borderColor = isUrgent ? "#D32F2F" : "#E0E0E0";
    var custColor = isUrgent ? "#D32F2F" : "#333333";

    // aggregate เมนูของออเดอร์นี้
    var menuAgg = {};
    order.rows.forEach(function(r){
      if (!r.menuName) return;
      var k = r.menuName+"|||"+(r.unit||"ชิ้น");
      if (!menuAgg[k]) menuAgg[k]={menuName:r.menuName,unit:r.unit||"ชิ้น",qty:0};
      menuAgg[k].qty += toNumber(r.qty);
    });
    var itemList = objectEntries_(menuAgg).map(function(e){ return e[1]; })
      .sort(function(a,b){ return b.qty-a.qty; });
    var totalQty = itemList.reduce(function(s,m){return s+m.qty;},0);

    // items text — รวมเป็นบรรทัดเดียว
    var itemsText = itemList.slice(0,4).map(function(ml){
      return ml.menuName+" ×"+ml.qty;
    }).join(", ");
    if (itemList.length > 4) itemsText += " +" + (itemList.length-4);

    // toggle command
    var toggleCmd   = isUrgent ? ("unurgent "+oid) : ("urgent "+oid);
    var toggleLabel = isUrgent ? "✅ ปลดด่วน" : "🚨 ตั้งด่วน";
    var toggleColor = isUrgent ? "#4CAF50" : "#D32F2F";

    return {
      type:"box", layout:"vertical", margin:"sm", paddingAll:"10px",
      backgroundColor:bgColor, cornerRadius:"8px",
      borderWidth:isUrgent?"2px":"1px", borderColor:borderColor,
      contents:[
        // บรรทัดบน — ลูกค้า + เวลา
        {type:"box", layout:"horizontal", contents:[
          {type:"text",
            text:(isUrgent?"🚨 ":"👤 ") + cust,
            size:"sm", weight:"bold", color:custColor, flex:5, wrap:true},
          time ? {type:"text", text:"⏰ "+time, size:"xs", color:"#888888", flex:3, align:"end"} : {type:"filler"}
        ]},
        // Order ID เล็กๆ
        {type:"text", text:"🆔 "+oid, size:"xxs", color:"#AAAAAA", margin:"xs"},
        // รายการ
        itemsText ? {type:"text", text:"🍰 "+itemsText, size:"xs", color:"#555555", margin:"xs", wrap:true} : null,
        // สรุป + ปุ่ม
        {type:"box", layout:"horizontal", margin:"sm", contents:[
          {type:"text", text:"📦 รวม "+totalQty+" ชิ้น",
            size:"xs", color:isUrgent?"#D32F2F":"#666666", flex:3, weight:"bold"},
          {type:"button", flex:3, height:"sm",
            style:isUrgent?"primary":"secondary",
            color:isUrgent?"#4CAF50":undefined,
            action:{type:"message", label:toggleLabel, text:toggleCmd}}
        ]},
        // [v3.6.3] ปุ่มหลัก ส่งแล้ว (เด่นสุด)
        {type:"button", margin:"xs", height:"sm", style:"primary", color:"#4CAF50",
          action:{type:"message", label:"✅ ส่งแล้ว", text:"delivery "+oid+" ส่งแล้ว"}},
        // แถวรอง: ดูรายละเอียด + เพิ่มเมนู
        {type:"box", layout:"horizontal", margin:"xs", spacing:"sm", contents:[
          {type:"button", flex:1, height:"sm", style:"secondary",
            action:{type:"message", label:"🔍 ดูรายละเอียด", text:"search order "+oid}},
          {type:"button", flex:1, height:"sm", style:"secondary",
            action:{type:"message", label:"➕ เพิ่มเมนู", text:"เพิ่มเมนู "+oid}}
        ]}
      ].filter(Boolean)
    };
  });

  if (orders.length > MAX_ORDERS) {
    orderBoxes.push({type:"text",
      text:"+ อีก "+(orders.length-MAX_ORDERS)+" ออเดอร์ — ลด limit หรือดู search date",
      size:"xs", color:"#888888", align:"center", margin:"sm"});
  }

  // นับ urgent
  var urgentCount = orders.filter(function(o){ return isNoteUrgent_(o.rows[0].note); }).length;
  var headerColor = urgentCount > 0 ? "#D32F2F" : "#1565C0";

  return {type:"flex", altText:"🧁 แผนผลิต "+dateKey+(urgentCount?" (มี "+urgentCount+" ด่วน)":""),
    contents:{type:"bubble", size:"giga",
      header:{type:"box", layout:"vertical", backgroundColor:headerColor, paddingAll:"16px", contents:[
        {type:"text", text: urgentCount>0 ? ("🚨 "+urgentCount+" ออเดอร์ด่วน") : "🧁 แผนผลิตรายออเดอร์",
          size:"xs", color:"#FFE0E0", weight:"bold"},
        {type:"text", text:(dayLabel||dateKey), size:"xl", color:"#FFFFFF", weight:"bold"},
        {type:"text", text:orders.length+" ออเดอร์ • กดปุ่ม 🚨 เพื่อตั้งด่วน",
          size:"xs", color:"#FFD0D0", margin:"xs"}
      ]},
      body:{type:"box", layout:"vertical", paddingAll:"12px", spacing:"none", contents:orderBoxes},
      footer:{type:"box", layout:"horizontal", paddingAll:"10px", spacing:"sm", contents:[
        {type:"button", flex:1, height:"sm", style:"primary", color:"#1565C0",
          action:{type:"message", label:"🔄 refresh", text:"plan "+dateKey}},
        {type:"button", flex:1, height:"sm", style:"secondary",
          action:{type:"message", label:"plan 7", text:"plan 7"}}
      ]}
    }};
}

// summary 7 แบบ text แยกร้าน + ยอดเงิน
function buildSummary7TextByShop_() {
  var dates = getNextActiveDates_(7);
  if (!dates || !dates.length) return "📊 สรุป 7 วัน\n\nยังไม่มีออเดอร์ล่วงหน้าค่ะ";

  var dayNames = ["อา","จ","อ","พ","พฤ","ศ","ส"];
  var out = ["📊 สรุป 7 วัน (แยกร้าน)\n"];
  var grand7 = 0, orders7 = 0;

  dates.forEach(function(dateKey) {
    var rows = getRowsByDeliveryDateFast_(dateKey).filter(function(r){ return !isRowCancelled(r); });
    if (!rows.length) return;
    var orders = groupRowsByOrder(rows);
    var dObj = thDateToDate(dateKey);
    var dayLabel = dObj ? dayNames[dObj.getDay()] : "";

    var dayTotal = 0;
    var shops = orders.map(function(order) {
      var main = order.rows.find(function(r){ return toNumber(r.grandTotal)>0; }) || order.rows[0] || {};
      var cust = String(main.customerName||main.tableName||main.location||"ไม่ระบุ").trim();
      var time = main.deliveryTime || "";
      var urgent = isNoteUrgent_(main.note);
      var baht = toNumber(main.grandTotal);
      dayTotal += baht;
      var pay = String(main.paymentStatus||"");
      var payIcon = /paid|จ่าย|ชำระ/i.test(pay) ? " ✅" : /pending/i.test(pay) ? " 💳" : "";
      var agg = {};
      order.rows.forEach(function(r){
        if (!r.menuName) return;
        var unit=r.unit||"ชิ้น", k=r.menuName+"|||"+unit;
        if (!agg[k]) agg[k]={menuName:r.menuName,unit:unit,qty:0};
        agg[k].qty += toNumber(r.qty);
      });
      var items = objectEntries_(agg).map(function(e){return e[1];}).sort(function(a,b){return b.qty-a.qty;});
      return {cust:cust, time:time, urgent:urgent, baht:baht, payIcon:payIcon, items:items};
    });
    shops.sort(function(a,b){
      if (a.urgent!==b.urgent) return a.urgent?-1:1;
      return String(a.time||"99:99").localeCompare(String(b.time||"99:99"));
    });

    grand7 += dayTotal; orders7 += orders.length;
    out.push("━━━━━━━━━━━━━━━");
    out.push("📅 "+dayLabel+" "+dateKey+" | "+shops.length+" ร้าน | "+dayTotal.toLocaleString()+"฿");
    shops.forEach(function(s){
      out.push("👤 "+s.cust+(s.time?" ("+s.time+")":"")+(s.urgent?" 🚨":"")+" — "+s.baht.toLocaleString()+"฿"+s.payIcon);
      s.items.forEach(function(it){ out.push("   - "+it.menuName+" "+it.qty+" "+it.unit); });
    });
    out.push("");
  });

  out.push("━━━━━━━━━━━━━━━");
  out.push("💰 รวม 7 วัน: "+orders7+" ออเดอร์ | "+grand7.toLocaleString()+" บาท");
  out.push("(✅=จ่ายแล้ว 💳=ค้างชำระ)");

  var msg = out.join("\n");
  if (msg.length > 4500) msg = msg.substring(0,4470)+"\n... (ยาวเกิน — ดูเจาะวันด้วย summary DD/MM)";
  return msg;
}

function buildSummary7DaysFlex() {
  var summary = getSummary7DaysDataCached_();
  var dayData  = summary.dayData||[];
  if (summary.totalOrders7===0)
    return {type:"flex",altText:"📅 ไม่มีออเดอร์ล่วงหน้า",contents:buildAlertFlex("📅 ไม่มีออเดอร์ล่วงหน้า","ลองใช้ summary month [MM/พ.ศ.]","#AAAAAA")};

  var topMenus = objectEntries_(summary.allMenuQty).sort(function(a,b){return b[1]-a[1];}).slice(0,5);
  var overviewBubble = {type:"bubble",size:"kilo",
    header:{type:"box",layout:"vertical",backgroundColor:"#1565C0",paddingAll:"16px",contents:[
      {type:"text",text:"📅 แผนการผลิต 7 ช่วงถัดไป",size:"xs",color:"#BBDEFB",weight:"bold"},
      {type:"text",text:"summary 7",size:"xl",color:"#FFFFFF",weight:"bold"},
      {type:"text",text:"เริ่มจาก "+(summary.basedOn||summary.today),size:"xs",color:"#90CAF9",margin:"xs"}
    ]},
    body:{type:"box",layout:"vertical",paddingAll:"16px",spacing:"md",contents:[
      {type:"box",layout:"horizontal",spacing:"sm",contents:[
        buildStatBox("🧾",String(summary.totalOrders7),"ออเดอร์","#E3F2FD"),
        buildStatBox("📦",String(summary.totalQty7),"ชิ้น","#E8F5E9"),
        buildStatBox("💰",summary.totalBaht7>=1000?(summary.totalBaht7/1000).toFixed(1)+"K":String(summary.totalBaht7),"บาท","#FFF3E0")
      ]},
      {type:"separator"},
      {type:"text",text:"🏭 เมนูที่ต้องผลิต",size:"sm",weight:"bold",color:"#1565C0"}
    ].concat(topMenus.map(function(e){ return {type:"box",layout:"horizontal",contents:[
      {type:"text",text:"• "+e[0],size:"sm",color:"#555555",flex:4,wrap:true},
      {type:"text",text:e[1]+" ชิ้น",size:"sm",color:"#1565C0",flex:2,align:"end",weight:"bold"}
    ]}; })).concat([
      {type:"separator"},{type:"text",text:"📅 วันที่มีออเดอร์",size:"sm",weight:"bold",color:"#555555"}
    ]).concat(dayData.map(function(d){ return {type:"box",layout:"horizontal",margin:"xs",backgroundColor:"#F3F8FF",paddingAll:"8px",cornerRadius:"6px",contents:[
      {type:"box",layout:"vertical",flex:2,contents:[
        {type:"text",text:d.label,size:"xs",weight:"bold",color:"#1565C0"},
        {type:"text",text:d.date,size:"xxs",color:"#AAAAAA"}
      ]},
      {type:"box",layout:"vertical",flex:3,contents:[
        {type:"text",text:d.orders+" ออเดอร์ / "+d.totalQty+" ชิ้น",size:"xs",color:"#333333"},
        {type:"text",text:d.grandTotal.toLocaleString()+" บาท",size:"xs",color:"#4CAF50",weight:"bold"}
      ]}
    ]}; }))}
  };

  var dayBubbles = dayData.slice(0,2).map(function(d,idx) {
    var menuRows = objectEntries_(d.menuQty).sort(function(a,b){return b[1]-a[1];}).slice(0,4).map(function(e){
      return {type:"box",layout:"horizontal",contents:[
        {type:"text",text:"• "+e[0],size:"sm",color:"#555555",flex:4,wrap:true},
        {type:"text",text:e[1]+" ชิ้น",size:"sm",color:"#FF6B6B",flex:2,align:"end",weight:"bold"}
      ]};
    });
    var deliveryRows = (d.deliveries||[]).slice(0,3).map(function(del){
      return {type:"box",layout:"vertical",margin:"sm",paddingAll:"8px",backgroundColor:"#F9F9F9",cornerRadius:"6px",contents:[
        {type:"box",layout:"horizontal",contents:[
          {type:"text",text:"👤 "+del.customer,size:"sm",weight:"bold",color:"#333333",flex:3,wrap:true},
          del.time ? {type:"text",text:"⏰ "+del.time,size:"xs",color:"#888888",flex:2,align:"end"} : {type:"filler"}
        ]},
        del.items ? {type:"text",text:"🍰 "+del.items,size:"xs",color:"#555555",margin:"xs",wrap:true} : null,
        del.total>0 ? {type:"text",text:"💰 "+del.total.toLocaleString()+" บาท",size:"xs",color:"#4CAF50",margin:"xs",weight:"bold"} : null
      ].filter(Boolean)};
    });
    return {type:"bubble",size:"kilo",
      header:{type:"box",layout:"vertical",backgroundColor:idx===0?"#FF6B6B":"#4CAF50",paddingAll:"16px",contents:[
        {type:"text",text:d.label,size:"xs",color:"rgba(255,255,255,0.8)",weight:"bold"},
        {type:"text",text:d.date,size:"xl",color:"#FFFFFF",weight:"bold"},
        {type:"text",text:d.orders+" ออเดอร์ / "+d.totalQty+" ชิ้น",size:"xs",color:"rgba(255,255,255,0.85)",margin:"xs"}
      ]},
      body:{type:"box",layout:"vertical",paddingAll:"16px",spacing:"sm",contents:[
        {type:"text",text:"🏭 ต้องผลิต",size:"sm",weight:"bold",color:"#333333"}
      ].concat(menuRows).concat([
        {type:"separator",margin:"md"},
        {type:"text",text:"📦 รายชื่อลูกค้า",size:"sm",weight:"bold",color:"#333333",margin:"sm"}
      ]).concat(deliveryRows)}
    };
  });

  var contents = [overviewBubble].concat(dayBubbles);
  if (contents.length===1) return {type:"flex",altText:"📅 แผนการผลิต 7 ช่วงถัดไป",contents:overviewBubble};
  return {type:"flex",altText:"📅 แผนการผลิต 7 ช่วงถัดไป | "+summary.totalOrders7+" ออเดอร์",contents:{type:"carousel",contents:contents}};
}

function buildSummaryMonthFlex(targetMonth) {
  var cleaned = normalizeMonthInput(targetMonth);
  var parts   = cleaned.split("/");
  if (parts.length < 2) return {type:"flex",altText:"❌ รูปแบบเดือนไม่ถูกต้อง",contents:buildAlertFlex("❌ รูปแบบไม่ถูกต้อง","ใช้ MM/พ.ศ. เช่น 04/2569","#F44336")};
  var mm = parts[0].padStart(2,"0"), yyyy = parts[1];
  var analytics = getMonthAnalyticsCached_(mm+"/"+yyyy);
  if (!analytics.rowCount) return {type:"flex",altText:"📊 ไม่มีออเดอร์เดือน "+cleaned,contents:buildAlertFlex("📊 ไม่มีออเดอร์","เดือน "+cleaned,"#AAAAAA")};

  var avgPerDay   = analytics.activeDays>0 ? Math.round(analytics.grandTotal/analytics.activeDays) : 0;
  var avgPerOrder = analytics.orderCount>0 ? Math.round(analytics.grandTotal/analytics.orderCount) : 0;
  var top5     = objectEntries_(analytics.menuQty).sort(function(a,b){return b[1]-a[1];}).slice(0,5);
  var topDates = objectEntries_(analytics.topDates).sort(function(a,b){return deliveryDateSortKey(a[0])-deliveryDateSortKey(b[0]);}).slice(0,4);
  var previewRows = (analytics.recentOrdersLite||[]).slice(0,3).map(function(o,idx){
    var passed = o.passed;
    return {type:"box",layout:"horizontal",margin:"sm",paddingAll:"10px",
      backgroundColor:passed?"#FAFAFA":"#F6F1FF",cornerRadius:"8px",
      contents:[
        {type:"text",text:(idx+1)+". "+o.customerName,size:"sm",color:passed?"#9E9E9E":"#333333",flex:4,wrap:true},
        {type:"text",text:(o.deliveryDate||"-")+(o.deliveryTime?" "+o.deliveryTime:""),size:"xs",color:passed?"#BDBDBD":"#7C4DFF",flex:3,align:"center",wrap:true},
        {type:"text",text:toNumber(o.grandTotal).toLocaleString()+"฿",size:"sm",color:passed?"#9E9E9E":"#4527A0",flex:2,align:"end",weight:"bold"}
      ]};
  });

  return {
    type: "flex",
    altText: "📊 เดือน " + cleaned + " | " + analytics.orderCount + " ออเดอร์ | " + analytics.grandTotal.toLocaleString() + " บาท",
    contents: {
      type: "bubble",
      size: "kilo",
      header: {
        type: "box", layout: "vertical", backgroundColor: "#7C4DFF", paddingAll: "16px",
        contents: [
          { type: "text", text: "📊 สรุปเดือน", size: "xs", color: "#E8D5FF", weight: "bold" },
          { type: "text", text: cleaned, size: "xxl", color: "#FFFFFF", weight: "bold" }
        ]
      },
      body: {
        type: "box", layout: "vertical", paddingAll: "16px", spacing: "md",
        contents: [
          { type: "box", layout: "horizontal", spacing: "sm", contents: [
            buildStatBox("🧾", String(analytics.orderCount), "ออเดอร์", "#EDE7F6"),
            buildStatBox("📅", String(analytics.activeDays), "วัน", "#E3F2FD"),
            buildStatBox("📦", String(analytics.totalQty), "ชิ้น", "#FFF8E1")
          ]},
          { type: "box", layout: "vertical", backgroundColor: "#EDE7F6", paddingAll: "12px", cornerRadius: "10px",
            contents: [
              { type: "text", text: "💰 ยอดรวมเดือน", size: "sm", color: "#7C4DFF", weight: "bold" },
              { type: "text", text: analytics.grandTotal.toLocaleString() + " บาท", size: "xxl", weight: "bold", color: "#4527A0" },
              { type: "text", text: "📈 เฉลี่ย/วัน: " + avgPerDay.toLocaleString() + " บาท", size: "xs", color: "#9E9E9E", margin: "xs" },
              { type: "text", text: "🧾 เฉลี่ย/ออเดอร์: " + avgPerOrder.toLocaleString() + " บาท", size: "xs", color: "#9E9E9E", margin: "xs" }
            ]
          },
          { type: "separator" },
          { type: "text", text: "🍰 Top 5 เมนู", size: "sm", weight: "bold", color: "#555555" }
        ]
        .concat(top5.map(function(e, i) {
          return { type: "box", layout: "horizontal", contents: [
            { type: "text", text: (i+1)+". "+e[0], size: "sm", color: "#555555", flex: 4, wrap: true },
            { type: "text", text: e[1]+" ชิ้น", size: "sm", color: "#7C4DFF", flex: 2, align: "end", weight: "bold" }
          ]};
        }))
        .concat([
          { type: "separator", margin: "md" },
          { type: "text", text: "📅 วันที่มีงานในเดือน", size: "sm", weight: "bold", color: "#555555" }
        ])
        .concat(topDates.map(function(e) {
          return { type: "box", layout: "horizontal", contents: [
            { type: "text", text: e[0], size: "sm", color: "#555555", flex: 3 },
            { type: "text", text: e[1]+" ชิ้น", size: "sm", color: "#7C4DFF", flex: 2, align: "end", weight: "bold" }
          ]};
        }))
        .concat(previewRows.length ? [
          { type: "separator", margin: "md" },
          { type: "text", text: "🧾 ตัวอย่างออเดอร์", size: "sm", weight: "bold", color: "#555555" }
        ].concat(previewRows) : [])
      }
    }
  };
}

function buildSummaryChannelFlex(targetMonth) {
  var cleaned = normalizeMonthInput(targetMonth);
  var parts   = cleaned.split("/");
  var analytics = getMonthAnalyticsCached_(parts[0].padStart(2,"0")+"/"+parts[1]);
  if (!analytics.rowCount) return {type:"flex",altText:"📊 ไม่มีออเดอร์เดือน "+cleaned,contents:buildAlertFlex("📊 ไม่มีออเดอร์","เดือน "+cleaned,"#AAAAAA")};
  var CHANNEL_COLORS = ["#2196F3","#FF5722","#4CAF50","#FF9800","#9C27B0","#00BCD4"];
  var sorted   = objectEntries_(analytics.channelData).sort(function(a,b){return b[1].total-a[1].total;}).slice(0,SUMMARY_CHANNEL_LIMIT);
  var grandAll = Object.keys(analytics.channelData).reduce(function(s,k){return s+analytics.channelData[k].total;},0);
  return {type:"flex",altText:"📡 Channel เดือน "+cleaned,contents:{type:"bubble",size:"kilo",
    header:{type:"box",layout:"vertical",backgroundColor:"#FF5722",paddingAll:"16px",contents:[
      {type:"text",text:"📡 Channel",size:"xs",color:"#FFE0D0",weight:"bold"},
      {type:"text",text:cleaned,size:"xxl",color:"#FFFFFF",weight:"bold"},
      {type:"text",text:"รวม "+analytics.orderCount+" ออเดอร์",size:"xs",color:"#FFD0C0",margin:"xs"}
    ]},
    body:{type:"box",layout:"vertical",paddingAll:"16px",spacing:"sm",contents:[
      {type:"text",text:"📊 ยอดแยกตาม Channel",size:"sm",weight:"bold",color:"#555555",margin:"md"}
    ].concat(sorted.map(function(e,i){
      var ch=e[0],d=e[1],pct=grandAll>0?Math.round(d.total/grandAll*100):0,color=CHANNEL_COLORS[i%CHANNEL_COLORS.length];
      return {type:"box",layout:"vertical",margin:"sm",paddingAll:"10px",backgroundColor:"#FAFAFA",cornerRadius:"8px",contents:[
        {type:"box",layout:"horizontal",contents:[{type:"text",text:"📡 "+ch,size:"sm",weight:"bold",color:color,flex:3},{type:"text",text:pct+"%",size:"sm",weight:"bold",color:color,flex:1,align:"end"}]},
        {type:"box",layout:"horizontal",margin:"xs",contents:[{type:"text",text:d.count+" ออเดอร์",size:"xs",color:"#888888",flex:2},{type:"text",text:d.total.toLocaleString()+" บาท",size:"xs",color:"#555555",flex:3,align:"end",weight:"bold"}]}
      ]};
    })).concat([
      {type:"separator",margin:"md"},
      {type:"box",layout:"horizontal",margin:"md",contents:[
        {type:"text",text:"💰 รวมทั้งสิ้น",size:"md",weight:"bold",color:"#333333",flex:3},
        {type:"text",text:grandAll.toLocaleString()+" บาท",size:"md",weight:"bold",color:"#FF5722",flex:3,align:"end"}
      ]}
    ])}
  }};
}

function buildSummaryTopMenuFlex(targetMonth) {
  var cleaned = normalizeMonthInput(targetMonth);
  var parts   = cleaned.split("/");
  var analytics = getMonthAnalyticsCached_(parts[0].padStart(2,"0")+"/"+parts[1]);
  if (!analytics.rowCount) return {type:"flex",altText:"📊 ไม่มีออเดอร์เดือน "+cleaned,contents:buildAlertFlex("📊 ไม่มีออเดอร์","เดือน "+cleaned,"#AAAAAA")};
  var topN   = objectEntries_(analytics.menuQty).sort(function(a,b){return b[1]-a[1];}).slice(0,SUMMARY_TOP_MENU_LIMIT);
  var maxQty = topN[0]?topN[0][1]:1;
  var MEDAL=["🥇","🥈","🥉"], BAR_COLORS=["#FFD700","#C0C0C0","#CD7F32","#FF6B6B","#FF9500","#4CAF50","#2196F3","#9C27B0"];
  return {type:"flex",altText:"🍰 Top Menu เดือน "+cleaned,contents:{type:"bubble",size:"kilo",
    header:{type:"box",layout:"vertical",backgroundColor:"#FF9500",paddingAll:"16px",contents:[
      {type:"text",text:"🍰 Top Menu",size:"xs",color:"#FFF3E0",weight:"bold"},
      {type:"text",text:cleaned,size:"xxl",color:"#FFFFFF",weight:"bold"},
      {type:"text",text:"จาก "+analytics.orderCount+" ออเดอร์",size:"xs",color:"#FFE082",margin:"xs"}
    ]},
    body:{type:"box",layout:"vertical",paddingAll:"16px",spacing:"md",contents:topN.map(function(e,i){
      var barFlex=Math.max(1,Math.round(e[1]/maxQty*10)),color=BAR_COLORS[i%BAR_COLORS.length];
      return {type:"box",layout:"vertical",margin:"sm",contents:[
        {type:"box",layout:"horizontal",contents:[
          {type:"text",text:(MEDAL[i]||(i+1)+".") +" "+e[0],size:"sm",weight:i<3?"bold":"regular",color:i<3?"#333333":"#555555",flex:5,wrap:true},
          {type:"text",text:e[1]+" ชิ้น",size:"sm",color:color,flex:2,align:"end",weight:"bold"}
        ]},
        {type:"box",layout:"horizontal",height:"8px",margin:"xs",backgroundColor:"#F5F5F5",cornerRadius:"4px",contents:[
          {type:"box",layout:"vertical",flex:barFlex,backgroundColor:color,cornerRadius:"4px",contents:[{type:"filler"}]},
          barFlex<10?{type:"filler"}:null
        ].filter(Boolean)}
      ]};
    })}
  }};
}

function buildSummaryTopMenuRevFlex(targetMonth) {
  var cleaned   = normalizeMonthInput(targetMonth);
  var parts     = cleaned.split("/");
  var analytics = getMonthAnalyticsCached_(parts[0].padStart(2,"0")+"/"+parts[1]);
  if (!analytics.rowCount) return {type:"flex",altText:"📊 ไม่มีออเดอร์เดือน "+cleaned,contents:buildAlertFlex("📊 ไม่มีออเดอร์","เดือน "+cleaned,"#AAAAAA")};
  var topQty    = objectEntries_(analytics.menuQty).sort(function(a,b){return b[1]-a[1];}).slice(0,8);
  var topRev    = objectEntries_(analytics.menuRevenue||{}).sort(function(a,b){return b[1]-a[1];}).slice(0,8);
  var maxQty    = topQty[0]?topQty[0][1]:1;
  var maxRev    = topRev[0]?topRev[0][1]:1;
  var MEDAL=["🥇","🥈","🥉"], BAR_COLORS=["#FFD700","#C0C0C0","#CD7F32","#FF6B6B","#FF9500","#4CAF50","#2196F3","#9C27B0"];
  function makeBar(entries, maxVal, colors, unit) {
    return entries.map(function(e,i){
      var barFlex=Math.max(1,Math.round(e[1]/maxVal*10)),color=colors[i%colors.length];
      return {type:"box",layout:"vertical",margin:"sm",contents:[
        {type:"box",layout:"horizontal",contents:[
          {type:"text",text:(MEDAL[i]||(i+1)+".") +" "+e[0],size:"sm",weight:i<3?"bold":"regular",color:i<3?"#333333":"#555555",flex:5,wrap:true},
          {type:"text",text:(unit==="฿"?e[1].toLocaleString():e[1])+unit,size:"sm",color:color,flex:2,align:"end",weight:"bold"}
        ]},
        {type:"box",layout:"horizontal",height:"8px",margin:"xs",backgroundColor:"#F5F5F5",cornerRadius:"4px",contents:[
          {type:"box",layout:"vertical",flex:barFlex,backgroundColor:color,cornerRadius:"4px",contents:[{type:"filler"}]},
          barFlex<10?{type:"filler"}:null
        ].filter(Boolean)}
      ]};
    });
  }
  return {type:"flex",altText:"🍰 Top Menu Rev "+cleaned,contents:{type:"carousel",contents:[
    {type:"bubble",size:"kilo",
      header:{type:"box",layout:"vertical",backgroundColor:"#FF9500",paddingAll:"16px",contents:[
        {type:"text",text:"🍰 Top Menu — จำนวน",size:"xs",color:"#FFF3E0",weight:"bold"},
        {type:"text",text:cleaned,size:"xxl",color:"#FFFFFF",weight:"bold"}
      ]},
      body:{type:"box",layout:"vertical",paddingAll:"16px",spacing:"md",contents:makeBar(topQty,maxQty,BAR_COLORS," ชิ้น")}},
    {type:"bubble",size:"kilo",
      header:{type:"box",layout:"vertical",backgroundColor:"#7C4DFF",paddingAll:"16px",contents:[
        {type:"text",text:"💰 Top Menu — รายได้",size:"xs",color:"#E8D5FF",weight:"bold"},
        {type:"text",text:cleaned,size:"xxl",color:"#FFFFFF",weight:"bold"}
      ]},
      body:{type:"box",layout:"vertical",paddingAll:"16px",spacing:"md",contents:makeBar(topRev,maxRev,["#7C4DFF","#9C27B0","#673AB7","#512DA8","#4527A0","#311B92","#B39DDB","#D1C4E9"],"฿")}}
  ]}};
}

function buildErrorFlex(errors) {
  var today = getTodayTH();
  return {type:"flex",altText:"❌ ข้อมูลไม่ครบ: "+errors.join(", "),
    contents:{type:"bubble",size:"kilo",
      header:{type:"box",layout:"vertical",backgroundColor:"#F44336",paddingAll:"16px",contents:[
        {type:"text",text:"❌ ข้อมูลไม่ครบ",size:"lg",color:"#FFFFFF",weight:"bold"},
        {type:"text",text:"กรุณาตรวจสอบฟิลด์ต่อไปนี้",size:"xs",color:"#FFCDD2",margin:"xs"}
      ]},
      body:{type:"box",layout:"vertical",paddingAll:"16px",spacing:"sm",contents:errors.map(function(e){
        return {type:"box",layout:"horizontal",contents:[{type:"text",text:"⚠️",size:"sm",flex:1},{type:"text",text:e,size:"sm",color:"#D32F2F",flex:5,weight:"bold"}]};
      }).concat([
        {type:"separator",margin:"md"},
        {type:"text",text:"📌 ตัวอย่างฟอร์ม (กรอกแค่ 5 บรรทัดนี้พอค่ะ)",size:"sm",weight:"bold",color:"#555555",margin:"md",wrap:true},
        {type:"box",layout:"vertical",backgroundColor:"#FFF8F8",paddingAll:"10px",cornerRadius:"8px",margin:"sm",contents:[
          {type:"text",text:"วันที่: "+today,size:"xs",color:"#555555"},
          {type:"text",text:"ชื่อคนรับ: คุณมิว",size:"xs",color:"#555555"},
          {type:"text",text:"เบอร์: 097-1234567",size:"xs",color:"#555555"},
          {type:"text",text:"ที่อยู่: 99/9 ถ.พหลโยธิน กทม.",size:"xs",color:"#555555",wrap:true},
          {type:"text",text:"รายการ:",size:"xs",color:"#555555"},
          {type:"text",text:"- มะพร้าวอ่อนครีมสด 1 ชิ้น 129฿",size:"xs",color:"#555555",wrap:true},
          {type:"text",text:"- ช็อกโกแลตครีมสด 1 ชิ้น 129฿",size:"xs",color:"#555555",wrap:true},
          {type:"text",text:"รวม: 258฿",size:"xs",color:"#D32F2F",weight:"bold"}
        ]}
      ])}
    }
  };
}

function buildNotFoundFlex() {
  return {type:"flex",altText:"❓ ไม่พบข้อมูล — พิมพ์ help",
    contents:{type:"bubble",size:"kilo",
      header:{type:"box",layout:"vertical",backgroundColor:"#607D8B",paddingAll:"16px",contents:[
        {type:"text",text:"❓ ไม่พบข้อมูลที่บันทึกได้",size:"md",color:"#FFFFFF",weight:"bold"}
      ]},
      body:{type:"box",layout:"vertical",paddingAll:"16px",spacing:"sm",contents:[
        {type:"text",text:"📌 ตัวอย่างบันทึกออเดอร์ (กรอกง่ายๆ 5 บรรทัด)",size:"sm",weight:"bold",color:"#555555",wrap:true},
        {type:"box",layout:"vertical",backgroundColor:"#F5F5F5",paddingAll:"10px",cornerRadius:"8px",margin:"sm",contents:[
          {type:"text",text:"วันที่: "+getTodayTH(),size:"xs",color:"#555555"},
          {type:"text",text:"ชื่อคนรับ: คุณมิว",size:"xs",color:"#555555"},
          {type:"text",text:"เบอร์: 097-1234567",size:"xs",color:"#555555"},
          {type:"text",text:"ที่อยู่: 99/9 ถ.พหลโยธิน กทม.",size:"xs",color:"#555555",wrap:true},
          {type:"text",text:"รายการ:",size:"xs",color:"#555555"},
          {type:"text",text:"- มะพร้าวอ่อนครีมสด 1 ชิ้น 129฿",size:"xs",color:"#555555",wrap:true},
          {type:"text",text:"- ช็อกโกแลตครีมสด 1 ชิ้น 129฿",size:"xs",color:"#555555",wrap:true},
          {type:"text",text:"รวม: 258฿",size:"xs",color:"#333333",weight:"bold"}
        ]},
        {type:"separator",margin:"md"},
        {type:"text",text:"💡 คำสั่งลัด",size:"sm",weight:"bold",color:"#555555",margin:"md"}
      ].concat(["search today","summary","summary 7","summary pending","plan 7","help"].map(function(t){
        return {type:"text",text:t,size:"xs",color:"#888888"};
      }))}
    }
  };
}

function buildPendingPaymentFlex() {
  var rows = getOrderRows(function(r) {
    return String(r.paymentStatus||"").trim().toLowerCase() === "pending" && normalizeStatus(r.status||"") !== "❌ ยกเลิก";
  }, 200);
  if (!rows.length) return {type:"flex",altText:"✅ ไม่มียอดค้างชำระ",contents:buildAlertFlex("✅ ไม่มียอดค้างชำระ","ทุกออเดอร์ชำระแล้วค่ะ","#4CAF50")};
  var orders = groupRowsByOrder(rows);
  var totalPending = 0;
  orders.forEach(function(o) {
    var main = o.rows.find(function(r){ return toNumber(r.grandTotal)>0; }) || o.rows[0];
    totalPending += toNumber(main.grandTotal);
  });
  var summaryBubble = {type:"bubble",size:"kilo",
    header:{type:"box",layout:"vertical",backgroundColor:"#F44336",paddingAll:"16px",contents:[
      {type:"text",text:"💳 ยอดค้างชำระ",size:"xs",color:"#FFCDD2",weight:"bold"},
      {type:"text",text:orders.length+" ออเดอร์",size:"xxl",color:"#FFFFFF",weight:"bold"},
      {type:"text",text:"รวม "+totalPending.toLocaleString()+" บาท",size:"sm",color:"#FFCDD2",margin:"xs"}
    ]},
    body:{type:"box",layout:"vertical",paddingAll:"16px",spacing:"sm",contents:[
      buildStatBox("💰",totalPending.toLocaleString(),"บาทค้างชำระ","#FFEBEE"),
      {type:"separator",margin:"md"},
      {type:"text",text:"📋 รายการค้างชำระ",size:"sm",weight:"bold",color:"#555555",margin:"md"}
    ].concat(orders.slice(0,8).map(function(o) {
      var main = o.rows.find(function(r){ return toNumber(r.grandTotal)>0; }) || o.rows[0];
      return {type:"box",layout:"vertical",margin:"sm",paddingAll:"10px",backgroundColor:"#FFF5F5",cornerRadius:"8px",contents:[
        {type:"box",layout:"horizontal",contents:[
          {type:"text",text:main.customerName||"-",size:"sm",weight:"bold",color:"#333333",flex:3,wrap:true},
          {type:"text",text:toNumber(main.grandTotal).toLocaleString()+"฿",size:"sm",color:"#F44336",flex:2,align:"end",weight:"bold"}
        ]},
        {type:"box",layout:"horizontal",margin:"xs",contents:[
          {type:"text",text:"📅 "+main.deliveryDate,size:"xs",color:"#888888",flex:2}, // 
          {type:"text",text:"📡 "+normalizeChannel(main.channel),size:"xs",color:"#888888",flex:2,align:"end"}
        ]},
        {type:"text",text:"Order ID: "+o.orderId,size:"xxs",color:"#BBBBBB",margin:"xs"}
      ]};
    })).concat([
      {type:"separator",margin:"md"},
      {type:"box",layout:"horizontal",backgroundColor:"#FFEBEE",paddingAll:"12px",cornerRadius:"8px",contents:[
        {type:"text",text:"💰 รวมค้างชำระ",size:"md",weight:"bold",color:"#B71C1C",flex:3},
        {type:"text",text:totalPending.toLocaleString()+" บาท",size:"md",weight:"bold",color:"#F44336",flex:3,align:"end"}
      ]}
    ])}
  };
  return {type:"flex",altText:"💳 ยอดค้างชำระ "+orders.length+" ออเดอร์ | "+totalPending.toLocaleString()+" บาท",
    contents:{type:"carousel",contents:[summaryBubble].concat(orders.slice(0,5).map(function(o){ return buildOrderCardFlex(o.orderId,o.rows); }))}};
}

// Summary Hub — พิมพ์ "สรุป" → flex ปุ่มเลือกแทนจำ syntax
function buildSummaryHubFlex_() {
  function btn(label, cmd, color) {
    return {type:"button", style:"primary", color:color, height:"sm", margin:"sm",
      action:{type:"message", label:label, text:cmd}};
  }
  return {type:"flex", altText:"📊 เลือกสรุปที่ต้องการ",
    contents:{type:"bubble", size:"mega",
      header:{type:"box", layout:"vertical", backgroundColor:"#4CAF50", paddingAll:"16px", contents:[
        {type:"text", text:"📊 สรุปยอด", size:"lg", color:"#FFFFFF", weight:"bold"},
        {type:"text", text:"แตะเลือกแบบที่ต้องการดูค่ะ", size:"xs", color:"#E8F5E9", margin:"xs"}
      ]},
      body:{type:"box", layout:"vertical", paddingAll:"12px", spacing:"none", contents:[
        {type:"text", text:"⏱️ ตามช่วงเวลา", size:"xs", color:"#888888", weight:"bold"},
        {type:"box", layout:"horizontal", spacing:"sm", margin:"xs", contents:[
          btn("📅 วันนี้", "summary", "#4CAF50"),
          btn("📆 พรุ่งนี้", "summary พรุ่งนี้", "#4CAF50")
        ]},
        {type:"box", layout:"horizontal", spacing:"sm", contents:[
          btn("🗓️ 7 วัน", "summary 7", "#4CAF50"),
          btn("📊 เดือนนี้", "summary month", "#4CAF50")
        ]},
        {type:"separator", margin:"md"},
        {type:"text", text:"🏆 วิเคราะห์", size:"xs", color:"#888888", weight:"bold", margin:"md"},
        {type:"box", layout:"horizontal", spacing:"sm", margin:"xs", contents:[
          btn("🍰 เมนูฮิต", "summary top menu", "#7C4DFF"),
          btn("💰 เมนูทำเงิน", "summary top menu rev", "#7C4DFF")
        ]},
        {type:"box", layout:"horizontal", spacing:"sm", contents:[
          btn("📡 ช่องทาง", "summary channel", "#7C4DFF"),
          btn("💳 ค้างชำระ", "summary pending", "#F44336")
        ]},
        {type:"separator", margin:"md"},
        {type:"text", text:"🧁 ผลิต/ส่ง", size:"xs", color:"#888888", weight:"bold", margin:"md"},
        {type:"box", layout:"horizontal", spacing:"sm", margin:"xs", contents:[
          btn("🧁 แผนผลิต 7 วัน", "plan 7", "#1565C0"),
          btn("🚨 ออเดอร์ด่วน", "summary urgent", "#D32F2F")
        ]}
      ]}
    }};
}

function buildHelpFlex() {
  var sections = [
    {label:"🚗 ส่งวันนี้ (NEW)",color:"#FF6B35",cmds:["ส่งวันนี้  → เฉพาะที่ยังต้องส่ง (ซ่อนที่ส่งแล้ว)","ส่งวันนี้ทั้งหมด  → รวมที่ส่งแล้ว","พิมพ์ชื่อลูกค้า เช่น \"ข้าวฟ่าง\"  → ดึงออเดอร์เจ้านั้น"]},
    {label:"🔍 SEARCH",color:"#2196F3",cmds:["search today","search latest","search [ชื่อลูกค้า]","search order [ID]","search phone [เบอร์]","search menu [ชื่อเมนู]","search date [dd/MM/พ.ศ.]"]},
    {label:"📊 SUMMARY",color:"#4CAF50",cmds:["summary / summary พรุ่งนี้","summary [dd/MM/พ.ศ.]","summary month [MM/พ.ศ.]","summary channel [MM/พ.ศ.]","summary top menu [MM/พ.ศ.]","summary top menu rev [MM/พ.ศ.]","summary 7","summary pending","plan 7 / production 7"]},
    {label:"🔎 SMART FILTER",color:"#7C4DFF",cmds:["search type:wholesale","search channel:line","search delivery:pickup","search status:confirmed","search payment:pending"]},
    {label:"✏️ แก้ไข / เพิ่มออเดอร์",color:"#FF9500",cmds:["แก้ไขออเดอร์  → เลือกใบที่จะแก้","เพิ่มออเดอร์  → เลือกใบที่จะเพิ่มเมนู","เพิ่มเมนู [Order ID]  → paste หลายรายการได้","เลิกทำ / undo  → คืน action ล่าสุด (10 นาที)","cancel [Order ID] confirm"]},
    {label:"📋 LOG",color:"#795548",cmds:["log today","log date [dd/MM/พ.ศ.]","clear log confirm"]},
    {label:"📅 WEEKLY",color:"#00BCD4",cmds:["weekly summary","setup weekly"]},
    {label:"🍰 SHORT ORDER",color:"#FF6B6B",cmds:["มะพร้าว14","หน้าไหม้1 ส้ม4","@April Cafe\\nมะพร้าว12","เปลี่ยนมะพร้าวเป็นส้ม","เอาช็อกออก"]},
    // Urgent flag
    {label:"🚨 URGENT",color:"#D32F2F",cmds:["urgent [Order ID]  → mark ด่วน","unurgent [Order ID]  → ปลด","summary urgent  → ดูด่วนทั้งหมด","💡 กดปุ่มใน plan [วันที่] ได้เลย"]},
    // Delivery notify
    {label:"🔔 แจ้งเตือนส่ง",color:"#FF6B35",cmds:["setup delivery  → เตือนถึงเวลาส่ง (ทุก 5 นาที)","setup morning  → สรุปงานเช้า 7:00 เข้ากลุ่ม","ไก่จ๋า (ในกลุ่ม)  → register กลุ่มแจ้งเตือน","งานเช้า  → ดูตัวอย่างสรุปเช้า","delivery [ID] ส่งแล้ว  → อัปสถานะ"]},
    // Slip
    {label:"💳 สลิป",color:"#9C27B0",cmds:["ส่งรูปสลิปในแชท → บันทึกอัตโนมัติ","แจ้งโอน  → วิธีแจ้งชำระ"]}
  ];
  var bodyContents = [];
  sections.forEach(function(s) {
    bodyContents.push({type:"text",text:s.label,size:"sm",weight:"bold",color:s.color,margin:"md"});
    s.cmds.forEach(function(c){ bodyContents.push({type:"text",text:"• "+c,size:"xs",color:"#555555",margin:"xs",wrap:true}); });
  });
  bodyContents.push({type:"separator",margin:"md"});
  // เพิ่มหมวด GROUP — ปุ่มไก่จ๋า
  bodyContents.push({type:"text",text:"🐔 ในกลุ่ม LINE",size:"sm",weight:"bold",color:"#FF6B35",margin:"md"});
  bodyContents.push({type:"text",text:"• \"ไก่จ๋า\" → เปิดรับคำสั่ง "+GROUP_STANDBY_MINUTES+" นาที",size:"xs",color:"#555555",margin:"xs",wrap:true});
  bodyContents.push({type:"text",text:"• \"ปิดไก่จ๋า\" → ปิดการรับคำสั่ง",size:"xs",color:"#555555",margin:"xs",wrap:true});
  bodyContents.push({type:"text",text:"• \"ไก่จ๋า [คำสั่ง]\" → สั่งได้เลยทันที",size:"xs",color:"#555555",margin:"xs",wrap:true});
  bodyContents.push({type:"separator",margin:"md"});
  bodyContents.push({type:"text",text:"💡 ภาษาไทยก็ได้!",size:"xs",color:"#888888",margin:"md"});
  bodyContents.push({type:"text",text:"\"ออเดอร์วันนี้\"  \"สรุป\"  \"7วัน\"  \"เมนูยอดนิยม\"  \"แผนผลิต\"  \"ค้างชำระ\"",size:"xs",color:"#888888",wrap:true});
  return {type:"flex",altText:"📖 คำสั่งทั้งหมด",
    contents:{type:"bubble",size:"kilo",
      header:{type:"box",layout:"vertical",backgroundColor:"#37474F",paddingAll:"16px",contents:[
        {type:"text",text:"📖 คำสั่งทั้งหมด",size:"lg",color:"#FFFFFF",weight:"bold"},
        {type:"text",text:SHOP_NAME,size:"xs",color:"#B0BEC5",margin:"xs",wrap:true}
      ]},
      body:{type:"box",layout:"vertical",paddingAll:"16px",spacing:"none",contents:bodyContents},
      footer:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"12px",contents:[
        // row 1 — ปุ่มไก่จ๋า + ปิดไก่จ๋า
        {type:"box",layout:"horizontal",spacing:"sm",contents:[
          {type:"button",action:{type:"message",label:"🐔 เรียกไก่จ๋า",text:"ไก่จ๋า"},style:"primary",color:"#FF6B35",height:"sm",flex:1},
          {type:"button",action:{type:"message",label:"🔕 ปิดไก่จ๋า",text:"ปิดไก่จ๋า"},style:"secondary",height:"sm",flex:1}
        ]},
        // row 2 — urgent + plan
        {type:"box",layout:"horizontal",spacing:"sm",contents:[
          {type:"button",action:{type:"message",label:"🚨 ออเดอร์ด่วน",text:"summary urgent"},style:"primary",color:"#D32F2F",height:"sm",flex:1},
          {type:"button",action:{type:"message",label:"📋 plan 7",text:"plan 7"},style:"secondary",height:"sm",flex:1}
        ]},
        // row 2.5 — [v3.5.4] ดูร้านส่ง
        {type:"box",layout:"horizontal",spacing:"sm",contents:[
          {type:"button",action:{type:"message",label:"🏪 ดูร้านส่ง",text:"ดูร้านส่ง"},style:"primary",color:"#1565C0",height:"sm",flex:1},
          {type:"button",action:{type:"message",label:"👁️ ขอดู",text:"ขอดู"},style:"secondary",height:"sm",flex:1}
        ]},
        // row 3 — summary shortcuts
        {type:"box",layout:"horizontal",spacing:"sm",contents:[
          {type:"button",action:{type:"message",label:"📅 summary 7",text:"summary 7"},style:"primary",color:"#1565C0",height:"sm",flex:1},
          {type:"button",action:{type:"message",label:"📊 summary",text:"summary"},style:"primary",color:"#4CAF50",height:"sm",flex:1}
        ]},
        // row 4 — copy form + pending
        {type:"box",layout:"horizontal",spacing:"sm",contents:[
          {type:"button",action:{type:"clipboard",label:"📋 คัดลอกฟอร์ม",clipboardText:getOrderFormTemplate()},style:"secondary",height:"sm",flex:1},
          {type:"button",action:{type:"message",label:"💳 ค้างชำระ",text:"summary pending"},style:"secondary",height:"sm",flex:1}
        ]}
      ]}
    }
  };
}

// ============================================================
// LINE API
// ============================================================
function estimatePayloadSize_(obj) {
  try { return JSON.stringify(obj).length; } catch(e) { return 999999; }
}

function makeQuickReplyItems_(labels) {
  return (labels||[]).slice(0,13).map(function(l){
    return {type:"action",action:{type:"message",label:String(l).substring(0,20),text:String(l)}};
  });
}

function normalizeFlexForReply_(flex) {
  if (!flex||flex.type!=="flex") return flex;
  var msg = JSON.parse(JSON.stringify(flex));
  if (msg.contents&&msg.contents.type==="carousel"&&msg.contents.contents)
    msg.contents.contents = msg.contents.contents.slice(0,6);
  return msg;
}

function makeFallbackTextFromFlex_(flex) {
  return ((flex&&flex.altText)?String(flex.altText):"ข้อมูลพร้อมแล้ว") +
    "\n\nข้อมูลใหญ่เกินสำหรับ Flex รอบนี้ ลองใช้คำสั่งเจาะช่วงแทน เช่น summary [วันที่] หรือ search order [ID]";
}

function lineApiRequest_(url, body) {
  // wrap + log non-200 (เดิม fail เงียบ — debug ยาก)
  try {
    var res = UrlFetchApp.fetch(url, {
      method:"post",
      headers:{"Authorization":"Bearer "+LINE_CHANNEL_ACCESS_TOKEN,"Content-Type":"application/json"},
      payload:JSON.stringify(body),
      muteHttpExceptions:true
    });
    var code = res.getResponseCode();
    if (code !== 200) {
      Logger.log("[ERROR] LINE API "+code+" | url="+url+" | resp="+String(res.getContentText()||"").substring(0,300));
    }
    return res;
  } catch(e) {
    Logger.log("[ERROR] lineApiRequest_ throw: "+e.message+" | url="+url);
    return null;
  }
}

// [L1] แสดง loading animation ("...") ในแชท 1:1 ทันทีที่รับออเดอร์ — กันรู้สึกว่าบอทเงียบ
//   ใช้ได้เฉพาะแชท 1:1 (LINE API ไม่รองรับ group/room) — seconds ต้องเป็น 5..60 (ทวีคูณ 5)
function startLoadingAnimation_(userId, seconds) {
  try {
    if (!userId || String(userId).charAt(0) !== "U") return; // เฉพาะ 1:1 (userId ขึ้นต้น U)
    var s = Math.min(60, Math.max(5, Math.round((seconds||5)/5)*5));
    lineApiRequest_("https://api.line.me/v2/bot/chat/loading/start",
      { chatId: String(userId), loadingSeconds: s });
  } catch(e) {
    Logger.log("[WARN] startLoadingAnimation_ failed: " + e.message);
  }
}

function replyLine(replyToken, message) {
  try {
    return lineApiRequest_("https://api.line.me/v2/bot/message/reply", {
      replyToken:replyToken,
      messages:[{type:"text",text:String(message||"").substring(0,5000)}]
    });
  } catch(e) { Logger.log("[ERROR] replyLine: "+e.message); return null; }
}

function replyLineWithQuickReply(replyToken, message, buttonLabels) {
  try {
    var items = makeQuickReplyItems_(buttonLabels);
    return lineApiRequest_("https://api.line.me/v2/bot/message/reply", {
      replyToken:replyToken,
      messages:[{
        type:"text",text:String(message||"").substring(0,5000),
        quickReply:items.length?{items:items}:undefined
      }]
    });
  } catch(e) { Logger.log("[ERROR] replyLineWithQuickReply: "+e.message); return null; }
}

function replyFlexWithQuickReply(replyToken, flexPayload, buttonLabels) {
  try {
    var items     = makeQuickReplyItems_(buttonLabels);
    var normFlex  = normalizeFlexForReply_(flexPayload);
    var message   = JSON.parse(JSON.stringify(normFlex));
    if (items.length) message.quickReply = {items:items};

    var body = {replyToken:replyToken, messages:[message]};
    if (estimatePayloadSize_(body) <= LINE_REPLY_PAYLOAD_SOFT_LIMIT)
      return lineApiRequest_("https://api.line.me/v2/bot/message/reply", body);

    // log เมื่อ payload ใหญ่จนต้อง downgrade (เดิมเงียบ)
    Logger.log("[WARN] flex payload ใหญ่ "+estimatePayloadSize_(body)+" bytes — downgrade");
    if (message.contents&&message.contents.type==="carousel"&&(message.contents.contents||[]).length>3) {
      message.contents.contents = message.contents.contents.slice(0,3);
      body = {replyToken:replyToken, messages:[message]};
      if (estimatePayloadSize_(body) <= LINE_REPLY_PAYLOAD_SOFT_LIMIT)
        return lineApiRequest_("https://api.line.me/v2/bot/message/reply", body);
    }
    Logger.log("[WARN] flex ยังใหญ่เกิน — fallback เป็น text");
    var fallback = {type:"text",text:makeFallbackTextFromFlex_(flexPayload).substring(0,5000)};
    if (items.length) fallback.quickReply = {items:items};
    return lineApiRequest_("https://api.line.me/v2/bot/message/reply", {replyToken:replyToken,messages:[fallback]});
  } catch(e) {
    Logger.log("[ERROR] replyFlexWithQuickReply: "+e.message+" | stack: "+(e.stack||""));
    // last resort — text ล้วน
    try {
      return lineApiRequest_("https://api.line.me/v2/bot/message/reply",
        {replyToken:replyToken, messages:[{type:"text",text:"ขออภัยค่ะ แสดงผลไม่สำเร็จ ลองพิมพ์ help"}]});
    } catch(e2) { return null; }
  }
}

function pushNotifyText_(message, skipUid) {
  // [v3.6.1] skipUid = userId ของผู้กระทำ → ข้ามไม่ push ซ้ำ (เขาเห็นใน reply แล้ว)
  var skip = String(skipUid||"").replace(/^liff:/, "");
  getNotifyRecipients_().forEach(function(to){
    if (!to) return;
    if (skip && (to === skip || to.indexOf(skip) === 0 || skip.indexOf(to.substring(0,8)) === 0)) return;
    lineApiRequest_("https://api.line.me/v2/bot/message/push",{to:to,messages:[{type:"text",text:String(message).substring(0,5000)}]});
  });
}


// [v3.5.3] เช็คว่า userId อยู่ใน whitelist admin หรือไม่
function isAdminUser_(userId) {
  if (!userId) return false;
  var list = [].concat(ADMIN_USER_IDS||[], NOTIFY_TO_USER_IDS||[]);
  for (var i = 0; i < list.length; i++) if (list[i] === userId) return true;
  return false;
}

// [v3.5.6] เช็คสิทธิ์เข้า Dashboard — ถ้า OPEN_ACCESS=true ปล่อยทุก LINE user
//   ใช้แทน isAdminUser_ เฉพาะที่เช็ค dashboard view (read access)
//   write API ยังเช็ค isAdminUser_ ตามเดิม (ปลอดภัยกว่า)
function canViewDashboard_(userId) {
  if (DASHBOARD_OPEN_ACCESS) return !!userId; // มี userId ก็พอ (= login LINE แล้ว)
  return isAdminUser_(userId);
}


function replyWithCustomerQuickReply(replyToken, message, buttonLabels) {
  return replyLineWithQuickReply(replyToken, message, buttonLabels||QR_CUSTOMER_MAIN);
}
function replyFlexWithCustomerQR(replyToken, flexPayload, buttonLabels) {
  return replyFlexWithQuickReply(replyToken, flexPayload, buttonLabels||QR_CUSTOMER_MAIN);
}

// ============================================================
// AI AUTO REPLY (optional)
// ============================================================
function isLikelyCustomerQuestion_(text) {
  return /(ราคา|เมนู|กี่บาท|สั่งยังไง|รับอะไรบ้าง|เปิดกี่โมง|ส่งไหม|เค้ก|cake|menu|price|payment|โอน)/.test(safeLower_(text));
}

function generateAIReply_(text) {
  if (!ENABLE_AI_AUTO_REPLY||!GEMINI_API_KEY) return "";
  try {
    var res = UrlFetchApp.fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key="+encodeURIComponent(GEMINI_API_KEY),
      {method:"post",contentType:"application/json",payload:JSON.stringify({
        contents:[{parts:[{text:"คุณเป็นแอดมินร้านเค้ก ตอบสั้น สุภาพ ภาษาไทย ไม่เกิน 4 บรรทัด ห้ามแต่งข้อมูลเกินจริง\n\nคำถามลูกค้า: "+text}]}]
      }),muteHttpExceptions:true});
    var json = JSON.parse(res.getContentText()||"{}");
    return json.candidates&&json.candidates[0]&&json.candidates[0].content&&
           json.candidates[0].content.parts&&json.candidates[0].content.parts[0]
      ? json.candidates[0].content.parts[0].text.trim() : "";
  } catch(e) { return ""; }
}

// ============================================================
// CUSTOMER FLOW
// ============================================================
function handleCheckStatus(replyToken, userId, customerName) {
  var orders = getLatestActiveOrdersFast_(3, userId, customerName);
  if (!orders||!orders.length) {
    replyWithCustomerQuickReply(replyToken,"ยังไม่พบออเดอร์ล่าสุดในระบบค่ะ\nลองส่ง Order ID มาหรือพิมพ์ \"สั่งเค้ก\" ได้เลยค่ะ",QR_CUSTOMER_MAIN);
    return true;
  }
  var flatRows = [].concat.apply([], orders.map(function(o){ return o.rows; }));
  replyFlexWithCustomerQR(replyToken, buildOrderListFlex(flatRows,"ออเดอร์ล่าสุด"), QR_CUSTOMER_MAIN);
  return true;
}

function handlePaymentNotice(replyToken, userId, text) {
  replyWithCustomerQuickReply(replyToken,
    "💳 รับแจ้งโอนเงินค่ะ\n\n📸 วิธีที่ง่ายที่สุด: ส่งรูปสลิปเข้ามาในแชทนี้ได้เลย\nระบบจะบันทึกรูป + วันที่ + เวลาให้อัตโนมัติ\n\nถ้ามีหลายออเดอร์ค้าง ระบบจะให้เลือกว่าผูกกับ Order ไหน",
    ["summary pending","search today"].concat(QR_CUSTOMER_MAIN||[]));
  pushNotifyText_("💳 มีลูกค้าแจ้งโอนเงิน\nUser ID: "+(userId||"-")+"\nข้อความ: "+String(text||""));
  return true;
}

function handleCustomerMessage(event, processedText) {
  var text       = processedText !== undefined ? processedText : (event.message&&event.message.text?event.message.text.trim():"");
  var replyToken = event.replyToken;
  var userId     = event.source ? event.source.userId : "";
  var lower      = text.toLowerCase();

  // Global handlers สำหรับปุ่มที่อยู่ใน Quick Reply ทุก context
  // ปุ่มเหล่านี้เดิมทำงานเฉพาะใน state — ถ้า user กดนอก state จะ dead → fix ด้วย global router

  // 📋 คัดลอกฟอร์ม — ส่ง template เสมอ (ไม่ว่าจะอยู่ใน state ไหน)
  if (text.indexOf("คัดลอกฟอร์ม")>-1) {
    clearUserState(userId);
    replyLine(replyToken, getOrderFormTemplate()); return true;
  }
  // ❌ ยกเลิก — clear state + reply (global cancel) 
  if (/^(❌\s*)?ยกเลิก$/.test(text) || /^(❌\s*)?ยกเลิกสลิป$/.test(text)) {
    var prevState = getUserState(userId);
    clearUserState(userId);
    var cancelMsg;
    if (prevState && prevState.step === "SLIP_PICK_ORDER") {
      cancelMsg = "ยกเลิกสลิปแล้วค่ะ (รูปยังเก็บไว้ใน Drive)\n🔗 " + (prevState.slipUrl||"");
    } else if (prevState) {
      cancelMsg = "❌ ยกเลิกแล้วค่ะ 🐔";
    } else {
      cancelMsg = "ไม่มีรายการที่ค้างอยู่ค่ะ";
    }
    replyWithCustomerQuickReply(replyToken, cancelMsg, QR_CUSTOMER_MAIN); return true;
  }

  if (/^(ดูเมนูเค้ก|ดูเมนู|เมนูเค้ก|เมนู เค้ก|เมนู|menu)$/.test(lower)) {
    replyFlexWithCustomerQR(replyToken, buildCakeMenuCarousel(), QR_CUSTOMER_MAIN); return true;
  }
  if (/^(สั่งเค้ก|สั่ง|order|สั่งเลย)$/.test(lower)) {
    startGuidedOrderFlow(replyToken, userId); return true;
  }
  if (/^(เช็คสถานะ|สถานะ|check status)$/.test(lower)) {
    return handleCheckStatus(replyToken, userId, null);
  }
  if (/^(แจ้งโอนเงิน|โอนเงิน|payment|แจ้งชำระ)$/.test(lower)) {
    return handlePaymentNotice(replyToken, userId, text);
  }
  if (/^(โปรโมชัน|promo|โปรโมชั่น)$/.test(lower)) {
    replyFlexWithCustomerQR(replyToken, buildPromoFlex(), QR_CUSTOMER_MAIN); return true;
  }
  if (/^(ติดต่อร้าน|contact|ติดต่อ)$/.test(lower)) {
    var contactText = [SHOP_NAME, "เวลาเปิด "+SHOP_HOURS, "โซน "+SHOP_AREA, "พิกัดร้าน: "+SHOP_MAP_URL].join("\n");
    replyWithCustomerQuickReply(replyToken, contactText, QR_CUSTOMER_MAIN); return true;
  }
  if (lower==="ยกเลิกการสั่ง"||lower==="cancel order") {
    clearUserState(userId);
    replyWithCustomerQuickReply(replyToken,"❌ ยกเลิกการสั่งแล้วค่ะ 🐔",QR_CUSTOMER_MAIN); return true;
  }
  var state = getUserState(userId);
  if (state&&state.step) return handleGuidedOrderStep(replyToken, userId, text, state);
  return false;
}

// ============================================================
// ★ NEW v3.1 — HANDLE SHORT CAFE ORDER (admin)
// ============================================================
function handleShortCafeOrderMessage_(text, replyToken, userId) {
  var orderData = parseShortCafeOrder_(text);
  if (!orderData || !orderData.items || !orderData.items.length) return false;

  // ถ้าไม่มีชื่อลูกค้า → ถามชื่อก่อน
  if (!String(orderData.customerName||"").trim()) {
    setUserState(userId, {
      step: "ASK_MISSING_CUSTOMER_FOR_ORDER",
      userId: userId,
      rawOrderText: text,
      pendingOrderData: orderData
    });
    replyWithCustomerQuickReply(replyToken,
      "🧾 รับออเดอร์ได้แล้วค่ะ ✅\n\nพบ "+orderData.items.length+" รายการ รวม "+toNumber(orderData.grandTotal).toLocaleString()+" บาท\n\nรบกวนพิมพ์ชื่อลูกค้า/ร้านค้าด้วยนะคะ",
      ["ยกเลิกการสั่ง"]);
    return true;
  }

  var errors = validateOrder_(orderData);
  if (errors.length > 0) {
    // auto-fix common missing fields for short cafe
    if (!orderData.channel) orderData.channel = "LINE";
    if (!orderData.orderType) orderData.orderType = "Wholesale";
    errors = validateOrder_(orderData);
  }

  if (errors.length > 0 && !(errors.length === 1 && errors[0] === "ลูกค้า(ชื่อคนรับ)")) {
    replyFlexWithQuickReply(replyToken, buildErrorFlex(errors), QR_NO_ORDERS);
    return true;
  }

  var orderId = saveOrderToSheet_(orderData, text, userId||"line");
  if (ENABLE_PUSH_NEW_ORDER) {
    pushNotifyText_("🆕 ออเดอร์ใหม่ (Short)\nOrder ID: "+orderId+
      "\nลูกค้า: "+orderData.customerName+
      "\nวันส่ง: "+orderData.deliveryDate+
      "\nรวม: "+toNumber(orderData.grandTotal).toLocaleString()+" บาท");
  }

  // ส่งสรุปออเดอร์กลับแบบที่ร้านใช้จริง
  var summaryText = generateCustomerSummary_(orderData);
  replyLineWithQuickReply(replyToken, summaryText, qrAfterSave(orderId));
  return true;
}

// ============================================================
// ★ NEW v3.1 — HANDLE MODIFIER (แก้ออเดอร์กลางแชท)
// ============================================================
function handleModifierMessage_(text, replyToken, userId) {
  var mod = parseModifier_(text);
  if (!mod || !mod.action) return false;

  // ดูออเดอร์ล่าสุดของ user นี้
  var latestGroups = getLatestActiveOrdersFast_(1, userId, null);
  if (!latestGroups || !latestGroups.length) {
    replyLineWithQuickReply(replyToken, "ไม่พบออเดอร์ล่าสุดที่จะแก้ไขค่ะ\nลอง search order [ID] เพื่อระบุออเดอร์ที่ต้องการแก้", QR_MAIN);
    return true;
  }

  var targetOrder = latestGroups[0];
  var orderId = targetOrder.orderId;

  switch (mod.action) {
    case "remove":
      replyLineWithQuickReply(replyToken,
        "⚠️ ต้องการเอา \""+mod.menuName+"\" ออกจาก Order: "+orderId+" ใช่ไหมคะ?\n\nพิมพ์ \"cancel "+orderId+" confirm\" เพื่อยกเลิกทั้งออเดอร์\nหรือ edit "+orderId+" note=ลบ"+mod.menuName+" เพื่อบันทึก note",
        ["cancel "+orderId+" confirm", "search order "+orderId, "help"]);
      return true;
    case "replace":
      replyLineWithQuickReply(replyToken,
        "🔄 ต้องการเปลี่ยน \""+mod.fromMenu+"\" เป็น \""+mod.menuName+"\" ใน Order: "+orderId+" ใช่ไหมคะ?\n\nใช้คำสั่ง:\nedit "+orderId+" note=เปลี่ยน"+mod.fromMenu+"เป็น"+mod.menuName,
        ["edit "+orderId+" note=เปลี่ยน"+mod.fromMenu+"เป็น"+mod.menuName, "search order "+orderId]);
      return true;
    case "add":
      var addNote = "เพิ่ม: "+mod.menuName+(mod.qty>1?" "+mod.qty+" ชิ้น":"")+(mod.price>0?" +"+mod.price+"฿":"");
      replyLineWithQuickReply(replyToken,
        "➕ บันทึก note เพิ่มเมนูให้ Order: "+orderId+"\n"+addNote+"\n\nใช้คำสั่ง:\nedit "+orderId+" note="+addNote,
        ["edit "+orderId+" note="+addNote, "search order "+orderId]);
      return true;
    case "reduce":
      replyLineWithQuickReply(replyToken,
        "🔢 ต้องการลด \""+mod.menuName+"\" เหลือ "+mod.qty+" ใน Order: "+orderId+"\n\nใช้คำสั่ง:\nedit "+orderId+" note=ลด"+mod.menuName+"เหลือ"+mod.qty,
        ["edit "+orderId+" note=ลด"+mod.menuName+"เหลือ"+mod.qty, "search order "+orderId]);
      return true;
  }
  return false;
}


function handleAdminCommand(text, replyToken, userId, source) {
  var trimmed = String(text||"").trim();
  var lower   = trimmed.toLowerCase();

  var resolved = resolveAlias(trimmed);
  if (resolved && resolved.toLowerCase() !== lower)
    return handleAdminCommand(resolved, replyToken, userId, source);

  // [v3.5.3] "ขอดู ORD-xxx" — admin-only ดู detail ของออเดอร์ที่ระบุ
  var reqViewM = trimmed.match(/^(?:ขอดู|ดูออเดอร์|view)\s+(ORD-\d{8}-\d{6})$/i);
  if (reqViewM) {
    var reqOid = reqViewM[1].toUpperCase();
    if (!isAdminUser_(userId)) {
      replyLineWithQuickReply(replyToken,
        "🔒 เฉพาะแอดมินดูได้ค่ะ\nถ้าต้องการสิทธิ์ ติดต่อพี่หม่อน",
        ["help"]);
      return true;
    }
    var rows = findOrderRowsById_(reqOid);
    if (!rows.length) {
      replyLineWithQuickReply(replyToken, "❓ ไม่เจอ Order: "+reqOid, ["ขอดู","search latest","plan 7"]);
      return true;
    }
    replyFlexWithQuickReply(replyToken,
      {type:"flex", altText:"ออเดอร์ "+reqOid, contents:buildOrderCardFlex(reqOid, rows)},
      ["urgent "+reqOid, "เพิ่มเมนู "+reqOid, "ขอดู", "plan 7"]);
    return true;
  }

  // [v3.5.3] "ขอดู" router — admin-only หลายแบบ:
  //   ขอดู             → 5 ล่าสุด
  //   ขอดูล่าสุด 10    → N ล่าสุด (max 12)
  //   ขอดูวันนี้       → ออเดอร์วันนี้
  //   ขอดูพรุ่งนี้     → ออเดอร์พรุ่งนี้
  //   ขอดูค้าง         → ค้างชำระ
  //   ขอดูด่วน         → urgent
  //   ขอดู<ชื่อร้าน>   → fuzzy search by customer
  //   ขอดู ORD-xxx     → detail (จับด้วย regex แยกด้านบนแล้ว)
  //   ⚠️ ใช้ได้เฉพาะในกลุ่มที่เรียก "ไก่จ๋า" แล้วเท่านั้น (isGroupStandbyActive ที่ doPost บล็อกตั้งแต่ต้น)
  // [v3.5.3 FIX] รับทั้งติดกัน ("ขอดูวันนี้") และมี space ("ขอดู ทูบา")
  var reqMain = trimmed.match(/^(?:ขอดู|ดูออเดอร์ใหม่|ออเดอร์ใหม่|new\s*order)\s*(.*)$/i);
  if (reqMain && !reqMain[1]) reqMain[1] = "";
  if (reqMain) {
    if (!isAdminUser_(userId)) {
      replyLineWithQuickReply(replyToken, "🔒 เฉพาะแอดมินดูได้ค่ะ", ["help"]);
      return true;
    }
    var arg = String(reqMain[1]||"").trim();
    var argLow = arg.toLowerCase();
    var rows = [], heading = "🆕 ออเดอร์ล่าสุด";

    // ── route ตาม argument ──
    if (!arg) {
      rows = getLatestUniqueOrderRows_(5);
      heading = "🆕 ออเดอร์ล่าสุด 5 รายการ";
    }
    else if (/^(?:วันนี้|today)$/i.test(argLow)) {
      rows = getRowsByDeliveryDateFast_(getTodayTH()).filter(function(r){return !isRowCancelled(r);});
      heading = "📅 ออเดอร์วันนี้ ("+getTodayTH()+")";
    }
    else if (/^(?:พรุ่งนี้|tomorrow)$/i.test(argLow)) {
      rows = getRowsByDeliveryDateFast_(getTomorrowTH()).filter(function(r){return !isRowCancelled(r);});
      heading = "📅 ออเดอร์พรุ่งนี้ ("+getTomorrowTH()+")";
    }
    else if (/^(?:ค้าง|ค้างชำระ|pending|ยอดค้าง)$/i.test(argLow)) {
      rows = getOrderRows(function(r){
        return String(r.paymentStatus||"").trim().toLowerCase()==="pending" && !isRowCancelled(r);
      }, 100);
      heading = "💳 ค้างชำระ";
    }
    else if (/^(?:ด่วน|urgent)$/i.test(argLow)) {
      rows = getOrderRows(function(r){
        return isNoteUrgent_(r.note) && !isRowCancelled(r) && r.grandTotal!=="";
      }, 50);
      heading = "🚨 ออเดอร์ด่วน";
    }
    else {
      // "ล่าสุด N" หรือ "ล่าสุด"
      var latestN = argLow.match(/^ล่าสุด(?:\s+(\d+))?$/);
      if (latestN) {
        var n = Math.min(parseInt(latestN[1]||"5",10)||5, 12);
        rows = getLatestUniqueOrderRows_(n);
        heading = "🆕 ออเดอร์ล่าสุด "+n+" รายการ";
      } else {
        // ชื่อร้าน / ลูกค้า — fuzzy search + [v3.6.4] ตัดยกเลิก
        rows = smartSearch(arg).filter(function(r){ return !isRowCancelled(r); });
        heading = "🔍 ออเดอร์ของ \""+arg+"\"";
      }
    }

    if (!rows.length) {
      replyLineWithQuickReply(replyToken, "❓ ไม่เจอ"+heading.replace(/^\S+\s/,""),
        ["ขอดู","ขอดูวันนี้","ขอดูค้าง","help"]);
      return true;
    }

    var grouped = groupRowsByOrder(rows);
    // sort: urgent → not passed → date asc
    grouped.sort(function(a,b){
      var mA=a.rows[0], mB=b.rows[0];
      var uA=isNoteUrgent_(mA.note)?0:1, uB=isNoteUrgent_(mB.note)?0:1;
      if(uA!==uB) return uA-uB;
      return deliveryDateSortKey(mA.deliveryDate)-deliveryDateSortKey(mB.deliveryDate);
    });

    // สร้าง teaser bubbles — limit 11 (LINE max 12 - 1 summary)
    var maxBubbles = 11;
    var teaserBubbles = grouped.slice(0, maxBubbles).map(function(g){
      var main = g.rows.find(function(r){ return toNumber(r.grandTotal)>0; }) || g.rows[0];
      var cust = String(main.customerName||main.tableName||"-").substring(0,40);
      var total = toNumber(main.grandTotal);
      var itemCount = g.rows.filter(function(r){ return r.menuName; }).length;
      var dateStr = String(main.deliveryDate||"-");
      var isUrgent = isNoteUrgent_(main.note);
      var payStatus = String(main.paymentStatus||"");
      var isPaid = payStatus.toLowerCase()==="paid";
      var headerColor = isUrgent ? "#D32F2F" : "#1E88E5";
      return {
        type:"bubble", size:"kilo",
        header:{type:"box", layout:"vertical", backgroundColor:headerColor, paddingAll:"12px", contents:[
          {type:"text", text: isUrgent?"🚨 ด่วน":"🆕 ออเดอร์", size:"xs", color:"#BBDEFB", weight:"bold"},
          {type:"text", text:cust, size:"md", color:"#FFFFFF", weight:"bold", wrap:true}
        ]},
        body:{type:"box", layout:"vertical", paddingAll:"12px", spacing:"sm", contents:[
          {type:"box", layout:"horizontal", contents:[
            {type:"text", text:"💰 ยอด", size:"sm", color:"#888888", flex:2},
            {type:"text", text:total.toLocaleString()+"฿", size:"md", color:headerColor, weight:"bold", flex:3, align:"end"}
          ]},
          {type:"box", layout:"horizontal", contents:[
            {type:"text", text:"📅 วันส่ง", size:"xs", color:"#888888", flex:2},
            {type:"text", text:dateStr, size:"xs", color:"#666666", flex:3, align:"end"}
          ]},
          {type:"box", layout:"horizontal", contents:[
            {type:"text", text:"🍰 รายการ", size:"xs", color:"#888888", flex:2},
            {type:"text", text:itemCount+" อัน "+(isPaid?"✅":"💳"), size:"xs", color:"#666666", flex:3, align:"end"}
          ]},
          {type:"text", text:"📋 "+g.orderId, size:"xxs", color:"#AAAAAA", margin:"sm"},
          {type:"separator", margin:"sm"},
          {type:"text", text:"🔒 กดเพื่อดูรายละเอียด", size:"xxs", color:"#AAAAAA", margin:"sm"}
        ]},
        footer:{type:"box", layout:"vertical", spacing:"sm", paddingAll:"10px", contents:[
          {type:"button", style:"primary", color:headerColor, height:"sm",
            action:{type:"message", label:"👁️ ขอดูออเดอร์นี้", text:"ขอดู "+g.orderId}}
        ]}
      };
    });

    // ถ้าเกิน maxBubbles — เพิ่ม card สรุปท้าย
    if (grouped.length > maxBubbles) {
      teaserBubbles.push({type:"bubble", size:"kilo",
        body:{type:"box", layout:"vertical", justifyContent:"center", alignItems:"center", height:"240px", contents:[
          {type:"text", text:"+"+(grouped.length-maxBubbles), size:"5xl", weight:"bold", color:"#CCCCCC"},
          {type:"text", text:"ออเดอร์เพิ่ม", size:"sm", color:"#AAAAAA", margin:"md"},
          {type:"text", text:"ลองพิมพ์เจาะจง", size:"xxs", color:"#AAAAAA", margin:"md"},
          {type:"text", text:"เช่น ขอดูทูบา", size:"xxs", color:"#AAAAAA"}
        ]}
      });
    }

    replyFlexWithQuickReply(replyToken,
      {type:"flex", altText:heading+" ("+grouped.length+")",
       contents: teaserBubbles.length===1 ? teaserBubbles[0] : {type:"carousel", contents:teaserBubbles}},
      ["ขอดู", "ขอดูวันนี้", "ขอดูค้าง", "ขอดูด่วน", "plan 7"]);
    return true;
  }

  // [v3.5.4] "ดูร้านส่ง" / "รายชื่อร้าน" — แสดง list ร้านที่มีออเดอร์ค้างส่ง
  //   ต้องอยู่ก่อน "ดู order ของ..." (ไม่งั้น regex จะกิน "ส่ง" เป็น keyword)
  if (/^(?:ดูร้านส่ง|ดูร้าน|รายชื่อร้าน|รายร้าน|ร้านส่ง|shops?)$/i.test(lower)) {
    replyFlexWithQuickReply(replyToken,
      buildShopsListFlex_(),
      ["ดูร้านส่ง","ขอดูวันนี้","plan 7","help"]);
    return true;
  }

  // [v3.5.2] ภาษาคน — "ดู order ของทูบา" / "ออเดอร์ของทูบา" / "หาออเดอร์ทูบา"
  // จับชื่อร้าน/ลูกค้า แล้วยิงเข้า smartSearch
  var natCust = trimmed.match(/^(?:ดู|หา|ค้นหา|ค้น|เรียก|โชว์|show)\s*(?:order|ออเดอร์|ออร์เดอร์|รายการ)?\s*(?:ของ|ร้าน|ลูกค้า)?\s*(.+)$/i);
  if (!natCust) {
    // รูปสั้น "ออเดอร์ของ X" / "ออเดอร์ร้าน X" — รับทั้งมี space และไม่มี
    natCust = trimmed.match(/^(?:order|ออเดอร์|ออร์เดอร์)\s*(?:ของ|ร้าน|ลูกค้า)\s*(.+)$/i);
  }
  if (natCust) {
    var keyword = String(natCust[1]||"").trim().replace(/[\?\.\!]+$/,"");
    // กันชนคำสั่งระบบ (today/latest/order ID/date)
    var sysWords = /^(today|latest|วันนี้|พรุ่งนี้|ล่าสุด|พรุ่ง|ORD-|\d{1,2}\/\d{1,2})/i;
    if (keyword && keyword.length >= 2 && !sysWords.test(keyword)) {
      var rows = smartSearch(keyword);
      // [v3.6.4] ตัดออเดอร์ที่ยกเลิกแล้ว — มักเป็นใบที่ถูกแทนที่ด้วยใบใหม่
      rows = rows.filter(function(r){ return !isRowCancelled(r); });
      if (rows.length) {
        replyFlexWithQuickReply(replyToken,
          buildOrderListFlex(rows, "ออเดอร์ของ "+keyword),
          ["ดู order ของ "+keyword, "search "+keyword, "plan 7", "help"]);
      } else {
        replyLineWithQuickReply(replyToken,
          "❓ ไม่เจอออเดอร์ของ \""+keyword+"\" (ที่ยังไม่ยกเลิก)\nลองพิมพ์ search "+keyword+" เพื่อดูรวมที่ยกเลิกด้วย",
          ["search "+keyword, "search latest", "help"]);
      }
      return true;
    }
  }

  if (/^(plan 7|production 7|แผนผลิต|แผนการผลิต|แผนผลิต 7)$/.test(lower)) {
    try {
      var p7text = buildPlan7TextFast_();
      // เพิ่ม hint + ปุ่ม plan วันใกล้ ให้กดเข้าโหมด urgent toggle ได้ทันที
      var nextDates = getNextActivePlanDates_(3) || [];
      var nowTH = new Date(); var ymTH = Utilities.formatDate(nowTH, "Asia/Bangkok", "yyyy-MM");
      var dashTail  = "\n\n📊 ดู Dashboard รายเดือน:\n" + LIFF_DASHBOARD_URL + "?month=" + ymTH;
      var hintTail  = "\n💡 พิมพ์ plan DD/MM เพื่อกดตั้งด่วน 🚨 รายออเดอร์ได้";
      if (p7text.length + dashTail.length + hintTail.length <= 4900) p7text += dashTail + hintTail;
      else if (p7text.length + dashTail.length <= 4900) p7text += dashTail;
      var qrBtns = nextDates.map(function(d){ return "plan "+d.slice(0,5); });
      qrBtns.push("summary urgent"); qrBtns.push("help");
      Logger.log("plan7 len:"+p7text.length+" | qr="+qrBtns.length);
      replyLineWithQuickReply(replyToken, p7text, qrBtns);
    } catch(ep7) {
      Logger.log("plan7 ERROR: "+ep7);
      try { replyLine(replyToken, "⚠️ plan 7 error: "+ep7); } catch(e2){}
    }
    return true;
  }
  // ★ v3.5 — plan DD/MM หรือ plan DD/MM/YYYY → รายละเอียดวันที่เฉพาะ
  var planDayM = trimmed.match(/^plan\s+(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s*$/i);
  if (planDayM) {
    var planDateRaw = planDayM[1];
    // เติม year ถ้าไม่มี
    if (!/\/\d{3,}/.test(planDateRaw)) planDateRaw += "/"+getTodayTH().split("/")[2];
    var planDate = normalizeDateText_(planDateRaw);
    replyFlexWithQuickReply(replyToken, buildDayDetailFlex_(planDate, planDate), QR_SUMMARY); return true;
  }
  // ★ NEW v3.4 — คำสั่ง "วันนี้" "พรุ่งนี้" "เสาร์นี้" "วัน[X]" 
  // ★ debug — plan debug → แสดงสถานะ index และ dates ที่พบ
  // ★ debug — plan debug → ใช้ Plan Light Index (ไม่ clear cache)
  if (lower==="plan debug"||lower==="debug plan") {
    try {
      var today2    = getTodayTH();
      var idx2      = getPlanIndexCache_();
      var dateKeys2 = Object.keys(idx2.byDate||{}).sort();
      var nextD2    = getNextActivePlanDates_(7);
      var debugMsg  = "🔍 Plan 7 Debug\n";
      debugMsg += "วันนี้: "+today2+"\n";
      debugMsg += "Index dates: "+dateKeys2.length+" วัน\n";
      debugMsg += "Next 7 dates: "+(nextD2.join(", ")||"ไม่พบ")+"\n";
      if (nextD2.length) {
        nextD2.forEach(function(d){
          debugMsg += "\n📅 "+d+": "+getPlanRowsByDeliveryDateFast_(d).length+" rows";
        });
      } else if (dateKeys2.length) {
        debugMsg += "\n⚠️ dates ล่าสุดใน index:\n";
        dateKeys2.slice(-10).forEach(function(d){
          var ok = deliveryDateSortKey(d) >= deliveryDateSortKey(today2);
          debugMsg += (ok?"✅ ":"❌ ")+d+" = "+(idx2.byDate[d]||[]).length+" rows\n";
        });
      }
      replyLineWithQuickReply(replyToken, debugMsg, ["plan 7","clear cache","help"]);
    } catch(edbg) {
      replyLineWithQuickReply(replyToken, "❌ debug error: "+edbg, QR_MAIN);
    }
    return true;
  }
  // ★ clear cache
  if (lower==="clear cache"||lower==="ล้าง cache") {
    clearSheetCache();
    replyLineWithQuickReply(replyToken,"✅ ล้าง cache แล้วค่ะ\nลอง plan 7 อีกครั้งได้เลย",["plan 7","plan debug"]); return true;
  }

  if (lower==="วันนี้") {
    replyLineWithQuickReply(replyToken, buildDayPlanText_(getTodayTH(),"วันนี้"), ["พรุ่งนี้","plan 7","summary","help"]); return true;
  }
  if (lower==="พรุ่งนี้") {
    replyLineWithQuickReply(replyToken, buildDayPlanText_(getTomorrowTH(),"พรุ่งนี้"), ["วันนี้","plan 7","summary","help"]); return true;
  }
  // เสาร์นี้ / จันทร์นี้ / อังคารนี้ ฯลฯ
  var dayNiMatch = trimmed.match(/^(จันทร์|อังคาร|พุธ|พฤหัส|ศุกร์|เสาร์|อาทิตย์)นี้?$/);
  if (dayNiMatch) {
    var targetDayDate = getNextWeekday_(dayNiMatch[1]);
    if (targetDayDate) {
      replyLineWithQuickReply(replyToken, buildDayPlanText_(targetDayDate,"วัน"+dayNiMatch[1]), ["วันนี้","พรุ่งนี้","plan 7"]); return true;
    }
  }

  // ★ NEW v3.4 — "menu check" ดูเมนูที่ reviewFlag=TRUE 
  if (lower==="menu check"||lower==="เมนูต้องตรวจ"||lower==="check menu") {
    var reviewRows = getOrderRows(function(r){ return String(r.reviewFlag||"").toUpperCase()==="REVIEW" && !isRowCancelled(r); }, 200);
    if (!reviewRows.length) {
      replyLineWithQuickReply(replyToken,"✅ ไม่มีเมนูที่ต้องตรวจสอบค่ะ", QR_MAIN); return true;
    }
    var unknownMenuSet = {};
    reviewRows.forEach(function(r){ if (r.menuName) unknownMenuSet[r.menuName]=true; });
    var unknownList = Object.keys(unknownMenuSet);
    var msg = "⚠️ เมนูที่ต้องตรวจสอบ ("+unknownList.length+" เมนู)\n\n";
    unknownList.forEach(function(m,i){ msg += (i+1)+". "+m+"\n"; });
    msg += "\nพิมพ์:\nmap [ชื่อเดิม] = [ชื่อจริง]\nเพื่อเพิ่ม alias ค่ะ";
    replyLineWithQuickReply(replyToken, msg, ["menu check","plan 7","help"]); return true;
  }

  // ★ NEW v3.4 — "map X = Y" เพิ่ม alias runtime 
  var mapMatch = trimmed.match(/^map\s+(.+?)\s*=\s*(.+)$/i);
  if (mapMatch) {
    var aliasFrom = mapMatch[1].trim();
    var aliasTo   = mapMatch[2].trim();
    if (aliasFrom && aliasTo) {
      MENU_ALIAS[aliasFrom.toLowerCase()] = aliasTo;
      // persist ใน PropertiesService
      var propsObj = {};
      try { propsObj = JSON.parse(PropertiesService.getScriptProperties().getProperty("custom_aliases")||"{}"); } catch(e){}
      propsObj[aliasFrom.toLowerCase()] = aliasTo;
      PropertiesService.getScriptProperties().setProperty("custom_aliases", JSON.stringify(propsObj));
      replyLineWithQuickReply(replyToken,"✅ บันทึก alias แล้วค่ะ\n\""+aliasFrom+"\" → \""+aliasTo+"\"\n\nพิมพ์ menu check เพื่อดูรายการที่เหลือ",["menu check","plan 7"]); return true;
    }
  }

  // ★ NEW v3.4 — "แก้ล่าสุด" / "ลบล่าสุด" — quick edit/cancel
  if (lower==="ลบล่าสุด"||lower==="ยกเลิกล่าสุด") {
    var lastRow = getLatestUniqueOrderRows_(1);
    if (!lastRow.length) { replyLineWithQuickReply(replyToken,"ไม่พบออเดอร์ล่าสุดค่ะ",QR_MAIN); return true; }
    var lastId = lastRow[0].orderId;
    replyLineWithQuickReply(replyToken,"⚠️ ยืนยันยกเลิก Order: "+lastId+"?\nพิมพ์ cancel "+lastId+" confirm",["cancel "+lastId+" confirm","search order "+lastId]); return true;
  }
  if (/^แก้ล่าสุด\s*(.*)$/.test(trimmed)) {
    var lastRow2 = getLatestUniqueOrderRows_(1);
    if (!lastRow2.length) { replyLineWithQuickReply(replyToken,"ไม่พบออเดอร์ล่าสุดค่ะ",QR_MAIN); return true; }
    var lastId2 = lastRow2[0].orderId;
    var editSuffix = trimmed.replace(/^แก้ล่าสุด\s*/,"").trim();
    if (editSuffix) {
      var pEd2 = parseEditCommand_("edit "+lastId2+" "+editSuffix);
      if (pEd2) { var rEd2 = updateOrderField_(pEd2.orderId,pEd2.fieldMap,userId||"line"); replyLineWithQuickReply(replyToken,rEd2.ok?"อัปเดตแล้ว: "+lastId2:rEd2.message,QR_MAIN); return true; }
    }
    replyLineWithQuickReply(replyToken,"📝 แก้ออเดอร์ล่าสุด: "+lastId2+"\nตัวอย่าง: แก้ล่าสุด note=ส่งรอบเช้า\nหรือใช้: edit "+lastId2+" field=value",["search order "+lastId2]); return true;
  }

  if (lower==="help") { replyFlexWithQuickReply(replyToken, buildHelpFlex(), QR_HELP); return true; }
  // เลิกทำ action ล่าสุด
  if (lower==="เลิกทำ"||lower==="undo"||lower==="↩️ เลิกทำ"||lower==="ย้อนกลับ"||lower==="ยกเลิกล่าสุดที่ทำ") {
    return handleUndo_(replyToken, userId);
  }
  // พิมพ์ "สรุป" เปล่าๆ → flex hub เลือกแบบ (ไม่ต้องจำ syntax)
  if (lower==="สรุป"||lower==="เมนูสรุป"||lower==="summary menu") {
    replyFlexWithQuickReply(replyToken, buildSummaryHubFlex_(), QR_SUMMARY); return true;
  }
  if (lower==="summary pending"||lower==="pending"||lower==="ค้างชำระ"||lower==="ยอดค้าง") {
    replyFlexWithQuickReply(replyToken, buildPendingPaymentFlex(), QR_SUMMARY); return true;
  }
  // summary 7 → text แยกร้าน (เดิม flex card)
  if (lower==="summary 7") { replyLineWithQuickReply(replyToken, buildSummary7TextByShop_(), QR_SUMMARY); return true; }
  if (lower==="summary 7 card"||lower==="summary 7 flex") { replyFlexWithQuickReply(replyToken, buildSummary7DaysFlex(), QR_SUMMARY); return true; }
  // รับทั้ง "summary" และ alias: summary today / summary วันนี้
  if (lower==="summary"||lower==="summary today"||lower==="summary วันนี้") { replyFlexWithQuickReply(replyToken, buildSummaryDateFlex(getTodayTH(),"วันนี้"), QR_SUMMARY); return true; }
  if (lower==="summary พรุ่งนี้"||lower==="summary tomorrow") { replyFlexWithQuickReply(replyToken, buildSummaryDateFlex(getTomorrowTH(),"พรุ่งนี้"), QR_SUMMARY); return true; }

  // รับทั้ง "summary 04/06/2569", "summary[04/06/2569]", "summary [04/06/2569]"
  var summaryDateM = trimmed.match(/^summary\s*\[?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s*\]?\s*$/i);
  if (summaryDateM) {
    var d = formatDateTH(summaryDateM[1]);
    Logger.log("[INFO] summary date | input="+summaryDateM[1]+" | normalized="+d);
    replyFlexWithQuickReply(replyToken, buildSummaryDateFlex(d,"วันที่ "+d), QR_SUMMARY); return true;
  }
  if (/^summary month/i.test(lower)) {
    var rm = normalizeMonthInput(trimmed.slice(13).trim()) || _currentMonthKey_();
    replyFlexWithQuickReply(replyToken, buildSummaryMonthFlex(rm), QR_SUMMARY); return true;
  }
  if (/^summary channel/i.test(lower)) {
    var rc = normalizeMonthInput(trimmed.slice(15).trim()) || _currentMonthKey_();
    replyFlexWithQuickReply(replyToken, buildSummaryChannelFlex(rc), QR_SUMMARY); return true;
  }
  if (/^summary top (menu )?rev(enue)?/i.test(lower)) {
    var rr = normalizeMonthInput(trimmed.replace(/^summary top (menu )?rev(enue)?/i,"").trim()) || _currentMonthKey_();
    replyFlexWithQuickReply(replyToken, buildSummaryTopMenuRevFlex(rr), QR_SUMMARY); return true;
  }
  if (/^summary top menu/i.test(lower)) {
    var rt = normalizeMonthInput(trimmed.slice(16).trim()) || _currentMonthKey_();
    replyFlexWithQuickReply(replyToken, buildSummaryTopMenuFlex(rt), QR_SUMMARY); return true;
  }
  // "ส่งวันนี้" — to-do ส่งของ ซ่อนที่ส่งแล้ว/เลยเวลา
  if (/^(ส่งวันนี้|ต้องส่งวันนี้|วันนี้ส่งอะไร|ส่งของวันนี้|delivery today)$/i.test(lower)) {
    replyFlexWithQuickReply(replyToken, buildDeliveryTodayFlex_(getTodayTH(),"วันนี้",false),
      ["ส่งวันนี้ทั้งหมด","summary","plan 7","help"]); return true;
  }
  if (/^(ส่งวันนี้ทั้งหมด|ส่งวันนี้ทั้งหมดรวมส่งแล้ว)$/i.test(lower)) {
    replyFlexWithQuickReply(replyToken, buildDeliveryTodayFlex_(getTodayTH(),"วันนี้ (รวมส่งแล้ว)",true),
      ["ส่งวันนี้","summary","plan 7"]); return true;
  }
  if (lower==="search today") {
    var today = getTodayTH();
    // ซ่อนออเดอร์ที่ส่งแล้ว/เลยเวลา — เหลือเฉพาะที่ยังต้องทำ
    var todayRows = getRowsByDeliveryDateFast_(today).filter(function(r){ return !isRowCancelled(r); });
    replyFlexWithQuickReply(replyToken, buildOrderListFlex(todayRows,"ออเดอร์วันนี้ ("+today+")"), ["ส่งวันนี้"].concat(QR_SEARCH)); return true;
  }
  if (lower==="search latest") {
    replyFlexWithQuickReply(replyToken, buildOrderListFlex(getLatestUniqueOrderRows_(5),"5 ออเดอร์ล่าสุด"), QR_SEARCH); return true;
  }
  // search order/phone/menu — รับ bracket + space optional
  var ordM = trimmed.match(/^search\s+order\s*\[?\s*(.+?)\s*\]?\s*$/i);
  if (ordM) {
    var kOrd = ordM[1].trim().toLowerCase();
    var rOrd = getOrderRows(function(r){ return safeLower_(r.orderId).indexOf(kOrd)>-1&&r.grandTotal!==""; },50);
    Logger.log("[INFO] search order | input="+kOrd+" | rows="+rOrd.length);
    replyFlexWithQuickReply(replyToken, buildOrderListFlex(rOrd,"Order ID: "+kOrd), QR_SEARCH); return true;
  }
  var phM2 = trimmed.match(/^search\s+phone\s*\[?\s*(.+?)\s*\]?\s*$/i);
  if (phM2) {
    var kPh = phM2[1].trim();
    var rPh = getOrderRows(function(r){ return String(r.phone||"").indexOf(kPh)>-1&&r.grandTotal!==""; },50);
    replyFlexWithQuickReply(replyToken, buildOrderListFlex(rPh,"เบอร์: "+kPh), QR_SEARCH); return true;
  }
  var mnM2 = trimmed.match(/^search\s+menu\s*\[?\s*(.+?)\s*\]?\s*$/i);
  if (mnM2) {
    var kMn = mnM2[1].trim();
    var rMn = getOrderRows(function(r){ return safeLower_(r.menuName).indexOf(kMn.toLowerCase())>-1; },100);
    replyFlexWithQuickReply(replyToken, buildOrderListFlex(rMn,"เมนู: "+kMn), QR_SEARCH); return true;
  }
  // รับทั้ง "search date 04/06/2569", "search date[04/06/2569]", "search date [04/06/2569]"
  // bug เดิม: regex บังคับ space → user พิมพ์ติดกันแล้วตก smartSearch
  var dateRangeM = trimmed.match(/^search\s+date\s*\[?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s*-\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s*\]?\s*$/i);
  if (dateRangeM) {
    var range = parseDateRange(dateRangeM[1] + "-" + dateRangeM[2]);
    if (range) {
      replyFlexWithQuickReply(replyToken,
        buildOrderListFlex(getOrderRowsByDateRange(range.start,range.end), range.startStr+" — "+range.endStr), QR_SEARCH);
      return true;
    }
  }
  var dateSingleM = trimmed.match(/^search\s+date\s*\[?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s*\]?\s*$/i);
  if (dateSingleM) {
    var sd = formatDateTH(dateSingleM[1]);
    var sdRows = getRowsByDeliveryDateFast_(sd);
    Logger.log("[INFO] search date | input="+dateSingleM[1]+" | normalized="+sd+" | rows="+sdRows.length);
    replyFlexWithQuickReply(replyToken, buildOrderListFlex(sdRows,"วันที่ "+sd), QR_SEARCH); return true;
  }
  if (/^search \w+:.+/i.test(lower)) {
    if (handleSmartSearchFilter(trimmed.slice(7).trim(), replyToken)) return true;
  }
  if (/^search .+/i.test(lower)) {
    var kw = trimmed.slice(7).trim();
    replyFlexWithQuickReply(replyToken, buildOrderListFlex(smartSearch(kw),"ค้นหา: "+kw), qrAfterSearch(kw)); return true;
  }
  if (lower==="log today") {
    var lg = getLogSheet_().getDataRange().getValues().slice(1).filter(function(r){ return String(r[1]||"")===getTodayTH(); });
    if (!lg.length) replyFlexWithQuickReply(replyToken, buildAlertFlex("📋 ไม่มี log วันนี้",getTodayTH(),"#AAAAAA"), QR_MAIN);
    else replyLineWithQuickReply(replyToken,"📋 log วันนี้ "+getTodayTH()+" ("+lg.length+" รายการ)",QR_MAIN);
    return true;
  }
  if (/^log date \[?\d{1,2}\/\d{1,2}\/\d{4}\]?$/.test(lower)) {
    var ld = trimmed.slice(9).replace(/[\[\]]/g,"").trim();
    var lg2 = getLogSheet_().getDataRange().getValues().slice(1).filter(function(r){ return String(r[1]||"")===ld; });
    if (!lg2.length) replyFlexWithQuickReply(replyToken, buildAlertFlex("📋 ไม่มี log","วันที่ "+ld,"#AAAAAA"), QR_MAIN);
    else replyLineWithQuickReply(replyToken,"📋 log วันที่ "+ld+" ("+lg2.length+" รายการ)",QR_MAIN);
    return true;
  }
  if (lower==="clear log") {
    replyLineWithQuickReply(replyToken,"พิมพ์ \"clear log confirm\" เพื่อลบ log ทั้งหมด",["clear log confirm","log today"]); return true;
  }
  if (lower==="clear log confirm") {
    var sh = getLogSheet_();
    if (sh.getLastRow()>1) sh.deleteRows(2, sh.getLastRow()-1);
    replyFlexWithQuickReply(replyToken, buildAlertFlex("🧹 ลบ log แล้ว","","#4CAF50"), QR_MAIN); return true;
  }
  if (/^cancel\s+\S+\s+confirm$/i.test(lower)) {
    var cId = trimmed.replace(/^cancel\s+/i,"").replace(/\s+confirm$/i,"").trim();
    // เก็บ status เดิมก่อนยกเลิก เพื่อ undo
    var cPrevRows = findOrderRowsById_(cId);
    var cPrevStatus = cPrevRows.length ? (cPrevRows[0].status||"preparing") : "preparing";
    var rsc = cancelOrder_(cId, userId||"line");
    if (rsc.ok) recordUndo_({type:"cancel", orderId:cId, prevStatus:cPrevStatus, label:"ยกเลิก "+cId});
    replyLineWithQuickReply(replyToken, rsc.ok?"❌ ยกเลิกแล้ว: "+cId+"\n\n💡 พิมพ์ \"เลิกทำ\" ถ้ากดผิด":rsc.message, QR_MAIN); return true;
  }
  if (/^cancel\s+\S+$/i.test(lower)) {
    var askId = trimmed.replace(/^cancel\s+/i,"").trim();
    if (!findOrderRowsById_(askId).length) { replyLineWithQuickReply(replyToken,"ไม่พบ Order ID: "+askId,QR_MAIN); return true; }
    replyFlexWithQuickReply(replyToken,
      buildAlertFlex("⚠️ ยืนยันยกเลิก",askId+"\nพิมพ์ cancel "+askId+" confirm","#F44336"),
      ["cancel "+askId+" confirm","search order "+askId]);
    return true;
  }
  if (/^status\s+\S+\s+\S+$/i.test(lower)) {
    var mSt = trimmed.match(/^status\s+(\S+)\s+(\S+)$/i);
    var rSt = updateOrderStatus_(mSt[1], mSt[2], userId||"line");
    replyLineWithQuickReply(replyToken, rSt.ok?"อัปเดตสถานะแล้ว: "+mSt[1]+" → "+mSt[2]:rSt.message, QR_MAIN); return true;
  }
  if (/^edit\s+\S+\s+.+$/i.test(lower)) {
    var pEd = parseEditCommand_(trimmed);
    if (!pEd) { replyLineWithQuickReply(replyToken,"รูปแบบ edit ไม่ถูกต้อง",QR_MAIN); return true; }
    var rEd = updateOrderField_(pEd.orderId, pEd.fieldMap, userId||"line");
    replyLineWithQuickReply(replyToken, rEd.ok?"อัปเดตแล้ว: "+pEd.orderId:rEd.message, QR_MAIN); return true;
  }
  if (lower==="weekly summary"||lower==="สรุปสัปดาห์"||lower==="สรุปสัปดาห์นี้") {
    weeklyPushSummary();
    replyFlexWithQuickReply(replyToken, buildAlertFlex("📊 ส่งสรุปสัปดาห์แล้วค่ะ","ตรวจสอบใน chat ได้เลย","#4CAF50"), QR_MAIN); return true;
  }
  if (lower==="setup weekly"||lower==="ตั้ง weekly trigger") {
    replyFlexWithQuickReply(replyToken, buildAlertFlex("⏰ "+setupWeeklyTrigger(),"push สรุปทุกวันจันทร์ 08:00","#4CAF50"), QR_MAIN); return true;
  }

  // ============================================================
  // แก้ไข/เพิ่มออเดอร์ — guided picker
  // ============================================================
  // "แก้ไขออเดอร์" / "เพิ่มออเดอร์" → แสดง list ให้เลือกใบ
  if (/^(แก้ไขออเดอร์|แก้ออเดอร์|edit order)$/i.test(lower)) {
    replyFlexWithQuickReply(replyToken, buildOrderPickerFlex_("edit"), ["search latest","plan 7","help"]); return true;
  }
  if (/^(เพิ่มออเดอร์|เพิ่มเมนู|เพิ่มรายการ|add item|add order)$/i.test(lower)) {
    replyFlexWithQuickReply(replyToken, buildOrderPickerFlex_("add"), ["search latest","plan 7","help"]); return true;
  }

  // "เพิ่มเมนู ORD-xxx" (กดจากปุ่ม picker) → เข้า state รอ paste รายการ
  var addPickM = trimmed.match(/^เพิ่มเมนู\s+(ORD-\d{8}-\d{6})$/i);
  if (addPickM) {
    var addOid = addPickM[1].toUpperCase();
    var addRows = findOrderRowsById_(addOid);
    if (!addRows.length) { replyLineWithQuickReply(replyToken,"ไม่พบ Order: "+addOid,QR_MAIN); return true; }
    var addMain = addRows.find(function(r){return toNumber(r.grandTotal)>0;})||addRows[0];
    setUserState(userId, {step:"ADD_ITEMS_TO_ORDER", targetOrderId:addOid});
    replyLineWithQuickReply(replyToken,
      "➕ เพิ่มเมนูเข้า Order: "+addOid+"\n👤 "+(addMain.customerName||"-")+"\n💰 ยอดปัจจุบัน "+toNumber(addMain.grandTotal).toLocaleString()+"฿\n\n📝 พิมพ์รายการที่จะเพิ่ม (หลายบรรทัดได้) เช่น:\nเค้กส้ม 1 วง 490฿\nเค้กช็อค 1 วง 750฿\n\nหรือพิมพ์ \"ยกเลิก\" เพื่อออก",
      ["ยกเลิก"]);
    return true;
  }

  // "แก้ ORD-xxx" (กดจากปุ่ม picker) → แสดงวิธีแก้
  var editPickM = trimmed.match(/^แก้\s+(ORD-\d{8}-\d{6})$/i);
  if (editPickM) {
    var editOid = editPickM[1].toUpperCase();
    var eRows = findOrderRowsById_(editOid);
    if (!eRows.length) { replyLineWithQuickReply(replyToken,"ไม่พบ Order: "+editOid,QR_MAIN); return true; }
    replyLineWithQuickReply(replyToken,
      "✏️ แก้ Order: "+editOid+"\n\nเลือกสิ่งที่ต้องการแก้:\n• เพิ่มเมนู → พิมพ์ \"เพิ่มเมนู "+editOid+"\"\n• แก้วันส่ง → edit "+editOid+" date=DD/MM/YYYY\n• แก้เวลา → edit "+editOid+" time=HH:MM\n• แก้ note → edit "+editOid+" note=...\n• ยกเลิกใบนี้ → cancel "+editOid+" confirm",
      ["เพิ่มเมนู "+editOid, "search order "+editOid, "cancel "+editOid+" confirm"]);
    return true;
  }

  // ============================================================
  // แก้/เพิ่มออเดอร์ด้วยชื่อลูกค้า + ภาษาคน (บรรทัดเดียว)
  // "ข้าวฟ่าง เพิ่มเค้กส้ม 1 วง 490" / "ข้าวฟ่าง เอามะพร้าวออก"
  // "ข้าวฟ่าง เปลี่ยนมะพร้าวเป็นช็อค" / "ข้าวฟ่าง ลดมะพร้าวเหลือ 1"
  // ============================================================
  var custEdit = parseCustomerEditCommand_(trimmed);
  if (custEdit) {
    var found = findLatestOrderByCustomerName_(custEdit.customer);
    if (!found) {
      // หาไม่เจอชื่อ → ไม่จับ (ปล่อยให้ flow อื่นจัดการ เช่น parse เป็น order ใหม่)
      // แต่ถ้า action ชัดเจน + detail มีเมนู → แจ้งว่าไม่เจอลูกค้า
      if (custEdit.detail) {
        replyLineWithQuickReply(replyToken,
          "❓ ไม่เจอออเดอร์ของ \""+custEdit.customer+"\" ค่ะ\nลองเช็คชื่อ หรือพิมพ์ \"แก้ไขออเดอร์\" เพื่อเลือกจากรายการ",
          ["แก้ไขออเดอร์","search "+custEdit.customer,"search latest"]);
        return true;
      }
    } else {
      var ceOid = found.orderId;
      var ceRes, ceMsg;
      var ad = custEdit.action, dt = custEdit.detail;

      // เพิ่ม: "เพิ่มเค้กส้ม 1 วง 490" หรือ "เพิ่ม เค้กส้ม 1 490"
      if (ad === "เพิ่ม") {
        var addItems = parseItemsFlexible_(dt);
        if (!addItems.length) {
          var tmpO = parseShortCafeOrder_(dt);
          if (tmpO && tmpO.items) addItems = tmpO.items;
        }
        if (!addItems.length) {
          replyLineWithQuickReply(replyToken, "พิมพ์เมนูที่จะเพิ่มด้วยค่ะ เช่น \""+custEdit.customer+" เพิ่มเค้กส้ม 1 วง 490\"", ["search order "+ceOid]); return true;
        }
        ceRes = appendItemsToOrder_(ceOid, addItems, userId||"line");
        if (ceRes.ok) {
          recordUndo_({type:"save", orderId:ceOid, label:"เพิ่มเมนู "+found.main.customerName});
          ceMsg = "✅ เพิ่มให้ "+found.main.customerName+" แล้วค่ะ\n+"+ceRes.addedCount+" รายการ\n💰 ยอดใหม่ "+ceRes.newGrand.toLocaleString()+"฿";
        }
      }
      // เอาออก/ลบ: "เอามะพร้าวออก" / "ลบมะพร้าว"
      else if (ad === "เอา" || ad === "เอาออก" || ad === "ลบ") {
        var rmMenu = dt.replace(/ออก$/,"").trim();
        ceRes = removeItemFromOrder_(ceOid, rmMenu, userId||"line");
        if (ceRes.ok) ceMsg = "✅ เอา \""+ceRes.removed+"\" ออกจากออเดอร์ "+found.main.customerName+" แล้วค่ะ\n💰 ยอดใหม่ "+ceRes.newGrand.toLocaleString()+"฿";
      }
      // เปลี่ยน X เป็น Y
      else if (ad === "เปลี่ยน") {
        var chg = dt.match(/^(.+?)\s*เป็น\s*(.+)$/);
        if (!chg) { replyLineWithQuickReply(replyToken, "พิมพ์แบบนี้ค่ะ: \""+custEdit.customer+" เปลี่ยนมะพร้าวเป็นช็อค\"", ["search order "+ceOid]); return true; }
        ceRes = replaceItemInOrder_(ceOid, chg[1].trim(), chg[2].trim(), userId||"line");
        if (ceRes.ok) ceMsg = "✅ เปลี่ยน \""+ceRes.from+"\" → \""+ceRes.to+"\" แล้วค่ะ\n💰 ยอดใหม่ "+ceRes.newGrand.toLocaleString()+"฿";
      }
      // ลด X เหลือ N
      else if (ad === "ลด") {
        var red = dt.match(/^(.+?)\s*เหลือ\s*(\d+)/);
        if (!red) { replyLineWithQuickReply(replyToken, "พิมพ์แบบนี้ค่ะ: \""+custEdit.customer+" ลดมะพร้าวเหลือ 1\"", ["search order "+ceOid]); return true; }
        ceRes = reduceItemInOrder_(ceOid, red[1].trim(), parseInt(red[2],10), userId||"line");
        if (ceRes.ok) ceMsg = "✅ ลด \""+ceRes.menu+"\" เหลือ "+ceRes.qty+" แล้วค่ะ\n💰 ยอดใหม่ "+ceRes.newGrand.toLocaleString()+"฿";
      }

      if (ceRes && ceRes.ok) {
        replyLineWithQuickReply(replyToken, ceMsg+"\n📋 "+ceOid, ["search order "+ceOid, "↩️ เลิกทำ", "plan 7"]);
        return true;
      } else if (ceRes) {
        replyLineWithQuickReply(replyToken, "❌ "+(ceRes.message||"แก้ไม่สำเร็จ")+"\nOrder: "+ceOid, ["search order "+ceOid]); return true;
      }
    }
  }

  // ตั้ง trigger แจ้งเตือนเวลาส่ง — ทุก 5 นาที
  if (lower==="setup delivery"||lower==="setup delivery notify"||lower==="ตั้งแจ้งเตือนส่ง"||lower==="ตั้งแจ้งเตือนเวลาส่ง") {
    replyFlexWithQuickReply(replyToken, buildAlertFlex("🔔 "+setupDeliveryNotifyTrigger(),"เช็คทุก 5 นาที — แจ้งในกลุ่ม","#FF6B35"), QR_MAIN); return true;
  }

  // ทดสอบแจ้งเตือนเดี๋ยวนี้
  if (lower==="test delivery noti"||lower==="ทดสอบแจ้งเตือนส่ง"||lower==="run notify now") {
    notifyDueDeliveries_();
    replyLineWithQuickReply(replyToken, "✅ เรียก notifyDueDeliveries_ แล้วค่ะ\nดู log ใน Apps Script ว่ามีออเดอร์ที่ถึงเวลาไหม", ["plan 7","summary","help"]); return true;
  }

  // สรุปงานเช้า — ตั้ง trigger 7:00
  if (lower==="setup morning"||lower==="ตั้งสรุปเช้า"||lower==="ตั้งแจ้งเตือนเช้า") {
    replyFlexWithQuickReply(replyToken, buildAlertFlex("☀️ "+setupMorningTrigger(),"push เข้ากลุ่มทุกเช้า 7:00","#FF9800"), QR_MAIN); return true;
  }
  // ทดสอบสรุปเช้าเดี๋ยวนี้ (push เข้ากลุ่มจริง)
  if (lower==="test morning"||lower==="ทดสอบสรุปเช้า") {
    notifyMorningBriefing_();
    replyLineWithQuickReply(replyToken, "✅ ส่งสรุปเช้าเข้ากลุ่มแล้วค่ะ (ถ้า register กลุ่มไว้)\nถ้าไม่เข้า → เรียก \"ไก่จ๋า\" ในกลุ่มก่อน", ["ส่งวันนี้","plan 7","help"]); return true;
  }
  // ดูตัวอย่างสรุปเช้าในแชทนี้ (ไม่ push กลุ่ม)
  if (lower==="สรุปเช้า"||lower==="งานเช้า"||lower==="งานวันนี้") {
    replyLineWithQuickReply(replyToken, buildMorningBriefingText_(getTodayTH()), ["ส่งวันนี้","plan 7","summary"]); return true;
  }

  // ดูกลุ่มที่ register ไว้
  if (lower==="show notify groups"||lower==="กลุ่มแจ้งเตือน") {
    var grps = getNotifyGroupIds_();
    var msg = "📋 กลุ่มแจ้งเตือน ("+grps.length+" กลุ่ม):\n" + (grps.length?grps.map(function(g,i){return (i+1)+". "+g.substring(0,20)+"...";}).join("\n"):"(ยังไม่มี — เรียก \"ไก่จ๋า\" ในกลุ่มเพื่อ register)");
    replyLineWithQuickReply(replyToken, msg, ["help"]); return true;
  }

  // delivery status update command
  // รูปแบบ: delivery ORD-xxx รับงาน|ออกส่ง|ส่งแล้ว|ส่งไม่สำเร็จ
  var deliveryStatusM = trimmed.match(/^delivery\s+(ORD-\d{8}-\d{6})\s+(รับงาน|ออกส่ง|ส่งแล้ว|ส่งไม่สำเร็จ|received|enroute|delivered|failed)$/i);
  if (deliveryStatusM) {
    var dOid = deliveryStatusM[1].toUpperCase();
    var dRawSt = deliveryStatusM[2].toLowerCase();
    var newStatus;
    if (dRawSt==="received"||dRawSt==="รับงาน") newStatus = DELIVERY_STATUS.RECEIVED;
    else if (dRawSt==="enroute"||dRawSt==="ออกส่ง") newStatus = DELIVERY_STATUS.ENROUTE;
    else if (dRawSt==="delivered"||dRawSt==="ส่งแล้ว") newStatus = DELIVERY_STATUS.DELIVERED;
    else if (dRawSt==="failed"||dRawSt==="ส่งไม่สำเร็จ") newStatus = DELIVERY_STATUS.FAILED;
    var dRes = updateOrderStatus_(dOid, newStatus, userId||"line");
    if (dRes.ok) {
      var emoji = newStatus.split(" ")[0];
      var statusName = newStatus;
      // ถ้าส่งแล้ว/ส่งไม่สำเร็จ → mark notified เพื่อกัน reminder ซ้ำ
      if (newStatus===DELIVERY_STATUS.DELIVERED || newStatus===DELIVERY_STATUS.FAILED) {
        markNotified_(dOid);
      }
      replyLineWithQuickReply(replyToken,
        emoji+" อัปเดต Order: "+dOid+"\nสถานะ → "+statusName+"\nโดย: "+nameOf_(userId),
        ["search order "+dOid, "plan 7", "summary urgent"]);
    } else {
      replyLineWithQuickReply(replyToken, "❌ "+(dRes.message||"อัปเดตไม่สำเร็จ"), QR_MAIN);
    }
    return true;
  }

  // ============================================================
  // URGENT FLAG — admin toggle เพื่อ highlight ออเดอร์ด่วน
  // ============================================================
  // urgent ORD-xxx        → mark urgent
  // urgent ORD-xxx off    → unmark
  // unurgent ORD-xxx      → unmark (alias)
  // ด่วน ORD-xxx          → mark urgent (Thai)
  // summary urgent        → list ออเดอร์ด่วนทั้งหมด
  // urgent list           → alias
  // ออเดอร์ด่วน           → alias
  var urgentMatch = trimmed.match(/^(urgent|unurgent|ด่วน|ยกเลิกด่วน)\s+(ORD-\d{8}-\d{6})(\s+(off|on|ปิด|เปิด))?$/i);
  if (urgentMatch) {
    var uVerb = urgentMatch[1].toLowerCase();
    var uOid  = urgentMatch[2].toUpperCase();
    var uMod  = (urgentMatch[4]||"").toLowerCase();
    var turnOn = !(uVerb==="unurgent" || uVerb==="ยกเลิกด่วน" || uMod==="off" || uMod==="ปิด");
    var result = setOrderUrgent_(uOid, turnOn, userId||"line");
    if (result.ok) recordUndo_({type:"urgent", orderId:uOid, prev:!turnOn, label:(turnOn?"ตั้งด่วน ":"ปลดด่วน ")+uOid}); // 
    if (result.ok) {
      var icon = turnOn ? "🚨" : "✅";
      var verb = turnOn ? "ตั้งเป็นออเดอร์ด่วน" : "ปลด urgent";
      replyLineWithQuickReply(replyToken,
        icon + " " + verb + " แล้ว\nOrder: " + uOid + "\n\n" + (turnOn ? "ออเดอร์นี้จะแสดงเด่นๆ ใน plan 7 / summary" : "กลับเป็นปกติแล้ว"),
        ["search order "+uOid, "summary urgent", "plan 7"]);
    } else {
      replyLineWithQuickReply(replyToken, "❌ " + (result.message||"แก้ไม่สำเร็จ"), QR_MAIN);
    }
    return true;
  }
  if (lower==="summary urgent"||lower==="urgent list"||lower==="urgent"||lower==="ออเดอร์ด่วน"||lower==="ด่วน") {
    var uRows = getOrderRows(function(r){
      return isNoteUrgent_(r.note) && !isRowCancelled(r) && r.grandTotal!=="";
    }, 100);
    if (!uRows.length) {
      replyLineWithQuickReply(replyToken, "✅ ไม่มีออเดอร์ด่วนค่ะ", ["plan 7","summary","search today"]); return true;
    }
    replyFlexWithQuickReply(replyToken,
      buildOrderListFlex(uRows, "🚨 ออเดอร์ด่วน ("+uRows.length+" รายการ)"),
      ["summary urgent","plan 7","summary","help"]);
    return true;
  }

  // ★ v3.3 FIX-8 — "ส่งครัว" = confirm ว่าครัวรับทราบ (update status เท่านั้น)
  // ไม่ copy เข้า Kitchen_Queue อีกต่อไป เพราะ plan 7 ดึงจาก Orders โดยตรง
  // รูปแบบ: "ส่งครัว"           → update ออเดอร์ล่าสุด
  // รูปแบบ: "ส่งครัว ORD-xxx"  → ระบุ Order ID
  if (/^ส่งครัว(\s+\S+)?$/.test(trimmed)) {
    var kitOrderId = trimmed.replace(/^ส่งครัว\s*/,"").trim();
    var kitRows;
    if (kitOrderId) {
      kitRows = findOrderRowsById_(kitOrderId);
      if (!kitRows.length) {
        replyLineWithQuickReply(replyToken,"ไม่พบออเดอร์ "+kitOrderId+" ค่ะ",QR_MAIN); return true;
      }
    } else {
      var latestKitRows = getLatestUniqueOrderRows_(1);
      if (!latestKitRows.length) {
        replyLineWithQuickReply(replyToken,"ไม่มีออเดอร์ล่าสุดค่ะ",QR_MAIN); return true;
      }
      kitOrderId = latestKitRows[0].orderId;
      kitRows = findOrderRowsById_(kitOrderId);
    }
    // update เฉพาะ kitchenStatus → "รับงานแล้ว"
    updateOrderField_(kitOrderId, {kitchenStatus:"รับงานแล้ว", status:"preparing"}, userId||"line");
    var kitMsg = "🍳 ครัวรับงานแล้วค่ะ ✅\nOrder ID: "+kitOrderId+
      "\nลูกค้า: "+(kitRows[0].customerName||"-")+
      "\nวันส่ง: "+(kitRows[0].deliveryDate||"-")+
      "\nKitchen Status: รับงานแล้ว\n\n💡 ดูแผนผลิตทั้งหมดพิมพ์ plan 7";
    replyLineWithQuickReply(replyToken, kitMsg, ["plan 7","search order "+kitOrderId,"summary today"]);
    return true;
  }

  // ============================================================
  // พิมพ์ชื่อลูกค้าเปล่าๆ → ดึงออเดอร์ล่าสุดของเจ้านั้น + ปุ่มแก้/เพิ่ม
  // เช่น "ข้าวฟ่าง" → แสดงการ์ดออเดอร์ + ปุ่ม [➕ เพิ่มเมนู][✏️ แก้ไข][🚨 ด่วน]
  // ============================================================
  // เงื่อนไขกันชน: บรรทัดเดียว, 2-25 ตัว, ไม่มีตัวเลขนำ/ราคา, ไม่ใช่คำสั่ง
  if (trimmed.length >= 2 && trimmed.length <= 25 &&
      trimmed.indexOf("\n") === -1 &&
      !/\d{2,}|฿|รวม|ชิ้น|วง|บาท/.test(trimmed) &&
      !/^(summary|search|plan|edit|cancel|status|help|urgent|unurgent|delivery|setup|log|map|menu|test|show|สรุป|ค้นหา|แผน|เพิ่ม|แก้|ลบ|เอา|เปลี่ยน|ลด|ส่ง|undo|เลิกทำ|ไก่จ๋า|บันทึก|ดู|วันนี้|พรุ่งนี้|ยกเลิก)/i.test(trimmed)) {
    var custLook = findLatestOrderByCustomerName_(trimmed);
    if (custLook) {
      var clMain = custLook.main;
      replyFlexWithQuickReply(replyToken,
        {type:"flex", altText:"📋 ออเดอร์ "+trimmed,
         contents:buildOrderCardFlex(custLook.orderId, custLook.rows)},
        ["เพิ่มเมนู "+custLook.orderId, "แก้ "+custLook.orderId, "search "+trimmed, "plan 7"]);
      Logger.log("[INFO] customer lookup by name: "+trimmed+" → "+custLook.orderId);
      return true;
    }
    // ไม่เจอชื่อ → ไม่จับ ปล่อยให้ flow อื่นจัดการต่อ
  }

  return false;
}



function _currentMonthKey_() {
  var now = new Date();
  return String(now.getMonth()+1).padStart(2,"0") + "/" + (now.getFullYear()+543);
}

// ============================================================
// PUSH JOBS
// ============================================================
function notifyUpcomingDeliveries() {
  if (!ENABLE_PUSH_UPCOMING) return;
  var tomorrow = getTomorrowTH();
  var rows     = getRowsByDeliveryDateFast_(tomorrow);
  if (!rows.length) return;
  var orders   = groupRowsByOrder(rows);
  var msg = "📦 เตือนออเดอร์พรุ่งนี้ "+tomorrow+"\n\n";
  orders.slice(0,15).forEach(function(o) {
    var main = o.rows.find(function(r){ return toNumber(r.grandTotal)>0; }) || o.rows[0];
    msg += "• "+(main.customerName||"-")+" | "+(main.deliveryTime||"-")+" | "+toNumber(main.grandTotal).toLocaleString()+" บาท\n";
  });
  msg += "\nกดปุ่ม 🏪 ดูร้านส่ง ด้านล่างเพื่อจัดการ 🐔";
  // [v3.6.1] ส่งเฉพาะกลุ่ม LINE เท่านั้น ไม่ push 1:1 หา admin
  pushTextToGroups_(msg, { withButtons:true, title:"📦 เตือนออเดอร์พรุ่งนี้ "+tomorrow, color:"#FF6B35" });
}

function weeklyPushSummary() {
  var now = new Date(), day = now.getDay();
  var lastMonday = new Date(now); lastMonday.setDate(now.getDate()-(day===0?6:day-1)-7); lastMonday.setHours(0,0,0,0);
  var lastSunday = new Date(lastMonday); lastSunday.setDate(lastMonday.getDate()+6); lastSunday.setHours(23,59,59,999);
  var rows   = getOrderRowsByDateRange(lastMonday, lastSunday);
  var orders = groupRowsByOrder(rows.filter(function(r){ return !isRowCancelled(r); }));
  var totalRevenue=0, totalQty=0, menuQty={}, channelData={};
  rows.forEach(function(r){ if (isRowCancelled(r)) return; totalQty+=toNumber(r.qty); if(r.menuName) menuQty[r.menuName]=(menuQty[r.menuName]||0)+toNumber(r.qty); });
  orders.forEach(function(o){ var main=o.rows.find(function(r){return toNumber(r.grandTotal)>0;})||o.rows[0]; totalRevenue+=toNumber(main.grandTotal); var ch=normalizeChannel(main.channel); channelData[ch]=(channelData[ch]||0)+1; });
  var topMenus    = objectEntries_(menuQty).sort(function(a,b){return b[1]-a[1];}).slice(0,5);
  var topChannels = objectEntries_(channelData).sort(function(a,b){return b[1]-a[1];}).slice(0,4);
  var msg = "📊 สรุปยอดสัปดาห์ที่แล้ว\n"+formatDateTH(lastMonday)+" — "+formatDateTH(lastSunday)+"\n─────────────────\n";
  msg += "🧾 ออเดอร์: "+orders.length+"\n📦 ชิ้น: "+totalQty+"\n💰 รวม: "+totalRevenue.toLocaleString()+" บาท\n─────────────────\n🍰 Top Menu:\n";
  topMenus.forEach(function(e,i){ msg+=(i+1)+". "+e[0]+" — "+e[1]+" ชิ้น\n"; });
  msg += "─────────────────\n📡 Channel:\n";
  topChannels.forEach(function(e){ msg+="• "+e[0]+" — "+e[1]+" ออเดอร์\n"; });
  msg += "─────────────────\nกดปุ่มด้านล่างเพื่อจัดการต่อ 🐔";
  // [v3.6.1] ส่งเฉพาะกลุ่ม LINE เท่านั้น ไม่ push 1:1 หา admin
  pushTextToGroups_(msg, { withButtons:true, title:"📊 สรุปสัปดาห์ที่แล้ว", color:"#7C4DFF" });
}

function setupWeeklyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t){ if(t.getHandlerFunction()==="weeklyPushSummary") ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("weeklyPushSummary").timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(8).create();
  return "✅ ตั้ง Weekly Trigger วันจันทร์ 08:00 แล้วค่ะ";
}

// ============================================================
// DELIVERY DUE NOTIFICATION SYSTEM
// ตรวจทุก 5 นาที — ออเดอร์ที่ deliveryTime ตรงกับเวลาปัจจุบัน
// → push Flex card เข้ากลุ่มที่เคยเรียก "ไก่จ๋า"
// → user กดปุ่ม รับงาน/ออกส่ง/ส่งแล้ว/ส่งไม่สำเร็จ
// ============================================================

var NOTIFY_GROUPS_KEY      = "notify_groups";        // PropertiesService key
var NOTIFY_DUE_MARKER_PFX  = "delivery_noti_";       // <orderId>_<YYYYMMDD>
var DELIVERY_NOTI_WINDOW   = 5;                      // นาที — ±range ที่ตรงกับ trigger interval

// สถานะส่ง — ใช้ใน status column
var DELIVERY_STATUS = {
  RECEIVED:    "🛵 รับงาน",
  ENROUTE:     "🚗 ออกส่ง",
  DELIVERED:   "✅ ส่งแล้ว",
  FAILED:      "⚠️ ส่งไม่สำเร็จ"
};

function registerNotifyGroup_(source) {
  try {
    if (!source || (source.type!=="group" && source.type!=="room")) return false;
    var gid = source.groupId || source.roomId;
    if (!gid) return false;
    var props = PropertiesService.getScriptProperties();
    var listRaw = props.getProperty(NOTIFY_GROUPS_KEY) || "[]";
    var list = [];
    try { list = JSON.parse(listRaw); } catch(e) { list = []; }
    if (list.indexOf(gid) === -1) {
      list.push(gid);
      props.setProperty(NOTIFY_GROUPS_KEY, JSON.stringify(list));
      Logger.log("[INFO] registered notify group: "+gid);
    }
    return true;
  } catch(e) {
    Logger.log("[ERROR] registerNotifyGroup_: "+e.message);
    return false;
  }
}

function getNotifyGroupIds_() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(NOTIFY_GROUPS_KEY) || "[]";
    var list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch(e) { return []; }
}

function pushFlexToGroups_(flexPayload, fallbackText) {
  var groups = getNotifyGroupIds_();
  if (!groups.length) {
    Logger.log("[WARN] no notify groups registered — ตอนเรียก 'ไก่จ๋า' ในกลุ่มเพื่อ register");
    return;
  }
  groups.forEach(function(to) {
    try {
      var msg = JSON.parse(JSON.stringify(flexPayload));
      lineApiRequest_("https://api.line.me/v2/bot/message/push", {to:to, messages:[msg]});
    } catch(e) {
      Logger.log("[ERROR] push flex to group "+to+": "+e.message);
      // fallback ส่ง text
      try {
        lineApiRequest_("https://api.line.me/v2/bot/message/push",
          {to:to, messages:[{type:"text", text:fallbackText||"แจ้งเตือนเวลาส่ง"}]});
      } catch(e2){}
    }
  });
}

// parse "8:30" or "08.30" or "8.30 น." → minutes since midnight
function parseDeliveryTimeMinutes_(timeStr) {
  var s = String(timeStr||"").trim();
  var m = s.match(/(\d{1,2})\s*[:\.]\s*(\d{2})/);
  if (!m) return -1;
  var h  = parseInt(m[1],10), mn = parseInt(m[2],10);
  if (isNaN(h) || isNaN(mn) || h<0 || h>23 || mn<0 || mn>59) return -1;
  return h*60 + mn;
}

function isOrderAlreadyDelivered_(row) {
  var st = String(row.status||"").toLowerCase();
  return st.indexOf("ส่งแล้ว") > -1 || st.indexOf("ส่งไม่สำเร็จ") > -1 ||
         st === "completed" || st === "delivered";
}

function isAlreadyNotified_(orderId) {
  var key = NOTIFY_DUE_MARKER_PFX + orderId + "_" + Utilities.formatDate(new Date(),TIMEZONE,"yyyyMMdd");
  return PropertiesService.getScriptProperties().getProperty(key) === "1";
}

function markNotified_(orderId) {
  var key = NOTIFY_DUE_MARKER_PFX + orderId + "_" + Utilities.formatDate(new Date(),TIMEZONE,"yyyyMMdd");
  PropertiesService.getScriptProperties().setProperty(key, "1");
}

// แจ้งเตือนหลัก — รัน ทุก 5 นาที
function notifyDueDeliveries_() {
  try {
    var today = getTodayTH();
    var rows = getRowsByDeliveryDateFast_(today);
    if (!rows.length) return;
    var orders = groupRowsByOrder(rows);

    var now = new Date();
    var nowMinutes = now.getHours()*60 + now.getMinutes();

    Logger.log("[INFO] notifyDueDeliveries_ checking "+orders.length+" orders | now="+nowMinutes+" min");

    orders.forEach(function(order) {
      var main = order.rows.find(function(r){ return toNumber(r.grandTotal)>0; }) || order.rows[0];
      if (!main) return;
      if (isRowCancelled(main)) return;
      if (isOrderAlreadyDelivered_(main)) return;

      var deliveryMin = parseDeliveryTimeMinutes_(main.deliveryTime);
      if (deliveryMin < 0) return;

      var diff = nowMinutes - deliveryMin;
      // ตรงเวลา (±window): เด้งเลย
      // นานๆ ทีอาจ trigger ช้า — ยอมรับช่วง [-2, +DELIVERY_NOTI_WINDOW] นาที
      if (diff < -2 || diff > DELIVERY_NOTI_WINDOW) return;

      if (isAlreadyNotified_(order.orderId)) return;

      // ส่ง flex card
      var flex = buildDeliveryDueFlex_(order.orderId, main, order.rows);
      var fallback = "🔔 ถึงเวลาส่ง "+(main.deliveryTime||"")+"\n"+
                     (main.customerName||"-")+" | Order: "+order.orderId+
                     "\nรวม "+toNumber(main.grandTotal).toLocaleString()+" บาท"+
                     "\nพิมพ์: delivery "+order.orderId+" ส่งแล้ว";
      pushFlexToGroups_(flex, fallback);
      markNotified_(order.orderId);
      Logger.log("[INFO] notified due delivery: "+order.orderId+" | time="+main.deliveryTime);
    });
  } catch(e) {
    Logger.log("[ERROR] notifyDueDeliveries_: "+e.message+" | stack: "+(e.stack||""));
  }
}

function buildDeliveryDueFlex_(orderId, mainRow, allRows) {
  var time     = mainRow.deliveryTime || "-";
  var cust     = String(mainRow.customerName||mainRow.tableName||"-").trim();
  var location = String(mainRow.location||"-").substring(0,80);
  var phone    = String(mainRow.phone||"");
  var total    = toNumber(mainRow.grandTotal);
  var isUrgent = isNoteUrgent_(mainRow.note);

  // เมนูสรุป (รวม)
  var menuAgg = {};
  allRows.forEach(function(r){
    if (!r.menuName) return;
    var k = r.menuName+"|"+(r.unit||"ชิ้น");
    if (!menuAgg[k]) menuAgg[k] = {n:r.menuName, u:r.unit||"ชิ้น", q:0};
    menuAgg[k].q += toNumber(r.qty);
  });
  var menuList = objectEntries_(menuAgg).map(function(e){return e[1];});
  var itemsText = menuList.slice(0,4).map(function(m){return m.n+" ×"+m.q;}).join(", ");
  if (menuList.length > 4) itemsText += " +" + (menuList.length-4);

  var headerColor = isUrgent ? "#D32F2F" : "#FF6B35";
  var headerTitle = isUrgent ? "🚨 ถึงเวลาส่ง! (ด่วน)" : "🔔 ถึงเวลาส่งแล้ว";

  var bodyContents = [
    {type:"text", text:"👤 "+cust, size:"md", weight:"bold", color:"#333333", wrap:true},
    {type:"text", text:"🆔 "+orderId, size:"xxs", color:"#AAAAAA"},
    {type:"separator", margin:"sm"}
  ];
  if (phone) bodyContents.push({type:"text", text:"📞 "+phone, size:"sm", color:"#555555"});
  if (location && location !== "-")
    bodyContents.push({type:"text", text:"📍 "+location, size:"xs", color:"#555555", wrap:true});
  if (itemsText)
    bodyContents.push({type:"text", text:"🍰 "+itemsText, size:"xs", color:"#555555", wrap:true, margin:"xs"});
  bodyContents.push({type:"box", layout:"horizontal", margin:"sm", contents:[
    {type:"text", text:"💰 รวม", size:"sm", color:"#888888", flex:3},
    {type:"text", text:total.toLocaleString()+"฿", size:"md", color:"#D32F2F", weight:"bold", flex:3, align:"end"}
  ]});

  return {type:"flex", altText:headerTitle+" "+time+" • "+cust,
    contents:{type:"bubble", size:"kilo",
      header:{type:"box", layout:"vertical", backgroundColor:headerColor, paddingAll:"14px", contents:[
        {type:"text", text:headerTitle, size:"xs", color:"#FFE0E0", weight:"bold"},
        {type:"text", text:"⏰ "+time+" น.", size:"xxl", color:"#FFFFFF", weight:"bold"}
      ]},
      body:{type:"box", layout:"vertical", paddingAll:"14px", spacing:"sm", contents:bodyContents},
      footer:{type:"box", layout:"vertical", paddingAll:"10px", spacing:"sm", contents:[
        {type:"box", layout:"horizontal", spacing:"sm", contents:[
          {type:"button", flex:1, height:"sm", style:"primary", color:"#FF9800",
            action:{type:"message", label:"🛵 รับงาน", text:"delivery "+orderId+" รับงาน"}},
          {type:"button", flex:1, height:"sm", style:"primary", color:"#2196F3",
            action:{type:"message", label:"🚗 ออกส่ง", text:"delivery "+orderId+" ออกส่ง"}}
        ]},
        {type:"box", layout:"horizontal", spacing:"sm", contents:[
          {type:"button", flex:1, height:"sm", style:"primary", color:"#4CAF50",
            action:{type:"message", label:"✅ ส่งแล้ว", text:"delivery "+orderId+" ส่งแล้ว"}},
          {type:"button", flex:1, height:"sm", style:"secondary",
            action:{type:"message", label:"⚠️ ส่งไม่สำเร็จ", text:"delivery "+orderId+" ส่งไม่สำเร็จ"}}
        ]},
        // [v3.5.5] row 3 — ดูร้านส่ง + [v0.9] deep link เปิดเว็บตรงใบนี้
        {type:"box", layout:"horizontal", spacing:"sm", contents:[
          {type:"button", flex:1, height:"sm", style:"secondary",
            action:{type:"message", label:"🏪 ร้านส่ง", text:"ดูร้านส่ง"}},
          {type:"button", flex:1, height:"sm", style:"primary", color:"#1E88E5",
            action:{type:"uri", label:"📥 เปิดในเว็บ", uri:LIFF_DASHBOARD_URL+"?order="+orderId}}
        ]}
      ]}
    }};
}

function setupDeliveryNotifyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t){
    if (t.getHandlerFunction()==="notifyDueDeliveries_") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("notifyDueDeliveries_").timeBased().everyMinutes(5).create();
  return "✅ ตั้ง Delivery Notify Trigger ทุก 5 นาทีแล้วค่ะ";
}

// ============================================================
// MORNING BRIEFING — สรุปงานเช้า 7:00 เข้ากลุ่ม
// 3 ส่วน: รายการส่ง (เวลา+ชื่อ) + ผลิตรวม + แยกแต่ละร้าน
// ============================================================
function buildMorningBriefingText_(targetDate) {
  var rows = getRowsByDeliveryDateFast_(targetDate).filter(function(r){ return !isRowCancelled(r); });
  if (!rows.length) {
    return "☀️ สวัสดีค่ะ! งานวันนี้ " + targetDate + "\n─────────────\n🎉 วันนี้ไม่มีออเดอร์ พักผ่อนได้เลยค่ะ";
  }
  var orders = groupRowsByOrder(rows);

  // เรียงตามเวลา (urgent ก่อน → เวลาเช้า→เย็น)
  orders.sort(function(a, b) {
    var mA = a.rows.find(function(r){return toNumber(r.grandTotal)>0;}) || a.rows[0];
    var mB = b.rows.find(function(r){return toNumber(r.grandTotal)>0;}) || b.rows[0];
    var uA = isNoteUrgent_(mA.note) ? 0 : 1, uB = isNoteUrgent_(mB.note) ? 0 : 1;
    if (uA !== uB) return uA - uB;
    return String(mA.deliveryTime||"99:99").localeCompare(String(mB.deliveryTime||"99:99"));
  });

  var out = ["☀️ สวัสดีค่ะ! งานวันนี้ " + targetDate, "─────────────"];

  // ── 1. รายการส่ง ──
  out.push("🚗 ส่ง " + orders.length + " เจ้า:");
  orders.forEach(function(o) {
    var main = o.rows.find(function(r){return toNumber(r.grandTotal)>0;}) || o.rows[0];
    var cust = String(main.customerName||main.tableName||"-").trim();
    var time = main.deliveryTime || "ไม่ระบุเวลา";
    var urgent = isNoteUrgent_(main.note) ? " 🚨" : "";
    out.push("• " + time + " " + cust + urgent);
  });

  // ── 2. ผลิตรวมทุกเจ้า ──
  var menuAgg = {};
  rows.forEach(function(r) {
    if (!r.menuName) return;
    var unit = String(r.unit||"ชิ้น").trim() || "ชิ้น";
    var k = r.menuName + "|||" + unit;
    if (!menuAgg[k]) menuAgg[k] = {menu:r.menuName, unit:unit, qty:0};
    menuAgg[k].qty += toNumber(r.qty);
  });
  var menuLines = objectEntries_(menuAgg).map(function(e){return e[1];})
    .sort(function(a,b){ return b.qty - a.qty; });
  out.push("", "🧁 ต้องทำ (รวมทุกเจ้า):");
  menuLines.forEach(function(ml){ out.push("• " + ml.menu + " " + ml.qty + " " + ml.unit); });

  // ── 3. แยกแต่ละร้าน ──
  out.push("", "📋 แยกแต่ละร้าน:");
  orders.forEach(function(o) {
    var main = o.rows.find(function(r){return toNumber(r.grandTotal)>0;}) || o.rows[0];
    var cust = String(main.customerName||main.tableName||"-").trim();
    var time = main.deliveryTime || "-";
    var urgent = isNoteUrgent_(main.note) ? " 🚨" : "";
    out.push("👤 " + cust + " (" + time + ")" + urgent);
    // รวมเมนูของร้านนี้
    var shopAgg = {};
    o.rows.forEach(function(r){
      if (!r.menuName) return;
      var unit = String(r.unit||"ชิ้น").trim() || "ชิ้น";
      var k = r.menuName + "|||" + unit;
      if (!shopAgg[k]) shopAgg[k] = {menu:r.menuName, unit:unit, qty:0};
      shopAgg[k].qty += toNumber(r.qty);
    });
    objectEntries_(shopAgg).map(function(e){return e[1];}).forEach(function(it){
      out.push("   - " + it.menu + " " + it.qty + " " + it.unit);
    });
  });

  out.push("", "💡 พิมพ์ \"ส่งวันนี้\" ดูที่อยู่+เบอร์ • \"plan 7\" ดูล่วงหน้า");

  // ── 4. กระดานทีม ──
  try {
    var teamBlock = _buildTeamLeaderboardBlock_();
    if (teamBlock) out.push("", teamBlock);
  } catch(e) { Logger.log("[WARN] team leaderboard block: "+e.message); }

  return out.join("\n");
}

function notifyMorningBriefing_() {
  try {
    var today = getTodayTH();
    var text  = buildMorningBriefingText_(today);
    // [v3.5.5] ส่งเป็น flex bubble + ปุ่ม "🏪 ดูร้านส่ง" (ปุ่ม Dashboard ใน footer ลิงก์เดือนปัจจุบันแล้ว)
    pushTextToGroups_(text, {
      withButtons: true,
      title: "☀️ สรุปงานวันนี้ " + today,
      color: "#FF9800"
    });
    Logger.log("[INFO] morning briefing pushed | " + today);
  } catch(e) {
    Logger.log("[ERROR] notifyMorningBriefing_: " + e.message + " | stack: " + (e.stack||""));
  }
}

// push text เข้ากลุ่มที่ register (เหมือน pushFlexToGroups_ แต่ text)
// [v3.5.5] เพิ่ม quick reply buttons ในตัว — บังคับใช้ replyLine API คงไม่ได้ (push ไม่ support QR)
//   วิธีแก้: ห่อข้อความเป็น flex bubble + footer มีปุ่ม "🏪 ดูร้านส่ง" / "👁️ ขอดู" / "plan 7"
function pushTextToGroups_(text, options) {
  var groups = getNotifyGroupIds_();
  if (!groups.length) { Logger.log("[WARN] no notify groups — เรียก 'ไก่จ๋า' ในกลุ่มก่อน"); return; }
  options = options || {};

  // [v3.5.5] ถ้าระบุ withButtons → ส่งเป็น flex bubble แทน text เดี่ยว
  var messages;
  if (options.withButtons) {
    messages = [_buildNotifyFlexBubble_(text, options.title||"🔔 แจ้งเตือน", options.color||"#1565C0")];
  } else {
    var raw = String(text||"").substring(0,4900);
    messages = [{type:"text", text: raw + '\n\n⚙️ ข้อความอัตโนมัติ — โปรดพิมพ์ "ไก่จ๋า" เพื่อปลุกบอทก่อนสั่งงาน'}];
  }

  groups.forEach(function(to) {
    try {
      lineApiRequest_("https://api.line.me/v2/bot/message/push", {to:to, messages:messages});
    } catch(e) { Logger.log("[ERROR] pushTextToGroups_ "+to+": "+e.message); }
  });
}

// [v3.5.5] _buildNotifyFlexBubble_ — wrap text ในกล่อง flex + ปุ่ม "ดูร้านส่ง" / "ขอดู" / "plan 7"
function _buildNotifyFlexBubble_(text, title, headerColor) {
  var t = String(text||"").substring(0, 1900); // flex text limit
  return {
    type:"flex", altText: title+" "+t.substring(0,40).replace(/\n/g," "),
    contents:{type:"bubble", size:"giga",
      header:{type:"box", layout:"vertical", backgroundColor:headerColor||"#1565C0", paddingAll:"14px", contents:[
        {type:"text", text:title, size:"sm", color:"#FFFFFF", weight:"bold"}
      ]},
      body:{type:"box", layout:"vertical", paddingAll:"14px", spacing:"sm", contents:[
        {type:"text", text:t, size:"sm", color:"#333333", wrap:true},
        {type:"separator", margin:"sm"},
        {type:"text", text:'⚙️ ข้อความอัตโนมัติ — โปรดพิมพ์ "ไก่จ๋า" เพื่อปลุกบอทก่อนสั่งงาน', size:"xxs", color:"#888888", wrap:true, margin:"sm"}
      ]},
      footer:{type:"box", layout:"vertical", spacing:"sm", paddingAll:"10px", contents:[
        // row 1: Dashboard (uri)
        {type:"button", height:"sm", style:"primary", color:"#4CAF50",
          action:{type:"uri", label:"📥 เปิด Dashboard",
            uri:LIFF_DASHBOARD_URL+"?month="+Utilities.formatDate(new Date(),"Asia/Bangkok","yyyy-MM")}},
        // row 2: วันนี้ + ด่วน
        {type:"box", layout:"horizontal", spacing:"sm", contents:[
          {type:"button", flex:1, height:"sm", style:"primary", color:"#FF6B35",
            action:{type:"message", label:"📊 วันนี้", text:"summary today"}},
          {type:"button", flex:1, height:"sm", style:"primary", color:"#D32F2F",
            action:{type:"message", label:"🚨 ด่วน", text:"summary urgent"}}
        ]}
      ]}
    }
  };
}

function setupMorningTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t){
    if (t.getHandlerFunction()==="notifyMorningBriefing_") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("notifyMorningBriefing_").timeBased().atHour(7).everyDays(1).create();
  return "✅ ตั้งสรุปงานเช้า 7:00 ทุกวันแล้วค่ะ";
}

// [v3.6.1] keepWarm_ — รัน function เปล่าๆ ทุก 4 นาที กัน Apps Script cold start
//   GAS instance หลังไม่ใช้ 5 นาที จะถูกฆ่า — รอบหน้าโหลด lib + cache miss = 1-2s ช้า
//   วิธีแก้: ทำ heartbeat ทุก 4 นาที = instance ไม่ตาย → API ตอบ <500ms ตลอด
function keepWarm_() {
  try {
    getCacheVersion_();
    // rebuild month index ถ้ายังไม่มี (background — ไม่กระทบ response time)
    var mk = Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM");
    if (!getMonthIndex_(mk)) buildMonthIndex_(mk);
    Logger.log("[INFO] keepWarm_ tick "+new Date().toISOString());
  } catch(e) { Logger.log("[ERROR] keepWarm_: "+e.message); }
}

function setupKeepWarmTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t){
    if (t.getHandlerFunction()==="keepWarm_") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("keepWarm_").timeBased().everyMinutes(5).create();
  return "✅ ตั้ง keep-warm ทุก 5 นาที — API จะตอบเร็วขึ้น";
}

// เรียกใน editor — ทดสอบ briefing เดี๋ยวนี้
function runMorningBriefingNow() { notifyMorningBriefing_(); }

// ============================================================
// [v3.6.2/B5] รายงานเงินรายวัน 21:00 เข้ากลุ่ม
//   ยอดวันนี้: รับแล้วกี่บาท / ค้างจ่ายกี่ราย + ลิงก์ dashboard
// ============================================================
function notifyDailyMoneyReport_() {
  try {
    var today = getTodayTH();
    var rows  = getRowsByDeliveryDateFast_(today);
    if (!rows.length) { Logger.log("[INFO] money report: no orders today"); return; }
    var orders = groupRowsByOrder(rows.filter(function(r){ return !isRowCancelled(r); }));

    var paidTotal = 0, paidCount = 0, unpaidTotal = 0, unpaidNames = [];
    orders.forEach(function(o) {
      var main = o.rows.find(function(r){ return toNumber(r.grandTotal)>0; }) || o.rows[0];
      var total = toNumber(main.grandTotal);
      var ps = String(main.paymentStatus||"").toLowerCase();
      var isPaid = ps.indexOf("paid") >= 0 || ps.indexOf("จ่ายแล้ว") >= 0 || ps === "not required";
      if (isPaid) { paidTotal += total; paidCount++; }
      else { unpaidTotal += total; unpaidNames.push((main.customerName||"-")+" ("+total.toLocaleString()+"฿)"); }
    });

    var msg = "💰 สรุปเงินวันนี้ "+today+"\n─────────────────\n";
    msg += "🧾 ออเดอร์: "+orders.length+" ใบ\n";
    msg += "✅ รับแล้ว: "+paidTotal.toLocaleString()+" บาท ("+paidCount+" ใบ)\n";
    msg += "⏳ ค้างจ่าย: "+unpaidTotal.toLocaleString()+" บาท ("+unpaidNames.length+" ราย)\n";
    if (unpaidNames.length) {
      msg += "─────────────────\nค้างจ่าย:\n";
      unpaidNames.slice(0,10).forEach(function(n){ msg += "• "+n+"\n"; });
      if (unpaidNames.length > 10) msg += "...และอีก "+(unpaidNames.length-10)+" ราย\n";
    }
    msg += "─────────────────\nรวมทั้งวัน: "+(paidTotal+unpaidTotal).toLocaleString()+" บาท";

    pushTextToGroups_(msg, { withButtons:true, title:"💰 สรุปเงินวันนี้ "+today, color:"#2E7D32" });
    Logger.log("[INFO] daily money report pushed | "+today+" | paid="+paidTotal+" unpaid="+unpaidTotal);
  } catch(e) {
    Logger.log("[ERROR] notifyDailyMoneyReport_: "+e.message+" | stack: "+(e.stack||""));
  }
}

// เรียกครั้งเดียวใน editor — ตั้ง trigger 21:00 ทุกวัน
function setupDailyMoneyReportTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t){
    if (t.getHandlerFunction()==="notifyDailyMoneyReport_") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("notifyDailyMoneyReport_").timeBased().atHour(21).everyDays(1).create();
  return "✅ ตั้งรายงานเงิน 21:00 ทุกวันแล้วค่ะ";
}

// ทดสอบรายงานเงินเดี๋ยวนี้
function runDailyMoneyReportNow() { notifyDailyMoneyReport_(); }

// ============================================================
// [v3.7] DAILY SUMMARY FLEX — สรุปยอดขายแบบการ์ด (อ้างอิงดีไซน์ SSB BOT)
//   ยังไม่สับเปลี่ยน trigger เดิม — ทดสอบผ่าน runDailySummaryFlexNow() ก่อน
//   ฟีเจอร์: hero number / เทียบเมื่อวาน / เทียบสัปดาห์ก่อน(วันเดียวกัน) / เป้าเดือน progress+pacing
//   ไม่รวม: มัดจำ, Inquiry/Leads — ไม่มี data source ใน sheet ตอนนี้ (phase 2)
// ============================================================

// เรียกครั้งเดียวใน editor — ตั้ง/แก้เป้ายอดขายเดือน (เก็บใน Script Properties ชั่วคราว ยังไม่มี sheet config)
function setMonthlyGoal(amount) {
  var n = parseInt(amount, 10);
  if (isNaN(n) || n <= 0) return "❌ จำนวนไม่ถูกต้อง: " + amount;
  PropertiesService.getScriptProperties().setProperty("MONTHLY_SALES_GOAL", String(n));
  Logger.log("[INFO] setMonthlyGoal: " + n);
  return "✅ ตั้งเป้าเดือนนี้ " + n.toLocaleString() + " บาทแล้วค่ะ";
}

// รวมยอดขายของวันที่ระบุ (Thai date string dd/mm/yyyy-BE) — ไม่รวมออเดอร์ยกเลิก
function getDayRevenueStats_(thDateStr) {
  var rows = getRowsByDeliveryDateFast_(thDateStr);
  var orders = groupRowsByOrder(rows.filter(function(r){ return !isRowCancelled(r); }));
  var total = 0, paidTotal = 0, paidCount = 0, unpaidTotal = 0;
  orders.forEach(function(o) {
    var main = o.rows.find(function(r){ return toNumber(r.grandTotal) > 0; }) || o.rows[0];
    var amt = toNumber(main.grandTotal);
    total += amt;
    var ps = String(main.paymentStatus || "").toLowerCase();
    var isPaid = ps.indexOf("paid") >= 0 || ps.indexOf("จ่ายแล้ว") >= 0 || ps === "not required";
    if (isPaid) { paidTotal += amt; paidCount++; } else { unpaidTotal += amt; }
  });
  return { total: total, count: orders.length, paidTotal: paidTotal, paidCount: paidCount, unpaidTotal: unpaidTotal };
}

// % เปลี่ยนแปลง — null ถ้า baseline เป็น 0 (กันหารด้วย 0 / arrow ขึ้น "–")
function pctChange_(now, base) {
  if (!base) return null;
  return Math.round((now - base) / base * 100);
}
function pctArrow_(pct)  { return pct === null ? "–" : (pct >= 0 ? "▲" : "▼"); }
function pctColor_(pct)  { return pct === null ? "#9E9E9E" : (pct >= 0 ? "#27AE60" : "#E74C3C"); }
function pctText_(pct)   { return pct === null ? "–" : (Math.abs(pct) + "%"); }

// progress bar แบบ filler 2 ฝั่ง — pattern เดียวกับที่ใช้ใน progressBar() เดิม
function flexProgressBar_(pct, fillColor) {
  var p = Math.max(0, Math.min(100, pct));
  return {
    type: "box", layout: "horizontal", height: "10px", margin: "sm", cornerRadius: "4px",
    contents: [
      { type: "box", layout: "vertical", flex: Math.max(1, Math.round(p)), backgroundColor: fillColor, contents: [{type:"filler"}] },
      { type: "box", layout: "vertical", flex: Math.max(1, 100 - Math.round(p)), backgroundColor: "#ECECEC", contents: [{type:"filler"}] }
    ]
  };
}

// สร้าง Flex bubble สรุปยอดขายวันนี้ — return { flexMessage, fallbackText }
function buildDailySummaryFlex_(targetDateTH) {
  var today = targetDateTH || getTodayTH();
  var d = thDateToDate(today);
  if (!d) throw new Error("buildDailySummaryFlex_: invalid date " + today);

  var yesterday = formatDateTH(new Date(d.getTime() - 86400000));
  var lastWeek  = formatDateTH(new Date(d.getTime() - 7 * 86400000));

  var todayStats = getDayRevenueStats_(today);
  var ydStats     = getDayRevenueStats_(yesterday);
  var lwStats     = getDayRevenueStats_(lastWeek);

  var vsYesterday = pctChange_(todayStats.total, ydStats.total);
  var vsLastWeek  = pctChange_(todayStats.total, lwStats.total);

  // เป้าเดือน — ใช้ monthKey เดียวกับ getRowsByMonthFast_ (mm/yyyy-BE)
  var mm = pad2(parseInt(today.split("/")[1], 10));
  var yyyy = today.split("/")[2];
  var goalMonthKey = mm + "/" + yyyy;
  var monthlyGoal = parseInt(PropertiesService.getScriptProperties().getProperty("MONTHLY_SALES_GOAL") || "0", 10);

  var monthRows = getRowsByMonthFast_(goalMonthKey);
  var monthOrders = groupRowsByOrder(monthRows.filter(function(r){ return !isRowCancelled(r); }));
  var monthRevenue = 0;
  monthOrders.forEach(function(o) {
    var main = o.rows.find(function(r){ return toNumber(r.grandTotal) > 0; }) || o.rows[0];
    monthRevenue += toNumber(main.grandTotal);
  });

  var dayOfMonth   = d.getDate();
  var daysInMonth  = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  var timeElapsedPct  = Math.round((dayOfMonth / daysInMonth) * 100);
  var goalProgressPct = monthlyGoal > 0 ? Math.round((monthRevenue / monthlyGoal) * 100) : 0;
  var isBehind = monthlyGoal > 0 && goalProgressPct < timeElapsedPct;
  var projectedClose = dayOfMonth > 0 ? Math.round((monthRevenue / dayOfMonth) * daysInMonth) : 0;

  var monthNamesTH_ = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
  var dayNamesTH_   = ["อา.","จ.","อ.","พ.","พฤ.","ศ.","ส."];
  var headerLabel = dayNamesTH_[d.getDay()] + " " + d.getDate() + " " + monthNamesTH_[d.getMonth()];

  var goalSection = monthlyGoal > 0 ? {
    type: "box", layout: "vertical", spacing: "xs", margin: "md",
    contents: [
      { type: "box", layout: "horizontal", contents: [
        { type: "text", text: "🎯 เป้าเดือน " + monthNamesTH_[d.getMonth()], size: "sm", weight: "bold", flex: 4 },
        { type: "text", text: isBehind ? "⚠" : "✓", size: "sm", color: isBehind ? "#F39C12" : "#27AE60", align: "end", flex: 1 }
      ]},
      flexProgressBar_(goalProgressPct, isBehind ? "#F39C12" : "#27AE60"),
      { type: "text", text: goalProgressPct + "% • เวลาผ่าน " + timeElapsedPct + "% • คาดปิด ฿" + projectedClose.toLocaleString(),
        size: "xxs", color: "#999999", margin: "xs" }
    ]
  } : {
    type: "text", text: "🎯 ยังไม่ตั้งเป้าเดือน — รัน setMonthlyGoal(จำนวน) ในตัวเอดิเตอร์",
    size: "xxs", color: "#CCCCCC", wrap: true, margin: "md"
  };

  var bubble = {
    type: "bubble",
    header: {
      type: "box", layout: "vertical", backgroundColor: "#2C3E50", paddingAll: "16px",
      contents: [
        { type: "text", text: "🌙 สรุปยอดขายวันนี้", color: "#FFFFFF", weight: "bold", size: "md" },
        { type: "text", text: headerLabel, color: "#BDC3C7", size: "sm" }
      ]
    },
    body: {
      type: "box", layout: "vertical", spacing: "md", paddingAll: "16px",
      contents: [
        { type: "text", text: "ยอดขายวันนี้", size: "xs", color: "#888888" },
        { type: "text", text: "฿" + todayStats.total.toLocaleString(), size: "3xl", weight: "bold", color: "#E67E22" },
        { type: "box", layout: "horizontal", contents: [
          { type: "text", text: "เทียบเมื่อวาน", size: "sm", color: "#555555", flex: 3 },
          { type: "text", text: pctArrow_(vsYesterday) + " " + pctText_(vsYesterday), size: "sm", weight: "bold", color: pctColor_(vsYesterday), align: "end", flex: 2 }
        ]},
        { type: "box", layout: "horizontal", contents: [
          { type: "text", text: "เทียบสัปดาห์ก่อน (วันเดียวกัน)", size: "sm", color: "#555555", flex: 3 },
          { type: "text", text: pctArrow_(vsLastWeek) + " " + pctText_(vsLastWeek), size: "sm", weight: "bold", color: pctColor_(vsLastWeek), align: "end", flex: 2 }
        ]},
        { type: "box", layout: "horizontal", contents: [
          { type: "text", text: "ออเดอร์วันนี้", size: "sm", color: "#555555", flex: 3 },
          { type: "text", text: todayStats.count + " ใบ", size: "sm", weight: "bold", align: "end", flex: 2 }
        ]},
        { type: "box", layout: "horizontal", contents: [
          { type: "text", text: "💵 เก็บเงินจริง", size: "sm", color: "#555555", flex: 3 },
          { type: "text", text: "฿" + todayStats.paidTotal.toLocaleString() + " (" + todayStats.paidCount + "/" + todayStats.count + ")", size: "sm", weight: "bold", color: "#27AE60", align: "end", flex: 2 }
        ]},
        { type: "separator", margin: "md" },
        goalSection
      ]
    },
    footer: {
      type: "box", layout: "vertical", contents: [
        { type: "button", style: "primary", color: "#2C3E50",
          action: { type: "uri", label: "📥 เปิดแดชบอร์ด",
            uri: LIFF_DASHBOARD_URL + "?month=" + Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM") } }
      ]
    }
  };

  var altText = "สรุปยอดขายวันนี้ ฿" + todayStats.total.toLocaleString() + " เทียบเมื่อวาน " + pctArrow_(vsYesterday) + pctText_(vsYesterday);
  return {
    flexMessage: { type: "flex", altText: altText, contents: bubble },
    fallbackText: altText
  };
}

// ฟังก์ชันใหม่แยกจาก notifyDailyMoneyReport_ — ทดสอบผ่านก่อนค่อยสับเปลี่ยน trigger
function notifyDailySummaryFlex_() {
  try {
    var today = getTodayTH();
    var built = buildDailySummaryFlex_(today);
    pushFlexToGroups_(built.flexMessage, built.fallbackText);
    Logger.log("[INFO] daily summary flex pushed | " + today);
  } catch (e) {
    Logger.log("[ERROR] notifyDailySummaryFlex_: " + e.message + " | stack: " + (e.stack || ""));
  }
}

// เรียกใน editor — ทดสอบการ์ดเดี๋ยวนี้ ไม่ผ่าน trigger
function runDailySummaryFlexNow() { notifyDailySummaryFlex_(); }

// เรียกเมื่อทดสอบผ่านแล้ว — ลบ trigger เดิม (notifyDailyMoneyReport_) แล้วตั้งตัวใหม่แทนที่ 21:00
function switchToDailySummaryFlexTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    var fn = t.getHandlerFunction();
    if (fn === "notifyDailyMoneyReport_" || fn === "notifyDailySummaryFlex_") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("notifyDailySummaryFlex_").timeBased().atHour(21).everyDays(1).create();
  return "✅ สับเปลี่ยนเป็น Flex card 21:00 แล้วค่ะ (ของเดิม notifyDailyMoneyReport_ ถูกปลด trigger)";
}

// [#quota] เช็คว่าใช้ push quota เดือนนี้ไปกี่ข้อความ + ประเมินว่าจะหมดเร็วแค่ไหน
//   นับจาก: จำนวนกลุ่มที่ลงทะเบียน × จำนวน trigger ที่ยิง push ต่อวัน
//   หมายเหตุ: นับเฉพาะ "การยิง push แน่นอนทุกวัน" — notifyDueDeliveries_ ไม่นับเพราะขึ้นกับจำนวนออเดอร์จริง
function estimateMonthlyPushUsage_() {
  var groups = getNotifyGroupIds_();
  var groupCount = groups.length;

  // trigger ที่ยิง push แน่นอนทุกวัน (ไม่ขึ้นกับเงื่อนไข) + ความถี่
  var dailyFixedTriggers = [
    { name: "notifyMorningBriefing_",    perDay: 1 },
    { name: "notifyUpcomingDeliveries",  perDay: 1 },
    { name: "notifyDailyMoneyReport_ หรือ notifyDailySummaryFlex_", perDay: 1 }
  ];
  var weeklyFixedTriggers = [
    { name: "weeklyPushSummary", perWeek: 1 }
  ];

  var fixedPerDay = dailyFixedTriggers.reduce(function(s, t){ return s + t.perDay; }, 0);
  var fixedPerMonth = fixedPerDay * 30 * groupCount;
  var weeklyPerMonth = weeklyFixedTriggers.reduce(function(s, t){ return s + t.perWeek; }, 0) * 4.3 * groupCount;

  var totalFixed = Math.round(fixedPerMonth + weeklyPerMonth);
  var FREE_QUOTA = 200;
  var remaining = FREE_QUOTA - totalFixed;

  var msg = "📊 ประเมิน push quota รายเดือน\n" +
    "─────────────────\n" +
    "กลุ่มที่ลงทะเบียน: " + groupCount + " กลุ่ม\n" +
    "Fixed trigger/วัน: " + fixedPerDay + " ครั้ง (" + dailyFixedTriggers.map(function(t){return t.name;}).join(", ") + ")\n" +
    "ใช้ไป (fixed only): ~" + totalFixed + " / " + FREE_QUOTA + " ข้อความ\n" +
    "เหลือสำหรับ notifyDueDeliveries_ + ประกาศมือ: ~" + remaining + " ข้อความ\n" +
    "─────────────────\n" +
    (remaining < 50
      ? "⚠️ เหลือน้อย — ออเดอร์จริง + ประกาศมือ จะดันให้หมดเร็วมาก แนะนำอัปเกรดแผน"
      : "✓ พอสำหรับออเดอร์ปกติ แต่เดือนออเดอร์ชุก/ประกาศบ่อยอาจหมดก่อนสิ้นเดือน");

  Logger.log(msg);
  return msg;
}

// [#quota] ปลด trigger ทุกตัวที่กิน push quota ยกเว้น notifyMorningBriefing_ — ใช้ตอนต้องการประหยัด quota เร่งด่วน
//   ตัดแน่ๆ: notifyUpcomingDeliveries (18:00), weeklyPushSummary (จันทร์ 8:00),
//            notifyDailyMoneyReport_/notifyDailySummaryFlex_ (21:00)
//   notifyDueDeliveries_ (ทุก 5 นาที, real-time "ถึงเวลาส่ง") — ยังไม่ตัด รอยืนยันก่อน เพราะกระทบ operation จริง
//   keepWarm_ ไม่แตะ — ไม่ใช้ push API
function disableNonEssentialPushTriggers_() {
  var keep = ["notifyMorningBriefing_", "notifyDueDeliveries_", "keepWarm_"];
  var removed = [];
  ScriptApp.getProjectTriggers().forEach(function(t) {
    var fn = t.getHandlerFunction();
    if (keep.indexOf(fn) === -1 && (
        fn === "notifyUpcomingDeliveries" ||
        fn === "weeklyPushSummary" ||
        fn === "notifyDailyMoneyReport_" ||
        fn === "notifyDailySummaryFlex_"
      )) {
      ScriptApp.deleteTrigger(t);
      removed.push(fn);
    }
  });
  Logger.log("[INFO] disableNonEssentialPushTriggers_: removed=" + JSON.stringify(removed));
  return "✅ ปลด trigger แล้ว: " + (removed.length ? removed.join(", ") : "(ไม่มีอันไหนตั้งอยู่)") +
    "\nเหลือทำงาน: notifyMorningBriefing_ (7:00), notifyDueDeliveries_ (ทุก 5 นาที — ยังไม่ตัด), keepWarm_";
}

// เรียกเมื่อยืนยันแล้วว่าจะตัด notifyDueDeliveries_ ด้วย (ตัดแจ้งเตือน "ถึงเวลาส่ง" แบบ real-time)
function disableDueDeliveriesTriggerToo_() {
  var removed = [];
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === "notifyDueDeliveries_") { ScriptApp.deleteTrigger(t); removed.push("notifyDueDeliveries_"); }
  });
  Logger.log("[INFO] disableDueDeliveriesTriggerToo_: removed=" + JSON.stringify(removed));
  return removed.length
    ? "✅ ปลด notifyDueDeliveries_ แล้ว — เหลือทำงานแค่ notifyMorningBriefing_ (7:00) + keepWarm_"
    : "ℹ️ ไม่พบ trigger notifyDueDeliveries_ ที่ตั้งอยู่ (อาจปลดไปแล้ว)";
}

// ล้าง marker noti เก่า (เก็บไว้ของวันนี้กับเมื่อวาน) — เพื่อกัน properties เต็ม
function cleanupOldNotiMarkers() {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  var keep = [
    NOTIFY_DUE_MARKER_PFX + "*_" + Utilities.formatDate(new Date(),TIMEZONE,"yyyyMMdd"),
    NOTIFY_DUE_MARKER_PFX + "*_" + Utilities.formatDate(new Date(new Date().getTime()-86400000),TIMEZONE,"yyyyMMdd")
  ];
  var todayPfx = Utilities.formatDate(new Date(),TIMEZONE,"yyyyMMdd");
  Object.keys(all).forEach(function(k){
    if (k.indexOf(NOTIFY_DUE_MARKER_PFX) === 0 && k.indexOf(todayPfx) === -1) {
      props.deleteProperty(k);
    }
  });
}

// ============================================================
// DIRECT SHEET EDIT
// ============================================================
function onEdit(e) {
  if (!ENABLE_DIRECT_SHEET_EDIT) return;
  try {
    var range = e.range, sheet = range.getSheet();
    if (sheet.getName()!==SHEET_NAME||range.getRow()<=1) return;
    var row=range.getRow(), col=range.getColumn(), map=getHeaderMap_();
    if (col===map.deliveryDate||col===map.paymentDate)
      sheet.getRange(row,col).setValue(formatDateTH(sheet.getRange(row,col).getValue()));
    if (col===map.deliveryTime)
      sheet.getRange(row,col).setValue(formatTimeTH(sheet.getRange(row,col).getValue()));
    if (col===map.status) {
      var s = normalizeStatus(String(sheet.getRange(row,col).getValue()||"").trim());
      if (s) sheet.getRange(row,col).setValue(s);
    }
    if (map.lastUpdatedAt>0) sheet.getRange(row,map.lastUpdatedAt).setValue(getTimestampTH());
    if (map.lastUpdatedBy>0) sheet.getRange(row,map.lastUpdatedBy).setValue("sheet-edit");
    clearSheetCache();
  } catch(err) { Logger.log("onEdit error: "+err); }
}

// ============================================================
// POSTBACK
// ============================================================
function handlePostbackEvent(event) {
  try {
    var data = event.postback&&event.postback.data ? String(event.postback.data) : ""; if (!data) return false;
    var rt   = event.replyToken;
    if (data==="customer_menu")    { replyFlexWithCustomerQR(rt, buildCakeMenuCarousel(), QR_CUSTOMER_MAIN); return true; }
    if (data==="customer_order")   { startGuidedOrderFlow(rt, getUserIdFromEvent_(event)); return true; }
    if (data==="customer_status")  { return handleCheckStatus(rt, getUserIdFromEvent_(event), null); }
    if (data==="customer_payment") { return handlePaymentNotice(rt, getUserIdFromEvent_(event), "แจ้งโอนเงิน"); }
    if (/^admin_cmd:/i.test(data)) { return handleAdminCommand(data.replace(/^admin_cmd:/i,""), rt, getUserIdFromEvent_(event)); }
    return false;
  } catch(err) { Logger.log("handlePostbackEvent error: "+err); return false; }
}

// ============================================================
// CUSTOMER SHEET / STATE
// ============================================================
function getCustomerSheet() {
  var ss=getSpreadsheet_(), sh=ss.getSheetByName("Customers");
  if (!sh) sh=ss.insertSheet("Customers");
  if (sh.getLastRow()===0) sh.getRange(1,1,1,6).setValues([["User ID","Customer Name","Phone","Last Order ID","Last Updated At","Note"]]);
  return sh;
}

function saveCustomer(userId, customerName, phone, lastOrderId, note) {
  if (!userId) return;
  var sh = getCustomerSheet(), vals = sh.getDataRange().getValues();
  for (var i=1; i<vals.length; i++) {
    if (String(vals[i][0]||"")===String(userId)) {
      sh.getRange(i+1,2).setValue(customerName||vals[i][1]||"");
      sh.getRange(i+1,3).setValue(phone||vals[i][2]||"");
      sh.getRange(i+1,4).setValue(lastOrderId||vals[i][3]||"");
      sh.getRange(i+1,5).setValue(getTimestampTH());
      sh.getRange(i+1,6).setValue(note||vals[i][5]||"");
      return true;
    }
  }
  sh.appendRow([userId||"",customerName||"",phone||"",lastOrderId||"",getTimestampTH(),note||""]);
  return true;
}

function getCustomerNameById(userId) {
  if (!userId) return "";
  var vals = getCustomerSheet().getDataRange().getValues();
  for (var i=1; i<vals.length; i++) if (String(vals[i][0]||"")===String(userId)) return String(vals[i][1]||"");
  return "";
}

function getUserState(userId) {
  if (!userId) return null;
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty("state_"+userId)||"null"); } catch(e) { return null; }
}
function setUserState(userId, state) {
  if (!userId) return;
  PropertiesService.getScriptProperties().setProperty("state_"+userId, JSON.stringify(state||{}));
}
function clearUserState(userId) {
  if (!userId) return;
  PropertiesService.getScriptProperties().deleteProperty("state_"+userId);
}

// ============================================================
// PROMO FLEX
// ============================================================
function buildPromoFlex() {
  return {type:"flex",altText:"🎉 "+SHOP_NAME,contents:{type:"bubble",size:"kilo",
    header:{type:"box",layout:"vertical",backgroundColor:"#F59E0B",paddingAll:"16px",contents:[
      {type:"text",text:"🎉 โปรโมชัน / ข้อมูลร้าน",size:"sm",color:"#FFF7ED",weight:"bold"},
      {type:"text",text:SHOP_NAME,size:"lg",color:"#FFFFFF",weight:"bold",wrap:true}
    ]},
    body:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"16px",contents:[
      {type:"text",text:"• เปิดบิลขั้นต่ำ 1,500 บาท",size:"sm",wrap:true},
      {type:"text",text:"• ต่างจังหวัดส่งแบบคุมอุณหภูมิ",size:"sm",wrap:true},
      {type:"text",text:"• ค่าส่งตามระยะทาง",size:"sm",wrap:true},
      {type:"text",text:"• ออเดอร์ล่วงหน้า 3–5 วัน",size:"sm",wrap:true},
      {type:"text",text:"• จำกัดรอบ 150 ชิ้น/วัน",size:"sm",wrap:true},
      {type:"separator",margin:"md"},
      {type:"text",text:"📍 โซน "+SHOP_AREA,size:"sm",wrap:true},
      {type:"text",text:"🕘 เวลาเปิด "+SHOP_HOURS,size:"sm",wrap:true}
    ]},
    footer:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"12px",contents:[
      {type:"box",layout:"horizontal",spacing:"sm",contents:[
        {type:"button",action:{type:"uri",label:"ดูพิกัดร้าน",uri:SHOP_MAP_URL},style:"secondary",height:"sm",flex:1},
        {type:"button",action:{type:"message",label:"สั่งเค้ก",text:"สั่งเค้ก"},style:"primary",color:"#FF6B6B",height:"sm",flex:1}
      ]},
      {type:"box",layout:"horizontal",spacing:"sm",contents:[
        {type:"button",action:{type:"message",label:"ติดต่อร้าน",text:"ติดต่อร้าน"},style:"secondary",height:"sm",flex:1}
      ]}
    ]}
  }};
}

// ============================================================
// CUSTOMER ORDER CONFIRM FLEX
// ============================================================
function buildCustomerOrderConfirmFlex(data, orderId) {
  return {type:"flex",altText:"✅ รับคำสั่งซื้อแล้ว "+(data.customerName||""),
    contents:{type:"bubble",size:"kilo",
      header:{type:"box",layout:"vertical",backgroundColor:"#FF6B6B",paddingAll:"16px",contents:[
        {type:"text",text:"🎂 รับคำสั่งซื้อแล้ว",size:"sm",color:"#FFECEC",weight:"bold"},
        {type:"text",text:data.customerName||"ลูกค้า",size:"xl",color:"#FFFFFF",weight:"bold",wrap:true}
      ]},
      body:{type:"box",layout:"vertical",paddingAll:"16px",spacing:"sm",contents:[
        {type:"box",layout:"horizontal",contents:[{type:"text",text:"Order ID",size:"xs",color:"#AAAAAA",flex:2},{type:"text",text:orderId||"-",size:"xs",color:"#FF6B6B",flex:3,align:"end",weight:"bold"}]},
        {type:"box",layout:"horizontal",contents:[{type:"text",text:"📅 วันที่ส่ง",size:"sm",color:"#555555",flex:2},{type:"text",text:data.deliveryDate||"-",size:"sm",color:"#333333",flex:3,align:"end"}]},
        data.deliveryTime?{type:"box",layout:"horizontal",contents:[{type:"text",text:"⏰ เวลาส่ง",size:"sm",color:"#555555",flex:2},{type:"text",text:String(data.deliveryTime),size:"sm",color:"#333333",flex:3,align:"end"}]}:null,
        {type:"box",layout:"horizontal",contents:[{type:"text",text:"📡 Channel",size:"sm",color:"#555555",flex:2},{type:"text",text:data.channel||"-",size:"sm",color:"#333333",flex:3,align:"end"}]},
        {type:"box",layout:"horizontal",contents:[{type:"text",text:"🍰 จำนวนรายการ",size:"sm",color:"#555555",flex:2},{type:"text",text:String((data.items||[]).length)+" รายการ",size:"sm",color:"#333333",flex:3,align:"end"}]},
        {type:"separator",margin:"md"},
        {type:"box",layout:"horizontal",backgroundColor:"#FFF1F1",paddingAll:"10px",cornerRadius:"8px",contents:[
          {type:"text",text:"💰 รวมทั้งหมด",size:"md",weight:"bold",color:"#D84343",flex:3},
          {type:"text",text:toNumber(data.grandTotal).toLocaleString()+" บาท",size:"md",weight:"bold",color:"#FF6B6B",flex:3,align:"end"}
        ]}
      ].filter(Boolean)},
      footer:{type:"box",layout:"horizontal",spacing:"sm",paddingAll:"12px",contents:[
        {type:"button",action:{type:"message",label:"เช็คสถานะ",text:"เช็คสถานะ"},style:"secondary",height:"sm",flex:1},
        {type:"button",action:{type:"message",label:"แจ้งโอนเงิน",text:"แจ้งโอนเงิน"},style:"primary",color:"#1565C0",height:"sm",flex:1}
      ]}
    }
  };
}

// ============================================================
// GUIDED ORDER FLOW
// ============================================================
function buildOrderDataFromState(state) {
  var items      = state.items || [];
  var grandTotal = items.reduce(function(s,i){ return s+toNumber(i.itemTotal); },0) + toNumber(state.deliveryFee||0);
  return {
    orderId:       generateOrderId_(),
    deliveryDate:  formatDateTH(state.deliveryDate),
    paymentDate:   formatDateTH(state.paymentDate||state.deliveryDate),
    customerName:  state.customerName||state.tableName||state.location||getCustomerNameById(state.userId)||"ลูกค้า",
    phone:         state.phone||"",
    channel:       state.channel||"LINE",
    orderType:     state.orderType||"Retail",
    tableName:     state.tableName||state.customerName||"LINE Customer",
    deliveryType:  state.deliveryType||"รับเองที่ร้าน",
    deliveryTime:  formatTimeTH(state.deliveryTime||""),
    location:      state.location||"",
    googleMap:     state.googleMap||"",
    deliveryFee:   toNumber(state.deliveryFee||0),
    grandTotal:    grandTotal,
    note:          state.note||"",
    paymentStatus: "Pending",
    status:        "confirmed",
    items:         items
  };
}

// ============================================================
// SLIP HANDLING — ดาวน์โหลดสลิปจาก LINE → อัปขึ้น Drive → ผูกกับ Order
// ============================================================

function handleSlipImage_(event, replyToken, userId) {
  var messageId = event.message.id;
  try {
    // 1. ดาวน์โหลดรูปสลิปจาก LINE Content API
    var contentRes = UrlFetchApp.fetch(
      "https://api-data.line.me/v2/bot/message/" + messageId + "/content",
      { headers: { "Authorization": "Bearer " + LINE_CHANNEL_ACCESS_TOKEN }, muteHttpExceptions: true }
    );
    var code = contentRes.getResponseCode();
    if (code !== 200) {
      Logger.log("[ERROR] slip download HTTP " + code + " for msg " + messageId);
      replyLineWithQuickReply(replyToken, "ดาวน์โหลดสลิปไม่สำเร็จค่ะ ลองส่งใหม่อีกครั้งนะคะ", QR_MAIN);
      return;
    }
    var blob = contentRes.getBlob();

    // 2. อัปขึ้น Drive folder
    var now = new Date();
    var stamp = Utilities.formatDate(now, TIMEZONE, "yyyyMMdd_HHmmss");
    var uidShort = String(userId||"anon").substring(0, 8);
    var fileName = "slip_" + stamp + "_" + uidShort + ".jpg";
    blob.setName(fileName);
    var folder = DriveApp.getFolderById(SLIP_DRIVE_FOLDER_ID);
    var file = folder.createFile(blob);
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(shErr) {
      Logger.log("[WARN] setSharing failed: " + shErr.message);
    }
    var slipUrl  = file.getUrl();
    var slipDate = getTodayTH();
    var slipTime = Utilities.formatDate(now, TIMEZONE, "HH:mm");

    Logger.log("[INFO] slip uploaded | file=" + fileName + " | url=" + slipUrl + " | user=" + userId);

    // 3. หาออเดอร์ pending ของ user
    var pending = getPendingOrdersForUser_(userId, 5);

    // กรณีที่ 1: ไม่มี pending → เก็บสลิปไว้ + ขอ Order ID
    if (!pending.length) {
      setUserState(userId, {
        step: "SLIP_PICK_ORDER",
        slipUrl: slipUrl, slipDate: slipDate, slipTime: slipTime, slipFileName: fileName
      });
      replyLineWithQuickReply(replyToken,
        "📸 รับสลิปแล้วค่ะ (เวลา " + slipTime + " น.)\n\nยังไม่มีออเดอร์ค้างชำระในระบบ\nรบกวนพิมพ์ Order ID ที่ต้องการชำระค่ะ\nเช่น: ORD-09062569-143000\n\nหรือพิมพ์ \"ยกเลิกสลิป\" เพื่อยกเลิก",
        ["search today", "summary pending", "ยกเลิกสลิป"]);
      return;
    }

    // กรณีที่ 2: มี pending เดียว → auto-link ทันที
    if (pending.length === 1) {
      var oid = pending[0].orderId;
      var ok = markOrderPaidWithSlip_(oid, slipUrl, slipDate, slipTime);
      if (ok) {
        if (ENABLE_PUSH_NEW_ORDER) {
          pushNotifyText_("💰 มีสลิปโอนเข้ามาแล้ว\nOrder: " + oid + "\nยอด: " + toNumber(pending[0].grandTotal).toLocaleString() + " บาท\nเวลา: " + slipTime + "\nสลิป: " + slipUrl);
        }
        replyLineWithQuickReply(replyToken,
          "✅ บันทึกการชำระแล้วค่ะ\n📋 Order: " + oid + "\n💰 ยอด: " + toNumber(pending[0].grandTotal).toLocaleString() + " บาท\n📅 " + slipDate + " ⏰ " + slipTime + " น.\n📸 สลิป: บันทึกใน Drive แล้ว",
          ["search order " + oid, "summary"]);
      } else {
        replyLineWithQuickReply(replyToken,
          "📸 รับสลิปไว้แล้ว แต่ไม่สามารถอัปเดต Order " + oid + " ได้\nรบกวนแอดมินตรวจสอบนะคะ\n🔗 " + slipUrl, QR_MAIN);
      }
      return;
    }

    // กรณีที่ 3: หลายออเดอร์ pending → ให้เลือก
    var topN = pending.slice(0, 4);
    var listText = topN.map(function(p, i) {
      return (i + 1) + ". " + p.orderId + " — " + toNumber(p.grandTotal).toLocaleString() + " บาท";
    }).join("\n");
    var qrList = topN.map(function(p) { return "ชำระ " + p.orderId; });
    qrList.push("ยกเลิกสลิป");
    setUserState(userId, {
      step: "SLIP_PICK_ORDER",
      slipUrl: slipUrl, slipDate: slipDate, slipTime: slipTime, slipFileName: fileName
    });
    replyLineWithQuickReply(replyToken,
      "📸 รับสลิปแล้วค่ะ (เวลา " + slipTime + " น.)\n\nมี " + pending.length + " ออเดอร์ค้างชำระ — เลือกออเดอร์ที่จะผูกสลิปนี้ค่ะ:\n" + listText + "\n\nกดปุ่ม หรือพิมพ์ \"ชำระ <Order ID>\" ก็ได้",
      qrList);
  } catch(e) {
    Logger.log("[ERROR] handleSlipImage_ failed | msg=" + messageId + " | err=" + e.message + " | stack=" + (e.stack || ""));
    try { replyLineWithQuickReply(replyToken, "เกิดข้อผิดพลาดในการบันทึกสลิปค่ะ ลองส่งใหม่อีกครั้งนะคะ หรือพิมพ์ \"แจ้งโอน\" เพื่อแจ้งด้วยข้อความ", QR_MAIN); } catch(ign){}
  }
}

function getPendingOrdersForUser_(userId, limit) {
  try {
    var rows = getOrderRowsReverse(function(r) {
      var ps = String(r.paymentStatus || "").trim().toLowerCase();
      var st = normalizeStatus(r.status || "");
      return ps === "pending" && st !== "❌ ยกเลิก";
    }, 50);
    var groups = groupRowsByOrder(rows);
    var out = groups.map(function(g) {
      var main = g.rows.find(function(r){ return toNumber(r.grandTotal) > 0; }) || g.rows[0];
      return { orderId: g.orderId, grandTotal: main.grandTotal, customerName: main.customerName };
    });
    return out.slice(0, limit || 5);
  } catch(e) {
    Logger.log("[ERROR] getPendingOrdersForUser_: " + e.message);
    return [];
  }
}

function markOrderPaidWithSlip_(orderId, slipUrl, slipDate, slipTime) {
  try {
    var rows = findOrderRowsById_(orderId);
    if (!rows.length) {
      Logger.log("[WARN] markOrderPaidWithSlip_: order not found: " + orderId);
      return false;
    }
    var sheet = getSheet();
    var map = getHeaderMap_();
    rows.forEach(function(r) {
      if (map.paymentStatus > 0) sheet.getRange(r.rowNumber, map.paymentStatus).setValue("Paid");
      if (map.paymentDate   > 0) sheet.getRange(r.rowNumber, map.paymentDate).setValue(slipDate + " " + slipTime);
      if (map.note > 0) {
        var cur = String(sheet.getRange(r.rowNumber, map.note).getValue() || "");
        var addLine = "📸 สลิป " + slipDate + " " + slipTime + " — " + slipUrl;
        // กันใส่ซ้ำ
        if (cur.indexOf(slipUrl) === -1) {
          sheet.getRange(r.rowNumber, map.note).setValue(cur ? cur + "\n" + addLine : addLine);
        }
      }
    });
    clearSheetCache(); // reset memo ด้วย (เดิม bump อย่างเดียว → pending list ไม่ refresh)
    Logger.log("[INFO] order marked paid | id=" + orderId + " | slip=" + slipUrl);
    return true;
  } catch(e) {
    Logger.log("[ERROR] markOrderPaidWithSlip_ failed | id=" + orderId + " | err=" + e.message);
    return false;
  }
}

// [v3.7] ยกเลิกสถานะชำระ — กรณีกดชำระแล้วผิด (web/LINE)
//   ล้าง paymentStatus + paymentDate กลับเป็นค้างชำระ (เก็บ note สลิปเดิมไว้เป็นหลักฐาน)
function unmarkOrderPaid_(orderId) {
  try {
    var rows = findOrderRowsById_(orderId);
    if (!rows.length) {
      Logger.log("[WARN] unmarkOrderPaid_: order not found: " + orderId);
      return false;
    }
    var sheet = getSheet();
    var map = getHeaderMap_();
    rows.forEach(function(r) {
      if (map.paymentStatus > 0) sheet.getRange(r.rowNumber, map.paymentStatus).setValue("");
      if (map.paymentDate   > 0) sheet.getRange(r.rowNumber, map.paymentDate).setValue("");
    });
    clearSheetCache();
    Logger.log("[INFO] order UNMARKED paid | id=" + orderId);
    return true;
  } catch(e) {
    Logger.log("[ERROR] unmarkOrderPaid_ failed | id=" + orderId + " | err=" + e.message);
    return false;
  }
}

function handleGuidedOrderStep(replyToken, userId, text, state) {
  // GLOBAL ESCAPE — ถ้าส่งออเดอร์เต็มตอนติด state ใดๆ → ออกจาก state
  // ให้ flow ปกติบันทึกเป็นออเดอร์ใหม่ (กัน state ค้างทำให้ทุกออเดอร์พัง)
  var _esc = String(text||"").trim();
  var _looksOrder = (/ออเดอร์รอบส่ง|รอบส่ง|วันที่ส่ง\s*[:：]/i.test(_esc) ||
                     /^\s*ออเดอร์\s/im.test(_esc)) &&
                    /รวม\s*[:：]?\s*[\d,]+/.test(_esc);
  if (_looksOrder && state.step !== "CHOOSE_MENU" && state.step !== "ORDER_QTY" &&
      state.step !== "ORDER_PRICE" && state.step !== "CONFIRM") {
    clearUserState(userId);
    Logger.log("[INFO] state escape (order detected) from step="+state.step+" → re-process as order");
    return false; // ปล่อยให้ event handler ทำ order save flow ต่อ
  }

  switch (state.step) {
    case "CONFIRM_OVERWRITE":
      var ovInput = String(text||"").trim();
      var ovData  = state.pendingOrderData || {};
      var ovOldId = state.existingOrderId;

      // 🔄 ทับใบเดิม
      if (/ทับใบเดิม|ทับ|overwrite/i.test(ovInput)) {
        var ovRes = overwriteOrder_(ovOldId, ovData, state.rawOrderText||"", userId||"line");
        clearUserState(userId);
        if (ovRes.ok) {
          if (ENABLE_PUSH_NEW_ORDER) pushNotifyText_("🔄 ทับออเดอร์\nเก่า: "+ovRes.oldOrderId+" (ยกเลิก)\nใหม่: "+ovRes.newOrderId+"\nลูกค้า: "+(ovData.customerName||"-")+"\nยอด: "+toNumber(ovData.grandTotal).toLocaleString()+"฿");
          replyLineWithQuickReply(replyToken,
            "✅ ทับใบเดิมแล้วค่ะ\n❌ ยกเลิก: "+ovRes.oldOrderId+"\n🆕 ใบใหม่: "+ovRes.newOrderId+"\n💰 ยอด: "+toNumber(ovData.grandTotal).toLocaleString()+"฿",
            qrAfterSave(ovRes.newOrderId));
        } else {
          replyLineWithQuickReply(replyToken, "❌ ทับไม่สำเร็จ: "+(ovRes.message||""), QR_MAIN);
        }
        return true;
      }
      // 🆕 บันทึกใบใหม่ (เก็บทั้ง 2 ใบ)
      if (/บันทึกใบใหม่|ใบใหม่|ใหม่|save new/i.test(ovInput)) {
        clearUserState(userId);
        if (ENABLE_PUSH_NEW_ORDER) pushNotifyText_("🆕 ออเดอร์ใหม่ (แยกใบ)\nOrder: "+ovData.orderId+"\nลูกค้า: "+(ovData.customerName||"-"));
        var newOid2 = saveOrderToSheet_(ovData, state.rawOrderText||"", userId||"line");
        replyLineWithQuickReply(replyToken, buildSaveSuccessText_(ovData, newOid2), qrAfterSave(newOid2));
        return true;
      }
      // ➕ เพิ่มเข้าใบเดิม (append items)
      if (/เพิ่มเข้าใบเดิม|เพิ่มเข้า|append/i.test(ovInput)) {
        var apRes = appendItemsToOrder_(ovOldId, ovData.items||[], userId||"line");
        clearUserState(userId);
        if (apRes.ok) {
          if (ENABLE_PUSH_NEW_ORDER) pushNotifyText_("➕ เพิ่มเข้าใบเดิม "+apRes.orderId+"\n+"+apRes.addedCount+" รายการ\nยอดใหม่: "+apRes.newGrand.toLocaleString()+"฿");
          replyLineWithQuickReply(replyToken,
            "✅ เพิ่ม "+apRes.addedCount+" รายการเข้าใบเดิมแล้วค่ะ\nOrder: "+apRes.orderId+"\n💰 ยอดใหม่: "+apRes.newGrand.toLocaleString()+"฿ (+"+apRes.addedTotal.toLocaleString()+")",
            qrAfterSave(apRes.orderId));
        } else {
          replyLineWithQuickReply(replyToken, "❌ เพิ่มไม่สำเร็จ: "+(apRes.message||""), QR_MAIN);
        }
        return true;
      }
      // ❌ ยกเลิก (global handler จับไปแล้วปกติ แต่กันไว้)
      if (/ยกเลิก|cancel/i.test(ovInput)) {
        clearUserState(userId);
        replyLineWithQuickReply(replyToken, "ยกเลิกแล้วค่ะ ออเดอร์ไม่ถูกบันทึก", QR_MAIN); return true;
      }
      // ไม่ตรงปุ่มไหน
      replyLineWithQuickReply(replyToken,
        "กรุณาเลือกค่ะ:\n🔄 ทับใบเดิม / 🆕 บันทึกใบใหม่ / ➕ เพิ่มเข้าใบเดิม / ❌ ยกเลิก",
        ["🔄 ทับใบเดิม","🆕 บันทึกใบใหม่","➕ เพิ่มเข้าใบเดิม","❌ ยกเลิก"]);
      return true;
    case "ADD_ITEMS_TO_ORDER":
      var addInput = String(text||"").trim();
      if (/^(ยกเลิก|cancel|❌\s*ยกเลิก)$/i.test(addInput)) {
        clearUserState(userId);
        replyLineWithQuickReply(replyToken, "ยกเลิกการเพิ่มเมนูแล้วค่ะ", QR_MAIN); return true;
      }
      // escape: ถ้าส่งออเดอร์เต็ม (มี header/รวม) ตอนติดโหมดเพิ่มเมนู
      // → ออกจากโหมด + ให้ flow ปกติบันทึกเป็นออเดอร์ใหม่ (กัน state ค้างทำออเดอร์พัง)
      if (/ออเดอร์รอบส่ง|รอบส่ง|วันที่ส่ง|@/i.test(addInput) ||
          (/รวม\s*[:：]?\s*[\d,]+/.test(addInput) && parseItemsFlexible_(addInput).length >= 2)) {
        clearUserState(userId);
        Logger.log("[INFO] ADD_ITEMS escape → ออเดอร์ใหม่: "+addInput.substring(0,50));
        return false; // ปล่อยให้ event handler ทำ order save flow ต่อ
      }
      // parse รายการที่ paste มา (หลายบรรทัด) ด้วย parser เดียวกับ order
      var addItems = parseItemsFlexible_(addInput);
      // fallback: ลอง short-cafe style ถ้า flexible ไม่เจอ
      if (!addItems.length) {
        var tmpOrder = parseShortCafeOrder_(addInput);
        if (tmpOrder && tmpOrder.items) addItems = tmpOrder.items;
      }
      if (!addItems.length) {
        replyLineWithQuickReply(replyToken,
          "❓ อ่านรายการไม่ออกค่ะ ลองพิมพ์รูปแบบนี้:\nเค้กส้ม 1 วง 490฿\nเค้กช็อค 1 วง 750฿\n\nหรือพิมพ์ \"ยกเลิก\"",
          ["ยกเลิก"]);
        return true;
      }
      var addRes = appendItemsToOrder_(state.targetOrderId, addItems, userId||"line");
      clearUserState(userId);
      if (addRes.ok) {
        var itemsLine = addItems.map(function(it){
          return "• "+it.menuName+" "+it.quantity+" "+(it.unit||"ชิ้น")+" "+toNumber(it.itemTotal).toLocaleString()+"฿";
        }).join("\n");
        if (ENABLE_PUSH_NEW_ORDER) pushNotifyText_("➕ เพิ่มเมนูเข้า Order: "+addRes.orderId+"\n"+itemsLine+"\nยอดใหม่: "+addRes.newGrand.toLocaleString()+"฿");
        replyLineWithQuickReply(replyToken,
          "✅ เพิ่ม "+addRes.addedCount+" รายการแล้วค่ะ\nOrder: "+addRes.orderId+"\n\n"+itemsLine+"\n\n💰 ยอดใหม่: "+addRes.newGrand.toLocaleString()+"฿ (+"+addRes.addedTotal.toLocaleString()+")",
          ["search order "+addRes.orderId, "เพิ่มเมนู "+addRes.orderId, "plan 7"]);
      } else {
        replyLineWithQuickReply(replyToken, "❌ เพิ่มไม่สำเร็จ: "+(addRes.message||""), QR_MAIN);
      }
      return true;
    case "SLIP_PICK_ORDER":
      var slipInput = String(text||"").trim();
      if (/^(ยกเลิก|ยกเลิกสลิป|cancel)$/i.test(slipInput)) {
        clearUserState(userId);
        replyLineWithQuickReply(replyToken, "ยกเลิกสลิปแล้วค่ะ (รูปยังเก็บไว้ใน Drive)\n🔗 " + (state.slipUrl||""), QR_MAIN);
        return true;
      }
      // รับทั้ง "ชำระ ORD-..." และ "ORD-..." อย่างเดียว
      var orderIdM = slipInput.match(/(?:ชำระ\s*)?(ORD-\d{8}-\d{6})/i);
      if (!orderIdM) {
        replyLineWithQuickReply(replyToken,
          "กรุณาพิมพ์ Order ID ที่ถูกต้องค่ะ\nรูปแบบ: ORD-DDMMYYYY-HHMMSS\nเช่น: ORD-09062569-143000\nหรือพิมพ์ \"ยกเลิกสลิป\"",
          ["summary pending","search today","ยกเลิกสลิป"]);
        return true;
      }
      var targetOid = orderIdM[1].toUpperCase();
      var okLink = markOrderPaidWithSlip_(targetOid, state.slipUrl, state.slipDate, state.slipTime);
      if (okLink) {
        clearUserState(userId);
        if (ENABLE_PUSH_NEW_ORDER) {
          pushNotifyText_("💰 มีสลิปโอนเข้ามาแล้ว\nOrder: " + targetOid + "\nเวลา: " + state.slipTime + "\nสลิป: " + state.slipUrl);
        }
        replyLineWithQuickReply(replyToken,
          "✅ บันทึกสลิปเข้า Order " + targetOid + " แล้วค่ะ\n📅 " + state.slipDate + " ⏰ " + state.slipTime + " น.\n📸 สลิปเก็บใน Drive แล้ว",
          ["search order " + targetOid, "summary"]);
      } else {
        replyLineWithQuickReply(replyToken,
          "ไม่พบ Order " + targetOid + " ในระบบค่ะ\nลองพิมพ์ Order ID ใหม่ หรือ \"ยกเลิกสลิป\"",
          ["summary pending","ยกเลิกสลิป"]);
      }
      return true;
    case "ASK_MISSING_CUSTOMER_FOR_ORDER":
      var nameInput = String(text||"").trim();
      if (!nameInput||nameInput==="-"||nameInput==="ไม่มี") {
        replyWithCustomerQuickReply(replyToken,"รบกวนพิมพ์ชื่อคนรับเพิ่มอีก 1 ข้อความนะคะ",["ยกเลิกการสั่ง"]); return true;
      }
      state.pendingOrderData = state.pendingOrderData || {};
      state.pendingOrderData.customerName = nameInput;
      if (!String(state.pendingOrderData.tableName||"").trim()) state.pendingOrderData.tableName=nameInput;
      if (!String(state.pendingOrderData.location||"").trim()) state.pendingOrderData.location=nameInput;
      // auto-fix for short cafe orders
      if (!state.pendingOrderData.channel) state.pendingOrderData.channel = "LINE";
      if (!state.pendingOrderData.orderType) state.pendingOrderData.orderType = "Wholesale";
      var savedId = saveOrderToSheet_(state.pendingOrderData, state.rawOrderText||"", userId||"line");
      saveCustomer(userId, state.pendingOrderData.customerName, state.pendingOrderData.phone, savedId, state.pendingOrderData.note||"");
      clearUserState(userId);
      if (ENABLE_PUSH_NEW_ORDER) pushNotifyText_("🆕 มีออเดอร์ใหม่\nOrder ID: "+savedId+"\nลูกค้า: "+state.pendingOrderData.customerName+"\nรวม: "+toNumber(state.pendingOrderData.grandTotal).toLocaleString()+" บาท");
      // ส่งสรุปแบบร้าน
      var summaryAfterName = generateCustomerSummary_(state.pendingOrderData);
      replyLineWithQuickReply(replyToken, summaryAfterName, qrAfterSave(savedId));
      return true;
    case "CHOOSE_MENU":
      if (text.indexOf("คัดลอกฟอร์ม")>-1) { clearUserState(userId); replyLine(replyToken, getOrderFormTemplate()); return true; }
      state.items=state.items||[]; state.pendingMenuName=resolveMenuAlias(text); state.step="ORDER_QTY"; setUserState(userId,state);
      replyWithCustomerQuickReply(replyToken,"🍰 เมนู: "+state.pendingMenuName+"\nต้องการกี่ชิ้น/ปอนด์คะ?",["1","2","3","❌ ยกเลิก"]); return true;
    case "ORDER_QTY":
      var qty=parseInt(text,10);
      if (isNaN(qty)||qty<=0||qty>100) { replyWithCustomerQuickReply(replyToken,"กรุณาระบุจำนวนเป็นตัวเลข 1-100 ค่ะ",["1","2","3","❌ ยกเลิก"]); return true; }
      state.pendingQty=qty; state.step="ORDER_PRICE"; setUserState(userId,state);
      // ★ suggest price from PRICE_MASTER
      var suggestedPrice = getPriceForMenu(state.pendingMenuName, "ชิ้น", qty);
      replyWithCustomerQuickReply(replyToken,
        "💰 ราคารวมสำหรับ "+state.pendingMenuName+" "+qty+" ชิ้น?\n(ราคาแนะนำ: "+suggestedPrice.toLocaleString()+"฿)",
        [String(suggestedPrice),"❌ ยกเลิก"]); return true;
    case "ORDER_PRICE":
      var total2=toNumber(text);
      if (total2<=0) { replyWithCustomerQuickReply(replyToken,"กรุณาระบุราคาเป็นตัวเลขค่ะ",["100","200","300","❌ ยกเลิก"]); return true; }
      state.items.push({menuName:state.pendingMenuName||"เมนู",unit:"ชิ้น",quantity:state.pendingQty||1,unitPrice:Math.round(total2/(state.pendingQty||1)),itemTotal:total2});
      delete state.pendingMenuName; delete state.pendingQty; state.step="ADD_MORE"; setUserState(userId,state);
      replyWithCustomerQuickReply(replyToken,"เพิ่มเมนูอีกไหมคะ?",["เพิ่มเมนู","ต่อไป","❌ ยกเลิก"]); return true;
    case "ADD_MORE":
      if (text==="เพิ่มเมนู") { state.step="CHOOSE_MENU"; setUserState(userId,state); replyWithCustomerQuickReply(replyToken,"เลือกเมนูได้เลยค่ะ",["📋 คัดลอกฟอร์ม","❌ ยกเลิก"]); return true; }
      state.step="CUSTOMER_NAME"; setUserState(userId,state);
      replyWithCustomerQuickReply(replyToken,"👤 ขอชื่อลูกค้าหรือชื่อคนรับหน่อยค่ะ",["❌ ยกเลิก"]); return true;
    case "CUSTOMER_NAME":
      state.customerName=text; state.step="PHONE"; setUserState(userId,state);
      replyWithCustomerQuickReply(replyToken,"📞 ขอเบอร์โทรสำหรับติดต่อหน่อยค่ะ",["❌ ยกเลิก"]); return true;
    case "PHONE":
      state.phone=text; state.step="DELIVERY_DATE"; setUserState(userId,state);
      replyWithCustomerQuickReply(replyToken,"📅 วันที่ส่ง/รับคือวันไหนคะ?",["วันนี้","พรุ่งนี้","❌ ยกเลิก"]); return true;
    case "DELIVERY_DATE":
      if (text==="วันนี้") text=getTodayTH(); if (text==="พรุ่งนี้") text=getTomorrowTH();
      state.deliveryDate=formatDateTH(text); state.paymentDate=state.deliveryDate; state.step="DELIVERY_TIME"; setUserState(userId,state);
      replyWithCustomerQuickReply(replyToken,"⏰ เวลาส่ง/รับประมาณกี่โมงคะ?",["10:00","14:00","18:00","❌ ยกเลิก"]); return true;
    case "DELIVERY_TIME":
      state.deliveryTime=formatTimeTH(text); state.step="DELIVERY_TYPE"; setUserState(userId,state);
      replyWithCustomerQuickReply(replyToken,"🚗 รับเองที่ร้านหรือให้จัดส่งคะ?",["รับเองที่ร้าน","Delivery","❌ ยกเลิก"]); return true;
    case "DELIVERY_TYPE":
      state.deliveryType=text;
      if (text==="รับเองที่ร้าน") { state.location="รับเองที่ร้าน"; state.deliveryFee=0; state.step="NOTE"; setUserState(userId,state); replyWithCustomerQuickReply(replyToken,"📝 มีหมายเหตุเพิ่มเติมไหมคะ?",["ไม่มี","❌ ยกเลิก"]); }
      else { state.step="LOCATION"; setUserState(userId,state); replyWithCustomerQuickReply(replyToken,"📍 ส่งที่ไหนคะ?",["❌ ยกเลิก"]); }
      return true;
    case "LOCATION":
      state.location=text;
      if (/maps\.app\.goo\.gl|google\.com\/maps|goo\.gl\/maps/.test(text)) { state.googleMap=text; state.location="ดูแผนที่"; }
      state.step="NOTE"; setUserState(userId,state);
      replyWithCustomerQuickReply(replyToken,"📝 มีหมายเหตุเพิ่มเติมไหมคะ?",["ไม่มี","❌ ยกเลิก"]); return true;
    case "NOTE":
      state.note=(text==="ไม่มี")?"":text; state.step="CONFIRM"; setUserState(userId,state);
      var gt=(state.items||[]).reduce(function(s,i){ return s+toNumber(i.itemTotal); },0)+toNumber(state.deliveryFee||0);
      var sum="🧾 สรุปออเดอร์\n\n👤 "+(state.customerName||"-")+"\n📞 "+(state.phone||"-")+"\n📅 "+(state.deliveryDate||"-")+" ⏰ "+(state.deliveryTime||"-")+"\n🚗 "+(state.deliveryType||"-")+"\n";
      if (state.location) sum+="📍 "+state.location+"\n";
      sum+="\n📋 รายการ:\n";
      (state.items||[]).forEach(function(it){ sum+="• "+it.menuName+" x"+it.quantity+" = "+toNumber(it.itemTotal).toLocaleString()+"฿\n"; });
      sum+="\n💰 รวม: "+gt.toLocaleString()+" บาท";
      if (state.note) sum+="\n📝 "+state.note;
      sum+="\n\n✅ ยืนยันสั่งไหมคะ?";
      replyWithCustomerQuickReply(replyToken, sum, ["✅ ยืนยัน","✏️ แก้ไขออเดอร์","❌ ยกเลิก"]); return true;
    case "CONFIRM":
      if (["ยืนยัน","✅ ยืนยัน","ยืนยันสั่ง","ใช่","ตกลง","โอเค","ok","okay","yes"].indexOf(String(text||"").trim().toLowerCase()) > -1) {
        var od = buildOrderDataFromState(state);
        var oid2 = saveOrderToSheet_(od, "Guided Order via LINE", userId||"line");
        saveCustomer(userId, od.customerName, od.phone, oid2, od.note||"");
        clearUserState(userId);
        if (ENABLE_PUSH_NEW_ORDER) pushNotifyText_("🆕 ออเดอร์ใหม่ (guided)\nOrder ID: "+oid2+"\nลูกค้า: "+od.customerName+"\nรวม: "+toNumber(od.grandTotal).toLocaleString()+" บาท");
        replyFlexWithCustomerQR(replyToken, buildCustomerOrderConfirmFlex(od, oid2), QR_CUSTOMER_MAIN);
        return true;
      }
      if (text==="แก้ไขออเดอร์"||text==="✏️ แก้ไข") {
        state.step="CHOOSE_MENU"; state.items=[]; setUserState(userId,state);
        replyWithCustomerQuickReply(replyToken,"เริ่มเลือกรายการใหม่ได้เลยค่ะ",["📋 คัดลอกฟอร์ม","❌ ยกเลิก"]); return true;
      }
      return false;
  }
  return false;
}

function startGuidedOrderFlow(replyToken, userId) {
  setUserState(userId, {step:"CHOOSE_MENU",userId:userId,channel:"LINE",orderType:"Retail"});
  replyFlexWithCustomerQR(replyToken, buildCakeMenuCarousel(), ["📋 คัดลอกฟอร์ม","❌ ยกเลิก"]);
}

// ============================================================
// SETUP / MENU SHEET
// ============================================================
function getMenuSheet() {
  var ss=getSpreadsheet_(), sh=ss.getSheetByName("Menu");
  if (!sh) sh=ss.insertSheet("Menu");
  if (sh.getLastRow()===0) {
    sh.getRange(1,1,1,5).setValues([["Menu Name","Category","Unit","Price","Active"]]);
    sh.getRange(2,1,5,5).setValues([
      ["มินิเค้กรวมรส","cake","ชิ้น",130,true],
      ["เค้กช็อกโกแลต","cake","ชิ้น",150,true],
      ["เค้กส้ม","cake","ชิ้น",150,true],
      ["บราวนี่","dessert","ชิ้น",75,true],
      ["เค้กวันเกิด","preorder","ปอนด์",0,true]
    ]);
  }
  return sh;
}

function setupV3Sheets() {
  getMenuSheet(); getCustomerSheet(); getLogSheet_(); getSheet();
  return "✅ V3 setup complete!";
}

function setupV3Triggers() {
  ScriptApp.getProjectTriggers().forEach(function(t){
    if (["pushPaymentReminders","pushPickupReminders","pushReviewRequests","notifyUpcomingDeliveries"].indexOf(t.getHandlerFunction())>-1)
      ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("notifyUpcomingDeliveries").timeBased().atHour(18).everyDays(1).create();
  return "✅ V3 triggers setup complete!";
}

// ★ NEW v3.4 — โหลด custom alias ที่ save ไว้ใน PropertiesService
function loadCustomAliases_() {
  try {
    var saved = PropertiesService.getScriptProperties().getProperty("custom_aliases");
    if (!saved) return;
    var obj = JSON.parse(saved);
    Object.keys(obj).forEach(function(k){ MENU_ALIAS[k] = obj[k]; });
  } catch(e) { Logger.log("loadCustomAliases_ error: "+e); }
}

// ============================================================
// doPost — main webhook handler (v3.4)
// ============================================================
function doPost(e) {
  var replyToken = null;
  var _hadEventError = false; // [B1] health tracking
  try {
    // Verify webhook timeout — return เร็วที่สุดถ้าไม่มี events
    // เดิม: load alias ก่อน parse → cold start 2-3 วิ → LINE timeout 1 วิ
    if (!e || !e.postData || !e.postData.contents) return ContentService.createTextOutput("OK");
    var json;
    try { json = JSON.parse(e.postData.contents); } catch(jp) { return ContentService.createTextOutput("OK"); }
    if (!json.events || !json.events.length) return ContentService.createTextOutput("OK");

    // โหลด alias หลัง check events (ไม่ทำงานเมื่อ Verify)
    try { loadCustomAliases_(); } catch(eca){ Logger.log("[WARN] loadCustomAliases_: "+eca); }
    try { loadAliasMaster_();   } catch(elm){ Logger.log("[WARN] loadAliasMaster_: "+elm); }

    for (var ei = 0; ei < json.events.length; ei++) {
      var event = json.events[ei];
      replyToken = event.replyToken;
      try {
        if (event.type==="postback") { handlePostbackEvent(event); continue; }

        // Image message → slip handler
        // ปิดสลิปในกลุ่มสนิท: รับเฉพาะแชท 1:1 — กันบอตเด้ง error ทุกรูปในกลุ่ม (น่ารำคาญ)
        if (event.type==="message" && event.message.type==="image") {
          var imgMsgId = event.message.id;
          if (isDuplicate(imgMsgId)) continue;
          var imgSource = event.source || {};
          var imgSourceType = imgSource.type || "";

          // ปิดทั้งระบบ?
          if (!ENABLE_SLIP_FEATURE) { continue; }
          // ในกลุ่ม/room → ข้ามเงียบสนิท (ไม่เด้ง error, ไม่ทำอะไร)
          if (imgSourceType==="group" || imgSourceType==="room") {
            if (!ENABLE_SLIP_IN_GROUP) { Logger.log("[INFO] skip image in group (slip disabled in group)"); continue; }
            // ถ้าจะเปิดในกลุ่ม ต้องเรียกไก่จ๋าก่อน
            if (!isGroupStandbyActive(imgSource)) { continue; }
          }
          // ถึงตรงนี้ = แชท 1:1 (หรือกลุ่มที่เปิด+standby)
          var imgUserId = getUserIdFromEvent_(event);
          handleSlipImage_(event, replyToken, imgUserId);
          appendMessageLog_(event, "[image:"+imgMsgId+"]", "[slip]", "slip_upload", "slip");
          continue;
        }

        if (event.type!=="message"||event.message.type!=="text") continue;

        var messageId  = event.message.id;
        var source     = event.source||{};
        var sourceType = source.type||"";
        if (isDuplicate(messageId)) continue;

        // [v3.5.2 FIX] strip ตัวอักษรล่องหน (zero-width space/joiner ฯลฯ) ที่ฟอนต์ตกแต่งแทรกมา
        //   ก่อน trim — เดิม ZWSP ใน item line ทำให้ \s ใน regex ไม่ match → isOrderLikeText=false → "ไม่พบข้อมูล"
        var text  = _normalizeIncomingText_(event.message.text).trim();
        var lower = text.toLowerCase(); // เดิม lower ไม่ได้ declare → ReferenceError ตอน "บันทึกซ้ำ" check
        // [v3.5.1] trace ทุก incoming — ดูได้ใน ?log=1
        try { dbg_("IN", text.substring(0,50).replace(/\n/g," "), {src:sourceType, pat:detectOrderPattern_(text), isOrder:isOrderLikeText_(text)}); } catch(_dbgE){}

        if (sourceType==="group"||sourceType==="room") {
          if (isStopWakeWord(text))  {
            disableGroupStandby(source);
            // reply ยืนยัน + ปุ่มเรียกใหม่
            replyLineWithQuickReply(replyToken,
              "🔕 ปิดไก่จ๋าแล้วค่ะ\nพิมพ์ \"ไก่จ๋า\" เมื่อต้องการใช้งานอีกครั้ง",
              ["ไก่จ๋า"]);
            appendMessageLog_(event,text,text,"stopword","stop"); continue;
          }
          if (isWakeWordOnly(text)) {
            enableGroupStandby(source, GROUP_STANDBY_MINUTES);
            // auto-capture group ID เพื่อ push noti แจ้งเตือนถึงเวลาส่ง
            registerNotifyGroup_(source);
            replyLineWithQuickReply(replyToken,
              "🐔 "+SHOP_NAME+" รับฟังอยู่ค่ะ ("+GROUP_STANDBY_MINUTES+" นาที)\nพิมพ์คำสั่งได้เลย หรือกดปุ่มด้านล่าง\n\n🔔 กลุ่มนี้ถูกบันทึกเป็นกลุ่มแจ้งเตือนเวลาส่งแล้ว",
              ["summary","search today","plan 7","ปิดไก่จ๋า"]);
            appendMessageLog_(event,text,text,"wakeword","wake"); continue;
          }
          if (startsWithWakeWord(text)) { text=stripWakeWord(text); enableGroupStandby(source,GROUP_STANDBY_MINUTES); }
          else if (!isGroupStandbyActive(source)) continue;
        }

        var resolvedText  = resolveAlias(text);
        var effectiveText = (resolvedText&&resolvedText.toLowerCase()!==text.toLowerCase()) ? resolvedText : text;
        var intent        = detectIntent_(effectiveText);
        appendMessageLog_(event, text, effectiveText, intent, "received");

        var userId = getUserIdFromEvent_(event);
        // ส่ง source ไปด้วย เพื่อให้ push กลับถูก chat (group/1:1)
        var eventSource = event.source || {};

        // 1. Admin command router
        if (handleAdminCommand(effectiveText, replyToken, userId, eventSource)) {
          appendMessageLog_(event, text, effectiveText, intent, "admin"); continue;
        }

        // 2. Customer state machine
        if (handleCustomerMessage(event, effectiveText)) {
          appendMessageLog_(event, text, effectiveText, intent, "customer"); continue;
        }

        // 3. ★ NEW — modifier edit (แก้ออเดอร์กลางแชท)
        if (detectOrderPattern_(text) === "modifier_edit") {
          if (handleModifierMessage_(text, replyToken, userId)) {
            appendMessageLog_(event, text, effectiveText, "modifier_edit", "modifier"); continue;
          }
        }

        // guard: ฟอร์มเปล่า (template ที่ยังไม่ได้แก้) → เตือนให้แก้ก่อน
        if (/ก๊อปแล้วแก้ตามจริง/.test(text) && /คุณมิว/.test(text) && /097-1234567/.test(text)) {
          replyLineWithQuickReply(replyToken,
            "📝 นี่คือฟอร์มตัวอย่างค่ะ\nรบกวนแก้ทั้ง 5 บรรทัด (วันที่/ชื่อ/เบอร์/ที่อยู่/รายการ) เป็นข้อมูลจริงก่อนส่งนะคะ",
            ["📋 คัดลอกฟอร์ม","ดูเมนู"]);
          appendMessageLog_(event,text,effectiveText,"unfilled_template","guard"); continue;
        }

        // 4. Order save flow
        if (isOrderLikeText_(text)) {
          // [L1] เด้ง loading animation ทันที (1:1) ก่อน parse+save ที่กินเวลา
          startLoadingAnimation_(userId, 10);
          try {
            // ตรวจซ้ำก่อน parse
            var dupOrderId = isDuplicateOrder_(text);
            if (dupOrderId) {
              replyLineWithQuickReply(replyToken,
                "⚠️ ออเดอร์นี้เหมือนกับที่บันทึกไปแล้วค่ะ\nOrder ID: "+dupOrderId+"\n\nพิมพ์ \"บันทึกซ้ำ\" ถ้าต้องการสร้างใหม่",
                ["บันทึกซ้ำ","search order "+dupOrderId,"plan 7"]);
              appendMessageLog_(event,text,effectiveText,"duplicate_order","dup_skip"); continue;
            }

            var pat = detectOrderPattern_(text);

            // helper: save + reply แบบ v3.4
            function saveAndReplyV34_(orderData, patLabel) {
              // เช็ค order ซ้ำ customer+date ก่อน save → ถามทับ
              var existDup = findActiveOrderByCustomerDate_(orderData.customerName, orderData.deliveryDate);
              if (existDup) {
                try { dbg_("OVERWRITE", "พบออเดอร์ซ้ำ customer+date", {customer:orderData.customerName, date:orderData.deliveryDate, oldId:existDup.orderId}); } catch(_d){}
                setUserState(userId, {step:"CONFIRM_OVERWRITE", rawOrderText:text, pendingOrderData:orderData, existingOrderId:existDup.orderId});
                replyLineWithQuickReply(replyToken,
                  "🔄 พบออเดอร์เดิมของ \""+(orderData.customerName||"-")+"\"\nวันที่ "+orderData.deliveryDate+"\n📋 Order เดิม: "+existDup.orderId+" (ยอด "+toNumber(existDup.grandTotal).toLocaleString()+"฿)\n📋 ใบใหม่: "+orderData.items.length+" รายการ รวม "+toNumber(orderData.grandTotal).toLocaleString()+"฿\n\nต้องการทำอะไรคะ?",
                  ["🔄 ทับใบเดิม","🆕 บันทึกใบใหม่","➕ เพิ่มเข้าใบเดิม","❌ ยกเลิก"]);
                appendMessageLog_(event,text,effectiveText,"order_dup_customer_date","ask_overwrite");
                return null; // รอ user เลือก
              }
              var oid = saveOrderToSheet_(orderData, text, userId||"line");
              // [v3.5.3] ไม่ push แอดมินคนอื่น — รอเขาพิมพ์ "ขอดู" เอง
              //   submitter ได้ reply detail เต็มอยู่แล้ว
              //   admin อื่นต้องเรียกดูเอง → ประหยัด push quota + privacy
              recordUndo_({type:"save", orderId:oid, label:"บันทึก "+(orderData.customerName||"-")}); //
              try { dbg_("SAVE", "บันทึกสำเร็จ "+oid, {customer:orderData.customerName, total:toNumber(orderData.grandTotal), items:(orderData.items||[]).length, pat:patLabel}); } catch(_d){}
              var successText = buildSaveSuccessText_(orderData, oid);
              replyLineWithQuickReply(replyToken, successText, qrAfterSave(oid));
              appendMessageLog_(event,text,effectiveText,"order_saved","save");
              return oid;
            }
            function askCustomerNameV34_(orderData) {
              setUserState(userId, {step:"ASK_MISSING_CUSTOMER_FOR_ORDER",userId:userId,rawOrderText:text,pendingOrderData:orderData});
              replyWithCustomerQuickReply(replyToken,"รับออเดอร์ได้แล้วค่ะ ✅\nพบ "+orderData.items.length+" รายการ รวม "+toNumber(orderData.grandTotal).toLocaleString()+" บาท\nรบกวนพิมพ์ชื่อลูกค้า/ร้านค้าด้วยนะคะ",["ยกเลิกการสั่ง"]);
              appendMessageLog_(event,text,effectiveText,"order_wait_customer_name","ask_customer_name");
            }

            // ★ short_calculated
            if (pat === "short_calculated") {
              var calcData = parseShortCalculatedOrder_(text);
              if (calcData && calcData.items && calcData.items.length > 0) {
                if (!String(calcData.customerName||"").trim()) { askCustomerNameV34_(calcData); continue; }
                saveAndReplyV34_(calcData, "calculated"); continue;
              }
            }

            // ★ loose_header
            if (pat === "loose_header") {
              var looseData = parseLooseHeaderOrder_(text);
              if (looseData && looseData.items && looseData.items.length > 0) {
                if (!String(looseData.customerName||"").trim()) { askCustomerNameV34_(looseData); continue; }
                saveAndReplyV34_(looseData, "loose_header"); continue;
              }
            }

            // ★ manual_summary
            if (pat === "manual_summary") {
              var manData = parseManualSummaryOrder_(text);
              if (manData && manData.items && manData.items.length > 0) {
                saveAndReplyV34_(manData, "manual_summary"); continue;
              }
            }

            // ★ payment_address
            if (pat === "payment_address") {
              var payData = parsePaymentAddressOrder_(text);
              if (payData && payData.items && payData.items.length > 0) {
                if (!String(payData.customerName||"").trim()) { askCustomerNameV34_(payData); continue; }
                saveAndReplyV34_(payData, "payment_address"); continue;
              }
            }

            // ★ short cafe path
            if (pat === "short_cafe" && !looksLikeStandardOrderText_(text) && !looksLikeFlexibleOrderText_(text)) {
              if (handleShortCafeOrderMessage_(text, replyToken, userId)) {
                appendMessageLog_(event, text, effectiveText, "short_cafe_order", "short_cafe"); continue;
              }
            }

            var orderData = parseOrder(text);
            var errors    = validateOrder_(orderData);
            if (shouldAskForCustomerName_(orderData, errors)) {
              setUserState(userId, {step:"ASK_MISSING_CUSTOMER_FOR_ORDER",userId:userId,rawOrderText:text,pendingOrderData:orderData});
              replyWithCustomerQuickReply(replyToken,"รับออเดอร์ได้แล้วค่ะ ✅\nแต่ยังไม่มีชื่อคนรับ/ชื่อร้าน\nรบกวนพิมพ์ชื่อคนรับเพิ่มอีก 1 ข้อความนะคะ",["ยกเลิกการสั่ง"]);
              appendMessageLog_(event,text,effectiveText,"order_wait_customer_name","ask_customer_name"); continue;
            }
            if (errors.length>0) {
              replyFlexWithQuickReply(replyToken, buildErrorFlex(errors), QR_NO_ORDERS);
              appendMessageLog_(event,text,effectiveText,"order_form_invalid","error"); continue;
            }
            saveAndReplyV34_(orderData, "standard"); continue;
          } catch(err2) {
            replyLineWithQuickReply(replyToken,"เกิดข้อผิดพลาดในการบันทึกออเดอร์ค่ะ",QR_MAIN);
            appendMessageLog_(event,text,effectiveText,"order_error","error"); continue;
          }
        }

        // 4b. "บันทึกซ้ำ" — force save ทับ duplicate
        if (lower==="บันทึกซ้ำ") {
          var state4b = getUserState(userId);
          if (state4b && state4b.rawOrderText) {
            var dupData = parseOrder(state4b.rawOrderText);
            if (dupData && dupData.items && dupData.items.length > 0) {
              if (ENABLE_PUSH_NEW_ORDER) pushNotifyText_("🆕 ออเดอร์ใหม่ (force dup)\nOrder ID: "+dupData.orderId);
              var dupOid = saveOrderToSheet_(dupData, state4b.rawOrderText, userId||"line");
              clearUserState(userId);
              replyLineWithQuickReply(replyToken, buildSaveSuccessText_(dupData, dupOid), qrAfterSave(dupOid));
            } else {
              replyLineWithQuickReply(replyToken,"ไม่พบข้อมูลออเดอร์เดิมค่ะ",QR_MAIN);
            }
            appendMessageLog_(event,text,effectiveText,"force_dup","save"); continue;
          }
          replyLineWithQuickReply(replyToken,"ไม่มีออเดอร์รอบันทึกซ้ำค่ะ",QR_MAIN); continue;
        }

        // 5. AI auto reply wrap in try-catch กัน throw หลุดไปที่ generic fallback
        try {
          if (isLikelyCustomerQuestion_(text)) {
            var ai = generateAIReply_(text);
            if (ai) { replyLineWithQuickReply(replyToken,ai,QR_CUSTOMER_MAIN); appendMessageLog_(event,text,effectiveText,"ai_reply","ai"); continue; }
          }
        } catch(aiErr) {
          Logger.log("[ERROR] AI block failed: "+aiErr.message+" | text="+text.substring(0,100)+" | stack: "+(aiErr.stack||""));
          appendMessageLog_(event,text,effectiveText,"ai_error","error");
        }

        // log unmatched text เพื่อหา pattern ใหม่ที่ระบบไม่รู้จัก
        Logger.log("[WARN] unmatched text (no order pattern + no AI): "+text.substring(0,200).replace(/\n/g," | "));
        // [v3.5.1] trace fallback — บอกชัดว่าทำไม isOrderLikeText=false
        try { dbg_("FALLBACK", "ไม่พบข้อมูล", {text:text.substring(0,60).replace(/\n/g," "), pat:detectOrderPattern_(text), isOrder:isOrderLikeText_(text)}); } catch(_d){}
        replyFlexWithQuickReply(replyToken, buildNotFoundFlex(), QR_MAIN);
        appendMessageLog_(event,text,effectiveText,"fallback","fallback");

      } catch(eventErr) {
        // log ละเอียด + แสดง error message ใน reply (debug-friendly)
        var errMsg = (eventErr && eventErr.message) || String(eventErr);
        var errStack = (eventErr && eventErr.stack) || "";
        Logger.log("[ERROR] event handler failed: " + errMsg + " | text=" + String(text||"").substring(0,200).replace(/\n/g," | ") + " | stack: " + errStack);
        try { healthErr_("event handler", errMsg); _hadEventError = true; } catch(_h1){}
        try { dbg_("ERROR", errMsg.substring(0,150), {text:String(text||"").substring(0,60).replace(/\n/g," "), stack:errStack.substring(0,200)}); } catch(_d2){}
        try {
          if (replyToken) replyLineWithQuickReply(replyToken,
            "⚠️ ระบบเจอ error: " + errMsg.substring(0,150) + "\n\nลองส่งซ้ำหรือใช้ summary / search order [ID]",
            QR_MAIN);
        } catch(ign){}
      }
    }
    try { if (!_hadEventError) healthOk_(); } catch(_h2){} // reset streak เฉพาะรอบที่ไม่มี error เลย
    return ContentService.createTextOutput("OK");
  } catch(err) {
    try { healthErr_("doPost outer", (err && err.message) || String(err)); } catch(_h3){}
    try { if (replyToken) replyLine(replyToken,"เกิดข้อผิดพลาดในระบบค่ะ"); } catch(e2){}
    return ContentService.createTextOutput("ERROR: "+err);
  }
}

// ============================================================
// [v3.6.2/B1] HEALTH ALERT — error-driven ไม่ ping ตลอด
//   นับ error ติดกันใน ScriptProperties → ครบ N ครั้ง push แจ้ง Lay คนเดียว
//   มี cooldown กันสแปม + reset ทันทีที่มี request สำเร็จ
// ============================================================
var HEALTH_ERR_THRESHOLD    = 3;            // error ติดกันกี่ครั้งถึงแจ้ง
var HEALTH_COOLDOWN_MIN     = 60;           // แจ้งซ้ำได้ทุกกี่นาที
var HEALTH_ALERT_TO         = "U1c711cb38826f95e3e3f4302fd089771"; // Lay

function healthErr_(where, msg) {
  try {
    var props = PropertiesService.getScriptProperties();
    var streak = (parseInt(props.getProperty("health_err_streak"), 10) || 0) + 1;
    props.setProperty("health_err_streak", String(streak));
    Logger.log("[WARN] health: error streak = " + streak + " | " + where + ": " + String(msg).substring(0,100));
    if (streak < HEALTH_ERR_THRESHOLD) return;

    var lastAlert = parseInt(props.getProperty("health_last_alert"), 10) || 0;
    if (Date.now() - lastAlert < HEALTH_COOLDOWN_MIN * 60000) return; // ยังอยู่ใน cooldown

    props.setProperty("health_last_alert", String(Date.now()));
    var alertMsg = "🚨 บอทอาจมีปัญหา\n" +
      "error ติดกัน " + streak + " ครั้ง\n" +
      "จุดล่าสุด: " + where + "\n" +
      "ข้อความ: " + String(msg).substring(0,200) + "\n\n" +
      "เช็ค: Apps Script → Executions";
    lineApiRequest_("https://api.line.me/v2/bot/message/push",
      {to: HEALTH_ALERT_TO, messages:[{type:"text", text: alertMsg}]});
    Logger.log("[INFO] health alert pushed to Lay");
  } catch(e) { Logger.log("[ERROR] healthErr_ itself failed: " + e.message); }
}

function healthOk_() {
  try {
    var props = PropertiesService.getScriptProperties();
    if (props.getProperty("health_err_streak") !== "0") props.setProperty("health_err_streak", "0");
  } catch(e) {}
}

// ============================================================
// UTILS
// ============================================================
function runNotifyUpcomingDeliveriesNow() { notifyUpcomingDeliveries(); }

// ตั้ง LINE token ลง Script Properties (เรียกครั้งเดียวใน editor)
// วิธีใช้: แก้ค่า token ด้านล่าง → Run setupLineToken → ลบ literal ใน config ออก
function setupLineToken() {
  var TOKEN = "วาง_LINE_CHANNEL_ACCESS_TOKEN_ที่นี่";
  if (TOKEN.indexOf("วาง_") === 0) {
    Logger.log("⚠️ ยังไม่ได้แก้ค่า TOKEN — เปิดฟังก์ชัน setupLineToken แล้ววาง token จริงก่อน");
    return;
  }
  PropertiesService.getScriptProperties().setProperty("LINE_CHANNEL_ACCESS_TOKEN", TOKEN);
  Logger.log("✅ บันทึก LINE token ลง Script Properties แล้ว — ลบ literal ใน config ออกได้");
}

// เรียกใช้ใน Apps Script editor — ทดสอบแจ้งเตือนถึงเวลาส่ง
function runNotifyDueDeliveriesNow() { notifyDueDeliveries_(); }
// ติดตั้ง trigger 5 นาที — เรียกครั้งเดียวพอ
function installDeliveryNotifyTrigger() {
  Logger.log(setupDeliveryNotifyTrigger());
  Logger.log("กลุ่มที่ register แล้ว: " + getNotifyGroupIds_().length + " กลุ่ม");
}
function clearAllRuntimeCaches() { clearSheetCache(); return "cache cleared"; }

// ============================================================
// ★ GAS EDITOR RUNNABLE SHORTCUTS
// ฟังก์ชันเหล่านี้กด ▶ Run ได้ตรงใน GAS Editor
// ============================================================

// 1. ล้าง cache + bump version → ใช้ก่อนทดสอบ plan 7 ทุกครั้ง
function runClearCache() {
  bumpCacheVersion_();
  resetRuntimeMemo_();
  clearSheetCache();
  Logger.log("✅ Cache cleared + version bumped");
}

// 2. ดู index ว่า plan 7 มี dates ไหม + raw delivery date จาก sheet
function runDebugPlan7() {
  debugPlan7_();
}

// 3. ดู dates ที่อยู่ใน index ทั้งหมด (สั้น)
function runShowIndexDates() {
  runClearCache();
  // Plan Light Index — เร็วกว่า index หลัก
  var idx = getPlanIndexCache_();
  var keys = Object.keys(idx.byDate||{}).sort();
  Logger.log("Plan Light Index dates: " + keys.length);
  keys.forEach(function(d) {
    Logger.log("  " + d + ": " + (idx.byDate[d]||[]).length + " rows");
  });
  Logger.log("Today: " + getTodayTH());
  Logger.log("Next 7 (plan): " + getNextActivePlanDates_(7).join(", "));
}

// ★ 4. วัดเวลา plan 7 ทีละขั้น — กด Run แล้วดู Logs
function runTimePlan7() {
  Logger.log("=== TIMING: plan 7 ===");

  // ขั้น 1: clear cache แล้วดู cold start
  Logger.log("--- Step 1: clear cache ---");
  var t0 = new Date().getTime();
  bumpCacheVersion_();
  resetRuntimeMemo_();
  clearSheetCache();
  Logger.log("clear cache: " + (new Date().getTime()-t0) + "ms");

  // ขั้น 2: build Plan Light Index (ครั้งแรก = อ่าน sheet จริง)
  Logger.log("--- Step 2: getPlanIndexCache_ (cold) ---");
  var t1 = new Date().getTime();
  var idx = getPlanIndexCache_();
  var t2 = new Date().getTime();
  var dateKeys = Object.keys(idx.byDate||{});
  Logger.log("getPlanIndexCache_ cold: " + (t2-t1) + "ms | dates: " + dateKeys.length);

  // ขั้น 3: build index ครั้งที่ 2 (จาก RUNTIME_MEMO = ควรเกือบ 0ms)
  Logger.log("--- Step 3: getPlanIndexCache_ (warm) ---");
  var t3 = new Date().getTime();
  getPlanIndexCache_();
  Logger.log("getPlanIndexCache_ warm: " + (new Date().getTime()-t3) + "ms");

  // ขั้น 4: getNextActivePlanDates_
  Logger.log("--- Step 4: getNextActivePlanDates_ ---");
  var t4 = new Date().getTime();
  var dates = getNextActivePlanDates_(7);
  Logger.log("getNextActivePlanDates_: " + (new Date().getTime()-t4) + "ms | dates: " + dates.join(", "));

  // ขั้น 5: buildPlan7TextFast_
  Logger.log("--- Step 5: buildPlan7TextFast_ ---");
  var t5 = new Date().getTime();
  var txt = buildPlan7TextFast_();
  var t6 = new Date().getTime();
  Logger.log("buildPlan7TextFast_: " + (t6-t5) + "ms | len: " + txt.length + " chars");
  Logger.log("--- OUTPUT PREVIEW ---");
  Logger.log(txt.substring(0, 500));

  // ขั้น 6: ไม่ได้วัด LINE reply เพราะรันใน Editor แต่จะรู้แล้วว่าช้าที่ไหน
  Logger.log("--- TOTAL build time: " + (t6-t1) + "ms ---");
  Logger.log("=== END TIMING ===");
}

// ============================================================
// ★ DEBUG HELPERS — รันใน GAS Editor เพื่อวินิจฉัยปัญหา
// ============================================================

// debugPlan7_() — ตรวจสอบ plan 7 ทีละขั้น
function debugPlan7_() {
  Logger.log("=== DEBUG PLAN 7 ===");

  // 1. วันที่วันนี้
  var today = getTodayTH();
  Logger.log("Today (TH): " + today);
  Logger.log("Today sortKey: " + deliveryDateSortKey(today));

  // 2. ดู sheet data
  var data = getSheetDataCached();
  Logger.log("Sheet rows (cached): " + data.length);

  // 3. ดู index
  clearSheetCache(); // clear ก่อน rebuild
  var idx = getIndexedRowsCache_();
  var dateKeys = Object.keys(idx.byDate||{}).sort();
  Logger.log("Index dates (" + dateKeys.length + "): " + dateKeys.slice(0,10).join(", "));

  // 4. ดู next active dates
  var nextDates = getNextActiveDates_(7);
  Logger.log("Next active dates: " + nextDates.join(", "));

  // 5. ถ้าไม่มี — แสดงตัวอย่างจาก index
  if (!nextDates.length) {
    Logger.log("⚠️ ไม่มี dates — ตรวจ index dates ล่าสุด:");
    dateKeys.slice(-5).forEach(function(d){
      Logger.log("  " + d + " → sortKey: " + deliveryDateSortKey(d) + " (today: " + deliveryDateSortKey(today) + ") >= today? " + (deliveryDateSortKey(d) >= deliveryDateSortKey(today)));
    });

    Logger.log("⚠️ ตรวจ raw deliveryDate จาก sheet:");
    var map = getHeaderMap_();
    var shownCount = 0;
    for (var i = data.length-1; i >= 0 && shownCount < 5; i--) {
      var r = rowArrayToObject_(data[i], i+2, map);
      if (!hasMeaningfulOrderData_(r)) continue;
      var rawDate = r.deliveryDate;
      var normalized = normalizeDateText_(rawDate);
      var formatted  = formatDateTH(rawDate);
      Logger.log("  row "+(i+2)+": rawDate="+JSON.stringify(rawDate)+" → normalize="+normalized+" formatTH="+formatted);
      shownCount++;
    }
  } else {
    // 6. ดูข้อมูลในแต่ละวัน
    nextDates.forEach(function(d) {
      var rows = getRowsByDeliveryDateFast_(d);
      Logger.log("  " + d + ": " + rows.length + " rows");
    });
  }

  Logger.log("=== END DEBUG ===");
}








// ============================================================
// E2E DOPOST TEST HARNESS
// จำลอง LINE webhook event แล้วยิงเข้า doPost จริง
// ไม่ต้องผ่าน LINE — ใช้ปุ่ม "เรียกใช้" เลือก runDoPostE2E ใน Apps Script
// ============================================================

function _stubReplies_() {
  var captured = [];
  var origs = {};
  var stubs = {
    replyLine: function(t, m) { captured.push({fn:"replyLine", msg:m}); },
    replyLineWithQuickReply: function(t, m, qr) { captured.push({fn:"replyLineWithQuickReply", msg:m, qr:qr}); },
    replyFlexWithQuickReply: function(t, p, qr) { captured.push({fn:"replyFlex", altText:(p && p.altText) || "(flex)", qr:qr}); },
    replyWithCustomerQuickReply: function(t, m, qr) { captured.push({fn:"replyWithCustomerQR", msg:m, qr:qr}); },
    replyFlexWithCustomerQR: function(t, p, qr) { captured.push({fn:"replyFlexCustomerQR", altText:(p && p.altText) || "(flex)", qr:qr}); },
    pushNotifyText_: function(m) { captured.push({fn:"pushNotify", msg:m}); },
    saveOrderToSheet_: function(data, raw, user) {
      var oid = "ORD-MOCK-" + Math.floor(Math.random()*1e6);
      captured.push({fn:"SAVE", orderId:oid,
        items:(data.items||[]).length,
        grandTotal:toNumber(data.grandTotal),
        customer:String(data.customerName||""),
        phone:String(data.phone||""),
        channel:String(data.channel||""),
        deliveryDate:String(data.deliveryDate||""),
        paymentStatus:String(data.paymentStatus||""),
        location:String(data.location||"").substring(0,80)
      });
      return oid;
    },
    markOrderPaidWithSlip_: function(oid, url, d, t) {
      captured.push({fn:"MARK_PAID", orderId:oid, slipUrl:url, date:d, time:t});
      return true;
    },
    appendMessageLog_: function(){},
    isDuplicate: function(){ return false; },
    isDuplicateOrder_: function(){ return false; }
  };
  Object.keys(stubs).forEach(function(name) {
    origs[name] = globalThis[name];
    globalThis[name] = stubs[name];
  });
  return {
    captured: captured,
    restore: function() {
      Object.keys(origs).forEach(function(n) { globalThis[n] = origs[n]; });
    }
  };
}

function _mockDoPost_(text, opts) {
  opts = opts || {};
  var event = {
    type: "message",
    replyToken: "TEST_TOKEN_" + Math.random().toString(36).substring(2,10),
    source: { type: opts.sourceType || "user", userId: opts.userId || "U_TEST_USER" },
    message: {
      type: opts.messageType || "text",
      id: "MSG_" + Date.now() + "_" + Math.floor(Math.random()*1000),
      text: text
    }
  };
  if (opts.messageType === "image") delete event.message.text;
  var e = { postData: { contents: JSON.stringify({ events: [event] }) } };
  return doPost(e);
}

function _printCaptured_(captured) {
  if (!captured.length) {
    Logger.log("  (no replies captured)");
    return;
  }
  captured.forEach(function(c, i) {
    var preview;
    if (c.fn === "SAVE") {
      preview = "💾 saved " + c.orderId + " | items=" + c.items + " | total=" + c.grandTotal +
                " | customer=" + c.customer + " | phone=" + c.phone + " | channel=" + c.channel +
                " | date=" + c.deliveryDate + " | pay=" + c.paymentStatus +
                (c.location ? " | loc=" + c.location : "");
    } else if (c.fn === "MARK_PAID") {
      preview = "✅ marked paid " + c.orderId + " | slip=" + c.slipUrl + " | " + c.date + " " + c.time;
    } else {
      preview = "[" + c.fn + "] " + String(c.msg || c.altText || "").substring(0, 180).replace(/\n/g, " ⏎ ");
      if (c.qr) preview += " | QR=" + JSON.stringify(c.qr).substring(0, 100);
    }
    Logger.log("  " + (i+1) + ". " + preview);
  });
}

function _runCase_(tc) {
  Logger.log("─────────────────────────────────────");
  Logger.log("▶ " + tc.name);
  var s = _stubReplies_();
  var ok = true;
  var failMsg = "";
  try {
    _mockDoPost_(tc.text, tc.opts || {});
    _printCaptured_(s.captured);

    // assertions
    if (tc.expect) {
      var saves = s.captured.filter(function(c){ return c.fn === "SAVE"; });
      if (tc.expect.saved === true) {
        if (saves.length === 0) { ok = false; failMsg = "ไม่มี SAVE ที่คาดหวัง"; }
        else {
          var sv = saves[0];
          if (tc.expect.items != null && sv.items !== tc.expect.items)
            { ok = false; failMsg = "items=" + sv.items + " ≠ คาด " + tc.expect.items; }
          if (ok && tc.expect.grandTotal != null && sv.grandTotal !== tc.expect.grandTotal)
            { ok = false; failMsg = "grandTotal=" + sv.grandTotal + " ≠ คาด " + tc.expect.grandTotal; }
          if (ok && tc.expect.customerContains && sv.customer.indexOf(tc.expect.customerContains) === -1)
            { ok = false; failMsg = "customer '" + sv.customer + "' ขาด '" + tc.expect.customerContains + "'"; }
          if (ok && tc.expect.phoneContains && sv.phone.indexOf(tc.expect.phoneContains) === -1)
            { ok = false; failMsg = "phone '" + sv.phone + "' ขาด '" + tc.expect.phoneContains + "'"; }
          if (ok && tc.expect.channelEquals && sv.channel !== tc.expect.channelEquals)
            { ok = false; failMsg = "channel='" + sv.channel + "' ≠ คาด '" + tc.expect.channelEquals + "'"; }
          if (ok && tc.expect.paymentStatus && sv.paymentStatus !== tc.expect.paymentStatus)
            { ok = false; failMsg = "paymentStatus='" + sv.paymentStatus + "' ≠ คาด '" + tc.expect.paymentStatus + "'"; }
        }
      }
      if (tc.expect.saved === false && saves.length > 0)
        { ok = false; failMsg = "ไม่ควร SAVE แต่บันทึก " + saves.length + " ครั้ง"; }

      if (tc.expect.replyContains) {
        var allMsgs = s.captured.map(function(c){ return String(c.msg||c.altText||""); }).join("|");
        if (allMsgs.indexOf(tc.expect.replyContains) === -1)
          { ok = false; failMsg = "reply ไม่มีคำว่า '" + tc.expect.replyContains + "'"; }
      }
      if (tc.expect.notReplyContains) {
        var allMsgs2 = s.captured.map(function(c){ return String(c.msg||c.altText||""); }).join("|");
        if (allMsgs2.indexOf(tc.expect.notReplyContains) !== -1)
          { ok = false; failMsg = "reply ไม่ควรมีคำว่า '" + tc.expect.notReplyContains + "' (= bug เดิม)"; }
      }
    }
  } catch(e) {
    ok = false; failMsg = "THREW: " + e.message + " | stack: " + (e.stack || "");
  } finally {
    s.restore();
  }
  Logger.log(ok ? "  ✅ PASS" : "  ❌ FAIL: " + failMsg);
  return ok;
}

function runDoPostE2E() {
  Logger.log("╔══════════════════════════════════════════╗");
  Logger.log("║  🧪 DOPOST E2E TEST (v3.5)               ║");
  Logger.log("╚══════════════════════════════════════════╝");

  var cases = [
    // === กลุ่ม 1: order ที่เคยพัง ===
    {
      name: "1.1 — FB:Miw'w Natcha (text ของจริงที่เคยพัง)",
      text: [
        "วันที่ 9/6/2569",
        "Channel : FB:Miw'w Natcha",
        "",
        "⁃ สตรอเบอรี่ครีมสด 1 ชิ้น 129.-",
        "⁃ ช็อกโกแลตครีมสด 1 ชิ้น 129.-",
        "⁃ ส้มหน้านิ่มครีมสด 1 ชิ้น 129.-",
        "⁃ เรดเวลเวทครีมชีส 1 ชิ้น 129.-",
        "⁃ ชีสทาร์ตบลูเบอรี่ 1 ชิ้น 129.-",
        "⁃ มะพร้าวอ่อนครีมสด 1 ชิ้น 129.-",
        "",
        "รวม 774฿",
        "",
        "ชื่อคนรับ : 470 หมู่ 4 ต.คูคต อ.ลำลูกกา จ.ปทุมธานี",
        "เบอร์ผู้รับ 097-9742071 ค่ะ"
      ].join("\n"),
      expect: { saved:true, items:6, grandTotal:774, customerContains:"Miw'w",
                channelEquals:"FB", phoneContains:"097-9742071", paymentStatus:"Pending",
                notReplyContains:"ระบบกำลังประมวลผล" }
    },
    {
      name: "1.2 — bullet ⁃/-/• mix + ราคา .-",
      text: [
        "วันที่ 10/06/2569",
        "ชื่อคนรับ: คุณตา",
        "เบอร์: 0812345678",
        "ที่อยู่: 1 ม.1 กทม",
        "",
        "รายการ:",
        "⁃ มะพร้าวอ่อนครีมสด 1 ชิ้น 129฿",
        "- ช็อกโกแลตครีมสด 2 ชิ้น 258฿",
        "• ชีสทาร์ตบลูเบอรี่ 1 ชิ้น 129฿",
        "",
        "รวม: 516฿"
      ].join("\n"),
      expect: { saved:true, items:3, grandTotal:516, customerContains:"คุณตา", phoneContains:"0812345678" }
    },

    // === กลุ่ม 2: ฟอร์มใหม่ ===
    {
      name: "2.1 — คัดลอกฟอร์ม (สั่ง template)",
      text: "คัดลอกฟอร์ม",
      expect: { saved:false, replyContains:"ฟอร์มสั่งเค้ก" }
    },
    {
      name: "2.2 — ฟอร์มเปล่า (ยังไม่แก้) ควรเตือน",
      text: [
        "📝 ฟอร์มสั่งเค้ก (ก๊อปแล้วแก้ตามจริงได้เลยค่ะ)",
        "─────────────",
        "วันที่: 03/06/2569",
        "ชื่อคนรับ: คุณมิว",
        "เบอร์: 097-1234567",
        "ที่อยู่: 99/9 ถ.พหลโยธิน แขวงสามเสนใน เขตพญาไท กรุงเทพฯ 10400",
        "",
        "รายการ:",
        "- มะพร้าวอ่อนครีมสด 1 ชิ้น 129฿",
        "- ช็อกโกแลตครีมสด 1 ชิ้น 129฿",
        "",
        "รวม: 258฿",
        "หมายเหตุ: (ถ้ามี เช่น ส่งก่อน 14:00)"
      ].join("\n"),
      expect: { saved:false, replyContains:"ฟอร์มตัวอย่าง" }
    },
    {
      name: "2.3 — ฟอร์มที่แก้ค่าเรียบร้อย",
      text: [
        "📝 ฟอร์มสั่งเค้ก",
        "วันที่: 12/06/2569",
        "ชื่อคนรับ: คุณเทส",
        "เบอร์: 0891112222",
        "ที่อยู่: 100/1 ลาดพร้าว กทม",
        "",
        "รายการ:",
        "- มะพร้าวอ่อนครีมสด 1 ชิ้น 129฿",
        "- ช็อกโกแลตครีมสด 1 ชิ้น 129฿",
        "",
        "รวม: 258฿",
        "หมายเหตุ: ส่งก่อนเที่ยง"
      ].join("\n"),
      expect: { saved:true, items:2, grandTotal:258, customerContains:"คุณเทส", phoneContains:"0891112222" }
    },

    // === กลุ่ม 3: dead button fixes ===
    {
      name: "3.1 — ดูเมนู (ไม่มีเค้ก)",
      text: "ดูเมนู",
      expect: { saved:false, replyContains:"" } // ได้ flex carousel
    },
    {
      name: "3.2 — ❌ ยกเลิก (ไม่มี state)",
      text: "❌ ยกเลิก",
      expect: { saved:false, replyContains:"ไม่มีรายการ" }
    },
    {
      name: "3.3 — ยกเลิก (ไม่มี state)",
      text: "ยกเลิก",
      expect: { saved:false, replyContains:"ไม่มีรายการ" }
    },
    {
      name: "3.4 — summary today (alias)",
      text: "summary today",
      expect: { saved:false, notReplyContains:"ค้นหา" } // ห้ามตก smartSearch
    },

    // === กลุ่ม 4: admin commands ===
    {
      name: "4.1 — help",
      text: "help",
      expect: { saved:false }
    },
    {
      name: "4.2 — summary",
      text: "summary",
      expect: { saved:false }
    },
    {
      name: "4.3 — search today",
      text: "search today",
      expect: { saved:false }
    },

    // === กลุ่ม 5: regression ===
    {
      name: "5.1 — standard form",
      text: [
        "วันที่ส่ง: 15/06/2569",
        "ลูกค้า(ชื่อคนรับ): คุณบี",
        "Channel: LINE",
        "Order Type: Wholesale",
        "รายการ:",
        "- มะพร้าวอ่อนครีมสด 6 ชิ้น = 750",
        "รวมทั้งหมด: 750"
      ].join("\n"),
      expect: { saved:true, items:1 }
    },
    {
      name: "5.2 — short calculated",
      text: "@Trust\nทุเรียน 6**510฿\nส้ม 4**300฿\nรวม 810",
      expect: { saved:true }
    },

    // === กลุ่ม 6: edge cases ===
    {
      name: "6.1 — text ที่ไม่ใช่ order + ไม่ใช่ command (fallback)",
      text: "สวัสดีค่ะ",
      expect: { saved:false, notReplyContains:"ระบบกำลังประมวลผล" }
    },
    {
      name: "6.2 — order text ที่ใช้ ReferenceError test (bug บรรทัด 4719)",
      text: "บันทึกซ้ำ",
      expect: { saved:false, notReplyContains:"ระบบกำลังประมวลผล" }  // ก่อนแก้ lower → จะตก outer catch
    }
  ];

  var passed = 0, failed = 0;
  cases.forEach(function(tc) {
    if (_runCase_(tc)) passed++;
    else failed++;
  });

  Logger.log("─────────────────────────────────────");
  Logger.log("📊 RESULT: " + passed + " passed / " + failed + " failed (จาก " + cases.length + " cases)");
  Logger.log(failed === 0 ? "🎉 ALL E2E TESTS PASSED" : "⚠️  ยังมี " + failed + " case ที่ fail — ดู log ด้านบน");
}

// === ฟังก์ชันสำหรับเทสแบบ interactive — ใส่ text เองได้ ===
// วิธีใช้: ไปแก้ค่า _MY_TEST_TEXT ด้านล่าง แล้วกด Run เลือก runMyTest
// [v3.5.1] เทสออเดอร์บ้านปู่ส่วนย่า ที่ user ส่งเข้ามาว่าไม่ผ่าน
//   - มี leading space บรรทัดแรก
//   - มี blank lines แทรก
//   - ชื่อร้านมี ":" (FB: Myrhh TB)
var _MY_TEST_TEXT = [
  " ออเดอร์รอบส่ง 06 มิถุนายน 2569 @บ้านปู่ส่วนย่า คาแฟ่ FB: Myrhh TB",
  "",
  "มะพร้าวลูก 3 ชิ้น 300฿",
  "สตรอช็อตเค้กสี่เหลี่ยม 5 ชิ้น 375฿",
  "ทีรามิสุ 3 ชิ้น 225฿",
  "เอิร์ลเกรย์ 4 ชิ้น 300฿",
  "",
  "รวม 1,200฿"
].join("\n");

// ============================================================
// VERIFY — เช็คว่าโค้ดใหม่ถูก paste/save ใน Apps Script แล้วจริงไหม
// ============================================================
function verifyV35Loaded() {
  Logger.log("════════════════════════════════════════");
  Logger.log("🔬 VERIFY v3.5 LOADED");
  Logger.log("════════════════════════════════════════");

  var t = "วันที่ 9/6/2569\nChannel : FB:Miw'w Natcha\n\n- มะพร้าวอ่อนครีมสด 1 ชิ้น 129.-\n\nรวม 129฿\nชื่อคนรับ : คุณมิว\nเบอร์ผู้รับ 097-9742071";

  Logger.log("INPUT: " + t.replace(/\n/g," ⏎ "));
  Logger.log("");

  // เทส regex แต่ละตัว
  Logger.log("【REGEX TESTS】");
  Logger.log("  1. date (DD/MM/YYYY)  : " + /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(t));
  Logger.log("  2. address keywords   : " + /(ชื่อคนรับ|เบอร์ผู้รับ|ที่อยู่|สถานที่จัดส่ง|Channel\s*[:：])/i.test(t));
  Logger.log("  3. price (฿ or .-)    : " + /\d+\s*(฿|\.-|บาท)/i.test(t));
  Logger.log("  4. รวม with colon     : " + /รวม\s*[:：]?\s*[\d,]+/.test(t));
  Logger.log("");

  // เรียกฟังก์ชันจริง
  Logger.log("【FUNCTION CALL】");
  Logger.log("  detectOrderPattern_(t) = " + detectOrderPattern_(t));
  Logger.log("  isOrderLikeText_(t)   = " + isOrderLikeText_(t));
  Logger.log("");

  // ตรวจ source code ของฟังก์ชันที่ถูก load
  Logger.log("【LOADED FUNCTION SOURCE】");
  var src = detectOrderPattern_.toString();
  var hasV35     = src.indexOf("v3.5 FIX") > -1;
  var hasPadDate = src.indexOf("_padDate") > -1;
  var hasOldAnchor = src.indexOf("^\\d{1,2}\\/\\d{1,2}\\/\\d{2,4}") > -1;

  Logger.log("  source length        : " + src.length + " chars");
  Logger.log("  contains 'v3.5 FIX'  : " + hasV35);
  Logger.log("  contains '_padDate'  : " + hasPadDate);
  Logger.log("  contains old ^DD/MM  : " + hasOldAnchor + "  (ถ้า true = ยังเป็นโค้ดเก่า)");
  Logger.log("");

  if (hasPadDate && hasV35) {
    Logger.log("✅ โค้ด v3.5 ถูก load แล้ว");
    Logger.log("   → ถ้า detectOrderPattern_ คืน 'unknown' = bug จริงในโค้ด");
  } else {
    Logger.log("❌ โค้ดยังเป็นเวอร์ชันเก่า — ยังไม่ได้ paste/save v3.5");
    Logger.log("");
    Logger.log("📌 วิธีแก้:");
    Logger.log("   1. paste โค้ดใหม่จาก Desktop ลง Apps Script editor");
    Logger.log("   2. กด Ctrl+S Save");
    Logger.log("   3. รันฟังก์ชันนี้อีกครั้ง");
    Logger.log("   4. ถ้ายังเป็นเก่า = อาจมีไฟล์ .gs หลายไฟล์ ที่มี function ชื่อนี้ซ้ำ");
  }
}

// ============================================================
// DIAGNOSE — debug จริงทุกขั้น ลอง save sheet จริง
// ใช้เมื่อ E2E pass แต่ LINE จริงไม่บันทึก
// จะเขียน row ทดสอบลง sheet จริง! (ลบทิ้งเองได้)
// ============================================================
function diagnoseRealSave() {
  Logger.log("╔══════════════════════════════════════════╗");
  Logger.log("║  🔬 DIAGNOSE REAL SAVE                   ║");
  Logger.log("║  จะเขียน row จริงลง sheet — ลบทิ้งได้  ║");
  Logger.log("╚══════════════════════════════════════════╝");
  Logger.log("");

  var text = _MY_TEST_TEXT;
  Logger.log("📥 INPUT TEXT:");
  Logger.log("───────────────────────────────────────");
  Logger.log(text);
  Logger.log("───────────────────────────────────────");

  // ========== STEP 1: Pattern detection ==========
  Logger.log("");
  Logger.log("【STEP 1】 detectOrderPattern_");
  var pat;
  try {
    pat = detectOrderPattern_(text);
    Logger.log("  ✅ pattern = " + pat);
    if (pat === "unknown") {
      Logger.log("  ⚠️ pattern เป็น 'unknown' — text นี้ไม่ตรงกับ pattern ไหนเลย");
      Logger.log("  ⚠️ ระบบจะตก fallback → ลูกค้าจะได้ '❓ ไม่พบข้อมูล'");
    }
  } catch(e) {
    Logger.log("  ❌ THREW: " + e.message);
    Logger.log("  stack: " + e.stack);
    return;
  }

  // ========== STEP 2: isOrderLikeText ==========
  Logger.log("");
  Logger.log("【STEP 2】 isOrderLikeText_");
  var isOrder;
  try {
    isOrder = isOrderLikeText_(text);
    Logger.log("  ✅ isOrderLikeText_ = " + isOrder);
    if (!isOrder) {
      Logger.log("  ⚠️ ไม่ถือเป็น order → จะไม่เข้า save flow");
      return;
    }
  } catch(e) {
    Logger.log("  ❌ THREW: " + e.message);
    return;
  }

  // ========== STEP 3: Parse ==========
  Logger.log("");
  Logger.log("【STEP 3】 parseOrder");
  var parsed;
  try {
    parsed = parseOrder(text);
    if (!parsed) {
      Logger.log("  ❌ parseOrder return null/undefined");
      return;
    }
    Logger.log("  ✅ parsed สำเร็จ:");
    Logger.log("     customerName : " + (parsed.customerName || "(empty)"));
    Logger.log("     tableName    : " + (parsed.tableName || "(empty)"));
    Logger.log("     phone        : " + (parsed.phone || "(empty)"));
    Logger.log("     channel      : " + (parsed.channel || "(empty)"));
    Logger.log("     deliveryDate : " + (parsed.deliveryDate || "(empty)"));
    Logger.log("     paymentDate  : " + (parsed.paymentDate || "(empty)"));
    Logger.log("     grandTotal   : " + parsed.grandTotal);
    Logger.log("     items        : " + (parsed.items||[]).length + " รายการ");
    Logger.log("     paymentStatus: " + parsed.paymentStatus);
    Logger.log("     status       : " + parsed.status);
    Logger.log("     patternType  : " + parsed.patternType);
    Logger.log("     location     : " + String(parsed.location||"").substring(0,80));
    (parsed.items || []).forEach(function(it, i) {
      Logger.log("     item[" + (i+1) + "]: " + it.menuName + " × " + it.quantity + " " + it.unit + " = " + it.itemTotal + "฿");
    });
  } catch(e) {
    Logger.log("  ❌ THREW: " + e.message);
    Logger.log("  stack: " + e.stack);
    return;
  }

  // ========== STEP 4: Validate ==========
  Logger.log("");
  Logger.log("【STEP 4】 validateOrder_");
  var errors;
  try {
    errors = validateOrder_(parsed);
    if (errors.length === 0) {
      Logger.log("  ✅ ผ่าน validate (no errors)");
    } else {
      Logger.log("  ⚠️ พบ error " + errors.length + " ตัว:");
      errors.forEach(function(e) { Logger.log("     - " + e); });
      Logger.log("  → จะ reply error flex แทน save");
    }
  } catch(e) {
    Logger.log("  ❌ THREW: " + e.message);
    return;
  }

  // ========== STEP 5: Sheet info ==========
  Logger.log("");
  Logger.log("【STEP 5】 ตรวจ sheet");
  try {
    var sheet = getSheet();
    var map = getHeaderMap_();
    Logger.log("  ✅ sheet name = " + sheet.getName());
    Logger.log("  ✅ rows ปัจจุบัน = " + sheet.getLastRow());
    Logger.log("  ✅ cols ปัจจุบัน = " + sheet.getLastColumn());
    Logger.log("  ✅ header map keys = " + Object.keys(map).join(","));
    // ตรวจคอลัมน์สำคัญ
    ["orderId","deliveryDate","customerName","phone","grandTotal","paymentStatus","items"].forEach(function(k){
      Logger.log("     " + k + " → col " + (map[k]||"NOT FOUND"));
    });
  } catch(e) {
    Logger.log("  ❌ THREW: " + e.message);
    Logger.log("  ⚠️ สาเหตุที่เป็นไปได้:");
    Logger.log("     - SPREADSHEET_ID ผิด: " + SPREADSHEET_ID);
    Logger.log("     - SHEET_NAME ผิด: " + SHEET_NAME);
    Logger.log("     - ไม่มี permission สิทธิ์ Sheet");
    return;
  }

  // ========== STEP 6: ลอง save จริง ==========
  Logger.log("");
  Logger.log("【STEP 6】 saveOrderToSheet_ (เขียนจริง)");
  if (errors.length > 0) {
    Logger.log("  ⏭️ ข้าม — มี validation errors");
    return;
  }
  try {
    var oid = saveOrderToSheet_(parsed, text, "DIAGNOSE_TEST");
    Logger.log("  ✅ save สำเร็จ! Order ID = " + oid);
    Logger.log("  💡 ลบ row นี้ออกได้: ค้นใน sheet ด้วย " + oid);
  } catch(e) {
    Logger.log("  ❌ SAVE THREW: " + e.message);
    Logger.log("  stack: " + e.stack);
    Logger.log("");
    Logger.log("  🔍 สาเหตุที่เป็นไปได้:");
    Logger.log("     1. คอลัมน์ใน sheet ไม่ match กับ data fields");
    Logger.log("     2. Sheet permission/lock");
    Logger.log("     3. Quota exceeded");
    Logger.log("     4. Field type mismatch (เช่น expect number ได้ string)");
    return;
  }

  // ========== STEP 7: ลอง build success text ==========
  Logger.log("");
  Logger.log("【STEP 7】 buildSaveSuccessText_");
  try {
    var msg = buildSaveSuccessText_(parsed, oid);
    Logger.log("  ✅ success text:");
    msg.split("\n").forEach(function(line) { Logger.log("     " + line); });
  } catch(e) {
    Logger.log("  ❌ THREW: " + e.message);
  }

  Logger.log("");
  Logger.log("═════════════════════════════════════════");
  Logger.log("🎉 DIAGNOSE COMPLETE — ทุกขั้นผ่าน");
  Logger.log("ถ้าใน LINE ยังไม่ทำงาน = ปัญหา deployment เท่านั้น");
  Logger.log("═════════════════════════════════════════");
}

// ============================================================
// ดู log ของ doPost ครั้งล่าสุดที่ user สั่งจริง
// ใช้หลังจากส่งข้อความใน LINE แล้วต้องการดูว่า log อะไรออกมา
// ============================================================
function showLastDoPostFromLog() {
  Logger.log("📋 วิธีดู log doPost ของจริง:");
  Logger.log("");
  Logger.log("1. ใน Apps Script editor → ไอคอนนาฬิกาทรายซ้าย (Executions)");
  Logger.log("2. หา 'doPost' ล่าสุด คลิกที่แถวนั้น");
  Logger.log("3. คลิกแถบ 'Logs' ด้านล่าง");
  Logger.log("");
  Logger.log("👀 มองหาบรรทัดที่ขึ้นต้นด้วย:");
  Logger.log("   [ERROR] event handler failed:  ← stack trace อยู่หลัง 'stack:'");
  Logger.log("   [WARN] unmatched text:        ← parser ไม่รู้จัก pattern");
  Logger.log("   [ERROR] parsePaymentAddressOrder_ failed:");
  Logger.log("");
  Logger.log("📤 copy บรรทัดเต็มมาให้ดู → จะบอกได้ทันทีว่า bug อยู่ตรงไหน");
}

function runMyTest() {
  Logger.log("═════════════════════════════════════════");
  Logger.log("🔬 SINGLE TEST — แก้ค่า _MY_TEST_TEXT ที่ต้นไฟล์");
  Logger.log("═════════════════════════════════════════");
  Logger.log("INPUT:");
  Logger.log(_MY_TEST_TEXT);
  Logger.log("─────────────────────────────────────────");

  // step 1: pattern detection
  var pat = detectOrderPattern_(_MY_TEST_TEXT);
  Logger.log("🔍 detectOrderPattern_ → " + pat);

  // step 2: isOrderLikeText
  Logger.log("🔍 isOrderLikeText_  → " + isOrderLikeText_(_MY_TEST_TEXT));

  // step 3: parse
  try {
    var parsed = parseOrder(_MY_TEST_TEXT);
    Logger.log("🔍 parseOrder result:");
    Logger.log("    customerName : " + (parsed.customerName || "(empty)"));
    Logger.log("    phone        : " + (parsed.phone || "(empty)"));
    Logger.log("    channel      : " + (parsed.channel || "(empty)"));
    Logger.log("    deliveryDate : " + (parsed.deliveryDate || "(empty)"));
    Logger.log("    grandTotal   : " + parsed.grandTotal);
    Logger.log("    items count  : " + (parsed.items || []).length);
    Logger.log("    paymentStatus: " + parsed.paymentStatus);
    Logger.log("    patternType  : " + parsed.patternType);
    (parsed.items || []).forEach(function(it, i) {
      Logger.log("    [" + (i+1) + "] " + it.menuName + " × " + it.quantity + " " + it.unit + " = " + it.itemTotal + "฿");
    });
  } catch(e) {
    Logger.log("❌ parseOrder THREW: " + e.message);
    Logger.log(e.stack);
  }

  // step 4: full doPost simulation
  Logger.log("─────────────────────────────────────────");
  Logger.log("🚀 simulating doPost...");
  var s = _stubReplies_();
  try {
    _mockDoPost_(_MY_TEST_TEXT, {});
    _printCaptured_(s.captured);
  } catch(e) {
    Logger.log("❌ doPost THREW: " + e.message);
    Logger.log(e.stack);
  } finally {
    s.restore();
  }
}

// ============================================================
// [v3.5] 🔬 LIVE DIAGNOSTIC — เช็คครบทุกจุดที่ทำให้ LINE save ไม่ได้
// รัน: เลือก diagnoseLiveLineFailure → กด ▶ Run → ดู Logs
// ============================================================
function diagnoseLiveLineFailure() {
  Logger.log("╔══════════════════════════════════════════╗");
  Logger.log("║  🔬 DIAGNOSE LIVE LINE FAILURE           ║");
  Logger.log("╚══════════════════════════════════════════╝");
  Logger.log("");

  var report = { passed: [], warned: [], failed: [] };

  // ════════════════════════════════════════
  // STEP 1: Token + LINE API connectivity
  // ════════════════════════════════════════
  Logger.log("【1】 LINE Token + API");
  try {
    var tokRes = UrlFetchApp.fetch("https://api.line.me/v2/bot/info", {
      headers: { "Authorization": "Bearer " + LINE_CHANNEL_ACCESS_TOKEN },
      muteHttpExceptions: true
    });
    var tokCode = tokRes.getResponseCode();
    if (tokCode === 200) {
      var botInfo = JSON.parse(tokRes.getContentText());
      Logger.log("  ✅ Token OK | bot: " + botInfo.displayName + " | userId: " + botInfo.userId);
      report.passed.push("LINE token valid");
    } else if (tokCode === 401) {
      Logger.log("  ❌ Token หมดอายุ/ผิด (HTTP 401) → ต้องสร้าง token ใหม่");
      report.failed.push("Token expired (401)");
    } else {
      Logger.log("  ⚠️ Token HTTP " + tokCode + " | resp: " + tokRes.getContentText().substring(0,200));
      report.warned.push("Token HTTP " + tokCode);
    }
  } catch(e) {
    Logger.log("  ❌ Fetch failed: " + e.message);
    report.failed.push("Cannot reach LINE API");
  }
  Logger.log("");

  // ════════════════════════════════════════
  // STEP 2: Webhook endpoint info
  // ════════════════════════════════════════
  Logger.log("【2】 Webhook endpoint");
  try {
    var whRes = UrlFetchApp.fetch("https://api.line.me/v2/bot/channel/webhook/endpoint", {
      headers: { "Authorization": "Bearer " + LINE_CHANNEL_ACCESS_TOKEN },
      muteHttpExceptions: true
    });
    var whData = JSON.parse(whRes.getContentText()||"{}");
    Logger.log("  endpoint: " + (whData.endpoint||"(not set)"));
    Logger.log("  active:   " + whData.active);
    if (!whData.active) {
      Logger.log("  ❌ Webhook ปิดอยู่! → ไปเปิดที่ LINE Developers");
      report.failed.push("Webhook is inactive");
    } else {
      report.passed.push("Webhook active");
    }

    // Test webhook
    var testRes = UrlFetchApp.fetch("https://api.line.me/v2/bot/channel/webhook/test", {
      method: "post",
      headers: { "Authorization": "Bearer " + LINE_CHANNEL_ACCESS_TOKEN, "Content-Type": "application/json" },
      payload: JSON.stringify({ endpoint: whData.endpoint }),
      muteHttpExceptions: true
    });
    var testData = JSON.parse(testRes.getContentText()||"{}");
    Logger.log("  test result: success=" + testData.success + " | statusCode=" + testData.statusCode + " | reason=" + (testData.reason||"-"));
    if (testData.success && testData.statusCode === 200) {
      Logger.log("  ✅ Webhook ตอบ 200 OK");
      report.passed.push("Webhook responds 200");
    } else {
      Logger.log("  ⚠️ Webhook ไม่ตอบ 200 → LINE จะ retry/discard event");
      report.warned.push("Webhook test failed");
    }
  } catch(e) {
    Logger.log("  ❌ " + e.message);
    report.failed.push("Webhook check failed");
  }
  Logger.log("");

  // ════════════════════════════════════════
  // STEP 3: Speed test — doPost ต้อง < 1 วินาที
  // ════════════════════════════════════════
  Logger.log("【3】 Speed test (LINE timeout = 1 วินาที)");
  var testText = "ออเดอร์รอบส่ง 06 มิถุนายน 2569 @TEST-DIAGNOSE\nมะพร้าว 1 ชิ้น 129฿\nรวม 129฿";
  var t0 = new Date().getTime();
  try {
    var pat = detectOrderPattern_(testText);
    var t1 = new Date().getTime();
    Logger.log("  detectOrderPattern_: " + (t1-t0) + "ms → " + pat);

    var isOrder = isOrderLikeText_(testText);
    var t2 = new Date().getTime();
    Logger.log("  isOrderLikeText_:    " + (t2-t1) + "ms → " + isOrder);

    var parsed = parseOrder(testText);
    var t3 = new Date().getTime();
    Logger.log("  parseOrder:          " + (t3-t2) + "ms → items=" + (parsed.items||[]).length);

    var total = t3 - t0;
    Logger.log("  TOTAL parse time: " + total + "ms");
    if (total < 500) {
      Logger.log("  ✅ เร็วพอ (< 500ms)");
      report.passed.push("Parse speed OK");
    } else if (total < 1000) {
      Logger.log("  ⚠️ พอดี (500-1000ms) — เสี่ยง timeout");
      report.warned.push("Parse speed borderline");
    } else {
      Logger.log("  ❌ ช้าเกิน 1 วินาที — LINE จะ timeout");
      report.failed.push("Parse too slow (>1s)");
    }
  } catch(e) {
    Logger.log("  ❌ Parse THREW: " + e.message);
    report.failed.push("Parse throws error");
  }
  Logger.log("");

  // ════════════════════════════════════════
  // STEP 4: Sheet write speed
  // ════════════════════════════════════════
  Logger.log("【4】 Sheet read/write speed");
  try {
    var s0 = new Date().getTime();
    var sheet = getSheet();
    var s1 = new Date().getTime();
    var lastRow = sheet.getLastRow();
    var s2 = new Date().getTime();
    Logger.log("  getSheet():      " + (s1-s0) + "ms");
    Logger.log("  getLastRow():    " + (s2-s1) + "ms → " + lastRow + " rows");

    var c0 = new Date().getTime();
    var data = getSheetDataCached();
    var c1 = new Date().getTime();
    Logger.log("  getSheetData (cached): " + (c1-c0) + "ms → " + data.length + " rows");
    if (c1-c0 > 2000) {
      Logger.log("  ⚠️ Sheet ใหญ่มาก → save ช้าได้");
      report.warned.push("Sheet read >2s");
    } else {
      report.passed.push("Sheet speed OK");
    }
  } catch(e) {
    Logger.log("  ❌ " + e.message);
    report.failed.push("Sheet access failed");
  }
  Logger.log("");

  // ════════════════════════════════════════
  // STEP 5: Duplicate hash blocks
  // ════════════════════════════════════════
  Logger.log("【5】 Duplicate hash store");
  try {
    var props = PropertiesService.getScriptProperties();
    var all = props.getProperties();
    var hashCnt = 0, msgCnt = 0, stateCnt = 0;
    Object.keys(all).forEach(function(k){
      if (k.indexOf("rawHash_")===0) hashCnt++;
      if (k.indexOf("msg_")===0) msgCnt++;
      if (k.indexOf("state_")===0) stateCnt++;
    });
    Logger.log("  rawHash_ keys:   " + hashCnt + " (กัน save ซ้ำ)");
    Logger.log("  msg_ keys:       " + msgCnt + " (กัน event ซ้ำ)");
    Logger.log("  state_ keys:     " + stateCnt + " (user states)");
    if (hashCnt > 500) {
      Logger.log("  ⚠️ rawHash เยอะมาก — อาจ block order ใหม่ที่บังเอิญ hash ซ้ำ");
      report.warned.push("rawHash too many");
    }
    if (stateCnt > 10) {
      Logger.log("  ⚠️ มี user states ค้าง — อาจมีคนติด CONFIRM_OVERWRITE");
      Logger.log("  💡 รัน clearAllStuckStates_() ล้างได้");
      report.warned.push("Stuck user states");
    }
    if (hashCnt < 500 && stateCnt < 10) report.passed.push("Properties OK");
  } catch(e) {
    Logger.log("  ❌ " + e.message);
  }
  Logger.log("");

  // ════════════════════════════════════════
  // STEP 6: Recent saves in sheet
  // ════════════════════════════════════════
  Logger.log("【6】 Last 5 orders in sheet");
  try {
    var recent = getLatestUniqueOrderRows_(5);
    var grouped = groupRowsByOrder(recent);
    if (!grouped.length) {
      Logger.log("  ⚠️ ไม่มีออเดอร์เลย → save ไม่เคยทำงาน");
      report.warned.push("No orders in sheet");
    } else {
      grouped.forEach(function(g, i) {
        var main = g.rows[0];
        Logger.log("  " + (i+1) + ". " + g.orderId + " | " + (main.customerName||"-") + " | " + (main.timestamp||main.lastUpdatedAt||"-"));
      });
    }
  } catch(e) {
    Logger.log("  ❌ " + e.message);
  }
  Logger.log("");

  // ════════════════════════════════════════
  // STEP 7: Code version check
  // ════════════════════════════════════════
  Logger.log("【7】 Deploy code version");
  try {
    var src1 = detectOrderPattern_.toString();
    var src2 = parsePaymentAddressOrder_.toString();
    var src3 = doPost.toString();
    var hasV35Pad = src1.indexOf("_padDate") > -1;
    var hasFieldAware = src2.indexOf("STOP_") > -1 || src2.indexOf("field-aware") > -1;
    var hasFastWebhook = src3.indexOf("เร็วที่สุดถ้าไม่มี events") > -1 || src3.indexOf("Verify webhook") > -1;
    Logger.log("  detectOrderPattern v3.5:  " + (hasV35Pad ? "✅" : "❌ เก่า"));
    Logger.log("  paymentAddress v3.5:      " + (hasFieldAware ? "✅" : "❌ เก่า"));
    Logger.log("  doPost fast-webhook v3.5: " + (hasFastWebhook ? "✅" : "❌ เก่า"));
    if (hasV35Pad && hasFieldAware && hasFastWebhook) report.passed.push("Code is v3.5");
    else report.failed.push("Code is OLD version");
  } catch(e) {
    Logger.log("  ❌ " + e.message);
  }
  Logger.log("");

  // ════════════════════════════════════════
  // SUMMARY
  // ════════════════════════════════════════
  Logger.log("╔══════════════════════════════════════════╗");
  Logger.log("║  📊 SUMMARY                              ║");
  Logger.log("╚══════════════════════════════════════════╝");
  Logger.log("✅ PASS (" + report.passed.length + "): " + report.passed.join(", "));
  Logger.log("⚠️  WARN (" + report.warned.length + "): " + report.warned.join(", "));
  Logger.log("❌ FAIL (" + report.failed.length + "): " + report.failed.join(", "));
  Logger.log("");
  Logger.log("💡 NEXT STEP:");
  if (report.failed.length === 0 && report.warned.length === 0) {
    Logger.log("  ทุกอย่าง OK — ปัญหาน่าจะอยู่ที่:");
    Logger.log("  1. Deploy ยังไม่ใช่ใหม่สุด → Manage deployments → New version");
    Logger.log("  2. ลูกค้าเห็นคำถาม 'ทับใบเดิม?' แต่ไม่ได้ตอบ → state ค้าง");
    Logger.log("  3. ลอง: clearAllStuckStates_() แล้วทดสอบใหม่");
  } else if (report.failed.length > 0) {
    Logger.log("  แก้ FAIL ก่อน — สาเหตุหลักของ LINE ไม่บันทึก");
  } else {
    Logger.log("  ดู WARN — อาจเป็นสาเหตุ");
  }
}

// ============================================================
// ล้าง state ที่ค้าง (CONFIRM_OVERWRITE, ADD_ITEMS, SLIP_PICK, etc.)
// รันเมื่อสงสัยว่ามี user ติด state เก่า → ระบบ reply คำถามแทน save
// ============================================================
function clearAllStuckStates_() {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  var cleared = 0;
  Object.keys(all).forEach(function(k){
    if (k.indexOf("state_") === 0) {
      try {
        var st = JSON.parse(all[k]);
        Logger.log("ล้าง: " + k + " | step=" + (st.step||"?"));
      } catch(e) {}
      props.deleteProperty(k);
      cleared++;
    }
  });
  Logger.log("✅ ล้าง " + cleared + " stuck states แล้ว");
  return cleared;
}

// ล้าง rawHash + messageId dedupe — เผื่อ block save ใหม่
function clearAllDupHashes_() {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  var cnt = 0;
  Object.keys(all).forEach(function(k){
    if (k.indexOf("rawHash_")===0 || k.indexOf("msg_")===0) {
      props.deleteProperty(k); cnt++;
    }
  });
  Logger.log("✅ ล้าง " + cnt + " dup keys (rawHash + msg)");
  return cnt;
}

// ============================================================
// [v3.5] เช็ค LINE message quota — ใช้ไปกี่ข้อความแล้ว
// รัน: เลือก checkLineQuota → ▶ Run → ดู Logs
// ============================================================
function checkLineQuota() {
  Logger.log("╔══════════════════════════════════════════╗");
  Logger.log("║  📊 LINE MESSAGE QUOTA CHECK             ║");
  Logger.log("╚══════════════════════════════════════════╝");
  Logger.log("");

  var headers = { "Authorization": "Bearer " + LINE_CHANNEL_ACCESS_TOKEN };

  // 1. Quota รวมต่อเดือน
  try {
    var qRes = UrlFetchApp.fetch("https://api.line.me/v2/bot/message/quota", {
      headers: headers, muteHttpExceptions: true
    });
    var qData = JSON.parse(qRes.getContentText()||"{}");
    Logger.log("【1】 Monthly quota limit");
    Logger.log("  type:  " + qData.type);   // none / limited
    Logger.log("  value: " + qData.value + " messages/month");
    if (qData.type === "none") {
      Logger.log("  ⚠️ type=none → ใช้ default free quota (200/เดือน)");
    }
  } catch(e) {
    Logger.log("  ❌ " + e.message);
  }
  Logger.log("");

  // 2. ใช้ไปแล้วเท่าไหร่
  try {
    var uRes = UrlFetchApp.fetch("https://api.line.me/v2/bot/message/quota/consumption", {
      headers: headers, muteHttpExceptions: true
    });
    var uData = JSON.parse(uRes.getContentText()||"{}");
    Logger.log("【2】 ใช้ไปแล้วเดือนนี้");
    Logger.log("  totalUsage: " + uData.totalUsage + " messages");
  } catch(e) {
    Logger.log("  ❌ " + e.message);
  }
  Logger.log("");

  // 3. ลองส่ง push ทดสอบ — ดู error ว่าเกินหรือยัง
  try {
    var testRes = UrlFetchApp.fetch("https://api.line.me/v2/bot/message/push", {
      method: "post",
      headers: { "Authorization": "Bearer " + LINE_CHANNEL_ACCESS_TOKEN, "Content-Type": "application/json" },
      payload: JSON.stringify({
        to: ADMIN_USER_IDS[0],
        messages: [{type:"text", text:"🧪 ทดสอบ quota — " + new Date().toISOString()}]
      }),
      muteHttpExceptions: true
    });
    var code = testRes.getResponseCode();
    Logger.log("【3】 Test push (ส่งหา admin)");
    Logger.log("  HTTP code: " + code);
    if (code === 200) {
      Logger.log("  ✅ ยังส่งได้ — quota ไม่เต็ม");
    } else if (code === 429) {
      Logger.log("  ❌ HTTP 429 = Quota เต็ม! ต้องรอเดือนหน้าหรือ upgrade plan");
    } else {
      Logger.log("  ⚠️ HTTP " + code + " | resp: " + testRes.getContentText().substring(0,200));
    }
  } catch(e) {
    Logger.log("  ❌ " + e.message);
  }
}

// ============================================================
// [v3.5] หา LINE userId ของคุณ — จาก Message_Log sheet
// รัน: ส่งข้อความใน LINE ก่อน แล้วมารันฟังก์ชันนี้
// ============================================================
function findMyLineUserId() {
  Logger.log("╔══════════════════════════════════════════╗");
  Logger.log("║  🔍 FIND YOUR LINE USER ID               ║");
  Logger.log("╚══════════════════════════════════════════╝");
  Logger.log("");

  try {
    var sh = getLogSheet_();
    var data = sh.getDataRange().getValues();
    if (data.length <= 1) {
      Logger.log("❌ ไม่มี log — ส่งข้อความใน LINE ก่อน แล้วรันใหม่");
      return;
    }
    // Col D = User ID (index 3)
    var userIds = {};
    for (var i = 1; i < data.length; i++) {
      var uid = String(data[i][3]||"").trim();
      if (uid && uid.indexOf("U") === 0) {
        userIds[uid] = (userIds[uid]||0) + 1;
      }
    }

    var sorted = Object.keys(userIds).map(function(k){
      return { uid: k, count: userIds[k] };
    }).sort(function(a,b){ return b.count - a.count; });

    if (!sorted.length) {
      Logger.log("❌ ไม่เจอ userId ใน log — ส่งข้อความใน LINE ก่อน");
      return;
    }

    Logger.log("พบ " + sorted.length + " userId ใน log:");
    Logger.log("");
    sorted.slice(0, 5).forEach(function(u, i) {
      Logger.log("  " + (i+1) + ". " + u.uid + "  (ใช้ " + u.count + " ครั้ง, ยาว " + u.uid.length + " ตัว)");
    });
    Logger.log("");

    var topId = sorted[0].uid;
    if (topId.length === 33) {
      Logger.log("✅ น่าจะเป็น userId ของคุณ:");
      Logger.log("");
      Logger.log("   " + topId);
      Logger.log("");
      Logger.log("📋 วิธีใช้:");
      Logger.log("1. copy userId ด้านบน");
      Logger.log("2. แก้ในโค้ด (~บรรทัด 50):");
      Logger.log('   var ADMIN_USER_IDS = ["' + topId + '"];');
      Logger.log('   var NOTIFY_TO_USER_IDS = ["' + topId + '"];');
      Logger.log("3. Save → Deploy → New version");
    } else {
      Logger.log("⚠️ userId top มี " + topId.length + " ตัว — ปกติต้อง 33");
    }
  } catch(e) {
    Logger.log("❌ Error: " + e.message);
  }
}

// ============================================================
// [v3.5.1] 🎥 กล้องวงจรปิด — อ่าน Message_Log ว่าออเดอร์จริงเดินไป path ไหน
// คอลัมน์ J "Handled By" บอกผลลัพธ์: save / ask_overwrite / dup_skip / fallback / error
// รัน: หลังส่งออเดอร์ใน LINE แล้ว → เลือก showRecentMessageLog_ → ▶ Run
// ============================================================
function showRecentMessageLog_() {
  Logger.log("╔══════════════════════════════════════════╗");
  Logger.log("║  🎥 RECENT MESSAGE LOG (live doPost)     ║");
  Logger.log("╚══════════════════════════════════════════╝");
  Logger.log("");
  try {
    var sh = getLogSheet_();
    var data = sh.getDataRange().getValues();
    if (data.length <= 1) { Logger.log("❌ Message_Log ว่าง — ส่งข้อความใน LINE ก่อน"); return; }

    // คอลัมน์: A=Timestamp(0) C=SourceType(2) D=UserId(3) G=Text(6) I=Intent(8) J=HandledBy(9)
    var start = Math.max(1, data.length - 15);
    Logger.log("15 event ล่าสุด (ใหม่อยู่ล่าง):");
    Logger.log("─────────────────────────────────────");
    for (var i = start; i < data.length; i++) {
      var ts        = String(data[i][0]||"");
      var srcType   = String(data[i][2]||"");
      var textCol   = String(data[i][6]||"").substring(0,40).replace(/\n/g," ");
      var intent    = String(data[i][8]||"");
      var handledBy = String(data[i][9]||"");

      // ตีความ handledBy ให้เข้าใจง่าย
      var verdict = "";
      if (handledBy==="save")              verdict = "✅ บันทึกสำเร็จ";
      else if (handledBy==="ask_overwrite")verdict = "🔄 ถามทับใบเดิม (ออเดอร์ซ้ำ customer+date)";
      else if (handledBy==="dup_skip")     verdict = "⚠️ บล็อก! text ซ้ำ hash เดิม";
      else if (handledBy==="ask_customer_name") verdict = "👤 รอชื่อลูกค้า";
      else if (handledBy==="fallback")     verdict = "❌ ไม่พบข้อมูล (isOrderLikeText=false)";
      else if (handledBy==="error")        verdict = "💥 ERROR ตอน save";
      else if (handledBy==="admin")        verdict = "⚙️ admin command";
      else if (handledBy==="guard")        verdict = "🛡️ ฟอร์มเปล่า";
      else if (handledBy==="wake"||handledBy==="stop") verdict = "🐔 wake/stop word";
      else verdict = handledBy;

      Logger.log((i-start+1) + ". [" + ts + "] (" + (srcType||"user") + ")");
      Logger.log("   text: \"" + textCol + "\"");
      Logger.log("   intent=" + intent + " | → " + verdict);
    }
    Logger.log("─────────────────────────────────────");
    Logger.log("");
    Logger.log("💡 อ่านผล:");
    Logger.log("  ✅ save              = ใช้งานได้ปกติ");
    Logger.log("  🔄 ask_overwrite     = order ซ้ำ → กด '🆕 บันทึกใบใหม่'");
    Logger.log("  ⚠️ dup_skip          = text เป๊ะเดิม → รัน clearAllDupHashes_()");
    Logger.log("  ❌ fallback          = deploy เก่า! parser ไม่จับ → re-deploy New version");
    Logger.log("  💥 error             = bug จริง → ดู Executions log หา stack trace");
    Logger.log("  (group + ไม่มี log)  = standby หมดอายุ → บอทเงียบในกลุ่ม");
  } catch(e) {
    Logger.log("❌ Error: " + e.message);
  }
}

// ============================================================
// [v3.5.1] 📝 DEBUG LOG — บันทึก log เป็น text ดูง่าย (2 ช่องทาง)
//   1. sheet "Debug_Log"  — เปิดใน Google Sheets อ่านได้เลย
//   2. doGet web viewer    — เปิด URL ใน browser เห็น text ทันที ไม่ต้องเข้า Apps Script
//
// วิธีดู log ใน browser:
//   เอา Web App URL (.../exec) มาต่อท้าย ?log=1
//   เช่น  https://script.google.com/macros/s/AKfyc.../exec?log=1
//   → เห็น log ล่าสุด 60 บรรทัด เป็น text ธรรมดา
//   พารามิเตอร์:  ?log=1&n=100   (n = จำนวนบรรทัด)
//                 ?log=msg       (ดู Message_Log แทน)
// ============================================================

var DEBUG_LOG_SHEET = "Debug_Log";
var DEBUG_LOG_MAX_ROWS = 2000;  // เกินนี้ลบแถวเก่าทิ้ง กัน sheet บวม

function getDebugLogSheet_() {
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName(DEBUG_LOG_SHEET);
  if (!sh) {
    sh = ss.insertSheet(DEBUG_LOG_SHEET);
    sh.getRange(1,1,1,4).setValues([["Timestamp","Tag","Message","Context"]]);
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 160);
    sh.setColumnWidth(2, 120);
    sh.setColumnWidth(3, 420);
    sh.setColumnWidth(4, 320);
  }
  return sh;
}

// dbg_(tag, message, ctx) — เรียกตรงไหนก็ได้ในโค้ด เพื่อจดบันทึกเป็น text
//   ตามมาตรฐาน CLAUDE.md Habit 5: timestamp + tag(=fn/step) + message + context
function dbg_(tag, message, ctx) {
  try {
    var ts = getTimestampTH();
    var ctxStr = "";
    if (ctx !== undefined && ctx !== null) {
      try { ctxStr = (typeof ctx === "string") ? ctx : JSON.stringify(ctx); }
      catch(e) { ctxStr = String(ctx); }
    }
    getDebugLogSheet_().appendRow([ts, String(tag||""), String(message||""), ctxStr.substring(0,500)]);
    // Logger ด้วย เผื่อดู Executions
    Logger.log("[DBG]["+tag+"] "+message+(ctxStr?" | "+ctxStr.substring(0,200):""));
  } catch(e) {
    Logger.log("[ERROR] dbg_ failed: "+e.message);
  }
}

// ล้าง Debug_Log ทั้งหมด (เหลือ header)
function clearDebugLog_() {
  var sh = getDebugLogSheet_();
  if (sh.getLastRow() > 1) sh.deleteRows(2, sh.getLastRow()-1);
  Logger.log("✅ ล้าง Debug_Log แล้ว");
}


// ============================================================
// doGet — เปิด URL ใน browser เพื่อดู log เป็น text
// ============================================================
function doGet(e) {
  try {
    var p = (e && e.parameter) ? e.parameter : {};
    var n = Math.min(parseInt(p.n,10) || 60, 500);

    // [v3.6] LIFF Dashboard API
    if (p.api) return _apiRouter_(p);

    // ?log=msg → ดู Message_Log (พร้อม verdict)
    if (p.log === "msg" || p.log === "message") {
      return _renderMessageLogText_(n);
    }
    // ?log=1 หรือ ?log=debug → ดู Debug_Log
    if (p.log) {
      return _renderDebugLogText_(n);
    }
    // default — health check (กัน LINE webhook GET พัง)
    return ContentService.createTextOutput("OK — Sunrise Order Bot is running.\n\nดู log:  ?log=1  (Debug_Log)\n        ?log=msg  (Message_Log)\n        API:    ?api=verify&uid=U...\n                ?api=orders&date=YYYY-MM-DD\n                ?api=production&from=YYYY-MM-DD&to=YYYY-MM-DD\n                ?api=stats&month=MM/YYYY")
      .setMimeType(ContentService.MimeType.TEXT);
  } catch(err) {
    return ContentService.createTextOutput("ERROR: "+err.message+"\n"+(err.stack||""))
      .setMimeType(ContentService.MimeType.TEXT);
  }
}

// ============================================================
// [v3.6] LIFF DASHBOARD API
// ============================================================
function _apiJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function _apiRouter_(p) {
  try {
    var action = String(p.api||"").toLowerCase();
    // [v3.6.5] Write actions — เช็คตาม DASHBOARD_OPEN_WRITE
    //   ถ้า OPEN_WRITE=true → ทุก LINE user (uid ใดก็ได้) แก้/เพิ่ม/ลบได้
    //   ถ้า OPEN_WRITE=false → เฉพาะ ADMIN_USER_IDS
    var writeActions = ["update","urgent","paid","cancel","status","note","additem","removeitem","parsesave","announce"];
    if (writeActions.indexOf(action) > -1) {
      var uid = String(p.uid||"").trim();
      if (!uid) return _apiJson_({ok:false, error:"missing uid — login LINE ก่อน"});
      if (!DASHBOARD_OPEN_WRITE && !isAdminUser_(uid)) {
        return _apiJson_({ok:false, error:"unauthorized — admin only"});
      }
      // [#orderlog] บันทึก audit trail ต่อออเดอร์ (ใครสั่งทำอะไรเมื่อไหร่)
      //   log "เจตนา" ก่อน handler รัน — actions เกือบทั้งหมดสำเร็จ
      if (p.orderId) { try { logAudit_(String(p.orderId), action, "liff:"+uid); } catch(_) {} }
    }
    switch(action) {
      case "verify":     return _apiVerify_(p);
      case "orders":     return _apiOrders_(p);
      case "production": return _apiProduction_(p);
      case "stats":      return _apiStats_(p);
      case "ping":       return _apiJson_({ok:true, ts:getTimestampTH()});
      // ── write actions ──
      case "update":     return _apiUpdate_(p);
      case "urgent":     return _apiToggleUrgent_(p);
      case "paid":       return _apiMarkPaid_(p);
      case "cancel":     return _apiCancel_(p);
      case "status":     return _apiStatus_(p);
      case "note":       return _apiNote_(p);
      case "additem":    return _apiAddItem_(p);
      case "removeitem": return _apiRemoveItem_(p);
      case "parsesave":  return _apiParseSave_(p);
      // [v3.6.2] new endpoints
      case "search":     return _apiSearch_(p);
      case "customer":   return _apiCustomer_(p);
      case "menus":      return _apiMenus_(p);
      case "newcount":   return _apiNewCount_(p);
      case "audit":      return _apiAudit_(p);
      case "orderlog":   return _apiOrderLog_(p);
      case "announce":   return _apiAnnounce_(p);
      // [#team] gamified team board
      case "team":          return _apiTeam_(p);
      case "teamheartbeat": return _apiTeamHeartbeat_(p);
      case "teamprofile":   return _apiTeamProfile_(p);
      default:           return _apiJson_({ok:false, error:"unknown action: "+action});
    }
  } catch(e) {
    Logger.log("[API ERROR] "+e.message+" | "+e.stack);
    return _apiJson_({ok:false, error:e.message});
  }
}

// ── WRITE ENDPOINTS ──
// /?api=update&uid=U...&orderId=ORD-...&customer=...&phone=...&time=...&date=YYYY-MM-DD&location=...
function _apiUpdate_(p) {
  var oid = String(p.orderId||"").trim();
  if (!oid) return _apiJson_({ok:false, error:"missing orderId"});
  var fields = {};
  if (p.customer !== undefined) fields.customerName = String(p.customer);
  if (p.phone    !== undefined) fields.phone        = String(p.phone);
  if (p.time     !== undefined) fields.deliveryTime = String(p.time);
  if (p.date     !== undefined) fields.deliveryDate = _isoToTHDate_(String(p.date));
  if (p.location !== undefined) fields.location     = String(p.location);
  if (p.fee      !== undefined) fields.deliveryFee  = toNumber(p.fee);
  if (p.channel  !== undefined) fields.channel      = String(p.channel);
  if (Object.keys(fields).length === 0) return _apiJson_({ok:false, error:"no fields"});
  var res = updateOrderField_(oid, fields, "liff:"+String(p.uid||"").substring(0,8));
  return _apiJson_(res);
}

function _apiToggleUrgent_(p) {
  var oid = String(p.orderId||"").trim();
  var on  = String(p.on||"1") === "1";
  if (!oid) return _apiJson_({ok:false, error:"missing orderId"});
  var res = setOrderUrgent_(oid, on, "liff:"+String(p.uid||"").substring(0,8));
  return _apiJson_(res);
}

function _apiMarkPaid_(p) {
  var oid = String(p.orderId||"").trim();
  if (!oid) return _apiJson_({ok:false, error:"missing orderId"});
  // [v3.7] on=0 → ยกเลิกสถานะชำระ (กดผิด) / on=1 หรือไม่ส่ง → mark ชำระแล้ว
  var on = String(p.on === undefined ? "1" : p.on) !== "0";
  if (!on) {
    var okUn = unmarkOrderPaid_(oid);
    return _apiJson_({ok:okUn});
  }
  var slip = String(p.slip||"");
  var ok = markOrderPaidWithSlip_(oid, slip, getTodayTH(),
    Utilities.formatDate(new Date(), TIMEZONE, "HH:mm"));
  // [#team] +1 แต้ม mark ชำระภายใน 1 ชม. หลัง order สร้าง
  try {
    if (ok && p.uid) {
      var rows = findOrderRowsById_(oid);
      var main = rows.find(function(r){ return toNumber(r.grandTotal)>0; }) || rows[0];
      if (main && main.createdAt) {
        var created = main.createdAt instanceof Date ? main.createdAt : new Date(main.createdAt);
        var diffMs = new Date() - created;
        if (!isNaN(diffMs) && diffMs <= 3600000) {
          _appendPointsRow_(p.uid, oid, "paid_fast", 1);
        }
      }
    }
  } catch(_) {}
  return _apiJson_({ok:ok});
}

function _apiCancel_(p) {
  var oid = String(p.orderId||"").trim();
  if (!oid) return _apiJson_({ok:false, error:"missing orderId"});
  var res = cancelOrder_(oid, "liff:"+String(p.uid||"").substring(0,8));
  return _apiJson_(res);
}

function _apiStatus_(p) {
  var oid = String(p.orderId||"").trim();
  var st  = String(p.value||"").trim();
  if (!oid || !st) return _apiJson_({ok:false, error:"missing orderId/value"});
  var res = updateOrderStatus_(oid, st, "liff:"+String(p.uid||"").substring(0,8));
  // [#team] +1 เมื่อ mark "ส่งแล้ว" (+2 ถ้า urgent ทันเวลา)
  try {
    if (res && res.ok !== false && p.uid && /^(completed|ส่งแล้ว|delivered)$/i.test(st)) {
      var rows = findOrderRowsById_(oid);
      var main = rows.find(function(r){ return toNumber(r.grandTotal)>0; }) || rows[0];
      if (main) {
        var isUrgent = !!main.isUrgent || isNoteUrgent_(main.note);
        var deliveryMin = parseDeliveryTimeMinutes_(main.deliveryTime);
        var now = new Date();
        var nowMin = now.getHours()*60 + now.getMinutes();
        var onTime = deliveryMin >= 0 && nowMin <= deliveryMin;
        if (isUrgent && onTime) {
          _appendPointsRow_(p.uid, oid, "urgent_ontime", 2);
        } else {
          _appendPointsRow_(p.uid, oid, "delivered", 1);
        }
      } else {
        _appendPointsRow_(p.uid, oid, "delivered", 1);
      }
    }
  } catch(e) { Logger.log("[WARN] team points hook (status): "+e.message); }
  return _apiJson_(res);
}

function _apiNote_(p) {
  var oid = String(p.orderId||"").trim();
  if (!oid) return _apiJson_({ok:false, error:"missing orderId"});
  var note = String(p.value||"");
  // คง urgent marker ถ้ามี
  var rows = findOrderRowsById_(oid);
  if (rows.length && isNoteUrgent_(rows[0].note)) note = URGENT_MARKER + " " + note;
  var res = updateOrderField_(oid, {note:note}, "liff:"+String(p.uid||"").substring(0,8));
  return _apiJson_(res);
}

// /?api=addItem&uid=U...&orderId=ORD-...&menu=...&qty=2&unit=ชิ้น&price=200
function _apiAddItem_(p) {
  var oid = String(p.orderId||"").trim();
  var menuName = String(p.menu||"").trim();
  var qty = toNumber(p.qty);
  var unit = String(p.unit||"ชิ้น").trim();
  var total = toNumber(p.price);
  if (!oid || !menuName || qty <= 0 || total <= 0)
    return _apiJson_({ok:false, error:"missing orderId/menu/qty/price"});
  var newItems = [{
    menuName: resolveMenuAlias(cleanMenuName_(menuName)),
    unit: unit, quantity: qty,
    unitPrice: Math.round(total/qty), itemTotal: total,
    isAddon: false, modifier: "", baseProduct: menuName
  }];
  var res = appendItemsToOrder_(oid, newItems, "liff:"+String(p.uid||"").substring(0,8));
  return _apiJson_(res);
}

function _apiRemoveItem_(p) {
  var oid = String(p.orderId||"").trim();
  var menuHint = String(p.menu||"").trim();
  if (!oid || !menuHint) return _apiJson_({ok:false, error:"missing orderId/menu"});
  var res = removeItemFromOrder_(oid, menuHint, "liff:"+String(p.uid||"").substring(0,8));
  return _apiJson_(res);
}

// /?api=parseSave&uid=U...&text=<order text>
// ใช้ parser เดียวกับใน LINE bot — admin paste text แล้ว save
function _apiParseSave_(p) {
  var text = String(p.text||"").trim();
  if (!text) return _apiJson_({ok:false, error:"missing text"});
  var normalized = _normalizeIncomingText_(text);
  if (!isOrderLikeText_(normalized)) {
    return _apiJson_({ok:false, error:"ข้อความไม่ใช่ฟอร์มออเดอร์ — ตรวจ ออเดอร์รอบส่ง / รวม / เมนู"});
  }
  try {
    var orderData = parseOrder(normalized);
    var errors = validateOrder_(orderData);
    if (errors.length > 0)
      return _apiJson_({ok:false, error:"ขาดข้อมูล: "+errors.join(", "), parsed:orderData});

    // [v3.6.2/B3] duplicate guard ฝั่งเว็บ (LINE path มีอยู่แล้ว) — ส่ง force=1 เพื่อบันทึกซ้ำ
    if (!p.force) {
      var dupOid = isDuplicateOrder_(normalized);
      if (dupOid) {
        return _apiJson_({ok:false, duplicate:true, existingOrderId:dupOid,
          error:"ข้อความนี้เหมือนออเดอร์ "+dupOid+" ที่บันทึกไปแล้ว"});
      }
      var existDup = findActiveOrderByCustomerDate_(orderData.customerName, orderData.deliveryDate);
      if (existDup) {
        return _apiJson_({ok:false, duplicate:true, existingOrderId:existDup.orderId,
          error:"มีออเดอร์ของ \""+(orderData.customerName||"-")+"\" วันที่ "+orderData.deliveryDate+" อยู่แล้ว ("+existDup.orderId+")"});
      }
    }

    var oid = saveOrderToSheet_(orderData, normalized, "liff:"+String(p.uid||"").substring(0,8));
    // [#team] +1 เมื่อสร้างออเดอร์ใหม่
    try { if (p.uid) _appendPointsRow_(p.uid, oid, "created", 1); } catch(_) {}
    return _apiJson_({ok:true, orderId:oid, customer:orderData.customerName,
      total:toNumber(orderData.grandTotal), items:(orderData.items||[]).length});
  } catch(e) {
    return _apiJson_({ok:false, error:e.message});
  }
}

// ============================================================
// [v3.6.2] NEW DASHBOARD ENDPOINTS
// ============================================================

// /?api=search&q=keyword[&limit=20]
//   ค้นหาออเดอร์ทุก field — customer/phone/menu/location/note/orderId
function _apiSearch_(p) {
  var q = String(p.q||"").trim();
  var limit = Math.min(parseInt(p.limit,10)||30, 100);
  if (!q || q.length < 2) return _apiJson_({ok:true, count:0, orders:[]});

  var cacheKey = "api_search_v"+getCacheVersion_()+"_"+q+"_"+limit;
  var cached = _apiCacheGet_(cacheKey);
  if (cached) return ContentService.createTextOutput(cached).setMimeType(ContentService.MimeType.JSON);

  var rows = smartSearch(q);
  var groups = groupRowsByOrder(rows).slice(0, limit);
  var orders = groups.map(function(g) {
    var main = g.rows.find(function(r){ return toNumber(r.grandTotal)>0; }) || g.rows[0];
    return {
      orderId: g.orderId,
      customerName: String(main.customerName||main.tableName||""),
      phone: String(main.phone||""),
      deliveryDate: String(main.deliveryDate||""),
      deliveryDateISO: _thToISO_(main.deliveryDate),
      deliveryTime: String(main.deliveryTime||""),
      location: String(main.location||"").substring(0,100),
      grandTotal: toNumber(main.grandTotal),
      deliveryFee: toNumber(main.deliveryFee),
      paymentStatus: String(main.paymentStatus||""),
      status: String(main.status||"preparing"),
      kitchenStatus: String(main.kitchenStatus||""),
      isUrgent: isNoteUrgent_(main.note),
      isPassed: isDeliveryPassed(main.deliveryDate, main.deliveryTime),
      note: stripUrgentMarker_(main.note||"").substring(0,150),
      channel: String(main.channel||""),
      deliveryType: String(main.deliveryType||""),
      googleMap: "",
      items: g.rows.filter(function(r){return r.menuName;}).map(function(r){
        return {menuName:String(r.menuName||""),unit:String(r.unit||""),qty:toNumber(r.qty),
          unitPrice:toNumber(r.unitPrice),itemTotal:toNumber(r.itemTotal)};
      })
    };
  });
  var jsonStr = JSON.stringify({ok:true, count:orders.length, query:q, orders:orders});
  _apiCachePut_(cacheKey, jsonStr, 60);
  return ContentService.createTextOutput(jsonStr).setMimeType(ContentService.MimeType.JSON);
}

// /?api=customer&name=<customer name>
//   ดูประวัติลูกค้า: ออเดอร์ทั้งหมด + ยอดรวม + top menu
function _apiCustomer_(p) {
  var name = String(p.name||"").trim();
  if (!name) return _apiJson_({ok:false, error:"missing name"});

  var cacheKey = "api_customer_v"+getCacheVersion_()+"_"+name;
  var cached = _apiCacheGet_(cacheKey);
  if (cached) return ContentService.createTextOutput(cached).setMimeType(ContentService.MimeType.JSON);

  var nameLow = name.toLowerCase().replace(/\s+/g,"");
  var rows = getOrderRows(function(r) {
    var c = String(r.customerName||r.tableName||"").toLowerCase().replace(/\s+/g,"");
    return !isRowCancelled(r) && (c === nameLow || c.indexOf(nameLow) > -1 || nameLow.indexOf(c) > -1);
  }, 500);

  var groups = groupRowsByOrder(rows);
  var orders = [];
  var totalSpent = 0, totalItems = 0;
  var menuFreq = {};
  groups.forEach(function(g) {
    var main = g.rows.find(function(r){return toNumber(r.grandTotal)>0;}) || g.rows[0];
    var total = toNumber(main.grandTotal);
    totalSpent += total;
    var dateStr = String(main.deliveryDate||"");
    orders.push({
      orderId: g.orderId,
      customerName: String(main.customerName||main.tableName||""),
      phone: String(main.phone||""),
      deliveryDate: dateStr,
      deliveryDateISO: _thToISO_(dateStr),
      deliveryTime: String(main.deliveryTime||""),
      location: String(main.location||"").substring(0,100),
      grandTotal: total,
      deliveryFee: toNumber(main.deliveryFee),
      paymentStatus: String(main.paymentStatus||""),
      status: String(main.status||""),
      kitchenStatus: String(main.kitchenStatus||""),
      isUrgent: isNoteUrgent_(main.note),
      isPassed: isDeliveryPassed(dateStr, main.deliveryTime),
      note: stripUrgentMarker_(main.note||"").substring(0,100),
      channel: String(main.channel||""),
      deliveryType: String(main.deliveryType||""),
      googleMap: "",
      items: g.rows.filter(function(r){return r.menuName;}).map(function(r){
        var qty = toNumber(r.qty);
        totalItems += qty;
        if (r.menuName) menuFreq[r.menuName] = (menuFreq[r.menuName]||0) + qty;
        return {menuName:String(r.menuName||""),unit:String(r.unit||""),qty:qty,
          unitPrice:toNumber(r.unitPrice),itemTotal:toNumber(r.itemTotal)};
      })
    });
  });
  // sort: newest first
  orders.sort(function(a,b) {
    return (b.deliveryDateISO||"").localeCompare(a.deliveryDateISO||"");
  });

  var topMenus = Object.keys(menuFreq).map(function(k){return {name:k, qty:menuFreq[k]};})
    .sort(function(a,b){return b.qty-a.qty;}).slice(0,5);

  var jsonStr = JSON.stringify({
    ok:true, name:name, orderCount:orders.length,
    totalSpent:totalSpent, totalItems:totalItems,
    topMenus:topMenus, orders:orders
  });
  _apiCachePut_(cacheKey, jsonStr, 120);
  return ContentService.createTextOutput(jsonStr).setMimeType(ContentService.MimeType.JSON);
}

// /?api=menus  →  list ทุกเมนู (จาก PRICE_MASTER + เมนูที่ใช้จริง) สำหรับ autocomplete
function _apiMenus_(p) {
  var cacheKey = "api_menus_v"+getCacheVersion_();
  var cached = _apiCacheGet_(cacheKey);
  if (cached) return ContentService.createTextOutput(cached).setMimeType(ContentService.MimeType.JSON);

  var menus = {};
  // 1. จาก PRICE_MASTER (รู้ราคาแน่นอน)
  Object.keys(PRICE_MASTER).forEach(function(k) {
    if (k.indexOf("__") === 0) return; // skip __addon__
    var pm = PRICE_MASTER[k];
    menus[k] = {
      name: k,
      perPiece: pm.perPiece || 0,
      perWong: pm.perWong || 0,
      defaultUnit: pm.perWong > 0 ? "วง" : "ชิ้น",
      source: "master",
      usedCount: 0
    };
  });
  // 2. รวมเมนูที่ใช้จริงจาก sheet (ทั้งที่ไม่อยู่ใน PRICE_MASTER)
  var rows = getOrderRows(function(r){ return !isRowCancelled(r); }, 500);
  rows.forEach(function(r) {
    if (!r.menuName) return;
    var n = String(r.menuName).trim();
    if (!menus[n]) {
      menus[n] = {name:n, perPiece:toNumber(r.unitPrice), perWong:0,
        defaultUnit:String(r.unit||"ชิ้น"), source:"history", usedCount:0};
    }
    menus[n].usedCount++;
  });
  var list = Object.keys(menus).map(function(k){return menus[k];})
    .sort(function(a,b){return b.usedCount-a.usedCount;}); // popular ก่อน

  var jsonStr = JSON.stringify({ok:true, count:list.length, menus:list});
  _apiCachePut_(cacheKey, jsonStr, 600); // 10 นาที — เมนูไม่เปลี่ยนบ่อย
  return ContentService.createTextOutput(jsonStr).setMimeType(ContentService.MimeType.JSON);
}

// /?api=newcount&since=<ISO timestamp>  → จำนวนออเดอร์ใหม่หลัง since
//   ใช้กับ notification badge — เช็ค order ใหม่ตั้งแต่ครั้งสุดท้ายที่เปิด
function _apiNewCount_(p) {
  var sinceStr = String(p.since||"").trim();
  var sinceDate = sinceStr ? new Date(sinceStr) : new Date(Date.now() - 24*3600*1000);
  if (isNaN(sinceDate.getTime())) sinceDate = new Date(Date.now() - 24*3600*1000);

  var rows = getOrderRowsReverse(function(r){
    if (isRowCancelled(r)) return false;
    if (!r.timestamp) return false;
    try {
      // timestamp = "DD/MM/YYYY HH:MM:SS" (BE) — แปลงเป็น Date
      var m = String(r.timestamp).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})/);
      if (!m) return false;
      var y = parseInt(m[3],10);
      if (y >= 2400) y -= 543;
      var d = new Date(y, parseInt(m[2],10)-1, parseInt(m[1],10),
                       parseInt(m[4],10), parseInt(m[5],10), parseInt(m[6],10));
      return d > sinceDate;
    } catch(e) { return false; }
  }, 100);
  // unique by orderId
  var seen = {};
  rows.forEach(function(r){ if(r.orderId) seen[r.orderId]=true; });
  var count = Object.keys(seen).length;
  // ส่ง latest 3 ชื่อลูกค้าด้วย
  var preview = [];
  for (var i = 0; i < rows.length && preview.length < 3; i++) {
    if (rows[i].customerName) preview.push(rows[i].customerName);
  }
  return _apiJson_({ok:true, count:count, since:sinceDate.toISOString(),
    preview:preview, latestTs:rows[0]?String(rows[0].timestamp):""});
}

// /?api=audit[&limit=50]  → ประวัติการแก้ไขล่าสุด (ใครทำอะไร เมื่อไหร่)
//   ดึงจาก lastUpdatedAt + lastUpdatedBy ใน Orders sheet
function _apiAudit_(p) {
  var limit = Math.min(parseInt(p.limit,10)||50, 200);
  var rows = getOrderRowsReverse(function(r){ return r.grandTotal !== "" || r.orderId; }, 300);
  // group by order — เอา main row ที่มี lastUpdatedAt
  var seen = {};
  var entries = [];
  rows.forEach(function(r) {
    var oid = String(r.orderId||"");
    if (!oid || seen[oid]) return;
    seen[oid] = true;
    var by = String(r.lastUpdatedBy||"");
    var at = String(r.lastUpdatedAt||r.timestamp||"");
    if (!at) return;
    // ทำความสะอาด by — liff:xxx / line / sheet-edit / system
    var byLabel = by;
    if (by.indexOf("liff:") === 0) byLabel = "📱 เว็บ (" + nameOf_(by.substring(5)) + ")";
    else if (by === "line") byLabel = "💬 LINE";
    else if (by === "sheet-edit") byLabel = "📄 Sheet";
    else if (by === "system") byLabel = "⚙️ ระบบ";
    else if (by.indexOf("U") === 0) byLabel = "💬 LINE (" + nameOf_(by) + ")";

    entries.push({
      orderId: oid,
      customerName: String(r.customerName||r.tableName||""),
      status: String(r.status||""),
      grandTotal: toNumber(r.grandTotal),
      updatedAt: at,
      updatedBy: byLabel,
      isUrgent: isNoteUrgent_(r.note),
      isCancelled: isRowCancelled(r)
    });
  });
  // sort by updatedAt desc (string compare ใช้ได้กับ DD/MM/YYYY HH:MM:SS ไม่ตรง — แปลงก่อน)
  function tsKey(s) {
    var m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})/);
    if (!m) return 0;
    return new Date(parseInt(m[3])-543, parseInt(m[2])-1, parseInt(m[1]),
      parseInt(m[4]), parseInt(m[5]), parseInt(m[6])).getTime();
  }
  entries.sort(function(a,b){ return tsKey(b.updatedAt) - tsKey(a.updatedAt); });
  return _apiJson_({ok:true, count:entries.length, entries:entries.slice(0, limit)});
}

// [#orderlog] change-log ราย order — append ทุก write action ลงชีต "AuditLog"
//   คอลัมน์: timestampTH | orderId | action | by
var AUDIT_LOG_SHEET_ = "AuditLog";
function _getAuditLogSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(AUDIT_LOG_SHEET_);
  if (!sh) {
    sh = ss.insertSheet(AUDIT_LOG_SHEET_);
    sh.appendRow(["timestamp", "orderId", "action", "by"]);
  }
  return sh;
}
function logAudit_(orderId, action, by) {
  if (!orderId) return;
  var sh = _getAuditLogSheet_();
  sh.appendRow([getTimestampTH(), String(orderId), String(action||""), String(by||"")]);
  // กันชีตบวม — เก็บล่าสุด ~5000 แถว
  var n = sh.getLastRow();
  if (n > 5200) { sh.deleteRows(2, n - 5000); }
}

// /?api=orderlog&orderId=ORD-...&limit=30  → timeline การแก้ไขของออเดอร์นั้น
function _apiOrderLog_(p) {
  var oid = String(p.orderId||"").trim();
  if (!oid) return _apiJson_({ok:false, error:"missing orderId"});
  var limit = Math.min(parseInt(p.limit,10)||50, 200);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(AUDIT_LOG_SHEET_);
  if (!sh || sh.getLastRow() < 2) return _apiJson_({ok:true, count:0, entries:[]});
  var values = sh.getRange(2, 1, sh.getLastRow()-1, 4).getValues();
  var entries = [];
  for (var i = values.length - 1; i >= 0 && entries.length < limit; i--) {
    if (String(values[i][1]) !== oid) continue;
    var by = String(values[i][3]||"");
    var byLabel = by;
    if (by.indexOf("liff:") === 0) byLabel = "📱 เว็บ (" + nameOf_(by.substring(5)) + ")";
    else if (by === "line") byLabel = "💬 LINE";
    else if (by === "system") byLabel = "⚙️ ระบบ";
    else if (by.indexOf("U") === 0) byLabel = "💬 LINE (" + nameOf_(by) + ")";
    entries.push({
      at: String(values[i][0]||""),
      action: String(values[i][2]||""),
      by: byLabel
    });
  }
  return _apiJson_({ok:true, count:entries.length, orderId:oid, entries:entries});
}

// [v3.7] ประกาศเข้ากลุ่ม LINE — จากปุ่มในเว็บ
//   /?api=announce&uid=U...&orderId=ORD-...   → ประกาศ 1 ออเดอร์
//   /?api=announce&uid=U...&scope=today       → ประกาศรายการส่งวันนี้ทั้งหมด
//   ส่งเข้ากลุ่มที่ register ไว้ (pushFlexToGroups_) เท่านั้น
function _apiAnnounce_(p) {
  var groups = getNotifyGroupIds_();
  if (!groups.length) {
    return _apiJson_({ok:false, error:"ยังไม่มีกลุ่ม LINE ที่ลงทะเบียน — พิมพ์ \"ไก่จ๋า\" ในกลุ่มก่อน"});
  }

  var oid = String(p.orderId||"").trim();
  if (oid) {
    // ── ประกาศ 1 ออเดอร์ ──
    var rows = findOrderRowsById_(oid);
    if (!rows.length) return _apiJson_({ok:false, error:"ไม่พบออเดอร์ "+oid});
    var main = rows.find(function(r){ return toNumber(r.grandTotal)>0; }) || rows[0];
    var items = rows.filter(function(r){ return r.menuName; }).map(function(r){
      return "• " + String(r.menuName) + "  " + toNumber(r.qty) + " " + String(r.unit||"");
    });
    var lines = [];
    lines.push("ลูกค้า: " + String(main.customerName||main.tableName||"-"));
    lines.push("ส่ง: " + String(main.deliveryDate||"-") + (main.deliveryTime ? "  " + main.deliveryTime + " น." : ""));
    if (items.length) lines.push("รายการ:\n" + items.join("\n"));
    if (main.location) lines.push("ที่อยู่: " + String(main.location));
    lines.push("ยอด: " + toNumber(main.grandTotal).toLocaleString() + " บาท");
    lines.push("Order: " + oid);
    var text1 = lines.join("\n");
    var flex1 = _buildNotifyFlexBubble_(text1, "📢 ออเดอร์ต้องส่งวันนี้", "#D32F2F");
    pushFlexToGroups_(flex1, "📢 ออเดอร์ต้องส่งวันนี้\n" + text1);
    Logger.log("[INFO] announce single | id="+oid+" | groups="+groups.length);
    return _apiJson_({ok:true, mode:"single", groups:groups.length});
  }

  // ── ประกาศรายการส่งวันนี้ทั้งหมด ──
  var dateParam = String(p.date||"").trim();
  var thDate = dateParam ? _isoToTHDate_(dateParam) : getTodayTH();
  var dayRows = getRowsByDeliveryDateFast_(thDate);
  var groupsByOrder = groupRowsByOrder(dayRows.filter(function(r){ return !isRowCancelled(r); }));
  if (!groupsByOrder.length) {
    return _apiJson_({ok:false, error:"ไม่มีออเดอร์ต้องส่งวันที่ "+thDate});
  }
  // เรียงตามเวลา
  groupsByOrder.sort(function(a,b){
    var ma = a.rows[0], mb = b.rows[0];
    return String(ma.deliveryTime||"99:99").localeCompare(String(mb.deliveryTime||"99:99"));
  });
  var listLines = groupsByOrder.map(function(g, i) {
    var m = g.rows.find(function(r){ return toNumber(r.grandTotal)>0; }) || g.rows[0];
    var itemCount = g.rows.filter(function(r){ return r.menuName; }).length;
    return (i+1) + ". " + String(m.customerName||m.tableName||"-") +
      (m.deliveryTime ? "  " + m.deliveryTime + " น." : "") +
      "  (" + itemCount + " รายการ, " + toNumber(m.grandTotal).toLocaleString() + "฿)";
  });
  var text2 = "วันส่ง: " + thDate + "  รวม " + groupsByOrder.length + " ออเดอร์\n\n" + listLines.join("\n");
  var flex2 = _buildNotifyFlexBubble_(text2, "📢 รายการต้องส่งวันนี้", "#FF6B35");
  pushFlexToGroups_(flex2, "📢 รายการต้องส่งวันนี้\n" + text2);
  Logger.log("[INFO] announce today | date="+thDate+" | count="+groupsByOrder.length+" | groups="+groups.length);
  return _apiJson_({ok:true, mode:"today", count:groupsByOrder.length, groups:groups.length});
}

// /?api=verify&uid=U...   → เช็ค admin whitelist
function _apiVerify_(p) {
  var uid = String(p.uid||"").trim();
  if (!uid) return _apiJson_({ok:false, error:"missing uid"});
  // [v3.5.6] OPEN_ACCESS=true → ใครก็เข้าได้ (return isAdmin:true)
  //   write API ยังเช็ค isAdminUser_ ตามเดิม
  var canView = canViewDashboard_(uid);
  return _apiJson_({ok:true, isAdmin:canView, uid:uid.substring(0,8)+"..."});
}

// /?api=orders&date=YYYY-MM-DD   → ออเดอร์ของวันนั้น
// /?api=orders&from=YYYY-MM-DD&to=YYYY-MM-DD  → ช่วงวัน
// option: &status=preparing|ready|delivered  → filter
// [v3.6.1] API response cache — 60s TTL ที่ระดับ endpoint
//   เร็วกว่า getSheetDataCached ตรงๆ เพราะ skip transform + filter ด้วย
function _apiCacheGet_(key) {
  try {
    var raw = CacheService.getScriptCache().get(key);
    return raw ? raw : null;
  } catch(e) { return null; }
}
function _apiCachePut_(key, jsonStr, ttl) {
  try {
    if (jsonStr.length < 95000) CacheService.getScriptCache().put(key, jsonStr, ttl||60);
  } catch(e) {}
}

function _apiOrders_(p) {
  var dateParam = String(p.date||"").trim();
  var fromParam = String(p.from||"").trim();
  var toParam   = String(p.to||"").trim();
  var statusF   = String(p.status||"").trim().toLowerCase();

  // [v3.6.1] cache key รวม version (เพื่อ bust หลัง save)
  var cacheKey = "api_orders_v"+getCacheVersion_()+"_"+(dateParam||fromParam+"_"+toParam)+"_"+statusF;
  var cached = _apiCacheGet_(cacheKey);
  if (cached) {
    return ContentService.createTextOutput(cached).setMimeType(ContentService.MimeType.JSON);
  }

  // [#prebuilt-index] ลองอ่านจาก month index ก่อน (เร็ว ~20ms vs Sheet ~500ms)
  var orders = null;
  if (fromParam && toParam && !statusF) {
    var fromMonth = fromParam.substring(0,7);
    var toMonth   = toParam.substring(0,7);
    if (fromMonth === toMonth) {
      var indexed = getMonthIndex_(fromMonth);
      if (indexed) {
        orders = indexed.filter(function(o) {
          return o.deliveryDateISO >= fromParam && o.deliveryDateISO <= toParam;
        });
      }
    }
  } else if (dateParam && !statusF) {
    var dMonth = dateParam.substring(0,7);
    var indexed2 = getMonthIndex_(dMonth);
    if (indexed2) {
      orders = indexed2.filter(function(o) { return o.deliveryDateISO === dateParam; });
    }
  }

  // fallback: อ่าน Sheet ตรงๆ (cache miss หรือ cross-month range)
  if (!orders) {
    var rows = [];
    if (dateParam) {
      var d = _isoToTHDate_(dateParam);
      rows = getRowsByDeliveryDateFast_(d);
    } else if (fromParam && toParam) {
      var dFrom = thDateToDate(_isoToTHDate_(fromParam));
      var dTo   = thDateToDate(_isoToTHDate_(toParam));
      if (dTo) dTo.setHours(23,59,59,999);
      rows = getOrderRowsByDateRange(dFrom, dTo);
    } else {
      rows = getRowsByDeliveryDateFast_(getTodayTH());
    }

    var groups = groupRowsByOrder(rows.filter(function(r){ return !isRowCancelled(r); }));
    orders = groups.map(function(g) {
      var main = g.rows.find(function(r){ return toNumber(r.grandTotal)>0; }) || g.rows[0];
      var dateStr = String(main.deliveryDate||"");
      return {
        orderId:       g.orderId,
        customerName:  String(main.customerName||main.tableName||""),
        phone:         String(main.phone||""),
        channel:       String(main.channel||""),
        deliveryDate:  dateStr,
        deliveryDateISO: _thToISO_(dateStr),
        deliveryTime:  String(main.deliveryTime||""),
        deliveryType:  String(main.deliveryType||""),
        location:      String(main.location||"").substring(0,150),
        grandTotal:    toNumber(main.grandTotal),
        deliveryFee:   toNumber(main.deliveryFee),
        paymentStatus: String(main.paymentStatus||""),
        status:        String(main.status||"preparing"),
        kitchenStatus: String(main.kitchenStatus||""),
        isUrgent:      isNoteUrgent_(main.note),
        isPassed:      isDeliveryPassed(dateStr, main.deliveryTime),
        note:          stripUrgentMarker_(main.note||"").substring(0,200),
        googleMap:     String(main.googleMap||""),
        updatedAt:     String(main.lastUpdatedAt||main.timestamp||""),
        updatedBy:     String(main.lastUpdatedBy||""),
        items: g.rows.filter(function(r){return r.menuName;}).map(function(r){
          return {
            menuName: String(r.menuName||""),
            unit:     String(r.unit||""),
            qty:      toNumber(r.qty),
            unitPrice:toNumber(r.unitPrice),
            itemTotal:toNumber(r.itemTotal)
          };
        })
      };
    });
  }

  // filter status
  if (statusF) {
    orders = orders.filter(function(o){
      return String(o.status||"").toLowerCase().indexOf(statusF) > -1 ||
             String(o.kitchenStatus||"").indexOf(statusF) > -1;
    });
  }

  // sort: urgent → not passed → time
  orders.sort(function(a,b){
    var ua = a.isUrgent?0:1, ub = b.isUrgent?0:1;
    if (ua!==ub) return ua-ub;
    var pa = a.isPassed?1:0, pb = b.isPassed?1:0;
    if (pa!==pb) return pa-pb;
    return String(a.deliveryTime||"99:99").localeCompare(String(b.deliveryTime||"99:99"));
  });

  var result = {ok:true, count:orders.length, orders:orders};
  var jsonStr = JSON.stringify(result);
  // [v3.6.1] cache 60s — save → bumpCacheVersion จะ invalidate cache key
  _apiCachePut_(cacheKey, jsonStr, 60);
  return ContentService.createTextOutput(jsonStr).setMimeType(ContentService.MimeType.JSON);
}

// /?api=production&from=YYYY-MM-DD&to=YYYY-MM-DD
// คืนสรุปเมนูที่ต้องผลิตในช่วงวัน — สำหรับ kitchen planning
function _apiProduction_(p) {
  var fromParam = String(p.from||"").trim() || _thToISO_(getTodayTH());
  var toParam   = String(p.to||"").trim() || fromParam;

  var dFrom = thDateToDate(_isoToTHDate_(fromParam));
  var dTo   = thDateToDate(_isoToTHDate_(toParam));
  if (!dFrom || !dTo) return _apiJson_({ok:false, error:"invalid date range"});
  dTo.setHours(23,59,59,999);

  var rows = getOrderRowsByDateRange(dFrom, dTo).filter(function(r){ return !isRowCancelled(r); });

  // aggregate menu by date
  var byDate = {};   // dateISO → {menu→{unit,qty}}
  var totalAgg = {}; // menu+unit → qty
  rows.forEach(function(r) {
    if (!r.menuName) return;
    var dISO = _thToISO_(r.deliveryDate);
    if (!byDate[dISO]) byDate[dISO] = {};
    var key = r.menuName+"|"+(r.unit||"ชิ้น");
    if (!byDate[dISO][key]) byDate[dISO][key] = {menuName:r.menuName, unit:r.unit||"ชิ้น", qty:0};
    byDate[dISO][key].qty += toNumber(r.qty);
    if (!totalAgg[key]) totalAgg[key] = {menuName:r.menuName, unit:r.unit||"ชิ้น", qty:0};
    totalAgg[key].qty += toNumber(r.qty);
  });

  var days = Object.keys(byDate).sort().map(function(dISO){
    var menus = Object.keys(byDate[dISO]).map(function(k){ return byDate[dISO][k]; })
      .sort(function(a,b){return b.qty-a.qty;});
    return {date:dISO, dateTH:_isoToTHDate_(dISO), menus:menus,
      totalQty: menus.reduce(function(s,m){return s+m.qty;},0)};
  });

  var totals = Object.keys(totalAgg).map(function(k){return totalAgg[k];})
    .sort(function(a,b){return b.qty-a.qty;});

  return _apiJson_({ok:true, from:fromParam, to:toParam,
    days:days, totals:totals, totalRows:rows.length});
}

// /?api=stats&month=MM/YYYY (BE)  → KPI สรุปเดือน
function _apiStats_(p) {
  var monthParam = String(p.month||"").trim();
  if (!monthParam) {
    var now = new Date();
    monthParam = pad2(now.getMonth()+1)+"/"+(now.getFullYear()+543);
  }
  var a = getMonthAnalyticsCached_(monthParam);
  // strip recentOrdersLite (private) keep aggregates only
  return _apiJson_({ok:true, month:monthParam,
    orderCount: a.orderCount, totalQty: a.totalQty, grandTotal: a.grandTotal,
    activeDays: a.activeDays,
    topMenus: Object.keys(a.menuQty).map(function(k){return {name:k, qty:a.menuQty[k]};})
              .sort(function(x,y){return y.qty-x.qty;}).slice(0,10),
    channels: Object.keys(a.channelData).map(function(k){
      return {channel:k, count:a.channelData[k].count, total:a.channelData[k].total};
    })
  });
}

// ── date helpers สำหรับ API ──
// ISO "2026-06-09" → BE TH "09/06/2569"
function _isoToTHDate_(iso) {
  var m = String(iso||"").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(iso||"").trim();
  var y = parseInt(m[1],10);
  if (y < 2400) y += 543;
  return m[3]+"/"+m[2]+"/"+y;
}
// TH BE "09/06/2569" → ISO "2026-06-09"
function _thToISO_(th) {
  var m = String(th||"").match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return "";
  var d = parseInt(m[1],10), mo = parseInt(m[2],10), y = parseInt(m[3],10);
  if (y < 100) y += 2500;
  if (y >= 2400) y -= 543;
  return y+"-"+pad2(mo)+"-"+pad2(d);
}

function _renderDebugLogText_(n) {
  var sh = getDebugLogSheet_();
  var data = sh.getDataRange().getValues();
  var out = [];
  out.push("=== Debug_Log (ล่าสุด "+n+" บรรทัด) ===");
  out.push("เวลาเครื่อง: "+getTimestampTH());
  out.push("รวมทั้งหมด: "+(data.length-1)+" บรรทัด");
  out.push("──────────────────────────────────────────");
  if (data.length <= 1) {
    out.push("(ยังไม่มี log — เรียก dbg_() ในโค้ดก่อน)");
  } else {
    var start = Math.max(1, data.length - n);
    for (var i = start; i < data.length; i++) {
      var ts = String(data[i][0]||"");
      var tag = String(data[i][1]||"");
      var msg = String(data[i][2]||"");
      var ctx = String(data[i][3]||"");
      out.push("["+ts+"] ["+tag+"] "+msg+(ctx?"  | "+ctx:""));
    }
  }
  out.push("──────────────────────────────────────────");
  out.push("รีเฟรชหน้านี้เพื่อดู log ใหม่ | ?n=200 เพื่อดูมากขึ้น | ?log=msg ดู Message_Log");
  return ContentService.createTextOutput(out.join("\n")).setMimeType(ContentService.MimeType.TEXT);
}

function _renderMessageLogText_(n) {
  var sh = getLogSheet_();
  var data = sh.getDataRange().getValues();
  var out = [];
  out.push("=== Message_Log (ล่าสุด "+n+" event) ===");
  out.push("เวลาเครื่อง: "+getTimestampTH());
  out.push("──────────────────────────────────────────");
  if (data.length <= 1) {
    out.push("(ยังไม่มี message)");
  } else {
    var start = Math.max(1, data.length - n);
    for (var i = start; i < data.length; i++) {
      var ts = String(data[i][0]||"");
      var srcType = String(data[i][2]||"user");
      var textCol = String(data[i][6]||"").replace(/\n/g," ").substring(0,60);
      var intent = String(data[i][8]||"");
      var handledBy = String(data[i][9]||"");
      var verdict = handledBy;
      if (handledBy==="save") verdict="✅ บันทึกสำเร็จ";
      else if (handledBy==="ask_overwrite") verdict="🔄 ถามทับใบเดิม";
      else if (handledBy==="dup_skip") verdict="⚠️ บล็อก text ซ้ำ";
      else if (handledBy==="ask_customer_name") verdict="👤 รอชื่อลูกค้า";
      else if (handledBy==="fallback") verdict="❌ ไม่พบข้อมูล (parser ไม่จับ)";
      else if (handledBy==="error") verdict="💥 ERROR";
      out.push("["+ts+"] ("+srcType+") "+verdict);
      out.push("    text: "+textCol);
      out.push("    intent="+intent+" handledBy="+handledBy);
    }
  }
  out.push("──────────────────────────────────────────");
  out.push("รีเฟรชหน้านี้เพื่อดูใหม่ | ?log=1 ดู Debug_Log");
  return ContentService.createTextOutput(out.join("\n")).setMimeType(ContentService.MimeType.TEXT);
}

// ============================================================
// [#team] GAMIFIED TEAM BOARD
//   2 Sheet: Team (รายชื่อ) + TeamPoints (ลอง append-only)
//   Heartbeat เก็บใน Script Properties (5 นาทีถือว่า online)
//   รัน setupTeamSheets() ครั้งเดียวเพื่อสร้าง Sheet + header
//   แอดมินใหม่จะถูก auto-register ใน Team Sheet ตอน heartbeat ครั้งแรก
// ============================================================

// รันใน editor ครั้งเดียว — สร้าง 2 Sheet + header
function setupTeamSheets() {
  var ss = getSpreadsheet_();
  var team = ss.getSheetByName(TEAM_SHEET_NAME);
  if (!team) {
    team = ss.insertSheet(TEAM_SHEET_NAME);
    team.getRange(1,1,1,5).setValues([["userId","name","role","avatar","active"]]);
    team.setFrozenRows(1);
    team.getRange("A:A").setNumberFormat("@"); // text — กัน userId ยาวกลายเป็นเลขวิทย์
  }
  var pts = ss.getSheetByName(TEAM_POINTS_SHEET_NAME);
  if (!pts) {
    pts = ss.insertSheet(TEAM_POINTS_SHEET_NAME);
    pts.getRange(1,1,1,5).setValues([["timestamp","userId","orderId","action","points"]]);
    pts.setFrozenRows(1);
    pts.getRange("A:A").setNumberFormat("yyyy-MM-dd HH:mm:ss");
  }
  Logger.log("[INFO] setupTeamSheets done");
  return "✅ สร้าง Sheet 'Team' + 'TeamPoints' แล้วค่ะ (ถ้ามีอยู่จะไม่ทับ)";
}

// GET — leaderboard ของเดือน
function _apiTeam_(p) {
  var monthKey = String(p.month||"") || Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM");
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    return _apiJson_({ok:false, error:"invalid month (yyyy-MM)"});
  }
  var team   = _readTeamSheet_();
  var points = _readPointsForMonth_(monthKey);
  var breakdown = _readPointsBreakdownForMonth_(monthKey);
  var props = PropertiesService.getScriptProperties();
  var nowMs = new Date().getTime();

  var rows = team.map(function(m) {
    var lastHb = parseInt(props.getProperty(TEAM_HEARTBEAT_PFX + m.userId) || "0", 10);
    return {
      userId: m.userId,
      name: m.name,
      role: m.role,
      avatar: m.avatar,
      points: points[m.userId] || 0,
      breakdown: breakdown[m.userId] || {created:0, delivered:0, urgent_ontime:0},
      online: lastHb > 0 && (nowMs - lastHb) < TEAM_ONLINE_WINDOW_MS,
      lastActiveAt: lastHb ? lastHb : null
    };
  }).sort(function(a, b) {
    if (b.points !== a.points) return b.points - a.points;
    return String(a.name).localeCompare(String(b.name));
  });

  return _apiJson_({ok:true, month:monthKey, members:rows, onlineCount:rows.filter(function(r){return r.online;}).length});
}

// POST — แอดมินเปิดเว็บ ส่ง heartbeat (auto-register ถ้าเป็นคนใหม่)
function _apiTeamHeartbeat_(p) {
  var uid = String(p.uid||"").trim();
  if (!uid) return _apiJson_({ok:false, error:"missing uid"});
  PropertiesService.getScriptProperties().setProperty(TEAM_HEARTBEAT_PFX + uid, String(new Date().getTime()));
  // auto-register: ถ้าไม่มีใน Team Sheet เพิ่มแถวใหม่ (name ใช้ p.name ถ้ามี ไม่งั้นใช้ uid 8 ตัวแรก)
  try {
    var team = _readTeamSheet_(true); // include inactive
    var exist = team.some(function(m){ return m.userId === uid; });
    if (!exist) {
      var sh = getSpreadsheet_().getSheetByName(TEAM_SHEET_NAME);
      if (sh) {
        var defaultName = String(p.name||"").trim() || ("Admin " + uid.substring(0,6));
        sh.appendRow([uid, defaultName, "", "🐔", true]);
      }
    }
  } catch(e) { Logger.log("[WARN] auto-register team: "+e.message); }
  return _apiJson_({ok:true});
}

// POST — แก้ profile (name/role/avatar) ของตัวเองใน Team Sheet
function _apiTeamProfile_(p) {
  var uid = String(p.uid||"").trim();
  if (!uid) return _apiJson_({ok:false, error:"missing uid"});
  var sh = getSpreadsheet_().getSheetByName(TEAM_SHEET_NAME);
  if (!sh) return _apiJson_({ok:false, error:"team sheet not found — run setupTeamSheets()"});
  var data = sh.getRange(2,1,Math.max(0,sh.getLastRow()-1),5).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]) === uid) {
      if (p.name)   sh.getRange(i+2, 2).setValue(String(p.name));
      if (p.role)   sh.getRange(i+2, 3).setValue(String(p.role));
      if (p.avatar) sh.getRange(i+2, 4).setValue(String(p.avatar));
      return _apiJson_({ok:true});
    }
  }
  return _apiJson_({ok:false, error:"uid not in team sheet"});
}

// ── helpers ──
function _readTeamSheet_(includeInactive) {
  var sh = getSpreadsheet_().getSheetByName(TEAM_SHEET_NAME);
  if (!sh || sh.getLastRow() < 2) return [];
  var data = sh.getRange(2,1,sh.getLastRow()-1,5).getValues();
  return data
    .filter(function(r){
      if (!r[0]) return false;
      if (includeInactive) return true;
      return r[4] === true || String(r[4]).toUpperCase() === "TRUE";
    })
    .map(function(r){
      return {userId:String(r[0]), name:String(r[1]||""), role:String(r[2]||""), avatar:String(r[3]||"🐔")};
    });
}

function _readPointsForMonth_(monthKey) {
  var sh = getSpreadsheet_().getSheetByName(TEAM_POINTS_SHEET_NAME);
  if (!sh || sh.getLastRow() < 2) return {};
  var data = sh.getRange(2,1,sh.getLastRow()-1,5).getValues();
  var sum = {};
  for (var i = 0; i < data.length; i++) {
    var ts = data[i][0] instanceof Date ? data[i][0] : new Date(data[i][0]);
    if (isNaN(ts.getTime())) continue;
    var mk = Utilities.formatDate(ts, TIMEZONE, "yyyy-MM");
    if (mk !== monthKey) continue;
    var uid = String(data[i][1]);
    sum[uid] = (sum[uid] || 0) + (parseInt(data[i][4],10) || 0);
  }
  return sum;
}

function _readPointsBreakdownForMonth_(monthKey) {
  var sh = getSpreadsheet_().getSheetByName(TEAM_POINTS_SHEET_NAME);
  if (!sh || sh.getLastRow() < 2) return {};
  var data = sh.getRange(2,1,sh.getLastRow()-1,5).getValues();
  var out = {};
  for (var i = 0; i < data.length; i++) {
    var ts = data[i][0] instanceof Date ? data[i][0] : new Date(data[i][0]);
    if (isNaN(ts.getTime())) continue;
    var mk = Utilities.formatDate(ts, TIMEZONE, "yyyy-MM");
    if (mk !== monthKey) continue;
    var uid = String(data[i][1]);
    var action = String(data[i][3]);
    var pts = parseInt(data[i][4],10) || 0;
    if (!out[uid]) out[uid] = {created:0, delivered:0, urgent_ontime:0, paid_fast:0, eod_clean:0};
    if (out[uid][action] !== undefined) out[uid][action] += pts;
  }
  return out;
}

function _appendPointsRow_(uid, orderId, action, points) {
  var sh = getSpreadsheet_().getSheetByName(TEAM_POINTS_SHEET_NAME);
  if (!sh) { Logger.log("[WARN] TeamPoints sheet not found — run setupTeamSheets()"); return; }
  sh.appendRow([new Date(), String(uid||""), String(orderId||""), String(action||""), parseInt(points,10) || 0]);
}

// ──────────────────────────────────────────────────────────
// [#team-medals] Medal + EOD + Morning Leaderboard Block
// ──────────────────────────────────────────────────────────

// คำนวณเหรียญจากแต้มสะสมของเดือน
function getMedalForPoints_(pts) {
  if (pts >= 30) return "🥇";
  if (pts >= 15) return "🥈";
  if (pts >= 5)  return "🥉";
  return "";
}

// streak: วันล่าสุดที่ active ต่อเนื่องกัน (นับจากเมื่อวาน)
function _calcStreak_(uid) {
  var sh = getSpreadsheet_().getSheetByName(TEAM_POINTS_SHEET_NAME);
  if (!sh || sh.getLastRow() < 2) return 0;
  var data = sh.getRange(2,1,sh.getLastRow()-1,2).getValues();
  var days = {};
  data.forEach(function(r){
    if (String(r[1]) !== uid) return;
    var ts = r[0] instanceof Date ? r[0] : new Date(r[0]);
    if (!isNaN(ts.getTime())) {
      var dk = Utilities.formatDate(ts, TIMEZONE, "yyyy-MM-dd");
      days[dk] = true;
    }
  });
  var streak = 0;
  var d = new Date();
  d.setDate(d.getDate() - 1); // เริ่มนับจากเมื่อวาน
  while (true) {
    var k = Utilities.formatDate(d, TIMEZONE, "yyyy-MM-dd");
    if (!days[k]) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

// แต้มที่ได้เมื่อวาน (สำหรับแสดงใน morning briefing)
function _getYesterdayPoints_() {
  var sh = getSpreadsheet_().getSheetByName(TEAM_POINTS_SHEET_NAME);
  if (!sh || sh.getLastRow() < 2) return [];
  var yesterday = new Date(); yesterday.setDate(yesterday.getDate()-1);
  var yk = Utilities.formatDate(yesterday, TIMEZONE, "yyyy-MM-dd");
  var data = sh.getRange(2,1,sh.getLastRow()-1,5).getValues();
  var events = [];
  data.forEach(function(r){
    var ts = r[0] instanceof Date ? r[0] : new Date(r[0]);
    if (isNaN(ts.getTime())) return;
    if (Utilities.formatDate(ts, TIMEZONE, "yyyy-MM-dd") !== yk) return;
    events.push({ uid:String(r[1]), orderId:String(r[2]), action:String(r[3]), pts:parseInt(r[4],10)||0 });
  });
  return events;
}

// สร้าง text block "กระดานทีม" สำหรับแนบใน morning briefing
function _buildTeamLeaderboardBlock_() {
  var monthKey = Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM");
  var members = _readTeamSheet_(false);
  if (!members.length) return "";

  var pointsMap = _readPointsForMonth_(monthKey);
  var ranked = members.map(function(m){
    return { name:m.name, pts: pointsMap[m.userId]||0, userId:m.userId };
  }).sort(function(a,b){ return b.pts - a.pts; });

  var lines = ["━━━━━━━━━━━━━━━━━━", "🏆 กระดานทีม"];
  var medals = ["🥇","🥈","🥉"];
  ranked.forEach(function(m, i){
    var medal = getMedalForPoints_(m.pts);
    var rank  = medals[i] || (i+1)+".";
    var streak = _calcStreak_(m.userId);
    var streakBadge = streak >= 7 ? " 🔥"+streak+"d" : streak >= 3 ? " 🔥"+streak+"d" : "";
    lines.push(rank+" "+m.name+"  "+m.pts+" pts"+(medal?" "+medal:"")+streakBadge);
  });

  // แสดงเหตุการณ์เมื่อวาน
  var yesterday = _getYesterdayPoints_();
  if (yesterday.length) {
    var nameMap = {};
    members.forEach(function(m){ nameMap[m.userId]=m.name; });
    var ACTION_LABEL = { created:"สร้างออเดอร์", delivered:"ส่งแล้ว", urgent_ontime:"ส่งด่วนทัน", paid_fast:"รับเงินเร็ว", eod_clean:"ไม่มีค้างข้ามวัน" };
    lines.push("", "📈 เมื่อวาน:");
    // group by uid+action เอาอันที่ pts สูงสุดขึ้นมา
    var seen = {};
    yesterday.slice(0,5).forEach(function(ev){
      var key = ev.uid+ev.action;
      if (seen[key]) return; seen[key]=true;
      var name = nameMap[ev.uid]||ev.uid.substring(0,6);
      var label = ACTION_LABEL[ev.action]||ev.action;
      lines.push("  +"+ev.pts+" "+name+" ("+label+")");
    });
  }

  return lines.join("\n");
}

// ── EOD: ตรวจ pending ค้างข้ามวัน → ให้แต้มคนที่ไม่มี ──
function checkEODNoPending_() {
  try {
    var today = getTodayTH();
    var rows = getRowsByDeliveryDateFast_(today).filter(function(r){ return !isRowCancelled(r); });
    var hasPending = rows.some(function(r){
      var ps = String(r.paymentStatus||"").toLowerCase();
      return ps !== "paid" && ps !== "not required" && ps !== "ไม่ระบุ";
    });
    if (hasPending) {
      Logger.log("[INFO] checkEODNoPending_: มีค้างชำระ — ไม่ให้แต้ม");
      return;
    }
    // ไม่มีค้าง → ให้แต้มทุกคนที่ active วันนี้
    var todayKey = Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd");
    var sh = getSpreadsheet_().getSheetByName(TEAM_POINTS_SHEET_NAME);
    if (!sh || sh.getLastRow() < 2) return;
    var data = sh.getRange(2,1,sh.getLastRow()-1,2).getValues();
    var activeToday = {};
    data.forEach(function(r){
      var ts = r[0] instanceof Date ? r[0] : new Date(r[0]);
      if (isNaN(ts.getTime())) return;
      if (Utilities.formatDate(ts, TIMEZONE, "yyyy-MM-dd") === todayKey) {
        activeToday[String(r[1])] = true;
      }
    });
    Object.keys(activeToday).forEach(function(uid){
      _appendPointsRow_(uid, "EOD-"+todayKey, "eod_clean", 1);
    });
    Logger.log("[INFO] checkEODNoPending_: ให้แต้ม eod_clean "+Object.keys(activeToday).length+" คน");
  } catch(e) {
    Logger.log("[ERROR] checkEODNoPending_: "+e.message);
  }
}

function setupEODTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t){
    if (t.getHandlerFunction()==="checkEODNoPending_") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("checkEODNoPending_").timeBased().atHour(23).everyDays(1).create();
  return "✅ ตั้ง EOD check 23:00 ทุกวันแล้วค่ะ";
}

// ทดสอบ leaderboard block ใน Logger
function runTeamLeaderboardBlockNow() {
  Logger.log(_buildTeamLeaderboardBlock_());
}

// ──────────────────────────────────────────────────────────
// [#prebuilt-index] Month Index ใน PropertiesService
//   อ่านจาก index ก่อน (เร็ว ~20ms) → ถ้าไม่มีค่อย fall back อ่าน Sheet
//   rebuild ทุกครั้งที่ write (save/update/cancel/status/paid)
// ──────────────────────────────────────────────────────────

var MONTH_INDEX_PREFIX = "midx_";

// สร้าง index ของเดือน YYYY-MM → JSON array of slim orders
function buildMonthIndex_(monthKey) {
  var t0 = new Date().getTime();
  var parts = monthKey.split("-");
  var y = parseInt(parts[0],10), m = parseInt(parts[1],10);
  var dFrom = new Date(y, m-1, 1);
  var dTo = new Date(y, m, 0); dTo.setHours(23,59,59,999);

  var rows = getOrderRowsByDateRange(dFrom, dTo);
  var groups = groupRowsByOrder(rows.filter(function(r){ return !isRowCancelled(r); }));

  var orders = groups.map(function(g) {
    var main = g.rows.find(function(r){ return toNumber(r.grandTotal)>0; }) || g.rows[0];
    var dateStr = String(main.deliveryDate||"");
    return {
      orderId:       g.orderId,
      customerName:  String(main.customerName||main.tableName||""),
      phone:         String(main.phone||""),
      channel:       String(main.channel||""),
      deliveryDate:  dateStr,
      deliveryDateISO: _thToISO_(dateStr),
      deliveryTime:  String(main.deliveryTime||""),
      deliveryType:  String(main.deliveryType||""),
      location:      String(main.location||"").substring(0,150),
      grandTotal:    toNumber(main.grandTotal),
      deliveryFee:   toNumber(main.deliveryFee),
      paymentStatus: String(main.paymentStatus||""),
      status:        String(main.status||"preparing"),
      kitchenStatus: String(main.kitchenStatus||""),
      isUrgent:      isNoteUrgent_(main.note),
      isPassed:      isDeliveryPassed(dateStr, main.deliveryTime),
      note:          stripUrgentMarker_(main.note||"").substring(0,200),
      googleMap:     String(main.googleMap||""),
      updatedAt:     String(main.lastUpdatedAt||main.timestamp||""),
      updatedBy:     String(main.lastUpdatedBy||""),
      createdAt:     String(main.createdAt||main.timestamp||""),
      items: g.rows.filter(function(r){return r.menuName;}).map(function(r){
        return {
          menuName: String(r.menuName||""),
          unit:     String(r.unit||""),
          qty:      toNumber(r.qty),
          unitPrice:toNumber(r.unitPrice),
          itemTotal:toNumber(r.itemTotal)
        };
      })
    };
  });

  var json = JSON.stringify(orders);
  var props = PropertiesService.getScriptProperties();
  try {
    props.setProperty(MONTH_INDEX_PREFIX + monthKey, json);
  } catch(e) {
    Logger.log("[WARN] buildMonthIndex_ size exceeded for "+monthKey+" ("+json.length+" chars): "+e.message);
  }
  var elapsed = new Date().getTime() - t0;
  Logger.log("[INFO] buildMonthIndex_ "+monthKey+" | "+orders.length+" orders | "+json.length+" chars | "+elapsed+"ms");
  return orders;
}

// อ่าน index จาก PropertiesService (เร็ว ~20ms)
function getMonthIndex_(monthKey) {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(MONTH_INDEX_PREFIX + monthKey);
    if (raw) return JSON.parse(raw);
  } catch(e) {
    Logger.log("[WARN] getMonthIndex_ parse error: "+e.message);
  }
  return null;
}

// invalidate index ของเดือนที่ระบุ (หรือเดือนปัจจุบัน)
function invalidateMonthIndex_(deliveryDate) {
  var monthKey;
  if (deliveryDate) {
    var iso = _thToISO_(String(deliveryDate));
    if (iso && iso.length >= 7) monthKey = iso.substring(0,7);
  }
  if (!monthKey) monthKey = Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM");
  try {
    PropertiesService.getScriptProperties().deleteProperty(MONTH_INDEX_PREFIX + monthKey);
  } catch(e) {}
}

// rebuild index ของเดือนปัจจุบัน + เดือนที่ส่งมา (ถ้าต่างกัน)
function rebuildMonthIndexes_(deliveryDate) {
  var currentMonth = Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM");
  var orderMonth = null;
  if (deliveryDate) {
    var iso = _thToISO_(String(deliveryDate));
    if (iso && iso.length >= 7) orderMonth = iso.substring(0,7);
  }
  buildMonthIndex_(currentMonth);
  if (orderMonth && orderMonth !== currentMonth) buildMonthIndex_(orderMonth);
}

// ทดสอบ — รันใน GAS editor
function runBuildCurrentMonthIndex() {
  var mk = Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM");
  buildMonthIndex_(mk);
}
