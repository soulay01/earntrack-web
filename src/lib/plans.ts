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
  priceCents: string;
  originalPrice: string;
  desc: string;
  limitLabel: string;
  popular: boolean;
}

const PLAN_DISPLAY_DATA: Record<string, PlanDisplay> = {
  solo: {
    id: 'solo', name: 'Solo', price: '27', priceCents: '99', originalPrice: '39,99 €',
    desc: 'Du und eine Aushilfe', limitLabel: 'bis 2 Mitarbeiter', popular: false,
  },
  team: {
    id: 'team', name: 'Team', price: '49', priceCents: '99', originalPrice: '69,99 €',
    desc: 'Die feste Kolonne', limitLabel: 'bis 5 Mitarbeiter', popular: true,
  },
  business: {
    id: 'business', name: 'Business', price: '79', priceCents: '99', originalPrice: '99,99 €',
    desc: 'Betrieb im Wachstum', limitLabel: 'unbegrenzt Mitarbeiter', popular: false,
  },
};

/**
 * Die Feature-Daten sind bewusst in zwei Ebenen getrennt:
 *
 *  - INCLUDED_EVERYWHERE: in jedem Tarif enthalten. Wird einmal in voller Breite
 *    gezeigt, statt in jeder Plan-Karte wiederholt zu werden — die Wiederholung
 *    ließ jeden Tarif dünner aussehen als er ist.
 *  - PLAN_DIFFERENCES: nur was sich zwischen den Tarifen tatsächlich unterscheidet.
 *    Das ist die einzige Information, die für die Auswahl zählt.
 */
export interface IncludedGroup {
  group: string;
  items: string[];
}

export const INCLUDED_EVERYWHERE: IncludedGroup[] = [
  {
    group: 'Baustelle & Zeit',
    items: [
      'Zeiterfassung mit Pausen',
      'Einsatz- & Terminplanung',
      'Projekte und Kunden',
      'Projektkommunikation im Team',
      'Mitarbeiter-Zugänge mit eigenem Login',
      'Fotodokumentation am Projekt',
    ],
  },
  {
    group: 'Rechnung & Geld',
    items: [
      'Rechnungen und Angebote',
      'E-Rechnung nach ZUGFeRD',
      'Profit Score je Projekt',
      'Auswertungen und Kennzahlen',
      'Lager und Lieferanten',
      'Daten-Export als CSV und PDF',
    ],
  },
  {
    group: 'Überall dabei',
    items: [
      'Web-App am Rechner',
      'iPhone- und Android-App',
      'Alles automatisch synchron',
      'Push bei Antworten und Terminen',
    ],
  },
];

/** Werkzeuge und Handgriffe, die EarnTrack zusammenfasst. Grundlage der Bemaßung. */
export const REPLACED_TOOLS: string[] = [
  'Stundenzettel',
  'Excel-Listen',
  'Rechnungs­programm',
  'Angebots­vorlagen',
  'Mahnungen im Kalender',
  'DATEV-Aufbereitung',
  'Zettel im Handschuhfach',
];

export interface PlanDifference {
  label: string;
  solo: string | boolean;
  team: string | boolean;
  business: string | boolean;
}

export const PLAN_DIFFERENCES: PlanDifference[] = [
  { label: 'Mitarbeiter', solo: 'bis 2', team: 'bis 5', business: 'unbegrenzt' },
  { label: 'Rechnungsvorlagen', solo: '1', team: '3', business: '5' },
  { label: 'DATEV-Export', solo: false, team: true, business: true },
  { label: 'Mahnwesen', solo: false, team: true, business: true },
  { label: 'Wiederkehrende Rechnungen', solo: false, team: true, business: true },
  { label: 'Artikelkatalog (Datanorm)', solo: false, team: false, business: true },
  { label: 'Support', solo: 'E-Mail', team: 'bevorzugt', business: 'bevorzugt' },
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
