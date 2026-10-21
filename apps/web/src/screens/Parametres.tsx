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
  type TerminalInfo,
  type User,
} from '../lib/api';
import { ROLE_LABEL, WORKDAY_LABEL, formatDateTime } from '../lib/labels';
import {
  Banner,
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  SelectField,
  Spinner,
  cx,
  useToast,
} from '../components/ui';
import { IconAlert, IconBox, IconGear, IconKey, IconPlus, IconRefresh, IconUsers } from '../components/Icons';

const DAYS = [0, 1, 2, 3, 4, 5, 6];

export function Parametres({ user }: { user: User }) {
  if (user.role !== 'direction') {
    return (
      <>
        <PageHeader title="Paramètres" hint="Réglages de l’atelier." />
        <EmptyState
          title="Accès réservé"
          hint="Les paramètres, les terminaux et les comptes sont gérés par la direction."
        />
      </>
    );
  }

  return <AdminSettings user={user} />;
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

function AdminSettings({ user }: { user: User }) {
  const toast = useToast();

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
  const [reload, setReload] = useState(0);

  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [retentionDays, setRetentionDays] = useState(30);
  const [backupBusy, setBackupBusy] = useState(false);
  const [resetText, setResetText] = useState('');
  const [resetBusy, setResetBusy] = useState(false);

  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalForm, setTerminalForm] = useState({ name: '', id: '' });
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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

  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
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
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

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
      toast(`Sauvegarde cloud effectuée (${res.tables} tables, ${formatBytes(res.size)}).`, 'success');
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
      toast('Export téléchargé.', 'success');
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
      toast('Données de démonstration purgées.', 'success');
      setTimeout(() => window.location.reload(), 700);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Purge impossible.', 'error');
      setResetBusy(false);
    }
  }

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
      toast('Au moins un motif de retard doit rester.', 'error');
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

  async function createTerminal() {
    setBusy(true);
    setFormError(null);
    try {
      await api('/api/terminals', {
        method: 'POST',
        body: JSON.stringify({ name: terminalForm.name, id: terminalForm.id.trim() || undefined }),
      });
      toast('Terminal enregistré.', 'success');
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

  async function createUser() {
    setBusy(true);
    setFormError(null);
    try {
      await api('/api/users', {
        method: 'POST',
        body: JSON.stringify({ ...userForm, employee_id: userForm.employee_id || undefined }),
      });
      toast('Compte créé.', 'success');
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
      toast(account.active ? 'Compte désactivé.' : 'Compte activé.', 'success');
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

  async function changeMyPassword() {
    setBusy(true);
    setFormError(null);
    try {
      if (pw.next !== pw.confirm) throw new Error('La confirmation ne correspond pas au nouveau mot de passe.');
      await api('/api/users/me/password', {
        method: 'POST',
        body: JSON.stringify({ current_password: pw.current, new_password: pw.next }),
      });
      toast('Mot de passe modifié.', 'success');
      setPw({ current: '', next: '', confirm: '' });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Changement impossible.');
    } finally {
      setBusy(false);
    }
  }

  function togglePerm(action: string, role: string) {
    setPermDraft((prev) => {
      if (!prev) return prev;
      return { ...prev, [action]: { ...prev[action], [role]: !prev[action]?.[role] } };
    });
  }

  async function savePermissions() {
    if (!permDraft) return;
    setBusy(true);
    try {
      await api('/api/permissions', { method: 'PUT', body: JSON.stringify({ matrix: permDraft }) });
      toast('Permissions enregistrées.', 'success');
      setReload((value) => value + 1);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Enregistrement impossible.', 'error');
    } finally {
      setBusy(false);
    }
  }

  const employeesById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  if (loading && !settings) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-ink-soft">
        <Spinner /> Chargement des paramètres…
      </div>
    );
  }

  if (!settings) {
    return <EmptyState title="Paramètres indisponibles" hint={settingsError ?? undefined} />;
  }

  return (
    <>
      <PageHeader
        title="Paramètres"
        hint="Horaires de pointage, terminaux enregistrés et comptes (ADM-01 à ADM-03)."
        actions={
          <Button icon={<IconRefresh size={18} />} onClick={() => setReload((value) => value + 1)}>
            Actualiser
          </Button>
        }
      />

      {settingsError ? (
        <div className="mb-4">
          <Banner tone="error">{settingsError}</Banner>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <IconGear size={16} /> Horaires & tolérance
          </h2>
          <p className="mt-1 text-[13px] text-ink-soft">Règles appliquées par le kiosk de pointage (PRS-03).</p>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Field
              label="Ouverture"
              type="time"
              value={settings.opening_time}
              onChange={(event) => void saveSettings({ opening_time: event.target.value })}
            />
            <Field
              label="Fermeture"
              type="time"
              value={settings.closing_time}
              onChange={(event) => void saveSettings({ closing_time: event.target.value })}
            />
          </div>

          <div className="mt-3">
            <Field
              label="Tolérance de retard (minutes)"
              type="number"
              min={0}
              max={180}
              hint="Au-delà, le motif devient obligatoire."
              value={String(settings.tolerance_minutes)}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (!Number.isNaN(value)) void saveSettings({ tolerance_minutes: value });
              }}
            />
          </div>

          <p className="mb-2 mt-4 text-[13px] font-medium text-ink-soft">Jours ouvrés</p>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((day) => (
              <button
                key={day}
                onClick={() => toggleWorkday(day)}
                className={cx(
                  'h-10 rounded-btn border px-3 text-[13px] font-medium',
                  settings.workdays.includes(day)
                    ? 'border-amber bg-amber-wash text-amber'
                    : 'border-line-strong bg-surface text-ink-soft hover:bg-surface-2',
                )}
              >
                {(WORKDAY_LABEL[day] ?? '').slice(0, 3)}
              </button>
            ))}
          </div>

          <p className="mb-2 mt-4 text-[13px] font-medium text-ink-soft">Motifs de retard</p>
          <div className="flex flex-wrap gap-2">
            {settings.late_motifs.map((motif) => (
              <span
                key={motif}
                className="inline-flex items-center gap-1.5 rounded-chip border border-line bg-surface-2 px-2.5 py-1 text-[13px] text-ink"
              >
                {motif}
                <button
                  onClick={() => removeMotif(motif)}
                  className="text-ink-faint hover:text-red"
                  aria-label={`Retirer ${motif}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              value={motifDraft}
              onChange={(event) => setMotifDraft(event.target.value)}
              placeholder="Ajouter un motif…"
              className="h-10 flex-1 rounded-btn border border-line-strong bg-surface px-3 text-sm focus:border-amber focus:outline-none"
            />
            <Button size="sm" onClick={addMotif} disabled={!motifDraft.trim()}>
              Ajouter
            </Button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Field
              label="Durée d’affichage de la fiche (s)"
              type="number"
              min={3}
              max={60}
              value={String(settings.card_display_seconds)}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (!Number.isNaN(value)) void saveSettings({ card_display_seconds: value });
              }}
            />
            <Field
              label="Rétention des selfies (jours)"
              type="number"
              min={7}
              value={String(settings.selfie_retention_days)}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (!Number.isNaN(value)) void saveSettings({ selfie_retention_days: value });
              }}
            />
          </div>
          <p className="mt-3 flex items-center gap-2 text-[12px] text-ink-faint">
            {savingSettings ? <Spinner /> : null}
            Chaque modification est enregistrée immédiatement et journalisée.
          </p>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
              <IconKey size={16} /> Terminaux de pointage
            </h2>
            <Button
              size="sm"
              variant="primary"
              icon={<IconPlus size={16} />}
              onClick={() => {
                setTerminalForm({ name: '', id: '' });
                setFormError(null);
                setTerminalOpen(true);
              }}
            >
              Enregistrer
            </Button>
          </div>
          <p className="mt-1 text-[13px] text-ink-soft">
            Seuls les terminaux actifs peuvent pointer. L’heure retenue est celle du serveur.
          </p>

          <ul className="mt-4 divide-y divide-line rounded-btn border border-line">
            {terminals.map((terminal) => (
              <li key={terminal.id} className="flex flex-wrap items-center gap-3 bg-surface px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{terminal.name}</p>
                  <p className="font-mono text-[12px] text-ink-faint num">
                    {terminal.id}
                    {terminal.last_used ? ` · dernier usage ${formatDateTime(terminal.last_used)}` : ''}
                  </p>
                </div>
                <Chip tone={terminal.active ? 'green' : 'grey'}>{terminal.active ? 'Actif' : 'Inactif'}</Chip>
                <span className="font-mono text-[12px] text-ink-soft num">{terminal.punches_today} aujourd’hui</span>
                <Button size="sm" variant={terminal.active ? 'danger' : 'secondary'} onClick={() => void toggleTerminal(terminal)}>
                  {terminal.active ? 'Désactiver' : 'Activer'}
                </Button>
              </li>
            ))}
            {terminals.length === 0 ? (
              <li className="bg-surface px-3 py-4 text-sm text-ink-soft">Aucun terminal enregistré.</li>
            ) : null}
          </ul>
        </Card>
      </div>

      <Card className="mt-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <IconUsers size={16} /> Comptes utilisateurs
          </h2>
          <Button
            size="sm"
            variant="primary"
            icon={<IconPlus size={16} />}
            onClick={() => {
              setUserForm({ login: '', display_name: '', password: '', role: 'magasinier', employee_id: '' });
              setFormError(null);
              setUserOpen(true);
            }}
          >
            Nouveau compte
          </Button>
        </div>
        <p className="mt-1 text-[13px] text-ink-soft">
          Le pointage kiosk ne nécessite aucun compte : les comptes servent aux écrans de gestion.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-line text-[12px] uppercase tracking-wide text-ink-faint">
              <tr>
                <th className="px-3 py-2 font-medium">Identifiant</th>
                <th className="px-3 py-2 font-medium">Nom affiché</th>
                <th className="px-3 py-2 font-medium">Rôle</th>
                <th className="px-3 py-2 font-medium">Liaison</th>
                <th className="px-3 py-2 font-medium">État</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {users.map((account) => (
                <tr key={account.id} className="border-b border-line last:border-b-0">
                  <td className="px-3 py-2.5 font-mono text-sm num">{account.login}</td>
                  <td className="px-3 py-2.5 text-sm text-ink">{account.display_name}</td>
                  <td className="px-3 py-2.5">
                    <Chip tone="neutral">{ROLE_LABEL[account.role]}</Chip>
                  </td>
                  <td className="px-3 py-2.5 text-[13px] text-ink-soft">
                    {account.employee_id ? (employeesById.get(account.employee_id)?.full_name ?? account.employee_id) : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <Chip tone={account.active ? 'green' : 'grey'}>{account.active ? 'Actif' : 'Inactif'}</Chip>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          setResetFor(account);
                          setResetPassword('');
                        }}
                      >
                        Mot de passe
                      </Button>
                      <Button
                        size="sm"
                        variant={account.active ? 'danger' : 'secondary'}
                        onClick={() => void toggleUser(account)}
                      >
                        {account.active ? 'Désactiver' : 'Activer'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {permMatrix && permDraft ? (
        <Card className="mt-4 p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
              <IconKey size={16} /> Permissions par rôle
            </h2>
            <Button variant="primary" size="sm" disabled={busy} onClick={() => void savePermissions()}>
              {busy ? <Spinner /> : 'Enregistrer les permissions'}
            </Button>
          </div>
          <p className="mt-1 text-[13px] text-ink-soft">
            La direction est super-administratrice : elle conserve toujours tous les droits.
            Les autres rôles sont accordés ici, action par action.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead className="border-b border-line text-[12px] uppercase tracking-wide text-ink-faint">
                <tr>
                  <th className="px-3 py-2 font-medium">Action</th>
                  {permMatrix.roles
                    .filter((r) => r !== 'direction')
                    .map((role) => (
                      <th key={role} className="px-3 py-2 text-center font-medium">
                        {ROLE_LABEL[role]}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {permMatrix.groups.map((group) => (
                  <Fragment key={group.label}>
                    <tr className="bg-paper-2">
                      <td colSpan={4} className="px-3 py-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink-soft">
                        {group.label}
                      </td>
                    </tr>
                    {group.actions.map((action) => {
                      const meta = permMatrix.actions.find((a) => a.action === action);
                      return (
                        <tr key={action} className="border-b border-line last:border-b-0">
                          <td className="px-3 py-2 text-sm text-ink">{meta?.label ?? action}</td>
                          {permMatrix.roles
                            .filter((r) => r !== 'direction')
                            .map((role) => (
                              <td key={role} className="px-3 py-2 text-center">
                                <button
                                  onClick={() => togglePerm(action, role)}
                                  aria-label={`${meta?.label} pour ${ROLE_LABEL[role]}`}
                                  className={cx(
                                    'grid h-6 w-6 place-items-center rounded-md border text-[13px] font-bold transition-colors',
                                    permDraft[action]?.[role]
                                      ? 'border-green bg-green text-white'
                                      : 'border-line-strong bg-surface text-ink-faint hover:bg-paper-2',
                                  )}
                                >
                                  {permDraft[action]?.[role] ? '✓' : ''}
                                </button>
                              </td>
                            ))}
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <Card className="mt-4 p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <IconKey size={16} /> Mon mot de passe
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field
            label="Mot de passe actuel"
            type="password"
            value={pw.current}
            onChange={(event) => setPw({ ...pw, current: event.target.value })}
          />
          <Field
            label="Nouveau mot de passe"
            type="password"
            value={pw.next}
            onChange={(event) => setPw({ ...pw, next: event.target.value })}
          />
          <Field
            label="Confirmation"
            type="password"
            value={pw.confirm}
            onChange={(event) => setPw({ ...pw, confirm: event.target.value })}
          />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Button
            variant="primary"
            disabled={busy || !pw.current || pw.next.length < 6}
            onClick={() => void changeMyPassword()}
          >
            {busy ? <Spinner /> : 'Changer mon mot de passe'}
          </Button>
          {formError ? <p className="text-sm text-red">{formError}</p> : null}
        </div>
      </Card>

      {user.role === 'direction' ? (
        <Card className="mt-4 p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <IconBox size={16} /> Sauvegardes &amp; maintenance
          </h2>
          <p className="mt-1 text-[13px] text-ink-soft">
            Sauvegarde automatique quotidienne à 03:00 UTC vers le stockage cloud, conservée{' '}
            {retentionDays} jours. L’export manuel fonctionne depuis n’importe quel appareil connecté.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="primary" disabled={backupBusy} onClick={() => void saveBackupNow()}>
              {backupBusy ? <Spinner /> : 'Sauvegarder maintenant'}
            </Button>
            <Button variant="secondary" onClick={() => void downloadExport()}>
              Télécharger l’export (.gz)
            </Button>
          </div>

          <div className="mt-4">
            <h3 className="text-[13px] font-semibold text-ink">
              Sauvegardes cloud ({backups.length})
            </h3>
            {backups.length === 0 ? (
              <p className="mt-1 text-[13px] text-ink-faint">
                Aucune sauvegarde pour l’instant — la première est créée automatiquement à 03:00 UTC,
                ou cliquez sur « Sauvegarder maintenant ».
              </p>
            ) : (
              <div className="mt-2 divide-y divide-line rounded-card border border-line">
                {backups.map((backup) => (
                  <div
                    key={backup.pathname}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[13px]"
                  >
                    <span className="font-mono text-ink-soft">
                      {backup.pathname.replace('backups/', '')}
                    </span>
                    <span className="flex items-center gap-3 text-ink-faint">
                      <span>
                        {formatDateTime(backup.uploadedAt)} · {formatBytes(backup.size)}
                      </span>
                      <Button size="sm" variant="quiet" onClick={() => void downloadBackup(backup.pathname)}>
                        Télécharger
                      </Button>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-5 border-t border-line pt-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-red">
              <IconAlert size={15} /> Purger les données de démonstration
            </h3>
            <p className="mt-1 text-[13px] text-ink-soft">
              Supprime pointages, absences, stocks, outils, magasins, terminaux, employés et journaux.
              Les comptes de connexion, les paramètres et votre session sont conservés. Action
              irréversible : téléchargez d’abord un export si vous hésitez.
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div className="w-64">
                <Field
                  label="Tapez RESET pour confirmer"
                  placeholder="RESET"
                  value={resetText}
                  onChange={(event) => setResetText(event.target.value)}
                />
              </div>
              <Button
                variant="danger"
                disabled={resetText.trim() !== 'RESET' || resetBusy}
                onClick={() => void resetDemo()}
              >
                {resetBusy ? <Spinner /> : 'Purger les données de démo'}
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      <Modal
        open={terminalOpen}
        title="Enregistrer un terminal"
        onClose={() => setTerminalOpen(false)}
        footer={
          <>
            <Button onClick={() => setTerminalOpen(false)}>Annuler</Button>
            <Button variant="primary" disabled={busy || terminalForm.name.trim().length < 3} onClick={() => void createTerminal()}>
              {busy ? <Spinner /> : 'Enregistrer'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {formError ? <Banner tone="error">{formError}</Banner> : null}
          <Field
            label="Nom du terminal"
            value={terminalForm.name}
            placeholder="Tablette de l’atelier — pointage arrivée"
            onChange={(event) => setTerminalForm({ ...terminalForm, name: event.target.value })}
          />
          <Field
            label="Identifiant (facultatif)"
            value={terminalForm.id}
            placeholder="TERM-ATELIER"
            hint="Laissez vide pour générer TERM-XXXX. Une seule saisie : notez-le pour le coller dans le navigateur du terminal."
            onChange={(event) => setTerminalForm({ ...terminalForm, id: event.target.value.toUpperCase() })}
          />
        </div>
      </Modal>

      <Modal
        open={userOpen}
        title="Nouveau compte"
        onClose={() => setUserOpen(false)}
        footer={
          <>
            <Button onClick={() => setUserOpen(false)}>Annuler</Button>
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
        <div className="space-y-3">
          {formError ? <Banner tone="error">{formError}</Banner> : null}
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Identifiant de connexion"
              value={userForm.login}
              placeholder="resp.magasin"
              onChange={(event) => setUserForm({ ...userForm, login: event.target.value.toLowerCase() })}
            />
            <Field
              label="Nom affiché"
              value={userForm.display_name}
              placeholder="Responsable magasin"
              onChange={(event) => setUserForm({ ...userForm, display_name: event.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <SelectField
              label="Rôle"
              value={userForm.role}
              onChange={(event) => setUserForm({ ...userForm, role: event.target.value as Role })}
            >
              {ROLES_OPTION.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABEL[role]}
                </option>
              ))}
            </SelectField>
            <Field
              label="Mot de passe initial"
              type="text"
              value={userForm.password}
              hint="6 caractères minimum — à communiquer en clair puis changer."
              onChange={(event) => setUserForm({ ...userForm, password: event.target.value })}
            />
          </div>
          <SelectField
            label="Lier à un travailleur (facultatif)"
            value={userForm.employee_id}
            onChange={(event) => setUserForm({ ...userForm, employee_id: event.target.value })}
          >
            <option value="">Aucun</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.full_name} — {employee.id}
              </option>
            ))}
          </SelectField>
        </div>
      </Modal>

      <Modal
        open={!!resetFor}
        title={`Réinitialiser le mot de passe — ${resetFor?.login ?? ''}`}
        onClose={() => setResetFor(null)}
        footer={
          <>
            <Button onClick={() => setResetFor(null)}>Annuler</Button>
            <Button variant="primary" disabled={busy || resetPassword.length < 6} onClick={() => void resetUserPassword()}>
              {busy ? <Spinner /> : 'Réinitialiser'}
            </Button>
          </>
        }
      >
        <Field
          label="Nouveau mot de passe"
          type="text"
          value={resetPassword}
          hint="6 caractères minimum."
          onChange={(event) => setResetPassword(event.target.value)}
        />
      </Modal>
    </>
  );
}
