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
import { CheckCircle } from 'lucide-react';

// Mini-Mockups der 5 Rechnungsdesigns (rein dekorativ, spiegeln das PDF-Layout)
function TemplateThumb({ id }: { id: TemplateId }) {
  if (id === 'standard') {
    // Swiss: schwarz-weiß, große Typo, feine Linien
    return (
      <div className="w-full h-32 bg-white p-3 flex flex-col">
        <div className="flex justify-between items-start">
          <div className="h-2 w-10 bg-black rounded-sm" />
          <div className="space-y-0.5"><div className="h-1 w-8 bg-slate-300 rounded-sm ml-auto" /><div className="h-1 w-6 bg-slate-200 rounded-sm ml-auto" /></div>
        </div>
        <div className="mt-4 h-3 w-16 bg-black rounded-sm" />
        <div className="mt-3 border-t-2 border-black pt-1 space-y-1">
          <div className="h-1 w-full bg-slate-200 rounded-sm" />
          <div className="h-1 w-full bg-slate-200 rounded-sm" />
        </div>
        <div className="mt-auto h-1.5 w-12 bg-black rounded-sm ml-auto" />
      </div>
    );
  }
  if (id === 'professional') {
    // Klassik: zentrierter Serif-Briefkopf, Doppellinie
    return (
      <div className="w-full h-32 bg-white p-3 flex flex-col items-center">
        <span className="font-serif text-sm tracking-[0.2em] text-stone-800">MUSTER</span>
        <div className="w-full border-b-4 border-double border-stone-700 mt-1" />
        <div className="w-full mt-3 space-y-1">
          <div className="h-1 w-full bg-stone-200 rounded-sm" />
          <div className="h-1 w-full bg-stone-200 rounded-sm" />
          <div className="h-1 w-3/4 bg-stone-200 rounded-sm" />
        </div>
        <div className="mt-auto w-full flex justify-end"><div className="h-1.5 w-12 border-t-4 border-double border-stone-700 pt-0.5" /></div>
      </div>
    );
  }
  if (id === 'modern') {
    // Business: navy Kopfbalken + navy Tabellenkopf
    return (
      <div className="w-full h-32 bg-white flex flex-col">
        <div className="h-8 bg-[#16324f] flex items-center px-3"><div className="h-2 w-12 bg-white/90 rounded-sm" /></div>
        <div className="p-3 flex-1 flex flex-col">
          <div className="h-2 w-14 bg-[#f2f5f8] border-l-2 border-[#16324f] rounded-sm" />
          <div className="mt-2 h-2 w-full bg-[#16324f] rounded-sm" />
          <div className="mt-1 space-y-1"><div className="h-1 w-full bg-slate-200 rounded-sm" /><div className="h-1 w-full bg-slate-100 rounded-sm" /></div>
          <div className="mt-auto h-1.5 w-10 bg-[#16324f] rounded-sm ml-auto" />
        </div>
      </div>
    );
  }
  if (id === 'kompakt') {
    // Akzent: Petrol-Leiste links, getönte Meta-Box
    return (
      <div className="w-full h-32 bg-white border-l-4 border-teal-700 p-3 flex flex-col">
        <div className="flex justify-between items-start">
          <div className="h-2 w-10 bg-slate-800 rounded-sm" />
          <div className="h-6 w-12 bg-teal-50 rounded" />
        </div>
        <div className="mt-3 h-2 w-14 bg-slate-800 rounded-sm" />
        <div className="h-0.5 w-6 bg-teal-700 rounded-sm mt-1" />
        <div className="mt-2 border-t-2 border-teal-700 pt-1 space-y-1">
          <div className="h-1 w-full bg-slate-200 rounded-sm" />
        </div>
        <div className="mt-auto h-1.5 w-11 bg-teal-700 rounded-sm ml-auto" />
      </div>
    );
  }
  // Elegant: schwarzer Briefkopf mit Gold-Linie
  return (
    <div className="w-full h-32 bg-white flex flex-col">
      <div className="h-9 bg-[#171512] border-b-2 border-[#b99a45] flex items-center px-3">
        <span className="text-white text-[9px] tracking-[0.25em] font-light">MUSTER</span>
      </div>
      <div className="p-3 flex-1 flex flex-col">
        <div className="font-serif text-[10px] tracking-[0.3em] text-[#171512]">RECHNUNG</div>
        <div className="mt-2 border-t border-b border-[#b99a45] py-1"><div className="h-1 w-2/3 bg-stone-200 rounded-sm" /></div>
        <div className="mt-auto h-1.5 w-12 border-t-2 border-[#b99a45] pt-0.5 ml-auto" />
      </div>
    </div>
  );
}

