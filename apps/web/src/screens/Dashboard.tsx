import { useCallback, useEffect, useState } from 'react';
import { api, type Dashboard, type StockRef, type Tool } from '../lib/api';
import {
  MOVE_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  formatDate,
  formatDateTime,
  formatTime,
  todayLabel,
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
import { IconAlert, IconArrowIn, IconArrowOut, IconBox, IconClock, IconGauge, IconRefresh, IconWrench } from '../components/Icons';
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
  disponible: 'var(--color-green)',
  en_pret: 'var(--color-blue)',
  maintenance: 'var(--color-amber)',
  manquant: 'var(--color-red)',
  reforme: 'var(--color-ink-soft)',
};

const TOOLTIP_STYLE: React.CSSProperties = {
  border: '1px solid var(--color-line)',
  borderRadius: 8,
  boxShadow: '0 8px 24px rgb(20 21 25 / 0.12)',
  background: 'var(--color-surface)',
  fontSize: 12,
  color: 'var(--color-ink)',
  padding: '6px 10px',
};

function ToolsDonut({
  das01,
  onPick,
}: {
  das01: Dashboard['das01'];
  onPick: (status: ToolStatusKey) => void;
}) {
  const data = STATUS_ORDER.filter((status) => das01[status] > 0).map((status) => ({
    status,
    name: STATUS_LABEL[status],
    value: das01[status],
  }));
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row">
      <div className="relative h-[180px] w-[180px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={58}
              outerRadius={84}
              paddingAngle={2}
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
            <Tooltip cursor={false} contentStyle={TOOLTIP_STYLE} formatter={(value) => [String(value), 'Outils']} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="text-center">
            <p className="num font-mono text-[22px] font-semibold leading-none text-ink">{das01.total}</p>
            <p className="mt-1 text-[11px] uppercase tracking-wide text-ink-faint">outils</p>
          </div>
        </div>
      </div>
      <div className="grid w-full gap-2">
        {STATUS_ORDER.map((status) => (
          <button
            key={status}
            onClick={() => onPick(status)}
            className="flex items-center justify-between rounded-btn border border-line bg-surface-2 px-3 py-2 hover:border-amber"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: STATUS_COLOR[status] }} />
              <span className="truncate text-sm text-ink">{STATUS_LABEL[status]}</span>
            </span>
            <span className="num font-mono text-sm font-semibold text-ink">{das01[status]}</span>
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
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: React.ReactNode;
  onClick?: () => void;
  tone?: 'default' | 'warn' | 'alert';
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'group rounded-card border bg-surface p-4 text-left shadow-card transition-all duration-[160ms] ease-[cubic-bezier(0.16,1,0.3,1)]',
        tone === 'alert' ? 'border-red/30' : tone === 'warn' ? 'border-amber/40' : 'border-line',
        onClick ? 'hover:-translate-y-[1px] hover:border-amber hover:shadow-card-hover' : 'cursor-default',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-[12px] font-medium uppercase tracking-wide text-ink-faint">{label}</span>
        <span className="text-ink-faint group-hover:text-amber">{icon}</span>
      </div>
      <p className="mt-2 font-mono text-[28px] font-semibold leading-none text-ink num">{value}</p>
      {hint ? <p className="mt-2 text-[13px] text-ink-soft">{hint}</p> : null}
    </button>
  );
}

