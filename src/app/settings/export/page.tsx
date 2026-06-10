'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';
import UpgradeModal from '@/components/UpgradeModal';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { formatCurrency } from '@/lib/utils';
import { calculateRevenue } from '@/lib/calculations';
import { assignmentsToDatevRows, generateDatevCSV, generateDatevFilename } from '@/lib/datev';
import { getFeatureFlag } from '@/lib/plans';
import { Package, BarChart3, Users, Building2, FileText, Coins } from 'lucide-react';

export default function ExportPage() {
  const { user, loading, companyId, company, assignments, employees, customers } = useData();
  const router = useRouter();
  const [skr, setSkr] = useState<'03' | '04'>('04');
  const [taxRate, setTaxRate] = useState(19);
  const [showUpgrade, setShowUpgrade] = useState<'datev' | 'batch' | null>(null);

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [user, loading, router]);

  useEffect(() => {
    if (companyId) {
      getDoc(doc(db, 'companies', companyId, 'settings', 'invoice')).then(snap => {
        if (snap.exists()) {
          const t = snap.data();
          if (t.taxRate) setTaxRate(parseFloat(t.taxRate) || 19);
        }
      });
    }
  }, [companyId]);

  if (loading || !user) return null;

  function downloadCSV(content: string, fileName: string) {
    const blob = new Blob(['\ufeff' + content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName; a.click();
    URL.revokeObjectURL(url);
  }

  function exportAssignmentsCSV() {
    const sep = ';';
    const q = (s: string) => `"${(s || '').replace(/"/g, '""')}"`;
    let csv = `${q('Projekt')}${sep}${q('Kunde')}${sep}${q('Datum')}${sep}${q('Stunden')}${sep}${q('Stundenlohn')}${sep}${q('Umsatz')}${sep}${q('Mitarbeiter')}${sep}${q('Status')}\n`;
    assignments.forEach(a => {
      const rev = calculateRevenue(a.umsatz);
      csv += `${q(a.projekt)}${sep}${q(a.kunde)}${sep}${q(a.datum)}${sep}${a.stunden}${sep}${a.stundenlohn}${sep}${rev.toFixed(2)}${sep}${q(Array.isArray(a.mitarbeiter) ? a.mitarbeiter.join(', ') : a.mitarbeiter || '')}${sep}${q(a.status || '')}\n`;
    });
    downloadCSV(csv, `EarnTrack_Einsaetze_${new Date().toISOString().split('T')[0]}.csv`);
  }

  function exportEmployeesCSV() {
    const sep = ';';
    const q = (s: string) => `"${(s || '').replace(/"/g, '""')}"`;
    let csv = `${q('Name')}${sep}${q('E-Mail')}${sep}${q('Telefon')}${sep}${q('Stundenlohn')}${sep}${q('Notizen')}\n`;
    employees.forEach(e => { csv += `${q(e.name)}${sep}${q(e.email || '')}${sep}${q(e.telefon || '')}${sep}${e.stundenlohn || 0}${sep}${q(e.notizen || '')}\n`; });
    downloadCSV(csv, `EarnTrack_Mitarbeiter_${new Date().toISOString().split('T')[0]}.csv`);
  }

  function exportCustomersCSV() {
    const sep = ';';
    const q = (s: string) => `"${(s || '').replace(/"/g, '""')}"`;
    let csv = `${q('Name')}${sep}${q('E-Mail')}${sep}${q('Telefon')}${sep}${q('Adresse')}${sep}${q('Notizen')}\n`;
    customers.forEach(c => { csv += `${q(c.name)}${sep}${q(c.email || '')}${sep}${q(c.telefon || '')}${sep}${q(c.adresse || '')}${sep}${q(c.notizen || '')}\n`; });
    downloadCSV(csv, `EarnTrack_Kunden_${new Date().toISOString().split('T')[0]}.csv`);
  }

  function exportAllCSV() { exportAssignmentsCSV(); setTimeout(() => exportEmployeesCSV(), 500); setTimeout(() => exportCustomersCSV(), 1000); }

  function exportAssignmentsHTML() {
    const rows = assignments.map(a => {
      const rev = calculateRevenue(a.umsatz);
      const h = parseFloat(String(a.stunden)) || 0; const rate = parseFloat(String(a.stundenlohn)) || 0;
      const cost = h * rate; const profit = rev - cost;
      return `<tr><td>${a.projekt || '-'}</td><td>${a.kunde || '-'}</td><td>${a.datum || '-'}</td><td>${h.toFixed(1)}</td><td>€${rate.toFixed(2)}</td><td>${formatCurrency(rev)}</td><td>${formatCurrency(cost)}</td><td style="color:${profit >= 0 ? '#16a34a' : '#dc2626'};font-weight:700">${formatCurrency(profit)}</td></tr>`;
    }).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>EarnTrack Export</title><style>body{font-family:Arial,sans-serif;padding:20px;color:#333}table{width:100%;border-collapse:collapse;font-size:12px}th{background:#0d9488;color:#fff;padding:8px;text-align:left}td{padding:6px 8px;border-bottom:1px solid #eee}tr:hover{background:#f1f5f9}h1{color:#0f172a;margin-bottom:20px}</style></head><body><h1>Termin-Export EarnTrack</h1><p>Erstellt am: ${new Date().toLocaleDateString('de-DE')} | ${assignments.length} Termine</p><table><thead><tr><th>Projekt</th><th>Kunde</th><th>Datum</th><th>Stunden</th><th>Stundenlohn</th><th>Umsatz</th><th>Kosten</th><th>Gewinn</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `EarnTrack_Export_${new Date().toISOString().split('T')[0]}.html`; a.click();
    URL.revokeObjectURL(url);
  }

  const cardCls = 'group bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 p-6 cursor-pointer';
  const datevInvoiceCount = assignments.filter(a => parseFloat(String(a.umsatz).replace(/[€\s]/g, '') || '0') > 0).length;
  const skrLabel = skr === '04' ? 'SKR04 (1200/4400/1776)' : 'SKR03 (1200/8400/3806)';

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="px-4 md:px-8 py-4 md:py-8 max-w-2xl mx-auto">
          <div className="mb-6 ">
            <a href="/settings" className="text-sm text-teal-600 hover:text-teal-700 font-semibold mb-2 inline-block hover:underline">&larr; Zurück zu Einstellungen</a>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Datenexport</h1>
            <p className="text-slate-500 text-sm mt-1">Exportiere deine Daten als CSV oder HTML</p>
          </div>

          {/* DATEV options */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-4 ">
            <p className="text-sm font-bold text-slate-700 mb-3">DATEV-Export Einstellungen</p>
            <div className="flex items-center gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">SKR</label>
                <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
                  {(['04', '03'] as const).map(s => (
                    <button key={s} onClick={() => setSkr(s)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${skr === s ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                      SKR{s}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Steuersatz</label>
                <div className="flex items-center gap-1">
                  <input type="number" step="0.1" min="0" max="100" value={taxRate}
                    onChange={e => setTaxRate(parseFloat(e.target.value) || 0)}
                    className="w-16 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 outline-none focus:border-teal-500 text-center" />
                  <span className="text-sm text-slate-500">%</span>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4 ">
            {[
              { onClick: () => exportAssignmentsCSV(), icon: <BarChart3 className="w-6 h-6" />, title: 'Termine als CSV', desc: `${assignments.length} Termine exportieren` },
              { onClick: () => exportEmployeesCSV(), icon: <Users className="w-6 h-6" />, title: 'Mitarbeiter als CSV', desc: `${employees.length} Mitarbeiter exportieren` },
              { onClick: () => exportCustomersCSV(), icon: <Building2 className="w-6 h-6" />, title: 'Kunden als CSV', desc: `${customers.length} Kunden exportieren` },
              { onClick: () => exportAssignmentsHTML(), icon: <FileText className="w-6 h-6" />, title: 'Termine als HTML (PDF-ready)', desc: 'Drucken > Als PDF speichern' },
              { onClick: () => {
                if (!getFeatureFlag(company?.subscriptionPlan, 'datevExport')) { setShowUpgrade('datev'); return; }
                const rows = assignmentsToDatevRows(assignments, company?.companyName || company?.name || '', taxRate, skr, customers);
                const csv = generateDatevCSV(rows);
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = generateDatevFilename(datevInvoiceCount, skr); a.click();
                URL.revokeObjectURL(url);
              }, icon: <Coins className="w-6 h-6" />, title: `DATEV-Export (${skrLabel})`, desc: `${datevInvoiceCount} Rechnungen – 3 Buchungszeilen/Rechnung (Debitor/Erlös/USt) mit ${taxRate}% USt` },
            ].map((item, i) => (
              <div key={i} onClick={item.onClick} className={`${cardCls} `} style={{ animationDelay: `${i * 70}ms` }}>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-50 to-white border border-slate-200 flex items-center justify-center text-2xl shadow-sm group-hover:scale-110 transition-transform duration-300">
                    {item.icon}
                  </div>
                  <div>
                    <p className="text-slate-900 font-bold">{item.title}</p>
                    <p className="text-slate-400 text-sm mt-0.5">{item.desc}</p>
                  </div>
                </div>
              </div>
            ))}
            <div onClick={exportAllCSV}
              className="group bg-gradient-to-br from-teal-600 to-emerald-700 hover:from-teal-700 hover:to-emerald-800 rounded-2xl border border-teal-700 shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 p-6 cursor-pointer "
              style={{ animationDelay: '280ms' }}>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform duration-300">
                  <Package className="w-6 h-6 text-slate-500" />
                </div>
                <div>
                  <p className="text-white font-black text-lg">Alle Daten exportieren</p>
                  <p className="text-teal-100 text-sm font-medium">Termine + Mitarbeiter + Kunden (3 CSV-Dateien)</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <UpgradeModal
          open={showUpgrade === 'datev'}
          onClose={() => setShowUpgrade(null)}
          dismissable
          title="Nicht im Solo-Plan enthalten"
          description="Der DATEV-Export ist im Solo-Plan nicht enthalten. Upgrade auf Team oder Business, um diese Funktion zu nutzen."
          feature="datevExport"
        />
      </main>
    </div>
  );
}
