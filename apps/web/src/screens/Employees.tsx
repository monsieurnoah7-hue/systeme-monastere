import { useEffect, useMemo, useState } from 'react';
import { api, type Employee, type EmployeeDetail, type Leave, type ScanResult, type TodayEmployee, type User } from '../lib/api';
import { QR_PREFIX } from '../lib/qr';
import { usePrintSheet } from '../lib/print';
import { formatDate, initials } from '../lib/labels';
import {
  Banner,
  Button,
  Card,
  Chip,
  Drawer,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  SelectField,
  Skeleton,
  Spinner,
  TextArea,
  cx,
  useToast,
} from '../components/ui';
import { QrCode } from '../components/QrCode';
import { DataTable, type DataTableColumn } from '../components/DataTable';
import { IconPlus, IconPrinter, IconRefresh, IconSearch } from '../components/Icons';

const STATUS_FILTERS = [
  { value: 'all', label: 'Tous' },
  { value: 'present', label: 'Présents' },
  { value: 'late', label: 'Retards' },
  { value: 'absent', label: 'Absents' },
  { value: 'conge', label: 'Congés' },
  { value: 'permission', label: 'Permissions' },
] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number]['value'];

const STATUS_CHIP: Record<string, { tone: 'green' | 'amber' | 'red' | 'blue' | 'neutral'; label: string }> = {
  present: { tone: 'green', label: 'Présent' },
  late: { tone: 'amber', label: 'Retard' },
  absent: { tone: 'red', label: 'Absent' },
  conge: { tone: 'blue', label: 'Congé' },
  permission: { tone: 'blue', label: 'Permission' },
};

