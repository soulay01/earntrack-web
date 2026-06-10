'use client';

import { useEffect, useState, useMemo, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';
import { Zap, TriangleAlert } from 'lucide-react';
import { formatCurrency, parseGermanCurrency, parseDate } from '@/lib/utils';
import { calculateAssignmentProfitScore, getGrade, getGradeColor, getGradeBg, analyzeRootCause } from '@/lib/smartPricing';
import { generateInvoiceHTML, generateSequentialInvoiceNumber, generateCSVContent } from '@/lib/estimateUtils';
import { generateZugferdXML, generateZugferdFilename } from '@/lib/zugferd';
import { downloadPDF, downloadZugferdPDF } from '@/lib/pdf';
import TeamModal from '@/components/TeamModal';
import AssignmentModal from '@/components/AssignmentModal';
import Tooltip from '@/components/Tooltip';
import { collection, addDoc, updateDoc, deleteDoc, doc, getDoc, getDocs, query, where, serverTimestamp, QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { hasReachedLimit } from '@/lib/plans';
import UpgradeModal from '@/components/UpgradeModal';
import { logUsage } from '@/lib/usageLog';

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

function AssignmentsInner() {
  const { user, loading, assignments: raw, customers, employees, companyId, company, refresh } = useData();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [initialDate, setInitialDate] = useState('');
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
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [statusFilter, setStatusFilter] = useState('alle');
  const [monthFilter, setMonthFilter] = useState<number | 'all'>('all');
  const [monthOpen, setMonthOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isNew = params.get('new');
    const dateParam = params.get('date');
    if (isNew === '1') {
      setShowModal(true);
      setInitialDate(dateParam ? decodeURIComponent(dateParam) : '');
      window.history.replaceState(null, '', window.location.pathname);
      return;
    }
    const h = params.get('highlight');
    if (!h) return;
    setHighlightId(h);
    let active = true;
    let retries = 0;
    const tryHighlight = () => {
      if (!active) return;
      const el = document.getElementById('assignment-' + h);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('assignment-flash');
      } else if (retries < 15) {
        retries++;
        setTimeout(tryHighlight, 200);
      }
    };
    const tid = setTimeout(tryHighlight, 400);
    const hid = setTimeout(() => {
      if (!active) return;
      setHighlightId(null);
      document.getElementById('assignment-' + h)?.classList.remove('assignment-flash');
      window.history.replaceState(null, '', window.location.pathname);
    }, 4000);
    return () => { active = false; clearTimeout(tid); clearTimeout(hid); };
  }, []);

  const assignments = useMemo(() => {
    let list = raw;
    if (statusFilter !== 'alle') list = list.filter(a => (a.status || 'Geplant') === statusFilter);
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter(a => (a.projekt || '').toLowerCase().includes(q) || (a.kunde || '').toLowerCase().includes(q));
  }, [raw, search, statusFilter]);

  const filteredByMonth = useMemo(() => {
    if (monthFilter === 'all') return assignments;
    return assignments.filter(a => {
      const d = parseDate(a.datum);
      return d && d.getMonth() === monthFilter;
    });
  }, [assignments, monthFilter]);

  const monthStats = useMemo(() => {
    const items = filteredByMonth;
    if (!items.length) return { avgRevenue: 0, avgProfit: 0, customerCount: 0, count: 0, totalHours: 0 };
    let totalRev = 0, totalProfit = 0, totalHours = 0;
    const customers = new Set<string>();
    items.forEach(a => {
      const rev = parseGermanCurrency(a.umsatz);
      const h = parseFloat(String(a.stunden)) || 0;
      const rate = parseFloat(String(a.stundenlohn)) || 0;
      totalRev += rev;
      totalProfit += rev - h * rate;
      totalHours += h;
      if (a.kunde) customers.add(a.kunde);
    });
    return {
      avgRevenue: totalRev / items.length,
      avgProfit: totalProfit / items.length,
      customerCount: customers.size,
      count: items.length,
      totalHours,
    };
  }, [filteredByMonth]);

  const monthLabels = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

  useEffect(() => {
    if (!raw.length) return;
    const ids = raw.map(a => a.id);
    const hours: Record<string, number> = {};
    let cancelled = false;
    (async () => {
      const batches: any[] = [];
      for (let i = 0; i < ids.length; i += 10) {
        const batch = ids.slice(i, i + 10);
        batches.push(getDocs(query(collection(db, 'clock_entries'), where('assignmentId', 'in', batch))));
      }
      const results = await Promise.all(batches);
      if (cancelled) return;
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
    return () => { cancelled = true; };
  }, [raw]);

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [user, loading, router]);
  if (loading || !user) return null;

  async function save(form: any) {
    if (!user || !companyId) return;
    if (!editing && hasReachedLimit(company?.subscriptionPlan, 'assignments', raw.length)) {
      setShowUpgrade(true); return;
    }
    if (!form.projekt?.trim()) {
      console.warn('Assignment missing project name – aborting save');
      alert('Bitte fülle alle Pflichtfelder aus');
      setSaving(false); return;
    }
    setSaving(true);
    try {
      const data = { ...form, companyId, createdBy: user.uid };
      if (editing) { await updateDoc(doc(db, 'assignments', editing.id), data); }
      else { data.createdAt = serverTimestamp(); await addDoc(collection(db, 'assignments'), data); logUsage('assignment_created'); }
      setShowModal(false); setEditing(null); refresh();
    } catch (e) {
      alert('Fehler beim Speichern: ' + (e instanceof Error ? e.message : 'Unbekannter Fehler'));
    } finally { setSaving(false); }
  }

  async function remove(id: string) {
    try { await deleteDoc(doc(db, 'assignments', id)); }
    catch (e) { alert('Fehler beim Löschen: ' + (e instanceof Error ? e.message : 'Unbekannter Fehler')); }
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
        if (tmplSnap.exists()) {
          invoiceTemplate = tmplSnap.data();
          // Always update snapshot with latest template
          updateDoc(doc(db, 'assignments', assignment.id), { invoiceTemplate: tmplSnap.data() }).catch((e) => console.error('Failed to update invoice template:', e));
        }
      }
      const isSubscribed = company?.subscriptionStatus === 'active';
      const today = new Date();
      const num = companyId ? await generateSequentialInvoiceNumber(companyId, invoiceTemplate.invoiceNumberPrefix || 'INV-') : `${invoiceTemplate.invoiceNumberPrefix || 'INV-'}${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}-${String(Math.floor(Math.random() * 99999)).padStart(5, '0')}`;
      const html = generateInvoiceHTML(assignment, companyInfo, invoiceTemplate, isSubscribed, { customers, invoiceNumber: num });
      setInvoiceHtml(html);
      setInvoiceFileName(`Rechnung_${num}.html`);
      setInvoiceNum(num);


      const hours = parseFloat(String(assignment.stunden)) || 0;
      const rate = parseFloat(String(assignment.stundenlohn)) || 0;
      const revenue = parseGermanCurrency(assignment.umsatz);
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
        if (tmplSnap.exists() && !assignment.invoiceTemplate) {
          updateDoc(doc(db, 'assignments', assignment.id), { invoiceTemplate: tmplSnap.data() }).catch((e) => console.error('Failed to update invoice template:', e));
        }
      }
      if (assignment.invoiceTemplate) invoiceTemplate = assignment.invoiceTemplate;
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

  function statusStyle(s: string) {
    if (s === 'Abgeschlossen') return { bar: 'from-green-500 to-emerald-400', badge: 'bg-green-100 text-green-700 border-green-300', dot: 'bg-green-500' };
    if (s === 'In Bearbeitung') return { bar: 'from-blue-500 to-cyan-400', badge: 'bg-blue-100 text-blue-700 border-blue-300', dot: 'bg-blue-500' };
    return { bar: 'from-slate-300 to-slate-400', badge: 'bg-slate-100 text-slate-500 border-slate-300', dot: 'bg-slate-400' };
  }

  async function quickComplete(assignment: any) {
    if (!companyId) return;
    try {
      const next = assignment.status === 'Abgeschlossen' ? 'In Bearbeitung' : 'Abgeschlossen';
      await updateDoc(doc(db, 'assignments', assignment.id), { status: next });
      refresh();
    } catch (e) { console.error('quickComplete error:', e); }
  }

  return (
    <div className="flex h-screen bg-slate-100">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="px-4 md:px-8 py-4 md:py-8 max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6 ">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Termine</h1>
              <p className="text-slate-500 text-sm mt-1">{filteredByMonth.length} / {raw.length} Termine</p>
            </div>
            <button onClick={() => { setEditing(null); setShowModal(true); }}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 hover:shadow-lg active:scale-[0.97] text-white font-semibold rounded-xl transition-all text-sm shadow-md">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Neuer Termin
            </button>
          </div>

          <div className="relative mb-4 ">
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" placeholder="Termine durchsuchen..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all shadow-sm" />
          </div>

          <div className="flex gap-1 flex-wrap mb-6">
            {[
              { key: 'alle', label: 'Alle', dot: '' },
              { key: 'Geplant', label: 'Geplant', dot: 'bg-slate-400' },
              { key: 'In Bearbeitung', label: 'In Bearbeitung', dot: 'bg-blue-500' },
              { key: 'Abgeschlossen', label: 'Abgeschlossen', dot: 'bg-green-500' },
            ].map(f => (
              <button key={f.key} onClick={() => setStatusFilter(f.key)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-[0.95] ${
                  statusFilter === f.key
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'bg-white text-slate-400 border border-slate-200 hover:text-slate-700 hover:bg-slate-50'
                }`}>
                {f.dot && <span className={`w-2 h-2 rounded-full ${f.dot}`} />}
                {f.label}
              </button>
            ))}
          </div>

          {/* Monat-Filter */}
          <div className="relative mb-4">
            <button onClick={() => setMonthOpen(!monthOpen)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:border-slate-300 hover:shadow-sm transition-all active:scale-[0.97]">
              <svg className="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              {monthFilter === 'all' ? 'Alle Monate' : monthLabels[monthFilter]}
              <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${monthOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            {monthOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMonthOpen(false)} />
                <div className="absolute left-0 top-full mt-1 z-50 w-44 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden animate-fadeIn">
                  <button onClick={() => { setMonthFilter('all'); setMonthOpen(false); }}
                    className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors text-left ${
                      monthFilter === 'all' ? 'bg-teal-50 text-teal-700' : 'text-slate-600 hover:bg-slate-50'
                    }`}>
                    <svg className={`w-4 h-4 ${monthFilter === 'all' ? 'text-teal-500' : 'text-slate-300'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                    Alle Monate
                  </button>
                  <div className="h-px bg-slate-100 mx-3" />
                  <div className="max-h-60 overflow-y-auto py-1">
                    {monthLabels.map((label, i) => (
                      <button key={i} onClick={() => { setMonthFilter(i); setMonthOpen(false); }}
                        className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors text-left ${
                          monthFilter === i ? 'bg-teal-50 text-teal-700' : 'text-slate-600 hover:bg-slate-50'
                        }`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Monats-Statistiken */}
          {monthFilter !== 'all' && filteredByMonth.length > 0 && (
            <div className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">Ø Umsatz</p>
                <p className="text-base font-extrabold text-slate-900">{formatCurrency(monthStats.avgRevenue)}</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">Ø Gewinn</p>
                <p className={`text-base font-extrabold ${monthStats.avgProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {formatCurrency(monthStats.avgProfit)}
                </p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">Stunden</p>
                <p className="text-base font-extrabold text-violet-600">{monthStats.totalHours.toFixed(1)}h</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">Kunden</p>
                <p className="text-base font-extrabold text-slate-900">{monthStats.customerCount}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filteredByMonth.map((a, i) => {
              const ps = calculateAssignmentProfitScore(a);
              const rev = ps.revenue;
              const h = ps.hours;
              const rate = parseFloat(String(a.stundenlohn)) || 0;
              const cost = h * rate;
              const profit = rev - cost;
              const margin = rev > 0 ? (profit / rev) * 100 : 0;
              const sst = statusStyle(a.status || 'Geplant');
              return (
                <div key={a.id} id={'assignment-' + a.id} className="relative">
                  {highlightId === a.id && (
                    <>
                      <div className="fixed inset-0 z-40 bg-black/40 " onClick={() => { setHighlightId(null); document.getElementById('assignment-' + a.id)?.classList.remove('assignment-flash'); }} />
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-50 animate-bounce">
                        <span className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-300 text-white text-xs font-extrabold shadow-[0_0_30px_rgba(250,204,21,0.7)] border-2 border-yellow-200 tracking-wide uppercase">
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                          <Zap className="w-4 h-4 fill-current" /> Handlungsbedarf
                        </span>
                      </div>
                    </>
                  )}
                  <div
                    className={`rounded-2xl border transition-all duration-300 overflow-hidden  ${
                      highlightId === a.id
                        ? 'ring-[8px] ring-yellow-400 shadow-[0_0_80px_rgba(250,204,21,0.5),0_0_20px_rgba(250,204,21,0.3)] border-yellow-400 bg-gradient-to-br from-yellow-50 via-amber-50 to-yellow-50 scale-[1.06] z-50 group relative'
                        : 'bg-white border-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-0.5 group'
                    }`}
                    style={{ animationDelay: `${i * 60}ms` }}>
                    {/* Top accent bar */}
                    <div className={`h-2.5 w-full bg-gradient-to-r ${sst.bar}`} />

                    <div className="p-5">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <h3 className="text-base font-bold text-slate-900 truncate group-hover:text-teal-700 transition-colors">{a.projekt || 'Unbenannt'}</h3>
                            <Tooltip text={ps.grade === 'F' ? 'Verlust – Ausgaben > Einnahmen' : `Profit Score: ${ps.grade} (Gewinnmarge: ${margin.toFixed(1)}%)`}>
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-extrabold border shrink-0"
                                style={{ color: ps.gradeColor, backgroundColor: ps.gradeBg, borderColor: ps.gradeColor + '33' }}>
                                {ps.grade}
                              </span>
                            </Tooltip>
                          </div>
                          <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-1">
                            <span className={`inline-block w-1.5 h-1.5 rounded-full ${sst.dot}`} />
                            <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${sst.badge}`}>
                              {a.status || 'Geplant'}
                            </span>
                            <span className="text-slate-300 mx-0.5">&middot;</span>
                            {a.kunde || 'Kein Kunde'}
                            <span className="text-slate-300 mx-0.5">&middot;</span>
                            {a.datum || '–'}
                          </p>
                        </div>
                      </div>

                      {/* KPI Mini Row */}
                      <div className="grid grid-cols-2 gap-2 mb-4">
                        <div className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100 min-w-0">
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">{profit >= 0 ? 'Gewinn' : 'Verlust'}</p>
                          <p className={`text-sm font-extrabold ${profit >= 0 ? 'text-emerald-600' : 'text-rose-700'}`}>
                            {formatCurrency(profit)}
                          </p>
                        </div>
                        <div className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100 min-w-0">
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Umsatz</p>
                          <p className="text-sm font-bold text-blue-600">{formatCurrency(rev)}</p>
                        </div>
                        <div className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100 min-w-0">
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Soll</p>
                          <p className="text-sm font-bold text-amber-600">{h.toFixed(1)}h</p>
                        </div>
                        {(() => { const istH = assignmentHours[a.id] ? assignmentHours[a.id] / 60 : 0; const over = istH > h; return (
                        <div className={`rounded-xl px-3 py-2.5 border min-w-0 ${over ? 'bg-rose-50 border-rose-300 animate-pulse' : 'bg-slate-50 border-slate-100'}`}>
                          <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5 ${over ? 'text-rose-500' : 'text-slate-400'}">Ist</p>
                          <p className={`text-sm font-extrabold flex items-center gap-1 ${over ? 'text-rose-600' : 'text-violet-600'}`}>
                            <Tooltip text={over ? 'Achtung: Überstunden! Ist > Soll' : 'Tatsächlich erfasste Arbeitszeit aus den Clock-In/Out-Einträgen der Mitarbeiter (abzgl. Pausen)'}>
                              {over && (
                                <svg className="w-3.5 h-3.5 text-rose-500 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                                </svg>
                              )}
                              {assignmentHours[a.id] ? istH.toFixed(1) + 'h' : <span className="text-slate-300">–</span>}
                            </Tooltip>
                          </p>
                        </div>
                        );})()}
                      </div>

                      {/* Team + Marge */}
                      <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                        <div className="flex items-center gap-2">
                          {Array.isArray(a.mitarbeiter) && a.mitarbeiter.slice(0, 4).map((name: string, mi: number) => {
                            const emp = employees.find((e: any) => e.name === name);
                            const img = emp?.imageUrl;
                            return img?.startsWith('https://') || img?.startsWith('data:image/') ? (
                              <img key={mi} src={img} alt="" className="w-7 h-7 rounded-full object-cover ring-2 ring-white shrink-0"
                                style={{ zIndex: 4 - mi }} />
                            ) : (
                              <span key={mi} className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white ring-2 ring-white shrink-0"
                                style={{ backgroundColor: colorFor(name), zIndex: 4 - mi }}>
                                {name.charAt(0).toUpperCase()}
                              </span>
                            );
                          })}
                          {Array.isArray(a.mitarbeiter) && a.mitarbeiter.length > 4 && (
                            <span className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-500 ring-2 ring-white">
                              +{a.mitarbeiter.length - 4}
                            </span>
                          )}
                          {(!Array.isArray(a.mitarbeiter) || a.mitarbeiter.length === 0) && (
                            <span className="text-xs text-slate-400 italic">Kein Team</span>
                          )}
                        </div>
                        <Tooltip text={`Gewinnmarge = (Gewinn ÷ Umsatz) × 100 → (${formatCurrency(profit)} ÷ ${formatCurrency(rev)}) × 100 = ${margin.toFixed(1)}%`}>
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold cursor-default ${profit >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                            {margin.toFixed(1)}% Marge
                          </span>
                        </Tooltip>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 mt-4 pt-3 border-t border-slate-100 transition-all duration-200">
                        <button onClick={() => { setEditing(a); setShowModal(true); }}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all active:scale-[0.95]">
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          Bearbeiten
                        </button>
                        <button onClick={() => handleOpenTeam(a)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-violet-600 hover:bg-violet-50 transition-all active:scale-[0.95]">
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                          Team
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
                        <button onClick={() => quickComplete(a)}
                          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all active:scale-[0.95] ${
                            a.status === 'Abgeschlossen'
                              ? 'text-amber-600 hover:bg-amber-50 hover:text-amber-700'
                              : 'text-green-600 hover:bg-green-50 hover:text-green-700'
                          }`}>
                          {a.status === 'Abgeschlossen' ? (
                            <><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>Öffnen</>
                          ) : (
                            <><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>Abschließen</>
                          )}
                        </button>
                        <button onClick={() => setDeleting(a.id)}
                          className="flex items-center justify-center p-2 rounded-xl text-xs font-semibold text-red-300 hover:text-red-500 hover:bg-red-50 transition-all active:scale-[0.95]">
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                        </button>
                      </div>
                    </div>


                  </div>

                  {showInvoice === a.id && invoiceHtml && (
                    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 ">
                      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col ">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                          <h3 className="text-lg font-bold text-slate-900">Rechnungsvorschau</h3>
                          <div className="flex gap-2">
                            {invoiceXml && (
                              <button onClick={() => downloadZugferdPDF(invoiceHtml, invoiceXml, invoiceFileName)}
                                className="px-4 py-2 text-sm font-semibold bg-teal-600 hover:bg-teal-700 hover:shadow-md active:scale-[0.97] text-white rounded-xl transition-all flex items-center gap-1.5">
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                                E-Rechnung PDF speichern
                              </button>
                            )}
                            <button onClick={() => downloadPDF(invoiceHtml, invoiceFileName)}
                              className="px-4 py-2 text-sm font-semibold bg-slate-600 hover:bg-slate-700 hover:shadow-md active:scale-[0.97] text-white rounded-xl transition-all">
                              PDF (ohne XML)
                            </button>
                            <button onClick={() => { setShowInvoice(null); setInvoiceHtml(''); setInvoiceXml(''); setInvoiceNum(''); }}
                              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 active:scale-[0.97] rounded-xl transition-all">
                              Schließen
                            </button>
                          </div>
                        </div>
                        <div className="flex-1 overflow-auto bg-slate-100 p-4">
                          <iframe srcDoc={invoiceHtml} sandbox="allow-same-origin" className="w-full h-full bg-white rounded-xl shadow-sm" style={{ minHeight: '70vh' }} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {filteredByMonth.length === 0 && (
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
          assignments={assignments}
          saving={saving}
          initialDate={initialDate}
          onSave={save}
          onClose={() => { setShowModal(false); setEditing(null); setInitialDate(''); }}
        />
      )}

      {showTeamModal && teamModalAssignment && (
        <TeamModal assignment={teamModalAssignment} onClose={() => { setShowTeamModal(false); setTeamModalAssignment(null); }} />
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 ">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 w-full max-w-sm mx-4 ">
            <h3 className="text-lg font-bold text-slate-900">Termin löschen?</h3>
            <p className="text-slate-500 text-sm mt-2">Diese Aktion kann nicht rückgängig gemacht werden.</p>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setDeleting(null)} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 active:scale-[0.97] transition-all">Abbrechen</button>
              <button onClick={() => remove(deleting)} className="px-4 py-2 rounded-xl text-sm font-semibold bg-red-600 hover:bg-red-700 hover:shadow-md active:scale-[0.97] text-white transition-all shadow-sm">Löschen</button>
            </div>
          </div>
        </div>
      )}

      <UpgradeModal
        open={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        dismissable
        title="Termin-Limit erreicht"
        description="In der Testphase kannst du maximal 3 Termine anlegen. Wähle einen Plan, um unbegrenzt Termine zu erstellen."
      />
    </div>
  );
}

export default function AssignmentsPage() {
  return (
    <Suspense fallback={null}>
      <AssignmentsInner />
    </Suspense>
  );
}


