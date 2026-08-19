'use client';

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';
import { auth, db } from '@/lib/firebase';
import { signInWithCustomToken } from 'firebase/auth';
import { collection, addDoc, updateDoc, doc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import Papa from 'papaparse';
import { Upload, FileText, Users, Truck, Receipt, CheckCircle, ArrowLeft, AlertCircle } from 'lucide-react';
import {
  detectSource,
  mapCustomers,
  mapSuppliers,
  mapInvoices,
  findExistingCustomer,
  findExistingSupplier,
  buildCustomerPatch,
  buildSupplierPatch,
  type ExistingCustomer,
  type ExistingSupplier,
  type ExistingInvoice,
} from '@/lib/csvImport';

type ImportKind = 'customers' | 'suppliers' | 'invoices';

interface CSVData {
  headers: string[];
  rows: Record<string, string>[];
  fileName: string;
}

interface ImportResult {
  kind: ImportKind;
  created: number;
  updated: number;
  skippedRows: number;
}

const KIND_META: Record<ImportKind, { label: string; icon: typeof Users; color: string }> = {
  customers: { label: 'Kunden', icon: Users, color: 'teal' },
  suppliers: { label: 'Lieferanten', icon: Truck, color: 'blue' },
  invoices: { label: 'Rechnungen', icon: Receipt, color: 'amber' },
};

const colorClasses: Record<string, { border: string; bg: string; text: string; badgeBg: string; badgeText: string }> = {
  teal: { border: 'border-teal-400', bg: 'hover:bg-teal-50', text: 'text-teal-600', badgeBg: 'bg-teal-100', badgeText: 'text-teal-700' },
  blue: { border: 'border-blue-400', bg: 'hover:bg-blue-50', text: 'text-blue-600', badgeBg: 'bg-blue-100', badgeText: 'text-blue-700' },
  amber: { border: 'border-amber-400', bg: 'hover:bg-amber-50', text: 'text-amber-600', badgeBg: 'bg-amber-100', badgeText: 'text-amber-700' },
};

export default function ImportPage() {
  const { user, companyId, loading } = useData();
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [ssoStatus, setSsoStatus] = useState<'idle' | 'signing-in' | 'failed'>('idle');

  // SSO-Handoff aus der Mobile-App: die App kann keinen echten Datei-Picker (natives Modul,
  // kein Build vorhanden) und oeffnet stattdessen diese Seite im System-Browser - ohne das
  // hier muesste man sich dort manuell nochmal anmelden. Custom Token kommt aus
  // createWebImportToken (Cloud Function), ist kurzlebig und nur per Firebase-Sign-in nutzbar.
  useEffect(() => {
    const token = searchParams.get('authToken');
    if (!token) return;
    setSsoStatus('signing-in');
    signInWithCustomToken(auth, token)
      .then(() => setSsoStatus('idle'))
      .catch(() => setSsoStatus('failed'))
      .finally(() => {
        // Token sofort aus der URL/Browser-Historie entfernen, statt es dort stehen zu lassen.
        router.replace('/import');
      });
  }, [searchParams, router]);

  const [kind, setKind] = useState<ImportKind | null>(null);
  const [csvData, setCsvData] = useState<CSVData | null>(null);
  const [detectedSource, setDetectedSource] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const reset = useCallback(() => {
    setKind(null);
    setCsvData(null);
    setDetectedSource(null);
    setResult(null);
    setError(null);
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setResult(null);

    const onParsed = (headers: string[], rows: Record<string, string>[]) => {
      if (rows.length === 0) {
        setError('CSV-Datei ist leer oder hat ein ungültiges Format.');
        return;
      }
      setDetectedSource(detectSource(headers));
      setCsvData({ headers, rows, fileName: file.name });
    };

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const headers = results.meta.fields || [];
        const rows = results.data as Record<string, string>[];
        // Deutsche Exporte (Lexware/sevDesk/Excel) sind oft ISO-8859-1/Windows-1252 statt
        // UTF-8 - als UTF-8 gelesen werden Umlaute/ß zu "�" (U+FFFD), Header wie "Straße"
        // matchen dann nicht mehr. Erkennt man am Replacement Character; bei Treffer wird
        // dieselbe Datei einmal mit windows-1252 neu gelesen.
        const looksMojibake = headers.some(h => h.includes('�')) || rows.some(r => Object.values(r).some(v => typeof v === 'string' && v.includes('�')));
        if (looksMojibake) {
          Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            encoding: 'windows-1252',
            complete: (r2) => onParsed(r2.meta.fields || [], r2.data as Record<string, string>[]),
            error: (err) => setError('Fehler beim Lesen der Datei: ' + err.message),
          });
          return;
        }
        onParsed(headers, rows);
      },
      error: (err) => {
        setError('Fehler beim Lesen der Datei: ' + err.message);
      },
    });

    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  // Zählt vorab, wie viele Zeilen sich für den gewählten Zieltyp mappen lassen - so sieht
  // man vor dem Import, ob die Datei überhaupt genug erkennbare Zeilen enthält.
  const count = useMemo(() => {
    if (!csvData || !kind) return 0;
    if (kind === 'customers') return mapCustomers(csvData.rows).filter(r => !r.skipped).length;
    if (kind === 'suppliers') return mapSuppliers(csvData.rows).filter(r => !r.skipped).length;
    return mapInvoices(csvData.rows).filter(r => !r.skipped).length;
  }, [csvData, kind]);

  const handleImport = useCallback(async () => {
    if (!csvData || !companyId || !user || !kind) return;
    setImporting(true);
    setError(null);
    setResult(null);
    try {
      if (kind === 'customers') {
        const mapped = mapCustomers(csvData.rows);
        const items = mapped.filter((c): c is Extract<typeof c, { skipped: false }> => !c.skipped);
        const skippedRows = mapped.filter(c => c.skipped).length;

        const existingSnap = await getDocs(query(collection(db, 'customers'), where('companyId', '==', companyId)));
        const existing: ExistingCustomer[] = existingSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        setProgress({ current: 0, total: items.length });
        let created = 0;
        let updated = 0;
        for (const c of items) {
          const match = findExistingCustomer(existing, c);
          if (match) {
            const patch = buildCustomerPatch(match, c);
            if (Object.keys(patch).length > 0) {
              await updateDoc(doc(db, 'customers', match.id), patch);
              updated++;
            }
          } else {
            const ref = await addDoc(collection(db, 'customers'), {
              companyId,
              name: c.name,
              ansprechpartner: c.ansprechpartner || '',
              kundentyp: c.kundentyp || '',
              email: c.email || '',
              telefon: c.telefon || '',
              adresse: c.adresse || '',
              umsatz: 0,
              status: 'Aktiv',
              notizen: c.kundennummer ? `Kundennr: ${c.kundennummer}` : '',
              kundennummer: c.kundennummer || '',
              createdAt: serverTimestamp(),
            });
            existing.push({ id: ref.id, ...c });
            created++;
          }
          setProgress(prev => ({ ...prev, current: prev.current + 1 }));
        }
        setResult({ kind: 'customers', created, updated, skippedRows });
      } else if (kind === 'suppliers') {
        const mapped = mapSuppliers(csvData.rows);
        const items = mapped.filter((s): s is Extract<typeof s, { skipped: false }> => !s.skipped);
        const skippedRows = mapped.filter(s => s.skipped).length;

        const existingSnap = await getDocs(query(collection(db, 'suppliers'), where('companyId', '==', companyId)));
        const existing: ExistingSupplier[] = existingSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        setProgress({ current: 0, total: items.length });
        let created = 0;
        let updated = 0;
        for (const s of items) {
          const match = findExistingSupplier(existing, s);
          if (match) {
            const patch = buildSupplierPatch(match, s);
            if (Object.keys(patch).length > 0) {
              await updateDoc(doc(db, 'suppliers', match.id), patch);
              updated++;
            }
          } else {
            const ref = await addDoc(collection(db, 'suppliers'), {
              companyId,
              name: s.name,
              supplierNo: s.supplierNo || '',
              contactPerson: s.contactPerson || '',
              email: s.email || '',
              telefon: s.telefon || '',
              street: s.street || '',
              zip: s.zip || '',
              city: s.city || '',
              country: 'Deutschland',
              iban: s.iban || '',
              bic: s.bic || '',
              paymentTerms: s.paymentTerms || '',
              supplies: [],
              createdAt: serverTimestamp(),
            });
            existing.push({ id: ref.id, ...s });
            created++;
          }
          setProgress(prev => ({ ...prev, current: prev.current + 1 }));
        }
        setResult({ kind: 'suppliers', created, updated, skippedRows });
      } else {
        const mapped = mapInvoices(csvData.rows);
        const items = mapped.filter((i): i is Extract<typeof i, { skipped: false }> => !i.skipped);
        const skippedRows = mapped.filter(i => i.skipped).length;

        const [existingCustomersSnap, existingInvoicesSnap] = await Promise.all([
          getDocs(query(collection(db, 'customers'), where('companyId', '==', companyId))),
          getDocs(query(collection(db, 'invoices'), where('companyId', '==', companyId))),
        ]);
        const existingCustomers: ExistingCustomer[] = existingCustomersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const existingInvoices: ExistingInvoice[] = existingInvoicesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const existingByNumber = new Map(
          existingInvoices
            .filter(inv => inv.invoiceNumber)
            .map(inv => [(inv.invoiceNumber as string).trim().toLowerCase(), inv])
        );

        setProgress({ current: 0, total: items.length });
        let created = 0;
        for (const inv of items) {
          const key = inv.invoiceNumber.trim().toLowerCase();
          if (key && existingByNumber.has(key)) {
            // Rechnungsnummer schon importiert - kein Re-Import, Duplikat vermeiden.
            setProgress(prev => ({ ...prev, current: prev.current + 1 }));
            continue;
          }
          const matchedCustomer = findExistingCustomer(existingCustomers, {
            skipped: false,
            name: inv.customerName,
            kundentyp: '',
            ansprechpartner: '',
            email: '',
            telefon: '',
            adresse: '',
            kundennummer: inv.kundennummer,
          });
          const ref = await addDoc(collection(db, 'invoices'), {
            companyId,
            customerId: matchedCustomer?.id || null,
            customerName: inv.customerName || matchedCustomer?.name || '',
            invoiceNumber: inv.invoiceNumber,
            invoiceDate: inv.invoiceDate || '',
            netAmount: inv.netAmount,
            taxAmount: inv.taxAmount,
            grossAmount: inv.grossAmount,
            status: inv.status,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          if (key) existingByNumber.set(key, { id: ref.id, invoiceNumber: inv.invoiceNumber });
          created++;
          setProgress(prev => ({ ...prev, current: prev.current + 1 }));
        }
        setResult({ kind: 'invoices', created, updated: 0, skippedRows });
      }
    } catch (e: any) {
      setError('Import fehlgeschlagen: ' + (e.message || e));
    } finally {
      setImporting(false);
      setProgress({ current: 0, total: 0 });
    }
  }, [csvData, companyId, user, kind]);

  if (loading || ssoStatus === 'signing-in') {
    return (
      <div className="flex flex-col md:flex-row h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <Sidebar />
        <main className="flex-1 flex flex-col items-center justify-center gap-3">
          <div className="w-6 h-6 border-2 border-teal-300 border-t-teal-600 rounded-full animate-spin" />
          {ssoStatus === 'signing-in' && <p className="text-xs text-slate-400">Automatisch anmelden …</p>}
        </main>
      </div>
    );
  }

  const previewRows = csvData ? csvData.rows.slice(0, 5) : [];
  const previewHeaders = csvData ? csvData.headers.slice(0, 6) : [];

  return (
    <div className="flex flex-col md:flex-row h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="px-4 md:px-8 py-4 md:py-8 max-w-2xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3 mb-2">
            <button
              onClick={() => (kind ? reset() : router.push('/settings'))}
              className="p-2 rounded-xl hover:bg-slate-200/50 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            <div>
              <h1 className="text-xl md:text-3xl font-bold text-slate-900 tracking-tight">Daten importieren</h1>
              <p className="text-slate-500 text-sm mt-1">Lexware, sevDesk oder beliebige CSV-Datei</p>
            </div>
          </div>

          {ssoStatus === 'failed' && !user && (
            <div className="bg-amber-50 rounded-2xl border border-amber-200 p-5 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-700">Automatische Anmeldung fehlgeschlagen - bitte manuell einloggen.</p>
            </div>
          )}

          {/* Step 1: Kategorie wählen */}
          {!kind && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <p className="text-sm font-bold text-slate-900 mb-1">Was möchtest du importieren?</p>
              <p className="text-xs text-slate-400 mb-4">Lexware/sevDesk exportieren nur Kunden, Lieferanten oder Rechnungen - wähle die passende Kategorie.</p>
              <div className="space-y-2">
                {(Object.keys(KIND_META) as ImportKind[]).map(k => {
                  const meta = KIND_META[k];
                  const Icon = meta.icon;
                  const c = colorClasses[meta.color];
                  return (
                    <button
                      key={k}
                      onClick={() => setKind(k)}
                      className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 border-slate-200 transition-all ${c.bg} hover:${c.border}`}
                    >
                      <Icon className={`w-5 h-5 ${c.text}`} />
                      <span className="text-sm font-bold text-slate-900 flex-1 text-left">{meta.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 2: Datei hochladen + importieren */}
          {kind && (
            <>
              <div className="flex items-center gap-2 px-1">
                {(() => {
                  const meta = KIND_META[kind];
                  const Icon = meta.icon;
                  const c = colorClasses[meta.color];
                  return (
                    <>
                      <Icon className={`w-4 h-4 ${c.text}`} />
                      <span className="text-sm font-bold text-slate-700">{meta.label} importieren</span>
                    </>
                  );
                })()}
              </div>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full bg-white rounded-2xl border-2 border-dashed border-teal-400 shadow-sm p-8 flex flex-col items-center gap-3 hover:bg-teal-50/30 transition-all"
              >
                <Upload className="w-8 h-8 text-teal-500" />
                <p className="text-sm font-bold text-slate-900">CSV-Datei auswählen</p>
                <p className="text-xs text-slate-400">
                  {csvData ? csvData.fileName : 'Klicke, um eine Datei auszuwählen'}
                </p>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                className="hidden"
              />

              {detectedSource && csvData && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-teal-500" />
                    <p className="text-sm text-slate-700">
                      Erkannte Quelle:{' '}
                      <span className="font-bold text-teal-600">
                        {detectedSource === 'sevdesk' ? 'sevDesk' : detectedSource === 'lexware' ? 'Lexware' : 'Generisch'}
                      </span>
                    </p>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {csvData.rows.length} Zeilen · {count} als {KIND_META[kind].label} erkannt
                  </p>
                </div>
              )}

              {error && (
                <div className="bg-red-50 rounded-2xl border border-red-200 p-5 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              {previewRows.length > 0 && !result && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                  <p className="text-sm font-bold text-slate-900 mb-3">Vorschau</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200">
                          {previewHeaders.map((h, i) => (
                            <th key={i} className="text-left py-2 pr-4 text-xs font-semibold text-slate-500">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row, ri) => (
                          <tr key={ri} className="border-b border-slate-100 last:border-0">
                            {previewHeaders.map((h, ci) => (
                              <td key={ci} className="py-2 pr-4 text-slate-700 text-xs">{row[h] || '-'}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {importing && progress.total > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-4 h-4 border-2 border-teal-300 border-t-teal-600 rounded-full animate-spin" />
                    <p className="text-sm font-semibold text-slate-700">
                      {KIND_META[kind].label} werden importiert... {progress.current}/{progress.total}
                    </p>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-teal-500 rounded-full transition-all duration-300" style={{ width: `${(progress.current / progress.total) * 100}%` }} />
                  </div>
                </div>
              )}

              {result && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle className="w-5 h-5 text-teal-500" />
                    <p className="text-sm font-bold text-slate-900">{KIND_META[result.kind].label} importiert</p>
                  </div>
                  <p className="text-xs text-slate-500">{result.created} neu, {result.updated} aktualisiert</p>
                  {result.skippedRows > 0 && (
                    <div className="flex items-center gap-2 mt-2">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                      <p className="text-xs text-amber-600">{result.skippedRows} Zeile(n) übersprungen</p>
                    </div>
                  )}
                  <button onClick={reset} className="mt-4 text-xs font-semibold text-teal-600 hover:text-teal-700">
                    Weitere Datei importieren
                  </button>
                </div>
              )}

              {csvData && !result && (
                <button
                  onClick={handleImport}
                  disabled={importing || count === 0}
                  className="w-full py-4 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-bold rounded-2xl transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-teal-200/30"
                >
                  {importing ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    `${count} ${KIND_META[kind].label} importieren`
                  )}
                </button>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
