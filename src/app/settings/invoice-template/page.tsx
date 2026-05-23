'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const defaultTemplate = {
  invoiceTitle: 'Rechnung',
  invoiceNumberPrefix: 'INV-',
  metaLabels: { invoiceNumber: 'Rechnungs-Nr.', orderNumber: 'Auftrags-Nr.', commission: 'Kommission', customerNumber: 'Kunden-Nr.', orderRef: 'Bestell-Nr.', invoiceDate: 'Rechnungsdatum', deliveryDate: 'Lieferdatum', processor: 'Bearbeiter' },
  tableHeaders: { position: 'Pos.', articleNumber: 'Art.-Nr.', description: 'Bezeichnung', quantity: 'Menge', unit: 'Einheit', unitPrice: 'E-Preis €', total: 'Gesamt €' },
  defaultUnit: 'Std.',
  taxRate: '19',
  summaryLabels: { net: 'Summe Netto', gross: 'Endsumme' },
  footer: { deliveryTerms: 'Lieferbedingung: Postversand', paymentTerms: 'Zahlbar innerhalb von 14 Tagen ohne Abzug. Vielen Dank für Ihren Auftrag!' },
  bankDetails: { accountHolder: '', bankName: '', iban: '', bic: '' },
};

export default function InvoiceTemplatePage() {
  const { user, loading, companyId } = useData();
  const router = useRouter();
  const [template, setTemplate] = useState<any>(defaultTemplate);
  const [loadingTmpl, setLoadingTmpl] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [user, loading, router]);

  useEffect(() => {
    if (!companyId) { setLoadingTmpl(false); return; }
    getDoc(doc(db, 'companies', companyId, 'settings', 'invoice')).then(snap => {
      if (snap.exists()) {
        const data = snap.data();
        setTemplate({
          ...defaultTemplate, ...data,
          metaLabels: { ...defaultTemplate.metaLabels, ...data.metaLabels },
          tableHeaders: { ...defaultTemplate.tableHeaders, ...data.tableHeaders },
          summaryLabels: { ...defaultTemplate.summaryLabels, ...data.summaryLabels },
          footer: { ...defaultTemplate.footer, ...data.footer },
          bankDetails: { ...defaultTemplate.bankDetails, ...data.bankDetails },
        });
      }
      setLoadingTmpl(false);
    });
  }, [companyId]);

  const update = (section: string | null, key: string, value: string) => {
    setTemplate((prev: any) => {
      if (section) return { ...prev, [section]: { ...(prev[section] || {}), [key]: value } };
      return { ...prev, [key]: value };
    });
  };

  const handleSave = async () => {
    if (!companyId) return;
    setSaving(true);
    try {
      await setDoc(doc(db, 'companies', companyId, 'settings', 'invoice'), template, { merge: true });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
    setSaving(false);
  };

  if (loading || !user) return null;

  const labelCls = 'block text-sm font-bold text-slate-700 mb-1.5';
  const inputCls = 'w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100/50 transition-all shadow-sm';

  function Section({ title, gradient, children }: { title: string; gradient: string; children: React.ReactNode }) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden animate-fadeIn">
        <div className={`px-6 py-4 bg-gradient-to-r ${gradient} border-b border-slate-100`}>
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        </div>
        <div className="p-6 space-y-4">{children}</div>
      </div>
    );
  }

  function Field({ label, value, onChange, placeholder, type }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
    return (
      <div>
        <label className={labelCls}>{label}</label>
        <input type={type || 'text'} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder || label}
          className={inputCls} />
      </div>
    );
  }

  if (loadingTmpl) return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <Sidebar />
      <main className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
