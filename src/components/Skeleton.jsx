// [v0.7] Skeleton loaders — แสดงทันทีตอนกำลังโหลด ทำให้รู้สึกเร็ว
//   (Perceived performance ดีกว่า spinner เพราะเห็นโครงสร้างก่อน)

export function SkeletonBox({ className = '' }) {
  return <div className={`animate-pulse bg-slate-200 rounded ${className}`} />;
}

export function SkeletonCalendarCell() {
  return (
    <div className="rounded-lg p-2 min-h-[75px] sm:min-h-[110px] bg-white border border-slate-200">
      <SkeletonBox className="h-3 w-4" />
      <SkeletonBox className="h-3 w-12 mt-2" />
      <SkeletonBox className="h-2 w-20 mt-1" />
    </div>
  );
}

export function SkeletonOrderCard() {
  return (
    <div className="card">
      <SkeletonBox className="h-4 w-2/3 mb-2" />
      <SkeletonBox className="h-3 w-1/3 mb-3" />
      <SkeletonBox className="h-3 w-full mb-1" />
      <SkeletonBox className="h-3 w-5/6 mb-3" />
      <div className="flex justify-between items-center pt-3 border-t border-slate-100">
        <SkeletonBox className="h-4 w-20" />
        <SkeletonBox className="h-5 w-16" />
      </div>
    </div>
  );
}

export function SkeletonStatCard() {
  return (
    <div className="card flex items-center gap-3">
      <SkeletonBox className="h-9 w-9" />
      <div className="flex-1">
        <SkeletonBox className="h-2 w-16 mb-1" />
        <SkeletonBox className="h-5 w-20" />
      </div>
    </div>
  );
}
