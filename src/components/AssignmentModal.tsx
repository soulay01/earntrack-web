'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import { useDirtyGuard } from '@/contexts/DirtyGuardContext';
import CalendarPopover from '@/components/CalendarPopover';
import { formatCurrency } from '@/lib/utils';
import { applyMarkup } from '@/lib/calculations';
import { getEstimateUmsatzSuggestion } from '@/lib/estimateSuggestion';
import { getGrade, getGradeColor, getGradeBg, analyzeRootCause } from '@/lib/smartPricing';
import { collection, addDoc, updateDoc, doc, getDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { Package, Plus, Minus, X, Search, Sparkles } from 'lucide-react';
import { suggestTeam, type TeamSuggestion } from '@/lib/teamOptimizer';
import { db } from '@/lib/firebase';
import { hasReachedLimit, getPlanLimit } from '@/lib/plans';
import { logUsage } from '@/lib/usageLog';
import CustomerModal from '@/components/CustomerModal';
import EmployeeModal from '@/components/EmployeeModal';
import ItemModal from '@/components/ItemModal';

export default function AssignmentModal({ editing, customers, employees, assignments, saving, initialDate, initialDraft, initialQuickAdd, user: userProp, companyId: companyIdProp, onSave, onClose, onBeforeClose }: any) {
  const [form, setForm] = useState({
    projekt: '',
    kunde: '',
    datum: '',
    umsatz: '',
    stunden: '',
    stundenlohn: '',
    anfahrtspauschale: '',
    mitarbeiter: [] as string[],
    status: 'Geplant',
  });
  const router = useRouter();
  const [linkedEstimate, setLinkedEstimate] = useState<any>(null);
  const [localCustomers, setLocalCustomers] = useState(customers || []);
  const [localEmployees, setLocalEmployees] = useState(employees || []);
  const [showCalendar, setShowCalendar] = useState(false);
  const [quickAddType, setQuickAddType] = useState<'customer' | 'employee' | 'inventory' | null>(null);
  const [quickSaving, setQuickSaving] = useState(false);

  // Lager-Material am Termin (Array `materialien`, gleiche Struktur wie Mobile-App):
  // unitPrice = VK inkl. Material-Aufschlag, costPrice = EK (Artikelpreis).
  const [materials, setMaterials] = useState<any[]>([]);
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [materialMarkupPercent, setMaterialMarkupPercent] = useState(0);
  const [defaultAnfahrtspauschale, setDefaultAnfahrtspauschale] = useState(0);
  const [defaultTravelRatePerKm, setDefaultTravelRatePerKm] = useState(0);
  // Anfahrtspauschale: fester Betrag ODER Kilometer × Satz. Bei "km" merkt sich die App
  // die gefahrene Strecke am Kunden (customer.entfernungKm) und füllt sie beim nächsten
  // Termin für denselben Kunden automatisch vor.
  const [anfahrtModus, setAnfahrtModus] = useState<'pauschal' | 'km'>('pauschal');
  const [formAnfahrtKm, setFormAnfahrtKm] = useState('');
  const [formAnfahrtRatePerKm, setFormAnfahrtRatePerKm] = useState('');
  const [showMaterialPicker, setShowMaterialPicker] = useState(false);
  const [materialSearch, setMaterialSearch] = useState('');

  // Marge-Rechner (wie Mobile): Wunschmarge auf die Arbeitskosten → Umsatz wird berechnet.
  const [margeMode, setMargeMode] = useState<'percent' | 'euro'>('percent');
  const [margeProzent, setMargeProzent] = useState('');
  const [margeEuro, setMargeEuro] = useState('');

  // Team-Vorschlag (TeamOptimizer, wie Mobile)
  const [teamSuggestion, setTeamSuggestion] = useState<TeamSuggestion | null>(null);
  const [suggestSize, setSuggestSize] = useState(2);

  const { companyId: ctxCompanyId, user: ctxUser, refresh, company, overheadPercent, suppliers } = useData();
  const companyId = companyIdProp || ctxCompanyId;
  const user = userProp || ctxUser;
  const { setDirty } = useDirtyGuard();

  const kundeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialQuickAdd) setQuickAddType(initialQuickAdd);
  }, [initialQuickAdd]);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const [itemsSnap, tplSnap] = await Promise.all([
          getDocs(query(collection(db, 'inventory_items'), where('companyId', '==', companyId))),
          getDoc(doc(db, 'companies', companyId, 'settings', 'invoice')),
        ]);
        if (cancelled) return;
        setInventoryItems(itemsSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '')));
        setMaterialMarkupPercent(parseFloat(String(tplSnap.data()?.materialMarkupPercent ?? '0').replace(',', '.')) || 0);
        setDefaultAnfahrtspauschale(parseFloat(String(tplSnap.data()?.defaultAnfahrtspauschale ?? '0').replace(',', '.')) || 0);
        setDefaultTravelRatePerKm(parseFloat(String(tplSnap.data()?.defaultTravelRatePerKm ?? '0').replace(',', '.')) || 0);
      } catch { /* Lager optional – ohne Artikel bleibt der Bereich leer */ }
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  useEffect(() => {
    if (!editing?.estimateId) { setLinkedEstimate(null); return; }
    getDoc(doc(db, 'estimates', editing.estimateId)).then(snap => {
      setLinkedEstimate(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    });
  }, [editing?.estimateId]);

  // Neuer (nicht bearbeiteter) Termin ohne Entwurf: Standard-Anfahrtspauschale vorbelegen,
  // sobald sie geladen ist. Pro Termin änderbar, überschreibt keine bestehenden Eingaben.
  useEffect(() => {
    if (editing || initialDraft || defaultAnfahrtspauschale <= 0) return;
    setForm(prev => prev.anfahrtspauschale ? prev : { ...prev, anfahrtspauschale: String(defaultAnfahrtspauschale) });
  }, [defaultAnfahrtspauschale, editing, initialDraft]);

  useEffect(() => {
    if (editing || initialDraft || defaultTravelRatePerKm <= 0) return;
    setFormAnfahrtRatePerKm(prev => prev || String(defaultTravelRatePerKm));
  }, [defaultTravelRatePerKm, editing, initialDraft]);

  // "Wow"-Detail der Pro-km-Anfahrtspauschale: Sobald ein Kunde ausgewählt ist, für den
  // schon einmal eine Strecke gespeichert wurde (customer.entfernungKm, siehe submit),
  // wird die Kilometerzahl automatisch vorbelegt. Nur bei neuen Terminen (nicht beim
  // Bearbeiten) und nur wenn das Feld noch leer ist (kein Überschreiben manueller Eingaben).
  useEffect(() => {
    if (editing || formAnfahrtKm.trim()) return;
    const match = localCustomers.find((c: any) => c.name === form.kunde);
    if (match?.entfernungKm > 0) setFormAnfahrtKm(String(match.entfernungKm));
  }, [form.kunde, localCustomers, editing]);

  useEffect(() => {
    if (editing) {
      setForm({
        projekt: editing.projekt || '',
        kunde: editing.kunde || '',
        datum: editing.datum || '',
        umsatz: editing.umsatz?.toString() || '',
        stunden: editing.stunden?.toString() || '',
        stundenlohn: editing.stundenlohn?.toString() || '',
        anfahrtspauschale: editing.anfahrtspauschale ? editing.anfahrtspauschale.toString() : '',
        mitarbeiter: Array.isArray(editing.mitarbeiter)
          ? editing.mitarbeiter
          : (editing.mitarbeiter || '').split(',').map((n: string) => n.trim()).filter(Boolean),
        status: editing.status || 'Geplant',
      });
      setAnfahrtModus(editing.anfahrtModus === 'km' ? 'km' : 'pauschal');
      setFormAnfahrtKm(editing.anfahrtKm ? String(editing.anfahrtKm) : '');
      setFormAnfahrtRatePerKm(editing.anfahrtRatePerKm ? String(editing.anfahrtRatePerKm) : '');
      setMaterials(Array.isArray(editing.materialien) ? editing.materialien : []);
      setDirty(false);
    } else if (initialDraft) {
      setForm({
        projekt: initialDraft.projekt || '',
        kunde: initialDraft.kunde || '',
        datum: initialDraft.datum || '',
        umsatz: initialDraft.umsatz || '',
        stunden: initialDraft.stunden || '',
        stundenlohn: initialDraft.stundenlohn || '',
        anfahrtspauschale: initialDraft.anfahrtspauschale || '',
        mitarbeiter: Array.isArray(initialDraft.mitarbeiter) ? initialDraft.mitarbeiter : [],
        status: initialDraft.status || 'Geplant',
      });
      setAnfahrtModus(initialDraft.anfahrtModus === 'km' ? 'km' : 'pauschal');
      setFormAnfahrtKm(initialDraft.anfahrtKm || '');
      setFormAnfahrtRatePerKm(initialDraft.anfahrtRatePerKm || '');
      setMaterials(Array.isArray(initialDraft.materials) ? initialDraft.materials : []);
      setMargeMode(initialDraft.margeMode || 'percent');
      setMargeProzent(initialDraft.margeProzent || '');
      setMargeEuro(initialDraft.margeEuro || '');
      setDirty(false);
    } else if (initialDate) {
      setForm(prev => ({ ...prev, datum: initialDate }));
      setDirty(false);
    }
  }, [editing, initialDate, initialDraft]);

  useEffect(() => { setLocalCustomers(customers || []); }, [customers]);
  useEffect(() => { setLocalEmployees(employees || []); }, [employees]);

  function update(field: string, value: any) { setDirty(true); setForm((prev: any) => ({ ...prev, [field]: value })); }

  const autoStundenlohn = useMemo(() => {
    return form.mitarbeiter.reduce((sum: number, name: string) => {
      const emp = localEmployees.find((e: any) => e.name === name || e.id === name);
      return sum + (parseFloat(emp?.stundenlohn) || 0);
    }, 0);
  }, [form.mitarbeiter, localEmployees]);

  useEffect(() => {
    update('stundenlohn', autoStundenlohn.toString());
    // Don't mark form dirty — this is an automatic calculation, not user input
    setDirty(false);
  }, [autoStundenlohn]);

  const teamSize = form.mitarbeiter.length;

  // Material: VK zählt zum Umsatz, EK zu den Kosten – der Aufschlag (VK−EK)
  // wirkt direkt im Gewinn; identisch zur Mobile-App und zu lib/calculations.
  const materialCost = materials.reduce((s, m) => s + (Number(m.qty) || 0) * (Number(m.costPrice != null ? m.costPrice : m.unitPrice) || 0), 0);
  const materialSum = materials.reduce((s, m) => s + (Number(m.qty) || 0) * (Number(m.unitPrice) || 0), 0);

  const hours = parseFloat(form.stunden) || 0;
  const rate = autoStundenlohn;
  const laborCost = hours * rate;

  // Marge auf die Arbeitskosten (wie Mobile): Umsatz = Kosten / (1 − Marge%).
  // Der gespeicherte Umsatz bleibt die reine Dienstleistung – Material addieren
  // Rechnung/ProfitScore selbst.
  const margeProzentNum = parseFloat(margeProzent.replace(',', '.')) || 0;
  const margeEuroNum = parseFloat(margeEuro.replace(',', '.')) || 0;
  const effectiveMargePercent = margeMode === 'percent' ? margeProzentNum : (laborCost > 0 ? (margeEuroNum / laborCost) * 100 : 0);
  const showMargeCalculation = effectiveMargePercent > 0 && effectiveMargePercent < 100 && laborCost > 0;
  const margeCalculatedRevenue = showMargeCalculation ? laborCost / (1 - effectiveMargePercent / 100) : 0;
  const serviceRevenue = showMargeCalculation ? margeCalculatedRevenue : (parseFloat(form.umsatz) || 0);
  const estimateSuggestion = editing ? getEstimateUmsatzSuggestion({ estimate: linkedEstimate, currentUmsatz: form.umsatz }) : null;

  const anfahrtKmNum = parseFloat(formAnfahrtKm.replace(',', '.')) || 0;
  const anfahrtRatePerKmNum = parseFloat(formAnfahrtRatePerKm.replace(',', '.')) || 0;
  const travelFee = anfahrtModus === 'km' ? (anfahrtKmNum * anfahrtRatePerKmNum) : (parseFloat(form.anfahrtspauschale.replace(',', '.')) || 0);
  const cost = laborCost + materialCost;
  const revenue = serviceRevenue + materialSum + travelFee;
  const profit = revenue - cost;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
  const grade = getGrade(margin);
  const rootCause = useMemo(() => {
    if (!form.umsatz && !form.stunden) return null;
    return analyzeRootCause(form, assignments || [], overheadPercent);
  }, [form, assignments, overheadPercent]);

  function getDraftData() {
    return {
      projekt: form.projekt,
      kunde: form.kunde,
      datum: form.datum,
      umsatz: form.umsatz,
      stunden: form.stunden,
      stundenlohn: form.stundenlohn,
      anfahrtspauschale: form.anfahrtspauschale,
      anfahrtModus,
      anfahrtKm: formAnfahrtKm,
      anfahrtRatePerKm: formAnfahrtRatePerKm,
      mitarbeiter: form.mitarbeiter,
      status: form.status,
      materials,
      margeMode,
      margeProzent,
      margeEuro,
      savedAt: Date.now(),
    };
  }

  function closeWithDraftSave() {
    if (!editing && onBeforeClose) {
      const hasData = form.projekt || form.kunde || form.datum;
      onBeforeClose(hasData ? getDraftData() : null);
    }
    setDirty(false);
    onClose();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.kunde) { alert('Bitte wähle einen Kunden aus.'); return; }
    if (!form.datum) { alert('Bitte wähle ein Datum.'); return; }
    try {
      await onSave({
        projekt: form.projekt,
        kunde: form.kunde,
        datum: form.datum,
        umsatz: showMargeCalculation ? margeCalculatedRevenue.toFixed(2) : (form.umsatz || '0'),
        stunden: form.stunden || '0',
        stundenlohn: autoStundenlohn.toFixed(2),
        anfahrtspauschale: travelFee,
        anfahrtModus,
        anfahrtKm: anfahrtModus === 'km' ? anfahrtKmNum : 0,
        anfahrtRatePerKm: anfahrtModus === 'km' ? anfahrtRatePerKmNum : 0,
        mitarbeiter: form.mitarbeiter,
        status: form.status,
        materialien: materials,
      });
      // Pro-km-Anfahrt: gefahrene Strecke am Kunden merken, damit sie beim nächsten Termin
      // für denselben Kunden automatisch vorbelegt ist (siehe Auto-Fill-Effekt oben).
      // Nicht blockierend – ein Fehlschlag hier darf das Speichern nicht verhindern.
      if (anfahrtModus === 'km' && anfahrtKmNum > 0) {
        const matched = localCustomers.find((c: any) => c.name === form.kunde.trim());
        if (matched && matched.entfernungKm !== anfahrtKmNum) {
          updateDoc(doc(db, 'customers', matched.id), { entfernungKm: anfahrtKmNum }).catch(() => {});
        }
      }
      if (!editing && onBeforeClose) onBeforeClose(null); // clear draft after save
      setDirty(false);
    } catch (e) { console.error('Assignment save failed:', e); }
  }

  function addMaterial(item: any) {
    setDirty(true);
    setMaterials(prev => {
      const i = prev.findIndex(m => m.itemId === item.id);
      if (i >= 0) return prev.map((m, idx) => idx === i ? { ...m, qty: (Number(m.qty) || 0) + 1 } : m);
      return [...prev, {
        itemId: item.id, name: item.name, qty: 1, unit: item.unit || 'Stk',
        unitPrice: applyMarkup(item.price || 0, materialMarkupPercent),
        costPrice: item.price || 0,
        addedAt: new Date().toISOString(), userId: user?.uid || '',
      }];
    });
    setShowMaterialPicker(false);
    setMaterialSearch('');
  }

  function setMaterialQty(idx: number, delta: number) {
    setDirty(true);
    setMaterials(prev => prev.map((m, i) => i === idx ? { ...m, qty: Math.max(1, (Number(m.qty) || 1) + delta) } : m));
  }

  function handleSuggestTeam(size = suggestSize) {
    setSuggestSize(size);
    const dateStr = form.datum || new Date().toLocaleDateString('de-DE');
    setTeamSuggestion(suggestTeam(localEmployees, dateStr, hours || 8, serviceRevenue, size, assignments || [], editing?.id));
  }

  function acceptSuggestion() {
    if (teamSuggestion && teamSuggestion.suggested.length > 0) {
      update('mitarbeiter', teamSuggestion.suggested.map((e: any) => e.name));
    }
    setTeamSuggestion(null);
  }

  async function handleQuickAddMaterial(data: any) {
    const name = (data.name || '').trim();
    if (!name || !companyId || !user) return;
    setQuickSaving(true);
    try {
      const quantity = data.quantity || 0;
      const price = data.price || 0;
      const unit = data.unit || 'Stk';
      const docData = { name, unit, quantity, price, companyId, createdAt: serverTimestamp() };
      const ref = await addDoc(collection(db, 'inventory_items'), docData);
      if (quantity > 0) {
        await addDoc(collection(db, 'inventory_movements'), {
          companyId, itemId: ref.id, itemName: name, delta: quantity, unit, unitPrice: price,
          reason: 'Anfangsbestand', userId: user.uid, userName: user.email || '', createdAt: serverTimestamp(),
        });
      }
      const newItem = { id: ref.id, ...docData };
      setInventoryItems(prev => [...prev, newItem].sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '')));
      addMaterial(newItem);
      setQuickAddType(null);
    } finally { setQuickSaving(false); }
  }

  const filteredInventory = useMemo(() => {
    const q = materialSearch.trim().toLowerCase();
    if (!q) return inventoryItems;
    return inventoryItems.filter((i: any) => (i.name || '').toLowerCase().includes(q) || (i.sku || '').toLowerCase().includes(q));
  }, [inventoryItems, materialSearch]);

  async function handleQuickAddCustomer(data: any) {
    const fullName = data.name || [data.vorname, data.nachname].filter(Boolean).join(' ').trim();
    if (!fullName || !companyId || !user) return;
    setQuickSaving(true);
    try {
      const docData = {
        name: fullName, vorname: data.vorname || '', nachname: data.nachname || '', email: data.email || '',
        telefon: data.telefon || '', adresse: data.adresse || '', notizen: data.notizen || '',
        imageUrl: data.imageUrl || '', companyId, createdBy: user.uid, createdAt: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, 'customers'), docData);
      const newC = { id: ref.id, ...docData };
      setLocalCustomers((prev: any[]) => prev.some((c: any) => c.id === ref.id) ? prev : [...prev, newC]);
      update('kunde', fullName);
      logUsage('customer_created');
      setQuickAddType(null);
      kundeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } finally { setQuickSaving(false); }
  }

  async function handleQuickAddEmployee(data: any) {
    const fullName = data.name || [data.vorname, data.nachname].filter(Boolean).join(' ').trim();
    const rate = parseFloat(data.stundenlohn);
    if (!fullName || !companyId || !user) return;
    if (!rate || rate <= 0) { alert('Bitte gib einen gültigen Stundenlohn ein.'); return; }
    // Mitarbeiter-Limit des Plans auch hier erzwingen (wie auf der Mitarbeiter-Seite)
    if (hasReachedLimit(company?.subscriptionPlan, 'employees', (employees || []).length)) {
      const limit = getPlanLimit(company?.subscriptionPlan, 'employees');
      alert(`Mitarbeiter-Limit erreicht. Dein Plan erlaubt maximal ${limit === Infinity ? 'unbegrenzt' : limit} Mitarbeiter. Bitte upgrade deinen Plan, um weitere anzulegen.`);
      return;
    }
    setQuickSaving(true);
    try {
      const docData = {
        name: fullName, vorname: data.vorname || '', nachname: data.nachname || '',
        berufsfeld: data.berufsfeld || '', email: data.email || '', telefon: data.telefon || '',
        stundenlohn: rate, imageUrl: data.imageUrl || '', companyId, createdBy: user.uid, createdAt: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, 'employees'), docData);
      const newE = { id: ref.id, ...docData };
      setLocalEmployees((prev: any[]) => prev.some((e: any) => e.id === ref.id) ? prev : [...prev, newE]);
      update('mitarbeiter', [...form.mitarbeiter, fullName]);
      logUsage('employee_created');
      setQuickAddType(null);
    } finally { setQuickSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[5vh] pb-8 bg-black/30 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg mx-4">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">{editing ? 'Termin bearbeiten' : 'Neuer Termin'}</h2>
          <button onClick={closeWithDraftSave} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 active:scale-[0.9] transition-all">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Projekt */}
            <div className="col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Projekt <span className="text-red-400">*</span></label>
              <input value={form.projekt} onChange={e => update('projekt', e.target.value)} required placeholder="z.B. Webentwicklung"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
            </div>

            {/* Kunde mit Kacheln */}
            <div className="col-span-2" ref={kundeRef}>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Kunde <span className="text-red-400">*</span></label>
              {localCustomers.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center">
                  <p className="text-sm text-slate-500 mb-3">Keine Kunden vorhanden</p>
                  <button type="button" onClick={() => setQuickAddType('customer')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-teal-600 bg-teal-50 border border-teal-200 hover:bg-teal-100 active:scale-[0.95] transition-all">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Ersten Kunden anlegen
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {localCustomers.map((c: any) => (
                    <button key={c.id} type="button" onClick={() => update('kunde', form.kunde === c.name ? '' : c.name)}
                      className={`px-3.5 py-2 rounded-xl text-sm font-semibold border transition-all active:scale-[0.95] flex items-center gap-2 ${
                        form.kunde === c.name
                          ? 'bg-teal-50 text-teal-700 border-teal-300 shadow-sm ring-1 ring-teal-300'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-100'
                      }`}>
                      {c.imageUrl?.startsWith('https://') || c.imageUrl?.startsWith('data:image/') ? (
                        <img src={c.imageUrl} alt="" className="w-6 h-6 rounded-lg object-cover shrink-0 shadow-sm" />
                      ) : (
                        <span className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                          style={{ backgroundColor: form.kunde === c.name ? '#0d9488' : '#94a3b8' }}>{c.name.charAt(0).toUpperCase()}</span>
                      )}
                      <span>{c.name}</span>
                      {form.kunde === c.name && (
                        <svg className="w-4 h-4 text-teal-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      )}
                    </button>
                  ))}
                  <button type="button" onClick={() => setQuickAddType('customer')}
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold border border-dashed border-slate-300 text-slate-400 hover:text-teal-600 hover:border-teal-300 hover:bg-teal-50 active:scale-[0.95] transition-all flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Neu
                  </button>
                </div>
              )}
            </div>

            {/* Datum & Status */}
            <div className="relative">
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Datum <span className="text-red-400">*</span></label>
              <button type="button" onClick={() => setShowCalendar(!showCalendar)}
                className="w-full flex items-center gap-2 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all hover:border-slate-300">
                <svg className="w-4 h-4 text-slate-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                <span className={form.datum ? 'text-slate-900 font-medium' : 'text-slate-400'}>{form.datum || 'Datum wählen'}</span>
              </button>
              {showCalendar && (
                <CalendarPopover value={form.datum} onChange={v => update('datum', v)} onClose={() => setShowCalendar(false)} />
              )}
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Status</label>
              <div className="flex gap-1 h-[42px] items-center">
                {['Geplant', 'In Bearbeitung', 'Abgeschlossen'].map(s => (
                  <button key={s} type="button" onClick={() => update('status', s)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all active:scale-[0.95] flex-1 ${
                      form.status === s
                        ? s === 'Geplant' ? 'bg-amber-100 text-amber-800 border border-amber-300 shadow-sm'
                          : s === 'In Bearbeitung' ? 'bg-blue-100 text-blue-800 border border-blue-300 shadow-sm'
                          : 'bg-green-100 text-green-800 border border-green-300 shadow-sm'
                        : 'bg-slate-50 text-slate-400 border border-slate-200 hover:border-slate-300'
                    }`}>
                    {s === 'In Bearbeitung' ? 'Laufend' : s}
                  </button>
                ))}
              </div>
            </div>

            {/* Umsatz & Stunden — Umsatz ist beim Erstellen bewusst nicht bekannt
                (erst nach Besichtigung/KV), daher nur im Bearbeiten-Modus sichtbar. */}
            {editing && (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Umsatz (€)</label>
                <input type="number" step="0.01" min="0" value={form.umsatz}
                  onChange={e => { setMargeProzent(''); setMargeEuro(''); update('umsatz', e.target.value); }}
                  placeholder={showMargeCalculation ? 'aus Marge berechnet' : '0,00'}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
                {estimateSuggestion !== null && (
                  <button type="button"
                    onClick={() => update('umsatz', estimateSuggestion.toFixed(2))}
                    className="mt-1.5 block text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-lg px-2.5 py-1 hover:bg-teal-100 transition-colors">
                    Vorschlag aus KV übernehmen: {formatCurrency(estimateSuggestion)}
                  </button>
                )}
                {!editing.estimateId && (
                  <button type="button"
                    onClick={() => router.push(`/estimates?assignmentId=${editing.id}&kunde=${encodeURIComponent(form.kunde)}&projekt=${encodeURIComponent(form.projekt)}`)}
                    className="mt-1.5 block text-xs font-semibold text-slate-500 hover:text-teal-600 underline">
                    Kostenvoranschlag erstellen
                  </button>
                )}
              </div>
            )}
            <div className={editing ? '' : 'col-span-2'}>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Stunden</label>
              <input type="number" step="0.5" min="0" value={form.stunden} onChange={e => update('stunden', e.target.value)} placeholder="0"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
            </div>
            <div className="col-span-2">
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-semibold text-slate-700">Anfahrtspauschale</label>
                <div className="flex gap-0.5 bg-slate-100 rounded-lg p-0.5">
                  <button type="button" onClick={() => setAnfahrtModus('pauschal')}
                    className={`px-3 py-1 rounded-md text-xs font-bold transition-colors ${anfahrtModus === 'pauschal' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                    Pauschal
                  </button>
                  <button type="button" onClick={() => setAnfahrtModus('km')}
                    className={`px-3 py-1 rounded-md text-xs font-bold transition-colors ${anfahrtModus === 'km' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                    Pro km
                  </button>
                </div>
              </div>
              {anfahrtModus === 'pauschal' ? (
                <input type="number" step="0.01" min="0" value={form.anfahrtspauschale}
                  onChange={e => update('anfahrtspauschale', e.target.value)} placeholder="0,00"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
              ) : (
                <>
                  <div className="flex gap-3">
                    <div className="flex-1 min-w-0">
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">Kilometer</label>
                      <input type="number" step="any" min="0" value={formAnfahrtKm} onChange={e => setFormAnfahrtKm(e.target.value)} placeholder="0"
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">Satz (€/km)</label>
                      <input type="number" step="0.01" min="0" value={formAnfahrtRatePerKm} onChange={e => setFormAnfahrtRatePerKm(e.target.value)} placeholder="0,42"
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
                    </div>
                  </div>
                  {anfahrtKmNum > 0 && anfahrtRatePerKmNum > 0 && (
                    <p className="text-xs text-slate-400 mt-1.5">
                      = {anfahrtKmNum.toLocaleString('de-DE')} km × {formatCurrency(anfahrtRatePerKmNum)} = {formatCurrency(travelFee)}
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Mitarbeiter mit Quick-Add */}
            <div className="col-span-2">
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-semibold text-slate-700">Mitarbeiter</label>
                {localEmployees.length > 1 && (
                  <button type="button" onClick={() => handleSuggestTeam()}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-violet-600 bg-violet-50 border border-violet-200 hover:bg-violet-100 active:scale-[0.95] transition-all">
                    <Sparkles className="w-3.5 h-3.5" />
                    Team vorschlagen
                  </button>
                )}
              </div>
              {teamSuggestion && (
                <div className="mb-2 p-3 bg-violet-50 border border-violet-200 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-violet-700">Team-Vorschlag</p>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-violet-400 font-medium mr-1">Größe:</span>
                      {[1, 2, 3, 4, 5].map(n => (
                        <button key={n} type="button" onClick={() => handleSuggestTeam(n)}
                          className={`w-6 h-6 rounded-md text-[11px] font-bold transition-colors ${
                            suggestSize === n ? 'bg-violet-600 text-white' : 'bg-white text-violet-500 border border-violet-200 hover:bg-violet-100'
                          }`}>
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                  {teamSuggestion.suggested.length > 0 ? (
                    <>
                      <div className="space-y-1 mb-2">
                        {teamSuggestion.suggested.map((emp: any) => (
                          <div key={emp.id} className="flex items-center justify-between px-2.5 py-1.5 bg-white border border-violet-100 rounded-lg">
                            <span className="text-xs font-semibold text-slate-800">{emp.name}</span>
                            <span className="text-[11px] text-slate-400 tabular-nums">{(parseFloat(emp.stundenlohn) || 0).toFixed(2)} €/h · {formatCurrency((parseFloat(emp.stundenlohn) || 0) * (hours || 8))}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center justify-between text-[11px] font-medium mb-2">
                        <span className="text-slate-500">Kosten: {formatCurrency(teamSuggestion.totalCost)}</span>
                        <span className={teamSuggestion.estimatedProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                          Gewinn: {formatCurrency(teamSuggestion.estimatedProfit)}
                        </span>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-slate-500 mb-2">Keine verfügbaren Mitarbeiter an diesem Datum.</p>
                  )}
                  {teamSuggestion.message && (
                    <p className="text-[11px] text-amber-600 mb-2">{teamSuggestion.message}</p>
                  )}
                  <div className="flex gap-2">
                    {teamSuggestion.suggested.length > 0 && (
                      <button type="button" onClick={acceptSuggestion}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-600 hover:bg-violet-700 text-white active:scale-[0.95] transition-all">
                        Übernehmen
                      </button>
                    )}
                    <button type="button" onClick={() => setTeamSuggestion(null)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-100 active:scale-[0.95] transition-all">
                      Schließen
                    </button>
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-1.5">
                {localEmployees.map((e: any) => {
                  const sel = form.mitarbeiter.includes(e.name);
                  return (
                    <button key={e.id} type="button" onClick={() => update('mitarbeiter', sel ? form.mitarbeiter.filter((n: string) => n !== e.name) : [...form.mitarbeiter, e.name])}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all active:scale-[0.95] flex items-center gap-1.5 ${
                        sel ? 'bg-teal-50 text-teal-700 border-teal-200 shadow-sm' : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'
                      }`}>
                      {e.imageUrl?.startsWith('https://') || e.imageUrl?.startsWith('data:image/') ? (
                        <img src={e.imageUrl} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
                      ) : (
                        <span className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                          style={{ backgroundColor: sel ? '#0d9488' : '#94a3b8' }}>{e.name.charAt(0).toUpperCase()}</span>
                      )}
                      {e.name}
                      <span className="text-[10px] opacity-60">{parseFloat(e.stundenlohn || 0).toFixed(0)}€/h</span>
                    </button>
                  );
                })}
                <button type="button" onClick={() => setQuickAddType('employee')}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-dashed border-slate-300 text-slate-400 hover:text-teal-600 hover:border-teal-300 hover:bg-teal-50 active:scale-[0.95] transition-all flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Mitarbeiter
                </button>
                {localEmployees.length === 0 && (
                  <p className="text-xs text-slate-400 w-full">Keine Mitarbeiter vorhanden</p>
                )}
              </div>
            </div>

            {/* Stundenlohn (Auto) & Team-Größe */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Stundenlohn (€)</label>
              <div className="w-full px-3.5 py-2.5 bg-teal-50 border border-teal-200 rounded-xl text-sm text-teal-800 font-bold flex items-center gap-2">
                <span>{autoStundenlohn.toFixed(2)} €/h</span>
                {form.mitarbeiter.length > 1 && <span className="text-[10px] text-teal-500 font-normal">(∑ {form.mitarbeiter.length} MA)</span>}
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Team-Größe</label>
              <div className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 font-semibold flex items-center gap-2">
                <span>{teamSize}</span>
                <span className="text-slate-400 font-normal text-xs">Mitarbeiter</span>
              </div>
            </div>

            {/* Materialien aus dem Lager (wie Mobile-Termin-Formular) */}
            <div className="col-span-2">
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-semibold text-slate-700">Materialien (Lager)</label>
                <button type="button" onClick={() => setQuickAddType('inventory')}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-teal-600 bg-teal-50 border border-teal-200 hover:bg-teal-100 active:scale-[0.95] transition-all">
                  <Plus className="w-3.5 h-3.5" />
                  Neues Material
                </button>
              </div>
              {materials.length === 0 && inventoryItems.length === 0 && (
                <p className="text-xs text-slate-400 mb-1.5">Noch kein Material im Lager – lege oben schnell eins an.</p>
              )}
              {materials.map((m: any, idx: number) => (
                <div key={`${m.itemId}-${idx}`} className="flex items-center gap-2 px-3 py-2 mb-1.5 bg-slate-50 border border-slate-200 rounded-xl">
                  <Package className="w-4 h-4 text-slate-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800 truncate">{m.name || 'Material'}</p>
                    <p className="text-[11px] text-slate-400">{formatCurrency(Number(m.unitPrice) || 0)} / {m.unit || 'Stk'}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => setMaterialQty(idx, -1)}
                      className="w-7 h-7 rounded-lg bg-white border border-slate-200 text-slate-500 hover:border-slate-300 active:scale-[0.9] transition-all flex items-center justify-center">
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-8 text-center text-sm font-bold text-slate-800 tabular-nums">{m.qty}</span>
                    <button type="button" onClick={() => setMaterialQty(idx, 1)}
                      className="w-7 h-7 rounded-lg bg-white border border-slate-200 text-slate-500 hover:border-slate-300 active:scale-[0.9] transition-all flex items-center justify-center">
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <span className="w-20 text-right text-sm font-semibold text-slate-700 tabular-nums">{formatCurrency((Number(m.qty) || 0) * (Number(m.unitPrice) || 0))}</span>
                  <button type="button" onClick={() => { setDirty(true); setMaterials(prev => prev.filter((_, i) => i !== idx)); }}
                    className="p-1 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {materials.length > 0 && (
                <p className="text-xs font-semibold text-slate-500 mb-1.5 text-right">Material-Kosten: -{formatCurrency(materialCost)}</p>
              )}
              {materials.length > 0 && !materialMarkupPercent && (
                <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mb-1.5">
                  Kein Material-Aufschlag eingestellt – auf der Rechnung wird dem Kunden nur der Einkaufspreis berechnet.{' '}
                  <a href="/settings/invoice-template" className="underline font-semibold">In den Rechnungseinstellungen festlegen →</a>
                </p>
              )}
              {showMaterialPicker ? (
                <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl">
                  <div className="relative mb-2">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-teal-400" />
                    <input autoFocus value={materialSearch} onChange={e => setMaterialSearch(e.target.value)} placeholder="Artikel suchen …"
                      className="w-full pl-8 pr-3 py-2 bg-white border border-teal-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
                  </div>
                  <div className="max-h-44 overflow-y-auto space-y-1">
                    {filteredInventory.map((item: any) => (
                      <button key={item.id} type="button" onClick={() => addMaterial(item)}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-white border border-teal-100 rounded-lg text-left hover:border-teal-300 active:scale-[0.99] transition-all">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-800 truncate">{item.name}</p>
                          <p className="text-[10px] text-slate-400">Bestand: {item.quantity ?? 0} {item.unit || 'Stk'}</p>
                        </div>
                        <span className="text-xs font-semibold text-teal-700 tabular-nums shrink-0">{formatCurrency(applyMarkup(item.price || 0, materialMarkupPercent))}</span>
                      </button>
                    ))}
                    {filteredInventory.length === 0 && (
                      <p className="text-xs text-slate-400 text-center py-3">{inventoryItems.length === 0 ? 'Keine Lager-Artikel vorhanden' : 'Keine Treffer'}</p>
                    )}
                  </div>
                  <button type="button" onClick={() => { setShowMaterialPicker(false); setMaterialSearch(''); }}
                    className="mt-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-100 active:scale-[0.95] transition-all">
                    Abbrechen
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setShowMaterialPicker(true)}
                  className="w-full px-3.5 py-2 rounded-xl text-xs font-semibold border border-dashed border-slate-300 text-slate-400 hover:text-teal-600 hover:border-teal-300 hover:bg-teal-50 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" />
                  Material aus Lager hinzufügen
                </button>
              )}
            </div>

            {/* Marge-Rechner (wie Mobile): Wunschmarge → Umsatz wird berechnet */}
            {editing && (
            <div className="col-span-2">
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-semibold text-slate-700">Gewünschte Marge</label>
                <div className="flex gap-0.5 bg-slate-100 rounded-lg p-0.5">
                  <button type="button" onClick={() => { setMargeMode('percent'); setMargeEuro(''); }}
                    className={`px-3 py-1 rounded-md text-xs font-bold transition-colors ${margeMode === 'percent' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                    %
                  </button>
                  <button type="button" onClick={() => { setMargeMode('euro'); setMargeProzent(''); }}
                    className={`px-3 py-1 rounded-md text-xs font-bold transition-colors ${margeMode === 'euro' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                    €
                  </button>
                </div>
              </div>
              <div className="flex gap-3">
                <input type="number" step="0.01" min="0"
                  value={margeMode === 'percent' ? margeProzent : margeEuro}
                  onChange={e => {
                    if (margeMode === 'percent') setMargeProzent(e.target.value);
                    else setMargeEuro(e.target.value);
                    update('umsatz', '');
                  }}
                  placeholder={margeMode === 'percent' ? 'z.B. 30' : 'z.B. 500'}
                  className="flex-1 min-w-0 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all" />
                {showMargeCalculation && (
                  <div className="flex-1 min-w-0 px-3.5 py-2 bg-violet-50 border border-violet-200 rounded-xl">
                    <p className="text-[10px] font-semibold text-violet-500 uppercase tracking-wider">Ergebnis</p>
                    <p className="text-xs font-bold text-slate-800 truncate">
                      Umsatz: {formatCurrency(margeCalculatedRevenue + materialSum + travelFee)}
                      {(materialSum > 0 || travelFee > 0) ? ` (Dienstleistung ${formatCurrency(margeCalculatedRevenue)}${materialSum > 0 ? ` + Material ${formatCurrency(materialSum)}` : ''}${travelFee > 0 ? ` + Anfahrt ${formatCurrency(travelFee)}` : ''})` : ''}
                    </p>
                    <p className={`text-xs font-bold ${profit >= 0 ? 'text-emerald-600' : 'text-rose-700'}`}>Gewinn: {formatCurrency(profit)}</p>
                  </div>
                )}
              </div>
              {showMargeCalculation && (
                <p className="text-[11px] text-slate-400 mt-1">Der berechnete Umsatz wird beim Speichern übernommen.</p>
              )}
              {!showMargeCalculation && (margeProzent || margeEuro) && laborCost === 0 && (
                <p className="text-[11px] text-amber-600 mt-1">Erst Stunden und Mitarbeiter angeben – die Marge wird auf die Arbeitskosten gerechnet.</p>
              )}
            </div>
            )}
          </div>

          {/* Vorkalkulation / Smart Pricing */}
          {hours > 0 || revenue > 0 ? (
            <div className="border-t border-slate-100 pt-4 mt-2">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Vorab-Kalkulation</span>
                <span className="flex-1 border-t border-slate-100" />
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-extrabold border"
                  style={{ color: getGradeColor(grade), backgroundColor: getGradeBg(grade), borderColor: getGradeColor(grade) + '33' }}>
                  {grade}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-50 rounded-xl px-3.5 py-2.5 border border-slate-100">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Kosten</p>
                  <p className="text-sm font-bold text-slate-800">{hours.toFixed(1)}h × {rate.toFixed(2)}€{materialCost > 0 ? ' + Material' : ''} = {formatCurrency(cost)}</p>
                </div>
                <div className="bg-slate-50 rounded-xl px-3.5 py-2.5 border border-slate-100">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Umsatz</p>
                  <p className="text-sm font-bold text-slate-800">{formatCurrency(revenue)}</p>
                </div>
                <div className="bg-slate-50 rounded-xl px-3.5 py-2.5 border border-slate-100">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{profit >= 0 ? 'Gewinn' : 'Verlust'}</p>
                  <p className={`text-sm font-extrabold ${profit >= 0 ? 'text-emerald-600' : 'text-rose-700'}`}>
                    {formatCurrency(profit)}
                  </p>
                </div>
                <div className="bg-slate-50 rounded-xl px-3.5 py-2.5 border border-slate-100">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Marge</p>
                  <p className={`text-sm font-extrabold ${margin >= 0 ? 'text-emerald-600' : 'text-rose-700'}`}>
                    {margin.toFixed(1)}%
                  </p>
                </div>
              </div>
              {/* Smart Pricing Insight */}
              {revenue > 0 && hours === 0 ? (
                <div className="mt-2 bg-blue-50 border border-blue-200 rounded-xl px-3.5 py-2">
                  <div className="flex items-center gap-2 mb-1">
                    <svg className="w-4 h-4 text-blue-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                    <p className="text-xs text-blue-700 font-semibold">Umsatz erfasst – Stunden fehlen für Marge</p>
                  </div>
                  {(rootCause?.suggestions?.length ?? 0) > 0 && (
                    <ul className="space-y-0.5">
                      {rootCause!.suggestions!.map((s: string, i: number) => (
                        <li key={i} className="text-[11px] text-blue-600 flex items-start gap-1.5">
                          <span className="mt-0.5">•</span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {(rootCause?.requiredPrice ?? 0) > revenue && (
                    <p className="text-[11px] text-blue-600 mt-1 font-medium">
                      Bei Ø-Dauer: {formatCurrency(rootCause!.requiredPrice!)} nötig für 20% Marge
                    </p>
                  )}
                </div>
              ) : revenue > 0 && profit >= 0 && margin >= 20 ? (
                <div className="mt-2 bg-green-50 border border-green-200 rounded-xl px-3.5 py-2 flex items-center gap-2">
                  <svg className="w-4 h-4 text-green-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                  <p className="text-xs text-green-700 font-semibold">Gesunder Termin mit {margin.toFixed(1)}% Marge ({grade}-Bewertung)</p>
                </div>
              ) : revenue > 0 && profit >= 0 && margin < 20 && margin >= 10 ? (
                <div className="mt-2 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2">
                  <div className="flex items-center gap-2 mb-1">
                    <svg className="w-4 h-4 text-amber-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    <p className="text-xs text-amber-700 font-semibold">Marge ausbaufähig ({grade})</p>
                  </div>
                  {(rootCause?.suggestions?.length ?? 0) > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {rootCause!.suggestions!.map((s: string, i: number) => (
                        <li key={i} className="text-[11px] text-amber-600 flex items-start gap-1.5">
                          <span className="mt-0.5">•</span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {(rootCause?.requiredPrice ?? 0) > revenue && (
                    <p className="text-[11px] text-amber-600 mt-1 font-medium">
                      Empfohlener Preis für 20% Marge: {formatCurrency(rootCause!.requiredPrice!)}
                    </p>
                  )}
                </div>
              ) : revenue > 0 && profit >= 0 && margin < 10 ? (
                <div className="mt-2 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2">
                  <div className="flex items-center gap-2 mb-1">
                    <svg className="w-4 h-4 text-rose-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                    <p className="text-xs text-rose-700 font-semibold">Niedrige Marge ({grade}) – fast kein Gewinn</p>
                  </div>
                  {(rootCause?.suggestions?.length ?? 0) > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {rootCause!.suggestions!.map((s: string, i: number) => (
                        <li key={i} className="text-[11px] text-rose-600 flex items-start gap-1.5">
                          <span className="mt-0.5">•</span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {(rootCause?.requiredPrice ?? 0) > revenue && (
                    <p className="text-[11px] text-rose-600 mt-1 font-medium">
                      Empfohlener Preis für 20% Marge: {formatCurrency(rootCause!.requiredPrice!)}
                    </p>
                  )}
                </div>
              ) : revenue > 0 && profit < 0 && (
                <div className="mt-2 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2">
                  <div className="flex items-center gap-2 mb-1">
                    <svg className="w-4 h-4 text-red-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                    <p className="text-xs text-red-700 font-semibold">Verlust – Kosten übersteigen Umsatz ({grade})</p>
                  </div>
                  {(rootCause?.reasons?.length ?? 0) > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {rootCause!.reasons!.map((r: string, i: number) => (
                        <li key={i} className="text-[11px] text-red-600 flex items-start gap-1.5">
                          <span className="mt-0.5">•</span>
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {(rootCause?.suggestions?.length ?? 0) > 0 && (
                    <div className="mt-2 pt-2 border-t border-red-100">
                      <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wider mb-1">Empfehlungen</p>
                      <ul className="space-y-0.5">
                        {rootCause!.suggestions!.map((s: string, i: number) => (
                          <li key={i} className="text-[11px] text-red-600 flex items-start gap-1.5">
                            <span className="mt-0.5">•</span>
                            <span>{s}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {(rootCause?.requiredPrice ?? 0) > revenue && (
                    <p className="text-[11px] text-red-600 mt-2 pt-2 border-t border-red-100 font-medium">
                      Nötiger Preis für 20% Marge: {formatCurrency(rootCause!.requiredPrice!)}
                    </p>
                  )}
                </div>
              )}
              {revenue === 0 && hours === 0 && (
                <div className="mt-2 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 flex items-center gap-2">
                  <svg className="w-4 h-4 text-slate-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                  <p className="text-xs text-slate-500 font-semibold">Daten eingeben für Kalkulation</p>
                </div>
              )}
            </div>
          ) : null}

          {/* Footer */}
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button type="button" onClick={closeWithDraftSave}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 active:scale-[0.97] transition-all">
              Abbrechen
            </button>
            <button type="submit" disabled={saving}
              className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 hover:shadow-lg active:scale-[0.97] disabled:opacity-50 text-white font-bold rounded-xl transition-all text-sm shadow-md flex items-center gap-2">
              {saving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {editing ? 'Änderungen speichern' : 'Termin anlegen'}
            </button>
          </div>
        </form>
      </div>

      {quickAddType === 'customer' && (
        <CustomerModal editing={null} saving={quickSaving} onSave={handleQuickAddCustomer} onClose={() => setQuickAddType(null)} user={user} companyId={companyId} />
      )}
      {quickAddType === 'employee' && (
        <EmployeeModal editing={null} saving={quickSaving} onSave={handleQuickAddEmployee} onClose={() => setQuickAddType(null)} user={user} companyId={companyId} />
      )}
      {quickAddType === 'inventory' && (
        <ItemModal editing={null} saving={quickSaving} suppliers={suppliers} onSave={handleQuickAddMaterial} onClose={() => setQuickAddType(null)} />
      )}
    </div>
  );
}
