'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { parseDatanorm, parseGenericArticles, validateDatanorm, resolveArticleManufacturers, diagnoseFile, type DatanormArticle, type DatanormManufacturer, type DatanormDiagnostics } from '@/lib/datanorm';

interface ArticleDoc {
  id: string;
  articleNo: string;
  manufacturerNo: string;
  ean: string;
  name1: string;
  name2: string;
  unit: string;
  price: number;
  currency: string;
  manufacturerName: string;
  importedAt: Date;
}

export default function ArticlesPage() {
  const { user, loading, companyId } = useData();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const [articles, setArticles] = useState<ArticleDoc[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(true);
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadMode, setUploadMode] = useState<'file' | 'folder'>('file');
  const [uploadResult, setUploadResult] = useState<{ ok: number; errors: number; total: number; files: number } | null>(null);
  const [diagnostics, setDiagnostics] = useState<DatanormDiagnostics | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [progress, setProgress] = useState<{ current: number; total: number; phase: string } | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  useEffect(() => {
    if (!companyId) return;
    async function load() {
      setLoadingArticles(true);
      try {
        const q = query(collection(db, 'articles'), where('companyId', '==', companyId));
        const snap = await getDocs(q);
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as ArticleDoc));
        list.sort((a, b) => {
          const at = (a.importedAt as unknown as { seconds?: number })?.seconds || 0;
          const bt = (b.importedAt as unknown as { seconds?: number })?.seconds || 0;
          return bt - at;
        });
        setArticles(list);
      } catch { setArticles([]); }
      setLoadingArticles(false);
    }
    load();
  }, [companyId]);

  const filtered = useMemo(() => {
    if (!search.trim()) return articles;
    const q = search.toLowerCase();
    return articles.filter(a =>
      a.articleNo.toLowerCase().includes(q) ||
      a.name1.toLowerCase().includes(q) ||
      a.name2.toLowerCase().includes(q) ||
      a.ean.includes(q) ||
      (a.manufacturerName || '').toLowerCase().includes(q)
    );
  }, [articles, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page]);

  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  function exportCSV() {
    const headers = ['Artikel-Nr.', 'Name', 'Hersteller', 'EAN', 'Preis', 'Einheit'];
    const rows = articles.map(a => [
      a.articleNo, `"${(a.name1 || '').replace(/"/g, '""')}"`, `"${(a.manufacturerName || '').replace(/"/g, '""')}"`,
      a.ean, a.price.toFixed(2), a.unit,
    ].join(','));
    const csv = '\ufeff' + headers.join(',') + '\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'artikel_export.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  async function readFileText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const buffer = reader.result as ArrayBuffer;
        try {
          resolve(new TextDecoder('utf-8', { fatal: true }).decode(buffer));
        } catch {
          resolve(new TextDecoder('windows-1252').decode(buffer));
        }
      };
      reader.onerror = () => reject(new Error('Fehler beim Lesen der Datei'));
      reader.readAsArrayBuffer(file);
    });
  }

  interface FileData {
    name: string;
    manufacturers: Map<string, DatanormManufacturer>;
    articles: DatanormArticle[];
    errors: number;
  }

  async function processDatanormFile(file: File): Promise<FileData> {
    const text = await readFileText(file);
    let validation = validateDatanorm(text);
    if (!validation.valid) {
      console.warn(`[${file.name}] ${validation.message}`);
    }
    let result = parseDatanorm(text);
    if (result.articles.length === 0) {
      result = parseGenericArticles(text);
      if (result.articles.length > 0) {
        console.log(`[${file.name}] Fallback parser erkannte ${result.articles.length} Artikel`);
      }
    }
    return {
      name: file.name,
      manufacturers: result.manufacturers,
      articles: result.articles,
      errors: result.errors.length,
    };
  }

  async function saveArticles(articleList: DatanormArticle[]): Promise<number> {
    let ok = 0;
    const seen = new Set<string>();
    const total = articleList.length;
    setProgress({ current: 0, total, phase: 'Speichere...' });
    for (const article of articleList) {
      if (seen.has(article.articleNo)) continue;
      seen.add(article.articleNo);
      try {
        const existing = articles.find(a => a.articleNo === article.articleNo);
        if (existing) continue;
        await addDoc(collection(db, 'articles'), {
          companyId,
          articleNo: article.articleNo,
          manufacturerNo: article.manufacturerNo,
          ean: article.ean,
          name1: article.name1,
          name2: article.name2,
          unit: article.unit,
          price: article.price,
          currency: article.currency,
          manufacturerName: article.manufacturerName || '',
          importedAt: serverTimestamp(),
        });
        ok++;
      } catch { /* skip */ }
      setProgress({ current: ok, total, phase: 'Speichere...' });
    }
    setProgress(null);
    return ok;
  }

  async function refreshArticles() {
    if (!companyId) return;
    const q = query(collection(db, 'articles'), where('companyId', '==', companyId));
    const snap = await getDocs(q);
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as ArticleDoc));
    list.sort((a, b) => {
      const at = (a.importedAt as unknown as { seconds?: number })?.seconds || 0;
      const bt = (b.importedAt as unknown as { seconds?: number })?.seconds || 0;
      return bt - at;
    });
    setArticles(list);
    if (fileRef.current) fileRef.current.value = '';
    if (folderRef.current) folderRef.current.value = '';
  }

  async function handleFile(file: File) {
    if (!companyId) return;
    setUploading(true);
    setUploadResult(null);
    setDiagnostics(null);
    try {
      const text = await readFileText(file);
      const diag = diagnoseFile(text, file.name, file.size);
      setDiagnostics(diag);

      const result = await processDatanormFile(file);
      const articles = resolveArticleManufacturers(result.articles, result.manufacturers);
      const ok = await saveArticles(articles);
      setUploadResult({ ok, errors: result.errors, total: articles.length, files: 1 });
      await refreshArticles();
    } catch (e) {
      alert('Fehler beim Verarbeiten der Datei: ' + (e as Error).message);
    }
    setUploading(false);
  }

  function isDatanormFile(name: string): boolean {
    const lower = name.toLowerCase();
    if (/\.(dn|datanorm|txt|csv|rab|wrg)$/i.test(lower)) return true;
    if (/\.dat$/i.test(lower)) return true;
    if (/\.\d{3,}$/i.test(lower)) return true;
    if (lower.startsWith('datanorm')) return true;
    return false;
  }

  async function handleFolder(files: FileList) {
    if (!companyId) return;
    setUploading(true);
    setUploadResult(null);
    setDiagnostics(null);

    const dnFiles = Array.from(files).filter(f =>
      isDatanormFile(f.name) && f.size > 0
    );

    if (dnFiles.length === 0) {
      alert('Keine Datanorm-Dateien (.001, .002, .DAT, .dn, ...) im Ordner gefunden.');
      setUploading(false);
      return;
    }

    let totalOk = 0;
    let totalErrors = 0;
    let totalArticles = 0;
    let totalFiles = 0;

    // Pass 1: Parse all files, collect manufacturers + articles
    const allManufacturers = new Map<string, DatanormManufacturer>();
    const rawArticles: DatanormArticle[] = [];
    const fileResults: FileData[] = [];

    for (const file of dnFiles) {
      try {
        const result = await processDatanormFile(file);
        fileResults.push(result);
        for (const [key, m] of result.manufacturers) {
          allManufacturers.set(key, m);
        }
        if (result.articles.length > 0) {
          rawArticles.push(...result.articles);
          totalFiles++;
        }
        totalErrors += result.errors;
      } catch (e) {
        console.warn(`Fehler in ${file.name}:`, e);
        totalErrors++;
      }
    }

    // Pass 2: Resolve manufacturer names across all files
    const allArticles = resolveArticleManufacturers(rawArticles, allManufacturers);
    totalArticles = allArticles.length;

    totalOk = await saveArticles(allArticles);
    setUploadResult({ ok: totalOk, errors: totalErrors, total: totalArticles, files: totalFiles });
    await refreshArticles();
    setUploading(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('Diesen Artikel wirklich löschen?')) return;
    setDeleting(id);
    try {
      await deleteDoc(doc(db, 'articles', id));
      setArticles(prev => prev.filter(a => a.id !== id));
    } catch { alert('Löschen fehlgeschlagen'); }
    setDeleting(null);
  }

  async function handleDeleteAll() {
    if (!confirm('Alle importierten Artikel wirklich löschen? Dies kann nicht rückgängig gemacht werden.')) return;
    setDeleting('all');
    try {
      const q = query(collection(db, 'articles'), where('companyId', '==', companyId));
      const snap = await getDocs(q);
      const promises = snap.docs.map(d => deleteDoc(doc(db, 'articles', d.id)));
      await Promise.all(promises);
      setArticles([]);
    } catch { alert('Löschen fehlgeschlagen'); }
    setDeleting(null);
  }

  if (loading || !user) return null;

  const input = 'w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100/50 transition-all shadow-sm';
  const btnPrimary = 'px-5 py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 hover:shadow-xl hover:shadow-teal-200/50 active:scale-[0.97] disabled:opacity-50 text-white font-bold rounded-xl transition-all text-sm shadow-lg';

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="px-8 py-8 max-w-5xl mx-auto space-y-8">
          <div className="animate-fadeIn">
            <a href="/settings" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-600 font-medium mb-3 transition-colors">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5" /><polyline points="12 19 5 12 12 5" />
              </svg>
              Zurück zu Einstellungen
            </a>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Artikelkatalog</h1>
            <p className="text-slate-500 text-sm mt-1">Datanorm-Dateien importieren und Artikel verwalten</p>
          </div>

          {/* Upload */}
          <div
            ref={dropRef}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f && f.size > 0) {
                setUploadMode('file');
                handleFile(f);
              }
            }}
            className={`bg-white rounded-2xl border-2 border-dashed transition-all duration-300 p-10 text-center animate-slideUp ${dragOver ? 'border-teal-500 bg-teal-50' : 'border-slate-200 hover:border-teal-300 hover:bg-teal-50/50'}`}
          >
            <span className="text-5xl block mb-4">{uploading ? '⏳' : uploadMode === 'folder' ? '📁' : '📦'}</span>
            <p className="text-slate-700 font-bold text-lg mb-1">
              {uploading ? 'Importiere Artikel...' : uploadMode === 'folder' ? 'Datanorm-Ordner importieren' : 'Datanorm-Datei importieren'}
            </p>
            <p className="text-slate-400 text-sm mb-5">
              {uploadMode === 'folder'
                ? 'Wähle einen Ordner mit Datanorm-Dateien aus oder ziehe ihn hierher'
                : 'Ziehe eine Datanorm-Datei hierher oder klicke zum Durchsuchen'}
            </p>

            {/* Mode Toggle */}
            <div className="flex items-center justify-center gap-2 mb-5">
              <button
                onClick={() => setUploadMode('file')}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${uploadMode === 'file' ? 'bg-teal-100 text-teal-700 shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
              >
                <span className="mr-1.5">📄</span> Einzeldatei
              </button>
              <button
                onClick={() => setUploadMode('folder')}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${uploadMode === 'folder' ? 'bg-teal-100 text-teal-700 shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
              >
                <span className="mr-1.5">📁</span> GANZER ORDNER
              </button>
            </div>

            {uploadMode === 'file' ? (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".dn,.datanorm,.txt,.csv,.dat,.rab,.wrg,.001,.002,.003,.004,.005,.006,.007,.008,.009,.DAT,.RAB,.WRG"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                  className="hidden"
                />
                <button onClick={() => fileRef.current?.click()} disabled={uploading} className={btnPrimary}>
                  {uploading ? 'Import läuft...' : 'Datei auswählen'}
                </button>
              </>
            ) : (
              <>
                <input
                  ref={folderRef}
                  type="file"
                  // @ts-ignore
                  webkitdirectory=""
                  directory=""
                  multiple
                  onChange={e => { const files = e.target.files; if (files && files.length > 0) handleFolder(files); }}
                  className="hidden"
                />
                <button onClick={() => folderRef.current?.click()} disabled={uploading} className={btnPrimary}>
                  {uploading ? 'Import läuft...' : 'Ordner auswählen'}
                </button>
              </>
            )}

            {progress && (
              <div className="mt-5">
                <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                  <span>{progress.phase}</span>
                  <span>{progress.current} / {progress.total}</span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 rounded-full transition-all duration-300"
                    style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}

            {uploadResult && (
              <div className={`mt-5 p-4 rounded-xl text-sm font-bold border ${uploadResult.errors === 0 ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                <p>{uploadResult.ok} von {uploadResult.total} Artikeln importiert{uploadResult.files > 1 ? ` (aus ${uploadResult.files} Dateien)` : ''}</p>
                {uploadResult.errors > 0 && <p className="text-xs mt-1 opacity-75">{uploadResult.errors} Fehler</p>}
              </div>
            )}
            {diagnostics && diagnostics.parsedRecords.length === 0 && (
              <div className="mt-5 p-4 rounded-xl bg-red-50 border border-red-200 text-left text-sm">
                <p className="font-bold text-red-700 mb-2">⚠️ Keine Datanorm-Datensätze gefunden</p>
                <p className="text-red-600 text-xs mb-1">Datei: {diagnostics.fileSize} Bytes, {diagnostics.totalLines} Zeilen, {diagnostics.nonEmptyLines} nicht-leer</p>
                <p className="text-red-600 text-xs mb-1">Erkanntes Format: {diagnostics.detectedFormat || 'unbekannt'}</p>
                {diagnostics.detectedFormat?.includes(';') && (
                  <p className="text-amber-700 text-xs mb-2 font-semibold">→ Wird mit Fallback-Parser verarbeitet</p>
                )}
                <p className="text-red-600 text-xs mb-2">Erste Zeilen:</p>
                <pre className="text-xs text-red-800 bg-red-100 p-2 rounded overflow-x-auto max-h-40">
                  {diagnostics.sampleLines.map((l, i) => `${i + 1}: ${l}`).join('\n')}
                </pre>
              </div>
            )}
          </div>

          {/* Stats */}
          {articles.length > 0 && (
            <div className="grid grid-cols-3 gap-4 animate-slideUp">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <p className="text-slate-400 text-xs font-semibold mb-1">Gesamt</p>
                <p className="text-2xl font-bold text-slate-900">{articles.length}</p>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <p className="text-slate-400 text-xs font-semibold mb-1">Mit Preis</p>
                <p className="text-2xl font-bold text-slate-900">{articles.filter(a => a.price > 0).length}</p>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <p className="text-slate-400 text-xs font-semibold mb-1">Hersteller</p>
                <p className="text-2xl font-bold text-slate-900">{new Set(articles.filter(a => a.manufacturerName).map(a => a.manufacturerName)).size}</p>
              </div>
            </div>
          )}

          {/* Search & Actions */}
          {articles.length > 0 && (
            <div className="flex items-center gap-3 animate-slideUp">
              <div className="relative flex-1">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                </svg>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Suchen (Artikel-Nr., Name, EAN, Hersteller)..." className={`${input} pl-10`} />
              </div>
              <button onClick={handleDeleteAll} disabled={deleting === 'all'}
                className="px-4 py-2.5 bg-gradient-to-br from-red-50 to-rose-50 hover:from-red-100 hover:to-rose-100 text-red-600 rounded-xl text-sm font-bold transition-all border border-red-200 hover:border-red-300 active:scale-[0.97] shadow-sm disabled:opacity-50">
                {deleting === 'all' ? 'Lösche...' : 'Alle löschen'}
              </button>
              <button onClick={exportCSV}
                className="px-4 py-2.5 bg-gradient-to-br from-teal-50 to-emerald-50 hover:from-teal-100 hover:to-emerald-100 text-teal-700 rounded-xl text-sm font-bold transition-all border border-teal-200 hover:border-teal-300 active:scale-[0.97] shadow-sm">
                📥 CSV exportieren
              </button>
            </div>
          )}

          {/* Table */}
          {loadingArticles ? (
            <div className="flex items-center justify-center py-20">
              <span className="w-8 h-8 border-2 border-slate-200 border-t-teal-600 rounded-full animate-spin" />
            </div>
          ) : articles.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-16 text-center animate-slideUp">
              <span className="text-6xl block mb-4">📭</span>
              <p className="text-slate-900 font-bold text-lg mb-1">Keine Artikel importiert</p>
              <p className="text-slate-400 text-sm">Importiere eine Datanorm-Datei oder einen ganzen Ordner, um deinen Artikelkatalog aufzubauen.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-slideUp">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Artikel-Nr.</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Hersteller</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">EAN</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Preis</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Einheit</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginated.map((a, i) => (
                      <tr key={a.id} className="hover:bg-slate-50 transition-colors group" style={{ animationDelay: `${i * 20}ms` }}>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{a.articleNo}</td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900">{a.name1}</p>
                          {a.name2 && <p className="text-xs text-slate-400">{a.name2}</p>}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{a.manufacturerName || '-'}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-400">{a.ean || '-'}</td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900">
                          {a.price > 0 ? `${(a.price).toFixed(2)} ${a.currency || '€'}` : '-'}
                        </td>
                        <td className="px-4 py-3 text-center text-slate-500">{a.unit || '-'}</td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => handleDelete(a.id)} disabled={deleting === a.id}
                            className="opacity-0 group-hover:opacity-100 px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 rounded-lg font-medium transition-all disabled:opacity-50">
                            {deleting === a.id ? '...' : 'Löschen'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filtered.length === 0 && (
                <div className="p-10 text-center text-slate-400 text-sm">
                  Keine Artikel gefunden für &quot;{search}&quot;
                </div>
              )}
              {filtered.length > 50 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/50">
                  <p className="text-xs text-slate-500">{filtered.length} Artikel · Seite {page} von {totalPages}</p>
                  <div className="flex gap-1">
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-30 transition-all">← Zurück</button>
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-30 transition-all">Weiter →</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
