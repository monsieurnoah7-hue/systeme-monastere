import { useEffect, useMemo, useState } from 'react';
import { api, type Employee, type EmployeeDetail, type Leave, type ScanResult, type TodayEmployee, type User, type EtabliKit, type EtabliKitItem } from '../lib/api';
import { QR_PREFIX } from '../lib/qr';
import { usePrintSheet } from '../lib/print';
import { formatDate, initials } from '../lib/labels';
import { EtabliKitCard } from '../components/EtabliKitCard';
import {
  Banner,
  Button,
  Card,
  Chip,
  Drawer,
  Modal,
  PageHeader,
  PasswordInput,
  Spinner,
  cx,
  useToast,
} from '../components/ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { QrCode } from '../components/QrCode';
import {
  AlertTriangle,
  Calendar as CalendarIcon,
  Camera,
  Clock,
  Download,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Trash2,
  UserPlus,
  Users,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { ImagePickerModal } from '../components/ImagePickerModal';
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
          <span className="hidden md:inline text-ink-faint font-medium">
            ({employees.filter((e) => e.active).length} salarié{employees.filter((e) => e.active).length > 1 ? 's' : ''})
          </span>
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

export function Employees({
  user,
  scan,
  permissions,
}: {
  user: User;
  scan?: ScanResult | null;
  permissions?: Record<string, boolean> | null;
}) {
  const toast = useToast();
  const isSuper = user.role === 'direction';
  const hasPerm = (p: string) => isSuper || (permissions ? !!permissions[p] : false);

  const canCreate = hasPerm('employees.create') || (!permissions && user.role === 'direction');
  const canEdit = hasPerm('employees.edit') || (!permissions && user.role === 'direction');
  const canPhoto = hasPerm('employees.photo_edit') || (!permissions && user.role === 'direction');
  const canPrintBadge = hasPerm('employees.print_badge') || (!permissions && user.role === 'direction');
  const canManageLeaves = hasPerm('leaves.manage') || (!permissions && user.role === 'direction');
  const canExportReports = hasPerm('reports.export') || (!permissions && user.role === 'direction');
  const canManage = canCreate || canEdit;

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
  const [form, setForm] = useState({
    full_name: '',
    job_title: '',
    pin: '',
    photo_path: null as string | null,
    create_account: false,
    account_login: '',
    account_password: '',
    account_role: 'travailleur',
  });
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [photoTarget, setPhotoTarget] = useState<{ id?: string; current?: string | null; name?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Rôles dynamiques configurés par la Direction (Pilier 1)
  const [availableRoles, setAvailableRoles] = useState<{ id: string; name: string }[]>([]);

  // Modale PIN de pointage (Pilier 2)
  const [pinModalFor, setPinModalFor] = useState<Employee | null>(null);
  const [pinOldValue, setPinOldValue] = useState('');
  const [pinValue, setPinValue] = useState('');
  const [pinConfirmValue, setPinConfirmValue] = useState('');
  const [pinModalError, setPinModalError] = useState<string | null>(null);
  const [pinModalBusy, setPinModalBusy] = useState(false);

  const [badgeFor, setBadgeFor] = useState<Employee | null>(null);
  const [deleteEmployeeFor, setDeleteEmployeeFor] = useState<Employee | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [detailFor, setDetailFor] = useState<Employee | null>(null);
  const [detail, setDetail] = useState<EmployeeDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [employeeKit, setEmployeeKit] = useState<{ kit: EtabliKit | null; items: EtabliKitItem[] } | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<'profil' | 'etabli'>('profil');
  const { print, portal } = usePrintSheet();

  useEffect(() => {
    if (scan?.kind === 'employee') {
      setDetailFor(scan.employee as Employee);
    }
  }, [scan]);

  useEffect(() => {
    if (!detailFor) {
      setDetail(null);
      setEmployeeKit(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setActiveDetailTab('profil');
    Promise.all([
      api<EmployeeDetail>(`/api/employees/${detailFor.id}/detail`),
      api<{ kit: EtabliKit | null; items: EtabliKitItem[] }>(`/api/kits/by-employee/${detailFor.id}`).catch(() => ({ kit: null, items: [] })),
    ])
      .then(([resDetail, resKit]) => {
        if (!cancelled) {
          setDetail(resDetail);
          setEmployeeKit(resKit);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDetail(null);
          setEmployeeKit(null);
        }
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
    if (employees.length === 0) setLoading(true);
    Promise.all([
      api<{ employees: Employee[] }>('/api/employees'),
      api<{ employees: TodayEmployee[] }>('/api/employees/today-status').catch(() => ({ employees: [] })),
      api<{ leaves: Leave[] }>('/api/leaves?status=all').catch(() => ({ leaves: [] })),
      api<{ roles: { id: string; name: string }[] }>('/api/permissions/roles').catch(() => ({ roles: [] })),
    ])
      .then(([empRes, statusRes, leaveRes, rolesRes]) => {
        if (!cancelled) {
          setEmployees(empRes.employees);
          setTodayStatus(statusRes.employees);
          setLeaves(leaveRes.leaves);
          if (rolesRes?.roles) setAvailableRoles(rolesRes.roles);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled && employees.length === 0) setError(err instanceof Error ? err.message : 'Chargement impossible.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reload, employees.length]);

  useEffect(() => {
    function loadRoles() {
      api<{ roles: { id: string; name: string }[] }>('/api/permissions/roles')
        .then((res) => {
          if (res?.roles && res.roles.length > 0) setAvailableRoles(res.roles);
        })
        .catch(() => {});
    }
    window.addEventListener('roles-updated', loadRoles);
    window.addEventListener('permissions:updated', loadRoles);
    return () => {
      window.removeEventListener('roles-updated', loadRoles);
      window.removeEventListener('permissions:updated', loadRoles);
    };
  }, []);

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



  function openCreate() {
    setEditing(null);
    const defaultRole = availableRoles.find((r) => r.id === 'travailleur') || availableRoles[0];
    setForm({
      full_name: '',
      job_title: defaultRole?.name || 'Travailleur / Menuisier',
      pin: '',
      photo_path: null,
      create_account: false,
      account_login: '',
      account_password: '',
      account_role: defaultRole?.id || 'travailleur',
    });
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(employee: Employee) {
    setEditing(employee);
    const matchingRole = availableRoles.find(
      (r) => r.name.toLowerCase() === employee.job_title.toLowerCase() || r.id.toLowerCase() === employee.job_title.toLowerCase()
    ) || availableRoles[0];
    setForm({
      full_name: employee.full_name,
      job_title: employee.job_title,
      pin: '',
      photo_path: employee.photo_path,
      create_account: false,
      account_login: '',
      account_password: '',
      account_role: matchingRole?.id || 'travailleur',
    });
    setFormError(null);
    setFormOpen(true);
  }

  async function handleEmployeePhotoSelect(url: string | null) {
    if (!photoTarget?.id) {
      setForm((f) => ({ ...f, photo_path: url }));
      return;
    }
    setBusy(true);
    try {
      await api<{ ok: boolean; employee: Employee }>(`/api/employees/${photoTarget.id}/photo`, {
        method: 'POST',
        body: JSON.stringify({ photo_path: url }),
      });
      toast('Photo de profil mise à jour avec succès.', 'success');
      setReload((v) => v + 1);
      if (detail && detail.employee.id === photoTarget.id) {
        setDetail({ ...detail, employee: { ...detail.employee, photo_path: url } });
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Échec de mise à jour photo.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setFormError(null);
    try {
      if (editing) {
        await api(`/api/employees/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            full_name: form.full_name,
            job_title: form.job_title,
            pin: form.pin.trim() ? form.pin.trim() : undefined,
            photo_path: form.photo_path,
          }),
        });
        toast('Fiche travailleur mise à jour.', 'success');
      } else {
        const res = await api<{ employee: Employee; account?: { login: string; role: string } }>('/api/employees', {
          method: 'POST',
          body: JSON.stringify({
            full_name: form.full_name,
            job_title: form.job_title,
            pin: form.pin.trim() ? form.pin.trim() : undefined,
            photo_path: form.photo_path || undefined,
            create_account: form.create_account,
            account_login: form.create_account ? form.account_login : undefined,
            account_password: form.create_account ? form.account_password : undefined,
            account_role: form.create_account ? form.account_role : undefined,
          }),
        });
        if (res.account) {
          toast(`Travailleur et compte @${res.account.login} créés avec succès !`, 'success');
        } else {
          toast('Nouveau travailleur créé avec badge automatique et code secret.', 'success');
        }
      }
      setFormOpen(false);
      setReload((value) => value + 1);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setBusy(false);
    }
  }

  async function savePin() {
    if (!pinModalFor) return;
    if (pinModalFor.has_pin && !pinOldValue.trim()) {
      setPinModalError('Veuillez renseigner votre ancien code PIN.');
      return;
    }
    if (!pinValue || pinValue.trim().length < 4) {
      setPinModalError('Le code secret PIN doit comporter au moins 4 chiffres.');
      return;
    }
    if (pinValue.trim() !== pinConfirmValue.trim()) {
      setPinModalError('La confirmation du code PIN ne correspond pas au nouveau code saisi.');
      return;
    }
    setPinModalBusy(true);
    setPinModalError(null);
    try {
      await api(`/api/employees/${pinModalFor.id}/pin`, {
        method: 'POST',
        body: JSON.stringify({
          old_pin: pinModalFor.has_pin ? pinOldValue.trim() : undefined,
          pin: pinValue.trim(),
        }),
      });
      toast(`Code secret PIN mis à jour pour ${pinModalFor.full_name}.`, 'success');
      setPinModalFor(null);
      setPinOldValue('');
      setPinValue('');
      setPinConfirmValue('');
      setReload((v) => v + 1);
    } catch (err) {
      setPinModalError(err instanceof Error ? err.message : 'Impossible de définir le code PIN.');
    } finally {
      setPinModalBusy(false);
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

  async function handleDeleteEmployee() {
    if (!deleteEmployeeFor) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await api(`/api/employees/${deleteEmployeeFor.id}`, { method: 'DELETE' });
      toast(`Fiche de ${deleteEmployeeFor.full_name} supprimée définitivement.`, 'success');
      setDeleteEmployeeFor(null);
      setReload((value) => value + 1);
      window.dispatchEvent(new CustomEvent('mf-refresh-data'));
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Suppression impossible.');
    } finally {
      setDeleteBusy(false);
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
        { label: 'Effectif Actif', value: employees.filter((e) => e.active).length },
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
            {canExportReports && (
              <>
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
              </>
            )}
            <Button size="sm" onClick={openLeave} icon={<CalendarIcon size={14} />}>
              Congé / Permission
            </Button>
            {canCreate && (
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
                {employees.filter((e) => e.active).length}
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
              <span className="text-[10px] uppercase font-bold text-ink-faint">Effectif de l'atelier</span>
              <p className="mt-1 font-mono text-2xl font-bold text-ink tabular-nums">{employees.filter((e) => e.active).length}</p>
              <p className="text-[10px] text-ink-faint mt-0.5">
                {employees.filter((e) => e.active).length === 0
                  ? 'Aucun travailleur actif'
                  : `${employees.filter((e) => e.active).length} travailleur${employees.filter((e) => e.active).length > 1 ? 's' : ''} en service`}
              </p>
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

          {/* Antigravity Structured Tableur (Style Image 3) */}
          <div className="rounded-xl border border-line bg-surface shadow-xs overflow-hidden">
            {/* Desktop & Tablet Tableur */}
            <div className="hidden sm:block overflow-x-auto scroll-thin">
              <table className="w-full text-left border-collapse text-xs table-rhythm">
                <thead>
                  <tr className="bg-paper-2 border-b border-line text-ink-faint font-semibold uppercase tracking-wider text-[11px]">
                    <th className="px-2.5 py-2.5 w-12 border-r border-line text-center col-lead">Photo</th>
                    <th className="px-3 py-2.5 min-w-44 border-r border-line col-lead">Identité &amp; Métier</th>
                    <th className="px-3 py-2.5 min-w-32 border-r border-line text-center">État d’aujourd’hui</th>
                    <th className="px-3 py-2.5 min-w-24 border-r border-line text-center">Badge QR</th>
                    <th className="px-3 py-2.5 min-w-24 border-r border-line text-center">Statut</th>
                    <th className="px-3 py-2.5 min-w-48 text-right col-actions">Actions rapides</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-xs text-ink-faint">
                        Aucun travailleur ne correspond à vos filtres.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((employee, idx) => (
                      <tr
                        key={employee.id}
                        onClick={() => setDetailFor(employee)}
                        className={cx(
                          'cursor-pointer transition-colors group',
                          idx % 2 === 0 ? 'bg-surface/95' : 'bg-surface-2/45',
                          'hover:bg-amber-wash/20',
                        )}
                      >
                        {/* Photo Thumbnail (Pilier Ancrage 1) */}
                        <td
                          className="px-2 py-1.5 text-center border-r border-line col-lead"
                          onClick={(e) => {
                            if (canPhoto) {
                              e.stopPropagation();
                              setPhotoTarget({ id: employee.id, current: employee.photo_path, name: employee.full_name });
                              setPhotoModalOpen(true);
                            }
                          }}
                        >
                          <span
                            className={cx(
                              'group relative mx-auto grid h-8 w-8 place-items-center rounded-full text-xs font-bold border shadow-xs overflow-hidden transition-colors',
                              canPhoto ? 'cursor-pointer hover:border-amber' : '',
                              employee.active ? 'bg-amber-wash text-amber border-amber/20' : 'bg-grey-wash text-ink-faint border-line',
                            )}
                            title={canPhoto ? 'Cliquer pour modifier la photo' : undefined}
                          >
                            {employee.photo_path ? (
                              <img src={employee.photo_path} alt={employee.full_name} className="h-full w-full object-cover" />
                            ) : (
                              initials(employee.full_name)
                            )}
                          </span>
                        </td>

                        {/* Name & Title (Pilier Ancrage 2) */}
                        <td className="px-3 py-2 border-r border-line col-lead">
                          <div className="font-semibold text-ink text-xs">{employee.full_name}</div>
                          <div className="text-[11px] text-ink-soft">
                            {employee.job_title} · <span className="font-mono text-ink-faint">{employee.id}</span>
                          </div>
                        </td>

                        {/* Today Attendance (Colonne Donnée 1) */}
                        <td className="px-3 py-2 border-r border-line text-center">
                          {dayChip(employee)}
                        </td>

                        {/* QR Badge (Colonne Donnée 2 - Format Métrique Capsule) */}
                        <td className="px-3 py-2 border-r border-line text-center">
                          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-paper-2 border border-line text-slate-200 tabular-nums shadow-2xs">
                            {employee.badge_token ?? '—'}
                          </span>
                        </td>

                        {/* Status (Colonne Donnée 3 - Badge Haute Visibilité) */}
                        <td className="px-3 py-2 border-r border-line text-center">
                          <span
                            className={cx(
                              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold border tracking-wider uppercase shadow-2xs',
                              employee.active
                                ? 'border-green/30 bg-green-wash text-green'
                                : 'border-line bg-grey-wash text-ink-faint',
                            )}
                          >
                            <span className={cx('h-1.5 w-1.5 rounded-full', employee.active ? 'bg-green animate-pulse' : 'bg-ink-faint')} />
                            {employee.active ? 'Actif' : 'Inactif'}
                          </span>
                        </td>

                        {/* Quick Actions (Colonne Clôture) */}
                        <td className="px-3 py-1.5 text-right col-actions" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            <Button size="sm" variant="secondary" className="text-xs font-bold border border-line shadow-xs hover:border-amber" onClick={() => setDetailFor(employee)}>
                              Détail
                            </Button>
                            {(canEdit || canPrintBadge) && (
                              <>
                                {canEdit && (
                                  <Button size="sm" variant="ghost" onClick={() => openEdit(employee)}>
                                    Modifier
                                  </Button>
                                )}
                                {canPrintBadge && (
                                  <Button size="sm" variant="ghost" onClick={() => setBadgeFor(employee)}>
                                    Badge
                                  </Button>
                                )}
                                {canEdit && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant={employee.active ? 'outline-danger' : 'secondary'}
                                      onClick={() => void toggleActive(employee)}
                                    >
                                      {employee.active ? 'Désactiver' : 'Activer'}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => {
                                        setDeleteEmployeeFor(employee);
                                        setDeleteError(null);
                                      }}
                                      className="h-7 w-7 p-0 text-ink-faint hover:text-red hover:bg-red/10"
                                      title={`Supprimer définitivement ${employee.full_name}`}
                                    >
                                      <Trash2 size={13} />
                                    </Button>
                                  </>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards (Touch-friendly & Clean) */}
            <div className="sm:hidden divide-y divide-line">
              {filtered.length === 0 ? (
                <div className="p-6 text-center text-xs text-ink-faint">
                  Aucun travailleur ne correspond à vos filtres.
                </div>
              ) : (
                filtered.map((employee) => (
                  <div
                    key={employee.id}
                    onClick={() => setDetailFor(employee)}
                    className="p-3.5 space-y-2.5 active:bg-surface-2/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={cx(
                            'grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold border shadow-xs overflow-hidden',
                            employee.active ? 'bg-amber-wash text-amber border-amber/20' : 'bg-grey-wash text-ink-faint border-line',
                          )}
                        >
                          {employee.photo_path ? (
                            <img src={employee.photo_path} alt={employee.full_name} className="h-full w-full object-cover" />
                          ) : (
                            initials(employee.full_name)
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-ink">{employee.full_name}</p>
                          <p className="truncate text-[11px] text-ink-soft">
                            {employee.job_title} · <span className="font-mono text-ink-faint">{employee.id}</span>
                          </p>
                        </div>
                      </div>
                      <div className="shrink-0">{dayChip(employee)}</div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-line/40 text-xs">
                      <span className="font-mono text-[11px] text-ink-faint">
                        Badge : <strong className="text-ink">{employee.badge_token ?? '—'}</strong>
                      </span>
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button size="sm" variant="ghost" onClick={() => setDetailFor(employee)}>
                          Détail
                        </Button>
                        {canManage && (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => openEdit(employee)}>
                              Modifier
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setDeleteEmployeeFor(employee);
                                setDeleteError(null);
                              }}
                              className="h-8 w-8 p-0 text-red hover:bg-red/10"
                              title="Supprimer ce travailleur"
                            >
                              <Trash2 size={14} />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
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
            canManage={canManageLeaves}
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
              <div
                onClick={() => {
                  if (canPhoto) {
                    setPhotoTarget({ id: detail.employee.id, current: detail.employee.photo_path, name: detail.employee.full_name });
                    setPhotoModalOpen(true);
                  }
                }}
                className={cx(
                  'group relative grid h-20 w-20 shrink-0 place-items-center rounded-2xl text-xl font-bold border shadow-xs overflow-hidden',
                  canPhoto ? 'cursor-pointer hover:border-amber transition-colors' : '',
                  detail.employee.photo_path ? 'border-line' : 'bg-amber-wash text-amber border-amber/20',
                )}
                title={canPhoto ? "Cliquer pour modifier la photo de profil (WhatsApp)" : undefined}
              >
                {detail.employee.photo_path ? (
                  <img src={detail.employee.photo_path} alt={detail.employee.full_name} className="h-full w-full object-cover" />
                ) : (
                  initials(detail.employee.full_name)
                )}
                {canPhoto && (
                  <span className="absolute inset-0 bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera size={20} />
                  </span>
                )}
              </div>
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
                {canPhoto ? (
                  <button
                    type="button"
                    onClick={() => {
                      setPhotoTarget({ id: detail.employee.id, current: detail.employee.photo_path, name: detail.employee.full_name });
                      setPhotoModalOpen(true);
                    }}
                    className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-amber hover:underline"
                  >
                    <Camera size={13} /> {detail.employee.photo_path ? 'Modifier la photo' : 'Ajouter une photo de profil'}
                  </button>
                ) : null}

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span
                    className={cx(
                      'rounded-full px-2 py-0.5 text-[10px] font-bold border',
                      detail.employee.has_pin
                        ? 'border-green/20 bg-green-wash text-green'
                        : 'border-amber/20 bg-amber-wash text-amber',
                    )}
                  >
                    {detail.employee.has_pin ? 'Code PIN configuré' : 'Sans code PIN'}
                  </span>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => {
                        setPinModalFor(detail.employee);
                        setPinValue('');
                        setPinModalError(null);
                      }}
                      className="text-xs text-amber hover:underline font-semibold"
                    >
                      {detail.employee.has_pin ? 'Modifier le code PIN' : 'Définir un code PIN'}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Tab Selector: Profil vs Établi / Kit d'outils */}
            <div className="flex items-center gap-2 border-b border-line pb-2">
              <button
                type="button"
                onClick={() => setActiveDetailTab('profil')}
                className={cx(
                  'px-3 py-1.5 text-xs font-bold rounded-lg transition-all',
                  activeDetailTab === 'profil'
                    ? 'bg-amber text-slate-950 shadow-xs'
                    : 'text-ink-soft hover:text-ink hover:bg-paper-2',
                )}
              >
                Fiche & Pointages
              </button>
              <button
                type="button"
                onClick={() => setActiveDetailTab('etabli')}
                className={cx(
                  'flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all',
                  activeDetailTab === 'etabli'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-ink-soft hover:text-ink hover:bg-paper-2',
                )}
              >
                <span>Établi & Boîte à Outils</span>
                {employeeKit?.kit ? (
                  <span className="rounded-full bg-emerald-500/20 text-emerald-400 px-1.5 py-0.2 text-[10px] font-mono">
                    N°{employeeKit.kit.etabli_number}
                  </span>
                ) : (
                  <span className="text-[10px] text-ink-faint">(Non doté)</span>
                )}
              </button>
            </div>

            {activeDetailTab === 'etabli' ? (
              <div className="space-y-4">
                {employeeKit?.kit ? (
                  <EtabliKitCard
                    kit={employeeKit.kit}
                    items={employeeKit.items}
                    canManage={canEdit}
                    onRefresh={() => {
                      if (detailFor) {
                        api<{ kit: EtabliKit | null; items: EtabliKitItem[] }>(`/api/kits/by-employee/${detailFor.id}`)
                          .then((res) => setEmployeeKit(res))
                          .catch(() => {});
                      }
                    }}
                  />
                ) : (
                  <div className="rounded-xl border border-dashed border-line p-6 text-center text-xs text-ink-soft">
                    <p className="font-semibold text-ink">Aucun kit d'établi nominatif affecté.</p>
                    <p className="mt-1">
                      Les kits d'établis fixes sont réservés aux artisans et postes dotés selon l'inventaire officiel du CFTM.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-3 gap-3">
                  <StatBox label="Jours ce mois" value={String(detail.month.daysPresent)} />
                  <StatBox label="Retards" value={String(detail.month.lateCount)} tone={detail.month.lateCount > 0 ? 'amber' : undefined} />
                  <StatBox label="Pauses" value={String(detail.month.breaks)} />
                </div>

                {detail.openLoans.length > 0 && (
                  <section>
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-faint">
                      Outils empruntés au magasin ({detail.openLoans.length})
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
                      <table className="w-full text-left sheet-grid text-xs table-rhythm">
                        <thead>
                          <tr>
                            <th className="sheet-th col-lead">Date</th>
                            <th className="sheet-th text-center">Arrivée</th>
                            <th className="sheet-th text-center">Pause</th>
                            <th className="sheet-th text-center">Départ</th>
                            <th className="sheet-th text-center">Retard</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                          {detail.history.map((row, idx) => (
                            <tr
                              key={row.date}
                              className={cx(
                                'transition-colors',
                                idx % 2 === 0 ? 'bg-surface/95' : 'bg-surface-2/45',
                                'hover:bg-amber-wash/20',
                              )}
                            >
                              <td className="sheet-cell font-mono tabular-nums col-lead font-semibold">{row.date}</td>
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
            )}
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

          {/* Photo de profil (WhatsApp Style) */}
          <div className="flex items-center gap-3.5 p-3 rounded-xl border border-line bg-paper">
            <div
              onClick={() => {
                setPhotoTarget({ id: editing?.id, current: form.photo_path, name: form.full_name || 'Travailleur' });
                setPhotoModalOpen(true);
              }}
              className="group relative grid h-16 w-16 shrink-0 place-items-center rounded-full border-2 border-dashed border-line-strong bg-surface cursor-pointer hover:border-amber overflow-hidden transition-all shadow-xs"
              title="Cliquer pour prendre ou choisir une photo"
            >
              {form.photo_path ? (
                <img src={form.photo_path} alt="Profil" className="h-full w-full object-cover" />
              ) : (
                <div className="flex flex-col items-center justify-center p-1 text-center">
                  <Camera size={18} className="text-amber group-hover:scale-110 transition-transform" />
                  <span className="text-[9px] font-bold text-ink-soft mt-0.5">Photo</span>
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-ink">Photo de profil (WhatsApp)</p>
              <p className="text-[11px] text-ink-faint">
                Photo portrait par caméra ou importation pour le badge officiel et la fiche.
              </p>
              <div className="mt-1.5 flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  icon={<Camera size={13} />}
                  onClick={() => {
                    setPhotoTarget({ id: editing?.id, current: form.photo_path, name: form.full_name || 'Travailleur' });
                    setPhotoModalOpen(true);
                  }}
                >
                  {form.photo_path ? 'Changer la photo' : 'Prendre / Choisir photo'}
                </Button>
                {form.photo_path ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-red"
                    onClick={() => setForm((f) => ({ ...f, photo_path: null }))}
                  >
                    Supprimer
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          {/* Decoy hidden inputs to prevent Chrome / Edge aggressive autofill on worker form */}
          <div style={{ display: 'none' }} aria-hidden="true">
            <input type="text" name="fake_worker_username" tabIndex={-1} autoComplete="off" />
            <input type="password" name="fake_worker_password" tabIndex={-1} autoComplete="off" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">Nom complet</label>
            <input
              type="text"
              name="worker_full_name"
              id="worker_full_name"
              autoComplete="off"
              data-lpignore="true"
              data-1p-ignore="true"
              value={form.full_name}
              placeholder="Ex : Landry ONANA"
              onChange={(e) => {
                const name = e.target.value;
                const autoLogin = name
                  .trim()
                  .normalize('NFD')
                  .replace(/[\u0300-\u036f]/g, '')
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, '.')
                  .replace(/^\.+|\.+$/g, '')
                  .slice(0, 32);
                setForm((prev) => ({
                  ...prev,
                  full_name: name,
                  account_login: prev.account_login && prev.account_login !== prev.full_name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '.') ? prev.account_login : autoLogin,
                }));
              }}
              className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink focus:border-amber focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">
              Rôle / Poste (Défini par la Direction)
            </label>
            <select
              value={form.account_role}
              onChange={(e) => {
                const selectedId = e.target.value;
                const r = availableRoles.find((item) => item.id === selectedId);
                setForm((prev) => ({
                  ...prev,
                  account_role: selectedId,
                  job_title: r ? r.name : selectedId,
                }));
              }}
              className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink focus:border-amber focus:outline-none"
            >
              {availableRoles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">
              Code secret PIN de pointage {editing ? '(Optionnel - laisser vide pour conserver)' : '(4 à 6 chiffres)'}
            </label>
            <PasswordInput
              name="worker_punch_pin"
              id="worker_punch_pin"
              autoComplete="new-password"
              data-lpignore="true"
              data-1p-ignore="true"
              inputMode="numeric"
              maxLength={6}
              value={form.pin}
              placeholder={editing ? '••••' : 'Ex : 1234'}
              onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, '') })}
              className="h-10 w-full rounded-lg border border-line bg-surface px-3 font-mono text-sm tracking-widest text-ink focus:border-amber focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-ink-faint">
              Obligatoire pour valider le pointage sur la borne après scan du badge.
            </p>
          </div>

          {/* Seamless Account Creation */}
          {!editing && canCreate && (
            <div className="rounded-xl border border-line bg-paper/60 p-3.5 space-y-3">
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.create_account}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setForm((f) => ({
                      ...f,
                      create_account: checked,
                    }));
                  }}
                  className="h-4 w-4 rounded border-line-strong text-amber accent-[#d9480f] focus:ring-amber"
                />
                <div>
                  <span className="text-xs font-semibold text-ink">
                    Créer un compte d’accès applicatif pour ce travailleur
                  </span>
                  <span className="block text-[11px] text-ink-soft">
                    Active l'accès direct avec les privilèges du rôle sélectionné ci-dessus.
                  </span>
                </div>
              </label>

              {form.create_account && (
                <div className="pt-2.5 border-t border-line grid gap-3 sm:grid-cols-2 animate-in fade-in duration-200">
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-ink-soft">Identifiant de connexion</label>
                    <input
                      type="text"
                      value={form.account_login}
                      placeholder={
                        form.full_name.trim()
                          ? `Ex : ${form.full_name
                              .trim()
                              .normalize('NFD')
                              .replace(/[\u0300-\u036f]/g, '')
                              .toLowerCase()
                              .replace(/[^a-z0-9]+/g, '.')
                              .replace(/^\.+|\.+$/g, '')
                              .slice(0, 24)}`
                          : 'Ex : landry.onana'
                      }
                      onChange={(e) => setForm({ ...form, account_login: e.target.value.toLowerCase() })}
                      className="h-9 w-full rounded-lg border border-line bg-surface px-2.5 font-mono text-xs text-ink focus:border-amber focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-ink-soft">Mot de passe temporaire</label>
                    <PasswordInput
                      value={form.account_password}
                      placeholder="Par défaut : identique au PIN ou Monastere2026!"
                      onChange={(e) => setForm({ ...form, account_password: e.target.value })}
                      className="h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-xs text-ink focus:border-amber focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </div>
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

      {/* Modal: Définir / Modifier code PIN secret */}
      <Modal
        open={!!pinModalFor}
        title={pinModalFor?.has_pin ? `Modifier le code PIN · ${pinModalFor?.full_name}` : `Définir un code PIN · ${pinModalFor?.full_name}`}
        onClose={() => {
          setPinModalFor(null);
          setPinOldValue('');
          setPinValue('');
          setPinConfirmValue('');
          setPinModalError(null);
        }}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setPinModalFor(null);
                setPinOldValue('');
                setPinValue('');
                setPinConfirmValue('');
                setPinModalError(null);
              }}
            >
              Annuler
            </Button>
            <Button
              variant="primary"
              disabled={
                pinModalBusy ||
                pinValue.trim().length < 4 ||
                pinConfirmValue.trim().length < 4 ||
                (!!pinModalFor?.has_pin && !pinOldValue.trim())
              }
              onClick={() => void savePin()}
            >
              {pinModalBusy ? <Spinner /> : 'Enregistrer le code PIN'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div style={{ display: 'none' }} aria-hidden="true">
            <input type="text" name="fake_pin_user" tabIndex={-1} autoComplete="off" />
            <input type="password" name="fake_pin_pass" tabIndex={-1} autoComplete="off" />
          </div>
          <p className="text-xs text-ink-soft">
            {pinModalFor?.has_pin
              ? `Modification sécurisée du code secret PIN pour ${pinModalFor?.full_name}.`
              : `Définissez un code secret PIN (4 à 6 chiffres) pour ${pinModalFor?.full_name}.`}
          </p>
          {pinModalError ? <Banner tone="error">{pinModalError}</Banner> : null}

          {pinModalFor?.has_pin && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-soft">Ancien code PIN</label>
              <PasswordInput
                inputMode="numeric"
                maxLength={6}
                value={pinOldValue}
                placeholder="••••"
                onChange={(e) => setPinOldValue(e.target.value.replace(/\D/g, ''))}
                className="h-10 w-full rounded-btn border border-line-strong bg-surface px-3 font-mono text-sm tracking-widest text-ink focus:border-amber focus:outline-none"
              />
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-soft">
              {pinModalFor?.has_pin ? 'Nouveau code secret PIN' : 'Code secret PIN (4 à 6 chiffres)'}
            </label>
            <PasswordInput
              inputMode="numeric"
              maxLength={6}
              value={pinValue}
              placeholder="Ex: 1234"
              onChange={(e) => setPinValue(e.target.value.replace(/\D/g, ''))}
              className="h-10 w-full rounded-btn border border-line-strong bg-surface px-3 font-mono text-sm tracking-widest text-ink focus:border-amber focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-soft">Confirmer le code secret PIN</label>
            <PasswordInput
              inputMode="numeric"
              maxLength={6}
              value={pinConfirmValue}
              placeholder="Répétez le code"
              onChange={(e) => setPinConfirmValue(e.target.value.replace(/\D/g, ''))}
              className="h-10 w-full rounded-btn border border-line-strong bg-surface px-3 font-mono text-sm tracking-widest text-ink focus:border-amber focus:outline-none"
            />
          </div>
        </div>
      </Modal>

      {/* Modal: Supprimer définitivement un travailleur */}
      <Modal
        open={!!deleteEmployeeFor}
        title={`Supprimer ${deleteEmployeeFor?.full_name ?? ''}`}
        onClose={() => {
          if (!deleteBusy) {
            setDeleteEmployeeFor(null);
            setDeleteError(null);
          }
        }}
        footer={
          <>
            <Button
              variant="ghost"
              disabled={deleteBusy}
              onClick={() => {
                setDeleteEmployeeFor(null);
                setDeleteError(null);
              }}
            >
              Annuler
            </Button>
            <Button
              variant="danger"
              disabled={deleteBusy}
              onClick={() => void handleDeleteEmployee()}
            >
              {deleteBusy ? <Spinner /> : 'Supprimer définitivement'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {deleteError ? <Banner tone="error">{deleteError}</Banner> : null}
          <p className="text-sm text-ink">
            Êtes-vous sûr de vouloir supprimer définitivement la fiche de{' '}
            <strong>{deleteEmployeeFor?.full_name}</strong> ({deleteEmployeeFor?.id}) ?
          </p>
          <div className="rounded-xl border border-line bg-paper-2 p-3 text-xs text-ink-soft space-y-1">
            <p className="font-semibold text-ink flex items-center gap-1.5">
              <AlertTriangle size={13} className="text-amber" /> Impact de la suppression
            </p>
            <p>
              Cette opération retire définitivement le profil travailleur, son badge et délie tout compte applicatif rattaché.
              Si ce travailleur a des outils actuellement en prêt non restitués, la suppression sera bloquée par sécurité.
            </p>
          </div>
        </div>
      </Modal>

      {/* Modal Photo Travailleur (Caméra Portrait / Galerie) */}
      <ImagePickerModal
        open={photoModalOpen}
        title={photoTarget?.name ? `Photo : ${photoTarget.name}` : 'Photo de profil (WhatsApp)'}
        currentImage={photoTarget?.current}
        category="employees"
        defaultFacingMode="user"
        onClose={() => setPhotoModalOpen(false)}
        onSelect={(url) => void handleEmployeePhotoSelect(url)}
      />

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

      {/* Corps : Identité & Photo à gauche, QR Code à droite */}
      <div className="flex flex-1 items-center justify-between gap-2.5 py-1">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {/* Photo portrait officielle style badge professionnel */}
          <div className={cx(
            'shrink-0 rounded-lg overflow-hidden border border-gray-300 bg-gray-100 flex items-center justify-center font-bold text-gray-600',
            isPreview ? 'h-16 w-14 text-sm' : 'h-[17mm] w-[14mm] text-[8pt]',
          )}>
            {employee.photo_path ? (
              <img src={employee.photo_path} alt={employee.full_name} className="h-full w-full object-cover" />
            ) : (
              <span>{initials(employee.full_name)}</span>
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-0.5">
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
