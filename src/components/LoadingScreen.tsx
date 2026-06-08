export default function LoadingScreen({ fullScreen = true }: { fullScreen?: boolean }) {
  const cls = fullScreen
    ? 'flex h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-teal-50 to-emerald-50'
    : 'flex items-center justify-center h-full';

  return (
    <div className={cls}>
      <div className="relative w-20 h-20">
        <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-teal-600 animate-spin" style={{ animationDuration: '1.2s' }} />
        <img src="/logo.png?v=2" alt="EarnTrack" className="w-full h-full rounded-full object-cover p-[3px]" />
      </div>
    </div>
  );
}
