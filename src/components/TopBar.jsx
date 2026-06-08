import { RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

export default function TopBar({ profile }) {
  const qc = useQueryClient();
  const refetchAll = () => qc.invalidateQueries();

  return (
    <header className="sticky top-0 z-20 bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🐔</span>
          <div>
            <div className="font-bold leading-tight">Sunrise Admin</div>
            <div className="text-xs text-slate-500 leading-tight">Dashboard</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refetchAll}
            className="btn btn-ghost p-2"
            aria-label="refresh">
            <RefreshCw size={18} />
          </button>
          {profile?.pictureUrl && (
            <img src={profile.pictureUrl} alt="" className="w-8 h-8 rounded-full" />
          )}
        </div>
      </div>
    </header>
  );
}
