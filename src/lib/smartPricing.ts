import { formatCurrency } from './calculations';
import { Assignment, Employee } from './types';

interface EmployeeScore {
  name: string;
  grade: string;
  gradeColor: string;
  gradeBg: string;
  profit: number;
  profitMargin: number;
  totalRevenue: number;
  totalCost: number;
  totalHours: number;
  assignmentCount: number;
  efficiency: number;
}

interface AssignmentScore {
  id: string;
  kunde: string;
  projekt: string;
  datum: string;
  status?: string;
  hours: number;
  revenue: number;
  cost: number;
  profit: number;
  profitMargin: number;
  efficiency: number;
  grade: string;
  gradeColor: string;
  gradeBg: string;
  score: number;
}

interface DashboardSummary {
  totalRevenue: number;
  totalCost: number;
  netProfit: number;
  totalProfit: number;
  totalLoss: number;
  avgMargin: number;
  assignmentCount: number;
  gradeDistribution: Record<string, number>;
  profitableCount: number;
  lossCount: number;
}

interface Recommendation {
  type: string;
  icon: string;
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  action: string;
  potential: string;
  assignmentId?: string;
}

function getRevenue(a: Assignment): number {
  if (typeof a.umsatz === 'string') {
    const raw = a.umsatz.replace(/[€\s]/g, '').trim();
    if (!raw) return 0;
    if (raw.includes(',') && raw.includes('.')) return parseFloat(raw.replace(/\./g, '').replace(',', '.')) || 0;
    if (raw.includes(',') && !raw.includes('.')) return parseFloat(raw.replace(',', '.')) || 0;
    return parseFloat(raw) || 0;
  }
  return parseFloat(String(a.umsatz)) || 0;
}

function getCost(a: Assignment): number {
  const h = parseFloat(String(a.stunden)) || 0;
  const r = parseFloat(String(a.stundenlohn)) || 0;
  return h * r;
}

function getHours(a: Assignment): number {
  return parseFloat(String(a.stunden)) || 0;
}

function getGrade(margin: number): string {
  if (margin > 50) return 'A+';
  if (margin >= 40) return 'A';
  if (margin >= 25) return 'B';
  if (margin >= 10) return 'C';
  if (margin >= 0) return 'D';
  return 'F';
}

function getGradeColor(grade: string): string {
  const colors: Record<string, string> = {
    'A+': '#16a34a', 'A': '#22c55e', 'B': '#84cc16',
    'C': '#f59e0b', 'D': '#f97316', 'F': '#ef4444', '–': '#94a3b8',
  };
  return colors[grade] || '#94a3b8';
}

function getGradeBg(grade: string): string {
  const colors: Record<string, string> = {
    'A+': '#dcfce7', 'A': '#f0fdf4', 'B': '#ecfccb',
    'C': '#fef3c7', 'D': '#ffedd5', 'F': '#fee2e2', '–': '#f1f5f9',
  };
  return colors[grade] || '#f1f5f9';
}

function clamp(val: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, val));
}

export function calculateAssignmentProfitScore(assignment: Assignment): AssignmentScore {
  const hours = getHours(assignment);
  const revenue = getRevenue(assignment);
  const cost = getCost(assignment);
  const profit = revenue - cost;
  const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0;
  const grade = getGrade(profitMargin);

  return {
    id: assignment.id,
    kunde: assignment.kunde || '',
    projekt: assignment.projekt || '',
    datum: assignment.datum || '',
    status: assignment.status || '',
    hours,
    revenue,
    cost,
    profit,
    profitMargin,
    efficiency: hours > 0 ? revenue / hours : 0,
    grade,
    gradeColor: getGradeColor(grade),
    gradeBg: getGradeBg(grade),
    score: clamp(Math.round(profitMargin * 1.5), 0, 100),
  };
}

