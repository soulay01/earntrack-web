const parseDate = (str: string | undefined | null): Date | null => {
  if (!str) return null;
  const parts = str.split('.');
  if (parts.length === 3) return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  return new Date(str);
};

const hasConflict = (employeeName: string, dateStr: string, assignments: any[], excludeAssignmentId?: string): boolean => {
  return assignments.some((a: any) => {
    if (a.datum !== dateStr) return false;
    if (excludeAssignmentId && a.id === excludeAssignmentId) return false;
    const names = Array.isArray(a.mitarbeiter)
      ? a.mitarbeiter.map((n: string) => n.trim()).filter(Boolean)
      : (a.mitarbeiter || '').split(',').map((n: string) => n.trim()).filter(Boolean);
    return names.includes(employeeName);
  });
};

export const getAvailableEmployees = (employees: any[], dateStr: string, assignments: any[], excludeAssignmentId?: string) => {
  return employees.filter((emp: any) => !hasConflict(emp.name, dateStr, assignments, excludeAssignmentId));
};

const scoreEmployee = (emp: any, hours: number, revenue: number): number => {
  const rate = parseFloat(emp.stundenlohn) || 0;
  const experience = parseFloat(emp.gesamtstunden) || 0;
  if (rate === 0) return 1000;
  const cost = rate * hours;
  const revenuePerHour = revenue / Math.max(hours, 1);
  const profitPerEmployee = (revenuePerHour - rate) * hours;
  const experienceBonus = Math.min(experience / 10, 50);
  return profitPerEmployee + experienceBonus;
};

export const suggestTeam = (employees: any[], dateStr: string, hours: number, revenue: number, teamSize: number, assignments: any[] = [], excludeAssignmentId?: string) => {
  const available = getAvailableEmployees(employees, dateStr, assignments, excludeAssignmentId);
  if (available.length === 0) return { suggested: [], totalCost: 0, estimatedProfit: 0, allAvailable: [], message: 'Keine verfügbaren Mitarbeiter' };
  const scored = available.map((emp: any) => ({ emp, score: scoreEmployee(emp, hours || 8, revenue || 0) }));
  scored.sort((a: any, b: any) => b.score - a.score);
  const count = Math.min(teamSize || 1, available.length);
  const suggested = scored.slice(0, count).map((s: any) => s.emp);
  const totalCost = suggested.reduce((sum: number, emp: any) => sum + ((parseFloat(emp.stundenlohn) || 0) * (hours || 8)), 0);
  const estimatedProfit = (revenue || 0) - totalCost;
  const message = available.length < (teamSize || 1) ? `Nur ${available.length} von ${teamSize} verfügbar` : null;
  return { suggested, totalCost, estimatedProfit, allAvailable: available, message };
};

export const getAvailableEmployeesWithScores = (employees: any[], dateStr: string, hours: number, revenue: number, assignments: any[] = [], excludeAssignmentId?: string) => {
  const available = getAvailableEmployees(employees, dateStr, assignments, excludeAssignmentId);
  return available.map((emp: any) => ({ ...emp, score: scoreEmployee(emp, hours || 8, revenue || 0), estimatedCost: (parseFloat(emp.stundenlohn) || 0) * (hours || 8) }));
};
