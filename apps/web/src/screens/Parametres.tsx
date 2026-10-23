import { Fragment, useEffect, useMemo, useState } from 'react';
import { ROLES_OPTION } from '../lib/roles';
import {
  api,
  type AppUserRow,
  type BackupInfo,
  type Employee,
  type KioskSettings,
  type PermissionMatrix,
  type Role,
  type RoleInfo,
  type TerminalInfo,
  type User,
} from '../lib/api';
import { ROLE_LABEL, WORKDAY_LABEL, formatDateTime } from '../lib/labels';
import {
  Banner,
  Button,
  EmptyState,
  Modal,
  PageHeader,
  Spinner,
  cx,
  useToast,
} from '../components/ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card';
import { Separator } from '../components/ui/separator';
import {
  AlertTriangle,
  Check,
  CheckCheck,
  CheckCircle2,
  Clock,
  Copy,
  Database,
  Download,
  Filter,
  HardDrive,
  KeyRound,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserPlus,
  Users,
  UserX,
  X,
} from 'lucide-react';

const WEEKDAYS_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Lundi -> Dimanche

const ROLE_ORDER: Record<string, number> = { direction: 0, magasinier: 1, chef_atelier: 2, travailleur: 3 };

const DEFAULT_ROLE_THEME = {
  badgeVariant: 'outline' as const,
  tone: 'neutral' as const,
  bg: 'bg-surface-2 text-ink-soft border-line',
  text: 'text-ink-soft',
  border: 'border-line',
};

const ROLE_THEME: Record<string, { badgeVariant: 'default' | 'secondary' | 'outline'; tone: 'blue' | 'amber' | 'green' | 'neutral'; bg: string; text: string; border: string }> = {
  direction: {
    badgeVariant: 'default',
    tone: 'blue',
    bg: 'bg-surface-2 text-ink border-line',
    text: 'text-ink',
    border: 'border-line',
  },
  magasinier: {
    badgeVariant: 'secondary',
    tone: 'amber',
    bg: 'bg-surface-2 text-ink border-line',
    text: 'text-amber',
    border: 'border-line',
  },
  chef_atelier: {
    badgeVariant: 'secondary',
    tone: 'green',
    bg: 'bg-surface-2 text-ink border-line',
    text: 'text-green',
    border: 'border-line',
  },
  travailleur: {
    badgeVariant: 'outline',
    tone: 'neutral',
    bg: 'bg-surface-2 text-ink-soft border-line',
    text: 'text-ink-soft',
    border: 'border-line',
  },
};

const ROLE_DESC: Record<Role, string> = {
  direction: 'Super-administrateur : accès intégral à tous les modules, comptes et sauvegardes.',
  magasinier: 'Gestion logistique : inventaire d’outils, stocks, entrées/sorties et magasins.',
  chef_atelier: 'Supervision terrain : gestion des équipes, prêts d’outils et départs de chantier.',
  travailleur: 'Accès restreint : consultation de son espace personnel, prêts et pointages.',
};