export function calculateDashboardSummary(assignments: Assignment[]): DashboardSummary {
  if (!assignments || assignments.length === 0) {
    return {
      totalRevenue: 0, totalCost: 0, netProfit: 0, totalProfit: 0, totalLoss: 0,
      avgMargin: 0, assignmentCount: 0,
      gradeDistribution: { 'A+': 0, 'A': 0, 'B': 0, 'C': 0, 'D': 0, 'F': 0 },
      profitableCount: 0, lossCount: 0,
    };
  }

  const scored = assignments.map(a => calculateAssignmentProfitScore(a));
  const totalRevenue = scored.reduce((s, a) => s + a.revenue, 0);
  const totalCost = scored.reduce((s, a) => s + a.cost, 0);
  const totalProfit = scored.filter(a => a.profit > 0).reduce((s, a) => s + a.profit, 0);
  const totalLoss = scored.filter(a => a.profit < 0).reduce((s, a) => s + Math.abs(a.profit), 0);
  const netProfit = totalRevenue - totalCost;
  const avgMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
  const profitableCount = scored.filter(a => a.profit > 0).length;
  const lossCount = scored.filter(a => a.profit < 0).length;

  const gradeDistribution: Record<string, number> = { 'A+': 0, 'A': 0, 'B': 0, 'C': 0, 'D': 0, 'F': 0 };
  scored.forEach(a => { if (gradeDistribution[a.grade] !== undefined) gradeDistribution[a.grade]++; });

  return {
    totalRevenue, totalCost, netProfit, totalProfit, totalLoss,
    avgMargin, assignmentCount: assignments.length, gradeDistribution,
    profitableCount, lossCount,
  };
}

export function generateEmployeeRanking(employees: Employee[], assignments: Assignment[]) {
  if (!employees || employees.length === 0) return [];

  const scores = employees.map(emp => {
    const name = emp.name;
    const rate = parseFloat(String(emp.stundenlohn)) || 0;
    const empAssignments = assignments.filter(a => {
      const names = Array.isArray(a.mitarbeiter)
        ? a.mitarbeiter.map(n => n.trim()).filter(Boolean)
        : (a.mitarbeiter || '').split(',').map(n => n.trim()).filter(Boolean);
      return names.includes(name);
    });

    if (empAssignments.length === 0) {
      return { rank: 0, name, grade: '–', gradeColor: '#94a3b8', gradeBg: '#f1f5f9',
        profit: 0, profitMargin: 0, totalRevenue: 0, totalCost: 0, totalHours: 0,
        efficiency: 0, assignmentCount: 0 };
    }

    const totalHours = empAssignments.reduce((sum, a) => sum + getHours(a), 0);
    const totalCost = totalHours * rate;
    let totalRevenue = 0;
    empAssignments.forEach(a => {
      const names = Array.isArray(a.mitarbeiter)
        ? a.mitarbeiter.map(n => n.trim()).filter(Boolean)
        : (a.mitarbeiter || '').split(',').map(n => n.trim()).filter(Boolean);
      const split = names.length > 0 ? 1 / names.length : 1;
      totalRevenue += getRevenue(a) * split;
    });

    const profit = totalRevenue - totalCost;
    const profitMargin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;
    const grade = getGrade(profitMargin);

    return {
      rank: 0, name, grade, gradeColor: getGradeColor(grade), gradeBg: getGradeBg(grade),
      profit, profitMargin, totalRevenue, totalCost, totalHours,
      efficiency: totalHours > 0 ? totalRevenue / totalHours : 0,
      assignmentCount: empAssignments.length,
    };
  });

  return scores
    .sort((a, b) => b.profit - a.profit)
    .map((s, i) => ({ ...s, rank: i + 1 }));
}

export function generateAssignmentRanking(assignments: Assignment[]) {
  if (!assignments || assignments.length === 0) return [];
  const scored = assignments.map(a => calculateAssignmentProfitScore(a));
  return [...scored]
    .sort((a, b) => b.profit - a.profit)
    .map((a, i) => ({
      rank: i + 1, id: a.id, kunde: a.kunde, projekt: a.projekt, datum: a.datum,
      grade: a.grade, gradeColor: a.gradeColor, gradeBg: a.gradeBg,
      profit: a.profit, profitMargin: a.profitMargin, revenue: a.revenue,
      cost: a.cost, hours: a.hours,
    }));
}

