'use client';

import { useState } from 'react';
import { db, auth } from '@/lib/firebase';
import { collection, addDoc, Timestamp } from 'firebase/firestore';

const CATEGORIES = ['Fehler melden', 'Verbesserungsvorschlag', 'Funktionswunsch', 'Sonstiges'];

export default function FeedbackModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [category, setCategory] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setCategory('');
    setMessage('');
    setSending(false);
    setDone(false);
    setError('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!category) { setError('Bitte wähle eine Kategorie.'); return; }
    if (!message.trim()) { setError('Bitte schreibe eine Nachricht.'); return; }
    setError('');
    setSending(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const user = auth.currentUser;
      await addDoc(collection(db, 'feedback'), {
        category,
        message: message.trim(),
        userId: user?.uid || null,
        userEmail: user?.email || null,
        createdAt: Timestamp.now(),
        platform: 'web',
        status: 'new',
      });
      setDone(true);
    } catch (e: any) {
      console.error('Feedback send error:', e);
      setError(e?.message || 'Feedback konnte nicht gesendet werden.');
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-black/10 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-400 shadow-sm">
              <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Feedback geben</h2>
              <p className="text-xs text-slate-500">Hilf uns, EarnTrack besser zu machen</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {done ? (
          /* Success state */
          <div className="px-6 py-10 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <svg className="h-8 w-8 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-1">Vielen Dank!</h3>
            <p className="text-sm text-slate-500 max-w-xs mx-auto mb-6">
              Dein Feedback wurde übermittelt. Wir kümmern uns so schnell wie möglich darum!
            </p>
            <button
              onClick={handleClose}
              className="rounded-xl bg-gradient-to-r from-teal-600 to-emerald-500 px-6 py-2.5 text-sm font-bold text-white shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              Schließen
            </button>
          </div>
        ) : (
          /* Form */
          <div className="px-6 py-4 space-y-4">
            {/* Apology / thank-you message */}
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
              <p className="text-xs text-amber-800 leading-relaxed">
                Wir bemühen uns sehr, dass EarnTrack reibungslos läuft. Aber so wie bei jeder Software kann es zu Fehlern kommen.
                Dafür entschuldigen wir uns im Voraus und freuen uns über jedes Feedback – ob Fehlermeldung, Verbesserungsvorschlag
                oder Idee – wir kümmern uns so schnell wie möglich darum.
              </p>
            </div>

            {/* Category selection */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
                Kategorie
              </label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => { setCategory(cat); setError(''); }}
                    className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all active:scale-[0.95] ${
                      category === cat
                        ? 'bg-teal-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Message textarea */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
                Deine Nachricht
              </label>
              <textarea
                value={message}
                onChange={(e) => { setMessage(e.target.value); setError(''); }}
                placeholder="Beschreibe dein Anliegen..."
                rows={4}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100 transition-all resize-none"
              />
            </div>

            {/* Error */}
            {error && (
              <p className="text-xs font-medium text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
            )}

            {/* Submit */}
            <div className="flex gap-3">
              <button
                onClick={handleClose}
                className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-all active:scale-[0.97]"
              >
                Abbrechen
              </button>
              <button
                onClick={handleSubmit}
                disabled={sending}
                className="flex-1 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                {sending ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Wird gesendet...
                  </span>
                ) : (
                  'Absenden'
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
