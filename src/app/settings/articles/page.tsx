'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';
import UpgradeModal from '@/components/UpgradeModal';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { parseDatanorm, parseGenericArticles, validateDatanorm, resolveArticleManufacturers, diagnoseFile, type DatanormArticle, type DatanormManufacturer, type DatanormDiagnostics } from '@/lib/datanorm';
import { Download, ClipboardList, Loader2, Folder, Pin, RefreshCw, TriangleAlert, XCircle, CheckCircle2, FileDown, ChevronRight, FileText, Package, MailOpen } from 'lucide-react';
import { getFeatureFlag } from '@/lib/plans';

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
  sourceFile: string;
}

export default function ArticlesPage() {
  const { user, loading, companyId, company } = useData();
  const [showUpgrade, setShowUpgrade] = useState(false);
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const [articles, setArticles] = useState<ArticleDoc[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(true);
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadMode, setUploadMode] = useState<'file' | 'folder'>('file');
  const [uploadResult, setUploadResult] = useState<{ ok: number; errors: number; total: number; files: number; encoding?: string } | null>(null);
  const [diagnostics, setDiagnostics] = useState<DatanormDiagnostics | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [progress, setProgress] = useState<{ current: number; total: number; phase: string } | null>(null);
  const [manualEncoding, setManualEncoding] = useState('auto');
  const [tab, setTab] = useState<'import' | 'catalog'>('import');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  useEffect(() => {
    if (!uploading) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    const handlePopState = () => {
      const stay = window.confirm('Upload läuft noch. Seite wirklich verlassen?');
      if (stay) return;
      window.history.pushState(null, '', window.location.href);
    };
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [uploading]);

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
      } catch (e) { console.error('Error loading articles:', e); setArticles([]); }
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
    const list = search.trim() ? filtered : articles;
    const headers = ['Artikel-Nr.', 'Name', 'Hersteller', 'EAN', 'Preis (€)', 'Einheit'];
    const rows = list.map(a => [
      a.articleNo,
      `"${(a.name1 || '').replace(/"/g, '""')}"`,
      `"${(a.manufacturerName || '').replace(/"/g, '""')}"`,
      a.ean,
      (a.price || 0).toFixed(2).replace('.', ','),
      a.unit || '',
    ].join(';'));
    const csv = '\ufeff' + headers.join(';') + '\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'artikel_export.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  const cp850Table: Record<number, string> = {};
  function buildCP850() {
    const map: [number, number][] = [
      [0x80,0xC7],[0x81,0xFC],[0x82,0xE9],[0x83,0xE2],[0x84,0xE4],[0x85,0xE0],[0x86,0xE5],[0x87,0xE7],
      [0x88,0xEA],[0x89,0xEB],[0x8A,0xE8],[0x8B,0xEF],[0x8C,0xEE],[0x8D,0xEC],[0x8E,0xC4],[0x8F,0xC5],
      [0x90,0xC9],[0x91,0xE6],[0x92,0xC6],[0x93,0xF4],[0x94,0xF6],[0x95,0xF2],[0x96,0xFB],[0x97,0xF9],
      [0x98,0xFF],[0x99,0xD6],[0x9A,0xDC],[0x9B,0xF8],[0x9C,0xA3],[0x9D,0xD8],[0x9E,0xD7],[0x9F,0x192],
      [0xA0,0xE1],[0xA1,0xED],[0xA2,0xF3],[0xA3,0xFA],[0xA4,0xF1],[0xA5,0xD1],[0xA6,0xAA],[0xA7,0xBA],
      [0xA8,0xBF],[0xA9,0xAE],[0xAA,0xAC],[0xAB,0xBD],[0xAC,0xBC],[0xAD,0xA1],[0xAE,0xAB],[0xAF,0xBB],
      [0xB0,0x2591],[0xB1,0x2592],[0xB2,0x2593],[0xB3,0x2502],[0xB4,0x2524],[0xB5,0xC1],[0xB6,0xC2],[0xB7,0xC0],
      [0xB8,0xA9],[0xB9,0x2563],[0xBA,0x2551],[0xBB,0x2557],[0xBC,0x255D],[0xBD,0xA2],[0xBE,0xA5],[0xBF,0x2510],
      [0xC0,0x2514],[0xC1,0x2534],[0xC2,0x252C],[0xC3,0x251C],[0xC4,0x2500],[0xC5,0x253C],[0xC6,0xE3],[0xC7,0xC3],
      [0xC8,0x255A],[0xC9,0x2554],[0xCA,0x2569],[0xCB,0x2566],[0xCC,0x2560],[0xCD,0x2550],[0xCE,0x256C],[0xCF,0xA4],
      [0xD0,0xF0],[0xD1,0xD0],[0xD2,0xCA],[0xD3,0xCB],[0xD4,0xC8],[0xD5,0x131],[0xD6,0xCD],[0xD7,0xCE],
      [0xD8,0xCF],[0xD9,0x2518],[0xDA,0x250C],[0xDB,0x2588],[0xDC,0x2584],[0xDD,0xA6],[0xDE,0xCC],[0xDF,0x2580],
      [0xE0,0x3B1],[0xE1,0xDF],[0xE2,0x393],[0xE3,0x3C0],[0xE4,0x3A3],[0xE5,0x3C3],[0xE6,0xB5],[0xE7,0x3C4],
      [0xE8,0x3A6],[0xE9,0x398],[0xEA,0x3A9],[0xEB,0x3B4],[0xEC,0x221E],[0xED,0x3C6],[0xEE,0x3B5],[0xEF,0x2229],
      [0xF0,0x2261],[0xF1,0xB1],[0xF2,0x2265],[0xF3,0x2264],[0xF4,0x2320],[0xF5,0x2321],[0xF6,0xF7],[0xF7,0x2248],
      [0xF8,0xB0],[0xF9,0x2219],[0xFA,0xB7],[0xFB,0x221A],[0xFC,0x207F],[0xFD,0xB2],[0xFE,0x25A0],[0xFF,0xA0],
    ];
    for (const [cp850, unicode] of map) {
      cp850Table[cp850] = String.fromCodePoint(unicode);
    }
    for (let i = 0; i < 0x80; i++) cp850Table[i] = String.fromCodePoint(i);
  }
  buildCP850();

  function decodeCP850(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let out = '';
    for (let i = 0; i < bytes.length; i++) {
      out += cp850Table[bytes[i]] || '\ufffd';
    }
    return out;
  }

  function decodeText(buffer: ArrayBuffer, override?: string): string {
    const nativeEncodings = ['utf-8', 'windows-1252', 'macintosh', 'iso-8859-1', 'iso-8859-15'];
    const supported = new Set<string>();
    for (const enc of nativeEncodings) {
      try { new TextDecoder(enc); supported.add(enc); } catch (e) { console.error('TextDecoder not supported:', enc, e); }
    }
    const candidates: { name: string; decode: (buf: ArrayBuffer) => string }[] = override
      ? override === 'ibm850'
        ? [{ name: 'ibm850', decode: decodeCP850 }]
        : [{ name: override, decode: (b) => new TextDecoder(override, { fatal: false }).decode(b) }]
      : [
          { name: 'ibm850', decode: decodeCP850 },
          ...nativeEncodings.filter(e => supported.has(e)).map(e => ({ name: e, decode: (b: ArrayBuffer) => new TextDecoder(e, { fatal: false }).decode(b) })),
        ];
    let best = { text: '', score: -1, encoding: '' };
    for (const { name, decode } of candidates) {
      try {
        const text = decode(buffer);
        const replacements = (text.match(/\ufffd/g) || []).length;
        const total = text.length;
        if (replacements / total > 0.1 && !override) continue;
        const umlauts = (text.match(/[äöüßÄÖÜ]/g) || []).length;
        const valid = (text.match(/[a-zA-ZäöüßÄÖÜ0-9 .,;:\-()/\n\r]/g) || []).length;
        const score = umlauts * 20 + valid;
        if (score > best.score) {
          best = { text, score, encoding: name };
        }
      } catch (e) {
      }
    }
    return best.text || new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  }

  function hexDump(buffer: ArrayBuffer, maxLen = 200): string {
    const bytes = new Uint8Array(buffer.slice(0, maxLen));
    const lines: string[] = [];
    for (let i = 0; i < bytes.length; i += 16) {
      const hex = Array.from(bytes.slice(i, i + 16)).map(b => b.toString(16).padStart(2, '0')).join(' ');
      const ascii = Array.from(bytes.slice(i, i + 16)).map(b => (b >= 0x20 && b < 0x7f) ? String.fromCodePoint(b) : '.').join('');
      lines.push(`${i.toString(16).padStart(4, '0')}  ${hex.padEnd(48)}  ${ascii}`);
    }
    return lines.join('\n');
  }

  interface EncodingTest {
    encoding: string;
    sample: string;
    hasReplacement: boolean;
  }

  function diagnoseEncoding(buffer: ArrayBuffer): EncodingTest[] {
    const tests: { name: string; decode: (b: ArrayBuffer) => string }[] = [];
    for (const enc of ['utf-8', 'windows-1252', 'iso-8859-1', 'iso-8859-15', 'macintosh']) {
      try { new TextDecoder(enc); tests.push({ name: enc, decode: (b) => new TextDecoder(enc, { fatal: false }).decode(b) }); } catch (e) { console.error('TextDecoder not supported:', enc, e); }
    }
    tests.push({ name: 'ibm850', decode: decodeCP850 });
    return tests.map(({ name, decode }) => {
      const decoded = decode(buffer);
      const sample = decoded.slice(0, 200).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
      return { encoding: name, sample, hasReplacement: decoded.includes('\ufffd') };
    });
  }

  interface FileData {
    name: string;
    manufacturers: Map<string, DatanormManufacturer>;
    articles: DatanormArticle[];
    errors: number;
  }

  async function processDatanormText(text: string, fileName: string): Promise<FileData> {
    const validation = validateDatanorm(text);
    if (!validation.valid) {
      throw new Error('Ungültige Datei: ' + validation.message);
    }
    let result = parseDatanorm(text);
    if (result.articles.length === 0) {
      result = parseGenericArticles(text);
    }
    return {
      name: fileName,
      manufacturers: result.manufacturers,
      articles: result.articles,
      errors: result.errors.length,
    };
  }

  async function saveArticles(articleList: DatanormArticle[], sourceFile: string): Promise<number> {
    let ok = 0;
    let processed = 0;
    const seen = new Set<string>();
    const total = articleList.length;
    setProgress({ current: 0, total, phase: 'Speichere...' });
    for (const article of articleList) {
      if (seen.has(article.articleNo)) { processed++; setProgress({ current: processed, total, phase: 'Speichere...' }); continue; }
      seen.add(article.articleNo);
      try {
        const existing = articles.find(a => a.articleNo === article.articleNo);
        if (existing) { processed++; setProgress({ current: processed, total, phase: 'Speichere...' }); continue; }
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
          sourceFile,
        });
        ok++;
      } catch { /* skip */ }
      processed++;
      setProgress({ current: processed, total, phase: 'Speichere...' });
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
      const buffer = await file.arrayBuffer();
      const text = decodeText(buffer, manualEncoding !== 'auto' ? manualEncoding : undefined);
      const hexDumpStr = hexDump(buffer);
      const encTests = diagnoseEncoding(buffer);
      const diag = diagnoseFile(text, file.name, file.size);
      diag.hexDump = hexDumpStr;
      diag.encodingTests = encTests;
      diag.encoding = manualEncoding !== 'auto' ? manualEncoding : (encTests.find(e => !e.hasReplacement)?.encoding || 'unbekannt');
      setDiagnostics(diag);

      const result = await processDatanormText(text, file.name);
      const articles = resolveArticleManufacturers(result.articles, result.manufacturers);
      const ok = await saveArticles(articles, file.name);
      setUploadResult({ ok, errors: result.errors, total: articles.length, files: 1, encoding: manualEncoding !== 'auto' ? manualEncoding : undefined });
      await refreshArticles();
    } catch (e) {
      console.error('handleFile error:', e);
      alert('Fehler beim Verarbeiten der Datei: ' + (e instanceof Error ? e.message : String(e)));
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
    let totalFiles = 0;

    // Pass 1: Parse all files, collect manufacturers + articles
    const allManufacturers = new Map<string, DatanormManufacturer>();
    const allArticles: { article: DatanormArticle; sourceFile: string }[] = [];

    for (const file of dnFiles) {
      try {
        const buf = await file.arrayBuffer();
        const text = decodeText(buf, manualEncoding !== 'auto' ? manualEncoding : undefined);
        const result = await processDatanormText(text, file.name);
        for (const [key, m] of result.manufacturers) {
          allManufacturers.set(key, m);
        }
        if (result.articles.length > 0) {
          const resolved = resolveArticleManufacturers(result.articles, allManufacturers);
          for (const a of resolved) {
            allArticles.push({ article: a, sourceFile: file.name });
          }
          totalFiles++;
        }
        totalErrors += result.errors;
      } catch (e) {
        totalErrors++;
      }
    }

    // Dedup by articleNo across all files + existing database articles
    const existingNos = new Set(articles.map(a => a.articleNo));
    const seen = new Set<string>();
    const uniqueArticles: DatanormArticle[] = [];
    for (const { article, sourceFile } of allArticles) {
      if (existingNos.has(article.articleNo)) continue;
      if (seen.has(article.articleNo)) continue;
      seen.add(article.articleNo);
      uniqueArticles.push({ ...article, sourceFile });
    }

    if (uniqueArticles.length > 0) {
      totalOk = await saveArticles(uniqueArticles, 'Ordner-Import (' + totalFiles + ' Dateien)');
    }

    setUploadResult({ ok: totalOk, errors: totalErrors, total: uniqueArticles.length, files: totalFiles });
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

  function handleDeleteGroup(ids: string[], file: string) {
    if (confirm(`${ids.length} Artikel aus "${file}" wirklich löschen?`)) {
      Promise.all(ids.map(id => deleteDoc(doc(db, 'articles', id))))
        .then(refreshArticles)
        .catch(() => alert('Fehler beim Löschen der Gruppe.'));
    }
  }

  function FileGroup({ file, group, open, expandedGroups, setExpandedGroups, onDeleteGroup, onDelete, deleting, refresh }: {
    file: string; group: ArticleDoc[]; open: boolean;
    expandedGroups: Set<string>; setExpandedGroups: (s: Set<string>) => void;
    onDeleteGroup: (ids: string[], file: string) => void;
    onDelete: (id: string) => void; deleting: string | null; refresh: () => void;
  }) {
    return (
      <div key={file} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="w-full flex items-center justify-between px-5 py-3 bg-slate-50/80 border-b border-slate-200">
          <button onClick={() => {
            const next = new Set(expandedGroups);
            if (open) next.delete(file); else next.add(file);
            setExpandedGroups(next);
          }} className="flex items-center gap-2 text-left">
            <ChevronRight className={`w-3 h-3 transition-transform ${open ? 'rotate-90' : ''}`} />
            <FileText className="w-4 h-4 text-slate-600" />
            <span className="text-sm font-bold text-slate-700">{file}</span>
            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{group.length} Artikel</span>
          </button>
          <button onClick={() => onDeleteGroup(group.map(a => a.id), file)}
            className="px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 rounded-lg font-medium transition-all">
            Gruppe löschen
          </button>
        </div>
        {open && (
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
                {group.map((a, i) => (
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
                      <button onClick={() => onDelete(a.id)} disabled={deleting === a.id}
                        className="opacity-0 group-hover:opacity-100 px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 rounded-lg font-medium transition-all disabled:opacity-50">
                        {deleting === a.id ? '...' : 'Löschen'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
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

  if (!getFeatureFlag(company?.subscriptionPlan, 'articleCatalog')) {
    return (
      <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center px-6 max-w-md">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-200 flex items-center justify-center mx-auto mb-4">
              <Package className="w-8 h-8 text-purple-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Artikelkatalog</h2>
            <p className="text-slate-500 text-sm mb-6">Der Datanorm-Artikelkatalog ist exklusiv im Business-Plan enthalten.</p>
            <button onClick={() => setShowUpgrade(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-bold rounded-xl text-sm hover:shadow-lg active:scale-[0.97] transition-all">
              Jetzt upgraden
            </button>
            <UpgradeModal open={showUpgrade} onClose={() => setShowUpgrade(false)} dismissable
              title="Artikelkatalog"
              description='Der Datanorm-Artikelkatalog ist exklusiv im Business-Plan enthalten. Importiere Artikel aus Datanorm-Dateien und verwalte deinen Katalog.'
              feature="articleCatalog" />
          </div>
        </main>
      </div>
    );
  }

  const input = 'w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100/50 transition-all shadow-sm';
  const btnPrimary = 'px-5 py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 hover:shadow-xl hover:shadow-teal-200/50 active:scale-[0.97] disabled:opacity-50 text-white font-bold rounded-xl transition-all text-sm shadow-lg';

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="px-4 md:px-8 py-4 md:py-8 max-w-5xl mx-auto space-y-8">
          <div className="">
            <a href="/settings" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-600 font-medium mb-3 transition-colors">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5" /><polyline points="12 19 5 12 12 5" />
              </svg>
              Zurück zu Einstellungen
            </a>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Artikelkatalog</h1>
            <p className="text-slate-500 text-sm mt-1">Datanorm-Dateien importieren und Artikel verwalten</p>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-white rounded-2xl border border-slate-200 shadow-sm p-1">
            <button onClick={() => setTab('import')}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${tab === 'import' ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-lg shadow-teal-200/50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>
              <Download className="inline w-4 h-4 mr-1" /> Import
            </button>
            <button onClick={() => setTab('catalog')}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${tab === 'catalog' ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-lg shadow-teal-200/50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>
              <ClipboardList className="inline w-4 h-4 mr-1" /> Katalog {articles.length > 0 && `(${articles.length})`}
            </button>
          </div>

          {/* Upload */}
          {tab === 'import' && (
          <div
            ref={dropRef}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => {
              e.preventDefault();
              setDragOver(false);
              const files = e.dataTransfer.files;
              if (files && files.length > 0) handleFolder(files);
            }}
            className={`bg-white rounded-2xl border-2 border-dashed transition-all duration-300 p-10 text-center  ${dragOver ? 'border-teal-500 bg-teal-50' : 'border-slate-200 hover:border-teal-300 hover:bg-teal-50/50'}`}
          >
            <span className="block mb-4">{uploading ? <Loader2 className="w-12 h-12 animate-spin text-blue-500 mx-auto" /> : <Folder className="w-12 h-12 text-blue-500 mx-auto" />}</span>
            <p className="text-slate-700 font-bold text-lg mb-1">
              {uploading ? 'Importiere Artikel...' : 'Datanorm-Ordner importieren'}
            </p>
            <p className="text-slate-400 text-sm mb-5">
              Wähle einen Ordner mit Datanorm-Dateien aus oder ziehe ihn hierher
            </p>

            {/* Hinweis für Einzeldateien */}
            <div className="mb-5 mx-auto max-w-lg p-4 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 text-left">
              <p className="text-sm font-bold text-blue-800 mb-1"><Pin className="inline w-4 h-4 mr-1 text-blue-800" /> Nur Ordner-Import</p>
              <p className="text-xs text-blue-700 leading-relaxed">
                Datanorm-Dateien bestehen meist aus mehreren zusammengehörigen Dateien (.001, .002, .003, …).
                Lege deine Datei<strong> in einen leeren Ordner</strong> und importiere den ganzen Ordner.
              </p>
            </div>

            {/* Encoding Selector */}
            <div className="flex items-center justify-center gap-2 mb-5">
              <label className="text-xs text-slate-500 font-medium">Encoding:</label>
              <select value={manualEncoding} onChange={e => setManualEncoding(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 font-medium outline-none focus:border-teal-400">
                <option value="auto">Auto</option>
                <option value="utf-8">UTF-8</option>
                <option value="windows-1252">Windows-1252 (ANSI)</option>
                <option value="ibm850">CP850 / IBM850 (DOS)</option>
                <option value="macintosh">MacRoman</option>
                <option value="iso-8859-1">ISO-8859-1</option>
                <option value="iso-8859-15">ISO-8859-15 (Latin-9)</option>
              </select>
            </div>

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
                {uploadResult.encoding && <p className="text-xs mt-1 opacity-75">Encoding: {uploadResult.encoding}</p>}
                {uploadResult.errors > 0 && <p className="text-xs mt-1 opacity-75">{uploadResult.errors} Fehler</p>}
              </div>
            )}
            {diagnostics && diagnostics.parsedRecords.length === 0 && (
              <div className="mt-5 p-4 rounded-xl bg-red-50 border border-red-200 text-left text-sm">
                <p className="font-bold text-red-700 mb-2"><TriangleAlert className="inline w-4 h-4 mr-1" /> Keine Datanorm-Datensätze gefunden</p>
                <p className="text-red-600 text-xs mb-1">Datei: {diagnostics.fileSize} Bytes, {diagnostics.totalLines} Zeilen, {diagnostics.nonEmptyLines} nicht-leer</p>
                <p className="text-red-600 text-xs mb-1">Erkanntes Format: {diagnostics.detectedFormat || 'unbekannt'}</p>
                {diagnostics.detectedFormat?.includes(';') && (
                  <p className="text-amber-700 text-xs mb-2 font-semibold">→ Wird mit Fallback-Parser verarbeitet</p>
                )}
                <p className="text-red-600 text-xs mb-2">Erste Zeilen:</p>
                <pre className="text-xs text-red-800 bg-red-100 p-2 rounded overflow-x-auto max-h-40">
                  {diagnostics.sampleLines.map((l, i) => `${i + 1}: ${l}`).join('\n')}
                </pre>
                {diagnostics.hexDump && (
                  <details className="mt-2">
                    <summary className="text-xs text-red-500 cursor-pointer font-semibold">Hex-Dump + Encoding-Tests</summary>
                    <pre className="text-xs text-red-800 bg-red-100 p-2 rounded overflow-x-auto max-h-40 mt-1">
Encoding: {diagnostics.encoding}
{diagnostics.encodingTests?.map(t =>
  `${t.encoding}: ${t.hasReplacement ? '✗' : '✓'}  ${t.sample.slice(0, 100)}…`
).join('\n')}

Hex (erste {diagnostics.hexDump.split('\n').length} Zeilen):
{diagnostics.hexDump}
                    </pre>
                  </details>
                )}
              </div>
            )}
          </div>
          )}

          {/* Catalog */}
          {tab === 'catalog' && (
          <div>
          {articles.length > 0 && (
            <div className="grid grid-cols-3 gap-4 ">
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
            <div className="flex items-center gap-3 ">
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
                <FileDown className="inline w-4 h-4 mr-1" /> CSV exportieren
              </button>
            </div>
          )}

          {/* Table */}
          {loadingArticles ? (
            <div className="flex items-center justify-center py-20">
              <span className="w-8 h-8 border-2 border-slate-200 border-t-teal-600 rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-16 text-center ">
              <MailOpen className="w-16 h-16 mx-auto mb-4 text-slate-300" />
              <p className="text-slate-900 font-bold text-lg mb-1">Keine Artikel importiert</p>
              <p className="text-slate-400 text-sm">Importiere eine Datanorm-Datei oder einen ganzen Ordner, um deinen Artikelkatalog aufzubauen.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {Array.from(
                new Map(filtered.map(a => [a.sourceFile || 'Unbekannt', []])).entries()
              ).map(([file]) => {
                const group = filtered.filter(a => (a.sourceFile || 'Unbekannt') === file);
                const open = expandedGroups.has(file);
                return (
                  <FileGroup key={file} file={file} group={group} open={open}
                    expandedGroups={expandedGroups} setExpandedGroups={setExpandedGroups}
                    onDeleteGroup={handleDeleteGroup} onDelete={handleDelete}
                    deleting={deleting} refresh={refreshArticles} />
                );
              })}
              {search && filtered.length > 0 && (
                <div className="text-xs text-slate-400 text-center bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
                  {filtered.length} Artikel gefunden für &quot;{search}&quot;
                </div>
              )}
            </div>
          )}
          </div>
          )}
        </div>
      </main>
    </div>
  );
}
