'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';
import { db } from '@/lib/firebase';
import { collection, addDoc, updateDoc, doc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import Papa from 'papaparse';
import { Upload, FileText, Users, UserCheck, CheckCircle, ArrowLeft, AlertCircle } from 'lucide-react';
import {
  detectSource,
  mapCustomers,
  mapEmployees,
  findExistingCustomer,
  findExistingEmployee,
  buildCustomerPatch,
  buildEmployeePatch,
  type ExistingCustomer,
  type ExistingEmployee,
} from '@/lib/csvImport';

type Source = 'auto' | 'sevdesk' | 'lexware' | 'generic';

interface CSVData {
  headers: string[];
  rows: Record<string, string>[];
  fileName: string;
}

interface ImportResult {
  customers: number;
  employees: number;
  customersCreated: number;
  customersUpdated: number;
  employeesCreated: number;
  employeesUpdated: number;
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
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0, phase: '' });

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

  const handleImport = useCallback(async () => {
    if (!csvData || !companyId || !user) return;
    setImporting(true);
    setError(null);
    setResult(null);

    try {
      const mappedCustomers = mapCustomers(csvData.rows);
      const mappedEmployees = mapEmployees(csvData.rows);
      const customers = mappedCustomers.filter((c): c is Extract<typeof c, { skipped: false }> => !c.skipped);
      const employees = mappedEmployees.filter((e): e is Extract<typeof e, { skipped: false }> => !e.skipped);
      const skippedRows = mappedCustomers.filter(c => c.skipped).length + mappedEmployees.filter(e => e.skipped).length;

      const [existingCustomersSnap, existingEmployeesSnap] = await Promise.all([
        getDocs(query(collection(db, 'customers'), where('companyId', '==', companyId))),
        getDocs(query(collection(db, 'employees'), where('companyId', '==', companyId))),
      ]);
      const existingCustomers: ExistingCustomer[] = existingCustomersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const existingEmployees: ExistingEmployee[] = existingEmployeesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      const totalItems = customers.length + employees.length;
      setProgress({ current: 0, total: totalItems, phase: 'Kunden' });

      let customersCreated = 0;
      let customersUpdated = 0;
      for (const c of customers) {
        const existing = findExistingCustomer(existingCustomers, c);
        if (existing) {
          const patch = buildCustomerPatch(existing, c);
          if (Object.keys(patch).length > 0) {
            await updateDoc(doc(db, 'customers', existing.id), patch);
            customersUpdated++;
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
          existingCustomers.push({ id: ref.id, ...c });
          customersCreated++;
        }
        setProgress(prev => ({ ...prev, current: prev.current + 1 }));
      }

      setProgress(prev => ({ ...prev, phase: 'Mitarbeiter' }));
      let employeesCreated = 0;
      let employeesUpdated = 0;
      for (const e of employees) {
        const existing = findExistingEmployee(existingEmployees, e);
        if (existing) {
          const patch = buildEmployeePatch(existing, e);
          if (Object.keys(patch).length > 0) {
            await updateDoc(doc(db, 'employees', existing.id), patch);
            employeesUpdated++;
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
          existingEmployees.push({ id: ref.id, ...e });
          employeesCreated++;
        }
        setProgress(prev => ({ ...prev, current: prev.current + 1 }));
      }

      setResult({
        customers: customersCreated + customersUpdated,
        employees: employeesCreated + employeesUpdated,
        customersCreated,
        customersUpdated,
        employeesCreated,
        employeesUpdated,
        skippedRows,
        total: customersCreated + customersUpdated + employeesCreated + employeesUpdated,
      });
    } catch (e: any) {
      setError('Import fehlgeschlagen: ' + (e.message || e));
    } finally {
      setImporting(false);
      setProgress({ current: 0, total: 0, phase: '' });
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
          {importing && progress.total > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-4 h-4 border-2 border-teal-300 border-t-teal-600 rounded-full animate-spin" />
                <p className="text-sm font-semibold text-slate-700">
                  {progress.phase}... {progress.current}/{progress.total}
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
                <p className="text-sm font-bold text-slate-900">Import abgeschlossen</p>
              </div>
              <div className="flex gap-6">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-teal-500" />
                  <span className="text-lg font-extrabold text-slate-900">{result.customers}</span>
                  <span className="text-xs text-slate-400">Kunden</span>
                </div>
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-purple-500" />
                  <span className="text-lg font-extrabold text-slate-900">{result.employees}</span>
                  <span className="text-xs text-slate-400">Mitarbeiter</span>
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-3">
                Kunden: {result.customersCreated} neu, {result.customersUpdated} aktualisiert · Mitarbeiter: {result.employeesCreated} neu, {result.employeesUpdated} aktualisiert
              </p>
              {result.skippedRows > 0 && (
                <div className="flex items-center gap-2 mt-2">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                  <p className="text-xs text-amber-600">{result.skippedRows} Zeile(n) ohne erkennbaren Namen übersprungen</p>
                </div>
              )}
            </div>
          )}

          {/* Import Button */}
          {csvData && !result && (
            <button
              onClick={handleImport}
              disabled={importing}
              className="w-full py-4 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-bold rounded-2xl transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-teal-200/30"
            >
              {importing ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                'Importieren'
              )}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
