'use client';

import { useData } from '@/app/Provider';
import { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { filterByTimeRange, formatCurrency, parseDate, parseGermanCurrency } from '@/lib/utils';
import { getMaterialSum, getMaterialCost } from '@/lib/calculations';
import Sidebar from '@/components/Sidebar';
import TutorialTour from '@/components/TutorialTour';
import PageSkeleton from '@/components/skeletons/PageSkeleton';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { TrendingUp, TrendingDown, ClipboardList, Coins } from 'lucide-react';

function getGrade(m: number) {
  if (m > 50) return 'A+';
  if (m >= 40) return 'A';
  if (m >= 25) return 'B';
  if (m >= 10) return 'C';
  if (m >= 0) return 'D';
  return 'F';
}
function gradeColor(g: string) {
  const m: Record<string, string> = {'A+':'text-green-600 bg-green-50 border-green-200','A':'text-green-500 bg-green-50 border-green-200','B':'text-lime-500 bg-lime-50 border-lime-200','C':'text-amber-500 bg-amber-50 border-amber-200','D':'text-orange-500 bg-orange-50 border-orange-200','F':'text-red-500 bg-red-50 border-red-200','–':'text-slate-400 bg-slate-50 border-slate-200'};
  return m[g] || m['–'];
}
function gradeHex(g: string) {
  const m: Record<string, string> = {'A+':'#16a34a','A':'#22c55e','B':'#84cc16','C':'#d97706','D':'#ea580c','F':'#dc2626','–':'#94a3b8'};
  return m[g] || '#94a3b8';
}
function gradeLabel(g: string) {
  return { 'A+': 'Exzellent', 'A': 'Sehr gut', 'B': 'Gut', 'C': 'Ausreichend', 'D': 'Geringer Gewinn', 'F': 'Verlust', '–': 'Keine Daten' }[g] || '';
}
function gradeRange(g: string) {
  return { 'A+': '> 50 %', 'A': '40 – 50 %', 'B': '25 – 40 %', 'C': '10 – 25 %', 'D': '0 – 10 %', 'F': '< 0 %', '–': '–' }[g] || '';
}

// Ursachenanalyse + Handlungsempfehlung fürs Ranking-Detail (Mitarbeiter & Termin) – rein
// additiv, vergleicht nur die bereits berechneten Ranking-Zahlen gegen den Durchschnitt der
// jeweiligen Liste, rührt an der bestehenden empRank/assignRank-Berechnung nichts an.
function explainRankEntry(entry: { margin: number; rate: number; hours: number; count?: number }, allEntries: { margin: number; rate: number; hours: number }[]): { reasons: string[]; suggestions: string[] } {
  const withData = allEntries.filter(e => e.hours > 0);
  const reasons: string[] = [];
  const suggestions: string[] = [];
  if (withData.length < 2) return { reasons, suggestions };
  const avgMargin = withData.reduce((s, e) => s + e.margin, 0) / withData.length;
  const avgRate = withData.reduce((s, e) => s + e.rate, 0) / withData.length;

  if (entry.margin < 15 && entry.hours > 0) {
    reasons.push(`Marge ${entry.margin.toFixed(0)} % liegt unter dem Schnitt von ${avgMargin.toFixed(0)} %`);
    suggestions.push('Preis oder Stundensatz für künftige Aufträge anpassen');
  }
  if (avgRate > 0 && entry.rate > avgRate * 1.3) {
    reasons.push(`Stundensatz ${formatCurrency(entry.rate)}/h liegt deutlich über dem Schnitt (${formatCurrency(avgRate)}/h)`);
    suggestions.push('Prüfen, ob der Preis dafür ausreichend kalkuliert ist');
  }
  if (entry.margin >= 40) {
    reasons.push(`Marge ${entry.margin.toFixed(0)} % liegt deutlich über dem Schnitt von ${avgMargin.toFixed(0)} %`);
    suggestions.push('Mehr von dieser Art Auftrag annehmen bzw. zuweisen');
  }
  if (typeof entry.count === 'number' && entry.count <= 1) {
    reasons.push('Wenig Datenbasis (nur 1 Termin im Zeitraum) – Aussage noch unsicher');
  }
  return { reasons, suggestions };
}

function formatDateDE(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Na, Nachteule';
  if (h < 12) return 'Guten Morgen';
  if (h < 14) return 'Mahlzeit';
  if (h < 17) return 'Schönen Nachmittag';
  if (h < 19) return 'Schönen Feierabend';
  if (h < 22) return 'Guten Abend';
  return 'Na, Nachteule';
}

function getDailyQuote() {
  const start = new Date(2025, 0, 1).getTime();
  const now = new Date().getTime();
  const day = Math.floor((now - start) / 86400000);
  return quotes[day % quotes.length];
}

// Zitat als [Text, Urheber]-Tupel statt reinem String, damit die Quelle mit angezeigt werden kann.
const quotes: [string, string][] = [
  // ——— Philosophen, Denker & bekannte Persönlichkeiten — passend zu Handwerk & Motivation (~95 %) ———
  ['Es ist nicht genug zu wissen, man muss auch anwenden.', 'Johann Wolfgang von Goethe'],
  ['Am Anfang war die Tat.', 'Johann Wolfgang von Goethe'],
  ['Was du ererbt von deinen Vätern hast, erwirb es, um es zu besitzen.', 'Johann Wolfgang von Goethe'],
  ['Ohne Hast, aber ohne Rast.', 'Johann Wolfgang von Goethe'],
  ['Genie ist Fleiß.', 'Johann Wolfgang von Goethe'],
  ['Wir sind, was wir wiederholt tun. Vortrefflichkeit ist daher keine Handlung, sondern eine Gewohnheit.', 'Aristoteles'],
  ['Der Anfang ist die Hälfte des Ganzen.', 'Aristoteles'],
  ['Geduld ist bitter, aber ihre Frucht ist süß.', 'Aristoteles'],
  ['Qualität ist kein Zufall, sie ist immer das Ergebnis angestrengten Denkens.', 'John Ruskin'],
  ['Es gibt kaum etwas auf der Welt, das nicht irgendjemand ein wenig schlechter machen und etwas billiger verkaufen könnte.', 'John Ruskin'],
  ['Habe nichts in deinem Haus, von dem du nicht weißt, dass es nützlich ist, oder glaubst, dass es schön ist.', 'William Morris'],
  ['Ich sah den Engel im Marmor und meißelte, bis ich ihn befreit hatte.', 'Michelangelo'],
  ['Die größte Gefahr liegt nicht darin, das Ziel zu hoch anzusetzen und es zu verfehlen, sondern es zu niedrig anzusetzen und es zu erreichen.', 'Michelangelo'],
  ['Ich lerne noch.', 'Michelangelo'],
  ['Einfachheit ist die höchste Form der Raffinesse.', 'Leonardo da Vinci'],
  ['Kleine Details machen Perfektion aus, aber Perfektion ist kein Detail.', 'Leonardo da Vinci'],
  ['Vollkommenheit entsteht nicht dann, wenn man nichts mehr hinzuzufügen hat, sondern wenn man nichts mehr wegnehmen kann.', 'Antoine de Saint-Exupéry'],
  ['Wenn du ein Schiff bauen willst, dann lehre die Menschen die Sehnsucht nach dem weiten, endlosen Meer.', 'Antoine de Saint-Exupéry'],
  ['Du hast Macht über deinen Geist – nicht über äußere Ereignisse. Erkenne dies, und du wirst Stärke finden.', 'Marc Aurel'],
  ['Die Hindernisse auf dem Weg werden zum Weg.', 'Marc Aurel'],
  ['Verschwende keine Zeit mehr damit, darüber zu streiten, wie ein guter Mensch sein sollte. Sei einer.', 'Marc Aurel'],
  ['Nicht weil es schwer ist, wagen wir es nicht, sondern weil wir es nicht wagen, ist es schwer.', 'Seneca'],
  ['Es ist nicht so, dass wir wenig Zeit haben, sondern dass wir viel davon verlieren.', 'Seneca'],
  ['Solange wir warten zu leben, geht das Leben vorüber.', 'Seneca'],
  ['Nicht die Dinge selbst beunruhigen die Menschen, sondern ihre Meinungen über die Dinge.', 'Epiktet'],
  ['Erst wäge, dann wage.', 'Helmuth von Moltke'],
  ['Ich weiß, dass ich nichts weiß.', 'Sokrates'],
  ['Habe Mut, dich deines eigenen Verstandes zu bedienen.', 'Immanuel Kant'],
  ['Das Bessere ist der Feind des Guten.', 'Voltaire'],
  ['Es ist nicht wichtig, wie langsam du gehst, solange du nicht stehenbleibst.', 'Konfuzius'],
  ['Wähle einen Beruf, den du liebst, und du musst keinen einzigen Tag in deinem Leben arbeiten.', 'Konfuzius'],
  ['Der Charakter eines Menschen zeigt sich in der Art, wie er die kleinen Dinge tut.', 'Konfuzius'],
  ['Ein Weg von tausend Meilen beginnt mit dem ersten Schritt.', 'Laotse'],
  ['Wer andere kennt, ist klug. Wer sich selbst kennt, ist erleuchtet.', 'Laotse'],
  ['Der Geist ist alles. Was du denkst, das wirst du.', 'Buddha'],
  ['Alles fließt.', 'Heraklit'],
  ['Man kann nicht zweimal in denselben Fluss steigen.', 'Heraklit'],
  ['Ob du glaubst, du kannst es, oder du glaubst, du kannst es nicht – du hast recht.', 'Henry Ford'],
  ['Zusammenkommen ist ein Beginn, Zusammenbleiben ein Fortschritt, Zusammenarbeiten ein Erfolg.', 'Henry Ford'],
  ['Wer aufhört zu werben, um Geld zu sparen, kann ebenso seine Uhr anhalten, um Zeit zu sparen.', 'Henry Ford'],
  ['Genie ist ein Prozent Inspiration und neunundneunzig Prozent Transpiration.', 'Thomas Edison'],
  ['Ich bin nicht gescheitert. Ich habe nur zehntausend Wege gefunden, die nicht funktionieren.', 'Thomas Edison'],
  ['Wenn du fertig bist, dich zu verändern, bist du fertig.', 'Benjamin Franklin'],
  ['Investiere in Wissen, es bringt die besten Zinsen.', 'Benjamin Franklin'],
  ['Verliere keine Zeit, denn daraus besteht das Leben.', 'Benjamin Franklin'],
  ['Wenn du planst zu scheitern, planst du das Scheitern.', 'Benjamin Franklin'],
  ['Erfolg ist die Fähigkeit, von einem Misserfolg zum nächsten zu gehen, ohne die Begeisterung zu verlieren.', 'Winston Churchill'],
  ['Ein Pessimist sieht die Schwierigkeit in jeder Chance, ein Optimist die Chance in jeder Schwierigkeit.', 'Winston Churchill'],
  ['Tu, was du kannst, mit dem, was du hast, dort, wo du bist.', 'Theodore Roosevelt'],
  ['Der einzige Feind, den wir zu fürchten haben, ist die Furcht selbst.', 'Franklin D. Roosevelt'],
  ['Es scheint immer unmöglich, bis es getan ist.', 'Nelson Mandela'],
  ['Sie wussten nicht, dass es unmöglich war, also haben sie es einfach gemacht.', 'Mark Twain'],
  ['In zwanzig Jahren wirst du mehr enttäuscht sein von den Dingen, die du nicht getan hast, als von denen, die du getan hast.', 'Mark Twain'],
  ['Nichts Großes wurde je ohne Begeisterung vollbracht.', 'Ralph Waldo Emerson'],
  ['Geh selbstbewusst in die Richtung deiner Träume. Lebe das Leben, das du dir vorgestellt hast.', 'Henry David Thoreau'],
  ['Der Preis von allem ist die Menge an Leben, die man dafür eintauscht.', 'Henry David Thoreau'],
  ['Die einzige Möglichkeit, großartige Arbeit zu leisten, ist zu lieben, was man tut.', 'Steve Jobs'],
  ['Qualität ist wichtiger als Quantität. Ein Homerun ist viel besser als zwei Doppel.', 'Steve Jobs'],
  ['Der beste Weg, etwas zu erreichen, ist anzufangen.', 'Walt Disney'],
  ['Alle unsere Träume können wahr werden, wenn wir den Mut haben, ihnen zu folgen.', 'Walt Disney'],
  ['Man darf nichts im Leben fürchten, man muss nur alles verstehen.', 'Marie Curie'],
  ['Man kann kein Problem mit derselben Denkweise lösen, mit der es entstanden ist.', 'Albert Einstein'],
  ['Phantasie ist wichtiger als Wissen.', 'Albert Einstein'],
  ['Handeln ist der Grundschlüssel für jeden Erfolg.', 'Pablo Picasso'],
  ['Ich fürchte nicht den Mann, der zehntausend Tritte einmal geübt hat, sondern den, der einen Tritt zehntausendmal geübt hat.', 'Bruce Lee'],
  ['Sei wie Wasser, mein Freund.', 'Bruce Lee'],
  ['Der, der nicht den Mut hat, Risiken einzugehen, wird im Leben nichts erreichen.', 'Muhammad Ali'],
  ['Champions werden aus etwas gemacht, das tief in ihnen liegt – ein Wunsch, ein Traum, eine Vision.', 'Muhammad Ali'],
  ['Perfektion ist nicht erreichbar, aber wenn wir nach Perfektion streben, können wir Exzellenz erreichen.', 'Vince Lombardi'],
  ['Du musst nicht großartig sein, um anzufangen, aber du musst anfangen, um großartig zu sein.', 'Zig Ziglar'],
  ['Was der Geist sich vorstellen und woran er glauben kann, das kann er auch erreichen.', 'Napoleon Hill'],
  ['Handle so, als wäre es unmöglich zu scheitern.', 'Dale Carnegie'],
  ['Disziplin ist die Brücke zwischen Zielen und Erfolgen.', 'Jim Rohn'],
  ['Motivation bringt dich in Gang, Gewohnheit hält dich in Bewegung.', 'Jim Rohn'],
  ['Der Erfolg hat viele Väter, der Misserfolg ist ein Waisenkind.', 'John F. Kennedy'],
  ['Wer kämpft, kann verlieren. Wer nicht kämpft, hat schon verloren.', 'Bertolt Brecht'],
  ['Glück ist die einzige Sache, die sich verdoppelt, wenn man es teilt.', 'Albert Schweitzer'],
  ['Falle siebenmal, steh achtmal auf.', 'Japanisches Sprichwort'],
  ['Der beste Zeitpunkt, einen Baum zu pflanzen, war vor zwanzig Jahren. Der zweitbeste ist jetzt.', 'Chinesisches Sprichwort'],
  ['Übung ist die Mutter der Meisterschaft.', 'Deutsches Sprichwort'],
  ['Wer rastet, der rostet.', 'Deutsches Sprichwort'],
  ['Steter Tropfen höhlt den Stein.', 'Römisches Sprichwort'],
  ['Wer nicht wagt, der nicht gewinnt.', 'Deutsches Sprichwort'],
  ['Der frühe Vogel fängt den Wurm.', 'Englisches Sprichwort'],
  ['Jeder Meister war einmal ein Anfänger.', 'Deutsches Sprichwort'],
  ['Übung macht den Meister.', 'Deutsches Sprichwort'],
  ['Erst denken, dann handeln.', 'Deutsches Sprichwort'],
  ['Zeit ist Geld.', 'Benjamin Franklin'],
  ['Wissen ist Macht.', 'Francis Bacon'],
  ['Die Ruhe vor dem Sturm nutzt der, der sie zur Vorbereitung nutzt.', 'Sunzi'],
  ['Kenne deinen Gegner und kenne dich selbst, dann brauchst du den Ausgang von hundert Schlachten nicht zu fürchten.', 'Sunzi'],
  ['Der Weg entsteht beim Gehen.', 'Antonio Machado'],
  ['Wer immer tut, was er schon kann, bleibt immer, was er schon ist.', 'Henry Ford'],
  ['Am Ende werden wir nicht die Worte unserer Feinde in Erinnerung behalten, sondern das Schweigen unserer Freunde.', 'Martin Luther King Jr.'],
  ['Ich habe einen Traum.', 'Martin Luther King Jr.'],
  ['Was du nicht ändern kannst, musst du ertragen; was du ändern kannst, sollst du anpacken.', 'Marc Aurel'],
];

// ——— Anime (5 %, weiterhin dabei) ———
quotes.push(
  ['Wer aufgibt, für den ist das Spiel in diesem Moment vorbei.', 'Coach Anzai, Slam Dunk'],
  ['Ich gebe niemals auf – das ist mein Ninja-Weg!', 'Naruto Uzumaki, Naruto'],
  ['Ein wahrer Held ist immer bereit, sein Leben für andere zu riskieren.', 'All Might, My Hero Academia'],
  ['Man muss die eigenen Grenzen kennen, um sie zu überwinden.', 'Vegeta, Dragon Ball Z'],
  ['Nicht die Stärke des Körpers zählt, sondern die Stärke des Willens.', 'Rock Lee, Naruto'],
);

const timeFilters = [
  { key: 'alle', label: 'Alle' },
  { key: 'heute', label: 'Heute' },
  { key: 'woche', label: '7 Tage' },
  { key: 'monat', label: '30 Tage' },
  { key: '6monate', label: '6 Monate' },
  { key: 'jahr', label: 'Jahr' },
];

type ChartView = 'bar' | 'pie' | 'table';
const PIE_COLORS = { revenue: '#22c55e', cost: '#ef4444', profit: '#0d9488' };

const chartViews: { key: ChartView; label: string; svg: React.ReactElement }[] = [
  { key: 'bar', label: 'Balken', svg: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="6" y1="20" x2="6" y2="11" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="18" y1="20" x2="18" y2="14" /></svg> },
  { key: 'pie', label: 'Kreis', svg: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9v9z" /><path d="M12 3a9 9 0 0 1 9 9h-9z" /></svg> },
  { key: 'table', label: 'Tabelle', svg: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="3" x2="9" y2="21" /></svg> },
];

type KpiKey = 'revenue' | 'cost' | 'profit' | 'count';
type RankDetail = { type: 'emp' | 'assign'; data: any };

export default function DashboardPage() {
  const { user, userName, loading, assignments: rawAssignments, employees: rawEmployees, company, companyId } = useData();
  const router = useRouter();
  const [range, setRange] = useState('alle');
  const [chartView, setChartView] = useState<ChartView>('bar');
  const [openKpi, setOpenKpi] = useState<KpiKey | null>(null);
  const [showScoreInfo, setShowScoreInfo] = useState(false);
  const [rankDetail, setRankDetail] = useState<RankDetail | null>(null);
  const [specificDate, setSpecificDate] = useState<string>('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerDate, setPickerDate] = useState<Date>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  });
  const [quote, setQuote] = useState(() => quotes[Math.floor(Math.random() * quotes.length)]);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (company && company.onboardingSeen === false) {
      setShowOnboarding(true);
      // Flag sofort setzen: Tour läuft lokal weiter, erscheint aber nie wieder —
      // auch wenn der User mitten in der Tour wegnavigiert oder den Tab schließt.
      if (companyId) updateDoc(doc(db, 'companies', companyId), { onboardingSeen: true }).catch(() => {});
    }
  }, [company, companyId]);

  const dismissOnboarding = async () => {
    setShowOnboarding(false);
    if (companyId) {
      updateDoc(doc(db, 'companies', companyId), { onboardingSeen: true }).catch(() => {});
    }
  };

  useEffect(() => {
    const onShow = () => setQuote(quotes[Math.floor(Math.random() * quotes.length)]);
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, []);

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [user, loading, router]);

  const assignments = useMemo(() => {
    if (specificDate) {
      return (rawAssignments || []).filter(a => {
        const p = parseDate(a.datum);
        if (!p || isNaN(p.getTime())) return false;
        const ymd = `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}-${String(p.getDate()).padStart(2, '0')}`;
        return ymd === specificDate;
      });
    }
    return filterByTimeRange(rawAssignments || [], range);
  }, [rawAssignments, range, specificDate]);
  const employees = rawEmployees || [];

  const summary = useMemo(() => {
    const a = assignments;
    if (!a.length) return { rev: 0, cost: 0, profit: 0, count: 0, avgM: 0, prof: 0, loss: 0, grade: '–', grades: { 'A+': 0, 'A': 0, 'B': 0, 'C': 0, 'D': 0, 'F': 0 }, maxRev: 0 };
    let rev = 0, cost = 0;
    const grades: Record<string, number> = { 'A+': 0, 'A': 0, 'B': 0, 'C': 0, 'D': 0, 'F': 0 };
    let profCount = 0, lossCount = 0;
    let maxRev = 0;
    a.forEach(x => {
      // Material: VK in den Umsatz, EK in die Kosten (siehe lib/calculations)
      const r = parseGermanCurrency(x.umsatz) + getMaterialSum(x);
      const h = parseFloat(String(x.stunden)) || 0;
      const l = parseFloat(String(x.stundenlohn)) || 0;
      const c = h * l + getMaterialCost(x);
      rev += r; cost += c;
      const p = r - c;
      if (p > 0) profCount++; else if (p < 0) lossCount++;
      if (r > maxRev) maxRev = r;
      const m = r > 0 ? (p / r) * 100 : 0;
      const gg = getGrade(m);
      if (grades[gg] !== undefined) grades[gg]++;
    });
    const totalProfit = rev - cost;
    const avgMargin = rev > 0 ? (totalProfit / rev) * 100 : 0;
    return { rev, cost, profit: totalProfit, count: a.length, avgM: avgMargin, prof: profCount, loss: lossCount, grade: getGrade(avgMargin), grades, maxRev };
  }, [assignments]);

  const empRank = useMemo(() => {
    if (!employees.length) return [];
    return employees.map(e => {
      const name = e.name;
      const rate = parseFloat(String(e.stundenlohn)) || 0;
      const ea = assignments.filter(a => {
        const names = Array.isArray(a.mitarbeiter) ? a.mitarbeiter.map((n: string) => n.trim()) : (a.mitarbeiter || '').split(',').map((n: string) => n.trim());
        return names.includes(name);
      });
      if (!ea.length) return { name, grade: '–', profit: 0, margin: 0, hours: 0, count: 0, rate, revenue: 0, cost: 0 };
      const h = ea.reduce((s: number, a: any) => s + (parseFloat(String(a.stunden)) || 0), 0);
      // Verknüpftes Lager-Material: anteilig wie der Umsatz auf die zugewiesenen
      // Mitarbeiter aufgeteilt (siehe utils/smartPricing.js in der Mobile-App).
      let c = h * rate;
      let r = 0;
      ea.forEach((a: any) => {
        const names = Array.isArray(a.mitarbeiter) ? a.mitarbeiter.map((n: string) => n.trim()) : (a.mitarbeiter || '').split(',').map((n: string) => n.trim());
        const split = names.length > 0 ? 1 / names.length : 1;
        const rev = parseGermanCurrency(a.umsatz) + getMaterialSum(a);
        r += rev * split;
        c += getMaterialCost(a) * split;
      });
      const p = r - c;
      const m = r > 0 ? (p / r) * 100 : 0;
      return { name, grade: getGrade(m), profit: p, margin: m, hours: h, count: ea.length, rate, revenue: r, cost: c };
    }).sort((a, b) => b.profit - a.profit).slice(0, 8);
  }, [employees, assignments]);

  const assignRank = useMemo(() => {
    return [...assignments].map(a => {
      const r = parseGermanCurrency(a.umsatz) + getMaterialSum(a);
      const h = parseFloat(String(a.stunden)) || 0;
      const l = parseFloat(String(a.stundenlohn)) || 0;
      const c = h * l + getMaterialCost(a);
      const p = r - c;
      const m = r > 0 ? (p / r) * 100 : 0;
      return { id: a.id, kunde: a.kunde, projekt: a.projekt, datum: a.datum, profit: p, margin: m, grade: getGrade(m), revenue: r, cost: c, hours: h, rate: l };
    }).sort((a, b) => b.profit - a.profit).slice(0, 8);
  }, [assignments]);

  const chartData = useMemo(() => {
    const m: Record<string, any> = {};
    (assignments || []).forEach(a => {
      const d = parseDate(a.datum);
      if (!d || isNaN(d.getTime())) return;
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!m[k]) m[k] = { name: d.toLocaleDateString('de-DE', { month: 'short', year: '2-digit' }), revenue: 0, cost: 0, profit: 0 };
      const r = parseGermanCurrency(a.umsatz) + getMaterialSum(a);
      const h = parseFloat(String(a.stunden)) || 0;
      const rate = parseFloat(String(a.stundenlohn)) || 0;
      const c = h * rate + getMaterialCost(a);
      m[k].revenue += r; m[k].cost += c; m[k].profit += r - c;
    });
    return Object.entries(m).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
  }, [assignments]);

  const pieData = useMemo(() => {
    const items = [
      { name: 'Umsatz', value: summary.rev, color: PIE_COLORS.revenue },
      { name: 'Kosten', value: summary.cost, color: PIE_COLORS.cost },
      { name: 'Gewinn', value: summary.profit > 0 ? summary.profit : 0, color: PIE_COLORS.profit },
    ].filter(i => i.value > 0);
    return items;
  }, [summary]);

  if (loading) return <PageSkeleton variant="dashboard" maxWidth="max-w-7xl" />;
  if (!user) return null;

  const avgPerAssign = summary.count > 0 ? summary.rev / summary.count : 0;

  const isProfit = summary.profit >= 0;
  const moneyMax = Math.max(summary.rev, summary.cost, isProfit ? summary.profit : 0, 1);
  const barWidth = (val: number) => val > 0 ? Math.max(4, Math.min(100, (val / moneyMax) * 100)) : 0;
  const countBarWidth = Math.max(4, Math.min(100, (summary.count / 100) * 100));

  const kpiCards = [
    { key: 'revenue' as const, label: 'Umsatz', val: formatCurrency(summary.rev), color: 'from-green-500 to-emerald-500', icon: <Coins className="w-5 h-5" />, bar: barWidth(summary.rev) },
    { key: 'cost' as const, label: 'Kosten', val: formatCurrency(summary.cost), color: 'from-red-500 to-rose-500', icon: <Coins className="w-5 h-5" />, bar: barWidth(summary.cost) },
    { key: 'profit' as const, label: isProfit ? 'Gewinn' : 'Verlust', val: formatCurrency(summary.profit), color: isProfit ? 'from-teal-600 to-emerald-500' : 'from-red-600 to-rose-600', icon: isProfit ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />, bar: isProfit ? barWidth(summary.profit) : 0 },
    { key: 'count' as const, label: 'Aufträge', val: String(summary.count), color: 'from-amber-500 to-orange-500', icon: <ClipboardList className="w-5 h-5" />, bar: countBarWidth },
  ];

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {showOnboarding && <TutorialTour onDone={dismissOnboarding} />}
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="px-4 py-4 md:px-8 md:py-8 max-w-7xl mx-auto space-y-6 md:space-y-8">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 animate-fadeIn">
            <div>
              <h1 className="text-xl md:text-3xl font-bold text-slate-900 tracking-tight">{getGreeting()}, {userName ? userName.trim().split(/\s+/)[0] : (company?.name || 'Unternehmer')}!</h1>
              <p className="text-slate-500 text-xs md:text-sm mt-1">
                {summary.count} Termin{summary.count !== 1 ? 'e' : ''} &middot; {summary.prof} profitabel, {summary.loss} mit Verlust
              </p>
              <p className="text-slate-600 text-xs md:text-base mt-2 md:mt-3 italic max-w-2xl leading-relaxed border-l-2 border-teal-400 pl-3 md:pl-4">
                „{quote[0]}“<span className="block not-italic text-[11px] md:text-xs text-slate-400 mt-1">— {quote[1]}</span>
              </p>
            </div>
            <div className="flex gap-1 flex-wrap md:flex-nowrap items-center bg-white rounded-xl p-1 border border-slate-200 shadow-sm overflow-x-auto">
              {timeFilters.map(f => (
                <button key={f.key} onClick={() => { setRange(f.key); setSpecificDate(''); }}
                  className={`px-3 py-1.5 md:px-4 md:py-2 rounded-lg text-xs font-semibold transition-all active:scale-[0.95] ${
                    !specificDate && range === f.key ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
                  }`}
                >{f.label}</button>
              ))}
              <div className="w-px h-5 bg-slate-200 mx-0.5 shrink-0" />
              <button
                type="button"
                onClick={() => {
                  if (specificDate) {
                    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(specificDate);
                    if (m) setPickerDate(new Date(+m[1], +m[2] - 1, +m[3]));
                  } else {
                    const d = new Date();
                    setPickerDate(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
                  }
                  setShowDatePicker(true);
                }}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 md:px-4 md:py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  specificDate ? 'bg-teal-600 text-white shadow-sm hover:bg-teal-700' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                <span>{specificDate ? formatDateDE(specificDate) : 'Tag'}</span>
              </button>
              {specificDate && (
                <button
                  type="button"
                  onClick={() => { setSpecificDate(''); setRange('alle'); }}
                  className="shrink-0 p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                  title="Tag zurücksetzen"
                  aria-label="Tag zurücksetzen"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              )}
            </div>
          </div>

          {/* KPI Cards */}
          <div data-tour="kpis" className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-5">
            {kpiCards.map((k, i) => (
              <button key={k.key} type="button" onClick={() => setOpenKpi(k.key)}
                className="text-left bg-white rounded-xl md:rounded-2xl border border-slate-200 p-4 md:p-6 shadow-sm hover:shadow-xl hover:-translate-y-0.5 hover:border-teal-300 transition-all duration-200 animate-slideUp group focus:outline-none focus:ring-2 focus:ring-teal-200"
                style={{ animationDelay: `${i * 70}ms` }}>
                <div className="flex items-center justify-between mb-3">
                  <p className={`text-xs font-bold uppercase tracking-wider ${k.key === 'profit' && !isProfit ? 'text-red-500' : 'text-slate-400'}`}>{k.label}</p>
                  <div className="flex items-center gap-1.5">
                    <span className="opacity-50 group-hover:opacity-100 transition-opacity duration-300">{k.icon}</span>
                    <svg className="w-3.5 h-3.5 text-slate-300 group-hover:text-teal-500 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                  </div>
                </div>
                <p className="text-3xl font-bold text-slate-900 tracking-tight">{k.val}</p>
                <div className="mt-4 h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className={`h-full rounded-full bg-gradient-to-r ${k.color} transition-all duration-700 group-hover:scale-x-105`} style={{ width: `${k.bar}%`, transformOrigin: 'left' }} />
                </div>
              </button>
            ))}
          </div>

          {/* Grade + Chart */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-5">
            {/* Grade */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-lg transition-all duration-300 animate-slideUp" style={{ animationDelay: '280ms' }}>
              <div className="flex items-center justify-between mb-5">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Profit Score</p>
                <button type="button" onClick={() => setShowScoreInfo(true)} aria-label="Wie wird der Profit Score berechnet?"
                  className="w-6 h-6 rounded-full bg-slate-100 hover:bg-teal-100 text-slate-400 hover:text-teal-600 flex items-center justify-center transition-colors">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                </button>
              </div>
              {summary.count === 0 ? (
                <div className="flex flex-col items-center text-center py-4">
                  <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                    <span className="text-4xl font-black text-slate-300">–</span>
                  </div>
                  <p className="text-slate-400 text-sm">Keine Daten</p>
                </div>
              ) : (
                <div className="flex flex-col items-center text-center">
                  <motion.div initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                    className={`w-28 h-28 rounded-2xl flex items-center justify-center mb-3 border-2 ${gradeColor(summary.grade).split(' ').slice(1).join(' ')} shadow-sm`}>
                    <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.15, type: 'spring', stiffness: 300 }}
                      className={`text-6xl font-black tracking-tight ${gradeColor(summary.grade).split(' ')[0]}`}>
                      {summary.grade}
                    </motion.span>
                  </motion.div>
                  <p className="text-3xl font-bold text-slate-900 tracking-tight">{summary.avgM.toFixed(1)}%</p>
                  <p className="text-slate-400 text-sm mt-0.5">durchschnittliche Marge</p>
                </div>
              )}
              <div className="mt-6 space-y-2.5">
                {(['A+', 'A', 'B', 'C', 'D', 'F'] as const).map((g, gi) => {
                  const count = summary.grades?.[g] || 0;
                  const pct = summary.count > 0 ? (count / summary.count) * 100 : 0;
                  const hex = gradeHex(g);
                  return (
                    <motion.div key={g} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: gi * 0.08 }}
                      className="flex items-center gap-2.5">
                      <span className="w-6 text-right text-xs font-bold" style={{ color: hex }}>{g}</span>
                      <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ delay: gi * 0.08 + 0.2, duration: 0.6, ease: 'easeOut' }}
                          className="h-full rounded-full" style={{ backgroundColor: hex }} />
                      </div>
                      <span className="w-5 text-right text-xs font-semibold text-slate-400">{count}</span>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* Chart */}
            <div className="md:col-span-4 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-lg transition-all duration-300 animate-slideUp" style={{ animationDelay: '360ms' }}>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                <h3 className="text-slate-900 font-bold">Umsatz, Kosten &amp; Gewinn</h3>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="flex items-center gap-1.5 text-xs text-slate-500"><span className="w-2.5 h-2.5 rounded-sm bg-green-500" /> Umsatz</span>
                  <span className="flex items-center gap-1.5 text-xs text-slate-500"><span className="w-2.5 h-2.5 rounded-sm bg-red-500" /> Kosten</span>
                  <span className="flex items-center gap-1.5 text-xs text-slate-500"><span className="w-2.5 h-2.5 rounded-sm bg-teal-600" /> Gewinn</span>
                  <div className="flex gap-0.5 bg-slate-100 rounded-lg p-0.5 ml-1">
                    {chartViews.map(v => (
                      <button key={v.key} type="button" onClick={() => setChartView(v.key)} title={v.label} aria-label={`Ansicht ${v.label}`}
                        className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors flex items-center gap-1.5 ${chartView === v.key ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                        {v.svg}
                        <span className="hidden sm:inline">{v.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {chartData.length === 0 ? (
                <div className="flex items-center justify-center h-72 text-slate-400 text-sm">Keine Daten vorhanden</div>
              ) : chartView === 'bar' ? (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} barGap={2} barCategoryGap="20%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                      <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `€${(v / 1000).toFixed(0)}k`} />
                      <Tooltip cursor={{ fill: 'rgba(13, 148, 136, 0.06)' }} contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, color: '#0f172a', fontSize: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }} formatter={(value: number) => [formatCurrency(value), '']} labelStyle={{ fontWeight: 700, marginBottom: 4 }} />
                      <Bar dataKey="revenue" name="Umsatz" fill="#22c55e" radius={[6,6,0,0]} maxBarSize={28} />
                      <Bar dataKey="cost" name="Kosten" fill="#ef4444" radius={[6,6,0,0]} maxBarSize={28} />
                      <Bar dataKey="profit" name="Gewinn" fill="#0d9488" radius={[6,6,0,0]} maxBarSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : chartView === 'pie' ? (
                <div className="h-72 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} stroke="#fff" strokeWidth={2}>
                        {pieData.map((entry, idx) => (
                          <Cell key={idx} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip cursor={{ fill: 'rgba(13, 148, 136, 0.06)' }} contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, color: '#0f172a', fontSize: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }} formatter={(value: number, name: string) => [formatCurrency(value), name]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="overflow-x-auto -mx-2">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                        <th className="px-3 py-2.5">Monat</th>
                        <th className="px-3 py-2.5 text-right">Umsatz</th>
                        <th className="px-3 py-2.5 text-right">Kosten</th>
                        <th className="px-3 py-2.5 text-right">Gewinn</th>
                        <th className="px-3 py-2.5 text-right">Marge</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chartData.map((d: any) => {
                        const m = d.revenue > 0 ? (d.profit / d.revenue) * 100 : 0;
                        return (
                          <tr key={d.name} className="border-t border-slate-100 transition-colors duration-100 hover:bg-slate-50">
                            <td className="px-3 py-2.5 font-semibold text-slate-700">{d.name}</td>
                            <td className="px-3 py-2.5 text-right text-slate-900 font-medium">{formatCurrency(d.revenue)}</td>
                            <td className="px-3 py-2.5 text-right text-slate-900 font-medium">{formatCurrency(d.cost)}</td>
                            <td className={`px-3 py-2.5 text-right font-bold ${d.profit >= 0 ? 'text-teal-600' : 'text-red-500'}`}>{formatCurrency(d.profit)}</td>
                            <td className={`px-3 py-2.5 text-right font-bold ${m >= 0 ? 'text-green-600' : 'text-red-500'}`}>{m >= 0 ? '+' : ''}{m.toFixed(1)} %</td>
                          </tr>
                        );
                      })}
                      <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold">
                        <td className="px-3 py-2.5 text-slate-700">Gesamt</td>
                        <td className="px-3 py-2.5 text-right text-slate-900">{formatCurrency(summary.rev)}</td>
                        <td className="px-3 py-2.5 text-right text-slate-900">{formatCurrency(summary.cost)}</td>
                        <td className={`px-3 py-2.5 text-right ${summary.profit >= 0 ? 'text-teal-600' : 'text-red-500'}`}>{formatCurrency(summary.profit)}</td>
                        <td className={`px-3 py-2.5 text-right ${summary.avgM >= 0 ? 'text-green-600' : 'text-red-500'}`}>{summary.avgM >= 0 ? '+' : ''}{summary.avgM.toFixed(1)} %</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Rankings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {[
              { title: 'Mitarbeiter-Ranking', data: empRank, empty: 'Keine Mitarbeiter-Daten', type: 'emp' as const },
              { title: 'Termin-Ranking', data: assignRank, empty: 'Keine Termine in diesem Zeitraum', type: 'assign' as const },
            ].map((section, si) => (
              <div key={section.title} className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden animate-slideUp" style={{ animationDelay: `${440 + si * 80}ms` }}>
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="text-slate-900 font-bold">{section.title}</h3>
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Top 8</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {section.data.length === 0 ? (
                    <div className="px-6 py-14 text-center text-slate-400 text-sm">{section.empty}</div>
                  ) : (
                    section.data.map((item: any, i: number) => (
                      <button key={item.name || item.id || i} type="button"
                        onClick={() => setRankDetail({ type: section.type, data: item })}
                        className="w-full flex items-center gap-3.5 px-6 py-3.5 transition-colors duration-100 hover:bg-slate-50 active:bg-slate-100 text-left focus:outline-none focus:bg-slate-50">
                        <motion.span initial={{ scale: 0, rotate: -180 }} animate={{ scale: 1, rotate: 0 }} transition={{ delay: i * 0.06, type: 'spring', stiffness: 260, damping: 18 }}
                          className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 shadow-sm ${i < 3 ? 'text-white' : 'text-slate-400 bg-slate-100'}`}
                          style={{ backgroundColor: i < 3 ? ['#f59e0b','#94a3b8','#d97706'][i] : '', ...(i < 3 ? { boxShadow: `0 4px 12px ${['#f59e0b66','#94a3b866','#d9770666'][i]}` } : {}) }}>
                          {i + 1}
                        </motion.span>
                        {section.type === 'emp' ? (
                          <>
                            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: i * 0.06 + 0.08, type: 'spring', stiffness: 260, damping: 18 }}
                              className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-black shrink-0 border-2 shadow-sm"
                              style={{
                                backgroundColor: gradeHex(item.grade) + '20',
                                borderColor: gradeHex(item.grade),
                                color: gradeHex(item.grade),
                              }}>
                              {item.grade}
                            </motion.span>
                            <div className="flex-1 min-w-0">
                              <p className="text-slate-900 text-sm font-bold truncate">{item.name}</p>
                              <p className="text-slate-400 text-xs">{item.count} Termin{item.count !== 1 ? 'e' : ''} &middot; {item.hours.toFixed(1)}h</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-slate-900 text-sm font-bold">{formatCurrency(item.profit)}</p>
                              <p className={`text-xs font-bold ${item.margin >= 0 ? 'text-green-600' : 'text-red-500'}`}>{item.margin >= 0 ? '+' : ''}{item.margin.toFixed(1)}%</p>
                            </div>
                          </>
                        ) : (
                          <>
                            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: i * 0.06 + 0.08, type: 'spring', stiffness: 260, damping: 18 }}
                              className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-black shrink-0 border-2 shadow-sm"
                              style={{
                                backgroundColor: gradeHex(item.grade) + '20',
                                borderColor: gradeHex(item.grade),
                                color: gradeHex(item.grade),
                              }}>
                              {item.grade}
                            </motion.span>
                            <div className="flex-1 min-w-0">
                              <p className="text-slate-900 text-sm font-bold truncate">{item.kunde || 'Unbekannt'}</p>
                              <p className="text-slate-400 text-xs truncate">{item.projekt} &middot; {item.datum}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-slate-900 text-sm font-bold">{formatCurrency(item.profit)}</p>
                              <p className={`text-xs font-bold ${item.margin >= 0 ? 'text-green-600' : 'text-red-500'}`}>{item.margin >= 0 ? '+' : ''}{item.margin.toFixed(1)}%</p>
                            </div>
                          </>
                        )}
                        <svg className="w-4 h-4 text-slate-300 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                      </button>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* KPI Info Modal */}
      {openKpi && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fadeIn" onClick={() => setOpenKpi(null)}>
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-slideUp" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">
                {openKpi === 'revenue' && 'Umsatz'}
                {openKpi === 'cost' && 'Kosten'}
                {openKpi === 'profit' && 'Gewinn'}
                {openKpi === 'count' && 'Aufträge'}
              </h3>
              <button type="button" onClick={() => setOpenKpi(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600 leading-relaxed">
                {openKpi === 'revenue' && 'Der Gesamtumsatz ist die Summe aller Rechnungsbeträge im ausgewählten Zeitraum. Bei Terminen mit mehreren Mitarbeitern wird der Umsatz für die Marge-Berechnung pro Mitarbeiter aufgeteilt.'}
                {openKpi === 'cost' && 'Die Gesamtkosten ergeben sich aus der Summe aller gearbeiteten Stunden multipliziert mit dem jeweiligen Stundenlohn des Mitarbeiters.'}
                {openKpi === 'profit' && 'Der Gewinn ist die Differenz zwischen Umsatz und Kosten. Ist er positiv, war der Termin profitabel. Ist er negativ, hast du an dem Termin Verlust gemacht.'}
                {openKpi === 'count' && 'Die Anzahl der Termine im ausgewählten Zeitraum. Dazu zählen alle abgeschlossenen und laufenden Einsätze.'}
              </p>
              <div className="bg-slate-50 rounded-xl p-4 space-y-2 border border-slate-100">
                {openKpi === 'revenue' && (
                  <>
                    <div className="flex items-center justify-between text-sm"><span className="text-slate-500">Anzahl Termine</span><span className="font-bold text-slate-900">{summary.count}</span></div>
                    <div className="flex items-center justify-between text-sm"><span className="text-slate-500">⌀ pro Termin</span><span className="font-bold text-slate-900">{formatCurrency(avgPerAssign)}</span></div>
                    <div className="flex items-center justify-between text-sm"><span className="text-slate-500">Höchster Termin</span><span className="font-bold text-slate-900">{formatCurrency(summary.maxRev)}</span></div>
                  </>
                )}
                {openKpi === 'cost' && (
                  <>
                    <div className="flex items-center justify-between text-sm"><span className="text-slate-500">Anzahl Termine</span><span className="font-bold text-slate-900">{summary.count}</span></div>
                    <div className="flex items-center justify-between text-sm"><span className="text-slate-500">⌀ pro Termin</span><span className="font-bold text-slate-900">{formatCurrency(summary.count > 0 ? summary.cost / summary.count : 0)}</span></div>
                    <div className="flex items-center justify-between text-sm"><span className="text-slate-500">Umsatz − Kosten</span><span className={`font-bold ${summary.profit >= 0 ? 'text-teal-600' : 'text-red-500'}`}>{formatCurrency(summary.profit)}</span></div>
                  </>
                )}
                {openKpi === 'profit' && (
                  <>
                    <div className="flex items-center justify-between text-sm"><span className="text-slate-500">Profitabel</span><span className="font-bold text-green-600">{summary.prof}</span></div>
                    <div className="flex items-center justify-between text-sm"><span className="text-slate-500">Mit Verlust</span><span className="font-bold text-red-500">{summary.loss}</span></div>
                    <div className="flex items-center justify-between text-sm"><span className="text-slate-500">Marge</span><span className={`font-bold ${summary.avgM >= 0 ? 'text-teal-600' : 'text-red-500'}`}>{summary.avgM.toFixed(1)} %</span></div>
                  </>
                )}
                {openKpi === 'count' && (
                  <>
                    <div className="flex items-center justify-between text-sm"><span className="text-slate-500">Profitabel</span><span className="font-bold text-green-600">{summary.prof}</span></div>
                    <div className="flex items-center justify-between text-sm"><span className="text-slate-500">Mit Verlust</span><span className="font-bold text-red-500">{summary.loss}</span></div>
                    <div className="flex items-center justify-between text-sm"><span className="text-slate-500">Erfolgsquote</span><span className="font-bold text-slate-900">{summary.count > 0 ? ((summary.prof / summary.count) * 100).toFixed(0) : 0} %</span></div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Profit Score Info Modal */}
      {showScoreInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fadeIn" onClick={() => setShowScoreInfo(false)}>
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[85vh] overflow-hidden shadow-2xl border border-slate-200 flex flex-col animate-slideUp" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 bg-gradient-to-r from-teal-600 to-emerald-600 text-center shrink-0">
              <h3 className="text-xl font-bold text-white">Profit Score</h3>
              <p className="text-xs text-white/80 mt-1">So wird dein Score berechnet</p>
            </div>
            <div className="overflow-y-auto p-6 space-y-5">
              <div className="flex items-center justify-center gap-4 p-4 bg-slate-50 rounded-xl">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border-2 ${gradeColor(summary.grade).split(' ').slice(1).join(' ')}`}>
                  <span className={`text-2xl font-black ${gradeColor(summary.grade).split(' ')[0]}`}>{summary.count > 0 ? summary.grade : '–'}</span>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Dein Score</p>
                  <p className="text-base font-bold text-slate-900">{summary.count > 0 ? `${summary.avgM.toFixed(1)} % Marge` : 'Keine Daten'}</p>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Was ist der Profit Score?</p>
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Der Profit Score bewertet, wie profitabel deine Einsätze sind. Er basiert auf der <strong className="text-teal-600">Gewinnmarge</strong> – also dem Prozentsatz des Gewinns im Verhältnis zum Umsatz.
                  </p>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Berechnung</p>
                <div className="space-y-2">
                  {[
                    { n: 1, t: 'Umsatz ermitteln', d: 'Summe der Rechnungsbeträge aller Termine.' },
                    { n: 2, t: 'Kosten berechnen', d: 'Stunden × Stundenlohn des Mitarbeiters, summiert.' },
                    { n: 3, t: 'Gewinn berechnen', d: 'Umsatz minus Kosten.' },
                    { n: 4, t: 'Marge in % = Score', d: '(Gewinn ÷ Umsatz) × 100. Wird in Schulnote A+ bis F übersetzt.' },
                  ].map(s => (
                    <div key={s.n} className="flex gap-3">
                      <div className="w-7 h-7 shrink-0 rounded-full bg-gradient-to-br from-teal-600 to-emerald-500 text-white text-xs font-black flex items-center justify-center shadow-sm">{s.n}</div>
                      <div>
                        <p className="text-sm font-bold text-slate-900">{s.t}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{s.d}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-3.5 bg-teal-50 border border-teal-200 rounded-xl">
                <p className="text-[10px] font-bold uppercase tracking-widest text-teal-700 mb-1.5">Die Formel</p>
                <p className="text-sm font-mono text-slate-700 leading-relaxed">
                  <span className="font-bold">Umsatz</span> − <span className="font-bold">Kosten</span> = <span className="font-bold text-teal-600">Gewinn</span><br />
                  <span className="font-bold text-teal-600">Gewinn</span> ÷ <span className="font-bold">Umsatz</span> × 100 = <span className="font-bold text-teal-600">Marge (%)</span>
                </p>
              </div>

              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Notenskala</p>
                <div className="space-y-1.5">
                  {(['A+', 'A', 'B', 'C', 'D', 'F'] as const).map(g => {
                    const isActive = g === summary.grade && summary.count > 0;
                    return (
                      <div key={g} className={`flex items-center gap-3 p-2.5 rounded-lg transition-colors ${isActive ? 'bg-teal-50 border-l-2 border-teal-500' : ''}`}>
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black ${gradeColor(g).split(' ').slice(1).join(' ')}`} style={{ backgroundColor: gradeHex(g) + '20' }}>
                          <span style={{ color: gradeHex(g) }}>{g}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-900">{gradeLabel(g)}</p>
                          <p className="text-[10px] text-slate-400">{gradeRange(g)}</p>
                        </div>
                        {isActive && <span className="text-[10px] font-bold text-teal-600 uppercase tracking-wider">Dein Score</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 shrink-0">
              <button type="button" onClick={() => setShowScoreInfo(false)} className="w-full py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-bold rounded-xl text-sm transition-all active:scale-[0.97]">Verstanden</button>
            </div>
          </div>
        </div>
      )}

      {/* Rank Detail Modal */}
      {rankDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fadeIn" onClick={() => setRankDetail(null)}>
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-slideUp" onClick={e => e.stopPropagation()}>
            <div className={`px-6 py-5 ${rankDetail.type === 'emp' ? 'bg-gradient-to-r from-teal-600 to-emerald-600' : 'bg-gradient-to-r from-amber-500 to-orange-500'} text-white`}>
              <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">{rankDetail.type === 'emp' ? 'Mitarbeiter' : 'Termin'}</p>
              <h3 className="text-xl font-bold mt-0.5 truncate">
                {rankDetail.type === 'emp' ? rankDetail.data.name : (rankDetail.data.kunde || rankDetail.data.projekt || 'Termin')}
              </h3>
              {rankDetail.type === 'assign' && rankDetail.data.projekt && (
                <p className="text-xs opacity-80 mt-0.5 truncate">{rankDetail.data.projekt} · {rankDetail.data.datum}</p>
              )}
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-center">
                <div className={`w-20 h-20 rounded-2xl flex items-center justify-center border-2 ${gradeColor(rankDetail.data.grade).split(' ').slice(1).join(' ')}`}>
                  <span className={`text-4xl font-black ${gradeColor(rankDetail.data.grade).split(' ')[0]}`}>{rankDetail.data.grade}</span>
                </div>
              </div>
              <div className="bg-slate-50 rounded-xl p-4 space-y-2.5 border border-slate-100">
                <div className="flex items-center justify-between text-sm"><span className="text-slate-500">Marge</span><span className={`font-bold ${rankDetail.data.margin >= 0 ? 'text-green-600' : 'text-red-500'}`}>{rankDetail.data.margin >= 0 ? '+' : ''}{rankDetail.data.margin.toFixed(1)} %</span></div>
                <div className="flex items-center justify-between text-sm"><span className="text-slate-500">Gewinn</span><span className={`font-bold ${rankDetail.data.profit >= 0 ? 'text-teal-600' : 'text-red-500'}`}>{formatCurrency(rankDetail.data.profit)}</span></div>
                {rankDetail.type === 'emp' ? (
                  <>
                    <div className="flex items-center justify-between text-sm"><span className="text-slate-500">Umsatz (Anteil)</span><span className="font-bold text-slate-900">{formatCurrency(rankDetail.data.revenue)}</span></div>
                    <div className="flex items-center justify-between text-sm"><span className="text-slate-500">Kosten</span><span className="font-bold text-slate-900">{formatCurrency(rankDetail.data.cost)}</span></div>
                    <div className="flex items-center justify-between text-sm"><span className="text-slate-500">Stundenlohn</span><span className="font-bold text-slate-900">{formatCurrency(rankDetail.data.rate)} / h</span></div>
                    <div className="flex items-center justify-between text-sm"><span className="text-slate-500">Stunden</span><span className="font-bold text-slate-900">{rankDetail.data.hours.toFixed(1)} h</span></div>
                    <div className="flex items-center justify-between text-sm"><span className="text-slate-500">Termine</span><span className="font-bold text-slate-900">{rankDetail.data.count}</span></div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between text-sm"><span className="text-slate-500">Umsatz</span><span className="font-bold text-slate-900">{formatCurrency(rankDetail.data.revenue)}</span></div>
                    <div className="flex items-center justify-between text-sm"><span className="text-slate-500">Kosten</span><span className="font-bold text-slate-900">{formatCurrency(rankDetail.data.cost)}</span></div>
                    <div className="flex items-center justify-between text-sm"><span className="text-slate-500">Stunden</span><span className="font-bold text-slate-900">{rankDetail.data.hours.toFixed(1)} h</span></div>
                    <div className="flex items-center justify-between text-sm"><span className="text-slate-500">Datum</span><span className="font-bold text-slate-900">{rankDetail.data.datum || '–'}</span></div>
                  </>
                )}
              </div>
              {(() => {
                const { reasons, suggestions } = explainRankEntry(rankDetail.data, rankDetail.type === 'emp' ? empRank : assignRank);
                if (reasons.length === 0 && suggestions.length === 0) return null;
                return (
                  <div className="bg-amber-50 rounded-xl p-4 space-y-2 border border-amber-100">
                    <p className="text-xs font-bold text-amber-700 uppercase tracking-wide">Ursachenanalyse</p>
                    {reasons.map((r, i) => (
                      <p key={i} className="text-sm text-slate-700 flex items-start gap-1.5"><span className="text-amber-500 mt-0.5">•</span>{r}</p>
                    ))}
                    {suggestions.length > 0 && (
                      <div className="pt-1.5 mt-1.5 border-t border-amber-100 space-y-1.5">
                        {suggestions.map((s, i) => (
                          <p key={i} className="text-sm text-teal-700 font-medium flex items-start gap-1.5"><span className="text-teal-500 mt-0.5">→</span>{s}</p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
              <button type="button" onClick={() => { setRankDetail(null); router.push(rankDetail.type === 'emp' ? '/employees' : '/assignments'); }}
                className="w-full py-2.5 rounded-xl text-sm font-bold text-teal-600 bg-teal-50 hover:bg-teal-100 border border-teal-200 transition-all active:scale-[0.97]">
                Alle {rankDetail.type === 'emp' ? 'Mitarbeiter' : 'Termine'} ansehen →
              </button>
            </div>
            <button type="button" onClick={() => setRankDetail(null)} className="absolute top-3 right-3 p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-colors" aria-label="Schließen">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
        </div>
      )}

      {/* Date Picker Modal */}
      {showDatePicker && (
        <DatePickerModal
          value={specificDate}
          viewDate={pickerDate}
          onChangeView={setPickerDate}
          onClose={() => setShowDatePicker(false)}
          onSelect={(ymd) => { setSpecificDate(ymd); setRange(''); setShowDatePicker(false); }}
          onClear={() => { setSpecificDate(''); setRange('alle'); setShowDatePicker(false); }}
        />
      )}
    </div>
  );
}

function DatePickerModal({ value, viewDate, onChangeView, onClose, onSelect, onClear }: {
  value: string;
  viewDate: Date;
  onChangeView: (d: Date) => void;
  onClose: () => void;
  onSelect: (ymd: string) => void;
  onClear: () => void;
}) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const ymdToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const monthNames = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  const dayNames = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);
  let firstWeekday = firstOfMonth.getDay() - 1;
  if (firstWeekday < 0) firstWeekday = 6;
  const daysInMonth = lastOfMonth.getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  function toYMD(d: number) { return `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] pb-8 bg-black/30 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-sm mx-4 animate-slideUp" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Tag auswählen</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 active:scale-[0.9] transition-all" aria-label="Schließen">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <button type="button" onClick={() => onChangeView(new Date(year, month - 1, 1))}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 active:scale-[0.92] transition-all" aria-label="Vorheriger Monat">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <p className="text-base font-bold text-slate-900 select-none">{monthNames[month]} {year}</p>
            <button type="button" onClick={() => onChangeView(new Date(year, month + 1, 1))}
              disabled={year > today.getFullYear() || (year === today.getFullYear() && month >= today.getMonth())}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 active:scale-[0.92] transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-500 disabled:active:scale-100" aria-label="Nächster Monat">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>
          <div className="grid grid-cols-7 mb-2">
            {dayNames.map(d => (
              <div key={d} className="text-center text-[10px] font-bold uppercase tracking-wider text-slate-400 py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (d === null) return <div key={i} className="aspect-square" />;
              const ymd = toYMD(d);
              const isSelected = ymd === value;
              const isToday = ymd === ymdToday;
              const isFuture = new Date(year, month, d) > today;
              return (
                <button key={i} type="button" disabled={isFuture}
                  onClick={() => onSelect(ymd)}
                  className={`aspect-square rounded-lg text-sm font-semibold transition-all active:scale-[0.92] disabled:opacity-25 disabled:cursor-not-allowed disabled:hover:bg-transparent ${
                    isSelected
                      ? 'bg-gradient-to-br from-teal-600 to-emerald-600 text-white shadow-md shadow-teal-200/40 hover:from-teal-700 hover:to-emerald-700'
                      : isToday
                        ? 'bg-teal-50 text-teal-700 ring-1 ring-teal-300 hover:bg-teal-100'
                        : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >{d}</button>
              );
            })}
          </div>
          <div className="mt-5 flex gap-2">
            <button type="button" onClick={() => onSelect(ymdToday)}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 active:scale-[0.97] transition-all">
              Heute
            </button>
            <button type="button" onClick={onClear}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 active:scale-[0.97] transition-all">
              Zurücksetzen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
