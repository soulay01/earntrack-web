'use client';

import { useData } from '@/app/Provider';
import { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { filterByTimeRange, formatCurrency, parseDate, parseGermanCurrency } from '@/lib/utils';
import Sidebar from '@/components/Sidebar';
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

function formatDateDE(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Na, Nachteule';
  if (h < 12) return 'Guten Morgen';
  if (h < 17) return 'Schönen Nachmittag';
  if (h < 22) return 'Guten Abend';
  return 'Na, Nachteule';
}

function getDailyQuote() {
  const start = new Date(2025, 0, 1).getTime();
  const now = new Date().getTime();
  const day = Math.floor((now - start) / 86400000);
  return quotes[day % quotes.length];
}

const quotes = [
  // ——— Philosophen & Denker (85) ———
  'Der einzige Weg, großartige Arbeit zu leisten, ist zu lieben, was du tust. – Steve Jobs',
  'Erfolg ist die Fähigkeit, von einem Misserfolg zum nächsten zu gehen, ohne die Begeisterung zu verlieren. – Winston Churchill',
  'Wenn du die Art und Weise veränderst, wie du die Dinge betrachtest, verändern sich die Dinge, die du betrachtest. – Wayne Dyer',
  'Was du denkst, wirst du. – Buddha',
  'Der Weg zu etwas Neuem führt nicht über das Vermeiden von Fehlern, sondern über das Zulassen von Fehlern. – Karl Popper',
  'Ein Schiff ist im Hafen sicher, aber dafür sind Schiffe nicht da. – John A. Shedd',
  'Der einzige Mensch, der dich wirklich aufhalten kann, bist du selbst. – Walt Disney',
  'Das Leben ist wie Fahrradfahren – um die Balance zu halten, musst du in Bewegung bleiben. – Albert Einstein',
  'Die beste Zeit, einen Baum zu pflanzen, war vor 20 Jahren. Die zweitbeste Zeit ist jetzt. – Chinesisches Sprichwort',
  'Nicht weil die Dinge schwierig sind, wagen wir sie nicht, sondern weil wir sie nicht wagen, sind sie schwierig. – Seneca',
  'Der Stein kommt am besten gegen die Mauer an, wenn man ihn mit voller Wucht wirft. – Franz Kafka',
  'Man sieht die Sonne langsam untergehen und erschrickt doch, wenn es plötzlich dunkel ist. – Franz Kafka',
  'Handle so, dass die Maxime deines Willens jederzeit zugleich als Prinzip einer allgemeinen Gesetzgebung gelten könne. – Immanuel Kant',
  'Habe den Mut, dich deines eigenen Verstandes zu bedienen. – Immanuel Kant',
  'Was mich nicht umbringt, macht mich stärker. – Friedrich Nietzsche',
  'Der Mensch ist etwas, das überwunden werden soll. – Friedrich Nietzsche',
  'Werde, der du bist. – Friedrich Nietzsche',
  'Carpe Diem – Nutze den Tag. – Horaz',
  'Ich denke, also bin ich. – René Descartes',
  'Glück ist kein Geschenk der Götter, sondern die Frucht innerer Einstellung. – Erich Fromm',
  'Die Freiheit des Menschen liegt nicht darin, dass er tun kann, was er will, sondern dass er nicht tun muss, was er nicht will. – Jean-Jacques Rousseau',
  'Phantasie ist wichtiger als Wissen, denn Wissen ist begrenzt. – Albert Einstein',
  'Erfolg besteht darin, dass man genau die Fähigkeiten hat, die in dem Moment gefragt sind. – Henry Ford',
  'Ob du denkst, du kannst, oder du denkst, du kannst nicht – du wirst auf jeden Fall Recht behalten. – Henry Ford',
  'Die größte Entdeckung aller Zeiten ist, dass ein Mensch seine Zukunft ändern kann, indem er seine Einstellung ändert. – Oprah Winfrey',
  'Der Weg zum Erfolg ist, die Begeisterung zu bewahren, auch wenn die Dinge schwierig werden. – Joseph Campbell',
  'Träume nicht dein Leben, lebe deinen Traum. – Mark Twain',
  'Die zwei wichtigsten Tage in deinem Leben sind der Tag, an dem du geboren wirst, und der Tag, an dem du herausfindest, warum. – Mark Twain',
  'Gib einem Mann einen Fisch und du ernährst ihn für einen Tag. Lehre einen Mann zu fischen und du ernährst ihn für sein Leben. – Laotse',
  'Die Reise von tausend Meilen beginnt mit einem einzigen Schritt. – Laotse',
  'Wer anderen folgt, kommt nie an. Wer allein geht, findet nie etwas. – Konfuzius',
  'Wähle einen Beruf, den du liebst, und du brauchst keinen Tag in deinem Leben mehr zu arbeiten. – Konfuzius',
  'Der Klügste gibt nach. – Konfuzius',
  'Nicht der Wind bestimmt die Richtung, sondern das Segel. – Sprichwort',
  'Der frühe Vogel fängt den Wurm. – Sprichwort',
  'Steter Tropfen höhlt den Stein. – Ovid',
  'Das einzig Beständige im Leben ist der Wandel. – Heraklit',
  'Lebe, als ob du morgen sterben würdest. Lerne, als ob du ewig leben würdest. – Mahatma Gandhi',
  'Sei du selbst die Veränderung, die du dir wünschst für diese Welt. – Mahatma Gandhi',
  'Das Glück deines Lebens hängt von der Beschaffenheit deiner Gedanken ab. – Marc Aurel',
  'Schicke dich in die Schickung. – Marc Aurel',
  'Nichts im Übermaß. – Solon',
  'Erkenne dich selbst. – Thales von Milet',
  'Der Mensch ist des Menschen Wolf. – Thomas Hobbes',
  'Der Zweck heiligt die Mittel. – Niccolò Machiavelli',
  'Die Grenzen meiner Sprache bedeuten die Grenzen meiner Welt. – Ludwig Wittgenstein',
  'Wovon man nicht sprechen kann, darüber muss man schweigen. – Ludwig Wittgenstein',
  'Gott ist tot. – Friedrich Nietzsche',
  'Das Sein bestimmt das Bewusstsein. – Karl Marx',
  'Bildung ist das, was übrig bleibt, wenn man vergisst, was man in der Schule gelernt hat. – Albert Einstein',
  'Die Welt ist alles, was der Fall ist. – Ludwig Wittgenstein',
  'Wer kämpft, kann verlieren. Wer nicht kämpft, hat schon verloren. – Bertolt Brecht',
  'Erst das Fressen, dann die Moral. – Bertolt Brecht',
  'Die Wahrheit ist das, was uns frei macht. – Hannah Arendt',
  'Die Hoffnung ist der Regenbogen über den herabstürzenden Bach des Lebens. – Friedrich Nietzsche',
  'Das Leben ist kurz – brich die Regeln. – Paulo Coelho',
  'Wenn du etwas willst, das du noch nie hattest, dann tu etwas, das du noch nie getan hast. – Paulo Coelho',
  'Der beste Weg, die Zukunft vorherzusagen, ist, sie zu gestalten. – Peter Drucker',
  'Die beste Führungskraft ist die, die genug Verstand hat, die richtigen Leute auszuwählen, und genug Zurückhaltung, ihnen nicht in die Quere zu kommen. – Theodore Roosevelt',
  'Rede leise und trage einen großen Stock. – Theodore Roosevelt',
  'Tu, was du kannst, mit dem, was du hast, wo du bist. – Theodore Roosevelt',
  'Das Geheimnis des Erfolges ist, den Standpunkt des anderen zu verstehen. – Henry Ford',
  'Der einzige Ort, an dem Erfolg vor Arbeit kommt, ist im Wörterbuch. – Vidal Sassoon',
  'Es ist nicht genug zu wissen – man muss auch anwenden. Es ist nicht genug zu wollen – man muss auch tun. – Johann Wolfgang von Goethe',
  'Nichts ist schrecklicher als ein Lehrer, der nicht mehr lernt als sein Lehrplan den Schülern vorschreibt. – Johann Wolfgang von Goethe',
  'Wie einer ist, so sind seine Freunde. So wie er ist, so handelt er. – Johann Wolfgang von Goethe',
  'Man sollte alle Tage wenigstens ein kleines Lied hören, ein gutes Gedicht lesen, ein treffliches Gemälde sehen und, wenn es möglich zu machen wäre, ein vernünftiges Wort sprechen. – Johann Wolfgang von Goethe',
  'Der Mensch irrt, solange er strebt. – Johann Wolfgang von Goethe',
  'In der Mitte des Schwierigkeitsgrades liegt die Leichtigkeit. – Aristoteles',
  'Der Anfang ist die Hälfte des Ganzen. – Aristoteles',
  'Die Freude am Tun macht die Arbeit leicht. – Aristoteles',
  'Wir sind, was wir wiederholt tun. Vortrefflichkeit ist daher keine Handlung, sondern eine Gewohnheit. – Aristoteles',
  'Das Ganze ist mehr als die Summe seiner Teile. – Aristoteles',
  'Kreativität erfordert den Mut, sich von Gewissheiten zu lösen. – Erich Fromm',
  'Die Aufgabe der Umgebung ist nicht, das Kind zu formen, sondern ihm zu erlauben, sich zu offenbaren. – Maria Montessori',
  'Hilf mir, es selbst zu tun. – Maria Montessori',
  'Der Forscher ist das, was die Wissenschaft aus sich selbst macht. – Karl Popper',
  'Die Quelle des Lebens ist der Tod. – Karl Marx',
  'Es gibt keine Freiheit ohne die Freiheit zu straucheln. – Hannah Arendt',
  'Die einzige Konstante im Universum ist die Veränderung. – Heraklit',
  'Die Dinge, die wir am meisten bereuen, sind die Dinge, die wir nicht getan haben. – Unbekannt',
  'Die Kunst des Lebens besteht darin, im Regen zu tanzen, anstatt auf die Sonne zu warten. – Unbekannt',
  'Das Leben ist zu kurz, um es mit negativen Menschen zu verbringen. – Unbekannt',
  'Erfolg ist nicht der Schlüssel zum Glück. Glück ist der Schlüssel zum Erfolg. – Albert Schweitzer',
  'Das Beispiel ist nicht das Wichtigste, es ist das Einzige. – Albert Schweitzer',
  // ——— Anime (15) ———
  'Wenn du aufgibst, ist das Spiel vorbei. – Goku (Dragon Ball)',
  'Hartes Training macht dich stärker. Das ist das Gesetz des Dschungels. – Rock Lee (Naruto)',
  'Die Welt ist nicht perfekt, aber sie ist voller Möglichkeiten. – Mob (Mob Psycho 100)',
  'Ein Mensch wird erst dann wirklich stark, wenn ihm bewusst wird, dass er für etwas kämpft. – Itachi Uchiha (Naruto)',
  'Gib niemals auf, denn der Kampf geht erst weiter, wenn du aufgibst. – Roronoa Zoro (One Piece)',
  'Ich weiß nicht, wie die Zukunft aussehen wird, aber ich werde niemals bereuen, was ich getan habe. – Edward Elric (Fullmetal Alchemist)',
  'Wer die Sonne nicht kennt, fürchtet keinen Schatten. – Killua Zoldyck (Hunter × Hunter)',
  'Der Himmel ist nicht die Grenze – sie existiert nur in deinem Kopf. – Levi Ackermann (Attack on Titan)',
  'Man muss nicht perfekt sein, um unglaublich zu sein. – Shoto Todoroki (My Hero Academia)',
  'Es gibt keinen Weg, den man nicht gehen kann, wenn man wirklich bereit ist. – Lelouch vi Britannia (Code Geass)',
  'Der Wert eines Menschen liegt nicht darin, wie lange er lebt, sondern wie er lebt. – Portgas D. Ace (One Piece)',
  'Mut ist nicht die Abwesenheit von Angst, sondern die Entscheidung, dass etwas wichtiger ist als die Angst. – Eren Yeager (Attack on Titan)',
  'Ein wahrer Held ist nicht der, der niemals fällt, sondern der, der immer wieder aufsteht. – All Might (My Hero Academia)',
  'Die größten Abenteuer beginnen dort, wo Pläne enden. – Junko (Danganronpa)',
  'Manchmal ist der beste Weg, vorwärts zu kommen, einen Schritt zurückzutreten. – Shikamaru Nara (Naruto)',
];

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
  const { user, loading, assignments: rawAssignments, employees: rawEmployees, company } = useData();
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
      const r = parseGermanCurrency(x.umsatz);
      const h = parseFloat(String(x.stunden)) || 0;
      const l = parseFloat(String(x.stundenlohn)) || 0;
      const c = h * l;
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
      const c = h * rate;
      let r = 0;
      ea.forEach((a: any) => {
        const names = Array.isArray(a.mitarbeiter) ? a.mitarbeiter.map((n: string) => n.trim()) : (a.mitarbeiter || '').split(',').map((n: string) => n.trim());
        const split = names.length > 0 ? 1 / names.length : 1;
        const rev = parseGermanCurrency(a.umsatz);
        r += rev * split;
      });
      const p = r - c;
      const m = r > 0 ? (p / r) * 100 : 0;
      return { name, grade: getGrade(m), profit: p, margin: m, hours: h, count: ea.length, rate, revenue: r, cost: c };
    }).sort((a, b) => b.profit - a.profit).slice(0, 8);
  }, [employees, assignments]);

  const assignRank = useMemo(() => {
    return [...assignments].map(a => {
      const r = parseGermanCurrency(a.umsatz);
      const h = parseFloat(String(a.stunden)) || 0;
      const l = parseFloat(String(a.stundenlohn)) || 0;
      const c = h * l;
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
      const r = parseGermanCurrency(a.umsatz);
      const h = parseFloat(String(a.stunden)) || 0;
      const rate = parseFloat(String(a.stundenlohn)) || 0;
      m[k].revenue += r; m[k].cost += h * rate; m[k].profit += r - h * rate;
    });
    return Object.values(m).sort((a: any, b: any) => a.name.localeCompare(b.name));
  }, [assignments]);

  const pieData = useMemo(() => {
    const items = [
      { name: 'Umsatz', value: summary.rev, color: PIE_COLORS.revenue },
      { name: 'Kosten', value: summary.cost, color: PIE_COLORS.cost },
      { name: 'Gewinn', value: summary.profit > 0 ? summary.profit : 0, color: PIE_COLORS.profit },
    ].filter(i => i.value > 0);
    return items;
  }, [summary]);

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-teal-50 to-emerald-50">
      <div className="flex flex-col items-center gap-3">
        <img src="/logo.png" alt="EarnTrack" className="w-10 h-10 rounded-full object-cover shadow-lg shadow-teal-200/30" />
        <div className="flex gap-1">
          <span className="w-2 h-2 rounded-full bg-teal-600 animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 rounded-full bg-teal-500 animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 rounded-full bg-teal-400 animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
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
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="px-4 py-4 md:px-8 md:py-8 max-w-7xl mx-auto space-y-6 md:space-y-8">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 animate-fadeIn">
            <div>
              <h1 className="text-xl md:text-3xl font-bold text-slate-900 tracking-tight">{getGreeting()}, {user?.displayName || company?.name || 'Unternehmer'}!</h1>
              <p className="text-slate-500 text-xs md:text-sm mt-1">
                {summary.count} Termin{summary.count !== 1 ? 'e' : ''} &middot; {summary.prof} profitabel, {summary.loss} mit Verlust
              </p>
              <p className="text-slate-600 text-xs md:text-base mt-2 md:mt-3 italic max-w-2xl leading-relaxed border-l-2 border-teal-400 pl-3 md:pl-4">„{quote}“</p>
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-5">
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
                  <div className={`w-28 h-28 rounded-2xl flex items-center justify-center mb-3 border-2 ${gradeColor(summary.grade).split(' ').slice(1).join(' ')} shadow-sm`}>
                    <span className={`text-6xl font-black tracking-tight ${gradeColor(summary.grade).split(' ')[0]}`}>
                      {summary.grade}
                    </span>
                  </div>
                  <p className="text-3xl font-bold text-slate-900 tracking-tight">{summary.avgM.toFixed(1)}%</p>
                  <p className="text-slate-400 text-sm mt-0.5">durchschnittliche Marge</p>
                </div>
              )}
              <div className="mt-6 space-y-2.5">
                {(['A+', 'A', 'B', 'C', 'D', 'F'] as const).map(g => {
                  const count = summary.grades?.[g] || 0;
                  const pct = summary.count > 0 ? (count / summary.count) * 100 : 0;
                  const hex = gradeHex(g);
                  return (
                    <div key={g} className="flex items-center gap-2.5">
                      <span className="w-6 text-right text-xs font-bold" style={{ color: hex }}>{g}</span>
                      <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: hex }} />
                      </div>
                      <span className="w-5 text-right text-xs font-semibold text-slate-400">{count}</span>
                    </div>
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
                        <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${i < 3 ? 'text-white shadow-sm' : 'text-slate-400 bg-slate-100'}`}
                          style={{ backgroundColor: i < 3 ? ['#f59e0b','#94a3b8','#d97706'][i] : '' }}>
                          {i + 1}
                        </span>
                        {section.type === 'emp' ? (
                          <>
                            <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 border ${gradeColor(item.grade)}`}>{item.grade}</span>
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
                            <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 border ${gradeColor(item.grade)}`}>{item.grade}</span>
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
