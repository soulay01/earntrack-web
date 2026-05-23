'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function AdminPage() {
  const { user, loading, companyId } = useData();
  const router = useRouter();
  const [paymentRequests, setPaymentRequests] = useState<any[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'payment_requests'), where('status', '==', 'pending'));
    getDocs(q).then(snap => {
      setPaymentRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoadingRequests(false);
    });
  }, [user]);

  async function handleAction(id: string, status: 'approved' | 'rejected') {
    await updateDoc(doc(db, 'payment_requests', id), { status, updatedAt: serverTimestamp() });
    setPaymentRequests(prev => prev.filter(p => p.id !== id));
  }

  if (loading || !user) return null;

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="px-8 py-8 max-w-3xl mx-auto">
          <div className="mb-6 animate-fadeIn">
            <a href="/settings" className="text-sm text-teal-600 hover:text-teal-700 font-semibold mb-2 inline-block hover:underline">&larr; Zurück zu Einstellungen</a>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Admin Panel</h1>
            <p className="text-slate-500 text-sm mt-1">Zahlungsanfragen verwalten</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden animate-slideUp">
            <div className="px-6 py-4 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">Ausstehende Zahlungsanfragen</h2>
            </div>
            {loadingRequests ? (
              <div className="p-12 text-center text-slate-400 text-sm">Laden...</div>
            ) : paymentRequests.length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 flex items-center justify-center mx-auto mb-3 shadow-sm">
                  <span className="text-2xl">✓</span>
                </div>
                <p className="text-slate-500 text-sm font-medium">Keine ausstehenden Anfragen</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {paymentRequests.map(req => (
                  <div key={req.id} className="p-5 flex items-center justify-between hover:bg-slate-50 transition-all duration-150">
                    <div>
                      <p className="text-sm font-bold text-slate-900">{req.userEmail || 'Unbekannt'}</p>
                      <p className="text-xs text-slate-400">{req.plan || 'Pro'} &middot; {req.submittedAt?.toDate?.().toLocaleDateString('de-DE') || '-'}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleAction(req.id, 'approved')}
                        className="px-4 py-1.5 bg-gradient-to-br from-green-50 to-emerald-50 text-green-700 border border-green-200 rounded-xl text-xs font-bold hover:from-green-100 hover:to-emerald-100 active:scale-[0.97] transition-all shadow-sm">
                        Bestätigen
                      </button>
                      <button onClick={() => handleAction(req.id, 'rejected')}
                        className="px-4 py-1.5 bg-gradient-to-br from-red-50 to-rose-50 text-red-700 border border-red-200 rounded-xl text-xs font-bold hover:from-red-100 hover:to-rose-100 active:scale-[0.97] transition-all shadow-sm">
                        Ablehnen
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
