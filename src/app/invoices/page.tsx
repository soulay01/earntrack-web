'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';
import UpgradeModal from '@/components/UpgradeModal';
import { RefreshCw } from 'lucide-react';
import { formatCurrency, parseGermanCurrency } from '@/lib/utils';
import { doc, updateDoc, getDoc, addDoc, collection } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { loadRecurringConfigs, saveRecurringConfig, deleteRecurringConfig, updateRecurringConfig, getNextDate, formatDateStr as fmtRecDate, isDue, type RecurringConfig } from '@/lib/recurringInvoices';
import { getFeatureFlag } from '@/lib/plans';
import { logUsage } from '@/lib/usageLog';
import { generateInvoiceHTML, generateSequentialInvoiceNumber } from '@/lib/estimateUtils';
import { generateZugferdXML } from '@/lib/zugferd';
import { downloadZugferdPDF } from '@/lib/pdf';
import {
  InvoiceStatus,
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_COLORS,
  getNextDunningStatus,
  generateDunningLetterHTML,
} from '@/lib/dunning';

function downloadFile(content: string, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName; a.click();
  URL.revokeObjectURL(url);
}

function formatDateStr(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

function addDays(date: Date, days: number): Date {
  const r = new Date(date);
  r.setDate(r.getDate() + days);
  return r;
}

export default function InvoicesPage() {
  const { user, loading, assignments, company, companyId, customers } = useData();
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | 'alle'>('alle');
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null);
  const [companyInfo, setCompanyInfo] = useState<any>(null);
  const [invoiceTemplate, setInvoiceTemplate] = useState<any>({});
  const [downloading, setDownloading] = useState<string | null>(null);
  const [recurringConfigs, setRecurringConfigs] = useState<RecurringConfig[]>([]);
  const [showRecurringDialog, setShowRecurringDialog] = useState(false);
  const [recurringName, setRecurringName] = useState('');
  const [recurringInterval, setRecurringInterval] = useState<'monthly' | 'quarterly' | 'yearly'>('monthly');
  const [recurringForAssignment, setRecurringForAssignment] = useState<any>(null);
  const [dueBannerDismissed, setDueBannerDismissed] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState<'dunning' | 'recurring' | null>(null);

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [user, loading, router]);
  useEffect(() => { if (!companyInfo && companyId) {
    let cancelled = false;
    getDoc(doc(db, 'companies', companyId)).then(snap => {
      if (cancelled) return;
      if (snap.exists()) setCompanyInfo(snap.data());
    });
    getDoc(doc(db, 'companies', companyId, 'settings', 'invoice')).then(snap => {
      if (cancelled) return;
      if (snap.exists()) setInvoiceTemplate(snap.data());
    });
    loadRecurringConfigs(companyId).then(r => {
      if (cancelled) return;
      setRecurringConfigs(r);
    }).catch((e) => console.error('Failed to load recurring configs:', e));
    return () => { cancelled = true; };
  }}, [companyId, companyInfo]);

  const dueRecurring = useMemo(() => {
    if (dueBannerDismissed) return [];
    return recurringConfigs.filter(c => isDue(c));
  }, [recurringConfigs, dueBannerDismissed]);

  const handleSetupRecurring = async () => {
    if (!companyId || !recurringForAssignment || !recurringName.trim()) return;
    await saveRecurringConfig(companyId, {
      name: recurringName.trim(),
      customerId: recurringForAssignment.kunde || '',
      customerName: recurringForAssignment.kunde || '',
      projekt: recurringForAssignment.projekt || '',
      umsatz: recurringForAssignment._revenue || 0,
      stunden: recurringForAssignment._hours || 0,
      stundenlohn: recurringForAssignment._rate || 0,
      mitarbeiter: Array.isArray(recurringForAssignment.mitarbeiter) ? recurringForAssignment.mitarbeiter : [recurringForAssignment.mitarbeiter || ''].filter(Boolean),
      interval: recurringInterval,
      intervalCount: 1,
      nextInvoiceDate: getNextDate(new Date().toISOString().split('T')[0], recurringInterval, 1),
      lastInvoiceDate: null,
    });
    setRecurringConfigs(prev => [...prev, {
      id: 'temp', companyId: companyId!, name: recurringName.trim(),
      customerId: '', customerName: recurringForAssignment.kunde || '',
      projekt: recurringForAssignment.projekt || '',
      umsatz: 0, stunden: 0, stundenlohn: 0, mitarbeiter: [],
      interval: recurringInterval, intervalCount: 1,
      nextInvoiceDate: '', lastInvoiceDate: null,
    } as RecurringConfig]);
    setShowRecurringDialog(false);
    setRecurringName('');
    setRecurringForAssignment(null);
    if (companyId) loadRecurringConfigs(companyId).then(setRecurringConfigs).catch((e) => console.error('Failed to load recurring configs:', e));
  };

  const handleGenerateDue = async (config: RecurringConfig) => {
    if (!companyId) return;
    const today = new Date().toISOString().split('T')[0];
    // Use sequential invoice counter instead of random number (required by §14 UStG)
    const invoiceNumber = companyId
      ? await generateSequentialInvoiceNumber(companyId, 'R-')
      : `R-${today.replace(/-/g, '')}-${Date.now().toString(36).toUpperCase().slice(-4)}`;
    try {
      await addDoc(collection(db, 'invoices'), {
        companyId,
        customerId: config.customerId,
        customerName: config.customerName,
        projekt: config.projekt,
        invoiceNumber,
        status: 'offen',
        umsatz: config.umsatz,
        stunden: config.stunden,
        stundenlohn: config.stundenlohn,
        mitarbeiter: config.mitarbeiter,
        invoiceDate: today,
      });
      logUsage('invoice_created');
      const nextDate = getNextDate(today, config.interval, config.intervalCount);
      if (config.id) await updateRecurringConfig(companyId, config.id, { nextInvoiceDate: nextDate, lastInvoiceDate: today });
    } catch (e) {
    }
  };

  const handleDeleteRecurring = async (configId: string) => {
    if (!companyId || !confirm('Wiederkehrende Konfiguration löschen?')) return;
    await deleteRecurringConfig(companyId, configId);
    setRecurringConfigs(prev => prev.filter(c => c.id !== configId));
  };

  const invoices = useMemo(() => {
    return assignments
      .filter((a: any) => parseGermanCurrency(a.umsatz) > 0)
      .map((a: any) => ({
        ...a,
        _revenue: parseGermanCurrency(a.umsatz),
        _hours: parseFloat(String(a.stunden)) || 0,
        _rate: parseFloat(String(a.stundenlohn)) || 0,
        _cost: (parseFloat(String(a.stunden)) || 0) * (parseFloat(String(a.stundenlohn)) || 0),
        _profit: parseGermanCurrency(a.umsatz) - (parseFloat(String(a.stunden)) || 0) * (parseFloat(String(a.stundenlohn)) || 0),
        _margin: parseGermanCurrency(a.umsatz) > 0 ? ((parseGermanCurrency(a.umsatz) - (parseFloat(String(a.stunden)) || 0) * (parseFloat(String(a.stundenlohn)) || 0)) / parseGermanCurrency(a.umsatz)) * 100 : 0,
        _invoiceStatus: (a.invoiceStatus || 'offen') as InvoiceStatus,
        _dueDate: a.invoiceDueDate || addDays(new Date(a.datum ? (() => { if (typeof a.datum === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(a.datum)) return new Date(+a.datum.split('-')[0], +a.datum.split('-')[1] - 1, +a.datum.split('-')[2]); const p = a.datum.split('.'); if (p.length === 3) return new Date(+p[2], +p[1] - 1, +p[0]); return new Date(); })() : new Date()), 14).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      }))
      .filter(a => statusFilter === 'alle' || a._invoiceStatus === statusFilter)
      .sort((a: any, b: any) => {
        const order: Record<string, number> = { offen: 0, gesendet: 1, mahnung_1: 2, mahnung_2: 3, bezahlt: 4, storniert: 5 };
        return (order[a._invoiceStatus] || 0) - (order[b._invoiceStatus] || 0);
      });
  }, [assignments, statusFilter]);

  const summary = useMemo(() => {
    const total = invoices.reduce((s: number, a: any) => s + a._revenue, 0);
    const open = invoices.filter((a: any) => a._invoiceStatus === 'offen' || a._invoiceStatus === 'gesendet' || a._invoiceStatus === 'mahnung_1' || a._invoiceStatus === 'mahnung_2')
      .reduce((s: number, a: any) => s + a._revenue, 0);
    const overdue = invoices.filter((a: any) => a._invoiceStatus === 'mahnung_1' || a._invoiceStatus === 'mahnung_2')
      .reduce((s: number, a: any) => s + a._revenue, 0);
    const paid = invoices.filter((a: any) => a._invoiceStatus === 'bezahlt').reduce((s: number, a: any) => s + a._revenue, 0);
    return { total, open, overdue, paid, count: invoices.length };
  }, [invoices]);

  async function updateStatus(assignmentId: string, newStatus: InvoiceStatus) {
    setStatusUpdating(assignmentId);
    try {
      const extra: Record<string, any> = {
        ...(newStatus === 'gesendet' ? { invoiceSentDate: new Date().toISOString() } : {}),
        ...(newStatus === 'bezahlt' ? { invoicePaidDate: new Date().toISOString() } : {}),
        ...(newStatus === 'mahnung_1' || newStatus === 'mahnung_2' ? { invoiceDunningDate: new Date().toISOString() } : {}),
      };
      if (newStatus === 'gesendet' && companyId) {
        const snap = await getDoc(doc(db, 'companies', companyId, 'settings', 'invoice'));
        if (snap.exists()) extra.invoiceTemplate = snap.data();
      }
      await updateDoc(doc(db, 'assignments', assignmentId), {
        invoiceStatus: newStatus,
        ...extra,
      });
    } catch (e) {
    } finally {
      setStatusUpdating(null);
    }
  }

  async function handleDunning(assignment: any, level: 1 | 2) {
    try {
      const ci = companyInfo || { companyName: company?.companyName || company?.name || 'Mein Unternehmen' };
      if (companyId) {
        const snap = await getDoc(doc(db, 'companies', companyId, 'settings', 'invoice'));
        if (snap.exists()) {
          const tmpl = snap.data();
          ci.bankName = tmpl.bankDetails?.bankName || ci.bankName || '';
          ci.iban = tmpl.bankDetails?.iban || ci.iban || '';
          ci.bic = tmpl.bankDetails?.bic || ci.bic || '';
        }
      }
      const html = generateDunningLetterHTML(assignment, ci, level, assignment?._dueDate || '');
      await updateStatus(assignment.id, level === 1 ? 'mahnung_1' : 'mahnung_2');
      const fileLabel = level === 1 ? 'Zahlungserinnerung' : '2_Mahnung';
      downloadFile(html, `${fileLabel}_${assignment.projekt || assignment.id}.html`, 'text/html');
    } catch (e) { console.error('downloadDunningLetter failed', e); }
  }

  async function handleDownloadInvoice(a: any) {
    setDownloading(a.id);
    try {
      const ci = companyInfo || {};
      let tmpl = invoiceTemplate || {};
      if (companyId) {
        const snap = await getDoc(doc(db, 'companies', companyId, 'settings', 'invoice'));
        if (snap.exists()) {
          tmpl = snap.data();
          await updateDoc(doc(db, 'assignments', a.id), { invoiceTemplate: tmpl }).catch((e) => console.error('Failed to update invoice template:', e));
        }
      }
      const companyData = {
        companyName: ci.companyName || ci.name || 'Mein Unternehmen',
        companyOwner: ci.owner || '',
        companyAddress: [ci.street, `${ci.zip || ''} ${ci.city || ''}`].filter(Boolean).join(', '),
        companyPhone: ci.phone || '', companyEmail: ci.email || '', companyWeb: ci.website || '',
        companyTaxId: ci.taxId || '', companyBankName: ci.bankName || '', companyIban: ci.iban || '', companyBic: ci.bic || '',
      };
      const isSubscribed = company?.subscriptionStatus === 'active';
      const today = new Date();
      const num = companyId ? await generateSequentialInvoiceNumber(companyId, tmpl.invoiceNumberPrefix || 'INV-') : `${tmpl.invoiceNumberPrefix || 'INV-'}${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}-${String(Math.floor(Math.random() * 99999)).padStart(5, '0')}`;
      const html = generateInvoiceHTML(a, companyData, tmpl, isSubscribed, { customers: customers || [], invoiceNumber: num });
      const hours = parseFloat(String(a.stunden)) || 0;
      const revenue = parseGermanCurrency(a.umsatz);
      const taxRate = parseFloat(tmpl.taxRate) || 19;
      const netAmount = revenue;
      const taxAmount = netAmount * (taxRate / 100);
      const grossAmount = netAmount + taxAmount;
      const invoiceDate = today.toISOString().split('T')[0];
      const xml = generateZugferdXML({
        invoiceNumber: num, invoiceDate,
        seller: {
          name: companyData.companyName, street: ci.street || '', zip: ci.zip || '',
          city: ci.city || '', taxId: ci.taxId || '', email: ci.email || '',
          phone: ci.phone || '', owner: ci.owner || '',
        },
        buyer: { name: a.kunde || 'Unbekannter Kunde' },
        lineItems: [{
          id: a.id || '', description: a.projekt || 'Dienstleistung',
          quantity: hours || 1, unitCode: hours ? 'HUR' : 'C62',
          unitPrice: hours ? revenue / hours : revenue,
          netAmount, taxPercent: taxRate,
        }],
        netTotal: netAmount, taxTotal: taxAmount, grossTotal: grossAmount,
        taxRate, paymentTerms: tmpl.footer?.paymentTerms || 'Zahlbar innerhalb von 14 Tagen ohne Abzug',
        bankDetails: {
          accountHolder: ci.owner || ci.companyName || '',
          iban: ci.iban || '', bic: ci.bic || '', bankName: ci.bankName || '',
        },
      });
      await downloadZugferdPDF(html, xml, `Rechnung_${num}.html`);
    } catch (e) { console.error('handleDownloadInvoice failed', e); }
    finally { setDownloading(null); }
  }

  const allStatuses: (InvoiceStatus | 'alle')[] = ['alle', 'offen', 'gesendet', 'mahnung_1', 'mahnung_2', 'bezahlt', 'storniert'];
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    assignments.filter((a: any) => parseGermanCurrency(a.umsatz) > 0).forEach((a: any) => {
      const s = a.invoiceStatus || 'offen';
      counts[s] = (counts[s] || 0) + 1;
    });
    counts.alle = Object.values(counts).reduce((s: number, c) => s + c, 0);
    return counts;
  }, [assignments]);

  if (loading || !user) return null;

  const text1 = '#0f172a';
  const text2 = '#64748b';

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="px-4 md:px-8 py-4 md:py-8 max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6 ">
            <div>
              <h1 className="text-xl md:text-3xl font-bold text-slate-900 tracking-tight">Rechnungen &amp; Mahnwesen</h1>
              <p className="text-slate-500 text-sm mt-1">{invoices.length} Rechnungen</p>
            </div>
          </div>

          {/* Summary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 ">
            {[
              { label: 'Gesamtumsatz (offen)', value: formatCurrency(summary.open), color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
              { label: 'Überfällig', value: formatCurrency(summary.overdue), color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
              { label: 'Bereits bezahlt', value: formatCurrency(summary.paid), color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
              { label: 'Alle offenen Posten', value: formatCurrency(summary.open), color: '#0f172a', bg: '#f1f5f9', border: '#e2e8f0' },
            ].map((kpi, i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-all">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{kpi.label}</p>
                <p className="text-2xl font-extrabold mt-2" style={{ color: kpi.color }}>{kpi.value}</p>
              </div>
            ))}
          </div>

          {/* Status Filter */}
          <div className="flex flex-wrap gap-2 mb-6 ">
            {allStatuses.map(s => {
              const label = s === 'alle' ? 'Alle' : INVOICE_STATUS_LABELS[s as InvoiceStatus];
              const color = s === 'alle' ? '#64748b' : INVOICE_STATUS_COLORS[s as InvoiceStatus].text;
              const bg = s === 'alle' ? '#f1f5f9' : INVOICE_STATUS_COLORS[s as InvoiceStatus].bg;
              const active = statusFilter === s;
              return (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all active:scale-[0.95] ${
                    active
                      ? 'ring-2 ring-offset-1 shadow-sm scale-[1.02]'
                      : 'hover:bg-white hover:shadow-sm'
                  }`}
                  style={{ backgroundColor: active ? bg : '#ffffff', borderColor: active ? color : '#e2e8f0', color: active ? color : '#64748b' }}>
                  <span>{label}</span>
                  <span className="text-[10px] opacity-60">({statusCounts[s as string] || 0})</span>
                </button>
              );
            })}
          </div>

          {/* Recurring Invoices */}
          {dueRecurring.length > 0 && (
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl border border-amber-200 shadow-sm p-5  mb-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-5 h-5 text-slate-500" />
                  <h3 className="text-sm font-bold text-amber-800">{dueRecurring.length} wiederkehrende Rechnung{ dueRecurring.length > 1 ? 'en' : '' } fällig</h3>
                </div>
                <button onClick={() => setDueBannerDismissed(true)}
                  className="text-xs text-amber-500 hover:text-amber-700 font-medium transition-colors">✕</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {dueRecurring.map(rc => (
                  <div key={rc.id} className="flex items-center gap-3 bg-white rounded-xl border border-amber-200 px-4 py-2.5 shadow-sm">
                    <div>
                      <p className="text-sm font-bold text-slate-900">{rc.name}</p>
                      <p className="text-xs text-slate-500">{fmtRecDate(rc.nextInvoiceDate)} · {formatCurrency(rc.umsatz)}</p>
                    </div>
                    <button onClick={() => handleGenerateDue(rc)}
                      className="px-3 py-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg active:scale-[0.95] transition-all">
                      Generieren
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {recurringConfigs.length > 0 && (
            <details className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-4 ">
              <summary className="px-6 py-4 bg-gradient-to-r from-slate-50 to-slate-100 cursor-pointer flex items-center justify-between">
                <span className="text-sm font-bold text-slate-700"><RefreshCw className="inline w-4 h-4 mr-1" /> Wiederkehrende Rechnungen ({recurringConfigs.length})</span>
                <span className="text-xs text-slate-400">Klicken zum Aufklappen</span>
              </summary>
              <div className="divide-y divide-slate-100">
                {recurringConfigs.map(rc => (
                  <div key={rc.id} className="flex items-center justify-between px-6 py-3 hover:bg-slate-50 transition-all">
                    <div>
                      <p className="text-sm font-bold text-slate-900">{rc.name}</p>
                      <p className="text-xs text-slate-400">
                        {rc.interval === 'monthly' ? 'Monatlich' : rc.interval === 'quarterly' ? 'Vierteljährlich' : 'Jährlich'}
                        {rc.nextInvoiceDate && ` · Nächste: ${fmtRecDate(rc.nextInvoiceDate)}`}
                        {' · '}{formatCurrency(rc.umsatz)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {isDue(rc) && (
                        <button onClick={() => handleGenerateDue(rc)}
                          className="px-3 py-1.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg active:scale-[0.95] transition-all">
                          Jetzt generieren
                        </button>
                      )}
                      <button onClick={() => rc.id && handleDeleteRecurring(rc.id)}
                        className="px-3 py-1.5 text-xs font-bold text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all">
                        Löschen
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* Invoice List */}
          <div className="space-y-3 ">
            {invoices.length === 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center shadow-sm">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                </div>
                <p className="text-slate-500 text-base mb-4">Keine Rechnungen gefunden</p>
              </div>
            )}
            {invoices.map((a: any, i: number) => {
              const status = (a._invoiceStatus || 'offen') as InvoiceStatus;
              const colors = INVOICE_STATUS_COLORS[status];
              const nextStatus = getNextDunningStatus(status);
              const isPaid = status === 'bezahlt' || status === 'storniert';
              return (
                <div key={a.id}
                  className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 overflow-hidden "
                  style={{ animationDelay: `${i * 40}ms` }}>
                  <div className="p-5">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      {/* Left: Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-base font-bold text-slate-900 truncate">{a.projekt || 'Unbenannt'}</h3>
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold"
                            style={{ backgroundColor: colors.bg, color: colors.text }}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: colors.dot }} />
                            {INVOICE_STATUS_LABELS[status]}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                          <span className="text-slate-500">{a.kunde || 'Kein Kunde'}</span>
                          <span className="text-slate-300">|</span>
                          <span className="text-slate-500">{a.datum || '–'}</span>
                          {!isPaid && (
                            <>
                              <span className="text-slate-300">|</span>
                              <span className="text-amber-600 font-semibold">Fällig: {a._dueDate}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Right: Amount + Actions */}
                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-right">
                          <p className="text-lg font-extrabold text-slate-900">{formatCurrency(a._revenue)}</p>
                          <p className="text-xs text-slate-400">
                            {formatCurrency(a._profit)} · {a._margin.toFixed(1)}% Marge
                          </p>
                        </div>

                        {/* Actions */}
                          <div className="flex gap-1.5">
                            <button onClick={() => handleDownloadInvoice(a)} disabled={downloading === a.id}
                              className="px-3 py-2 rounded-xl text-xs font-bold text-teal-700 bg-teal-50 border border-teal-200 hover:bg-teal-100 active:scale-[0.95] disabled:opacity-50 transition-all flex items-center gap-1">
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                              {downloading === a.id ? '...' : 'E-Rechnung PDF'}
                            </button>
                            {!isPaid && (
                              <button onClick={() => {
                                if (!getFeatureFlag(company?.subscriptionPlan, 'recurringInvoices')) {
                                  setShowUpgrade('recurring'); return;
                                }
                                setRecurringForAssignment(a);
                                setRecurringName(`${a.projekt || ''} - ${a.kunde || ''}`);
                                setRecurringInterval('monthly');
                                setShowRecurringDialog(true);
                              }}
                                className="px-3 py-2 rounded-xl text-xs font-bold text-purple-700 bg-purple-50 border border-purple-200 hover:bg-purple-100 active:scale-[0.95] transition-all">
                                <RefreshCw className="inline w-4 h-4 mr-1" /> Wiederkehrend
                              </button>
                            )}
                        {!isPaid && (
                          <div className="flex gap-1.5">
                            {nextStatus && ((nextStatus !== 'mahnung_1' && nextStatus !== 'mahnung_2') || getFeatureFlag(company?.subscriptionPlan, 'dunning')) && (
                              <button onClick={() => {
                                if (nextStatus === 'mahnung_1') handleDunning(a, 1);
                                else if (nextStatus === 'mahnung_2') handleDunning(a, 2);
                                else updateStatus(a.id, nextStatus);
                              }} disabled={statusUpdating === a.id}
                                className="px-3 py-2 rounded-xl text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 hover:shadow-md active:scale-[0.95] disabled:opacity-50 transition-all flex items-center gap-1.5">
                                {statusUpdating === a.id ? '...' : nextStatus === 'gesendet' ? 'Als gesendet' : nextStatus === 'bezahlt' ? 'Als bezahlt' : nextStatus === 'mahnung_1' ? 'Mahnung senden' : '2. Mahnung senden'}
                              </button>
                            )}
                            {nextStatus === 'bezahlt' && (
                              <button onClick={() => updateStatus(a.id, 'bezahlt')} disabled={statusUpdating === a.id}
                                className="px-3 py-2 rounded-xl text-xs font-bold text-green-700 bg-green-50 border border-green-200 hover:bg-green-100 active:scale-[0.95] transition-all">
                                Bezahlt
                              </button>
                            )}
                            <button onClick={() => updateStatus(a.id, 'storniert')} disabled={statusUpdating === a.id}
                              className="px-3 py-2 rounded-xl text-xs font-bold text-slate-400 bg-slate-50 border border-slate-200 hover:bg-slate-100 active:scale-[0.95] disabled:opacity-50 transition-all">
                              Stornieren
                            </button>
                          </div>
                        )}
                        {isPaid && (
                          <div className="flex gap-1.5">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-green-700 bg-green-50 border border-green-200">
                              ✓ {status === 'bezahlt' ? 'Bezahlt' : 'Storniert'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        </div>
      </main>

      <UpgradeModal
        open={showUpgrade === 'dunning'}
        onClose={() => setShowUpgrade(null)}
        dismissable
        title="Mahnwesen nicht enthalten"
        description="Automatisches Mahnwesen ist im Solo-Plan nicht enthalten. Upgrade auf Team oder Business für Zahlungserinnerungen und Mahnläufe."
        feature="dunning"
      />
      <UpgradeModal
        open={showUpgrade === 'recurring'}
        onClose={() => setShowUpgrade(null)}
        dismissable
        title="Wiederkehrende Rechnungen"
        description="Wiederkehrende Rechnungen sind im Solo-Plan nicht enthalten. Upgrade für automatische Rechnungsläufe."
        feature="recurringInvoices"
      />

      {showRecurringDialog && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 ">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md  p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-4"><RefreshCw className="inline w-5 h-5 mr-2" /> Wiederkehrende Rechnung</h3>
            {recurringForAssignment && (
              <p className="text-sm text-slate-500 mb-4">Basiert auf: <span className="font-bold text-slate-700">{recurringForAssignment.projekt}</span></p>
            )}
            <label className="block text-sm font-bold text-slate-700 mb-1.5">Name</label>
            <input value={recurringName} onChange={e => setRecurringName(e.target.value)}
              placeholder="z.B. Miete Büro" className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100/50 transition-all shadow-sm mb-4" />
            <label className="block text-sm font-bold text-slate-700 mb-1.5">Intervall</label>
            <div className="flex gap-2 mb-6">
              {(['monthly', 'quarterly', 'yearly'] as const).map(iv => (
                <button key={iv} onClick={() => setRecurringInterval(iv)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-[0.97] ${
                    recurringInterval === iv ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-lg shadow-teal-200/50' : 'bg-white border border-slate-200 text-slate-600 hover:border-teal-200'
                  }`}>
                  {iv === 'monthly' ? 'Monatlich' : iv === 'quarterly' ? 'Vierteljährlich' : 'Jährlich'}
                </button>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setShowRecurringDialog(false); setRecurringForAssignment(null); }}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 active:scale-[0.97] rounded-xl transition-all">
                Abbrechen
              </button>
              <button onClick={handleSetupRecurring} disabled={!recurringName.trim()}
                className="px-4 py-2 text-sm font-bold bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 active:scale-[0.97] text-white rounded-xl transition-all shadow-md disabled:opacity-50">
                Einrichten
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
