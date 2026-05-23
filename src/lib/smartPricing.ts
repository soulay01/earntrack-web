import { formatCurrency } from './calculations';

const parseDate = (str: string | undefined | null): Date | null => {
  if (!str) return null;
  const parts = str.split('.');
  if (parts.length === 3) return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  return new Date(str);
};

const getRevenue = (a: any): number => {
  if (typeof a.umsatz === 'string') {
    const raw = a.umsatz.replace(/[€\s]/g, '').trim();
    if (!raw) return 0;
    if (raw.includes(',') && raw.includes('.')) return parseFloat(raw.replace(/\./g, '').replace(',', '.')) || 0;
    if (raw.includes(',') && !raw.includes('.')) return parseFloat(raw.replace(',', '.')) || 0;
    return parseFloat(raw) || 0;
  }
  return parseFloat(a.umsatz) || 0;
};

const getCost = (a: any): number => {
  return (parseFloat(a.stunden) || 0) * (parseFloat(a.stundenlohn) || 0);
};

const getHours = (a: any): number => parseFloat(a.stunden) || 0;

export function getGrade(margin: number): string {
  if (margin > 50) return 'A+';
  if (margin >= 40) return 'A';
  if (margin >= 25) return 'B';
  if (margin >= 10) return 'C';
  if (margin >= 0) return 'D';
  return 'F';
}

export function getGradeColor(grade: string): string {
  switch (grade) {
    case 'A+': return '#16a34a'; case 'A': return '#22c55e'; case 'B': return '#84cc16';
    case 'C': return '#f59e0b'; case 'D': return '#f97316'; case 'F': return '#ef4444';
    default: return '#94a3b8';
  }
}

export function getGradeBg(grade: string): string {
  switch (grade) {
    case 'A+': return '#dcfce7'; case 'A': return '#f0fdf4'; case 'B': return '#ecfccb';
    case 'C': return '#fef3c7'; case 'D': return '#ffedd5'; case 'F': return '#fee2e2';
    default: return '#f1f5f9';
  }
}

export function calculateAssignmentProfitScore(assignment: any) {
  const hours = getHours(assignment);
  const revenue = getRevenue(assignment);
  const cost = getCost(assignment);
  const profit = revenue - cost;
  const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0;
  const efficiency = hours > 0 ? revenue / hours : 0;
  const grade = getGrade(profitMargin);
  return {
    id: assignment.id, kunde: assignment.kunde || '', projekt: assignment.projekt || '',
    datum: assignment.datum || '', status: assignment.status || '', hours, revenue, cost,
    profit, profitMargin, efficiency, grade,
    gradeColor: getGradeColor(grade), gradeBg: getGradeBg(grade),
    score: Math.max(0, Math.min(100, Math.round(profitMargin * 1.5))),
  };
}

export function calculateEmployeeProfitScore(employeeName: string, employee: any, assignments: any[]) {
  const rate = parseFloat(employee?.stundenlohn) || 0;
  const empAssignments = assignments.filter((a: any) => {
    const names = Array.isArray(a.mitarbeiter)
      ? a.mitarbeiter.map((n: string) => n.trim()).filter(Boolean)
      : (a.mitarbeiter || '').split(',').map((n: string) => n.trim()).filter(Boolean);
    return names.includes(employeeName);
  });
  if (empAssignments.length === 0) {
    return { name: employeeName, score: 0, grade: '–', gradeColor: '#94a3b8', gradeBg: '#f1f5f9', profit: 0, profitMargin: 0, totalRevenue: 0, totalCost: 0, totalHours: 0, assignmentCount: 0, efficiency: 0, avgHourlyRate: rate };
  }
  const totalHours = empAssignments.reduce((sum: number, a: any) => sum + getHours(a), 0);
  const totalCost = totalHours * rate;
  let totalRevenue = 0;
  empAssignments.forEach((a: any) => {
    const names = Array.isArray(a.mitarbeiter)
      ? a.mitarbeiter.map((n: string) => n.trim()).filter(Boolean)
      : (a.mitarbeiter || '').split(',').map((n: string) => n.trim()).filter(Boolean);
    const split = names.length > 0 ? 1 / names.length : 1;
    totalRevenue += getRevenue(a) * split;
  });
  const profit = totalRevenue - totalCost;
  const profitMargin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;
  const grade = getGrade(profitMargin);
  return { name: employeeName, score: Math.max(0, Math.min(100, Math.round(profitMargin * 1.5))), grade, gradeColor: getGradeColor(grade), gradeBg: getGradeBg(grade), profit, profitMargin, totalRevenue, totalCost, totalHours, assignmentCount: empAssignments.length, efficiency: totalHours > 0 ? totalRevenue / totalHours : 0, avgHourlyRate: rate };
}