export function Dashboard() {
  const [data, setData] = useState<Dashboard | null>(null);
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
    setLoading(true);
    api<Dashboard>('/api/dashboard')
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Chargement impossible.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

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
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-ink-soft">
        <Spinner /> Chargement du tableau de bord…
      </div>
    );
  }

  if (!data) {
    return <EmptyState title="Tableau de bord indisponible" hint={error ?? undefined} />;
  }

  const { das01, das02, das03, das04, das05, lastMovements } = data;
  const attendanceHidden = !das04;
  const dailyMoves = [
    { name: 'Entrées', value: das03.entries, color: 'var(--color-green)' },
    { name: 'Sorties', value: das03.exits, color: 'var(--color-amber)' },
    { name: 'Retours', value: das03.returns, color: 'var(--color-blue)' },
  ];

  return (
    <>
      <PageHeader
        title="Tableau de bord"
        hint={todayLabel()}
        actions={
          <Button icon={<IconRefresh size={18} />} onClick={() => setReload((value) => value + 1)}>
            Actualiser
          </Button>
        }
      />

      {error ? (
        <div className="mb-4">
          <Banner tone="error">{error}</Banner>
        </div>
      ) : null}

      <section className="rise grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Outils"
          value={das01.total}
          hint={`${das01.disponible} disponibles · ${das01.en_pret} en prêt`}
          icon={<IconWrench size={18} />}
          onClick={() => openTools('disponible', 'Outils disponibles')}
        />
        <KpiCard
          label="Stocks"
          value={das02.refs}
          hint={`${das02.low} sous le seuil · ${das02.empty} épuisées`}
          icon={<IconBox size={18} />}
          tone={das02.low + das02.empty > 0 ? 'warn' : 'default'}
          onClick={() => setDrawer({ kind: 'stock' })}
        />
        <KpiCard
          label="Mouvements du jour"
          value={das03.exits + das03.entries + das03.returns}
          hint={`${das03.exits} sorties · ${das03.entries} entrées · ${das03.returns} retours`}
          icon={<IconArrowOut size={18} />}
          onClick={() => setDrawer({ kind: 'movements' })}
        />
        {das04 ? (
          <KpiCard
            label="Présences du jour"
            value={das04.present}
            hint={`${das04.absent} absents · ${das04.late} retards · ${das04.conge} congés/absences déclarés`}
            icon={<IconClock size={18} />}
            tone={das04.late > 0 ? 'warn' : 'default'}
            onClick={() => setDrawer({ kind: 'attendance' })}
          />
        ) : (
          <KpiCard
            label="Présences du jour"
            value="—"
            hint="Réservé à la direction (CDC, section 3)"
            icon={<IconClock size={18} />}
          />
        )}
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">Répartition des outils (DAS-01)</h2>
              <p className="text-[12px] text-ink-faint">Chaque indicateur ouvre le détail</p>
            </div>
            <ToolsDonut das01={das01} onPick={(status) => openTools(status, `Outils — ${STATUS_LABEL[status]}`)} />
          </Card>

          <div className="rise" style={{ animationDelay: '80ms' }}>
            <Card className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-ink">Alertes (DAS-05)</h2>
                <IconAlert size={16} className="text-ink-faint" />
              </div>
              <ul className="divide-y divide-line rounded-btn border border-line">
                {[
                  {
                    label: 'Prêts en retard de retour',
                    count: das05.overdueLoans,
                    open: () => setDrawer({ kind: 'overdue' }),
                  },
                  {
                    label: 'Références sous le seuil minimum',
                    count: das05.lowStock,
                    open: () => setDrawer({ kind: 'stock' }),
                  },
                  {
                    label: 'Outils manquants',
                    count: das05.missingTools,
                    open: () => setDrawer({ kind: 'missingTools' }),
                  },
                  {
                    label: 'Départs non pointés',
                    count: das05.missingOut,
                    open: () => setDrawer({ kind: 'missingOut' }),
                  },
                ].map((alert) => (
                  <li key={alert.label}>
                    <button
                      onClick={alert.open}
                      className="flex w-full items-center justify-between gap-3 bg-surface px-3 py-2.5 text-left hover:bg-surface-2"
                    >
                      <span className="flex items-center gap-2 text-sm text-ink">
                        <span className={cx('text-ink-faint', alert.count > 0 && 'text-amber')}>
                          <IconAlert size={16} />
                        </span>
                        {alert.label}
                      </span>
                      <span
                        className={cx(
                          'num font-mono text-sm font-semibold',
                          alert.count > 0 ? 'text-amber' : 'text-ink-faint',
                        )}
                      >
                        {alert.count}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="rise" style={{ animationDelay: '50ms' }}>
            <Card className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-ink">Derniers mouvements de stock</h2>
                <IconGauge size={16} className="text-ink-faint" />
              </div>
              {lastMovements.length === 0 ? (
                <p className="text-sm text-ink-soft">Aucun mouvement enregistré.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {lastMovements.map((move, index) => (
                    <li key={`${move.id ?? index}-${move.created_at}`} className="flex items-start gap-3 py-2.5">
                      <span
                        className={cx(
                          'mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-chip',
                          move.move_type === 'in' ? 'bg-green-wash text-green' : 'bg-amber-wash text-amber',
                        )}
                      >
                        {move.move_type === 'in' ? <IconArrowIn size={15} /> : <IconArrowOut size={15} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{move.ref_name}</p>
                        <p className="text-[12px] text-ink-soft">
                          {MOVE_LABEL[move.move_type]} · {move.beneficiary ?? '—'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="num font-mono text-sm font-semibold">
                          {move.move_type === 'in' ? '+' : '−'}
                          {move.qty} {move.unit}
                        </p>
                        <p className="num font-mono text-[11px] text-ink-faint">{formatTime(move.created_at)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="rise" style={{ animationDelay: '110ms' }}>
            <Card className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-ink">Mouvements du jour</h2>
                <p className="text-[12px] text-ink-faint">Entrées · sorties · retours</p>
              </div>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyMoves} margin={{ top: 8, right: 4, bottom: 0, left: -18 }}>
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      interval={0}
                      tick={{ fontSize: 11, fill: 'var(--color-ink-faint)' }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: 'var(--color-ink-faint)' }}
                    />
                    <Tooltip
                      cursor={{ fill: 'var(--color-surface-2)' }}
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(value) => [String(value), 'Mouvements']}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={56} isAnimationActive={false}>
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
              <button
                onClick={() => setDrawer({ kind: 'movements' })}
                className="mt-3 flex w-full items-center justify-between rounded-btn border border-line bg-surface-2 px-3 py-2 text-left text-sm text-ink hover:border-amber"
              >
                <span>Voir le détail des mouvements</span>
                <span className="num font-mono text-sm font-semibold">
                  {das03.exits + das03.entries + das03.returns}
                </span>
              </button>
            </Card>
          </div>
        </div>
      </section>

      {attendanceHidden ? (
        <div className="mt-4">
          <Banner tone="info" title="Présences non visibles avec ce profil">
            Le détail des arrivées, des selfies et des retards est réservé à la direction (PRS-03).
          </Banner>
        </div>
      ) : null}

      <Drawer
        open={!!drawer}
        onClose={() => setDrawer(null)}
        title={drawerTitle(drawer)}
        subtitle={drawerSubtitle(drawer, data)}
        wide
      >
        <DrawerContent drawer={drawer} data={data} tools={tools} refs={refs} loans={loans} loansLoading={loansLoading} />
      </Drawer>
    </>
  );
}

function drawerTitle(drawer: DrawerKind | null): string {
  if (!drawer) return '';
  switch (drawer.kind) {
    case 'tools':
      return drawer.title;
    case 'stock':
      return 'Références de quincaillerie';
    case 'movements':
      return 'Mouvements du jour';
    case 'attendance':
      return 'Présences du jour';
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

function drawerSubtitle(drawer: DrawerKind | null, data: Dashboard): string | undefined {
  if (!drawer) return undefined;
  if (drawer.kind === 'stock') return `${data.das02.refs} références suivies`;
  if (drawer.kind === 'attendance') return 'Arrivées et départs relevés par le serveur';
  return formatDate(data.generatedAt);
}

function DrawerContent({
  drawer,
  data,
  tools,
  refs,
  loans,
  loansLoading,
}: {
  drawer: DrawerKind | null;
  data: Dashboard;
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
      <ul className="divide-y divide-line rounded-btn border border-line">
        {tools.map((tool) => (
          <li key={tool.id} className="flex items-center justify-between gap-3 bg-surface px-3 py-2.5">
            <div className="min-w-0">
              <p className="font-mono text-[12px] text-ink-faint">{tool.id}</p>
              <p className="truncate text-sm font-medium text-ink">{tool.name}</p>
            </div>
            <Chip tone={STATUS_TONE[tool.status]}>{STATUS_LABEL[tool.status]}</Chip>
          </li>
        ))}
      </ul>
    );
  }

  if (drawer.kind === 'stock') {
    if (!refs) {
      return (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-soft">
          <Spinner /> Chargement…
        </div>
      );
    }
    if (refs.length === 0) return <EmptyState title="Aucune référence enregistrée" />;
    return (
      <div className="space-y-2">
        {refs.map((ref) => {
          const low = ref.qty > 0 && ref.qty <= ref.min_qty;
          const empty = ref.qty <= 0;
          return (
            <Card key={ref.id} className="p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{ref.name}</p>
                  <p className="text-[12px] text-ink-faint">
                    {ref.category} · {ref.location}
                    {ref.supplier ? ` · ${ref.supplier}` : ''}
                  </p>
                </div>
                <Chip tone={empty ? 'red' : low ? 'amber' : 'green'}>
                  {empty ? 'Épuisée' : low ? 'Sous le seuil' : 'Stock correct'}
                </Chip>
              </div>
              <div className="mt-2">
                <Row
                  label="Quantité théorique"
                  value={`${ref.qty} ${ref.unit} (seuil ${ref.min_qty})`}
                  mono
                />
              </div>
            </Card>
          );
        })}
      </div>
    );
  }

  if (drawer.kind === 'movements') {
    if (data.lastMovements.length === 0) return <EmptyState title="Aucun mouvement aujourd’hui" />;
    return (
      <ul className="divide-y divide-line rounded-btn border border-line">
        {data.lastMovements.map((move, index) => (
          <li key={`${move.id ?? index}`} className="bg-surface px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-ink">{move.ref_name}</p>
              <p className="font-mono text-sm num">
                {move.move_type === 'in' ? '+' : '−'}
                {move.qty} {move.unit}
              </p>
            </div>
            <p className="text-[12px] text-ink-soft">
              {MOVE_LABEL[move.move_type]} · {move.beneficiary ?? '—'} · {formatDateTime(move.created_at)}
            </p>
          </li>
        ))}
      </ul>
    );
  }

  if (drawer.kind === 'attendance' && data.das04) {
    if (data.das04.detail.length === 0) return <EmptyState title="Aucun employé actif" />;
    return (
      <div className="overflow-hidden rounded-btn border border-line">
        <table className="w-full text-left">
          <thead className="border-b border-line bg-surface-2 text-[12px] uppercase tracking-wide text-ink-faint">
            <tr>
              <th className="px-3 py-2 font-medium">Employé</th>
              <th className="px-3 py-2 font-medium">Arrivée</th>
              <th className="px-3 py-2 font-medium">Départ</th>
              <th className="px-3 py-2 font-medium">Statut</th>
            </tr>
          </thead>
          <tbody>
            {data.das04.detail.map((row) => (
              <tr key={row.id} className="border-b border-line bg-surface last:border-b-0">
                <td className="px-3 py-2.5">
                  <p className="text-sm font-medium text-ink">{row.fullName}</p>
                  <p className="text-[12px] text-ink-faint">{row.jobTitle}</p>
                </td>
                <td className="px-3 py-2.5 font-mono text-sm num">{row.inAt ?? '—'}</td>
                <td className="px-3 py-2.5 font-mono text-sm num">
                  {row.outAt ?? <span className="text-amber">non pointé</span>}
                </td>
                <td className="px-3 py-2.5">
                  <Chip
                    tone={
                      row.status === 'late' ? 'amber' : row.status === 'absent' ? 'grey' : 'green'
                    }
                  >
                    {row.status === 'late' ? `Retard ${row.lateMinutes} min` : row.status === 'absent' ? 'Absent' : 'Présent'}
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
    if (loansLoading) {
      return (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-soft">
          <Spinner /> Chargement…
        </div>
      );
    }
    if (loans.length === 0) return <EmptyState title="Aucun prêt en cours" hint="Tous les outils sortis ont été rendus." />;
    return (
      <ul className="divide-y divide-line rounded-btn border border-line">
        {loans.map((loan) => (
          <li key={loan.id} className="bg-surface px-3 py-2.5">
            <p className="text-sm font-medium text-ink">{loan.tool_name}</p>
            <p className="text-[12px] text-ink-soft">
              {loan.tool_id} · {loan.employee_name} · sorti le {formatDate(loan.out_at)}
            </p>
          </li>
        ))}
      </ul>
    );
  }

  if (drawer.kind === 'missingTools') {
    const items = data.das05.details.missingTools;
    if (items.length === 0) return <EmptyState title="Aucun outil déclaré manquant" />;
    return (
      <ul className="divide-y divide-line rounded-btn border border-line">
        {items.map((tool) => (
          <li key={tool.id} className="bg-surface px-3 py-2.5">
            <p className="font-mono text-[12px] text-ink-faint">{tool.id}</p>
            <p className="text-sm font-medium text-ink">{tool.name}</p>
            <p className="text-[12px] text-ink-soft">
              {tool.category} · {tool.location}
            </p>
          </li>
        ))}
      </ul>
    );
  }

  if (drawer.kind === 'missingOut') {
    const items = data.das05.details.missingOut;
    if (items.length === 0) return <EmptyState title="Tous les départs sont pointés" />;
    return (
      <ul className="divide-y divide-line rounded-btn border border-line">
        {items.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-3 bg-surface px-3 py-2.5">
            <p className="text-sm font-medium text-ink">{row.full_name}</p>
            <p className="font-mono text-sm num">arrivé à {row.in_at ?? '—'}</p>
          </li>
        ))}
      </ul>
    );
  }

  if (drawer.kind === 'absent') {
    const items = data.das05.details.absent;
    if (items.length === 0) return <EmptyState title="Aucune absence non justifiée" />;
    return (
      <ul className="divide-y divide-line rounded-btn border border-line">
        {items.map((row) => (
          <li key={row.id} className="bg-surface px-3 py-2.5">
            <p className="text-sm font-medium text-ink">{row.fullName}</p>
            <p className="text-[12px] text-ink-faint">{row.jobTitle}</p>
          </li>
        ))}
      </ul>
    );
  }

  if (drawer.kind === 'conge') {
    const items = data.das05.details.conge;
    if (items.length === 0) return <EmptyState title="Aucun congé déclaré aujourd’hui" />;
    return (
      <ul className="divide-y divide-line rounded-btn border border-line">
        {items.map((row) => (
          <li key={row.id} className="bg-surface px-3 py-2.5 text-sm font-medium text-ink">
            {row.fullName}
          </li>
        ))}
      </ul>
    );
  }

  return null;
}
