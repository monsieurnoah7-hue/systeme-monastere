import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type Dashboard as DashboardType, type StockRef, type Tool, type EtabliKit, type EtabliKitItem } from '../lib/api';
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
  Modal,
  PageHeader,
  Row,
  Spinner,
  cx,
  useToast,
} from '../components/ui';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Clock,
  Clock3,
  Fingerprint,
  Package,
  RefreshCw,
  RotateCcw,
  Users,
  Wrench,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Check,
  X,
  Search,
  History,
  Eye,
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
    <div className="flex flex-col items-center gap-5 sm:flex-row touch-pan-y">
      <div className="relative h-[170px] w-[170px] shrink-0 touch-pan-y">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
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
/**
 * Widget Présences Équipe - Version Google Grade
 */
function WhosInWidget({
  details,
  className,
  isCarousel = false,
  onOpenPointage,
}: {
  details: NonNullable<DashboardType['das04']>['detail'];
  className?: string;
  isCarousel?: boolean;
  onOpenPointage?: () => void;
}) {
  const [filter, setFilter] = useState<'all' | 'present' | 'late' | 'leaves' | 'absent'>('all');
  const [search, setSearch] = useState('');

  const stats = useMemo(() => {
    let presentCount = 0;
    let lateCount = 0;
    let leavesCount = 0;
    let absentCount = 0;

    for (const d of details) {
      if (d.status === 'present') {
        presentCount++;
      } else if (d.status === 'late') {
        presentCount++;
        lateCount++;
      } else if (d.status === 'conge' || d.status === 'permission') {
        leavesCount++;
      } else {
        absentCount++;
      }
    }
    return { presentCount, lateCount, leavesCount, absentCount, total: details.length };
  }, [details]);

  const filtered = useMemo(() => {
    return details.filter((d) => {
      if (search.trim()) {
        const q = search.toLowerCase();
        const match = d.fullName.toLowerCase().includes(q) || d.jobTitle.toLowerCase().includes(q);
        if (!match) return false;
      }
      if (filter === 'all') return true;
      if (filter === 'present') return d.status === 'present';
      if (filter === 'late') return d.status === 'late';
      if (filter === 'leaves') return d.status === 'conge' || d.status === 'permission';
      if (filter === 'absent') return d.status === 'absent' || (!d.inAt && d.status !== 'conge' && d.status !== 'permission');
      return true;
    });
  }, [details, filter, search]);

  return (
    <Card className={cx("shadow-card overflow-hidden", className)}>
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
              <Users size={16} className="text-amber" /> Présences en atelier
            </h2>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {stats.presentCount} / {stats.total} présents
            </span>
          </div>
          <p className="mt-0.5 text-xs text-ink-faint">Suivi en direct des entrées, retards et départs de l’équipe.</p>
        </div>

        {/* Search input */}
        <div className="relative w-full sm:w-48">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher..."
            className="w-full rounded-lg border border-line bg-paper-2 pl-8 pr-3 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:border-amber focus:outline-none transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Segmented Filter Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-line bg-surface-2/40 px-3 py-2 text-xs no-scrollbar overscroll-x-contain touch-pan-y touch-pan-x" style={{ WebkitOverflowScrolling: 'touch' }}>
        <button
          onClick={() => setFilter('all')}
          className={cx(
            'shrink-0 rounded-lg px-3 py-1 font-semibold whitespace-nowrap transition-colors cursor-pointer',
            filter === 'all' ? 'bg-surface text-ink shadow-xs border border-line-strong/30' : 'text-ink-soft hover:text-ink',
          )}
        >
          Tous ({stats.total})
        </button>
        <button
          onClick={() => setFilter('present')}
          className={cx(
            'shrink-0 rounded-lg px-3 py-1 font-semibold whitespace-nowrap transition-colors cursor-pointer',
            filter === 'present' ? 'bg-surface text-emerald-600 dark:text-emerald-400 shadow-xs border border-line-strong/30' : 'text-ink-soft hover:text-ink',
          )}
        >
          À l'heure ({stats.presentCount - stats.lateCount})
        </button>
        <button
          onClick={() => setFilter('late')}
          className={cx(
            'shrink-0 rounded-lg px-3 py-1 font-semibold whitespace-nowrap transition-colors cursor-pointer',
            filter === 'late' ? 'bg-surface text-amber shadow-xs border border-line-strong/30' : 'text-ink-soft hover:text-ink',
          )}
        >
          Retards ({stats.lateCount})
        </button>
        <button
          onClick={() => setFilter('leaves')}
          className={cx(
            'shrink-0 rounded-lg px-3 py-1 font-semibold whitespace-nowrap transition-colors cursor-pointer',
            filter === 'leaves' ? 'bg-surface text-blue-600 dark:text-blue-400 shadow-xs border border-line-strong/30' : 'text-ink-soft hover:text-ink',
          )}
        >
          Congés / Perm. ({stats.leavesCount})
        </button>
        <button
          onClick={() => setFilter('absent')}
          className={cx(
            'shrink-0 rounded-lg px-3 py-1 font-semibold whitespace-nowrap transition-colors cursor-pointer',
            filter === 'absent' ? 'bg-surface text-ink-faint shadow-xs border border-line-strong/30' : 'text-ink-soft hover:text-ink',
          )}
        >
          Non pointés ({stats.absentCount})
        </button>
      </div>

      {/* Workers list / Carousel */}
      {isCarousel ? (
        /* Vue smartphone : Carrousel horizontal de cartes ouvriers avec défilement tactile moderne */
        <div className="p-3.5 space-y-3">
          <div className="flex items-center justify-between text-xs text-ink-faint">
            <span className="font-semibold text-ink">
              Équipe ({filtered.length})
            </span>
            <span className="text-[11px] text-amber font-semibold flex items-center gap-1">
              Glisser horizontalement &rarr;
            </span>
          </div>

          <div
            className="flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-smooth no-scrollbar -mx-3.5 px-3.5 pb-2 pt-0.5 overscroll-x-contain touch-pan-y touch-pan-x"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {filtered.map((person) => {
              const isPresent = person.status === 'present';
              const isLate = person.status === 'late';
              const isConge = person.status === 'conge';
              const isPermission = person.status === 'permission';

              return (
                <div
                  key={person.id}
                  className="w-[230px] sm:w-[250px] shrink-0 snap-start rounded-2xl border border-line bg-surface-2/60 hover:bg-surface-2 p-3.5 flex flex-col justify-between gap-3 shadow-xs transition-all select-none"
                >
                  {/* Identity */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative shrink-0">
                      {person.photoPath ? (
                        <img
                          src={person.photoPath}
                          alt={person.fullName}
                          className="h-11 w-11 rounded-full object-cover border border-line shadow-xs"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                            const parent = (e.target as HTMLElement).parentElement;
                            if (parent) {
                              const fallback = document.createElement('div');
                              fallback.className = 'grid h-11 w-11 place-items-center rounded-full bg-paper-2 text-xs font-bold text-ink-soft border border-line';
                              fallback.innerText = initials(person.fullName);
                              parent.prepend(fallback);
                            }
                          }}
                        />
                      ) : (
                        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-paper-2 text-xs font-bold text-ink-soft border border-line shadow-xs">
                          {initials(person.fullName)}
                        </span>
                      )}
                      <span
                        className={cx(
                          'absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-surface',
                          isPresent
                            ? 'bg-emerald-500'
                            : isLate
                            ? 'bg-amber-500'
                            : isConge || isPermission
                            ? 'bg-blue-500'
                            : 'bg-zinc-400 dark:bg-zinc-600',
                        )}
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-ink">{person.fullName}</p>
                      <p className="truncate text-xs text-ink-faint">{person.jobTitle}</p>
                    </div>
                  </div>

                  {/* Status & Pointage Time */}
                  <div className="pt-2 border-t border-line/60 flex items-center justify-between">
                    {isPresent ? (
                      <>
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          <Check size={11} strokeWidth={2.5} /> Présent
                        </span>
                        <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                          {person.inAt}
                        </span>
                      </>
                    ) : isLate ? (
                      <>
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400 border border-amber-500/20">
                          <Clock3 size={11} /> +{person.lateMinutes}m
                        </span>
                        <span className="font-mono text-xs font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                          {person.inAt}
                        </span>
                      </>
                    ) : isConge ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-600 dark:text-blue-400 border border-blue-500/20">
                        🏖️ En congé
                      </span>
                    ) : isPermission ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/10 px-2 py-0.5 text-[11px] font-medium text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
                        📋 Permission
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-paper px-2 py-0.5 text-[11px] font-medium text-ink-faint border border-line">
                        <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 dark:bg-zinc-600" /> Non pointé
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {filtered.length === 0 && (
              <div className="w-full py-8 text-center text-xs text-ink-faint">
                {search ? 'Aucun collaborateur ne correspond à cette recherche.' : 'Aucun collaborateur dans cette catégorie.'}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Vue Ordinateur : Liste verticale classique */
        <div className="max-h-[380px] overflow-y-auto scroll-thin divide-y divide-line">
          {filtered.map((person) => {
            const isPresent = person.status === 'present';
            const isLate = person.status === 'late';
            const isConge = person.status === 'conge';
            const isPermission = person.status === 'permission';

            return (
              <div
                key={person.id}
                className="flex items-center justify-between gap-3 p-3 hover:bg-paper-2/50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative shrink-0">
                    {person.photoPath ? (
                      <img
                        src={person.photoPath}
                        alt={person.fullName}
                        className="h-10 w-10 rounded-full object-cover border border-line shadow-xs"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                          const parent = (e.target as HTMLElement).parentElement;
                          if (parent) {
                            const fallback = document.createElement('div');
                            fallback.className = 'grid h-10 w-10 place-items-center rounded-full bg-paper-2 text-xs font-bold text-ink-soft border border-line';
                            fallback.innerText = initials(person.fullName);
                            parent.prepend(fallback);
                          }
                        }}
                      />
                    ) : (
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-paper-2 text-xs font-bold text-ink-soft border border-line shadow-xs">
                        {initials(person.fullName)}
                      </span>
                    )}
                    <span
                      className={cx(
                        'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface',
                        isPresent
                          ? 'bg-emerald-500'
                          : isLate
                          ? 'bg-amber-500'
                          : isConge || isPermission
                          ? 'bg-blue-500'
                          : 'bg-zinc-400 dark:bg-zinc-600',
                      )}
                    />
                  </div>

                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{person.fullName}</p>
                    <p className="truncate text-xs text-ink-faint">{person.jobTitle}</p>
                  </div>
                </div>

                {/* Status & Time */}
                <div className="shrink-0 text-right">
                  {isPresent ? (
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {person.inAt}
                        {person.outAt ? <span className="text-ink-faint font-normal"> → {person.outAt}</span> : null}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        <Check size={11} strokeWidth={2.5} /> Présent
                      </span>
                    </div>
                  ) : isLate ? (
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                        {person.inAt}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400 border border-amber-500/20">
                        <Clock3 size={11} /> +{person.lateMinutes}m
                      </span>
                    </div>
                  ) : isConge ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-medium text-blue-600 dark:text-blue-400 border border-blue-500/20">
                      🏖️ En congé
                    </span>
                  ) : isPermission ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/10 px-2.5 py-0.5 text-[11px] font-medium text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
                      📋 Permission
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-paper px-2.5 py-0.5 text-[11px] font-medium text-ink-faint border border-line">
                      <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 dark:bg-zinc-600" /> Non pointé
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {filtered.length === 0 ? (
            <div className="p-8 text-center text-xs text-ink-faint">
              {search ? 'Aucun collaborateur ne correspond à cette recherche.' : 'Aucun collaborateur dans cette catégorie.'}
            </div>
          ) : null}
        </div>
      )}

      {isCarousel && (
        <div className="p-2.5 border-t border-line/60 bg-surface-2/30 flex items-center justify-between text-xs">
          <span className="text-[11px] text-ink-faint">
            {stats.presentCount} présents sur {stats.total}
          </span>
          {onOpenPointage && (
            <button
              type="button"
              onClick={onOpenPointage}
              className="text-xs font-semibold text-amber hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              Voir toute l'équipe ({stats.total}) &rarr;
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

type EtabliKitSummaryItem = NonNullable<DashboardType['etablis']>['kits'][number];

function formatAuditTimeAgo(isoString?: string | null): string {
  if (!isoString) return 'Jamais audité';
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `Il y a ${Math.max(1, diffMins)} min`;
  if (diffHours < 24) return `Il y a ${diffHours} h`;
  if (diffDays === 1) return 'Hier';
  if (diffDays < 30) return `Il y a ${diffDays} j`;
  return formatDate(isoString);
}

function PendingLeavesBanner({
  leaves,
  onReview,
  reviewingId,
}: {
  leaves: NonNullable<DashboardType['pendingLeaves']>;
  onReview: (leaveId: number, status: 'approved' | 'rejected') => void;
  reviewingId: number | null;
}) {
  if (!leaves || leaves.length === 0) return null;

  return (
    <div className="rounded-2xl border border-amber/30 bg-amber-wash/40 p-4 shadow-card">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-xl bg-amber text-white shrink-0 shadow-xs">
            <Clock3 size={16} />
          </div>
          <div>
            <h3 className="text-xs font-bold text-ink flex items-center gap-2">
              <span>Demandes de permissions exceptionnelles en attente</span>
              <span className="rounded-full bg-amber/20 text-amber px-2 py-0.5 text-[10px] font-bold">
                {leaves.length} à valider
              </span>
            </h3>
            <p className="text-[11px] text-ink-soft">
              Visa requis par la Direction Générale ou le superviseur d’atelier habilité.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
        {leaves.map((leave) => (
          <div
            key={leave.id}
            className="flex flex-col justify-between rounded-xl border border-line bg-surface p-3 shadow-xs hover:border-amber/40 transition-colors"
          >
            <div>
              <div className="flex items-center gap-2.5">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-ink text-paper text-xs font-bold shrink-0 overflow-hidden border border-line/60">
                  {leave.photo_path ? (
                    <img src={leave.photo_path} alt={leave.full_name} className="h-full w-full object-cover" />
                  ) : (
                    initials(leave.full_name)
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-xs text-ink truncate">{leave.full_name}</p>
                  <p className="text-[10px] text-ink-faint font-mono">
                    Du {formatDate(leave.from_date)} au {formatDate(leave.to_date)}
                  </p>
                </div>
              </div>
              {leave.note && (
                <p className="mt-2 text-[11px] text-ink-soft italic bg-surface-2/60 p-2 rounded-lg border border-line truncate">
                  « {leave.note} »
                </p>
              )}
            </div>

            <div className="mt-3 flex items-center justify-end gap-1.5 pt-2 border-t border-line/60">
              <Button
                size="sm"
                variant="ghost"
                disabled={reviewingId === leave.id}
                onClick={() => onReview(leave.id, 'rejected')}
                className="text-red hover:bg-red-wash/40 text-[11px] h-7 px-2.5"
              >
                Refuser
              </Button>
              <Button
                size="sm"
                variant="primary"
                loading={reviewingId === leave.id}
                onClick={() => onReview(leave.id, 'approved')}
                className="bg-green hover:bg-green-2 text-white text-[11px] h-7 px-3 font-bold"
              >
                Accorder
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EtablisTourDeControle({
  etablis,
  onOpenAudit,
  onOpenDetails,
}: {
  etablis: NonNullable<DashboardType['etablis']>;
  onOpenAudit: (kit: EtabliKitSummaryItem) => void;
  onOpenDetails: (kit: EtabliKitSummaryItem) => void;
}) {
  const [filter, setFilter] = useState<'all' | 'overdue' | 'anomalies' | 'leo' | 'vern'>('all');
  const [search, setSearch] = useState('');
  const carouselTrackRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScrollState = useCallback(() => {
    const el = carouselTrackRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 10);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
  }, []);

  const scrollByDirection = (direction: 'left' | 'right') => {
    const el = carouselTrackRef.current;
    if (!el) return;
    const scrollAmount = el.clientWidth * 0.85;
    el.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
    setTimeout(checkScrollState, 350);
  };

  const filteredKits = useMemo(() => {
    return etablis.kits.filter((kit) => {
      if (filter === 'overdue') {
        if (!kit.last_audited_at) return true;
        const days = Math.floor((Date.now() - new Date(kit.last_audited_at).getTime()) / 86400000);
        if (days < 15) return false;
      } else if (filter === 'anomalies') {
        if (kit.items_missing <= 0 && kit.items_to_sharpen <= 0) return false;
      } else if (filter === 'leo') {
        if (!kit.source_magasin_code.includes('LEO') && !kit.source_magasin_name.toLowerCase().includes('léo')) return false;
      } else if (filter === 'vern') {
        if (!kit.source_magasin_code.includes('VERN') && !kit.source_magasin_name.toLowerCase().includes('verniss')) return false;
      }

      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matchName = kit.employee_name.toLowerCase().includes(q);
        const matchCode = kit.code.toLowerCase().includes(q);
        const matchNum = String(kit.etabli_number).includes(q);
        const matchLoc = kit.location.toLowerCase().includes(q);
        if (!matchName && !matchCode && !matchNum && !matchLoc) return false;
      }

      return true;
    });
  }, [etablis.kits, filter, search]);

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-line pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-ink">Tour de contrôle des établis</h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-soft">
            Dotations nominatives, état du parc et contrôles à traiter, réunis au même endroit.
          </p>
        </div>
        <div className="shrink-0 sm:text-right">
          <div className="font-mono text-lg font-bold tabular-nums text-ink">{etablis.totalKits}</div>
          <div className="text-[11px] text-ink-faint">établis suivis</div>
        </div>
      </div>

      {/* 4 KPIs Bento Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* KPI 1: Établis Actifs */}
        <div className="rounded-xl border border-line bg-surface p-3.5 shadow-card transition-all">
          <div className="flex items-center justify-between text-xs font-semibold text-ink-faint">
            <span>Établis Déployés</span>
            <div className="p-1 rounded-md bg-surface-2 text-ink-soft">
              <Wrench size={14} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-extrabold text-ink tabular-nums">
              {etablis.totalKits}
            </span>
            <span className="text-xs text-emerald-600 font-semibold">100% dotés</span>
          </div>
          <p className="mt-1 text-[11px] text-ink-faint truncate">
            Magasin Léo &amp; Cabine Vernissage
          </p>
        </div>

        {/* KPI 2: Complétude globale */}
        <div className="rounded-xl border border-line bg-surface p-3.5 shadow-card transition-all">
          <div className="flex items-center justify-between text-xs font-semibold text-ink-faint">
            <span>Complétude Globale</span>
            <div className="p-1 rounded-md bg-surface-2 text-ink-soft">
              <ShieldCheck size={14} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-extrabold text-ink tabular-nums">
              {etablis.completenessRate}%
            </span>
            <span className="text-xs text-ink-soft font-mono">
              {etablis.intactItems}/{etablis.totalItems}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full bg-paper-2 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, etablis.completenessRate)}%` }}
            />
          </div>
        </div>

        {/* KPI 3: Anomalies & Dégradations */}
        <div
          onClick={() => setFilter('anomalies')}
          className={cx(
            'rounded-xl border p-3.5 shadow-card transition-all cursor-pointer',
            etablis.anomaliesCount > 0
              ? 'border-amber/40 bg-amber-wash/30 hover:bg-amber-wash/50'
              : 'border-line bg-surface hover:bg-surface-2'
          )}
        >
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className={etablis.anomaliesCount > 0 ? 'text-amber' : 'text-ink-faint'}>
              Alertes Outillage
            </span>
            <div className={cx('p-1 rounded-md', etablis.anomaliesCount > 0 ? 'bg-amber/20 text-amber' : 'bg-surface-2 text-ink-soft')}>
              <AlertTriangle size={14} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={cx('font-mono text-2xl font-extrabold tabular-nums', etablis.anomaliesCount > 0 ? 'text-amber' : 'text-ink')}>
              {etablis.anomaliesCount}
            </span>
            <span className="text-xs text-ink-soft">établi(s) avec écarts</span>
          </div>
          <p className="mt-1 text-[11px] text-ink-faint truncate">
            {etablis.missingItems > 0 ? `${etablis.missingItems} manquant(s) · ` : ''}
            {etablis.toSharpenItems > 0 ? `${etablis.toSharpenItems} à affûter` : 'Aucun outil manquant'}
          </p>
        </div>

        {/* KPI 4: Vigie Contrôles Flash */}
        <div
          onClick={() => setFilter('overdue')}
          className={cx(
            'rounded-xl border p-3.5 shadow-card transition-all cursor-pointer',
            etablis.overdueAuditCount > 0
              ? 'border-amber/40 bg-amber-wash/30 hover:bg-amber-wash/50'
              : 'border-line bg-surface hover:bg-surface-2'
          )}
        >
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className={etablis.overdueAuditCount > 0 ? 'text-amber' : 'text-ink-faint'}>
              Vigie Contrôles
            </span>
            <div className={cx('p-1 rounded-md', etablis.overdueAuditCount > 0 ? 'bg-amber/20 text-amber' : 'bg-surface-2 text-ink-soft')}>
              <History size={14} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-xs font-bold text-ink truncate">
              {etablis.lastAudit ? formatAuditTimeAgo(etablis.lastAudit.auditedAt) : 'Aucun audit'}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-ink-faint truncate">
            {etablis.overdueAuditCount > 0 ? (
               <span className="text-amber font-semibold">{etablis.overdueAuditCount} à inspecter (&gt;15 j)</span>
            ) : (
              `Par ${etablis.lastAudit?.auditedBy ?? 'Superviseur'}`
            )}
          </p>
        </div>
      </div>

      {/* Toolbar: Search & Segmented Filter Tabs */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pt-1">
        {/* Filter Pills */}
        <div className="flex items-center gap-1 overflow-x-auto scroll-thin pb-1 md:pb-0 bg-paper-2 p-1 rounded-xl border border-line">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={cx(
              'rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-all cursor-pointer',
              filter === 'all' ? 'bg-surface text-ink shadow-xs' : 'text-ink-soft hover:text-ink'
            )}
          >
            Tous les établis ({etablis.kits.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('overdue')}
            className={cx(
              'rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5',
              filter === 'overdue' ? 'bg-surface text-amber shadow-xs' : 'text-ink-soft hover:text-ink'
            )}
          >
            {etablis.overdueAuditCount > 0 && <span className="h-1.5 w-1.5 rounded-full bg-amber animate-pulse" />}
            <span>À inspecter ({etablis.overdueAuditCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setFilter('anomalies')}
            className={cx(
              'rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5',
              filter === 'anomalies' ? 'bg-surface text-amber shadow-xs' : 'text-ink-soft hover:text-ink'
            )}
          >
            {etablis.anomaliesCount > 0 && <span className="h-1.5 w-1.5 rounded-full bg-red animate-pulse" />}
            <span>Anomalies ({etablis.anomaliesCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setFilter('leo')}
            className={cx(
              'rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-all cursor-pointer',
              filter === 'leo' ? 'bg-surface text-ink shadow-xs' : 'text-ink-soft hover:text-ink'
            )}
          >
            Magasin Léo ({etablis.kits.filter(k => k.source_magasin_code.includes('LEO') || k.source_magasin_name.toLowerCase().includes('léo')).length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('vern')}
            className={cx(
              'rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-all cursor-pointer',
              filter === 'vern' ? 'bg-surface text-ink shadow-xs' : 'text-ink-soft hover:text-ink'
            )}
          >
            Vernissage ({etablis.kits.filter(k => k.source_magasin_code.includes('VERN') || k.source_magasin_name.toLowerCase().includes('verniss')).length})
          </button>
        </div>

        {/* Right side: Search Bar & Carousel Controls */}
        <div className="flex items-center gap-2">
          {/* Search Bar */}
          <div className="relative min-w-[200px] sm:min-w-[240px] flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher artisan, n° établi..."
              className="w-full h-9 rounded-xl border border-line bg-surface pl-9 pr-3 text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:border-amber transition-colors"
            />
          </div>

          {/* Carousel Navigation Arrows */}
          <div className="flex items-center gap-1 shrink-0 bg-paper-2 p-0.5 rounded-xl border border-line">
            <button
              type="button"
              onClick={() => scrollByDirection('left')}
              disabled={!canScrollLeft}
              className="p-1.5 rounded-lg text-ink-soft hover:text-ink hover:bg-surface disabled:opacity-25 disabled:pointer-events-none transition-all cursor-pointer"
              title="Établis précédents"
              aria-label="Établis précédents"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={() => scrollByDirection('right')}
              disabled={!canScrollRight}
              className="p-1.5 rounded-lg text-ink-soft hover:text-ink hover:bg-surface disabled:opacity-25 disabled:pointer-events-none transition-all cursor-pointer"
              title="Établis suivants"
              aria-label="Établis suivants"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Carrousel Horizontal des Établis (3 cartes par vue sur desktop/tablette, défilement tactile fluide sur smartphone) */}
      {filteredKits.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface p-12 text-center text-xs text-ink-soft">
          Aucun établi ne correspond aux critères sélectionnés.
        </div>
      ) : (
        <div className="relative">
          <div
            ref={carouselTrackRef}
            onScroll={checkScrollState}
            className="flex gap-3.5 overflow-x-auto snap-x snap-proximity scroll-smooth no-scrollbar -mx-3 px-3 sm:-mx-6 sm:px-6 pb-3 pt-1 overscroll-x-contain touch-pan-y touch-pan-x"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {filteredKits.map((kit) => {
              const hasAnomalies = kit.items_missing > 0 || kit.items_to_sharpen > 0;
              const isOverdue = !kit.last_audited_at || Math.floor((Date.now() - new Date(kit.last_audited_at).getTime()) / 86400000) >= 15;
              const completionPct = kit.items_total > 0 ? Math.round((kit.items_present / kit.items_total) * 100) : 100;

              return (
                <div
                  key={kit.id}
                  className={cx(
                    'group flex flex-col justify-between rounded-2xl border bg-surface p-4 shadow-card hover:shadow-card-hover transition-all duration-200 shrink-0 snap-start',
                    'w-[85vw] max-w-[340px] sm:w-[320px] lg:w-[calc((100%-2*0.875rem)/3)]',
                    hasAnomalies ? 'border-amber/40 hover:border-amber' : 'border-line hover:border-line-strong'
                  )}
                >
                <div>
                  {/* Top Header: Badge Établi & Code Gravure */}
                  <div className="flex items-center justify-between gap-2 border-b border-line/60 pb-2.5 mb-3">
                    <div className="flex items-center gap-1.5">
                      <span className="grid h-6 w-6 place-items-center rounded-lg bg-ink text-paper text-xs font-mono font-bold shadow-xs">
                        {String(kit.etabli_number).padStart(2, '0')}
                      </span>
                      <span className="font-bold text-xs text-ink">
                        Établi {kit.etabli_number}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <span className="font-mono text-[10px] font-bold bg-surface-2 px-1.5 py-0.5 rounded border border-line text-ink-soft">
                        {kit.code}
                      </span>
                      <span className="text-[10px] font-semibold text-ink-faint">
                        · {kit.source_magasin_code.includes('LEO') ? 'Léo' : 'Vern.'}
                      </span>
                    </div>
                  </div>

                  {/* Worker Profile */}
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-paper-2 text-ink text-xs font-bold shrink-0 overflow-hidden border border-line shadow-xs">
                      {kit.employee_photo ? (
                        <img src={kit.employee_photo} alt={kit.employee_name} className="h-full w-full object-cover" />
                      ) : (
                        initials(kit.employee_name)
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-xs text-ink truncate group-hover:text-amber transition-colors">
                        {kit.employee_name}
                      </p>
                      <p className="text-[10px] text-ink-faint truncate">
                        {kit.employee_job || 'Menuisier d’Atelier'}
                      </p>
                    </div>
                  </div>

                  {/* Tools Completion Status */}
                  <div className="space-y-1.5 rounded-xl bg-surface-2/40 p-2.5 border border-line text-xs mb-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-ink-soft">Complétude servante :</span>
                      <span className="font-mono font-bold text-ink text-[11px]">
                        {kit.items_present}/{kit.items_total}
                      </span>
                    </div>

                    <div className="h-1.5 w-full bg-paper rounded-full overflow-hidden">
                      <div
                        className={cx(
                          'h-full rounded-full transition-all',
                          completionPct === 100
                            ? 'bg-emerald-500'
                            : completionPct >= 85
                            ? 'bg-amber'
                            : 'bg-red'
                        )}
                        style={{ width: `${completionPct}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[10px] pt-0.5">
                      <span className={completionPct === 100 ? 'text-emerald-600 font-semibold' : 'text-amber font-semibold'}>
                        {completionPct === 100 ? '✓ 100% Intact' : `${kit.items_total - kit.items_present} écart(s)`}
                      </span>
                      {kit.items_to_sharpen > 0 && (
                        <span className="text-amber">({kit.items_to_sharpen} à affûter)</span>
                      )}
                    </div>
                  </div>

                  {/* Audit Track Badge */}
                  <div className="flex items-center justify-between text-[10px] text-ink-faint pt-1">
                    <span>Dernier audit :</span>
                    <span className={cx('font-medium', isOverdue ? 'text-amber font-semibold' : 'text-ink-soft')}>
                      {kit.last_audited_at ? formatAuditTimeAgo(kit.last_audited_at) : 'Non audité'}
                    </span>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="mt-3.5 flex items-center gap-1.5 pt-2.5 border-t border-line/60">
                  <Button
                    size="sm"
                    variant="primary"
                    icon={<ShieldCheck size={13} className="text-white" />}
                    onClick={() => onOpenAudit(kit)}
                    className="flex-1 bg-green hover:bg-green-2 text-white font-bold text-[11px] h-8 shadow-xs"
                    title="Lancer le contrôle inopiné flash de cet établi"
                  >
                    Contrôle Flash
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Eye size={13} />}
                    onClick={() => onOpenDetails(kit)}
                    className="border border-line text-ink-soft hover:text-ink text-[11px] h-8 px-2.5"
                    title="Voir les 22 outils de l'établi"
                  >
                    Détails
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    )}
    </section>
  );
}

function FlashAuditModal({
  kit,
  open,
  onClose,
  onSuccess,
}: {
  kit: EtabliKitSummaryItem | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const toast = useToast();
  const [loadingItems, setLoadingItems] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [items, setItems] = useState<EtabliKitItem[]>([]);
  const [itemStates, setItemStates] = useState<Record<number, { is_present: boolean; condition: EtabliKitItem['condition'] }>>({});
  const [auditStatus, setAuditStatus] = useState<'conforme' | 'anomalie' | 'incomplet'>('conforme');
  const [auditNotes, setAuditNotes] = useState('');

  useEffect(() => {
    if (!open || !kit) return;
    setLoadingItems(true);
    api<{ kit: EtabliKit; items: EtabliKitItem[] }>(`/api/kits/${kit.id}`)
      .then((res) => {
        setItems(res.items);
        const map: Record<number, { is_present: boolean; condition: EtabliKitItem['condition'] }> = {};
        res.items.forEach((it) => {
          map[it.id] = { is_present: it.is_present, condition: it.condition };
        });
        setItemStates(map);
        setAuditStatus('conforme');
        setAuditNotes('');
      })
      .catch((err) => {
        toast(err instanceof Error ? err.message : 'Erreur chargement établi', 'error');
      })
      .finally(() => setLoadingItems(false));
  }, [open, kit]);

  const togglePresent = (id: number) => {
    setItemStates((prev) => {
      const cur = prev[id];
      if (!cur) return prev;
      const nextPresent = !cur.is_present;
      const nextCondition = nextPresent ? cur.condition : 'manquant';
      const updated = { ...prev, [id]: { is_present: nextPresent, condition: nextCondition } };

      const hasMissing = Object.values(updated).some((v) => !v.is_present);
      const hasDamage = Object.values(updated).some((v) => v.is_present && v.condition !== 'bon');
      if (hasMissing) setAuditStatus('incomplet');
      else if (hasDamage) setAuditStatus('anomalie');
      else setAuditStatus('conforme');

      return updated;
    });
  };

  const setCondition = (id: number, cond: EtabliKitItem['condition']) => {
    setItemStates((prev) => {
      const cur = prev[id];
      if (!cur) return prev;
      const updated = { ...prev, [id]: { ...cur, condition: cond } };

      const hasMissing = Object.values(updated).some((v) => !v.is_present);
      const hasDamage = Object.values(updated).some((v) => v.is_present && v.condition !== 'bon');
      if (hasMissing) setAuditStatus('incomplet');
      else if (hasDamage) setAuditStatus('anomalie');
      else setAuditStatus('conforme');

      return updated;
    });
  };

  const handleSaveAudit = async () => {
    if (!kit) return;
    setSubmitting(true);
    try {
      const itemsList = Object.entries(itemStates).map(([idStr, state]) => ({
        id: Number(idStr),
        is_present: state.is_present,
        condition: state.condition,
      }));

      await api(`/api/kits/${kit.id}/audit`, {
        method: 'POST',
        body: JSON.stringify({
          status: auditStatus,
          anomalies_note: auditNotes.trim() || undefined,
          items_status: itemsList,
        }),
      });

      toast(`Contrôle inopiné enregistré pour l'Établi N°${kit.etabli_number} (${kit.employee_name})`, 'success');
      onSuccess();
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erreur enregistrement audit', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!kit) return null;

  return (
    <Modal
      open={open}
      title={`🔍 Contrôle Inopiné Flash — Établi N°${kit.etabli_number}`}
      onClose={onClose}
      footer={
        <div className="flex w-full items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
            Annuler
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={submitting}
            onClick={() => void handleSaveAudit()}
            className="bg-green hover:bg-green-2 text-white font-bold"
          >
            Valider le Contrôle &amp; Enregistrer
          </Button>
        </div>
      }
    >
      <div className="space-y-4 text-xs max-h-[70vh] overflow-y-auto scroll-thin pr-1">
        {/* Worker Header Card */}
        <div className="flex items-center justify-between rounded-xl border border-line bg-surface-2/40 p-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-ink text-paper font-bold text-xs shrink-0 overflow-hidden border border-line">
              {kit.employee_photo ? (
                <img src={kit.employee_photo} alt={kit.employee_name} className="h-full w-full object-cover" />
              ) : (
                initials(kit.employee_name)
              )}
            </div>
            <div>
              <p className="font-bold text-ink text-sm">{kit.employee_name}</p>
              <p className="text-ink-soft text-[11px]">
                {kit.employee_job} · Établi {kit.code} ({kit.source_magasin_name})
              </p>
            </div>
          </div>
          <span className="font-mono text-xs font-bold bg-surface px-2.5 py-1 rounded-lg border border-line text-ink">
            Établi N° {kit.etabli_number}
          </span>
        </div>

        {/* Verdict global */}
        <div className="rounded-xl border border-line bg-surface p-3 space-y-2">
          <span className="text-[11px] font-bold text-ink-soft uppercase tracking-wider block">
            Verdict Global de l'Audit :
          </span>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setAuditStatus('conforme')}
              className={cx(
                'rounded-lg p-2 text-center border font-bold text-xs transition-all cursor-pointer',
                auditStatus === 'conforme'
                  ? 'border-emerald-500 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shadow-xs'
                  : 'border-line text-ink-soft hover:bg-surface-2'
              )}
            >
              ✓ Conforme (100%)
            </button>
            <button
              type="button"
              onClick={() => setAuditStatus('anomalie')}
              className={cx(
                'rounded-lg p-2 text-center border font-bold text-xs transition-all cursor-pointer',
                auditStatus === 'anomalie'
                  ? 'border-amber bg-amber/15 text-amber shadow-xs'
                  : 'border-line text-ink-soft hover:bg-surface-2'
              )}
            >
              ⚠️ Anomalie / Affûtage
            </button>
            <button
              type="button"
              onClick={() => setAuditStatus('incomplet')}
              className={cx(
                'rounded-lg p-2 text-center border font-bold text-xs transition-all cursor-pointer',
                auditStatus === 'incomplet'
                  ? 'border-red bg-red/15 text-red shadow-xs'
                  : 'border-line text-ink-soft hover:bg-surface-2'
              )}
            >
              ✕ Outil Manquant
            </button>
          </div>
        </div>

        {/* Note / Observation */}
        <div>
          <label className="block text-[11px] font-bold text-ink-soft mb-1">
            Observations / Remarques de l'auditeur (optionnel) :
          </label>
          <input
            type="text"
            value={auditNotes}
            onChange={(e) => setAuditNotes(e.target.value)}
            placeholder="Ex : Ciseau 16mm légèrement ébréché remis pour affûtage au Magasin Léo..."
            className="w-full h-8 rounded-lg border border-line bg-surface px-3 text-xs text-ink focus:outline-none focus:border-amber"
          />
        </div>

        {/* Checklist */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] font-bold text-ink-soft uppercase tracking-wider border-b border-line pb-1">
            <span>Inventaire des {items.length} outils de l'établi :</span>
            <span>Présence &amp; État</span>
          </div>

          {loadingItems ? (
            <div className="py-8 text-center text-xs text-ink-faint">
              <Spinner className="inline-block mr-2" /> Chargement de la boîte à outils…
            </div>
          ) : (
            <div className="divide-y divide-line rounded-xl border border-line bg-surface overflow-hidden">
              {items.map((it) => {
                const state = itemStates[it.id] || { is_present: it.is_present, condition: it.condition };
                return (
                  <div
                    key={it.id}
                    className={cx(
                      'p-2.5 flex items-center justify-between gap-2 transition-colors',
                      !state.is_present
                        ? 'bg-red-500/5'
                        : state.condition !== 'bon'
                        ? 'bg-amber-500/5'
                        : 'hover:bg-surface-2/40'
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => togglePresent(it.id)}
                        className={cx(
                          'h-5 w-5 rounded border flex items-center justify-center shrink-0 transition-colors cursor-pointer',
                          state.is_present
                            ? 'bg-emerald-500 border-emerald-500 text-white'
                            : 'bg-red-500 border-red-500 text-white'
                        )}
                        title={state.is_present ? 'Outil présent (cliquer pour marquer absent)' : 'Outil absent (cliquer pour marquer présent)'}
                      >
                        {state.is_present ? <Check size={12} /> : <X size={12} />}
                      </button>

                      <div className="min-w-0">
                        <p className={cx('font-semibold text-xs truncate', !state.is_present && 'line-through text-ink-faint')}>
                          {it.item_num}. {it.name}
                        </p>
                        <p className="font-mono text-[10px] text-ink-faint truncate">
                          {it.tool_code}
                        </p>
                      </div>
                    </div>

                    {state.is_present && (
                      <select
                        value={state.condition}
                        onChange={(e) => setCondition(it.id, e.target.value as any)}
                        className={cx(
                          'rounded-md border px-2 py-1 text-[11px] font-semibold focus:outline-none cursor-pointer',
                          state.condition === 'bon'
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : state.condition === 'a_affuter'
                            ? 'border-amber/40 bg-amber/15 text-amber'
                            : 'border-red/40 bg-red/15 text-red'
                        )}
                      >
                        <option value="bon">Bon état</option>
                        <option value="a_affuter">À affûter</option>
                        <option value="a_reparer">À réparer</option>
                        <option value="reforme">Hors d'usage</option>
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function KitInspectionModal({
  kit,
  open,
  onClose,
}: {
  kit: EtabliKitSummaryItem | null;
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<EtabliKitItem[]>([]);

  useEffect(() => {
    if (!open || !kit) return;
    setLoading(true);
    api<{ kit: EtabliKit; items: EtabliKitItem[] }>(`/api/kits/${kit.id}`)
      .then((res) => setItems(res.items))
      .catch((err) => toast(err instanceof Error ? err.message : 'Erreur', 'error'))
      .finally(() => setLoading(false));
  }, [open, kit]);

  if (!kit) return null;

  return (
    <Modal
      open={open}
      title={`Dotation Officielle — Établi N°${kit.etabli_number}`}
      onClose={onClose}
      footer={
        <div className="flex w-full justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Fermer
          </Button>
        </div>
      }
    >
      <div className="space-y-3.5 text-xs max-h-[70vh] overflow-y-auto scroll-thin">
        <div className="rounded-xl border border-line bg-surface-2/40 p-3 flex items-center justify-between">
          <div>
            <p className="font-bold text-ink text-sm">{kit.employee_name}</p>
            <p className="text-ink-soft text-xs">{kit.employee_job} · Code {kit.code}</p>
          </div>
          <span className="font-mono text-xs font-bold text-amber bg-surface px-2.5 py-1 rounded-lg border border-line">
            {kit.source_magasin_name}
          </span>
        </div>

        <div className="border border-line rounded-xl overflow-hidden divide-y divide-line bg-surface">
          {loading ? (
            <div className="py-8 text-center text-xs text-ink-faint">
              <Spinner className="inline-block mr-2" /> Chargement de la dotation…
            </div>
          ) : (
            items.map((it) => (
              <div key={it.id} className="p-2.5 flex items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-xs text-ink">
                    {it.item_num}. {it.name}
                  </p>
                  <p className="font-mono text-[10px] text-ink-faint">{it.tool_code}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={cx(
                      'rounded-full px-2 py-0.5 text-[10px] font-semibold border',
                      it.condition === 'bon'
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : it.condition === 'a_affuter'
                        ? 'border-amber/40 bg-amber/15 text-amber'
                        : 'border-red/40 bg-red/15 text-red'
                    )}
                  >
                    {it.condition === 'bon' ? 'Bon état' : it.condition === 'a_affuter' ? 'À affûter' : it.condition}
                  </span>
                  <span
                    className={cx(
                      'rounded-full px-2 py-0.5 text-[10px] font-semibold border',
                      it.is_present
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : 'border-red/40 bg-red/15 text-red'
                    )}
                  >
                    {it.is_present ? 'Présent' : 'Manquant'}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}

export function Dashboard() {
  const toast = useToast();
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

  // Établis & Contrôles Modals State
  const [auditKit, setAuditKit] = useState<EtabliKitSummaryItem | null>(null);
  const [inspectKit, setInspectKit] = useState<EtabliKitSummaryItem | null>(null);
  const [reviewingLeaveId, setReviewingLeaveId] = useState<number | null>(null);

  // Carrousel Mobile State & Refs (déclarés au sommet pour respecter les Règles des Hooks de React)
  const carouselRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [activeSlide, setActiveSlide] = useState(0);

  const scrollToSlide = (index: number) => {
    const el = slideRefs.current[index];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      setActiveSlide(index);
    }
    const tabEl = tabRefs.current[index];
    if (tabEl) {
      tabEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  };

  const handleCarouselScroll = () => {
    const container = carouselRef.current;
    if (!container) return;
    const containerCenter = container.scrollLeft + container.clientWidth / 2;
    let closestIndex = 0;
    let minDistance = Infinity;

    slideRefs.current.forEach((slide, idx) => {
      if (!slide) return;
      const slideCenter = slide.offsetLeft + slide.offsetWidth / 2;
      const distance = Math.abs(containerCenter - slideCenter);
      if (distance < minDistance) {
        minDistance = distance;
        closestIndex = idx;
      }
    });

    if (closestIndex !== activeSlide) {
      setActiveSlide(closestIndex);
      const tabEl = tabRefs.current[closestIndex];
      if (tabEl) {
        tabEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  };

  const handleReviewLeave = async (leaveId: number, status: 'approved' | 'rejected') => {
    setReviewingLeaveId(leaveId);
    try {
      await api(`/api/leaves/${leaveId}/review`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      toast(status === 'approved' ? 'Permission accordée avec succès.' : 'Demande refusée.', 'success');
      setReload((v) => v + 1);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Action impossible.', 'error');
    } finally {
      setReviewingLeaveId(null);
    }
  };

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

  // =========================================================================
  // Ergonomie Mobile Apple HIG : Navigation & Carrousel Horizontal Tactile
  // =========================================================================
  const alertTotal = das05.overdueLoans + das05.lowStock + das05.missingTools + das05.missingOut;

  const renderAlertsCard = (isCarousel = false) => (
    <Card className={cx("shadow-card p-5", isCarousel ? "h-full flex flex-col justify-between" : "h-fit")}>
      <div>
        <div className="mb-3.5 flex items-center justify-between">
          <h2 className="text-sm font-bold text-ink flex items-center gap-2">
            <span>Alertes opérationnelles</span>
            <AlertTriangle
              size={16}
              className={cx(
                alertTotal > 0 ? 'text-amber animate-pulse' : 'text-emerald-500',
              )}
            />
          </h2>
          <span className="text-xs text-ink-faint flex items-center gap-1.5 font-medium">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Temps réel
          </span>
        </div>

        <ul className="divide-y divide-line rounded-xl border border-line overflow-hidden shadow-xs">
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
                className="flex w-full items-center justify-between gap-3 bg-surface px-3.5 py-3 text-left transition-colors hover:bg-paper-2 group"
              >
                <span className="flex items-center gap-2.5 text-xs font-medium text-ink min-w-0">
                  <span
                    className={cx(
                      'shrink-0 p-1.5 rounded-lg transition-colors',
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
                      'font-mono text-xs font-bold tabular-nums rounded-md px-2 py-0.5 border',
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
      </div>

      {isCarousel && (
        <div className="pt-3 mt-4 border-t border-line/60 flex items-center justify-between text-[11px] text-ink-faint">
          <span>Surveillance continue atelier</span>
          <span className="font-mono font-semibold text-ink-soft">
            {alertTotal === 0 ? '✓ Aucune anomalie' : `⚠️ ${alertTotal} alerte(s)`}
          </span>
        </div>
      )}
    </Card>
  );

  const renderToolsCard = (isCarousel = false) => (
    <Card className={cx("shadow-card p-5", isCarousel ? "h-full flex flex-col justify-between" : "h-fit")}>
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold text-ink flex items-center gap-2">
            <Wrench size={16} className="text-amber" />
            <span>Répartition de l’outillage</span>
          </h2>
          <p className="text-[11px] text-ink-faint">Filtrer par statut</p>
        </div>
        <ToolsDonut das01={das01} onPick={(status) => openTools(status, `Outils — ${STATUS_LABEL[status]}`)} />
      </div>

      {isCarousel && (
        <div className="pt-3 mt-4 border-t border-line/60 flex items-center justify-between text-[11px] text-ink-faint">
          <span>Inventaire du parc</span>
          <span className="font-mono font-semibold text-ink-soft">{das01.total} machines & outils</span>
        </div>
      )}
    </Card>
  );

  const renderActivityCard = (isCarousel = false) => (
    <Card className={cx("shadow-card p-5", isCarousel ? "h-full flex flex-col justify-between" : "")}>
      <div>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-ink flex items-center gap-2">
              <ArrowUpRight size={16} className="text-amber" />
              <span>Activité du jour</span>
            </h2>
            <p className="text-xs text-ink-faint">Flux magasin &amp; atelier en temps réel</p>
          </div>
          <button
            onClick={() => setDrawer({ kind: 'movements' })}
            className="text-xs text-amber hover:underline font-semibold inline-flex items-center gap-1 transition-colors"
          >
            Journal du jour &rarr;
          </button>
        </div>

        {/* Flux KPI Pills */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div
            onClick={() => setDrawer({ kind: 'movements' })}
            className="flex flex-col items-center justify-center p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 cursor-pointer hover:bg-emerald-500/15 transition-all shadow-xs"
            title="Entrées au stock"
          >
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <ArrowDownRight size={14} />
              <span>Entrées</span>
            </div>
            <span className="font-mono text-xl font-bold text-emerald-700 dark:text-emerald-300 mt-1">{das03.entries}</span>
          </div>

          <div
            onClick={() => setDrawer({ kind: 'movements' })}
            className="flex flex-col items-center justify-center p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 cursor-pointer hover:bg-amber-500/15 transition-all shadow-xs"
            title="Sorties (consommables & prêts)"
          >
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
              <ArrowUpRight size={14} />
              <span>Sorties</span>
            </div>
            <span className="font-mono text-xl font-bold text-amber-700 dark:text-amber-300 mt-1">{das03.exits}</span>
          </div>

          <div
            onClick={() => setDrawer({ kind: 'movements' })}
            className="flex flex-col items-center justify-center p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 cursor-pointer hover:bg-blue-500/15 transition-all shadow-xs"
            title="Retours d'outillage"
          >
            <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400">
              <RotateCcw size={14} />
              <span>Retours</span>
            </div>
            <span className="font-mono text-xl font-bold text-blue-700 dark:text-blue-300 mt-1">{das03.returns}</span>
          </div>
        </div>

        <div className="h-44 w-full touch-pan-y">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <BarChart data={dailyMoves} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
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
              <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={48} isAnimationActive={false}>
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
      </div>
    </Card>
  );

  const carouselSlides = (() => {
    const slides = [];

    if (das04?.detail) {
      slides.push({
        id: 'attendance',
        label: 'Présences en atelier',
        tabTitle: 'Présence',
        icon: <Users size={15} />,
        content: (
          <WhosInWidget
            details={das04.detail}
            isCarousel
            className="h-full flex flex-col justify-between"
            onOpenPointage={() => setDrawer({ kind: 'attendance' })}
          />
        ),
      });
    }

    slides.push({
      id: 'alerts',
      label: 'Alertes opérationnelles',
      tabTitle: 'Alerte',
      icon: <AlertTriangle size={15} />,
      content: renderAlertsCard(true),
    });

    slides.push({
      id: 'tools',
      label: 'Répartition de l’outillage',
      tabTitle: 'Répartition des outils',
      icon: <Wrench size={15} />,
      content: renderToolsCard(true),
    });

    slides.push({
      id: 'activity',
      label: 'Activité du jour',
      tabTitle: 'Activité du jour',
      icon: <ArrowUpRight size={15} />,
      content: renderActivityCard(true),
    });

    return slides;
  })();

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

      {/* 1. Demandes de Permissions Exceptionnelles en Attente (Visa Direction) */}
      {data.pendingLeaves && data.pendingLeaves.length > 0 && (
        <PendingLeavesBanner
          leaves={data.pendingLeaves}
          onReview={handleReviewLeave}
          reviewingId={reviewingLeaveId}
        />
      )}

      {/* KPIs Cards Grid - Horizontal scroll on mobile & tablet, grid on xl */}
      <section className="relative">
        <div className="flex xl:grid xl:grid-cols-4 gap-3 overflow-x-auto pb-2 -mx-3 px-3 sm:-mx-6 sm:px-6 xl:mx-0 xl:px-0 xl:pb-0 scroll-smooth snap-x snap-proximity overscroll-x-contain scrollbar-none [scrollbar-width:none] [-ms-overflow-style:none] touch-pan-y touch-pan-x">
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

      {/* =========================================================================
          SECTIONS DE SUPERVISION : Carrousel Mobile Apple HIG vs Bento Grid Desktop
          ========================================================================= */}

      {/* 1. Mode Mobile & Smartphone (< 1024px) : Carrousel Horizontal Apple HIG */}
      <section className="block lg:hidden flex flex-col gap-3">
        {/* Navigation Tabs Segmentée Apple HIG sans chiffre, avec juste l'icône et le titre */}
        <div className="flex items-center gap-1.5 p-1 bg-surface-2/80 backdrop-blur-md border border-line rounded-xl overflow-x-auto no-scrollbar shadow-xs overscroll-x-contain touch-pan-y touch-pan-x" style={{ WebkitOverflowScrolling: 'touch' }}>
          {carouselSlides.map((slide, idx) => {
            const isActive = activeSlide === idx;
            return (
              <button
                key={slide.id}
                ref={(el) => { tabRefs.current[idx] = el; }}
                type="button"
                onClick={() => scrollToSlide(idx)}
                className={cx(
                  "shrink-0 py-2 px-3.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all duration-200 select-none whitespace-nowrap cursor-pointer",
                  isActive
                    ? "bg-surface text-ink shadow-xs border border-line-strong/40 scale-[1.01]"
                    : "text-ink-soft hover:text-ink hover:bg-surface/40"
                )}
              >
                <span className={cx(isActive ? "text-amber" : "text-ink-faint")}>
                  {slide.icon}
                </span>
                <span>{slide.tabTitle}</span>
              </button>
            );
          })}
        </div>

        {/* Piste de Carrousel Scrollable avec Effet Peek Apple (88vw pour entrevoir la carte suivante) */}
        <div
          ref={carouselRef}
          onScroll={handleCarouselScroll}
          className="flex gap-3.5 overflow-x-auto snap-x snap-mandatory scroll-smooth no-scrollbar -mx-4 px-4 pb-2 pt-1 overscroll-x-contain touch-pan-y touch-pan-x"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {carouselSlides.map((slide, idx) => (
            <div
              key={slide.id}
              ref={(el) => { slideRefs.current[idx] = el; }}
              className="w-[88vw] max-w-[420px] shrink-0 snap-center flex flex-col transition-opacity duration-200 touch-pan-y"
            >
              {slide.content}
            </div>
          ))}
        </div>

        {/* Indicateur de Pagination Apple (Liquid Dots) */}
        <div className="flex items-center justify-center gap-2 pt-0.5 pb-2">
          {carouselSlides.map((slide, idx) => (
            <button
              key={slide.id}
              type="button"
              aria-label={`Aller à ${slide.label}`}
              onClick={() => scrollToSlide(idx)}
              className={cx(
                "h-1.5 rounded-full transition-all duration-300",
                activeSlide === idx
                  ? "w-6 bg-amber"
                  : "w-1.5 bg-line-strong/60 hover:bg-ink-soft"
              )}
            />
          ))}
        </div>
      </section>

      {/* 2. Mode Desktop (>= 1024px) : Grille Bento 12 colonnes native */}
      <section className="hidden lg:grid lg:grid-cols-12 gap-6 items-start">
        {/* Colonne Gauche (7 cols) : Présences Collaborateurs & Flux du Jour */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          {das04?.detail ? <WhosInWidget details={das04.detail} /> : null}
          {renderActivityCard(false)}
        </div>

        {/* Colonne Droite (5 cols) : Alertes Opérationnelles & Répartition Outillage */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          {renderAlertsCard(false)}
          {renderToolsCard(false)}
        </div>
      </section>

      {/* Tour de contrôle volontairement placé en dernier : supervision détaillée après les signaux prioritaires. */}
      {data.etablis && (
        <section className="border-t border-line pt-6">
          <EtablisTourDeControle
            etablis={data.etablis}
            onOpenAudit={(kit) => setAuditKit(kit)}
            onOpenDetails={(kit) => setInspectKit(kit)}
          />
        </section>
      )}

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

      {/* Modal Contrôle Inopiné Flash */}
      <FlashAuditModal
        kit={auditKit}
        open={Boolean(auditKit)}
        onClose={() => setAuditKit(null)}
        onSuccess={() => setReload((v) => v + 1)}
      />

      {/* Modal Inspection Dotation Établi */}
      <KitInspectionModal
        kit={inspectKit}
        open={Boolean(inspectKit)}
        onClose={() => setInspectKit(null)}
      />
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
        <table className="w-full text-left table-rhythm">
          <thead className="border-b border-line bg-paper-2 text-[11px] uppercase font-semibold text-ink-faint">
            <tr>
              <th className="px-3 py-2 col-lead">Travailleur</th>
              <th className="px-3 py-2">Arrivée</th>
              <th className="px-3 py-2">Départ</th>
              <th className="px-3 py-2 text-right">Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line text-xs">
            {data.das04.detail.map((row, idx) => (
              <tr
                key={row.id}
                className={cx(
                  'transition-colors',
                  idx % 2 === 0 ? 'bg-surface/95' : 'bg-surface-2/45',
                  'hover:bg-amber-wash/20',
                )}
              >
                <td className="px-3 py-2.5 font-medium text-ink col-lead">{row.fullName}</td>
                <td className="px-3 py-2.5 font-mono tabular-nums">{row.inAt ?? '—'}</td>
                <td className="px-3 py-2.5 font-mono tabular-nums">{row.outAt ?? 'En poste'}</td>
                <td className="px-3 py-2.5 text-right">
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
