'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';
import PageSkeleton from '@/components/skeletons/PageSkeleton';
import UpgradeModal from '@/components/UpgradeModal';
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, getDocs, serverTimestamp, increment } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { hasReachedLimit, getPlanLimit } from '@/lib/plans';
import { formatCurrency } from '@/lib/utils';
import QRCode from 'qrcode';
import { Plus, Search, Pencil, Trash2, X, QrCode, History, Minus, Package, Printer, TriangleAlert, Copy, Mail } from 'lucide-react';

const ui = {
  btnPrimary: 'inline-flex items-center gap-2 px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition-colors',
  btnSecondary: 'inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg transition-colors',
  btnGhost: 'px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors',
  btnDanger: 'px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors',
  input: 'w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 transition-colors',
  label: 'block text-[13px] font-medium text-slate-700 mb-1.5',
};

const UNITS = ['Stk', 'm', 'm²', 'kg', 'l', 'Paket', 'Rolle', 'Karton'];

export interface InventoryItem {
  id: string;
  name: string;
  sku?: string;
  category?: string;
  unit?: string;
  quantity: number;
  minQuantity?: number;
  price?: number;
  location?: string;
  supplierId?: string;
  notizen?: string;
  companyId: string;
}

function scanUrl(itemId: string) {
  return `${window.location.origin}/inventory/scan/${itemId}`;
}

