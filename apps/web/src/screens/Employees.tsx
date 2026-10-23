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
  Modal,
  PageHeader,
  Spinner,
  cx,
  useToast,
} from '../components/ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { QrCode } from '../components/QrCode';
import { DataTable, type DataTableColumn } from '../components/DataTable';
import {
  Calendar as CalendarIcon,
  Clock,
  Download,
  Plus,
  Printer,
  RefreshCw,
  Search,
  UserPlus,
  Users,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { exportToExcel, exportToPdf } from '../lib/export';

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

/**
 * Time-off Calendar View Component
 */
function TimeOffCalendarView({
  leaves,
  employees,
  onOpenLeave,
  onReview,
  canManage,
}: {
  leaves: Leave[];
  employees: Employee[];
  onOpenLeave: () => void;
  onReview: (leave: Leave, status: 'approved' | 'rejected') => void;
  canManage: boolean;
}) {
  const [currentMonth, setCurrentMonth] = useState(() => new Date());

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const monthLabel = currentMonth.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = (new Date(year, month, 1).getDay() + 6) % 7; // Lundi = 0

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blanks = Array.from({ length: firstDayIndex }, (_, i) => i);

  // Filter leaves that touch this month
  const monthLeaves = useMemo(() => {
    return leaves.filter((l) => {
      const from = new Date(l.from_date);
      const to = new Date(l.to_date);
      const startOfMonth = new Date(year, month, 1);
      const endOfMonth = new Date(year, month + 1, 0);
      return (from <= endOfMonth && to >= startOfMonth);
    });
  }, [leaves, year, month]);

  return (
    <div className="space-y-6">
      {/* Pending Approvals Bar */}
      {leaves.filter((l) => l.status === 'pending').length > 0 && (
        <Card className="border-amber/30 bg-amber-wash/40 p-4 shadow-card">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-ink flex items-center gap-2">
              <Clock size={16} className="text-amber" /> Demandes de congés &amp; permissions en attente ({leaves.filter((l) => l.status === 'pending').length})
            </span>
            <span className="text-[11px] text-amber font-semibold">Validation requise</span>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {leaves.filter((l) => l.status === 'pending').map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface p-3 text-xs shadow-xs">
                <div className="min-w-0">
                  <p className="font-bold text-ink">{l.full_name}</p>
                  <p className="text-ink-soft">
                    <span className="capitalize font-semibold text-amber">{l.kind}</span> : {formatDate(l.from_date)} → {formatDate(l.to_date)}
                  </p>
                  {l.note ? <p className="text-[11px] text-ink-faint italic truncate">{l.note}</p> : null}
                </div>
                {canManage && (
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      onClick={() => onReview(l, 'approved')}
                      className="rounded bg-green px-2.5 py-1 text-[11px] font-bold text-white hover:bg-green-2 active:scale-95"
                    >
                      Accepter
                    </button>
                    <button
                      onClick={() => onReview(l, 'rejected')}
                      className="rounded bg-grey-wash border border-line px-2 py-1 text-[11px] font-medium text-ink-soft hover:bg-red-wash hover:text-red active:scale-95"
                    >
                      Refuser
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Calendar Header */}
      <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-ink capitalize">{monthLabel}</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentMonth(new Date(year, month - 1, 1))}
              className="rounded-lg border border-line p-1 hover:bg-paper-2"
              aria-label="Mois précédent"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setCurrentMonth(new Date())}
              className="rounded-lg border border-line px-2 py-1 text-xs font-semibold hover:bg-paper-2"
            >
              Aujourd'hui
            </button>
            <button
              onClick={() => setCurrentMonth(new Date(year, month + 1, 1))}
              className="rounded-lg border border-line p-1 hover:bg-paper-2"
              aria-label="Mois suivant"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
          <span className="hidden md:inline text-ink-faint font-medium">({employees.length} salariés)</span>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-blue" />
            <span className="text-ink-soft">Congé payé</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#8b5cf6]" />
            <span className="text-ink-soft">Permission</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-red" />
            <span className="text-ink-soft">Absence</span>
          </div>
          <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={onOpenLeave} className="ml-auto sm:ml-0">
            Poser congé
          </Button>
        </div>
      </div>

      {/* Monthly Grid with responsive horizontal scroll */}
      <Card className="overflow-x-auto scroll-thin shadow-card p-0">
        <div className="min-w-[580px]">
          <div className="grid grid-cols-7 border-b border-line bg-paper-2 text-center text-xs font-semibold text-ink-soft">
            {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((d) => (
              <div key={d} className="py-2.5 border-r border-line last:border-r-0">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 sheet-grid">
          {blanks.map((b) => (
            <div key={`blank-${b}`} className="min-h-24 bg-paper/40 p-2 border-r border-b border-line" />
          ))}

          {days.map((d) => {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const activeOnDay = monthLeaves.filter((l) => dateStr >= l.from_date && dateStr <= l.to_date);
            const isToday = new Date().toDateString() === new Date(year, month, d).toDateString();

            return (
              <div
                key={`day-${d}`}
                className={cx(
                  'min-h-24 p-2 border-r border-b border-line transition-colors hover:bg-paper-2/20',
                  isToday && 'bg-amber-wash/30',
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cx(
                      'font-mono text-xs font-bold tabular-nums',
                      isToday ? 'grid h-6 w-6 place-items-center rounded-full bg-amber text-white' : 'text-ink-soft',
                    )}
                  >
                    {d}
                  </span>
                  {activeOnDay.length > 0 && (
                    <span className="text-[10px] text-ink-faint font-semibold">{activeOnDay.length} abs.</span>
                  )}
                </div>

                <div className="mt-1.5 space-y-1">
                  {activeOnDay.slice(0, 3).map((leave) => (
                    <div
                      key={leave.id}
                      className="flex items-center gap-1 truncate rounded bg-surface-2 border border-line px-1.5 py-0.5 text-[10px] font-medium text-ink-soft shadow-xs"
                      title={`${leave.full_name} (${leave.kind}) : ${leave.from_date} au ${leave.to_date}`}
                    >
                      <span
                        className={cx(
                          'h-1.5 w-1.5 rounded-full shrink-0',
                          leave.kind === 'conge'
                            ? 'bg-blue'
                            : leave.kind === 'permission'
                            ? 'bg-[#8b5cf6]'
                            : 'bg-red',
                        )}
                      />
                      <span className="truncate">{(leave.full_name ?? 'Employé').split(' ')[0]}</span>
                    </div>
                  ))}
                  {activeOnDay.length > 3 && (
                    <span className="text-[10px] text-ink-faint block text-center">+{activeOnDay.length - 3} autres</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
    </div>
  );
}

export function Employees({ user, scan }: { user: User; scan?: ScanResult | null }) {
  const toast = useToast();
  const canManage = user.role === 'direction';

  const [activeTab, setActiveTab] = useState<'people' | 'timeoff'>('people');

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
      api<{ leaves: Leave[] }>('/api/leaves?status=all').catch(() => ({ leaves: [] })),
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

  const counts = useMemo<{
    all: number;
    present: number;
    late: number;
    absent: number;
    conge: number;
    permission: number;
  }>(() => {
    const c = { all: employees.length, present: 0, late: 0, absent: 0, conge: 0, permission: 0 };
    for (const s of todayStatus) {
      if (s.status in c) (c as Record<string, number>)[s.status] = ((c as Record<string, number>)[s.status] ?? 0) + 1;
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

  const employeeColumns = useMemo<DataTableColumn<Employee>[]>(
    () => [
      {
        accessorKey: 'full_name',
        header: 'Nom du travailleur',
        sortFn: 'alphanumeric',
        meta: { cellClassName: 'whitespace-normal min-w-56' },
        cell: ({ row }) => {
          const employee = row.original;
          return (
            <div className="flex items-center gap-3">
              <span
                className={cx(
                  'grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold border shadow-xs',
                  employee.active ? 'bg-amber-wash text-amber border-amber/20' : 'bg-grey-wash text-ink-faint border-line',
                )}
              >
                {initials(employee.full_name)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-ink">{employee.full_name}</p>
                <p className="truncate text-[11px] text-ink-soft">
                  {employee.job_title} · <span className="font-mono">{employee.id}</span>
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
        header: 'État d’aujourd’hui',
        cell: ({ row }) => dayChip(row.original),
      },
      {
        id: 'badge',
        accessorKey: 'badge_token',
        header: 'Badge QR',
        enableSorting: false,
        meta: { headerClassName: 'hidden sm:table-cell', cellClassName: 'hidden sm:table-cell' },
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums text-ink font-semibold">
            {row.original.badge_token ?? '—'}
          </span>
        ),
      },
      {
        id: 'active',
        accessorKey: 'active',
        header: 'Statut',
        cell: ({ row }) => (
          <span
            className={cx(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border',
              row.original.active
                ? 'border-green/20 bg-green-wash text-green'
                : 'border-line bg-grey-wash text-ink-faint',
            )}
          >
            <span className={cx('h-1.5 w-1.5 rounded-full', row.original.active ? 'bg-green' : 'bg-ink-faint')} />
            {row.original.active ? 'Actif' : 'Inactif'}
          </span>
        ),
      },
      {
        id: 'actions',
        enableSorting: false,
        header: '',
        meta: { cellClassName: 'whitespace-nowrap text-right' },
        cell: ({ row }) => {
          const employee = row.original;
          return (
            <div className="flex items-center justify-end gap-1">
              <Button size="sm" variant="ghost" onClick={() => setDetailFor(employee)}>
                Détail
              </Button>
              {canManage && (
                <>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(employee)}>
                    Modifier
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setBadgeFor(employee)}>
                    Badge
                  </Button>
                  <Button
                    size="sm"
                    variant={employee.active ? 'outline-danger' : 'secondary'}
                    onClick={() => void toggleActive(employee)}
                  >
                    {employee.active ? 'Désactiver' : 'Activer'}
                  </Button>
                </>
              )}
            </div>
          );
        },
      },
    ],
    [canManage, statusMap],
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
        toast('Nouveau travailleur créé avec badge automatique.', 'success');
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
      toast(`Nouveau badge généré : ${res.employee.badge_token}`, 'success');
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
      toast('Demande de congé enregistrée.', 'success');
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

  function handleExportExcel() {
    const dateStr = new Date().toISOString().split('T')[0];
    const headers = ['Matricule', 'Nom Complet', 'Poste / Fonction', 'Badge QR', 'Statut Aujourd’hui', 'Compte Actif'];
    const rows = filtered.map((e) => {
      const s = statusMap.get(e.id);
      return [
        e.id,
        e.full_name,
        e.job_title,
        e.badge_token ?? '-',
        s
          ? `${STATUS_CHIP[s.status]?.label ?? s.status}${s.status === 'late' && s.lateMinutes > 0 ? ` (+${s.lateMinutes}m)` : ''}`
          : 'Non pointé',
        e.active ? 'Oui' : 'Non',
      ];
    });
    exportToExcel(`Registre_Personnel_${dateStr}`, 'Personnel', headers, rows);
  }

  function handleExportPdf() {
    const headers = ['Matricule', 'Nom Complet', 'Poste / Fonction', 'Badge QR', 'Statut Jour', 'Actif'];
    const rows = filtered.map((e) => {
      const s = statusMap.get(e.id);
      return [
        e.id,
        e.full_name,
        e.job_title,
        e.badge_token ?? '-',
        s
          ? `${STATUS_CHIP[s.status]?.label ?? s.status}${s.status === 'late' && s.lateMinutes > 0 ? ` (+${s.lateMinutes}m)` : ''}`
          : 'Non pointé',
        e.active ? 'Actif' : 'Inactif',
      ];
    });
    exportToPdf(
      'Registre du Personnel & Effectifs de Menuiserie',
      'Liste officielle des maîtres-artisans, compagnons et apprentis du Centre de Formation Technique',
      headers,
      rows,
      [
        { label: 'Effectif Total', value: employees.length },
        { label: 'Ouvriers Actifs', value: employees.filter((e) => e.active).length },
        {
          label: 'En Poste Aujourd’hui',
          value: todayStatus.filter((s) => s.status === 'present' || s.status === 'late').length,
        },
        {
          label: 'En Congé / Absence',
          value: todayStatus.filter(
            (s) => s.status === 'conge' || s.status === 'permission' || s.status === 'absent',
          ).length,
        },
      ],
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Registre des Travailleurs"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              icon={<RefreshCw size={14} />}
              onClick={() => setReload((value) => value + 1)}
            >
              Actualiser
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<Download size={14} />}
              onClick={handleExportExcel}
            >
              Excel
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<Printer size={14} />}
              onClick={handleExportPdf}
            >
              Imprimer
            </Button>
            <Button size="sm" onClick={openLeave} icon={<CalendarIcon size={14} />}>
              Congé / Permission
            </Button>
            {canManage && (
              <Button size="sm" variant="primary" icon={<UserPlus size={15} />} onClick={openCreate}>
                Nouveau travailleur
              </Button>
            )}
          </div>
        }
      />

      {error ? (
        <div className="mb-4">
          <Banner tone="error">{error}</Banner>
        </div>
      ) : null}

      {loading && employees.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-24 text-sm text-ink-soft">
          <Spinner /> Chargement des effectifs et du planning…
        </div>
      ) : null}

      {/* Tabs Switcher: Équipe vs Calendrier Time-Off */}
      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as typeof activeTab)} className="w-full space-y-6">
        <div className="border-b border-line pb-px overflow-x-auto scroll-thin">
          <TabsList variant="line" className="flex gap-2 bg-transparent p-0 w-max min-w-full">
            <TabsTrigger
              value="people"
              className="gap-2 px-3 py-2 text-xs sm:text-sm font-semibold shrink-0 data-active:border-b-2 data-active:border-amber data-active:text-ink"
            >
              <Users size={16} />
              <span>Répertoire de l’Équipe</span>
              <span className="ml-1 rounded-full bg-paper-2 px-2 py-0.5 text-[10px] font-bold text-ink-soft">
                {employees.length}
              </span>
            </TabsTrigger>

            <TabsTrigger
              value="timeoff"
              className="gap-2 px-3 py-2 text-xs sm:text-sm font-semibold shrink-0 data-active:border-b-2 data-active:border-amber data-active:text-ink"
            >
              <CalendarIcon size={16} />
              <span>Planning des Congés</span>
              {leaves.filter((l) => l.status === 'pending').length > 0 && (
                <span className="ml-1 rounded-full bg-amber-wash px-2 py-0.5 text-[10px] font-bold text-amber">
                  {leaves.filter((l) => l.status === 'pending').length} attente
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* =========================================================================
            TAB 1: PEOPLE / EQUIPE
        ========================================================================= */}
        <TabsContent value="people" className="space-y-4">
          {/* Quick Metrics */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card className="p-3.5 shadow-card">
              <span className="text-[10px] uppercase font-bold text-ink-faint">Effectif total</span>
              <p className="mt-1 font-mono text-2xl font-bold text-ink tabular-nums">{employees.length}</p>
            </Card>
            <Card className="p-3.5 shadow-card">
              <span className="text-[10px] uppercase font-bold text-ink-faint flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-green" /> Présents aujourd’hui
              </span>
              <p className="mt-1 font-mono text-2xl font-bold text-ink tabular-nums">{counts.present + counts.late}</p>
            </Card>
            <Card className="p-3.5 shadow-card">
              <span className="text-[10px] uppercase font-bold text-ink-faint flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-amber" /> En retard
              </span>
              <p className="mt-1 font-mono text-2xl font-bold text-ink tabular-nums">{counts.late}</p>
            </Card>
            <Card className="p-3.5 shadow-card">
              <span className="text-[10px] uppercase font-bold text-ink-faint flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-blue" /> Congés &amp; Absents
              </span>
              <p className="mt-1 font-mono text-2xl font-bold text-ink tabular-nums">{counts.conge + counts.permission}</p>
            </Card>
          </div>

          {/* Search & Filter Toolbar */}
          <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-3 shadow-xs sm:flex-row sm:items-center sm:justify-between">
            <div className="relative min-w-0 flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                value={q}
                onChange={(event) => setQ(event.target.value)}
                placeholder="Rechercher par nom, métier ou matricule…"
                className="h-9 w-full rounded-lg border border-line bg-paper-2/60 pl-9 pr-3 text-xs text-ink placeholder:text-ink-faint focus:border-amber focus:bg-surface focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto scroll-thin max-w-full pb-1 sm:pb-0">
              <div className="flex items-center shrink-0 rounded-lg border border-line bg-paper-2 p-0.5 text-xs">
                {STATUS_FILTERS.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => setStatusFilter(f.value)}
                    className={cx(
                      'rounded-md px-2.5 py-1 font-medium transition-colors shrink-0',
                      statusFilter === f.value ? 'bg-surface font-semibold text-ink shadow-xs' : 'text-ink-soft',
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setShowInactive((v) => !v)}
                className={cx(
                  'shrink-0 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors',
                  showInactive ? 'border-amber bg-amber-wash text-amber' : 'border-line text-ink-soft hover:bg-paper-2',
                )}
              >
                Inactifs
              </button>
            </div>
          </div>

          {/* DataTable with Mobile Card View */}
          <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
            <DataTable
              data={filtered}
              columns={employeeColumns}
              caption="Effectif de l’atelier de menuiserie"
              renderCard={(employee) => (
                <div
                  key={employee.id}
                  className="rounded-xl border border-line bg-surface p-3.5 shadow-xs space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={cx(
                          'grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold border shadow-xs',
                          employee.active ? 'bg-amber-wash text-amber border-amber/20' : 'bg-grey-wash text-ink-faint border-line',
                        )}
                      >
                        {initials(employee.full_name)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-ink">{employee.full_name}</p>
                        <p className="truncate text-xs text-ink-soft">
                          {employee.job_title} · <span className="font-mono text-ink-faint">{employee.id}</span>
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0">{dayChip(employee)}</div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-2.5 text-xs">
                    <span
                      className={cx(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border',
                        employee.active
                          ? 'border-green/20 bg-green-wash text-green'
                          : 'border-line bg-grey-wash text-ink-faint',
                      )}
                    >
                      <span className={cx('h-1.5 w-1.5 rounded-full', employee.active ? 'bg-green' : 'bg-ink-faint')} />
                      {employee.active ? 'Actif' : 'Inactif'}
                    </span>

                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setDetailFor(employee)}>
                        Détail
                      </Button>
                      {canManage && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => openEdit(employee)}>
                            Modifier
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setBadgeFor(employee)}>
                            Badge
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
              empty={
                <EmptyState
                  title="Aucun travailleur trouvé"
                  hint="Ajustez vos filtres de recherche ou enregistrez un collaborateur."
                  action={
                    canManage ? (
                      <Button variant="primary" onClick={openCreate}>
                        Nouveau travailleur
                      </Button>
                    ) : undefined
                  }
                />
              }
            />
          </div>
        </TabsContent>

        {/* =========================================================================
            TAB 2: TIME-OFF CALENDAR
        ========================================================================= */}
        <TabsContent value="timeoff" className="space-y-4">
          <TimeOffCalendarView
            leaves={leaves}
            employees={employees}
            onOpenLeave={openLeave}
            onReview={reviewLeave}
            canManage={canManage}
          />
        </TabsContent>
      </Tabs>

      {/* =========================================================================
          DRAWER : FICHE DETAILLEE TRAVAILLEUR
      ========================================================================= */}
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
              <span className="grid h-16 w-16 place-items-center rounded-2xl bg-amber-wash text-xl font-bold text-amber border border-amber/20 shadow-xs">
                {initials(detail.employee.full_name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={cx(
                      'rounded-full px-2 py-0.5 text-[10px] font-bold border',
                      detail.employee.active
                        ? 'border-green/20 bg-green-wash text-green'
                        : 'border-line bg-grey-wash text-ink-faint',
                    )}
                  >
                    {detail.employee.active ? 'Actif' : 'Inactif'}
                  </span>
                  {detail.employee.badge_token && (
                    <span className="rounded-full border border-blue/20 bg-blue-wash px-2 py-0.5 text-[10px] font-bold text-blue">
                      Badge QR actif
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-ink-soft">
                  Code badge de pointage : <span className="font-mono font-bold text-ink">{detail.employee.badge_token ?? '—'}</span>
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <StatBox label="Jours ce mois" value={String(detail.month.daysPresent)} />
              <StatBox label="Retards" value={String(detail.month.lateCount)} tone={detail.month.lateCount > 0 ? 'amber' : undefined} />
              <StatBox label="Pauses" value={String(detail.month.breaks)} />
            </div>

            {detail.openLoans.length > 0 && (
              <section>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-faint">
                  Outils détenus en cours ({detail.openLoans.length})
                </h3>
                <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
                  {detail.openLoans.map((loan) => (
                    <li key={loan.id} className="flex items-center justify-between gap-3 p-3">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-ink">{loan.tool_name}</p>
                        <p className="text-[11px] text-ink-soft">
                          {loan.category} · sorti le {String(loan.out_at).slice(0, 10)}
                        </p>
                      </div>
                      <span className="rounded-full bg-amber-wash border border-amber/20 px-2 py-0.5 text-[10px] font-bold text-amber">
                        En prêt
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-faint">Historique 30 derniers jours</h3>
              {detail.history.length === 0 ? (
                <p className="text-xs text-ink-soft">Aucun pointage enregistré.</p>
              ) : (
                <div className="overflow-hidden rounded-xl border border-line bg-surface">
                  <table className="w-full text-left sheet-grid text-xs">
                    <thead>
                      <tr>
                        <th className="sheet-th">Date</th>
                        <th className="sheet-th text-center">Arrivée</th>
                        <th className="sheet-th text-center">Pause</th>
                        <th className="sheet-th text-center">Départ</th>
                        <th className="sheet-th text-center">Retard</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {detail.history.map((row) => (
                        <tr key={row.date} className="hover:bg-paper-2/40">
                          <td className="sheet-cell font-mono tabular-nums">{row.date}</td>
                          <td className="sheet-cell text-center font-mono tabular-nums text-green font-semibold">
                            {row.inAt ?? '—'}
                          </td>
                          <td className="sheet-cell text-center font-mono tabular-nums text-ink-faint">
                            {row.breakIn ? `${row.breakIn} → ${row.breakOut ?? '…'}` : '—'}
                          </td>
                          <td className="sheet-cell text-center font-mono tabular-nums text-ink-soft">{row.outAt ?? '—'}</td>
                          <td className="sheet-cell text-center font-mono tabular-nums">
                            {row.lateMinutes > 0 ? (
                              <span className="text-amber font-bold">+{row.lateMinutes}m</span>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        ) : (
          <Banner tone="error">Fiche introuvable.</Banner>
        )}
      </Drawer>

      {/* =========================================================================
          MODALS
      ========================================================================= */}
      <Modal
        open={formOpen}
        title={editing ? `Modifier ${editing.id}` : 'Nouveau travailleur'}
        onClose={() => setFormOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>Annuler</Button>
            <Button variant="primary" disabled={busy || form.full_name.trim().length < 3} onClick={() => void save()}>
              {busy ? <Spinner /> : 'Enregistrer'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {formError ? <Banner tone="error">{formError}</Banner> : null}
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">Nom complet</label>
            <input
              type="text"
              value={form.full_name}
              placeholder="Ex : Landry ONANA"
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink focus:border-amber focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">Fonction / Spécialité</label>
            <input
              type="text"
              value={form.job_title}
              placeholder="Ex : Menuisier débitage, Apprenti…"
              onChange={(e) => setForm({ ...form, job_title: e.target.value })}
              className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink focus:border-amber focus:outline-none"
            />
          </div>
          {!editing && (
            <Banner tone="info">
              L’identifiant (EMP-XXX) et le badge QR sont automatiquement générés.
            </Banner>
          )}
        </div>
      </Modal>

      {/* Badge QR Modal */}
      <Modal
        open={!!badgeFor}
        title={badgeFor ? `Badge · ${badgeFor.full_name}` : 'Badge'}
        onClose={() => setBadgeFor(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setBadgeFor(null)}>Fermer</Button>
            <Button
              variant="primary"
              icon={<Printer size={15} />}
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
        <div className="space-y-4">
          {badgeFor ? (
            <div className="flex justify-center p-1">
              <BadgeCard employee={badgeFor} isPreview />
            </div>
          ) : (
            <Banner tone="info">Badge non encore créé.</Banner>
          )}

          <Button
            variant="danger"
            className="w-full"
            disabled={busy || !badgeFor}
            onClick={() => void regenBadge()}
          >
            {busy ? <Spinner /> : 'Régénérer un nouveau badge'}
          </Button>
        </div>
      </Modal>

      {/* Leave Request Modal */}
      <Modal
        open={leaveOpen}
        title="Nouvelle demande de congé ou permission"
        onClose={() => setLeaveOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setLeaveOpen(false)}>Annuler</Button>
            <Button variant="primary" disabled={leaveBusy} onClick={() => void submitLeave()}>
              {leaveBusy ? <Spinner /> : 'Enregistrer la demande'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {leaveError ? <Banner tone="error">{leaveError}</Banner> : null}
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">Travailleur</label>
            <select
              value={leaveForm.employee_id}
              onChange={(e) => setLeaveForm((f) => ({ ...f, employee_id: e.target.value }))}
              className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-xs text-ink focus:border-amber focus:outline-none"
            >
              <option value="">— Sélectionner un ouvrier —</option>
              {employees.filter((emp) => emp.active).map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.full_name} ({emp.id})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">Type d'absence</label>
            <select
              value={leaveForm.kind}
              onChange={(e) => setLeaveForm((f) => ({ ...f, kind: e.target.value as typeof f.kind }))}
              className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-xs text-ink focus:border-amber focus:outline-none"
            >
              <option value="conge">Congé annuel payé</option>
              <option value="permission">Permission exceptionnelle</option>
              <option value="absence">Absence autorisée</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-soft">Date de début</label>
              <input
                type="date"
                value={leaveForm.from_date}
                onChange={(e) => setLeaveForm((f) => ({ ...f, from_date: e.target.value }))}
                className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-xs text-ink focus:border-amber focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-soft">Date de fin</label>
              <input
                type="date"
                value={leaveForm.to_date}
                onChange={(e) => setLeaveForm((f) => ({ ...f, to_date: e.target.value }))}
                className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-xs text-ink focus:border-amber focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">Motif / Justification</label>
            <textarea
              value={leaveForm.note}
              onChange={(e) => setLeaveForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="Ex : Événement familial, rendez-vous médical…"
              rows={2}
              className="w-full rounded-lg border border-line bg-surface p-2.5 text-xs text-ink focus:border-amber focus:outline-none"
            />
          </div>
        </div>
      </Modal>

      {portal}
    </div>
  );
}

function StatBox({ label, value, tone }: { label: string; value: string; tone?: 'amber' }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2.5 text-center shadow-xs">
      <p className={cx('font-mono text-xl font-bold tabular-nums', tone === 'amber' ? 'text-amber' : 'text-ink')}>{value}</p>
      <p className="mt-0.5 text-[10px] uppercase font-bold text-ink-faint tracking-wider">{label}</p>
    </div>
  );
}

function BadgeCard({ employee, isPreview }: { employee: Employee; isPreview?: boolean }) {
  return (
    <div
      className={cx(
        'badge-card relative flex flex-col justify-between overflow-hidden rounded-xl border border-gray-300 bg-white text-gray-900 shadow-sm',
        isPreview ? 'h-[200px] w-full max-w-[340px] p-3 text-[13px]' : 'h-[54mm] w-[85.6mm] p-[3mm] text-[8pt]',
      )}
      style={{ fontFamily: '"IBM Plex Sans", -apple-system, sans-serif' }}
    >
      {/* Ligne accent ambre monastique */}
      <div className="absolute inset-x-0 top-0 h-[3px] bg-[#ff5500]" />

      {/* En-tête officiel avec le vrai logo du Monastère */}
      <div className="flex items-center gap-2 border-b border-gray-200 pb-1.5">
        <img
          src="/logo.png"
          alt="C.F.T. Bénédictins Mont Fébé"
          className={cx('object-contain shrink-0', isPreview ? 'h-8' : 'h-[7.5mm]')}
        />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="text-[7pt] font-extrabold uppercase tracking-wider text-gray-950">
            C.F.T. des Bénédictins du Mont Fébé
          </p>
          <p className="text-[5.5pt] font-bold tracking-wider text-[#ff5500] uppercase">
            Centre de Formation Technique · Menuiserie
          </p>
        </div>
      </div>

      {/* Corps : Identité à gauche, QR Code à droite */}
      <div className="flex flex-1 items-center justify-between gap-3 py-1">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="rounded bg-gray-100 border border-gray-300 px-1 py-0.2 font-mono text-[6pt] font-bold text-gray-800">
              {employee.id}
            </span>
            <span className="rounded bg-orange-50 text-[#ff5500] border border-orange-200 px-1 py-0.2 text-[5.5pt] font-bold uppercase tracking-wider">
              {employee.active ? 'Actif' : 'Inactif'}
            </span>
          </div>

          <div>
            <p className="truncate text-[9.5pt] font-extrabold leading-tight text-gray-950">
              {employee.full_name}
            </p>
            <p className="truncate text-[7pt] font-medium text-gray-600">
              {employee.job_title}
            </p>
          </div>
        </div>

        {/* QR Code haute précision pour pointage et prêt */}
        <div className="flex shrink-0 flex-col items-center justify-center rounded-lg border border-gray-200 bg-white p-1 shadow-2xs">
          {employee.badge_token ? (
            <QrCode
              value={`${QR_PREFIX.badge}${employee.badge_token}`}
              size={isPreview ? 84 : 72}
              alt={`QR badge ${employee.id}`}
            />
          ) : (
            <div className="grid h-[18mm] w-[18mm] place-items-center border border-dashed border-gray-300 text-[6pt] text-gray-400">
              Sans code
            </div>
          )}
          <span className="mt-0.5 font-mono text-[6pt] font-bold tracking-widest text-gray-500">
            {employee.badge_token ?? '------'}
          </span>
        </div>
      </div>

      {/* Bandeau de sécurité inférieur */}
      <div className="flex items-center justify-between border-t border-gray-200 pt-1 text-[5pt] font-medium text-gray-400 uppercase tracking-widest">
        <span>CARTE PROFESSIONNELLE D'ATELIER</span>
        <span>POINTAGE & OUTILLAGE</span>
      </div>
    </div>
  );
}

function BadgeSheet({ employees }: { employees: Employee[] }) {
  return (
    <div className="a4-page" style={{ fontFamily: '"IBM Plex Sans", sans-serif' }}>
      <div style={{ marginBottom: '6mm', borderBottom: '1px solid #e5e7eb', paddingBottom: '3mm' }} className="flex items-center justify-between">
        <div>
          <p style={{ fontSize: '12pt', fontWeight: 700, color: '#ff6603', margin: 0 }}>
            C.F.T. des Bénédictins du Mont Fébé
          </p>
          <p style={{ fontSize: '8.5pt', color: '#6b7280', margin: '1mm 0 0' }}>
            Planche de badges professionnels · {employees.length} carte(s) format ISO CR-80 (85,6 × 54 mm)
          </p>
        </div>
        <img src="/logo.png" alt="Logo" style={{ height: '10mm', objectFit: 'contain' }} />
      </div>
      <div className="badge-grid">
        {employees.map((employee) => (
          <BadgeCard key={employee.id} employee={employee} />
        ))}
      </div>
    </div>
  );
}
