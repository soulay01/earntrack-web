import SidebarSkeleton from './SidebarSkeleton';

export type PageSkeletonVariant = 'table' | 'cards' | 'dashboard' | 'form' | 'chat' | 'calendar' | 'detail';

function Skel({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-200 ${className}`} />;
}

function KpiRowSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-slate-200/70 px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <Skel className="h-3 w-16" />
            <Skel className="h-7 w-7 rounded-lg" />
          </div>
          <Skel className="h-6 w-24" />
        </div>
      ))}
    </div>
  );
}

function ToolbarSkeleton() {
  return (
    <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 bg-slate-50/50">
      <Skel className="h-7 w-14 rounded-lg" />
      <Skel className="h-7 w-20 rounded-lg" />
      <Skel className="h-7 w-16 rounded-lg" />
      <Skel className="h-7 w-20 rounded-lg" />
      <Skel className="h-7 w-16 rounded-lg" />
    </div>
  );
}

function RowSkeleton() {
  return (
    <>
      <div className="hidden md:grid grid-cols-[100px_1fr_110px_130px_140px_44px] items-center border-t border-slate-100 px-4 py-3.5 gap-3">
        <Skel className="h-3 w-14" />
        <div className="space-y-1.5 min-w-0"><Skel className="h-3.5 w-40" /><Skel className="h-3 w-24" /></div>
        <Skel className="h-3 w-16 mx-auto" />
        <Skel className="h-3.5 w-20 ml-auto" />
        <Skel className="h-7 w-20 ml-auto rounded-lg" />
        <Skel className="h-7 w-7 rounded-lg mx-auto" />
      </div>
      <div className="md:hidden border-t border-slate-100 px-4 py-3.5 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5 min-w-0 flex-1"><Skel className="h-3 w-16" /><Skel className="h-3.5 w-40" /><Skel className="h-3 w-24" /></div>
          <Skel className="h-4 w-16 shrink-0" />
        </div>
      </div>
    </>
  );
}

function TableSkeleton() {
  return (
    <>
      <KpiRowSkeleton />
      <div className="bg-white rounded-2xl border border-slate-200/70 overflow-hidden">
        <ToolbarSkeleton />
        {Array.from({ length: 6 }).map((_, i) => <RowSkeleton key={i} />)}
      </div>
    </>
  );
}

function CardsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-slate-200/70 p-5 space-y-3">
          <Skel className="h-9 w-9 rounded-lg" />
          <Skel className="h-4 w-32" />
          <Skel className="h-3 w-full" />
          <Skel className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <KpiRowSkeleton />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200/70 p-5"><Skel className="h-64 w-full" /></div>
        <div className="bg-white rounded-2xl border border-slate-200/70 p-5"><Skel className="h-64 w-full" /></div>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200/70 p-5"><Skel className="h-48 w-full" /></div>
    </>
  );
}

function FormSkeleton({ fields = 6 }: { fields?: number }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 p-6 space-y-5 max-w-2xl">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <Skel className="h-3 w-28" />
          <Skel className="h-10 w-full rounded-lg" />
        </div>
      ))}
    </div>
  );
}

function ChatSkeleton() {
  return (
    <div className="flex bg-white rounded-2xl border border-slate-200/70 overflow-hidden" style={{ height: 'calc(100vh - 140px)' }}>
      <div className="w-72 border-r border-slate-100 p-3 space-y-3 shrink-0">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skel className="h-9 w-9 rounded-full shrink-0" />
            <div className="space-y-1.5 flex-1"><Skel className="h-3 w-24" /><Skel className="h-2.5 w-32" /></div>
          </div>
        ))}
      </div>
      <div className="flex-1 p-5 space-y-3">
        <Skel className="h-10 w-2/3 rounded-2xl" />
        <Skel className="h-10 w-1/2 rounded-2xl ml-auto" />
        <Skel className="h-10 w-3/5 rounded-2xl" />
      </div>
    </div>
  );
}

function CalendarSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 p-4">
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 35 }).map((_, i) => <Skel key={i} className="h-20 w-full rounded-lg" />)}
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <>
      <KpiRowSkeleton />
      <FormSkeleton fields={4} />
    </>
  );
}

/**
 * Full-page skeleton shown in place of the real Sidebar+main shell while
 * `useData()` is still loading — mirrors the target page's rough shape so
 * the layout doesn't jump once real content arrives.
 */
export default function PageSkeleton({ variant = 'table', maxWidth = 'max-w-6xl' }: { variant?: PageSkeletonVariant; maxWidth?: string }) {
  return (
    <div className="flex h-screen bg-slate-50">
      <SidebarSkeleton />
      <main className="flex-1 overflow-y-auto">
        <div className={`px-6 py-6 ${maxWidth} mx-auto space-y-5`}>
          <div className="space-y-2">
            <Skel className="h-7 w-40" />
            <Skel className="h-4 w-72" />
          </div>
          {variant === 'table' && <TableSkeleton />}
          {variant === 'cards' && <CardsSkeleton />}
          {variant === 'dashboard' && <DashboardSkeleton />}
          {variant === 'form' && <FormSkeleton />}
          {variant === 'chat' && <ChatSkeleton />}
          {variant === 'calendar' && <CalendarSkeleton />}
          {variant === 'detail' && <DetailSkeleton />}
        </div>
      </main>
    </div>
  );
}
