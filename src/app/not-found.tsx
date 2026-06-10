import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-slate-50">
      <div className="max-w-md text-center">
        <h1 className="text-6xl font-black text-slate-300 mb-4">404</h1>
        <h2 className="text-xl font-bold text-slate-800 mb-2">Seite nicht gefunden</h2>
        <p className="text-slate-500 mb-8">Die angeforderte Seite existiert nicht oder wurde verschoben.</p>
        <Link
          href="/"
          className="inline-flex px-6 py-3 bg-emerald-600 text-white rounded-xl text-sm font-bold"
        >
          Zur Startseite
        </Link>
      </div>
    </div>
  );
}
