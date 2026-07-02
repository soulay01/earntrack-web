function Bar({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-200 ${className}`} />;
}

function NavGroupSkeleton({ labelWidth, count }: { labelWidth: string; count: number }) {
  return (
    <>
      <Bar className={`h-2.5 ${labelWidth} mb-2 mt-4 first:mt-0`} />
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2.5">
          <Bar className="h-5 w-5 rounded shrink-0" />
          <Bar className="h-3 flex-1" />
        </div>
      ))}
    </>
  );
}

/**
 * Mirrors Sidebar.tsx's shape (logo, nav groups, footer profile) so the app
 * shell doesn't jump once real Sidebar content (company/user data) arrives.
 */
export default function SidebarSkeleton() {
  return (
    <>
      <aside className="hidden md:flex sticky top-0 left-0 w-64 h-screen bg-white/95 border-r border-slate-200 flex-col overflow-hidden shrink-0">
        {/* Logo */}
        <div className="px-5 h-16 flex items-center gap-3 border-b border-slate-100">
          <Bar className="w-9 h-9 rounded-full shrink-0" />
          <div className="space-y-1.5">
            <Bar className="h-3 w-20" />
            <Bar className="h-2 w-24" />
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 min-h-0 px-3 py-4 overflow-hidden">
          <NavGroupSkeleton labelWidth="w-16" count={5} />
          <NavGroupSkeleton labelWidth="w-28" count={3} />
          <NavGroupSkeleton labelWidth="w-32" count={3} />
        </nav>

        {/* User footer */}
        <div className="px-3 py-3 border-t border-slate-100 shrink-0 space-y-1.5">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-50">
            <Bar className="h-8 w-8 rounded-xl shrink-0" />
            <Bar className="h-3 flex-1" />
          </div>
          <div className="flex gap-2">
            <Bar className="h-9 flex-1 rounded-xl" />
            <Bar className="h-9 flex-1 rounded-xl" />
          </div>
        </div>
      </aside>

      {/* Mobile header */}
      <header className="md:hidden flex items-center gap-3 px-4 h-14 border-b border-slate-200 bg-white/95 sticky top-0 z-30">
        <Bar className="h-5 w-5 rounded shrink-0" />
        <Bar className="h-7 w-7 rounded-full shrink-0" />
        <Bar className="h-3 w-24" />
      </header>
    </>
  );
}
