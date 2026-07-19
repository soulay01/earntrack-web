'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';
import PageSkeleton from '@/components/skeletons/PageSkeleton';
import { generateEstimateHTML, generateEstimateNumber, fmt } from '@/lib/estimateUtils';
import { generateInvoiceHTML, generateSequentialInvoiceNumber } from '@/lib/estimateUtils';
import { downloadPDF, downloadZugferdPDF } from '@/lib/pdf';
import { generateZugferdXML, ZugferdParams } from '@/lib/zugferd';
import { getGrade, getGradeColor, getGradeBg } from '@/lib/smartPricing';
import { loadTemplates, saveTemplate, deleteTemplate, type EstimateTemplate } from '@/lib/estimateTemplates';
import { Pencil, ClipboardList, Mail, Phone, TriangleAlert, Folder, FileText, Receipt, X, Check, TrendingUp, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { doc, getDoc, addDoc, updateDoc, collection, query, where, getDocs, deleteDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

function downloadFile(content: string, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName; a.click();
  URL.revokeObjectURL(url);
}

const ui = {
  btnPrimary: 'inline-flex items-center justify-center gap-2 px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition-colors',
  btnSecondary: 'inline-flex items-center justify-center gap-2 px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg transition-colors',
  btnGhost: 'px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors',
  label: 'block text-[13px] font-medium text-slate-700 mb-1.5',
};

type EstimateStatus = 'entwurf' | 'gesendet' | 'angenommen' | 'abgelehnt' | 'rechnung_erstellt';

const STATUS_LABELS: Record<EstimateStatus, string> = {
  entwurf: 'Entwurf',
  gesendet: 'Gesendet',
  angenommen: 'Angenommen',
  abgelehnt: 'Abgelehnt',
  rechnung_erstellt: 'Rechnung erstellt',
};

const STATUS_COLORS: Record<EstimateStatus, { bg: string; text: string; dot: string }> = {
  entwurf: { bg: '#f1f5f9', text: '#64748b', dot: '#94a3b8' },
  gesendet: { bg: '#dbeafe', text: '#2563eb', dot: '#3b82f6' },
  angenommen: { bg: '#dcfce7', text: '#16a34a', dot: '#22c55e' },
  abgelehnt: { bg: '#fee2e2', text: '#dc2626', dot: '#ef4444' },
  rechnung_erstellt: { bg: '#f0fdf4', text: '#0d9488', dot: '#0d9488' },
};

const STATUS_FLOW: EstimateStatus[] = ['entwurf', 'gesendet', 'angenommen', 'rechnung_erstellt'];

export default function EstimatesPage() {
  const { user, loading, employees, customers, companyId, company } = useData();
  const router = useRouter();
  const [companyData, setCompanyData] = useState<any>(null);
  const [invoiceTemplate, setInvoiceTemplate] = useState<any>(null);
  const [estimates, setEstimates] = useState<any[]>([]);
  const [estimatesLoading, setEstimatesLoading] = useState(true);
  const [tab, setTab] = useState<'new' | 'history'>('new');
  const [saving, setSaving] = useState(false);

  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [projekt, setProjekt] = useState('');
  const [mitarbeiterStunden, setMitarbeiterStunden] = useState<Record<string, string>>({});
  const [materialienList, setMaterialienList] = useState([{ id: Date.now() + 1, name: '', preis: '', menge: '' }]);
  const [sonstigeKosten, setSonstigeKosten] = useState([{ id: Date.now() + 2, name: '', betrag: '' }]);
  const [gewinnmarge, setGewinnmarge] = useState('');
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [currentEstimateNumber, setCurrentEstimateNumber] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [validationError, setValidationError] = useState('');
  const [templates, setTemplates] = useState<EstimateTemplate[]>([]);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [templateName, setTemplateName] = useState('');

  const clearError = () => setValidationError('');

  const applyTemplate = (tpl: EstimateTemplate) => {
    if (tpl.customerId) setSelectedCustomerId(tpl.customerId);
    if (tpl.projekt) setProjekt(tpl.projekt);
    if (tpl.employeeIds) setSelectedEmployeeIds(tpl.employeeIds);
    if (tpl.employeeHours) setMitarbeiterStunden(tpl.employeeHours);
    if (tpl.materials && tpl.materials.length > 0) setMaterialienList(tpl.materials.map(m => ({ ...m, id: Date.now() + Math.random() })));
    if (tpl.otherCosts && tpl.otherCosts.length > 0) setSonstigeKosten(tpl.otherCosts.map(s => ({ ...s, id: Date.now() + Math.random() })));
    if (tpl.gewinnmarge) setGewinnmarge(tpl.gewinnmarge);
  };

  const handleSaveAsTemplate = async () => {
    if (!companyId || !templateName.trim()) return;
    await saveTemplate(companyId, {
      name: templateName.trim(),
      customerId: selectedCustomerId,
      projekt,
      employeeIds: selectedEmployeeIds,
      employeeHours: mitarbeiterStunden,
      materials: materialienList.filter(m => m.name),
      otherCosts: sonstigeKosten.filter(s => s.name),
      gewinnmarge,
    });
    setTemplates(prev => [...prev, { id: 'temp', companyId: companyId!, name: templateName.trim(), createdAt: { seconds: Date.now() / 1000 } } as EstimateTemplate]);
    setTemplateName('');
    setShowTemplateDialog(false);
    if (companyId) loadTemplates(companyId).then(setTemplates).catch((e) => console.error('Failed to load templates:', e));
  };

  const handleDeleteTemplate = async (tplId: string) => {
    if (!companyId || !confirm('Vorlage wirklich löschen?')) return;
    await deleteTemplate(companyId, tplId);
    setTemplates(prev => prev.filter(t => t.id !== tplId));
  };

  const resetFormWithTemplates = () => {
    resetForm();
  };

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [user, loading, router]);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    getDoc(doc(db, 'companies', companyId)).then(snap => {
      if (cancelled) return;
      if (snap.exists()) setCompanyData(snap.data());
    });
    getDoc(doc(db, 'companies', companyId, 'settings', 'invoice')).then(snap => {
      if (cancelled) return;
      if (snap.exists()) setInvoiceTemplate(snap.data());
    });
    loadTemplates(companyId).then(r => {
      if (cancelled) return;
      setTemplates(r);
    }).catch((e) => console.error('Failed to load templates:', e));
    return () => { cancelled = true; };
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    setEstimatesLoading(true);
    const q = query(
      collection(db, 'estimates'),
      where('companyId', '==', companyId)
    );
    getDocs(q).then(snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a: any, b: any) => {
        const at = a.createdAt?.seconds || new Date(a.createdAt || 0).getTime();
        const bt = b.createdAt?.seconds || new Date(b.createdAt || 0).getTime();
        return bt - at;
      });
      setEstimates(list);
      setEstimatesLoading(false);
    }).catch(() => setEstimatesLoading(false));
  }, [companyId]);

  const [statusHistoryFilter, setStatusHistoryFilter] = useState<EstimateStatus | 'alle'>('alle');

  const filteredEstimates = useMemo(() => {
    let list = estimates;
    if (statusHistoryFilter !== 'alle') list = list.filter(e => (e.status || 'entwurf') === statusHistoryFilter);
    if (!searchQuery) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(e =>
      (e.customerName || '').toLowerCase().includes(q) ||
      (e.project || '').toLowerCase().includes(q) ||
      (e.estimateNumber || '').toLowerCase().includes(q)
    );
  }, [estimates, searchQuery, statusHistoryFilter]);

  const historyStats = useMemo(() => {
    const total = estimates.reduce((s, e) => s + (e.totalGross || 0), 0);
    const open = estimates.filter(e => ['entwurf', 'gesendet'].includes(e.status || 'entwurf')).reduce((s, e) => s + (e.totalGross || 0), 0);
    const accepted = estimates.filter(e => ['angenommen', 'rechnung_erstellt'].includes(e.status || '')).reduce((s, e) => s + (e.totalGross || 0), 0);
    const rejected = estimates.filter(e => e.status === 'abgelehnt').reduce((s, e) => s + (e.totalGross || 0), 0);
    return { total, open, accepted, rejected, count: estimates.length };
  }, [estimates]);

  const selectedCustomer = useMemo(() => customers.find(c => c.id === selectedCustomerId) || null, [customers, selectedCustomerId]);

  const mitarbeiterList = useMemo(() =>
    selectedEmployeeIds.map(empId => {
      const emp = employees.find(e => e.id === empId);
      if (!emp) return null;
      return { id: emp.id, name: emp.name, stundenlohn: String(emp.stundenlohn || ''), stunden: mitarbeiterStunden[emp.id] || '' };
    }).filter(Boolean),
    [selectedEmployeeIds, employees, mitarbeiterStunden]
  );

  const toggleEmployee = (empId: string) => {
    setSelectedEmployeeIds(prev => {
      if (prev.includes(empId)) {
        setMitarbeiterStunden(s => { const copy = { ...s }; delete copy[empId]; return copy; });
        return prev.filter(id => id !== empId);
      }
      return [...prev, empId];
    });
  };

  const totalMitarbeiter = useMemo(() =>
    mitarbeiterList.reduce((sum, m: any) => sum + (parseFloat(m.stundenlohn) || 0) * (parseFloat(m.stunden) || 0), 0),
    [mitarbeiterList]
  );
  const totalMaterial = useMemo(() =>
    materialienList.reduce((sum, m) => sum + (parseFloat(m.preis) || 0) * (parseFloat(m.menge) || 0), 0),
    [materialienList]
  );
  const totalSonstige = useMemo(() =>
    sonstigeKosten.reduce((sum, s) => sum + (parseFloat(s.betrag) || 0), 0),
    [sonstigeKosten]
  );
  const gesamt = totalMitarbeiter + totalMaterial + totalSonstige;
  const margeNum = parseFloat(gewinnmarge) || 0;
  const endpreis = gesamt * (1 + margeNum / 100);

  const resetForm = () => {
    setSelectedCustomerId(null);
    setSelectedEmployeeIds([]);
    setProjekt('');
    setMitarbeiterStunden({});
    setMaterialienList([{ id: Date.now() + 1, name: '', preis: '', menge: '' }]);
    setSonstigeKosten([{ id: Date.now() + 2, name: '', betrag: '' }]);
    setGewinnmarge('');
    setShowPdfPreview(false);
    setPreviewHtml('');
    setCurrentEstimateNumber('');
  };

  const handleShowPreview = async () => {
    if (!selectedCustomer?.name) { setValidationError('Bitte wähle einen Kunden aus.'); return; }
    if (!projekt || projekt.trim() === '') { setValidationError('Bitte gib einen Projektnamen ein.'); return; }
    if (!mitarbeiterList || mitarbeiterList.length === 0) { setValidationError('Bitte wähle mindestens einen Mitarbeiter aus.'); return; }
    setValidationError('');
    let cd = companyData;
    if (companyId && !cd) {
      const snap = await getDoc(doc(db, 'companies', companyId));
      if (snap.exists()) { cd = snap.data(); setCompanyData(cd); }
    }
    const estNum = generateEstimateNumber();
    setCurrentEstimateNumber(estNum);
    const html = generateEstimateHTML({
      kunde: selectedCustomer?.name || '', projekt, mitarbeiterList, materialienList,
      sonstigeKosten, gewinnmarge, companyData: cd, estimateNumber: estNum,
    }, invoiceTemplate || {});
    setPreviewHtml(html);
    setShowPdfPreview(true);
  };

  const handleSaveEstimate = async () => {
    if (!companyId) return;
    if (!selectedCustomerId) { setValidationError('Bitte wähle einen Kunden aus.'); return; }
    if (!projekt || projekt.trim() === '') { setValidationError('Bitte gib einen Projektnamen ein.'); return; }
    if (!mitarbeiterList || mitarbeiterList.length === 0) { setValidationError('Bitte wähle mindestens einen Mitarbeiter aus.'); return; }
    setValidationError('');
    setSaving(true);
    try {
      const estNum = currentEstimateNumber || generateEstimateNumber();
      await addDoc(collection(db, 'estimates'), {
        companyId,
        customerId: selectedCustomerId,
        customerName: selectedCustomer?.name || '',
        project: projekt.trim(),
        mitarbeiterList: mitarbeiterList.map((m: any) => ({ name: m.name, stundenlohn: parseFloat(m.stundenlohn) || 0, stunden: parseFloat(m.stunden) || 0 })),
        materialienList: materialienList.filter(m => m.name).map(m => ({ name: m.name, preis: parseFloat(m.preis) || 0, menge: parseFloat(m.menge) || 0 })),
        sonstigeKosten: sonstigeKosten.filter(s => s.name).map(s => ({ name: s.name, betrag: parseFloat(s.betrag) || 0 })),
        gewinnmarge: margeNum,
        estimateNumber: estNum,
        status: 'entwurf' as EstimateStatus,
        totalNet: gesamt,
        totalGross: endpreis,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      resetForm();
      // Refresh list
      const q = query(
        collection(db, 'estimates'),
        where('companyId', '==', companyId)
      );
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a: any, b: any) => {
        const at = a.createdAt?.seconds || new Date(a.createdAt || 0).getTime();
        const bt = b.createdAt?.seconds || new Date(b.createdAt || 0).getTime();
        return bt - at;
      });
      setEstimates(list);
      setTab('history');
    } catch (e) {
      console.error('save estimate error:', e);
    } finally {
      setSaving(false);
    }
  };

  const updateEstimateStatus = async (id: string, status: EstimateStatus) => {
    try {
      await updateDoc(doc(db, 'estimates', id), { status, updatedAt: new Date().toISOString() });
      setEstimates(prev => prev.map(e => e.id === id ? { ...e, status } : e));
    } catch (e) {
      console.error('update status error:', e);
    }
  };

  const convertToInvoice = async (est: any) => {
    if (!companyId) return;
    let cd = companyData;
    if (!cd) {
      const snap = await getDoc(doc(db, 'companies', companyId));
      if (snap.exists()) cd = snap.data();
    }
    if (!cd) return;
    try {
      const positionen: any[] = [];
      (est.mitarbeiterList || []).forEach((m: any, i: number) => {
        positionen.push({
          pos: i + 1, type: 'mitarbeiter', name: m.name,
          menge: parseFloat(m.stunden) || 0, einheit: 'Std.',
          einzelpreis: parseFloat(m.stundenlohn) || 0,
          gesamt: (parseFloat(m.stundenlohn) || 0) * (parseFloat(m.stunden) || 0),
        });
      });
      (est.materialienList || []).forEach((m: any, i: number) => {
        positionen.push({
          pos: positionen.length + 1, type: 'material', name: m.name,
          menge: parseFloat(m.menge) || 0, einheit: 'Stk.',
          einzelpreis: parseFloat(m.preis) || 0,
          gesamt: (parseFloat(m.preis) || 0) * (parseFloat(m.menge) || 0),
        });
      });
      (est.sonstigeKosten || []).forEach((s: any, i: number) => {
        positionen.push({
          pos: positionen.length + 1, type: 'sonstige', name: s.name,
          menge: 1, einheit: '-',
          einzelpreis: parseFloat(s.betrag) || 0,
          gesamt: parseFloat(s.betrag) || 0,
        });
      });

      const netAmount = positionen.reduce((s: number, p: any) => s + p.gesamt, 0);
      const margeFactor = 1 + (parseFloat(est.gewinnmarge) || 0) / 100;
      const grossAmount = netAmount * margeFactor;

      let tmpl = invoiceTemplate;
      if (companyId && !tmpl) {
        const snap = await getDoc(doc(db, 'companies', companyId, 'settings', 'invoice'));
        if (snap.exists()) tmpl = snap.data();
      }

      // Fortlaufende Rechnungsnummer EINMAL erzeugen und überall identisch nutzen
      // (interner Datensatz, Kunden-PDF und Dateiname) – vorher: Zufallsnr. intern ≠ fortlaufende im PDF
      const invoiceNumber = await generateSequentialInvoiceNumber(companyId, (tmpl?.invoiceNumberPrefix) || 'INV-');

      const invoiceData = {
        companyId,
        customerId: est.customerId || '',
        customerName: est.customerName || '',
        estimateId: est.id,
        estimateNumber: est.estimateNumber,
        invoiceNumber,
        status: 'offen',
        positions: positionen,
        gewinnmarge: parseFloat(est.gewinnmarge) || 0,
        netAmount: netAmount,
        taxAmount: 0,
        grossAmount,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        invoiceTemplate: tmpl || {},
      };

      const invoiceRef = await addDoc(collection(db, 'invoices'), invoiceData);

      await updateDoc(doc(db, 'estimates', est.id), {
        status: 'rechnung_erstellt',
        invoiceId: invoiceRef.id,
        invoiceNumber,
        updatedAt: new Date().toISOString(),
      });

      setEstimates(prev => prev.map(e =>
        e.id === est.id ? { ...e, status: 'rechnung_erstellt', invoiceId: invoiceRef.id, invoiceNumber } : e
      ));

      // Generate and download invoice PDF (geladene Firmendaten `cd`, gleiche Rechnungsnummer)
      const html = generateInvoiceHTML({
        id: invoiceRef.id,
        kunde: est.customerName,
        projekt: est.project,
        datum: new Date().toLocaleDateString('de-DE'),
        stunden: '0', stundenlohn: '0',
        umsatz: String(grossAmount),
        mitarbeiter: (est.mitarbeiterList || []).map((m: any) => m.name).join(', '),
      }, {
        companyName: cd?.name || 'Mein Unternehmen',
        companyOwner: cd?.owner || '',
        companyAddress: [cd?.street, cd?.zip, cd?.city].filter(Boolean).join(' '),
        companyPhone: cd?.phone || '',
        companyEmail: cd?.email || '',
        companyFax: '',
        companyWeb: cd?.website || '',
        companyTaxId: cd?.taxId || '',
        companyBankName: cd?.bankName || '',
        companyIban: cd?.iban || '',
        companyBic: cd?.bic || '',
      }, tmpl || {}, { customers: customers || [], invoiceNumber });

      downloadPDF(html, `Rechnung_${invoiceNumber}.html`);
    } catch (e) {
      console.error('convert to invoice error:', e);
    }
  };

  const handlePdfDownload = async (est: any) => {
    try {
      let cd = companyData;
      if (companyId && !cd) {
        const snap = await getDoc(doc(db, 'companies', companyId));
        if (snap.exists()) cd = snap.data();
      }
      if (!cd) { alert('Firmendaten nicht gefunden'); return; }
      let tmpl = invoiceTemplate;
      if (companyId && !tmpl) {
        const snap = await getDoc(doc(db, 'companies', companyId, 'settings', 'invoice'));
        if (snap.exists()) tmpl = snap.data();
      }
      const ml = (est.mitarbeiterList || []).map((m: any) => ({
        name: m.name, stundenlohn: String(m.stundenlohn || 0), stunden: String(m.stunden || 0)
      }));
      const matl = (est.materialienList || []).map((m: any) => ({
        id: Date.now(), name: m.name, preis: String(m.preis || 0), menge: String(m.menge || 0)
      }));
      const sk = (est.sonstigeKosten || []).map((s: any) => ({
        id: Date.now(), name: s.name, betrag: String(s.betrag || 0)
      }));
      const html = generateEstimateHTML({
        kunde: est.customerName || '', projekt: est.project || '',
        mitarbeiterList: ml, materialienList: matl, sonstigeKosten: sk,
        gewinnmarge: String(est.gewinnmarge || 0),
        companyData: cd, estimateNumber: est.estimateNumber,
      }, tmpl);
      downloadFile(html, `Kostenvoranschlag_${est.estimateNumber}.html`, 'text/html');
    } catch (e) {
      console.error('PDF download error:', e);
      alert('Fehler: ' + (e as Error).message);
    }
  };

  const deleteEstimate = async (id: string) => {
    if (!confirm('Kostenvoranschlag wirklich löschen?')) return;
    try {
      await deleteDoc(doc(db, 'estimates', id));
      setEstimates(prev => prev.filter(e => e.id !== id));
    } catch (e) {
      console.error('delete estimate error:', e);
    }
  };

  const buildZugferdParams = (customerName: string, customerId: string | null, items: { description: string; quantity: number; unitCode: string; unitPrice: number; netAmount: number }[], netTotal: number, taxRate: number, estNumber: string): ZugferdParams => {
    const buyer = customers.find(c => c.id === customerId) as any;
    const cd = companyData || {};
    const taxTotal = netTotal * (taxRate / 100);
    const grossTotal = netTotal + taxTotal;
    return {
      invoiceNumber: estNumber,
      invoiceDate: new Date().toISOString().split('T')[0],
      seller: {
        name: cd.companyName || cd.name || 'Mein Unternehmen',
        street: cd.street || '',
        zip: cd.zip || '',
        city: cd.city || '',
        taxId: cd.taxId || '',
        email: cd.email || '',
        phone: cd.phone || '',
        owner: cd.owner || '',
      },
      buyer: {
        name: customerName,
        street: buyer?.street || '',
        zip: buyer?.zip || '',
        city: buyer?.city || '',
      },
      lineItems: items.map((item, i) => ({
        id: String(i + 1),
        description: item.description,
        quantity: item.quantity,
        unitCode: item.unitCode,
        unitPrice: item.unitPrice,
        netAmount: item.netAmount,
        taxPercent: taxRate,
      })),
      netTotal,
      taxTotal,
      grossTotal,
      taxRate,
      paymentTerms: 'Zahlbar innerhalb von 14 Tagen',
    };
  };

  // Positionen auf den Netto-Endpreis (inkl. Gewinnmarge) skalieren, damit die
  // E-Rechnung-Zeilen in Summe dem Rechnungsnetto entsprechen (rechtlich korrekt).
  function scaleItems<T extends { unitPrice: number; netAmount: number }>(items: T[], margeFactor: number): T[] {
    return items.map(it => ({ ...it, unitPrice: it.unitPrice * margeFactor, netAmount: it.netAmount * margeFactor }));
  }

  const handleZugferdPreview = async () => {
    if (!previewHtml || !currentEstimateNumber || !companyData) return;
    const items: { description: string; quantity: number; unitCode: string; unitPrice: number; netAmount: number }[] = [];
    mitarbeiterList.forEach((m: any) => {
      const cost = (parseFloat(m.stundenlohn) || 0) * (parseFloat(m.stunden) || 0);
      if (cost > 0) items.push({ description: `${m.name} (Stundenlohn)`, quantity: parseFloat(m.stunden) || 0, unitCode: 'HUR', unitPrice: parseFloat(m.stundenlohn) || 0, netAmount: cost });
    });
    materialienList.filter(m => m.name).forEach((m: any) => {
      const cost = (parseFloat(m.preis) || 0) * (parseFloat(m.menge) || 0);
      if (cost > 0) items.push({ description: m.name, quantity: parseFloat(m.menge) || 0, unitCode: 'C62', unitPrice: parseFloat(m.preis) || 0, netAmount: cost });
    });
    sonstigeKosten.filter(s => s.name).forEach((s: any) => {
      const cost = parseFloat(s.betrag) || 0;
      if (cost > 0) items.push({ description: s.name, quantity: 1, unitCode: 'C62', unitPrice: cost, netAmount: cost });
    });
    const margeFactor = 1 + (parseFloat(gewinnmarge) || 0) / 100;
    const taxRate = (Number.isFinite(parseFloat(invoiceTemplate?.taxRate)) ? parseFloat(invoiceTemplate?.taxRate) : 19);
    const params = buildZugferdParams(selectedCustomer?.name || '', selectedCustomerId, scaleItems(items, margeFactor), endpreis, taxRate, currentEstimateNumber);
    const xml = generateZugferdXML(params);
    await downloadZugferdPDF(previewHtml, xml, `Kostenvoranschlag_${currentEstimateNumber}.html`);
  };

  const handleZugferdHistory = async (est: any) => {
    const ml = (est.mitarbeiterList || []).map((m: any) => ({ name: m.name, stundenlohn: String(m.stundenlohn || 0), stunden: String(m.stunden || 0) }));
    const matl = (est.materialienList || []).map((m: any) => ({ name: m.name, preis: String(m.preis || 0), menge: String(m.menge || 0) }));
    const sk = (est.sonstigeKosten || []).map((s: any) => ({ name: s.name, betrag: String(s.betrag || 0) }));
    let cd = companyData;
    if (companyId && !cd) {
      const snap = await getDoc(doc(db, 'companies', companyId));
      if (snap.exists()) cd = snap.data();
    }
    let tmpl = invoiceTemplate;
    if (companyId && !tmpl) {
      const snap = await getDoc(doc(db, 'companies', companyId, 'settings', 'invoice'));
      if (snap.exists()) tmpl = snap.data();
    }
    const html = generateEstimateHTML({
      kunde: est.customerName || '', projekt: est.project || '',
      mitarbeiterList: ml, materialienList: matl, sonstigeKosten: sk,
      gewinnmarge: String(est.gewinnmarge || 0),
      companyData: cd, estimateNumber: est.estimateNumber,
    }, tmpl);
    const items: { description: string; quantity: number; unitCode: string; unitPrice: number; netAmount: number }[] = [];
    (est.mitarbeiterList || []).forEach((m: any) => {
      const cost = (parseFloat(m.stundenlohn) || 0) * (parseFloat(m.stunden) || 0);
      if (cost > 0) items.push({ description: `${m.name} (Stundenlohn)`, quantity: parseFloat(m.stunden) || 0, unitCode: 'HUR', unitPrice: parseFloat(m.stundenlohn) || 0, netAmount: cost });
    });
    (est.materialienList || []).filter((m: any) => m.name).forEach((m: any) => {
      const cost = (parseFloat(m.preis) || 0) * (parseFloat(m.menge) || 0);
      if (cost > 0) items.push({ description: m.name, quantity: parseFloat(m.menge) || 0, unitCode: 'C62', unitPrice: parseFloat(m.preis) || 0, netAmount: cost });
    });
    (est.sonstigeKosten || []).filter((s: any) => s.name).forEach((s: any) => {
      const cost = parseFloat(s.betrag) || 0;
      if (cost > 0) items.push({ description: s.name, quantity: 1, unitCode: 'C62', unitPrice: cost, netAmount: cost });
    });
    const netCost = items.reduce((s, i) => s + i.netAmount, 0);
    const margeFactor = 1 + (parseFloat(est.gewinnmarge) || 0) / 100;
    const netTotal = netCost * margeFactor; // Rechnungsnetto inkl. Gewinnmarge
    const taxRate = (Number.isFinite(parseFloat(tmpl?.taxRate)) ? parseFloat(tmpl?.taxRate) : 19);
    const params = buildZugferdParams(est.customerName || '', est.customerId || null, scaleItems(items, margeFactor), netTotal, taxRate, est.estimateNumber);
    const xml = generateZugferdXML(params);
    await downloadZugferdPDF(html, xml, `Kostenvoranschlag_${est.estimateNumber}.html`);
  };

  if (loading || !user) return <PageSkeleton variant="table" maxWidth="max-w-5xl" />;

  // kein w-full hier: kollidiert sonst mit expliziten Breiten (w-24 etc.) und quetscht das flex-1-Namensfeld zusammen
  const inputCls = 'px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 transition-colors';

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="px-4 md:px-8 py-6 md:py-10 max-w-6xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Kostenvoranschläge</h1>
              <p className="text-slate-500 text-sm mt-1">Erstelle, verwalte und versende Angebote an einem Ort.</p>
            </div>
            {tab === 'history' && (
              <button onClick={() => setTab('new')}
                className="shrink-0 inline-flex items-center gap-2 px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm">
                <Pencil className="w-3.5 h-3.5" /> Neu erstellen
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit">
            {([['new', 'Neu erstellen'], ['history', 'Verlauf']] as const).map(([t, label]) => (
              <button key={t} onClick={() => setTab(t)}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}>
                {t === 'new' ? <Pencil className="w-3.5 h-3.5" /> : <ClipboardList className="w-3.5 h-3.5" />}
                {label}
              </button>
            ))}
          </div>

          {tab === 'new' ? (
            <>
              {/* Template selector */}
              {templates.length > 0 && !selectedCustomerId && (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100">
                    <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2"><ClipboardList className="w-4 h-4 text-slate-400" /> Aus Vorlage erstellen</h2>
                  </div>
                  <div className="p-6">
                    <div className="flex flex-wrap gap-2">
                      {templates.map(tpl => (
                        <button key={tpl.id} onClick={() => applyTemplate(tpl)}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 transition-colors text-left">
                          <span className="text-sm font-medium text-slate-700">{tpl.name}</span>
                          <span className="text-xs text-slate-400">{tpl.materials?.length || 0} Materialien</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Section 1: Projektdaten */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
                  <span className="text-xs font-medium text-slate-400 tabular-nums">01</span>
                  <h2 className="text-sm font-semibold text-slate-900">Projektdaten</h2>
                </div>
                <div className="p-6 space-y-5">
                  <div>
                    <label className={ui.label}>Kunde auswählen</label>
                    {customers.length === 0 ? (
                      <p className="text-sm text-slate-400">Keine Kunden angelegt.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {customers.map(c => {
                          const sel = selectedCustomerId === c.id;
                          return (
                            <button key={c.id} type="button" onClick={() => { setSelectedCustomerId(sel ? null : c.id); clearError(); }}
                              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                                sel ? 'bg-teal-50/60 border-teal-300' : 'bg-white border-slate-200 hover:border-slate-300'
                              }`}>
                              {c.imageUrl?.startsWith('https://') || c.imageUrl?.startsWith('data:image/') ? (
                                <img src={c.imageUrl} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 text-xs font-medium flex items-center justify-center shrink-0">
                                  {(c.name || '?').charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-slate-900 truncate">{c.name}</p>
                                {c.email && <p className="text-xs text-slate-500 truncate">{c.email}</p>}
                              </div>
                              {sel && <Check className="ml-auto w-4 h-4 text-teal-600 shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {selectedCustomer && (
                      <div className="mt-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
                        <p className="text-sm font-medium text-slate-900">{selectedCustomer.name}</p>
                        <div className="flex gap-4 text-xs text-slate-500 mt-1">
                          {selectedCustomer.email && <span className="inline-flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> {selectedCustomer.email}</span>}
                          {selectedCustomer.telefon && <span className="inline-flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {selectedCustomer.telefon}</span>}
                        </div>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className={ui.label}>Projektname</label>
                    <input value={projekt} onChange={e => { setProjekt(e.target.value); clearError(); }} placeholder="z.B. Badrenovierung Müller" className={`w-full ${inputCls}`} />
                  </div>
                </div>
              </div>

              {/* Section 2: Personal */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
                  <span className="text-xs font-medium text-slate-400 tabular-nums">02</span>
                  <h2 className="text-sm font-semibold text-slate-900">Personal</h2>
                </div>
                <div className="p-6 space-y-5">
                  <div>
                    <label className={ui.label}>Mitarbeiter auswählen</label>
                    {employees.length === 0 ? (
                      <p className="text-sm text-slate-400">Keine Mitarbeiter angelegt.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {employees.map(emp => {
                          const sel = selectedEmployeeIds.includes(emp.id);
                          return (
                            <button key={emp.id} type="button" onClick={() => { toggleEmployee(emp.id); clearError(); }}
                              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                                sel ? 'bg-teal-50/60 border-teal-300' : 'bg-white border-slate-200 hover:border-slate-300'
                              }`}>
                              {emp.imageUrl?.startsWith('https://') || emp.imageUrl?.startsWith('data:image/') ? (
                                <img src={emp.imageUrl} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 text-xs font-medium flex items-center justify-center shrink-0">
                                  {(emp.name || '?').charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-slate-900 truncate">{emp.name}</p>
                                <p className="text-xs text-slate-500">{emp.stundenlohn} €/Std.</p>
                              </div>
                              {sel && <Check className="ml-auto w-4 h-4 text-teal-600 shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {mitarbeiterList.length > 0 && (
                    <div>
                      <label className={ui.label}>Stunden pro Mitarbeiter</label>
                      <div className="space-y-2">
                        {mitarbeiterList.map((m: any) => (
                          <div key={m.id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
                            <span className="text-sm font-medium text-slate-900 min-w-[120px]">{m.name}</span>
                            <span className="text-xs text-slate-500">{m.stundenlohn} €/Std.</span>
                            <input type="number" step="0.5" min="0" value={mitarbeiterStunden[m.id] || ''}
                              onChange={e => setMitarbeiterStunden(prev => ({ ...prev, [m.id]: e.target.value }))}
                              placeholder="Stunden" className="w-24 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 ml-auto transition-colors" />
                            {(parseFloat(m.stundenlohn) || 0) * (parseFloat(m.stunden) || 0) > 0 && (
                              <span className="text-sm font-medium text-slate-900 tabular-nums min-w-[80px] text-right">
                                {fmt((parseFloat(m.stundenlohn) || 0) * (parseFloat(m.stunden) || 0))} €
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                      {totalMitarbeiter > 0 && (
                        <div className="mt-3 px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-200 flex justify-between items-center">
                          <span className="text-sm text-slate-500">Personal gesamt</span>
                          <span className="text-sm font-semibold text-slate-900 tabular-nums">{fmt(totalMitarbeiter)} €</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Section 3: Materialien */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
                  <span className="text-xs font-medium text-slate-400 tabular-nums">03</span>
                  <h2 className="text-sm font-semibold text-slate-900">Materialien</h2>
                </div>
                <div className="p-6 space-y-3">
                  {materialienList.map((m, idx) => (
                    <div key={m.id} className="flex items-center gap-2">
                      <input value={m.name} onChange={e => { const nl = [...materialienList]; nl[idx] = { ...nl[idx], name: e.target.value }; setMaterialienList(nl); }}
                        placeholder="Materialname" className={`flex-1 ${inputCls}`} />
                      <input type="number" step="0.01" min="0" value={m.preis} onChange={e => { const nl = [...materialienList]; nl[idx] = { ...nl[idx], preis: e.target.value }; setMaterialienList(nl); }}
                        placeholder="Preis" className={`w-24 ${inputCls}`} />
                      <input type="number" step="1" min="0" value={m.menge} onChange={e => { const nl = [...materialienList]; nl[idx] = { ...nl[idx], menge: e.target.value }; setMaterialienList(nl); }}
                        placeholder="Menge" className={`w-20 ${inputCls}`} />
                      <span className="text-sm font-medium text-slate-900 tabular-nums min-w-[70px] text-right">{fmt((parseFloat(m.preis) || 0) * (parseFloat(m.menge) || 0))} €</span>
                      <button onClick={() => materialienList.length > 1 && setMaterialienList(prev => prev.filter((_, i) => i !== idx))}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                  <button onClick={() => setMaterialienList(prev => [...prev, { id: Date.now(), name: '', preis: '', menge: '' }])}
                    className="text-sm text-teal-700 hover:text-teal-800 font-medium transition-colors">+ Material hinzufügen</button>
                  {totalMaterial > 0 && (
                    <div className="px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-200 flex justify-between items-center">
                      <span className="text-sm text-slate-500">Material gesamt</span>
                      <span className="text-sm font-semibold text-slate-900 tabular-nums">{fmt(totalMaterial)} €</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Section 4: Sonstige Kosten */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
                  <span className="text-xs font-medium text-slate-400 tabular-nums">04</span>
                  <h2 className="text-sm font-semibold text-slate-900">Sonstige Kosten</h2>
                </div>
                <div className="p-6 space-y-3">
                  {sonstigeKosten.map((s, idx) => (
                    <div key={s.id} className="flex items-center gap-2">
                      <input value={s.name} onChange={e => { const nl = [...sonstigeKosten]; nl[idx] = { ...nl[idx], name: e.target.value }; setSonstigeKosten(nl); }}
                        placeholder="Bezeichnung" className={`flex-1 ${inputCls}`} />
                      <input type="number" step="0.01" min="0" value={s.betrag} onChange={e => { const nl = [...sonstigeKosten]; nl[idx] = { ...nl[idx], betrag: e.target.value }; setSonstigeKosten(nl); }}
                        placeholder="Betrag" className={`w-28 ${inputCls}`} />
                      <span className="text-sm font-medium text-slate-900 tabular-nums min-w-[70px] text-right">{fmt(parseFloat(s.betrag) || 0)} €</span>
                      <button onClick={() => sonstigeKosten.length > 1 && setSonstigeKosten(prev => prev.filter((_, i) => i !== idx))}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                  <button onClick={() => setSonstigeKosten(prev => [...prev, { id: Date.now(), name: '', betrag: '' }])}
                    className="text-sm text-teal-700 hover:text-teal-800 font-medium transition-colors">+ Weitere Kosten</button>
                  {totalSonstige > 0 && (
                    <div className="px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-200 flex justify-between items-center">
                      <span className="text-sm text-slate-500">Sonstige gesamt</span>
                      <span className="text-sm font-semibold text-slate-900 tabular-nums">{fmt(totalSonstige)} €</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Section 5: Zusammenfassung */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
                  <span className="text-xs font-medium text-slate-400 tabular-nums">05</span>
                  <h2 className="text-sm font-semibold text-slate-900">Zusammenfassung</h2>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <label className={ui.label}>Gewinnmarge (%)</label>
                    <input type="number" step="0.1" min="0" value={gewinnmarge} onChange={e => setGewinnmarge(e.target.value)}
                      placeholder="z.B. 20" className={`w-32 ${inputCls}`} />
                  </div>

                  <div className="rounded-lg p-4 space-y-2.5 border border-slate-200">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Personal</span>
                      <span className="font-medium text-slate-900 tabular-nums">{fmt(totalMitarbeiter)} €</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Materialien</span>
                      <span className="font-medium text-slate-900 tabular-nums">{fmt(totalMaterial)} €</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Sonstige Kosten</span>
                      <span className="font-medium text-slate-900 tabular-nums">{fmt(totalSonstige)} €</span>
                    </div>
                    <div className="border-t border-slate-100 pt-2.5 flex justify-between text-sm">
                      <span className="text-slate-500">Summe Netto</span>
                      <span className="font-medium text-slate-900 tabular-nums">{fmt(gesamt)} €</span>
                    </div>
                    {margeNum > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Aufschlag {margeNum} %</span>
                        <span className="font-medium text-slate-900 tabular-nums">{fmt(gesamt * margeNum / 100)} €</span>
                      </div>
                    )}
                    <div className="border-t border-slate-200 pt-2.5 flex justify-between items-center">
                      <span className="text-sm font-semibold text-slate-900">Endsumme</span>
                      <div className="flex items-center gap-2.5">
                        <span className="text-lg font-semibold text-slate-900 tabular-nums">{fmt(endpreis)} €</span>
                        {margeNum > 0 && gesamt > 0 && (() => {
                          const grade = getGrade(margeNum);
                          return (
                            <span className="inline-flex items-center justify-center w-7 h-6 rounded-md text-xs font-semibold" style={{ color: getGradeColor(grade), backgroundColor: getGradeBg(grade) }}>
                              {grade}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  {validationError && (
                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                      <TriangleAlert className="w-4 h-4 text-red-500 shrink-0" /> {validationError}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button onClick={handleShowPreview} className={`flex-1 ${ui.btnSecondary}`}>
                      Vorschau
                    </button>
                    <button onClick={handleSaveEstimate} disabled={saving}
                      className={`flex-1 ${ui.btnPrimary} disabled:opacity-50`}>
                      {saving ? 'Speichert …' : 'Speichern'}
                    </button>
                    <button onClick={() => setShowTemplateDialog(true)} className={ui.btnSecondary}>
                      <Folder className="w-4 h-4" /> Als Vorlage
                    </button>
                  </div>
                  {templates.length > 0 && (
                    <div>
                      <details className="group">
                        <summary className="text-xs text-slate-400 hover:text-slate-600 font-medium cursor-pointer transition-colors">
                          Vorlagen verwalten ({templates.length})
                        </summary>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {templates.map(tpl => (
                            <div key={tpl.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs">
                              <span className="font-medium text-slate-700">{tpl.name}</span>
                              <button onClick={() => tpl.id && handleDeleteTemplate(tpl.id)}
                                className="text-slate-400 hover:text-red-600 transition-colors"><X className="w-3.5 h-3.5" /></button>
                            </div>
                          ))}
                        </div>
                      </details>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* KPI strip */}
              {estimates.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: 'Gesamt', value: fmt(historyStats.total) + ' €', count: historyStats.count, icon: TrendingUp, iconColor: 'text-teal-600', iconBg: 'bg-teal-50' },
                    { label: 'Offen', value: fmt(historyStats.open) + ' €', count: estimates.filter(e => ['entwurf','gesendet'].includes(e.status||'entwurf')).length, icon: Clock, iconColor: 'text-amber-600', iconBg: 'bg-amber-50' },
                    { label: 'Angenommen', value: fmt(historyStats.accepted) + ' €', count: estimates.filter(e => ['angenommen','rechnung_erstellt'].includes(e.status||'')).length, icon: CheckCircle2, iconColor: 'text-emerald-600', iconBg: 'bg-emerald-50' },
                    { label: 'Abgelehnt', value: fmt(historyStats.rejected) + ' €', count: estimates.filter(e => e.status === 'abgelehnt').length, icon: XCircle, iconColor: 'text-red-500', iconBg: 'bg-red-50' },
                  ].map(k => (
                    <div key={k.label} className="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.03),0_10px_28px_-14px_rgba(15,23,42,0.08)] px-5 py-4 flex items-center gap-3.5">
                      <div className={`w-9 h-9 ${k.iconBg} rounded-xl flex items-center justify-center shrink-0`}>
                        <k.icon className={`w-4.5 h-4.5 ${k.iconColor}`} style={{ width: 18, height: 18 }} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-slate-400 font-medium">{k.label} <span className="text-slate-300">· {k.count}</span></p>
                        <p className="text-base font-bold text-slate-900 tabular-nums truncate">{k.value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Search + Status Filter */}
              <div className="flex flex-col sm:flex-row gap-3">
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Suchen nach Kunde, Projekt oder Nr. …"
                  className={`flex-1 ${inputCls}`} />
                <div className="flex gap-1 p-1 bg-slate-100 rounded-lg shrink-0 overflow-x-auto">
                  {(['alle', 'entwurf', 'gesendet', 'angenommen', 'abgelehnt'] as const).map(s => (
                    <button key={s} onClick={() => setStatusHistoryFilter(s)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-all ${
                        statusHistoryFilter === s ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                      }`}>
                      {s === 'alle' ? 'Alle' : STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>

              {/* History Table */}
              <div className="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.03),0_10px_28px_-14px_rgba(15,23,42,0.08)] overflow-hidden">
                {/* Desktop headers */}
                <div className="hidden md:grid grid-cols-[110px_1fr_160px_110px_120px_1fr_44px] gap-x-4 px-5 py-3 border-b border-slate-100 bg-slate-50/60 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                  <span>Nr.</span><span>Projekt</span><span>Kunde</span><span>Datum</span><span className="text-right">Betrag</span><span>Status / Aktionen</span><span />
                </div>

                {estimatesLoading ? (
                  <div className="p-16 text-center text-sm text-slate-400">Lade …</div>
                ) : filteredEstimates.length === 0 ? (
                  <div className="p-16 text-center">
                    <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                      <ClipboardList className="w-5 h-5 text-slate-400" />
                    </div>
                    <p className="text-sm font-medium text-slate-900 mb-1">Keine Kostenvoranschläge</p>
                    <p className="text-sm text-slate-500">
                      {statusHistoryFilter !== 'alle' ? `Keine Einträge mit Status "${STATUS_LABELS[statusHistoryFilter]}"` : 'Erstelle deinen ersten Kostenvoranschlag unter „Neu erstellen".'}
                    </p>
                  </div>
                ) : (
                  filteredEstimates.map((est: any) => {
                    const status = (est.status || 'entwurf') as EstimateStatus;
                    const colors = STATUS_COLORS[status];
                    const actionBtns = (
                      <div className="flex items-center gap-1 flex-wrap">
                        {status === 'entwurf' && <>
                          <button onClick={() => updateEstimateStatus(est.id, 'gesendet')} className="px-2 py-1 rounded-md text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors">Als gesendet</button>
                          <button onClick={() => convertToInvoice(est)} className="px-2 py-1 rounded-md text-xs font-medium text-teal-700 bg-teal-50 border border-teal-200 hover:bg-teal-100 transition-colors">→ Rechnung</button>
                        </>}
                        {status === 'gesendet' && <>
                          <button onClick={() => updateEstimateStatus(est.id, 'angenommen')} className="px-2 py-1 rounded-md text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition-colors">Angenommen</button>
                          <button onClick={() => updateEstimateStatus(est.id, 'abgelehnt')} className="px-2 py-1 rounded-md text-xs font-medium text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 transition-colors">Abgelehnt</button>
                          <button onClick={() => convertToInvoice(est)} className="px-2 py-1 rounded-md text-xs font-medium text-teal-700 bg-teal-50 border border-teal-200 hover:bg-teal-100 transition-colors">→ Rechnung</button>
                        </>}
                        {status === 'angenommen' && (
                          <button onClick={() => convertToInvoice(est)} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-teal-700 bg-teal-50 border border-teal-200 hover:bg-teal-100 transition-colors">
                            <Receipt className="w-3 h-3" /> Rechnung
                          </button>
                        )}
                        {status === 'rechnung_erstellt' && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-teal-700 bg-teal-50">
                            <Check className="w-3 h-3" />Rechnung erstellt
                          </span>
                        )}
                        <button onClick={() => handlePdfDownload(est)} className="px-2 py-1 rounded-md text-xs font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors">PDF</button>
                        <button onClick={async () => { try { await handleZugferdHistory(est); } catch (e) { alert('Fehler: ' + (e as Error).message); } }}
                          className="px-2 py-1 rounded-md text-xs font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors">E-Re.</button>
                        <button onClick={() => deleteEstimate(est.id)} title="Löschen" className="p-1 rounded-md text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                    return (
                      <div key={est.id} className="border-t border-slate-100 hover:bg-slate-50/40 transition-colors">
                        {/* Desktop row */}
                        <div className="hidden md:grid grid-cols-[110px_1fr_160px_110px_120px_1fr_44px] gap-x-4 px-5 py-3.5 items-center">
                          <span className="text-xs text-slate-400 tabular-nums font-medium">{est.estimateNumber}</span>
                          <span className="text-sm font-semibold text-slate-900 truncate">{est.project || 'Unbenannt'}</span>
                          <span className="text-sm text-slate-500 truncate">{est.customerName || '–'}</span>
                          <span className="text-xs text-slate-400">{est.createdAt ? new Date(est.createdAt).toLocaleDateString('de-DE') : '–'}</span>
                          <span className="text-sm font-bold text-slate-900 tabular-nums text-right">{fmt(est.totalGross || 0)} €</span>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium shrink-0"
                              style={{ backgroundColor: colors.bg, color: colors.text }}>
                              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: colors.dot }} />
                              {STATUS_LABELS[status]}
                            </span>
                            {est.invoiceNumber && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500">
                                <Receipt className="w-2.5 h-2.5" />{est.invoiceNumber}
                              </span>
                            )}
                          </div>
                          {actionBtns}
                        </div>

                        {/* Mobile card */}
                        <div className="md:hidden p-4 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900 truncate">{est.project || 'Unbenannt'}</p>
                              <p className="text-xs text-slate-500">{est.customerName || '–'} · {est.estimateNumber} · {est.createdAt ? new Date(est.createdAt).toLocaleDateString('de-DE') : '–'}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-sm font-bold text-slate-900 tabular-nums">{fmt(est.totalGross || 0)} €</span>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium"
                                style={{ backgroundColor: colors.bg, color: colors.text }}>
                                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: colors.dot }} />
                                {STATUS_LABELS[status]}
                              </span>
                            </div>
                          </div>
                          {actionBtns}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      </main>

      {showTemplateDialog && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md p-6">
            <h3 className="text-base font-semibold text-slate-900 mb-4 flex items-center gap-2"><Folder className="w-4 h-4 text-slate-400" /> Als Vorlage speichern</h3>
            <input value={templateName} onChange={e => setTemplateName(e.target.value)}
              placeholder="Vorlagenname (z.B. Badrenovierung Standard)"
              className={`w-full ${inputCls} mb-4`} />
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setShowTemplateDialog(false); setTemplateName(''); }} className={ui.btnGhost}>
                Abbrechen
              </button>
              <button onClick={handleSaveAsTemplate} disabled={!templateName.trim()}
                className={`${ui.btnPrimary} disabled:opacity-50`}>
                Speichern
              </button>
            </div>
          </div>
        </div>
      )}

      {showPdfPreview && previewHtml && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Kostenvoranschlag Vorschau</h3>
                <p className="text-sm text-slate-500">{currentEstimateNumber}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { handleSaveEstimate(); setShowPdfPreview(false); }} className={ui.btnPrimary}>
                  Speichern
                </button>
                <button onClick={() => downloadPDF(previewHtml, `Kostenvoranschlag_${currentEstimateNumber}.html`)} className={ui.btnSecondary}>
                  PDF speichern
                </button>
                <button onClick={handleZugferdPreview} className={ui.btnSecondary}>
                  E-Rechnung PDF
                </button>
                <button onClick={() => { setShowPdfPreview(false); setPreviewHtml(''); }} className={ui.btnGhost}>
                  Schließen
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-slate-50 p-4">
              <iframe srcDoc={previewHtml} sandbox="allow-same-origin" className="w-full h-full bg-white rounded-lg border border-slate-200" style={{ minHeight: '70vh' }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
