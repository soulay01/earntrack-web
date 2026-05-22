'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';
import { formatCurrency } from '@/lib/utils';
import { calculateAssignmentProfitScore, getGradeColor, getGradeBg } from '@/lib/smartPricing';
import { generateInvoiceHTML, generateCSVContent } from '@/lib/estimateUtils';
import { suggestTeam, getAvailableEmployeesWithScores } from '@/lib/teamOptimizer';
import { collection, addDoc, updateDoc, deleteDoc, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

function downloadFile(content: string, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName; a.click();
  URL.revokeObjectURL(url);
}

export default function AssignmentsPage() {
  const { user, loading, assignments: raw, customers, employees, companyId, company, refresh } = useData();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showInvoice, setShowInvoice] = useState<string | null>(null);
  const [invoiceHtml, setInvoiceHtml] = useState('');
  const [invoiceFileName, setInvoiceFileName] = useState('');
  const [teamSuggestion, setTeamSuggestion] = useState<any>(null);
  const [teamSize, setTeamSize] = useState(1);
  const [showTeamFor, setShowTeamFor] = useState<string | null>(null);

  const assignments = useMemo(() => {
    if (!search) return raw;
    const q = search.toLowerCase();
    return raw.filter(a => (a.projekt || '').toLowerCase().includes(q) || (a.kunde || '').toLowerCase().includes(q));
  }, [raw, search]);

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [user, loading, router]);
  if (loading || !user) return null;

  async function save(form: any) {
    if (!user || !companyId) return;
    setSaving(true);
    try {
      const data = { ...form, companyId, createdBy: user.uid, createdAt: serverTimestamp() };
      if (editing) { await updateDoc(doc(db, 'assignments', editing.id), data); }
      else { await addDoc(collection(db, 'assignments'), data); }
      setShowModal(false); setEditing(null); refresh();
    } finally { setSaving(false); }
  }

  async function remove(id: string) {
    await deleteDoc(doc(db, 'assignments', id));
    setDeleting(null); refresh();
  }

  async function handleInvoice(assignment: any) {
    try {
      let companyInfo: any = {};
      let invoiceTemplate: any = {};
      if (companyId) {
        const [compSnap, tmplSnap] = await Promise.all([
          getDoc(doc(db, 'companies', companyId)),
          getDoc(doc(db, 'companies', companyId, 'settings', 'invoice')),
        ]);
        if (compSnap.exists()) {
          const d = compSnap.data();
          companyInfo = {
            companyName: d.companyName || d.name || 'Mein Unternehmen',
            companyOwner: d.owner || '',
            companyAddress: [d.street, `${d.zip || ''} ${d.city || ''}`].filter(Boolean).join(', ') || 'Musterstr. 1',
            companyPhone: d.phone || '', companyEmail: d.email || '', companyWeb: d.website || '',
            companyTaxId: d.taxId || '', companyBankName: d.bankName || '', companyIban: d.iban || '', companyBic: d.bic || '',
          };
        }
        if (tmplSnap.exists()) invoiceTemplate = tmplSnap.data();
      }
      const html = generateInvoiceHTML(assignment, companyInfo, invoiceTemplate, true);
      const today = new Date();
      const num = `${invoiceTemplate.invoiceNumberPrefix || 'INV-'}${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}.${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
      setInvoiceHtml(html);
      setInvoiceFileName(`Rechnung_${num}.html`);
      setShowInvoice(assignment.id);
    } catch {}
  }

  function handleCSV(assignment: any) {
    (async () => {
      let companyInfo: any = {};
      let invoiceTemplate: any = {};
      if (companyId) {
        const [compSnap, tmplSnap] = await Promise.all([
          getDoc(doc(db, 'companies', companyId)),
          getDoc(doc(db, 'companies', companyId, 'settings', 'invoice')),
        ]);
        if (compSnap.exists()) {
          const d = compSnap.data();
          companyInfo = { companyName: d.companyName || d.name || 'Mein Unternehmen', companyAddress: [d.street, `${d.zip || ''} ${d.city || ''}`].filter(Boolean).join(', '), companyPhone: d.phone || '', companyEmail: d.email || '', companyTaxId: d.taxId || '' };
        }
        if (tmplSnap.exists()) invoiceTemplate = tmplSnap.data();
      }
      const csv = generateCSVContent(assignment, companyInfo, invoiceTemplate);
      const today = new Date();
      const num = `${invoiceTemplate.invoiceNumberPrefix || 'INV-'}${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
      downloadFile(csv, `Rechnung_${num}.csv`, 'text/csv;charset=utf-8');
    })();
  }

  function handleSuggestTeam(assignment: any) {
    const hours = parseFloat(String(assignment.stunden)) || 8;
    const rev = (() => { const u = assignment.umsatz; if (typeof u === 'number') return u; const raw = (u || '').replace(/[€\s]/g, '').trim(); if (!raw) return 0; if (raw.includes(',') && raw.includes('.')) return parseFloat(raw.replace(/\./g, '').replace(',', '.')) || 0; if (raw.includes(',') && !raw.includes('.')) return parseFloat(raw.replace(',', '.')) || 0; return parseFloat(raw) || 0; })();
    const dateStr = assignment.datum || new Date().toLocaleDateString('de-DE');
    const suggestion = suggestTeam(employees, dateStr, hours, rev, teamSize, raw, assignment.id);
    setTeamSuggestion(suggestion);
    setShowTeamFor(showTeamFor === assignment.id ? null : assignment.id);
  }

  return (
    <div className="flex h-screen bg-slate-100">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="px-8 py-8 max-w-5xl mx-auto">

          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6 animate-fadeIn">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Einsätze</h1>
              <p className="text-slate-500 text-sm mt-1">{raw.length} Einsätze</p>
            </div>
            <button onClick={() => { setEditing(null); setShowModal(true); }}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-medium rounded-lg transition-all text-sm shadow-sm">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Neuer Einsatz
            </button>
          </div>

          <div className="relative mb-5 animate-fadeIn">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" placeholder="Einsätze durchsuchen..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
          </div>

          <div className="space-y-3">
            {assignments.map((a, i) => {
              const ps = calculateAssignmentProfitScore(a);
              const rev = ps.revenue;
              const h = ps.hours;
              const rate = parseFloat(String(a.stundenlohn)) || 0;
              const cost = h * rate;
              const profit = rev - cost;
              const margin = rev > 0 ? (profit / rev) * 100 : 0;
              return (
                <div key={a.id}>
                  <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-all duration-200 animate-slideUp group" style={{ animationDelay: `${i * 40}ms` }}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-slate-900 font-semibold text-base truncate">{a.projekt || 'Unbenannt'}</p>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold border`}
                            style={{ color: ps.gradeColor, backgroundColor: ps.gradeBg, borderColor: ps.gradeColor + '33' }}>
                            {ps.grade}
                          </span>
                        </div>
                        <p className="text-slate-400 text-sm mt-0.5">
                          <span>{a.kunde}</span>
                          <span className="mx-1.5">&middot;</span>
                          <span>{a.datum}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => handleInvoice(a)} title="Rechnung (PDF)"
                          className="p-2 rounded-lg text-slate-300 hover:text-teal-600 hover:bg-teal-50 opacity-0 group-hover:opacity-100 transition-all">
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                        </button>
                        <button onClick={() => handleCSV(a)} title="CSV exportieren"
                          className="p-2 rounded-lg text-slate-300 hover:text-blue-600 hover:bg-blue-50 opacity-0 group-hover:opacity-100 transition-all">
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        </button>
                        <button onClick={() => handleSuggestTeam(a)} title="Team-Optimierung"
                          className="p-2 rounded-lg text-slate-300 hover:text-amber-600 hover:bg-amber-50 opacity-0 group-hover:opacity-100 transition-all">
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                        </button>
                        <button onClick={() => { setEditing(a); setShowModal(true); }}
                          className="p-2 rounded-lg text-slate-300 hover:text-slate-600 hover:bg-slate-100 opacity-0 group-hover:opacity-100 transition-all">
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button onClick={() => setDeleting(a.id)}
                          className="p-2 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all">
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                        </button>
                        <div className="text-right ml-2">
                          <p className="text-slate-900 font-bold text-lg">{formatCurrency(profit)}</p>
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium ${profit >= 0 ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                            {margin.toFixed(1)}% Marge
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-100 flex gap-6 text-sm text-slate-400">
                      <span><span className="font-medium text-slate-500">Umsatz</span> {formatCurrency(rev)}</span>
                      <span><span className="font-medium text-slate-500">Kosten</span> {formatCurrency(cost)}</span>
                      <span><span className="font-medium text-slate-500">Stunden</span> {h.toFixed(1)}h</span>
                      {Array.isArray(a.mitarbeiter) && a.mitarbeiter.length > 0 && (
                        <span className="truncate"><span className="font-medium text-slate-500">Mitarbeiter</span> {a.mitarbeiter.join(', ')}</span>
                      )}
                    </div>

                    {showTeamFor === a.id && teamSuggestion && (
                      <div className="mt-4 pt-4 border-t border-amber-100 bg-amber-50/50 -mx-5 -mb-5 px-5 pb-5 rounded-b-xl">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-sm font-semibold text-amber-800">Team-Optimierung</p>
                          <button onClick={() => setShowTeamFor(null)} className="text-xs text-amber-600 hover:text-amber-800">&times; Schließen</button>
                        </div>
                        {teamSuggestion.message && <p className="text-xs text-amber-600 mb-2">{teamSuggestion.message}</p>}
                        <div className="flex gap-2 mb-3">
                          {[1,2,3,4,5].map(s => (
                            <button key={s} onClick={() => setTeamSize(s)}
                              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${teamSize === s ? 'bg-amber-600 text-white' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'}`}>
                              {s}
                            </button>
                          ))}
                        </div>
                        {teamSuggestion.suggested.length > 0 && (
                          <div className="space-y-1.5">
                            {teamSuggestion.suggested.map((emp: any, idx: number) => (
                              <div key={emp.id || idx} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/70 border border-amber-100">
                                <span className="w-5 h-5 rounded-full bg-amber-600 text-white text-[10px] font-bold flex items-center justify-center">{idx + 1}</span>
                                <span className="text-sm font-medium text-slate-800">{emp.name}</span>
                                <span className="text-xs text-slate-400 ml-auto">{formatCurrency((parseFloat(emp.stundenlohn) || 0) * h)} Kosten</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="mt-3 flex gap-4 text-sm">
                          <span className="text-slate-500">Gesamtkosten: <strong className="text-slate-800">{formatCurrency(teamSuggestion.totalCost)}</strong></span>
                          <span className="text-slate-500">Geschätzter Gewinn: <strong className={teamSuggestion.estimatedProfit >= 0 ? 'text-green-600' : 'text-red-600'}>{formatCurrency(teamSuggestion.estimatedProfit)}</strong></span>
                        </div>
                      </div>
                    )}
                  </div>

                  {showInvoice === a.id && invoiceHtml && (
                    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 animate-fadeIn">
                      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col animate-scaleIn">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                          <h3 className="text-lg font-semibold text-slate-900">Rechnungsvorschau</h3>
                          <div className="flex gap-2">
                            <button onClick={() => downloadFile(invoiceHtml, invoiceFileName, 'text/html')}
                              className="px-3 py-1.5 text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-all">
                              HTML speichern
                            </button>
                            <button onClick={() => { setShowInvoice(null); setInvoiceHtml(''); }}
                              className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-all">
                              Schließen
                            </button>
                          </div>
                        </div>
                        <div className="flex-1 overflow-auto bg-slate-100 p-4">
                          <iframe srcDoc={invoiceHtml} className="w-full h-full bg-white rounded-lg shadow-sm" style={{ minHeight: '70vh' }} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {assignments.length === 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-16 text-center shadow-sm">
                <div className="w-14 h-14 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-7 h-7 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
                </div>
                <p className="text-slate-500 text-base mb-4">{search ? 'Keine Ergebnisse' : 'Noch keine Einsätze'}</p>
                {!search && (
                  <button onClick={() => { setEditing(null); setShowModal(true); }}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-medium rounded-lg transition-all text-sm">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Ersten Einsatz anlegen
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {showModal && (
        <AssignmentModal
          editing={editing}
          customers={customers}
          employees={employees}
          saving={saving}
          onSave={save}
          onClose={() => { setShowModal(false); setEditing(null); }}
        />
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 animate-fadeIn">
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6 w-full max-w-sm mx-4 animate-scaleIn">
            <h3 className="text-lg font-semibold text-slate-900">Einsatz löschen?</h3>
            <p className="text-slate-500 text-sm mt-2">Diese Aktion kann nicht rückgängig gemacht werden.</p>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setDeleting(null)} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-all">Abbrechen</button>
              <button onClick={() => remove(deleting)} className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-700 text-white transition-all shadow-sm">Löschen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AssignmentModal({ editing, customers, employees, saving, onSave, onClose }: any) {
  const [form, setForm] = useState({
    projekt: editing?.projekt || '',
    kunde: editing?.kunde || '',
    datum: editing?.datum || '',
    umsatz: editing?.umsatz?.toString() || '',
    stunden: editing?.stunden?.toString() || '',
    stundenlohn: editing?.stundenlohn?.toString() || '',
    mitarbeiter: Array.isArray(editing?.mitarbeiter) ? editing.mitarbeiter : [],
  });

  function update(field: string, value: any) {
    setForm((prev: any) => ({ ...prev, [field]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await onSave({
      projekt: form.projekt, kunde: form.kunde, datum: form.datum,
      umsatz: parseFloat(form.umsatz) || 0, stunden: parseFloat(form.stunden) || 0,
      stundenlohn: parseFloat(form.stundenlohn) || 0, mitarbeiter: form.mitarbeiter,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[5vh] pb-8 bg-black/30 overflow-y-auto animate-fadeIn">
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 w-full max-w-lg mx-4 animate-slideUp">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{editing ? 'Einsatz bearbeiten' : 'Neuer Einsatz'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Projekt</label>
              <input value={form.projekt} onChange={e => update('projekt', e.target.value)} required
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Kunde</label>
              <input value={form.kunde} onChange={e => update('kunde', e.target.value)} list="customers"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
              <datalist id="customers">{customers.map((c: any) => <option key={c.id} value={c.name} />)}</datalist>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Datum</label>
              <input type="date" value={form.datum} onChange={e => update('datum', e.target.value)} required
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Umsatz (€)</label>
              <input type="number" step="0.01" min="0" value={form.umsatz} onChange={e => update('umsatz', e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Stunden</label>
              <input type="number" step="0.5" min="0" value={form.stunden} onChange={e => update('stunden', e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Stundenlohn (€)</label>
              <input type="number" step="0.01" min="0" value={form.stundenlohn} onChange={e => update('stundenlohn', e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Mitarbeiter</label>
              <div className="flex flex-wrap gap-2">
                {employees.map((e: any) => {
                  const sel = form.mitarbeiter.includes(e.name);
                  return (
                    <button key={e.id} type="button" onClick={() => update('mitarbeiter', sel ? form.mitarbeiter.filter((n: string) => n !== e.name) : [...form.mitarbeiter, e.name])}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        sel ? 'bg-teal-50 text-teal-700 border-teal-200' : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'
                      }`}>
                      {e.name}
                    </button>
                  );
                })}
                {employees.length === 0 && <p className="text-xs text-slate-400">Keine Mitarbeiter vorhanden</p>}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
            <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-all">Abbrechen</button>
            <button type="submit" disabled={saving}
              className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-medium rounded-lg transition-all text-sm shadow-sm flex items-center gap-2">
              {saving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {editing ? 'Speichern' : 'Anlegen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