export function generateActionRecommendations(assignments: Assignment[], employees: Employee[] = []): Recommendation[] {
  if (!assignments || assignments.length === 0) return [];

  const scored = assignments.map(a => calculateAssignmentProfitScore(a));
  const summary = calculateDashboardSummary(assignments);
  const recommendations: Recommendation[] = [];

  const lossAssignments = scored.filter(a => a.profit < 0).sort((a, b) => a.profit - b.profit);
  if (lossAssignments.length > 0) {
    const totalLoss = lossAssignments.reduce((s, a) => s + Math.abs(a.profit), 0);
    recommendations.push({
      type: 'loss_alert', icon: '🔴', priority: 'high',
      title: `${lossAssignments.length} Verlust-Einsatz${lossAssignments.length > 1 ? 'e' : ''}`,
      description: `Du verlierst ${formatCurrency(totalLoss)} bei diesen Einsätzen.`,
      action: 'Preise sofort anpassen oder MA wechseln',
      potential: formatCurrency(totalLoss * 0.6),
    });
  }

  const lowMargin = scored.filter(a => a.profitMargin > 0 && a.profitMargin < 15);
  if (lowMargin.length > 0) {
    const avgLowMargin = lowMargin.reduce((s, a) => s + a.profitMargin, 0) / lowMargin.length;
    recommendations.push({
      type: 'low_margin', icon: '🟡', priority: 'high',
      title: `${lowMargin.length} Einsatz${lowMargin.length > 1 ? 'e' : ''} mit niedriger Marge`,
      description: `Ø Marge nur ${avgLowMargin.toFixed(1)}%. Ziel: mindestens 20%.`,
      action: 'Preise um 15-25% erhöhen',
      potential: formatCurrency(lowMargin.reduce((s, a) => s + a.revenue * 0.15, 0)),
    });
  }

  lossAssignments.slice(0, 3).forEach(a => {
    const requiredPrice = a.cost * 1.2;
    const increase = requiredPrice - a.revenue;
    recommendations.push({
      type: 'price_fix', icon: '💰', priority: 'high',
      title: `${a.kunde || a.projekt}: Preis erhöhen`,
      description: `Aktuell: ${formatCurrency(a.revenue)} | Benötigt: ${formatCurrency(requiredPrice)}`,
      action: `+${formatCurrency(increase)} für 20% Marge`,
      potential: formatCurrency(increase),
      assignmentId: a.id,
    });
  });

  if (assignments.length > 0) {
    const avgHours = assignments.reduce((s, a) => s + getHours(a), 0) / assignments.length;
    const longLosses = lossAssignments.filter(a => a.hours > avgHours);
    if (longLosses.length > 0) {
      const potential = longLosses.reduce((s, a) => s + (a.hours - avgHours) * (parseFloat(String(a.id)) || 0), 0);
      recommendations.push({
        type: 'duration', icon: '⏱', priority: 'medium',
        title: `${longLosses.length} Einsatz${longLosses.length > 1 ? 'e' : ''} zu lang`,
        description: `Ø Dauer ist ${avgHours.toFixed(1)}h.`,
        action: 'Dauer um 20-30% reduzieren',
        potential: formatCurrency(potential || 0),
      });
    }
  }

  const topAssignments = scored.filter(a => a.profitMargin > 40).sort((a, b) => b.profit - a.profit);
  if (topAssignments.length > 0) {
    recommendations.push({
      type: 'scale_top', icon: '🚀', priority: 'low',
      title: `${topAssignments.length} Top-Einsatz${topAssignments.length > 1 ? 'e' : ''} (≥40% Marge)`,
      description: 'Diese Einsätze sind sehr profitabel. Mehr davon annehmen!',
      action: 'Ähnliche Projekte aktiv akquirieren',
      potential: formatCurrency(topAssignments.reduce((s, a) => s + a.profit, 0)),
    });
  }

  const priorityOrder = { high: 0, medium: 1, low: 2 };
  recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return recommendations;
}

export { getGrade, getGradeColor, getGradeBg };
