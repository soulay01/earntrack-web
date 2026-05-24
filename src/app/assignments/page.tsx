'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';
import { formatCurrency } from '@/lib/utils';
import { calculateAssignmentProfitScore, getGrade, getGradeColor, getGradeBg } from '@/lib/smartPricing';
import { generateInvoiceHTML, generateCSVContent } from '@/lib/estimateUtils';
import { generateZugferdXML, generateZugferdFilename } from '@/lib/zugferd';
import TeamModal from '@/components/TeamModal';
import { collection, addDoc, updateDoc, deleteDoc, doc, getDoc, getDocs, query, where, serverTimestamp, QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const AVATAR_COLORS = ['#0d9488', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#10b981'];

function downloadFile(content: string, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName; a.click();
  URL.revokeObjectURL(url);
}

function colorFor(name: string) {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) % 0xFFFFFFFF;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
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
  const [invoiceXml, setInvoiceXml] = useState('');
  const [invoiceFileName, setInvoiceFileName] = useState('');
  const [invoiceNum, setInvoiceNum] = useState('');
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [teamModalAssignment, setTeamModalAssignment] = useState<any>(null);
  const [assignmentHours, setAssignmentHours] = useState<Record<string, number>>({});

  const assignments = useMemo(() => {
    if (!search) return raw;
    const q = search.toLowerCase();
    return raw.filter(a => (a.projekt || '').toLowerCase().includes(q) || (a.kunde || '').toLowerCase().includes(q));
  }, [raw, search]);

  useEffect(() => {
    if (!raw.length) return;
    const ids = raw.map(a => a.id);
    const hours: Record<string, number> = {};
    (async () => {
      const batches: any[] = [];
      for (let i = 0; i < ids.length; i += 10) {
        const batch = ids.slice(i, i + 10);
        batches.push(getDocs(query(collection(db, 'clock_entries'), where('assignmentId', 'in', batch))));
      }
      const results = await Promise.all(batches);
      results.forEach((snap: any) => snap.forEach((d: QueryDocumentSnapshot) => {
        const data = d.data();
        const aid = data.assignmentId;
        if (!aid) return;
        const ci = data.clockIn?.toDate ? data.clockIn.toDate() : new Date(data.clockIn);
        const co = data.clockOut?.toDate ? data.clockOut.toDate() : data.clockOut ? new Date(data.clockOut) : null;
        if (!co) return;
        const mins = Math.round((co.getTime() - ci.getTime()) / 60000) - (data.totalBreakMinutes || 0);
        hours[aid] = (hours[aid] || 0) + mins;
      }));
      setAssignmentHours(hours);
    })();
  }, [raw]);

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
    } catch (e) {
      alert('Fehler beim Speichern: ' + (e instanceof Error ? e.message : 'Unbekannter Fehler'));
    } finally { setSaving(false); }
  }

  async function remove(id: string) {
    await deleteDoc(doc(db, 'assignments', id));
    setDeleting(null); refresh();
  }

  async function handleInvoice(assignment: any) {
    try {
      let companyInfo: any = {};
      let companyRaw: any = {};
      let invoiceTemplate: any = {};
      if (companyId) {
        const [compSnap, tmplSnap] = await Promise.all([
          getDoc(doc(db, 'companies', companyId)),
          getDoc(doc(db, 'companies', companyId, 'settings', 'invoice')),
        ]);
        if (compSnap.exists()) {
          const d = compSnap.data();
          companyRaw = d;
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
      console.log('[handleInvoice] templateStyle:', invoiceTemplate.templateStyle, 'taxRate:', invoiceTemplate.taxRate, 'hasBankIban:', !!companyRaw.iban);
      const html = generateInvoiceHTML(assignment, companyInfo, invoiceTemplate, true);
      const today = new Date();
      const num = `${invoiceTemplate.invoiceNumberPrefix || 'INV-'}${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}.${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
      setInvoiceHtml(html);
      setInvoiceFileName(`Rechnung_${num}.html`);
      setInvoiceNum(num);

      console.log('[handleInvoice] generating ZUGFeRD XML...');
      const hours = parseFloat(String(assignment.stunden)) || 0;
      const rate = parseFloat(String(assignment.stundenlohn)) || 0;
      const revenue = typeof assignment.umsatz === 'string'
        ? (() => { const r = assignment.umsatz.replace(/[€\s]/g, '').trim(); if (!r) return 0; if (r.includes(',') && r.includes('.')) return parseFloat(r.replace(/\./g, '').replace(',', '.')) || 0; if (r.includes(',') && !r.includes('.')) return parseFloat(r.replace(',', '.')) || 0; return parseFloat(r) || 0; })()
        : parseFloat(assignment.umsatz) || 0;
      const taxRate = parseFloat(invoiceTemplate.taxRate) || 19;
      const netAmount = revenue;
      const taxAmount = netAmount * (taxRate / 100);
      const grossAmount = netAmount + taxAmount;
      const invoiceDateStr = today.toISOString().split('T')[0];

      const xml = generateZugferdXML({
        invoiceNumber: num,
        invoiceDate: invoiceDateStr,
        seller: {
          name: companyRaw.companyName || companyRaw.name || 'Mein Unternehmen',
          street: companyRaw.street || '',
          zip: companyRaw.zip || '',
          city: companyRaw.city || '',
          taxId: companyRaw.taxId || '',
          email: companyRaw.email || '',
          phone: companyRaw.phone || '',
          owner: companyRaw.owner || '',
        },
        buyer: {
          name: assignment.kunde || 'Unbekannter Kunde',
          street: '',
          zip: '',
          city: '',
        },
        lineItems: [{
          id: assignment.id || '',
          description: assignment.projekt || 'Dienstleistung',
          quantity: hours || 1,
          unitCode: hours ? 'HUR' : 'C62',
          unitPrice: hours ? revenue / hours : revenue,
          netAmount: netAmount,
          taxPercent: taxRate,
        }],
        netTotal: netAmount,
        taxTotal: taxAmount,
        grossTotal: grossAmount,
        taxRate: taxRate,
        paymentTerms: invoiceTemplate.footer?.paymentTerms || 'Zahlbar innerhalb von 14 Tagen ohne Abzug',
        bankDetails: {
          accountHolder: companyRaw.owner || companyRaw.companyName || '',
          iban: companyRaw.iban || '',
          bic: companyRaw.bic || '',
          bankName: companyRaw.bankName || '',
        },
      });
      setInvoiceXml(xml);
      setShowInvoice(assignment.id);
    } catch (e) { console.error('ZUGFeRD error:', e); }
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
        if (compSnap.exists()) { const d = compSnap.data(); companyInfo = { companyName: d.companyName || d.name || 'Mein Unternehmen', companyAddress: [d.street, `${d.zip || ''} ${d.city || ''}`].filter(Boolean).join(', '), companyPhone: d.phone || '', companyEmail: d.email || '', companyTaxId: d.taxId || '' }; }
        if (tmplSnap.exists()) invoiceTemplate = tmplSnap.data();
      }
      const csv = generateCSVContent(assignment, companyInfo, invoiceTemplate);
      const today = new Date();
      const num = `${invoiceTemplate.invoiceNumberPrefix || 'INV-'}${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
      downloadFile(csv, `Rechnung_${num}.csv`, 'text/csv;charset=utf-8');
    })();
  }

  function handleOpenTeam(assignment: any) {
    setTeamModalAssignment(assignment);
    setShowTeamModal(true);
  }

  return (
    <div className="flex h-screen bg-slate-100">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="px-8 py-8 max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6 animate-fadeIn">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Termine</h1>
              <p className="text-slate-500 text-sm mt-1">{raw.length} Termine</p>
            </div>
            <button onClick={() => { setEditing(null); setShowModal(true); }}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 hover:shadow-lg active:scale-[0.97] text-white font-semibold rounded-xl transition-all text-sm shadow-md">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Neuer Termin
            </button>
          </div>

          <div className="relative mb-6 animate-fadeIn">
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" placeholder="Termine durchsuchen..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all shadow-sm" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
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
                  <div
                    className="group bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 overflow-hidden animate-slideUp"
                    style={{ animationDelay: `${i * 60}ms` }}>
                    {/* Top accent bar */}
                    <div className="h-1.5 w-full bg-gradient-to-r from-teal-500 to-emerald-400" />

                    <div className="p-5">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <h3 className="text-base font-bold text-slate-900 truncate group-hover:text-teal-700 transition-colors">{a.projekt || 'Unbenannt'}</h3>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-extrabold border shrink-0"
                              style={{ color: ps.gradeColor, backgroundColor: ps.gradeBg, borderColor: ps.gradeColor + '33' }}>
                              {ps.grade}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-1">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-300" />
                            {a.kunde || 'Kein Kunde'}
                            <span className="text-slate-300 mx-0.5">&middot;</span>
                            {a.datum || '–'}
                          </p>
                        </div>
                      </div>

                      {/* KPI Mini Row */}
                      <div className="grid grid-cols-4 gap-2 mb-4">
                        <div className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100 min-w-0">
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Gewinn</p>
                          <p className={`text-sm font-extrabold truncate ${profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {profit >= 0 ? '+' : ''}{formatCurrency(profit)}
                          </p>
                        </div>
                        <div className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100 min-w-0">
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Umsatz</p>
                          <p className="text-sm font-bold text-slate-800 truncate">{formatCurrency(rev)}</p>
                        </div>
                        <div className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100 min-w-0">
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Soll</p>
                          <p className="text-sm font-bold text-slate-800">{h.toFixed(1)}h</p>
                        </div>
                        <div className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100 min-w-0">
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Ist</p>
                          <p className="text-sm font-bold text-slate-800">
                            {assignmentHours[a.id] ? (assignmentHours[a.id] / 60).toFixed(1) + 'h' : <span className="text-slate-300">–</span>}
                          </p>
                        </div>
                      </div>

                      {/* Team + Marge */}
                      <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                        <div className="flex items-center gap-2">
                          {Array.isArray(a.mitarbeiter) && a.mitarbeiter.slice(0, 4).map((name: string, mi: number) => (
                            <span key={mi} className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white ring-2 ring-white"
                              style={{ backgroundColor: colorFor(name), zIndex: 4 - mi }}>
                              {name.charAt(0).toUpperCase()}
                            </span>
                          ))}
                          {Array.isArray(a.mitarbeiter) && a.mitarbeiter.length > 4 && (
                            <span className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-500 ring-2 ring-white">
                              +{a.mitarbeiter.length - 4}
                            </span>
                          )}
                          {(!Array.isArray(a.mitarbeiter) || a.mitarbeiter.length === 0) && (
                            <span className="text-xs text-slate-400 italic">Kein Team</span>
                          )}
                        </div>
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold ${profit >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                          {margin.toFixed(1)}% Marge
                        </span>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 mt-4 pt-3 border-t border-slate-100 transition-all duration-200">
                        <button onClick={() => { setEditing(a); setShowModal(true); }}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all active:scale-[0.95]">
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          Bearbeiten
                        </button>
                        <button onClick={() => handleInvoice(a)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-teal-600 hover:bg-teal-50 transition-all active:scale-[0.95]">
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                          Rechnung
                        </button>
                        <button onClick={() => handleCSV(a)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-all active:scale-[0.95]">
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                          CSV
                        </button>
                        <button onClick={() => handleOpenTeam(a)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-amber-600 hover:bg-amber-50 transition-all active:scale-[0.95]">
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                          Team
                        </button>
                        <button onClick={() => setDeleting(a.id)}
                          className="flex items-center justify-center p-2 rounded-xl text-xs font-semibold text-red-300 hover:text-red-500 hover:bg-red-50 transition-all active:scale-[0.95]">
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                        </button>
                      </div>
                    </div>


                  </div>

                  {showInvoice === a.id && invoiceHtml && (
                    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 animate-fadeIn">
                      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col animate-scaleIn">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                          <h3 className="text-lg font-bold text-slate-900">Rechnungsvorschau</h3>
                          <div className="flex gap-2">
                            {invoiceXml && (
                              <button onClick={() => downloadFile(invoiceXml, `Rechnung_${invoiceNum}.xml`, 'application/xml')}
                                className="px-4 py-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 hover:shadow-md active:scale-[0.97] text-white rounded-xl transition-all flex items-center gap-1.5">
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                                E-Rechnung (XML)
                              </button>
                            )}
                            <button onClick={() => downloadFile(invoiceHtml, invoiceFileName, 'text/html')}
                              className="px-4 py-2 text-sm font-semibold bg-teal-600 hover:bg-teal-700 hover:shadow-md active:scale-[0.97] text-white rounded-xl transition-all">
                              HTML speichern
                            </button>
                            <button onClick={() => { setShowInvoice(null); setInvoiceHtml(''); setInvoiceXml(''); setInvoiceNum(''); }}
                              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 active:scale-[0.97] rounded-xl transition-all">
                              Schließen
                            </button>
                          </div>
                        </div>
                        <div className="flex-1 overflow-auto bg-slate-100 p-4">
                          <iframe srcDoc={invoiceHtml} className="w-full h-full bg-white rounded-xl shadow-sm" style={{ minHeight: '70vh' }} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {assignments.length === 0 && (
              <div className="col-span-full bg-white rounded-2xl border border-slate-200 p-16 text-center shadow-sm">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
                </div>
                <p className="text-slate-500 text-base mb-4">{search ? 'Keine Ergebnisse' : 'Noch keine Termine'}</p>
                {!search && (
                  <button onClick={() => { setEditing(null); setShowModal(true); }}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 hover:shadow-lg active:scale-[0.97] text-white font-semibold rounded-xl transition-all text-sm shadow-md">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Ersten Termin anlegen
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

      {showTeamModal && teamModalAssignment && (
        <TeamModal assignment={teamModalAssignment} onClose={() => { setShowTeamModal(false); setTeamModalAssignment(null); }} />
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 w-full max-w-sm mx-4 animate-scaleIn">
            <h3 className="text-lg font-bold text-slate-900">Termin löschen?</h3>
            <p className="text-slate-500 text-sm mt-2">Diese Aktion kann nicht rückgängig gemacht werden.</p>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setDeleting(null)} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 active:scale-[0.97] transition-all">Abbrechen</button>
              <button onClick={() => remove(deleting)} className="px-4 py-2 rounded-xl text-sm font-semibold bg-red-600 hover:bg-red-700 hover:shadow-md active:scale-[0.97] text-white transition-all shadow-sm">Löschen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const MONTHS = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const DAYS = ['Mo','Di','Mi','Do','Fr','Sa','So'];

function parseDateString(str: string): Date | null {
  if (!str) return null;
  const p = str.split('.');
  if (p.length === 3) {
    const d = new Date(+p[2], +p[1] - 1, +p[0]);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function toMonthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startDay = (first.getDay() + 6) % 7;
  const days: (number | null)[] = [];
  for (let i = 0; i < startDay; i++) days.push(null);
  for (let d = 1; d <= last.getDate(); d++) days.push(d);
  return days;
}

function CalendarPopover({ value, onChange, onClose }: { value: string; onChange: (d: string) => void; onClose: () => void }) {
  const today = new Date();
  const parsed = parseDateString(value) || today;
  const [year, setYear] = useState(parsed.getFullYear());
  const [month, setMonth] = useState(parsed.getMonth());
  const grid = toMonthGrid(year, month);

  function select(d: number) {
    onChange(formatDate(new Date(year, month, d)));
    onClose();
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute top-full mt-1 z-50 bg-white rounded-xl shadow-xl border border-slate-200 p-4 w-72 animate-scaleIn origin-top-left">
        <div className="flex items-center justify-between mb-3">
          <button type="button" onClick={() => { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); }}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 active:scale-[0.9] transition-all">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <span className="text-sm font-bold text-slate-800">{MONTHS[month]} {year}</span>
          <button type="button" onClick={() => { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); }}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 active:scale-[0.9] transition-all">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
        <div className="grid grid-cols-7 gap-0.5 text-center mb-1">
          {DAYS.map(d => <span key={d} className="text-[10px] font-bold text-slate-400 py-1">{d}</span>)}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {grid.map((d, i) => {
            const sel = d !== null && value === formatDate(new Date(year, month, d));
            const isToday = d !== null && formatDate(new Date()) === formatDate(new Date(year, month, d));
            if (d === null) return <div key={i} />;
            return (
              <button key={i} type="button" onClick={() => select(d)}
                className={`text-xs font-semibold w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-[0.9] ${
                  sel ? 'bg-teal-600 text-white shadow-sm' :
                  isToday ? 'bg-teal-50 text-teal-700 border border-teal-200' :
                  'text-slate-700 hover:bg-slate-100'
                }`}>
                {d}
              </button>
            );
          })}
        </div>
        <button type="button" onClick={() => select(today.getDate())}
          className="mt-3 w-full py-1.5 rounded-lg text-xs font-semibold text-teal-600 hover:bg-teal-50 transition-all active:scale-[0.97]">
          Heute
        </button>
      </div>
    </>
  );
}

function AssignmentModal({ editing, customers, employees, saving, onSave, onClose }: any) {
  const [form, setForm] = useState({
    projekt: '',
    kunde: '',
    datum: '',
    umsatz: '',
    stunden: '',
    stundenlohn: '',
    mitarbeiter: [] as string[],
    status: 'Geplant',
  });
  const [localCustomers, setLocalCustomers] = useState(customers || []);
  const [localEmployees, setLocalEmployees] = useState(employees || []);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickRate, setQuickRate] = useState('');
  const [quickSaving, setQuickSaving] = useState(false);

  const { companyId, user, refresh } = useData();

  useEffect(() => {
    if (editing) {
      setForm({
        projekt: editing.projekt || '',
        kunde: editing.kunde || '',
        datum: editing.datum || '',
        umsatz: editing.umsatz?.toString() || '',
        stunden: editing.stunden?.toString() || '',
        stundenlohn: editing.stundenlohn?.toString() || '',
        mitarbeiter: Array.isArray(editing.mitarbeiter)
          ? editing.mitarbeiter
          : (editing.mitarbeiter || '').split(',').map((n: string) => n.trim()).filter(Boolean),
        status: editing.status || 'Geplant',
      });
    }
  }, [editing]);

  useEffect(() => { setLocalCustomers(customers || []); }, [customers]);
  useEffect(() => { setLocalEmployees(employees || []); }, [employees]);

  function update(field: string, value: any) { setForm((prev: any) => ({ ...prev, [field]: value })); }

  const autoStundenlohn = useMemo(() => {
    return form.mitarbeiter.reduce((sum: number, name: string) => {
      const emp = localEmployees.find((e: any) => e.name === name || e.id === name);
      return sum + (parseFloat(emp?.stundenlohn) || 0);
    }, 0);
  }, [form.mitarbeiter, localEmployees]);

  useEffect(() => {
    update('stundenlohn', autoStundenlohn.toString());
  }, [autoStundenlohn]);

  const teamSize = form.mitarbeiter.length;

  const hours = parseFloat(form.stunden) || 0;
  const rate = autoStundenlohn;
  const cost = hours * rate;
  const revenue = parseFloat(form.umsatz) || 0;
  const profit = revenue - cost;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
  const grade = getGrade(margin);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.kunde) { alert('Bitte wähle einen Kunden aus.'); return; }
    if (!form.datum) { alert('Bitte wähle ein Datum.'); return; }
    await onSave({
      projekt: form.projekt,
      kunde: form.kunde,
      datum: form.datum,
      umsatz: form.umsatz || '0',
      stunden: form.stunden || '0',
      stundenlohn: autoStundenlohn.toFixed(2),
      mitarbeiter: form.mitarbeiter,
      status: form.status,
    });
  }

  async function addQuickCustomer() {
    if (!quickName.trim() || !companyId || !user) return;
    setQuickSaving(true);
    try {
      const data = { name: quickName.trim(), companyId, createdBy: user.uid, createdAt: serverTimestamp() };
      const ref = await addDoc(collection(db, 'customers'), data);
      const newC = { id: ref.id, ...data };
      setLocalCustomers((prev: any[]) => [...prev, newC]);
      update('kunde', quickName.trim());
      setShowAddCustomer(false);
      setQuickName('');
    } finally { setQuickSaving(false); }
  }

  async function addQuickEmployee() {
    if (!quickName.trim() || !companyId || !user) return;
    setQuickSaving(true);
    try {
      const data = {
        name: quickName.trim(),
        stundenlohn: parseFloat(quickRate) || 0,
        companyId,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, 'employees'), data);
      const newE = { id: ref.id, ...data };
      setLocalEmployees((prev: any[]) => [...prev, newE]);
      update('mitarbeiter', [...form.mitarbeiter, quickName.trim()]);
      setShowAddEmployee(false);
      setQuickName('');
      setQuickRate('');
    } finally { setQuickSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[5vh] pb-8 bg-black/30 overflow-y-auto animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg mx-4 animate-slideUp">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">{editing ? 'Termin bearbeiten' : 'Neuer Termin'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 active:scale-[0.9] transition-all">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Projekt */}
            <div className="col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Projekt <span className="text-red-400">*</span></label>
              <input value={form.projekt} onChange={e => update('projekt', e.target.value)} required placeholder="z.B. Webentwicklung"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
            </div>

            {/* Kunde mit Kacheln */}
            <div className="col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Kunde <span className="text-red-400">*</span></label>
              {localCustomers.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center">
                  <p className="text-sm text-slate-500 mb-3">Keine Kunden vorhanden</p>
                  <button type="button" onClick={() => { setShowAddCustomer(true); setShowAddEmployee(false); }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-teal-600 bg-teal-50 border border-teal-200 hover:bg-teal-100 active:scale-[0.95] transition-all">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Ersten Kunden anlegen
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {localCustomers.map((c: any) => (
                    <button key={c.id} type="button" onClick={() => update('kunde', form.kunde === c.name ? '' : c.name)}
                      className={`px-3.5 py-2 rounded-xl text-sm font-semibold border transition-all active:scale-[0.95] flex items-center gap-2 ${
                        form.kunde === c.name
                          ? 'bg-teal-50 text-teal-700 border-teal-300 shadow-sm ring-1 ring-teal-300'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-100'
                      }`}>
                      <span className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold text-white"
                        style={{ backgroundColor: form.kunde === c.name ? '#0d9488' : '#94a3b8' }}>{c.name.charAt(0).toUpperCase()}</span>
                      <span>{c.name}</span>
                      {form.kunde === c.name && (
                        <svg className="w-4 h-4 text-teal-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      )}
                    </button>
                  ))}
                  <button type="button" onClick={() => { setShowAddCustomer(true); setShowAddEmployee(false); }}
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold border border-dashed border-slate-300 text-slate-400 hover:text-teal-600 hover:border-teal-300 hover:bg-teal-50 active:scale-[0.95] transition-all flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Neu
                  </button>
                </div>
              )}
              {showAddCustomer && (
                <div className="mt-2 p-3 bg-teal-50 border border-teal-200 rounded-xl animate-slideUp">
                  <label className="block text-xs font-semibold text-teal-700 mb-1.5">Neuer Kunde</label>
                  <div className="flex gap-2">
                    <input value={quickName} onChange={e => setQuickName(e.target.value)} placeholder="Name"
                      className="flex-1 px-3 py-2 bg-white border border-teal-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
                    <button type="button" onClick={addQuickCustomer} disabled={quickSaving || !quickName.trim()}
                      className="px-3 py-2 rounded-lg text-xs font-semibold bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white active:scale-[0.95] transition-all">
                      {quickSaving ? '...' : 'Hinzufügen'}
                    </button>
                    <button type="button" onClick={() => { setShowAddCustomer(false); setQuickName(''); }}
                      className="px-3 py-2 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-100 active:scale-[0.95] transition-all">
                      Abbr.
                    </button>
                  </div>
                </div>
              )}
              {form.kunde && <input type="hidden" required />}
            </div>

            {/* Datum & Status */}
            <div className="relative">
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Datum <span className="text-red-400">*</span></label>
              <button type="button" onClick={() => setShowCalendar(!showCalendar)} required
                className="w-full flex items-center gap-2 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all hover:border-slate-300">
                <svg className="w-4 h-4 text-slate-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                <span className={form.datum ? 'text-slate-900 font-medium' : 'text-slate-400'}>{form.datum || 'Datum wählen'}</span>
              </button>
              {showCalendar && (
                <CalendarPopover value={form.datum} onChange={v => update('datum', v)} onClose={() => setShowCalendar(false)} />
              )}
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Status</label>
              <div className="flex gap-1 h-[42px] items-center">
                {['Geplant', 'In Bearbeitung', 'Abgeschlossen'].map(s => (
                  <button key={s} type="button" onClick={() => update('status', s)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all active:scale-[0.95] flex-1 ${
                      form.status === s
                        ? s === 'Geplant' ? 'bg-amber-100 text-amber-800 border border-amber-300 shadow-sm'
                          : s === 'In Bearbeitung' ? 'bg-blue-100 text-blue-800 border border-blue-300 shadow-sm'
                          : 'bg-green-100 text-green-800 border border-green-300 shadow-sm'
                        : 'bg-slate-50 text-slate-400 border border-slate-200 hover:border-slate-300'
                    }`}>
                    {s === 'In Bearbeitung' ? 'Laufend' : s}
                  </button>
                ))}
              </div>
            </div>

            {/* Umsatz & Stunden */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Umsatz (€)</label>
              <input type="number" step="0.01" min="0" value={form.umsatz} onChange={e => update('umsatz', e.target.value)} placeholder="0,00"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Stunden</label>
              <input type="number" step="0.5" min="0" value={form.stunden} onChange={e => update('stunden', e.target.value)} placeholder="0"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
            </div>

            {/* Mitarbeiter mit Quick-Add */}
            <div className="col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Mitarbeiter</label>
              <div className="flex flex-wrap gap-1.5">
                {localEmployees.map((e: any) => {
                  const sel = form.mitarbeiter.includes(e.name);
                  return (
                    <button key={e.id} type="button" onClick={() => update('mitarbeiter', sel ? form.mitarbeiter.filter((n: string) => n !== e.name) : [...form.mitarbeiter, e.name])}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all active:scale-[0.95] flex items-center gap-1.5 ${
                        sel ? 'bg-teal-50 text-teal-700 border-teal-200 shadow-sm' : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'
                      }`}>
                      <span className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                        style={{ backgroundColor: sel ? '#0d9488' : '#94a3b8' }}>{e.name.charAt(0).toUpperCase()}</span>
                      {e.name}
                      <span className="text-[10px] opacity-60">{parseFloat(e.stundenlohn || 0).toFixed(0)}€/h</span>
                    </button>
                  );
                })}
                <button type="button" onClick={() => { setShowAddEmployee(true); setShowAddCustomer(false); }}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-dashed border-slate-300 text-slate-400 hover:text-teal-600 hover:border-teal-300 hover:bg-teal-50 active:scale-[0.95] transition-all flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Mitarbeiter
                </button>
                {localEmployees.length === 0 && !showAddEmployee && (
                  <p className="text-xs text-slate-400 w-full">Keine Mitarbeiter vorhanden</p>
                )}
              </div>
              {showAddEmployee && (
                <div className="mt-2 p-3 bg-teal-50 border border-teal-200 rounded-xl animate-slideUp">
                  <label className="block text-xs font-semibold text-teal-700 mb-1.5">Neuer Mitarbeiter</label>
                  <div className="flex gap-2 mb-2">
                    <input value={quickName} onChange={e => setQuickName(e.target.value)} placeholder="Name"
                      className="flex-1 px-3 py-2 bg-white border border-teal-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
                    <input value={quickRate} onChange={e => setQuickRate(e.target.value)} type="number" step="0.01" min="0" placeholder="€/h"
                      className="w-20 px-3 py-2 bg-white border border-teal-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={addQuickEmployee} disabled={quickSaving || !quickName.trim()}
                      className="px-3 py-2 rounded-lg text-xs font-semibold bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white active:scale-[0.95] transition-all">
                      {quickSaving ? '...' : 'Hinzufügen'}
                    </button>
                    <button type="button" onClick={() => { setShowAddEmployee(false); setQuickName(''); setQuickRate(''); }}
                      className="px-3 py-2 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-100 active:scale-[0.95] transition-all">
                      Abbrechen
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Stundenlohn (Auto) & Team-Größe */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Stundenlohn (€)</label>
              <div className="w-full px-3.5 py-2.5 bg-teal-50 border border-teal-200 rounded-xl text-sm text-teal-800 font-bold flex items-center gap-2">
                <span>{autoStundenlohn.toFixed(2)} €/h</span>
                {form.mitarbeiter.length > 1 && <span className="text-[10px] text-teal-500 font-normal">(∑ {form.mitarbeiter.length} MA)</span>}
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Team-Größe</label>
              <div className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 font-semibold flex items-center gap-2">
                <span>{teamSize}</span>
                <span className="text-slate-400 font-normal text-xs">Mitarbeiter</span>
              </div>
            </div>
          </div>

          {/* Vorkalkulation / Smart Pricing */}
          {hours > 0 || revenue > 0 ? (
            <div className="border-t border-slate-100 pt-4 mt-2">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Vorab-Kalkulation</span>
                <span className="flex-1 border-t border-slate-100" />
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-extrabold border"
                  style={{ color: getGradeColor(grade), backgroundColor: getGradeBg(grade), borderColor: getGradeColor(grade) + '33' }}>
                  {grade}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-50 rounded-xl px-3.5 py-2.5 border border-slate-100">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Kosten</p>
                  <p className="text-sm font-bold text-slate-800">{hours.toFixed(1)}h × {rate.toFixed(2)}€ = {formatCurrency(cost)}</p>
                </div>
                <div className="bg-slate-50 rounded-xl px-3.5 py-2.5 border border-slate-100">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Umsatz</p>
                  <p className="text-sm font-bold text-slate-800">{formatCurrency(revenue)}</p>
                </div>
                <div className="bg-slate-50 rounded-xl px-3.5 py-2.5 border border-slate-100">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Gewinn</p>
                  <p className={`text-sm font-extrabold ${profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {profit >= 0 ? '+' : ''}{formatCurrency(profit)}
                  </p>
                </div>
                <div className="bg-slate-50 rounded-xl px-3.5 py-2.5 border border-slate-100">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Marge</p>
                  <p className={`text-sm font-extrabold ${margin >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {margin.toFixed(1)}%
                  </p>
                </div>
              </div>
              {revenue > 0 && profit >= 0 && (
                <div className="mt-2 bg-green-50 border border-green-200 rounded-xl px-3.5 py-2 flex items-center gap-2">
                  <svg className="w-4 h-4 text-green-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                  <p className="text-xs text-green-700 font-semibold">Gewinnbringender Termin ({grade}-Bewertung)</p>
                </div>
              )}
              {revenue > 0 && profit < 0 && (
                <div className="mt-2 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2 flex items-center gap-2">
                  <svg className="w-4 h-4 text-red-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                  <p className="text-xs text-red-700 font-semibold">Verlust - Kosten übersteigen Umsatz</p>
                </div>
              )}
              {revenue === 0 && hours === 0 && (
                <div className="mt-2 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 flex items-center gap-2">
                  <svg className="w-4 h-4 text-slate-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                  <p className="text-xs text-slate-500 font-semibold">Daten eingeben für Kalkulation</p>
                </div>
              )}
            </div>
          ) : null}

          {/* Footer */}
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button type="button" onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 active:scale-[0.97] transition-all">
              Abbrechen
            </button>
            <button type="submit" disabled={saving}
              className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 hover:shadow-lg active:scale-[0.97] disabled:opacity-50 text-white font-bold rounded-xl transition-all text-sm shadow-md flex items-center gap-2">
              {saving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {editing ? 'Änderungen speichern' : 'Termin anlegen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
