import { useEffect, useMemo, useRef, useState } from 'react';
import {
  api,
  type Employee,
  type EmployeeDetail,
  type Leave,
  type ScanResult,
  type TodayEmployee,
  type User,
  type EtabliKit,
  type EtabliKitItem,
  type Holiday,
  deleteLeave,
  updateLeave,
  purgeLeavesTestData,
  deleteHoliday,
  declarePresidentialDecree,
} from '../lib/api';
import { QR_PREFIX } from '../lib/qr';
import { usePrintSheet } from '../lib/print';
import { formatDate, initials } from '../lib/labels';
import { EtabliKitCard } from '../components/EtabliKitCard';
import { useUndo } from '../components/UndoToast';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { QrCode } from '../components/QrCode';
import {
  AlertTriangle,
  Calendar as CalendarIcon,
  CalendarCheck2,
  Camera,
  Clock,
  Download,
  Edit3,
  FileSpreadsheet,
  Flag,
  KeyRound,
  Menu,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Trash2,
  User as UserIcon,
  UserPlus,
  Users,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { ImagePickerModal } from '../components/ImagePickerModal';
import { exportToExcel, exportToPdf } from '../lib/export';

export const WEEKDAY_OPTIONS = [
  { day: 1, label: 'Lun', full: 'Lundi' },
  { day: 2, label: 'Mar', full: 'Mardi' },
  { day: 3, label: 'Mer', full: 'Mercredi' },
  { day: 4, label: 'Jeu', full: 'Jeudi' },
  { day: 5, label: 'Ven', full: 'Vendredi' },
  { day: 6, label: 'Sam', full: 'Samedi' },
  { day: 0, label: 'Dim', full: 'Dimanche' },
] as const;

export function formatWorkdaysLabels(workdays?: number[]): string {
  const days = workdays && workdays.length > 0 ? workdays : [1, 2, 3, 4, 5];
  const set = new Set(days);
  return WEEKDAY_OPTIONS.filter((o) => set.has(o.day)).map((o) => o.label).join(', ');
}

export function formatPillName(name: string | undefined): string {
  if (!name) return 'Ouvrier';
  const clean = name.replace(/\s+/g, ' ').trim();
  const parts = clean.split(' ');
  if (parts.length <= 1) return clean;
  const p0 = parts[0] ?? '';
  const p0Lower = p0.toLowerCase().replace(/[.,]/g, '');

  if (p0Lower === 'm' || p0Lower === 'mme' || p0Lower === 'mlle') {
    const second = parts[1] ?? '';
    const thirdInitial = parts[2] ? ` ${parts[2][0]}.` : '';
    return `${p0} ${second}${thirdInitial}`;
  }
  if (p0Lower === 'frere' || p0Lower === 'frère' || p0Lower === 'pere' || p0Lower === 'père') {
    const second = parts[1] ?? '';
    const thirdInitial = parts[2] ? ` ${parts[2][0]}.` : '';
    return `${p0} ${second}${thirdInitial}`;
  }
  // Otherwise: "Nom P." (e.g. "AHANGA S.")
  const first = parts[0];
  const secondInitial = parts[1] ? ` ${parts[1][0]}.` : '';
  return `${first}${secondInitial}`;
}

export function computeWorkingDays(
  fromDate: string,
  toDate: string,
  holidays: Holiday[] = [],
  workdays: number[] = [1, 2, 3, 4, 5]
): number {
  if (!fromDate || !toDate) return 0;
  // Découpage robuste AAAA-MM-JJ pour éviter tout décalage de fuseau horaire
  const [sy, sm, sd] = fromDate.slice(0, 10).split('-').map(Number);
  const [ey, em, ed] = toDate.slice(0, 10).split('-').map(Number);
  if (!sy || !sm || !sd || !ey || !em || !ed) return 0;

  const start = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  if (start > end) return 0;

  const holidayDates = new Set(holidays.map((h) => h.holiday_date));
  // RÈGLE CFTM STRICTE (Consigne WhatsApp / Monastère) :
  // Le samedi (6) et le dimanche (0) ne sont JAMAIS comptabilisés comme jours ouvrés consommés dans les congés.
  // Seuls les jours du lundi (1) au vendredi (5) faisant partie des jours ouvrés du travailleur sont comptés.
  const rawWorkdays = workdays && workdays.length > 0 ? workdays : [1, 2, 3, 4, 5];
  const strictlyOuvrables = rawWorkdays.filter((d) => d >= 1 && d <= 5);
  const workdaySet = new Set(strictlyOuvrables.length > 0 ? strictlyOuvrables : [1, 2, 3, 4, 5]);

  let count = 0;
  const cur = new Date(start);

  while (cur <= end) {
    const dayOfWeek = cur.getDay(); // 0 = Dimanche, 1 = Lundi, ..., 6 = Samedi
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    const dStr = `${y}-${m}-${d}`;

    // Exclusion stricte du week-end (samedi et dimanche) et des jours fériés chômés
    if (dayOfWeek !== 0 && dayOfWeek !== 6 && workdaySet.has(dayOfWeek) && !holidayDates.has(dStr)) {
      count++;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

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
 * Système interactif et cognitif de planification des congés, permissions et jours fériés officiels
 */
function TimeOffCalendarView({
  leaves,
  employees,
  holidays = [],
  onReview,
  onRevokeLeave,
  onUpdateLeave,
  onDeleteHoliday,
  canManage,
  currentMonth,
  viewMode,
  filterKind,
  setFilterKind,
  filterEmpId,
  setFilterEmpId,
  filterStatus,
  setFilterStatus,
}: {
  leaves: Leave[];
  employees: Employee[];
  holidays?: Holiday[];
  onReview: (leave: Leave, status: 'approved' | 'rejected') => void;
  onRevokeLeave?: (leave: Leave) => void;
  onUpdateLeave?: (
    id: number,
    data: { from_date?: string; to_date?: string; kind?: 'conge' | 'permission' | 'absence'; note?: string | null }
  ) => Promise<void>;
  onDeleteHoliday?: (holiday: Holiday) => void;
  canManage: boolean;
  currentMonth: Date;
  viewMode: 'calendar' | 'table';
  filterKind: 'all' | 'conge' | 'permission' | 'absence' | 'ferie';
  setFilterKind: (k: 'all' | 'conge' | 'permission' | 'absence' | 'ferie') => void;
  filterEmpId: string;
  setFilterEmpId: (id: string) => void;
  filterStatus: 'all' | 'approved' | 'pending' | 'rejected';
  setFilterStatus: (s: 'all' | 'approved' | 'pending' | 'rejected') => void;
}) {
  const weekdayTrackRef = useRef<HTMLDivElement>(null);
  const calendarTrackRef = useRef<HTMLDivElement>(null);
  const [stickyWeekdayTop, setStickyWeekdayTop] = useState(0);
  const [selectedLeave, setSelectedLeave] = useState<Leave | null>(null);
  const [editingLeave, setEditingLeave] = useState<Leave | null>(null);
  const [editForm, setEditForm] = useState<{
    from_date: string;
    to_date: string;
    kind: 'conge' | 'permission' | 'absence';
    note: string;
  }>({ from_date: '', to_date: '', kind: 'conge', note: '' });
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [selectedHoliday, setSelectedHoliday] = useState<Holiday | null>(null);
  const [selectedDayOverview, setSelectedDayOverview] = useState<{
    dateStr: string;
    dayNum: number;
    holidays: Holiday[];
    leaves: Leave[];
  } | null>(null);

  useEffect(() => {
    const toolbar = document.querySelector<HTMLElement>('[data-timeoff-sticky-toolbar="true"]');
    if (!toolbar) return;
    const updateOffset = () => {
      const stickyTop = Number.parseFloat(window.getComputedStyle(toolbar).top) || 0;
      setStickyWeekdayTop(Math.ceil(stickyTop + toolbar.getBoundingClientRect().height));
    };
    updateOffset();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateOffset) : null;
    observer?.observe(toolbar);
    window.addEventListener('resize', updateOffset);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateOffset);
    };
  }, []);

  const syncCalendarHorizontalScroll = (source: 'weekday' | 'calendar') => {
    const sourceEl = source === 'weekday' ? weekdayTrackRef.current : calendarTrackRef.current;
    const targetEl = source === 'weekday' ? calendarTrackRef.current : weekdayTrackRef.current;
    if (sourceEl && targetEl && targetEl.scrollLeft !== sourceEl.scrollLeft) {
      targetEl.scrollLeft = sourceEl.scrollLeft;
    }
  };

  function startEditingLeave(leave: Leave) {
    setEditingLeave(leave);
    setEditForm({
      from_date: String(leave.from_date || '').slice(0, 10),
      to_date: String(leave.to_date || '').slice(0, 10),
      kind: leave.kind,
      note: leave.note ?? '',
    });
    setEditError(null);
  }

  async function saveEditedLeave() {
    if (!editingLeave || !onUpdateLeave) return;
    if (!editForm.from_date || !editForm.to_date) {
      setEditError('Les dates sont obligatoires.');
      return;
    }
    setEditBusy(true);
    setEditError(null);
    try {
      await onUpdateLeave(editingLeave.id, {
        from_date: editForm.from_date,
        to_date: editForm.to_date,
        kind: editForm.kind,
        note: editForm.kind === 'conge' ? null : editForm.note.trim() || null,
      });
      setSelectedLeave((prev) =>
        prev && prev.id === editingLeave.id
          ? {
              ...prev,
              from_date: editForm.from_date,
              to_date: editForm.to_date,
              kind: editForm.kind,
              note: editForm.kind === 'conge' ? null : editForm.note.trim() || null,
            }
          : prev
      );
      setEditingLeave(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Erreur lors de la modification');
    } finally {
      setEditBusy(false);
    }
  }

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = (new Date(year, month, 1).getDay() + 6) % 7; // Lundi = 0

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blanks = Array.from({ length: firstDayIndex }, (_, i) => i);

  // Demandes en attente
  const pendingLeaves = useMemo(() => leaves.filter((l) => l.status === 'pending'), [leaves]);

  // Date du jour au format ISO YYYY-MM-DD
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Filtrage des congés pour ce mois avec critères normalisés
  const monthLeaves = useMemo(() => {
    const startStr = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const endStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    return leaves.filter((l) => {
      // Normalisation sécurisée des dates (support YYYY-MM-DD ou ISO)
      const lFrom = String(l.from_date || '').slice(0, 10);
      const lTo = String(l.to_date || '').slice(0, 10);
      if (!lFrom || !lTo) return false;
      const inMonth = lFrom <= endStr && lTo >= startStr;
      if (!inMonth) return false;

      // Filtre de type
      if (filterKind !== 'all' && filterKind !== 'ferie') {
        if (l.kind !== filterKind) return false;
      }

      // Filtre d'employé
      if (filterEmpId !== 'all' && String(l.employee_id) !== String(filterEmpId)) return false;

      // Filtre de statut
      if (filterStatus !== 'all' && l.status !== filterStatus) return false;

      return true;
    });
  }, [leaves, year, month, daysInMonth, filterKind, filterEmpId, filterStatus]);

  // Fériés du mois
  const monthHolidays = useMemo(() => {
    const startStr = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const endStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
    return holidays.filter((h) => h.holiday_date >= startStr && h.holiday_date <= endStr);
  }, [holidays, year, month, daysInMonth]);

  // Jibble KPI: Ouvriers absents ou en congé aujourd'hui
  const todayOnLeave = useMemo(() => {
    return leaves.filter((l) => {
      const lFrom = String(l.from_date || '').slice(0, 10);
      const lTo = String(l.to_date || '').slice(0, 10);
      return l.status === 'approved' && todayStr >= lFrom && todayStr <= lTo;
    });
  }, [leaves, todayStr]);

  // Jibble KPI: Total jours ouvrés posés ce mois (tous salariés confondus avec jours ouvrés personnalisés)
  const monthWorkingDaysCount = useMemo(() => {
    return monthLeaves
      .filter((l) => l.status === 'approved')
      .reduce((sum, l) => {
        const emp = employees.find((e) => String(e.id) === String(l.employee_id));
        return sum + computeWorkingDays(l.from_date, l.to_date, holidays, emp?.workdays);
      }, 0);
  }, [monthLeaves, holidays, employees]);

  // Jibble Balances: Solde de congés pour l'ouvrier sélectionné (Politique standard Cameroun : 18 jours ouvrés légaux / 24 jours ouvrables)
  const selectedEmpBalance = useMemo(() => {
    if (filterEmpId === 'all') return null;
    const currentYear = new Date().getFullYear();
    const annualQuota = 18; // 18 jours ouvrés légaux
    const empLeaves = leaves.filter((l) => {
      if (String(l.employee_id) !== String(filterEmpId)) return false;
      if (l.kind !== 'conge' || l.status !== 'approved') return false;
      const lFrom = String(l.from_date || '').slice(0, 10);
      return lFrom.startsWith(String(currentYear));
    });
    const emp = employees.find((e) => String(e.id) === String(filterEmpId));
    const empWorkdays = emp?.workdays ?? [1, 2, 3, 4, 5];
    const takenDays = empLeaves.reduce((acc, l) => acc + computeWorkingDays(l.from_date, l.to_date, holidays, empWorkdays), 0);
    const remainingDays = Math.max(0, annualQuota - takenDays);
    return {
      empName: emp?.full_name ?? 'Ouvrier',
      photo_path: emp?.photo_path ?? null,
      annualQuota,
      takenDays,
      remainingDays,
      workdays: empWorkdays,
      percentUsed: Math.min(100, Math.round((takenDays / annualQuota) * 100)),
    };
  }, [filterEmpId, leaves, employees, holidays]);

  return (
    <div className="space-y-5">
      {/* 1. Bandeau des demandes en attente de validation */}
      {pendingLeaves.length > 0 && (
        <Card className="border-amber/40 bg-amber-wash/30 p-4 shadow-card">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-ink flex items-center gap-2">
              <Clock size={16} className="text-amber" />
              Demandes de permissions exceptionnelles en attente ({pendingLeaves.length})
            </span>
            <span className="text-[11px] text-amber font-semibold bg-amber/10 px-2 py-0.5 rounded-full border border-amber/20">
              Décision Direction requise
            </span>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {pendingLeaves.map((l) => (
              <div
                key={l.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3 text-xs shadow-xs hover:border-amber/40 transition-colors"
              >
                <button
                  type="button"
                  onClick={() => setSelectedLeave(l)}
                  className="min-w-0 text-left hover:underline cursor-pointer group flex-1"
                >
                  <p className="font-bold text-ink group-hover:text-amber transition-colors flex items-center gap-1.5">
                    {l.full_name}
                    <span className="text-[10px] text-ink-faint font-normal font-mono">({l.employee_id})</span>
                  </p>
                  <p className="text-ink-soft text-[11px] mt-0.5">
                    <span className="capitalize font-semibold text-amber">
                      {l.kind === 'permission' ? 'Permission Exceptionnelle' : l.kind}
                    </span>{' '}
                    : Du {formatDate(l.from_date)} au {formatDate(l.to_date)}
                  </p>
                  {l.note && <p className="text-[11px] text-ink italic truncate mt-0.5 max-w-[280px]">« {l.note} »</p>}
                </button>

                {canManage && (
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onReview(l, 'approved')}
                      className="rounded-lg bg-green px-2.5 py-1 text-[11px] font-bold text-white hover:bg-green-2 active:scale-95 transition-all shadow-xs"
                      title="Accorder la permission"
                    >
                      Accepter
                    </button>
                    <button
                      type="button"
                      onClick={() => onReview(l, 'rejected')}
                      className="rounded-lg bg-surface-2 border border-line px-2 py-1 text-[11px] font-medium text-ink-soft hover:bg-red-wash hover:text-red active:scale-95 transition-all"
                      title="Refuser la demande"
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

      {/* 2. Jibble KPI & Métriques Time-Off en Temps Réel */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Card 1: Demandes en attente */}
        <div
          onClick={() => {
            setFilterStatus('pending');
            setFilterKind('all');
          }}
          className={cx(
            'flex flex-col justify-between rounded-xl border p-3.5 shadow-xs cursor-pointer transition-all hover:scale-[1.01]',
            pendingLeaves.length > 0
              ? 'border-amber/40 bg-amber-wash/30 text-amber'
              : 'border-line bg-surface text-ink'
          )}
          title="Cliquer pour afficher uniquement les demandes en attente de visa"
        >
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-ink-soft">En attente de visa</span>
            <Clock size={15} className={pendingLeaves.length > 0 ? 'text-amber animate-pulse' : 'text-ink-faint'} />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold tracking-tight">{pendingLeaves.length}</span>
            <span className="text-[11px] text-ink-soft">demande(s)</span>
          </div>
          <span className="text-[10px] text-ink-faint mt-1 block">
            {pendingLeaves.length > 0 ? '⚠️ Cliquez pour examiner' : 'À jour'}
          </span>
        </div>

        {/* Card 2: En congé / absence aujourd'hui */}
        <div className="flex flex-col justify-between rounded-xl border border-line bg-surface p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-ink-soft">Absents aujourd'hui</span>
            <span className="h-2 w-2 rounded-full bg-blue" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold tracking-tight text-ink">{todayOnLeave.length}</span>
            <span className="text-[11px] text-ink-soft">salarié(s)</span>
          </div>
          <span className="text-[10px] text-ink-faint mt-1 truncate">
            {todayOnLeave.length > 0
              ? todayOnLeave.map((l) => l.full_name?.split(' ')[0]).join(', ')
              : 'Tous présents à l’atelier'}
          </span>
        </div>

        {/* Card 3: Jours ouvrés pris ce mois */}
        <div className="flex flex-col justify-between rounded-xl border border-line bg-surface p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-ink-soft">Jours posés (ce mois)</span>
            <CalendarCheck2 size={15} className="text-ink-faint" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold tracking-tight text-ink">{monthWorkingDaysCount}</span>
            <span className="text-[11px] text-ink-soft">j. ouvrés nets</span>
          </div>
          <span className="text-[10px] text-ink-faint mt-1 block">
            {monthLeaves.length} mouvement(s) ce mois
          </span>
        </div>

        {/* Card 4: Fériés Cameroun */}
        <div
          onClick={() => setFilterKind('ferie')}
          className="flex flex-col justify-between rounded-xl border border-emerald/30 bg-emerald-wash/20 p-3.5 shadow-xs cursor-pointer hover:bg-emerald-wash/30 transition-all"
          title="Cliquer pour filtrer les jours fériés"
        >
          <div className="flex items-center justify-between text-xs font-semibold text-emerald">
            <span>🇨🇲 Fêtes & Fériés</span>
            <Flag size={15} />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold tracking-tight text-emerald">{monthHolidays.length}</span>
            <span className="text-[11px] text-emerald/80">jour(s) férié(s)</span>
          </div>
          <span className="text-[10px] text-emerald/70 mt-1 block truncate">
            {monthHolidays.map((h) => h.name).slice(0, 1).join(', ') || 'Aucun férié ce mois'}
          </span>
        </div>
      </div>

      {/* Bannière de Solde Jibble pour le salarié sélectionné (si filtre actif) */}
      {selectedEmpBalance && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue/30 bg-blue-wash/20 p-3 text-xs mb-4">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-blue text-white font-bold text-xs shrink-0 overflow-hidden">
              {selectedEmpBalance.photo_path ? (
                <img src={selectedEmpBalance.photo_path} alt={selectedEmpBalance.empName} className="h-full w-full object-cover" />
              ) : (
                initials(selectedEmpBalance.empName)
              )}
            </div>
            <div>
              <p className="font-bold text-ink">Solde Annuel Congés : {selectedEmpBalance.empName}</p>
              <p className="text-[11px] text-ink-soft">Régime camerounais : 18 jours ouvrés annuels (24 jours ouvrables)</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <span className="text-ink-soft text-[10px] block">Droit annuel</span>
              <span className="font-mono font-bold text-ink">{selectedEmpBalance.annualQuota} j</span>
            </div>
            <div className="text-right">
              <span className="text-ink-soft text-[10px] block">Consommés</span>
              <span className="font-mono font-bold text-amber">{selectedEmpBalance.takenDays} j</span>
            </div>
            <div className="text-right">
              <span className="text-ink-soft text-[10px] block">Solde restant</span>
              <span className="font-mono font-bold text-emerald text-sm">{selectedEmpBalance.remainingDays} j</span>
            </div>
            <button
              type="button"
              onClick={() => setFilterEmpId('all')}
              className="text-ink-faint hover:text-ink p-1 rounded-md hover:bg-surface-2 transition-colors ml-1"
              title="Réinitialiser le filtre ouvrier"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* 5. Affichage selon le mode choisi : Vue Grille Calendaire OU Registre Tabulaire Jibble */}
      {viewMode === 'calendar' ? (
        <Card className="shadow-card p-0">
          {/* Le rail des jours reste collé sous les commandes sticky du planning. */}
          <div
            className="sticky z-30 border-b border-line bg-paper/95 shadow-xs backdrop-blur-md"
            style={{ top: `${stickyWeekdayTop}px` }}
          >
            <div
              ref={weekdayTrackRef}
              onScroll={() => syncCalendarHorizontalScroll('weekday')}
              className="overflow-x-auto no-scrollbar"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              <div className="grid min-w-[640px] grid-cols-7 bg-paper-2/95 text-center text-xs font-semibold text-ink-soft">
                {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((d, idx) => (
                  <div
                    key={d}
                    className={cx(
                      'border-r border-line py-2.5 last:border-r-0',
                      idx === 6 && 'bg-paper/60 text-ink-faint'
                    )}
                  >
                    {d}
                  </div>
                ))}
              </div>
            </div>
          </div>

            {/* Corps de la Grille */}
            <div
              ref={calendarTrackRef}
              onScroll={() => syncCalendarHorizontalScroll('calendar')}
              className="overflow-x-auto scroll-thin"
              style={{ WebkitOverflowScrolling: 'touch' }}
              tabIndex={0}
              role="region"
              aria-label="Calendrier mensuel des congés, défilement horizontal sur petit écran"
            >
            <div className="grid min-w-[640px] grid-cols-7 sheet-grid">
              {/* Cases vides début de mois */}
              {blanks.map((b) => (
                <div key={`blank-${b}`} className="min-h-28 bg-paper/40 p-2 border-r border-b border-line" />
              ))}

              {/* Cases de chaque jour du mois */}
              {days.map((d) => {
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const dayOfWeek = (firstDayIndex + d - 1) % 7; // 6 = Dimanche
                const isSunday = dayOfWeek === 6;
                const isToday = new Date().toDateString() === new Date(year, month, d).toDateString();

                // Jours fériés sur ce jour
                const dayHolidays = holidays.filter((h) => h.holiday_date === dateStr);

                // Congés actifs sur ce jour (filtrés avec normalisation robuste des dates)
                const activeOnDay = filterKind === 'ferie'
                  ? []
                  : monthLeaves.filter((l) => {
                      const lFrom = String(l.from_date || '').slice(0, 10);
                      const lTo = String(l.to_date || '').slice(0, 10);
                      return dateStr >= lFrom && dateStr <= lTo;
                    });

                return (
                  <div
                    key={`day-${d}`}
                    className={cx(
                      'min-h-28 p-2 border-r border-b border-line transition-colors flex flex-col justify-between group',
                      isToday && 'bg-amber-wash/30',
                      isSunday && !isToday && 'bg-paper/40',
                      dayHolidays.length > 0 && !isToday && 'bg-emerald-wash/20'
                    )}
                  >
                    {/* En-tête du jour (Numéro + Badge total) */}
                    <div className="flex items-center justify-between">
                      <span
                        className={cx(
                          'font-mono text-xs font-bold tabular-nums',
                          isToday
                            ? 'grid h-6 w-6 place-items-center rounded-full bg-amber text-white shadow-xs'
                            : isSunday
                            ? 'text-ink-faint'
                            : 'text-ink-soft'
                        )}
                      >
                        {d}
                      </span>

                      {/* Indicateur de volume d'absence */}
                      {activeOnDay.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setSelectedDayOverview({ dateStr, dayNum: d, holidays: dayHolidays, leaves: activeOnDay })}
                          className="text-[10px] text-ink-faint hover:text-amber font-semibold cursor-pointer transition-colors"
                          title="Cliquer pour voir la liste complète des absents sur cette journée"
                        >
                          {activeOnDay.length} abs.
                        </button>
                      )}
                    </div>

                    {/* Événements sur la journée (Fériés + Congés Cliquables) */}
                    <div className="mt-1.5 space-y-1 flex-1">
                      {/* A. Puce Férié Officiel / Décret Présidentiel */}
                      {(filterKind === 'all' || filterKind === 'ferie') &&
                        dayHolidays.map((h) => (
                          <button
                            key={h.id}
                            type="button"
                            onClick={() => setSelectedHoliday(h)}
                            className={cx(
                              'w-full text-left rounded-md px-1.5 py-1 text-[10px] font-bold border transition-all truncate flex items-center gap-1 shadow-xs cursor-pointer',
                              h.kind === 'presidential_decree'
                                ? 'bg-amber-wash border-amber/40 text-amber hover:scale-[1.02]'
                                : 'bg-emerald-wash border-emerald/40 text-emerald hover:scale-[1.02]'
                            )}
                            title={`🇨🇲 ${h.name} (${h.decree_ref || 'Férié officiel'}) - Cliquer pour inspecter`}
                          >
                            <span className="text-[10px] shrink-0">🇨🇲</span>
                            <span className="truncate">{h.kind === 'presidential_decree' ? `Décret : ${h.name}` : h.name}</span>
                          </button>
                        ))}

                      {/* B. Puces des Congés & Permissions (Interactives & Cliquables) */}
                      {activeOnDay.slice(0, 3).map((leave) => {
                        const isPending = leave.status === 'pending';
                        const toneBg =
                          leave.kind === 'conge'
                            ? 'bg-blue/10 border-blue/30 text-blue hover:bg-blue/20'
                            : leave.kind === 'permission'
                            ? 'bg-[#8b5cf6]/10 border-[#8b5cf6]/30 text-[#8b5cf6] hover:bg-[#8b5cf6]/20'
                            : 'bg-red/10 border-red/30 text-red hover:bg-red/20';

                        const dotBg =
                          leave.kind === 'conge'
                            ? 'bg-blue'
                            : leave.kind === 'permission'
                            ? 'bg-[#8b5cf6]'
                            : 'bg-red';

                        return (
                          <button
                            key={leave.id}
                            type="button"
                            onClick={() => setSelectedLeave(leave)}
                            className={cx(
                              'w-full text-left flex items-center justify-between gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition-all shadow-xs cursor-pointer hover:scale-[1.02]',
                              toneBg,
                              isPending && 'ring-1 ring-amber/50'
                            )}
                            title={`${leave.full_name} (${leave.kind}) : ${formatDate(leave.from_date)} au ${formatDate(leave.to_date)} - Cliquer pour voir les détails`}
                          >
                            <span className="flex items-center gap-1 min-w-0 truncate">
                              <span className={cx('h-1.5 w-1.5 rounded-full shrink-0', dotBg)} />
                              <span className="truncate text-ink font-semibold">
                                {formatPillName(leave.full_name)}
                              </span>
                            </span>

                            {isPending && (
                              <span title="En attente de validation">
                                <Clock size={10} className="text-amber shrink-0 animate-pulse" />
                              </span>
                            )}
                          </button>
                        );
                      })}

                      {activeOnDay.length > 3 && (
                        <button
                          type="button"
                          onClick={() => setSelectedDayOverview({ dateStr, dayNum: d, holidays: dayHolidays, leaves: activeOnDay })}
                          className="text-[10px] text-amber hover:underline block text-center font-bold py-0.5 rounded hover:bg-amber-wash/40 transition-colors w-full cursor-pointer"
                          title="Voir la liste complète des absents sur cette journée"
                        >
                          +{activeOnDay.length - 3} autres
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            </div>
        </Card>
      ) : (
        /* VUE REGISTRE DES DEMANDES STYLE JIBBLE */
        <Card className="overflow-x-auto scroll-thin shadow-card p-0">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-line bg-paper-2 text-ink-soft font-semibold">
                <th className="px-4 py-3">Salarié</th>
                <th className="px-4 py-3">Nature du flux</th>
                <th className="px-4 py-3">Période d'absence</th>
                <th className="px-4 py-3 text-center">Durée ouvrée</th>
                <th className="px-4 py-3">Motif &amp; Justification</th>
                <th className="px-4 py-3 text-center">Statut</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {monthLeaves.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-ink-soft">
                    Aucun congé ni permission correspondant aux critères de filtre pour ce mois.
                  </td>
                </tr>
              ) : (
                monthLeaves.map((leave) => {
                  const isPending = leave.status === 'pending';
                  const emp = employees.find((e) => String(e.id) === String(leave.employee_id));
                  const workingDays = computeWorkingDays(leave.from_date, leave.to_date, holidays, emp?.workdays);
                  return (
                    <tr key={leave.id} className="hover:bg-surface-2/40 transition-colors">
                      <td className="px-4 py-3 font-medium text-ink">
                        <div className="flex items-center gap-2.5">
                          <div className="grid h-8 w-8 place-items-center rounded-lg bg-ink text-paper font-bold text-xs shrink-0 overflow-hidden border border-line/50">
                            {leave.photo_path ? (
                              <img src={leave.photo_path} alt={leave.full_name ?? ''} className="h-full w-full object-cover" />
                            ) : (
                              initials(leave.full_name ?? leave.employee_id)
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-ink truncate">{leave.full_name}</p>
                            <p className="text-[10px] text-ink-faint font-mono font-normal">
                              {leave.employee_id} {leave.job_title ? `· ${leave.job_title}` : ''}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={cx(
                            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold border',
                            leave.kind === 'conge'
                              ? 'border-blue/30 bg-blue-wash text-blue'
                              : leave.kind === 'permission'
                              ? 'border-[#8b5cf6]/30 bg-[#8b5cf6]/10 text-[#8b5cf6]'
                              : 'border-red/30 bg-red-wash text-red'
                          )}
                        >
                          <span
                            className={cx(
                              'h-1.5 w-1.5 rounded-full',
                              leave.kind === 'conge' ? 'bg-blue' : leave.kind === 'permission' ? 'bg-[#8b5cf6]' : 'bg-red'
                            )}
                          />
                          {leave.kind === 'conge'
                            ? 'Congé payé'
                            : leave.kind === 'permission'
                            ? 'Permission'
                            : 'Absence autorisée'}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-ink-soft whitespace-nowrap">
                        <span className="font-mono text-ink font-semibold">
                          Du {formatDate(leave.from_date)} au {formatDate(leave.to_date)}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-center font-mono font-bold text-ink whitespace-nowrap">
                        {workingDays} j.
                      </td>

                      <td className="px-4 py-3 text-ink-soft max-w-[220px]">
                        {leave.kind === 'conge' ? (
                          <span className="text-[11px] text-ink-faint italic">Repos annuel alloué par la Direction</span>
                        ) : leave.note ? (
                          <span className="text-[11px] text-ink italic truncate block" title={leave.note}>
                            « {leave.note} »
                          </span>
                        ) : (
                          <span className="text-ink-faint text-[10px]">—</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <Chip
                          tone={leave.status === 'approved' ? 'green' : isPending ? 'amber' : 'red'}
                          className="text-[10px] font-semibold"
                        >
                          {leave.status === 'approved' ? 'Validé' : isPending ? 'En attente' : 'Refusé'}
                        </Chip>
                      </td>

                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {canManage && isPending && (
                            <>
                              <button
                                type="button"
                                onClick={() => onReview(leave, 'approved')}
                                className="rounded-md bg-green px-2 py-1 text-[11px] font-bold text-white hover:bg-green-2 transition-all shadow-xs"
                                title="Accorder la permission"
                              >
                                Valider
                              </button>
                              <button
                                type="button"
                                onClick={() => onReview(leave, 'rejected')}
                                className="rounded-md border border-line bg-surface-2 px-2 py-1 text-[11px] font-medium text-ink-soft hover:bg-red-wash hover:text-red transition-all"
                                title="Refuser"
                              >
                                Refuser
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => setSelectedLeave(leave)}
                            className="rounded-md border border-line bg-surface px-2 py-1 text-[11px] font-medium text-ink hover:bg-paper-2 transition-colors"
                          >
                            Inspecter
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </Card>
      )}

      {/* 5. MODAL D'INSPECTION ET MODIFICATION D'UN CONGÉ / PERMISSION */}
      <Modal
        open={!!selectedLeave}
        title={
          editingLeave
            ? 'Modifier le congé / permission'
            : selectedLeave
            ? selectedLeave.kind === 'conge'
              ? 'Détail du Congé Annuel Payé'
              : selectedLeave.kind === 'permission'
              ? 'Détail de la Permission Exceptionnelle'
              : 'Détail de l’Absence Autorisée'
            : ''
        }
        onClose={() => {
          setSelectedLeave(null);
          setEditingLeave(null);
        }}
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            <div>
              {!editingLeave && canManage && selectedLeave && onRevokeLeave && (
                <button
                  type="button"
                  onClick={() => {
                    const l = selectedLeave;
                    setSelectedLeave(null);
                    setEditingLeave(null);
                    onRevokeLeave(l);
                  }}
                  className="rounded-lg border border-red/30 px-3 py-1.5 text-xs font-semibold text-red hover:bg-red-wash transition-colors flex items-center gap-1.5"
                  title="Supprimer ou annuler ce congé en cas d'erreur"
                >
                  <Trash2 size={13} />
                  <span>Supprimer / Annuler</span>
                </button>
              )}
            </div>

            <div className="flex gap-2">
              {editingLeave ? (
                <>
                  <Button variant="ghost" size="sm" onClick={() => setEditingLeave(null)}>
                    Annuler
                  </Button>
                  <Button variant="primary" size="sm" loading={editBusy} onClick={() => void saveEditedLeave()}>
                    Enregistrer les modifications
                  </Button>
                </>
              ) : (
                <>
                  {canManage && onUpdateLeave && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => selectedLeave && startEditingLeave(selectedLeave)}
                      className="border-amber/40 text-amber hover:bg-amber-wash/30 font-semibold"
                    >
                      <Edit3 size={13} className="mr-1" /> Modifier
                    </Button>
                  )}
                  {canManage && selectedLeave && selectedLeave.status === 'pending' && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          onReview(selectedLeave, 'rejected');
                          setSelectedLeave(null);
                        }}
                        className="text-red border-red/30 hover:bg-red-wash"
                      >
                        Refuser
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => {
                          onReview(selectedLeave, 'approved');
                          setSelectedLeave(null);
                        }}
                        className="bg-green hover:bg-green-2 text-white font-bold"
                      >
                        Valider immédiatement
                      </Button>
                    </>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedLeave(null);
                      setEditingLeave(null);
                    }}
                  >
                    Fermer
                  </Button>
                </>
              )}
            </div>
          </div>
        }
      >
        {selectedLeave && (
          <div className="space-y-4">
            {/* Profil du travailleur */}
            <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2/40 p-3.5">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-ink text-paper font-bold text-sm shadow-xs shrink-0 overflow-hidden border border-line">
                {selectedLeave.photo_path ? (
                  <img src={selectedLeave.photo_path} alt={selectedLeave.full_name ?? ''} className="h-full w-full object-cover" />
                ) : (
                  initials(selectedLeave.full_name ?? selectedLeave.employee_id)
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-ink text-sm truncate">{selectedLeave.full_name}</p>
                <p className="text-xs text-ink-soft">
                  Matricule : <span className="font-mono text-ink font-semibold">{selectedLeave.employee_id}</span>
                  {selectedLeave.job_title ? ` · ${selectedLeave.job_title}` : ''}
                </p>
              </div>
              <div>
                <Chip
                  tone={
                    selectedLeave.status === 'approved'
                      ? 'green'
                      : selectedLeave.status === 'pending'
                      ? 'amber'
                      : 'red'
                  }
                >
                  {selectedLeave.status === 'approved'
                    ? 'Accordé'
                    : selectedLeave.status === 'pending'
                    ? 'En attente'
                    : 'Refusé'}
                </Chip>
              </div>
            </div>

            {editingLeave ? (
              <div className="space-y-3.5 pt-1">
                {editError && <Banner tone="error">{editError}</Banner>}
                <div>
                  <label className="block text-xs font-semibold text-ink-soft mb-1">Type de flux</label>
                  <select
                    value={editForm.kind}
                    onChange={(e) => setEditForm((f) => ({ ...f, kind: e.target.value as any }))}
                    className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink focus:outline-none focus:border-amber"
                  >
                    <option value="conge">Congé annuel payé (Planifié par la Direction)</option>
                    <option value="permission">Permission exceptionnelle</option>
                    <option value="absence">Absence autorisée / justifiée</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-ink-soft mb-1">Date de départ</label>
                    <input
                      type="date"
                      value={editForm.from_date}
                      onChange={(e) => setEditForm((f) => ({ ...f, from_date: e.target.value }))}
                      className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink focus:outline-none focus:border-amber"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-ink-soft mb-1">Date de retour</label>
                    <input
                      type="date"
                      value={editForm.to_date}
                      onChange={(e) => setEditForm((f) => ({ ...f, to_date: e.target.value }))}
                      className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink focus:outline-none focus:border-amber"
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-line bg-surface-2/40 p-3 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-ink-soft">Jours ouvrés du salarié :</span>
                    <span className="font-semibold text-amber">
                      {formatWorkdaysLabels(employees.find((e) => String(e.id) === String(selectedLeave.employee_id))?.workdays)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-line/50 pt-1.5">
                    <span className="text-ink-soft">Décompte recalculé en jours ouvrés :</span>
                    <span className="font-mono font-bold text-ink">
                      {computeWorkingDays(
                        editForm.from_date,
                        editForm.to_date,
                        holidays,
                        employees.find((e) => String(e.id) === String(selectedLeave.employee_id))?.workdays
                      )} jour(s) ouvré(s) nets
                    </span>
                  </div>
                </div>

                {editForm.kind !== 'conge' ? (
                  <div>
                    <label className="block text-xs font-semibold text-ink-soft mb-1">Motif / Justification</label>
                    <textarea
                      value={editForm.note}
                      onChange={(e) => setEditForm((f) => ({ ...f, note: e.target.value }))}
                      rows={2}
                      placeholder="Ex: Événement familial, raison médicale…"
                      className="w-full rounded-xl border border-line bg-surface p-2.5 text-xs text-ink focus:outline-none focus:border-amber"
                    />
                  </div>
                ) : (
                  <p className="text-xs text-ink-faint italic bg-surface-2/30 p-2.5 rounded-lg border border-line">
                    ℹ️ Congé annuel payé : aucun motif ni justificatif exigé du travailleur.
                  </p>
                )}
              </div>
            ) : (
              <>
                {/* Période & Calcul des Jours Ouvrés */}
                <div className="grid grid-cols-2 gap-3 rounded-xl border border-line bg-surface p-3.5 text-xs">
                  <div>
                    <span className="text-ink-faint font-medium">Date de début</span>
                    <p className="font-bold text-ink text-sm mt-0.5">{formatDate(selectedLeave.from_date)}</p>
                  </div>
                  <div>
                    <span className="text-ink-faint font-medium">Date de fin</span>
                    <p className="font-bold text-ink text-sm mt-0.5">{formatDate(selectedLeave.to_date)}</p>
                  </div>
                  <div className="col-span-2 pt-2 border-t border-line flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-ink-soft">Jours ouvrés configurés :</span>
                      <span className="font-semibold text-amber">
                        {formatWorkdaysLabels(employees.find((e) => String(e.id) === String(selectedLeave.employee_id))?.workdays)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-ink-soft">Décompte effectif en jours ouvrés :</span>
                      <span className="font-mono font-bold text-ink text-sm bg-surface-2 px-2 py-0.5 rounded border border-line">
                        {computeWorkingDays(
                          selectedLeave.from_date,
                          selectedLeave.to_date,
                          holidays,
                          employees.find((e) => String(e.id) === String(selectedLeave.employee_id))?.workdays
                        )} jour(s) ouvré(s) nets
                      </span>
                    </div>
                  </div>
                </div>

                {/* Motif et Justification */}
                <div className="rounded-xl border border-line bg-surface p-3.5 text-xs space-y-1.5">
                  <span className="text-ink-faint font-medium">Motif &amp; Justification :</span>
                  {selectedLeave.kind === 'conge' ? (
                    <p className="text-ink-soft italic">
                      ℹ️ Congé annuel payé alloué par la Direction. Conformément au règlement du monastère et au Code du Travail, le repos annuel est un droit acquis ne nécessitant aucun justificatif du travailleur.
                    </p>
                  ) : selectedLeave.note ? (
                    <p className="text-ink font-medium bg-surface-2/60 p-2.5 rounded-lg border border-line">
                      « {selectedLeave.note} »
                    </p>
                  ) : (
                    <p className="text-ink-faint italic">Aucun motif particulier renseigné.</p>
                  )}
                </div>

                {/* Traçabilité & Décision */}
                <div className="text-[11px] text-ink-faint space-y-1 border-t border-line pt-2">
                  <p>
                    Saisi par : <span className="text-ink font-semibold">{selectedLeave.actor}</span>
                  </p>
                  {selectedLeave.reviewed_by && (
                    <p>
                      Visé par : <span className="text-ink font-semibold">{selectedLeave.reviewed_by}</span>
                      {selectedLeave.reviewed_at ? ` le ${formatDate(selectedLeave.reviewed_at)}` : ''}
                      {selectedLeave.review_note ? ` (« ${selectedLeave.review_note} »)` : ''}
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </Modal>

      {/* 6. MODAL D'INSPECTION D'UN JOUR FÉRIÉ OFFICIEL / DÉCRET */}
      <Modal
        open={!!selectedHoliday}
        title="🇨🇲 Jour Férié Officiel au Cameroun"
        onClose={() => setSelectedHoliday(null)}
        footer={
          <div className="flex w-full items-center justify-between">
            {canManage &&
              selectedHoliday?.kind === 'presidential_decree' &&
              onDeleteHoliday && (
                <button
                  type="button"
                  onClick={() => {
                    const h = selectedHoliday;
                    setSelectedHoliday(null);
                    onDeleteHoliday(h);
                  }}
                  className="rounded-lg border border-red/30 px-3 py-1.5 text-xs font-semibold text-red hover:bg-red-wash transition-colors"
                >
                  Supprimer ce décret
                </button>
              )}
            <div className="ml-auto">
              <Button variant="ghost" size="sm" onClick={() => setSelectedHoliday(null)}>
                Fermer
              </Button>
            </div>
          </div>
        }
      >
        {selectedHoliday && (
          <div className="space-y-4 text-xs">
            <div className="rounded-xl border border-emerald/30 bg-emerald-wash/30 p-4">
              <span className="text-xs uppercase font-bold text-emerald flex items-center gap-1.5">
                <Flag size={14} /> Fête Légale en République du Cameroun
              </span>
              <p className="text-base font-bold text-ink mt-1">{selectedHoliday.name}</p>
              <p className="text-xs text-ink-soft mt-0.5">
                Date officielle : <span className="font-mono font-bold text-ink">{formatDate(selectedHoliday.holiday_date)}</span>
              </p>
            </div>

            <div className="rounded-xl border border-line bg-surface p-3.5 space-y-2">
              <div className="flex justify-between py-1 border-b border-line">
                <span className="text-ink-soft">Nature :</span>
                <span className="font-semibold text-ink">
                  {selectedHoliday.kind === 'presidential_decree'
                    ? 'Décret Présidentiel Exceptionnel'
                    : selectedHoliday.kind === 'religious'
                    ? 'Fête Religieuse Légale'
                    : 'Fête Nationale Civile'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-line">
                <span className="text-ink-soft">Base Juridique :</span>
                <span className="font-semibold text-ink">{selectedHoliday.decree_ref || 'Loi N° 73/5'}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-ink-soft">Régime de Travail :</span>
                <span className="font-bold text-emerald">Chômé et Payé</span>
              </div>
            </div>

            <div className="rounded-lg bg-surface-2 p-3 text-[11px] text-ink-soft">
              💡 Conformément au régime des fêtes légales camerounaises, cette journée n'est pas décomptée des congés des travailleurs et la borne de pointage n'enregistre aucune absence irrégulière.
            </div>
          </div>
        )}
      </Modal>

      {/* 6. MODAL D'INSPECTION GLOBALE D'UNE JOURNÉE (MULTI-SALARIÉS & FÉRIÉS) */}
      <Modal
        open={!!selectedDayOverview}
        title={
          selectedDayOverview
            ? `Planning du ${formatDate(selectedDayOverview.dateStr)}`
            : ''
        }
        onClose={() => setSelectedDayOverview(null)}
        footer={
          <div className="flex w-full items-center justify-between">
            <span className="text-xs text-ink-soft">
              {selectedDayOverview?.leaves.length ?? 0} salarié(s) absent(s) ce jour
            </span>
            <Button variant="ghost" size="sm" onClick={() => setSelectedDayOverview(null)}>
              Fermer
            </Button>
          </div>
        }
      >
        {selectedDayOverview && (
          <div className="space-y-4 text-xs">
            {/* Si jour férié */}
            {selectedDayOverview.holidays.length > 0 && (
              <div className="space-y-2">
                <p className="font-semibold text-ink-soft uppercase text-[10px] tracking-wider">
                  Jour(s) Férié(s) Officiel(s)
                </p>
                {selectedDayOverview.holidays.map((h) => (
                  <div
                    key={h.id}
                    onClick={() => {
                      setSelectedDayOverview(null);
                      setSelectedHoliday(h);
                    }}
                    className="flex items-center justify-between rounded-xl border border-emerald/30 bg-emerald-wash/30 p-3 cursor-pointer hover:bg-emerald-wash/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">🇨🇲</span>
                      <div>
                        <p className="font-bold text-ink">{h.name}</p>
                        <p className="text-[11px] text-ink-soft">{h.decree_ref || 'Fête légale camerounaise'}</p>
                      </div>
                    </div>
                    <span className="text-emerald font-semibold text-xs">Consulter →</span>
                  </div>
                ))}
              </div>
            )}

            {/* Liste complète des salariés en congé / permission / absence */}
            <div>
              <p className="font-semibold text-ink-soft uppercase text-[10px] tracking-wider mb-2">
                Salariés en absence ({selectedDayOverview.leaves.length})
              </p>

              {selectedDayOverview.leaves.length === 0 ? (
                <div className="rounded-xl border border-line bg-surface-2 p-6 text-center text-ink-soft">
                  Aucun congé ni permission sur cette journée.
                </div>
              ) : (
                <div className="space-y-2 max-h-[360px] overflow-y-auto scroll-thin pr-1">
                  {selectedDayOverview.leaves.map((leave) => {
                    const isPending = leave.status === 'pending';
                    const toneBorder =
                      leave.kind === 'conge'
                        ? 'border-blue/30 bg-blue-wash/20'
                        : leave.kind === 'permission'
                        ? 'border-[#8b5cf6]/30 bg-[#8b5cf6]/10'
                        : 'border-red/30 bg-red-wash/20';

                    return (
                      <div
                        key={leave.id}
                        onClick={() => {
                          setSelectedDayOverview(null);
                          setSelectedLeave(leave);
                        }}
                        className={cx(
                          'flex items-center justify-between rounded-xl border p-3 cursor-pointer hover:scale-[1.01] transition-all shadow-xs',
                          toneBorder
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="grid h-10 w-10 place-items-center rounded-xl bg-ink text-paper font-bold text-xs shrink-0 overflow-hidden border border-line">
                            {leave.photo_path ? (
                              <img src={leave.photo_path} alt={leave.full_name ?? ''} className="h-full w-full object-cover" />
                            ) : (
                              initials(leave.full_name ?? leave.employee_id)
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-ink truncate flex items-center gap-1.5">
                              {leave.full_name}
                              <span className="text-[10px] text-ink-faint font-mono font-normal">({leave.employee_id})</span>
                            </p>
                            <p className="text-[11px] text-ink-soft truncate">
                              <span className="font-semibold">
                                {leave.kind === 'conge' ? 'Congé payé' : leave.kind === 'permission' ? 'Permission' : 'Absence'}
                              </span>
                              {' · '}Du {formatDate(leave.from_date)} au {formatDate(leave.to_date)}
                            </p>
                            {leave.note && <p className="text-[10px] text-ink-soft italic truncate">« {leave.note} »</p>}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <Chip
                            tone={leave.status === 'approved' ? 'green' : isPending ? 'amber' : 'red'}
                            className="text-[10px]"
                          >
                            {leave.status === 'approved' ? 'Accordé' : isPending ? 'En attente' : 'Refusé'}
                          </Chip>
                          <span className="text-ink-faint text-xs">→</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
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
  const canViewEmployees = hasPerm('employees.view') || canCreate || canEdit || canPhoto || canPrintBadge;
  const canViewLeaves = hasPerm('leaves.view') || hasPerm('leaves.manage');
  const canManageLeaves = hasPerm('leaves.manage') || (!permissions && user.role === 'direction');
  const canExportReports = hasPerm('reports.export') || (!permissions && user.role === 'direction');
  const canManage = canCreate || canEdit;

  const [activeTab, setActiveTab] = useState<'people' | 'timeoff'>(canViewEmployees ? 'people' : 'timeoff');

  useEffect(() => {
    if (activeTab === 'people' && !canViewEmployees && canViewLeaves) setActiveTab('timeoff');
    else if (activeTab === 'timeoff' && !canViewLeaves && canViewEmployees) setActiveTab('people');
  }, [activeTab, canViewEmployees, canViewLeaves]);

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

  // Fêtes légales camerounaises et décrets présidentiels / fêtes religieuses
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [decreeModalOpen, setDecreeModalOpen] = useState(false);
  const [decreeForm, setDecreeForm] = useState<{
    holiday_date: string;
    name: string;
    decree_ref: string;
    kind: 'religious' | 'presidential_decree' | 'legal_national';
  }>({ holiday_date: '', name: '', decree_ref: '', kind: 'religious' });
  const [decreeBusy, setDecreeBusy] = useState(false);
  const [decreeError, setDecreeError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState({
    full_name: '',
    job_title: '',
    pin: '',
    photo_path: null as string | null,
    workdays: [1, 2, 3, 4, 5] as number[],
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
  const [badgeCopies, setBadgeCopies] = useState(1);
  const [badgePaper, setBadgePaper] = useState<'A4' | 'Letter'>('A4');
  const [deleteEmployeeFor, setDeleteEmployeeFor] = useState<Employee | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [detailFor, setDetailFor] = useState<Employee | null>(null);
  const [detail, setDetail] = useState<EmployeeDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [employeeKit, setEmployeeKit] = useState<{ kit: EtabliKit | null; items: EtabliKitItem[] } | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<'fiche' | 'pointages' | 'etabli'>('fiche');
  const { print, portal } = usePrintSheet();
  const { registerUndo } = useUndo();

  // État partagé pour le planning des congés (TimeOff) dans la barre sticky unifiée
  const [timeOffMonth, setTimeOffMonth] = useState(() => new Date());
  const [timeOffViewMode, setTimeOffViewMode] = useState<'calendar' | 'table'>('calendar');
  const [timeOffFilterKind, setTimeOffFilterKind] = useState<'all' | 'conge' | 'permission' | 'absence' | 'ferie'>('all');
  const [timeOffFilterEmpId, setTimeOffFilterEmpId] = useState<string>('all');
  const [timeOffFilterStatus, setTimeOffFilterStatus] = useState<'all' | 'approved' | 'pending' | 'rejected'>('all');

  const timeOffMonthLabel = useMemo(() => {
    return timeOffMonth.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  }, [timeOffMonth]);

  const timeOffMonthHolidaysCount = useMemo(() => {
    const y = timeOffMonth.getFullYear();
    const m = timeOffMonth.getMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const startStr = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const endStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
    return holidays.filter((h) => h.holiday_date >= startStr && h.holiday_date <= endStr).length;
  }, [holidays, timeOffMonth]);

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
    setActiveDetailTab('fiche');
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
      canViewEmployees
        ? api<{ employees: Employee[] }>('/api/employees')
        : Promise.resolve({ employees: [] as Employee[] }),
      canViewEmployees
        ? api<{ employees: TodayEmployee[] }>('/api/employees/today-status').catch(() => ({ employees: [] }))
        : Promise.resolve({ employees: [] as TodayEmployee[] }),
      canViewLeaves
        ? api<{ leaves: Leave[] }>('/api/leaves?status=all').catch(() => ({ leaves: [] }))
        : Promise.resolve({ leaves: [] as Leave[] }),
      api<{ roles: { id: string; name: string }[] }>('/api/permissions/roles').catch(() => ({ roles: [] })),
      api<{ holidays: Holiday[] }>(`/api/leaves/holidays?year=${new Date().getFullYear()}`).catch(() => ({ holidays: [] })),
    ])
      .then(([empRes, statusRes, leaveRes, rolesRes, holidayRes]) => {
        if (!cancelled) {
          setEmployees(empRes.employees);
          setTodayStatus(statusRes.employees);
          setLeaves(leaveRes.leaves);
          if (rolesRes?.roles) setAvailableRoles(rolesRes.roles);
          if (holidayRes?.holidays) setHolidays(holidayRes.holidays);
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
  }, [reload, employees.length, canViewEmployees, canViewLeaves]);

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

  useEffect(() => {
    const handleGlobalRefresh = () => setReload((v) => v + 1);
    window.addEventListener('mf-refresh-data', handleGlobalRefresh);
    return () => window.removeEventListener('mf-refresh-data', handleGlobalRefresh);
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
      workdays: [1, 2, 3, 4, 5],
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
      workdays: employee.workdays && employee.workdays.length > 0 ? employee.workdays : [1, 2, 3, 4, 5],
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
            workdays: form.workdays,
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
            workdays: form.workdays,
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
    const empToDelete = deleteEmployeeFor;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const res = await api<{ ok: boolean; deleted?: Employee }>(`/api/employees/${empToDelete.id}`, { method: 'DELETE' });
      setDeleteEmployeeFor(null);
      setReload((value) => value + 1);
      window.dispatchEvent(new CustomEvent('mf-refresh-data'));

      // Enregistrer l'action d'annulation Ctrl+Z (Adobe / Google UX)
      registerUndo({
        title: `Travailleur "${empToDelete.full_name}" supprimé`,
        details: 'Appuyez sur Ctrl+Z ou cliquez pour restaurer immédiatement.',
        onUndo: async () => {
          await api('/api/employees/restore', {
            method: 'POST',
            body: JSON.stringify({ employee: res.deleted ?? empToDelete }),
          });
          setReload((v) => v + 1);
          window.dispatchEvent(new CustomEvent('mf-refresh-data'));
        },
      });
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
      await api('/api/leaves', {
        method: 'POST',
        body: JSON.stringify({
          ...leaveForm,
          status: 'approved',
          note: leaveForm.kind === 'conge' ? null : leaveForm.note.trim() || null,
        }),
      });
      toast(
        leaveForm.kind === 'conge'
          ? 'Congé annuel alloué et validé avec succès.'
          : 'Permission accordée et enregistrée.',
        'success'
      );
      setLeaveOpen(false);
      setReload((v) => v + 1);
    } catch (e) {
      setLeaveError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLeaveBusy(false);
    }
  }

  async function revokeLeave(leave: Leave) {
    if (!confirm(`Confirmer l'annulation du congé / permission de ${leave.full_name ?? 'cet ouvrier'} ?`)) return;
    try {
      await deleteLeave(leave.id);
      toast('Congé / permission révoqué avec succès.', 'success');
      setReload((v) => v + 1);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Échec de la révocation.', 'error');
    }
  }

  async function handleUpdateLeave(
    id: number,
    data: { from_date?: string; to_date?: string; kind?: 'conge' | 'permission' | 'absence'; note?: string | null }
  ) {
    try {
      await updateLeave(id, data);
      toast('Congé / permission mis à jour avec succès.', 'success');
      setReload((v) => v + 1);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Échec de la modification.', 'error');
      throw e;
    }
  }

  async function handlePurgeLeaves() {
    if (!confirm('Confirmer la réinitialisation complète des congés et décrets exceptionnels (planning à blanc) ?')) return;
    try {
      await purgeLeavesTestData();
      toast('Planning réinitialisé à blanc (0 congé enregistré).', 'success');
      setReload((v) => v + 1);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Échec de la réinitialisation.', 'error');
    }
  }

  async function handleDeleteHoliday(holiday: Holiday) {
    if (!confirm(`Supprimer le jour férié / décret « ${holiday.name} » ?`)) return;
    try {
      await deleteHoliday(holiday.id);
      toast('Jour férié supprimé.', 'success');
      setReload((v) => v + 1);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Suppression impossible.', 'error');
    }
  }

  async function submitDecree() {
    if (!decreeForm.holiday_date || !decreeForm.name.trim()) {
      setDecreeError('Date et intitulé du jour férié obligatoires.');
      return;
    }
    setDecreeBusy(true);
    setDecreeError(null);
    try {
      await declarePresidentialDecree({
        holiday_date: decreeForm.holiday_date,
        name: decreeForm.name.trim(),
        decree_ref: decreeForm.decree_ref.trim() || undefined,
        kind: decreeForm.kind,
      });
      toast('Jour chômé / férié enregistré et appliqué en temps réel !', 'success');
      setDecreeModalOpen(false);
      setReload((v) => v + 1);
    } catch (e) {
      setDecreeError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setDecreeBusy(false);
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

      {/* Tabs Switcher: Équipe vs Calendrier Time-Off with Sticky Control Navbar */}
      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as typeof activeTab)} className="w-full space-y-6">
        {/* Sticky Navigation Bar with Tabs, Real-Time Search, Filters & Hamburger Menu */}
        <div data-timeoff-sticky-toolbar={activeTab === 'timeoff' ? 'true' : undefined} className="sticky top-0 lg:top-11 z-20 -mx-3 sm:-mx-6 lg:-mx-8 px-3 sm:px-6 lg:px-8 py-2.5 bg-paper border-b border-line shadow-xs">
          <div className="flex flex-col gap-2">
            {/* Top Row: Tabs, Search & Priority Actions */}
            <div className="flex items-center justify-between gap-2 sm:gap-3 min-w-0">
              {/* Left: Radix Navigation Tabs with Live Badges */}
              <div className="min-w-0 flex-1">
                <TabsList variant="line" className="grid w-full grid-cols-2 gap-1 bg-transparent p-0 sm:flex sm:w-max sm:gap-2.5">
                  {canViewEmployees && <TabsTrigger
                    value="people"
                    className="min-w-0 gap-1 px-1.5 py-2 text-xs font-semibold whitespace-normal sm:shrink-0 sm:whitespace-nowrap sm:gap-2 sm:px-3.5 sm:py-2 sm:text-sm"
                  >
                    <Users size={15} />
                    <span className="truncate sm:hidden">Équipe</span>
                    <span className="hidden sm:inline">Répertoire de l’Équipe</span>
                    <span className="ml-1 rounded-full bg-paper-2 px-2 py-0.5 text-[10px] font-bold text-ink-soft">
                      {employees.filter((e) => e.active).length}
                    </span>
                  </TabsTrigger>}

                  {canViewLeaves && <TabsTrigger
                    value="timeoff"
                    className="min-w-0 gap-1 px-1.5 py-2 text-xs font-semibold whitespace-normal sm:shrink-0 sm:whitespace-nowrap sm:gap-2 sm:px-3.5 sm:py-2 sm:text-sm"
                  >
                    <CalendarIcon size={15} />
                    <span className="truncate sm:hidden">Congés</span>
                    <span className="hidden sm:inline">Planning des Congés</span>
                    {leaves.filter((l) => l.status === 'pending').length > 0 && (
                      <span className="ml-1 rounded-full bg-amber-wash px-2 py-0.5 text-[10px] font-bold text-amber">
                        {leaves.filter((l) => l.status === 'pending').length} attente
                      </span>
                    )}
                  </TabsTrigger>}
                </TabsList>
              </div>

              {/* Center: Integrated Real-Time Search Input (People only) */}
          {activeTab === 'people' && canViewEmployees && (
                <div className="hidden md:flex items-center flex-1 max-w-xs relative min-w-[180px]">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Rechercher ouvrier, métier…"
                    className="h-8 w-full rounded-lg border border-line bg-surface/90 pl-8 pr-7 text-xs text-ink placeholder:text-ink-faint focus:border-amber focus:bg-surface focus:outline-none transition-all shadow-2xs"
                  />
                  {q && (
                    <button
                      onClick={() => setQ('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink text-xs p-0.5"
                      title="Effacer la recherche"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              )}

              {/* Right: Actions (Actualiser, Nouveau Travailleur / Poser Congé, Hamburger Menu) */}
              <div className="shrink-0 flex items-center gap-1.5 sm:gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={loading}
                  icon={<RefreshCw size={13} className={cx(loading && 'animate-spin text-amber')} />}
                  onClick={() => setReload((value) => value + 1)}
                  className="h-8 px-2 sm:px-2.5 text-xs border border-line/70 hover:border-amber/50 hover:bg-paper-2 transition-all shadow-2xs"
                  title="Actualiser les données"
                >
                  <span className="hidden xl:inline">{loading ? 'Actualisation…' : 'Actualiser'}</span>
                </Button>

                {activeTab === 'people' && canCreate && (
                  <Button
                    size="sm"
                    variant="primary"
                    icon={<UserPlus size={14} />}
                    onClick={openCreate}
                    className="h-8 px-2.5 sm:px-3 text-xs font-bold shadow-2xs"
                  >
                    <span className="hidden sm:inline">Nouveau travailleur</span>
                    <span className="sm:hidden">Nouveau</span>
                  </Button>
                )}

                {activeTab === 'timeoff' && canManageLeaves && (
                  <Button
                    size="sm"
                    variant="primary"
                    icon={<Plus size={14} />}
                    onClick={openLeave}
                    className="h-8 px-2.5 sm:px-3 text-xs font-bold shadow-2xs"
                  >
                    <span className="hidden sm:inline">Poser un Congé</span>
                    <span className="sm:hidden">Congé</span>
                  </Button>
                )}

                {/* Menu Hamburger / Overflow pour les opérations secondaires */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-8 px-2 sm:px-2.5 text-xs font-semibold border border-line/80 hover:border-amber/40 shadow-2xs gap-1.5"
                      title="Menu d'opérations et exports"
                    >
                      <Menu size={14} />
                      <span className="hidden lg:inline text-[11px]">Options</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 p-1.5 rounded-xl border border-line bg-surface shadow-pop text-xs z-50">
                    {canExportReports && (
                      <>
                        <DropdownMenuItem
                          onClick={handleExportExcel}
                          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-paper-2 text-ink"
                        >
                          <Download size={14} className="text-emerald-500" />
                          <span>Exporter en Excel (.xlsx)</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={handleExportPdf}
                          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-paper-2 text-ink"
                        >
                          <Printer size={14} className="text-blue-500" />
                          <span>Imprimer Registre Officiel (PDF)</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="my-1 border-line" />
                      </>
                    )}
                    {canManageLeaves && <DropdownMenuItem
                      onClick={openLeave}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-paper-2 text-ink"
                    >
                      <CalendarCheck2 size={14} className="text-amber" />
                      <span>Poser un Congé / Permission</span>
                    </DropdownMenuItem>}
                    {activeTab === 'timeoff' && canManageLeaves && (
                      <>
                        <DropdownMenuItem
                          onClick={() => {
                            const todayStr = new Date().toISOString().slice(0, 10);
                            setDecreeForm({ holiday_date: todayStr, name: '', decree_ref: '', kind: 'religious' });
                            setDecreeError(null);
                            setDecreeModalOpen(true);
                          }}
                          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-paper-2 text-ink"
                        >
                          <Flag size={14} className="text-emerald-500" />
                          <span>+ Férié / Fête religieuse</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={handlePurgeLeaves}
                          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-red-wash hover:text-red text-ink-soft"
                        >
                          <RefreshCw size={14} className="text-red-500" />
                          <span>Réinitialiser congés de test</span>
                        </DropdownMenuItem>
                      </>
                    )}
                    {activeTab === 'people' && canViewEmployees && (
                      <>
                        <DropdownMenuSeparator className="my-1 border-line" />
                        <DropdownMenuItem
                          onClick={() => setShowInactive((v) => !v)}
                          className="flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-paper-2 text-ink"
                        >
                          <div className="flex items-center gap-2">
                            <Users size={14} className="text-ink-soft" />
                            <span>Afficher les Inactifs</span>
                          </div>
                          <span
                            className={cx(
                              'text-[10px] font-bold px-1.5 py-0.5 rounded-full border',
                              showInactive
                                ? 'bg-amber-wash text-amber border-amber/30'
                                : 'bg-surface-2 text-ink-faint border-line',
                            )}
                          >
                            {showInactive ? 'Oui' : 'Non'}
                          </span>
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Sub Row: Continuous Status Filter Chips & Mobile Search for People */}
            {activeTab === 'people' && (
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-line/40 text-xs">
                {/* Horizontal Scrollable Filter Chips */}
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5 flex-1 min-w-0">
                  <span className="text-[10px] uppercase font-bold text-ink-faint mr-1 shrink-0 hidden sm:inline">
                    Filtre :
                  </span>
                  {STATUS_FILTERS.map((f) => (
                    <button
                      key={f.value}
                      onClick={() => setStatusFilter(f.value)}
                      className={cx(
                        'rounded-lg px-2.5 py-0.5 text-[11px] font-semibold transition-all shrink-0 border flex items-center gap-1',
                        statusFilter === f.value
                          ? 'bg-amber text-white border-amber shadow-2xs font-bold'
                          : 'bg-surface text-ink-soft border-line/70 hover:bg-paper-2 hover:text-ink',
                      )}
                    >
                      <span>{f.label}</span>
                      {f.value !== 'all' && (
                        <span className="opacity-75 text-[10px] tabular-nums font-mono">
                          {f.value === 'present'
                            ? counts.present + counts.late
                            : f.value === 'late'
                            ? counts.late
                            : f.value === 'conge'
                            ? counts.conge
                            : f.value === 'permission'
                            ? counts.permission
                            : ''}
                        </span>
                      )}
                    </button>
                  ))}

                  <button
                    onClick={() => setShowInactive((v) => !v)}
                    className={cx(
                      'shrink-0 rounded-lg border px-2 py-0.5 text-[11px] font-semibold transition-colors',
                      showInactive ? 'border-amber bg-amber-wash text-amber' : 'border-line text-ink-soft hover:bg-paper-2',
                    )}
                  >
                    Inactifs
                  </button>
                </div>

                {/* Mobile Search input (compact) */}
                <div className="md:hidden flex items-center relative w-36 sm:w-44 shrink-0">
                  <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Chercher…"
                    className="h-7 w-full rounded-md border border-line bg-surface/90 pl-6 pr-2 text-[11px] text-ink placeholder:text-ink-faint focus:border-amber focus:outline-none shadow-2xs"
                  />
                  {q && (
                    <button
                      onClick={() => setQ('')}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink text-xs p-0.5"
                    >
                      <X size={10} />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Sub Row: Continuous Filter Chips & Controls for Time-Off */}
          {activeTab === 'timeoff' && canViewLeaves && (
              <div className="flex flex-col gap-1.5 pt-1 border-t border-line/40 text-xs">
                {/* Month Navigator & View Switcher (100% Responsive on Desktop & Mobile) */}
                <div className="flex items-center justify-between gap-2 w-full pb-1 border-b border-line/30">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setTimeOffMonth(new Date(timeOffMonth.getFullYear(), timeOffMonth.getMonth() - 1, 1))}
                      className="rounded p-1 hover:bg-paper-2 text-ink-soft hover:text-ink transition-colors"
                      aria-label="Mois précédent"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <span className="text-xs sm:text-sm font-bold text-ink capitalize tracking-tight px-1.5 min-w-[110px] text-center select-none">
                      {timeOffMonthLabel}
                    </span>
                    <button
                      type="button"
                      onClick={() => setTimeOffMonth(new Date())}
                      className="rounded px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs font-semibold bg-surface-2 border border-line hover:bg-paper text-ink transition-colors"
                    >
                      <span className="hidden sm:inline">Aujourd'hui</span>
                      <span className="sm:hidden">Auj.</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTimeOffMonth(new Date(timeOffMonth.getFullYear(), timeOffMonth.getMonth() + 1, 1))}
                      className="rounded p-1 hover:bg-paper-2 text-ink-soft hover:text-ink transition-colors"
                      aria-label="Mois suivant"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>

                  <div className="flex items-center rounded-lg border border-line bg-surface-2 p-0.5">
                    <button
                      type="button"
                      onClick={() => setTimeOffViewMode('calendar')}
                      className={cx(
                        'flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-semibold rounded-md transition-all',
                        timeOffViewMode === 'calendar' ? 'bg-ink text-paper shadow-xs' : 'text-ink-soft hover:text-ink'
                      )}
                    >
                      <CalendarIcon size={12} />
                      <span>Calendrier</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTimeOffViewMode('table')}
                      className={cx(
                        'flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-semibold rounded-md transition-all',
                        timeOffViewMode === 'table' ? 'bg-ink text-paper shadow-xs' : 'text-ink-soft hover:text-ink'
                      )}
                    >
                      <FileSpreadsheet size={12} />
                      <span>Registre</span>
                    </button>
                  </div>
                </div>

                {/* Filter Chips & Dropdowns */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 py-0.5">
                    <span className="text-[10px] uppercase font-bold text-ink-faint mr-1 shrink-0 hidden sm:inline">
                      Filtre :
                    </span>
                    <button
                      type="button"
                      onClick={() => setTimeOffFilterKind('all')}
                      className={cx(
                        'min-h-10 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all border',
                        timeOffFilterKind === 'all'
                          ? 'bg-amber text-white border-amber shadow-2xs font-bold'
                          : 'bg-surface text-ink-soft border-line/70 hover:bg-paper-2 hover:text-ink'
                      )}
                    >
                      Tous les flux
                    </button>
                    <button
                      type="button"
                      onClick={() => setTimeOffFilterKind('conge')}
                      className={cx(
                        'min-h-10 rounded-lg px-2.5 py-1.5 text-xs font-semibold flex items-center gap-1.5 transition-all border',
                        timeOffFilterKind === 'conge'
                          ? 'bg-blue text-white border-blue shadow-2xs font-bold'
                          : 'bg-surface text-ink-soft border-line/70 hover:bg-blue-wash hover:text-blue'
                      )}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-blue shrink-0" />
                      Congés payés
                    </button>
                    <button
                      type="button"
                      onClick={() => setTimeOffFilterKind('permission')}
                      className={cx(
                        'rounded-lg px-2 py-0.5 text-[11px] font-semibold flex items-center gap-1.5 transition-all shrink-0 border',
                        timeOffFilterKind === 'permission'
                          ? 'bg-[#8b5cf6] text-white border-[#8b5cf6] shadow-2xs font-bold'
                          : 'bg-surface text-ink-soft border-line/70 hover:bg-purple-wash hover:text-[#8b5cf6]'
                      )}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-[#8b5cf6] shrink-0" />
                      Permissions
                    </button>
                    <button
                      type="button"
                      onClick={() => setTimeOffFilterKind('absence')}
                      className={cx(
                        'rounded-lg px-2 py-0.5 text-[11px] font-semibold flex items-center gap-1.5 transition-all shrink-0 border',
                        timeOffFilterKind === 'absence'
                          ? 'bg-red text-white border-red shadow-2xs font-bold'
                          : 'bg-surface text-ink-soft border-line/70 hover:bg-red-wash hover:text-red'
                      )}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-red shrink-0" />
                      Absences
                    </button>
                    <button
                      type="button"
                      onClick={() => setTimeOffFilterKind('ferie')}
                      className={cx(
                        'rounded-lg px-2 py-0.5 text-[11px] font-semibold flex items-center gap-1.5 transition-all shrink-0 border',
                        timeOffFilterKind === 'ferie'
                          ? 'bg-emerald text-white border-emerald shadow-2xs font-bold'
                          : 'bg-surface text-ink-soft border-line/70 hover:bg-emerald-wash hover:text-emerald'
                      )}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald shrink-0" />
                      🇨🇲 Fériés ({timeOffMonthHolidaysCount})
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <select
                      value={timeOffFilterEmpId}
                      onChange={(e) => setTimeOffFilterEmpId(e.target.value)}
                      className="h-7 rounded-lg border border-line bg-surface px-2 text-[11px] text-ink focus:border-amber focus:outline-none shadow-2xs max-w-[130px] sm:max-w-[170px] truncate"
                      title="Filtrer par salarié"
                    >
                      <option value="all">Tous les ouvriers ({employees.filter((e) => e.active).length})</option>
                      {employees.filter((e) => e.active).map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.full_name} ({emp.id})
                        </option>
                      ))}
                    </select>

                    <select
                      value={timeOffFilterStatus}
                      onChange={(e) => setTimeOffFilterStatus(e.target.value as typeof timeOffFilterStatus)}
                      className="h-7 rounded-lg border border-line bg-surface px-2 text-[11px] text-ink focus:border-amber focus:outline-none shadow-2xs"
                      title="Filtrer par statut de validation"
                    >
                      <option value="all">Tous statuts</option>
                      <option value="approved">Validés</option>
                      <option value="pending">En attente</option>
                      <option value="rejected">Refusés</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* =========================================================================
            TAB 1: PEOPLE / EQUIPE
        ========================================================================= */}
        {canViewEmployees && <TabsContent value="people" className="space-y-4">
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
                                  <Button size="sm" variant="ghost" onClick={() => { setBadgeCopies(1); setBadgeFor(employee); }}>
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

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/40 pt-2 text-xs">
                      <span className="min-w-0 font-mono text-[11px] text-ink-faint">
                        Badge : <strong className="text-ink">{employee.badge_token ?? '—'}</strong>
                      </span>
                      <div className="flex min-w-0 flex-wrap items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        {canPrintBadge && (
                          <Button
                            size="sm"
                            variant="secondary"
                            icon={<Printer size={14} />}
                            onClick={() => { setBadgeCopies(1); setBadgeFor(employee); }}
                            aria-label={`Voir ou imprimer le badge de ${employee.full_name}`}
                          >
                            Voir le badge
                          </Button>
                        )}
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
        </TabsContent>}

        {/* =========================================================================
            TAB 2: TIME-OFF CALENDAR
        ========================================================================= */}
        {canViewLeaves && <TabsContent value="timeoff" className="space-y-4">
          <TimeOffCalendarView
            leaves={leaves}
            employees={employees}
            holidays={holidays}
            onReview={reviewLeave}
            onRevokeLeave={revokeLeave}
            onUpdateLeave={handleUpdateLeave}
            onDeleteHoliday={handleDeleteHoliday}
            canManage={canManageLeaves}
            currentMonth={timeOffMonth}
            viewMode={timeOffViewMode}
            filterKind={timeOffFilterKind}
            setFilterKind={setTimeOffFilterKind}
            filterEmpId={timeOffFilterEmpId}
            setFilterEmpId={setTimeOffFilterEmpId}
            filterStatus={timeOffFilterStatus}
            setFilterStatus={setTimeOffFilterStatus}
          />
        </TabsContent>}
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

            {/* Tab Selector: Fiche Employé vs Pointages & Présences vs Établi / Kit d'outils */}
            <div className="flex items-center gap-1.5 border-b border-line pb-2 overflow-x-auto scroll-none">
              <button
                type="button"
                onClick={() => setActiveDetailTab('fiche')}
                className={cx(
                  'flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all shrink-0',
                  activeDetailTab === 'fiche'
                    ? 'bg-amber text-slate-950 shadow-xs'
                    : 'text-ink-soft hover:text-ink hover:bg-paper-2',
                )}
              >
                <UserIcon size={13} />
                <span>Fiche Employé</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveDetailTab('pointages')}
                className={cx(
                  'flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all shrink-0',
                  activeDetailTab === 'pointages'
                    ? 'bg-amber text-slate-950 shadow-xs'
                    : 'text-ink-soft hover:text-ink hover:bg-paper-2',
                )}
              >
                <Clock size={13} />
                <span>Pointages & Présences</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveDetailTab('etabli')}
                className={cx(
                  'flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all shrink-0',
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

            {activeDetailTab === 'fiche' ? (
              <div className="space-y-4 text-xs">
                {/* 1. Compte Applicatif & Accès Système */}
                <div className="rounded-xl border border-line bg-surface p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between border-b border-line pb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-ink-faint flex items-center gap-1.5">
                      <KeyRound size={12} className="text-amber" /> Compte Applicatif & Accès Système
                    </span>
                    {detail.account ? (
                      <span className="rounded-full border border-green/30 bg-green-wash px-2 py-0.5 text-[10px] font-bold text-green">
                        Compte Actif
                      </span>
                    ) : (
                      <span className="rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[10px] font-bold text-ink-faint">
                        Borne / Badge Seul
                      </span>
                    )}
                  </div>

                  {detail.account ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-ink-soft">Identifiant de connexion :</span>
                        <span className="font-mono font-bold text-ink bg-surface-2 px-2 py-0.5 rounded border border-line">
                          @{detail.account.login}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-ink-soft">Rôle applicatif :</span>
                        <span className="font-semibold text-amber">
                          {detail.account.role_name || detail.account.role}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-ink-faint">Date d'affectation :</span>
                        <span className="text-ink-soft">{formatDate(detail.account.created_at)}</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-ink-soft text-[11px] italic">
                      Aucun compte applicatif web associé. Ce travailleur pointe via le terminal d'atelier avec son badge QR ou son code PIN sans accès au panneau de gestion.
                    </p>
                  )}
                </div>

                {/* 2. Identité & Affectation Atelier */}
                <div className="rounded-xl border border-line bg-surface p-3.5 space-y-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-ink-faint block border-b border-line pb-1.5">
                    Identité & Affectation Atelier
                  </span>
                  <div className="flex items-center justify-between">
                    <span className="text-ink-soft">Matricule officiel :</span>
                    <span className="font-mono font-bold text-ink">{detail.employee.id}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-ink-soft">Métier / Titre :</span>
                    <span className="font-bold text-ink">{detail.employee.job_title}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-ink-soft">Jeton Badge QR :</span>
                    <span className="font-mono font-bold text-ink bg-surface-2 px-2 py-0.5 rounded border border-line">
                      {detail.employee.badge_token || 'Non assigné'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-ink-soft">Code PIN borne :</span>
                    <span className="font-semibold text-ink">
                      {detail.employee.has_pin ? '●●●● Configuré' : 'Non configuré'}
                    </span>
                  </div>

                  {/* Configuration des jours ouvrés personnalisés du salarié */}
                  <div className="border-t border-line/60 pt-2 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-ink-soft font-medium">Jours ouvrés hebdomadaires :</span>
                      <span className="font-semibold text-amber">
                        {formatWorkdaysLabels(detail.employee.workdays)}
                      </span>
                    </div>
                    {canEdit && (
                      <div className="space-y-1">
                        <div className="flex flex-wrap gap-1">
                          {WEEKDAY_OPTIONS.map((opt) => {
                            const currentWorkdays = detail.employee.workdays && detail.employee.workdays.length > 0
                              ? detail.employee.workdays
                              : [1, 2, 3, 4, 5];
                            const isActive = currentWorkdays.includes(opt.day);
                            return (
                              <button
                                key={opt.day}
                                type="button"
                                onClick={async () => {
                                  const set = new Set(currentWorkdays);
                                  if (isActive) {
                                    if (set.size > 1) set.delete(opt.day);
                                  } else {
                                    set.add(opt.day);
                                  }
                                  const updated = Array.from(set).sort();
                                  try {
                                    await api(`/api/employees/${detail.employee.id}`, {
                                      method: 'PATCH',
                                      body: JSON.stringify({ workdays: updated }),
                                    });
                                    setDetail((prev) =>
                                      prev
                                        ? {
                                            ...prev,
                                            employee: { ...prev.employee, workdays: updated },
                                          }
                                        : prev
                                    );
                                    setReload((v) => v + 1);
                                    toast('Jours ouvrés mis à jour.', 'success');
                                  } catch (err) {
                                    toast('Erreur lors de la mise à jour des jours ouvrés', 'error');
                                  }
                                }}
                                className={cx(
                                  'px-2 py-0.5 rounded text-[11px] font-semibold border transition-all cursor-pointer',
                                  isActive
                                    ? 'bg-amber text-paper border-amber shadow-xs'
                                    : 'bg-surface text-ink-faint border-line hover:border-ink-soft'
                                )}
                                title={`Cliquer pour activer/désactiver ${opt.full}`}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                        <p className="text-[10px] text-ink-faint">
                          Cliquez pour ajuster le planning de service de cet ouvrier (impacte les congés).
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* 3. Historique Personnel des Congés, Permissions & Absences */}
                <div className="rounded-xl border border-line bg-surface p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between border-b border-line pb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-ink-faint flex items-center gap-1.5">
                      <CalendarCheck2 size={12} className="text-blue" /> Historique Congés & Permissions ({detail.leaves?.length ?? 0})
                    </span>
                  </div>

                  {!detail.leaves || detail.leaves.length === 0 ? (
                    <p className="text-ink-soft text-[11px] italic py-2">
                      Aucun congé ni permission enregistré pour ce travailleur.
                    </p>
                  ) : (
                    <div className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface-2/30">
                      {detail.leaves.map((l) => (
                        <div key={l.id} className="p-2.5 flex items-center justify-between gap-2 hover:bg-surface-2/70 transition-colors">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={cx(
                                  'inline-block h-2 w-2 rounded-full',
                                  l.kind === 'conge' ? 'bg-blue' : l.kind === 'permission' ? 'bg-[#8b5cf6]' : 'bg-red',
                                )}
                              />
                              <span className="font-bold text-ink capitalize">
                                {l.kind === 'conge' ? 'Congé payé' : l.kind === 'permission' ? 'Permission' : 'Absence'}
                              </span>
                            </div>
                            <p className="text-[11px] text-ink-soft mt-0.5">
                              Du {formatDate(l.from_date)} au {formatDate(l.to_date)}
                            </p>
                            {l.note && (
                              <p className="text-[10px] text-ink-faint italic truncate max-w-xs mt-0.5">
                                « {l.note} »
                              </p>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <span
                              className={cx(
                                'rounded-full px-2 py-0.5 text-[10px] font-bold border block text-center',
                                l.status === 'approved'
                                  ? 'border-green/30 bg-green-wash text-green'
                                  : l.status === 'pending'
                                  ? 'border-amber/30 bg-amber-wash text-amber'
                                  : 'border-red/30 bg-red-wash text-red',
                              )}
                            >
                              {l.status === 'approved' ? 'Accordé' : l.status === 'pending' ? 'En attente' : 'Refusé'}
                            </span>
                            <span className="text-[10px] font-mono text-ink-faint block mt-1">
                              {computeWorkingDays(l.from_date, l.to_date, holidays, detail.employee.workdays)} j ouvrés
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : activeDetailTab === 'etabli' ? (
              <div className="space-y-4">
                {employeeKit?.kit ? (
                  <EtabliKitCard
                    kit={employeeKit.kit}
                    items={employeeKit.items}
                    canManage={hasPerm('tools.edit_status')}
                    canAddItems={hasPerm('tools.create')}
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

          {/* Jours ouvrés personnalisés du travailleur */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-ink-soft">
                Jours ouvrés hebdomadaires de service
              </label>
              <span className="text-[11px] font-semibold text-amber">
                {formatWorkdaysLabels(form.workdays)}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {WEEKDAY_OPTIONS.map((opt) => {
                const currentList = form.workdays && form.workdays.length > 0 ? form.workdays : [1, 2, 3, 4, 5];
                const active = currentList.includes(opt.day);
                return (
                  <button
                    key={opt.day}
                    type="button"
                    onClick={() => {
                      const currentSet = new Set(currentList);
                      if (active) {
                        if (currentSet.size > 1) currentSet.delete(opt.day);
                      } else {
                        currentSet.add(opt.day);
                      }
                      setForm((f) => ({ ...f, workdays: Array.from(currentSet).sort() }));
                    }}
                    className={cx(
                      'px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer',
                      active
                        ? 'bg-amber text-paper border-amber shadow-xs'
                        : 'bg-surface text-ink-soft border-line hover:border-ink-faint'
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-[11px] text-ink-faint">
              Définit le planning ouvré pour calculer précisément les congés et permissions sans compter les repos.
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
                if (badgeFor) print(<BadgeSheet employees={Array.from({ length: badgeCopies }, () => badgeFor)} paper={badgePaper} />);
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

          <label className="block text-sm font-medium text-ink">
            Nombre d’exemplaires
            <input
              aria-label="Nombre d’exemplaires du badge"
              type="number"
              min={1}
              max={100}
              step={1}
              value={badgeCopies}
              onChange={(event) => setBadgeCopies(Math.min(100, Math.max(1, Math.trunc(Number(event.target.value) || 1))))}
              className="mt-1.5 h-10 w-full rounded-lg border border-line bg-surface px-3 text-ink"
            />
          </label>
          <label className="block text-sm font-medium text-ink">
            Format du papier
            <select value={badgePaper} onChange={(event) => setBadgePaper(event.target.value as 'A4' | 'Letter')} className="mt-1.5 h-10 w-full rounded-lg border border-line bg-surface px-3 text-ink">
              <option value="A4">A4</option>
              <option value="Letter">Letter</option>
            </select>
          </label>

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

      {/* Modal: Poser un congé ou accorder une permission (Direction / Ayant-droit) */}
      <Modal
        open={leaveOpen}
        title={
          leaveForm.kind === 'conge'
            ? 'Poser un Congé Annuel Payé'
            : leaveForm.kind === 'permission'
            ? 'Accorder une Permission Exceptionnelle'
            : 'Enregistrer une Absence Autorisée'
        }
        onClose={() => setLeaveOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setLeaveOpen(false)}>Annuler</Button>
            <Button variant="primary" disabled={leaveBusy} onClick={() => void submitLeave()}>
              {leaveBusy ? <Spinner /> : 'Valider et Enregistrer'}
            </Button>
          </>
        }
      >
        <div className="space-y-3.5 text-xs">
          {leaveError ? <Banner tone="error">{leaveError}</Banner> : null}

          <div>
            <label className="mb-1 block font-medium text-ink-soft">Travailleur bénéficiaire</label>
            <select
              value={leaveForm.employee_id}
              onChange={(e) => setLeaveForm((f) => ({ ...f, employee_id: e.target.value }))}
              className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-xs text-ink focus:border-amber focus:outline-none"
            >
              <option value="">— Sélectionner un ouvrier —</option>
              {employees.filter((emp) => emp.active).map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.full_name} ({emp.id}) · {emp.job_title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block font-medium text-ink-soft">Type de flux</label>
            <select
              value={leaveForm.kind}
              onChange={(e) => setLeaveForm((f) => ({ ...f, kind: e.target.value as typeof f.kind }))}
              className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-xs text-ink focus:border-amber focus:outline-none"
            >
              <option value="conge">Congé annuel payé (Planifié par la Direction)</option>
              <option value="permission">Permission exceptionnelle (Événement familial / impératif)</option>
              <option value="absence">Absence autorisée (Mission / repos compensateur)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block font-medium text-ink-soft">Date de départ</label>
              <input
                type="date"
                value={leaveForm.from_date}
                onChange={(e) => setLeaveForm((f) => ({ ...f, from_date: e.target.value }))}
                className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-xs text-ink focus:border-amber focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block font-medium text-ink-soft">Date de retour</label>
              <input
                type="date"
                value={leaveForm.to_date}
                onChange={(e) => setLeaveForm((f) => ({ ...f, to_date: e.target.value }))}
                className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-xs text-ink focus:border-amber focus:outline-none"
              />
            </div>
          </div>

          {/* Décompte dynamique des jours ouvrés nets selon le planning personnalisé du travailleur */}
          {(() => {
            const curEmp = employees.find((e) => String(e.id) === String(leaveForm.employee_id));
            const netDays = computeWorkingDays(leaveForm.from_date, leaveForm.to_date, holidays, curEmp?.workdays);
            return (
              <div className="rounded-xl border border-line bg-surface-2 p-3 space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-ink-soft">Jours ouvrés hebdomadaires de {curEmp?.full_name ? formatPillName(curEmp.full_name) : 'l’ouvrier'} :</span>
                  <span className="font-semibold text-amber">
                    {formatWorkdaysLabels(curEmp?.workdays)}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-line/60 pt-1.5">
                  <span className="text-ink-soft">Décompte personnalisé en jours ouvrés :</span>
                  <span className="font-mono font-bold text-ink text-sm">
                    {netDays} jour(s) ouvré(s) nets
                  </span>
                </div>
              </div>
            );
          })()}

          {/* Condition cognitive essentielle : pas de motif pour le congé annuel payé ! */}
          {leaveForm.kind === 'conge' ? (
            <div className="rounded-xl border border-blue/30 bg-blue-wash/30 p-3 text-xs text-ink-soft flex items-start gap-2.5">
              <span className="text-base shrink-0">ℹ️</span>
              <div>
                <p className="font-semibold text-ink">Congé Annuel Payé (Droit au Repos)</p>
                <p className="text-[11px] text-ink-soft mt-0.5">
                  Conformément au Code du Travail et à l'organisation de l'atelier, le repos annuel est alloué par la Direction. Aucun justificatif ni motif n'est exigé du travailleur.
                </p>
              </div>
            </div>
          ) : (
            <div>
              <label className="mb-1 block font-medium text-ink-soft">
                Motif &amp; Justification de la permission
              </label>
              <textarea
                value={leaveForm.note}
                onChange={(e) => setLeaveForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="Ex : Mariage, décès familial, convocation administrative, consultation médicale…"
                rows={2}
                className="w-full rounded-lg border border-line bg-surface p-2.5 text-xs text-ink focus:border-amber focus:outline-none"
              />
            </div>
          )}
        </div>
      </Modal>

      {/* Modal: Déclaration Jour Férié ou Fête Religieuse */}
      <Modal
        open={decreeModalOpen}
        title="Ajouter un Jour Férié ou Fête (Religieuse, Décret, Civile)"
        onClose={() => setDecreeModalOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDecreeModalOpen(false)}>Annuler</Button>
            <Button
              variant="primary"
              disabled={decreeBusy}
              onClick={() => void submitDecree()}
              className="bg-emerald hover:bg-emerald-2 text-white font-bold"
            >
              {decreeBusy ? <Spinner /> : 'Enregistrer et appliquer'}
            </Button>
          </>
        }
      >
        <div className="space-y-3.5 text-xs">
          {decreeError && <Banner tone="error">{decreeError}</Banner>}

          {/* Sélecteur de type de férié / fête */}
          <div>
            <label className="mb-1.5 block font-semibold text-ink">Catégorie du jour chômé</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setDecreeForm((f) => ({ ...f, kind: 'religious' }))}
                className={cx(
                  'rounded-xl border p-2.5 text-left transition-all cursor-pointer',
                  decreeForm.kind === 'religious'
                    ? 'border-amber bg-amber-wash text-ink ring-1 ring-amber/30'
                    : 'border-line bg-surface text-ink-soft hover:bg-surface-2'
                )}
              >
                <span className="block text-sm mb-0.5">⛪</span>
                <span className="block font-bold text-[11px]">Religieux / Monastique</span>
                <span className="block text-[10px] text-ink-faint">Saint-Benoît, Solennité...</span>
              </button>
              <button
                type="button"
                onClick={() => setDecreeForm((f) => ({ ...f, kind: 'presidential_decree' }))}
                className={cx(
                  'rounded-xl border p-2.5 text-left transition-all cursor-pointer',
                  decreeForm.kind === 'presidential_decree'
                    ? 'border-emerald bg-emerald-wash text-ink ring-1 ring-emerald/30'
                    : 'border-line bg-surface text-ink-soft hover:bg-surface-2'
                )}
              >
                <span className="block text-sm mb-0.5">🇨🇲</span>
                <span className="block font-bold text-[11px]">Décret / Arrêté</span>
                <span className="block text-[10px] text-ink-faint">Férié d'État exceptionnel</span>
              </button>
              <button
                type="button"
                onClick={() => setDecreeForm((f) => ({ ...f, kind: 'legal_national' }))}
                className={cx(
                  'rounded-xl border p-2.5 text-left transition-all cursor-pointer',
                  decreeForm.kind === 'legal_national'
                    ? 'border-blue bg-blue-wash text-ink ring-1 ring-blue/30'
                    : 'border-line bg-surface text-ink-soft hover:bg-surface-2'
                )}
              >
                <span className="block text-sm mb-0.5">🏛️</span>
                <span className="block font-bold text-[11px]">Férié Civil / CFTM</span>
                <span className="block text-[10px] text-ink-faint">Pont, fête entreprise</span>
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1 block font-medium text-ink-soft">Date chômée</label>
            <input
              type="date"
              value={decreeForm.holiday_date}
              onChange={(e) => setDecreeForm((f) => ({ ...f, holiday_date: e.target.value }))}
              className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-xs text-ink focus:border-amber focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block font-medium text-ink-soft">Intitulé / Fête / Motif</label>
            <input
              type="text"
              value={decreeForm.name}
              onChange={(e) => setDecreeForm((f) => ({ ...f, name: e.target.value }))}
              placeholder={
                decreeForm.kind === 'religious'
                  ? 'Ex : Fête de Saint-Benoît (Patron du Monastère)'
                  : decreeForm.kind === 'presidential_decree'
                  ? 'Ex : Férié accordé par Décret Présidentiel'
                  : 'Ex : Pont exceptionnel accordé par la Direction'
              }
              className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-xs text-ink focus:border-amber focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block font-medium text-ink-soft">Référence ou note (facultatif)</label>
            <input
              type="text"
              value={decreeForm.decree_ref}
              onChange={(e) => setDecreeForm((f) => ({ ...f, decree_ref: e.target.value }))}
              placeholder={
                decreeForm.kind === 'religious'
                  ? 'Ex : Solennité monastique - Prieuré du Mont Fébé'
                  : decreeForm.kind === 'presidential_decree'
                  ? 'Ex : Décret N° 2026/048 du Président de la République'
                  : 'Ex : Décision de Direction CFTM'
              }
              className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-xs text-ink focus:border-amber focus:outline-none"
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
        'badge-card relative flex flex-col justify-between overflow-hidden rounded-[3mm] border border-gray-300 bg-white text-gray-900 shadow-sm',
        isPreview ? 'h-[200px] w-full max-w-[340px] p-3 text-[13px]' : 'h-[53.98mm] w-[85.6mm] p-[3mm] text-[8pt]',
      )}
      style={{ fontFamily: '"IBM Plex Sans", -apple-system, sans-serif' }}
    >
      <div className="flex items-center gap-2 border-b border-gray-200 pb-1.5">
        <img
          src="/emblem.png"
          alt=""
          className={cx('object-contain shrink-0', isPreview ? 'h-7 w-7' : 'h-[6mm] w-[6mm]')}
        />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="text-[8pt] font-bold tracking-wide text-gray-950">CFTM</p>
          <p className="text-[5.5pt] font-medium text-gray-600">Bénédictins du Mont‑Fébé</p>
        </div>
        <span className="text-[5.5pt] font-semibold uppercase tracking-[0.12em] text-gray-500">Personnel</span>
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
              <span className="font-mono text-[6pt] font-semibold text-gray-600">
                {employee.id}
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

      <div className="flex items-center justify-between border-t border-gray-200 pt-1 text-[5pt] font-medium text-gray-500">
        <span>Carte professionnelle</span>
        <span className="font-semibold uppercase tracking-wider">Pointage</span>
      </div>
    </div>
  );
}

function BadgeSheet({ employees, paper = 'A4' }: { employees: Employee[]; paper?: 'A4' | 'Letter' }) {
  return (
    <div className="a4-page" style={{ fontFamily: '"IBM Plex Sans", sans-serif' }}>
      <style>{`@page { size: ${paper} portrait; margin: 10mm; }`}</style>
      <div style={{ marginBottom: '6mm', borderBottom: '1px solid #e5e7eb', paddingBottom: '3mm' }} className="flex items-center justify-between">
        <div>
          <p style={{ fontSize: '12pt', fontWeight: 700, color: '#ff6603', margin: 0 }}>
            CFTM · Bénédictins du Mont‑Fébé
          </p>
          <p style={{ fontSize: '8.5pt', color: '#6b7280', margin: '1mm 0 0' }}>
            Planche de badges · {employees.length} carte(s) · format ID‑1 (85,6 × 53,98 mm)
          </p>
        </div>
        <img src="/emblem.png" alt="" style={{ height: '9mm', width: '9mm', objectFit: 'contain' }} />
      </div>
      <div className="badge-grid">
        {employees.map((employee) => (
          <BadgeCard key={employee.id} employee={employee} />
        ))}
      </div>
    </div>
  );
}
