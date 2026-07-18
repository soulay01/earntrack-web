export type PlanId = 'trial' | 'solo' | 'team' | 'business';

export type FeatureFlag =
  | 'employees'
  | 'invoiceTemplates'
  | 'datevExport'
  | 'batchExport'
  | 'dunning'
  | 'recurringInvoices'
  | 'articleCatalog'
  | 'employeeCredentials'
  | 'teamPage'
  | 'prioritySupport';

const PLAN_FEATURES: Record<PlanId, Record<FeatureFlag, number | boolean>> = {
  trial:    { employees: Infinity, invoiceTemplates: 5, datevExport: true, batchExport: true, dunning: true, recurringInvoices: true, articleCatalog: true, employeeCredentials: true, teamPage: true, prioritySupport: true },
  solo:     { employees: 2, invoiceTemplates: 1, datevExport: false, batchExport: true, dunning: false, recurringInvoices: false, articleCatalog: false, employeeCredentials: true, teamPage: true, prioritySupport: false },
  team:     { employees: 5, invoiceTemplates: 3, datevExport: true, batchExport: true, dunning: true, recurringInvoices: true, articleCatalog: false, employeeCredentials: true, teamPage: true, prioritySupport: true },
  business: { employees: Infinity, invoiceTemplates: 5, datevExport: true, batchExport: true, dunning: true, recurringInvoices: true, articleCatalog: true, employeeCredentials: true, teamPage: true, prioritySupport: true },
};

export interface PlanDisplay {
  id: PlanId;
  name: string;
  price: string;
  originalPrice: string;
  desc: string;
  limitLabel: string;
  popular: boolean;
  gradient: string;
  btnGradient: string;
  borderColor: string;
  icon: string;
}

const PLAN_DISPLAY_DATA: Record<string, PlanDisplay> = {
  solo: {
    id: 'solo', name: 'Solo', price: '27,99 €', originalPrice: '39,99 €',
    desc: 'Ideal für Einzelunternehmer', limitLabel: 'Max. 2 Mitarbeiter', popular: false,
    gradient: 'from-slate-100 to-slate-200', btnGradient: 'from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800',
    borderColor: 'border-slate-200', icon: '',
  },
  team: {
    id: 'team', name: 'Team', price: '49,99 €', originalPrice: '69,99 €',
    desc: 'Das beliebteste Abo', limitLabel: 'Bis zu 5 Mitarbeiter', popular: true,
    gradient: 'from-teal-50 via-teal-50 to-emerald-50', btnGradient: 'from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700',
    borderColor: 'border-teal-200', icon: '',
  },
  business: {
    id: 'business', name: 'Business', price: '79,99 €', originalPrice: '99,99 €',
    desc: 'Für wachsende Betriebe', limitLabel: 'Unbegrenzt Mitarbeiter', popular: false,
    gradient: 'from-purple-100 to-indigo-100', btnGradient: 'from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700',
    borderColor: 'border-purple-200', icon: '',
  },
};

export interface FeatureCategory {
  category: string;
  features: {
    label: string;
    solo: string | boolean;
    team: string | boolean;
    business: string | boolean;
  }[];
}

export const FEATURE_CATEGORIES: FeatureCategory[] = [
  {
    category: 'Kern-Funktionen',
    features: [
      { label: 'Web-App & Mobile-App', solo: true, team: true, business: true },
      { label: 'Projekte, Kunden & Termine', solo: true, team: true, business: true },
      { label: 'Zeiterfassung & Pausen', solo: true, team: true, business: true },
      { label: 'Rechnungen & Angebote', solo: true, team: true, business: true },
      { label: 'Profit Score & Analysen', solo: true, team: true, business: true },
      { label: 'E-Rechnung (ZUGFeRD)', solo: true, team: true, business: true },
    ],
  },
  {
    category: 'Team & Verwaltung',
    features: [
      { label: 'Mahnwesen', solo: false, team: true, business: true },
      { label: 'Wiederkehrende Rechnungen', solo: false, team: true, business: true },
      { label: 'Mitarbeiter-Zugangsdaten', solo: true, team: true, business: true },
      { label: 'Team-Seite & Projektkommunikation', solo: true, team: true, business: true },
      { label: 'Daten-Batch-Export (CSV/PDF)', solo: true, team: true, business: true },
      { label: 'DATEV-Export', solo: false, team: true, business: true },
    ],
  },
  {
    category: 'Business-Exklusiv',
    features: [
      { label: 'Artikelkatalog (Datanorm-Import)', solo: false, team: false, business: true },

    ],
  },
  {
    category: 'Limits',
    features: [
      { label: 'Mitarbeiter', solo: 'Max. 2', team: 'Bis zu 5', business: 'Unbegrenzt' },
      { label: 'Rechnungsvorlagen', solo: '1', team: '3', business: '5' },
      { label: 'Support', solo: 'E-Mail', team: 'Priorität', business: 'Priority' },
    ],
  },
];

const RESTRICTIVE_DEFAULTS: Record<FeatureFlag, number | boolean> = {
  employees: 0, invoiceTemplates: 0, datevExport: false, batchExport: false,
  dunning: false, recurringInvoices: false, articleCatalog: false,
  employeeCredentials: false, teamPage: false, prioritySupport: false,
};

export function getFeatureFlag(plan: string | undefined | null, feature: FeatureFlag): number | boolean {
  const effectivePlan = (plan || 'trial') as PlanId;
  return PLAN_FEATURES[effectivePlan]?.[feature] ?? RESTRICTIVE_DEFAULTS[feature];
}

