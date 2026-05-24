'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';
import { formatCurrency } from '@/lib/utils';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
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

function parseRevenue(val: any): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const raw = val.replace(/[€\s]/g, '').trim();
    if (!raw) return 0;
    if (raw.includes(',') && raw.includes('.')) return parseFloat(raw.replace(/\./g, '').replace(',', '.')) || 0;
    if (raw.includes(',') && !raw.includes('.')) return parseFloat(raw.replace(',', '.')) || 0;
    return parseFloat(raw) || 0;
  }
  return 0;
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
  const { user, loading, assignments, company, companyId } = useData();
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | 'alle'>('alle');
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null);
  const [companyInfo, setCompanyInfo] = useState<any>(null);

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [user, loading, router]);
  useEffect(() => { if (!companyInfo && companyId) {
    getDoc(doc(db, 'companies', companyId)).then(snap => {
      if (snap.exists()) setCompanyInfo(snap.data());
    });
  }}, [companyId, companyInfo]);

  if (loading || !user) return null;

  const invoices = useMemo(() => {
    return assignments
      .filter((a: any) => parseRevenue(a.umsatz) > 0)
      .map((a: any) => ({
        ...a,
        _revenue: parseRevenue(a.umsatz),
        _hours: parseFloat(String(a.stunden)) || 0,
        _rate: parseFloat(String(a.stundenlohn)) || 0,
        _cost: (parseFloat(String(a.stunden)) || 0) * (parseFloat(String(a.stundenlohn)) || 0),
        _profit: parseRevenue(a.umsatz) - (parseFloat(String(a.stunden)) || 0) * (parseFloat(String(a.stundenlohn)) || 0),
        _margin: parseRevenue(a.umsatz) > 0 ? ((parseRevenue(a.umsatz) - (parseFloat(String(a.stunden)) || 0) * (parseFloat(String(a.stundenlohn)) || 0)) / parseRevenue(a.umsatz)) * 100 : 0,
        _invoiceStatus: (a.invoiceStatus || 'offen') as InvoiceStatus,
        _dueDate: a.invoiceDueDate || addDays(new Date(a.datum ? (() => { const p = a.datum.split('.'); if (p.length === 3) return new Date(+p[2], +p[1] - 1, +p[0]); return new Date(); })() : new Date()), 14).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }),
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
      await updateDoc(doc(db, 'assignments', assignmentId), {
        invoiceStatus: newStatus,
        ...(newStatus === 'gesendet' ? { invoiceSentDate: new Date().toISOString() } : {}),
        ...(newStatus === 'bezahlt' ? { invoicePaidDate: new Date().toISOString() } : {}),
        ...(newStatus === 'mahnung_1' || newStatus === 'mahnung_2' ? { invoiceDunningDate: new Date().toISOString() } : {}),
      });
    } catch (e) {
      console.error('Fehler beim Aktualisieren:', e);
    } finally {
      setStatusUpdating(null);
    }
  }

  async function handleDunning(assignment: any, level: 1 | 2) {
    try {
      const ci = companyInfo || { companyName: company?.companyName || company?.name || 'Mein Unternehmen' };
      const html = generateDunningLetterHTML(assignment, ci, level, assignment?._dueDate || '');
      await updateStatus(assignment.id, level === 1 ? 'mahnung_1' : 'mahnung_2');
      const fileLabel = level === 1 ? 'Zahlungserinnerung' : '2_Mahnung';
      downloadFile(html, `${fileLabel}_${assignment.projekt || assignment.id}.html`, 'text/html');
    } catch (e) { console.error('Dunning error:', e); }
  }

  const allStatuses: (InvoiceStatus | 'alle')[] = ['alle', 'offen', 'gesendet', 'mahnung_1', 'mahnung_2', 'bezahlt', 'storniert'];
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    assignments.filter((a: any) => parseRevenue(a.umsatz) > 0).forEach((a: any) => {
      const s = a.invoiceStatus || 'offen';
      counts[s] = (counts[s] || 0) + 1;
    });
    counts.alle = Object.values(counts).reduce((s: number, c) => s + c, 0);
    return counts;
  }, [assignments]);

  const text1 = '#0f172a';
  const text2 = '#64748b';

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="px-8 py-8 max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6 animate-fadeIn">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Rechnungen &amp; Mahnwesen</h1>
              <p className="text-slate-500 text-sm mt-1">{invoices.length} Rechnungen</p>
            </div>
          </div>

          {/* Summary KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6 animate-fadeIn">
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
          <div className="flex flex-wrap gap-2 mb-6 animate-fadeIn">
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

          {/* Invoice List */}
          <div className="space-y-3 animate-slideUp">
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
                  className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 overflow-hidden animate-slideUp"
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
                            {a._profit >= 0 ? '+' : ''}{formatCurrency(a._profit)} · {a._margin.toFixed(1)}% Marge
                          </p>
                        </div>

                        {/* Actions */}
                        {!isPaid && (
                          <div className="flex gap-1.5">
                            {nextStatus && (
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
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-green-700 bg-green-50 border border-green-200">
                            ✓ {status === 'bezahlt' ? 'Bezahlt' : 'Storniert'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