async function printLabels(items: InventoryItem[]) {
  const labels = await Promise.all(items.map(async it => {
    const qr = await QRCode.toDataURL(scanUrl(it.id), { width: 300, margin: 1 });
    return `<div class="label"><img src="${qr}" /><div class="txt"><p class="name">${it.name}</p>${it.location ? `<p class="loc">${it.location}</p>` : ''}${it.sku ? `<p class="loc">${it.sku}</p>` : ''}</div></div>`;
  }));
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><title>EarnTrack Etiketten</title><style>
    body{font-family:-apple-system,sans-serif;margin:0;padding:10mm;display:flex;flex-wrap:wrap;gap:4mm}
    .label{width:60mm;border:0.3mm solid #cbd5e1;border-radius:2mm;padding:3mm;display:flex;align-items:center;gap:3mm;page-break-inside:avoid}
    .label img{width:22mm;height:22mm}
    .name{font-size:11pt;font-weight:600;margin:0;color:#0f172a}
    .loc{font-size:8pt;margin:1mm 0 0;color:#64748b}
    @media print{.label{border-color:#94a3b8}}
  </style></head><body>${labels.join('')}</body></html>`);
  w.document.close();
  w.onload = () => { w.print(); };
}

export default function InventoryPage() {
  const { user, loading, companyId, company, suppliers } = useData();
  const router = useRouter();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('alle');
  const [onlyReorder, setOnlyReorder] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [qrItem, setQrItem] = useState<InventoryItem | null>(null);
  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [user, loading, router]);

  useEffect(() => {
    if (!companyId) return;
    const unsub = onSnapshot(
      query(collection(db, 'inventory_items'), where('companyId', '==', companyId)),
      snap => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as InventoryItem));
        list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setItems(list);
        setItemsLoading(false);
      },
      e => { console.error('inventory sub error:', e); setItemsLoading(false); }
    );
    return unsub;
  }, [companyId]);

  const categories = useMemo(() => Array.from(new Set(items.map(i => i.category).filter(Boolean))) as string[], [items]);
  const reorderItems = useMemo(() => items.filter(i => (i.minQuantity || 0) > 0 && i.quantity < (i.minQuantity || 0)), [items]);
  const totalValue = useMemo(() => items.reduce((s, i) => s + (i.price || 0) * (i.quantity || 0), 0), [items]);

  const filtered = useMemo(() => {
    let list = onlyReorder ? reorderItems : items;
    if (category !== 'alle') list = list.filter(i => i.category === category);
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter(i =>
      (i.name || '').toLowerCase().includes(q) ||
      (i.sku || '').toLowerCase().includes(q) ||
      (i.location || '').toLowerCase().includes(q) ||
      (i.category || '').toLowerCase().includes(q)
    );
  }, [items, reorderItems, onlyReorder, category, search]);

  if (loading || !user) return <PageSkeleton variant="table" maxWidth="max-w-6xl" />;

  async function save(form: Partial<InventoryItem>) {
    if (!user || !companyId) return;
    if (!editing && hasReachedLimit(company?.subscriptionPlan, 'inventoryItems', items.length)) {
      setShowUpgrade(true); return;
    }
    if (!form.name?.trim()) { alert('Bitte gib einen Artikelnamen ein.'); return; }
    setSaving(true);
    try {
      if (editing) {
        await updateDoc(doc(db, 'inventory_items', editing.id), { ...form, companyId, updatedAt: serverTimestamp() });
      } else {
        const ref = await addDoc(collection(db, 'inventory_items'), { ...form, companyId, createdAt: serverTimestamp() });
        if ((form.quantity || 0) > 0) {
          await addDoc(collection(db, 'inventory_movements'), {
            companyId, itemId: ref.id, itemName: form.name, delta: form.quantity,
            reason: 'Anfangsbestand', userId: user.uid, userName: user.email || '', createdAt: serverTimestamp(),
          });
        }
      }
      setShowModal(false); setEditing(null);
    } catch (e) {
      alert('Fehler beim Speichern: ' + (e instanceof Error ? e.message : 'Unbekannter Fehler'));
    } finally { setSaving(false); }
  }

  async function book(item: InventoryItem, delta: number, reason: string) {
    if (!user || !companyId) return;
    if (item.quantity + delta < 0) { alert('Bestand kann nicht negativ werden.'); return; }
    try {
      await updateDoc(doc(db, 'inventory_items', item.id), { quantity: increment(delta), updatedAt: serverTimestamp() });
      await addDoc(collection(db, 'inventory_movements'), {
        companyId, itemId: item.id, itemName: item.name, delta,
        unit: item.unit || 'Stk', unitPrice: item.price || 0,
        reason, userId: user.uid, userName: user.email || '', createdAt: serverTimestamp(),
      });
    } catch (e) {
      alert('Fehler beim Buchen: ' + (e instanceof Error ? e.message : 'Unbekannter Fehler'));
    }
  }

  async function remove(id: string) {
    try { await deleteDoc(doc(db, 'inventory_items', id)); }
    catch (e) { alert('Fehler beim Löschen: ' + (e instanceof Error ? e.message : 'Unbekannter Fehler')); }
    setDeleting(null);
  }

  function toggleSelect(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="px-4 md:px-8 py-6 md:py-10 max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Lager</h1>
              <p className="text-slate-500 text-sm mt-0.5">{items.length} Artikel</p>
            </div>
            <div className="flex gap-2">
              {selected.size > 0 && (
                <button onClick={() => printLabels(items.filter(i => selected.has(i.id)))} className={ui.btnSecondary}>
                  <Printer className="w-4 h-4" />
                  {selected.size} Etiketten drucken
                </button>
              )}
              <button onClick={() => {
                if (hasReachedLimit(company?.subscriptionPlan, 'inventoryItems', items.length)) { setShowUpgrade(true); return; }
                setEditing(null); setShowModal(true);
              }} className={ui.btnPrimary}>
                <Plus className="w-4 h-4" />
                Neuer Artikel
              </button>
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-white rounded-lg border border-slate-200 px-4 py-3">
              <p className="text-xs font-medium text-slate-500 mb-0.5">Artikel</p>
              <p className="text-base font-semibold text-slate-900 tabular-nums">{items.length}</p>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 px-4 py-3">
              <p className="text-xs font-medium text-slate-500 mb-0.5">Bestandswert</p>
              <p className="text-base font-semibold text-slate-900 tabular-nums">{formatCurrency(totalValue)}</p>
            </div>
            <button onClick={() => setOnlyReorder(!onlyReorder)}
              className={`rounded-lg border px-4 py-3 text-left transition-colors ${onlyReorder ? 'bg-amber-50 border-amber-300' : reorderItems.length > 0 ? 'bg-white border-amber-300 hover:bg-amber-50/50' : 'bg-white border-slate-200'}`}>
              <p className="text-xs font-medium text-slate-500 mb-0.5">Nachbestellen</p>
              <p className={`text-base font-semibold tabular-nums ${reorderItems.length > 0 ? 'text-amber-700' : 'text-slate-900'}`}>{reorderItems.length}</p>
            </button>
          </div>

          {/* Filter */}
          <div className="flex flex-col md:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input type="text" placeholder="Suchen nach Name, Nummer, Lagerort …" value={search} onChange={e => setSearch(e.target.value)}
                className={`${ui.input} pl-9`} />
            </div>
            {categories.length > 0 && (
              <select value={category} onChange={e => setCategory(e.target.value)} className={`${ui.input} md:w-48`}>
                <option value="alle">Alle Kategorien</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
          </div>

          {onlyReorder && reorderItems.length > 0 && (
            <ReorderPanel items={reorderItems} suppliers={suppliers} />
          )}

          {/* Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="hidden md:grid grid-cols-[28px_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_130px_170px] gap-4 px-4 py-2.5 border-b border-slate-200 bg-slate-50/60 text-xs font-medium text-slate-500 items-center">
              <input type="checkbox" checked={filtered.length > 0 && filtered.every(i => selected.has(i.id))}
                onChange={e => setSelected(e.target.checked ? new Set(filtered.map(i => i.id)) : new Set())}
                className="w-3.5 h-3.5 accent-teal-600" />
              <span>Artikel</span>
              <span>Lagerort</span>
              <span>Lieferant</span>
              <span className="text-center">Bestand</span>
              <span className="text-right">Aktionen</span>
            </div>
            <div className="divide-y divide-slate-100">
              {filtered.map(item => {
                const low = (item.minQuantity || 0) > 0 && item.quantity < (item.minQuantity || 0);
                const supplier = suppliers.find((s: any) => s.id === item.supplierId);
                return (
                  <div key={item.id} className="grid grid-cols-[28px_minmax(0,1fr)_130px] md:grid-cols-[28px_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_130px_170px] gap-4 items-center px-4 py-3 hover:bg-slate-50 transition-colors">
                    <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggleSelect(item.id)} className="w-3.5 h-3.5 accent-teal-600" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate flex items-center gap-1.5">
                        {item.name}
                        {low && <span title={`Unter Mindestbestand (${item.minQuantity})`}><TriangleAlert className="w-3.5 h-3.5 text-amber-500 shrink-0" /></span>}
                      </p>
                      <p className="text-xs text-slate-500 truncate">{[item.sku, item.category].filter(Boolean).join(' · ') || '–'}</p>
                    </div>
                    <span className="hidden md:block text-sm text-slate-600 truncate">{item.location || '–'}</span>
                    <span className="hidden md:block text-sm text-slate-600 truncate">{supplier?.name || '–'}</span>
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => book(item, -1, 'Entnahme')} title="Entnehmen" disabled={item.quantity <= 0}
                        className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 transition-colors">
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className={`min-w-[52px] text-center text-sm font-semibold tabular-nums ${low ? 'text-amber-700' : 'text-slate-900'}`}>
                        {item.quantity} <span className="text-xs font-normal text-slate-400">{item.unit || 'Stk'}</span>
                      </span>
                      <button onClick={() => book(item, 1, 'Zugang')} title="Einbuchen"
                        className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center justify-end gap-0.5">
                      <button onClick={() => setQrItem(item)} title="QR-Code" className="p-2 rounded-lg text-slate-400 hover:text-teal-700 hover:bg-teal-50 transition-colors">
                        <QrCode className="w-4 h-4" />
                      </button>
                      <button onClick={() => setHistoryItem(item)} title="Historie" className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                        <History className="w-4 h-4" />
                      </button>
                      <button onClick={() => { setEditing(item); setShowModal(true); }} title="Bearbeiten" className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => setDeleting(item.id)} title="Löschen" className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
              {!itemsLoading && filtered.length === 0 && (
                <div className="p-16 text-center">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                    <Package className="w-5 h-5 text-slate-400" />
                  </div>
                  <p className="text-sm font-medium text-slate-900 mb-1">{search || onlyReorder || category !== 'alle' ? 'Keine Ergebnisse' : 'Noch keine Artikel im Lager'}</p>
                  <p className="text-sm text-slate-500 mb-5">{search || onlyReorder || category !== 'alle' ? 'Passe Suche oder Filter an.' : 'Lege deinen ersten Artikel an und drucke das QR-Etikett.'}</p>
                  {!search && !onlyReorder && category === 'alle' && (
                    <button onClick={() => { setEditing(null); setShowModal(true); }} className={ui.btnPrimary}>
                      <Plus className="w-4 h-4" />
                      Ersten Artikel anlegen
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {showModal && (
        <ItemModal editing={editing} saving={saving} suppliers={suppliers} onSave={save} onClose={() => { setShowModal(false); setEditing(null); }} />
      )}

      {qrItem && <QrModal item={qrItem} onClose={() => setQrItem(null)} />}
      {historyItem && <HistoryModal item={historyItem} companyId={companyId} onClose={() => setHistoryItem(null)} />}

      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-slate-900">Artikel löschen?</h3>
            <p className="text-slate-500 text-sm mt-2">Der Artikel und sein QR-Code werden ungültig. Diese Aktion kann nicht rückgängig gemacht werden.</p>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setDeleting(null)} className={ui.btnGhost}>Abbrechen</button>
              <button onClick={() => remove(deleting)} className={ui.btnDanger}>Löschen</button>
            </div>
          </div>
        </div>
      )}

      <UpgradeModal
        open={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        dismissable
        title="Artikel-Limit erreicht"
        description={`Dein aktueller Plan erlaubt maximal ${getPlanLimit(company?.subscriptionPlan, 'inventoryItems')} Lager-Artikel. Upgrade auf einen größeren Plan für unbegrenztes Inventar.`}
      />
    </div>
  );
}

function ReorderPanel({ items, suppliers }: { items: InventoryItem[]; suppliers: any[] }) {
  const groups = useMemo(() => {
    const map = new Map<string, InventoryItem[]>();
    items.forEach(i => {
      const key = i.supplierId || '';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(i);
    });
    return Array.from(map.entries());
  }, [items]);

  function listText(list: InventoryItem[]) {
    return list.map(i => `- ${i.name}${i.sku ? ` (${i.sku})` : ''}: ${Math.max(0, (i.minQuantity || 0) - i.quantity)} ${i.unit || 'Stk'}`).join('\n');
  }

  return (
    <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
      <p className="text-sm font-medium text-amber-900">Bestellvorschlag (Fehlmenge bis Mindestbestand)</p>
      {groups.map(([supplierId, list]) => {
        const supplier = suppliers.find((s: any) => s.id === supplierId);
        const text = `Bestellung ${supplier?.name || ''}:\n${listText(list)}`;
        return (
          <div key={supplierId || 'none'} className="bg-white rounded-lg border border-amber-200/60 p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-sm font-medium text-slate-900">{supplier?.name || 'Ohne Lieferant'}</p>
              <div className="flex gap-1.5">
                <button onClick={async () => { await navigator.clipboard.writeText(text); alert('Bestell-Liste kopiert!'); }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 transition-colors">
                  <Copy className="w-3.5 h-3.5" /> Kopieren
                </button>
                {supplier?.email && (
                  <a href={`mailto:${supplier.email}?subject=${encodeURIComponent('Bestellung')}&body=${encodeURIComponent(text)}`}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-teal-700 bg-white border border-slate-300 hover:bg-teal-50 transition-colors">
                    <Mail className="w-3.5 h-3.5" /> Per E-Mail
                  </a>
                )}
              </div>
            </div>
            <ul className="text-xs text-slate-600 space-y-0.5">
              {list.map(i => (
                <li key={i.id}>{i.name}: <span className="font-medium text-slate-900">{Math.max(0, (i.minQuantity || 0) - i.quantity)} {i.unit || 'Stk'}</span> <span className="text-slate-400">(Bestand {i.quantity} / Min. {i.minQuantity})</span></li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function QrModal({ item, onClose }: { item: InventoryItem; onClose: () => void }) {
  const [dataUrl, setDataUrl] = useState('');
  useEffect(() => {
    QRCode.toDataURL(scanUrl(item.id), { width: 480, margin: 1 }).then(setDataUrl).catch(e => console.error('QR error:', e));
  }, [item.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 p-6 w-full max-w-sm mx-4 text-center" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-slate-900">{item.name}</h3>
        <p className="text-xs text-slate-500 mt-0.5 mb-4">{[item.sku, item.location].filter(Boolean).join(' · ') || 'QR-Code scannen zum Buchen'}</p>
        {dataUrl ? (
          <img src={dataUrl} alt="QR-Code" className="w-56 h-56 mx-auto rounded-lg border border-slate-200" />
        ) : (
          <div className="w-56 h-56 mx-auto rounded-lg bg-slate-100 animate-pulse" />
        )}
        <p className="text-xs text-slate-400 mt-3 break-all">{typeof window !== 'undefined' ? scanUrl(item.id) : ''}</p>
        <div className="flex gap-2 mt-5">
          <button onClick={() => printLabels([item])} className={`flex-1 ${ui.btnPrimary}`}>
            <Printer className="w-4 h-4" /> Etikett drucken
          </button>
          <button onClick={onClose} className={ui.btnGhost}>Schließen</button>
        </div>
      </div>
    </div>
  );
}

function HistoryModal({ item, companyId, onClose }: { item: InventoryItem; companyId: string | null; onClose: () => void }) {
  const [movements, setMovements] = useState<any[] | null>(null);

  useEffect(() => {
    if (!companyId) return;
    getDocs(query(
      collection(db, 'inventory_movements'),
      where('companyId', '==', companyId),
      where('itemId', '==', item.id),
    )).then(snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setMovements(list.slice(0, 20));
    }).catch(e => { console.error('movements error:', e); setMovements([]); });
  }, [item.id, companyId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md mx-4 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Historie</h3>
            <p className="text-xs text-slate-500 mt-0.5">{item.name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto divide-y divide-slate-100">
          {movements === null && <p className="text-sm text-slate-500 py-4 text-center">Lade Historie …</p>}
          {movements?.length === 0 && <p className="text-sm text-slate-500 py-4 text-center">Noch keine Bewegungen.</p>}
          {movements?.map(m => (
            <div key={m.id} className="flex items-center justify-between py-2.5 gap-3">
              <div className="min-w-0">
                <p className="text-sm text-slate-900">{m.reason || 'Buchung'}</p>
                <p className="text-xs text-slate-500 truncate">
                  {m.userName || '–'} · {m.createdAt?.toDate ? m.createdAt.toDate().toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–'}
                </p>
              </div>
              <span className={`text-sm font-semibold tabular-nums shrink-0 ${m.delta >= 0 ? 'text-teal-700' : 'text-slate-900'}`}>
                {m.delta >= 0 ? '+' : ''}{m.delta}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ItemModal({ editing, saving, suppliers, onSave, onClose }: { editing: InventoryItem | null; saving: boolean; suppliers: any[]; onSave: (f: Partial<InventoryItem>) => void; onClose: () => void }) {
  const [form, setForm] = useState({
    name: editing?.name || '',
    sku: editing?.sku || '',
    category: editing?.category || '',
    unit: editing?.unit || 'Stk',
    quantity: editing?.quantity?.toString() || '0',
    minQuantity: editing?.minQuantity?.toString() || '',
    price: editing?.price?.toString() || '',
    location: editing?.location || '',
    supplierId: editing?.supplierId || '',
    notizen: editing?.notizen || '',
  });

  function update(field: string, value: string) { setForm(prev => ({ ...prev, [field]: value })); }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      name: form.name.trim(), sku: form.sku.trim(), category: form.category.trim(),
      unit: form.unit, quantity: parseFloat(form.quantity) || 0,
      minQuantity: parseFloat(form.minQuantity) || 0, price: parseFloat(form.price) || 0,
      location: form.location.trim(), supplierId: form.supplierId, notizen: form.notizen,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh] pb-8 bg-slate-900/40 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md mx-4">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">{editing ? 'Artikel bearbeiten' : 'Neuer Artikel'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className={ui.label}>Artikelname *</label>
            <input value={form.name} onChange={e => update('name', e.target.value)} required placeholder="z.B. Akkuschrauber Makita" className={ui.input} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={ui.label}>Artikelnummer</label>
              <input value={form.sku} onChange={e => update('sku', e.target.value)} placeholder="z.B. WZ-0042" className={ui.input} />
            </div>
            <div>
              <label className={ui.label}>Kategorie</label>
              <input value={form.category} onChange={e => update('category', e.target.value)} placeholder="z.B. Werkzeug" className={ui.input} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={ui.label}>{editing ? 'Bestand' : 'Anfangsbestand'}</label>
              <input type="number" step="any" min="0" value={form.quantity} onChange={e => update('quantity', e.target.value)} className={ui.input} />
            </div>
            <div>
              <label className={ui.label}>Mindestbestand</label>
              <input type="number" step="any" min="0" value={form.minQuantity} onChange={e => update('minQuantity', e.target.value)} placeholder="0" className={ui.input} />
            </div>
            <div>
              <label className={ui.label}>Einheit</label>
              <select value={form.unit} onChange={e => update('unit', e.target.value)} className={ui.input}>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={ui.label}>EK-Preis (€)</label>
              <input type="number" step="0.01" min="0" value={form.price} onChange={e => update('price', e.target.value)} placeholder="0,00" className={ui.input} />
            </div>
            <div>
              <label className={ui.label}>Lagerort</label>
              <input value={form.location} onChange={e => update('location', e.target.value)} placeholder="z.B. Regal A3 / Bus 1" className={ui.input} />
            </div>
          </div>
          <div>
            <label className={ui.label}>Lieferant</label>
            <select value={form.supplierId} onChange={e => update('supplierId', e.target.value)} className={ui.input}>
              <option value="">Kein Lieferant</option>
              {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className={ui.label}>Notizen</label>
            <textarea rows={2} value={form.notizen} onChange={e => update('notizen', e.target.value)} className={`${ui.input} resize-none`} />
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <button type="button" onClick={onClose} className={ui.btnGhost}>Abbrechen</button>
            <button type="submit" disabled={saving} className={`${ui.btnPrimary} disabled:opacity-50`}>
              {saving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {editing ? 'Änderungen speichern' : 'Artikel anlegen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
