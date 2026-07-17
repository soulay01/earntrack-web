// TeamOptimizer – portiert aus der Mobile-App (utils/teamOptimizer.js).
// Schlägt die profitabelste Mitarbeiter-Kombination für einen Termin vor:
// 1. Filtert verfügbare Mitarbeiter (keine Konflikte am selben Datum).
// 2. Bewertet nach Kosteneffizienz, Erfahrung (gesamtstunden) und Gewinnbeitrag.
// 3. Wählt die besten N für die gewünschte Team-Größe.

const toNames = (mitarbeiter: any): string[] =>
  Array.isArray(mitarbeiter)
    ? mitarbeiter.map((n: string) => String(n).trim()).filter(Boolean)
    : String(mitarbeiter || '').split(',').map(n => n.trim()).filter(Boolean);

const hasConflict = (employeeName: string, dateStr: string, assignments: any[], excludeAssignmentId?: string): boolean =>
  assignments.some(a => {
    if (a.datum !== dateStr) return false;
    if (excludeAssignmentId && a.id === excludeAssignmentId) return false;
    return toNames(a.mitarbeiter).includes(employeeName);
  });

export const getAvailableEmployees = (employees: any[], dateStr: string, assignments: any[], excludeAssignmentId?: string): any[] =>
  employees.filter(emp => !hasConflict(emp.name, dateStr, assignments, excludeAssignmentId));

// Höherer Score = besserer Kandidat: Gewinnbeitrag + Erfahrungsbonus
// (+1 Punkt je 10 gearbeitete Stunden, gedeckelt bei 50).
const scoreEmployee = (emp: any, hours: number, revenue: number): number => {
  const rate = parseFloat(emp.stundenlohn) || 0;
  const experience = parseFloat(emp.gesamtstunden) || 0;
  if (rate === 0) return 1000; // Kostenloser Mitarbeiter = höchste Priorität (Edge Case)
  const revenuePerHour = revenue / Math.max(hours, 1);
  const profitPerEmployee = (revenuePerHour - rate) * hours;
  const experienceBonus = Math.min(experience / 10, 50);
  return profitPerEmployee + experienceBonus;
};

export interface TeamSuggestion {
  suggested: any[];
  totalCost: number;
  estimatedProfit: number;
  allAvailable: any[];
  message: string | null;
}

export const suggestTeam = (
  employees: any[],
  dateStr: string,
  hours: number,
  revenue: number,
  teamSize: number,
  assignments: any[] = [],
  excludeAssignmentId?: string,
): TeamSuggestion => {
  const available = getAvailableEmployees(employees, dateStr, assignments, excludeAssignmentId);

  if (available.length === 0) {
    return { suggested: [], totalCost: 0, estimatedProfit: 0, allAvailable: [], message: 'Keine verfügbaren Mitarbeiter' };
  }

  const scored = available
    .map(emp => ({ emp, score: scoreEmployee(emp, hours || 8, revenue || 0) }))
    .sort((a, b) => b.score - a.score);

  const count = Math.min(teamSize || 1, available.length);
  const suggested = scored.slice(0, count).map(s => s.emp);

  const totalCost = suggested.reduce((sum, emp) => sum + ((parseFloat(emp.stundenlohn) || 0) * (hours || 8)), 0);
  const estimatedProfit = (revenue || 0) - totalCost;

  const message = available.length < (teamSize || 1)
    ? `Nur ${available.length} von ${teamSize} verfügbar`
    : null;

  return { suggested, totalCost, estimatedProfit, allAvailable: available, message };
};
