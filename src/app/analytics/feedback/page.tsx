'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { useData } from '@/app/Provider';
import { useIsAdmin } from '@/lib/useIsAdmin';

/* ─── Reusable UI from analytics ─── */
function FullLoading() {
  return (
    <div className="flex h-screen items-center justify-center bg-[#0A0F0D]">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#10D6A3]/30 border-t-[#10D6A3]" />
        <p className="text-sm font-medium text-[#6B8A7C]">Wird geladen...</p>
      </div>
    </div>
  );
}

function FullError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex h-screen items-center justify-center bg-[#0A0F0D]">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
          <svg className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/></svg>
        </div>
        <h2 className="text-lg font-bold text-[#E8F0EC]">Fehler beim Laden</h2>
        <p className="mt-1 text-sm text-[#6B8A7C]">{message}</p>
        <button onClick={onRetry} className="mt-4 rounded-lg bg-[#087F63] px-5 py-2 text-sm font-bold text-white transition hover:bg-[#10D6A3]">Erneut versuchen</button>
      </div>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-bold text-[#E8F0EC]">{title}</h2>
        <p className="text-xs text-[#6B8A7C] mt-0.5">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

function fmtDate(d: string | undefined | null) {
  if (!d) return '-';
  const date = new Date(d);
  if (isNaN(date.getTime())) return d;
  return date.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

const CATEGORY_COLORS: Record<string, string> = {
  'Fehler melden': 'border-red-500/30 bg-red-500/10 text-red-400',
  'Verbesserungsvorschlag': 'border-blue-500/30 bg-blue-500/10 text-blue-400',
  'Funktionswunsch': 'border-purple-500/30 bg-purple-500/10 text-purple-400',
  'Sonstiges': 'border-slate-500/30 bg-slate-500/10 text-slate-400',
};

const STATUS_COLORS: Record<string, string> = {
  new: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  read: 'border-sky-500/30 bg-sky-500/10 text-sky-400',
  resolved: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
};

const STATUS_LABELS: Record<string, string> = {
  new: 'Neu',
  read: 'Gelesen',
  resolved: 'Erledigt',
};

export default function FeedbackAdminPage() {
  const { user, loading: authLoading } = useData();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [platformFilter, setPlatformFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [updating, setUpdating] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [stats, setStats] = useState<{ new: number; read: number; resolved: number; total: number }>({ new: 0, read: 0, resolved: 0, total: 0 });

  const canView = isAdmin;

  useEffect(() => {
    if (authLoading || adminLoading) return;
    if (!user || !user.email) { router.replace('/login'); return; }
  }, [user, authLoading, adminLoading]);

  useEffect(() => {
    if (authLoading || adminLoading) return;
    if (!isAdmin) { router.replace('/dashboard'); return; }
    loadFeedback();
  }, [user, authLoading, adminLoading, isAdmin]);

  async function loadFeedback() {
    setLoading(true);
    setError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) { setError('Nicht authentifiziert'); setLoading(false); return; }

      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (platformFilter) params.set('platform', platformFilter);
      if (categoryFilter) params.set('category', categoryFilter);
      if (searchQuery) params.set('search', searchQuery);

      const res = await fetch(`/api/analytics/feedback?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || `HTTP ${res.status}`); }
      const data = await res.json();
      setFeedback(data.feedback || []);
      // Compute stats
      const all = data.feedback || [];
      setStats({
        total: all.length,
        new: all.filter((f: any) => f.status === 'new').length,
        read: all.filter((f: any) => f.status === 'read').length,
        resolved: all.filter((f: any) => f.status === 'resolved').length,
      });
    } catch (e: any) {
      setError(e.message || 'Fehler beim Laden');
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(id: string, newStatus: string) {
    setUpdating(id);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch('/api/analytics/feedback', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id, status: newStatus }),
      });
      if (!res.ok) throw new Error('Failed to update');
      setFeedback(prev => prev.map(f => f.id === id ? { ...f, status: newStatus } : f));
      // Update stats
      setStats(prev => {
        const old = feedback.find(f => f.id === id);
        if (old) {
          const next = { ...prev };
          if (old.status === 'new') next.new--;
          else if (old.status === 'read') next.read--;
          else if (old.status === 'resolved') next.resolved--;
          if (newStatus === 'new') next.new++;
          else if (newStatus === 'read') next.read++;
          else if (newStatus === 'resolved') next.resolved++;
          return next;
        }
        return prev;
      });
    } catch (e: any) {
      console.error('Update status error:', e);
    } finally {
      setUpdating(null);
    }
  }

  const filteredFeedback = useMemo(() => {
    let list = [...feedback];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(f => (f.userEmail || '').toLowerCase().includes(q) || (f.message || '').toLowerCase().includes(q));
    }
    return list;
  }, [feedback, searchQuery]);

  // ─── Auth guards ───
  if (authLoading || adminLoading) return <FullLoading />;
  if (!canView) return null;
  if (error) return <FullError message={error} onRetry={loadFeedback} />;

  return (
    <div className="min-h-screen bg-[#0A0F0D]">
      {/* Tab navigation */}
      <div className="sticky top-0 z-20 border-b border-[#1A2B22] bg-[#0A0F0D]/95 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center gap-6 h-14">
            <a href="/analytics" className="text-sm font-semibold text-[#6B8A7C] hover:text-[#E8F0EC] transition-colors">
              Dashboard
            </a>
            <a href="/analytics/feedback" className="text-sm font-bold text-[#10D6A3] border-b-2 border-[#10D6A3] pb-0.5">
              Feedback
              {stats.new > 0 && (
                <span className="ml-2 inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-amber-500/20 text-amber-400">
                  {stats.new}
                </span>
              )}
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Header + Stats */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#E8F0EC]">Feedback Verwaltung</h1>
            <p className="text-sm text-[#6B8A7C] mt-1">{stats.total} Einträge gesamt</p>
          </div>
          <button
            onClick={loadFeedback}
            className="rounded-lg border border-[#1A2B22] bg-[#111B15] px-4 py-2 text-xs font-semibold text-[#6B8A7C] hover:text-[#E8F0EC] hover:border-[#10D6A3]/30 transition-colors flex items-center gap-2"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Aktualisieren
          </button>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-4 gap-4">
          <StatCard label="Neu" value={stats.new} color="amber" />
          <StatCard label="Gelesen" value={stats.read} color="sky" />
          <StatCard label="Erledigt" value={stats.resolved} color="emerald" />
          <StatCard label="Gesamt" value={stats.total} color="slate" />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4">
          {/* Status filter */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-[#6B8A7C] uppercase tracking-wider">Status</span>
            <div className="flex gap-1">
              {['', 'new', 'read', 'resolved'].map(s => (
                <button
                  key={s}
                  onClick={() => { setStatusFilter(s); }}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                    statusFilter === s
                      ? 'bg-[#10D6A3]/20 text-[#10D6A3] border border-[#10D6A3]/30'
                      : 'text-[#6B8A7C] hover:text-[#C5D9D0] border border-transparent hover:border-[#1A2B22]'
                  }`}
                >
                  {s ? STATUS_LABELS[s] : 'Alle'}
                </button>
              ))}
            </div>
          </div>

          {/* Platform filter */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-[#6B8A7C] uppercase tracking-wider">Plattform</span>
            <div className="flex gap-1">
              {['', 'web', 'ios', 'android'].map(p => (
                <button
                  key={p}
                  onClick={() => { setPlatformFilter(p); }}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                    platformFilter === p
                      ? 'bg-[#10D6A3]/20 text-[#10D6A3] border border-[#10D6A3]/30'
                      : 'text-[#6B8A7C] hover:text-[#C5D9D0] border border-transparent hover:border-[#1A2B22]'
                  }`}
                >
                  {p || 'Alle'}
                </button>
              ))}
            </div>
          </div>

          {/* Category filter */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-[#6B8A7C] uppercase tracking-wider">Kategorie</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-lg border border-[#1A2B22] bg-[#111B15] px-3 py-1.5 text-xs text-[#C5D9D0] outline-none focus:border-[#10D6A3]/50 transition-colors"
            >
              <option value="">Alle</option>
              <option value="Fehler melden">Fehler melden</option>
              <option value="Verbesserungsvorschlag">Verbesserungsvorschlag</option>
              <option value="Funktionswunsch">Funktionswunsch</option>
              <option value="Sonstiges">Sonstiges</option>
            </select>
          </div>

          {/* Search */}
          <div className="relative ml-auto">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#6B8A7C]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Suchen..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') loadFeedback(); }}
              className="w-52 rounded-lg border border-[#1A2B22] bg-[#111B15] pl-9 pr-3 py-1.5 text-xs text-[#E8F0EC] placeholder-[#6B8A7C] outline-none focus:border-[#10D6A3]/50 transition-colors"
            />
          </div>
        </div>

        {/* Feedback Table */}
        <Section title="Alle Feedbacks" subtitle={`${filteredFeedback.length} Einträge`}>
          <div className="rounded-2xl border border-[#1A2B22] bg-[#111B15] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#1A2B22] text-[11px] font-semibold text-[#6B8A7C] uppercase tracking-wider">
                    <td className="px-4 py-4">Datum</td>
                    <td className="px-4 py-4">Kategorie</td>
                    <td className="px-4 py-4">Nachricht</td>
                    <td className="px-4 py-4">Nutzer</td>
                    <td className="px-4 py-4">Plattform</td>
                    <td className="px-4 py-4">Status</td>
                    <td className="px-4 py-4">Aktion</td>
                  </tr>
                </thead>
                <tbody>
                  {filteredFeedback.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-16 text-center text-sm text-[#6B8A7C]">
                        {loading ? 'Lade Feedbacks...' : 'Keine Feedbacks gefunden'}
                      </td>
                    </tr>
                  )}
                  {filteredFeedback.map((f: any) => (
                    <FeedbackRow
                      key={f.id}
                      feedback={f}
                      expanded={expandedId === f.id}
                      onToggleExpand={() => setExpandedId(expandedId === f.id ? null : f.id)}
                      updating={updating === f.id}
                      onStatusChange={(newStatus: string) => updateStatus(f.id, newStatus)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}

/* ─── Sub-components ─── */

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const border = { amber: 'border-amber-500/30', sky: 'border-sky-500/30', emerald: 'border-emerald-500/30', slate: 'border-slate-500/30' }[color] || 'border-slate-500/30';
  const bg = { amber: 'bg-amber-500/10', sky: 'bg-sky-500/10', emerald: 'bg-emerald-500/10', slate: 'bg-slate-500/10' }[color] || 'bg-slate-500/10';
  const text = { amber: 'text-amber-400', sky: 'text-sky-400', emerald: 'text-emerald-400', slate: 'text-slate-400' }[color] || 'text-slate-400';
  return (
    <div className={`rounded-xl border ${border} ${bg} px-5 py-4`}>
      <p className={`text-2xl font-black ${text}`}>{value}</p>
      <p className="text-xs text-[#6B8A7C] font-medium mt-1">{label}</p>
    </div>
  );
}

function FeedbackRow({ feedback, expanded, onToggleExpand, updating, onStatusChange }: {
  feedback: any;
  expanded: boolean;
  onToggleExpand: () => void;
  updating: boolean;
  onStatusChange: (status: string) => void;
}) {
  const catColor = CATEGORY_COLORS[feedback.category] || CATEGORY_COLORS['Sonstiges'];
  const statusColor = STATUS_COLORS[feedback.status] || STATUS_COLORS.new;

  const nextStatus = feedback.status === 'new' ? 'read' : feedback.status === 'read' ? 'resolved' : 'new';
  const nextLabel = feedback.status === 'new' ? 'Als gelesen' : feedback.status === 'read' ? 'Als erledigt' : 'Als neu';

  return (
    <>
      <tr
        className="border-b border-[#1A2B22]/40 text-[#C5D9D0] transition hover:bg-[#1A2B22]/40 cursor-pointer last:border-0 group"
        onClick={onToggleExpand}
      >
        <td className="px-4 py-3.5 text-xs text-[#6B8A7C] whitespace-nowrap">{fmtDate(feedback.createdAt)}</td>
        <td className="px-4 py-3.5">
          <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${catColor}`}>
            {feedback.category}
          </span>
        </td>
        <td className="px-4 py-3.5 max-w-[250px]">
          <p className="text-sm text-[#C5D9D0] truncate">{feedback.message}</p>
        </td>
        <td className="px-4 py-3.5 text-xs">{feedback.userEmail || <span className="text-[#6B8A7C] italic">Gast</span>}</td>
        <td className="px-4 py-3.5 text-xs uppercase">
          <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${
            feedback.platform === 'web' ? 'text-[#10D6A3] bg-[#10D6A3]/10' : 'text-sky-400 bg-sky-500/10'
          }`}>
            {feedback.platform}
          </span>
        </td>
        <td className="px-4 py-3.5">
          <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${statusColor}`}>
            {STATUS_LABELS[feedback.status] || feedback.status}
          </span>
        </td>
        <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => onStatusChange(nextStatus)}
            disabled={updating}
            className="rounded-lg border border-[#1A2B22] bg-[#0A0F0D] px-2.5 py-1.5 text-[10px] font-semibold text-[#6B8A7C] hover:text-[#E8F0EC] hover:border-[#10D6A3]/30 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {updating ? (
              <span className="flex items-center gap-1">
                <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </span>
            ) : (
              nextLabel
            )}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr key={`${feedback.id}-expanded`}>
          <td colSpan={7} className="px-4 py-4 bg-[#0A0F0D]/50 border-b border-[#1A2B22]/40">
            <div className="max-w-2xl">
              <p className="text-sm text-[#C5D9D0] whitespace-pre-wrap leading-relaxed">{feedback.message}</p>
              <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-[#6B8A7C]">
                <span className="font-medium">ID: <span className="text-[#C5D9D0]">{feedback.id}</span></span>
                {feedback.userId && <span className="font-medium">User-ID: <span className="text-[#C5D9D0]">{feedback.userId}</span></span>}
                {feedback.userEmail && <span className="font-medium">Email: <span className="text-[#C5D9D0]">{feedback.userEmail}</span></span>}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
