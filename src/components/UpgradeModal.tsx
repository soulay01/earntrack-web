'use client';

import { useRouter } from 'next/navigation';
import { getUpgradeText, type FeatureFlag } from '@/lib/plans';

interface Props {
  open: boolean;
  onClose?: () => void;
  dismissable?: boolean;
  title: string;
  description: string;
  feature?: FeatureFlag;
}

const TIERS = [
  { id: 'solo' as const, name: 'Solo', price: '27,99 €', color: 'bg-slate-500' },
  { id: 'team' as const, name: 'Team', price: '49,99 €', color: 'bg-teal-500' },
  { id: 'business' as const, name: 'Business', price: '79,99 €', color: 'bg-purple-500' },
];

export default function UpgradeModal({ open, onClose, dismissable, title, description, feature }: Props) {
  const router = useRouter();
  if (!open) return null;

  const upgradeInfo = feature ? getUpgradeText(feature) : null;

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={dismissable ? onClose : undefined}
    >
      <div
        className="w-full max-w-md mx-4 animate-zoomIn"
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
          <div className="bg-gradient-to-br from-amber-500 to-orange-500 px-8 py-8 text-center relative">
            {dismissable && onClose && (
              <button
                onClick={onClose}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-all active:scale-90"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m0 0v2m0-2h2m-2 0H10m9.364-7.364A9 9 0 1112 3a9 9 0 017.364 4.636z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">{title}</h2>
            {upgradeInfo && (
              <p className="text-white/80 text-sm mt-2 font-medium">Erforderlich: {upgradeInfo.requiredPlan}</p>
            )}
          </div>

          <div className="px-8 py-6 space-y-4">
            <p className="text-slate-600 text-sm leading-relaxed">{description}</p>

            {/* Plan comparison */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              {TIERS.map((tier, i) => (
                <div key={tier.id} className={`flex items-center justify-between px-4 py-3 ${i < TIERS.length - 1 ? 'border-b border-slate-100' : ''}`}>
                  <div className="flex items-center gap-3">
                    <span className={`w-3 h-3 rounded-full ${tier.color}`} />
                    <span className="text-sm font-semibold text-slate-800">{tier.name}</span>
                  </div>
                  <span className="text-sm font-bold text-slate-900">{tier.price}</span>
                </div>
              ))}
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center text-white text-sm font-bold shrink-0">✓</span>
                <span className="text-sm text-slate-700 font-medium">Alle Daten bleiben erhalten</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center text-white text-sm font-bold shrink-0">✓</span>
                <span className="text-sm text-slate-700 font-medium">Keine Kündigung notwendig</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center text-white text-sm font-bold shrink-0">✓</span>
                <span className="text-sm text-slate-700 font-medium">Jederzeit kündbar</span>
              </div>
            </div>

            <button
              onClick={() => router.push('/settings/subscription')}
              className="block w-full py-3.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 active:scale-[0.98] text-white font-bold rounded-2xl transition-all text-sm shadow-lg shadow-teal-200/50 text-center"
            >
              Jetzt upgraden
            </button>

            {dismissable && onClose && (
              <button
                onClick={onClose}
                className="block w-full text-center text-sm text-slate-400 hover:text-slate-600 font-medium transition-all py-2"
              >
                Später erinnern
              </button>
            )}

            <a
              href="mailto:info@earntrack.de"
              className="block w-full text-center text-sm text-slate-400 hover:text-slate-600 font-medium transition-all py-0"
            >
              Fragen? <span className="text-teal-600 font-semibold">info@earntrack.de</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
