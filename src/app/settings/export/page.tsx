'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { formatCurrency } from '@/lib/utils';

export default function ExportPage() {
  const { user, loading, companyId, assignments, employees, customers } = useData();
  const router = useRouter();

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [user, loading, router]);
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
      const rev = typeof a.umsatz === 'number' ? a.umsatz : (parseFloat(String(a.umsatz).replace(/[€\s.,]/g, '').replace(',', '.')) || 0);
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
      const rev = typeof a.umsatz === 'number' ? a.umsatz : (parseFloat(String(a.umsatz).replace(/[€\s.,]/g, '').replace(',', '.')) || 0);
      const h = parseFloat(String(a.stunden)) || 0; const rate = parseFloat(String(a.stundenlohn)) || 0;
      const cost = h * rate; const profit = rev - cost;
      return `<tr><td>${a.projekt || '-'}</td><td>${a.kunde || '-'}</td><td>${a.datum || '-'}</td><td>${h.toFixed(1)}</td><td>€${rate.toFixed(2)}</td><td>${formatCurrency(rev)}</td><td>${formatCurrency(cost)}</td><td style="color:${profit >= 0 ? '#16a34a' : '#dc2626'};font-weight:700">${formatCurrency(profit)}</td></tr>`;
    }).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>EarnTrack Export</title><style>body{font-family:Arial,sans-serif;padding:20px;color:#333}table{width:100%;border-collapse:collapse;font-size:12px}th{background:#0d9488;color:#fff;padding:8px;text-align:left}td{padding:6px 8px;border-bottom:1px solid #eee}tr:hover{background:#f1f5f9}h1{color:#0f172a;margin-bottom:20px}</style></head><body><h1>Einsatz-Export EarnTrack</h1><p>Erstellt am: ${new Date().toLocaleDateString('de-DE')} | ${assignments.length} Einsätze</p><table><thead><tr><th>Projekt</th><th>Kunde</th><th>Datum</th><th>Stunden</th><th>Stundenlohn</th><th>Umsatz</th><th>Kosten</th><th>Gewinn</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `EarnTrack_Export_${new Date().toISOString().split('T')[0]}.html`; a.click();
    URL.revokeObjectURL(url);
  }

  const cardCls = 'group bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 p-6 cursor-pointer';

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="px-8 py-8 max-w-2xl mx-auto">
          <div className="mb-6 animate-fadeIn">
            <a href="/settings" className="text-sm text-teal-600 hover:text-teal-700 font-semibold mb-2 inline-block hover:underline">&larr; Zurück zu Einstellungen</a>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Datencxport</h1>
            <p className="text-slate-500 text-sm mt-1">Exportiere deine Daten als CSV oder HTML</p>
          </div>

          <div className="space-y-4 animate-slideUp">
            {[
              { onClick: exportAssignmentsCSV, icon: '📊', title: 'Einsätze als CSV', desc: `${assignments.length} Einsätze exportieren` },
              { onClick: exportEmployeesCSV, icon: '👥', title: 'Mitarbeiter als CSV', desc: `${employees.length} Mitarbeiter exportieren` },
              { onClick: exportCustomersCSV, icon: '🏢', title: 'Kunden als CSV', desc: `${customers.length} Kunden exportieren` },
              { onClick: exportAssignmentsHTML, icon: '📄', title: 'Einsätze als HTML (PDF-ready)', desc: 'Drucken > Als PDF speichern' },
            ].map((item, i) => (
              <div key={i} onClick={item.onClick} className={`${cardCls} animate-slideUp`} style={{ animationDelay: `${i * 70}ms` }}>
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
              className="group bg-gradient-to-br from-teal-600 to-emerald-700 hover:from-teal-700 hover:to-emerald-800 rounded-2xl border border-teal-700 shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 p-6 cursor-pointer animate-slideUp"
              style={{ animationDelay: '280ms' }}>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform duration-300">
                  📦
                </div>
                <div>
                  <p className="text-white font-black text-lg">Alle Daten exportieren</p>
                  <p className="text-teal-100 text-sm font-medium">Einsätze + Mitarbeiter + Kunden (3 CSV-Dateien)</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
