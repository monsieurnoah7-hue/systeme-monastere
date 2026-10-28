import { useCallback, useEffect, useState } from 'react';
import { api, type Dashboard as DashboardType, type StockRef, type Tool } from '../lib/api';
import {
  MOVE_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  formatDate,
  formatDateTime,
  todayLabel,
  initials,
} from '../lib/labels';
import {
  Banner,
  Button,
  Card,
  Chip,
  Drawer,
  EmptyState,
  PageHeader,
  Row,
  Spinner,
  cx,
} from '../components/ui';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Clock,
  Fingerprint,
  Package,
  RefreshCw,
  RotateCcw,
  Users,
  Wrench,
  ChevronRight,
} from 'lucide-react';
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type DrawerKind =
  | { kind: 'tools'; status: string; title: string }
  | { kind: 'stock' }
  | { kind: 'movements' }
  | { kind: 'attendance' }
  | { kind: 'overdue' }
  | { kind: 'missingTools' }
  | { kind: 'missingOut' }
  | { kind: 'absent' }
  | { kind: 'conge' };

const STATUS_ORDER = ['disponible', 'en_pret', 'maintenance', 'manquant', 'reforme'] as const;
type ToolStatusKey = (typeof STATUS_ORDER)[number];

const STATUS_COLOR: Record<ToolStatusKey, string> = {
  disponible: '#10b981',
  en_pret: '#ff5500',
  maintenance: '#f59e0b',
  manquant: '#ef4444',
  reforme: '#71717a',
};

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value?: number; name?: string; color?: string }[];
  label?: string;
}) {
  if (!active || !payload || !payload.length) return null;
  const item = payload[0];
  if (!item) return null;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs shadow-xl">
      <p className="font-semibold text-slate-300">{label ?? item.name}</p>
      <p className="mt-0.5 font-mono text-sm font-bold text-white">
        {item.value} <span className="text-xs font-normal text-slate-400">mouvements</span>
      </p>
    </div>
  );
}

function DonutTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { value?: number; name?: string }[];
}) {
  if (!active || !payload || !payload.length) return null;
  const item = payload[0];
  if (!item) return null;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs shadow-xl">
      <p className="font-semibold text-slate-300 capitalize">{item.name}</p>
      <p className="mt-0.5 font-mono text-sm font-bold text-white">
        {item.value} <span className="text-xs font-normal text-slate-400">outils</span>
      </p>
    </div>
  );
}

/**
 * Live Punch Clock Hero Banner
 */