export function calculateAllEmployeeScores(employees: any[], assignments: any[]) {
  if (!employees || employees.length === 0) return [];
  const scores = employees.map((emp: any) => calculateEmployeeProfitScore(emp.name, emp, assignments));
  const maxHours = Math.max(...scores.map(s => s.totalHours), 1);
  scores.forEach(s => { (s as any).utilization = s.totalHours / maxHours; });
  return scores.sort((a, b) => b.profit - a.profit);
}

export function calculateCustomerProfitScore(customer: any, assignments: any[]) {
  const customerName = typeof customer === 'string' ? customer : (customer ? customer.name : '');
  const custAssignments = assignments.filter((a: any) => (a.kunde || '').trim().toLowerCase() === customerName.toLowerCase());
  if (custAssignments.length === 0) {
    return { name: customerName, score: 0, grade: '–', gradeColor: '#94a3b8', gradeBg: '#f1f5f9', profit: 0, profitMargin: 0, totalRevenue: 0, totalCost: 0, totalHours: 0, assignmentCount: 0, avgMargin: 0, avgRate: 0 };
  }
  const totalHours = custAssignments.reduce((sum: number, a: any) => sum + getHours(a), 0);
  const totalCost = custAssignments.reduce((sum: number, a: any) => sum + getCost(a), 0);
  const totalRevenue = custAssignments.reduce((sum: number, a: any) => sum + getRevenue(a), 0);
  const profit = totalRevenue - totalCost;
  const profitMargin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;
  const grade = getGrade(profitMargin);
  const margins = custAssignments.map((a: any) => { const r = getRevenue(a); const c = getCost(a); return r > 0 ? ((r - c) / r) * 100 : 0; });
  return { name: customerName, score: Math.max(0, Math.min(100, Math.round(profitMargin * 1.5))), grade, gradeColor: getGradeColor(grade), gradeBg: getGradeBg(grade), profit, profitMargin, totalRevenue, totalCost, totalHours, assignmentCount: custAssignments.length, avgMargin: margins.reduce((s: number, m: number) => s + m, 0) / margins.length, avgRate: totalHours > 0 ? totalRevenue / totalHours : 0 };
}

export function calculateAllCustomerScores(customers: any[], assignments: any[]) {
  if (!customers || customers.length === 0) return [];
  const scores = customers.map((c: any) => calculateCustomerProfitScore(c, assignments));
  return scores.sort((a, b) => b.profit - a.profit);
}