<img src="/logo.png" alt="EarnTrack" className="w-10 h-10 rounded-full object-cover shadow-lg shadow-teal-200/30" />
          <div className="flex gap-1">
            <span className="w-2 h-2 rounded-full bg-teal-600 animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-2 h-2 rounded-full bg-teal-500 animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-2 h-2 rounded-full bg-teal-400 animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </main>
    </div>
  );

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="px-8 py-8 max-w-3xl mx-auto space-y-8">
          <div className="flex items-center justify-between animate-fadeIn">
            <div>
              <a href="/settings" className="text-sm text-teal-600 hover:text-teal-700 font-semibold mb-2 inline-block hover:underline">&larr; Zurück zu Einstellungen</a>
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight mt-2">Rechnungsvorlage</h1>
              <p className="text-slate-500 text-sm mt-1">Passe das Layout deiner Rechnungen an</p>
            </div>
            <button onClick={handleSave} disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 hover:shadow-xl hover:shadow-teal-200/50 active:scale-[0.97] disabled:opacity-50 text-white font-bold rounded-xl transition-all text-sm shadow-lg">
              {saving ? 'Wird gespeichert...' : saved ? '✅ Gespeichert' : 'Speichern'}
            </button>
          </div>

          <Section title="Allgemein" gradient="from-teal-50 to-emerald-50">
            <Field label="Titel der Rechnung" value={template.invoiceTitle} onChange={v => update(null, 'invoiceTitle', v)} placeholder="Rechnung" />
            <Field label="Rechnungsnummern-Prefix" value={template.invoiceNumberPrefix} onChange={v => update(null, 'invoiceNumberPrefix', v)} placeholder="INV-" />
            <Field label="Mehrwertsteuer (%)" value={template.taxRate} onChange={v => update(null, 'taxRate', v)} placeholder="19" type="number" />
            <Field label="Standard-Einheit" value={template.defaultUnit} onChange={v => update(null, 'defaultUnit', v)} placeholder="Std." />
          </Section>

          <Section title="Meta-Spalte (links)" gradient="from-blue-50 to-indigo-50">
            <Field label="Rechnungs-Nr." value={template.metaLabels.invoiceNumber} onChange={v => update('metaLabels', 'invoiceNumber', v)} />
            <Field label="Auftrags-Nr." value={template.metaLabels.orderNumber} onChange={v => update('metaLabels', 'orderNumber', v)} />
            <Field label="Kommission" value={template.metaLabels.commission} onChange={v => update('metaLabels', 'commission', v)} />
            <Field label="Kunden-Nr." value={template.metaLabels.customerNumber} onChange={v => update('metaLabels', 'customerNumber', v)} />
            <Field label="Bestell-Nr." value={template.metaLabels.orderRef} onChange={v => update('metaLabels', 'orderRef', v)} />
          </Section>

          <Section title="Meta-Spalte (rechts)" gradient="from-blue-50 to-indigo-50">
            <Field label="Rechnungsdatum" value={template.metaLabels.invoiceDate} onChange={v => update('metaLabels', 'invoiceDate', v)} />
            <Field label="Lieferdatum" value={template.metaLabels.deliveryDate} onChange={v => update('metaLabels', 'deliveryDate', v)} />
            <Field label="Bearbeiter" value={template.metaLabels.processor} onChange={v => update('metaLabels', 'processor', v)} />
          </Section>

          <Section title="Tabellen-Überschriften" gradient="from-amber-50 to-orange-50">
            <Field label="Pos." value={template.tableHeaders.position} onChange={v => update('tableHeaders', 'position', v)} />
            <Field label="Art.-Nr." value={template.tableHeaders.articleNumber} onChange={v => update('tableHeaders', 'articleNumber', v)} />
            <Field label="Bezeichnung" value={template.tableHeaders.description} onChange={v => update('tableHeaders', 'description', v)} />
            <Field label="Menge" value={template.tableHeaders.quantity} onChange={v => update('tableHeaders', 'quantity', v)} />
            <Field label="Einheit" value={template.tableHeaders.unit} onChange={v => update('tableHeaders', 'unit', v)} />
            <Field label="E-Preis €" value={template.tableHeaders.unitPrice} onChange={v => update('tableHeaders', 'unitPrice', v)} />
            <Field label="Gesamt €" value={template.tableHeaders.total} onChange={v => update('tableHeaders', 'total', v)} />
          </Section>

          <Section title="Zusammenfassung" gradient="from-green-50 to-emerald-50">
            <Field label="Summe Netto (Label)" value={template.summaryLabels.net} onChange={v => update('summaryLabels', 'net', v)} />
            <Field label="Endsumme (Label)" value={template.summaryLabels.gross} onChange={v => update('summaryLabels', 'gross', v)} />
          </Section>

          <Section title="Fußzeile" gradient="from-slate-50 to-slate-100">
            <div>
              <label className={labelCls}>Lieferbedingung</label>
              <textarea value={template.footer.deliveryTerms} onChange={e => update('footer', 'deliveryTerms', e.target.value)}
                className={inputCls + ' resize-none h-20'} placeholder="Lieferbedingung: Postversand" />
            </div>
            <div>
              <label className={labelCls}>Zahlungsbedingung</label>
              <textarea value={template.footer.paymentTerms} onChange={e => update('footer', 'paymentTerms', e.target.value)}
                className={inputCls + ' resize-none h-20'} placeholder="Zahlbar innerhalb von 14 Tagen..." />
            </div>
          </Section>

          <Section title="Bankverbindung" gradient="from-purple-50 to-violet-50">
            <Field label="Kontoinhaber" value={template.bankDetails.accountHolder} onChange={v => update('bankDetails', 'accountHolder', v)} placeholder="Max Mustermann" />
            <Field label="Bank" value={template.bankDetails.bankName} onChange={v => update('bankDetails', 'bankName', v)} placeholder="Sparkasse Musterstadt" />
            <Field label="IBAN" value={template.bankDetails.iban} onChange={v => update('bankDetails', 'iban', v)} placeholder="DE89 3704 0044 0532 0130 00" />
            <Field label="BIC" value={template.bankDetails.bic} onChange={v => update('bankDetails', 'bic', v)} placeholder="COBADEFFXXX" />
          </Section>

          <div className="flex justify-end gap-3 pb-8">
            <button onClick={() => setTemplate({ ...defaultTemplate })}
              className="px-4 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50 active:scale-[0.97] rounded-xl transition-all border border-red-200">
              Auf Standard zurücksetzen
            </button>
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 hover:shadow-xl hover:shadow-teal-200/50 active:scale-[0.97] disabled:opacity-50 text-white font-bold rounded-xl transition-all text-sm shadow-lg">
              {saving ? 'Speichern...' : 'Speichern'}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