// Keep old exports for backward compatibility
export const PLAN_LIMITS: Record<string, { employees: number; customers: number; assignments: number; suppliers: number; inventoryItems: number }> = {
  trial:    { employees: Infinity, customers: Infinity, assignments: Infinity, suppliers: 10, inventoryItems: 10 },
  solo:     { employees: 2, customers: Infinity, assignments: Infinity, suppliers: 20, inventoryItems: 50 },
  team:     { employees: 5, customers: Infinity, assignments: Infinity, suppliers: Infinity, inventoryItems: Infinity },
  business: { employees: Infinity, customers: Infinity, assignments: Infinity, suppliers: Infinity, inventoryItems: Infinity },
};

export const EXCESS_CLEANUP_DAYS = 7;
export const EXCESS_CLEANUP_MS = EXCESS_CLEANUP_DAYS * 24 * 60 * 60 * 1000;

export function getPlanLimit(plan: string | undefined | null, key: 'employees' | 'customers' | 'assignments' | 'suppliers' | 'inventoryItems'): number {
  return PLAN_LIMITS[plan || 'trial']?.[key] ?? Infinity;
}

export function hasReachedLimit(
  plan: string | undefined | null,
  key: 'employees' | 'customers' | 'assignments' | 'suppliers' | 'inventoryItems',
  currentCount: number,
): boolean {
  const limit = getPlanLimit(plan, key);
  return currentCount >= limit;
}

export const PLAN_LABELS: Record<string, string> = {
  trial: 'Testphase', solo: 'Solo', team: 'Team', business: 'Business',
};

export function getPlanDisplay(planId: string): PlanDisplay {
  return PLAN_DISPLAY_DATA[planId] || PLAN_DISPLAY_DATA.solo;
}

export const PLAN_IDS = ['solo', 'team', 'business'];

export const BADGE_GRADIENTS: Record<string, string> = {
  solo: 'from-slate-600 to-slate-700',
  team: 'from-emerald-600 to-teal-600',
  business: 'from-purple-600 to-indigo-600',
};

export function getPriceIds(): Record<string, string> {
  const testMode = process.env.NEXT_PUBLIC_STRIPE_TEST_MODE === 'true';
  return {
    solo: testMode
      ? process.env.NEXT_PUBLIC_STRIPE_TEST_PRICE_SOLO || ''
      : process.env.NEXT_PUBLIC_STRIPE_PRICE_SOLO || '',
    team: testMode
      ? process.env.NEXT_PUBLIC_STRIPE_TEST_PRICE_TEAM || ''
      : process.env.NEXT_PUBLIC_STRIPE_PRICE_TEAM || '',
    business: testMode
      ? process.env.NEXT_PUBLIC_STRIPE_TEST_PRICE_BUSINESS || ''
      : process.env.NEXT_PUBLIC_STRIPE_PRICE_BUSINESS || '',
  };
}

export function getUpgradeText(feature: FeatureFlag): { title: string; description: string; requiredPlan: string } {
  const map: Record<FeatureFlag, { title: string; description: string; requiredPlan: string }> = {
    employees: {
      title: 'Mitarbeiter-Limit erreicht',
      description: 'Du hast die maximale Anzahl Mitarbeiter für deinen Plan erreicht. Upgrade auf Team oder Business für mehr Mitarbeiter.',
      requiredPlan: 'Team (49,99 €/Monat)',
    },
    invoiceTemplates: {
      title: 'Mehr Rechnungsvorlagen?',
      description: 'Dein Plan erlaubt nur eine begrenzte Anzahl Vorlagen. Upgrade für mehr Auswahl.',
      requiredPlan: 'Team (49,99 €/Monat)',
    },
    datevExport: {
      title: 'DATEV-Export nicht enthalten',
      description: 'Der DATEV-Export ist im Solo-Plan nicht enthalten. Upgrade auf Team oder Business für die DATEV-Schnittstelle.',
      requiredPlan: 'Team (49,99 €/Monat)',
    },
    batchExport: {
      title: 'Daten-Batch-Export',
      description: 'Der Batch-Export ist in allen Tarifen enthalten.',
      requiredPlan: '-',
    },
    dunning: {
      title: 'Mahnwesen nicht enthalten',
      description: 'Automatisches Mahnwesen ist im Solo-Plan nicht enthalten. Upgrade für Zahlungserinnerungen und Mahnläufe.',
      requiredPlan: 'Team (49,99 €/Monat)',
    },
    recurringInvoices: {
      title: 'Wiederkehrende Rechnungen',
      description: 'Wiederkehrende Rechnungen sind im Solo-Plan nicht enthalten. Upgrade für automatische Rechnungsläufe.',
      requiredPlan: 'Team (49,99 €/Monat)',
    },
    articleCatalog: {
      title: 'Artikelkatalog nicht enthalten',
      description: 'Der Datanorm-Artikelkatalog ist exklusiv im Business-Plan enthalten.',
      requiredPlan: 'Business (79,99 €/Monat)',
    },
    employeeCredentials: {
      title: 'Mitarbeiter-Zugänge',
      description: 'Mitarbeiter-Zugangsdaten sind in allen Tarifen enthalten. Deine Mitarbeiter können sich mit eigenem Login anmelden.',
      requiredPlan: '-',
    },
    teamPage: {
      title: 'Team-Seite nicht enthalten',
      description: 'Die Team-Seite mit Projektzugängen ist im Solo-Plan nicht enthalten. Upgrade auf Team oder Business.',
      requiredPlan: 'Team (49,99 €/Monat)',
    },
    prioritySupport: {
      title: 'Support',
      description: 'Priority-Support ist im Business-Plan enthalten.',
      requiredPlan: 'Business (79,99 €/Monat)',
    },
  };
  return map[feature];
}