export function calculateDashboardSummary(assignments: any[]) {
  if (!assignments || assignments.length === 0) {
    return { totalRevenue: 0, totalCost: 0, totalProfit: 0, totalLoss: 0, netProfit: 0, avgMargin: 0, assignmentCount: 0, gradeDistribution: { 'A+': 0, 'A': 0, 'B': 0, 'C': 0, 'D': 0, 'F': 0 }, profitableCount: 0, lossCount: 0 };
  }
  const scored = assignments.map(a => calculateAssignmentProfitScore(a));
  const totalRevenue = scored.reduce((s, a) => s + a.revenue, 0);
  const totalCost = scored.reduce((s, a) => s + a.cost, 0);
  const totalProfit = scored.filter(a => a.profit > 0).reduce((s, a) => s + a.profit, 0);
  const totalLoss = scored.filter(a => a.profit < 0).reduce((s, a) => s + Math.abs(a.profit), 0);
  const netProfit = totalRevenue - totalCost;
  const avgMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
  const gradeDistribution: Record<string, number> = { 'A+': 0, 'A': 0, 'B': 0, 'C': 0, 'D': 0, 'F': 0 };
  scored.forEach(a => { if (gradeDistribution[a.grade] !== undefined) gradeDistribution[a.grade]++; });
  return { totalRevenue, totalCost, netProfit, totalProfit, totalLoss, avgMargin, assignmentCount: assignments.length, gradeDistribution, profitableCount: scored.filter(a => a.profit > 0).length, lossCount: scored.filter(a => a.profit < 0).length };
}

export function analyzeRootCause(assignment: any, allAssignments: any[] = []) {
  const scored = calculateAssignmentProfitScore(assignment);
  if (scored.profit >= 0) return { isLoss: false, reasons: [], suggestions: [] as string[], requiredPrice: 0, currentMargin: scored.profitMargin };
  const reasons: string[] = [];
  const suggestions: string[] = [];
  const avgHours = allAssignments.length > 0 ? allAssignments.reduce((s, a) => s + getHours(a), 0) / allAssignments.length : 8;
  if (scored.hours > avgHours * 1.3) {
    reasons.push('Termindauer deutlich über Durchschnitt');
    suggestions.push(`Dauer von ${scored.hours.toFixed(1)}h auf ~${Math.round(avgHours * 10) / 10}h reduzieren`);
  }
  if (scored.profitMargin < 0) {
    const requiredPrice = scored.cost * 1.2;
    reasons.push('Preis zu niedrig für die geleistete Arbeit');
    suggestions.push(`Preis auf ${formatCurrency(requiredPrice)} erhöhen für 20% Marge`);
  }
  const rate = parseFloat(assignment.stundenlohn) || 0;
  if (allAssignments.length > 0) {
    const avgRate = allAssignments.reduce((s, a) => s + (parseFloat(a.stundenlohn) || 0), 0) / allAssignments.length;
    if (rate > avgRate * 1.4) {
      reasons.push('Mitarbeiter-Stundenlohn überdurchschnittlich hoch');
      suggestions.push(`Günstigeren MA einsetzen (Ø ${formatCurrency(avgRate)}/h)`);
    }
  }
  if (scored.cost > scored.revenue * 0.8) {
    reasons.push('Kosten > 80% des Umsatzes');
    suggestions.push('Kostenstruktur prüfen: Weniger MA oder kürzere Dauer');
  }
  return { isLoss: true, reasons, suggestions, requiredPrice: scored.cost * 1.2, currentMargin: scored.profitMargin };
}

