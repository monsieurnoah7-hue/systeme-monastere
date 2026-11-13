import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, getCachedApiResponse, type Dashboard as DashboardType, type StockRef, type Tool, type EtabliKit, type EtabliKitItem, fetchFleetSummary, type FleetSummary } from '../lib/api';
import {
  MOVE_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  formatDate,
  formatDateTime,
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
  Row,
  Spinner,
  cx,
  useToast,
} from '../components/ui';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Clock3,
  Fingerprint,
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
  Briefcase,
  Plus,
} from 'lucide-react';

const ToolsDonut = lazy(() => import('../components/DashboardCharts').then((module) => ({ default: module.ToolsDonut })));
const DailyMovesChart = lazy(() => import('../components/DashboardCharts').then((module) => ({ default: module.DailyMovesChart })));

type DrawerKind =
  | { kind: 'tools'; status: string; title: string }
  | { kind: 'stock' }
  | { kind: 'movements' }
  | { kind: 'attendance' }
  | { kind: 'attendanceEmployee'; employeeId: string; fullName: string }
  | { kind: 'overdue' }
  | { kind: 'missingTools' }
  | { kind: 'missingOut' }
  | { kind: 'absent' }
  | { kind: 'conge' };

function DeferredChart({ children, height }: { children: ReactNode; height: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    if (shouldLoad || !containerRef.current) return;
    if (typeof IntersectionObserver === 'undefined') {
      setShouldLoad(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setShouldLoad(true);
        observer.disconnect();
      }
    }, { rootMargin: '160px' });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [shouldLoad]);

  return (
    <div ref={containerRef} className={cx('w-full', height)}>
      {shouldLoad ? (
        <Suspense fallback={<div className="grid h-full place-items-center" aria-label="Chargement du graphique"><Spinner /></div>}>
          {children}
        </Suspense>
      ) : (
        <div className="h-full animate-pulse rounded-xl bg-surface-2/60" aria-hidden="true" />
      )}
    </div>
  );
}

