'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';
import { TriangleAlert, Trash2 } from 'lucide-react';

export default function DeleteAccountPage() {
  const { user, loading, logout } = useData();
  const router = useRouter();
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  if (loading || !user) return null;

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="px-4 md:px-8 py-4 md:py-8 max-w-2xl mx-auto space-y-8">
          <div className="mb-2">
            <a href="/settings" className="text-sm text-teal-600 hover:text-teal-700 font-semibold mb-2 inline-block hover:underline">
              &larr; Zurück zu Einstellungen
            </a>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight mt-2">Account löschen</h1>
            <p className="text-slate-500 text-sm mt-1">Endgültige Löschung deines gesamten Kontos</p>
          </div>

          <div className="bg-white rounded-2xl border border-red-200 shadow-sm p-5 space-y-4">
            <p className="text-xs font-bold text-red-500 tracking-widest uppercase text-center"><TriangleAlert className="inline w-4 h-4 mr-1" /> Account löschen</p>
            <p className="text-xs text-slate-500 text-center leading-relaxed">
              Dein Account, alle Firmendaten, Einsätze, Mitarbeiter, Kunden und Rechnungen werden
              unwiderruflich gelöscht. Exportiere vorher deine Daten unter
              {' '}<a href="/settings/export" className="text-teal-600 underline">Datenexport</a>.
            </p>
            <div className="bg-red-50 rounded-xl border border-red-200 p-4">
              <label className="block text-xs font-bold text-red-700 mb-2">
                Gib <span className="font-mono bg-red-100 px-1.5 py-0.5 rounded text-sm">LÖSCHEN</span> ein, um zu bestätigen:
              </label>
              <input
                type="text"
                value={deleteConfirm}
                onChange={e => setDeleteConfirm(e.target.value)}
                placeholder="LÖSCHEN"
                className="w-full px-3 py-2 bg-white border border-red-300 rounded-xl text-sm text-slate-900 placeholder-red-300 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100/50 transition-all"
              />
            </div>
            <button
              disabled={deleteConfirm !== 'LÖSCHEN' || deleting}
              onClick={() => setShowConfirmModal(true)}
              className="w-full py-2.5 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all text-sm flex items-center justify-center gap-2"
            >
              <Trash2 className="w-5 h-5" /> Account unwiderruflich löschen
            </button>
          </div>

          {showConfirmModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowConfirmModal(false)}>
              <div className="bg-white rounded-3xl shadow-2xl border border-red-200 p-8 max-w-md w-full animate-[fadeIn_0.2s_ease-out]" onClick={e => e.stopPropagation()}>
                <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
                  <svg className="w-7 h-7 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                </div>
                <h2 className="text-xl font-black text-slate-900 text-center mb-2">Wirklich löschen?</h2>
                <p className="text-sm text-slate-500 text-center leading-relaxed mb-6">
                  Diese Aktion ist <strong className="text-red-600">endgültig und unwiderruflich</strong>.
                  Alle deine Daten – Einsätze, Mitarbeiter, Kunden, Rechnungen, Angebote, Notizen, Fotos –
                  werden dauerhaft gelöscht. Es gibt <strong className="text-red-600">keine Wiederherstellung</strong>.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowConfirmModal(false)}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-all text-sm"
                  >
                    Abbrechen
                  </button>
                  <button
                    disabled={deleting}
                    onClick={async () => {
                      if (deleting) return
                      setDeleting(true)
                      try {
                        const token = await user!.getIdToken()
                        const res = await fetch('/api/delete-account', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        })
                        const data = await res.json()
                        if (data.success) {
                          await logout()
                          router.replace('/')
                        } else {
                          alert('Fehler: ' + (data.error || 'Unbekannt'))
                          setDeleting(false)
                          setShowConfirmModal(false)
                        }
                      } catch (err: any) {
                        alert('Fehler: ' + err.message)
                        setDeleting(false)
                        setShowConfirmModal(false)
                      }
                    }}
                    className="flex-1 py-2.5 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all text-sm flex items-center justify-center gap-2"
                  >
                    {deleting ? (
                      <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Lösche…</>
                    ) : (
                      'Ja, endgültig löschen'
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