export function generateActionRecommendations(assignments: any[], employees: any[] = []) {
  if (!assignments || assignments.length === 0) return [];
  const scored = assignments.map(a => calculateAssignmentProfitScore(a));
  const summary = calculateDashboardSummary(assignments);
  const recommendations: any[] = [];
  const lossAssignments = scored.filter(a => a.profit < 0).sort((a, b) => a.profit - b.profit);
  if (lossAssignments.length > 0) {
    const totalLoss = lossAssignments.reduce((s, a) => s + Math.abs(a.profit), 0);
    recommendations.push({ type: 'loss_alert', priority: 'high', title: `${lossAssignments.length} Verlust-Termin${lossAssignments.length > 1 ? 'e' : ''}`, description: `Du verlierst ${formatCurrency(totalLoss)} bei diesen Terminen.`, action: 'Preise sofort anpassen oder MA wechseln', potential: formatCurrency(totalLoss * 0.6) });
  }
  const lowMargin = scored.filter(a => a.profitMargin > 0 && a.profitMargin < 15);
  if (lowMargin.length > 0) {
    const avgLowMargin = lowMargin.reduce((s, a) => s + a.profitMargin, 0) / lowMargin.length;
    recommendations.push({ type: 'low_margin', priority: 'high', title: `${lowMargin.length} Termin${lowMargin.length > 1 ? 'e' : ''} mit niedriger Marge`, description: `Ø Marge nur ${avgLowMargin.toFixed(1)}%. Ziel: mindestens 20%.`, action: 'Preise um 15-25% erhöhen', potential: formatCurrency(lowMargin.reduce((s, a) => s + a.revenue * 0.15, 0)) });
  }
  lossAssignments.slice(0, 3).forEach((a: any) => {
    const requiredPrice = a.cost * 1.2;
    recommendations.push({ type: 'price_fix', priority: 'high', title: `${a.kunde || a.projekt}: Preis erhöhen`, description: `Aktuell: ${formatCurrency(a.revenue)} | Benötigt: ${formatCurrency(requiredPrice)}`, action: `+${formatCurrency(requiredPrice - a.revenue)} für 20% Marge`, potential: formatCurrency(requiredPrice - a.revenue) });
  });
  if (assignments.length > 0) {
    const avgHours = assignments.reduce((s, a) => s + getHours(a), 0) / assignments.length;
    const longLosses = lossAssignments.filter(a => a.hours > avgHours);
    if (longLosses.length > 0) {
      recommendations.push({ type: 'duration', priority: 'medium', title: `${longLosses.length} Termin${longLosses.length > 1 ? 'e' : ''} zu lang`, description: `Ø Dauer ist ${avgHours.toFixed(1)}h.`, action: 'Dauer um 20-30% reduzieren', potential: formatCurrency(longLosses.reduce((s, a: any) => s + (a.hours - avgHours) * (parseFloat(a.assignment?.stundenlohn) || 0), 0)) });
    }
  }
  const topAssignments = scored.filter(a => a.profitMargin > 40).sort((a, b) => b.profit - a.profit);
  if (topAssignments.length > 0) {
    recommendations.push({ type: 'scale_top', priority: 'low', title: `${topAssignments.length} Top-Termin${topAssignments.length > 1 ? 'e' : ''}`, description: 'Mehr davon annehmen!', action: 'Ähnliche Projekte aktiv akquirieren', potential: formatCurrency(topAssignments.reduce((s, a) => s + a.profit, 0)) });
  }
  if (employees.length > 0) {
    const empScores = calculateAllEmployeeScores(employees, assignments);
    const lossEmployees = empScores.filter(e => e.profit < 0);
    if (lossEmployees.length > 0) {
      recommendations.push({ type: 'employee_cost', priority: 'medium', title: `${lossEmployees.length} MA mit Verlust`, description: lossEmployees.map(e => `${e.name}: ${formatCurrency(e.profit)}`).join(', '), action: 'Stundensatz prüfen oder MA anders einsetzen', potential: formatCurrency(lossEmployees.reduce((s, e) => s + Math.abs(e.profit), 0)) });
    }
  }
  const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  recommendations.sort((a, b) => (priorityOrder[a.priority] || 0) - (priorityOrder[b.priority] || 0));
  return recommendations;
}

export function generateEmployeeRanking(employees: any[], assignments: any[]) {
  if (!employees || employees.length === 0) return [];
  return calculateAllEmployeeScores(employees, assignments).map((s, i) => ({
    rank: i + 1, name: s.name, grade: s.grade, gradeColor: s.gradeColor, gradeBg: s.gradeBg,
    profit: s.profit, profitMargin: s.profitMargin, totalRevenue: s.totalRevenue, totalCost: s.totalCost,
    totalHours: s.totalHours, efficiency: s.efficiency, assignmentCount: s.assignmentCount,
  }));
}

