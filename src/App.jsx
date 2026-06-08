// [v0.1] App shell — Auth + Tab nav + 3 pages
import { useState } from 'react';
import { AuthProvider, useAuth } from './lib/auth';
import TopBar from './components/TopBar';
import TabNav from './components/TabNav';
import Kanban from './pages/Kanban';
import CalendarPage from './pages/Calendar';
import Production from './pages/Production';

function AppInner() {
  const { loading, isAdmin, profile, error } = useAuth();
  const [tab, setTab] = useState('calendar'); // [v0.2] default = ปฏิทิน main dashboard

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        <div className="text-center">
          <div className="text-2xl mb-2">🐔</div>
          <div>กำลังโหลด...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="card max-w-md text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <div className="font-bold text-lg text-red-600 mb-2">เกิดข้อผิดพลาด</div>
          <div className="text-sm text-slate-600 mb-4">{error}</div>
          <button onClick={() => location.reload()} className="btn btn-primary">ลองใหม่</button>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="card max-w-md text-center">
          <div className="text-4xl mb-3">🔒</div>
          <div className="font-bold text-lg mb-2">ไม่มีสิทธิ์เข้าใช้งาน</div>
          <div className="text-sm text-slate-600">
            ระบบนี้สำหรับแอดมินเท่านั้น<br/>
            ติดต่อพี่หม่อนเพื่อขอสิทธิ์
          </div>
          {profile && (
            <div className="mt-4 text-xs text-slate-400 font-mono">
              {profile.userId.substring(0,8)}...{profile.userId.substring(28)}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <TopBar profile={profile} />
      <TabNav value={tab} onChange={setTab} />
      <main className="max-w-7xl mx-auto p-4">
        {tab === 'kanban'     && <Kanban />}
        {tab === 'calendar'   && <CalendarPage />}
        {tab === 'production' && <Production />}
      </main>
    </div>
  );
}

export default function App() {
  return <AuthProvider><AppInner /></AuthProvider>;
}
