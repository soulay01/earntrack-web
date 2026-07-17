'use client';

import { useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';
import PageSkeleton from '@/components/skeletons/PageSkeleton';
import { calculateCustomerProfitScore } from '@/lib/smartPricing';
import { formatCurrency, parseDate } from '@/lib/calculations';
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_COLORS, type InvoiceStatus } from '@/lib/dunning';
import { ArrowLeft, Mail, Phone, MapPin, StickyNote } from 'lucide-react';

export default function CustomerDetailPage() {
  const { user, loading, customers, assignments } = useData();
  const router = useRouter();
  const params = useParams();
  const customerId = params?.id as string;

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [user, loading, router]);

  const customer = useMemo(() => (customers || []).find((c: any) => c.id === customerId), [customers, customerId]);

  const history = useMemo(() => {
    if (!customer) return [];
    const name = (customer.name || '').trim().toLowerCase();
    return (assignments || [])
      .filter((a: any) => (a.kunde || '').trim().toLowerCase() === name)
      .sort((a: any, b: any) => {
        const da = parseDate(a.datum)?.getTime() || 0;
        const db = parseDate(b.datum)?.getTime() || 0;
        return db - da;
      });
  }, [customer, assignments]);

  const score = useMemo(() => customer ? calculateCustomerProfitScore(customer, assignments || []) : null, [customer, assignments]);

  if (loading || !user) return <PageSkeleton variant="table" maxWidth="max-w-4xl" />;

  if (!customer) {
    return (
      <div className="flex h-screen bg-slate-50">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <div className="px-4 md:px-8 py-10 max-w-4xl mx-auto text-center">
            <p className="text-slate-500 text-sm mb-4">Kunde nicht gefunden.</p>
            <button onClick={() => router.push('/customers')} className="text-teal-600 hover:underline text-sm font-medium">&larr; Zurück zu Kunden</button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="px-4 md:px-8 py-6 md:py-10 max-w-4xl mx-auto space-y-6">
          <button onClick={() => router.push('/customers')} className="inline-flex items-center gap-1.5 text-sm text-teal-600 hover:text-teal-700 font-semibold hover:underline">
            <ArrowLeft className="w-4 h-4" /> Zurück zu Kunden
          </button>

          <div className="bg-white border border-slate-200 rounded-2xl p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-4">
                {customer.imageUrl?.startsWith('https://') || customer.imageUrl?.startsWith('data:image/') ? (
                  <img src={customer.imageUrl} alt="" className="w-14 h-14 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-slate-100 text-slate-600 text-xl font-semibold flex items-center justify-center shrink-0">
                    {(customer.name || '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <h1 className="text-xl font-semibold text-slate-900 tracking-tight">{customer.name || 'Unbekannt'}</h1>
                  <div className="flex flex-col gap-0.5 mt-1 text-sm text-slate-500">
                    {customer.email && <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> {customer.email}</span>}
                    {customer.telefon && <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> {customer.telefon}</span>}
                    {customer.adresse && <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> {customer.adresse}</span>}
                  </div>
                </div>
              </div>
              {score && score.assignmentCount > 0 && (
                <div className="text-center px-4 py-2.5 rounded-xl shrink-0" style={{ background: score.gradeBg }}>
                  <p className="text-2xl font-bold leading-none" style={{ color: score.gradeColor }}>{score.grade}</p>
                  <p className="text-[10px] font-semibold text-slate-500 mt-1 uppercase tracking-wide">Profit Score</p>
                </div>
              )}
            </div>

            {customer.notizen && (
              <div className="mt-4 pt-4 border-t border-slate-100 flex items-start gap-2 text-sm text-slate-600">
                <StickyNote className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <p className="whitespace-pre-wrap">{customer.notizen}</p>
              </div>
            )}
          </div>

          {score && score.assignmentCount > 0 && (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-xs text-slate-400 font-medium mb-1">Gesamtumsatz</p>
                <p className="text-lg font-semibold text-slate-900 tabular-nums">{formatCurrency(score.totalRevenue)}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-xs text-slate-400 font-medium mb-1">Aufträge</p>
                <p className="text-lg font-semibold text-slate-900 tabular-nums">{score.assignmentCount}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-xs text-slate-400 font-medium mb-1">Ø Marge</p>
                <p className="text-lg font-semibold text-slate-900 tabular-nums">{score.avgMargin.toFixed(0)}%</p>
              </div>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/60">
              <h2 className="text-sm font-semibold text-slate-900">Auftragshistorie</h2>
            </div>
            {history.length === 0 ? (
              <p className="p-8 text-center text-sm text-slate-500">Noch keine Aufträge für diesen Kunden.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {history.map((a: any) => {
                  const st = (a.invoiceStatus || 'offen') as InvoiceStatus;
                  const colors = INVOICE_STATUS_COLORS[st] || INVOICE_STATUS_COLORS.offen;
                  return (
                    <div key={a.id} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-slate-50 transition-colors">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{a.projekt || 'Unbenannt'}</p>
                        <p className="text-xs text-slate-400">{a.datum || '–'}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-lg" style={{ background: colors.bg, color: colors.text }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: colors.dot }} />
                          {INVOICE_STATUS_LABELS[st]}
                        </span>
                        <span className="text-sm font-semibold text-slate-900 tabular-nums w-20 text-right">{formatCurrency(Number(String(a.umsatz).replace(/[€\s]/g, '').replace(',', '.')) || 0)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
