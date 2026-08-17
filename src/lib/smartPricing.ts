import { formatCurrency, calculateRevenue, parseDate, getMaterialSum, getMaterialCost, getTravelFee, calculateOverheadCost, parseNum, priceForTargetMargin } from './calculations';

// Umsatz = Dienstleistung + Material-VK (wird dem Kunden berechnet) + Anfahrtspauschale.
// Zusammen mit Material-EK in den Kosten wirkt der Aufschlag (VK−EK) im Gewinn.
const getRevenue = (a: any): number => calculateRevenue(a.umsatz) + getMaterialSum(a) + getTravelFee(a);

const getCost = (a: any): number => {
  return parseNum(a.stunden) * parseNum(a.stundenlohn);
};

const getHours = (a: any): number => parseNum(a.stunden);

export function getGrade(margin: number): string {
  if (margin > 50) return 'A+';
  if (margin >= 40) return 'A';
  if (margin >= 25) return 'B';
  if (margin >= 10) return 'C';
  if (margin >= 0) return 'D';
  return 'F';
}

const GRADE_RANK: Record<string, number> = { 'F': 0, 'D': 1, 'C': 2, 'B': 3, 'A': 4, 'A+': 5, '–': -1 };

// Nächste Note + Ziel-Marge für die Handlungsempfehlung (analyzeRootCause /
// analyzeEstimateRootCause). F zielt bewusst auf C (20%) statt auf D (0%) –
// „gerade so aus den roten Zahlen" ist keine sinnvolle Empfehlung. Identisch
// zur Mobile-App (utils/smartPricing.js).
const NEXT_GRADE_STEPS: { grade: string; nextGrade: string; nextMargin: number }[] = [
  { grade: 'F', nextGrade: 'C', nextMargin: 20 },
  { grade: 'D', nextGrade: 'C', nextMargin: 10 },
  { grade: 'C', nextGrade: 'B', nextMargin: 25 },
  { grade: 'B', nextGrade: 'A', nextMargin: 40 },
  { grade: 'A', nextGrade: 'A+', nextMargin: 50.01 },
];
const nextGradeStep = (grade: string) => NEXT_GRADE_STEPS.find(s => s.grade === grade) ?? null;