export function generateCustomerRanking(customers: any[], assignments: any[]) {
  if (!customers || customers.length === 0) return [];
  return calculateAllCustomerScores(customers, assignments).map((s, i) => ({
    rank: i + 1, name: s.name, grade: s.grade, gradeColor: s.gradeColor, gradeBg: s.gradeBg,
    profit: s.profit, profitMargin: s.profitMargin, totalRevenue: s.totalRevenue, totalCost: s.totalCost,
    totalHours: s.totalHours, avgRate: s.avgRate, assignmentCount: s.assignmentCount,
  }));
}

export function generateAssignmentRanking(assignments: any[]) {
  if (!assignments || assignments.length === 0) return [];
  return assignments.map(a => calculateAssignmentProfitScore(a))
    .sort((a, b) => b.profit - a.profit)
    .map((a, i) => ({ rank: i + 1, kunde: a.kunde, projekt: a.projekt, datum: a.datum, grade: a.grade, gradeColor: a.gradeColor, gradeBg: a.gradeBg, profit: a.profit, profitMargin: a.profitMargin, revenue: a.revenue, cost: a.cost, hours: a.hours }));
}

export function analyzeCustomerPricing(customerName: string, assignments: any[]) {
  const safeCustomerName = customerName || '';
  const customerAssignments = assignments.filter((a: any) => a.kunde && a.kunde.toLowerCase().includes(safeCustomerName.toLowerCase()));
  if (customerAssignments.length === 0) {
    return { avgHourlyRate: 0, avgMargin: 0, totalProjects: 0, totalRevenue: 0, totalHours: 0, trend: 'neutral' as string, trendPercentage: 0, recentRate: 0, olderRate: 0, message: null as string | null };
  }
  const totalRevenue = customerAssignments.reduce((s: number, a: any) => s + getRevenue(a), 0);
  const totalHours = customerAssignments.reduce((s: number, a: any) => s + getHours(a), 0);
  const totalCost = customerAssignments.reduce((s: number, a: any) => s + getCost(a), 0);
  const avgMargin = totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : 0;
  const sorted = customerAssignments.map((a: any) => ({ ...a, _date: parseDate(a.datum) })).filter((a: any) => a._date).sort((a: any, b: any) => b._date - a._date);
  const threeMonthsAgo = new Date(); threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const sixMonthsAgo = new Date(); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const recent = sorted.filter((a: any) => a._date >= threeMonthsAgo);
  const older = sorted.filter((a: any) => a._date >= sixMonthsAgo && a._date < threeMonthsAgo);
  const recentRate = recent.length > 0 ? recent.reduce((s: number, a: any) => s + getRevenue(a), 0) / recent.reduce((s: number, a: any) => s + getHours(a), 0) : 0;
  const olderRate = older.length > 0 ? older.reduce((s: number, a: any) => s + getRevenue(a), 0) / older.reduce((s: number, a: any) => s + getHours(a), 0) : recentRate;
  let trend = 'neutral'; let trendPercentage = 0;
  if (olderRate > 0) { trendPercentage = ((recentRate - olderRate) / olderRate) * 100; if (trendPercentage > 5) trend = 'up'; else if (trendPercentage < -5) trend = 'down'; }
  let message: string | null = null;
  if (customerAssignments.length >= 3) {
    if (avgMargin < 15) message = `Ø Marge nur ${avgMargin.toFixed(0)}%`;
    else if (avgMargin < 25) message = `Marge ${avgMargin.toFixed(0)}% ausbaufähig`;
    else message = `Sehr gut! ${avgMargin.toFixed(0)}% Marge`;
  }
  return { avgHourlyRate: totalHours > 0 ? totalRevenue / totalHours : 0, avgMargin, totalProjects: customerAssignments.length, totalRevenue, totalHours, trend, trendPercentage, recentRate, olderRate, message };
}
