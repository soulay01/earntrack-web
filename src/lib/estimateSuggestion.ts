export interface EstimateForSuggestion {
  verbindlichkeit?: string;
  totalNet: number;
  materialienList?: { preis: number; menge: number }[];
}

export interface EstimateSuggestionInput {
  estimate: EstimateForSuggestion | null;
  currentUmsatz: string | number;
}

// Vorschlag = Netto-KV-Summe minus Material (Material wird am Termin separat
// über die Lager-Material-Liste erfasst, umsatz bildet nur die Dienstleistung ab).
export function getEstimateUmsatzSuggestion(input: EstimateSuggestionInput): number | null {
  const { estimate, currentUmsatz } = input;
  if (!estimate) return null;
  if (estimate.verbindlichkeit !== 'verbindlich') return null;

  const currentNum = parseFloat(String(currentUmsatz).replace(',', '.')) || 0;
  if (currentNum > 0) return null;

  const materialSum = (estimate.materialienList || []).reduce(
    (sum, m) => sum + (m.preis || 0) * (m.menge || 0),
    0
  );
  const suggestion = estimate.totalNet - materialSum;
  return suggestion > 0 ? suggestion : null;
}
