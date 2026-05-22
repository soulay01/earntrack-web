'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';
import { generateEstimateHTML, generateEstimateNumber, fmt } from '@/lib/estimateUtils';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

function downloadFile(content: string, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName; a.click();
  URL.revokeObjectURL(url);
}

const AVATAR_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899'];

export default function EstimatesPage() {
  const { user, loading, employees, customers, companyId, company } = useData();
  const router = useRouter();
  const [companyData, setCompanyData] = useState<any>(null);

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

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [user, loading, router]);

  useEffect(() => {
    if (companyId) {
      getDoc(doc(db, 'companies', companyId)).then(snap => {
        if (snap.exists()) setCompanyData(snap.data());
      });
    }
  }, [companyId]);

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
    });
    setPreviewHtml(html);
    setShowPdfPreview(true);
  };

  if (loading || !user) return null;

  const inputCls = 'w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all';

  return (
    <div className="flex h-screen bg-slate-100">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="px-8 py-8 max-w-4xl mx-auto space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between animate-fadeIn">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Kostenvoranschlag</h1>
              <p className="text-slate-500 text-sm mt-1">Neuen Kostenvoranschlag erstellen</p>
            </div>
            <button onClick={handleShowPreview}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-medium rounded-lg transition-all text-sm shadow-sm">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              Vorschau
            </button>
          </div>

          {/* Section 1: Projektdaten */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-slideUp">
            <div className="px-6 py-4 bg-gradient-to-r from-teal-50 to-emerald-50 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-teal-600 flex items-center justify-center text-white text-sm font-bold">1</div>
                <h2 className="text-lg font-semibold text-slate-900">Projektdaten</h2>
              </div>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-3">Kunde auswählen</label>
                {customers.length === 0 ? (
                  <p className="text-sm text-slate-400">Keine Kunden angelegt.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {customers.map(c => {
                      const sel = selectedCustomerId === c.id;
                      return (
                        <button key={c.id} type="button" onClick={() => setSelectedCustomerId(sel ? null : c.id)}
                          className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-all ${
                            sel ? 'bg-teal-50 border-teal-300' : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                          }`}>
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
                            style={{ backgroundColor: AVATAR_COLORS[(c.name || 'X').charCodeAt(0) % AVATAR_COLORS.length] }}>
                            {(c.name || '?').charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate">{c.name}</p>
                            {c.email && <p className="text-xs text-slate-400 truncate">{c.email}</p>}
                          </div>
                          {sel && <span className="ml-auto text-teal-600 text-lg font-bold">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
                {selectedCustomer && (
                  <div className="mt-3 p-3 rounded-lg bg-green-50 border border-green-200">
                    <p className="text-sm font-medium text-green-800">{selectedCustomer.name}</p>
                    <div className="flex gap-4 text-xs text-green-700 mt-1">
                      {selectedCustomer.email && <span>✉️ {selectedCustomer.email}</span>}
                      {selectedCustomer.telefon && <span>📞 {selectedCustomer.telefon}</span>}
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Projektname</label>
                <input value={projekt} onChange={e => setProjekt(e.target.value)} placeholder="z.B. Badrenovierung Müller" className={inputCls} />
              </div>
            </div>
          </div>

          {/* Section 2: Personal */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-slideUp">
            <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white text-sm font-bold">2</div>
                <h2 className="text-lg font-semibold text-slate-900">Personal</h2>
              </div>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-3">Mitarbeiter auswählen</label>
                {employees.length === 0 ? (
                  <p className="text-sm text-slate-400">Keine Mitarbeiter angelegt.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {employees.map(emp => {
                      const sel = selectedEmployeeIds.includes(emp.id);
                      return (
                        <button key={emp.id} type="button" onClick={() => toggleEmployee(emp.id)}
                          className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-all ${
                            sel ? 'bg-blue-50 border-blue-300' : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                          }`}>
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
                            style={{ backgroundColor: AVATAR_COLORS[(emp.name || 'X').charCodeAt(0) % AVATAR_COLORS.length] }}>
                            {(emp.name || '?').charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-slate-800 truncate">{emp.name}</p>
                            <p className="text-xs text-slate-400">€{emp.stundenlohn}/Std.</p>
                          </div>
                          {sel && <span className="ml-auto text-blue-600 text-lg font-bold">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {mitarbeiterList.length > 0 && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-3">Stunden pro Mitarbeiter</label>
                  <div className="space-y-2">
                    {mitarbeiterList.map((m: any) => (
                      <div key={m.id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
                        <span className="text-sm font-medium text-slate-700 min-w-[120px]">{m.name}</span>
                        <span className="text-xs text-slate-400">{m.stundenlohn} €/Std.</span>
                        <input type="number" step="0.5" min="0" value={mitarbeiterStunden[m.id] || ''}
                          onChange={e => setMitarbeiterStunden(prev => ({ ...prev, [m.id]: e.target.value }))}
                          placeholder="Stunden" className="w-24 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 ml-auto" />
                        {(parseFloat(m.stundenlohn) || 0) * (parseFloat(m.stunden) || 0) > 0 && (
                          <span className="text-sm font-semibold text-teal-600 min-w-[80px] text-right">
                            {fmt((parseFloat(m.stundenlohn) || 0) * (parseFloat(m.stunden) || 0))} €
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                  {totalMitarbeiter > 0 && (
                    <div className="mt-3 p-3 rounded-lg bg-blue-50 border border-blue-200 flex justify-between items-center">
                      <span className="text-sm font-medium text-blue-700">Personal gesamt</span>
                      <span className="text-lg font-bold text-slate-800">{fmt(totalMitarbeiter)} €</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Section 3: Materialien */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-slideUp">
            <div className="px-6 py-4 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-600 flex items-center justify-center text-white text-sm font-bold">3</div>
                <h2 className="text-lg font-semibold text-slate-900">Materialien</h2>
              </div>
            </div>
            <div className="p-6 space-y-3">
              {materialienList.map((m, idx) => (
                <div key={m.id} className="flex items-center gap-2">
                  <input value={m.name} onChange={e => { const nl = [...materialienList]; nl[idx] = { ...nl[idx], name: e.target.value }; setMaterialienList(nl); }}
                    placeholder="Materialname" className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-amber-500" />
                  <input type="number" step="0.01" min="0" value={m.preis} onChange={e => { const nl = [...materialienList]; nl[idx] = { ...nl[idx], preis: e.target.value }; setMaterialienList(nl); }}
                    placeholder="Preis" className="w-24 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-amber-500" />
                  <input type="number" step="1" min="0" value={m.menge} onChange={e => { const nl = [...materialienList]; nl[idx] = { ...nl[idx], menge: e.target.value }; setMaterialienList(nl); }}
                    placeholder="Menge" className="w-20 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-amber-500" />
                  <span className="text-sm font-medium text-slate-600 min-w-[70px] text-right">{fmt((parseFloat(m.preis) || 0) * (parseFloat(m.menge) || 0))} €</span>
                  <button onClick={() => materialienList.length > 1 && setMaterialienList(prev => prev.filter((_, i) => i !== idx))}
                    className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all">✕</button>
                </div>
              ))}
              <button onClick={() => setMaterialienList(prev => [...prev, { id: Date.now(), name: '', preis: '', menge: '' }])}
                className="text-sm text-amber-600 hover:text-amber-700 font-medium transition-all">+ Material hinzufügen</button>
              {totalMaterial > 0 && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex justify-between items-center">
                  <span className="text-sm font-medium text-amber-700">Material gesamt</span>
                  <span className="text-lg font-bold text-slate-800">{fmt(totalMaterial)} €</span>
                </div>
              )}
            </div>
          </div>

          {/* Section 4: Sonstige Kosten */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-slideUp">
            <div className="px-6 py-4 bg-gradient-to-r from-purple-50 to-violet-50 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center text-white text-sm font-bold">4</div>
                <h2 className="text-lg font-semibold text-slate-900">Sonstige Kosten</h2>
              </div>
            </div>
            <div className="p-6 space-y-3">
              {sonstigeKosten.map((s, idx) => (
                <div key={s.id} className="flex items-center gap-2">
                  <input value={s.name} onChange={e => { const nl = [...sonstigeKosten]; nl[idx] = { ...nl[idx], name: e.target.value }; setSonstigeKosten(nl); }}
                    placeholder="Bezeichnung" className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-purple-500" />
                  <input type="number" step="0.01" min="0" value={s.betrag} onChange={e => { const nl = [...sonstigeKosten]; nl[idx] = { ...nl[idx], betrag: e.target.value }; setSonstigeKosten(nl); }}
                    placeholder="Betrag" className="w-28 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-purple-500" />
                  <span className="text-sm font-medium text-slate-600 min-w-[70px] text-right">{fmt(parseFloat(s.betrag) || 0)} €</span>
                  <button onClick={() => sonstigeKosten.length > 1 && setSonstigeKosten(prev => prev.filter((_, i) => i !== idx))}
                    className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all">✕</button>
                </div>
              ))}
              <button onClick={() => setSonstigeKosten(prev => [...prev, { id: Date.now(), name: '', betrag: '' }])}
                className="text-sm text-purple-600 hover:text-purple-700 font-medium transition-all">+ Weitere Kosten</button>
              {totalSonstige > 0 && (
                <div className="p-3 rounded-lg bg-purple-50 border border-purple-200 flex justify-between items-center">
                  <span className="text-sm font-medium text-purple-700">Sonstige gesamt</span>
                  <span className="text-lg font-bold text-slate-800">{fmt(totalSonstige)} €</span>
                </div>
              )}
            </div>
          </div>

          {/* Section 5: Zusammenfassung */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-slideUp">
            <div className="px-6 py-4 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center text-white text-sm font-bold">5</div>
                <h2 className="text-lg font-semibold text-slate-900">Zusammenfassung</h2>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Gewinnmarge (%)</label>
                <input type="number" step="0.1" min="0" value={gewinnmarge} onChange={e => setGewinnmarge(e.target.value)}
                  placeholder="z.B. 20" className="w-32 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100" />
              </div>

              <div className="bg-slate-50 rounded-xl p-5 space-y-3 border border-slate-200">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Personal</span>
                  <span className="font-semibold text-slate-800">{fmt(totalMitarbeiter)} €</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Materialien</span>
                  <span className="font-semibold text-slate-800">{fmt(totalMaterial)} €</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Sonstige Kosten</span>
                  <span className="font-semibold text-slate-800">{fmt(totalSonstige)} €</span>
                </div>
                <div className="border-t border-slate-200 pt-2 flex justify-between text-sm">
                  <span className="text-slate-500">Summe Netto</span>
                  <span className="font-semibold text-slate-800">{fmt(gesamt)} €</span>
                </div>
                {margeNum > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Aufschlag {margeNum}%</span>
                    <span className="font-semibold text-slate-800">{fmt(gesamt * margeNum / 100)} €</span>
                  </div>
                )}
                <div className="border-t-2 border-slate-300 pt-2 flex justify-between">
                  <span className="text-base font-bold text-slate-900">Endsumme</span>
                  <span className="text-xl font-black text-teal-700">{fmt(endpreis)} €</span>
                </div>
              </div>

              <button onClick={handleShowPreview}
                className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-lg transition-all text-sm shadow-sm">
                Vorschau &amp; Export
              </button>
            </div>
          </div>
        </div>
      </main>

      {showPdfPreview && previewHtml && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col animate-scaleIn">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Kostenvoranschlag Vorschau</h3>
                <p className="text-sm text-slate-400">{currentEstimateNumber}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => downloadFile(previewHtml, `Kostenvoranschlag_${currentEstimateNumber}.html`, 'text/html')}
                  className="px-3 py-1.5 text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-all">
                  HTML Speichern
                </button>
                <button onClick={() => { setShowPdfPreview(false); setPreviewHtml(''); }}
                  className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-all">
                  Schließen
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-slate-100 p-4">
              <iframe srcDoc={previewHtml} className="w-full h-full bg-white rounded-lg shadow-sm" style={{ minHeight: '70vh' }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
