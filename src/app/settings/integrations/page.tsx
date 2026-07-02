'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/app/Provider';
import Sidebar from '@/components/Sidebar';
import PageSkeleton from '@/components/skeletons/PageSkeleton';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { CheckCircle, XCircle, ArrowLeft, Loader2, Eye, EyeOff, Trash2 } from 'lucide-react';

type Status = 'ok' | 'error' | 'idle';

interface IntegrationCardProps {
  title: string;
  hint: string;
  gradient: string;
  apiKey: string;
  setApiKey: (v: string) => void;
  status: Status;
  errorMsg: string;
  testing: boolean;
  onTest: () => void;
  onRemove: () => void;
  hasStoredKey: boolean;
  placeholder: string;
}

function IntegrationCard({ title, hint, gradient, apiKey, setApiKey, status, errorMsg, testing, onTest, onRemove, hasStoredKey, placeholder }: IntegrationCardProps) {
  const [show, setShow] = useState(false);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className={`px-6 py-4 border-b border-slate-100 bg-gradient-to-r ${gradient} flex items-center justify-between`}>
        <div>
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          <p className="text-xs text-slate-500 mt-0.5">Rechnungen als Entwurf übertragen · automatisch bei "Gesendet"</p>
        </div>
        <div className="flex items-center gap-2">
          {status === 'ok' && <span className="flex items-center gap-1 text-xs text-green-600 font-bold"><CheckCircle className="w-4 h-4" /> Verbunden</span>}
          {status === 'error' && <span className="flex items-center gap-1 text-xs text-red-500 font-bold"><XCircle className="w-4 h-4" /> Fehler</span>}
          {hasStoredKey && status === 'idle' && <span className="flex items-center gap-1 text-xs text-teal-600 font-bold"><CheckCircle className="w-4 h-4" /> Aktiv</span>}
        </div>
      </div>
      <div className="p-6 space-y-3">
        <label className="block text-sm font-bold text-slate-700">API-Key</label>
        <p className="text-xs text-slate-400">{hint}</p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type={show ? 'text' : 'password'}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder={hasStoredKey ? '●●●●●●●● (gespeichert — neu eingeben zum Ändern)' : placeholder}
              className="w-full px-3.5 py-2.5 pr-10 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100/50 transition-all shadow-sm font-mono"
            />
            <button type="button" onClick={() => setShow(s => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <button onClick={onTest} disabled={testing || (!apiKey.trim() && !hasStoredKey)}
            className="px-4 py-2.5 text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all disabled:opacity-40 shrink-0 flex items-center gap-1.5">
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Testen'}
          </button>
          {hasStoredKey && (
            <button onClick={onRemove} title="Integration entfernen"
              className="p-2.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all border border-slate-200">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
        {status === 'error' && <p className="text-xs text-red-500">{errorMsg}</p>}
        {status === 'ok' && <p className="text-xs text-green-600">Verbindung erfolgreich ✓ — Key wird gespeichert.</p>}
      </div>
    </div>
  );
}

export default function IntegrationsPage() {
  const { user, loading, companyId, refresh } = useData();
  const router = useRouter();

  const [lexofficeKey, setLexofficeKey] = useState('');
  const [sevdeskKey, setSevdeskKey] = useState('');
  const [hasLexoffice, setHasLexoffice] = useState(false);
  const [hasSevdesk, setHasSevdesk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [testingLexoffice, setTestingLexoffice] = useState(false);
  const [testingSevdesk, setTestingSevdesk] = useState(false);
  const [lexofficeStatus, setLexofficeStatus] = useState<Status>('idle');
  const [sevdeskStatus, setSevdeskStatus] = useState<Status>('idle');
  const [lexofficeError, setLexofficeError] = useState('');
  const [sevdeskError, setSevdeskError] = useState('');

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [user, loading, router]);

  useEffect(() => {
    if (!companyId) return;
    getDoc(doc(db, 'companies', companyId, 'private', 'integrations')).then(snap => {
      if (snap.exists()) {
        setHasLexoffice(!!snap.data()?.lexofficeApiKey);
        setHasSevdesk(!!snap.data()?.sevdeskApiKey);
      }
    }).catch(() => {});
  }, [companyId]);

  if (loading || !user) return <PageSkeleton variant="cards" maxWidth="max-w-2xl" />;

  async function testLexoffice() {
    const keyToTest = lexofficeKey.trim();
    setTestingLexoffice(true);
    setLexofficeStatus('idle');
    try {
      const idToken = await user!.getIdToken();
      const res = await fetch('/api/integrations/lexoffice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ action: 'test', keyOverride: keyToTest || undefined }),
      });
      const data = await res.json();
      if (data.ok) {
        setLexofficeStatus('ok');
        if (keyToTest) await saveKey('lexoffice', keyToTest);
      } else {
        setLexofficeStatus('error');
        setLexofficeError(data.error || 'Verbindung fehlgeschlagen');
      }
    } catch (e: any) {
      setLexofficeStatus('error');
      setLexofficeError(e.message);
    } finally {
      setTestingLexoffice(false);
    }
  }

  async function testSevdesk() {
    const keyToTest = sevdeskKey.trim();
    setTestingSevdesk(true);
    setSevdeskStatus('idle');
    try {
      const idToken = await user!.getIdToken();
      const res = await fetch('/api/integrations/sevdesk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ action: 'test', keyOverride: keyToTest || undefined }),
      });
      const data = await res.json();
      if (data.ok) {
        setSevdeskStatus('ok');
        if (keyToTest) await saveKey('sevdesk', keyToTest);
      } else {
        setSevdeskStatus('error');
        setSevdeskError(data.error || 'Verbindung fehlgeschlagen');
      }
    } catch (e: any) {
      setSevdeskStatus('error');
      setSevdeskError(e.message);
    } finally {
      setTestingSevdesk(false);
    }
  }

  async function saveKey(provider: 'lexoffice' | 'sevdesk', key: string) {
    if (!companyId) return;
    const secretsRef = doc(db, 'companies', companyId, 'private', 'integrations');
    await setDoc(secretsRef, { [`${provider}ApiKey`]: key }, { merge: true });
    const flag = provider === 'lexoffice' ? { 'integrations.lexoffice': true } : { 'integrations.sevdesk': true };
    await updateDoc(doc(db, 'companies', companyId), flag);
    if (provider === 'lexoffice') { setHasLexoffice(true); setLexofficeKey(''); }
    else { setHasSevdesk(true); setSevdeskKey(''); }
    await refresh();
  }

  async function removeKey(provider: 'lexoffice' | 'sevdesk') {
    if (!companyId || !confirm(`${provider === 'lexoffice' ? 'Lexoffice' : 'SevDesk'}-Integration entfernen?`)) return;
    setSaving(true);
    try {
      const secretsRef = doc(db, 'companies', companyId, 'private', 'integrations');
      await setDoc(secretsRef, { [`${provider}ApiKey`]: '' }, { merge: true });
      const flag = provider === 'lexoffice' ? { 'integrations.lexoffice': false } : { 'integrations.sevdesk': false };
      await updateDoc(doc(db, 'companies', companyId), flag);
      if (provider === 'lexoffice') { setHasLexoffice(false); setLexofficeStatus('idle'); }
      else { setHasSevdesk(false); setSevdeskStatus('idle'); }
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="px-4 md:px-8 py-4 md:py-8 max-w-2xl mx-auto space-y-6">

          <div className="flex items-center gap-3 mb-2">
            <button onClick={() => router.push('/settings')}
              className="p-2 rounded-xl hover:bg-slate-200 transition-all text-slate-500">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl md:text-3xl font-bold text-slate-900 tracking-tight">Integrationen</h1>
              <p className="text-slate-500 text-sm mt-0.5">Buchhaltungssoftware verknüpfen</p>
            </div>
          </div>

          <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4 text-sm text-teal-800">
            <p className="font-bold mb-1">So funktioniert es</p>
            <ul className="space-y-0.5 text-xs text-teal-700 list-disc list-inside">
              <li>API-Key eingeben → <strong>Testen</strong> → wird sofort sicher gespeichert</li>
              <li>Rechnungen werden <strong>automatisch</strong> als Entwurf übertragen, sobald du sie als "Gesendet" markierst</li>
              <li>Du kannst Rechnungen auch jederzeit manuell auf der Rechnungsseite pushen</li>
            </ul>
          </div>

          <IntegrationCard
            title="Lexware Office"
            hint="Einstellungen → Erweiterungen → API suchen → Verwalten drücken"
            gradient="from-blue-50 to-indigo-50"
            apiKey={lexofficeKey}
            setApiKey={v => { setLexofficeKey(v); setLexofficeStatus('idle'); }}
            status={lexofficeStatus}
            errorMsg={lexofficeError}
            testing={testingLexoffice}
            onTest={testLexoffice}
            onRemove={() => removeKey('lexoffice')}
            hasStoredKey={hasLexoffice}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          />

          <IntegrationCard
            title="SevDesk"
            hint="Erweiterungen → API"
            gradient="from-orange-50 to-amber-50"
            apiKey={sevdeskKey}
            setApiKey={v => { setSevdeskKey(v); setSevdeskStatus('idle'); }}
            status={sevdeskStatus}
            errorMsg={sevdeskError}
            testing={testingSevdesk}
            onTest={testSevdesk}
            onRemove={() => removeKey('sevdesk')}
            hasStoredKey={hasSevdesk}
            placeholder="Dein SevDesk API-Token"
          />

          <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Sicherheit</p>
            <p className="text-xs text-slate-500 leading-relaxed">
              API-Keys werden in einer <strong>privaten Subkollektion</strong> gespeichert — nur du als Inhaber kannst sie lesen.
              Mitarbeiter haben keinen Zugriff. Die Schlüssel verlassen EarnTrack nur für die direkte Verbindung zur jeweiligen Software.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
