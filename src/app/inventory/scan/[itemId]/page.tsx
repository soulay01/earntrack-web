'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import { doc, onSnapshot, updateDoc, addDoc, collection, serverTimestamp, increment, arrayUnion, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Minus, Plus, Check, Package, TriangleAlert } from 'lucide-react';

export default function ScanPage({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = use(params);
  const { user, loading, companyId, role, assignments, myProjects } = useData();
  const router = useRouter();
  const [item, setItem] = useState<any | null | undefined>(undefined);
  const [amount, setAmount] = useState(1);
  const [projectId, setProjectId] = useState('');
  const [booking, setBooking] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const projects = role === 'employee' ? myProjects : assignments;

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'inventory_items', itemId),
      snap => setItem(snap.exists() ? { id: snap.id, ...snap.data() } : null),
      e => { console.error('scan item error:', e); setItem(null); }
    );
    return unsub;
  }, [itemId, user]);

  async function book(sign: 1 | -1) {
    if (!user || !item || booking) return;
    const delta = sign * amount;
    if (item.quantity + delta < 0) { alert('Bestand kann nicht negativ werden.'); return; }
    setBooking(true);
    try {
      const project = sign < 0 ? projects.find((p: any) => p.id === projectId) : null;

      // Material am Auftrag mitführen – gleiche Struktur wie die Mobile-App:
      // unitPrice = VK inkl. Material-Aufschlag (Rechnungseinstellungen), costPrice = EK.
      // Fließt damit in Gewinn/Umsatz und die Rechnungspositionen des Auftrags ein.
      if (project) {
        let markup = 0;
        try {
          const tplSnap = await getDoc(doc(db, 'companies', item.companyId || companyId, 'settings', 'invoice'));
          markup = Number(tplSnap.data()?.materialMarkupPercent) || 0;
        } catch { /* Aufschlag optional */ }
        const vk = Math.round((item.price || 0) * (1 + markup / 100) * 100) / 100;
        await updateDoc(doc(db, 'assignments', project.id), {
          materialien: arrayUnion({
            itemId: item.id,
            name: item.name,
            qty: amount,
            unit: item.unit || 'Stk',
            unitPrice: vk,
            costPrice: item.price || 0,
            addedAt: new Date().toISOString(),
            userId: user.uid,
          }),
          updatedAt: serverTimestamp(),
        });
      }

      await updateDoc(doc(db, 'inventory_items', item.id), { quantity: increment(delta), updatedAt: serverTimestamp() });
      await addDoc(collection(db, 'inventory_movements'), {
        companyId: item.companyId || companyId, itemId: item.id, itemName: item.name, delta,
        unit: item.unit || 'Stk', unitPrice: item.price || 0,
        reason: sign > 0 ? 'Zugang (Scan)' : project ? `Entnahme: ${project.projekt || project.kunde}` : 'Entnahme (Scan)',
        ...(project && { assignmentId: project.id, projekt: project.projekt || project.kunde || '' }),
        userId: user.uid, userName: user.email || '', createdAt: serverTimestamp(),
      });
      setDone(sign > 0 ? `+${amount} eingebucht` : `−${amount} entnommen`);
      setAmount(1);
      setTimeout(() => setDone(null), 2500);
    } catch (e) {
      alert('Fehler beim Buchen: ' + (e instanceof Error ? e.message : 'Unbekannter Fehler'));
    } finally { setBooking(false); }
  }

  if (loading || !user || item === undefined) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <span className="w-6 h-6 border-2 border-slate-300 border-t-teal-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (item === null) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <TriangleAlert className="w-5 h-5 text-slate-400" />
          </div>
          <p className="text-sm font-medium text-slate-900 mb-1">Artikel nicht gefunden</p>
          <p className="text-sm text-slate-500 mb-5">Der Artikel wurde gelöscht oder du hast keinen Zugriff darauf.</p>
          <a href="/inventory" className="inline-flex items-center gap-2 px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition-colors">Zum Lager</a>
        </div>
      </div>
    );
  }

  const low = (item.minQuantity || 0) > 0 && item.quantity < (item.minQuantity || 0);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-xl border border-slate-200 p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-teal-50 flex items-center justify-center mx-auto mb-3">
          <Package className="w-5 h-5 text-teal-700" />
        </div>
        <h1 className="text-lg font-semibold text-slate-900">{item.name}</h1>
        <p className="text-xs text-slate-500 mt-0.5">{[item.sku, item.location].filter(Boolean).join(' · ') || 'Lager'}</p>

        <div className="my-6">
          <p className="text-xs font-medium text-slate-500 mb-1">Aktueller Bestand</p>
          <p className={`text-4xl font-semibold tabular-nums ${low ? 'text-amber-600' : 'text-slate-900'}`}>
            {item.quantity} <span className="text-base font-normal text-slate-400">{item.unit || 'Stk'}</span>
          </p>
          {low && (
            <p className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-50 text-amber-800 text-xs font-medium">
              <TriangleAlert className="w-3.5 h-3.5" /> Unter Mindestbestand ({item.minQuantity})
            </p>
          )}
        </div>

        {done && (
          <p className="mb-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-50 text-teal-800 text-sm font-medium">
            <Check className="w-4 h-4" /> {done}
          </p>
        )}

        {/* Amount stepper */}
        <div className="flex items-center justify-center gap-3 mb-5">
          <button onClick={() => setAmount(a => Math.max(1, a - 1))}
            className="w-11 h-11 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-600 flex items-center justify-center transition-colors">
            <Minus className="w-4 h-4" />
          </button>
          <input type="number" min="1" value={amount}
            onChange={e => setAmount(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-20 h-11 text-center text-lg font-semibold tabular-nums bg-white border border-slate-300 rounded-lg outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 transition-colors" />
          <button onClick={() => setAmount(a => a + 1)}
            className="w-11 h-11 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-600 flex items-center justify-center transition-colors">
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {projects.length > 0 && (
          <div className="mb-4 text-left">
            <label className="block text-[13px] font-medium text-slate-700 mb-1.5">Bei Entnahme auf Projekt buchen (optional)</label>
            <select value={projectId} onChange={e => setProjectId(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 transition-colors">
              <option value="">Kein Projekt</option>
              {projects.map((p: any) => <option key={p.id} value={p.id}>{p.projekt || p.kunde || 'Unbenannt'}</option>)}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => book(-1)} disabled={booking || item.quantity < amount}
            className="py-3.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-sm font-medium disabled:opacity-40 transition-colors">
            − Entnehmen
          </button>
          <button onClick={() => book(1)} disabled={booking}
            className="py-3.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium disabled:opacity-50 transition-colors">
            ＋ Einbuchen
          </button>
        </div>
      </div>

      <a href="/inventory" className="mt-4 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors">Zur Lager-Übersicht</a>
      <p className="mt-1 text-xs text-slate-400">Nächsten Artikel einfach wieder mit der Kamera scannen.</p>
    </div>
  );
}
