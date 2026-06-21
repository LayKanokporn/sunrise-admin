// [#team] หน้าทีม — leaderboard + online status + edit profile ตัวเอง
//   ข้อมูล: api.team(month) → members[] + onlineCount
//   แต้ม: +1 สร้าง / +1 ส่งแล้ว / +2 urgent ทันเวลา
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trophy, ChevronLeft, ChevronRight, Edit3, Check, X } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

const monthNamesTH = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const AVATAR_OPTIONS = ['🐔','👩‍🍳','👨‍🍳','🛵','🚗','💼','🎂','🍰','🧁','☕','🌸','⭐','🦄','🐱','🐶'];

function fmtAgo(ms) {
  if (!ms) return '—';
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'เมื่อกี้';
  if (diff < 3600_000) return Math.floor(diff/60_000) + ' นาทีก่อน';
  if (diff < 86400_000) return Math.floor(diff/3600_000) + ' ชม.ก่อน';
  return Math.floor(diff/86400_000) + ' วันก่อน';
}

export default function Team() {
  const today = useMemo(() => new Date(), []);
  const [anchor, setAnchor] = useState(today);
  const [editing, setEditing] = useState(false);
  const { profile } = useAuth();
  const qc = useQueryClient();
  const monthKey = `${anchor.getFullYear()}-${String(anchor.getMonth()+1).padStart(2,'0')}`;

  const { data, isLoading } = useQuery({
    queryKey: ['team', monthKey],
    queryFn: () => api.team(monthKey),
    refetchInterval: 30_000 // refresh online status ทุก 30 วิ
  });

  const members = data?.members || [];
  const totalPoints = members.reduce((s, m) => s + m.points, 0);
  const me = members.find((m) => m.userId === profile?.userId);

  const rankMedal = (i) => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
  const changeMonth = (n) => { const d = new Date(anchor); d.setMonth(d.getMonth()+n); setAnchor(d); };

  return (
    <div className="space-y-4">
      {/* header */}
      <div className="card flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy size={20} className="text-amber-500" />
          <div className="font-bold text-lg">กระดานทีม</div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => changeMonth(-1)} className="btn btn-ghost p-1.5"><ChevronLeft size={18}/></button>
          <div className="font-semibold text-sm w-28 text-center">{monthNamesTH[anchor.getMonth()]} {anchor.getFullYear()+543}</div>
          <button onClick={() => changeMonth(1)} className="btn btn-ghost p-1.5"><ChevronRight size={18}/></button>
        </div>
      </div>

      {/* summary */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="card !p-2 sm:!p-3">
          <div className="text-[10px] sm:text-xs text-slate-500 mb-1">ออนไลน์</div>
          <div className="font-bold text-base sm:text-lg text-emerald-600">{data?.onlineCount||0} <span className="text-xs text-slate-400 font-normal">/ {members.length}</span></div>
        </div>
        <div className="card !p-2 sm:!p-3">
          <div className="text-[10px] sm:text-xs text-slate-500 mb-1">แต้มรวมทีม</div>
          <div className="font-bold text-base sm:text-lg">{totalPoints}</div>
        </div>
        <div className="card !p-2 sm:!p-3">
          <div className="text-[10px] sm:text-xs text-slate-500 mb-1">ของฉัน</div>
          <div className="font-bold text-base sm:text-lg text-sunrise-600">{me?.points||0} <span className="text-xs text-slate-400 font-normal">pts</span></div>
        </div>
      </div>

      {/* my profile editor */}
      {me && (
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="text-3xl">{me.avatar}</div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">{me.name}</div>
              <div className="text-xs text-slate-500 truncate">{me.role || '— ยังไม่ตั้ง role —'}</div>
            </div>
            <button onClick={() => setEditing(!editing)} className="btn btn-ghost p-2">
              {editing ? <X size={16}/> : <Edit3 size={16}/>}
            </button>
          </div>
          {editing && (
            <EditProfile me={me} onDone={() => { setEditing(false); qc.invalidateQueries({queryKey:['team']}); }} />
          )}
        </div>
      )}

      {/* leaderboard */}
      <div className="card">
        <div className="font-bold text-sm mb-3">🏆 Leaderboard</div>
        {isLoading && <div className="text-center text-slate-400 py-6 text-sm">⏳ กำลังโหลด...</div>}
        {!isLoading && members.length === 0 && (
          <div className="text-center text-slate-400 py-6 text-sm">
            — ยังไม่มีสมาชิก —<br/>
            <span className="text-[11px]">เปิดเว็บค้างไว้สักพัก ระบบจะลงทะเบียนให้อัตโนมัติ</span>
          </div>
        )}
        <div className="space-y-2">
          {members.map((m, i) => (
            <div key={m.userId} className={'flex items-center gap-3 p-2 rounded-lg ' +
              (m.userId === profile?.userId ? 'bg-sunrise-50 ring-1 ring-sunrise-200' : 'hover:bg-slate-50')}>
              <div className="w-6 text-center text-sm font-bold text-slate-400">
                {rankMedal(i) || (i+1)}
              </div>
              <div className="relative shrink-0">
                <div className="text-2xl">{m.avatar || '🐔'}</div>
                <div className={'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ' +
                  (m.online ? 'bg-emerald-500' : 'bg-slate-300')} title={m.online ? 'ออนไลน์' : 'ออฟไลน์'} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate text-sm">{m.name}</div>
                <div className="text-[11px] text-slate-500 truncate">
                  {m.role && <span>{m.role} · </span>}
                  <span className="text-slate-400">{m.online ? 'ออนไลน์' : fmtAgo(m.lastActiveAt)}</span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-bold text-sunrise-600">{m.points} <span className="text-[10px] text-slate-400 font-normal">pts</span></div>
                <div className="text-[10px] text-slate-400">
                  {m.breakdown?.created ? `+${m.breakdown.created} สร้าง` : ''}
                  {m.breakdown?.delivered ? ` · +${m.breakdown.delivered} ส่ง` : ''}
                  {m.breakdown?.urgent_ontime ? ` · +${m.breakdown.urgent_ontime} ด่วน` : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* scoring rules */}
      <div className="card bg-slate-50">
        <div className="font-medium text-xs text-slate-600 mb-1">📌 กติกาแต้ม</div>
        <div className="text-xs text-slate-500 space-y-0.5">
          <div>• +1 แต้ม / สร้างออเดอร์ใหม่</div>
          <div>• +1 แต้ม / mark "ส่งแล้ว"</div>
          <div>• +2 แต้ม / ส่งออเดอร์ด่วนทันเวลา (แทน +1 ปกติ)</div>
        </div>
      </div>
    </div>
  );
}

function EditProfile({ me, onDone }) {
  const [name, setName]     = useState(me.name);
  const [role, setRole]     = useState(me.role);
  const [avatar, setAvatar] = useState(me.avatar || '🐔');
  const [busy, setBusy]     = useState(false);

  async function save() {
    setBusy(true);
    try {
      await api.teamProfile({ name, role, avatar });
      onDone();
    } catch(e) {
      alert('บันทึกไม่สำเร็จ: ' + e.message);
    } finally { setBusy(false); }
  }

  return (
    <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
      <label className="block">
        <div className="text-xs text-slate-500 mb-1">ชื่อ</div>
        <input value={name} onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
      </label>
      <label className="block">
        <div className="text-xs text-slate-500 mb-1">บทบาท (เช่น แม่ครัว, คนส่ง, แอดมิน)</div>
        <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="—"
          className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
      </label>
      <div>
        <div className="text-xs text-slate-500 mb-1">รูป</div>
        <div className="flex flex-wrap gap-1">
          {AVATAR_OPTIONS.map((a) => (
            <button key={a} onClick={() => setAvatar(a)}
              className={'text-2xl w-10 h-10 rounded-lg flex items-center justify-center transition-all ' +
                (avatar === a ? 'bg-sunrise-100 ring-2 ring-sunrise-500' : 'bg-slate-100 hover:bg-slate-200')}>
              {a}
            </button>
          ))}
        </div>
      </div>
      <button onClick={save} disabled={busy} className="btn btn-primary w-full flex items-center justify-center gap-2">
        <Check size={16}/> {busy ? 'กำลังบันทึก...' : 'บันทึก'}
      </button>
    </div>
  );
}
