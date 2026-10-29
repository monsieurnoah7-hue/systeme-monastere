import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, type Catalog, type MyOverview, type ScanResult, type User } from '../lib/api';
import type { ViewId } from '../components/Shell';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  PageHeader,
  SegmentedControl,
  Skeleton,
  StatCard,
} from '../components/ui';
import {
  IconAlert,
  IconBox,
  IconClock,
  IconHistory,
  IconWrench,
} from '../components/Icons';
import { formatDate } from '../lib/labels';
import {
  ShieldCheck,
  CheckCircle2,
  KeyRound,
  ExternalLink,
  Users,
  Warehouse,
  FileCheck2,
  AlertTriangle,
} from 'lucide-react';

const SITUATION_LABEL: Record<string, string> = {
  present: 'Présent(e)',
  late: 'En retard',
  absent: 'Absent(e)',
  conge: 'En congé',
  permission: 'En permission',
};

const LOAN_COND_LABEL: Record<string, string> = {
  bon: 'Bon état',
  passable: 'Passable',
  usure_normale: 'Usure normale',
  lame_a_affuter: 'Lame à affûter',
  a_reparer: 'À réparer',
  endommage: 'Endommagé',
  hors_service: 'Hors service',
};

export function Espace({
  scan,
  user,
  permissions,
  onNavigate,
}: {
  scan?: ScanResult | null;
  user?: User | null;
  permissions?: Record<string, boolean> | null;
  onNavigate?: (view: ViewId) => void;
}) {
  const [overview, setOverview] = useState<MyOverview | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Workers tabs
  const [tab, setTab] = useState<'presences' | 'retards' | 'conges' | 'outillage' | 'catalogue' | 'profil'>('presences');
  const [magasinFilter, setMagasinFilter] = useState<string>('all');

  // Profile Form (Direction & Authorized Users)
  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [login, setLogin] = useState(user?.login ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const isDirection = user?.role === 'direction';
  const canEditLogin = isDirection || Boolean(permissions?.['profile.login_edit']) || Boolean(permissions?.['users.manage']);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, cat] = await Promise.all([
        api<MyOverview>('/api/me/overview').catch(() => null),
        api<Catalog>('/api/me/catalog').catch(() => null),
      ]);
      setOverview(ov);
      setCatalog(cat);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, scan]);

  useEffect(() => {
    if (user?.display_name) setDisplayName(user.display_name);
    if (user?.login) setLogin(user.login);
  }, [user?.display_name, user?.login]);

  async function handleUpdateProfile(e: FormEvent) {
    e.preventDefault();
    setProfileSaving(true);
    setProfileSuccess(null);
    setProfileError(null);
    try {
      const payload: Record<string, string> = {};
      const trimmedLogin = login.trim().toLowerCase();
      if (trimmedLogin && trimmedLogin !== (user?.login ?? '').toLowerCase()) {
        if (!canEditLogin) {
          setProfileError('Vous n’avez pas le privilège requis pour modifier votre identifiant.');
          setProfileSaving(false);
          return;
        }
        if (trimmedLogin.length < 3) {
          setProfileError('L’identifiant doit comporter au moins 3 caractères.');
          setProfileSaving(false);
          return;
        }
        payload.login = trimmedLogin;
      }
      if (displayName.trim() && displayName.trim() !== user?.display_name) {
        payload.display_name = displayName.trim();
      }
      if (newPassword.trim()) {
        if (!currentPassword) {
          setProfileError('Veuillez renseigner votre mot de passe actuel.');
          setProfileSaving(false);
          return;
        }
        if (newPassword.trim().length < 6) {
          setProfileError('Le nouveau mot de passe doit comporter au moins 6 caractères.');
          setProfileSaving(false);
          return;
        }
        if (newPassword.trim() !== confirmPassword.trim()) {
          setProfileError('La confirmation du mot de passe ne correspond pas au nouveau mot de passe.');
          setProfileSaving(false);
          return;
        }
        payload.current_password = currentPassword;
        payload.new_password = newPassword.trim();
      }

      if (Object.keys(payload).length === 0) {
        setProfileError('Aucune modification détectée.');
        return;
      }

      const res = await api<{ ok: boolean; user: User }>('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });

      setProfileSuccess('Profil mis à jour avec succès.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      if (res.user) {
        if (res.user.display_name) setDisplayName(res.user.display_name);
        if (res.user.login) setLogin(res.user.login);
        window.dispatchEvent(new CustomEvent('auth:user-updated', { detail: res.user }));
      }
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Échec de la mise à jour.');
    } finally {
      setProfileSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-xl" />
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  // =========================================================================
  // ESPACE EXÉCUTIF : DIRECTION DU MONASTÈRE (Super-Admin)
  // =========================================================================
  if (isDirection) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={`Espace Direction · ${displayName || 'Direction'}`}
        />

        <div className="rounded-xl border border-amber/30 bg-amber-wash/30 p-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-amber text-white">
              <ShieldCheck size={20} />
            </div>
            <div>
              <p className="text-sm font-bold text-ink">Statut : Super-Administrateur Permanent</p>
              <p className="text-xs text-ink-soft">
                La Direction n'est soumise à aucun pointage ni contrôle de présence. Vous disposez de l'ensemble
                des privilèges et définissez les rôles, les droits et les affectations.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Card: Mon Profil & Identifiants Direction */}
          <Card className="p-5 shadow-card">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <h2 className="text-base font-bold text-ink">Mon Compte Direction</h2>
                <p className="text-xs text-ink-soft">Modifiez votre nom d'affichage ou vos identifiants</p>
              </div>
              <span className="rounded-full bg-surface-2 px-2.5 py-1 font-mono text-xs font-semibold text-ink-soft">
                login : {user?.login}
              </span>
            </div>

            <form onSubmit={handleUpdateProfile} className="mt-4 space-y-4">
              {/* Decoy hidden inputs to prevent Chrome / Edge aggressive autofill */}
              <div style={{ display: 'none' }} aria-hidden="true">
                <input type="text" name="fake_account_user" tabIndex={-1} autoComplete="off" />
                <input type="password" name="fake_account_pass" tabIndex={-1} autoComplete="off" />
              </div>

              <Field
                label="Identifiant de connexion"
                name="user_account_login"
                id="user_account_login"
                value={login}
                autoComplete="off"
                disabled={!canEditLogin}
                onChange={(e) => setLogin(e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, ''))}
                placeholder="ex. direction"
                hint={
                  canEditLogin
                    ? 'Lettres minuscules, chiffres, points et tirets (min. 3 caractères)'
                    : 'Modification réservée à la Direction ou ayants droit'
                }
                required
              />

              <Field
                label="Nom ou libellé d'affichage"
                name="user_account_display_name"
                id="user_account_display_name"
                autoComplete="off"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="ex. Direction du Monastère"
                required
              />

              <div className="border-t border-line/60 pt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-faint">
                  Changer de mot de passe (optionnel)
                </p>
                <div className="space-y-3">
                  <Field
                    label="Mot de passe actuel"
                    name="profile_current_password"
                    id="profile_current_password"
                    type="password"
                    autoComplete="off"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Requis uniquement si vous changez le mot de passe"
                  />
                  <Field
                    label="Nouveau mot de passe"
                    name="profile_new_password"
                    id="profile_new_password"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimum 6 caractères"
                  />
                  <Field
                    label="Confirmer le nouveau mot de passe"
                    name="profile_confirm_password"
                    id="profile_confirm_password"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Répétez le mot de passe"
                  />
                </div>
              </div>

              {profileError && (
                <div className="rounded-lg bg-red-wash/60 border border-red/20 p-2.5 text-xs font-medium text-red">
                  {profileError}
                </div>
              )}
              {profileSuccess && (
                <div className="rounded-lg bg-green-wash border border-green/20 p-2.5 text-xs font-medium text-green flex items-center gap-2">
                  <CheckCircle2 size={16} />
                  <span>{profileSuccess}</span>
                </div>
              )}

              <Button type="submit" variant="primary" loading={profileSaving} className="w-full">
                {profileSaving ? 'Enregistrement…' : 'Enregistrer les modifications'}
              </Button>
            </form>
          </Card>

          {/* Card: Raccourcis de Gouvernance & Attribution */}
          <Card className="p-5 shadow-card">
            <h2 className="text-base font-bold text-ink">Gouvernance &amp; Attribution des Droits</h2>
            <p className="text-xs text-ink-soft">Accès direct aux modules de configuration maîtres</p>

            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-line bg-surface p-3.5 flex items-center justify-between hover:border-amber/40 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-amber-wash text-amber">
                    <KeyRound size={18} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-ink">Rôles &amp; Permissions Dynamiques</p>
                    <p className="text-[11px] text-ink-soft">Créer des rôles sur-mesure et allouer les privilèges</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    sessionStorage.setItem('parametres_active_tab', 'permissions');
                    if (onNavigate) {
                      onNavigate('parametres');
                    } else {
                      window.location.hash = 'parametres';
                      window.dispatchEvent(new CustomEvent('nav-view', { detail: 'parametres' }));
                    }
                  }}
                  className="rounded-lg bg-paper-2 hover:bg-amber-wash hover:text-amber active:scale-95 transition-all px-3 py-1.5 text-xs font-semibold text-ink flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  Gérer <ExternalLink size={12} />
                </button>
              </div>

              <div className="rounded-xl border border-line bg-surface p-3.5 flex items-center justify-between hover:border-blue/40 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-blue-wash text-blue">
                    <Warehouse size={18} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-ink">Magasins, Dépôts &amp; Quincaillerie</p>
                    <p className="text-[11px] text-ink-soft">Créer les magasins et allouer les outils de chaque pôle</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (onNavigate) {
                      onNavigate('magasins');
                    } else {
                      window.location.hash = 'magasins';
                      window.dispatchEvent(new CustomEvent('nav-view', { detail: 'magasins' }));
                    }
                  }}
                  className="rounded-lg bg-paper-2 hover:bg-blue-wash hover:text-blue active:scale-95 transition-all px-3 py-1.5 text-xs font-semibold text-ink flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  Voir <ExternalLink size={12} />
                </button>
              </div>

              <div className="rounded-xl border border-line bg-surface p-3.5 flex items-center justify-between hover:border-green/40 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-green-wash text-green">
                    <Users size={18} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-ink">Comptes Utilisateurs &amp; Travailleurs</p>
                    <p className="text-[11px] text-ink-soft">Assigner les responsabilités aux collaborateurs</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (onNavigate) {
                      onNavigate('employes');
                    } else {
                      window.location.hash = 'employes';
                      window.dispatchEvent(new CustomEvent('nav-view', { detail: 'employes' }));
                    }
                  }}
                  className="rounded-lg bg-paper-2 hover:bg-green-wash hover:text-green active:scale-95 transition-all px-3 py-1.5 text-xs font-semibold text-ink flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  Équipe <ExternalLink size={12} />
                </button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // =========================================================================
  // ESPACE PERSONNEL TRAVAILLEUR / MENUISIER
  // =========================================================================
  if (error || !overview || !overview.employee) {
    return (
      <EmptyState
        icon={<IconAlert size={28} />}
        title="Fiche travailleur introuvable"
        hint="Votre compte n'est pas encore rattaché à une fiche travailleur active dans le système."
        action={<Button onClick={load}>Actualiser</Button>}
      />
    );
  }

  const { employee, situation, situationNote, today, history, month, openLoans, loansHistory = [], leaves } = overview;

  const historyRows = (history as unknown as Record<string, unknown>[]).map((h) => ({
    date: (h.date as string) ?? (h.punch_date as string) ?? '',
    in_at: (h.in_at as string) ?? null,
    out_at: (h.out_at as string) ?? null,
    break_in: (h.break_in as string) ?? null,
    break_out: (h.break_out as string) ?? null,
    late_minutes: Number(h.late_minutes ?? 0),
    late_reason: (h.late_reason as string) ?? null,
    status: (h.status as string) ?? 'absent',
  }));

  const retardsRows = historyRows.filter((h) => h.late_minutes > 0);
  const tools = catalog?.tools.filter((t) => magasinFilter === 'all' || t.magasin_id === magasinFilter) ?? [];
  const availableTools = tools.filter((t) => t.status === 'disponible');

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Espace Personnel · ${employee.full_name}`}
        hint={`Matricule ${employee.id} · ${employee.job_title}`}
      />

      {/* Hero Card : Situation du jour */}
      <Card className="bg-gradient-to-br from-charcoal to-charcoal-2 text-white shadow-pop">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-white/50">Ma situation aujourd'hui</p>
            <p className="mt-1 text-2xl font-extrabold tracking-tight text-white">
              {SITUATION_LABEL[situation] ?? situation}
            </p>
            {situationNote && <p className="mt-1 text-sm text-white/70">{situationNote}</p>}
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-white/50">Pointages enregistrés</p>
            <p className="mt-1 font-mono text-xl font-bold text-amber">
              {today?.in_at ?? '-'} → {today?.out_at ?? '-'}
            </p>
            {today?.break_in && (
              <p className="text-xs text-white/60">
                Pause : {today.break_in} → {today.break_out ?? 'en cours'}
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* KPIs du mois */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Présences ce mois" value={month.daysPresent} icon={<IconClock size={16} />} />
        <StatCard
          label="Retards constatés"
          value={month.lateCount}
          tone={month.lateCount > 0 ? 'amber' : 'neutral'}
          icon={<IconAlert size={16} />}
        />
        <StatCard
          label="Outils en ma possession"
          value={openLoans.length}
          tone={openLoans.length > 0 ? 'amber' : 'neutral'}
          icon={<IconWrench size={16} />}
        />
      </div>

      {/* 5 Onglets complets et horodatés */}
      <SegmentedControl
        value={tab}
        onChange={setTab}
        options={[
          { value: 'presences', label: 'Présences & Pauses', icon: <IconClock size={14} /> },
          { value: 'retards', label: `Retards (${retardsRows.length})`, icon: <AlertTriangle size={14} /> },
          { value: 'conges', label: `Congés (${leaves.length})`, icon: <FileCheck2 size={14} /> },
          { value: 'outillage', label: `Mes Outils (${loansHistory.length})`, icon: <IconWrench size={14} /> },
          { value: 'catalogue', label: 'Matériel Disponible', icon: <IconBox size={14} /> },
          { value: 'profil', label: 'Mon Compte', icon: <KeyRound size={14} /> },
        ]}
      />

      {/* ONGLET 1 : PRÉSENCES & PAUSES */}
      {tab === 'presences' && (
        <Card padded={false} className="shadow-card overflow-hidden">
          {historyRows.length === 0 ? (
            <EmptyState icon={<IconHistory size={24} />} title="Aucun pointage récent" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-surface-2/60 text-left text-xs uppercase tracking-wider text-ink-faint">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Arrivée</th>
                    <th className="px-4 py-3">Début Pause</th>
                    <th className="px-4 py-3">Reprise Pause</th>
                    <th className="px-4 py-3">Départ</th>
                    <th className="px-4 py-3">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {historyRows.map((h) => (
                    <tr key={h.date} className="hover:bg-surface-2/50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-ink">{formatDate(h.date)}</td>
                      <td className="px-4 py-3 font-mono font-medium text-ink">{h.in_at ?? '-'}</td>
                      <td className="px-4 py-3 font-mono text-ink-soft">{h.break_in ?? '-'}</td>
                      <td className="px-4 py-3 font-mono text-ink-soft">{h.break_out ?? '-'}</td>
                      <td className="px-4 py-3 font-mono font-medium text-ink">{h.out_at ?? '-'}</td>
                      <td className="px-4 py-3">
                        {h.late_minutes > 0 ? (
                          <Chip tone="amber">Retard {h.late_minutes} min</Chip>
                        ) : h.in_at ? (
                          <Chip tone="green">Ponctuel</Chip>
                        ) : (
                          <span className="text-xs text-ink-faint">Absent</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* ONGLET 2 : RETARDS & MOTIFS */}
      {tab === 'retards' && (
        <Card padded={false} className="shadow-card overflow-hidden">
          {retardsRows.length === 0 ? (
            <div className="p-8 text-center text-ink-soft">
              <CheckCircle2 size={32} className="mx-auto text-green mb-2" />
              <p className="font-semibold text-ink">Aucun retard enregistré</p>
              <p className="text-xs text-ink-faint mt-1">Votre assiduité et votre ponctualité sont exemplaires.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-surface-2/60 text-left text-xs uppercase tracking-wider text-ink-faint">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Arrivée constatée</th>
                    <th className="px-4 py-3">Retard</th>
                    <th className="px-4 py-3">Motif justifié</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {retardsRows.map((h) => (
                    <tr key={h.date} className="hover:bg-surface-2/50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-ink">{formatDate(h.date)}</td>
                      <td className="px-4 py-3 font-mono font-semibold text-amber">{h.in_at}</td>
                      <td className="px-4 py-3">
                        <Chip tone="amber">{h.late_minutes} min</Chip>
                      </td>
                      <td className="px-4 py-3 text-sm text-ink-soft">
                        {h.late_reason || 'Motif non précisé'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* ONGLET 3 : CONGÉS & PERMISSIONS */}
      {tab === 'conges' && (
        <Card padded={false} className="shadow-card overflow-hidden">
          {leaves.length === 0 ? (
            <EmptyState icon={<FileCheck2 size={24} />} title="Aucune demande de congé" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-surface-2/60 text-left text-xs uppercase tracking-wider text-ink-faint">
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Période</th>
                    <th className="px-4 py-3">Motif</th>
                    <th className="px-4 py-3">Statut</th>
                    <th className="px-4 py-3">Avis Direction</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {leaves.map((l) => (
                    <tr key={l.id} className="hover:bg-surface-2/50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-ink capitalize">
                        {l.kind === 'conge' ? 'Congé' : l.kind === 'permission' ? 'Permission' : 'Absence'}
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-soft">
                        Du {formatDate(l.from_date)} au {formatDate(l.to_date)}
                      </td>
                      <td className="px-4 py-3 text-xs text-ink">{l.note || '-'}</td>
                      <td className="px-4 py-3">
                        <Chip tone={l.status === 'approved' ? 'green' : l.status === 'pending' ? 'amber' : 'red'}>
                          {l.status === 'approved' ? 'Approuvé' : l.status === 'pending' ? 'En attente' : 'Refusé'}
                        </Chip>
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-soft">
                        {l.reviewed_by ? `${l.reviewed_by} · ${l.review_note || 'Validé'}` : 'En cours d\'examen'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* ONGLET 4 : OUTILLAGE (PRÊTS & RETOURS HORODATÉS AVEC ÉTATS) */}
      {tab === 'outillage' && (
        <div className="space-y-4">
          {openLoans.length > 0 && (
            <Card className="border-amber/30 p-4">
              <p className="text-sm font-bold text-ink mb-3 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-amber animate-pulse" />
                Outils actuellement en ma possession ({openLoans.length})
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {openLoans.map((l) => (
                  <div key={l.id} className="rounded-xl border border-line bg-surface p-3.5 shadow-xs">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-bold text-ink">{l.tool_name}</p>
                        <p className="text-xs text-ink-soft">{l.tool_id} · {l.category}</p>
                      </div>
                      <Chip tone="amber">En cours</Chip>
                    </div>
                    <div className="mt-2.5 pt-2 border-t border-line text-xs text-ink-soft space-y-0.5">
                      <p>Sorti le : <span className="font-semibold text-ink">{formatDate(l.out_at)}</span></p>
                      {l.motive && <p>Motif : <span className="text-ink">{l.motive}</span></p>}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card padded={false} className="shadow-card overflow-hidden">
            <div className="p-4 border-b border-line bg-surface-2/40">
              <h3 className="text-sm font-bold text-ink">Historique de tous mes emprunts &amp; restitutions</h3>
              <p className="text-xs text-ink-soft">Suivi horodaté de l'état du matériel à la sortie et au retour</p>
            </div>

            {loansHistory.length === 0 ? (
              <EmptyState icon={<IconWrench size={24} />} title="Aucun emprunt d'outil enregistré" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line bg-surface-2/60 text-left text-xs uppercase tracking-wider text-ink-faint">
                      <th className="px-4 py-3">Outil</th>
                      <th className="px-4 py-3">Sortie (Horodatage)</th>
                      <th className="px-4 py-3">État Sortie</th>
                      <th className="px-4 py-3">Motif d'atelier</th>
                      <th className="px-4 py-3">Retour (Horodatage)</th>
                      <th className="px-4 py-3">État Retour</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {loansHistory.map((l) => (
                      <tr key={l.id} className="hover:bg-surface-2/50 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-bold text-ink">{l.tool_name}</p>
                          <p className="text-[11px] text-ink-faint font-mono">{l.tool_id}</p>
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-ink">
                          {formatDate(l.out_at)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-medium text-ink-soft">
                            {LOAN_COND_LABEL[l.out_condition ?? 'bon'] ?? l.out_condition ?? 'Bon'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-ink-soft">{l.motive || '-'}</td>
                        <td className="px-4 py-3 text-xs font-mono text-ink">
                          {l.returned_at ? formatDate(l.returned_at) : <Chip tone="amber">Non restitué</Chip>}
                        </td>
                        <td className="px-4 py-3">
                          {l.returned_at ? (
                            <div>
                              <Chip tone={l.return_condition === 'bon' ? 'green' : 'amber'}>
                                {LOAN_COND_LABEL[l.return_condition ?? 'bon'] ?? l.return_condition}
                              </Chip>
                              {l.return_notes && (
                                <p className="mt-0.5 text-[11px] text-ink-faint">{l.return_notes}</p>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-ink-faint">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ONGLET 5 : CATALOGUE MATÉRIEL DISPONIBLE */}
      {tab === 'catalogue' && (
        <div className="space-y-4">
          {catalog && catalog.magasins.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setMagasinFilter('all')}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  magasinFilter === 'all'
                    ? 'bg-charcoal text-white'
                    : 'bg-paper-2 text-ink-soft hover:bg-line'
                }`}
              >
                Tous les dépôts
              </button>
              {catalog.magasins.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMagasinFilter(m.id)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    magasinFilter === m.id
                      ? 'bg-charcoal text-white'
                      : 'bg-paper-2 text-ink-soft hover:bg-line'
                  }`}
                >
                  {m.name} ({m.code})
                </button>
              ))}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {availableTools.map((t) => (
              <div key={t.id} className="rounded-xl border border-line bg-surface p-3.5 shadow-xs">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-bold text-sm text-ink">{t.name}</p>
                    <p className="text-xs text-ink-soft">{t.id} · {t.category}</p>
                  </div>
                  <Chip tone="green">Disponible</Chip>
                </div>
                <div className="mt-2.5 pt-2 border-t border-line flex items-center justify-between text-xs text-ink-faint">
                  <span>Dépôt : {t.magasin_name || 'Atelier'}</span>
                  <span className="font-medium text-ink-soft capitalize">
                    {LOAN_COND_LABEL[t.condition] ?? t.condition}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {availableTools.length === 0 && (
            <EmptyState
              icon={<IconWrench size={24} />}
              title="Aucun outil disponible"
              hint="Tous les outils de ce magasin sont actuellement en cours d'utilisation ou en maintenance."
            />
          )}
        </div>
      )}

      {/* ONGLET 6 : MON COMPTE & IDENTIFIANTS */}
      {tab === 'profil' && (
        <div className="max-w-2xl">
          <Card className="p-5 shadow-card">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <h2 className="text-base font-bold text-ink">Mon Compte &amp; Sécurité</h2>
                <p className="text-xs text-ink-soft">Gérez vos informations de connexion et mot de passe</p>
              </div>
              <span className="rounded-full bg-surface-2 px-2.5 py-1 font-mono text-xs font-semibold text-ink-soft">
                login : {user?.login}
              </span>
            </div>

            <form onSubmit={handleUpdateProfile} className="mt-4 space-y-4">
              <div style={{ display: 'none' }} aria-hidden="true">
                <input type="text" name="fake_account_user" tabIndex={-1} autoComplete="off" />
                <input type="password" name="fake_account_pass" tabIndex={-1} autoComplete="off" />
              </div>

              <Field
                label="Identifiant de connexion"
                name="collaborator_login"
                id="collaborator_login"
                value={login}
                autoComplete="off"
                disabled={!canEditLogin}
                onChange={(e) => setLogin(e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, ''))}
                placeholder="ex. landry.onana"
                hint={
                  canEditLogin
                    ? 'Autorisé pour votre profil (lettres, chiffres, points et tirets)'
                    : 'Modification réservée à la Direction ou ayants droit'
                }
                required
              />

              <Field
                label="Nom complet affiché"
                name="collaborator_name"
                id="collaborator_name"
                autoComplete="off"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="ex. Landry ONANA"
                required
              />

              <div className="border-t border-line/60 pt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-faint">
                  Changer de mot de passe (optionnel)
                </p>
                <div className="space-y-3">
                  <Field
                    label="Mot de passe actuel"
                    name="collaborator_current_password"
                    id="collaborator_current_password"
                    type="password"
                    autoComplete="off"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Requis uniquement si vous changez le mot de passe"
                  />
                  <Field
                    label="Nouveau mot de passe"
                    name="collaborator_new_password"
                    id="collaborator_new_password"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimum 6 caractères"
                  />
                  <Field
                    label="Confirmer le nouveau mot de passe"
                    name="collaborator_confirm_password"
                    id="collaborator_confirm_password"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Répétez le mot de passe"
                  />
                </div>
              </div>

              {profileError && (
                <div className="rounded-lg bg-red-wash/60 border border-red/20 p-2.5 text-xs font-medium text-red">
                  {profileError}
                </div>
              )}
              {profileSuccess && (
                <div className="rounded-lg bg-green-wash border border-green/20 p-2.5 text-xs font-medium text-green flex items-center gap-2">
                  <CheckCircle2 size={16} />
                  <span>{profileSuccess}</span>
                </div>
              )}

              <Button type="submit" variant="primary" loading={profileSaving} className="w-full">
                {profileSaving ? 'Enregistrement…' : 'Enregistrer les modifications'}
              </Button>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