function roleInitials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join('')
      .toUpperCase() || '?'
  );
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} o`;
  if (size < 1_048_576) return `${(size / 1024).toFixed(1)} Ko`;
  return `${(size / 1_048_576).toFixed(1)} Mo`;
}

async function downloadFile(url: string, filename: string, init?: RequestInit): Promise<void> {
  const res = await fetch(url, { credentials: 'include', ...init });
  if (!res.ok) {
    let message = `Erreur ${res.status}`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      /* réponse non JSON */
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 4_000);
}

export function Parametres({ user }: { user: User }) {
  if (user.role !== 'direction') {
    return (
      <div className="space-y-6">
        <PageHeader title="Paramètres" hint="Réglages de l’atelier." />
        <Card className="border-line bg-surface p-8 text-center shadow-card">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-amber-wash text-amber">
            <Lock size={22} />
          </div>
          <h2 className="mt-4 text-base font-semibold text-ink">Espace réservé à la direction</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">
            La gestion des comptes d’accès, des terminaux, des permissions et des sauvegardes système est réservée aux
            membres de la direction.
          </p>
        </Card>
      </div>
    );
  }

  return <AdminSettings user={user} />;
}

function AdminSettings({ user }: { user: User }) {
  const toast = useToast();

  // Navigation tab
  const [activeTab, setActiveTab] = useState<'comptes' | 'permissions' | 'kiosk' | 'securite' | 'sauvegardes'>(() => {
    try {
      const saved = sessionStorage.getItem('parametres_active_tab');
      if (saved && ['comptes', 'permissions', 'kiosk', 'securite', 'sauvegardes'].includes(saved)) {
        sessionStorage.removeItem('parametres_active_tab');
        return saved as 'comptes' | 'permissions' | 'kiosk' | 'securite' | 'sauvegardes';
      }
    } catch {
      /* ignore storage error */
    }
    return 'comptes';
  });

  // Core data states
  const [settings, setSettings] = useState<KioskSettings | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [motifDraft, setMotifDraft] = useState('');

  const [terminals, setTerminals] = useState<TerminalInfo[]>([]);
  const [users, setUsers] = useState<AppUserRow[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [permMatrix, setPermMatrix] = useState<PermissionMatrix | null>(null);
  const [permDraft, setPermDraft] = useState<Record<string, Record<string, boolean>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [reload, setReload] = useState(0);

  // Backup & Reset states
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [retentionDays, setRetentionDays] = useState(30);
  const [backupBusy, setBackupBusy] = useState(false);
  const [resetText, setResetText] = useState('');
  const [resetBusy, setResetBusy] = useState(false);

  // Terminal dialog state
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalForm, setTerminalForm] = useState({ name: '', id: '' });
  const [copiedTerminalId, setCopiedTerminalId] = useState<string | null>(null);

  // User management dialogs
  const [userOpen, setUserOpen] = useState(false);
  const [userForm, setUserForm] = useState({
    login: '',
    display_name: '',
    password: '',
    role: 'magasinier' as Role,
    employee_id: '',
  });
  const [resetFor, setResetFor] = useState<AppUserRow | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [editFor, setEditFor] = useState<AppUserRow | null>(null);
  const [editForm, setEditForm] = useState({ display_name: '', role: 'travailleur' as Role, employee_id: '' });

  // Password change for current user
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });

  // General busy & error states
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Filter states for accounts
  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Role management states (Direction control)
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [roleModalMode, setRoleModalMode] = useState<'create' | 'edit'>('create');
  const [roleForm, setRoleForm] = useState({ id: '', name: '', description: '' });
  const [roleError, setRoleError] = useState<string | null>(null);
  const [roleBusy, setRoleBusy] = useState(false);
  const [deleteRoleConfirm, setDeleteRoleConfirm] = useState<RoleInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (reload === 0) setLoading(true);
    else setIsRefreshing(true);

    Promise.all([
      api<{ settings: KioskSettings }>('/api/settings'),
      api<{ terminals: TerminalInfo[] }>('/api/terminals'),
      api<{ users: AppUserRow[] }>('/api/users'),
      api<{ employees: Employee[] }>('/api/employees'),
      api<PermissionMatrix>('/api/permissions').catch(() => null),
      user.role === 'direction'
        ? api<{ backups: BackupInfo[]; retentionDays: number }>('/api/admin/backups').catch(() => null)
        : Promise.resolve(null),
    ])
      .then(([setRes, termRes, userRes, empRes, permRes, backupRes]) => {
        if (cancelled) return;
        setSettings(setRes.settings);
        setTerminals(termRes.terminals);
        setUsers(userRes.users);
        setEmployees(empRes.employees);
        if (permRes) {
          setPermMatrix(permRes);
          setPermDraft(permRes.matrix);
        }
        if (backupRes) {
          setBackups(backupRes.backups);
          setRetentionDays(backupRes.retentionDays);
        }
        setSettingsError(null);
      })
      .catch((err) => {
        if (!cancelled) setSettingsError(err instanceof Error ? err.message : 'Chargement impossible.');
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setIsRefreshing(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reload, user.role]);

  // Save Settings helper
  async function saveSettings(patch: Partial<KioskSettings>) {
    setSavingSettings(true);
    setSettingsError(null);
    try {
      const res = await api<{ settings: KioskSettings }>('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(patch),
      });
      setSettings(res.settings);
      toast('Paramètres enregistrés.', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Enregistrement impossible.';
      setSettingsError(message);
      toast(message, 'error');
    } finally {
      setSavingSettings(false);
    }
  }

  // Backup actions
  async function refreshBackups() {
    try {
      const res = await api<{ backups: BackupInfo[]; retentionDays: number }>('/api/admin/backups');
      setBackups(res.backups);
      setRetentionDays(res.retentionDays);
    } catch {
      /* la liste reste telle quelle */
    }
  }

  async function saveBackupNow() {
    setBackupBusy(true);
    try {
      const res = await api<{ ok: boolean; size: number; tables: number; rows: number }>('/api/admin/backup/save', {
        method: 'POST',
      });
      toast(`Sauvegarde cloud réussie (${res.tables} tables, ${formatBytes(res.size)}).`, 'success');
      await refreshBackups();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Sauvegarde impossible.', 'error');
    } finally {
      setBackupBusy(false);
    }
  }

  async function downloadExport() {
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      await downloadFile('/api/admin/backup', `monastere-backup-${stamp}.json.gz`, { method: 'POST' });
      toast('Export JSON compressé téléchargé.', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Export impossible.', 'error');
    }
  }

  async function downloadBackup(pathname: string) {
    try {
      const filename = pathname.slice(pathname.lastIndexOf('/') + 1);
      await downloadFile(`/api/admin/backups/download?backup=${encodeURIComponent(pathname)}`, filename);
      toast('Sauvegarde téléchargée.', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Téléchargement impossible.', 'error');
    }
  }

  async function resetDemo() {
    setResetBusy(true);
    try {
      await api<{ ok: boolean }>('/api/admin/reset-demo', {
        method: 'POST',
        body: JSON.stringify({ confirm: resetText }),
      });
      toast('Données de démonstration purgées avec succès.', 'success');
      setTimeout(() => window.location.reload(), 700);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Purge impossible.', 'error');
      setResetBusy(false);
    }
  }

  // Workdays & Motifs
  function toggleWorkday(day: number) {
    if (!settings) return;
    const workdays = settings.workdays.includes(day)
      ? settings.workdays.filter((value) => value !== day)
      : [...settings.workdays, day].sort();
    void saveSettings({ workdays: workdays.length ? workdays : [1] });
  }

  function removeMotif(motif: string) {
    if (!settings) return;
    const late_motifs = settings.late_motifs.filter((value) => value !== motif);
    if (late_motifs.length === 0) {
      toast('Au moins un motif de retard doit rester configuré.', 'error');
      return;
    }
    void saveSettings({ late_motifs });
  }

  function addMotif() {
    const value = motifDraft.trim();
    if (!settings || !value) return;
    if (settings.late_motifs.includes(value)) {
      toast('Ce motif existe déjà.', 'error');
      return;
    }
    setMotifDraft('');
    void saveSettings({ late_motifs: [...settings.late_motifs, value] });
  }

  // Terminal actions
  async function createTerminal() {
    setBusy(true);
    setFormError(null);
    try {
      await api('/api/terminals', {
        method: 'POST',
        body: JSON.stringify({ name: terminalForm.name.trim(), id: terminalForm.id.trim() || undefined }),
      });
      toast('Terminal enregistré avec succès.', 'success');
      setTerminalOpen(false);
      setReload((value) => value + 1);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleTerminal(terminal: TerminalInfo) {
    try {
      await api(`/api/terminals/${terminal.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !terminal.active }),
      });
      toast(terminal.active ? 'Terminal désactivé.' : 'Terminal activé.', 'success');
      setReload((value) => value + 1);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Opération refusée.', 'error');
    }
  }

  function copyToClipboard(text: string, id: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedTerminalId(id);
      toast(`Identifiant ${text} copié dans le presse-papier.`, 'info');
      setTimeout(() => setCopiedTerminalId(null), 2500);
    });
  }

  // User actions
  async function createUser() {
    setBusy(true);
    setFormError(null);
    try {
      await api('/api/users', {
        method: 'POST',
        body: JSON.stringify({ ...userForm, employee_id: userForm.employee_id || undefined }),
      });
      toast('Nouveau compte créé.', 'success');
      setUserOpen(false);
      setReload((value) => value + 1);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Création impossible.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleUser(account: AppUserRow) {
    try {
      await api(`/api/users/${account.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !account.active }),
      });
      toast(account.active ? `Compte ${account.login} désactivé.` : `Compte ${account.login} activé.`, 'success');
      setReload((value) => value + 1);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Opération refusée.', 'error');
    }
  }

  async function resetUserPassword() {
    if (!resetFor) return;
    setBusy(true);
    try {
      await api(`/api/users/${resetFor.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ password: resetPassword }),
      });
      toast(`Mot de passe réinitialisé pour ${resetFor.login}.`, 'success');
      setResetFor(null);
      setResetPassword('');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Opération refusée.', 'error');
    } finally {
      setBusy(false);
    }
  }

  function openEditAccount(account: AppUserRow) {
    setEditFor(account);
    setEditForm({
      display_name: account.display_name,
      role: account.role,
      employee_id: account.employee_id ?? '',
    });
    setFormError(null);
  }

  async function updateAccount() {
    if (!editFor) return;
    setBusy(true);
    setFormError(null);
    try {
      await api(`/api/users/${editFor.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          display_name: editForm.display_name.trim(),
          role: editForm.role,
          employee_id: editForm.employee_id || null,
        }),
      });
      toast('Compte mis à jour.', 'success');
      setEditFor(null);
      setReload((value) => value + 1);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Mise à jour impossible.');
    } finally {
      setBusy(false);
    }
  }

  async function changeMyPassword() {
    setBusy(true);
    setFormError(null);
    try {
      if (pw.next !== pw.confirm) throw new Error('La confirmation ne correspond pas au nouveau mot de passe.');
      await api('/api/users/me/password', {
        method: 'POST',
        body: JSON.stringify({ current_password: pw.current, new_password: pw.next }),
      });
      toast('Votre mot de passe a été modifié avec succès.', 'success');
      setPw({ current: '', next: '', confirm: '' });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Changement impossible.');
    } finally {
      setBusy(false);
    }
  }

  // Permissions Matrix actions
  function togglePerm(action: string, role: string) {
    setPermDraft((prev) => {
      if (!prev) return prev;
      return { ...prev, [action]: { ...prev[action], [role]: !prev[action]?.[role] } };
    });
  }

  const hasUnsavedPerms = useMemo(() => {
    if (!permMatrix || !permDraft) return false;
    return JSON.stringify(permMatrix.matrix) !== JSON.stringify(permDraft);
  }, [permMatrix, permDraft]);

  async function savePermissions() {
    if (!permDraft) return;
    setBusy(true);
    try {
      await api('/api/permissions', { method: 'PUT', body: JSON.stringify({ matrix: permDraft }) });
      toast('Matrice des permissions mise à jour.', 'success');
      setReload((value) => value + 1);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Enregistrement impossible.', 'error');
    } finally {
      setBusy(false);
    }
  }

  function resetPermDraft() {
    if (permMatrix) {
      setPermDraft(permMatrix.matrix);
      toast('Modifications de permissions annulées.', 'info');
    }
  }

  // Role management actions (Direction)
  function openCreateRoleModal() {
    setRoleForm({ id: '', name: '', description: '' });
    setRoleModalMode('create');
    setRoleError(null);
    setRoleModalOpen(true);
  }

  function openEditRoleModal(r: RoleInfo) {
    setRoleForm({ id: r.id, name: r.name, description: r.description ?? '' });
    setRoleModalMode('edit');
    setRoleError(null);
    setRoleModalOpen(true);
  }

  async function handleSaveRole() {
    const trimmedId = roleForm.id.trim().toLowerCase();
    const trimmedName = roleForm.name.trim();
    if (roleModalMode === 'create' && !trimmedId) {
      setRoleError('L’identifiant technique du rôle est requis.');
      return;
    }
    if (!trimmedName) {
      setRoleError('Le libellé officiel du rôle est requis.');
      return;
    }

    setRoleBusy(true);
    setRoleError(null);
    try {
      if (roleModalMode === 'create') {
        await api('/api/permissions/roles', {
          method: 'POST',
          body: JSON.stringify({
            id: trimmedId,
            name: trimmedName,
            description: roleForm.description.trim() || undefined,
          }),
        });
        toast(`Rôle « ${trimmedName} » créé avec succès.`, 'success');
      } else {
        await api(`/api/permissions/roles/${roleForm.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: trimmedName,
            description: roleForm.description.trim() || undefined,
          }),
        });
        toast(`Rôle « ${trimmedName} » mis à jour.`, 'success');
      }
      setRoleModalOpen(false);
      setReload((v) => v + 1);
    } catch (err) {
      setRoleError(err instanceof Error ? err.message : 'Impossible d’enregistrer le rôle.');
    } finally {
      setRoleBusy(false);
    }
  }

  async function handleDeleteRole(role: RoleInfo) {
    setRoleBusy(true);
    try {
      await api(`/api/permissions/roles/${role.id}`, {
        method: 'DELETE',
      });
      toast(`Rôle « ${role.name} » supprimé avec succès.`, 'success');
      setDeleteRoleConfirm(null);
      setReload((v) => v + 1);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Suppression impossible.', 'error');
    } finally {
      setRoleBusy(false);
    }
  }

  // Dynamic available roles list with user count
  const availableRoles = useMemo<RoleInfo[]>(() => {
    if (permMatrix?.rolesDetail && permMatrix.rolesDetail.length > 0) {
      return permMatrix.rolesDetail.map((r) => ({
        ...r,
        user_count: users.filter((u) => u.role === r.id).length,
      }));
    }
    return ROLES_OPTION.map((r) => ({
      id: r,
      name: ROLE_LABEL[r] ?? r,
      description: ROLE_DESC[r] ?? null,
      is_system: r === 'direction',
      user_count: users.filter((u) => u.role === r).length,
    }));
  }, [permMatrix?.rolesDetail, users]);

  // Mappings & Filtered Data
  const employeesById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  const sortedUsers = useMemo(
    () =>
      [...users].sort(
        (a, b) =>
          (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99) ||
          a.display_name.localeCompare(b.display_name, 'fr'),
      ),
    [users],
  );

  const filteredUsers = useMemo(() => {
    return sortedUsers.filter((u) => {
      // Role filter
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      // Status filter
      if (statusFilter === 'active' && !u.active) return false;
      if (statusFilter === 'inactive' && u.active) return false;
      // Search query
      if (userSearch.trim()) {
        const query = userSearch.toLowerCase();
        const emp = u.employee_id ? employeesById.get(u.employee_id) : undefined;
        const empName = emp ? emp.full_name.toLowerCase() : '';
        const match =
          u.login.toLowerCase().includes(query) ||
          u.display_name.toLowerCase().includes(query) ||
          (u.employee_id && u.employee_id.toLowerCase().includes(query)) ||
          empName.includes(query);
        if (!match) return false;
      }
      return true;
    });
  }, [sortedUsers, roleFilter, statusFilter, userSearch, employeesById]);

  // Key performance indicators
  const activeUsersCount = useMemo(() => users.filter((u) => u.active).length, [users]);
  const activeTerminalsCount = useMemo(() => terminals.filter((t) => t.active).length, [terminals]);

  if (loading && !settings) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-sm text-ink-soft">
        <Spinner className="h-6 w-6 text-amber" />
        <p className="font-medium">Chargement des paramètres de la console…</p>
      </div>
    );
  }

  if (!settings) {
    return <EmptyState title="Paramètres indisponibles" hint={settingsError ?? undefined} />;
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <PageHeader
        title="Paramètres"
        actions={
          <Button
            variant="ghost"
            size="sm"
            disabled={isRefreshing}
            icon={<RefreshCw size={15} className={cx(isRefreshing && 'animate-spin text-amber')} />}
            onClick={() => setReload((value) => value + 1)}
          >
            {isRefreshing ? 'Actualisation…' : 'Actualiser'}
          </Button>
        }
      />

      {settingsError ? (
        <div className="mb-4">
          <Banner tone="error">{settingsError}</Banner>
        </div>
      ) : null}

      {/* Main Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as typeof activeTab)} className="w-full space-y-6">
        <div className="border-b border-line pb-px overflow-x-auto scroll-thin">
          <TabsList variant="line" className="flex gap-1.5 sm:gap-2 bg-transparent p-0 w-max min-w-full">
            <TabsTrigger
              value="comptes"
              className="shrink-0 whitespace-nowrap gap-2 px-3 py-2 text-xs sm:text-sm font-medium data-active:border-b-2 data-active:border-amber data-active:text-ink"
            >
              <Users size={16} />
              <span>Comptes</span>
              <span className="ml-1 rounded-full bg-paper-2 px-2 py-0.5 text-[11px] font-semibold text-ink-soft">
                {activeUsersCount}/{users.length}
              </span>
            </TabsTrigger>

            <TabsTrigger
              value="permissions"
              className="shrink-0 whitespace-nowrap relative gap-2 px-3 py-2 text-xs sm:text-sm font-medium data-active:border-b-2 data-active:border-amber data-active:text-ink"
            >
              <ShieldCheck size={16} />
              <span>Rôles &amp; Permissions</span>
              {hasUnsavedPerms ? (
                <span className="h-2 w-2 rounded-full bg-amber" title="Modifications en attente" />
              ) : null}
            </TabsTrigger>

            <TabsTrigger
              value="kiosk"
              className="shrink-0 whitespace-nowrap gap-2 px-3 py-2 text-xs sm:text-sm font-medium data-active:border-b-2 data-active:border-amber data-active:text-ink"
            >
              <Clock size={16} />
              <span>Pointage &amp; Kiosque</span>
              <span className="ml-1 rounded-full bg-paper-2 px-2 py-0.5 text-[11px] font-semibold text-ink-soft">
                {activeTerminalsCount} act.
              </span>
            </TabsTrigger>

            <TabsTrigger
              value="securite"
              className="shrink-0 whitespace-nowrap gap-2 px-3 py-2 text-xs sm:text-sm font-medium data-active:border-b-2 data-active:border-amber data-active:text-ink"
            >
              <KeyRound size={16} />
              <span>Sécurité &amp; Profil</span>
            </TabsTrigger>

            <TabsTrigger
              value="sauvegardes"
              className="shrink-0 whitespace-nowrap gap-2 px-3 py-2 text-xs sm:text-sm font-medium data-active:border-b-2 data-active:border-amber data-active:text-ink"
            >
              <HardDrive size={16} />
              <span>Sauvegardes &amp; Système</span>
              <span className="ml-1 rounded-full bg-paper-2 px-2 py-0.5 text-[11px] font-semibold text-ink-soft">
                {backups.length}
              </span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* =========================================================================
            TAB 1: COMPTES UTILISATEURS
        ========================================================================= */}
        <TabsContent value="comptes" className="space-y-6">
          {/* Quick Metrics */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card className="p-4 shadow-card">
              <p className="text-[12px] font-medium uppercase tracking-wider text-ink-faint">Total Comptes</p>
              <p className="mt-1 text-2xl font-semibold text-ink">{users.length}</p>
            </Card>
            <Card className="p-4 shadow-card">
              <p className="text-[12px] font-medium uppercase tracking-wider text-ink-faint">Comptes Actifs</p>
              <p className="mt-1 text-2xl font-semibold text-green">{activeUsersCount}</p>
            </Card>
            <Card className="p-4 shadow-card">
              <p className="text-[12px] font-medium uppercase tracking-wider text-ink-faint">Rattachés Travailleurs</p>
              <p className="mt-1 text-2xl font-semibold text-ink">
                {users.filter((u) => !!u.employee_id).length}
              </p>
            </Card>
            <Card className="p-4 shadow-card">
              <p className="text-[12px] font-medium uppercase tracking-wider text-ink-faint">Direction &amp; Admin</p>
              <p className="mt-1 text-2xl font-semibold text-blue">
                {users.filter((u) => u.role === 'direction').length}
              </p>
            </Card>
          </div>

          {/* User Management Toolbar & Card */}
          <Card className="shadow-card">
            <CardHeader className="flex flex-col gap-4 border-b border-line pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base font-semibold text-ink">
                  <Users size={18} className="text-amber" /> Gestion des accès applicatifs
                </CardTitle>
                <CardDescription className="text-xs text-ink-soft">
                  Contrôlez les comptes habilités à administrer la menuiserie et gérer les stocks et outillages.
                </CardDescription>
              </div>
              <Button
                size="sm"
                variant="primary"
                icon={<UserPlus size={16} />}
                onClick={() => {
                  setUserForm({ login: '', display_name: '', password: '', role: 'magasinier', employee_id: '' });
                  setFormError(null);
                  setUserOpen(true);
                }}
              >
                Nouveau compte
              </Button>
            </CardHeader>

            {/* Filters Bar */}
            <div className="flex flex-col gap-3 bg-paper-2/40 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative min-w-0 flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Rechercher par nom, identifiant ou travailleur…"
                  className="h-9 w-full rounded-btn border border-line-strong bg-surface pl-9 pr-3 text-xs text-ink placeholder:text-ink-faint focus:border-amber focus:outline-none"
                />
                {userSearch ? (
                  <button
                    onClick={() => setUserSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink"
                  >
                    <X size={14} />
                  </button>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 text-xs text-ink-soft">
                  <Filter size={13} className="text-ink-faint" />
                  <span>Rôle :</span>
                </div>
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)}
                  className="h-9 rounded-btn border border-line-strong bg-surface px-2.5 text-xs text-ink focus:border-amber focus:outline-none"
                >
                  <option value="all">Tous les rôles</option>
                  {availableRoles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                  className="h-9 rounded-btn border border-line-strong bg-surface px-2.5 text-xs text-ink focus:border-amber focus:outline-none"
                >
                  <option value="all">Tous les statuts</option>
                  <option value="active">Actifs uniquement</option>
                  <option value="inactive">Inactifs uniquement</option>
                </select>
              </div>
            </div>

            {/* Accounts List */}
            <CardContent className="p-0">
              <ul className="divide-y divide-line">
                {filteredUsers.map((account) => {
                  const employee = account.employee_id ? employeesById.get(account.employee_id) : undefined;
                  const theme = ROLE_THEME[account.role] ?? DEFAULT_ROLE_THEME;
                  return (
                    <li
                      key={account.id}
                      className={cx(
                        'flex flex-col gap-3 px-5 py-3.5 transition-colors sm:flex-row sm:items-center sm:justify-between',
                        !account.active ? 'bg-paper/40 opacity-75' : 'hover:bg-paper-2/30',
                      )}
                    >
                      {/* Left: Avatar & Identity */}
                      <div className="flex min-w-0 flex-1 items-center gap-3.5">
                        <div
                          className={cx(
                            'grid h-10 w-10 shrink-0 place-items-center rounded-full text-xs font-bold border shadow-xs',
                            theme.bg,
                          )}
                        >
                          {roleInitials(account.display_name)}
                        </div>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-sm font-semibold text-ink">{account.display_name}</span>
                            <span
                              className={cx(
                                'inline-flex items-center rounded-chip border px-2 py-0.5 text-[11px] font-medium',
                                theme.bg,
                              )}
                            >
                              {availableRoles.find((r) => r.id === account.role)?.name ?? ROLE_LABEL[account.role] ?? account.role}
                            </span>
                            <span
                              className={cx(
                                'inline-flex items-center gap-1 rounded-chip border px-2 py-0.5 text-[11px] font-medium',
                                account.active
                                  ? 'border-green/20 bg-green-wash text-green'
                                  : 'border-line-strong bg-grey-wash text-ink-faint',
                              )}
                            >
                              <span
                                className={cx('h-1.5 w-1.5 rounded-full', account.active ? 'bg-green' : 'bg-ink-faint')}
                              />
                              {account.active ? 'Actif' : 'Inactif'}
                            </span>
                          </div>

                          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                            <span className="font-mono text-ink font-medium">@{account.login}</span>
                            <span>•</span>
                            {employee ? (
                              <span className="text-ink-soft">
                                Fiche travailleur : <strong className="font-medium text-ink">{employee.full_name}</strong> ({employee.id})
                              </span>
                            ) : (
                              <span className="text-ink-faint italic">Aucun profil travailleur lié</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex flex-wrap items-center gap-2 pt-2 sm:pt-0">
                        <Button size="sm" variant="ghost" onClick={() => openEditAccount(account)}>
                          Modifier
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setResetFor(account);
                            setResetPassword('');
                          }}
                        >
                          Mot de passe
                        </Button>
                        <Button
                          size="sm"
                          variant={account.active ? 'outline-danger' : 'secondary'}
                          onClick={() => void toggleUser(account)}
                        >
                          {account.active ? 'Désactiver' : 'Activer'}
                        </Button>
                      </div>
                    </li>
                  );
                })}

                {filteredUsers.length === 0 ? (
                  <li className="px-6 py-12 text-center text-sm text-ink-soft">
                    <UserX size={32} className="mx-auto text-ink-faint mb-2" />
                    <p className="font-semibold text-ink">Aucun compte utilisateur trouvé</p>
                    <p className="mt-1 text-xs text-ink-faint">
                      {userSearch || roleFilter !== 'all' || statusFilter !== 'all'
                        ? 'Modifiez ou effacez vos filtres de recherche.'
                        : 'Cliquez sur « Nouveau compte » pour ajouter un collaborateur.'}
                    </p>
                  </li>
                ) : null}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        {/* =========================================================================
            TAB 2: ROLES & PERMISSIONS (RBAC)
        ========================================================================= */}
        <TabsContent value="permissions" className="space-y-6">
          {/* Card: Rôles Applicatifs CFT */}
          <Card className="shadow-card">
            <CardHeader className="flex flex-col gap-4 border-b border-line pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base font-semibold text-ink">
                  <Shield size={18} className="text-amber" /> Rôles applicatifs &amp; Métiers
                </CardTitle>
                <CardDescription className="text-xs text-ink-soft">
                  Gouvernance des accès du C.F.T. : créez, renommez, configurez ou supprimez les rôles opérationnels selon les besoins de l’atelier.
                </CardDescription>
              </div>

              <Button
                size="sm"
                variant="primary"
                icon={<Plus size={15} />}
                onClick={openCreateRoleModal}
              >
                Nouveau rôle
              </Button>
            </CardHeader>

            <CardContent className="p-0">
              <div className="divide-y divide-line">
                {availableRoles.map((r) => {
                  const theme = ROLE_THEME[r.id] ?? DEFAULT_ROLE_THEME;
                  const isRootDirection = r.id === 'direction';
                  const userCount = Number(r.user_count ?? 0);

                  return (
                    <div
                      key={r.id}
                      className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between hover:bg-paper-2/20 transition-colors"
                    >
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div
                          className={cx(
                            'grid h-9 w-9 shrink-0 place-items-center rounded-lg text-xs font-bold border shadow-xs',
                            theme.bg,
                          )}
                        >
                          {roleInitials(r.name)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-ink">{r.name}</span>
                            <code className="rounded bg-paper-2 px-1.5 py-0.5 font-mono text-[11px] text-ink-faint">
                              {r.id}
                            </code>
                            {isRootDirection ? (
                              <span className="inline-flex items-center rounded-chip border border-amber/30 bg-amber-wash px-2 py-0.5 text-[10px] font-semibold text-amber">
                                Super-Admin racine
                              </span>
                            ) : r.is_system ? (
                              <span className="inline-flex items-center rounded-chip border border-line-strong bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-ink-soft">
                                Rôle standard
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-chip border border-green/30 bg-green-wash px-2 py-0.5 text-[10px] font-semibold text-green">
                                Rôle personnalisé
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-ink-soft line-clamp-2">
                            {r.description || 'Aucune description spécifique.'}
                          </p>
                          <div className="mt-1 flex items-center gap-3 text-[11px] text-ink-faint">
                            <span>
                              {userCount === 0
                                ? 'Aucun utilisateur affecté'
                                : `${userCount} collaborateur${userCount > 1 ? 's' : ''} affecté${userCount > 1 ? 's' : ''}`}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={<Pencil size={13} />}
                          onClick={() => openEditRoleModal(r)}
                          title="Modifier le libellé ou la description du rôle"
                        >
                          Modifier
                        </Button>
                        {!isRootDirection && !r.is_system ? (
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={userCount > 0 || roleBusy}
                            icon={<Trash2 size={13} />}
                            onClick={() => setDeleteRoleConfirm(r)}
                            title={
                              userCount > 0
                                ? 'Impossible de supprimer un rôle assigné à des collaborateurs'
                                : 'Supprimer définitivement ce rôle applicatif'
                            }
                          >
                            Supprimer
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Card: Matrice RBAC */}
          <Card className="shadow-card">
            <CardHeader className="flex flex-col gap-4 border-b border-line pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base font-semibold text-ink">
                  <ShieldCheck size={18} className="text-green" /> Matrice de contrôle d’accès (RBAC)
                </CardTitle>
                <CardDescription className="text-xs text-ink-soft">
                  Configurez précisément les privilèges accordés à chaque rôle métier. Le rôle Direction est super-administrateur permanent.
                </CardDescription>
              </div>

              {hasUnsavedPerms ? (
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={resetPermDraft} disabled={busy}>
                    Annuler
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={busy}
                    icon={busy ? <Spinner /> : <Check size={15} />}
                    onClick={() => void savePermissions()}
                  >
                    Enregistrer les modifications
                  </Button>
                </div>
              ) : null}
            </CardHeader>

            {hasUnsavedPerms ? (
              <div className="flex items-center justify-between bg-amber-wash/80 border-b border-amber/20 px-5 py-2.5 text-xs text-amber font-medium">
                <span className="flex items-center gap-2">
                  <AlertTriangle size={15} />
                  Vous avez des modifications de permissions non sauvegardées.
                </span>
                <span className="underline cursor-pointer" onClick={() => void savePermissions()}>
                  Sauvegarder maintenant
                </span>
              </div>
            ) : null}

            <CardContent className="p-0">
              {permMatrix && permDraft ? (
                <div>
                  <div className="sm:hidden px-4 py-2 bg-surface-2/60 border-b border-line flex items-center justify-between text-[11px] text-ink-soft">
                    <span>Glissez horizontalement pour configurer tous les rôles</span>
                    <span className="font-mono font-bold text-amber">← →</span>
                  </div>
                  <div className="overflow-x-auto scroll-thin">
                    <table className="w-full min-w-[620px] text-left">
                      <thead className="border-b border-line bg-paper-2/60 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                        <tr>
                          <th className="sticky left-0 top-0 z-20 bg-surface-2 px-4 py-3 border-r border-line min-w-[190px] sm:min-w-[240px]">
                            Module &amp; Action
                          </th>
                          {permMatrix.roles
                            .filter((r) => r !== 'direction')
                            .map((role) => (
                              <th key={role} className="px-4 py-3 text-center min-w-[110px]">
                                <span
                                  className={cx(
                                    'inline-flex items-center rounded-chip border px-2 py-0.5 text-[11px] font-semibold',
                                    (ROLE_THEME[role] ?? DEFAULT_ROLE_THEME).bg,
                                  )}
                                >
                                  {availableRoles.find((ar) => ar.id === role)?.name ?? ROLE_LABEL[role] ?? role}
                                </span>
                              </th>
                            ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line text-sm">
                        {permMatrix.groups.map((group) => (
                          <Fragment key={group.label}>
                            <tr className="bg-paper-2/70 font-semibold text-ink text-xs uppercase tracking-wide">
                              <td colSpan={4} className="sticky left-0 px-4 py-2 text-ink-soft bg-paper-2/90 font-bold">
                                {group.label}
                              </td>
                            </tr>
                            {group.actions.map((action) => {
                              const meta = permMatrix.actions.find((a) => a.action === action);
                              return (
                                <tr key={action} className="hover:bg-paper-2/30 transition-colors group">
                                  <td className="sticky left-0 bg-surface group-hover:bg-paper-2/40 px-4 py-2.5 border-r border-line z-10 min-w-[190px] sm:min-w-[240px]">
                                    <div className="font-medium text-ink text-xs">{meta?.label ?? action}</div>
                                    <div className="font-mono text-[10px] text-ink-faint">{action}</div>
                                  </td>
                                  {permMatrix.roles
                                    .filter((r) => r !== 'direction')
                                    .map((role) => {
                                      const isChecked = !!permDraft[action]?.[role];
                                      return (
                                        <td key={role} className="px-4 py-2.5 text-center min-w-[110px]">
                                          <button
                                            type="button"
                                            role="checkbox"
                                            aria-checked={isChecked}
                                            onClick={() => togglePerm(action, role)}
                                            className={cx(
                                              'inline-flex h-8 w-8 items-center justify-center rounded-md border text-xs font-bold transition-all shadow-xs active:scale-90',
                                              isChecked
                                                ? 'border-green bg-green text-white shadow-xs'
                                                : 'border-line bg-surface text-ink-faint hover:bg-paper-2',
                                            )}
                                            title={`${isChecked ? 'Révoquer' : 'Accorder'} ${meta?.label} pour ${availableRoles.find((ar) => ar.id === role)?.name ?? ROLE_LABEL[role] ?? role}`}
                                          >
                                            {isChecked ? <Check size={15} /> : ''}
                                          </button>
                                        </td>
                                      );
                                    })}
                                </tr>
                              );
                            })}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-ink-faint">
                  Chargement de la matrice des autorisations…
                </div>
              )}
            </CardContent>

            <CardFooter className="flex items-center justify-between border-t border-line bg-paper-2/30 px-5 py-3">
              <span className="text-xs text-ink-soft">
                La direction dispose de façon permanente de 100% des privilèges sur l’ensemble du système.
              </span>
              {hasUnsavedPerms ? (
                <Button size="sm" variant="primary" disabled={busy} onClick={() => void savePermissions()}>
                  {busy ? <Spinner /> : 'Enregistrer les permissions'}
                </Button>
              ) : null}
            </CardFooter>
          </Card>
        </TabsContent>

        {/* =========================================================================
            TAB 3: KIOSQUE & POINTAGE
        ========================================================================= */}
        <TabsContent value="kiosk" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Kiosk Rules Card */}
            <Card className="shadow-card">
              <CardHeader className="border-b border-line pb-4">
                <CardTitle className="flex items-center gap-2 text-base font-semibold text-ink">
                  <Clock size={18} className="text-amber" /> Horaires &amp; Règles de pointage
                </CardTitle>
                <CardDescription className="text-xs text-ink-soft">
                  Paramètres de l’atelier appliqués en temps réel sur les bornes et tablettes de pointage.
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-5 p-5">
                {/* Heures d'ouverture / fermeture */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-ink-soft">Ouverture atelier</label>
                    <input
                      type="time"
                      value={settings.opening_time}
                      onChange={(e) => void saveSettings({ opening_time: e.target.value })}
                      className="h-10 w-full rounded-btn border border-line-strong bg-surface px-3 text-sm text-ink focus:border-amber focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-ink-soft">Fermeture atelier</label>
                    <input
                      type="time"
                      value={settings.closing_time}
                      onChange={(e) => void saveSettings({ closing_time: e.target.value })}
                      className="h-10 w-full rounded-btn border border-line-strong bg-surface px-3 text-sm text-ink focus:border-amber focus:outline-none"
                    />
                  </div>
                </div>

                {/* Tolérance */}
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-ink-soft">Tolérance de retard autorisée</label>
                    <span className="font-mono text-xs font-semibold text-amber">
                      {settings.tolerance_minutes} min
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={120}
                    step={5}
                    value={settings.tolerance_minutes}
                    onChange={(e) => void saveSettings({ tolerance_minutes: Number(e.target.value) })}
                    className="mt-2 w-full accent-[#d9480f]"
                  />
                  <p className="mt-1 text-[11px] text-ink-faint">
                    Au-delà de cette tolérance, le kiosque impose la sélection d’un motif explicatif.
                  </p>
                </div>

                <Separator />

                {/* Jours ouvrés */}
                <div>
                  <label className="mb-2 block text-xs font-medium text-ink-soft">Jours de travail ouvrés</label>
                  <div className="grid grid-cols-7 gap-1.5">
                    {WEEKDAYS_ORDER.map((day) => {
                      const isWork = settings.workdays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleWorkday(day)}
                          className={cx(
                            'flex flex-col items-center justify-center rounded-btn border py-2 text-xs font-medium transition-all shadow-xs',
                            isWork
                              ? 'border-amber bg-amber-wash text-amber font-semibold'
                              : 'border-line-strong bg-surface text-ink-faint hover:bg-paper-2',
                          )}
                        >
                          <span className="text-[11px]">{(WORKDAY_LABEL[day] ?? '').slice(0, 3)}</span>
                          <span className={cx('mt-0.5 h-1 w-1 rounded-full', isWork ? 'bg-amber' : 'bg-transparent')} />
                        </button>
                      );
                    })}
                  </div>
                </div>

                <Separator />

                {/* Motifs de retard */}
                <div>
                  <label className="mb-2 block text-xs font-medium text-ink-soft">Motifs de retard configurés</label>
                  <div className="flex flex-wrap gap-1.5">
                    {settings.late_motifs.map((motif) => (
                      <span
                        key={motif}
                        className="inline-flex items-center gap-1.5 rounded-chip border border-line bg-paper-2 px-2.5 py-1 text-xs text-ink font-medium"
                      >
                        {motif}
                        <button
                          type="button"
                          onClick={() => removeMotif(motif)}
                          className="rounded-full text-ink-faint hover:bg-red-wash hover:text-red p-0.5 transition-colors"
                          title={`Retirer « ${motif} »`}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>

                  <div className="mt-3 flex gap-2">
                    <input
                      type="text"
                      value={motifDraft}
                      onChange={(e) => setMotifDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addMotif();
                        }
                      }}
                      placeholder="Nouveau motif (ex: Panne de transport)…"
                      className="h-9 flex-1 rounded-btn border border-line-strong bg-surface px-3 text-xs text-ink placeholder:text-ink-faint focus:border-amber focus:outline-none"
                    />
                    <Button size="sm" variant="ghost" onClick={addMotif} disabled={!motifDraft.trim()}>
                      Ajouter
                    </Button>
                  </div>
                </div>

                <Separator />

                {/* Affichage & Rétention */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-ink-soft">Affichage fiche (sec)</label>
                    <input
                      type="number"
                      min={3}
                      max={60}
                      value={settings.card_display_seconds}
                      onChange={(e) => void saveSettings({ card_display_seconds: Number(e.target.value) })}
                      className="h-9 w-full rounded-btn border border-line-strong bg-surface px-3 text-xs text-ink focus:border-amber focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-ink-soft">Rétention selfies (jours)</label>
                    <input
                      type="number"
                      min={7}
                      max={365}
                      value={settings.selfie_retention_days}
                      onChange={(e) => void saveSettings({ selfie_retention_days: Number(e.target.value) })}
                      className="h-9 w-full rounded-btn border border-line-strong bg-surface px-3 text-xs text-ink focus:border-amber focus:outline-none"
                    />
                  </div>
                </div>
              </CardContent>

              <CardFooter className="flex items-center justify-between border-t border-line bg-paper-2/30 px-5 py-3 text-[11px] text-ink-faint">
                <span className="flex items-center gap-1.5">
                  {savingSettings ? <Spinner className="h-3 w-3 text-amber" /> : <CheckCircle2 size={13} className="text-green" />}
                  Synchronisation automatique vers la base de données
                </span>
              </CardFooter>
            </Card>

            {/* Terminals Card */}
            <Card className="shadow-card">
              <CardHeader className="flex flex-col gap-4 border-b border-line pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base font-semibold text-ink">
                    <Smartphone size={18} className="text-blue" /> Bornes &amp; Terminaux d’atelier
                  </CardTitle>
                  <CardDescription className="text-xs text-ink-soft">
                    Tablettes et points d’accès autorisés à enregistrer les pointages.
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  variant="primary"
                  icon={<Plus size={16} />}
                  onClick={() => {
                    setTerminalForm({ name: '', id: '' });
                    setFormError(null);
                    setTerminalOpen(true);
                  }}
                >
                  Ajouter terminal
                </Button>
              </CardHeader>

              <CardContent className="p-0">
                <ul className="divide-y divide-line">
                  {terminals.map((terminal) => (
                    <li key={terminal.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between hover:bg-paper-2/30 transition-colors">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-sm text-ink">{terminal.name}</p>
                          <span
                            className={cx(
                              'inline-flex items-center gap-1 rounded-chip border px-2 py-0.5 text-[11px] font-medium',
                              terminal.active
                                ? 'border-green/20 bg-green-wash text-green'
                                : 'border-line-strong bg-grey-wash text-ink-faint',
                            )}
                          >
                            <span className={cx('h-1.5 w-1.5 rounded-full', terminal.active ? 'bg-green' : 'bg-ink-faint')} />
                            {terminal.active ? 'Actif' : 'Inactif'}
                          </span>
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                          <button
                            type="button"
                            onClick={() => copyToClipboard(terminal.id, terminal.id)}
                            className="inline-flex items-center gap-1 font-mono text-[11px] text-ink font-semibold bg-paper-2 px-1.5 py-0.5 rounded hover:bg-line transition-colors"
                            title="Cliquer pour copier l'identifiant"
                          >
                            {terminal.id}
                            {copiedTerminalId === terminal.id ? (
                              <CheckCheck size={12} className="text-green" />
                            ) : (
                              <Copy size={12} className="text-ink-faint" />
                            )}
                          </button>
                          <span>•</span>
                          <span className="font-mono text-ink-soft">{terminal.punches_today} pointage(s) aujourd’hui</span>
                          {terminal.last_used ? (
                            <>
                              <span>•</span>
                              <span className="text-ink-faint">Dernier usage : {formatDateTime(terminal.last_used)}</span>
                            </>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant={terminal.active ? 'outline-danger' : 'secondary'}
                          onClick={() => void toggleTerminal(terminal)}
                        >
                          {terminal.active ? 'Désactiver' : 'Activer'}
                        </Button>
                      </div>
                    </li>
                  ))}

                  {terminals.length === 0 ? (
                    <li className="p-8 text-center text-xs text-ink-faint">
                      Aucun terminal de pointage configuré. Cliquez sur « Ajouter terminal » pour en associer un.
                    </li>
                  ) : null}
                </ul>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* =========================================================================
            TAB 4: SECURITE & PROFIL
        ========================================================================= */}
        <TabsContent value="securite" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Identity Card */}
            <Card className="shadow-card">
              <CardHeader className="border-b border-line pb-4">
                <CardTitle className="flex items-center gap-2 text-base font-semibold text-ink">
                  <ShieldCheck size={18} className="text-blue" /> Profil actif
                </CardTitle>
                <CardDescription className="text-xs text-ink-soft">
                  Informations de sécurité relatives à la session courante.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center gap-3">
                  <div className="grid h-12 w-12 place-items-center rounded-full bg-blue-wash text-blue font-bold text-sm border border-blue/20">
                    {roleInitials(user.display_name)}
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-ink">{user.display_name}</h3>
                    <p className="font-mono text-xs text-ink-soft">@{user.login}</p>
                  </div>
                </div>

                <div className="rounded-card border border-line bg-paper-2/40 p-4 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-ink-soft">Rôle applicatif</span>
                    <strong className="text-blue">{ROLE_LABEL[user.role]}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-soft">Niveau de privilèges</span>
                    <span className="font-semibold text-green">Super-Administrateur</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-soft">Accès aux sauvegardes</span>
                    <span className="font-semibold text-ink">Complet (Vercel Blob + Neon)</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Password Change Card */}
            <Card className="shadow-card">
              <CardHeader className="border-b border-line pb-4">
                <CardTitle className="flex items-center gap-2 text-base font-semibold text-ink">
                  <KeyRound size={18} className="text-amber" /> Modifier mon mot de passe
                </CardTitle>
                <CardDescription className="text-xs text-ink-soft">
                  Recommandation de sécurité : utilisez au moins 8 caractères incluant des symboles.
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4 p-5">
                {formError ? <Banner tone="error">{formError}</Banner> : null}

                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-soft">Mot de passe actuel</label>
                  <input
                    type="password"
                    value={pw.current}
                    onChange={(e) => setPw({ ...pw, current: e.target.value })}
                    className="h-10 w-full rounded-btn border border-line-strong bg-surface px-3 text-sm text-ink focus:border-amber focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-soft">Nouveau mot de passe</label>
                  <input
                    type="password"
                    value={pw.next}
                    onChange={(e) => setPw({ ...pw, next: e.target.value })}
                    className="h-10 w-full rounded-btn border border-line-strong bg-surface px-3 text-sm text-ink focus:border-amber focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-soft">Confirmer le nouveau mot de passe</label>
                  <input
                    type="password"
                    value={pw.confirm}
                    onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
                    className="h-10 w-full rounded-btn border border-line-strong bg-surface px-3 text-sm text-ink focus:border-amber focus:outline-none"
                  />
                </div>
              </CardContent>

              <CardFooter className="flex items-center justify-between border-t border-line bg-paper-2/30 px-5 py-3">
                <Button
                  variant="primary"
                  size="sm"
                  disabled={busy || !pw.current || pw.next.length < 6 || pw.next !== pw.confirm}
                  onClick={() => void changeMyPassword()}
                >
                  {busy ? <Spinner /> : 'Mettre à jour mon mot de passe'}
                </Button>
              </CardFooter>
            </Card>
          </div>
        </TabsContent>

        {/* =========================================================================
            TAB 5: SAUVEGARDES & SYSTEME
        ========================================================================= */}
        <TabsContent value="sauvegardes" className="space-y-6">
          {/* Cloud Backups Card */}
          <Card className="shadow-card">
            <CardHeader className="flex flex-col gap-4 border-b border-line pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base font-semibold text-ink">
                  <Database size={18} className="text-blue" /> Sauvegardes automatisées &amp; Stockage Cloud
                </CardTitle>
                <CardDescription className="text-xs text-ink-soft">
                  Tâche automatisée quotidienne à 03:00 UTC vers Vercel Blob. Conservation paramétrée sur {retentionDays} jours.
                </CardDescription>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  disabled={backupBusy}
                  icon={backupBusy ? <Spinner /> : <Database size={15} />}
                  onClick={() => void saveBackupNow()}
                >
                  {backupBusy ? 'Sauvegarde…' : 'Sauvegarder maintenant'}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Download size={15} />}
                  onClick={() => void downloadExport()}
                >
                  Export complet (.gz)
                </Button>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              <div className="px-5 py-3 border-b border-line bg-paper-2/40 text-xs font-semibold text-ink flex items-center justify-between">
                <span>Historique des instantanés cloud ({backups.length})</span>
                <span className="text-[11px] text-ink-faint">Rétention {retentionDays} jours</span>
              </div>

              {backups.length === 0 ? (
                <div className="p-8 text-center text-xs text-ink-faint">
                  Aucun instantané disponible pour le moment. Cliquez sur « Sauvegarder maintenant » pour créer le premier.
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  {backups.map((backup) => (
                    <li
                      key={backup.pathname}
                      className="flex flex-col gap-2 px-5 py-3 text-xs sm:flex-row sm:items-center sm:justify-between hover:bg-paper-2/30 transition-colors"
                    >
                      <div className="min-w-0">
                        <span className="font-mono font-medium text-ink truncate block">
                          {backup.pathname.replace('backups/', '')}
                        </span>
                        <span className="text-ink-faint text-[11px]">
                          Créé le {formatDateTime(backup.uploadedAt)}
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="font-mono text-ink-soft font-semibold">{formatBytes(backup.size)}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Download size={13} />}
                          onClick={() => void downloadBackup(backup.pathname)}
                        >
                          Télécharger
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Danger Zone: Purge Demo */}
          <Card className="border-red/30 shadow-card bg-surface overflow-hidden">
            <CardHeader className="bg-red-wash/40 border-b border-red/20 pb-4">
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-red">
                <AlertTriangle size={18} /> Zone critique : Purge des données de démonstration
              </CardTitle>
              <CardDescription className="text-xs text-ink-soft">
                Réinitialise la base de données opérationnelle tout en préservant les comptes utilisateurs et réglages.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-5 space-y-4">
              <p className="text-xs text-ink-soft leading-relaxed">
                Cette action supprimera l’intégralité des pointages, des fiches de stock, des outils et matériels enregistrés,
                des magasins, des terminaux et des fiches employés. <strong>Vos comptes de connexion, mots de passe et paramètres système seront conservés intacts.</strong>
              </p>

              <div className="rounded-btn border border-red/20 bg-red-wash/30 p-3 text-xs text-red">
                ⚠️ Cette opération est irréversible. Téléchargez un export compressé (.gz) avant de poursuivre.
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="w-full max-w-xs">
                  <label className="mb-1 block text-xs font-medium text-ink-soft">
                    Tapez <strong className="font-mono text-red">RESET</strong> pour débloquer :
                  </label>
                  <input
                    type="text"
                    value={resetText}
                    placeholder="RESET"
                    onChange={(e) => setResetText(e.target.value)}
                    className="h-10 w-full rounded-btn border border-line-strong bg-surface px-3 font-mono text-sm uppercase text-ink focus:border-red focus:outline-none"
                  />
                </div>

                <Button
                  variant="danger"
                  size="md"
                  disabled={resetText.trim() !== 'RESET' || resetBusy}
                  onClick={() => void resetDemo()}
                >
                  {resetBusy ? <Spinner /> : 'Purger les données de démonstration'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* =========================================================================
          MODALS / DIALOGS
      ========================================================================= */}

      {/* Modal: Enregistrer un terminal */}
      <Modal
        open={terminalOpen}
        title="Enregistrer un nouveau terminal"
        onClose={() => setTerminalOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setTerminalOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="primary"
              disabled={busy || terminalForm.name.trim().length < 3}
              onClick={() => void createTerminal()}
            >
              {busy ? <Spinner /> : 'Enregistrer le terminal'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError ? <Banner tone="error">{formError}</Banner> : null}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-soft">Nom de la borne ou tablette</label>
            <input
              type="text"
              value={terminalForm.name}
              placeholder="Ex : Tablette Atelier Débitage"
              onChange={(e) => setTerminalForm({ ...terminalForm, name: e.target.value })}
              className="h-10 w-full rounded-btn border border-line-strong bg-surface px-3 text-sm text-ink focus:border-amber focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-soft">
              Identifiant machine unique (Optionnel)
            </label>
            <input
              type="text"
              value={terminalForm.id}
              placeholder="TERM-ATELIER"
              onChange={(e) => setTerminalForm({ ...terminalForm, id: e.target.value.toUpperCase() })}
              className="h-10 w-full rounded-btn border border-line-strong bg-surface px-3 font-mono text-sm uppercase text-ink focus:border-amber focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-ink-faint">
              Laissez vide pour générer automatiquement un code TERM-XXXX.
            </p>
          </div>
        </div>
      </Modal>

      {/* Modal: Nouveau compte utilisateur */}
      <Modal
        open={userOpen}
        title="Créer un compte utilisateur"
        wide
        onClose={() => setUserOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setUserOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="primary"
              disabled={busy || userForm.login.trim().length < 3 || userForm.password.length < 6}
              onClick={() => void createUser()}
            >
              {busy ? <Spinner /> : 'Créer le compte'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError ? <Banner tone="error">{formError}</Banner> : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-soft">Nom complet affiché</label>
              <input
                type="text"
                value={userForm.display_name}
                placeholder="Ex : Frère Bernard"
                onChange={(e) => setUserForm({ ...userForm, display_name: e.target.value })}
                className="h-10 w-full rounded-btn border border-line-strong bg-surface px-3 text-sm text-ink focus:border-amber focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-soft">Identifiant de connexion</label>
              <input
                type="text"
                value={userForm.login}
                placeholder="Ex : f.bernard"
                onChange={(e) => setUserForm({ ...userForm, login: e.target.value.toLowerCase() })}
                className="h-10 w-full rounded-btn border border-line-strong bg-surface px-3 font-mono text-sm text-ink focus:border-amber focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium text-ink-soft">Rôle applicatif</label>
            <div className="grid gap-2 sm:grid-cols-2">
              {availableRoles.map((r) => (
                <label
                  key={r.id}
                  className={cx(
                    'flex cursor-pointer items-start gap-2.5 rounded-btn border p-3 transition-colors shadow-xs',
                    userForm.role === r.id ? 'border-amber bg-amber-wash' : 'border-line-strong bg-surface hover:bg-paper-2',
                  )}
                >
                  <input
                    type="radio"
                    name="new-role"
                    checked={userForm.role === r.id}
                    onChange={() => setUserForm({ ...userForm, role: r.id })}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[#d9480f]"
                  />
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-ink">{r.name}</span>
                    <span className="block text-[11px] text-ink-soft leading-snug">
                      {r.description || ROLE_DESC[r.id] || ''}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-soft">Mot de passe temporaire</label>
              <input
                type="text"
                value={userForm.password}
                placeholder="Au moins 6 caractères"
                onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                className="h-10 w-full rounded-btn border border-line-strong bg-surface px-3 text-sm text-ink focus:border-amber focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-soft">Rattacher à un travailleur</label>
              <select
                value={userForm.employee_id}
                onChange={(e) => setUserForm({ ...userForm, employee_id: e.target.value })}
                className="h-10 w-full rounded-btn border border-line-strong bg-surface px-3 text-xs text-ink focus:border-amber focus:outline-none"
              >
                <option value="">Aucun profil travailleur</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name} ({e.id})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal: Modifier un compte */}
      <Modal
        open={!!editFor}
        title={`Modifier le compte @${editFor?.login ?? ''}`}
        wide
        onClose={() => setEditFor(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditFor(null)}>
              Annuler
            </Button>
            <Button
              variant="primary"
              disabled={busy || editForm.display_name.trim().length < 2}
              onClick={() => void updateAccount()}
            >
              {busy ? <Spinner /> : 'Enregistrer les modifications'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError ? <Banner tone="error">{formError}</Banner> : null}

          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-soft">Nom complet affiché</label>
            <input
              type="text"
              value={editForm.display_name}
              onChange={(e) => setEditForm({ ...editForm, display_name: e.target.value })}
              className="h-10 w-full rounded-btn border border-line-strong bg-surface px-3 text-sm text-ink focus:border-amber focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium text-ink-soft">Rôle applicatif</label>
            <div className="grid gap-2 sm:grid-cols-2">
              {availableRoles.map((r) => (
                <label
                  key={r.id}
                  className={cx(
                    'flex cursor-pointer items-start gap-2.5 rounded-btn border p-3 transition-colors shadow-xs',
                    editForm.role === r.id ? 'border-amber bg-amber-wash' : 'border-line-strong bg-surface hover:bg-paper-2',
                  )}
                >
                  <input
                    type="radio"
                    name="edit-role"
                    checked={editForm.role === r.id}
                    onChange={() => setEditForm({ ...editForm, role: r.id })}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[#d9480f]"
                  />
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-ink">{r.name}</span>
                    <span className="block text-[11px] text-ink-soft leading-snug">
                      {r.description || ROLE_DESC[r.id] || ''}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-soft">Rattacher à un travailleur</label>
            <select
              value={editForm.employee_id}
              onChange={(e) => setEditForm({ ...editForm, employee_id: e.target.value })}
              className="h-10 w-full rounded-btn border border-line-strong bg-surface px-3 text-xs text-ink focus:border-amber focus:outline-none"
            >
              <option value="">Aucun profil travailleur</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name} ({e.id})
                </option>
              ))}
            </select>
          </div>
        </div>
      </Modal>

      {/* Modal: Réinitialiser mot de passe utilisateur */}
      <Modal
        open={!!resetFor}
        title={resetFor ? `Réinitialiser le mot de passe · @${resetFor.login}` : 'Réinitialiser le mot de passe'}
        onClose={() => setResetFor(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setResetFor(null)}>
              Annuler
            </Button>
            <Button
              variant="primary"
              disabled={busy || resetPassword.length < 6}
              onClick={() => void resetUserPassword()}
            >
              {busy ? <Spinner /> : 'Définir ce mot de passe'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-ink-soft">
            Définissez un nouveau mot de passe temporaire pour <strong>{resetFor?.display_name}</strong> (@{resetFor?.login}).
          </p>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-soft">Nouveau mot de passe</label>
            <input
              type="text"
              value={resetPassword}
              placeholder="Minimum 6 caractères"
              onChange={(e) => setResetPassword(e.target.value)}
              className="h-10 w-full rounded-btn border border-line-strong bg-surface px-3 text-sm text-ink focus:border-amber focus:outline-none"
            />
          </div>
        </div>
      </Modal>

      {/* Modal: Nouveau / Modifier rôle applicatif */}
      <Modal
        open={roleModalOpen}
        title={roleModalMode === 'create' ? 'Créer un nouveau rôle applicatif' : `Modifier le rôle « ${roleForm.name} »`}
        onClose={() => setRoleModalOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRoleModalOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="primary"
              disabled={roleBusy || !roleForm.name.trim() || (roleModalMode === 'create' && !roleForm.id.trim())}
              onClick={() => void handleSaveRole()}
            >
              {roleBusy ? <Spinner /> : roleModalMode === 'create' ? 'Créer le rôle' : 'Enregistrer les modifications'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {roleError ? <Banner tone="error">{roleError}</Banner> : null}

          {roleModalMode === 'create' ? (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-soft">
                Identifiant technique (Code unique sans espace)
              </label>
              <input
                type="text"
                value={roleForm.id}
                placeholder="Ex: superviseur_scie, adjoint_magasin"
                onChange={(e) => setRoleForm({ ...roleForm, id: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '_') })}
                className="h-10 w-full rounded-btn border border-line-strong bg-surface px-3 font-mono text-sm text-ink focus:border-amber focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-ink-faint">
                Minuscules, chiffres et tirets uniquement. Non modifiable une fois créé.
              </p>
            </div>
          ) : (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-soft">Identifiant technique</label>
              <input
                type="text"
                value={roleForm.id}
                disabled
                className="h-10 w-full rounded-btn border border-line bg-paper-2 px-3 font-mono text-sm text-ink-soft opacity-80"
              />
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-soft">Intitulé officiel du rôle</label>
            <input
              type="text"
              value={roleForm.name}
              placeholder="Ex: Responsable Menuiserie & Scierie"
              onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
              className="h-10 w-full rounded-btn border border-line-strong bg-surface px-3 text-sm text-ink focus:border-amber focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-soft">Description des responsabilités (Optionnel)</label>
            <textarea
              rows={3}
              value={roleForm.description}
              placeholder="Décrivez brièvement les missions et responsabilités attachées à ce rôle…"
              onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
              className="w-full rounded-btn border border-line-strong bg-surface p-3 text-xs text-ink focus:border-amber focus:outline-none"
            />
          </div>
        </div>
      </Modal>

      {/* Modal: Confirmation suppression de rôle */}
      <Modal
        open={!!deleteRoleConfirm}
        title={deleteRoleConfirm ? `Supprimer le rôle « ${deleteRoleConfirm.name} »` : 'Supprimer le rôle'}
        onClose={() => setDeleteRoleConfirm(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteRoleConfirm(null)}>
              Annuler
            </Button>
            <Button
              variant="danger"
              disabled={roleBusy}
              onClick={() => deleteRoleConfirm && void handleDeleteRole(deleteRoleConfirm)}
            >
              {roleBusy ? <Spinner /> : 'Confirmer la suppression'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-ink">
            Êtes-vous certain de vouloir supprimer définitivement le rôle applicatif{' '}
            <strong className="text-red font-semibold">{deleteRoleConfirm?.name}</strong> (<code>{deleteRoleConfirm?.id}</code>) ?
          </p>
          <p className="text-xs text-ink-soft">
            Cette action effacera également toutes les autorisations associées dans la matrice des permissions.
          </p>
        </div>
      </Modal>
    </div>
  );
}
