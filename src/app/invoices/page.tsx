'use client';

import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';
import PageSkeleton from '@/components/skeletons/PageSkeleton';
import UpgradeModal from '@/components/UpgradeModal';
import { RefreshCw, X, Check, Wallet, Clock3, AlertTriangle, CheckCircle2, FileX } from 'lucide-react';
import { formatCurrency, parseGermanCurrency } from '@/lib/utils';
import { doc, updateDoc, getDoc, addDoc, collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { loadRecurringConfigs, saveRecurringConfig, deleteRecurringConfig, updateRecurringConfig, getNextDate, formatDateStr as fmtRecDate, isDue, type RecurringConfig } from '@/lib/recurringInvoices';
import { getFeatureFlag } from '@/lib/plans';
import { logUsage } from '@/lib/usageLog';
import { generateInvoiceHTML, generateSequentialInvoiceNumber } from '@/lib/estimateUtils';
import { generateZugferdXML, parseCustomerAddress } from '@/lib/zugferd';
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
  const [generatingRecurringId, setGeneratingRecurringId] = useState<string | null>(null);
  const [showRecurringDialog, setShowRecurringDialog] = useState(false);
  const [recurringName, setRecurringName] = useState('');
  const [recurringInterval, setRecurringInterval] = useState<'monthly' | 'quarterly' | 'yearly'>('monthly');
  const [recurringForAssignment, setRecurringForAssignment] = useState<any>(null);
  const [dueBannerDismissed, setDueBannerDismissed] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState<'dunning' | 'recurring' | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncToast, setSyncToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [showRecurringSection, setShowRecurringSection] = useState(true);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [standaloneDocs, setStandaloneDocs] = useState<any[]>([]);
  const [standaloneUpdating, setStandaloneUpdating] = useState<string | null>(null);

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [user, loading, router]);

  // Rechnungen aus Kostenvoranschlag-Umwandlung / Wiederkehrend — leben in einer eigenen
  // Collection ohne Auftragsbezug (kein assignmentId). Mobile-ZUGFeRD-Export-Logs haben
  // immer eine assignmentId (bereits über assignments getrackt) und werden hier bewusst
  // ausgeschlossen, sonst würde derselbe Umsatz doppelt gezählt.
  useEffect(() => {
    if (!companyId) return;
    const unsub = onSnapshot(
      query(collection(db, 'invoices'), where('companyId', '==', companyId)),
      snap => {
        const docs = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter((d: any) => !d.assignmentId);
        setStandaloneDocs(docs);
      },
      e => console.error('standalone invoices listener error:', e),
    );
    return () => unsub();
  }, [companyId]);

  const standaloneInvoices = useMemo(() => {
    return standaloneDocs
      .map((d: any) => ({
        id: d.id,
        customerName: d.customerName || 'Unbekannter Kunde',
        title: d.estimateNumber ? `Kostenvoranschlag ${d.estimateNumber}` : (d.invoiceNumber ? `Rechnung ${d.invoiceNumber}` : 'Rechnung'),
        amount: typeof d.grossAmount === 'number' ? d.grossAmount : parseGermanCurrency(d.umsatz || 0),
        status: (d.status || 'offen') as InvoiceStatus,
        date: d.createdAt ? new Date(d.createdAt).toLocaleDateString('de-DE') : (d.invoiceDate ? new Date(d.invoiceDate).toLocaleDateString('de-DE') : '–'),
        dueDate: addDays(d.createdAt ? new Date(d.createdAt) : (d.invoiceDate ? new Date(d.invoiceDate) : new Date()), 14).toLocaleDateString('de-DE'),
      }))
      .sort((a, b) => {
        const order: Record<string, number> = { offen: 0, gesendet: 1, mahnung_1: 2, mahnung_2: 3, bezahlt: 4, storniert: 5 };
        return (order[a.status] || 0) - (order[b.status] || 0);
      });
  }, [standaloneDocs]);

  async function updateStandaloneStatus(id: string, newStatus: InvoiceStatus) {
    setStandaloneUpdating(id);
    try {
      await updateDoc(doc(db, 'invoices', id), { status: newStatus });
    } catch (e) {
      console.error('updateStandaloneStatus failed:', e);
    } finally {
      setStandaloneUpdating(null);
    }
  }

  function downloadStandaloneInvoicePDF(inv: { id: string; customerName: string; title: string; amount: number; date: string }) {
    const ci = companyInfo || {};
    const companyData = {
      companyName: ci.companyName || ci.name || 'Mein Unternehmen',
      companyOwner: ci.owner || '',
      companyAddress: [ci.street, `${ci.zip || ''} ${ci.city || ''}`].filter(Boolean).join(', '),
      companyPhone: ci.phone || '', companyEmail: ci.email || '', companyWeb: ci.website || '',
      companyTaxId: ci.taxId || '', companyBankName: ci.bankName || '', companyIban: ci.iban || '', companyBic: ci.bic || '',
    };
    const html = generateInvoiceHTML({
      kunde: inv.customerName, projekt: inv.title, datum: inv.date,
      stunden: '0', stundenlohn: '0', umsatz: String(inv.amount), mitarbeiter: '',
    }, companyData, invoiceTemplate || {}, { customers: customers || [] });
    downloadFile(html, `${inv.title.replace(/[^a-zA-Z0-9äöüÄÖÜß ]/g, '')}.html`, 'text/html');
  }
  // Menü schließen statt an veralteter Position hängenzubleiben, wenn gescrollt/resized wird
  useEffect(() => {
    if (!openMenu) return;
    const close = () => setOpenMenu(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [openMenu]);
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
    if (!companyId || generatingRecurringId) return;   // Doppelklick-Schutz gegen Duplikat-Rechnungen
    setGeneratingRecurringId(config.id || 'pending');
    const today = new Date().toISOString().split('T')[0];
    try {
      const invoiceNumber = companyId
        ? await generateSequentialInvoiceNumber(companyId, 'R-')
        : `R-${today.replace(/-/g, '')}-${Date.now().toString(36).toUpperCase().slice(-4)}`;
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
      if (config.id) {
        await updateRecurringConfig(companyId, config.id, { nextInvoiceDate: nextDate, lastInvoiceDate: today });
        // Lokalen State sofort aktualisieren, damit die Config nicht mehr als "fällig" gilt
        // (verhindert versehentliches erneutes Erstellen derselben Rechnung).
        setRecurringConfigs(prev => prev.map(c => c.id === config.id ? { ...c, nextInvoiceDate: nextDate, lastInvoiceDate: today } : c));
      }
    } catch (e) {
      console.error('recurring invoice generation failed:', e);
      alert('Fehler beim Erstellen der Rechnung. Bitte versuche es erneut.');
    } finally {
      setGeneratingRecurringId(null);
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
    const isOpenLike = (s: string) => s === 'offen' || s === 'gesendet' || s === 'mahnung_1' || s === 'mahnung_2';
    const isOverdue = (s: string) => s === 'mahnung_1' || s === 'mahnung_2';
    const isPaidStatus = (s: string) => s === 'bezahlt';

    let total = invoices.reduce((s: number, a: any) => s + a._revenue, 0);
    let open = invoices.filter((a: any) => isOpenLike(a._invoiceStatus)).reduce((s: number, a: any) => s + a._revenue, 0);
    let overdue = invoices.filter((a: any) => isOverdue(a._invoiceStatus)).reduce((s: number, a: any) => s + a._revenue, 0);
    let paid = invoices.filter((a: any) => isPaidStatus(a._invoiceStatus)).reduce((s: number, a: any) => s + a._revenue, 0);

    for (const inv of standaloneInvoices) {
      total += inv.amount;
      if (isOpenLike(inv.status)) open += inv.amount;
      if (isOverdue(inv.status)) overdue += inv.amount;
      if (isPaidStatus(inv.status)) paid += inv.amount;
    }
    return { total, open, overdue, paid, count: invoices.length + standaloneInvoices.length };
  }, [invoices, standaloneInvoices]);

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
    // §14 UStG verlangt die vollständige Anschrift des Rechnungsempfängers
    const cust = (customers || []).find((c: any) => c.name === a.kunde);
    if (!cust?.adresse && !confirm(`Für „${a.kunde || 'diesen Kunden'}“ ist keine Adresse hinterlegt. Rechnungen müssen nach § 14 UStG die Anschrift des Empfängers enthalten.\n\nTrotzdem fortfahren? (Adresse unter „Kunden“ ergänzen empfohlen)`)) return;
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
      const today = new Date();
      const num = companyId ? await generateSequentialInvoiceNumber(companyId, tmpl.invoiceNumberPrefix || 'INV-') : `${tmpl.invoiceNumberPrefix || 'INV-'}${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}-${String(Math.floor(Math.random() * 99999)).padStart(5, '0')}`;
      const html = generateInvoiceHTML(a, companyData, tmpl, { customers: customers || [], invoiceNumber: num });
      const hours = parseFloat(String(a.stunden)) || 0;
      const revenue = parseGermanCurrency(a.umsatz);
      const taxRate = (Number.isFinite(parseFloat(tmpl.taxRate)) ? parseFloat(tmpl.taxRate) : 19);
      // Verknüpftes Lager-Material als eigene ZUGFeRD-Positionen (analog HTML-Rechnung).
      const materials: any[] = Array.isArray(a?.materialien) ? a.materialien : [];
      const materialSum = materials.reduce((s: number, m: any) => s + (Number(m.qty) || 0) * (Number(m.unitPrice) || 0), 0);
      const netAmount = revenue + materialSum;
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
        buyer: { name: a.kunde || 'Unbekannter Kunde', ...parseCustomerAddress((customers || []).find((c: any) => c.name === a.kunde)?.adresse) },
        lineItems: [{
          id: a.id || '', description: a.projekt || 'Dienstleistung',
          quantity: hours || 1, unitCode: hours ? 'HUR' : 'C62',
          unitPrice: hours ? revenue / hours : revenue,
          netAmount: revenue, taxPercent: taxRate,
        },
        ...materials.map((m: any) => ({
          id: m.itemId || '-', description: m.name || 'Material',
          quantity: Number(m.qty) || 0, unitCode: 'H87',
          unitPrice: Number(m.unitPrice) || 0,
          netAmount: (Number(m.qty) || 0) * (Number(m.unitPrice) || 0), taxPercent: taxRate,
        }))],
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

  async function handleSyncIntegration(a: any, target: 'lexoffice' | 'sevdesk', silent = false) {
    if (!user) return;
    if (!silent) setSyncing(`${a.id}-${target}`);
    setSyncToast(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(`/api/integrations/${target}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ action: 'push', assignment: a }),
      });
      const data = await res.json();
      if (data.ok) {
        await updateDoc(doc(db, 'assignments', a.id), {
          [`integrationSyncs.${target}`]: { syncedAt: new Date().toISOString(), externalId: data.id || '' },
          invoiceStatus: a.invoiceStatus || 'offen',
        }).catch(() => {});
        if (!silent) setSyncToast({ msg: `Erfolgreich zu ${target === 'lexoffice' ? 'Lexware Office' : 'SevDesk'} übertragen`, ok: true });
      } else {
        if (!silent) setSyncToast({ msg: data.error || 'Fehler beim Übertragen', ok: false });
      }
    } catch (e: any) {
      if (!silent) setSyncToast({ msg: e.message || 'Fehler', ok: false });
    } finally {
      if (!silent) {
        setSyncing(null);
        setTimeout(() => setSyncToast(null), 4000);
      }
    }
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

  if (loading || !user) return <PageSkeleton variant="table" />;

  const STATUS_ORDER: InvoiceStatus[] = ['offen', 'gesendet', 'mahnung_1', 'mahnung_2', 'bezahlt', 'storniert'];
  const invoiceGroups = statusFilter === 'alle'
    ? STATUS_ORDER.map(s => ({ status: s, items: invoices.filter((a: any) => a._invoiceStatus === s) })).filter(g => g.items.length > 0)
    : [{ status: statusFilter as InvoiceStatus, items: invoices }];

  const menuItem = 'w-full flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer text-left';
  const menuItemDanger = 'w-full flex items-center gap-2.5 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors cursor-pointer text-left';
  const cardClass = 'bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.03),0_10px_28px_-14px_rgba(15,23,42,0.10)]';
  const primaryBtnClass = 'px-3.5 py-1.5 text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap shadow-sm shadow-brand-600/20';

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">

        {/* Backdrop closes menu */}
        {openMenu && <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} />}

        {syncToast && (
          <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow border text-sm font-medium ${syncToast.ok ? 'bg-white border-emerald-200 text-emerald-700' : 'bg-white border-red-200 text-red-600'}`}>
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">{syncToast.ok ? <path d="M20 6L9 17l-5-5"/> : <><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></>}</svg>
            {syncToast.msg}
          </div>
        )}

        <div className="px-6 py-6 max-w-6xl mx-auto space-y-5">

          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Rechnungen</h1>
              <p className="text-sm text-slate-500 mt-1">Überblick, Mahnwesen und wiederkehrende Abrechnungen an einem Ort.</p>
            </div>
            {recurringConfigs.length > 0 && (
              <button onClick={() => setShowRecurringSection(v => !v)}
                className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer shrink-0 ${showRecurringSection ? 'bg-brand-700 text-white border-brand-700 shadow-sm shadow-brand-700/20' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                <RefreshCw className="w-3.5 h-3.5" /> Wiederkehrend ({recurringConfigs.length})
              </button>
            )}
          </div>

          {/* KPI strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {([
              { label: 'Gesamtvolumen', value: formatCurrency(summary.total),   icon: Wallet,         iconColor: 'text-brand-700',  iconBg: 'bg-brand-50' },
              { label: 'Offen',         value: formatCurrency(summary.open),    icon: Clock3,         iconColor: 'text-amber-600',  iconBg: 'bg-amber-50' },
              { label: 'Überfällig',    value: formatCurrency(summary.overdue), icon: AlertTriangle,  iconColor: 'text-red-600',    iconBg: 'bg-red-50'   },
              { label: 'Bezahlt',       value: formatCurrency(summary.paid),    icon: CheckCircle2,   iconColor: 'text-emerald-600', iconBg: 'bg-emerald-50' },
            ] as const).map((k, i) => (
              <div key={i} className={`${cardClass} px-5 py-4`}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{k.label}</p>
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${k.iconBg}`}>
                    <k.icon className={`w-3.5 h-3.5 ${k.iconColor}`} />
                  </span>
                </div>
                <p className="text-xl font-bold tabular-nums text-slate-900">{k.value}</p>
              </div>
            ))}
          </div>

          {/* Fällige Wiederkehrende */}
          {dueRecurring.length > 0 && (
            <div className="flex items-center justify-between gap-4 px-4 py-3 bg-amber-50/70 border border-amber-200/80 rounded-xl">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="flex items-center gap-1.5 text-xs font-bold text-amber-800 bg-amber-100 px-2.5 py-1 rounded-lg">
                  <Clock3 className="w-3.5 h-3.5" /> {dueRecurring.length} fällig
                </span>
                {dueRecurring.map(rc => (
                  <span key={rc.id} className="text-xs text-amber-800 flex items-center gap-2">
                    {rc.name} · <strong className="tabular-nums">{formatCurrency(rc.umsatz)}</strong>
                    <button onClick={() => handleGenerateDue(rc)} disabled={!!generatingRecurringId} className="font-semibold underline underline-offset-2 decoration-amber-400 hover:text-amber-950 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">{generatingRecurringId === rc.id ? 'Erstellt…' : 'Erstellen'}</button>
                  </span>
                ))}
              </div>
              <button onClick={() => setDueBannerDismissed(true)} className="text-amber-400 hover:text-amber-600 cursor-pointer shrink-0"><X className="w-4 h-4" /></button>
            </div>
          )}

          {/* Hauptbereich: Filter-Tabs + Tabelle in einer weißen Karte */}
          <div className={`${cardClass} overflow-hidden`}>

            {/* Filter-Tabs (segmented control) */}
            <div className="flex items-center gap-1 border-b border-slate-100 px-4 py-2.5 overflow-x-auto bg-slate-50/50">
              {allStatuses.map(s => {
                const active = statusFilter === s;
                const label = s === 'alle' ? 'Alle' : INVOICE_STATUS_LABELS[s as InvoiceStatus];
                const count = statusCounts[s as string] || 0;
                return (
                  <button key={s} onClick={() => setStatusFilter(s)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-all cursor-pointer shrink-0 ${
                      active
                        ? 'bg-white text-slate-900 shadow-sm border border-slate-200/80'
                        : 'text-slate-500 hover:text-slate-800 border border-transparent'
                    }`}>
                    {label}
                    {count > 0 && (
                      <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums ${active ? 'bg-brand-50 text-brand-700' : 'bg-slate-200/70 text-slate-500'}`}>{count}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Tabelle */}
            {invoices.length === 0 ? (
              <div className="py-16 flex flex-col items-center gap-3 text-center">
                <span className="w-11 h-11 rounded-full bg-slate-100 flex items-center justify-center">
                  <FileX className="w-5 h-5 text-slate-400" />
                </span>
                <p className="text-sm text-slate-400">Keine Rechnungen{statusFilter !== 'alle' ? ' in diesem Status' : ''}</p>
              </div>
            ) : (
              <>
                {/* Spaltenköpfe */}
                <div className="hidden md:grid grid-cols-[100px_1fr_110px_130px_140px_44px] border-b border-slate-100 bg-slate-50/60 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  <div className="px-4 py-3">Status</div>
                  <div className="px-4 py-3">Projekt / Kunde</div>
                  <div className="px-4 py-3 text-center">Fälligkeit</div>
                  <div className="px-4 py-3 text-right">Betrag</div>
                  <div className="px-4 py-3 text-right">Aktion</div>
                  <div />
                </div>

                {invoiceGroups.map(({ status, items }, gi) => {
                  const colors = INVOICE_STATUS_COLORS[status];
                  return (
                    <div key={status}>
                      {/* Gruppentrennzeile — nur bei "Alle"-Filter */}
                      {statusFilter === 'alle' && (
                        <div className={`flex items-center justify-between pl-3.5 pr-4 py-2 bg-slate-50/60 ${gi > 0 ? 'border-t border-slate-200' : ''}`}
                          style={{ borderLeft: `3px solid ${colors.text}` }}>
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            {INVOICE_STATUS_LABELS[status]}
                            <span className="ml-2 font-normal text-slate-400">{items.length}</span>
                          </span>
                          <span className="text-xs font-semibold tabular-nums text-slate-600">
                            {formatCurrency(items.reduce((s: number, a: any) => s + a._revenue, 0))}
                          </span>
                        </div>
                      )}

                      {items.map((a: any, idx: number) => {
                        const st = (a._invoiceStatus || 'offen') as InvoiceStatus;
                        const stColors = INVOICE_STATUS_COLORS[st];
                        const nextStatus = getNextDunningStatus(st);
                        const isPaid = st === 'bezahlt' || st === 'storniert';
                        const hasLexware = (company as any)?.integrations?.lexoffice;
                        const hasSevdesk = (company as any)?.integrations?.sevdesk;
                        const isDownloading = downloading === a.id;
                        const isSyncingLex = syncing === `${a.id}-lexoffice`;
                        const isSyncingSev = syncing === `${a.id}-sevdesk`;
                        const isUpdating = statusUpdating === a.id;
                        const isMenuOpen = openMenu === a.id;

                        return (
                          <div key={a.id} className={`border-t border-slate-100 hover:bg-slate-50/50 transition-colors ${idx === 0 && statusFilter !== 'alle' ? 'border-t-0' : ''}`}>

                            {/* Desktop */}
                            <div className="hidden md:grid grid-cols-[100px_1fr_110px_130px_140px_44px] items-center">

                              {/* Status-Badge */}
                              <div className="px-4 py-3">
                                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold whitespace-nowrap" style={{ color: stColors.text }}>
                                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: stColors.text }} />
                                  {INVOICE_STATUS_LABELS[st]}
                                </span>
                              </div>

                              {/* Projekt + Kunde */}
                              <div className="px-4 py-3 min-w-0">
                                <p className="text-sm font-medium text-slate-900 truncate">{a.projekt || 'Unbenannt'}</p>
                                <p className="text-xs text-slate-400 truncate mt-0.5">{a.kunde || '–'}</p>
                              </div>

                              {/* Fälligkeit */}
                              <div className="px-4 py-3 text-center">
                                <p className="text-xs text-slate-500">{a.datum || '–'}</p>
                                {!isPaid && a._dueDate && (
                                  <p className="text-[10px] text-amber-600 font-medium mt-0.5">{a._dueDate}</p>
                                )}
                              </div>

                              {/* Betrag */}
                              <div className="px-4 py-3 text-right">
                                <p className="text-sm font-semibold text-slate-900 tabular-nums">{formatCurrency(a._revenue)}</p>
                              </div>

                              {/* Hauptaktion */}
                              <div className="px-4 py-3 flex items-center justify-end">
                                {isPaid ? (
                                  <span className={`inline-flex items-center gap-1 text-xs font-medium ${st === 'bezahlt' ? 'text-emerald-600' : 'text-slate-400'}`}>
                                    <Check className="w-3.5 h-3.5" />
                                    {st === 'bezahlt' ? 'Bezahlt' : 'Storniert'}
                                  </span>
                                ) : nextStatus && ((nextStatus !== 'mahnung_1' && nextStatus !== 'mahnung_2') || getFeatureFlag(company?.subscriptionPlan, 'dunning')) ? (
                                  <button onClick={() => {
                                    if (nextStatus === 'mahnung_1') handleDunning(a, 1);
                                    else if (nextStatus === 'mahnung_2') handleDunning(a, 2);
                                    else updateStatus(a.id, nextStatus);
                                  }} disabled={isUpdating}
                                    className={primaryBtnClass}>
                                    {isUpdating ? '…' : nextStatus === 'gesendet' ? 'Senden' : nextStatus === 'bezahlt' ? 'Bezahlt ✓' : nextStatus === 'mahnung_1' ? '1. Mahnung' : '2. Mahnung'}
                                  </button>
                                ) : null}
                              </div>

                              {/* Drei-Punkte-Menü */}
                              <div className="relative flex items-center justify-center">
                                <button onClick={(e) => {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setMenuPos({ top: rect.bottom + 4, left: Math.max(8, rect.right - 208) });
                                  setOpenMenu(isMenuOpen ? null : a.id);
                                }}
                                  className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer z-20 relative">
                                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                    <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
                                  </svg>
                                </button>
                              </div>
                            </div>

                            {/* Menü — als Portal gerendert, damit es nicht vom Karten-`overflow-hidden` oder von "hidden md:grid" abgeschnitten wird */}
                            {isMenuOpen && menuPos && createPortal(
                              <div className="fixed z-30 bg-white border border-slate-200 rounded-xl shadow-lg py-1 w-52 text-left"
                                style={{ top: menuPos.top, left: menuPos.left }}
                                onClick={e => e.stopPropagation()}>
                                <button onClick={() => { handleDownloadInvoice(a); setOpenMenu(null); }} disabled={isDownloading} className={menuItem}>
                                  {isDownloading
                                    ? <span className="w-3.5 h-3.5 border border-slate-300/40 border-t-slate-600 rounded-full animate-spin" />
                                    : <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>}
                                  PDF herunterladen
                                </button>

                                {(hasLexware || hasSevdesk) && <div className="my-1 border-t border-slate-100" />}

                                {hasLexware && (
                                  a.integrationSyncs?.lexoffice
                                    ? <div className={`${menuItem} opacity-50 cursor-default`}><Check className="w-3.5 h-3.5 shrink-0 text-blue-500" />In Lexware Office</div>
                                    : <button onClick={() => { handleSyncIntegration(a, 'lexoffice'); setOpenMenu(null); }} disabled={isSyncingLex} className={menuItem}>
                                        {isSyncingLex ? <span className="w-3.5 h-3.5 border border-blue-300/40 border-t-blue-500 rounded-full animate-spin" /> : <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/></svg>}
                                        Nach Lexware übertragen
                                      </button>
                                )}

                                {hasSevdesk && (
                                  a.integrationSyncs?.sevdesk
                                    ? <div className={`${menuItem} opacity-50 cursor-default`}><Check className="w-3.5 h-3.5 shrink-0 text-orange-500" />In SevDesk</div>
                                    : <button onClick={() => { handleSyncIntegration(a, 'sevdesk'); setOpenMenu(null); }} disabled={isSyncingSev} className={menuItem}>
                                        {isSyncingSev ? <span className="w-3.5 h-3.5 border border-orange-300/40 border-t-orange-500 rounded-full animate-spin" /> : <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/></svg>}
                                        Nach SevDesk übertragen
                                      </button>
                                )}

                                {!isPaid && <div className="my-1 border-t border-slate-100" />}

                                {!isPaid && (
                                  <button onClick={() => {
                                    setOpenMenu(null);
                                    if (!getFeatureFlag(company?.subscriptionPlan, 'recurringInvoices')) { setShowUpgrade('recurring'); return; }
                                    setRecurringForAssignment(a); setRecurringName(`${a.projekt || ''} - ${a.kunde || ''}`); setRecurringInterval('monthly'); setShowRecurringDialog(true);
                                  }} className={menuItem}>
                                    <RefreshCw className="w-3.5 h-3.5 shrink-0" /> Wiederkehrend einrichten
                                  </button>
                                )}
                                {!isPaid && (
                                  <button onClick={() => { updateStatus(a.id, 'storniert'); setOpenMenu(null); }} disabled={isUpdating} className={menuItemDanger}>
                                    <X className="w-3.5 h-3.5 shrink-0" /> Stornieren
                                  </button>
                                )}
                              </div>,
                              document.body
                            )}

                            {/* Mobile */}
                            <div className="md:hidden px-4 py-3.5 space-y-2">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold" style={{ color: stColors.text }}>
                                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: stColors.text }} />
                                      {INVOICE_STATUS_LABELS[st]}
                                    </span>
                                  </div>
                                  <p className="text-sm font-medium text-slate-900 truncate">{a.projekt || 'Unbenannt'}</p>
                                  <p className="text-xs text-slate-400">{a.kunde || '–'} · {a.datum || '–'}</p>
                                </div>
                                <p className="text-sm font-bold text-slate-900 tabular-nums shrink-0">{formatCurrency(a._revenue)}</p>
                              </div>
                              <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
                                {isPaid ? (
                                  <span className={`text-xs font-medium flex items-center gap-1 ${st === 'bezahlt' ? 'text-emerald-600' : 'text-slate-400'}`}>
                                    <Check className="w-3 h-3" />{st === 'bezahlt' ? 'Bezahlt' : 'Storniert'}
                                  </span>
                                ) : nextStatus && ((nextStatus !== 'mahnung_1' && nextStatus !== 'mahnung_2') || getFeatureFlag(company?.subscriptionPlan, 'dunning')) ? (
                                  <button onClick={() => { if (nextStatus === 'mahnung_1') handleDunning(a, 1); else if (nextStatus === 'mahnung_2') handleDunning(a, 2); else updateStatus(a.id, nextStatus); }}
                                    disabled={isUpdating}
                                    className={primaryBtnClass}>
                                    {isUpdating ? '…' : nextStatus === 'gesendet' ? 'Senden' : nextStatus === 'bezahlt' ? 'Bezahlt ✓' : nextStatus === 'mahnung_1' ? '1. Mahnung' : '2. Mahnung'}
                                  </button>
                                ) : null}
                                <button onClick={(e) => {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setMenuPos({ top: rect.bottom + 4, left: Math.max(8, rect.right - 208) });
                                  setOpenMenu(isMenuOpen ? null : a.id);
                                }}
                                  className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer">
                                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                    <circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>
                                  </svg>
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </>
            )}
          </div>

          {/* Eigenständige Rechnungen (aus Kostenvoranschlag-Umwandlung / Wiederkehrend) */}
          {standaloneInvoices.length > 0 && (
            <div className={`${cardClass} overflow-hidden`}>
              <div className="px-5 py-2.5 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                <span>Eigenständige Rechnungen</span>
                <span>{standaloneInvoices.length}</span>
              </div>
              <div className="divide-y divide-slate-100">
                {standaloneInvoices.map(inv => {
                  const stColors = INVOICE_STATUS_COLORS[inv.status];
                  const nextStatus = getNextDunningStatus(inv.status);
                  const isPaid = inv.status === 'bezahlt' || inv.status === 'storniert';
                  const isUpdating = standaloneUpdating === inv.id;
                  return (
                    <div key={inv.id} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50/60 transition-colors">
                      <div className="min-w-0 flex items-center gap-2.5">
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold shrink-0" style={{ color: stColors.text }}>
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: stColors.text }} />
                          {INVOICE_STATUS_LABELS[inv.status]}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{inv.title}</p>
                          <p className="text-xs text-slate-400">{inv.customerName} · fällig {inv.dueDate}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <p className="text-sm font-bold text-slate-900 tabular-nums">{formatCurrency(inv.amount)}</p>
                        {isPaid ? (
                          <span className={`text-xs font-medium flex items-center gap-1 ${inv.status === 'bezahlt' ? 'text-emerald-600' : 'text-slate-400'}`}>
                            <Check className="w-3 h-3" />{inv.status === 'bezahlt' ? 'Bezahlt' : 'Storniert'}
                          </span>
                        ) : nextStatus && (
                          <button onClick={() => updateStandaloneStatus(inv.id, nextStatus)} disabled={isUpdating} className={primaryBtnClass}>
                            {isUpdating ? '…' : nextStatus === 'gesendet' ? 'Senden' : nextStatus === 'bezahlt' ? 'Bezahlt ✓' : nextStatus === 'mahnung_1' ? '1. Mahnung' : '2. Mahnung'}
                          </button>
                        )}
                        <button onClick={() => downloadStandaloneInvoicePDF(inv)} title="PDF herunterladen"
                          className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer">
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                        </button>
                        {!isPaid && (
                          <button onClick={() => updateStandaloneStatus(inv.id, 'storniert')} disabled={isUpdating} title="Stornieren"
                            className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer">
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Wiederkehrende Konfigurationen */}
          {recurringConfigs.length > 0 && showRecurringSection && (
            <div className={`${cardClass} overflow-hidden`}>
              <div className="px-5 py-2.5 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                <span>Wiederkehrende Rechnungen</span>
                <span>{recurringConfigs.length} aktiv</span>
              </div>
              <div className="divide-y divide-slate-100">
                {recurringConfigs.map(rc => (
                  <div key={rc.id} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50/60 transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{rc.name}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {rc.interval === 'monthly' ? 'Monatlich' : rc.interval === 'quarterly' ? 'Vierteljährlich' : 'Jährlich'}
                        {rc.nextInvoiceDate && ` · Nächste: ${fmtRecDate(rc.nextInvoiceDate)}`} · {formatCurrency(rc.umsatz)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-4">
                      {isDue(rc) && (
                        <button onClick={() => handleGenerateDue(rc)} disabled={!!generatingRecurringId}
                          className="text-xs font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 px-3 py-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                          {generatingRecurringId === rc.id ? 'Erstellt…' : 'Jetzt erstellen'}
                        </button>
                      )}
                      <button onClick={() => rc.id && handleDeleteRecurring(rc.id)}
                        className="text-xs text-slate-400 hover:text-red-500 transition-colors cursor-pointer">
                        Entfernen
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
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
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`${cardClass} w-full max-w-md p-6`}>
            <h3 className="text-lg font-bold text-slate-900 mb-4"><RefreshCw className="inline w-5 h-5 mr-2 text-brand-600" /> Wiederkehrende Rechnung</h3>
            {recurringForAssignment && (
              <p className="text-sm text-slate-500 mb-4">Basiert auf: <span className="font-bold text-slate-700">{recurringForAssignment.projekt}</span></p>
            )}
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Name</label>
            <input value={recurringName} onChange={e => setRecurringName(e.target.value)}
              placeholder="z.B. Miete Büro" className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 transition-all mb-4" />
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Intervall</label>
            <div className="flex gap-2 mb-6">
              {(['monthly', 'quarterly', 'yearly'] as const).map(iv => (
                <button key={iv} onClick={() => setRecurringInterval(iv)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                    recurringInterval === iv ? 'bg-brand-700 text-white shadow-sm shadow-brand-700/20' : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}>
                  {iv === 'monthly' ? 'Monatlich' : iv === 'quarterly' ? 'Vierteljährlich' : 'Jährlich'}
                </button>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setShowRecurringDialog(false); setRecurringForAssignment(null); }}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-all cursor-pointer rounded-lg">
                Abbrechen
              </button>
              <button onClick={handleSetupRecurring} disabled={!recurringName.trim()}
                className="px-4 py-2 text-sm font-semibold bg-brand-700 hover:bg-brand-800 text-white rounded-lg transition-all cursor-pointer disabled:opacity-50 shadow-sm shadow-brand-700/20">
                Einrichten
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
