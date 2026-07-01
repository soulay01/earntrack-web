'use client';

import { useEffect, useState, useMemo, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';
import PageSkeleton from '@/components/skeletons/PageSkeleton';
import { Plus, Search, Pencil, Trash2, Users, FileText, Download, Check, Eye, Calendar, ChevronDown, TriangleAlert } from 'lucide-react';
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

function downloadFile(content: string, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName; a.click();
  URL.revokeObjectURL(url);
}

const ui = {
  btnPrimary: 'inline-flex items-center gap-2 px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition-colors',
  btnGhost: 'px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors',
  btnDanger: 'px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors',
  input: 'w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 transition-colors',
};

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
        const breakMin = Math.round((data.totalBreakMs ?? (data.totalBreakMinutes || 0) * 60000) / 60000);
        const mins = Math.round((co.getTime() - ci.getTime()) / 60000) - breakMin;
        hours[aid] = (hours[aid] || 0) + mins;
      }));
      setAssignmentHours(hours);
    })();
    return () => { cancelled = true; };
  }, [raw]);

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [user, loading, router]);
  if (loading || !user) return <PageSkeleton variant="table" maxWidth="max-w-7xl" />;

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
    if (s === 'Abgeschlossen') return { badge: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' };
    if (s === 'In Bearbeitung') return { badge: 'bg-blue-50 text-blue-700', dot: 'bg-blue-500' };
    return { badge: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' };
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
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="px-4 md:px-8 py-6 md:py-10 max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Termine</h1>
              <p className="text-slate-500 text-sm mt-0.5">{filteredByMonth.length} von {raw.length} Terminen</p>
            </div>
            <button onClick={() => { setEditing(null); setShowModal(true); }} className={ui.btnPrimary}>
              <Plus className="w-4 h-4" />
              Neuer Termin
            </button>
          </div>

          <div className="flex flex-col md:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input type="text" placeholder="Suchen nach Projekt oder Kunde …" value={search} onChange={e => setSearch(e.target.value)}
                className={`${ui.input} pl-9`} />
            </div>

            <div className="flex gap-2">
              <div className="flex gap-0.5 bg-slate-100 rounded-lg p-0.5">
                {[
                  { key: 'alle', label: 'Alle' },
                  { key: 'Geplant', label: 'Geplant' },
                  { key: 'In Bearbeitung', label: 'In Bearbeitung' },
                  { key: 'Abgeschlossen', label: 'Abgeschlossen' },
                ].map(f => (
                  <button key={f.key} onClick={() => setStatusFilter(f.key)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                      statusFilter === f.key
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}>
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Monat-Filter */}
              <div className="relative">
                <button onClick={() => setMonthOpen(!monthOpen)}
                  className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  {monthFilter === 'all' ? 'Alle Monate' : monthLabels[monthFilter]}
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${monthOpen ? 'rotate-180' : ''}`} />
                </button>
                {monthOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMonthOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 z-50 w-44 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
                      <button onClick={() => { setMonthFilter('all'); setMonthOpen(false); }}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors text-left ${
                          monthFilter === 'all' ? 'bg-slate-50 text-slate-900' : 'text-slate-600 hover:bg-slate-50'
                        }`}>
                        Alle Monate
                      </button>
                      <div className="h-px bg-slate-100" />
                      <div className="max-h-60 overflow-y-auto py-1">
                        {monthLabels.map((label, i) => (
                          <button key={i} onClick={() => { setMonthFilter(i); setMonthOpen(false); }}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors text-left ${
                              monthFilter === i ? 'bg-slate-50 text-slate-900' : 'text-slate-600 hover:bg-slate-50'
                            }`}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Monats-Statistiken */}
          {monthFilter !== 'all' && filteredByMonth.length > 0 && (
            <div className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Ø Umsatz', value: formatCurrency(monthStats.avgRevenue), cls: 'text-slate-900' },
                { label: 'Ø Gewinn', value: formatCurrency(monthStats.avgProfit), cls: monthStats.avgProfit >= 0 ? 'text-slate-900' : 'text-red-600' },
                { label: 'Stunden', value: `${monthStats.totalHours.toFixed(1)} h`, cls: 'text-slate-900' },
                { label: 'Kunden', value: String(monthStats.customerCount), cls: 'text-slate-900' },
              ].map(stat => (
                <div key={stat.label} className="bg-white rounded-lg border border-slate-200 px-4 py-3">
                  <p className="text-xs font-medium text-slate-500 mb-0.5">{stat.label}</p>
                  <p className={`text-base font-semibold tabular-nums ${stat.cls}`}>{stat.value}</p>
                </div>
              ))}
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
                    <div className="fixed inset-0 z-40 bg-slate-900/40" onClick={() => { setHighlightId(null); document.getElementById('assignment-' + a.id)?.classList.remove('assignment-flash'); }} />
                  )}
                  <div
                    className={`rounded-xl border bg-white transition-colors overflow-hidden group ${
                      highlightId === a.id
                        ? 'ring-2 ring-amber-400 border-amber-300 relative z-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}>
                    <div className="p-5">
                      {highlightId === a.id && (
                        <span className="inline-flex items-center gap-1.5 mb-3 px-2 py-1 rounded-md bg-amber-50 text-amber-800 text-xs font-medium">
                          <TriangleAlert className="w-3.5 h-3.5" /> Handlungsbedarf
                        </span>
                      )}
                      {/* Header */}
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-sm font-semibold text-slate-900 truncate">{a.projekt || 'Unbenannt'}</h3>
                            <Tooltip text={ps.grade === 'F' ? 'Verlust – Ausgaben > Einnahmen' : `Profit Score: ${ps.grade} (Gewinnmarge: ${margin.toFixed(1)}%)`}>
                              <span className="inline-flex items-center justify-center w-6 h-5 rounded text-[11px] font-semibold shrink-0"
                                style={{ color: ps.gradeColor, backgroundColor: ps.gradeBg }}>
                                {ps.grade}
                              </span>
                            </Tooltip>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-medium ${sst.badge}`}>
                              <span className={`inline-block w-1.5 h-1.5 rounded-full ${sst.dot}`} />
                              {a.status || 'Geplant'}
                            </span>
                            <span className="truncate">{a.kunde || 'Kein Kunde'} · {a.datum || '–'}</span>
                          </div>
                        </div>
                      </div>

                      {/* KPI Row */}
                      <div className="grid grid-cols-4 divide-x divide-slate-100 border-y border-slate-100 py-3 mb-4">
                        <div className="px-1 first:pl-0 min-w-0">
                          <p className="text-[11px] font-medium text-slate-400 mb-0.5">{profit >= 0 ? 'Gewinn' : 'Verlust'}</p>
                          <p className={`text-sm font-semibold tabular-nums truncate ${profit >= 0 ? 'text-slate-900' : 'text-red-600'}`}>
                            {formatCurrency(profit)}
                          </p>
                        </div>
                        <div className="px-2 min-w-0">
                          <p className="text-[11px] font-medium text-slate-400 mb-0.5">Umsatz</p>
                          <p className="text-sm font-semibold text-slate-900 tabular-nums truncate">{formatCurrency(rev)}</p>
                        </div>
                        <div className="px-2 min-w-0">
                          <p className="text-[11px] font-medium text-slate-400 mb-0.5">Soll</p>
                          <p className="text-sm font-semibold text-slate-900 tabular-nums truncate">{h.toFixed(1)} h</p>
                        </div>
                        {(() => { const istH = assignmentHours[a.id] ? assignmentHours[a.id] / 60 : 0; const over = istH > h; return (
                        <div className="px-2 min-w-0">
                          <p className="text-[11px] font-medium text-slate-400 mb-0.5">Ist</p>
                          <Tooltip text={over ? 'Achtung: Überstunden! Ist > Soll' : 'Tatsächlich erfasste Arbeitszeit aus den Clock-In/Out-Einträgen der Mitarbeiter (abzgl. Pausen)'}>
                            <p className={`text-sm font-semibold tabular-nums truncate flex items-center gap-1 ${over ? 'text-red-600' : 'text-slate-900'}`}>
                              {over && <TriangleAlert className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                              {assignmentHours[a.id] ? `${istH.toFixed(1)} h` : <span className="text-slate-300">–</span>}
                            </p>
                          </Tooltip>
                        </div>
                        );})()}
                      </div>

                      {/* Team + Marge */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center -space-x-1.5">
                          {Array.isArray(a.mitarbeiter) && a.mitarbeiter.slice(0, 4).map((name: string, mi: number) => {
                            const emp = employees.find((e: any) => e.name === name);
                            const img = emp?.imageUrl;
                            return img?.startsWith('https://') || img?.startsWith('data:image/') ? (
                              <img key={mi} src={img} alt="" title={name} className="w-6 h-6 rounded-full object-cover ring-2 ring-white shrink-0"
                                style={{ zIndex: 4 - mi }} />
                            ) : (
                              <span key={mi} title={name} className="w-6 h-6 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[10px] font-medium ring-2 ring-white shrink-0"
                                style={{ zIndex: 4 - mi }}>
                                {name.charAt(0).toUpperCase()}
                              </span>
                            );
                          })}
                          {Array.isArray(a.mitarbeiter) && a.mitarbeiter.length > 4 && (
                            <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-medium text-slate-500 ring-2 ring-white">
                              +{a.mitarbeiter.length - 4}
                            </span>
                          )}
                          {(!Array.isArray(a.mitarbeiter) || a.mitarbeiter.length === 0) && (
                            <span className="text-xs text-slate-400">Kein Team</span>
                          )}
                        </div>
                        <Tooltip text={`Gewinnmarge = (Gewinn ÷ Umsatz) × 100 → (${formatCurrency(profit)} ÷ ${formatCurrency(rev)}) × 100 = ${margin.toFixed(1)}%`}>
                          <span className={`text-xs font-medium tabular-nums cursor-default ${profit >= 0 ? 'text-slate-500' : 'text-red-600'}`}>
                            {margin.toFixed(1)} % Marge
                          </span>
                        </Tooltip>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                        <div className="flex items-center gap-1">
                          <Tooltip text="Bearbeiten">
                            <button onClick={() => { setEditing(a); setShowModal(true); }}
                              className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                              <Pencil className="w-4 h-4" />
                            </button>
                          </Tooltip>
                          <Tooltip text="Team verwalten">
                            <button onClick={() => handleOpenTeam(a)}
                              className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                              <Users className="w-4 h-4" />
                            </button>
                          </Tooltip>
                          <Tooltip text="Rechnung erstellen">
                            <button onClick={() => handleInvoice(a)}
                              className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                              <FileText className="w-4 h-4" />
                            </button>
                          </Tooltip>
                          <Tooltip text="Als CSV exportieren">
                            <button onClick={() => handleCSV(a)}
                              className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                              <Download className="w-4 h-4" />
                            </button>
                          </Tooltip>
                          <Tooltip text="Löschen">
                            <button onClick={() => setDeleting(a.id)}
                              className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </Tooltip>
                        </div>
                        <button onClick={() => quickComplete(a)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                            a.status === 'Abgeschlossen'
                              ? 'text-slate-700 border-slate-300 bg-white hover:bg-slate-50'
                              : 'text-teal-700 border-teal-200 bg-teal-50 hover:bg-teal-100'
                          }`}>
                          {a.status === 'Abgeschlossen' ? <Eye className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                          {a.status === 'Abgeschlossen' ? 'Wieder öffnen' : 'Abschließen'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {showInvoice === a.id && invoiceHtml && (
                    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
                      <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                          <h3 className="text-base font-semibold text-slate-900">Rechnungsvorschau</h3>
                          <div className="flex gap-2">
                            {invoiceXml && (
                              <button onClick={() => downloadZugferdPDF(invoiceHtml, invoiceXml, invoiceFileName)} className={ui.btnPrimary}>
                                <Download className="w-3.5 h-3.5" />
                                E-Rechnung PDF
                              </button>
                            )}
                            <button onClick={() => downloadPDF(invoiceHtml, invoiceFileName)}
                              className="px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg transition-colors">
                              PDF (ohne XML)
                            </button>
                            <button onClick={() => { setShowInvoice(null); setInvoiceHtml(''); setInvoiceXml(''); setInvoiceNum(''); }} className={ui.btnGhost}>
                              Schließen
                            </button>
                          </div>
                        </div>
                        <div className="flex-1 overflow-auto bg-slate-50 p-4">
                          <iframe srcDoc={invoiceHtml} sandbox="allow-same-origin" className="w-full h-full bg-white rounded-lg border border-slate-200" style={{ minHeight: '70vh' }} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {filteredByMonth.length === 0 && (
              <div className="col-span-full bg-white rounded-xl border border-slate-200 p-16 text-center">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                  <Calendar className="w-5 h-5 text-slate-400" />
                </div>
                <p className="text-sm font-medium text-slate-900 mb-1">{search ? 'Keine Ergebnisse' : 'Noch keine Termine'}</p>
                <p className="text-sm text-slate-500 mb-5">{search ? 'Passe deine Suche oder Filter an.' : 'Lege deinen ersten Termin an, um loszulegen.'}</p>
                {!search && (
                  <button onClick={() => { setEditing(null); setShowModal(true); }} className={ui.btnPrimary}>
                    <Plus className="w-4 h-4" />
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-slate-900">Termin löschen?</h3>
            <p className="text-slate-500 text-sm mt-2">Diese Aktion kann nicht rückgängig gemacht werden.</p>
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