export function Employees({ user, scan }: { user: User; scan?: ScanResult | null }) {
  const toast = useToast();
  const canManage = user.role === 'direction';

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [todayStatus, setTodayStatus] = useState<TodayEmployee[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [q, setQ] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ employee_id: '', kind: 'conge' as 'conge' | 'permission' | 'absence', from_date: '', to_date: '', note: '' });
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState({ full_name: '', job_title: '' });
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [badgeFor, setBadgeFor] = useState<Employee | null>(null);
  const [detailFor, setDetailFor] = useState<Employee | null>(null);
  const [detail, setDetail] = useState<EmployeeDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const { print, portal } = usePrintSheet();

  useEffect(() => {
    if (scan?.kind === 'employee') {
      setDetailFor(scan.employee as Employee);
    }
  }, [scan]);

  useEffect(() => {
    if (!detailFor) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    api<EmployeeDetail>(`/api/employees/${detailFor.id}/detail`)
      .then((res) => {
        if (!cancelled) setDetail(res);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [detailFor]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api<{ employees: Employee[] }>('/api/employees'),
      api<{ employees: TodayEmployee[] }>('/api/employees/today-status').catch(() => ({ employees: [] })),
      api<{ leaves: Leave[] }>('/api/leaves?status=pending').catch(() => ({ leaves: [] })),
    ])
      .then(([empRes, statusRes, leaveRes]) => {
        if (!cancelled) {
          setEmployees(empRes.employees);
          setTodayStatus(statusRes.employees);
          setLeaves(leaveRes.leaves);
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

  const statusMap = useMemo(() => {
    const m = new Map<string, TodayEmployee>();
    for (const s of todayStatus) m.set(s.id, s);
    return m;
  }, [todayStatus]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: employees.length, present: 0, late: 0, absent: 0, conge: 0, permission: 0 };
    for (const s of todayStatus) {
      if (s.status in c) c[s.status] = (c[s.status] ?? 0) + 1;
    }
    return c;
  }, [todayStatus, employees.length]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return employees.filter((employee) => {
      if (!showInactive && !employee.active) return false;
      if (statusFilter !== 'all') {
        const s = statusMap.get(employee.id);
        if (!s || s.status !== statusFilter) return false;
      }
      if (!needle) return true;
      return (
        employee.full_name.toLowerCase().includes(needle) ||
        employee.job_title.toLowerCase().includes(needle) ||
        employee.id.toLowerCase().includes(needle)
      );
    });
  }, [employees, q, showInactive, statusFilter, statusMap]);

  function dayChip(employee: Employee) {
    const s = statusMap.get(employee.id);
    if (!s) return <span className="text-ink-faint">—</span>;
    const chip = STATUS_CHIP[s.status];
    if (!chip) return <span className="text-ink-faint">—</span>;
    const late = s.status === 'late' && s.lateMinutes > 0 ? ` ${s.lateMinutes}′` : '';
    return (
      <Chip tone={chip.tone}>
        {chip.label}
        {late}
      </Chip>
    );
  }

  const viewColumns = useMemo<DataTableColumn<Employee>[]>(
    () => [
      {
        accessorKey: 'full_name',
        header: 'Nom',
        sortFn: 'alphanumeric',
        meta: { cellClassName: 'whitespace-normal min-w-40' },
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-ink">{row.original.full_name}</p>
            <p className="text-xs text-ink-faint">{row.original.id}</p>
          </div>
        ),
      },
      {
        accessorKey: 'job_title',
        header: 'Métier',
        sortFn: 'alphanumeric',
        cell: ({ row }) => <span className="text-ink-soft">{row.original.job_title}</span>,
      },
      {
        id: 'day',
        accessorKey: 'id',
        enableSorting: false,
        header: 'État du jour',
        cell: ({ row }) => dayChip(row.original),
      },
      {
        id: 'in',
        accessorKey: 'id',
        enableSorting: false,
        header: 'Arrivée',
        cell: ({ row }) => <span className="font-mono num">{statusMap.get(row.original.id)?.inAt ?? '—'}</span>,
      },
      {
        id: 'out',
        accessorKey: 'id',
        enableSorting: false,
        header: 'Départ',
        cell: ({ row }) => <span className="font-mono num">{statusMap.get(row.original.id)?.outAt ?? '—'}</span>,
      },
    ],
    [statusMap],
  );

  const employeeColumns = useMemo<DataTableColumn<Employee>[]>(
    () => [
      {
        accessorKey: 'full_name',
        header: 'Nom',
        sortFn: 'alphanumeric',
        meta: { cellClassName: 'whitespace-normal min-w-52' },
        cell: ({ row }) => {
          const employee = row.original;
          return (
            <div className="flex items-center gap-3">
              <span
                className={cx(
                  'grid h-9 w-9 shrink-0 place-items-center rounded-btn text-[13px] font-semibold',
                  employee.active ? 'bg-charcoal text-white' : 'bg-grey-wash text-ink-faint',
                )}
              >
                {initials(employee.full_name)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{employee.full_name}</p>
                <p className="truncate text-[13px] text-ink-soft">
                  {employee.job_title} · <span className="font-mono num">{employee.id}</span>
                </p>
              </div>
            </div>
          );
        },
      },
      {
        id: 'day',
        accessorKey: 'id',
        enableSorting: false,
        header: 'État du jour',
        cell: ({ row }) => dayChip(row.original),
      },
      {
        id: 'badge',
        accessorKey: 'badge_token',
        header: 'Badge',
        enableSorting: false,
        meta: { headerClassName: 'hidden sm:table-cell', cellClassName: 'hidden sm:table-cell' },
        cell: ({ row }) => <span className="font-mono text-[13px] num">{row.original.badge_token ?? '—'}</span>,
      },
      {
        id: 'active',
        accessorKey: 'active',
        header: 'Compte',
        cell: ({ row }) => <Chip tone={row.original.active ? 'green' : 'grey'}>{row.original.active ? 'Actif' : 'Inactif'}</Chip>,
      },
      {
        id: 'actions',
        enableSorting: false,
        header: '',
        meta: { cellClassName: 'whitespace-nowrap' },
        cell: ({ row }) => {
          const employee = row.original;
          return (
            <div className="flex items-center justify-end gap-1">
              <Button size="sm" variant="quiet" onClick={() => setDetailFor(employee)}>
                Fiche
              </Button>
              <Button size="sm" variant="quiet" onClick={() => openEdit(employee)}>
                Modifier
              </Button>
              <Button size="sm" variant="quiet" onClick={() => setBadgeFor(employee)}>
                Badge
              </Button>
              <Button
                size="sm"
                variant={employee.active ? 'outline-danger' : 'quiet'}
                onClick={() => void toggleActive(employee)}
              >
                {employee.active ? 'Désactiver' : 'Réactiver'}
              </Button>
            </div>
          );
        },
      },
    ],
    [canManage],
  );

  function openCreate() {
    setEditing(null);
    setForm({ full_name: '', job_title: '' });
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(employee: Employee) {
    setEditing(employee);
    setForm({ full_name: employee.full_name, job_title: employee.job_title });
    setFormError(null);
    setFormOpen(true);
  }

  async function save() {
    setBusy(true);
    setFormError(null);
    try {
      if (editing) {
        await api(`/api/employees/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(form),
        });
        toast('Fiche mise à jour.', 'success');
      } else {
        await api('/api/employees', { method: 'POST', body: JSON.stringify(form) });
        toast('Travailleur créé.', 'success');
      }
      setFormOpen(false);
      setReload((value) => value + 1);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(employee: Employee) {
    try {
      await api(`/api/employees/${employee.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !employee.active }),
      });
      toast(employee.active ? `${employee.full_name} désactivé.` : `${employee.full_name} réactivé.`, 'success');
      setReload((value) => value + 1);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Opération refusée.', 'error');
    }
  }

  async function regenBadge() {
    if (!badgeFor) return;
    setBusy(true);
    try {
      const res = await api<{ employee: Employee }>(`/api/employees/${badgeFor.id}/badge`, { method: 'POST' });
      toast(`Nouveau badge : ${res.employee.badge_token}`, 'success');
      setBadgeFor(null);
      setReload((value) => value + 1);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Opération refusée.', 'error');
    } finally {
      setBusy(false);
    }
  }

  function openLeave() {
    const todayStr = new Date().toISOString().slice(0, 10);
    setLeaveForm({ employee_id: employees[0]?.id ?? '', kind: 'conge', from_date: todayStr, to_date: todayStr, note: '' });
    setLeaveError(null);
    setLeaveOpen(true);
  }

  async function submitLeave() {
    if (!leaveForm.employee_id || !leaveForm.from_date || !leaveForm.to_date) {
      setLeaveError('Travailleur et dates obligatoires.');
      return;
    }
    setLeaveBusy(true);
    setLeaveError(null);
    try {
      await api('/api/leaves', { method: 'POST', body: JSON.stringify(leaveForm) });
      toast('Demande de congé / permission enregistrée (en attente d’approbation).', 'success');
      setLeaveOpen(false);
      setReload((v) => v + 1);
    } catch (e) {
      setLeaveError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLeaveBusy(false);
    }
  }

  async function reviewLeave(leave: Leave, status: 'approved' | 'rejected') {
    try {
      await api(`/api/leaves/${leave.id}/review`, { method: 'PATCH', body: JSON.stringify({ status }) });
      toast(status === 'approved' ? 'Demande approuvée.' : 'Demande refusée.', 'success');
      setReload((v) => v + 1);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Opération refusée.', 'error');
    }
  }

  if (!canManage) {
    return (
      <>
        <PageHeader title="Travailleurs" hint="Présences de l’équipe (lecture seule)." />
        {error ? (
          <div className="mb-4">
            <Banner tone="error">{error}</Banner>
          </div>
        ) : null}
        <Card className="mb-4 flex flex-wrap items-center gap-3 p-3">
          <div className="relative min-w-56 flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">
              <IconSearch size={16} />
            </span>
            <input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Rechercher un nom, un métier…"
              className="h-11 w-full rounded-btn border border-line-strong bg-surface pl-9 pr-3 text-sm focus:border-amber focus:outline-none"
            />
          </div>
          <p className="text-[13px] text-ink-faint">{filtered.length} fiche{filtered.length > 1 ? 's' : ''}</p>
        </Card>
        <div className="mb-4 flex flex-wrap gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={cx(
                'flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-all duration-150',
                statusFilter === f.value
                  ? 'border-charcoal bg-charcoal text-white shadow-card'
                  : 'border-line-strong bg-surface text-ink-soft hover:bg-paper-2',
              )}
            >
              {f.label}
              <span className={cx('rounded-full px-1.5 text-[11px] font-semibold num', statusFilter === f.value ? 'bg-white/20 text-white' : 'bg-paper-2 text-ink-faint')}>
                {counts[f.value] ?? 0}
              </span>
            </button>
          ))}
        </div>
        {loading ? (
          <Skeleton className="h-64 rounded-xl" />
        ) : (
          <DataTable
            data={filtered}
            columns={viewColumns}
            caption="Présences du jour"
            empty={<span className="text-sm text-ink-faint">Aucune fiche trouvée.</span>}
            renderCard={(employee) => (
              <div className="px-4 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">{employee.full_name}</p>
                    <p className="truncate text-[13px] text-ink-soft">
                      {employee.job_title} · <span className="font-mono num">{employee.id}</span>
                    </p>
                  </div>
                  {dayChip(employee)}
                </div>
                <div className="mt-2 flex gap-4 font-mono text-[13px] num text-ink-soft">
                  <span>Arr. {statusMap.get(employee.id)?.inAt ?? '—'}</span>
                  <span>Dép. {statusMap.get(employee.id)?.outAt ?? '—'}</span>
                </div>
              </div>
            )}
          />
        )}
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Travailleurs"
        hint="Fiches du personnel, badges de pointage et activation."
        actions={
          <>
            <Button icon={<IconRefresh size={18} />} onClick={() => setReload((value) => value + 1)}>
              Actualiser
            </Button>
            <Button onClick={openLeave}>Congé / Permission</Button>
            <Button variant="primary" icon={<IconPlus size={18} />} onClick={openCreate}>
              Nouveau travailleur
            </Button>
          </>
        }
      />

      {error ? (
        <div className="mb-4">
          <Banner tone="error">{error}</Banner>
        </div>
      ) : null}

      <Card className="mb-4 flex flex-wrap items-center gap-3 p-3">
        <div className="relative min-w-56 flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">
            <IconSearch size={16} />
          </span>
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Rechercher un nom, un métier, un identifiant…"
            className="h-11 w-full rounded-btn border border-line-strong bg-surface pl-9 pr-3 text-sm focus:border-amber focus:outline-none"
          />
        </div>
        <button
          onClick={() => setShowInactive((value) => !value)}
          className={cx(
            'h-11 rounded-btn border px-3 text-sm font-medium',
            showInactive ? 'border-amber bg-amber-wash text-amber' : 'border-line-strong bg-surface text-ink-soft hover:bg-surface-2',
          )}
        >
          Afficher les inactifs
        </button>
        <p className="text-[13px] text-ink-faint">{filtered.length} fiche{filtered.length > 1 ? 's' : ''}</p>
      </Card>

      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={cx(
              'flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-all duration-150',
              statusFilter === f.value
                ? 'border-charcoal bg-charcoal text-white shadow-card'
                : 'border-line-strong bg-surface text-ink-soft hover:bg-paper-2',
            )}
          >
            {f.label}
            <span className={cx('rounded-full px-1.5 text-[11px] font-semibold num', statusFilter === f.value ? 'bg-white/20 text-white' : 'bg-paper-2 text-ink-faint')}>
              {counts[f.value] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {leaves.length > 0 && (
        <Card className="mb-4 border-amber/30 bg-amber-wash/50">
          <p className="mb-2 text-sm font-semibold text-ink">Demandes en attente d’approbation ({leaves.length})</p>
          <ul className="space-y-2">
            {leaves.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{l.full_name} — {l.kind === 'conge' ? 'Congé' : l.kind === 'permission' ? 'Permission' : 'Absence'}</p>
                  <p className="text-xs text-ink-soft">{formatDate(l.from_date)} → {formatDate(l.to_date)}{l.note ? ` · ${l.note}` : ''}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="success" onClick={() => reviewLeave(l, 'approved')}>Approuver</Button>
                  <Button size="sm" variant="danger" onClick={() => reviewLeave(l, 'rejected')}>Refuser</Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {loading && employees.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-24 text-sm text-ink-soft">
          <Spinner /> Chargement…
        </div>
      ) : (
        <DataTable
          data={filtered}
          columns={employeeColumns}
          caption="Fiches du personnel — boutons d’action par ligne"
          renderCard={(employee) => (
            <div className="px-4 py-3.5">
              <div className="flex items-center gap-3">
                <span
                  className={cx(
                    'grid h-9 w-9 shrink-0 place-items-center rounded-btn text-[13px] font-semibold',
                    employee.active ? 'bg-charcoal text-white' : 'bg-grey-wash text-ink-faint',
                  )}
                >
                  {initials(employee.full_name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{employee.full_name}</p>
                  <p className="truncate text-[13px] text-ink-soft">
                    {employee.job_title} · <span className="font-mono num">{employee.id}</span>
                  </p>
                </div>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                {dayChip(employee)}
                <Chip tone={employee.active ? 'green' : 'grey'}>
                  {employee.active ? 'Actif' : 'Inactif'}
                </Chip>
                <span className="font-mono text-[13px] num text-ink-soft">
                  Badge {employee.badge_token ?? '—'}
                </span>
              </div>
              {canManage ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="quiet" onClick={() => setDetailFor(employee)}>
                    Fiche
                  </Button>
                  <Button size="sm" variant="quiet" onClick={() => openEdit(employee)}>
                    Modifier
                  </Button>
                  <Button size="sm" variant="quiet" onClick={() => setBadgeFor(employee)}>
                    Badge
                  </Button>
                  <Button
                    size="sm"
                    variant={employee.active ? 'outline-danger' : 'quiet'}
                    onClick={() => void toggleActive(employee)}
                  >
                    {employee.active ? 'Désactiver' : 'Réactiver'}
                  </Button>
                </div>
              ) : null}
            </div>
          )}
          empty={
            <EmptyState
              title="Aucun travailleur"
              hint="Créez la première fiche : l’identifiant EMP-XXX et le badge sont générés automatiquement."
              action={
                <Button variant="primary" onClick={openCreate}>
                  Nouveau travailleur
                </Button>
              }
            />
          }
        />
      )}

      <Drawer
        open={!!detailFor}
        title={detailFor?.full_name ?? ''}
        subtitle={detailFor ? `${detailFor.job_title} · ${detailFor.id}` : ''}
        onClose={() => setDetailFor(null)}
        wide
      >
        {detailLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-soft">
            <Spinner /> Chargement de la fiche…
          </div>
        ) : detail ? (
          <div className="space-y-5">
            <div className="flex items-start gap-4">
              {detail.employee.photo_path ? (
                <img src={detail.employee.photo_path} alt="" className="h-20 w-20 rounded-xl border border-line object-cover" />
              ) : (
                <span className="grid h-20 w-20 place-items-center rounded-xl bg-charcoal text-xl font-semibold text-amber">
                  {initials(detail.employee.full_name)}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Chip tone={detail.employee.active ? 'green' : 'grey'}>{detail.employee.active ? 'Actif' : 'Inactif'}</Chip>
                  {detail.employee.badge_token ? <Chip tone="blue">Badge actif</Chip> : null}
                </div>
                <p className="mt-2 text-[13px] text-ink-soft">Badge : <span className="font-mono num">{detail.employee.badge_token ?? '—'}</span></p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <StatBox label="Jours ce mois" value={String(detail.month.daysPresent)} />
              <StatBox label="Retards" value={String(detail.month.lateCount)} tone={detail.month.lateCount > 0 ? 'amber' : undefined} />
              <StatBox label="Pauses" value={String(detail.month.breaks)} />
            </div>

            {detail.openLoans.length > 0 ? (
              <section>
                <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-ink-faint">Outils détenus</h3>
                <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
                  {detail.openLoans.map((loan) => (
                    <li key={loan.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{loan.tool_name}</p>
                        <p className="text-[12px] text-ink-soft">{loan.category} · depuis le {String(loan.out_at).slice(0, 10)}</p>
                      </div>
                      <Chip tone="amber">En prêt</Chip>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section>
              <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-ink-faint">30 derniers jours</h3>
              {detail.history.length === 0 ? (
                <p className="text-sm text-ink-soft">Aucun pointage enregistré.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-line text-[12px] uppercase tracking-wide text-ink-faint">
                        <th className="py-2 pr-3 font-medium">Date</th>
                        <th className="py-2 pr-3 font-medium">Arrivée</th>
                        <th className="py-2 pr-3 font-medium">Pause</th>
                        <th className="py-2 pr-3 font-medium">Départ</th>
                        <th className="py-2 font-medium">Retard</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.history.map((row) => (
                        <tr key={row.date} className="border-b border-line last:border-b-0">
                          <td className="py-2 pr-3 font-mono num">{row.date}</td>
                          <td className="py-2 pr-3 font-mono num">{row.inAt ?? '—'}</td>
                          <td className="py-2 pr-3 font-mono num text-ink-soft">
                            {row.breakIn ? `${row.breakIn}${row.breakOut ? ` → ${row.breakOut}` : ' …'}` : '—'}
                          </td>
                          <td className="py-2 pr-3 font-mono num">{row.outAt ?? '—'}</td>
                          <td className={cx('py-2 font-mono num', row.lateMinutes > 0 ? 'text-amber' : 'text-ink-soft')}>
                            {row.lateMinutes > 0 ? `${row.lateMinutes} min` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {detail.loanHistory.length > 0 ? (
              <section>
                <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-ink-faint">Historique des prêts</h3>
                <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
                  {detail.loanHistory.map((loan) => (
                    <li key={loan.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{loan.tool_name}</p>
                        <p className="text-[12px] text-ink-soft">Sorti le {String(loan.out_at).slice(0, 10)}</p>
                      </div>
                      <Chip tone={loan.returned_at ? (loan.return_condition === 'bon' ? 'green' : 'amber') : 'grey'}>
                        {loan.returned_at ? (loan.return_condition === 'bon' ? 'Retourné' : loan.return_condition) : 'En prêt'}
                      </Chip>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        ) : (
          <Banner tone="error">Fiche introuvable.</Banner>
        )}
      </Drawer>

      <Modal
        open={formOpen}
        title={editing ? `Modifier ${editing.id}` : 'Nouveau travailleur'}
        onClose={() => setFormOpen(false)}
        footer={
          <>
            <Button onClick={() => setFormOpen(false)}>Annuler</Button>
            <Button variant="primary" disabled={busy || form.full_name.trim().length < 3} onClick={() => void save()}>
              {busy ? <Spinner /> : 'Enregistrer'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {formError ? <Banner tone="error">{formError}</Banner> : null}
          <Field
            label="Nom complet"
            value={form.full_name}
            placeholder="Landry ONANA"
            onChange={(event) => setForm({ ...form, full_name: event.target.value })}
          />
          <Field
            label="Métier / fonction"
            value={form.job_title}
            placeholder="Menuisier, Apprenti, Chef d’atelier…"
            onChange={(event) => setForm({ ...form, job_title: event.target.value })}
          />
          {!editing ? (
            <Banner tone="info">
              L’identifiant (EMP-XXX) et le badge de pointage sont générés automatiquement à la création.
            </Banner>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={!!badgeFor}
        title={`Badge — ${badgeFor?.full_name ?? ''}`}
        onClose={() => setBadgeFor(null)}
        footer={
          <>
            <Button onClick={() => setBadgeFor(null)}>Fermer</Button>
            <Button
              onClick={() => {
                const active = employees.filter((employee) => employee.active && employee.badge_token);
                if (active.length === 0) return;
                print(<BadgeSheet employees={active} />);
                setBadgeFor(null);
              }}
              icon={<IconPrinter size={16} />}
            >
              Planche A4 des actifs
            </Button>
            <Button
              variant="primary"
              icon={<IconPrinter size={16} />}
              disabled={!badgeFor?.badge_token}
              onClick={() => {
                if (badgeFor) print(<BadgeSheet employees={[badgeFor]} />);
                setBadgeFor(null);
              }}
            >
              Imprimer la carte
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {badgeFor?.badge_token ? (
            <div
              className="mx-auto flex w-full max-w-[340px] items-center gap-4 rounded-card border border-line bg-surface p-4"
              style={{ fontFamily: '"IBM Plex Sans", sans-serif' }}
            >
              <QrCode value={`${QR_PREFIX.badge}${badgeFor.badge_token}`} size={96} />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber">
                  Menuiserie · Mont Fèbè
                </p>
                <p className="mt-1 truncate text-sm font-semibold text-ink">{badgeFor.full_name}</p>
                <p className="truncate text-[12px] text-ink-soft">{badgeFor.job_title}</p>
                <p className="mt-1 font-mono text-[12px] text-ink num">{badgeFor.id}</p>
              </div>
            </div>
          ) : (
            <Banner tone="info">Ce travailleur n’a pas encore de badge. Cliquez sur « Badge » pour le créer.</Banner>
          )}
          <p className="text-[13px] text-ink-soft">
              Le QR code ne contient qu’un jeton aléatoire : il ne donne aucun accès aux données. Aperçu
            imprimable au format carte (85,6 × 54 mm).
          </p>
          <Button
            variant="danger"
            className="w-full"
            disabled={busy || !badgeFor}
            onClick={() => void regenBadge()}
          >
            {busy ? <Spinner /> : 'Révoquer l’ancien badge et en regénérer un'}
          </Button>
        </div>
      </Modal>

      <Modal
        open={leaveOpen}
        title="Nouvelle demande de congé / permission"
        onClose={() => setLeaveOpen(false)}
        footer={
          <>
            <Button onClick={() => setLeaveOpen(false)}>Annuler</Button>
            <Button variant="primary" loading={leaveBusy} onClick={() => void submitLeave()}>Enregistrer</Button>
          </>
        }
      >
        <div className="space-y-3">
          {leaveError ? <Banner tone="error">{leaveError}</Banner> : null}
          <SelectField
            label="Travailleur"
            value={leaveForm.employee_id}
            onChange={(e) => setLeaveForm((f) => ({ ...f, employee_id: e.target.value }))}
          >
            <option value="">— Choisir —</option>
            {employees.filter((emp) => emp.active).map((emp) => (
              <option key={emp.id} value={emp.id}>{emp.full_name} ({emp.id})</option>
            ))}
          </SelectField>
          <SelectField
            label="Type"
            value={leaveForm.kind}
            onChange={(e) => setLeaveForm((f) => ({ ...f, kind: e.target.value as typeof f.kind }))}
          >
            <option value="conge">Congé</option>
            <option value="permission">Permission (courte durée)</option>
            <option value="absence">Absence déclarée</option>
          </SelectField>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Du" type="date" value={leaveForm.from_date} onChange={(e) => setLeaveForm((f) => ({ ...f, from_date: e.target.value }))} />
            <Field label="Au" type="date" value={leaveForm.to_date} onChange={(e) => setLeaveForm((f) => ({ ...f, to_date: e.target.value }))} />
          </div>
          <TextArea label="Motif / note" value={leaveForm.note} onChange={(e) => setLeaveForm((f) => ({ ...f, note: e.target.value }))} placeholder="Congé familial, permission médicale…" />
          <Banner tone="info">La demande sera en attente d’approbation par la direction ou le magasinier autorisé.</Banner>
        </div>
      </Modal>
      {portal}
    </>
  );
}

function StatBox({ label, value, tone }: { label: string; value: string; tone?: 'amber' }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2.5 text-center">
      <p className={cx('font-mono text-xl font-semibold num', tone === 'amber' ? 'text-amber' : 'text-ink')}>{value}</p>
      <p className="mt-0.5 text-[11px] uppercase tracking-wide text-ink-faint">{label}</p>
    </div>
  );
}

function BadgeCard({ employee }: { employee: Employee }) {
  return (
    <div
      className="badge-card"
      style={{ fontFamily: '"IBM Plex Sans", sans-serif', background: '#ffffff', color: '#17181b' }}
    >
      {employee.badge_token ? (
        <QrCode value={`${QR_PREFIX.badge}${employee.badge_token}`} size={83} alt={`QR badge ${employee.id}`} />
      ) : (
        <div style={{ width: '22mm', height: '22mm', border: '1px dashed #d3cabd' }} />
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ fontSize: '6.5pt', fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#b4530a', margin: 0 }}>
          Menuiserie · Mont Fèbè
        </p>
        <p style={{ fontSize: '11pt', fontWeight: 600, margin: '1.5mm 0 0', lineHeight: 1.15 }}>{employee.full_name}</p>
        <p style={{ fontSize: '8pt', color: '#5b5651', margin: '0.5mm 0 0' }}>{employee.job_title}</p>
        <p style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '8pt', margin: '1.5mm 0 0' }}>{employee.id}</p>
      </div>
    </div>
  );
}

function BadgeSheet({ employees }: { employees: Employee[] }) {
  return (
    <div className="a4-page" style={{ fontFamily: '"IBM Plex Sans", sans-serif' }}>
      <div style={{ marginBottom: '6mm', borderBottom: '1px solid #d3cabd', paddingBottom: '3mm' }}>
        <p style={{ fontSize: '12pt', fontWeight: 600, color: '#17181b', margin: 0 }}>
          Menuiserie — Monastère du Mont Fèbè
        </p>
        <p style={{ fontSize: '9pt', color: '#5b5651', margin: '1mm 0 0' }}>
          Badges de pointage — {employees.length} carte(s) — format 85,6 × 54 mm, découpe manuelle
        </p>
      </div>
      <div className="badge-grid">
        {employees.map((employee) => (
          <BadgeCard key={employee.id} employee={employee} />
        ))}
      </div>
    </div>
  );
}
