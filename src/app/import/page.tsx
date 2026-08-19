'use client';

import { useState, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';
import { db } from '@/lib/firebase';
import { collection, addDoc, updateDoc, doc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import Papa from 'papaparse';
import { Upload, FileText, Users, UserCheck, Receipt, CheckCircle, ArrowLeft, AlertCircle } from 'lucide-react';
import {
  detectSource,
  mapCustomers,
  mapEmployees,
  mapInvoices,
  findExistingCustomer,
  findExistingEmployee,
  buildCustomerPatch,
  buildEmployeePatch,
  type ExistingCustomer,
  type ExistingEmployee,
  type ExistingInvoice,
} from '@/lib/csvImport';

type Source = 'auto' | 'sevdesk' | 'lexware' | 'generic';
type ImportKind = 'customers' | 'employees' | 'invoices';

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
  total: number;
}

export default function ImportPage() {
  const { user, companyId, loading } = useData();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [source, setSource] = useState<Source>('auto');
  const [csvData, setCsvData] = useState<CSVData | null>(null);
  const [detectedSource, setDetectedSource] = useState<string | null>(null);
  const [importingKind, setImportingKind] = useState<ImportKind | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setResult(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const headers = results.meta.fields || [];
        const rows = results.data as Record<string, string>[];

        if (rows.length === 0) {
          setError('CSV-Datei ist leer oder hat ein ungültiges Format.');
          return;
        }

        const detected = source === 'auto' ? detectSource(headers) : source;
        setDetectedSource(detected);
        setCsvData({ headers, rows, fileName: file.name });
      },
      error: (err) => {
        setError('Fehler beim Lesen der Datei: ' + err.message);
      },
    });

    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [source]);

  // Zählt für jeden Zieltyp, wie viele Zeilen sich mappen lassen - BEVOR importiert
  // wird. So sieht man vorher, ob die Datei überhaupt Kunden/Mitarbeiter/Rechnungen
  // enthält, statt nach einem Mixed-Import raten zu müssen, was gerade importiert wurde.
  const counts = useMemo(() => {
    if (!csvData) return { customers: 0, employees: 0, invoices: 0 };
    return {
      customers: mapCustomers(csvData.rows).filter(r => !r.skipped).length,
      employees: mapEmployees(csvData.rows).filter(r => !r.skipped).length,
      invoices: mapInvoices(csvData.rows).filter(r => !r.skipped).length,
    };
  }, [csvData]);

  const handleImportCustomers = useCallback(async () => {
    if (!csvData || !companyId || !user) return;
    setImportingKind('customers');
    setError(null);
    setResult(null);
    try {
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
            standort: c.standort || '',
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
      setResult({ kind: 'customers', created, updated, skippedRows, total: created + updated });
    } catch (e: any) {
      setError('Import fehlgeschlagen: ' + (e.message || e));
    } finally {
      setImportingKind(null);
      setProgress({ current: 0, total: 0 });
    }
  }, [csvData, companyId, user]);

  const handleImportEmployees = useCallback(async () => {
    if (!csvData || !companyId || !user) return;
    setImportingKind('employees');
    setError(null);
    setResult(null);
    try {
      const mapped = mapEmployees(csvData.rows);
      const items = mapped.filter((e): e is Extract<typeof e, { skipped: false }> => !e.skipped);
      const skippedRows = mapped.filter(e => e.skipped).length;

      const existingSnap = await getDocs(query(collection(db, 'employees'), where('companyId', '==', companyId)));
      const existing: ExistingEmployee[] = existingSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      setProgress({ current: 0, total: items.length });
      let created = 0;
      let updated = 0;
      for (const e of items) {
        const match = findExistingEmployee(existing, e);
        if (match) {
          const patch = buildEmployeePatch(match, e);
          if (Object.keys(patch).length > 0) {
            await updateDoc(doc(db, 'employees', match.id), patch);
            updated++;
          }
        } else {
          const ref = await addDoc(collection(db, 'employees'), {
            companyId,
            name: e.name,
            stundenlohn: e.stundenlohn || 0,
            gesamtstunden: 0,
            email: e.email || '',
            telefon: e.telefon || '',
            notizen: '',
            imageUrl: '',
            berufsfeld: '',
            createdAt: serverTimestamp(),
          });
          existing.push({ id: ref.id, ...e });
          created++;
        }
        setProgress(prev => ({ ...prev, current: prev.current + 1 }));
      }
      setResult({ kind: 'employees', created, updated, skippedRows, total: created + updated });
    } catch (e: any) {
      setError('Import fehlgeschlagen: ' + (e.message || e));
    } finally {
      setImportingKind(null);
      setProgress({ current: 0, total: 0 });
    }
  }, [csvData, companyId, user]);

  const handleImportInvoices = useCallback(async () => {
    if (!csvData || !companyId || !user) return;
    setImportingKind('invoices');
    setError(null);
    setResult(null);
    try {
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
      let updated = 0;
      for (const inv of items) {
        const key = inv.invoiceNumber.trim().toLowerCase();
        const alreadyExists = key && existingByNumber.has(key);
        if (alreadyExists) {
          // Rechnungsnummer schon importiert - kein Re-Import, Duplikat vermeiden.
          setProgress(prev => ({ ...prev, current: prev.current + 1 }));
          continue;
        }
        // Verknüpfung zum (ggf. gerade erst importierten) Kunden per Kundennummer/Name -
        // fehlschlägt das, wird trotzdem importiert, nur ohne customerId (customerName bleibt als Klartext).
        const matchedCustomer = findExistingCustomer(existingCustomers, {
          skipped: false,
          name: inv.customerName,
          kundentyp: '',
          ansprechpartner: '',
          email: '',
          telefon: '',
          standort: '',
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
      setResult({ kind: 'invoices', created, updated, skippedRows, total: created + updated });
    } catch (e: any) {
      setError('Import fehlgeschlagen: ' + (e.message || e));
    } finally {
      setImportingKind(null);
      setProgress({ current: 0, total: 0 });
    }
  }, [csvData, companyId, user]);

  if (loading) {
    return (
      <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-teal-300 border-t-teal-600 rounded-full animate-spin" />
        </main>
      </div>
    );
  }

  const sources: { id: Source; label: string }[] = [
    { id: 'auto', label: 'Auto-Erkennung' },
    { id: 'sevdesk', label: 'sevDesk' },
    { id: 'lexware', label: 'Lexware' },
    { id: 'generic', label: 'CSV-Datei' },
  ];

  const previewRows = csvData ? csvData.rows.slice(0, 5) : [];
  const previewHeaders = csvData ? csvData.headers.slice(0, 6) : [];

  const importButtons: { kind: ImportKind; label: string; icon: typeof Users; count: number; onClick: () => void; color: string }[] = [
    { kind: 'customers', label: 'Kunden', icon: Users, count: counts.customers, onClick: handleImportCustomers, color: 'teal' },
    { kind: 'employees', label: 'Mitarbeiter', icon: UserCheck, count: counts.employees, onClick: handleImportEmployees, color: 'purple' },
    { kind: 'invoices', label: 'Rechnungen', icon: Receipt, count: counts.invoices, onClick: handleImportInvoices, color: 'amber' },
  ];

  const kindLabel = (kind: ImportKind) => (kind === 'customers' ? 'Kunden' : kind === 'employees' ? 'Mitarbeiter' : 'Rechnungen');

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="px-4 md:px-8 py-4 md:py-8 max-w-2xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3 mb-2">
            <button
              onClick={() => router.push('/settings')}
              className="p-2 rounded-xl hover:bg-slate-200/50 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            <div>
              <h1 className="text-xl md:text-3xl font-bold text-slate-900 tracking-tight">Daten importieren</h1>
              <p className="text-slate-500 text-sm mt-1">Lexware, sevDesk oder beliebige CSV-Datei</p>
            </div>
          </div>

          {/* Source Selector */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <p className="text-sm font-bold text-slate-900 mb-3">Quelle wahlen</p>
            <div className="flex flex-wrap gap-2">
              {sources.map(s => (
                <button
                  key={s.id}
                  onClick={() => setSource(s.id)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border-2 transition-all ${
                    source === s.id
                      ? 'bg-teal-50 border-teal-400 text-teal-700 font-bold'
                      : 'bg-slate-50 border-transparent text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* File Upload */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full bg-white rounded-2xl border-2 border-dashed border-teal-400 shadow-sm p-8 flex flex-col items-center gap-3 hover:bg-teal-50/30 transition-all"
          >
            <Upload className="w-8 h-8 text-teal-500" />
            <p className="text-sm font-bold text-slate-900">CSV-Datei auswahlen</p>
            <p className="text-xs text-slate-400">
              {csvData ? csvData.fileName : 'Klicke, um eine Datei auszuwahlen'}
            </p>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            className="hidden"
          />

          {/* Detected Source */}
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
                {csvData.rows.length} Zeilen · {csvData.headers.length} Spalten
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 rounded-2xl border border-red-200 p-5 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Preview Table */}
          {previewRows.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <p className="text-sm font-bold text-slate-900 mb-3">Vorschau</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      {previewHeaders.map((h, i) => (
                        <th key={i} className="text-left py-2 pr-4 text-xs font-semibold text-slate-500">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, ri) => (
                      <tr key={ri} className="border-b border-slate-100 last:border-0">
                        {previewHeaders.map((h, ci) => (
                          <td key={ci} className="py-2 pr-4 text-slate-700 text-xs">
                            {row[h] || '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Progress */}
          {importingKind && progress.total > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-4 h-4 border-2 border-teal-300 border-t-teal-600 rounded-full animate-spin" />
                <p className="text-sm font-semibold text-slate-700">
                  {kindLabel(importingKind)} werden importiert... {progress.current}/{progress.total}
                </p>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-teal-500 rounded-full transition-all duration-300"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle className="w-5 h-5 text-teal-500" />
                <p className="text-sm font-bold text-slate-900">{kindLabel(result.kind)} importiert</p>
              </div>
              <p className="text-xs text-slate-500">
                {result.created} neu, {result.updated} aktualisiert
              </p>
              {result.skippedRows > 0 && (
                <div className="flex items-center gap-2 mt-2">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                  <p className="text-xs text-amber-600">{result.skippedRows} Zeile(n) übersprungen</p>
                </div>
              )}
              <button
                onClick={() => { setResult(null); }}
                className="mt-4 text-xs font-semibold text-teal-600 hover:text-teal-700"
              >
                Weitere Kategorie aus dieser Datei importieren
              </button>
            </div>
          )}

          {/* Per-Type Import Buttons */}
          {csvData && !result && !importingKind && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <p className="text-sm font-bold text-slate-900 mb-1">Was soll importiert werden?</p>
              <p className="text-xs text-slate-400 mb-4">
                Nur die ausgewählte Kategorie wird importiert - so landet nichts versehentlich in der falschen Liste.
              </p>
              <div className="space-y-2">
                {importButtons.map(({ kind, label, icon: Icon, count, onClick, color }) => (
                  <button
                    key={kind}
                    onClick={onClick}
                    disabled={count === 0}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                      color === 'teal' ? 'border-teal-200 hover:bg-teal-50' : color === 'purple' ? 'border-purple-200 hover:bg-purple-50' : 'border-amber-200 hover:bg-amber-50'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${color === 'teal' ? 'text-teal-500' : color === 'purple' ? 'text-purple-500' : 'text-amber-500'}`} />
                    <span className="text-sm font-bold text-slate-900 flex-1 text-left">{label}</span>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                      count === 0 ? 'bg-slate-100 text-slate-400' : color === 'teal' ? 'bg-teal-100 text-teal-700' : color === 'purple' ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {count} erkannt
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
