'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';
import PageSkeleton from '@/components/skeletons/PageSkeleton';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { TEMPLATES, TemplateId } from '@/lib/invoiceTemplates';
import { getFeatureFlag } from '@/lib/plans';
import { CheckCircle, Star } from 'lucide-react';

const defaultTemplate = {
  invoiceTitle: 'Rechnung',
  invoiceNumberPrefix: 'INV-',
  templateStyle: 'standard' as TemplateId,
  metaLabels: { invoiceNumber: 'Rechnungs-Nr.', orderNumber: 'Auftrags-Nr.', commission: 'Kommission', customerNumber: 'Kunden-Nr.', orderRef: 'Bestell-Nr.', invoiceDate: 'Rechnungsdatum', deliveryDate: 'Lieferdatum', processor: 'Bearbeiter' },
  tableHeaders: { position: 'Pos.', articleNumber: 'Art.-Nr.', description: 'Bezeichnung', quantity: 'Menge', unit: 'Einheit', unitPrice: 'E-Preis €', total: 'Gesamt €' },
  defaultUnit: 'Std.',
  taxRate: '19',
  summaryLabels: { net: 'Summe Netto', gross: 'Endsumme' },
  footer: { deliveryTerms: 'Lieferbedingung: Postversand', paymentTerms: 'Zahlbar innerhalb von 14 Tagen ohne Abzug. Vielen Dank für Ihren Auftrag!' },
  bankDetails: { accountHolder: '', bankName: '', iban: '', bic: '' },
  logoUrl: '',
};

const labelCls = 'block text-sm font-bold text-slate-700 mb-1.5';
const inputCls = 'w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100/50 transition-all shadow-sm';