const defaultTemplate = {
  invoiceTitle: 'Rechnung',
  invoiceNumberPrefix: 'INV-',
  templateStyle: 'standard' as TemplateId,
  metaLabels: { invoiceNumber: 'Rechnungs-Nr.', orderNumber: 'Auftrags-Nr.', commission: 'Kommission', customerNumber: 'Kunden-Nr.', orderRef: 'Bestell-Nr.', invoiceDate: 'Rechnungsdatum', deliveryDate: 'Lieferdatum', processor: 'Bearbeiter' },
  tableHeaders: { position: 'Pos.', articleNumber: 'Art.-Nr.', description: 'Bezeichnung', quantity: 'Menge', unit: 'Einheit', unitPrice: 'E-Preis €', total: 'Gesamt €' },
  defaultUnit: 'Std.',
  taxRate: '19',
  // Aufschlag auf den Artikelpreis, wenn Lager-Material einem Auftrag zugeordnet wird.
  materialMarkupPercent: '0',
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

function Field({ label, value, onChange, placeholder, type, hint }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; hint?: string }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <input type={type || 'text'} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder || label}
        className={inputCls} />
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
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
          resolve(c.toDataURL('image/jpeg', 0.85));
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
      // 600×300: genug Reserve für die 64px-Darstellung im PDF-Druck (~2,5× Retina)
      const dataUrl = await resizeImage(file, 600, 300);
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
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {templateEntries.map(([id, tpl]) => (
                <button
                  key={id}
                  onClick={() => update(null, 'templateStyle', id)}
                  className={`relative rounded-xl border-2 overflow-hidden text-left transition-all duration-200 active:scale-[0.97] flex flex-col ${
                    template.templateStyle === id
                      ? 'border-teal-500 ring-2 ring-teal-200 shadow-lg shadow-teal-100'
                      : 'border-slate-200 hover:border-slate-300 shadow-sm'
                  }`}
                >
                  <TemplateThumb id={id} />
                  <div className={`px-3 py-2 flex-1 ${
                    template.templateStyle === id ? 'bg-teal-500' : 'bg-slate-50'
                  }`}>
                    <p className={`text-xs font-bold ${template.templateStyle === id ? 'text-white' : 'text-slate-800'}`}>{tpl.name}</p>
                    <p className={`text-[10px] leading-snug mt-0.5 ${template.templateStyle === id ? 'text-teal-50' : 'text-slate-500'}`}>{tpl.description}</p>
                  </div>
                  {template.templateStyle === id && (
                    <div className="absolute top-2 right-2 w-5 h-5 bg-teal-500 rounded-full flex items-center justify-center shadow">
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
            <Field label="Material-Aufschlag (%)" value={template.materialMarkupPercent} onChange={v => update(null, 'materialMarkupPercent', v)} placeholder="0" type="number"
              hint="Wird beim Zuordnen von Lager-Material zu Aufträgen auf den Artikelpreis aufgeschlagen. Bei 0% zahlt der Kunde genau deinen Einkaufspreis – du machst dann keinen Gewinn am Material, nur an deiner Arbeitszeit." />
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
