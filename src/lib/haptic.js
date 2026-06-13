// [Phase 1/#12] Haptic feedback — สั้นๆ ให้รู้สึกว่ากดติด
//   ใช้บนปุ่มสำคัญ: paid, urgent, ส่งแล้ว, ยกเลิก, ประกาศ, refresh
//   ไม่ทำงานบน desktop (ไม่มี vibrate API) — silent fail
export function buzz(ms = 10) {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(ms);
  } catch (e) { /* ignore */ }
}

// pattern สำหรับ event พิเศษ
export function buzzSuccess() { buzz([8, 30, 8]); }
export function buzzError()   { buzz([20, 40, 20, 40, 20]); }