function LiveTrackerHero({
  presentCount,
  totalTeam,
  onOpenPointage,
}: {
  presentCount: number;
  totalTeam: number;
  onOpenPointage: () => void;
}) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const timeStr = time.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = time.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-surface p-5 shadow-card transition-all">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        {/* Left: Live Time & Status */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-amber-wash border border-amber/20 text-amber shadow-xs">
            <Clock size={32} />
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-ink-soft">
              <span className="flex h-2 w-2 rounded-full bg-green animate-pulse" />
              <span className="capitalize">{dateStr}</span>
              <span>·</span>
              <span className="text-amber">Suivi en direct</span>
            </div>
            <div className="mt-1 font-mono text-3xl font-extrabold tracking-tight text-ink tabular-nums">
              {timeStr}
            </div>
            <p className="mt-0.5 text-xs text-ink-faint">
              C.F.T. des Bénédictins du Mont Fébé · Atelier Central
            </p>
          </div>
        </div>

        {/* Right: Team Presence Ratio & Quick Action Button */}
        <div className="flex flex-wrap items-center gap-4 border-t border-line/60 pt-4 sm:border-t-0 sm:pt-0">
          <div className="flex flex-col text-right">
            <span className="text-xs font-medium text-ink-soft">Équipe sur place</span>
            <div className="flex items-baseline gap-1 font-mono text-xl font-bold text-ink">
              <span className="text-green">{presentCount}</span>
              <span className="text-ink-faint">/</span>
              <span>{totalTeam}</span>
              <span className="text-xs font-normal text-ink-faint">
                {totalTeam > 1 ? 'ouvriers' : 'ouvrier'}
              </span>
            </div>
          </div>

          <button
            onClick={onOpenPointage}
            className="flex items-center gap-2 rounded-xl bg-amber px-5 py-3 text-sm font-semibold text-white shadow-card transition-all hover:bg-amber-2 active:scale-95"
          >
            <Fingerprint size={18} />
            <span>Mode Kiosque &amp; Pointage</span>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function ToolsDonut({
  das01,
  onPick,
}: {
  das01: DashboardType['das01'];
  onPick: (status: ToolStatusKey) => void;
}) {
  const data = STATUS_ORDER.filter((status) => das01[status] > 0).map((status) => ({
    status,
    name: STATUS_LABEL[status],
    value: das01[status],
  }));
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row">
      <div className="relative h-[170px] w-[170px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={55}
              outerRadius={80}
              paddingAngle={3}
              startAngle={90}
              endAngle={-270}
              stroke="none"
              isAnimationActive={false}
            >
              {data.map((slice) => (
                <Cell
                  key={slice.status}
                  fill={STATUS_COLOR[slice.status]}
                  onClick={() => onPick(slice.status)}
                  className="cursor-pointer"
                />
              ))}
            </Pie>
            <Tooltip cursor={false} content={<DonutTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="text-center">
            <p className="font-mono text-2xl font-bold leading-none text-ink tabular-nums">{das01.total}</p>
            <p className="mt-1 text-[10px] uppercase font-semibold tracking-wider text-ink-faint">outils</p>
          </div>
        </div>
      </div>

      <div className="grid w-full gap-1.5">
        {STATUS_ORDER.map((status) => (
          <button
            key={status}
            onClick={() => onPick(status)}
            className="flex items-center justify-between rounded-lg border border-line bg-surface px-3 py-2 text-xs transition-colors hover:border-amber hover:bg-amber-wash/30"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: STATUS_COLOR[status] }} />
              <span className="truncate font-medium text-ink">{STATUS_LABEL[status]}</span>
            </span>
            <span className="font-mono font-bold text-ink tabular-nums">{das01[status]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  icon,
  onClick,
  tone = 'default',
  className,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: React.ReactNode;
  onClick?: () => void;
  tone?: 'default' | 'warn' | 'alert' | 'success';
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'group rounded-xl border border-line bg-surface p-4 text-left shadow-card transition-all duration-150',
        onClick ? 'hover:-translate-y-0.5 hover:border-line-strong hover:shadow-card-hover' : 'cursor-default',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">{label}</span>
        <span className="flex items-center gap-1.5 text-xs text-ink-soft">
          {tone === 'success' && <span className="h-1.5 w-1.5 rounded-full bg-green" />}
          {tone === 'warn' && <span className="h-1.5 w-1.5 rounded-full bg-amber" />}
          {tone === 'alert' && <span className="h-1.5 w-1.5 rounded-full bg-red" />}
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-surface-2 text-ink-soft group-hover:text-ink">
            {icon}
          </span>
        </span>
      </div>
      <p className="mt-2 font-mono text-3xl font-extrabold leading-none text-ink tabular-nums">{value}</p>
      {hint ? <p className="mt-2 text-xs text-ink-soft leading-snug">{hint}</p> : null}
    </button>
  );
}

/**
 * Widget Présences Équipe
 */
function WhosInWidget({
  details,
}: {
  details: NonNullable<DashboardType['das04']>['detail'];
}) {
  const [filter, setFilter] = useState<'all' | 'present' | 'late' | 'absent'>('all');

  const filtered = details.filter((d) => {
    if (filter === 'all') return true;
    if (filter === 'present') return d.status === 'present';
    if (filter === 'late') return d.status === 'late';
    if (filter === 'absent') return d.status === 'absent';
    return true;
  });

  return (
    <Card className="shadow-card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
            <Users size={16} className="text-amber" /> Présences en atelier
          </h2>
          <p className="text-xs text-ink-faint">Suivi en direct des entrées et départs de l’équipe.</p>
        </div>

        {/* Segmented Filter Pills */}
        <div className="flex items-center rounded-lg bg-paper-2 p-1 text-xs">
          <button
            onClick={() => setFilter('all')}
            className={cx(
              'rounded-md px-2.5 py-1 font-medium transition-colors',
              filter === 'all' ? 'bg-surface text-ink font-semibold shadow-xs' : 'text-ink-soft hover:text-ink',
            )}
          >
            Tous ({details.length})
          </button>
          <button
            onClick={() => setFilter('present')}
            className={cx(
              'rounded-md px-2.5 py-1 font-medium transition-colors',
              filter === 'present' ? 'bg-surface text-green font-semibold shadow-xs' : 'text-ink-soft hover:text-ink',
            )}
          >
            À l'heure ({details.filter((d) => d.status === 'present').length})
          </button>
          <button
            onClick={() => setFilter('late')}
            className={cx(
              'rounded-md px-2.5 py-1 font-medium transition-colors',
              filter === 'late' ? 'bg-surface text-amber font-semibold shadow-xs' : 'text-ink-soft hover:text-ink',
            )}
          >
            Retards ({details.filter((d) => d.status === 'late').length})
          </button>
          <button
            onClick={() => setFilter('absent')}
            className={cx(
              'rounded-md px-2.5 py-1 font-medium transition-colors',
              filter === 'absent' ? 'bg-surface text-ink-faint font-semibold shadow-xs' : 'text-ink-soft hover:text-ink',
            )}
          >
            Absents ({details.filter((d) => d.status === 'absent').length})
          </button>
        </div>
      </div>

      <div className="max-h-[380px] overflow-y-auto scroll-thin divide-y divide-line">
        {filtered.map((person) => (
          <div
            key={person.id}
            className="flex items-center justify-between gap-3 p-3.5 hover:bg-paper-2/40 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-paper-2 text-xs font-bold text-ink-soft border border-line">
                  {initials(person.fullName)}
                </span>
                <span
                  className={cx(
                    'absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-surface',
                    person.status === 'present'
                      ? 'bg-green'
                      : person.status === 'late'
                      ? 'bg-amber'
                      : 'bg-ink-faint',
                  )}
                />
              </div>

              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{person.fullName}</p>
                <p className="truncate text-xs text-ink-faint">{person.jobTitle}</p>
              </div>
            </div>

            <div className="text-right shrink-0">
              {person.inAt ? (
                <div className="font-mono text-xs font-semibold text-ink tabular-nums">
                  {person.inAt}
                  {person.outAt ? <span className="text-ink-faint font-normal"> → {person.outAt}</span> : null}
                </div>
              ) : (
                <span className="text-xs text-ink-faint italic">Non pointé</span>
              )}
              <div className="mt-0.5">
                <span
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-[10px] font-medium text-ink-soft"
                >
                  <span
                    className={cx(
                      'h-1.5 w-1.5 rounded-full shrink-0',
                      person.status === 'present'
                        ? 'bg-green'
                        : person.status === 'late'
                        ? 'bg-amber'
                        : 'bg-ink-faint',
                    )}
                  />
                  {person.status === 'present'
                    ? 'Présent'
                    : person.status === 'late'
                    ? `Retard (+${person.lateMinutes}m)`
                    : 'Absent'}
                </span>
              </div>
            </div>
          </div>
        ))}

        {filtered.length === 0 ? (
          <div className="p-8 text-center text-xs text-ink-faint">
            Aucun collaborateur ne correspond à ce filtre.
          </div>
        ) : null}
      </div>
    </Card>
  );
}

export function Dashboard() {
  const [data, setData] = useState<DashboardType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [drawer, setDrawer] = useState<DrawerKind | null>(null);
  const [tools, setTools] = useState<Tool[] | null>(null);
  const [refs, setRefs] = useState<StockRef[] | null>(null);
  const [loans, setLoans] = useState<
    { id: number; tool_id: string; tool_name: string; employee_name: string; out_at: string }[]
  >([]);
  const [loansLoading, setLoansLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!data) setLoading(true);
    api<DashboardType>('/api/dashboard')
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled && !data) setError(err instanceof Error ? err.message : 'Chargement impossible.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  useEffect(() => {
    // Polling d'actualisation toutes les 15 secondes pour les flux atelier en temps réel
    const interval = setInterval(() => {
      setReload((v) => v + 1);
    }, 15000);
    const handleSync = () => setReload((v) => v + 1);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') setReload((v) => v + 1);
    };
    window.addEventListener('mf-refresh-data', handleSync);
    window.addEventListener('focus', handleSync);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      clearInterval(interval);
      window.removeEventListener('mf-refresh-data', handleSync);
      window.removeEventListener('focus', handleSync);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const openTools = useCallback((status: string, title: string) => {
    setTools(null);
    setDrawer({ kind: 'tools', status, title });
    api<{ tools: Tool[] }>(`/api/tools?status=${encodeURIComponent(status)}`)
      .then((res) => setTools(res.tools))
      .catch(() => setTools([]));
  }, []);

  useEffect(() => {
    if (drawer?.kind === 'stock') {
      setRefs(null);
      api<{ refs: StockRef[] }>('/api/stock/refs')
        .then((res) => setRefs(res.refs))
        .catch(() => setRefs([]));
    }
    if (drawer?.kind === 'overdue') {
      setLoansLoading(true);
      api<{ loans: { id: number; tool_id: string; tool_name: string; employee_name: string; out_at: string }[] }>(
        '/api/loans?status=out',
      )
        .then((res) => setLoans(res.loans))
        .catch(() => setLoans([]))
        .finally(() => setLoansLoading(false));
    }
  }, [drawer]);

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-sm text-ink-soft">
        <Spinner className="h-6 w-6 text-amber" />
        <p className="font-medium">Chargement du tableau de bord…</p>
      </div>
    );
  }

  if (!data) {
    return <EmptyState title="Tableau de bord indisponible" hint={error ?? undefined} />;
  }

  const { das01, das02, das03, das04, das05 } = data;
  const totalTeam = das04 ? das04.present + das04.absent + das04.late + das04.conge + das04.permission : 0;
  const dailyMoves = [
    { name: 'Entrées', value: das03.entries, color: '#10b981' },
    { name: 'Sorties', value: das03.exits, color: '#ff6603' },
    { name: 'Retours', value: das03.returns, color: '#3b82f6' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Vue d'ensemble"
        title="Tableau de bord"
        hint={todayLabel()}
        actions={
          <Button
            variant="ghost"
            size="sm"
            icon={<RefreshCw size={15} />}
            onClick={() => setReload((value) => value + 1)}
          >
            Actualiser
          </Button>
        }
      />

      {error ? (
        <div className="mb-4">
          <Banner tone="error">{error}</Banner>
        </div>
      ) : null}

      {/* Live Punch Clock Hero Banner */}
      <LiveTrackerHero
        presentCount={das04?.present ?? 0}
        totalTeam={totalTeam}
        onOpenPointage={() => setDrawer({ kind: 'attendance' })}
      />

      {/* KPIs Cards Grid - Horizontal scroll on mobile & tablet, grid on xl */}
      <section className="relative">
        <div className="flex xl:grid xl:grid-cols-4 gap-3 overflow-x-auto pb-2 -mx-3 px-3 sm:-mx-6 sm:px-6 xl:mx-0 xl:px-0 xl:pb-0 scroll-smooth snap-x snap-mandatory scrollbar-none [scrollbar-width:none] [-ms-overflow-style:none] touch-pan-x">
          <KpiCard
            className="min-w-[260px] sm:min-w-[280px] w-[75vw] sm:w-[320px] shrink-0 xl:w-auto xl:min-w-0 xl:shrink snap-start"
            label="Présences du jour"
            value={das04 ? das04.present : '—'}
            hint={
              das04
                ? totalTeam === 0
                  ? 'Aucun travailleur actif enregistré'
                  : `${das04.absent} absents · ${das04.late} retards · ${das04.conge} congés`
                : 'Accès restreint à la direction'
            }
            icon={<Users size={18} />}
            tone={das04 && das04.late > 0 ? 'warn' : 'success'}
            onClick={() => setDrawer({ kind: 'attendance' })}
          />

          <KpiCard
            className="min-w-[260px] sm:min-w-[280px] w-[75vw] sm:w-[320px] shrink-0 xl:w-auto xl:min-w-0 xl:shrink snap-start"
            label="Outils & Machines"
            value={das01.total}
            hint={`${das01.disponible} disponibles · ${das01.en_pret} en prêt`}
            icon={<Wrench size={18} />}
            onClick={() => openTools('disponible', 'Outils disponibles')}
          />

          <KpiCard
            className="min-w-[260px] sm:min-w-[280px] w-[75vw] sm:w-[320px] shrink-0 xl:w-auto xl:min-w-0 xl:shrink snap-start"
            label="Stocks d’Atelier"
            value={das02.refs}
            hint={`${das02.low} sous le seuil min · ${das02.empty} épuisées`}
            icon={<Package size={18} />}
            tone={das02.low + das02.empty > 0 ? 'warn' : 'default'}
            onClick={() => setDrawer({ kind: 'stock' })}
          />

          <KpiCard
            className="min-w-[260px] sm:min-w-[280px] w-[75vw] sm:w-[320px] shrink-0 xl:w-auto xl:min-w-0 xl:shrink snap-start"
            label="Mouvements d'Aujourd’hui"
            value={das03.exits + das03.entries + das03.returns}
            hint={`${das03.exits} sorties · ${das03.entries} entrées · ${das03.returns} retours`}
            icon={<ArrowUpRight size={18} />}
            onClick={() => setDrawer({ kind: 'movements' })}
          />
        </div>
      </section>

      {/* Main Grid: Présences & Analytics */}
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.8fr)_minmax(0,1.2fr)]">
        {/* Left Column: Who's in Live Feed */}
        <div className="flex flex-col gap-6 min-w-0">
          {das04?.detail ? (
            <WhosInWidget details={das04.detail} />
          ) : null}

          {/* Alert List */}
          <Card className="shadow-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-bold text-ink flex items-center gap-2">
                <span>Alertes opérationnelles</span>
                <AlertTriangle
                  size={16}
                  className={cx(
                    das05.overdueLoans + das05.lowStock + das05.missingTools + das05.missingOut > 0
                      ? 'text-amber animate-pulse'
                      : 'text-emerald-500',
                  )}
                />
              </h2>
              <span className="text-xs text-ink-faint flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Temps réel
              </span>
            </div>

            <ul className="divide-y divide-line rounded-lg border border-line overflow-hidden">
              {[
                {
                  label: 'Prêts d’outils en retard de retour',
                  count: das05.overdueLoans,
                  open: () => setDrawer({ kind: 'overdue' }),
                  desc: 'Outils non restitués dans les délais',
                },
                {
                  label: 'Matières & consommables sous le seuil',
                  count: das05.lowStock,
                  open: () => setDrawer({ kind: 'stock' }),
                  desc: 'Quincaillerie & consommables à recommander',
                },
                {
                  label: 'Outils déclarés manquants',
                  count: das05.missingTools,
                  open: () => setDrawer({ kind: 'missingTools' }),
                  desc: 'Matériels introuvables ou signalés perdus',
                },
                {
                  label: 'Départs non pointés au kiosque',
                  count: das05.missingOut,
                  open: () => setDrawer({ kind: 'missingOut' }),
                  desc: 'Pointages d’entrée non clôturés en sortie',
                },
              ].map((alert) => (
                <li key={alert.label}>
                  <button
                    onClick={alert.open}
                    className="flex w-full items-center justify-between gap-3 bg-surface px-3 py-2.5 text-left transition-colors hover:bg-paper-2 group"
                  >
                    <span className="flex items-center gap-2.5 text-xs font-medium text-ink min-w-0">
                      <span
                        className={cx(
                          'shrink-0 p-1 rounded-md transition-colors',
                          alert.count > 0 ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-paper text-ink-faint',
                        )}
                      >
                        <AlertTriangle size={14} />
                      </span>
                      <span className="truncate">{alert.label}</span>
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        className={cx(
                          'font-mono text-xs font-bold tabular-nums rounded px-2 py-0.5 border',
                          alert.count > 0
                            ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                            : 'text-ink-faint bg-paper border-line',
                        )}
                      >
                        {alert.count}
                      </span>
                      <ChevronRight size={13} className="text-ink-faint group-hover:text-ink transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        {/* Right Column: Donut & Stock Movements */}
        <div className="flex flex-col gap-6 min-w-0">
          <Card className="shadow-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-bold text-ink">Répartition de l’outillage</h2>
              <p className="text-[11px] text-ink-faint">Filtrer par statut</p>
            </div>
            <ToolsDonut das01={das01} onPick={(status) => openTools(status, `Outils — ${STATUS_LABEL[status]}`)} />
          </Card>

          <Card className="shadow-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-ink">Activité du jour</h2>
                <p className="text-[11px] text-ink-faint">Flux magasin &amp; atelier en temps réel</p>
              </div>
              <button
                onClick={() => setDrawer({ kind: 'movements' })}
                className="text-xs text-amber hover:underline font-medium inline-flex items-center gap-1"
              >
                Journal du jour &rarr;
              </button>
            </div>

            {/* Flux KPI Pills */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div
                onClick={() => setDrawer({ kind: 'movements' })}
                className="flex flex-col items-center justify-center p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 cursor-pointer hover:bg-emerald-500/15 transition-colors"
                title="Entrées au stock"
              >
                <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                  <ArrowDownRight size={13} />
                  <span>Entrées</span>
                </div>
                <span className="font-mono text-base font-bold text-emerald-700 dark:text-emerald-300 mt-0.5">{das03.entries}</span>
              </div>

              <div
                onClick={() => setDrawer({ kind: 'movements' })}
                className="flex flex-col items-center justify-center p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 cursor-pointer hover:bg-amber-500/15 transition-colors"
                title="Sorties (consommables & prêts)"
              >
                <div className="flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                  <ArrowUpRight size={13} />
                  <span>Sorties</span>
                </div>
                <span className="font-mono text-base font-bold text-amber-700 dark:text-amber-300 mt-0.5">{das03.exits}</span>
              </div>

              <div
                onClick={() => setDrawer({ kind: 'movements' })}
                className="flex flex-col items-center justify-center p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 cursor-pointer hover:bg-blue-500/15 transition-colors"
                title="Retours d'outillage"
              >
                <div className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                  <RotateCcw size={13} />
                  <span>Retours</span>
                </div>
                <span className="font-mono text-base font-bold text-blue-700 dark:text-blue-300 mt-0.5">{das03.returns}</span>
              </div>
            </div>

            <div className="h-36">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyMoves} margin={{ top: 8, right: 4, bottom: 0, left: -20 }}>
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                    tick={{ fontSize: 11, fill: '#6b7280' }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: '#6b7280' }}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                    content={<ChartTooltip />}
                  />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={44} isAnimationActive={false}>
                    {dailyMoves.map((bar) => (
                      <Cell
                        key={bar.name}
                        fill={bar.color}
                        onClick={() => setDrawer({ kind: 'movements' })}
                        className="cursor-pointer"
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      </section>

      {/* Drawer Details Component */}
      <Drawer
        open={Boolean(drawer)}
        title={drawerTitle(drawer)}
        subtitle={drawerSubtitle(drawer, data)}
        onClose={() => setDrawer(null)}
      >
        <DrawerContentDetail
          drawer={drawer}
          data={data}
          tools={tools}
          refs={refs}
          loans={loans}
          loansLoading={loansLoading}
        />
      </Drawer>
    </div>
  );
}

function drawerTitle(drawer: DrawerKind | null): string {
  if (!drawer) return '';
  switch (drawer.kind) {
    case 'tools':
      return drawer.title;
    case 'stock':
      return 'État des stocks';
    case 'movements':
      return 'Mouvements du jour';
    case 'attendance':
      return 'Pointage & Présences';
    case 'overdue':
      return 'Prêts en retard';
    case 'missingTools':
      return 'Outils manquants';
    case 'missingOut':
      return 'Départs non pointés';
    case 'absent':
      return 'Absences déclarées';
    case 'conge':
      return 'Congés en cours';
  }
}

function drawerSubtitle(drawer: DrawerKind | null, data: DashboardType): string | undefined {
  if (!drawer) return undefined;
  if (drawer.kind === 'stock') return `${data.das05.lowStock} article(s) sous le seuil d’alerte`;
  if (drawer.kind === 'overdue') return `${data.das05.overdueLoans} prêt(s) d'outils en retard`;
  if (drawer.kind === 'missingTools') return `${data.das05.missingTools} outil(s) déclaré(s) manquant(s)`;
  if (drawer.kind === 'missingOut') return `${data.das05.missingOut} départ(s) non pointé(s)`;
  if (drawer.kind === 'attendance') return 'Relevés serveurs en direct';
  return formatDate(data.generatedAt);
}

function DrawerContentDetail({
  drawer,
  data,
  tools,
  refs: _refs,
  loans: _loans,
  loansLoading: _loansLoading,
}: {
  drawer: DrawerKind | null;
  data: DashboardType;
  tools: Tool[] | null;
  refs: StockRef[] | null;
  loans: { id: number; tool_id: string; tool_name: string; employee_name: string; out_at: string }[];
  loansLoading: boolean;
}) {
  if (!drawer) return null;

  if (drawer.kind === 'tools') {
    if (!tools) {
      return (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-soft">
          <Spinner /> Chargement…
        </div>
      );
    }
    if (tools.length === 0) return <EmptyState title="Aucun outil dans cette catégorie" />;
    return (
      <ul className="divide-y divide-line rounded-lg border border-line">
        {tools.map((tool) => (
          <li key={tool.id} className="flex items-center justify-between gap-3 bg-surface px-3 py-2.5">
            <div className="min-w-0">
              <p className="font-mono text-[11px] text-ink-faint">{tool.id}</p>
              <p className="truncate text-xs font-semibold text-ink">{tool.name}</p>
            </div>
            <Chip tone={STATUS_TONE[tool.status]}>{STATUS_LABEL[tool.status]}</Chip>
          </li>
        ))}
      </ul>
    );
  }

  if (drawer.kind === 'stock') {
    const lowList = data.das05.details.lowStock;
    if (!lowList || lowList.length === 0) {
      return (
        <EmptyState
          title="Stocks conformes"
          hint="Aucune matière ou quincaillerie sous le seuil d'alerte."
        />
      );
    }
    return (
      <div className="space-y-3">
        <p className="text-xs text-ink-soft">
          Articles dont la quantité disponible est inférieure ou égale au seuil de réapprovisionnement :
        </p>
        <div className="space-y-2">
          {lowList.map((ref) => {
            const empty = ref.qty <= 0;
            return (
              <Card key={ref.id} className="p-3 shadow-xs">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-ink">{ref.name}</p>
                    <p className="text-[11px] text-ink-faint">
                      {ref.location || 'Magasin de quincaillerie'}
                    </p>
                  </div>
                  <Chip tone={empty ? 'red' : 'amber'}>
                    {empty ? 'Épuisé (0)' : 'Sous le seuil'}
                  </Chip>
                </div>
                <div className="mt-2 text-xs">
                  <Row
                    label="Disponible en magasin"
                    value={`${ref.qty} ${ref.unit} (Seuil d'alerte : ${ref.min_qty})`}
                    mono
                  />
                </div>
              </Card>
            );
          })}
        </div>
        <Button
          variant="secondary"
          className="w-full text-xs"
          onClick={() => {
            window.dispatchEvent(new CustomEvent('nav-view', { detail: 'stock' }));
          }}
        >
          Ouvrir le module Stock &amp; Quincaillerie &rarr;
        </Button>
      </div>
    );
  }

  if (drawer.kind === 'movements') {
    if (data.lastMovements.length === 0) return <EmptyState title="Aucun mouvement aujourd’hui" />;
    return (
      <ul className="divide-y divide-line rounded-lg border border-line">
        {data.lastMovements.map((move, index) => (
          <li key={`${move.id ?? index}`} className="bg-surface px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-ink">{move.ref_name}</p>
              <p className="font-mono text-xs font-bold tabular-nums">
                {move.move_type === 'in' ? '+' : '−'}
                {move.qty} {move.unit}
              </p>
            </div>
            <p className="text-[11px] text-ink-soft">
              {MOVE_LABEL[move.move_type]} · {move.beneficiary ?? '—'} · {formatDateTime(move.created_at)}
            </p>
          </li>
        ))}
      </ul>
    );
  }

  if (drawer.kind === 'attendance' && data.das04) {
    if (data.das04.detail.length === 0) return <EmptyState title="Aucun travailleur actif" />;
    return (
      <div className="overflow-hidden rounded-lg border border-line">
        <table className="w-full text-left">
          <thead className="border-b border-line bg-paper-2 text-[11px] uppercase font-semibold text-ink-faint">
            <tr>
              <th className="px-3 py-2">Travailleur</th>
              <th className="px-3 py-2">Arrivée</th>
              <th className="px-3 py-2">Départ</th>
              <th className="px-3 py-2">Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line text-xs">
            {data.das04.detail.map((row) => (
              <tr key={row.id} className="hover:bg-paper-2/40">
                <td className="px-3 py-2.5 font-medium text-ink">{row.fullName}</td>
                <td className="px-3 py-2.5 font-mono tabular-nums">{row.inAt ?? '—'}</td>
                <td className="px-3 py-2.5 font-mono tabular-nums">{row.outAt ?? 'En poste'}</td>
                <td className="px-3 py-2.5">
                  <Chip tone={row.status === 'late' ? 'amber' : row.status === 'absent' ? 'grey' : 'green'}>
                    {row.status === 'late' ? `Retard ${row.lateMinutes}m` : row.status === 'absent' ? 'Absent' : 'Présent'}
                  </Chip>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (drawer.kind === 'overdue') {
    const overdueList = data.das05.details.overdueLoans;
    if (!overdueList || overdueList.length === 0) {
      return (
        <EmptyState
          title="Aucun prêt en retard"
          hint="Tous les outils sortis ont été restitués ou sont dans leurs délais d'emprunt."
        />
      );
    }
    return (
      <div className="space-y-3">
        <p className="text-xs text-ink-soft">
          Outils prêtés dont le délai de retour est dépassé :
        </p>
        <ul className="divide-y divide-line rounded-lg border border-line">
          {overdueList.map((loan) => (
            <li key={loan.id} className="bg-surface px-3 py-2.5 text-xs flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-ink">{loan.tool_name}</p>
                <p className="text-ink-soft">
                  <span className="font-mono text-ink-faint">{loan.tool_id}</span> · Emprunté par <strong>{loan.employee_name}</strong> le {formatDate(loan.out_date)}
                </p>
                {loan.due_date ? (
                  <p className="text-[11px] text-rose-500">
                    Date prévue : {formatDate(loan.due_date)}
                  </p>
                ) : null}
              </div>
              <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                +{loan.days_overdue ?? 1}j retard
              </span>
            </li>
          ))}
        </ul>
        <Button
          variant="secondary"
          className="w-full text-xs"
          onClick={() => {
            window.dispatchEvent(new CustomEvent('nav-view', { detail: 'outils' }));
          }}
        >
          Gérer les retours dans Outils &rarr;
        </Button>
      </div>
    );
  }

  if (drawer.kind === 'missingTools') {
    const missing = data.das05.details.missingTools;
    if (!missing || missing.length === 0) {
      return (
        <EmptyState
          title="Aucun outil manquant"
          hint="Tous les équipements répertoriés sont localisés."
        />
      );
    }
    return (
      <div className="space-y-3">
        <p className="text-xs text-ink-soft">
          Matériels déclarés manquants lors des inventaires ou des chantiers :
        </p>
        <ul className="divide-y divide-line rounded-lg border border-line">
          {missing.map((tool) => (
            <li key={tool.id} className="bg-surface px-3 py-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-ink">{tool.name}</p>
                <Chip tone="red">Manquant</Chip>
              </div>
              <p className="text-[11px] text-ink-soft mt-0.5">
                <span className="font-mono text-ink-faint">{tool.id}</span> · {tool.category} · {tool.location}
              </p>
              {tool.status_reason ? (
                <p className="text-[11px] text-ink-faint italic mt-1 bg-paper p-1.5 rounded border border-line">
                  Motif : {tool.status_reason}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
        <Button
          variant="secondary"
          className="w-full text-xs"
          onClick={() => {
            window.dispatchEvent(new CustomEvent('nav-view', { detail: 'outils' }));
          }}
        >
          Voir dans le catalogue d'outillage &rarr;
        </Button>
      </div>
    );
  }

  if (drawer.kind === 'missingOut') {
    const unclosed = data.das05.details.missingOut;
    if (!unclosed || unclosed.length === 0) {
      return (
        <EmptyState
          title="Départs régularisés"
          hint="Tous les pointages d'arrivée ont un pointage de départ enregistré."
        />
      );
    }
    return (
      <div className="space-y-3">
        <p className="text-xs text-ink-soft">
          Travailleurs ayant pointé l'entrée mais sans pointage de départ enregistré au kiosque :
        </p>
        <ul className="divide-y divide-line rounded-lg border border-line">
          {unclosed.map((worker) => (
            <li key={`${worker.id}-${worker.punch_date ?? ''}`} className="bg-surface px-3 py-2.5 text-xs flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-ink">{worker.full_name}</p>
                <p className="text-[11px] text-ink-soft">
                  <span className="font-mono text-ink-faint">{worker.id}</span> · Arrivée à {worker.in_at ?? '—'}
                  {worker.punch_date ? ` le ${formatDate(worker.punch_date)}` : ''}
                </p>
              </div>
              <Chip tone="amber">Sortie non pointée</Chip>
            </li>
          ))}
        </ul>
        <Button
          variant="secondary"
          className="w-full text-xs"
          onClick={() => {
            window.dispatchEvent(new CustomEvent('nav-view', { detail: 'pointage' }));
          }}
        >
          Ouvrir le registre de pointage &rarr;
        </Button>
      </div>
    );
  }

  return null;
}
