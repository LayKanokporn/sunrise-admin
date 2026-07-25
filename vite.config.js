import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// stamp build id ลง dist/sw.js ทุกครั้งที่ build
//   public/sw.js ถูก copy ไป dist ตรง ๆ (Vite ไม่ process ไฟล์ใน public)
//   ถ้าไม่ stamp → sw.js byte เดิมทุก deploy → browser ไม่เห็นว่ามีเวอร์ชันใหม่
//     → ไม่ re-install SW → ชื่อ cache เดิม → ไม่ลบของเก่า → ผู้ใช้ค้าง build เก่า
function stampServiceWorker() {
  return {
    name: 'stamp-sw',
    apply: 'build',
    closeBundle() {
      const swPath = resolve(process.cwd(), 'dist/sw.js');
      try {
        const src = readFileSync(swPath, 'utf8');
        const id = Date.now().toString(36);
        writeFileSync(swPath, src.replace('__BUILD_ID__', id), 'utf8');
        console.log(`[stamp-sw] build id = ${id}`);
      } catch (e) {
        console.warn('[stamp-sw] skipped: ' + e.message);
      }
    }
  };
}

export default defineConfig({
  plugins: [react(), stampServiceWorker()],
  server: { port: 5173, host: true }
});
