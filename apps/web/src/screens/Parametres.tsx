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
  PasswordInput,
  Spinner,
  cx,
  useToast,
} from '../components/ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card';
import { Separator } from '../components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { exportToExcel, exportToPdf } from '../lib/export';
import {
  AlertTriangle,
  Ban,
  CalendarDays,
  Camera,
  Check,
  CheckCheck,
  CheckCircle2,
  Clock,
  Copy,
  Database,
  Download,
  Eye,
  FileSpreadsheet,
  HardDrive,
  KeyRound,
  Lock,
  Menu,
  Moon,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Search,
  Shield,
  ShieldCheck,
  Sliders,
  Smartphone,
  Sparkles,
  Sun,
  Trash2,
  UserPlus,
  Users,
  UserX,
  Utensils,
  X,
  Zap,
} from 'lucide-react';
import { ImagePickerModal } from '../components/ImagePickerModal';
import { computeAllowedViews } from '../components/Shell';

export type RoleArchetypeUI = {
  id: string;
  name: string;
  badge: string;
  description: string;
  modules: string[];
};

export const ROLE_ARCHETYPES_UI: RoleArchetypeUI[] = [
  {
    id: 'menuisier',
    name: 'Menuisier Atelier',
    badge: 'Atelier',
    description: 'Consultation du catalogue d’outillage, badge QR et espace personnel (Lecture seule).',
    modules: ['Mon Espace', 'Outils (Lecture seule)', 'Prêts (Consultation)'],
  },
  {
    id: 'magasinier',
    name: 'Magasinier & Quincaillerie',
    badge: 'Magasin & Dépôt',
    description: 'Gestion intégrale de l’outillage, dépôts, consommables, quincaillerie et mouvements.',
    modules: ['Mon Espace', 'Outils & Matériels', 'Stock & Quincaillerie', 'Magasins', 'Tableau de bord'],
  },
  {
    id: 'chef_equipe',
    name: 'Chef d’équipe / Superviseur',
    badge: 'Supervision',
    description: 'Supervision des travailleurs, pointages de présence, congés, prêts et mouvements d’atelier.',
    modules: ['Mon Espace', 'Tableau de bord', 'Pointage & Présences', 'Travailleurs', 'Prêts d’outils', 'Mouvements Stock'],
  },
  {
    id: 'auditeur',
    name: 'Auditeur / Contrôleur (Lecture seule)',
    badge: 'Audit & Contrôle',
    description: 'Consultation complète de l’outillage, stocks, dépôts, présences et KPI, sans aucune modification.',
    modules: ['Mon Espace', 'Tableau de bord', 'Outils (Lecture seule)', 'Stock (Lecture seule)', 'Travailleurs (Lecture seule)'],
  },
  {
    id: 'maintenance',
    name: 'Maintenance & Affûtage',
    badge: 'Technique',
    description: 'Entretien des machines, réparation, diagnostic et mise à jour de l’état du parc.',
    modules: ['Mon Espace', 'Outils & Réparations', 'Statuts d’équipements', 'Stock consommables'],
  },
  {
    id: 'responsable_stock',
    name: 'Gestionnaire des Stocks & Quincaillerie',
    badge: 'Stocks',
    description: 'Suivi exclusif des matières premières, consommables, quincaillerie et réapprovisionnements.',
    modules: ['Mon Espace', 'Stock & Quincaillerie', 'Entrées / Sorties / Transferts', 'Alertes seuils'],
  },
  {
    id: 'clone',
    name: 'Dupliquer un rôle existant',
    badge: 'Duplication',
    description: 'Copie exactement les permissions accordées à un autre rôle déjà configuré.',
    modules: ['Identique au rôle source sélectionné'],
  },
  {
    id: 'custom',
    name: 'Rôle vierge sur-mesure',
    badge: 'Sur mesure',
    description: 'Créez un rôle sans droits initiaux et cochez librement ses permissions dans la matrice.',
    modules: ['Attribution manuelle dans la matrice'],
  },
];

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

function formatHumanBackupLabel(pathname: string, uploadedAt?: string): {
  title: string;
  dateStr: string;
  timeStr: string;
  isAuto: boolean;
  rawName: string;
} {
  const clean = pathname.replace(/^backups\//, '');
  const match = clean.match(/monastere-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})/);
  if (match && match[1] && match[2] && match[3] && match[4] && match[5]) {
    const [, y, m, d, hh, mm] = match;
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm)));
    const dayStr = new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
    const timeStr = new Intl.DateTimeFormat('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
    const capitalized = dayStr.charAt(0).toUpperCase() + dayStr.slice(1);
    const isAuto = Number(hh) >= 2 && Number(hh) <= 4;
    return {
      title: `Instantané du ${capitalized}`,
      dateStr: capitalized,
      timeStr,
      isAuto,
      rawName: clean,
    };
  }

  const date = uploadedAt ? new Date(uploadedAt) : new Date();
  const dayStr = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
  const timeStr = new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
  const capitalized = dayStr.charAt(0).toUpperCase() + dayStr.slice(1);
  return {
    title: `Instantané du ${capitalized}`,
    dateStr: capitalized,
    timeStr,
    isAuto: false,
    rawName: clean,
  };
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

export function Parametres({ user, permissions }: { user: User; permissions?: Record<string, boolean> | null }) {
  if (user.role !== 'direction' && permissions == null) {
    return <div className="grid min-h-48 place-items-center"><Spinner /></div>;
  }

  const currentPermissions = permissions ?? {};
  const canOpenSettings = user.role === 'direction' || Boolean(
    currentPermissions['terminals.manage'] || currentPermissions['settings.view'] || currentPermissions['settings.edit'] ||
    currentPermissions['users.view'] || currentPermissions['users.manage'] || currentPermissions['permissions.manage'],
  );
  if (!canOpenSettings) {
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

  const hasOtherScopedAccess = Boolean(
    currentPermissions['settings.view'] || currentPermissions['settings.edit'] || currentPermissions['users.view'] ||
    currentPermissions['users.manage'] || currentPermissions['permissions.manage'],
  );
  if (user.role !== 'direction' && currentPermissions['terminals.manage'] && !hasOtherScopedAccess) {
    return <TerminalManager />;
  }

  return <AdminSettings user={user} permissions={currentPermissions} />;
}

function TerminalManager() {
  const toast = useToast();
  const [terminals, setTerminals] = useState<TerminalInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [id, setId] = useState('');

  async function loadTerminals() {
    setLoading(true);
    setError(null);
    try {
      const result = await api<{ terminals: TerminalInfo[] }>('/api/terminals', { bypassCache: true });
      setTerminals(result.terminals);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chargement des bornes impossible.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadTerminals(); }, []);

  async function createTerminal() {
    setBusy(true);
    setFormError(null);
    try {
      await api('/api/terminals', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), id: id.trim() || undefined }),
      });
      setOpen(false);
      setName('');
      setId('');
      toast('Terminal enregistré.', 'success');
      await loadTerminals();
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
      await loadTerminals();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Modification refusée.', 'error');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Terminaux de pointage" hint="Créer et gérer les bornes Kiosque de l’atelier." />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-soft">{terminals.filter((terminal) => terminal.active).length} borne(s) active(s) sur {terminals.length}</p>
        <Button variant="primary" icon={<Plus size={15} />} onClick={() => { setFormError(null); setOpen(true); }}>Nouvelle borne</Button>
      </div>
      {error ? <Banner tone="error">{error}</Banner> : null}
      {loading ? <div className="grid min-h-40 place-items-center"><Spinner /></div> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {terminals.map((terminal) => (
            <Card key={terminal.id} className="border-line bg-surface">
              <CardContent className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{terminal.name}</p>
                  <p className="mt-1 font-mono text-xs text-ink-soft">{terminal.id}</p>
                  <p className="mt-2 text-xs text-ink-faint">{terminal.punches_today} pointage(s) aujourd’hui</p>
                  {terminal.last_used ? <p className="mt-1 text-xs text-ink-faint">Dernière activité : {formatDateTime(terminal.last_used)}</p> : null}
                </div>
                <Button size="sm" variant={terminal.active ? 'outline-danger' : 'secondary'} onClick={() => void toggleTerminal(terminal)}>
                  {terminal.active ? 'Désactiver' : 'Activer'}
                </Button>
              </CardContent>
            </Card>
          ))}
          {terminals.length === 0 ? <EmptyState title="Aucune borne enregistrée" hint="Créez une borne pour commencer." /> : null}
        </div>
      )}
      <Modal open={open} title="Enregistrer un terminal" onClose={() => setOpen(false)} footer={
        <><Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button><Button variant="primary" disabled={busy || name.trim().length < 3} onClick={() => void createTerminal()}>{busy ? <Spinner /> : 'Enregistrer'}</Button></>
      }>
        <div className="space-y-4">
          {formError ? <Banner tone="error">{formError}</Banner> : null}
          <label className="block text-xs font-medium text-ink-soft">Nom de la borne
            <input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex. Tablette de l’atelier" className="mt-1.5 h-10 w-full rounded-btn border border-line-strong bg-surface px-3 text-sm text-ink focus:border-amber focus:outline-none" />
          </label>
          <label className="block text-xs font-medium text-ink-soft">Identifiant (facultatif)
            <input value={id} onChange={(event) => setId(event.target.value.toUpperCase())} placeholder="Généré automatiquement" className="mt-1.5 h-10 w-full rounded-btn border border-line-strong bg-surface px-3 font-mono text-sm text-ink focus:border-amber focus:outline-none" />
          </label>
        </div>
      </Modal>
    </div>
  );
}

