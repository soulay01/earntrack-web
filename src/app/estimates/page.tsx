'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';
import { generateEstimateHTML, generateEstimateNumber, fmt } from '@/lib/estimateUtils';
import { generateInvoiceHTML } from '@/lib/estimateUtils';
import { downloadPDF } from '@/lib/pdf';
import { doc, getDoc, addDoc, updateDoc, collection, query, where, getDocs, deleteDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

function downloadFile(content: string, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName; a.click();
  URL.revokeObjectURL(url);
}

const PALETTE = ['#0d9488','#3b82f6','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#ec4899','#10b981'];

type EstimateStatus = 'entwurf' | 'gesendet' | 'angenommen' | 'abgelehnt' | 'rechnung_erstellt';

const STATUS_LABELS: Record<EstimateStatus, string> = {
  entwurf: 'Entwurf',
  gesendet: 'Gesendet',
  angenommen: 'Angenommen',
  abgelehnt: 'Abgelehnt',
  rechnung_erstellt: 'Rechnung erstellt',
};

const STATUS_COLORS: Record<EstimateStatus, { bg: string; text: string; dot: string }> = {
  entwurf: { bg: '#f1f5f9', text: '#64748b', dot: '#94a3b8' },
  gesendet: { bg: '#dbeafe', text: '#2563eb', dot: '#3b82f6' },
  angenommen: { bg: '#dcfce7', text: '#16a34a', dot: '#22c55e' },
  abgelehnt: { bg: '#fee2e2', text: '#dc2626', dot: '#ef4444' },
  rechnung_erstellt: { bg: '#f0fdf4', text: '#0d9488', dot: '#0d9488' },
};

const STATUS_FLOW: EstimateStatus[] = ['entwurf', 'gesendet', 'angenommen', 'rechnung_erstellt'];

export default function EstimatesPage() {
  const { user, loading, employees, customers, companyId, company } = useData();
  const router = useRouter();
  const [companyData, setCompanyData] = useState<any>(null);
  const [invoiceTemplate, setInvoiceTemplate] = useState<any>(null);
  const [estimates, setEstimates] = useState<any[]>([]);
  const [estimatesLoading, setEstimatesLoading] = useState(true);
  const [tab, setTab] = useState<'new' | 'history'>('new');
  const [saving, setSaving] = useState(false);

  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [projekt, setProjekt] = useState('');
  const [mitarbeiterStunden, setMitarbeiterStunden] = useState<Record<string, string>>({});
  const [materialienList, setMaterialienList] = useState([{ id: Date.now() + 1, name: '', preis: '', menge: '' }]);
  const [sonstigeKosten, setSonstigeKosten] = useState([{ id: Date.now() + 2, name: '', betrag: '' }]);
  const [gewinnmarge, setGewinnmarge] = useState('');
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [currentEstimateNumber, setCurrentEstimateNumber] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [user, loading, router]);

  useEffect(() => {
    if (companyId) {
      getDoc(doc(db, 'companies', companyId)).then(snap => {
        if (snap.exists()) setCompanyData(snap.data());
      });
      getDoc(doc(db, 'companies', companyId, 'settings', 'invoice')).then(snap => {
        if (snap.exists()) setInvoiceTemplate(snap.data());
      });
    }
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    setEstimatesLoading(true);
    const q = query(
      collection(db, 'estimates'),
      where('companyId', '==', companyId)
    );
    getDocs(q).then(snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a: any, b: any) => {
        const at = a.createdAt?.seconds || new Date(a.createdAt || 0).getTime();
        const bt = b.createdAt?.seconds || new Date(b.createdAt || 0).getTime();
        return bt - at;
      });
      setEstimates(list);
      setEstimatesLoading(false);
    }).catch(() => setEstimatesLoading(false));
  }, [companyId]);

  const filteredEstimates = useMemo(() => {
    if (!searchQuery) return estimates;
    const q = searchQuery.toLowerCase();
    return estimates.filter(e =>
      (e.customerName || '').toLowerCase().includes(q) ||
      (e.project || '').toLowerCase().includes(q) ||
      (e.estimateNumber || '').toLowerCase().includes(q)
    );
  }, [estimates, searchQuery]);

  const selectedCustomer = useMemo(() => customers.find(c => c.id === selectedCustomerId) || null, [customers, selectedCustomerId]);

  const mitarbeiterList = useMemo(() =>
    selectedEmployeeIds.map(empId => {
      const emp = employees.find(e => e.id === empId);
      if (!emp) return null;
      return { id: emp.id, name: emp.name, stundenlohn: String(emp.stundenlohn || ''), stunden: mitarbeiterStunden[emp.id] || '' };
    }).filter(Boolean),
    [selectedEmployeeIds, employees, mitarbeiterStunden]
  );

  const toggleEmployee = (empId: string) => {
    setSelectedEmployeeIds(prev => {
      if (prev.includes(empId)) {
        setMitarbeiterStunden(s => { const copy = { ...s }; delete copy[empId]; return copy; });
        return prev.filter(id => id !== empId);
      }
      return [...prev, empId];
    });
  };

  const totalMitarbeiter = useMemo(() =>
    mitarbeiterList.reduce((sum, m: any) => sum + (parseFloat(m.stundenlohn) || 0) * (parseFloat(m.stunden) || 0), 0),
    [mitarbeiterList]
  );
  const totalMaterial = useMemo(() =>
    materialienList.reduce((sum, m) => sum + (parseFloat(m.preis) || 0) * (parseFloat(m.menge) || 0), 0),
    [materialienList]
  );
  const totalSonstige = useMemo(() =>
    sonstigeKosten.reduce((sum, s) => sum + (parseFloat(s.betrag) || 0), 0),
    [sonstigeKosten]
  );
  const gesamt = totalMitarbeiter + totalMaterial + totalSonstige;
  const margeNum = parseFloat(gewinnmarge) || 0;
  const endpreis = gesamt * (1 + margeNum / 100);

  const resetForm = () => {
    setSelectedCustomerId(null);
    setSelectedEmployeeIds([]);
    setProjekt('');
    setMitarbeiterStunden({});
    setMaterialienList([{ id: Date.now() + 1, name: '', preis: '', menge: '' }]);
    setSonstigeKosten([{ id: Date.now() + 2, name: '', betrag: '' }]);
    setGewinnmarge('');
    setShowPdfPreview(false);
    setPreviewHtml('');
    setCurrentEstimateNumber('');
  };

  const handleShowPreview = async () => {
    if (!selectedCustomer?.name) return;
    if (!projekt || projekt.trim() === '') return;
    if (!mitarbeiterList || mitarbeiterList.length === 0) return;
    let cd = companyData;
    if (companyId && !cd) {
      const snap = await getDoc(doc(db, 'companies', companyId));
      if (snap.exists()) { cd = snap.data(); setCompanyData(cd); }
    }
    const estNum = generateEstimateNumber();
    setCurrentEstimateNumber(estNum);
    const html = generateEstimateHTML({
      kunde: selectedCustomer?.name || '', projekt, mitarbeiterList, materialienList,
      sonstigeKosten, gewinnmarge, companyData: cd, estimateNumber: estNum,
    }, invoiceTemplate || {});
    setPreviewHtml(html);
    setShowPdfPreview(true);
  };

  const handleSaveEstimate = async () => {
    if (!companyId) return;
    if (!selectedCustomerId) return;
    if (!projekt || projekt.trim() === '') return;
    if (!mitarbeiterList || mitarbeiterList.length === 0) return;
    setSaving(true);
    try {
      const estNum = currentEstimateNumber || generateEstimateNumber();
      await addDoc(collection(db, 'estimates'), {
        companyId,
        customerId: selectedCustomerId,
        customerName: selectedCustomer?.name || '',
        project: projekt.trim(),
        mitarbeiterList: mitarbeiterList.map((m: any) => ({ name: m.name, stundenlohn: parseFloat(m.stundenlohn) || 0, stunden: parseFloat(m.stunden) || 0 })),
        materialienList: materialienList.filter(m => m.name).map(m => ({ name: m.name, preis: parseFloat(m.preis) || 0, menge: parseFloat(m.menge) || 0 })),
        sonstigeKosten: sonstigeKosten.filter(s => s.name).map(s => ({ name: s.name, betrag: parseFloat(s.betrag) || 0 })),
        gewinnmarge: margeNum,
        estimateNumber: estNum,
        status: 'entwurf' as EstimateStatus,
        totalNet: gesamt,
        totalGross: endpreis,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      resetForm();
      // Refresh list
      const q = query(
        collection(db, 'estimates'),
        where('companyId', '==', companyId)
      );
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a: any, b: any) => {
        const at = a.createdAt?.seconds || new Date(a.createdAt || 0).getTime();
        const bt = b.createdAt?.seconds || new Date(b.createdAt || 0).getTime();
        return bt - at;
      });
      setEstimates(list);
      setTab('history');
    } catch (e) {
      console.error('Fehler beim Speichern:', e);
    } finally {
      setSaving(false);
    }
  };

  const updateEstimateStatus = async (id: string, status: EstimateStatus) => {
    try {
      await updateDoc(doc(db, 'estimates', id), { status, updatedAt: new Date().toISOString() });
      setEstimates(prev => prev.map(e => e.id === id ? { ...e, status } : e));
    } catch (e) {
      console.error('Fehler beim Status-Update:', e);
    }
  };

  const convertToInvoice = async (est: any) => {
    if (!companyId || !companyData) return;
    try {
      const invoiceNumber = `INV-${new Date().getFullYear()}.${String(new Date().getMonth() + 1).padStart(2, '0')}.${String(new Date().getDate()).padStart(2, '0')}.${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;

      const positionen: any[] = [];
      (est.mitarbeiterList || []).forEach((m: any, i: number) => {
        positionen.push({
          pos: i + 1, type: 'mitarbeiter', name: m.name,
          menge: parseFloat(m.stunden) || 0, einheit: 'Std.',
          einzelpreis: parseFloat(m.stundenlohn) || 0,
          gesamt: (parseFloat(m.stundenlohn) || 0) * (parseFloat(m.stunden) || 0),
        });
      });
      (est.materialienList || []).forEach((m: any, i: number) => {
        positionen.push({
          pos: positionen.length + 1, type: 'material', name: m.name,
          menge: parseFloat(m.menge) || 0, einheit: 'Stk.',
          einzelpreis: parseFloat(m.preis) || 0,
          gesamt: (parseFloat(m.preis) || 0) * (parseFloat(m.menge) || 0),
        });
      });
      (est.sonstigeKosten || []).forEach((s: any, i: number) => {
        positionen.push({
          pos: positionen.length + 1, type: 'sonstige', name: s.name,
          menge: 1, einheit: '-',
          einzelpreis: parseFloat(s.betrag) || 0,
          gesamt: parseFloat(s.betrag) || 0,
        });
      });

      const netAmount = positionen.reduce((s: number, p: any) => s + p.gesamt, 0);
      const margeFactor = 1 + (parseFloat(est.gewinnmarge) || 0) / 100;
      const grossAmount = netAmount * margeFactor;

      const invoiceData = {
        companyId,
        customerId: est.customerId || '',
        customerName: est.customerName || '',
        estimateId: est.id,
        estimateNumber: est.estimateNumber,
        invoiceNumber,
        status: 'offen',
        positions: positionen,
        gewinnmarge: parseFloat(est.gewinnmarge) || 0,
        netAmount: netAmount * margeFactor,
        taxAmount: 0,
        grossAmount,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const invoiceRef = await addDoc(collection(db, 'invoices'), invoiceData);

      await updateDoc(doc(db, 'estimates', est.id), {
        status: 'rechnung_erstellt',
        invoiceId: invoiceRef.id,
        invoiceNumber,
        updatedAt: new Date().toISOString(),
      });

      setEstimates(prev => prev.map(e =>
        e.id === est.id ? { ...e, status: 'rechnung_erstellt', invoiceId: invoiceRef.id, invoiceNumber } : e
      ));

      // Generate and download invoice PDF
      const cd = companyData;
      let tmpl = invoiceTemplate;
      if (companyId && !tmpl) {
        const snap = await getDoc(doc(db, 'companies', companyId, 'settings', 'invoice'));
        if (snap.exists()) tmpl = snap.data();
      }
      const html = generateInvoiceHTML({
        id: invoiceRef.id,
        kunde: est.customerName,
        projekt: est.project,
        datum: new Date().toLocaleDateString('de-DE'),
        stunden: '0', stundenlohn: '0',
        umsatz: String(grossAmount),
        mitarbeiter: (est.mitarbeiterList || []).map((m: any) => m.name).join(', '),
      }, {
        companyName: cd?.companyName || 'Mein Unternehmen',
        companyOwner: cd?.owner || '',
        companyAddress: [cd?.street, cd?.zip, cd?.city].filter(Boolean).join(' '),
        companyPhone: cd?.phone || '',
        companyEmail: cd?.email || '',
        companyFax: '',
        companyWeb: cd?.website || '',
        companyTaxId: cd?.taxId || '',
        companyBankName: cd?.bankName || '',
        companyIban: cd?.iban || '',
        companyBic: cd?.bic || '',
      }, tmpl || {});

      downloadPDF(html, `Rechnung_${invoiceNumber}.html`);
    } catch (e) {
      console.error('Fehler bei Rechnungserstellung:', e);
    }
  };

  const deleteEstimate = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'estimates', id));
      setEstimates(prev => prev.filter(e => e.id !== id));
    } catch (e) {
      console.error('Fehler beim Löschen:', e);
    }
  };

  if (loading || !user) return null;

  const inputCls = 'w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100/50 transition-all shadow-sm';

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="px-8 py-8 max-w-5xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between animate-fadeIn">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Kostenvoranschläge</h1>
              <p className="text-slate-500 text-sm mt-1">{estimates.length} gesamt</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-white rounded-2xl border border-slate-200 shadow-sm p-1 animate-slideUp">
            {(['new', 'history'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-[0.97] ${
                  tab === t ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-lg shadow-teal-200/50' : 'text-slate-500 hover:text-slate-700'
                }`}>
                {t === 'new' ? '✏️ Neu erstellen' : '📋 Verlauf'}
              </button>
            ))}
          </div>

          {tab === 'new' ? (
            <>
              {/* Section 1: Projektdaten */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-slideUp">
                <div className="px-6 py-4 bg-gradient-to-r from-teal-50 to-emerald-50 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-600 to-emerald-500 flex items-center justify-center text-white text-sm font-bold shadow-sm">1</div>
                    <h2 className="text-lg font-bold text-slate-900">Projektdaten</h2>
                  </div>
                </div>
                <div className="p-6 space-y-5">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-3">Kunde auswählen</label>
                    {customers.length === 0 ? (
                      <p className="text-sm text-slate-400">Keine Kunden angelegt.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {customers.map(c => {
                          const sel = selectedCustomerId === c.id;
                          return (
                            <button key={c.id} type="button" onClick={() => setSelectedCustomerId(sel ? null : c.id)}
                              className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all active:scale-[0.98] ${
                                sel ? 'bg-gradient-to-br from-teal-50 to-emerald-50 border-teal-300 shadow-sm' : 'bg-white border-slate-200 hover:border-teal-200 hover:shadow-sm'
                              }`}>
                              {c.imageUrl?.startsWith('https://') || c.imageUrl?.startsWith('data:image/') ? (
                                <img src={c.imageUrl} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0 shadow-sm" />
                              ) : (
                                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm"
                                  style={{ backgroundColor: PALETTE[(c.name || 'X').charCodeAt(0) % PALETTE.length] }}>
                                  {(c.name || '?').charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-slate-800 truncate">{c.name}</p>
                                {c.email && <p className="text-xs text-slate-400 truncate">{c.email}</p>}
                              </div>
                              {sel && <span className="ml-auto text-teal-600 text-lg font-bold animate-scaleIn">✓</span>}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {selectedCustomer && (
                      <div className="mt-3 p-4 rounded-xl bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 animate-slideUp">
                        <p className="text-sm font-bold text-green-800">{selectedCustomer.name}</p>
                        <div className="flex gap-4 text-xs text-green-700 mt-1">
                          {selectedCustomer.email && <span>✉️ {selectedCustomer.email}</span>}
                          {selectedCustomer.telefon && <span>📞 {selectedCustomer.telefon}</span>}
                        </div>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1.5">Projektname</label>
                    <input value={projekt} onChange={e => setProjekt(e.target.value)} placeholder="z.B. Badrenovierung Müller" className={inputCls} />
                  </div>
                </div>
              </div>

              {/* Section 2: Personal */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-slideUp">
                <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-500 flex items-center justify-center text-white text-sm font-bold shadow-sm">2</div>
                    <h2 className="text-lg font-bold text-slate-900">Personal</h2>
                  </div>
                </div>
                <div className="p-6 space-y-5">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-3">Mitarbeiter auswählen</label>
                    {employees.length === 0 ? (
                      <p className="text-sm text-slate-400">Keine Mitarbeiter angelegt.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {employees.map(emp => {
                          const sel = selectedEmployeeIds.includes(emp.id);
                          return (
                            <button key={emp.id} type="button" onClick={() => toggleEmployee(emp.id)}
                              className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all active:scale-[0.98] ${
                                sel ? 'bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-300 shadow-sm' : 'bg-white border-slate-200 hover:border-blue-200 hover:shadow-sm'
                              }`}>
                              {emp.imageUrl?.startsWith('https://') ? (
                                <img src={emp.imageUrl} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0 shadow-sm" />
                              ) : (
                                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm"
                                  style={{ backgroundColor: PALETTE[(emp.name || 'X').charCodeAt(0) % PALETTE.length] }}>
                                  {(emp.name || '?').charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-bold text-slate-800 truncate">{emp.name}</p>
                                <p className="text-xs text-slate-400">€{emp.stundenlohn}/Std.</p>
                              </div>
                              {sel && <span className="ml-auto text-blue-600 text-lg font-bold animate-scaleIn">✓</span>}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {mitarbeiterList.length > 0 && (
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-3">Stunden pro Mitarbeiter</label>
                      <div className="space-y-2">
                        {mitarbeiterList.map((m: any) => (
                          <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-br from-slate-50 to-white border border-slate-200 shadow-sm">
                            <span className="text-sm font-bold text-slate-700 min-w-[120px]">{m.name}</span>
                            <span className="text-xs text-slate-400">{m.stundenlohn} €/Std.</span>
                            <input type="number" step="0.5" min="0" value={mitarbeiterStunden[m.id] || ''}
                              onChange={e => setMitarbeiterStunden(prev => ({ ...prev, [m.id]: e.target.value }))}
                              placeholder="Stunden" className="w-24 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 ml-auto transition-all" />
                            {(parseFloat(m.stundenlohn) || 0) * (parseFloat(m.stunden) || 0) > 0 && (
                              <span className="text-sm font-bold text-teal-600 min-w-[80px] text-right">
                                {fmt((parseFloat(m.stundenlohn) || 0) * (parseFloat(m.stunden) || 0))} €
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                      {totalMitarbeiter > 0 && (
                        <div className="mt-3 p-4 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 flex justify-between items-center">
                          <span className="text-sm font-bold text-blue-700">Personal gesamt</span>
                          <span className="text-xl font-black text-slate-800">{fmt(totalMitarbeiter)} €</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Section 3: Materialien */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-slideUp">
                <div className="px-6 py-4 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-600 to-orange-500 flex items-center justify-center text-white text-sm font-bold shadow-sm">3</div>
                    <h2 className="text-lg font-bold text-slate-900">Materialien</h2>
                  </div>
                </div>
                <div className="p-6 space-y-3">
                  {materialienList.map((m, idx) => (
                    <div key={m.id} className="flex items-center gap-2">
                      <input value={m.name} onChange={e => { const nl = [...materialienList]; nl[idx] = { ...nl[idx], name: e.target.value }; setMaterialienList(nl); }}
                        placeholder="Materialname" className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-amber-500 transition-all shadow-sm" />
                      <input type="number" step="0.01" min="0" value={m.preis} onChange={e => { const nl = [...materialienList]; nl[idx] = { ...nl[idx], preis: e.target.value }; setMaterialienList(nl); }}
                        placeholder="Preis" className="w-24 px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-amber-500 transition-all shadow-sm" />
                      <input type="number" step="1" min="0" value={m.menge} onChange={e => { const nl = [...materialienList]; nl[idx] = { ...nl[idx], menge: e.target.value }; setMaterialienList(nl); }}
                        placeholder="Menge" className="w-20 px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-amber-500 transition-all shadow-sm" />
                      <span className="text-sm font-bold text-slate-600 min-w-[70px] text-right">{fmt((parseFloat(m.preis) || 0) * (parseFloat(m.menge) || 0))} €</span>
                      <button onClick={() => materialienList.length > 1 && setMaterialienList(prev => prev.filter((_, i) => i !== idx))}
                        className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 active:scale-[0.9] rounded-lg transition-all">✕</button>
                    </div>
                  ))}
                  <button onClick={() => setMaterialienList(prev => [...prev, { id: Date.now(), name: '', preis: '', menge: '' }])}
                    className="text-sm text-amber-600 hover:text-amber-700 font-bold active:scale-[0.97] transition-all">+ Material hinzufügen</button>
                  {totalMaterial > 0 && (
                    <div className="p-4 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 flex justify-between items-center">
                      <span className="text-sm font-bold text-amber-700">Material gesamt</span>
                      <span className="text-xl font-black text-slate-800">{fmt(totalMaterial)} €</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Section 4: Sonstige Kosten */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-slideUp">
                <div className="px-6 py-4 bg-gradient-to-r from-purple-50 to-violet-50 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-600 to-violet-500 flex items-center justify-center text-white text-sm font-bold shadow-sm">4</div>
                    <h2 className="text-lg font-bold text-slate-900">Sonstige Kosten</h2>
                  </div>
                </div>
                <div className="p-6 space-y-3">
                  {sonstigeKosten.map((s, idx) => (
                    <div key={s.id} className="flex items-center gap-2">
                      <input value={s.name} onChange={e => { const nl = [...sonstigeKosten]; nl[idx] = { ...nl[idx], name: e.target.value }; setSonstigeKosten(nl); }}
                        placeholder="Bezeichnung" className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-purple-500 transition-all shadow-sm" />
                      <input type="number" step="0.01" min="0" value={s.betrag} onChange={e => { const nl = [...sonstigeKosten]; nl[idx] = { ...nl[idx], betrag: e.target.value }; setSonstigeKosten(nl); }}
                        placeholder="Betrag" className="w-28 px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-purple-500 transition-all shadow-sm" />
                      <span className="text-sm font-bold text-slate-600 min-w-[70px] text-right">{fmt(parseFloat(s.betrag) || 0)} €</span>
                      <button onClick={() => sonstigeKosten.length > 1 && setSonstigeKosten(prev => prev.filter((_, i) => i !== idx))}
                        className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 active:scale-[0.9] rounded-lg transition-all">✕</button>
                    </div>
                  ))}
                  <button onClick={() => setSonstigeKosten(prev => [...prev, { id: Date.now(), name: '', betrag: '' }])}
                    className="text-sm text-purple-600 hover:text-purple-700 font-bold active:scale-[0.97] transition-all">+ Weitere Kosten</button>
                  {totalSonstige > 0 && (
                    <div className="p-4 rounded-xl bg-gradient-to-br from-purple-50 to-violet-50 border border-purple-200 flex justify-between items-center">
                      <span className="text-sm font-bold text-purple-700">Sonstige gesamt</span>
                      <span className="text-xl font-black text-slate-800">{fmt(totalSonstige)} €</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Section 5: Zusammenfassung */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-slideUp">
                <div className="px-6 py-4 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-700 to-slate-600 flex items-center justify-center text-white text-sm font-bold shadow-sm">5</div>
                    <h2 className="text-lg font-bold text-slate-900">Zusammenfassung</h2>
                  </div>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1.5">Gewinnmarge (%)</label>
                    <input type="number" step="0.1" min="0" value={gewinnmarge} onChange={e => setGewinnmarge(e.target.value)}
                      placeholder="z.B. 20" className="w-32 px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100/50 transition-all shadow-sm" />
                  </div>

                  <div className="bg-gradient-to-br from-slate-50 to-white rounded-2xl p-5 space-y-3 border border-slate-200 shadow-sm">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500 font-medium">Personal</span>
                      <span className="font-bold text-slate-800">{fmt(totalMitarbeiter)} €</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500 font-medium">Materialien</span>
                      <span className="font-bold text-slate-800">{fmt(totalMaterial)} €</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500 font-medium">Sonstige Kosten</span>
                      <span className="font-bold text-slate-800">{fmt(totalSonstige)} €</span>
                    </div>
                    <div className="border-t border-slate-200 pt-2 flex justify-between text-sm">
                      <span className="text-slate-500 font-medium">Summe Netto</span>
                      <span className="font-bold text-slate-800">{fmt(gesamt)} €</span>
                    </div>
                    {margeNum > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500 font-medium">Aufschlag {margeNum}%</span>
                        <span className="font-bold text-slate-800">{fmt(gesamt * margeNum / 100)} €</span>
                      </div>
                    )}
                    <div className="border-t-2 border-teal-200 pt-2 flex justify-between">
                      <span className="text-base font-black text-slate-900">Endsumme</span>
                      <span className="text-xl font-black text-teal-700">{fmt(endpreis)} €</span>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button onClick={handleShowPreview}
                      className="flex-1 py-3 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 hover:shadow-xl hover:shadow-teal-200/50 active:scale-[0.97] text-white font-black rounded-xl transition-all text-sm shadow-lg">
                      Vorschau
                    </button>
                    <button onClick={handleSaveEstimate} disabled={saving}
                      className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 hover:shadow-xl hover:shadow-blue-200/50 active:scale-[0.97] text-white font-black rounded-xl transition-all text-sm shadow-lg disabled:opacity-50">
                      {saving ? 'Speichert...' : 'Speichern'}
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Search */}
              <div className="animate-slideUp">
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Suche nach Kunde, Projekt oder Nr..."
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100/50 transition-all shadow-sm" />
              </div>

              {/* History List */}
              <div className="space-y-3 animate-slideUp">
                {estimatesLoading ? (
                  <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center shadow-sm">
                    <p className="text-slate-400">Lade Kostenvoranschläge...</p>
                  </div>
                ) : filteredEstimates.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center shadow-sm">
                    <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                    </div>
                    <p className="text-slate-500 text-base mb-1">Keine Kostenvoranschläge</p>
                    <p className="text-slate-400 text-sm">Erstelle deinen ersten Kostenvoranschlag unter „Neu erstellen".</p>
                  </div>
                ) : (
                  filteredEstimates.map((est: any, i: number) => {
                    const status = (est.status || 'entwurf') as EstimateStatus;
                    const colors = STATUS_COLORS[status];
                    return (
                      <div key={est.id}
                        className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 overflow-hidden animate-slideUp"
                        style={{ animationDelay: `${i * 40}ms` }}>
                        <div className="p-5">
                          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-3 mb-2">
                                <h3 className="text-base font-bold text-slate-900 truncate">{est.project || 'Unbenannt'}</h3>
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold"
                                  style={{ backgroundColor: colors.bg, color: colors.text }}>
                                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: colors.dot }} />
                                  {STATUS_LABELS[status]}
                                </span>
                                {est.invoiceNumber && (
                                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold bg-teal-50 text-teal-700">
                                    🧾 {est.invoiceNumber}
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                                <span className="text-slate-500 font-medium">{est.customerName || 'Kein Kunde'}</span>
                                <span className="text-slate-300">|</span>
                                <span className="text-slate-500">{est.estimateNumber}</span>
                                <span className="text-slate-300">|</span>
                                <span className="text-slate-500">{est.createdAt ? new Date(est.createdAt).toLocaleDateString('de-DE') : '–'}</span>
                                <span className="text-slate-300">|</span>
                                <span className="text-teal-700 font-bold">{fmt(est.totalGross || 0)} €</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0 flex-wrap">
                              {/* Status actions */}
                              {status === 'entwurf' && (
                                <>
                                  <button onClick={() => updateEstimateStatus(est.id, 'gesendet')}
                                    className="px-3 py-2 rounded-xl text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 active:scale-[0.95] transition-all">
                                    Als gesendet
                                  </button>
                                  <button onClick={() => convertToInvoice(est)}
                                    className="px-3 py-2 rounded-xl text-xs font-bold text-teal-700 bg-teal-50 border border-teal-200 hover:bg-teal-100 active:scale-[0.95] transition-all">
                                    In Rechnung
                                  </button>
                                </>
                              )}
                              {status === 'gesendet' && (
                                <>
                                  <button onClick={() => updateEstimateStatus(est.id, 'angenommen')}
                                    className="px-3 py-2 rounded-xl text-xs font-bold text-green-700 bg-green-50 border border-green-200 hover:bg-green-100 active:scale-[0.95] transition-all">
                                    Angenommen
                                  </button>
                                  <button onClick={() => updateEstimateStatus(est.id, 'abgelehnt')}
                                    className="px-3 py-2 rounded-xl text-xs font-bold text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 active:scale-[0.95] transition-all">
                                    Abgelehnt
                                  </button>
                                  <button onClick={() => convertToInvoice(est)}
                                    className="px-3 py-2 rounded-xl text-xs font-bold text-teal-700 bg-teal-50 border border-teal-200 hover:bg-teal-100 active:scale-[0.95] transition-all">
                                    In Rechnung
                                  </button>
                                </>
                              )}
                              {status === 'angenommen' && (
                                <button onClick={() => convertToInvoice(est)}
                                  className="px-3 py-2 rounded-xl text-xs font-bold text-teal-700 bg-teal-50 border border-teal-200 hover:bg-teal-100 active:scale-[0.95] transition-all">
                                  🧾 Rechnung erstellen
                                </button>
                              )}
                              {status === 'rechnung_erstellt' && (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-teal-700 bg-teal-50 border border-teal-200">
                                  ✓ Rechnung erstellt
                                </span>
                              )}
                              {/* Re-generate PDF */}
                              <button onClick={async () => {
                                let cd = companyData;
                                if (companyId && !cd) {
                                  const snap = await getDoc(doc(db, 'companies', companyId));
                                  if (snap.exists()) cd = snap.data();
                                }
                                let tmpl = invoiceTemplate;
                                if (companyId && !tmpl) {
                                  const snap = await getDoc(doc(db, 'companies', companyId, 'settings', 'invoice'));
                                  if (snap.exists()) tmpl = snap.data();
                                }
                                const ml = (est.mitarbeiterList || []).map((m: any) => ({
                                  name: m.name, stundenlohn: String(m.stundenlohn || 0), stunden: String(m.stunden || 0)
                                }));
                                const matl = (est.materialienList || []).map((m: any) => ({
                                  id: Date.now(), name: m.name, preis: String(m.preis || 0), menge: String(m.menge || 0)
                                }));
                                const sk = (est.sonstigeKosten || []).map((s: any) => ({
                                  id: Date.now(), name: s.name, betrag: String(s.betrag || 0)
                                }));
                                const html = generateEstimateHTML({
                                  kunde: est.customerName || '', projekt: est.project || '',
                                  mitarbeiterList: ml, materialienList: matl, sonstigeKosten: sk,
                                  gewinnmarge: String(est.gewinnmarge || 0),
                                  companyData: cd, estimateNumber: est.estimateNumber,
                                }, tmpl || {});
                                downloadPDF(html, `Kostenvoranschlag_${est.estimateNumber}.html`);
                              }}
                                className="px-3 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-50 border border-slate-200 hover:bg-slate-100 active:scale-[0.95] transition-all">
                                PDF
                              </button>
                              <button onClick={() => deleteEstimate(est.id)}
                                className="px-3 py-2 rounded-xl text-xs font-bold text-red-400 bg-red-50 border border-red-200 hover:bg-red-100 active:scale-[0.95] transition-all">
                                Löschen
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      </main>

      {showPdfPreview && previewHtml && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col animate-scaleIn">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Kostenvoranschlag Vorschau</h3>
                <p className="text-sm text-slate-400">{currentEstimateNumber}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { handleSaveEstimate(); setShowPdfPreview(false); }}
                  className="px-4 py-2 text-sm font-bold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 hover:shadow-lg active:scale-[0.97] text-white rounded-xl transition-all shadow-md">
                  Speichern
                </button>
                <button onClick={() => downloadPDF(previewHtml, `Kostenvoranschlag_${currentEstimateNumber}.html`)}
                  className="px-4 py-2 text-sm font-bold bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 hover:shadow-lg active:scale-[0.97] text-white rounded-xl transition-all shadow-md">
                  PDF Speichern
                </button>
                <button onClick={() => { setShowPdfPreview(false); setPreviewHtml(''); }}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 active:scale-[0.97] rounded-xl transition-all">
                  Schließen
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-slate-100 p-4">
              <iframe srcDoc={previewHtml} className="w-full h-full bg-white rounded-xl shadow-md" style={{ minHeight: '70vh' }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