function LiveClock({ active }: { active: boolean }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return <span className="font-mono text-xs font-bold text-amber tabular-nums bg-amber-wash border border-amber/20 px-2.5 py-0.5 rounded-md shadow-2xs">{now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>;
}

/**
 * Ruban de Contrôle « Pouls de l'Atelier » (Workshop Pulse Ribbon)
 * Synthétise les 4 signes vitaux opérationnels en 1 coup d'œil, sans redondance.
 */
function WorkshopPulseRibbon({
  das01,
  das04,
  das05,
  etablis,
  pendingLeavesCount,
  onOpenAttendance,
  onOpenTools,
  onOpenAlerts,
  onOpenEtablis,
}: {
  das01: DashboardType['das01'];
  das04?: DashboardType['das04'];
  das05: DashboardType['das05'];
  etablis?: DashboardType['etablis'];
  pendingLeavesCount: number;
  onOpenAttendance: () => void;
  onOpenTools: () => void;
  onOpenAlerts: () => void;
  onOpenEtablis: () => void;
}) {
  const totalTeam = das04
    ? das04.detail.length
    : 0;
  const attendanceRate = totalTeam > 0 && das04 ? Math.round((das04.present / totalTeam) * 100) : 0;
  const totalArbitrages = pendingLeavesCount + das05.overdueLoans + das05.lowStock;
  const arbitrationSummary = [
    pendingLeavesCount ? `${pendingLeavesCount} visa en attente` : null,
    das05.overdueLoans ? `${das05.overdueLoans} prêt${das05.overdueLoans > 1 ? 's' : ''} en retard` : null,
    das05.lowStock ? `${das05.lowStock} article${das05.lowStock > 1 ? 's' : ''} sous seuil` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {/* 1. Effectif & Présences */}
      <button
        type="button"
        onClick={onOpenAttendance}
        className="group flex flex-col justify-between p-4 rounded-2xl border border-line bg-surface hover:border-amber/40 hover:bg-surface-2/40 transition-all text-left cursor-pointer shadow-xs active:scale-[0.99] min-h-[100px]"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-ink-soft flex items-center gap-1.5">
            <Users size={15} className="text-amber" />
            Effectif en Atelier
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            {attendanceRate}%
          </span>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="font-mono text-2xl font-extrabold text-ink tabular-nums">
            {das04?.present ?? 0}
          </span>
          <span className="text-xs text-ink-soft font-medium">/ {totalTeam} sur site</span>
        </div>
        <p className="mt-1 text-xs text-ink-soft truncate font-medium">
          {das04 ? `${das04.late} retard · ${das04.conge + das04.permission} congé · ${das04.absent} attendus` : 'Accès restreint'}
        </p>
      </button>

      {/* 2. Arbitrages & Vigilance */}
      <button
        type="button"
        disabled={totalArbitrages === 0}
        onClick={onOpenAlerts}
        className={cx(
          "group flex flex-col justify-between p-4 rounded-2xl border transition-all text-left cursor-pointer shadow-xs active:scale-[0.99] disabled:cursor-default disabled:active:scale-100 min-h-[100px]",
          totalArbitrages > 0
            ? "border-amber/40 bg-amber-wash/30 hover:bg-amber-wash/50"
            : "border-line bg-surface hover:border-line-strong hover:bg-surface-2/40"
        )}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-ink-soft flex items-center gap-1.5">
            <AlertTriangle size={15} className={totalArbitrages > 0 ? "text-amber" : "text-emerald-500"} />
            Arbitrages &amp; actions
          </span>
          <span className={cx(
            "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold border",
            totalArbitrages > 0
              ? "bg-amber-500/10 text-amber border-amber-500/20"
              : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
          )}>
            {totalArbitrages > 0 ? `${totalArbitrages} action${totalArbitrages > 1 ? 's' : ''}` : 'Nominal'}
          </span>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className={cx(
            "font-mono text-2xl font-extrabold tabular-nums",
            totalArbitrages > 0 ? "text-amber" : "text-ink"
          )}>
            {totalArbitrages}
          </span>
          <span className="text-xs text-ink-soft font-medium">
            {totalArbitrages > 1 ? 'éléments à traiter' : 'élément à traiter'}
          </span>
        </div>
        <p className="mt-1 text-xs leading-snug text-ink-soft font-medium">
          {totalArbitrages > 0
            ? arbitrationSummary
            : 'Aucun arbitrage bloquant'}
        </p>
      </button>

      {/* 3. Parc Outillage Actif */}
      <button
        type="button"
        onClick={onOpenTools}
        className="group flex flex-col justify-between p-4 rounded-2xl border border-line bg-surface hover:border-amber/40 hover:bg-surface-2/40 transition-all text-left cursor-pointer shadow-xs active:scale-[0.99] min-h-[100px]"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-ink-soft flex items-center gap-1.5">
            <Wrench size={15} className="text-amber" />
            Parc Outillage
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-ink-soft border border-line">
            {das01.total} au parc
          </span>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="font-mono text-2xl font-extrabold text-ink tabular-nums">
            {das01.en_pret}
          </span>
          <span className="text-xs text-ink-soft font-medium">sortis ({das01.disponible} dispo)</span>
        </div>
        <p className="mt-1 text-xs text-ink-soft truncate font-medium">
          {das01.maintenance} en révision · {das05.lowStock} sous seuil
        </p>
      </button>

      {/* 4. Postes & Servantes */}
      <button
        type="button"
        onClick={onOpenEtablis}
        className={cx(
          "group flex flex-col justify-between p-4 rounded-2xl border transition-all text-left cursor-pointer shadow-xs active:scale-[0.99] min-h-[100px]",
          (etablis?.anomaliesCount ?? 0) > 0
            ? "border-amber/40 bg-amber-wash/20 hover:bg-amber-wash/40"
            : "border-line bg-surface hover:border-line-strong hover:bg-surface-2/40"
        )}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-ink-soft flex items-center gap-1.5">
            <ShieldCheck size={15} className={(etablis?.anomaliesCount ?? 0) > 0 ? "text-amber" : "text-emerald-500"} />
            Postes &amp; Servantes
          </span>
          <span className={cx(
            "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold border",
            (etablis?.anomaliesCount ?? 0) > 0
              ? "bg-amber-500/10 text-amber border-amber-500/20"
              : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
          )}>
            {(etablis?.anomaliesCount ?? 0) > 0 ? `${etablis?.anomaliesCount} anomalie${(etablis?.anomaliesCount ?? 0) > 1 ? 's' : ''}` : '100% Intacts'}
          </span>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="font-mono text-2xl font-extrabold text-ink tabular-nums">
            {(etablis?.totalKits ?? 0) - (etablis?.anomaliesCount ?? 0)}
          </span>
          <span className="text-xs text-ink-soft font-medium">/ {etablis?.totalKits ?? 0} établis conformes</span>
        </div>
        <p className="mt-1 text-xs text-ink-soft truncate font-medium">
          {(etablis?.anomaliesCount ?? 0) > 0 ? `⚠️ ${etablis?.anomaliesCount} servante(s) à vérifier` : 'Toutes les servantes sont au complet'}
        </p>
      </button>
    </div>
  );
}



/**
 * Widget Présences Équipe - Version Google Grade
 */
function WhosInWidget({
  details,
  className,
  onOpenPointage,
}: {
  details: NonNullable<DashboardType['das04']>['detail'];
  className?: string;
  onOpenPointage?: () => void;
}) {
  const [filter, setFilter] = useState<'all' | 'present' | 'late' | 'leaves' | 'absent'>('all');
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(5);

  useEffect(() => {
    setVisibleCount(5);
  }, [filter, search]);

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
    <Card className={cx("shadow-card overflow-hidden flex flex-col justify-between", className)}>
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
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-line bg-surface-2/40 px-3 py-2 text-xs no-scrollbar" style={{ WebkitOverflowScrolling: 'touch' }}>
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

      {/* Workers list */}
      <div
        className={cx(
          'flex-1 min-h-0 max-h-none lg:min-h-[260px] lg:max-h-[380px]',
          'overflow-y-auto scroll-thin divide-y divide-line',
        )}
      >
        {filtered.map((person, index) => {
          const isPresent = person.status === 'present';
          const isLate = person.status === 'late';
          const isConge = person.status === 'conge';
          const isPermission = person.status === 'permission';

          return (
            <div
              key={person.id}
              className={cx(
                'flex items-center justify-between gap-3 p-3 hover:bg-paper-2/50 transition-colors',
                index >= visibleCount && 'hidden lg:flex',
              )}
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

      {filtered.length > visibleCount && (
        <div className="border-t border-line/60 px-3 py-2 lg:hidden">
          <button
            type="button"
            onClick={() => setVisibleCount((count) => count + 5)}
            className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-line bg-surface-2/50 px-3 text-xs font-semibold text-ink-soft transition-colors hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
            aria-label={`Afficher ${Math.min(5, filtered.length - visibleCount)} présences supplémentaires`}
          >
            <Plus size={15} aria-hidden="true" />
            Afficher {Math.min(5, filtered.length - visibleCount)} de plus
            <span className="text-ink-faint">({visibleCount} / {filtered.length})</span>
          </button>
        </div>
      )}

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

function EtabliCarouselTrack({
  chunk,
  seriesIndex,
  totalSeries,
  onOpenAudit,
  onOpenDetails,
}: {
  chunk: EtabliKitSummaryItem[];
  seriesIndex: number;
  totalSeries: number;
  onOpenAudit: (kit: EtabliKitSummaryItem) => void;
  onOpenDetails: (kit: EtabliKitSummaryItem) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScrollState = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 10);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
  }, []);

  useEffect(() => {
    checkScrollState();
    const handleResize = () => checkScrollState();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [checkScrollState, chunk]);

  const scrollByDirection = (direction: 'left' | 'right') => {
    const el = trackRef.current;
    if (!el) return;
    const scrollAmount = el.clientWidth * 0.8;
    el.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
    setTimeout(checkScrollState, 350);
  };

  const startNum = String(chunk[0]?.etabli_number ?? 0).padStart(2, '0');
  const endNum = String(chunk[chunk.length - 1]?.etabli_number ?? 0).padStart(2, '0');

  return (
    <div className="space-y-2.5 rounded-2xl border border-line bg-surface/50 p-3.5 sm:p-4 shadow-xs">
      {/* Header de la série de 4 à 5 cartes */}
      <div className="flex items-center justify-between border-b border-line/60 pb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="shrink-0 px-2 py-0.5 rounded-md text-[11px] font-bold bg-ink text-paper font-mono shadow-xs">
            Série {seriesIndex + 1} / {totalSeries}
          </span>
          <h3 className="text-xs font-bold text-ink truncate">
            Établis {startNum} à {endNum}
          </h3>
          <span className="text-[11px] text-ink-faint shrink-0">
            ({chunk.length} établi{chunk.length > 1 ? 's' : ''})
          </span>
        </div>

        {/* Contrôles de navigation pour ce carrousel */}
        <div className="flex items-center gap-1 shrink-0 bg-paper-2 p-0.5 rounded-lg border border-line">
          <button
            type="button"
            onClick={() => scrollByDirection('left')}
            disabled={!canScrollLeft}
            className="p-1 rounded text-ink-soft hover:text-ink hover:bg-surface disabled:opacity-20 disabled:pointer-events-none transition-all cursor-pointer"
            title="Établis précédents de cette série"
            aria-label="Précédent"
          >
            <ChevronLeft size={15} />
          </button>
          <button
            type="button"
            onClick={() => scrollByDirection('right')}
            disabled={!canScrollRight}
            className="p-1 rounded text-ink-soft hover:text-ink hover:bg-surface disabled:opacity-20 disabled:pointer-events-none transition-all cursor-pointer"
            title="Établis suivants de cette série"
            aria-label="Suivant"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      {/* Piste du carrousel contenant max 5 cartes (ordi) / 4 cartes (smartphone) */}
      <div
        ref={trackRef}
        onScroll={checkScrollState}
        className="flex gap-3.5 overflow-x-auto snap-x snap-proximity scroll-smooth no-scrollbar -mx-2 px-2 sm:-mx-3 sm:px-3 pb-2 pt-1 overscroll-x-contain touch-pan-y touch-pan-x"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {chunk.map((kit) => {
          const hasAnomalies = kit.items_missing > 0 || kit.items_to_sharpen > 0;
          const isOverdue = !kit.last_audited_at || Math.floor((Date.now() - new Date(kit.last_audited_at).getTime()) / 86400000) >= 15;
          const completionPct = kit.items_total > 0 ? Math.round((kit.items_present / kit.items_total) * 100) : 100;

          return (
            <div
              key={kit.id}
              className={cx(
                'group flex flex-col justify-between rounded-2xl border bg-surface p-4 shadow-card hover:shadow-card-hover transition-all duration-200 shrink-0 snap-start',
                'w-[84vw] max-w-[340px] sm:w-[290px] md:w-[calc((100%-2*0.875rem)/3)] lg:w-[calc((100%-3*0.875rem)/4)]',
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
                  size="md"
                  variant="primary"
                  icon={<ShieldCheck size={13} className="text-white" />}
                  onClick={() => onOpenAudit(kit)}
                  className="min-w-0 flex-1 bg-green px-2 text-white font-semibold text-xs shadow-xs"
                  title="Lancer le contrôle inopiné flash de cet établi"
                >
                  Contrôler
                </Button>
                <Button
                  size="md"
                  variant="ghost"
                  icon={<Eye size={13} />}
                  onClick={() => onOpenDetails(kit)}
                  className="min-w-0 border border-line px-2 text-ink-soft hover:text-ink text-xs"
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
  const [selectedSeries, setSelectedSeries] = useState<'all' | number>('all');
  const [dailyComplianceVisibleCount, setDailyComplianceVisibleCount] = useState(5);
  const getChunkSize = () => {
    if (typeof window === 'undefined') return 8;
    if (window.innerWidth < 640) return 4;
    if (window.innerWidth < 1024) return 6;
    return 8;
  };
  const [chunkSize, setChunkSize] = useState(getChunkSize);

  useEffect(() => {
    setDailyComplianceVisibleCount(5);
  }, [etablis.dailyCompliance.date]);

  useEffect(() => {
    const handleResize = () => {
      setChunkSize(getChunkSize());
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  const chunks = useMemo(() => {
    const result: EtabliKitSummaryItem[][] = [];
    for (let i = 0; i < filteredKits.length; i += chunkSize) {
      result.push(filteredKits.slice(i, i + chunkSize));
    }
    return result;
  }, [filteredKits, chunkSize]);

  return (
    <section className="space-y-4">
      <div id="etablis-heading" className="flex flex-col gap-3 border-b border-line pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-ink">Tour de contrôle des établis</h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-soft">
            Dotations nominatives, état du parc et contrôles à traiter, réunis au même endroit.
          </p>
        </div>
        <div className="hidden sm:block shrink-0 sm:text-right">
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

      <Card className="p-0 overflow-hidden" padded={false}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <div><h3 className="text-sm font-semibold text-ink">Contrôles quotidiens des établis</h3><p className="mt-0.5 text-xs text-ink-soft">Échéance {etablis.dailyCompliance.dueAt} · {formatDate(etablis.dailyCompliance.date)}</p></div>
          <span className="text-xs font-medium text-ink-soft">{etablis.dailyCompliance.completedCount}/{etablis.dailyCompliance.requiredCount} terminés</span>
        </div>
        <div className="grid grid-cols-3 divide-x divide-line border-b border-line text-center">
          <div className="px-2 py-2"><p className="text-lg font-semibold tabular-nums text-green">{etablis.dailyCompliance.completedCount}</p><p className="text-[10px] text-ink-faint">Terminés</p></div>
          <div className="px-2 py-2"><p className="text-lg font-semibold tabular-nums text-amber">{etablis.dailyCompliance.pendingCount}</p><p className="text-[10px] text-ink-faint">À faire</p></div>
          <div className="px-2 py-2"><p className="text-lg font-semibold tabular-nums text-red">{etablis.dailyCompliance.overdueCount}</p><p className="text-[10px] text-ink-faint">En retard</p></div>
        </div>
        <div className="max-h-none divide-y divide-line lg:max-h-72 lg:overflow-y-auto">
          {etablis.dailyCompliance.items.map((item, index) => (
            <div key={item.kitId} className={cx('flex items-center justify-between gap-3 px-4 py-2.5', index >= dailyComplianceVisibleCount && 'hidden lg:flex')}>
              <div className="min-w-0"><p className="truncate text-xs font-medium text-ink">{item.employeeName}</p><p className="truncate text-[10px] text-ink-faint">Établi n° {item.etabliNumber} · {item.code}</p></div>
              <div className="shrink-0 text-right">
                <Chip dot={false} tone={item.status === 'done' ? 'green' : item.status === 'overdue' ? 'red' : item.status === 'exempt' ? 'grey' : 'amber'}>
                  {item.status === 'done' ? 'Terminé' : item.status === 'overdue' ? 'En retard' : item.status === 'exempt' ? 'Exempté' : 'À faire'}
                </Chip>
                <p className="mt-0.5 text-[10px] text-ink-faint">{item.auditedAt ? new Intl.DateTimeFormat('fr-FR', { timeZone: 'Africa/Douala', hour: '2-digit', minute: '2-digit' }).format(new Date(item.auditedAt)) : item.reason ?? ''}</p>
              </div>
            </div>
          ))}
          {etablis.dailyCompliance.items.length === 0 && <p className="p-4 text-xs text-ink-faint">Aucun établi actif à suivre.</p>}
        </div>
        {etablis.dailyCompliance.items.length > dailyComplianceVisibleCount && (
          <div className="border-t border-line p-3 text-center lg:hidden">
            <button
              type="button"
              onClick={() => setDailyComplianceVisibleCount((count) => Math.min(count + 5, etablis.dailyCompliance.items.length))}
              aria-label={`Afficher ${Math.min(5, etablis.dailyCompliance.items.length - dailyComplianceVisibleCount)} contrôles supplémentaires`}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-line px-4 text-sm font-semibold text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
            >
              <Plus size={16} aria-hidden="true" />
              Afficher {Math.min(5, etablis.dailyCompliance.items.length - dailyComplianceVisibleCount)} de plus
              <span className="text-xs font-normal text-ink-faint">({dailyComplianceVisibleCount}/{etablis.dailyCompliance.items.length})</span>
            </button>
          </div>
        )}
      </Card>

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

        {/* Right side: Search Bar */}
        <div className="relative min-w-[200px] sm:min-w-[260px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher artisan, n° établi..."
            className="w-full h-9 rounded-xl border border-line bg-surface pl-9 pr-3 text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:border-amber transition-colors"
          />
        </div>
      </div>

      {/* Sélecteur de séries / carrousels : Découpage ergonomique en carrousels de 5 (ordi/tablette) ou 4 (smartphone) */}
      {chunks.length > 1 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 pt-1 border-t border-line/60">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 overscroll-x-contain touch-pan-y touch-pan-x" style={{ WebkitOverflowScrolling: 'touch' }}>
            <button
              type="button"
              onClick={() => setSelectedSeries('all')}
              className={cx(
                'shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-all cursor-pointer',
                selectedSeries === 'all'
                  ? 'bg-amber text-white shadow-xs'
                  : 'bg-surface text-ink-soft hover:text-ink border border-line'
              )}
            >
              Tous les carrousels ({chunks.length})
            </button>
            {chunks.map((chunk, idx) => {
              const isSelected = selectedSeries === idx;
              const firstKit = chunk[0];
              const lastKit = chunk[chunk.length - 1];
              const start = firstKit ? String(firstKit.etabli_number).padStart(2, '0') : '01';
              const end = lastKit ? String(lastKit.etabli_number).padStart(2, '0') : start;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSelectedSeries(idx)}
                  className={cx(
                    'shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5',
                    isSelected
                      ? 'bg-ink text-paper shadow-xs'
                      : 'bg-surface text-ink-soft hover:text-ink border border-line'
                  )}
                >
                  <span>Série {idx + 1} ({start}–{end})</span>
                </button>
              );
            })}
          </div>

          {selectedSeries !== 'all' && (
            <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
              <button
                type="button"
                onClick={() => setSelectedSeries((prev) => (typeof prev === 'number' && prev > 0 ? prev - 1 : chunks.length - 1))}
                className="px-2.5 py-1 rounded-lg text-xs font-medium text-ink-soft hover:text-ink border border-line bg-surface cursor-pointer"
              >
                &larr; Série préc.
              </button>
              <button
                type="button"
                onClick={() => setSelectedSeries((prev) => (typeof prev === 'number' && prev < chunks.length - 1 ? prev + 1 : 0))}
                className="px-2.5 py-1 rounded-lg text-xs font-medium text-ink-soft hover:text-ink border border-line bg-surface cursor-pointer"
              >
                Série suiv. &rarr;
              </button>
            </div>
          )}
        </div>
      )}

      {/* Rendu des carrousels de 5 cartes (ordi) / 4 cartes (mobile) au fur et à mesure */}
      {filteredKits.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface p-12 text-center text-xs text-ink-soft">
          Aucun établi ne correspond aux critères sélectionnés.
        </div>
      ) : (
        <div className="space-y-4">
          {(selectedSeries === 'all'
            ? chunks
            : (typeof selectedSeries === 'number' && chunks[selectedSeries] ? [chunks[selectedSeries]] : chunks.slice(0, 1))
          ).map((chunk, idx) => {
            const actualIndex = selectedSeries === 'all' ? idx : (typeof selectedSeries === 'number' ? selectedSeries : 0);
            return (
              <EtabliCarouselTrack
                key={actualIndex}
                chunk={chunk}
                seriesIndex={actualIndex}
                totalSeries={chunks.length}
                onOpenAudit={onOpenAudit}
                onOpenDetails={onOpenDetails}
              />
            );
          })}
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

export function Dashboard({ active = true }: { active?: boolean }) {
  const toast = useToast();
  const cachedInitial = getCachedApiResponse<DashboardType>('/api/dashboard');
  const [data, setData] = useState<DashboardType | null>(cachedInitial);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!cachedInitial);
  const [reload, setReload] = useState(0);
  const [drawer, setDrawer] = useState<DrawerKind | null>(null);

  // Fermer le drawer lors de la navigation vers un autre module
  useEffect(() => {
    const handleNav = () => setDrawer(null);
    window.addEventListener('nav-view', handleNav);
    window.addEventListener('view-changed', handleNav);
    window.addEventListener('hashchange', handleNav);
    return () => {
      window.removeEventListener('nav-view', handleNav);
      window.removeEventListener('view-changed', handleNav);
      window.removeEventListener('hashchange', handleNav);
    };
  }, []);
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
  const [fleetSummary, setFleetSummary] = useState<FleetSummary | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const refreshFleet = () => {
      fetchFleetSummary().then((summary) => {
        if (!cancelled) setFleetSummary(summary);
      }).catch(() => {});
    };
    refreshFleet();
    const interval = window.setInterval(refreshFleet, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [active]);

  const wasActive = useRef(active);
  useEffect(() => {
    if (active && !wasActive.current) setReload((value) => value + 1);
    wasActive.current = active;
  }, [active]);

  // Navigation Mobile Tactile (Onglets rapides ou vue complète empilée sans carrousel)
  const [mobileTab, setMobileTab] = useState<'presence' | 'alerts' | 'tools' | 'activity' | 'all'>('presence');

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
    // Le tableau de bord utilise le cache SWR pour un affichage instantané à 0ms
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
    if (!active) return;
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
  }, [active]);

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

  const { das01, das03, das04, das05 } = data;
  const dailyMoves = [
    { name: 'Entrées', value: das03.entries, color: '#10b981' },
    { name: 'Sorties', value: das03.exits, color: '#ff6603' },
    { name: 'Retours', value: das03.returns, color: '#3b82f6' },
  ];

  // =========================================================================
  // Indicateurs & Rendu des Cartes de Supervision
  // =========================================================================
  const totalTeam = das04
    ? das04.detail.length
    : 0;
  const alertTotal = das05.overdueLoans + das05.lowStock + das05.missingTools + das05.missingOut + (fleetSummary?.alerts.total_urgent ?? 0);

  const renderAlertsCard = (customClass?: string) => (
    <Card className={cx("shadow-card p-5 flex flex-col justify-between", customClass ?? "h-full")}>
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
            {
              label: 'Échéances Véhicules & Groupes Électrogènes',
              count: fleetSummary?.alerts.total_urgent ?? 0,
              open: () => window.dispatchEvent(new CustomEvent('nav-view', { detail: 'outils' })),
              desc: 'Assurances, visites et vidanges à traiter',
            },
          ].map((alert) => (
            <li key={alert.label}>
              <button
                onClick={alert.open}
                className="flex w-full items-center justify-between gap-3 bg-surface px-3.5 py-3 text-left transition-colors hover:bg-paper-2 group cursor-pointer"
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

      <div className="pt-3 mt-4 border-t border-line/60 flex items-center justify-between text-[11px] text-ink-faint">
        <span>Surveillance continue atelier</span>
        <span className="font-mono font-semibold text-ink-soft">
          {alertTotal === 0 ? '✓ Aucune anomalie' : `⚠️ ${alertTotal} alerte(s)`}
        </span>
      </div>
    </Card>
  );

  const renderToolsCard = (customClass?: string) => (
    <Card className={cx("shadow-card p-5 flex flex-col justify-between", customClass ?? "h-full")}>
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold text-ink flex items-center gap-2">
            <Wrench size={16} className="text-amber" />
            <span>Répartition de l’outillage</span>
          </h2>
          <p className="text-[11px] text-ink-faint">Filtrer par statut</p>
        </div>
        <DeferredChart height="min-h-[290px]">
          <ToolsDonut das01={das01} onPick={(status) => openTools(status, `Outils — ${STATUS_LABEL[status]}`)} />
        </DeferredChart>
      </div>

      <div className="pt-3 mt-4 border-t border-line/60 flex items-center justify-between text-[11px] text-ink-faint">
        <span>Inventaire du parc</span>
        <span className="font-mono font-semibold text-ink-soft">{das01.total} machines & outils</span>
      </div>
    </Card>
  );

  const renderActivityCard = (customClass?: string) => (
    <Card className={cx("shadow-card p-5 flex flex-col justify-between", customClass ?? "h-full")}>
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
            className="text-xs text-amber hover:underline font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
          >
            Journal du jour &rarr;
          </button>
        </div>

        {/* Flux KPI Pills */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <button
            type="button"
            onClick={() => setDrawer({ kind: 'movements' })}
            className="flex min-h-20 min-w-0 flex-col items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-2.5 text-center transition-colors hover:bg-emerald-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 shadow-xs"
            title="Entrées au stock"
            aria-label={`Voir le journal des entrées, ${das03.entries}`}
          >
            <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
              <ArrowDownRight size={14} />
              <span>Entrées</span>
            </span>
            <span className="mt-1 font-mono text-xl font-bold text-emerald-200">{das03.entries}</span>
          </button>

          <button
            type="button"
            onClick={() => setDrawer({ kind: 'movements' })}
            className="flex min-h-20 min-w-0 flex-col items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 p-2.5 text-center transition-colors hover:bg-amber-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber shadow-xs"
            title="Sorties (consommables & prêts)"
            aria-label={`Voir le journal des sorties, ${das03.exits}`}
          >
            <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-200">
              <ArrowUpRight size={14} />
              <span>Sorties</span>
            </span>
            <span className="mt-1 font-mono text-xl font-bold text-amber-100">{das03.exits}</span>
          </button>

          <button
            type="button"
            onClick={() => setDrawer({ kind: 'movements' })}
            className="flex min-h-20 min-w-0 flex-col items-center justify-center rounded-xl border border-sky-500/20 bg-sky-500/10 p-2.5 text-center transition-colors hover:bg-sky-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 shadow-xs"
            title="Retours d'outillage"
            aria-label={`Voir le journal des retours, ${das03.returns}`}
          >
            <span className="flex items-center gap-1.5 text-xs font-semibold text-sky-200">
              <RotateCcw size={14} />
              <span>Retours</span>
            </span>
            <span className="mt-1 font-mono text-xl font-bold text-sky-100">{das03.returns}</span>
          </button>
        </div>

        <DeferredChart height="h-44">
          <DailyMovesChart moves={dailyMoves} onSelect={() => setDrawer({ kind: 'movements' })} />
        </DeferredChart>
      </div>

      <div className="pt-3 mt-4 border-t border-line/60 flex items-center justify-between text-[11px] text-ink-faint">
        <span>Traçabilité mouvements</span>
        <span className="font-mono font-semibold text-ink-soft">
          {das03.entries + das03.exits + das03.returns} flux aujourd’hui
        </span>
      </div>
    </Card>
  );

  const renderProjectsCard = (customClass?: string) => {
    const projects = data.projects;

    // Direction reste super-admin; les autres rôles doivent recevoir
    // explicitement l'indicateur d'accès calculé par l'API.
    if (!data.projectsAccess && data.role !== 'direction') return null;

    const openProjects = () => window.dispatchEvent(new CustomEvent('nav-view', { detail: 'projets' }));

    // Keep the module entry visible for authorized dashboard users even if an
    // older API process or a transient query failure omits the new summary.
    if (!projects) {
      return (
        <Card className={cx('p-4 shadow-card', customClass ?? '')}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Briefcase size={16} className="shrink-0 text-amber" />
              <h2 className="truncate text-sm font-bold text-ink">Commandes &amp; chantiers</h2>
            </div>
            <button type="button" onClick={openProjects} className="shrink-0 text-xs font-semibold text-amber hover:underline">
              Ouvrir
            </button>
          </div>
          <p className="mt-3 text-xs text-ink-soft">
            La synthèse n’est pas encore disponible. Ouvrez le module ou actualisez le tableau de bord.
          </p>
        </Card>
      );
    }

    const needsAttention = projects.delayedCount > 0 || projects.overtimeHours > 0 || projects.pendingIncidentCount > 0;
    return (
      <Card className={cx('p-4 shadow-card', customClass ?? '')}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
              <Briefcase size={16} className="text-amber" />
              Commandes &amp; chantiers
            </h2>
            <p className="mt-1 text-xs text-ink-soft">Suivi consolidé des projets en cours.</p>
          </div>
          <button
            type="button"
            onClick={openProjects}
            className="shrink-0 text-xs font-semibold text-amber hover:underline"
          >
            Ouvrir
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 divide-x divide-line rounded-xl border border-line bg-paper-2/40">
          <div className="min-w-0 p-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">Actifs</p>
            <p className="mt-1 font-mono text-lg font-bold text-ink">{projects.activeCount}</p>
          </div>
          <div className="min-w-0 p-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">Retards</p>
            <p className={cx('mt-1 font-mono text-lg font-bold', projects.delayedCount > 0 ? 'text-red' : 'text-ink')}>
              {projects.delayedCount}
            </p>
          </div>
          <div className="min-w-0 p-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">Hors budget</p>
            <p className={cx('mt-1 font-mono text-lg font-bold', projects.overtimeHours > 0 ? 'text-amber' : 'text-ink')}>
              +{projects.overtimeHours} h
            </p>
          </div>
        </div>

        {projects.pendingIncidentCount > 0 && (
          <button type="button" onClick={openProjects} className="mt-3 flex w-full items-center justify-between gap-3 rounded-lg border border-amber/30 bg-amber-wash px-3 py-2.5 text-left hover:bg-amber-wash/80">
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-ink">Signalements à examiner</span>
              <span className="mt-0.5 block text-[11px] text-ink-soft">Les délais ne changent qu’après votre décision.</span>
            </span>
            <span className="shrink-0 rounded-full bg-amber px-2 py-1 text-xs font-bold text-paper">{projects.pendingIncidentCount}</span>
          </button>
        )}

        {projects.financialDamageFcfa !== null && needsAttention ? (
          <p className="mt-3 text-xs text-ink-soft">
            Impact estimé : <span className="font-mono font-semibold text-ink">{projects.financialDamageFcfa.toLocaleString()} FCFA</span>
          </p>
        ) : null}

        {projects.attention.length > 0 ? (
          <div className="mt-3 divide-y divide-line rounded-xl border border-line">
            {projects.attention.map((project) => (
              <button
                key={project.code}
                type="button"
                onClick={openProjects}
                className="flex w-full items-center justify-between gap-3 bg-surface px-3 py-2.5 text-left transition-colors hover:bg-paper-2"
              >
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold text-ink">{project.title || 'Projet à compléter'}</span>
                  <span className="mt-0.5 block font-mono text-[10px] text-ink-faint">{project.code}</span>
                </span>
                <span className={cx('shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold', project.days_late > 0 ? 'border-red-500/20 bg-red-500/10 text-red' : 'border-amber/20 bg-amber-wash text-amber')}>
                  {project.days_late > 0 ? `+${project.days_late} j` : `+${project.overtime_hours} h`}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-xs text-ink-soft">Aucun retard, dépassement ou signalement en attente.</p>
        )}
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      {/* En-tête Unifié (Style Apple / Linear Dashboard) */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between border-b border-line pb-3.5">
        <div>
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-500">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>En direct</span>
            </span>
            <span className="text-line-strong">·</span>
            <span className="capitalize text-ink-soft font-medium text-xs">{new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
          </div>
          <div className="flex items-baseline gap-2.5 mt-0.5">
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-ink font-heading">
              Vue d'ensemble
            </h1>
            <LiveClock active={active} />
          </div>
        </div>

        <div className="flex items-center gap-2 justify-between sm:justify-end">
          <Button
            variant="ghost"
            size="sm"
            disabled={loading}
            icon={<RefreshCw size={14} className={loading ? 'animate-spin text-amber' : ''} />}
            onClick={() => {
              setLoading(true);
              setReload((value) => value + 1);
            }}
            className="h-9 px-2.5 text-xs text-ink-soft hover:text-ink border border-line/60"
            aria-label={loading ? 'Actualisation du tableau de bord en cours' : 'Actualiser le tableau de bord'}
          >
            <span>{loading ? 'Actualisation…' : 'Actualiser'}</span>
          </Button>
          <button
            type="button"
            onClick={() => setDrawer({ kind: 'attendance' })}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 rounded-xl bg-amber px-3.5 py-2 text-xs sm:text-sm font-bold text-white shadow-xs transition-all hover:bg-amber-2 active:scale-95 cursor-pointer min-h-[38px]"
          >
            <Fingerprint size={16} />
            <span>Kiosque &amp; Pointage</span>
            <ChevronRight size={13} />
          </button>
        </div>
      </div>

      {/* Le Pouls de l'Atelier (Workshop Pulse Ribbon) : 4 indicateurs vitaux zéro doublon */}
      <WorkshopPulseRibbon
        das01={das01}
        das04={das04}
        das05={das05}
        etablis={data.etablis}
        pendingLeavesCount={data.pendingLeaves?.length ?? 0}
        onOpenAttendance={() => setDrawer({ kind: 'attendance' })}
        onOpenTools={() => openTools('disponible', 'Outillage')}
        onOpenAlerts={() => {
          if ((data.pendingLeaves?.length ?? 0) > 0) {
            document.getElementById('dashboard-action-inbox')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          } else if (das05.overdueLoans > 0) {
            setDrawer({ kind: 'overdue' });
          } else if (das05.lowStock > 0) {
            setDrawer({ kind: 'stock' });
          } else if (das05.missingTools > 0) {
            setDrawer({ kind: 'missingTools' });
          } else if (das05.missingOut > 0) {
            setDrawer({ kind: 'missingOut' });
          }
        }}
        onOpenEtablis={() => {
          const heading = document.getElementById('etablis-heading') || document.getElementById('etablis-section');
          if (!heading) return;

          const main = heading.closest('main') || document.querySelector('main');

          // Mesure dynamique de la barre supérieure réellement visible (desktop ou mobile)
          let headerH = 0;
          const desktopBar = (document.querySelector('main > div.sticky') || document.querySelector('main .sticky')) as HTMLElement | null;
          const mobileHeader = document.querySelector('header') as HTMLElement | null;

          if (desktopBar && desktopBar.clientHeight > 0) {
            headerH = desktopBar.getBoundingClientRect().height;
          } else if (mobileHeader && mobileHeader.clientHeight > 0) {
            headerH = mobileHeader.getBoundingClientRect().height;
          } else {
            headerH = 42;
          }

          if (main && (main.scrollHeight > main.clientHeight || main.scrollTop > 0)) {
            const headingRect = heading.getBoundingClientRect();
            const mainRect = main.getBoundingClientRect();
            // Positionne le titre "Tour de contrôle des établis" exactement 24px sous la barre d'en-tête
            const targetTop = main.scrollTop + (headingRect.top - mainRect.top) - headerH - 24;
            main.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
          } else {
            const headingTop = heading.getBoundingClientRect().top + window.scrollY;
            window.scrollTo({ top: Math.max(0, headingTop - headerH - 24), behavior: 'smooth' });
          }
        }}
      />

      {error ? (
        <div className="mb-4">
          <Banner tone="error">{error}</Banner>
        </div>
      ) : null}

      {/* Centre de Triage & Décisions Prioritaires (Action Inbox) */}
      <section id="dashboard-action-inbox" className="scroll-mt-24 space-y-3">
        {data.pendingLeaves && data.pendingLeaves.length > 0 ? (
          <PendingLeavesBanner
            leaves={data.pendingLeaves}
            onReview={handleReviewLeave}
            reviewingId={reviewingLeaveId}
          />
        ) : (
          <div className="flex items-center justify-between p-3.5 rounded-2xl border border-line bg-surface-2/30 shadow-2xs">
            <div className="flex items-center gap-2.5 text-xs">
              <span className="grid h-6 w-6 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <Check size={14} strokeWidth={2.5} />
              </span>
              <span className="font-semibold text-ink">
                Atelier nominal :
              </span>
              <span className="text-ink-soft hidden sm:inline">
                Aucun arbitrage de permission en attente, tous les postes fonctionnent normalement.
              </span>
            </div>
            <span className="text-[11px] font-mono text-ink-faint">
              Contrôle continu actif
            </span>
          </div>
        )}
      </section>

      {/* =========================================================================
          SECTIONS DE SUPERVISION : Mobile-First Adaptatif vs Bento Grid Desktop
          ========================================================================= */}

      {/* 1. Mode Smartphone (< 768px) : Pilotage Mobile-First 100% Fluide sans aucun carrousel bloquant */}
      <section className="block md:hidden space-y-3.5">
        {renderProjectsCard('w-full')}

        {/* Sélecteur Tactile Ergonomique 2x2 (Accès direct à chaque domaine clé en un tap) */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMobileTab('presence')}
            className={cx(
              "flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all cursor-pointer shadow-xs active:scale-[0.98]",
              mobileTab === 'presence'
                ? "bg-surface border-amber ring-1 ring-amber/30 text-ink"
                : "bg-surface-2/50 border-line text-ink-soft hover:text-ink"
            )}
          >
            <span className={cx("p-1.5 rounded-lg shrink-0", mobileTab === 'presence' ? "bg-amber-wash text-amber" : "bg-paper text-ink-faint")}>
              <Users size={15} />
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="text-xs font-bold truncate">Présences</p>
              <p className="text-[10px] text-ink-faint font-medium truncate">
                {das04 ? `${das04.present}/${totalTeam} présents` : 'Suivi équipe'}
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setMobileTab('alerts')}
            className={cx(
              "flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all cursor-pointer shadow-xs active:scale-[0.98]",
              mobileTab === 'alerts'
                ? "bg-surface border-amber ring-1 ring-amber/30 text-ink"
                : "bg-surface-2/50 border-line text-ink-soft hover:text-ink"
            )}
          >
            <span className={cx(
              "p-1.5 rounded-lg shrink-0",
              mobileTab === 'alerts'
                ? "bg-amber-wash text-amber"
                : (alertTotal > 0 ? "bg-amber-500/15 text-amber" : "bg-paper text-ink-faint")
            )}>
              <AlertTriangle size={15} />
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="text-xs font-bold truncate">Alertes</p>
              <p className={cx("text-[10px] font-medium truncate", alertTotal > 0 ? "text-amber font-semibold" : "text-ink-faint")}>
                {alertTotal > 0 ? `${alertTotal} à traiter` : 'Nominal'}
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setMobileTab('tools')}
            className={cx(
              "flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all cursor-pointer shadow-xs active:scale-[0.98]",
              mobileTab === 'tools'
                ? "bg-surface border-amber ring-1 ring-amber/30 text-ink"
                : "bg-surface-2/50 border-line text-ink-soft hover:text-ink"
            )}
          >
            <span className={cx("p-1.5 rounded-lg shrink-0", mobileTab === 'tools' ? "bg-amber-wash text-amber" : "bg-paper text-ink-faint")}>
              <Wrench size={15} />
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="text-xs font-bold truncate">Outillage</p>
              <p className="text-[10px] text-ink-faint font-medium truncate">
                {das01.total} au parc
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setMobileTab('activity')}
            className={cx(
              "flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all cursor-pointer shadow-xs active:scale-[0.98]",
              mobileTab === 'activity'
                ? "bg-surface border-amber ring-1 ring-amber/30 text-ink"
                : "bg-surface-2/50 border-line text-ink-soft hover:text-ink"
            )}
          >
            <span className={cx("p-1.5 rounded-lg shrink-0", mobileTab === 'activity' ? "bg-amber-wash text-amber" : "bg-paper text-ink-faint")}>
              <ArrowUpRight size={15} />
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="text-xs font-bold truncate">Activité</p>
              <p className="text-[10px] text-ink-faint font-medium truncate">
                {das03.entries + das03.exits + das03.returns} flux jour
              </p>
            </div>
          </button>
        </div>

        {/* Bouton de bascule rapide : Vue Ciblée vs Vue Complète Empilée */}
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] text-ink-faint font-medium">
            {mobileTab === 'all'
              ? 'Vue complète (4 cartes empilées)'
              : `Affichage sélectionné : ${
                  mobileTab === 'presence'
                    ? 'Présences'
                    : mobileTab === 'alerts'
                    ? 'Alertes'
                    : mobileTab === 'tools'
                    ? 'Outillage'
                    : 'Activité'
                }`}
          </span>
          <button
            type="button"
            onClick={() => setMobileTab((curr) => curr === 'all' ? 'presence' : 'all')}
            className="text-xs font-bold text-amber hover:underline cursor-pointer"
          >
            {mobileTab === 'all' ? 'Mode onglet ciblé' : 'Tout afficher empilé ↓'}
          </button>
        </div>

        {/* Affichage des Cartes : 100% pleine largeur, zéro contrainte de scroll horizontal */}
        <div className="space-y-4">
          {(mobileTab === 'presence' || mobileTab === 'all') && (
            das04?.detail ? (
              <WhosInWidget
                details={das04.detail}
                className="w-full"
                onOpenPointage={() => setDrawer({ kind: 'attendance' })}
              />
            ) : null
          )}

          {(mobileTab === 'alerts' || mobileTab === 'all') && (
            renderAlertsCard("w-full")
          )}

          {(mobileTab === 'tools' || mobileTab === 'all') && (
            renderToolsCard("w-full")
          )}

          {(mobileTab === 'activity' || mobileTab === 'all') && (
            renderActivityCard("w-full")
          )}
        </div>
      </section>

      {/* 2. Mode Tablette, Laptop & Desktop (>= 768px) : Grille Bento Studio Apple/Google Parfaitement Équilibrée */}
      <section className="hidden md:flex md:flex-col gap-6">
        {renderProjectsCard('w-full')}

        {/* Rangée 1 : Présences Collaborateurs (Humain) & Alertes Opérationnelles (Vigilance) */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
          <div className="md:col-span-7 flex flex-col">
            {das04?.detail ? (
              <WhosInWidget
                details={das04.detail}
                className="h-full"
                onOpenPointage={() => setDrawer({ kind: 'attendance' })}
              />
            ) : null}
          </div>
          <div className="md:col-span-5 flex flex-col">
            {renderAlertsCard("h-full")}
          </div>
        </div>

        {/* Rangée 2 : Activité & Mouvements (Flux) & Répartition Outillage (Inventaire) */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
          <div className="md:col-span-7 flex flex-col">
            {renderActivityCard("h-full")}
          </div>
          <div className="md:col-span-5 flex flex-col">
            {renderToolsCard("h-full")}
          </div>
        </div>
      </section>

      {/* Tour de contrôle : supervision détaillée des établis & servantes */}
      {data.etablis && (
        <section id="etablis-section" className="border-t border-line pt-6 scroll-mt-20 min-h-[calc(100vh-3.5rem)] pb-32">
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
        wide={drawer?.kind === 'attendance' || drawer?.kind === 'attendanceEmployee'}
        bodyClassName={drawer?.kind === 'attendance' ? 'p-0 flex flex-col min-h-0 overflow-hidden' : undefined}
      >
        <DrawerContentDetail
          drawer={drawer}
          data={data}
          tools={tools}
          refs={refs}
          loans={loans}
          loansLoading={loansLoading}
          onOpenAttendanceEmployee={(employeeId, fullName) => setDrawer({ kind: 'attendanceEmployee', employeeId, fullName })}
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

type AttendanceEmployeeRecord = {
  employee: { id: string; full_name: string; job_title: string; photo_path: string | null };
  date: string;
  events: {
    id: string;
    punchType: 'in' | 'out' | 'break_in' | 'break_out';
    serverAt: string;
    terminalId: string;
    terminalName: string | null;
    idMode: 'manual' | 'badge';
    selfieAvailable: boolean;
    selfieUrl: string | null;
    lateMinutes: number;
    reason: string | null;
    status: string;
  }[];
};

function AttendanceEmployeeDetail({ employeeId, date }: { employeeId: string; date: string }) {
  const [record, setRecord] = useState<AttendanceEmployeeRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api<AttendanceEmployeeRecord>(`/api/attendance/employee/${encodeURIComponent(employeeId)}/${date}`, { bypassCache: true })
      .then((result) => { if (!cancelled) setRecord(result); })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Impossible de charger le pointage.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [employeeId, date]);

  if (loading) return <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-soft"><Spinner /> Chargement du pointage…</div>;
  if (error) return <Banner tone="error">{error}</Banner>;
  if (!record) return <EmptyState title="Pointage introuvable" />;

  const arrival = record.events.find((event) => event.punchType === 'in');
  const typeLabel: Record<AttendanceEmployeeRecord['events'][number]['punchType'], string> = {
    in: 'Arrivée',
    out: 'Départ',
    break_in: 'Début de pause',
    break_out: 'Fin de pause',
  };
  const timeLabel = (value: string) => {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleTimeString('fr-FR', {
      timeZone: 'Africa/Douala',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-5">
      <section className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3">
        <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-paper-2 text-sm font-bold text-ink-soft">
          {record.employee.photo_path ? <img src={record.employee.photo_path} alt={`Photo de profil de ${record.employee.full_name}`} className="h-full w-full object-cover" /> : initials(record.employee.full_name)}
        </div>
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-ink">{record.employee.full_name}</h3>
          <p className="truncate text-sm text-ink-soft">{record.employee.job_title}</p>
          <p className="text-xs text-ink-faint">{record.employee.id} · {formatDate(record.date)}</p>
        </div>
      </section>

      {arrival && arrival.lateMinutes > 0 && (
        <section className="rounded-xl border border-amber/40 bg-amber-wash/40 p-3.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber">
              <AlertTriangle size={14} />
              Retard constaté · {arrival.lateMinutes} min
            </span>
            <span className="font-mono text-xs font-semibold text-ink-soft">
              Pointé à {timeLabel(arrival.serverAt)}
            </span>
          </div>
          <div className="text-sm text-ink">
            <span className="font-semibold text-ink-soft">Motif déclaré : </span>
            <span className="font-medium text-amber-soft">
              {arrival.reason ? `« ${arrival.reason} »` : 'Aucun motif renseigné par le travailleur.'}
            </span>
          </div>
        </section>
      )}

      {arrival?.selfieUrl ? (
        <section className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="border-b border-line px-3 py-2.5">
            <h3 className="text-sm font-semibold text-ink">Selfie de l’arrivée</h3>
            <p className="text-xs text-ink-soft">Preuve photo enregistrée à {timeLabel(arrival.serverAt)}</p>
          </div>
          <div className="bg-black/5 p-2">
            <img
              src={arrival.selfieUrl}
              alt={`Selfie de pointage de ${record.employee.full_name} à ${timeLabel(arrival.serverAt)}`}
              className="mx-auto max-h-[55vh] w-full rounded-lg object-contain"
              onError={(event) => {
                (event.currentTarget as HTMLImageElement).style.display = 'none';
                const fallback = event.currentTarget.parentElement?.querySelector('[data-selfie-fallback]');
                fallback?.classList.remove('hidden');
              }}
            />
            <p data-selfie-fallback className="hidden py-8 text-center text-sm text-ink-soft" role="status">
              La preuve photo est référencée, mais le fichier n’est pas disponible sur le serveur. Signalez cette anomalie à l’administrateur.
            </p>
          </div>
        </section>
      ) : (
        <Banner tone="error" title="Selfie d’arrivée indisponible">
          Aucun selfie n’est associé à ce pointage. La borne doit enregistrer la photo avec l’événement d’arrivée.
        </Banner>
      )}

      <section>
        <h3 className="mb-2 text-sm font-semibold text-ink">Événements du jour</h3>
        {record.events.length === 0 ? (
          <EmptyState title="Aucun pointage enregistré ce jour-là" />
        ) : (
          <ol className="divide-y divide-line rounded-xl border border-line bg-surface">
            {record.events.map((event) => (
              <li key={event.id} className="flex items-start justify-between gap-3 px-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{typeLabel[event.punchType]}</p>
                  <p className="mt-0.5 text-xs text-ink-soft">
                    {event.terminalName ?? event.terminalId} · {event.idMode === 'badge' ? 'Badge' : 'Saisie manuelle'}
                  </p>
                  {event.reason && (
                    <div className="mt-1.5 rounded-lg border border-amber/30 bg-amber-wash/30 px-2.5 py-1 text-xs text-amber-soft font-medium">
                      <span className="font-bold text-amber">Motif déclaré :</span> {event.reason}
                    </div>
                  )}
                  {event.selfieUrl && event.punchType !== 'in' && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs font-medium text-amber">Voir la photo de {typeLabel[event.punchType].toLowerCase()}</summary>
                      <img src={event.selfieUrl} alt={`Selfie ${typeLabel[event.punchType].toLowerCase()} de ${record.employee.full_name}`} className="mt-2 max-h-64 rounded-lg object-contain" />
                    </details>
                  )}
                </div>
                <time className="shrink-0 font-mono text-sm font-semibold tabular-nums text-ink">{timeLabel(event.serverAt)}</time>
              </li>
            ))}
          </ol>
        )}
      </section>
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
    case 'attendanceEmployee':
      return drawer.fullName;
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
  if (drawer.kind === 'attendanceEmployee') return `Fiche de pointage · ${formatDate(data.date)}`;
  return formatDate(data.generatedAt);
}

function DrawerContentDetail({
  drawer,
  data,
  tools,
  refs: _refs,
  loans: _loans,
  loansLoading: _loansLoading,
  onOpenAttendanceEmployee,
}: {
  drawer: DrawerKind | null;
  data: DashboardType;
  tools: Tool[] | null;
  refs: StockRef[] | null;
  loans: { id: number; tool_id: string; tool_name: string; employee_name: string; out_at: string }[];
  loansLoading: boolean;
  onOpenAttendanceEmployee?: (employeeId: string, fullName: string) => void;
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
            <div className="min-w-0 flex-1">
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
      <div className="relative overflow-auto flex-1 h-full scroll-thin bg-surface">
        <table className="w-full text-left table-rhythm border-separate border-spacing-0">
          <thead className="sticky top-0 z-30 bg-surface-2 text-[11px] uppercase font-bold text-ink-faint shadow-xs">
            <tr>
              <th className="sticky top-0 z-30 bg-surface-2 px-3.5 py-3 border-b border-line text-ink-faint">Travailleur</th>
              <th className="sticky top-0 z-30 bg-surface-2 px-2 py-3 text-center w-20 border-b border-line text-ink-faint">Arrivée</th>
              <th className="sticky top-0 z-30 bg-surface-2 px-2 py-3 text-center w-24 border-b border-line text-ink-faint">Départ</th>
              <th className="sticky top-0 z-30 bg-surface-2 px-3.5 py-3 text-right w-28 whitespace-nowrap border-b border-line text-ink-faint">Statut</th>
            </tr>
          </thead>
          <tbody className="text-xs">
            {data.das04.detail.map((row, idx) => {
              const isLate = row.status === 'late';
              const isAbsent = row.status === 'absent';
              const isConge = row.status === 'conge';
              const isPermission = row.status === 'permission';
              const isAbsentOrConge = isAbsent || isConge || isPermission || !row.inAt;
              const tone = isLate ? 'amber' : isAbsent ? 'grey' : isConge || isPermission ? 'blue' : 'green';
              const label = isLate
                ? `Retard ${row.lateMinutes}m`
                : isAbsent
                  ? 'Absent'
                  : isConge
                    ? 'Congé'
                    : isPermission
                      ? 'Permission'
                      : 'Présent';

              return (
                <tr
                  key={row.id}
                  className={cx(
                    'transition-colors',
                    idx % 2 === 0 ? 'bg-surface/95' : 'bg-surface-2/45',
                    row.inAt ? 'hover:bg-amber-wash/20' : '',
                  )}
                >
                  <td className="px-3.5 py-2.5 font-medium text-ink col-lead border-b border-line">
                    <button
                      type="button"
                      onClick={() => onOpenAttendanceEmployee?.(row.id, row.fullName)}
                      className="min-h-10 py-1 rounded-md text-left font-semibold text-ink underline-offset-2 hover:text-amber hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber group block"
                      aria-label={`Voir le pointage et le selfie de ${row.fullName}`}
                    >
                      <span className="group-hover:text-amber transition-colors font-semibold">{row.fullName}</span>
                      {isLate && (
                        <span className="block mt-0.5 text-[11px] font-normal text-amber-soft">
                          <span className="font-semibold text-amber">Motif :</span> {row.lateReason ? `« ${row.lateReason} »` : 'Non renseigné'}
                        </span>
                      )}
                    </button>
                  </td>
                  <td className="px-2 py-2.5 text-center font-mono tabular-nums text-xs border-b border-line">{row.inAt ?? '—'}</td>
                  <td className="px-2 py-2.5 text-center font-mono tabular-nums text-xs border-b border-line">
                    {row.outAt ? (
                      row.outAt
                    ) : row.inAt && !isAbsentOrConge ? (
                      <span className="inline-flex items-center gap-1 font-medium text-green">
                        <span className="h-1.5 w-1.5 rounded-full bg-green animate-pulse" />
                        En poste
                      </span>
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
                  </td>
                  <td className="px-3.5 py-2.5 text-right whitespace-nowrap border-b border-line">
                    <button
                      type="button"
                      onClick={() => onOpenAttendanceEmployee?.(row.id, row.fullName)}
                      className="inline-block transition-transform active:scale-95 focus-visible:outline-none"
                    >
                      <Chip tone={tone}>{label}</Chip>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  if (drawer.kind === 'attendanceEmployee') {
    return <AttendanceEmployeeDetail employeeId={drawer.employeeId} date={data.date} />;
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
              <div className="min-w-0 flex-1">
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
              <div className="min-w-0 flex-1">
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
