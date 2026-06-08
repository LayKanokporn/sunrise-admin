# 🐔 Sunrise Admin Dashboard (LIFF)

Dashboard หลังบ้านสำหรับแอดมิน Sunrise Cake Cafe — รัน LIFF บน LINE หรือเปิด standalone บนเบราว์เซอร์

## ✨ Features (Phase 1 — read-only)

- 🗂️ **Kanban** — 4 column รอทำ / พร้อมส่ง / ออกส่ง / ส่งแล้ว + เลือกวัน
- 📅 **Calendar** — grid 7 วัน คลิกวันเพื่อดูรายละเอียด
- 🍰 **Production** — รวมเมนูที่ต้องอบ (วันนี้ / พรุ่งนี้ / 3 / 7 วัน)
- 🔒 Admin-only — เช็คจาก `ADMIN_USER_IDS` ใน Apps Script
- ♻️ Auto-refresh ทุก 30 วินาที (polling)
- 📱 Responsive 3 ขนาด: mobile / tablet / desktop

## 📦 Setup

### 1. Install
```bash
cd sunrise-admin
npm install
```

### 2. ตั้งค่า .env.local
คัดลอก `.env.example` → `.env.local` แล้วแก้ 2 ค่า:

```env
VITE_LIFF_ID=<LIFF ID จาก LINE Developers>
VITE_API_URL=<Apps Script Web App URL .../exec>
```

### 3. สร้าง LIFF app ใน LINE Developers Console
1. ไปที่ Provider → channel "ออเดอร์งาน Sunrise" → tab **LIFF**
2. **Add** new LIFF app:
   - Name: `Sunrise Admin`
   - Size: `Full`
   - Endpoint URL: ใส่ URL ของ Vercel (ตั้งทีหลังก็ได้ — ลอง `http://localhost:5173` ก่อนได้)
   - Scope: ✅ `profile`, ✅ `openid`
3. Copy **LIFF ID** ใส่ใน `.env.local`

### 4. รัน dev
```bash
npm run dev
```
เปิด <http://localhost:5173> — จะ redirect ไป LINE Login

### 5. Deploy บน Vercel
```bash
npm run build
# หรือเชื่อม GitHub → Vercel auto-deploy
```

ตั้ง env vars ใน Vercel:
- `VITE_LIFF_ID`
- `VITE_API_URL`

หลัง deploy → เอา URL Vercel กลับไปใส่ที่ LIFF Endpoint URL

## 🗂️ Project Structure

```
src/
├── main.jsx               # React entry + QueryClient
├── App.jsx                # Auth gate + Tab routing
├── index.css              # Tailwind + helpers
├── lib/
│   ├── api.js             # fetch wrapper + log
│   └── auth.jsx           # LIFF init + admin check
├── components/
│   ├── TopBar.jsx
│   ├── TabNav.jsx
│   └── OrderCard.jsx
└── pages/
    ├── Kanban.jsx
    ├── Calendar.jsx
    └── Production.jsx
```

## 🛡️ Auth Flow

```
1. LIFF init → liff.login() ถ้ายังไม่ login
2. liff.getProfile() → userId
3. fetch /?api=verify&uid=<userId>
4. Apps Script เช็คกับ ADMIN_USER_IDS + NOTIFY_TO_USER_IDS
5. ผ่าน → show dashboard, ไม่ผ่าน → "🔒 ไม่มีสิทธิ์"
```

## 📡 API Endpoints (เพิ่มใน Kaija_order.js แล้ว)

| Endpoint | Returns |
|---|---|
| `?api=ping` | `{ok, ts}` health check |
| `?api=verify&uid=U...` | `{ok, isAdmin}` |
| `?api=orders&date=YYYY-MM-DD` | orders for date |
| `?api=orders&from=...&to=...` | orders range |
| `?api=production&from=...&to=...` | aggregated menu by day |
| `?api=stats&month=MM/YYYY` (BE) | KPI summary |

## 🚧 Roadmap

- **Phase 1** ✅ — Read-only views (Kanban, Calendar, Production)
- **Phase 2** — POST update: status / urgent / payment / slip URL
- **Phase 3** — Drag-drop, stats charts, export Excel

## 🐛 Debug

- เปิด console — ทุก API call จะ log timing
- ถ้า `verify` fail = userId ไม่อยู่ใน admin list → เพิ่มใน `ADMIN_USER_IDS` ใน Apps Script
- ถ้า CORS error = Apps Script ต้อง deploy เป็น `Anyone` access

## 📝 หมายเหตุ

- Polling 30s — ไม่ใช่ realtime push (Apps Script ไม่ support WebSocket)
- ถ้า quota Apps Script ตึง → เพิ่ม cache TTL ที่ React Query (`staleTime: 60_000`)