function Section({ title, gradient, children }: { title: string; gradient: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden ">
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

export default function InvoiceTemplatePage() {
  const { user, loading, companyId, company } = useData();
  const router = useRouter();
  const [template, setTemplate] = useState<any>(defaultTemplate);
  const [loadingTmpl, setLoadingTmpl] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

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
    }).catch((e) => {
      console.error('Failed to load invoice template:', e);
      setLoadingTmpl(false);
    });
  }, [companyId]);

  const update = (section: string | null, key: string, value: string) => {
    setTemplate((prev: any) => {
      if (section) return { ...prev, [section]: { ...(prev[section] || {}), [key]: value } };
      return { ...prev, [key]: value };
    });
  };

  const resizeImage = (file: File, maxW: number, maxH: number): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > maxW) { height = Math.round(height * maxW / width); width = maxW; }
          if (height > maxH) { width = Math.round(width * maxH / height); height = maxH; }
          const c = document.createElement('canvas');
          c.width = width; c.height = height;
          c.getContext('2d')!.drawImage(img, 0, 0, width, height);
          resolve(c.toDataURL('image/jpeg', 0.7));
        };
        img.onerror = reject;
        img.src = reader.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !companyId) return;
    setUploadingLogo(true);
    try {
      const dataUrl = await resizeImage(file, 400, 200);
      setTemplate((prev: any) => ({ ...prev, logoUrl: dataUrl }));
    } catch (e) { console.error('logo upload error:', e); }
    finally { setUploadingLogo(false); if (logoInputRef.current) logoInputRef.current.value = ''; }
  };

  const removeLogo = () => {
    setTemplate((prev: any) => ({ ...prev, logoUrl: '' }));
  };

  const handleSave = async () => {
    if (!companyId) return;
    setSaving(true);
    try {
      await setDoc(doc(db, 'companies', companyId, 'settings', 'invoice'), template, { merge: true });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error('save template error:', e);
      alert('Fehler beim Speichern: ' + (e instanceof Error ? e.message : 'Unbekannter Fehler'));
    }
    setSaving(false);
  };

  const plan = company?.subscriptionStatus === 'trial' ? 'trial' : (company?.subscriptionPlan || 'trial');
  const maxTemplates = getFeatureFlag(plan, 'invoiceTemplates') as number;
  const templateEntries = (Object.entries(TEMPLATES) as [TemplateId, typeof TEMPLATES[TemplateId]][]).slice(0, maxTemplates);
  const allowedIds = useMemo(() => new Set(templateEntries.map(([id]) => id)), [templateEntries]);
  useEffect(() => {
    if (template.templateStyle && !allowedIds.has(template.templateStyle)) {
      setTemplate((prev: any) => ({ ...prev, templateStyle: 'standard' }));
    }
  }, [template.templateStyle, allowedIds]);

  if (loading || !user) return null;

  if (loadingTmpl) return <PageSkeleton variant="form" maxWidth="max-w-3xl" />;

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="px-4 md:px-8 py-4 md:py-8 max-w-3xl mx-auto space-y-8">
          <div className="flex items-center justify-between ">
            <div>
              <a href="/settings" className="text-sm text-teal-600 hover:text-teal-700 font-semibold mb-2 inline-block hover:underline">&larr; Zurück zu Einstellungen</a>
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight mt-2">Rechnungsvorlage</h1>
              <p className="text-slate-500 text-sm mt-1">Passe das Layout deiner Rechnungen an</p>
            </div>
            <button onClick={handleSave} disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 hover:shadow-xl hover:shadow-teal-200/50 active:scale-[0.97] disabled:opacity-50 text-white font-bold rounded-xl transition-all text-sm shadow-lg">
              {saving ? 'Wird gespeichert...' : saved ? <><CheckCircle className="inline w-4 h-4 text-green-500 mr-1" /> Gespeichert</> : 'Speichern'}
            </button>
          </div>

          <Section title="Design" gradient="from-pink-50 to-rose-50">
            <label className={labelCls}>Rechnungsdesign</label>
            <div className="grid grid-cols-5 gap-4">
              {templateEntries.map(([id, tpl]) => (
                <button
                  key={id}
                  onClick={() => update(null, 'templateStyle', id)}
                  className={`relative rounded-xl border-2 overflow-hidden transition-all duration-200 active:scale-[0.97] ${
                    template.templateStyle === id
                      ? 'border-teal-500 ring-2 ring-teal-200 shadow-lg shadow-teal-100'
                      : 'border-slate-200 hover:border-slate-300 shadow-sm'
                  }`}
                >
                  {id === 'standard' ? (
                    <div className="w-full h-32 bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
                      <div className="text-center">
                        <svg className="w-8 h-8 mx-auto text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                        <p className="text-xs text-slate-400 mt-1 font-medium">Standard</p>
                      </div>
                    </div>
                  ) : id === 'professional' ? (
                    <div className="w-full h-32 bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center">
                      <div className="text-center">
                        <div className="w-8 h-8 mx-auto rounded-lg bg-blue-900 flex items-center justify-center">
                          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                        </div>
                        <p className="text-xs text-blue-800 mt-1 font-medium">Professional</p>
                      </div>
                    </div>
                  ) : id === 'kompakt' ? (
                    <div className="w-full h-32 bg-gradient-to-br from-stone-50 to-stone-100 flex items-center justify-center">
                      <div className="text-center">
                        <div className="w-8 h-8 mx-auto rounded border-2 border-stone-300 flex items-center justify-center">
                          <span className="text-stone-600 text-xs font-serif font-bold">K</span>
                        </div>
                        <p className="text-xs text-stone-600 mt-1 font-serif font-medium">Kompakt</p>
                      </div>
                    </div>
                  ) : id === 'premium' ? (
                    <div className="w-full h-32 bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center">
                      <div className="text-center">
                        <div className="w-8 h-8 mx-auto rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
                          <Star className="w-4 h-4 text-emerald-400 fill-current" />
                        </div>
                        <p className="text-xs text-emerald-400 mt-1 font-bold">Premium</p>
                      </div>
                    </div>
                  ) : (
                    <div className="w-full h-32 bg-gradient-to-br from-teal-50 to-emerald-50 flex items-center justify-center">
                      <div className="text-center">
                        <div className="w-8 h-8 mx-auto rounded-lg bg-gradient-to-br from-teal-600 to-emerald-500 flex items-center justify-center">
                          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                        </div>
                        <p className="text-xs text-teal-700 mt-1 font-medium">Modern</p>
                      </div>
                    </div>
                  )}
                  <div className={`px-3 py-2 text-xs font-semibold text-center ${
                    template.templateStyle === id ? 'bg-teal-500 text-white' : 'bg-slate-50 text-slate-700'
                  }`}>
                    {tpl.name}
                  </div>
                  {template.templateStyle === id && (
                    <div className="absolute top-2 right-2 w-5 h-5 bg-teal-500 rounded-full flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </Section>

          <Section title="Logo" gradient="from-amber-50 to-orange-50">
            <label className={labelCls}>Firmenlogo (erscheint auf der Rechnung)</label>
            {template.logoUrl ? (
              <div className="flex items-center gap-4">
                <img src={template.logoUrl} alt="Logo" className="h-14 w-auto max-w-[200px] object-contain rounded-lg border border-slate-200 p-1" />
                <div className="flex gap-2">
                  <button onClick={() => logoInputRef.current?.click()}
                    className="px-3 py-1.5 text-xs font-semibold text-teal-600 hover:bg-teal-50 rounded-lg border border-teal-200 transition-all">
                    Ändern
                  </button>
                  <button onClick={removeLogo}
                    className="px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg border border-red-200 transition-all">
                    Entfernen
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => logoInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-3 border-2 border-dashed border-slate-300 rounded-xl text-sm text-slate-500 hover:border-teal-400 hover:text-teal-600 transition-all">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                {uploadingLogo ? 'Wird hochgeladen...' : 'Logo hochladen'}
              </button>
            )}
            <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
          </Section>

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
            <Field label="BIC" value={template.bankDetails.bic} onChange={v => update('bankDetails', 'bic', v)} placeholder="BELADEBEXXX" />
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