function AdminSettings({ user, permissions }: { user: User; permissions: Record<string, boolean> }) {
  const toast = useToast();
  const isDirection = user.role === 'direction';
  const canViewUsers = isDirection || Boolean(permissions['users.view'] || permissions['users.manage']);
  const canManageUsers = isDirection || Boolean(permissions['users.manage']);
  const canManagePermissions = isDirection || Boolean(permissions['permissions.manage']);
  const canViewSettings = isDirection || Boolean(permissions['settings.view'] || permissions['settings.edit']);
  const canEditSettings = isDirection || Boolean(permissions['settings.edit']);
  const canManageTerminals = isDirection || Boolean(permissions['terminals.manage']);
  const canUseBackups = isDirection;
  const canViewKiosk = canViewSettings || canManageTerminals;
  const availableTabs = [
    ...(canViewUsers ? ['comptes'] : []),
    ...(canManagePermissions ? ['permissions'] : []),
    ...(canViewKiosk ? ['kiosk'] : []),
    'securite',
    ...(canUseBackups ? ['sauvegardes'] : []),
  ] as const;
  const defaultTab = canViewUsers ? 'comptes' : canManagePermissions ? 'permissions' : canViewKiosk ? 'kiosk' : 'securite';

  // Navigation tab
  const [activeTab, setActiveTab] = useState<'comptes' | 'permissions' | 'kiosk' | 'securite' | 'sauvegardes'>(() => {
    try {
      const saved = sessionStorage.getItem('parametres_active_tab');
      if (saved && availableTabs.includes(saved as (typeof availableTabs)[number])) {
        sessionStorage.removeItem('parametres_active_tab');
        return saved as 'comptes' | 'permissions' | 'kiosk' | 'securite' | 'sauvegardes';
      }
    } catch {
      /* ignore storage error */
    }
    return defaultTab;
  });

  // Core data states
  const [settings, setSettings] = useState<KioskSettings | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<KioskSettings | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [motifDraft, setMotifDraft] = useState('');
  const [kioskSubTab, setKioskSubTab] = useState<'horaires' | 'bornes' | 'regles'>(canViewSettings ? 'horaires' : 'bornes');

  useEffect(() => {
    if (!availableTabs.includes(activeTab)) setActiveTab(defaultTab);
    if (!canViewSettings && kioskSubTab !== 'bornes') setKioskSubTab('bornes');
    if (!canManageTerminals && kioskSubTab === 'bornes') setKioskSubTab('horaires');
  }, [permissions, activeTab, defaultTab, canManageTerminals, canViewSettings, kioskSubTab, availableTabs]);

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
    confirmPassword: '',
    role: 'magasinier' as Role,
    employee_id: '',
  });
  const [resetFor, setResetFor] = useState<AppUserRow | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState('');
  const [editFor, setEditFor] = useState<AppUserRow | null>(null);
  const [editForm, setEditForm] = useState({ display_name: '', role: 'travailleur' as Role, employee_id: '' });
  const [deleteUserFor, setDeleteUserFor] = useState<AppUserRow | null>(null);
  const [deleteUserBusy, setDeleteUserBusy] = useState(false);
  const [deleteUserError, setDeleteUserError] = useState<string | null>(null);

  // Photo modal states for profile (self / direction admin)
  const [profilePhotoOpen, setProfilePhotoOpen] = useState(false);
  const [profilePhotoTarget, setProfilePhotoTarget] = useState<{ type: 'self' | 'user'; userId?: number; current?: string | null; name?: string } | null>(null);

  // Password change for current user
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });

  // General busy & error states
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Filter states for accounts
  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all');
  const [kpiCardFilter, setKpiCardFilter] = useState<'all' | 'active' | 'inactive' | 'linked' | 'direction'>('all');

  // Permissions & RBAC filter states
  const [permSearch, setPermSearch] = useState('');
  const [permGroupFilter, setPermGroupFilter] = useState<'all' | string>('all');

  // Purge confirmation modal state
  const [purgeConfirmOpen, setPurgeConfirmOpen] = useState(false);

  // New RBAC action modal state
  const [newActionOpen, setNewActionOpen] = useState(false);
  const [newActionForm, setNewActionForm] = useState({ action: '', label: '', group_label: '' });
  const [newActionBusy, setNewActionBusy] = useState(false);
  const [newActionError, setNewActionError] = useState<string | null>(null);

  // Role management states (Direction control)
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [roleModalMode, setRoleModalMode] = useState<'create' | 'edit'>('create');
  const [roleForm, setRoleForm] = useState({ id: '', name: '', description: '', template: 'ouvrier', copyFrom: '' });
  const [roleError, setRoleError] = useState<string | null>(null);
  const [roleBusy, setRoleBusy] = useState(false);
  const [deleteRoleConfirm, setDeleteRoleConfirm] = useState<RoleInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (reload === 0) setLoading(true);
    else setIsRefreshing(true);

    Promise.all([
      canViewSettings
        ? api<{ settings: KioskSettings }>('/api/settings')
        : Promise.resolve(null),
      canManageTerminals
        ? api<{ terminals: TerminalInfo[] }>('/api/terminals')
        : Promise.resolve(null),
      canViewUsers
        ? api<{ users: AppUserRow[] }>('/api/users')
        : Promise.resolve(null),
      permissions['employees.view'] || isDirection
        ? api<{ employees: Employee[] }>('/api/employees').catch(() => null)
        : Promise.resolve(null),
      canManagePermissions
        ? api<PermissionMatrix>('/api/permissions').catch(() => null)
        : Promise.resolve(null),
      canUseBackups
        ? api<{ backups: BackupInfo[]; retentionDays: number }>('/api/admin/backups').catch(() => null)
        : Promise.resolve(null),
    ])
      .then(([setRes, termRes, userRes, empRes, permRes, backupRes]) => {
        if (cancelled) return;
        if (setRes) {
          setSettings(setRes.settings);
          setSettingsDraft(setRes.settings);
        } else {
          setSettings(null);
          setSettingsDraft(null);
        }
        setTerminals(termRes?.terminals ?? []);
        setUsers(userRes?.users ?? []);
        setEmployees(empRes?.employees ?? []);
        if (permRes) {
          setPermMatrix(permRes);
          setPermDraft(permRes.matrix);
        }
        if (backupRes) {
          setBackups(backupRes.backups);
          setRetentionDays(backupRes.retentionDays);
        } else {
          setBackups([]);
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
  }, [reload, user.role, canViewSettings, canManageTerminals, canViewUsers, canManagePermissions, canUseBackups, permissions['employees.view'], isDirection]);

  const effectiveSettings = settingsDraft ?? settings;

  const hasUnsavedSettings = useMemo(() => {
    if (!settings || !settingsDraft) return false;
    return JSON.stringify(settings) !== JSON.stringify(settingsDraft);
  }, [settings, settingsDraft]);

  function updateSettingsDraft(patch: Partial<KioskSettings>) {
    setSettingsDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  function resetSettingsDraft() {
    if (settings) {
      setSettingsDraft(JSON.parse(JSON.stringify(settings)));
    }
  }

  // Save Settings helper (exécuté uniquement sur clic explicite)
  async function handleSaveSettings() {
    if (!settingsDraft) return;
    setSavingSettings(true);
    setSettingsError(null);
    try {
      const res = await api<{ settings: KioskSettings }>('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(settingsDraft),
      });
      setSettings(res.settings);
      setSettingsDraft(res.settings);
      toast('Paramètres d’atelier enregistrés.', 'success');
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

  async function purgeCloudBackups() {
    setBackupBusy(true);
    try {
      const res = await api<{ ok: boolean; count: number; message: string }>('/api/admin/backups/purge', {
        method: 'POST',
      });
      toast(res.message || 'Historique des instantanés cloud purgé avec succès.', 'success');
      await refreshBackups();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Purge impossible.', 'error');
    } finally {
      setBackupBusy(false);
    }
  }

  async function handleProfilePhotoSelect(url: string | null) {
    if (profilePhotoTarget?.type === 'self') {
      try {
        await api('/api/auth/profile/photo', {
          method: 'POST',
          body: JSON.stringify({ photo_path: url }),
        });
        toast('Photo de profil mise à jour.', 'success');
        user.photo_path = url;
        window.dispatchEvent(new CustomEvent('auth:user-updated', { detail: { ...user, photo_path: url } }));
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Mise à jour photo impossible.', 'error');
      }
    } else if (profilePhotoTarget?.type === 'user' && profilePhotoTarget.userId) {
      try {
        await api(`/api/users/${profilePhotoTarget.userId}`, {
          method: 'PATCH',
          body: JSON.stringify({ photo_path: url }),
        });
        toast('Photo utilisateur mise à jour.', 'success');
        setReload((value) => value + 1);
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Mise à jour photo impossible.', 'error');
      }
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
    if (!effectiveSettings) return;
    const workdays = effectiveSettings.workdays.includes(day)
      ? effectiveSettings.workdays.filter((value) => value !== day)
      : [...effectiveSettings.workdays, day].sort();
    updateSettingsDraft({ workdays: workdays.length ? workdays : [1] });
  }

  function removeMotif(motif: string) {
    if (!effectiveSettings) return;
    const late_motifs = effectiveSettings.late_motifs.filter((value) => value !== motif);
    if (late_motifs.length === 0) {
      toast('Au moins un motif de retard doit rester configuré.', 'error');
      return;
    }
    updateSettingsDraft({ late_motifs });
  }

  function addMotif() {
    const value = motifDraft.trim();
    if (!effectiveSettings || !value) return;
    if (effectiveSettings.late_motifs.includes(value)) {
      toast('Ce motif existe déjà.', 'error');
      return;
    }
    setMotifDraft('');
    updateSettingsDraft({ late_motifs: [...effectiveSettings.late_motifs, value] });
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
      if (userForm.password !== userForm.confirmPassword) {
        setFormError('La confirmation du mot de passe ne correspond pas.');
        return;
      }
      await api('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          login: userForm.login,
          display_name: userForm.display_name,
          password: userForm.password,
          role: userForm.role,
          employee_id: userForm.employee_id || undefined,
        }),
      });
      toast('Nouveau compte créé.', 'success');
      setUserOpen(false);
      setReload((value) => value + 1);
      window.dispatchEvent(new CustomEvent('mf-refresh-data'));
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
      window.dispatchEvent(new CustomEvent('mf-refresh-data'));
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Opération refusée.', 'error');
    }
  }

  async function resetUserPassword() {
    if (!resetFor) return;
    if (resetPassword !== resetPasswordConfirm) {
      toast('La confirmation du mot de passe ne correspond pas.', 'error');
      return;
    }
    setBusy(true);
    try {
      await api(`/api/users/${resetFor.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ password: resetPassword }),
      });
      toast(`Mot de passe réinitialisé pour ${resetFor.login}.`, 'success');
      setResetFor(null);
      setResetPassword('');
      setResetPasswordConfirm('');
      window.dispatchEvent(new CustomEvent('mf-refresh-data'));
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
      window.dispatchEvent(new CustomEvent('mf-refresh-data'));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Mise à jour impossible.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteUser() {
    if (!deleteUserFor) return;
    setDeleteUserBusy(true);
    setDeleteUserError(null);
    try {
      await api(`/api/users/${deleteUserFor.id}`, {
        method: 'DELETE',
      });
      toast(`Compte @${deleteUserFor.login} supprimé définitivement.`, 'success');
      setDeleteUserFor(null);
      setReload((value) => value + 1);
      window.dispatchEvent(new CustomEvent('mf-refresh-data'));
    } catch (err) {
      setDeleteUserError(err instanceof Error ? err.message : 'Impossible de supprimer ce compte.');
    } finally {
      setDeleteUserBusy(false);
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
      window.dispatchEvent(new CustomEvent('permissions:updated'));
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

  function applyColumnPreset(role: string, preset: 'view_only' | 'all' | 'none') {
    if (!permMatrix || !permDraft) return;
    setPermDraft((prev) => {
      if (!prev) return prev;
      const updated = { ...prev };
      for (const act of permMatrix.actions) {
        const actionCode = act.action;
        const isView = act.kind === 'view' || actionCode.endsWith('.view');
        let allowed = false;
        if (preset === 'all') allowed = true;
        else if (preset === 'none') allowed = false;
        else if (preset === 'view_only') allowed = isView;

        updated[actionCode] = {
          ...updated[actionCode],
          [role]: allowed,
        };
      }
      return updated;
    });

    const roleName = availableRoles.find((r) => r.id === role)?.name ?? ROLE_LABEL[role] ?? role;
    toast(
      preset === 'view_only'
        ? `Droits de « ${roleName} » configurés en Consultation (Lecture seule).`
        : preset === 'all'
        ? `Toutes les permissions ont été accordées à « ${roleName} ».`
        : `Toutes les permissions ont été révoquées pour « ${roleName} ».`,
      'info',
    );
  }

  async function handleCreateAction() {
    if (!newActionForm.action.trim() || !newActionForm.label.trim() || !newActionForm.group_label.trim()) {
      setNewActionError('Tous les champs sont obligatoires.');
      return;
    }
    setNewActionBusy(true);
    setNewActionError(null);
    try {
      const res = await api<{ ok: boolean; action: { action: string; label: string; group_label: string } }>(
        '/api/permissions/actions',
        {
          method: 'POST',
          body: JSON.stringify(newActionForm),
        },
      );
      if (res.ok) {
        toast(`Nouvelle action « ${res.action.label} » ajoutée dans le module ${res.action.group_label} !`, 'success');
        setNewActionOpen(false);
        const permRes = await api<PermissionMatrix>('/api/permissions').catch(() => null);
        if (permRes) {
          setPermMatrix(permRes);
          setPermDraft(permRes.matrix);
        }
      }
    } catch (err) {
      setNewActionError(err instanceof Error ? err.message : 'Impossible de créer cette action.');
    } finally {
      setNewActionBusy(false);
    }
  }

  // Role management actions (Direction)
  function openCreateRoleModal(defaultArchetype = 'menuisier') {
    setRoleForm({
      id: '',
      name: '',
      description: '',
      template: defaultArchetype,
      copyFrom: '',
    });
    setRoleModalMode('create');
    setRoleError(null);
    setRoleModalOpen(true);
  }

  function selectRoleArchetype(archId: string) {
    setRoleForm((f) => ({
      ...f,
      template: archId,
      name: '',
      id: '',
      description: '',
    }));
  }

  function openEditRoleModal(r: RoleInfo) {
    setRoleForm({ id: r.id, name: r.name, description: r.description ?? '', template: 'custom', copyFrom: '' });
    setRoleModalMode('edit');
    setRoleError(null);
    setRoleModalOpen(true);
  }

  async function handleSaveRole() {
    const selectedArch = ROLE_ARCHETYPES_UI.find((a) => a.id === roleForm.template);
    const trimmedName = roleForm.name.trim() || (roleModalMode === 'create' && selectedArch && selectedArch.id !== 'custom' && selectedArch.id !== 'clone' ? selectedArch.name : '');
    if (!trimmedName) {
      setRoleError('Le libellé officiel du rôle est requis.');
      return;
    }

    const autoId = (roleForm.id.trim() || trimmedName)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_')
      .replace(/^_+|_+$/g, '');

    setRoleBusy(true);
    setRoleError(null);
    try {
      if (roleModalMode === 'create') {
        const payload: Record<string, unknown> = {
          id: autoId || undefined,
          name: trimmedName,
          description: roleForm.description.trim() || (selectedArch && selectedArch.id !== 'custom' && selectedArch.id !== 'clone' ? selectedArch.description : undefined) || undefined,
        };
        if (roleForm.template === 'clone' && roleForm.copyFrom) {
          payload.copy_from = roleForm.copyFrom;
        } else if (roleForm.template && roleForm.template !== 'custom') {
          payload.template = roleForm.template;
        }

        await api('/api/permissions/roles', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        toast(`Rôle « ${trimmedName} » créé avec succès. Vous pouvez maintenant ajuster ses droits dans la matrice.`, 'success');
        window.dispatchEvent(new CustomEvent('permissions:updated'));
        window.dispatchEvent(new CustomEvent('roles-updated'));
      } else {
        await api(`/api/permissions/roles/${roleForm.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: trimmedName,
            description: roleForm.description.trim() || undefined,
          }),
        });
        toast(`Rôle « ${trimmedName} » mis à jour.`, 'success');
        window.dispatchEvent(new CustomEvent('permissions:updated'));
        window.dispatchEvent(new CustomEvent('roles-updated'));
      }
      setRoleModalOpen(false);
      setReload((v) => v + 1);
    } catch (err) {
      setRoleError(err instanceof Error ? err.message : 'Impossible d’enregistrer le rôle.');
    } finally {
      setRoleBusy(false);
    }
  }

  // Smart User Account auto-fill helper
  function handleUserEmployeeChange(empId: string) {
    const emp = employees.find((e) => e.id === empId);
    if (!emp) {
      setUserForm((f) => ({ ...f, employee_id: '' }));
      return;
    }
    const normalizedLogin = emp.full_name
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '.')
      .replace(/^\.+|\.+$/g, '')
      .slice(0, 32);

    let suggestedRole = 'travailleur';
    const lowerJob = emp.job_title.toLowerCase();
    if (lowerJob.includes('magasin') || lowerJob.includes('stock')) suggestedRole = 'magasinier';
    else if (lowerJob.includes('chef') || lowerJob.includes('supervis') || lowerJob.includes('responsable')) suggestedRole = 'chef_atelier';

    setUserForm((f) => ({
      ...f,
      employee_id: empId,
      display_name: f.display_name.trim() ? f.display_name : emp.full_name,
      login: f.login.trim() ? f.login : normalizedLogin,
      password: f.password,
      role: availableRoles.some((r) => r.id === suggestedRole) ? suggestedRole : (availableRoles[0]?.id ?? 'travailleur'),
    }));
  }

  async function handleDeleteRole(role: RoleInfo) {
    setRoleBusy(true);
    try {
      await api(`/api/permissions/roles/${role.id}`, {
        method: 'DELETE',
      });
      toast(`Rôle « ${role.name} » supprimé avec succès.`, 'success');
      setDeleteRoleConfirm(null);
      setPermDraft((prev) => {
        if (!prev) return prev;
        const next = { ...prev };
        for (const act of Object.keys(next)) {
          if (next[act]) {
            const row = { ...next[act] };
            delete row[role.id];
            next[act] = row;
          }
        }
        return next;
      });
      setReload((v) => v + 1);
      window.dispatchEvent(new CustomEvent('permissions:updated'));
      window.dispatchEvent(new CustomEvent('roles-updated'));
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Suppression impossible.', 'error');
    } finally {
      setRoleBusy(false);
    }
  }

  // Dynamic available roles list with user count
  const availableRoles = useMemo<RoleInfo[]>(() => {
    const isSystemRole = (id: string) => ['direction', 'chef_atelier', 'magasinier', 'travailleur'].includes(id);
    if (permMatrix?.rolesDetail && permMatrix.rolesDetail.length > 0) {
      return permMatrix.rolesDetail.map((r) => ({
        ...r,
        is_system: r.is_system || isSystemRole(r.id),
        user_count: users.filter((u) => u.role === r.id).length,
      }));
    }
    return ROLES_OPTION.map((r) => ({
      id: r,
      name: ROLE_LABEL[r] ?? r,
      description: ROLE_DESC[r] ?? null,
      is_system: isSystemRole(r),
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
      // Interactive KPI Card Filter
      if (kpiCardFilter === 'active' && !u.active) return false;
      if (kpiCardFilter === 'inactive' && u.active) return false;
      if (kpiCardFilter === 'linked' && !u.employee_id) return false;
      if (kpiCardFilter === 'direction' && u.role !== 'direction') return false;

      // Role filter
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
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
  }, [sortedUsers, kpiCardFilter, roleFilter, userSearch, employeesById]);

  // Key performance indicators
  const activeUsersCount = useMemo(() => users.filter((u) => u.active).length, [users]);
  const activeTerminalsCount = useMemo(() => terminals.filter((t) => t.active).length, [terminals]);

  function handleExportPermissionsExcel() {
    if (!permMatrix || !permDraft) return;
    const dateStr = new Date().toISOString().split('T')[0];
    const roleHeaders = permMatrix.roles.map((r) => availableRoles.find((ar) => ar.id === r)?.name ?? ROLE_LABEL[r] ?? r);
    const headers = ['Groupe', 'Action Code', 'Libellé', 'Type', ...roleHeaders];
    const rows: (string | number)[][] = [];
    for (const group of permMatrix.groups) {
      for (const act of group.actions) {
        const meta = permMatrix.actions.find((a) => a.action === act);
        const isView = meta?.kind === 'view' || act.endsWith('.view');
        rows.push([
          group.label,
          act,
          meta?.label ?? act,
          isView ? 'Consultation' : 'Action',
          ...permMatrix.roles.map((r) => {
            if (r === 'direction') return 'Accordé (Permanent)';
            return permDraft[act]?.[r] ? 'Accordé' : 'Refusé';
          }),
        ]);
      }
    }
    exportToExcel(`Matrice_RBAC_Permissions_${dateStr}`, 'Permissions', headers, rows);
  }

  function handleExportPermissionsPdf() {
    if (!permMatrix || !permDraft) return;
    const headers = ['Action Code', 'Libellé', 'Chef d’atelier', 'Magasinier', 'Travailleur'];
    const rows = permMatrix.actions.map((act) => [
      act.action,
      act.label,
      permDraft[act.action]?.chef_atelier ? 'Accordé' : '—',
      permDraft[act.action]?.magasinier ? 'Accordé' : '—',
      permDraft[act.action]?.travailleur ? 'Accordé' : '—',
    ]);
    exportToPdf(
      'Matrice de Contrôle d’Accès (RBAC)',
      'Privilèges et habilitations de sécurité des rôles C.F.T. Bénédictins',
      headers,
      rows,
      [
        { label: 'Total Actions', value: permMatrix.actions.length },
        { label: 'Total Groupes', value: permMatrix.groups.length },
        { label: 'Rôles Configurés', value: permMatrix.roles.length },
      ],
    );
  }

  function handleExportUsersExcel() {
    const dateStr = new Date().toISOString().split('T')[0];
    const headers = ['Identifiant', 'Nom / Libellé', 'Rôle', 'Matricule Ouvrier', 'Statut', 'Date Création'];
    const rows = filteredUsers.map((u) => [
      u.login,
      u.display_name,
      ROLE_LABEL[u.role] ?? u.role,
      u.employee_id || 'Non lié',
      u.active ? 'Actif' : 'Inactif',
      u.created_at ? formatDateTime(u.created_at) : '—',
    ]);
    exportToExcel(`Comptes_Utilisateurs_${dateStr}`, 'Utilisateurs', headers, rows);
  }

  function handleExportUsersPdf() {
    const headers = ['Identifiant', 'Nom / Libellé', 'Rôle', 'Matricule', 'Statut'];
    const rows = filteredUsers.map((u) => [
      u.login,
      u.display_name,
      ROLE_LABEL[u.role] ?? u.role,
      u.employee_id || '—',
      u.active ? 'Actif' : 'Inactif',
    ]);
    exportToPdf(
      'Annuaire Officiel des Utilisateurs & Accès',
      'Liste des comptes autorisés sur le Système Central CFTM Bénédictins',
      headers,
      rows,
      [
        { label: 'Total Comptes', value: users.length },
        { label: 'Comptes Actifs', value: activeUsersCount },
        { label: 'Liés à un Travailleur', value: users.filter((u) => !!u.employee_id).length },
      ],
    );
  }

  const displayGroups = useMemo(() => {
    if (!permMatrix) return [];
    const needle = permSearch.trim().toLowerCase();
    return permMatrix.groups
      .filter((g) => permGroupFilter === 'all' || g.label === permGroupFilter)
      .map((g) => {
        if (!needle) return g;
        const matchedActions = g.actions.filter((act) => {
          const meta = permMatrix.actions.find((a) => a.action === act);
          return act.toLowerCase().includes(needle) || (meta?.label ?? '').toLowerCase().includes(needle);
        });
        return { ...g, actions: matchedActions };
      })
      .filter((g) => g.actions.length > 0);
  }, [permMatrix, permSearch, permGroupFilter]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-sm text-ink-soft">
        <Spinner className="h-6 w-6 text-amber" />
        <p className="font-medium">Chargement des paramètres de la console…</p>
      </div>
    );
  }

  if (canViewSettings && !settings) {
    return <EmptyState title="Paramètres indisponibles" hint={settingsError ?? undefined} />;
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <PageHeader
        title="Paramètres"
        hint="Configuration générale de l'atelier, des accès, bornes de pointage et sauvegardes CFTM"
      />

      {settingsError ? (
        <div className="mb-4">
          <Banner tone="error">{settingsError}</Banner>
        </div>
      ) : null}

      {/* Main Tabs Navigation */}
      <Tabs
        value={activeTab}
        onValueChange={(val) => {
          setActiveTab(val as typeof activeTab);
          const main = document.querySelector('main');
          if (main && main.scrollTop > 120) {
            main.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }}
        className="w-full space-y-6"
      >
        {/* Sticky Unified Command Deck (Apple macOS / Google Material 3 - 100% Canvas Width Edge-to-Edge) */}
        <div className="sticky top-0 lg:top-11 z-30 -mx-3 sm:-mx-6 lg:-mx-8 px-3 sm:px-6 lg:px-8 py-2.5 bg-paper border-b border-line shadow-xs space-y-2 mb-6">
          {/* Row 1: Master Navigation Tabs + Grouped Master Actions */}
          <div className="flex items-center justify-between gap-2 sm:gap-3 min-w-0">
            {/* Tabs Trigger list (Horizontally scrollable on small screens with no scrollbar) */}
            <div className="overflow-x-auto no-scrollbar py-0.5 min-w-0 flex-1">
              <TabsList variant="line" className="flex gap-1 sm:gap-2 bg-transparent p-0 w-max">
                {canViewUsers && <TabsTrigger
                  value="comptes"
                  className="shrink-0 whitespace-nowrap gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-medium"
                >
                  <Users size={14} className="text-amber" />
                  <span>Comptes</span>
                  <span className="ml-1 rounded-full bg-paper-2 px-1.5 py-0.2 text-[10px] font-bold tabular-nums text-ink-soft">
                    {activeUsersCount}/{users.length}
                  </span>
                </TabsTrigger>}

                {canManagePermissions && <TabsTrigger
                  value="permissions"
                  className="shrink-0 whitespace-nowrap relative gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-medium"
                >
                  <ShieldCheck size={14} className="text-amber" />
                  <span>Rôles &amp; Permissions</span>
                  {hasUnsavedPerms ? (
                    <span className="h-2 w-2 rounded-full bg-amber animate-pulse" title="Modifications en attente" />
                  ) : null}
                </TabsTrigger>}

                {canViewKiosk && <TabsTrigger
                  value="kiosk"
                  className="shrink-0 whitespace-nowrap gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-medium"
                >
                  <Clock size={14} className="text-amber" />
                  <span className="hidden sm:inline">Pointage &amp; Kiosque</span>
                  <span className="sm:hidden">Kiosque</span>
                  <span className="ml-1 rounded-full bg-paper-2 px-1.5 py-0.2 text-[10px] font-bold tabular-nums text-ink-soft">
                    {activeTerminalsCount} act.
                  </span>
                </TabsTrigger>}

                <TabsTrigger
                  value="securite"
                  className="shrink-0 whitespace-nowrap gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-medium"
                >
                  <KeyRound size={14} className="text-amber" />
                  <span className="hidden sm:inline">Sécurité &amp; Profil</span>
                  <span className="sm:hidden">Sécurité</span>
                </TabsTrigger>

                {canUseBackups && <TabsTrigger
                  value="sauvegardes"
                  className="shrink-0 whitespace-nowrap gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-medium"
                >
                  <HardDrive size={14} className="text-amber" />
                  <span className="hidden sm:inline">Sauvegardes &amp; Système</span>
                  <span className="sm:hidden">Sauvegardes</span>
                  <span className="ml-1 rounded-full bg-paper-2 px-1.5 py-0.2 text-[10px] font-bold tabular-nums text-ink-soft">
                    {backups.length}
                  </span>
                </TabsTrigger>}
              </TabsList>
            </div>

            {/* Global Utilities & Master CTAs */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                disabled={isRefreshing}
                icon={<RefreshCw size={13} className={cx(isRefreshing && 'animate-spin text-amber')} />}
                onClick={() => setReload((value) => value + 1)}
                className="h-8 px-2 sm:px-2.5 text-xs border border-line/70 hover:border-amber/50 hover:bg-paper-2 transition-all shadow-2xs"
                title="Actualiser les données"
              >
                <span className="hidden xl:inline">{isRefreshing ? 'Actualisation…' : 'Actualiser'}</span>
              </Button>

              {/* Contextual Primary Action CTA (Row 1) */}
              {activeTab === 'comptes' && canManageUsers && (
                <Button
                  size="sm"
                  variant="primary"
                  icon={<UserPlus size={14} />}
                  onClick={() => {
                    setUserForm({
                      login: '',
                      display_name: '',
                      password: '',
                      confirmPassword: '',
                      role: 'magasinier',
                      employee_id: '',
                    });
                    setFormError(null);
                    setUserOpen(true);
                  }}
                  className="h-8 px-2.5 sm:px-3 text-xs font-bold shadow-2xs whitespace-nowrap"
                  title="Créer un nouveau compte utilisateur"
                >
                  <span className="hidden sm:inline">Nouveau compte</span>
                  <span className="sm:hidden">Compte</span>
                </Button>
              )}

              {activeTab === 'permissions' && canManagePermissions && (
                hasUnsavedPerms ? (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={resetPermDraft}
                      disabled={busy}
                      className="h-8 px-2 sm:px-2.5 text-xs"
                    >
                      Annuler
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={busy}
                      icon={busy ? <Spinner className="h-3 w-3" /> : <Save size={14} />}
                      onClick={() => void savePermissions()}
                      className="h-8 px-2.5 sm:px-3 text-xs font-bold shadow-2xs whitespace-nowrap"
                    >
                      <span className="hidden sm:inline">Enregistrer</span>
                      <span className="sm:hidden">Sauver</span>
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="primary"
                    icon={<Plus size={14} />}
                    onClick={() => {
                      setNewActionForm({ action: '', label: '', group_label: 'Opérations Générales' });
                      setNewActionError(null);
                      setNewActionOpen(true);
                    }}
                    className="h-8 px-2.5 sm:px-3 text-xs font-bold shadow-2xs whitespace-nowrap"
                    title="Ajouter une action ou un module métier"
                  >
                    <span className="hidden sm:inline">Ajouter action</span>
                    <span className="sm:hidden">Action</span>
                  </Button>
                )
              )}

              {activeTab === 'kiosk' && ((kioskSubTab === 'bornes' && canManageTerminals) || (kioskSubTab !== 'bornes' && canEditSettings)) && (
                kioskSubTab === 'bornes' ? (
                  <Button
                    size="sm"
                    variant="primary"
                    icon={<Plus size={14} />}
                    onClick={() => {
                      setTerminalForm({ name: '', id: '' });
                      setTerminalOpen(true);
                    }}
                    className="h-8 px-2.5 sm:px-3 text-xs font-bold shadow-2xs whitespace-nowrap"
                    title="Ajouter une borne de pointage"
                  >
                    <span className="hidden sm:inline">Nouvelle borne</span>
                    <span className="sm:hidden">Borne</span>
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={savingSettings || !hasUnsavedSettings}
                    icon={savingSettings ? <Spinner className="h-3 w-3" /> : <Save size={14} />}
                    onClick={() => void handleSaveSettings()}
                    className="h-8 px-2.5 sm:px-3 text-xs font-bold shadow-2xs whitespace-nowrap"
                  >
                    <span className="hidden sm:inline">Enregistrer réglages</span>
                    <span className="sm:hidden">Sauver</span>
                  </Button>
                )
              )}

              {activeTab === 'sauvegardes' && canUseBackups && (
                <Button
                  size="sm"
                  variant="primary"
                  disabled={backupBusy}
                  icon={backupBusy ? <Spinner className="h-3 w-3" /> : <HardDrive size={14} />}
                  onClick={saveBackupNow}
                  className="h-8 px-2.5 sm:px-3 text-xs font-bold shadow-2xs whitespace-nowrap"
                >
                  <span className="hidden sm:inline">Créer instantané</span>
                  <span className="sm:hidden">Instantané</span>
                </Button>
              )}

              {/* Hamburger Overflow Options Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Menu size={14} />}
                    className="h-8 px-2 sm:px-2.5 text-xs shadow-2xs gap-1.5"
                    title="Options &amp; Exports"
                  >
                    <span className="hidden sm:inline">Options</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-paper border border-line shadow-card rounded-xl p-1 text-xs">
                  <DropdownMenuLabel className="px-2.5 py-1.5 text-[11px] font-semibold text-ink-faint uppercase tracking-wider">
                    Actions &amp; Outils
                  </DropdownMenuLabel>

                  {activeTab === 'permissions' && canManagePermissions && (
                    <>
                      <DropdownMenuItem
                        onClick={handleExportPermissionsExcel}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-paper-2 text-ink"
                      >
                        <FileSpreadsheet size={14} className="text-emerald-500" />
                        <span>Exporter Matrice RBAC (Excel)</span>
                      </DropdownMenuItem>

                      <DropdownMenuItem
                        onClick={handleExportPermissionsPdf}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-paper-2 text-ink"
                      >
                        <Printer size={14} className="text-sky-500" />
                        <span>Imprimer Matrice RBAC (PDF)</span>
                      </DropdownMenuItem>

                      <DropdownMenuSeparator className="my-1 border-line" />

                      <DropdownMenuItem
                        onClick={() => openCreateRoleModal()}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-paper-2 text-ink"
                      >
                        <Plus size={14} className="text-amber" />
                        <span>Créer un nouveau Rôle métier</span>
                      </DropdownMenuItem>

                      <DropdownMenuItem
                        onClick={resetPermDraft}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-paper-2 text-ink"
                      >
                        <RefreshCw size={14} />
                        <span>Réinitialiser modifications</span>
                      </DropdownMenuItem>
                    </>
                  )}

                  {activeTab === 'comptes' && canManageUsers && (
                    <>
                      <DropdownMenuItem
                        onClick={handleExportUsersExcel}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-paper-2 text-ink"
                      >
                        <FileSpreadsheet size={14} className="text-emerald-500" />
                        <span>Exporter les Comptes (Excel)</span>
                      </DropdownMenuItem>

                      <DropdownMenuItem
                        onClick={handleExportUsersPdf}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-paper-2 text-ink"
                      >
                        <Printer size={14} className="text-sky-500" />
                        <span>Imprimer les Comptes (PDF)</span>
                      </DropdownMenuItem>

                      <DropdownMenuSeparator className="my-1 border-line" />

                      {isDirection && <DropdownMenuItem
                        onClick={() => setPurgeConfirmOpen(true)}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-red-500/10 text-red"
                      >
                        <Trash2 size={14} />
                        <span>Purger comptes de test</span>
                      </DropdownMenuItem>}
                    </>
                  )}

                  {activeTab === 'kiosk' && canViewKiosk && (
                    <DropdownMenuItem
                      onClick={() => window.open('/pointage', '_blank')}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-paper-2 text-ink"
                    >
                      <Smartphone size={14} className="text-amber" />
                      <span>Ouvrir Kiosque plein écran</span>
                    </DropdownMenuItem>
                  )}

                  {activeTab === 'sauvegardes' && canUseBackups && (
                    <DropdownMenuItem
                      onClick={saveBackupNow}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-paper-2 text-ink"
                    >
                      <Download size={14} className="text-emerald-500" />
                      <span>Télécharger Sauvegarde SQL</span>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Row 2: Continuous Search & Filters (Dedicated Sub-Row) */}
          {activeTab === 'comptes' && canViewUsers && (
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-line/40 text-xs">
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5 flex-1 min-w-0">
                {/* Real-time Search */}
                <div className="relative w-44 sm:w-60 shrink-0">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
                  <input
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Rechercher nom, login, rôle..."
                    className="h-7.5 w-full rounded-lg border border-line bg-surface/90 pl-8 pr-7 text-xs text-ink placeholder:text-ink-faint focus:border-amber focus:outline-none transition-all shadow-2xs"
                  />
                  {userSearch && (
                    <button
                      onClick={() => setUserSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink text-xs p-0.5"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                {/* Status Chips */}
                <div className="flex items-center gap-1 shrink-0">
                  {[
                    { key: 'all', label: 'Tous', count: users.length },
                    { key: 'active', label: 'Actifs', count: activeUsersCount },
                    { key: 'inactive', label: 'Inactifs', count: users.length - activeUsersCount },
                    { key: 'direction', label: 'Direction', count: users.filter((u) => u.role === 'direction').length },
                  ].map(({ key, label, count }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setKpiCardFilter(key as any)}
                      className={cx(
                        'px-2.5 py-0.5 rounded-full text-xs font-semibold shrink-0 transition-all flex items-center gap-1.5 border shadow-2xs cursor-pointer',
                        kpiCardFilter === key
                          ? 'bg-amber text-white border-amber shadow-xs font-bold'
                          : 'bg-surface text-ink-soft border-line/70 hover:bg-paper-2 hover:text-ink',
                      )}
                    >
                      <span>{label}</span>
                      <span className="opacity-75 text-[10px] tabular-nums font-mono">{count}</span>
                    </button>
                  ))}
                </div>

                {/* Role select */}
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value as any)}
                  className="h-7.5 rounded-lg border border-line bg-surface px-2 text-xs text-ink focus:border-amber focus:outline-none shadow-2xs max-w-[140px] shrink-0"
                  title="Filtrer par rôle"
                >
                  <option value="all">Tous les rôles</option>
                  {availableRoles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {activeTab === 'permissions' && canManagePermissions && (
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-line/40 text-xs">
              {/* Real-time Search */}
              <div className="relative w-44 sm:w-60 shrink-0">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
                <input
                  value={permSearch}
                  onChange={(e) => setPermSearch(e.target.value)}
                  placeholder="Filtrer action, permission..."
                  className="h-7.5 w-full rounded-lg border border-line bg-surface/90 pl-8 pr-7 text-xs text-ink placeholder:text-ink-faint focus:border-amber focus:outline-none transition-all shadow-2xs"
                />
                {permSearch && (
                  <button
                    onClick={() => setPermSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink text-xs p-0.5"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Module Filter Chips scrolling freely across 100% canvas width */}
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5 flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => setPermGroupFilter('all')}
                  className={cx(
                    'px-2.5 py-0.5 rounded-full text-xs font-semibold shrink-0 transition-all flex items-center gap-1.5 border shadow-2xs cursor-pointer',
                    permGroupFilter === 'all'
                      ? 'bg-amber text-white border-amber shadow-xs font-bold'
                      : 'bg-surface text-ink-soft border-line/70 hover:bg-paper-2 hover:text-ink',
                  )}
                >
                  <span>Tous modules</span>
                  <span className="opacity-75 text-[10px] tabular-nums font-mono">{permMatrix?.actions.length ?? 0}</span>
                </button>
                {permMatrix?.groups.map((g) => (
                  <button
                    key={g.label}
                    type="button"
                    onClick={() => setPermGroupFilter(g.label)}
                    className={cx(
                      'px-2.5 py-0.5 rounded-full text-xs font-semibold shrink-0 transition-all flex items-center gap-1.5 border shadow-2xs whitespace-nowrap cursor-pointer',
                      permGroupFilter === g.label
                        ? 'bg-amber text-white border-amber shadow-xs font-bold'
                        : 'bg-surface text-ink-soft border-line/70 hover:bg-paper-2 hover:text-ink',
                    )}
                  >
                    <span>{g.label}</span>
                    <span className="opacity-75 text-[10px] tabular-nums font-mono">{g.actions.length}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'kiosk' && canViewKiosk && (
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-line/40 text-xs">
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
                {[
                  ...(canViewSettings ? [{ key: 'horaires', label: 'Horaires & Présences' }] : []),
                  ...(canManageTerminals ? [{ key: 'bornes', label: `Bornes d'Atelier (${terminals.length})` }] : []),
                  ...(canViewSettings ? [{ key: 'regles', label: 'Règles & Retards' }] : []),
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setKioskSubTab(key as any)}
                    className={cx(
                      'px-3 py-1 rounded-full text-xs font-semibold shrink-0 transition-all border shadow-2xs whitespace-nowrap cursor-pointer',
                      kioskSubTab === key
                        ? 'bg-amber text-white border-amber shadow-xs font-bold'
                        : 'bg-surface text-ink-soft border-line/70 hover:bg-paper-2 hover:text-ink',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'sauvegardes' && canUseBackups && (
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-line/40 text-xs">
              <div className="text-xs text-ink-soft">
                Rétention : <strong className="text-ink">{retentionDays} jours</strong> de conservation automatique
              </div>
              <div className="text-xs text-ink-faint">
                {backups.length} sauvegarde{backups.length > 1 ? 's' : ''} système disponible{backups.length > 1 ? 's' : ''}
              </div>
            </div>
          )}
        </div>

        {/* =========================================================================
            TAB 1: COMPTES UTILISATEURS
        ========================================================================= */}
        {canViewUsers && <TabsContent value="comptes" className="space-y-6">
          {/* Quick Interactive Metrics */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card
              onClick={() => setKpiCardFilter('all')}
              className={cx(
                'p-4 shadow-card cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99] select-none',
                kpiCardFilter === 'all'
                  ? 'border-amber bg-amber-wash/40 ring-2 ring-amber/50 shadow-md'
                  : 'hover:border-line-strong hover:bg-paper-2/40',
              )}
            >
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-medium uppercase tracking-wider text-ink-faint">Total Comptes</p>
                {kpiCardFilter === 'all' && (
                  <span className="h-2 w-2 rounded-full bg-amber animate-pulse" />
                )}
              </div>
              <p className="mt-1 text-2xl font-semibold text-ink">{users.length}</p>
              <p className="mt-1 text-[10px] text-ink-faint">Tous les profils créés</p>
            </Card>

            <Card
              onClick={() => setKpiCardFilter((prev) => (prev === 'active' ? 'all' : 'active'))}
              className={cx(
                'p-4 shadow-card cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99] select-none',
                kpiCardFilter === 'active'
                  ? 'border-green bg-green-wash/50 ring-2 ring-green/50 shadow-md'
                  : 'hover:border-green/40 hover:bg-paper-2/40',
              )}
            >
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-medium uppercase tracking-wider text-green font-semibold">Comptes Actifs</p>
                {kpiCardFilter === 'active' ? (
                  <span className="h-2 w-2 rounded-full bg-green animate-pulse" />
                ) : (
                  <span className="text-[10px] text-ink-faint">Filtrer</span>
                )}
              </div>
              <p className="mt-1 text-2xl font-semibold text-green">{activeUsersCount}</p>
              <p className="mt-1 text-[10px] text-ink-faint">Accès autorisés</p>
            </Card>

            <Card
              onClick={() => setKpiCardFilter((prev) => (prev === 'linked' ? 'all' : 'linked'))}
              className={cx(
                'p-4 shadow-card cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99] select-none',
                kpiCardFilter === 'linked'
                  ? 'border-amber bg-amber-wash/50 ring-2 ring-amber/50 shadow-md'
                  : 'hover:border-amber/40 hover:bg-paper-2/40',
              )}
            >
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-medium uppercase tracking-wider text-ink-faint">Rattachés Travailleurs</p>
                {kpiCardFilter === 'linked' ? (
                  <span className="h-2 w-2 rounded-full bg-amber animate-pulse" />
                ) : (
                  <span className="text-[10px] text-ink-faint">Filtrer</span>
                )}
              </div>
              <p className="mt-1 text-2xl font-semibold text-ink">
                {users.filter((u) => !!u.employee_id && employeesById.has(u.employee_id)).length}
              </p>
              <p className="mt-1 text-[10px] text-ink-faint">Liés à une fiche artisan active</p>
            </Card>

            <Card
              onClick={() => setKpiCardFilter((prev) => (prev === 'direction' ? 'all' : 'direction'))}
              className={cx(
                'p-4 shadow-card cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99] select-none',
                kpiCardFilter === 'direction'
                  ? 'border-blue bg-blue-wash/50 ring-2 ring-blue/50 shadow-md'
                  : 'hover:border-blue/40 hover:bg-paper-2/40',
              )}
            >
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-medium uppercase tracking-wider text-blue font-semibold">Direction &amp; Admin</p>
                {kpiCardFilter === 'direction' ? (
                  <span className="h-2 w-2 rounded-full bg-blue animate-pulse" />
                ) : (
                  <span className="text-[10px] text-ink-faint">Filtrer</span>
                )}
              </div>
              <p className="mt-1 text-2xl font-semibold text-blue">
                {users.filter((u) => u.role === 'direction').length}
              </p>
              <p className="mt-1 text-[10px] text-ink-faint">Super-utilisateurs</p>
            </Card>
          </div>

          {/* User Management Table Card */}
          <Card className="shadow-card">
            <CardHeader className="border-b border-line pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base font-semibold text-ink">
                    <Users size={18} className="text-amber" /> Gestion des accès applicatifs
                  </CardTitle>
                  <CardDescription className="text-xs text-ink-soft">
                    Contrôlez les comptes habilités à administrer la menuiserie et gérer les stocks et outillages.
                  </CardDescription>
                </div>
                <div className="text-xs font-medium text-ink-soft">
                  {filteredUsers.length} profil{filteredUsers.length > 1 ? 's' : ''} répertorié{filteredUsers.length > 1 ? 's' : ''}
                </div>
              </div>
            </CardHeader>

            {/* Active KPI Filter Banner */}
            {kpiCardFilter !== 'all' && (
              <div className="flex items-center justify-between bg-amber-wash/60 border-b border-amber/30 px-5 py-2 text-xs text-amber-900 dark:text-amber font-medium">
                <span className="flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-amber" />
                  Filtre actif :{' '}
                  <strong className="underline">
                    {kpiCardFilter === 'active' && 'Comptes Actifs'}
                    {kpiCardFilter === 'linked' && 'Rattachés aux Travailleurs'}
                    {kpiCardFilter === 'direction' && 'Direction & Administration'}
                  </strong>
                  {' '}({filteredUsers.length} résultat{filteredUsers.length > 1 ? 's' : ''})
                </span>
                <button
                  onClick={() => setKpiCardFilter('all')}
                  className="text-[11px] underline font-semibold hover:text-ink transition-colors"
                >
                  ✕ Afficher tous les comptes
                </button>
              </div>
            )}

            {/* Accounts List & Table */}
            <CardContent className="p-0">
              {/* Desktop Table (Antigravity Grid with vertical borders) */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs table-rhythm">
                  <thead>
                    <tr className="border-b border-line bg-paper-2 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                      <th className="py-2.5 px-3 text-center w-12 border-r border-line col-lead">Photo</th>
                      <th className="py-2.5 px-4 border-r border-line col-lead">Utilisateur &amp; Identifiant</th>
                      <th className="py-2.5 px-4 border-r border-line">Rôle attribué</th>
                      <th className="py-2.5 px-4 border-r border-line">Fiche travailleur liée</th>
                      <th className="py-2.5 px-3 text-center border-r border-line">Statut</th>
                      <th className="py-2.5 px-4 text-right col-actions">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {filteredUsers.map((account, idx) => {
                      const employee = account.employee_id ? employeesById.get(account.employee_id) : undefined;
                      const theme = ROLE_THEME[account.role] ?? DEFAULT_ROLE_THEME;
                      return (
                        <tr
                          key={account.id}
                          className={cx(
                            'transition-colors',
                            !account.active
                              ? 'bg-paper/30 opacity-75'
                              : idx % 2 === 0
                              ? 'bg-surface/95'
                              : 'bg-surface-2/45',
                            'hover:bg-amber-wash/20',
                          )}
                        >
                          {/* Photo Avatar */}
                          <td className="py-2 px-3 text-center border-r border-line">
                          <div
                            onClick={canManageUsers ? () => {
                                setProfilePhotoTarget({ type: 'user', userId: account.id, current: account.photo_path, name: account.display_name });
                                setProfilePhotoOpen(true);
                            } : undefined}
                              className={cx(
                                'group relative mx-auto grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold border shadow-xs overflow-hidden cursor-pointer hover:border-amber transition-colors',
                                theme.bg,
                              )}
                              title="Modifier la photo"
                            >
                              {account.photo_path ? (
                                <img src={account.photo_path} alt={account.display_name} className="h-full w-full object-cover" />
                              ) : (
                                roleInitials(account.display_name)
                              )}
                              <span className="absolute inset-0 bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <Camera size={12} />
                              </span>
                            </div>
                          </td>

                          {/* Identity & Login */}
                          <td className="py-2.5 px-4 border-r border-line">
                            <div className="font-semibold text-ink text-xs">{account.display_name}</div>
                            <div className="font-mono text-[11px] text-ink-faint">@{account.login}</div>
                          </td>

                          {/* Role */}
                          <td className="py-2.5 px-4 border-r border-line">
                            <span
                              className={cx(
                                'inline-flex items-center rounded-chip border px-2 py-0.5 text-[11px] font-medium',
                                theme.bg,
                              )}
                            >
                              {availableRoles.find((r) => r.id === account.role)?.name ?? ROLE_LABEL[account.role] ?? account.role}
                            </span>
                          </td>

                          {/* Linked Employee */}
                          <td className="py-2.5 px-4 border-r border-line">
                            {employee ? (
                              <div className="text-xs">
                                <span className="font-medium text-ink">{employee.full_name}</span>{' '}
                                <span className="font-mono text-[11px] text-ink-faint">({employee.id})</span>
                              </div>
                            ) : (
                              <span className="text-[11px] text-ink-faint italic">— Aucun</span>
                            )}
                          </td>

                          {/* Status */}
                          <td className="py-2.5 px-3 text-center border-r border-line">
                            <span
                              className={cx(
                                'inline-flex items-center gap-1 rounded-chip border px-2 py-0.5 text-[10px] font-medium',
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
                          </td>

                          {/* Actions */}
                          <td className="py-2.5 px-4 text-right">
                            {canManageUsers && <div className="flex items-center justify-end gap-1.5">
                              <Button size="sm" variant="ghost" onClick={() => openEditAccount(account)} className="h-7 text-xs px-2.5">
                                Modifier
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setResetFor(account);
                                  setResetPassword('');
                                }}
                                className="h-7 text-xs px-2.5"
                              >
                                Clé
                              </Button>
                              <Button
                                size="sm"
                                variant={account.active ? 'outline-danger' : 'secondary'}
                                onClick={() => void toggleUser(account)}
                                className="h-7 text-xs px-2.5"
                              >
                                {account.active ? 'Désactiver' : 'Activer'}
                              </Button>
                              {account.id !== user.id && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setDeleteUserFor(account);
                                    setDeleteUserError(null);
                                  }}
                                  className="h-7 w-7 p-0 text-ink-faint hover:text-red hover:bg-red/10"
                                  title={`Supprimer définitivement @${account.login}`}
                                >
                                  <Trash2 size={13} />
                                </Button>
                              )}
                            </div>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards (sm:hidden) */}
              <div className="sm:hidden divide-y divide-line">
                {filteredUsers.map((account) => {
                  const employee = account.employee_id ? employeesById.get(account.employee_id) : undefined;
                  const theme = ROLE_THEME[account.role] ?? DEFAULT_ROLE_THEME;
                  return (
                    <div
                      key={account.id}
                      className={cx(
                        'p-4 space-y-3',
                        !account.active && 'bg-paper/30 opacity-80',
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          onClick={canManageUsers ? () => {
                            setProfilePhotoTarget({ type: 'user', userId: account.id, current: account.photo_path, name: account.display_name });
                            setProfilePhotoOpen(true);
                          } : undefined}
                          className={cx(
                            'relative grid h-10 w-10 shrink-0 place-items-center rounded-full text-xs font-bold border shadow-xs overflow-hidden',
                            theme.bg,
                          )}
                        >
                          {account.photo_path ? (
                            <img src={account.photo_path} alt={account.display_name} className="h-full w-full object-cover" />
                          ) : (
                            roleInitials(account.display_name)
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-semibold text-sm text-ink truncate">{account.display_name}</span>
                            <span
                              className={cx(
                                'inline-flex items-center gap-1 rounded-chip border px-1.5 py-0.5 text-[10px] font-medium shrink-0',
                                account.active
                                  ? 'border-green/20 bg-green-wash text-green'
                                  : 'border-line-strong bg-grey-wash text-ink-faint',
                              )}
                            >
                              <span className={cx('h-1.5 w-1.5 rounded-full', account.active ? 'bg-green' : 'bg-ink-faint')} />
                              {account.active ? 'Actif' : 'Inactif'}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="font-mono text-xs text-ink-faint">@{account.login}</span>
                            <span className="text-ink-faint text-[10px]">·</span>
                            <span
                              className={cx(
                                'inline-flex items-center rounded-chip border px-1.5 py-0.5 text-[10px] font-medium',
                                theme.bg,
                              )}
                            >
                              {availableRoles.find((r) => r.id === account.role)?.name ?? ROLE_LABEL[account.role] ?? account.role}
                            </span>
                          </div>

                          {employee ? (
                            <div className="text-[11px] text-ink-soft mt-1">
                              Fiche : <strong className="text-ink font-medium">{employee.full_name}</strong>
                            </div>
                          ) : null}
                        </div>
                      </div>

                      {canManageUsers && <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-line/50">
                        <Button size="sm" variant="ghost" onClick={() => openEditAccount(account)} className="h-8 text-xs flex-1">
                          Modifier
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setResetFor(account);
                            setResetPassword('');
                          }}
                          className="h-8 text-xs flex-1"
                        >
                          Mot de passe
                        </Button>
                        <Button
                          size="sm"
                          variant={account.active ? 'outline-danger' : 'secondary'}
                          onClick={() => void toggleUser(account)}
                          className="h-8 text-xs"
                        >
                          {account.active ? 'Désactiver' : 'Activer'}
                        </Button>
                        {account.id !== user.id && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setDeleteUserFor(account);
                              setDeleteUserError(null);
                            }}
                            className="h-8 w-8 p-0 text-red hover:bg-red/10"
                            title="Supprimer ce compte"
                          >
                            <Trash2 size={14} />
                          </Button>
                        )}
                      </div>}
                    </div>
                  );
                })}
              </div>

              {filteredUsers.length === 0 ? (
                <div className="px-6 py-12 text-center text-sm text-ink-soft">
                  <UserX size={32} className="mx-auto text-ink-faint mb-2" />
                  <p className="font-semibold text-ink">Aucun compte utilisateur trouvé</p>
                  <p className="mt-1 text-xs text-ink-faint">
                    {userSearch || roleFilter !== 'all' || kpiCardFilter !== 'all'
                      ? 'Modifiez ou effacez vos filtres de recherche.'
                      : 'Cliquez sur « Nouveau compte » pour ajouter un collaborateur.'}
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>}

        {/* =========================================================================
            TAB 2: ROLES & PERMISSIONS (RBAC)
        ========================================================================= */}
        {canManagePermissions && <TabsContent value="permissions" className="space-y-6">
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
                onClick={() => openCreateRoleModal()}
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
                            {isRootDirection && (
                              <span className="inline-flex items-center rounded-chip border border-amber/30 bg-amber-wash px-2 py-0.5 text-[10px] font-semibold text-amber">
                                Super-Admin racine
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-ink-soft line-clamp-2">
                            {r.description || 'Aucune description spécifique.'}
                          </p>
                          <div className="mt-1 flex items-center gap-3 text-[11px] text-ink-faint">
                            <span>
                              {userCount === 0
                                ? 'Aucun collaborateur affecté'
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
                        {!isRootDirection && !r.is_system && !['direction', 'chef_atelier', 'magasinier', 'travailleur'].includes(r.id) ? (
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
          <Card className="shadow-card relative isolate overflow-hidden">
            <CardHeader className="border-b border-line pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base font-semibold text-ink">
                    <ShieldCheck size={18} className="text-green" /> Matrice de contrôle d’accès (RBAC)
                  </CardTitle>
                  <CardDescription className="text-xs text-ink-soft">
                    Configurez précisément les privilèges accordés à chaque rôle métier. Le rôle Direction est super-administrateur permanent.
                  </CardDescription>
                </div>
                <div className="text-xs font-medium text-ink-soft">
                  {displayGroups.reduce((acc, g) => acc + g.actions.length, 0)} permission{displayGroups.reduce((acc, g) => acc + g.actions.length, 0) > 1 ? 's' : ''} configurée{displayGroups.reduce((acc, g) => acc + g.actions.length, 0) > 1 ? 's' : ''}
                </div>
              </div>
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
                  <div className="max-h-[calc(100vh-280px)] min-h-[380px] overflow-y-auto overflow-x-auto scroll-thin relative border-b border-line">
                    <table className="w-full min-w-[680px] text-left border-separate border-spacing-0">
                      <thead className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                        <tr>
                          <th className="sticky left-0 top-0 z-20 bg-surface-2 px-4 py-3 border-r border-b border-line min-w-[200px] sm:min-w-[260px] shadow-xs">
                            <div className="flex items-center justify-between">
                              <span>Module &amp; Action</span>
                              <span className="text-[10px] lowercase font-normal text-ink-faint">({permMatrix.actions.length} permissions)</span>
                            </div>
                          </th>
                          {permMatrix.roles.map((role) => {
                            const isDir = role === 'direction';
                            const roleDetail = availableRoles.find((ar) => ar.id === role);
                            const isSystem = ['direction', 'magasinier', 'chef_atelier', 'travailleur'].includes(role) || Boolean(roleDetail?.is_system);
                            const roleName = roleDetail?.name ?? ROLE_LABEL[role] ?? role;

                            return (
                              <th key={role} className="sticky top-0 z-10 bg-surface-2 px-3 py-3 text-center min-w-[130px] border-r border-b border-line/60 align-top shadow-xs">
                                <div className="flex flex-col items-center gap-1.5">
                                  <div className="flex items-center gap-1">
                                    <span
                                      className={cx(
                                        'inline-flex items-center rounded-chip border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap',
                                        (ROLE_THEME[role] ?? DEFAULT_ROLE_THEME).bg,
                                      )}
                                      title={roleDetail?.description || roleName}
                                    >
                                      {roleName}
                                    </span>
                                    {!isSystem && roleDetail && (
                                      <div className="flex items-center gap-0.5">
                                        <button
                                          type="button"
                                          title="Modifier ce rôle"
                                          onClick={() => openEditRoleModal(roleDetail)}
                                          className="rounded p-0.5 text-ink-faint hover:text-ink hover:bg-paper-2 transition-colors"
                                        >
                                          <Pencil size={11} />
                                        </button>
                                        <button
                                          type="button"
                                          title="Supprimer ce rôle"
                                          onClick={() => setDeleteRoleConfirm(roleDetail)}
                                          className="rounded p-0.5 text-ink-faint hover:text-red hover:bg-paper-2 transition-colors"
                                        >
                                          <Trash2 size={11} />
                                        </button>
                                      </div>
                                    )}
                                  </div>

                                  {isDir ? (
                                    <span className="text-[10px] text-green font-medium">Accès total permanent</span>
                                  ) : (
                                    <div className="flex items-center gap-1 text-[10px]">
                                      <button
                                        type="button"
                                        onClick={() => applyColumnPreset(role, 'view_only')}
                                        title="Accorder uniquement les droits de consultation (Lecture seule)"
                                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 bg-paper hover:bg-paper-2 border border-line text-ink-soft hover:text-ink text-[10px] font-medium transition-colors shadow-2xs"
                                      >
                                        <Eye size={11} className="text-blue-500 shrink-0" />
                                        <span>Lecture</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => applyColumnPreset(role, 'all')}
                                        title="Tout cocher pour ce rôle"
                                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 bg-paper hover:bg-paper-2 border border-line text-ink-soft hover:text-ink text-[10px] font-medium transition-colors shadow-2xs"
                                      >
                                        <CheckCheck size={11} className="text-emerald-500 shrink-0" />
                                        <span>Tout</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => applyColumnPreset(role, 'none')}
                                        title="Tout décocher pour ce rôle"
                                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 bg-paper hover:bg-paper-2 border border-line text-ink-soft hover:text-ink text-[10px] font-medium transition-colors shadow-2xs"
                                      >
                                        <Ban size={11} className="text-rose-500 shrink-0" />
                                        <span>Rien</span>
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody className="text-sm">
                        {displayGroups.length === 0 ? (
                          <tr>
                            <td colSpan={permMatrix.roles.length + 1} className="py-12 text-center text-xs text-ink-soft">
                              Aucune permission ne correspond au filtre ou à la recherche "{permSearch}".
                            </td>
                          </tr>
                        ) : (
                          displayGroups.map((group) => (
                          <Fragment key={group.label}>
                            <tr className="bg-paper-2/80 font-semibold text-ink text-xs uppercase tracking-wide">
                              <td colSpan={permMatrix.roles.length + 1} className="sticky left-0 px-4 py-2 text-ink-soft bg-paper-2/95 backdrop-blur-xs font-bold border-b border-line/60">
                                {group.label}
                              </td>
                            </tr>
                            {group.actions.map((action) => {
                              const meta = permMatrix.actions.find((a) => a.action === action);
                              const isView = meta?.kind === 'view' || action.endsWith('.view');
                              return (
                                <tr key={action} className="hover:bg-paper-2/30 transition-colors group">
                                  <td className="sticky left-0 bg-surface group-hover:bg-paper-2/50 px-4 py-2.5 border-r border-b border-line/40 z-10 min-w-[200px] sm:min-w-[260px]">
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="min-w-0 pr-2">
                                        <div className="font-medium text-ink text-xs truncate">{meta?.label ?? action}</div>
                                        <div className="font-mono text-[10px] text-ink-faint">{action}</div>
                                      </div>
                                      <span
                                        className={cx(
                                          'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider shrink-0 border select-none',
                                          isView
                                            ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
                                            : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                                        )}
                                        title={isView ? 'Droit de consultation sans modification' : 'Action opérationnelle (création, modification, déplacement ou suppression)'}
                                      >
                                        {isView ? (
                                          <>
                                            <Eye size={10} /> Consultation
                                          </>
                                        ) : (
                                          <>
                                            <Zap size={10} /> Action
                                          </>
                                        )}
                                      </span>
                                    </div>
                                  </td>
                                  {permMatrix.roles.map((role) => {
                                    if (role === 'direction') {
                                      return (
                                        <td key={role} className="px-3 py-2 text-center min-w-[110px] border-r border-b border-line/40">
                                          <span
                                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-green/30 bg-green/10 text-green"
                                            title="Privilège garanti pour la Direction"
                                          >
                                            <Check size={14} />
                                          </span>
                                        </td>
                                      );
                                    }

                                    const isChecked = !!permDraft[action]?.[role];
                                    const roleName = availableRoles.find((ar) => ar.id === role)?.name ?? ROLE_LABEL[role] ?? role;
                                    return (
                                      <td key={role} className="px-3 py-2 text-center min-w-[110px] border-r border-b border-line/40">
                                        <button
                                          type="button"
                                          role="checkbox"
                                          aria-checked={isChecked}
                                          onClick={() => togglePerm(action, role)}
                                          className={cx(
                                            'inline-flex h-8 w-8 items-center justify-center rounded-md border text-xs font-bold transition-all shadow-xs active:scale-90',
                                            isChecked
                                              ? isView
                                                ? 'border-blue-500 bg-blue-600 text-white shadow-xs'
                                                : 'border-green bg-green text-white shadow-xs'
                                              : 'border-line bg-surface text-ink-faint hover:bg-paper-2',
                                          )}
                                          title={`${isChecked ? 'Révoquer' : 'Accorder'} ${meta?.label ?? action} pour ${roleName}`}
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
                        )))}
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
        </TabsContent>}

        {/* =========================================================================
            TAB 3: KIOSQUE & POINTAGE (Apple / Linear Grade Redesign)
        ========================================================================= */}
        {canViewKiosk && <TabsContent value="kiosk" className="space-y-6">
          {/* En-tête de section */}
          <div className="border-b border-line pb-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-soft text-amber">
                <Clock size={16} />
              </span>
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-ink">
                Cadence, Horaires &amp; Terminaux d'Atelier
              </h2>
            </div>
            <p className="text-xs text-ink-soft mt-1">
              Gérez les plages d'embauche, les verrous stricts d'accès et le parc de tablettes du CFTM.
            </p>
          </div>

          {/* SOUS-ONGLET 1 : HORAIRES & VERROUS */}
          {kioskSubTab === 'horaires' && canViewSettings && (
            <fieldset disabled={!canEditSettings} className="min-w-0 border-0 p-0">
            <div className="space-y-6">
              {/* Le Ruban Chronologique Visuel de la Journée */}
              <div className="rounded-2xl border border-line bg-gradient-to-r from-paper to-paper-2 p-4 sm:p-5 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-line pb-3 mb-4">
                  <div className="flex items-center gap-2">
                    <span className="flex h-2 w-2 rounded-full bg-amber animate-pulse" />
                    <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                      Ruban Chronologique Journalier CFTM
                    </span>
                  </div>
                  <span className="text-[11px] text-ink-faint">
                    {effectiveSettings?.meal_schedule_mode === 'delayed_13h' ? 'Mode Repas Décalé actif (13h00)' : 'Mode Standard actif (12h00)'}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-xl border border-line bg-surface p-3 transition-all hover:border-amber/30">
                    <div className="flex items-center justify-between text-[11px] text-ink-soft font-medium">
                      <span>1. Matin</span>
                      <Sun size={13} className="text-amber" />
                    </div>
                    <p className="mt-1 font-mono text-base font-bold text-ink">{effectiveSettings?.opening_time || '07:30'}</p>
                    <p className="text-[10px] text-ink-faint mt-0.5">Accueil dès {effectiveSettings?.early_checkin_time || '07:25'}</p>
                  </div>

                  <div className="rounded-xl border border-line bg-surface p-3 transition-all hover:border-amber/30">
                    <div className="flex items-center justify-between text-[11px] text-ink-soft font-medium">
                      <span>2. Verrou Matin</span>
                      <Lock size={13} className="text-red" />
                    </div>
                    <p className="mt-1 font-mono text-base font-bold text-red">{effectiveSettings?.morning_lockout_time || '10:00'}</p>
                    <p className="text-[10px] text-amber mt-0.5">Retard dès {effectiveSettings?.late_threshold_time || '08:00'}</p>
                  </div>

                  <div className="rounded-xl border border-line bg-surface p-3 transition-all hover:border-blue/30">
                    <div className="flex items-center justify-between text-[11px] text-ink-soft font-medium">
                      <span>3. Pause Repas</span>
                      <Utensils size={13} className="text-blue" />
                    </div>
                    <p className="mt-1 font-mono text-base font-bold text-ink">
                      {effectiveSettings?.meal_schedule_mode === 'delayed_13h'
                        ? (effectiveSettings?.break_delayed_start || '13:00')
                        : (effectiveSettings?.break_normal_start || '12:00')}
                    </p>
                    <p className="text-[10px] text-ink-faint mt-0.5">
                      Reprise à {effectiveSettings?.meal_schedule_mode === 'delayed_13h'
                        ? (effectiveSettings?.resume_delayed_start || '14:00')
                        : (effectiveSettings?.resume_normal_start || '13:00')}
                    </p>
                  </div>

                  <div className="rounded-xl border border-line bg-surface p-3 transition-all hover:border-emerald/30">
                    <div className="flex items-center justify-between text-[11px] text-ink-soft font-medium">
                      <span>4. Clôture</span>
                      <Moon size={13} className="text-emerald" />
                    </div>
                    <p className="mt-1 font-mono text-base font-bold text-ink">{effectiveSettings?.day_cutoff_time || '17:00'}</p>
                    <p className="text-[10px] text-ink-faint mt-0.5">Départ dès {effectiveSettings?.closing_time || '16:30'}</p>
                  </div>
                </div>
              </div>

              {/* 3 Cartes Séquentielles Élégantes */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Séquence 1 : Matin */}
                <Card className="shadow-xs border border-line bg-surface flex flex-col justify-between">
                  <CardHeader className="border-b border-line pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-soft text-amber">
                          <Sun size={14} />
                        </span>
                        <CardTitle className="text-sm font-bold text-ink">1. Embauche Matin</CardTitle>
                      </div>
                      <span className="text-[10px] font-mono font-medium rounded-full bg-paper-2 px-2 py-0.5 text-ink-soft">
                        Phase 01
                      </span>
                    </div>
                    <CardDescription className="text-[11px] text-ink-soft mt-1">
                      Accueil, embauche officielle, seuil de retard et verrouillage de l'accès.
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="space-y-4 p-4 text-xs">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-ink-soft font-medium">Prise d'effet officielle</label>
                        <span className="text-[10px] text-ink-faint">Nominale</span>
                      </div>
                      <input
                        type="time"
                        value={effectiveSettings?.opening_time || '07:30'}
                        onChange={(e) => updateSettingsDraft({ opening_time: e.target.value })}
                        className="h-10 w-full rounded-xl border border-line bg-paper-2 px-3 font-mono text-sm font-semibold text-ink focus:border-amber focus:bg-surface focus:outline-none transition-colors"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-ink-soft font-medium block mb-1 text-[11px]">Accueil anticipé</label>
                        <input
                          type="time"
                          value={effectiveSettings?.early_checkin_time || '07:25'}
                          onChange={(e) => updateSettingsDraft({ early_checkin_time: e.target.value })}
                          className="h-9 w-full rounded-xl border border-line bg-paper-2 px-2.5 font-mono text-xs font-semibold text-ink focus:border-amber focus:bg-surface focus:outline-none transition-colors"
                        />
                        <span className="text-[10px] text-ink-faint mt-0.5 block">Effet à {effectiveSettings?.opening_time || '07:30'}</span>
                      </div>

                      <div>
                        <label className="text-ink-soft font-medium block mb-1 text-[11px]">Seuil de retard</label>
                        <input
                          type="time"
                          value={effectiveSettings?.late_threshold_time || '08:00'}
                          onChange={(e) => updateSettingsDraft({ late_threshold_time: e.target.value })}
                          className="h-9 w-full rounded-xl border border-amber/30 bg-paper-2 px-2.5 font-mono text-xs font-semibold text-amber focus:border-amber focus:bg-surface focus:outline-none transition-colors"
                        />
                        <span className="text-[10px] text-amber mt-0.5 block">30 mn de battement</span>
                      </div>
                    </div>

                    <div className="rounded-xl border border-red/20 bg-red-wash/20 p-3">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-red font-semibold text-[11px] flex items-center gap-1.5">
                          <Lock size={12} />
                          Verrou d'accès CFTM
                        </label>
                        <span className="text-[10px] text-red font-mono font-bold">Sécurité</span>
                      </div>
                      <input
                        type="time"
                        value={effectiveSettings?.morning_lockout_time || '10:00'}
                        onChange={(e) => updateSettingsDraft({ morning_lockout_time: e.target.value })}
                        className="h-9 w-full rounded-xl border border-red/30 bg-surface px-2.5 font-mono text-xs font-bold text-red focus:border-red focus:outline-none transition-colors"
                      />
                      <span className="text-[10px] text-ink-faint mt-1 block leading-tight">
                        Pointage direct bloqué après cette heure. Nécessite l'autorisation du surveillant.
                      </span>
                    </div>
                  </CardContent>
                </Card>

                {/* Séquence 2 : Méridienne & Repas */}
                <Card className="shadow-xs border border-line bg-surface flex flex-col justify-between">
                  <CardHeader className="border-b border-line pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-soft text-blue">
                          <Utensils size={14} />
                        </span>
                        <CardTitle className="text-sm font-bold text-ink">2. Méridienne &amp; Repas</CardTitle>
                      </div>
                      <span className="text-[10px] font-mono font-medium rounded-full bg-paper-2 px-2 py-0.5 text-ink-soft">
                        Phase 02
                      </span>
                    </div>
                    <CardDescription className="text-[11px] text-ink-soft mt-1">
                      Gestion des temps de repas et commutateur pour jours festifs décalés.
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="space-y-4 p-4 text-xs">
                    {/* Commutateur iOS élégant */}
                    <div>
                      <label className="text-ink-soft font-medium block mb-1.5">Régime horaire du repas :</label>
                      <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-line bg-paper-2 p-1">
                        <button
                          type="button"
                          onClick={() => updateSettingsDraft({ meal_schedule_mode: 'normal_12h' })}
                          className={cx(
                            'py-2 rounded-lg text-xs font-bold transition-all text-center cursor-pointer',
                            (effectiveSettings?.meal_schedule_mode ?? 'normal_12h') === 'normal_12h'
                              ? 'bg-surface text-ink shadow-xs border border-line'
                              : 'text-ink-soft hover:text-ink',
                          )}
                        >
                          Standard (12h00)
                        </button>
                        <button
                          type="button"
                          onClick={() => updateSettingsDraft({ meal_schedule_mode: 'delayed_13h' })}
                          className={cx(
                            'py-2 rounded-lg text-xs font-bold transition-all text-center cursor-pointer',
                            effectiveSettings?.meal_schedule_mode === 'delayed_13h'
                              ? 'bg-amber text-amber-fg shadow-xs font-bold'
                              : 'text-ink-soft hover:text-ink',
                          )}
                        >
                          Décalé (13h00)
                        </button>
                      </div>
                    </div>

                    {(effectiveSettings?.meal_schedule_mode ?? 'normal_12h') === 'normal_12h' ? (
                      <>
                        <div className="grid grid-cols-2 gap-2.5">
                          <div>
                            <label className="text-ink-soft font-medium block mb-1 text-[11px]">Départ pause</label>
                            <input
                              type="time"
                              value={effectiveSettings?.break_normal_start || '12:00'}
                              onChange={(e) => updateSettingsDraft({ break_normal_start: e.target.value, break_start_time: e.target.value })}
                              className="h-9 w-full rounded-xl border border-line bg-paper-2 px-2.5 font-mono text-xs font-semibold text-ink focus:border-amber focus:bg-surface focus:outline-none transition-colors"
                            />
                            <span className="text-[10px] text-ink-faint mt-0.5 block">jusqu'à {effectiveSettings?.break_normal_end || '12:25'}</span>
                          </div>

                          <div>
                            <label className="text-ink-soft font-medium block mb-1 text-[11px]">Reprise atelier</label>
                            <input
                              type="time"
                              value={effectiveSettings?.resume_normal_start || '13:00'}
                              onChange={(e) => updateSettingsDraft({ resume_normal_start: e.target.value, break_end_time: e.target.value })}
                              className="h-9 w-full rounded-xl border border-line bg-paper-2 px-2.5 font-mono text-xs font-semibold text-ink focus:border-amber focus:bg-surface focus:outline-none transition-colors"
                            />
                            <span className="text-[10px] text-ink-faint mt-0.5 block">jusqu'à {effectiveSettings?.resume_normal_end || '13:10'}</span>
                          </div>
                        </div>

                        <div className="rounded-xl border border-red/20 bg-red-wash/20 p-3">
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-red font-semibold text-[11px] flex items-center gap-1.5">
                              <Lock size={12} />
                              Verrou reprise normale
                            </label>
                            <span className="text-[10px] text-red font-mono font-bold">14h00</span>
                          </div>
                          <input
                            type="time"
                            value={effectiveSettings?.resume_lockout_time || '14:00'}
                            onChange={(e) => updateSettingsDraft({ resume_lockout_time: e.target.value })}
                            className="h-9 w-full rounded-xl border border-red/30 bg-surface px-2.5 font-mono text-xs font-bold text-red focus:border-red focus:outline-none transition-colors"
                          />
                          <span className="text-[10px] text-ink-faint mt-1 block">Accès verrouillé si retour non pointé à 14h00</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 gap-2.5">
                          <div>
                            <label className="text-amber font-medium block mb-1 text-[11px]">Départ pause décalée</label>
                            <input
                              type="time"
                              value={effectiveSettings?.break_delayed_start || '13:00'}
                              onChange={(e) => updateSettingsDraft({ break_delayed_start: e.target.value, break_start_time: e.target.value })}
                              className="h-9 w-full rounded-xl border border-amber/30 bg-paper-2 px-2.5 font-mono text-xs font-semibold text-amber focus:border-amber focus:bg-surface focus:outline-none transition-colors"
                            />
                            <span className="text-[10px] text-ink-faint mt-0.5 block">jusqu'à {effectiveSettings?.break_delayed_end || '13:25'}</span>
                          </div>

                          <div>
                            <label className="text-amber font-medium block mb-1 text-[11px]">Reprise décalée</label>
                            <input
                              type="time"
                              value={effectiveSettings?.resume_delayed_start || '14:00'}
                              onChange={(e) => updateSettingsDraft({ resume_delayed_start: e.target.value, break_end_time: e.target.value })}
                              className="h-9 w-full rounded-xl border border-amber/30 bg-paper-2 px-2.5 font-mono text-xs font-semibold text-amber focus:border-amber focus:bg-surface focus:outline-none transition-colors"
                            />
                            <span className="text-[10px] text-ink-faint mt-0.5 block">jusqu'à {effectiveSettings?.resume_delayed_end || '14:10'}</span>
                          </div>
                        </div>

                        <div className="rounded-xl border border-red/20 bg-red-wash/20 p-3">
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-red font-semibold text-[11px] flex items-center gap-1.5">
                              <Lock size={12} />
                              Verrou reprise décalée
                            </label>
                            <span className="text-[10px] text-red font-mono font-bold">14h30</span>
                          </div>
                          <input
                            type="time"
                            value={effectiveSettings?.resume_delayed_lockout_time || '14:30'}
                            onChange={(e) => updateSettingsDraft({ resume_delayed_lockout_time: e.target.value })}
                            className="h-9 w-full rounded-xl border border-red/30 bg-surface px-2.5 font-mono text-xs font-bold text-red focus:border-red focus:outline-none transition-colors"
                          />
                          <span className="text-[10px] text-ink-faint mt-1 block">Accès verrouillé après 14h30</span>
                        </div>
                      </>
                    )}

                    <div className="rounded-lg bg-paper-2 px-2.5 py-1.5 text-[11px] text-ink-faint flex items-center gap-1.5">
                      <CheckCircle2 size={13} className="text-emerald" />
                      <span>Dispense de selfie active pour la pause</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Séquence 3 : Soir & Clôture */}
                <Card className="shadow-xs border border-line bg-surface flex flex-col justify-between">
                  <CardHeader className="border-b border-line pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-soft text-emerald">
                          <Moon size={14} />
                        </span>
                        <CardTitle className="text-sm font-bold text-ink">3. Clôture &amp; Sortie</CardTitle>
                      </div>
                      <span className="text-[10px] font-mono font-medium rounded-full bg-paper-2 px-2 py-0.5 text-ink-soft">
                        Phase 03
                      </span>
                    </div>
                    <CardDescription className="text-[11px] text-ink-soft mt-1">
                      Fin de vacation des artisans et coupure journalière automatique.
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="space-y-4 p-4 text-xs">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-ink-soft font-medium">Début sortie atelier</label>
                        <span className="text-[10px] text-ink-faint">Selfie requis</span>
                      </div>
                      <input
                        type="time"
                        value={effectiveSettings?.closing_time || '16:30'}
                        onChange={(e) => updateSettingsDraft({ closing_time: e.target.value })}
                        className="h-10 w-full rounded-xl border border-line bg-paper-2 px-3 font-mono text-sm font-semibold text-ink focus:border-amber focus:bg-surface focus:outline-none transition-colors"
                      />
                    </div>

                    <div>
                      <label className="text-ink-soft font-medium block mb-1 text-[11px]">Fin de fenêtre de sortie</label>
                      <input
                        type="time"
                        value={effectiveSettings?.closing_end_time || '16:40'}
                        onChange={(e) => updateSettingsDraft({ closing_end_time: e.target.value })}
                        className="h-9 w-full rounded-xl border border-line bg-paper-2 px-2.5 font-mono text-xs font-semibold text-ink focus:border-amber focus:bg-surface focus:outline-none transition-colors"
                      />
                      <span className="text-[10px] text-ink-faint mt-0.5 block">Tolérance de pointage départ</span>
                    </div>

                    <div className="rounded-xl border border-line bg-paper-2 p-3">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-ink font-semibold text-[11px] flex items-center gap-1.5">
                          <Lock size={12} className="text-red" />
                          Clôture système journalier
                        </label>
                        <span className="text-[10px] text-ink font-mono font-bold">17h00</span>
                      </div>
                      <input
                        type="time"
                        value={effectiveSettings?.day_cutoff_time || '17:00'}
                        onChange={(e) => updateSettingsDraft({ day_cutoff_time: e.target.value })}
                        className="h-9 w-full rounded-xl border border-line bg-surface px-2.5 font-mono text-xs font-bold text-ink focus:border-amber focus:outline-none transition-colors"
                      />
                      <span className="text-[10px] text-ink-faint mt-1 block">
                        Clôture automatique par le système. Tout oubli génère une alerte non-pointé.
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Raccourci de réinitialisation canonique CFTM */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-dashed border-line p-3.5 bg-surface/50 text-xs">
                <span className="text-ink-soft">
                  Besoin de revenir aux créneaux nominaux du monastère (07h25 → 17h00) ?
                </span>
                <button
                  type="button"
                  onClick={() => {
                    updateSettingsDraft({
                      early_checkin_time: '07:25',
                      opening_time: '07:30',
                      late_threshold_time: '08:00',
                      morning_lockout_time: '10:00',
                      meal_schedule_mode: 'normal_12h',
                      break_normal_start: '12:00',
                      break_normal_end: '12:25',
                      resume_normal_start: '13:00',
                      resume_normal_end: '13:10',
                      resume_lockout_time: '14:00',
                      break_delayed_start: '13:00',
                      break_delayed_end: '13:25',
                      resume_delayed_start: '14:00',
                      resume_delayed_end: '14:10',
                      resume_delayed_lockout_time: '14:30',
                      closing_time: '16:30',
                      closing_end_time: '16:40',
                      day_cutoff_time: '17:00',
                    });
                    toast('Créneaux officiels CFTM appliqués au brouillon.', 'info');
                  }}
                  className="font-semibold text-amber hover:underline self-start sm:self-auto cursor-pointer"
                >
                  Rétablir la grille standard CFTM
                </button>
              </div>
            </div>
            </fieldset>
          )}

          {/* SOUS-ONGLET 2 : BORNES & TERMINAUX */}
          {kioskSubTab === 'bornes' && canManageTerminals && (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="rounded-xl border border-line bg-surface px-3 py-1.5 text-xs">
                  <span className="text-ink-soft">Total tablettes : </span>
                  <strong className="text-ink font-mono">{terminals.length}</strong>
                </div>
                <div className="rounded-xl border border-green/20 bg-green-wash/40 px-3 py-1.5 text-xs text-green">
                  <span>Actives : </span>
                  <strong className="font-mono">{terminals.filter((t) => t.active).length}</strong>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {terminals.map((terminal) => (
                  <div
                    key={terminal.id}
                    className="rounded-2xl border border-line bg-surface p-4 shadow-xs transition-all hover:border-line-strong flex flex-col justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-soft text-blue">
                            <Smartphone size={16} />
                          </span>
                          <div>
                            <p className="font-bold text-sm text-ink">{terminal.name}</p>
                            <span
                              className={cx(
                                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold mt-0.5',
                                terminal.active
                                  ? 'bg-green-wash text-green border border-green/20'
                                  : 'bg-paper-2 text-ink-faint border border-line',
                              )}
                            >
                              <span className={cx('h-1.5 w-1.5 rounded-full', terminal.active ? 'bg-green' : 'bg-ink-faint')} />
                              {terminal.active ? 'Borne Active' : 'Borne Inactive'}
                            </span>
                          </div>
                        </div>

                        <Button
                          size="sm"
                          variant={terminal.active ? 'outline-danger' : 'secondary'}
                          onClick={() => void toggleTerminal(terminal)}
                        >
                          {terminal.active ? 'Désactiver' : 'Activer'}
                        </Button>
                      </div>

                      <div className="mt-3 rounded-xl border border-line bg-paper-2 p-2.5 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-ink-soft text-[11px]">Identifiant Borne :</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(terminal.id, terminal.id)}
                            className="inline-flex items-center gap-1 font-mono text-[11px] text-ink font-semibold bg-surface px-2 py-0.5 rounded border border-line hover:bg-paper-2 transition-colors cursor-pointer"
                            title="Copier le token"
                          >
                            {terminal.id}
                            {copiedTerminalId === terminal.id ? (
                              <CheckCheck size={12} className="text-green" />
                            ) : (
                              <Copy size={12} className="text-ink-faint" />
                            )}
                          </button>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-ink-soft">
                          <span>Pointages reçus aujourd'hui :</span>
                          <span className="font-mono font-bold text-ink">{terminal.punches_today}</span>
                        </div>
                        {terminal.last_used ? (
                          <div className="flex items-center justify-between text-[11px] text-ink-faint">
                            <span>Dernier usage :</span>
                            <span>{formatDateTime(terminal.last_used)}</span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}

                {terminals.length === 0 && (
                  <div className="col-span-full rounded-2xl border border-dashed border-line p-8 text-center text-xs text-ink-faint">
                    Aucune borne enregistrée pour le moment. Cliquez sur « Enregistrer une nouvelle borne ».
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SOUS-ONGLET 3 : RÈGLES & TOLÉRANCE */}
          {kioskSubTab === 'regles' && canViewSettings && (
            <fieldset disabled={!canEditSettings} className="min-w-0 border-0 p-0">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Jours Ouvrés & Tolérances */}
              <Card className="shadow-xs border border-line bg-surface">
                <CardHeader className="border-b border-line pb-3">
                  <CardTitle className="text-sm font-bold text-ink flex items-center gap-2">
                    <CalendarDays size={16} className="text-amber" />
                    Jours de Travail &amp; Tolérance de Retard
                  </CardTitle>
                  <CardDescription className="text-[11px] text-ink-soft">
                    Définition des jours d'ouverture d'atelier et marge de retard acceptée.
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-5 p-5 text-xs">
                  <div>
                    <label className="text-ink-soft font-medium block mb-2">
                      Jours de travail officiels :
                    </label>
                    <div className="grid grid-cols-7 gap-1.5">
                      {WEEKDAYS_ORDER.map((day) => {
                        const isWork = effectiveSettings?.workdays.includes(day) ?? false;
                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => toggleWorkday(day)}
                            className={cx(
                              'flex flex-col items-center justify-center rounded-xl border py-2.5 text-xs font-semibold transition-all shadow-xs cursor-pointer',
                              isWork
                                ? 'border-amber bg-amber-wash text-amber'
                                : 'border-line bg-paper-2 text-ink-faint hover:bg-surface',
                            )}
                          >
                            <span>{(WORKDAY_LABEL[day] ?? '').slice(0, 3)}</span>
                            <span className={cx('mt-1 h-1.5 w-1.5 rounded-full', isWork ? 'bg-amber' : 'bg-transparent')} />
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-ink-soft font-medium">Tolérance de retard autorisée (avec motif)</label>
                      <span className="font-mono text-xs font-bold text-amber">
                        {effectiveSettings?.tolerance_minutes ?? 0} min
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={60}
                      step={5}
                      value={effectiveSettings?.tolerance_minutes ?? 0}
                      onChange={(e) => updateSettingsDraft({ tolerance_minutes: Number(e.target.value) })}
                      className="w-full accent-amber"
                    />
                    <p className="text-[11px] text-ink-faint mt-1">
                      Au-delà de cette tolérance, le travailleur doit sélectionner un motif justificatif sur la tablette.
                    </p>
                  </div>

                  <Separator />

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-ink-soft font-medium block mb-1">Affichage fiche borne (sec)</label>
                      <input
                        type="number"
                        min={3}
                        max={60}
                        value={effectiveSettings?.card_display_seconds ?? 5}
                        onChange={(e) => updateSettingsDraft({ card_display_seconds: Number(e.target.value) })}
                        className="h-9 w-full rounded-xl border border-line bg-paper-2 px-3 text-xs font-semibold text-ink focus:border-amber focus:bg-surface focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-ink-soft font-medium block mb-1">Rétention photos (jours)</label>
                      <input
                        type="number"
                        min={7}
                        max={365}
                        value={effectiveSettings?.selfie_retention_days ?? 30}
                        onChange={(e) => updateSettingsDraft({ selfie_retention_days: Number(e.target.value) })}
                        className="h-9 w-full rounded-xl border border-line bg-paper-2 px-3 text-xs font-semibold text-ink focus:border-amber focus:bg-surface focus:outline-none"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Motifs de Retard */}
              <Card className="shadow-xs border border-line bg-surface">
                <CardHeader className="border-b border-line pb-3">
                  <CardTitle className="text-sm font-bold text-ink flex items-center gap-2">
                    <Sliders size={16} className="text-amber" />
                    Motifs de Retard Configurés
                  </CardTitle>
                  <CardDescription className="text-[11px] text-ink-soft">
                    Liste des options sélectionnables par les ouvriers en cas de retard à l'embauche.
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4 p-5 text-xs">
                  <div className="flex flex-wrap gap-2">
                    {(effectiveSettings?.late_motifs ?? []).map((motif) => (
                      <span
                        key={motif}
                        className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper-2 px-3 py-1 text-xs text-ink font-medium shadow-xs"
                      >
                        {motif}
                        <button
                          type="button"
                          onClick={() => removeMotif(motif)}
                          className="rounded-full text-ink-faint hover:text-red hover:bg-red-wash p-0.5 transition-colors cursor-pointer"
                          title={`Retirer « ${motif} »`}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>

                  <div className="flex gap-2 pt-2">
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
                      placeholder="Ajouter un motif (ex: Pluie abondante)…"
                      className="h-10 flex-1 rounded-xl border border-line bg-paper-2 px-3 text-xs text-ink placeholder:text-ink-faint focus:border-amber focus:bg-surface focus:outline-none"
                    />
                    <Button size="sm" variant="primary" onClick={addMotif} disabled={!motifDraft.trim()}>
                      Ajouter
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
            </fieldset>
          )}

          {/* Barre Flottante d'Enregistrement (Floating Action Dock façon Linear / Apple) */}
          {hasUnsavedSettings && canEditSettings && (
            <div className="sticky bottom-4 z-20 mx-auto max-w-xl rounded-2xl border border-amber/40 bg-surface/95 backdrop-blur-xl p-3 shadow-xl transition-all animate-in fade-in slide-in-from-bottom-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-xs font-semibold text-ink pl-1">
                <span className="h-2.5 w-2.5 rounded-full bg-amber animate-pulse shrink-0" />
                <span className="truncate">Modifications d'horaires prêtes à être appliquées</span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={savingSettings}
                  onClick={resetSettingsDraft}
                >
                  Annuler
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={savingSettings}
                  onClick={() => void handleSaveSettings()}
                  icon={savingSettings ? <Spinner className="h-3.5 w-3.5" /> : <Save size={14} />}
                >
                  Enregistrer
                </Button>
              </div>
            </div>
          )}
        </TabsContent>}

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
                <div className="flex items-center gap-4">
                  <div
                    onClick={() => {
                      setProfilePhotoTarget({ type: 'self', current: user.photo_path, name: user.display_name });
                      setProfilePhotoOpen(true);
                    }}
                    className="group relative grid h-16 w-16 place-items-center rounded-full bg-blue-wash text-blue font-bold text-base border-2 border-blue/30 cursor-pointer overflow-hidden shadow-xs hover:border-amber transition-all"
                    title="Cliquer pour changer votre photo de profil"
                  >
                    {user.photo_path ? (
                      <img src={user.photo_path} alt={user.display_name} className="h-full w-full object-cover" />
                    ) : (
                      roleInitials(user.display_name)
                    )}
                    <span className="absolute inset-0 bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Camera size={20} />
                    </span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-ink">{user.display_name}</h3>
                    <p className="font-mono text-xs text-ink-soft">@{user.login}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setProfilePhotoTarget({ type: 'self', current: user.photo_path, name: user.display_name });
                        setProfilePhotoOpen(true);
                      }}
                      className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-amber hover:underline"
                    >
                      <Camera size={13} /> Modifier ma photo de profil
                    </button>
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
                  <PasswordInput
                    value={pw.current}
                    onChange={(e) => setPw({ ...pw, current: e.target.value })}
                    className="h-10 w-full rounded-btn border border-line-strong bg-surface px-3 text-sm text-ink focus:border-amber focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-soft">Nouveau mot de passe</label>
                  <PasswordInput
                    value={pw.next}
                    onChange={(e) => setPw({ ...pw, next: e.target.value })}
                    className="h-10 w-full rounded-btn border border-line-strong bg-surface px-3 text-sm text-ink focus:border-amber focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-soft">Confirmer le nouveau mot de passe</label>
                  <PasswordInput
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
        {canUseBackups && <TabsContent value="sauvegardes" className="space-y-6">
          {/* Quick Metrics for Backups */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Card className="p-4 shadow-card">
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-medium uppercase tracking-wider text-ink-faint">Instantanés Stockés</p>
                <Database size={16} className="text-blue" />
              </div>
              <p className="mt-1 text-2xl font-semibold text-ink">{backups.length}</p>
              <p className="mt-1 text-[10px] text-ink-faint">Archives cloud chiffrées</p>
            </Card>

            <Card className="p-4 shadow-card">
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-medium uppercase tracking-wider text-ink-faint">Volume Cloud Total</p>
                <span className="text-xs font-mono font-bold text-ink-soft">Ko/Mo</span>
              </div>
              <p className="mt-1 text-2xl font-semibold text-green">
                {formatBytes(backups.reduce((acc, b) => acc + (b.size || 0), 0))}
              </p>
              <p className="mt-1 text-[10px] text-ink-faint">Stockage Vercel Blob compressé</p>
            </Card>

            <Card className="p-4 shadow-card">
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-medium uppercase tracking-wider text-ink-faint">Dernier Instantané</p>
                <span className="h-2 w-2 rounded-full bg-green" />
              </div>
              <p className="mt-1 text-base font-semibold text-ink truncate">
                {backups[0] ? formatHumanBackupLabel(backups[0].pathname, backups[0].uploadedAt).title.replace('Instantané du ', '') : 'Aucun'}
              </p>
              <p className="mt-1 text-[10px] text-ink-faint">
                {backups.length > 0 ? `Rétention active (${retentionDays} jours)` : 'Planifié à 03:00 UTC'}
              </p>
            </Card>
          </div>

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
                <Button
                  size="sm"
                  variant="danger"
                  className="bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30 hover:bg-red-500 hover:text-white font-semibold transition-all shadow-xs"
                  disabled={backupBusy || backups.length === 0}
                  icon={<Trash2 size={14} />}
                  onClick={() => setPurgeConfirmOpen(true)}
                >
                  Purger l'historique
                </Button>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              <div className="px-5 py-3 border-b border-line bg-paper-2/40 text-xs font-semibold text-ink flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span>Archives disponibles ({backups.length})</span>
                  <span className="text-[11px] text-ink-faint">· Rétention {retentionDays} jours</span>
                </div>
                {backups.length > 0 && (
                  <span className="text-[11px] text-ink-soft">
                    {backups.length} fichier(s) prêt(s) au téléchargement
                  </span>
                )}
              </div>

              {backups.length === 0 ? (
                <div className="p-12 text-center text-xs text-ink-faint space-y-2">
                  <div className="text-3xl">🗄️</div>
                  <div className="font-medium text-ink">Aucun instantané disponible pour le moment</div>
                  <p>Cliquez sur « Sauvegarder maintenant » pour créer le premier instantané du monastère.</p>
                </div>
              ) : (
                <>
                  {/* Desktop Table (Antigravity Grid with vertical borders) */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs table-rhythm">
                      <thead>
                        <tr className="border-b border-line bg-paper-2 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                          <th className="py-2.5 px-4 border-r border-line col-lead">Date &amp; Heure de capture</th>
                          <th className="py-2.5 px-4 border-r border-line">Type d'instantané</th>
                          <th className="py-2.5 px-4 text-center border-r border-line">Volume archive</th>
                          <th className="py-2.5 px-4 text-right col-actions">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {backups.map((backup, idx) => {
                          const info = formatHumanBackupLabel(backup.pathname, backup.uploadedAt);
                          return (
                            <tr
                              key={backup.pathname}
                              className={cx(
                                'transition-colors',
                                idx % 2 === 0 ? 'bg-surface/95' : 'bg-surface-2/45',
                                'hover:bg-amber-wash/20',
                              )}
                            >
                              {/* Date & Heure */}
                              <td className="py-2.5 px-4 border-r border-line">
                                <div className="font-semibold text-ink text-xs">{info.dateStr}</div>
                                <div className="text-[11px] text-ink-faint">à {info.timeStr}</div>
                              </td>

                              {/* Type */}
                              <td className="py-2.5 px-4 border-r border-line">
                                {info.isAuto ? (
                                  <span className="inline-flex items-center gap-1 rounded-chip border border-blue/20 bg-blue-wash px-2 py-0.5 text-[11px] font-medium text-blue">
                                    <span className="h-1.5 w-1.5 rounded-full bg-blue" />
                                    Automatique
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-chip border border-green/20 bg-green-wash px-2 py-0.5 text-[11px] font-medium text-green">
                                    <span className="h-1.5 w-1.5 rounded-full bg-green" />
                                    Manuel
                                  </span>
                                )}
                              </td>

                              {/* Volume */}
                              <td className="py-2.5 px-4 text-center border-r border-line">
                                <span className="font-mono text-xs font-semibold text-ink">
                                  {formatBytes(backup.size)}
                                </span>
                              </td>

                              {/* Action */}
                              <td className="py-2.5 px-4 text-right">
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  icon={<Download size={13} />}
                                  onClick={() => void downloadBackup(backup.pathname)}
                                  className="h-7 text-xs px-2.5"
                                >
                                  Télécharger
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Cards (sm:hidden) */}
                  <div className="sm:hidden divide-y divide-line">
                    {backups.map((backup) => {
                      const info = formatHumanBackupLabel(backup.pathname, backup.uploadedAt);
                      return (
                        <div
                          key={backup.pathname}
                          className="p-3.5 flex items-center justify-between gap-3 hover:bg-paper-2/30 transition-colors"
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-ink text-xs truncate">
                                {info.dateStr}
                              </span>
                              {info.isAuto ? (
                                <span className="inline-flex items-center rounded-chip border border-blue/20 bg-blue-wash px-1.5 py-0.2 text-[10px] font-medium text-blue">
                                  Auto
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-chip border border-green/20 bg-green-wash px-1.5 py-0.2 text-[10px] font-medium text-green">
                                  Manuel
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-ink-faint">
                              <span>{info.timeStr}</span>
                              <span>·</span>
                              <span className="font-mono font-medium text-ink-soft">{formatBytes(backup.size)}</span>
                            </div>
                          </div>

                          <Button
                            size="sm"
                            variant="secondary"
                            icon={<Download size={13} />}
                            onClick={() => void downloadBackup(backup.pathname)}
                            className="h-8 text-xs shrink-0"
                          >
                            Télécharger
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </>
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
        </TabsContent>}
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

          {/* Quick 1-Click Worker Selection */}
          {(() => {
            const unlinked = employees.filter((emp) => emp.active && !users.some((u) => u.employee_id === emp.id));
            if (unlinked.length === 0) return null;
            return (
              <div className="rounded-xl border border-amber/30 bg-amber-wash/30 p-3 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber">
                  <Sparkles size={14} />
                  <span>Remplissage automatique en 1 clic ({unlinked.length} travailleur{unlinked.length > 1 ? 's' : ''} sans compte) :</span>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {unlinked.slice(0, 8).map((emp) => (
                    <button
                      key={emp.id}
                      type="button"
                      onClick={() => handleUserEmployeeChange(emp.id)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-semibold text-ink hover:border-amber hover:bg-amber-wash transition-colors shadow-xs"
                    >
                      <span>{emp.full_name}</span>
                      <span className="text-[10px] text-ink-faint font-mono">({emp.job_title})</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Decoy hidden inputs to prevent Chrome / Edge from injecting admin credentials */}
          <div style={{ display: 'none' }} aria-hidden="true">
            <input type="text" name="fake_user_name_autofill" tabIndex={-1} autoComplete="off" />
            <input type="password" name="fake_user_pass_autofill" tabIndex={-1} autoComplete="off" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-soft">Rattacher à un travailleur (Recommandé)</label>
              <select
                value={userForm.employee_id}
                onChange={(e) => handleUserEmployeeChange(e.target.value)}
                className="h-10 w-full rounded-btn border border-line-strong bg-surface px-3 text-xs text-ink focus:border-amber focus:outline-none"
              >
                <option value="">— Aucun (Compte générique / Visiteur) —</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name} ({e.id} - {e.job_title})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-soft">Nom complet affiché</label>
              <input
                type="text"
                name="new_user_display_name"
                id="new_user_display_name"
                autoComplete="off"
                data-lpignore="true"
                data-1p-ignore="true"
                value={userForm.display_name}
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
                  setUserForm((prev) => ({
                    ...prev,
                    display_name: name,
                    login: prev.login && prev.login !== prev.display_name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '.') ? prev.login : autoLogin,
                  }));
                }}
                className="h-10 w-full rounded-btn border border-line-strong bg-surface px-3 text-sm text-ink focus:border-amber focus:outline-none"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-soft">Identifiant de connexion</label>
              <input
                type="text"
                name="new_user_login"
                id="new_user_login"
                autoComplete="off"
                data-lpignore="true"
                data-1p-ignore="true"
                value={userForm.login}
                placeholder="Ex : landry.onana"
                onChange={(e) => setUserForm({ ...userForm, login: e.target.value.toLowerCase() })}
                className="h-10 w-full rounded-btn border border-line-strong bg-surface px-3 font-mono text-sm text-ink focus:border-amber focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-soft">Mot de passe temporaire</label>
              <PasswordInput
                name="new_user_password"
                id="new_user_password"
                autoComplete="new-password"
                data-lpignore="true"
                data-1p-ignore="true"
                value={userForm.password}
                placeholder="Au moins 6 caractères"
                onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                className="h-10 w-full rounded-btn border border-line-strong bg-surface px-3 text-sm text-ink focus:border-amber focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-soft">Confirmer le mot de passe</label>
            <PasswordInput
              name="new_user_confirm_password"
              id="new_user_confirm_password"
              autoComplete="new-password"
              data-lpignore="true"
              data-1p-ignore="true"
              value={userForm.confirmPassword}
              placeholder="Répétez le mot de passe"
              onChange={(e) => setUserForm({ ...userForm, confirmPassword: e.target.value })}
              className="h-10 w-full rounded-btn border border-line-strong bg-surface px-3 text-sm text-ink focus:border-amber focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium text-ink-soft">Rôle applicatif & Privilèges</label>
            <div className="grid gap-2 sm:grid-cols-2 max-h-48 overflow-y-auto pr-1">
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

          {/* Real-time Dynamic Interface Preview */}
          {(() => {
            const rolePerms = permMatrix?.matrix
              ? Object.fromEntries(
                  Object.entries(permMatrix.matrix).map(([action, roles]) => [action, Boolean(roles[userForm.role])]),
                )
              : null;
            const allowed = computeAllowedViews(userForm.role, rolePerms);
            return (
              <div className="rounded-xl border border-line bg-surface-2/60 p-3 space-y-1.5">
                <div className="flex items-center justify-between text-xs font-semibold text-ink">
                  <span>Interface garantie pour ce compte :</span>
                  <span className="text-[11px] text-amber font-mono">{allowed.length} module(s) débloqué(s)</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {allowed.map((v) => (
                    <span key={v} className="inline-flex items-center gap-1 rounded-chip border border-line bg-surface px-2 py-0.5 text-[10px] font-semibold text-ink">
                      <span className="h-1.5 w-1.5 rounded-full bg-green" />
                      {v === 'espace' ? 'Mon Espace' : v === 'employes' ? 'Travailleurs' : v === 'dashboard' ? 'Tableau de bord' : v.charAt(0).toUpperCase() + v.slice(1)}
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}
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

        </div>
      </Modal>

      {/* Modal: Réinitialiser mot de passe utilisateur */}
      <Modal
        open={!!resetFor}
        title={resetFor ? `Réinitialiser le mot de passe · @${resetFor.login}` : 'Réinitialiser le mot de passe'}
        onClose={() => {
          setResetFor(null);
          setResetPassword('');
          setResetPasswordConfirm('');
        }}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setResetFor(null);
                setResetPassword('');
                setResetPasswordConfirm('');
              }}
            >
              Annuler
            </Button>
            <Button
              variant="primary"
              disabled={
                busy ||
                resetPassword.length < 6 ||
                resetPasswordConfirm.length < 6 ||
                resetPassword !== resetPasswordConfirm
              }
              onClick={() => void resetUserPassword()}
            >
              {busy ? <Spinner /> : 'Définir ce mot de passe'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-ink-soft">
            Définissez un nouveau mot de passe pour <strong>{resetFor?.display_name}</strong> (@{resetFor?.login}).
          </p>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-soft">Nouveau mot de passe</label>
            <PasswordInput
              value={resetPassword}
              placeholder="Minimum 6 caractères"
              onChange={(e) => setResetPassword(e.target.value)}
              className="h-10 w-full rounded-btn border border-line-strong bg-surface px-3 text-sm text-ink focus:border-amber focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-soft">Confirmer le mot de passe</label>
            <PasswordInput
              value={resetPasswordConfirm}
              placeholder="Répétez le mot de passe"
              onChange={(e) => setResetPasswordConfirm(e.target.value)}
              className="h-10 w-full rounded-btn border border-line-strong bg-surface px-3 text-sm text-ink focus:border-amber focus:outline-none"
            />
          </div>
        </div>
      </Modal>

      {/* Modal: Supprimer définitivement un utilisateur */}
      <Modal
        open={!!deleteUserFor}
        title={`Supprimer le compte @${deleteUserFor?.login ?? ''}`}
        onClose={() => {
          if (!deleteUserBusy) {
            setDeleteUserFor(null);
            setDeleteUserError(null);
          }
        }}
        footer={
          <>
            <Button
              variant="ghost"
              disabled={deleteUserBusy}
              onClick={() => {
                setDeleteUserFor(null);
                setDeleteUserError(null);
              }}
            >
              Annuler
            </Button>
            <Button
              variant="danger"
              disabled={deleteUserBusy}
              onClick={() => void handleDeleteUser()}
            >
              {deleteUserBusy ? <Spinner /> : 'Supprimer définitivement'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {deleteUserError ? <Banner tone="error">{deleteUserError}</Banner> : null}
          <p className="text-sm text-ink">
            Êtes-vous sûr de vouloir supprimer définitivement le compte{' '}
            <strong>{deleteUserFor?.display_name}</strong> (<span className="font-mono text-xs">@{deleteUserFor?.login}</span>) ?
          </p>
          <div className="rounded-xl border border-line bg-paper-2 p-3 text-xs text-ink-soft space-y-1">
            <p className="font-semibold text-ink flex items-center gap-1.5">
              <AlertTriangle size={13} className="text-amber" /> Information importante
            </p>
            <p>
              Cette opération retire les identifiants et les accès de l'utilisateur. L'historique d'audit des actions antérieures et les pointages du travailleur restent intacts.
            </p>
          </div>
        </div>
      </Modal>

      {/* Modal: Nouveau / Modifier rôle applicatif */}
      <Modal
        open={roleModalOpen}
        title={roleModalMode === 'create' ? 'Créer un nouveau rôle applicatif' : `Modifier le rôle « ${roleForm.name} »`}
        wide
        onClose={() => setRoleModalOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRoleModalOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="primary"
              disabled={
                roleBusy ||
                (!roleForm.name.trim() &&
                  (roleModalMode !== 'create' ||
                    !ROLE_ARCHETYPES_UI.find((a) => a.id === roleForm.template) ||
                    ROLE_ARCHETYPES_UI.find((a) => a.id === roleForm.template)?.id === 'custom' ||
                    ROLE_ARCHETYPES_UI.find((a) => a.id === roleForm.template)?.id === 'clone'))
              }
              onClick={() => void handleSaveRole()}
            >
              {roleBusy ? <Spinner /> : roleModalMode === 'create' ? 'Créer le rôle & Configurer dans la matrice' : 'Enregistrer les modifications'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {roleError ? <Banner tone="error">{roleError}</Banner> : null}

          {/* Archetype Quick Selection (Create Mode) */}
          {roleModalMode === 'create' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-ink">
                  1. Modèle de rôle pré-configuré (Archétype en 1 clic) :
                </label>
                <span className="text-[11px] text-ink-faint">Sélectionnez un modèle pour pré-remplir les droits</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {ROLE_ARCHETYPES_UI.map((arch) => {
                  const isSelected = roleForm.template === arch.id;
                  return (
                    <div
                      key={arch.id}
                      onClick={() => selectRoleArchetype(arch.id)}
                      className={cx(
                        'flex flex-col justify-between rounded-xl border p-2.5 cursor-pointer transition-all text-left shadow-xs select-none',
                        isSelected ? 'border-amber bg-amber-wash/60 ring-2 ring-amber/20' : 'border-line bg-surface hover:bg-paper-2 hover:border-line-strong',
                      )}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold text-ink truncate">{arch.name}</span>
                          <span className="shrink-0 rounded-full bg-paper px-1.5 py-0.5 text-[9px] font-bold text-amber border border-amber/20">
                            {arch.badge}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-ink-soft leading-snug line-clamp-2">
                          {arch.description}
                        </p>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {arch.modules.map((m) => (
                          <span key={m} className="rounded bg-surface px-1.5 py-0.5 text-[9px] font-medium text-ink-faint border border-line">
                            {m}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Clone source selection */}
          {roleModalMode === 'create' && roleForm.template === 'clone' && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-soft">Dupliquer les droits à partir du rôle :</label>
              <select
                value={roleForm.copyFrom}
                onChange={(e) => setRoleForm({ ...roleForm, copyFrom: e.target.value })}
                className="h-10 w-full rounded-btn border border-line-strong bg-surface px-3 text-xs text-ink focus:border-amber focus:outline-none"
              >
                <option value="">— Sélectionner un rôle source —</option>
                {availableRoles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.id})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="border-t border-line pt-3 space-y-3">
            <span className="block text-xs font-semibold text-ink">
              {roleModalMode === 'create' ? '2. Informations et intitulé du rôle :' : 'Informations du rôle :'}
            </span>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-soft">Intitulé officiel du rôle</label>
                <input
                  type="text"
                  value={roleForm.name}
                  placeholder={
                    roleModalMode === 'create' &&
                    ROLE_ARCHETYPES_UI.find((a) => a.id === roleForm.template) &&
                    !['custom', 'clone'].includes(roleForm.template)
                      ? `Ex: ${ROLE_ARCHETYPES_UI.find((a) => a.id === roleForm.template)?.name}`
                      : 'Ex: Responsable Menuiserie & Scierie'
                  }
                  onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                  className="h-10 w-full rounded-btn border border-line-strong bg-surface px-3 text-sm text-ink focus:border-amber focus:outline-none"
                />
              </div>

              {roleModalMode === 'create' ? (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-ink-soft">
                      Identifiant système
                    </label>
                    <span className="text-[10px] text-ink-faint">Auto-généré (modifiable)</span>
                  </div>
                  <input
                    type="text"
                    value={roleForm.id}
                    placeholder={
                      (roleForm.name.trim() || ROLE_ARCHETYPES_UI.find((a) => a.id === roleForm.template)?.name || '')
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '')
                        .toLowerCase()
                        .replace(/[^a-z0-9_-]/g, '_')
                        .replace(/^_+|_+$/g, '') || 'Généré automatiquement'
                    }
                    onChange={(e) => setRoleForm({ ...roleForm, id: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '_') })}
                    className="h-10 w-full rounded-btn border border-line bg-surface/80 px-3 font-mono text-xs text-ink focus:border-amber focus:outline-none"
                  />
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
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-soft">Description des responsabilités (facultative)</label>
              <textarea
                rows={2}
                value={roleForm.description}
                placeholder={
                  roleModalMode === 'create' &&
                  ROLE_ARCHETYPES_UI.find((a) => a.id === roleForm.template) &&
                  !['custom', 'clone'].includes(roleForm.template)
                    ? (ROLE_ARCHETYPES_UI.find((a) => a.id === roleForm.template)?.description ?? 'Décrivez brièvement les missions…')
                    : 'Décrivez brièvement les missions et responsabilités attachées à ce rôle…'
                }
                onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                className="w-full rounded-btn border border-line-strong bg-surface p-3 text-xs text-ink focus:border-amber focus:outline-none"
              />
            </div>
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

      {/* Modal Confirmation de Purge des Sauvegardes Cloud */}
      <Modal
        open={purgeConfirmOpen}
        title="Purger l'historique des instantanés cloud"
        onClose={() => setPurgeConfirmOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPurgeConfirmOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="danger"
              disabled={backupBusy}
              onClick={async () => {
                setPurgeConfirmOpen(false);
                await purgeCloudBackups();
              }}
            >
              {backupBusy ? <Spinner /> : 'Oui, purger tous les instantanés'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-red-wash/50 border border-red/20 text-red text-xs">
            <span className="text-xl">⚠️</span>
            <div>
              <strong>Action irréversible :</strong> Vous êtes sur le point de supprimer l’intégralité des{' '}
              <strong>{backups.length}</strong> fichier(s) d'instantanés archivés dans le Cloud Vercel Blob.
            </div>
          </div>
          <p className="text-xs text-ink-soft">
            Cette purge libère l'espace de stockage cloud. Les données opérationnelles actuellement en base de données resteront quant à elles intactes.
          </p>
        </div>
      </Modal>

      {/* Modal: Ajouter une Action / Module dans la Matrice RBAC */}
      <Modal
        open={newActionOpen}
        title="Ajouter une Action / Module dans la Matrice RBAC"
        onClose={() => setNewActionOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setNewActionOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="primary"
              disabled={newActionBusy || !newActionForm.label.trim() || !newActionForm.action.trim()}
              onClick={() => void handleCreateAction()}
            >
              {newActionBusy ? <Spinner /> : 'Enregistrer dans la matrice'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {newActionError && (
            <div className="p-3 rounded-xl bg-red-wash/50 border border-red/20 text-xs text-red">
              {newActionError}
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold text-ink">
              Module applicatif (Groupe) <span className="text-red">*</span>
            </label>
            <input
              type="text"
              value={newActionForm.group_label}
              onChange={(e) => setNewActionForm({ ...newActionForm, group_label: e.target.value })}
              placeholder="Ex: Vigile & Pointage Borne, Comptabilité, etc."
              className="h-10 w-full rounded-btn border border-line-strong bg-surface px-3 text-xs text-ink focus:border-amber focus:outline-none"
            />
            {permMatrix?.groups && permMatrix.groups.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                <span className="text-[10px] text-ink-faint">Suggestions :</span>
                {permMatrix.groups.slice(0, 4).map((g) => (
                  <button
                    key={g.label}
                    type="button"
                    onClick={() => setNewActionForm({ ...newActionForm, group_label: g.label })}
                    className="text-[10px] text-amber hover:underline px-1 py-0.5 rounded bg-amber-wash/30"
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-ink">
              Libellé de la permission <span className="text-red">*</span>
            </label>
            <input
              type="text"
              value={newActionForm.label}
              onChange={(e) => {
                const label = e.target.value;
                // Auto-generate code slug if not touched
                const slug = label
                  .toLowerCase()
                  .normalize('NFD')
                  .replace(/[\u0300-\u036f]/g, '')
                  .replace(/[^a-z0-9]/g, '_')
                  .replace(/^_+|_+$/g, '');
                const groupSlug = newActionForm.group_label
                  .toLowerCase()
                  .normalize('NFD')
                  .replace(/[\u0300-\u036f]/g, '')
                  .replace(/[^a-z0-9]/g, '_')
                  .replace(/^_+|_+$/g, '');
                const autoAction = groupSlug && slug ? `${groupSlug}.${slug}` : slug;
                setNewActionForm({ ...newActionForm, label, action: autoAction });
              }}
              placeholder="Ex: Valider pointage vigile, Clôturer caisse, etc."
              className="h-10 w-full rounded-btn border border-line-strong bg-surface px-3 text-xs text-ink focus:border-amber focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-ink">
              Code technique de l'action <span className="text-red">*</span>
            </label>
            <input
              type="text"
              value={newActionForm.action}
              onChange={(e) => setNewActionForm({ ...newActionForm, action: e.target.value.toLowerCase().trim() })}
              placeholder="Ex: vigile.pointer_borne"
              className="h-10 w-full rounded-btn border border-line-strong bg-surface px-3 font-mono text-xs text-ink focus:border-amber focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-ink-faint">
              Identifiant unique sous la forme <code>module.action</code>. Sera automatiquement accordé à la Direction.
            </p>
          </div>
        </div>
      </Modal>

      {/* Modal Photo de Profil (Caméra ou Fichier/Galerie) */}
      <ImagePickerModal
        open={profilePhotoOpen}
        title={profilePhotoTarget?.name ? `Photo de profil : ${profilePhotoTarget.name}` : 'Photo de profil (WhatsApp)'}
        currentImage={profilePhotoTarget?.current}
        category="profiles"
        defaultFacingMode="user"
        onClose={() => setProfilePhotoOpen(false)}
        onSelect={(url) => void handleProfilePhotoSelect(url)}
      />
    </div>
  );
}