// Sortierung für Rankings: erst Note, dann Marge, dann absoluter Gewinn (identisch
// zur Mobile-App). Vorher nur nach Euro-Gewinn sortiert → widersprach der Note.
// Exportiert, damit Seiten mit eigenen Feldnamen (Dashboard) dieselbe Reihenfolge
// benutzen können, statt sich eine zweite Sortierung zu bauen.
// Achtung: erwartet Objekte mit `grade`/`profitMargin`/`profit` – also die Rückgaben
// der Score-Funktionen, nicht bereits umbenannte View-Objekte.
export function byScoreThenProfit(a: any, b: any) {
  const ga = GRADE_RANK[a.grade] ?? -1;
  const gb = GRADE_RANK[b.grade] ?? -1;
  if (gb !== ga) return gb - ga;
  const ma = Number(a.profitMargin) || 0;
  const mb = Number(b.profitMargin) || 0;
  if (mb !== ma) return mb - ma;
  return (Number(b.profit) || 0) - (Number(a.profit) || 0);
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

export function calculateAssignmentProfitScore(assignment: any, overheadPercent: number | string = 0) {
  const hours = getHours(assignment);
  // Material: VK im Umsatz (via getRevenue), EK in den Kosten –
  // identisch zur Mobile-App (utils/smartPricing.js).
  const materialSum = getMaterialSum(assignment);
  const revenue = getRevenue(assignment);
  const overheadCost = calculateOverheadCost(revenue, overheadPercent);
  const cost = getCost(assignment) + getMaterialCost(assignment) + overheadCost;
  const profit = revenue - cost;
  // Bei revenue = 0 aber cost > 0 liegt ein realer Verlust vor → Note F statt D (0 %).
  const profitMargin = revenue > 0 ? (profit / revenue) * 100 : (cost > 0 ? -100 : 0);
  const efficiency = hours > 0 ? revenue / hours : 0;
  const grade = getGrade(profitMargin);
  // Datenqualität: fehlende Stunden oder fehlender Stundenlohn machen die Kosten 0
  // und blähen die Note künstlich auf A+ auf. Flag für den UI-Hinweis
  // "Daten unvollständig" (identisch zu utils/smartPricing.js in der Mobile-App).
  const dataComplete = hours > 0 && parseNum(assignment.stundenlohn) > 0;
  return {
    id: assignment.id, kunde: assignment.kunde || '', projekt: assignment.projekt || '',
    datum: assignment.datum || '', status: assignment.status || '', hours, revenue, cost,
    profit, profitMargin, efficiency, grade, overheadCost, materialSum, dataComplete,
    // Direktkosten ohne Gemeinkosten – Basis für priceForTargetMargin, das die
    // mitwachsenden Gemeinkosten selbst einrechnet.
    directCost: cost - overheadCost,
    gradeColor: getGradeColor(grade), gradeBg: getGradeBg(grade),
    score: Math.max(0, Math.min(100, Math.round(profitMargin * 1.5))),
  };
}

// Kostenanteil eines Mitarbeiters an einem gemeinsamen Einsatz – nach Stundenlohn
// gewichtet statt pauschal geteilt, sonst bekommen ein teurer und ein günstiger
// Mitarbeiter zwangsläufig dieselbe Note. Die Anteile summieren sich auf 1, damit
// Σ Mitarbeiter-Kosten weiterhin die Einsatz-Kosten ergibt.
// Ist auch nur ein Satz unbekannt → gleichmäßig teilen (ein Anteil von 0 würde
// dem Mitarbeiter sonst 0 € Kosten und damit fälschlich A+ geben).
// Identisch zu utils/smartPricing.js in der Mobile-App.
function employeeCostShare(names: string[], employeeName: string, rateOf: (n: string) => number): number {
  if (names.length <= 1) return 1;
  const rates = names.map(n => rateOf(n));
  if (rates.some(r => !(r > 0))) return 1 / names.length;
  return rateOf(employeeName) / rates.reduce((s, r) => s + r, 0);
}

// ratesByName: { [Mitarbeitername]: Stundenlohn } – nötig für die Gewichtung oben.
// Fehlt die Map (Einzelaufruf aus einer Seite), bleibt es beim gleichmäßigen Split.
export function calculateEmployeeProfitScore(employeeName: string, employee: any, assignments: any[], overheadPercent: number | string = 0, ratesByName: Record<string, number> | null = null) {
  const rate = parseNum(employee?.stundenlohn);
  const rateOf = (name: string) => (name === employeeName ? rate : parseNum(ratesByName?.[name]));
  const empAssignments = assignments.filter((a: any) => {
    const names = Array.isArray(a.mitarbeiter)
      ? a.mitarbeiter.map((n: string) => n.trim()).filter(Boolean)
      : (a.mitarbeiter || '').split(',').map((n: string) => n.trim()).filter(Boolean);
    return names.includes(employeeName);
  });
  if (empAssignments.length === 0) {
    return { name: employeeName, score: 0, grade: '–', gradeColor: '#94a3b8', gradeBg: '#f1f5f9', profit: 0, profitMargin: 0, totalRevenue: 0, totalCost: 0, totalHours: 0, assignmentCount: 0, efficiency: 0, avgHourlyRate: rate, overheadCost: 0, directCost: 0 };
  }
  // Umsatz, Material-EK UND Stunden anteilig auf die zugewiesenen Mitarbeiter
  // aufteilen (identisch zur Mobile-App). Nur den Umsatz zu teilen, aber die
  // Stunden (Kosten) voll anzusetzen, kollabiert den Gewinn bei 2-MA-Einsätzen.
  let totalHours = 0;
  let totalCost = 0;
  let totalRevenue = 0;
  empAssignments.forEach((a: any) => {
    const names = Array.isArray(a.mitarbeiter)
      ? a.mitarbeiter.map((n: string) => n.trim()).filter(Boolean)
      : (a.mitarbeiter || '').split(',').map((n: string) => n.trim()).filter(Boolean);
    const split = names.length > 0 ? 1 / names.length : 1;
    // Umsatz und Stunden gleichmäßig, Kosten nach Stundenlohn gewichtet.
    const costSplit = names.length > 0 ? employeeCostShare(names, employeeName, rateOf) : 1;
    totalHours += getHours(a) * split;
    totalRevenue += getRevenue(a) * split;
    totalCost += (getCost(a) + getMaterialCost(a)) * costSplit;
  });
  // Gemeinkosten auf den (bereits anteiligen) Umsatz – linear, daher am Ende einmal.
  const overheadCost = calculateOverheadCost(totalRevenue, overheadPercent);
  totalCost += overheadCost;
  const profit = totalRevenue - totalCost;
  // Reale Kosten ohne Umsatz = Verlust → Note F statt fälschlich D (0 %).
  const profitMargin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : (totalCost > 0 ? -100 : 0);
  const grade = getGrade(profitMargin);
  return { name: employeeName, score: Math.max(0, Math.min(100, Math.round(profitMargin * 1.5))), grade, gradeColor: getGradeColor(grade), gradeBg: getGradeBg(grade), profit, profitMargin, totalRevenue, totalCost, totalHours, assignmentCount: empAssignments.length, efficiency: totalHours > 0 ? totalRevenue / totalHours : 0, avgHourlyRate: rate, overheadCost, directCost: totalCost - overheadCost };
}

export function calculateAllEmployeeScores(employees: any[], assignments: any[], overheadPercent: number | string = 0) {
  if (!employees || employees.length === 0) return [];
  // Satz-Map einmal bauen, damit jeder Score die Sätze der Kollegen kennt.
  const ratesByName: Record<string, number> = {};
  employees.forEach((emp: any) => { if (emp?.name) ratesByName[emp.name] = parseNum(emp.stundenlohn); });
  const scores = employees.map((emp: any) => calculateEmployeeProfitScore(emp.name, emp, assignments, overheadPercent, ratesByName));
  const maxHours = Math.max(...scores.map(s => s.totalHours), 1);
  scores.forEach(s => { (s as any).utilization = s.totalHours / maxHours; });
  return scores.sort(byScoreThenProfit);
}

export function calculateCustomerProfitScore(customer: any, assignments: any[], overheadPercent: number | string = 0) {
  const customerName = typeof customer === 'string' ? customer : (customer ? customer.name : '');
  const custAssignments = assignments.filter((a: any) => (a.kunde || '').trim().toLowerCase() === customerName.toLowerCase());
  if (custAssignments.length === 0) {
    return { name: customerName, score: 0, grade: '–', gradeColor: '#94a3b8', gradeBg: '#f1f5f9', profit: 0, profitMargin: 0, totalRevenue: 0, totalCost: 0, totalHours: 0, assignmentCount: 0, avgMargin: 0, avgRate: 0, overheadCost: 0, directCost: 0 };
  }
  const totalHours = custAssignments.reduce((sum: number, a: any) => sum + getHours(a), 0);
  const totalRevenue = custAssignments.reduce((sum: number, a: any) => sum + getRevenue(a), 0);
  const directCost = custAssignments.reduce((sum: number, a: any) => sum + getCost(a) + getMaterialCost(a), 0);
  const overheadCost = calculateOverheadCost(totalRevenue, overheadPercent);
  const totalCost = directCost + overheadCost;
  const profit = totalRevenue - totalCost;
  // Reale Kosten ohne Umsatz = Verlust → Note F statt fälschlich D (0 %).
  const profitMargin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : (totalCost > 0 ? -100 : 0);
  const grade = getGrade(profitMargin);
  // "Ø Marge" = umsatzgewichtete Gesamtmarge (identisch zur Dashboard-Semantik).
  return { name: customerName, score: Math.max(0, Math.min(100, Math.round(profitMargin * 1.5))), grade, gradeColor: getGradeColor(grade), gradeBg: getGradeBg(grade), profit, profitMargin, totalRevenue, totalCost, totalHours, assignmentCount: custAssignments.length, avgMargin: profitMargin, avgRate: totalHours > 0 ? totalRevenue / totalHours : 0, overheadCost, directCost };
}

export function calculateAllCustomerScores(customers: any[], assignments: any[], overheadPercent: number | string = 0) {
  if (!customers || customers.length === 0) return [];
  const scores = customers.map((c: any) => calculateCustomerProfitScore(c, assignments, overheadPercent));
  return scores.sort(byScoreThenProfit);
}

export function calculateDashboardSummary(assignments: any[], overheadPercent: number | string = 0) {
  if (!assignments || assignments.length === 0) {
    return { totalRevenue: 0, totalCost: 0, totalProfit: 0, totalLoss: 0, netProfit: 0, avgMargin: 0, assignmentCount: 0, gradeDistribution: { 'A+': 0, 'A': 0, 'B': 0, 'C': 0, 'D': 0, 'F': 0 }, profitableCount: 0, lossCount: 0 };
  }
  const scored = assignments.map(a => calculateAssignmentProfitScore(a, overheadPercent));
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

export function analyzeRootCause(assignment: any, allAssignments: any[] = [], overheadPercent: number | string = 0) {
  const scored = calculateAssignmentProfitScore(assignment, overheadPercent);
  const reasons: string[] = [];
  const suggestions: string[] = [];
  const primaryActions: { type: string; text: string; potential: number; targetGrade: string }[] = [];
  const avgHours = allAssignments.length > 0
    ? allAssignments.reduce((s, a) => s + getHours(a), 0) / allAssignments.length
    : 8;
  let requiredPrice = 0;

  if (scored.hours === 0 && scored.revenue > 0) {
    const estCost = avgHours * parseNum(assignment.stundenlohn);
    requiredPrice = priceForTargetMargin(estCost, overheadPercent) ?? 0;
    suggestions.push(`Gib die geschätzten Stunden ein für eine genaue Marge-Berechnung`);
    suggestions.push(`Durchschnittliche Termindauer: ~${Math.round(avgHours * 10) / 10}h`);
    if (requiredPrice > scored.revenue) {
      suggestions.push(`Bei Ø-Dauer wären ${formatCurrency(requiredPrice)} nötig für 20% Marge`);
    }
    return { isLoss: false, grade: null, nextGrade: null, isTopGrade: false, affirmation: null, reasons, suggestions, primaryActions, requiredPrice, currentMargin: 0 };
  }

  const isLoss = scored.profit < 0;

  if (scored.hours > avgHours * 1.3) {
    reasons.push('Termindauer deutlich über Durchschnitt');
    suggestions.push(`Dauer von ${scored.hours.toFixed(1)}h auf ~${Math.round(avgHours * 10) / 10}h reduzieren`);
  }

  const rate = parseNum(assignment.stundenlohn);
  if (allAssignments.length > 0) {
    const avgRate = allAssignments.reduce((s, a) => s + parseNum(a.stundenlohn), 0) / allAssignments.length;
    if (rate > avgRate * 1.4) {
      reasons.push('Mitarbeiter-Stundenlohn überdurchschnittlich hoch');
      suggestions.push(`Günstigeren MA einsetzen (Ø ${formatCurrency(avgRate)}/h)`);
    }
  }

  if (scored.cost > scored.revenue * 0.8 && scored.revenue > 0) {
    reasons.push('Kosten > 80% des Umsatzes');
    suggestions.push('Kostenstruktur prüfen: Weniger MA oder kürzere Dauer');
  }

  if (isLoss) reasons.push('Preis zu niedrig für die geleistete Arbeit');

  // Hebel Richtung nächster Note (Preis / Kosten / Dauer) – für jede Marge, nicht
  // nur bei Verlust. Ersetzt das alte, immer feste 20%-Ziel (das teils selbst bei
  // ausreichend hoher Marge das falsche Ziel war, z.B. 12% Marge braucht 25% für
  // Note B, nicht 20%).
  const step = nextGradeStep(scored.grade);
  if (step && (scored.revenue > 0 || scored.cost > 0)) {
    const targetFraction = step.nextMargin / 100;
    const priceTarget = priceForTargetMargin(scored.directCost, overheadPercent, targetFraction);
    if (isLoss) requiredPrice = priceTarget ?? 0;

    if (priceTarget != null && priceTarget > scored.revenue) {
      const priceIncrease = priceTarget - scored.revenue;
      const text = `Preis auf ${formatCurrency(priceTarget)} erhöhen (+${formatCurrency(priceIncrease)}) → Note ${step.nextGrade}`;
      suggestions.push(text);
      primaryActions.push({ type: 'price', text, potential: priceIncrease, targetGrade: step.nextGrade });
    } else if (priceTarget == null && scored.directCost > 0) {
      suggestions.push(`Note ${step.nextGrade} ist mit der eingestellten Gemeinkosten-Quote nicht erreichbar – Quote oder Kosten prüfen`);
    }

    if (scored.revenue > 0) {
      const neededCost = scored.revenue * (1 - targetFraction);
      const costReduction = scored.cost - neededCost;
      if (costReduction > 0 && costReduction < scored.cost) {
        const text = `Kosten um ${formatCurrency(costReduction)} senken → Note ${step.nextGrade}`;
        suggestions.push(text);
        primaryActions.push({ type: 'cost', text, potential: costReduction, targetGrade: step.nextGrade });

        if (rate > 0) {
          const hoursReduction = costReduction / rate;
          if (hoursReduction > 0 && hoursReduction < scored.hours) {
            const targetHours = scored.hours - hoursReduction;
            const text2 = `Dauer von ${scored.hours.toFixed(1)}h auf ~${targetHours.toFixed(1)}h reduzieren → Note ${step.nextGrade}`;
            suggestions.push(text2);
            primaryActions.push({ type: 'duration', text: text2, potential: costReduction, targetGrade: step.nextGrade });
          }
        }
      }
    }
  }

  const isTopGrade = scored.grade === 'A+';

  return {
    isLoss,
    grade: scored.grade,
    nextGrade: step ? step.nextGrade : null,
    isTopGrade,
    affirmation: isTopGrade ? 'Top-Marge – genau solche Aufträge öfter annehmen.' : null,
    reasons,
    suggestions,
    primaryActions,
    requiredPrice,
    currentMargin: scored.profitMargin,
  };
}

// Hebel Richtung nächster Note für AGGREGATE (Kunde/Mitarbeiter über alle ihre
// Einsätze) – dieselbe Next-Grade-Logik wie analyzeRootCause, ohne die
// einsatzspezifischen Checks (Dauer, MA-Stundenlohn-Vergleich). Erwartet das
// Ergebnis von calculateCustomerProfitScore / calculateEmployeeProfitScore.
// Identisch zur Mobile-App (utils/smartPricing.js).
export function analyzeAggregateRootCause(scored: any, overheadPercent: number | string = 0) {
  const primaryActions: { type: string; text: string; potential: number; targetGrade: string }[] = [];
  const step = nextGradeStep(scored.grade);

  if (step && (scored.totalRevenue > 0 || scored.totalCost > 0)) {
    const targetFraction = step.nextMargin / 100;
    const priceTarget = priceForTargetMargin(scored.directCost, overheadPercent, targetFraction);

    if (priceTarget != null && priceTarget > scored.totalRevenue) {
      const priceIncrease = priceTarget - scored.totalRevenue;
      const text = `Umsatz um ${formatCurrency(priceIncrease)} steigern (z.B. höherer Satz oder mehr Aufträge) → Note ${step.nextGrade}`;
      primaryActions.push({ type: 'price', text, potential: priceIncrease, targetGrade: step.nextGrade });
    } else if (priceTarget == null && scored.directCost > 0) {
      primaryActions.push({ type: 'price', text: `Note ${step.nextGrade} ist mit der eingestellten Gemeinkosten-Quote nicht erreichbar – Quote oder Kosten prüfen`, potential: 0, targetGrade: step.nextGrade });
    }

    if (scored.totalRevenue > 0) {
      const neededCost = scored.totalRevenue * (1 - targetFraction);
      const costReduction = scored.totalCost - neededCost;
      if (costReduction > 0 && costReduction < scored.totalCost) {
        const text = `Kosten um ${formatCurrency(costReduction)} senken → Note ${step.nextGrade}`;
        primaryActions.push({ type: 'cost', text, potential: costReduction, targetGrade: step.nextGrade });
      }
    }
  }

  const isTopGrade = scored.grade === 'A+';

  return {
    grade: scored.grade,
    nextGrade: step ? step.nextGrade : null,
    isTopGrade,
    affirmation: isTopGrade ? 'Top-Wert – weiter so.' : null,
    primaryActions,
  };
}

export function generateActionRecommendations(assignments: any[], employees: any[] = [], overheadPercent: number | string = 0) {
  if (!assignments || assignments.length === 0) return [];
  const scored = assignments.map(a => calculateAssignmentProfitScore(a, overheadPercent));
  const recommendations: any[] = [];
  const lossAssignments = scored.filter(a => a.profit < 0).sort((a, b) => a.profit - b.profit);
  if (lossAssignments.length > 0) {
    const totalLoss = lossAssignments.reduce((s, a) => s + Math.abs(a.profit), 0);
    recommendations.push({ type: 'loss_alert', priority: 'high', title: `${lossAssignments.length} Verlust-Termin${lossAssignments.length > 1 ? 'e' : ''}`, description: `Du verlierst ${formatCurrency(totalLoss)} bei diesen Terminen.`, action: 'Preise sofort anpassen oder MA wechseln', potential: formatCurrency(totalLoss * 0.6), target: '/assignments', assignmentId: lossAssignments[0].id });
  }
  const lowMargin = scored.filter(a => a.profitMargin > 0 && a.profitMargin < 15);
  if (lowMargin.length > 0) {
    const avgLowMargin = lowMargin.reduce((s, a) => s + a.profitMargin, 0) / lowMargin.length;
    recommendations.push({ type: 'low_margin', priority: 'high', title: `${lowMargin.length} Termin${lowMargin.length > 1 ? 'e' : ''} mit niedriger Marge`, description: `Ø Marge nur ${avgLowMargin.toFixed(1)}%. Ziel: mindestens 20%.`, action: 'Preise um 15-25% erhöhen', potential: formatCurrency(lowMargin.reduce((s, a) => s + a.revenue * 0.15, 0)), target: '/assignments', assignmentId: lowMargin[0].id });
  }
  lossAssignments.slice(0, 3).forEach((a: any) => {
    const requiredPrice = priceForTargetMargin(a.directCost, overheadPercent);
    // Nicht erreichbar (Quote ≥ 80 %) → keine Preis-Empfehlung ausspielen.
    if (requiredPrice == null) return;
    recommendations.push({ type: 'price_fix', priority: 'high', title: `${a.kunde || a.projekt}: Preis erhöhen`, description: `Aktuell: ${formatCurrency(a.revenue)} | Benötigt: ${formatCurrency(requiredPrice)}`, action: `+${formatCurrency(requiredPrice - a.revenue)} für 20% Marge`, potential: formatCurrency(requiredPrice - a.revenue), target: '/assignments', assignmentId: a.id });
  });
  if (assignments.length > 0) {
    const avgHours = assignments.reduce((s, a) => s + getHours(a), 0) / assignments.length;
    const longLosses = lossAssignments.filter(a => a.hours > avgHours);
    if (longLosses.length > 0) {
      recommendations.push({ type: 'duration', priority: 'medium', title: `${longLosses.length} Termin${longLosses.length > 1 ? 'e' : ''} zu lang`, description: `Ø Dauer ist ${avgHours.toFixed(1)}h.`, action: 'Dauer um 20-30% reduzieren', potential: formatCurrency(longLosses.reduce((s, a: any) => {
        const orig = assignments.find((oa: any) => oa.id === a.id);
        const rate = parseNum(orig?.stundenlohn);
        return s + (a.hours - avgHours) * rate;
      }, 0)), target: '/assignments', assignmentId: longLosses[0].id });
    }
  }
  const topAssignments = scored.filter(a => a.profitMargin > 40).sort((a, b) => b.profit - a.profit);
  if (topAssignments.length > 0) {
    recommendations.push({ type: 'scale_top', priority: 'low', title: `${topAssignments.length} Top-Termin${topAssignments.length > 1 ? 'e' : ''}`, description: 'Mehr davon annehmen!', action: 'Ähnliche Projekte aktiv akquirieren', potential: formatCurrency(topAssignments.reduce((s, a) => s + a.profit, 0)), target: '/projects' });
  }
  if (employees.length > 0) {
    const empScores = calculateAllEmployeeScores(employees, assignments, overheadPercent);
    const lossEmployees = empScores.filter(e => e.profit < 0);
    if (lossEmployees.length > 0) {
      recommendations.push({ type: 'employee_cost', priority: 'medium', title: `${lossEmployees.length} MA mit Verlust`, description: lossEmployees.map(e => `${e.name}: ${formatCurrency(e.profit)}`).join(', '), action: 'Stundensatz prüfen oder MA anders einsetzen', potential: formatCurrency(lossEmployees.reduce((s, e) => s + Math.abs(e.profit), 0)), target: '/employees' });
    }
  }
  const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  recommendations.sort((a, b) => (priorityOrder[a.priority] || 0) - (priorityOrder[b.priority] || 0));
  return recommendations;
}

export function generateEmployeeRanking(employees: any[], assignments: any[], overheadPercent: number | string = 0) {
  if (!employees || employees.length === 0) return [];
  return calculateAllEmployeeScores(employees, assignments, overheadPercent).map((s, i) => ({
    rank: i + 1, name: s.name, grade: s.grade, gradeColor: s.gradeColor, gradeBg: s.gradeBg,
    profit: s.profit, profitMargin: s.profitMargin, totalRevenue: s.totalRevenue, totalCost: s.totalCost,
    totalHours: s.totalHours, efficiency: s.efficiency, assignmentCount: s.assignmentCount,
  }));
}

export function generateCustomerRanking(customers: any[], assignments: any[], overheadPercent: number | string = 0) {
  if (!customers || customers.length === 0) return [];
  return calculateAllCustomerScores(customers, assignments, overheadPercent).map((s, i) => ({
    rank: i + 1, name: s.name, grade: s.grade, gradeColor: s.gradeColor, gradeBg: s.gradeBg,
    profit: s.profit, profitMargin: s.profitMargin, totalRevenue: s.totalRevenue, totalCost: s.totalCost,
    totalHours: s.totalHours, avgRate: s.avgRate, assignmentCount: s.assignmentCount,
  }));
}

export function generateAssignmentRanking(assignments: any[], overheadPercent: number | string = 0) {
  if (!assignments || assignments.length === 0) return [];
  return assignments.map(a => calculateAssignmentProfitScore(a, overheadPercent))
    .sort(byScoreThenProfit)
    .map((a, i) => ({ rank: i + 1, kunde: a.kunde, projekt: a.projekt, datum: a.datum, grade: a.grade, gradeColor: a.gradeColor, gradeBg: a.gradeBg, profit: a.profit, profitMargin: a.profitMargin, revenue: a.revenue, cost: a.cost, hours: a.hours }));
}

export function analyzeCustomerPricing(customerName: string, assignments: any[]) {
  const safeCustomerName = customerName || '';
  const customerAssignments = assignments.filter((a: any) => a.kunde && a.kunde.toLowerCase() === safeCustomerName.toLowerCase());
  if (customerAssignments.length === 0) {
    return { avgHourlyRate: 0, avgMargin: 0, totalProjects: 0, totalRevenue: 0, totalHours: 0, trend: 'neutral' as string, trendPercentage: 0, recentRate: 0, olderRate: 0, message: null as string | null };
  }
  const totalRevenue = customerAssignments.reduce((s: number, a: any) => s + getRevenue(a), 0);
  const totalHours = customerAssignments.reduce((s: number, a: any) => s + getHours(a), 0);
  // Material-EK gehört zu den Kosten (VK steckt im Umsatz) – identisch zur Mobile-App.
  const totalCost = customerAssignments.reduce((s: number, a: any) => s + getCost(a) + getMaterialCost(a), 0);
  const avgMargin = totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : 0;
  const sorted = customerAssignments.map((a: any) => ({ ...a, _date: parseDate(a.datum) })).filter((a: any) => a._date).sort((a: any, b: any) => b._date - a._date);
  const threeMonthsAgo = new Date(); threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const sixMonthsAgo = new Date(); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const recent = sorted.filter((a: any) => a._date >= threeMonthsAgo);
  const older = sorted.filter((a: any) => a._date >= sixMonthsAgo && a._date < threeMonthsAgo);
  const recentHours = recent.reduce((s: number, a: any) => s + getHours(a), 0);
  const olderHours = older.reduce((s: number, a: any) => s + getHours(a), 0);
  const recentRate = recentHours > 0 ? recent.reduce((s: number, a: any) => s + getRevenue(a), 0) / recentHours : 0;
  const olderRate = olderHours > 0 ? older.reduce((s: number, a: any) => s + getRevenue(a), 0) / olderHours : recentRate;
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

// ─── ESTIMATE ROOT CAUSE (Kostenvoranschlag) ────────────────────────────────
// Ursachenanalyse für ANGEBOTE (vor dem Auftrag). Liefert Ursachen, Vorschläge,
// Zielpreis und Einsparpotenzial – identisch zur Mobile-App.
export function analyzeEstimateRootCause(estimateProfit: any, overheadPercent: number = 0) {
  const { profit, profitMargin, directCost, endPrice, overheadCost } = estimateProfit;
  const grade = getGrade(profitMargin);
  const step = nextGradeStep(grade);

  // Bereits Bestnote → keine Analyse nötig.
  if (!step) {
    return { grade, currentGrade: grade, isLow: false, isTopGrade: true, reasons: [] as any[], suggestions: [] as any[], targetPrice: null, potential: 0, currentMargin: profitMargin, targetGrade: grade };
  }

  const reasons: { text: string; detail: string; tone: string }[] = [];
  const suggestions: { text: string; detail: string; priceIncrease: number; tone: string }[] = [];
  const targetFraction = step.nextMargin / 100;

  if (profit < 0) {
    reasons.push({ text: 'Dieses Angebot macht Verlust', detail: `Du verlierst €${Math.abs(profit).toFixed(2)} auf diesem Auftrag.`, tone: 'bad' });
  }
  if (profitMargin > 0 && profitMargin < step.nextMargin) {
    reasons.push({ text: `Nur ${profitMargin.toFixed(1)}% Marge – unter dem Ziel für Note ${step.nextGrade}`, detail: `Für Note ${step.nextGrade} sollten mindestens ${step.nextMargin}% Marge angestrebt werden.`, tone: 'warn' });
  }
  if (endPrice > 0 && overheadCost > endPrice * 0.25) {
    reasons.push({ text: 'Gemeinkosten machen über 25% des Endpreises aus', detail: `Aktuell: €${overheadCost.toFixed(2)} (${((overheadCost / endPrice) * 100).toFixed(0)}%).`, tone: 'warn' });
  }
  if (profitMargin <= 0 && directCost > 0) {
    reasons.push({ text: 'Kein Gewinn aufgeschlagen', detail: 'Der Endpreis deckt nur die Kosten – ohne Gewinnpolster.', tone: 'bad' });
  }

  const targetPrice = directCost > 0 ? priceForTargetMargin(directCost, overheadPercent, targetFraction) : null;
  const potential = targetPrice != null ? targetPrice - endPrice : 0;

  if (targetPrice != null && potential > 0) {
    suggestions.push({ text: `Preis auf €${targetPrice.toFixed(2)} erhöhen`, detail: `+€${potential.toFixed(2)} mehr Umsatz → Note ${step.nextGrade} (${step.nextMargin}% Marge)`, priceIncrease: potential, tone: 'good' });
  } else if (targetPrice == null && directCost > 0) {
    suggestions.push({ text: `Gemeinkosten-Quote zu hoch für Note ${step.nextGrade}`, detail: 'Quote reduzieren oder Kosten senken.', priceIncrease: 0, tone: 'warn' });
  }

  if (directCost > 0 && endPrice > 0) {
    const neededCost = endPrice * (1 - targetFraction);
    const costSavings = directCost - neededCost;
    if (costSavings > 0 && costSavings < directCost) {
      suggestions.push({ text: `alternativ: Kosten um €${costSavings.toFixed(2)} senken`, detail: `Gleicher Effekt wie Preiserhöhung → Note ${step.nextGrade} – ohne den Kunden zu belasten.`, priceIncrease: 0, tone: 'neutral' });
    }
  }

  return { grade, isLow: true, isTopGrade: false, reasons, suggestions, targetPrice, potential, currentMargin: profitMargin, currentGrade: grade, targetGrade: step.nextGrade };
}

// ─── SAISONALE MUSTERERKENNUNG ──────────────────────────────────────────────
// Analysiert Margen-Muster nach Monat/Quartal – identisch zur Mobile-App.
export function analyzeSeasonalPatterns(assignments: any[], overheadPercent: number = 0) {
  if (!assignments || assignments.length < 3) {
    return { hasData: false, patterns: [], insight: null, bestMonth: null, worstMonth: null };
  }

  const monthNames = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  const monthBuckets: Record<string, { year: number; month: number; assignments: any[]; label: string }> = {};

  assignments.forEach((a: any) => {
    const d = parseDate(a.datum);
    if (!d) return;
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (!monthBuckets[key]) {
      monthBuckets[key] = { year: d.getFullYear(), month: d.getMonth(), assignments: [], label: monthNames[d.getMonth()] };
    }
    monthBuckets[key].assignments.push(a);
  });

  const monthData = Object.values(monthBuckets).map(bucket => {
    const summary = calculateDashboardSummary(bucket.assignments, overheadPercent);
    return {
      year: bucket.year,
      month: bucket.month,
      label: bucket.label,
      avgMargin: summary.avgMargin,
      netProfit: summary.netProfit,
      count: summary.assignmentCount,
      grade: getGrade(summary.avgMargin),
    };
  }).sort((a: any, b: any) => a.month - b.month);

  if (monthData.length < 2) {
    return { hasData: false, patterns: [], insight: null, bestMonth: null, worstMonth: null };
  }

  const avgByMonth: Record<number, number[]> = {};
  monthData.forEach((m: any) => {
    if (!avgByMonth[m.month]) avgByMonth[m.month] = [];
    avgByMonth[m.month].push(m.avgMargin);
  });

  const monthlyAvg = Object.entries(avgByMonth).map(([month, margins]) => ({
    month: parseInt(month),
    label: monthNames[parseInt(month)],
    avgMargin: margins.reduce((s: number, v: number) => s + v, 0) / margins.length,
    dataPoints: margins.length,
  }));

  const sorted = [...monthlyAvg].sort((a: any, b: any) => b.avgMargin - a.avgMargin);
  const bestMonth = sorted[0];
  const worstMonth = sorted[sorted.length - 1];

  const summerMonths = monthlyAvg.filter((m: any) => m.month >= 3 && m.month <= 8);
  const winterMonths = monthlyAvg.filter((m: any) => m.month < 3 || m.month > 8);
  const summerAvg = summerMonths.length > 0 ? summerMonths.reduce((s: number, m: any) => s + m.avgMargin, 0) / summerMonths.length : null;
  const winterAvg = winterMonths.length > 0 ? winterMonths.reduce((s: number, m: any) => s + m.avgMargin, 0) / winterMonths.length : null;

  let seasonalTrend: { direction: string; diff: string; summerAvg: string; winterAvg: string } | null = null;
  if (summerAvg != null && winterAvg != null) {
    const diff = summerAvg - winterAvg;
    if (Math.abs(diff) > 3) {
      seasonalTrend = {
        direction: diff > 0 ? 'summer_better' : 'winter_better',
        diff: Math.abs(diff).toFixed(1),
        summerAvg: summerAvg.toFixed(1),
        winterAvg: winterAvg.toFixed(1),
      };
    }
  }

  let insight: { type: string; text: string; detail: string; tone: string }[] | null = null;
  if (bestMonth && worstMonth && bestMonth.month !== worstMonth.month) {
    const diff = bestMonth.avgMargin - worstMonth.avgMargin;
    if (diff > 5) {
      insight = [{ type: 'pattern', text: `Deine Marge ist im ${bestMonth.label} durchschnittlich ${diff.toFixed(0)}pp besser als im ${worstMonth.label}.`, detail: `Ø ${bestMonth.avgMargin.toFixed(0)}% vs. ${worstMonth.avgMargin.toFixed(0)}%`, tone: 'info' }];
    }
  }

  if (seasonalTrend) {
    const trendInsight = {
      type: 'seasonal',
      text: seasonalTrend.direction === 'summer_better'
        ? `Im Sommer hast du ${seasonalTrend.diff}pp bessere Margen als im Winter.`
        : `Im Winter hast du ${seasonalTrend.diff}pp bessere Margen als im Sommer.`,
      detail: `Sommer Ø${seasonalTrend.summerAvg}% · Winter Ø${seasonalTrend.winterAvg}%`,
      tone: 'info',
    };
    insight = insight ? [...insight, trendInsight] : [trendInsight];
  }

  return { hasData: true, patterns: monthlyAvg, insight, bestMonth, worstMonth, seasonalTrend };
}
