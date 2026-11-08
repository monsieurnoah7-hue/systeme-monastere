import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, type Catalog, type MyEtabli, type MyOverview, type ScanResult, type User, requestWorkerPermission } from '../lib/api';
import type { ViewId } from '../components/Shell';
import {
  Banner,
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  Skeleton,
  Spinner,
  cx,
  useToast,
} from '../components/ui';
import {
  IconAlert,
  IconBox,
  IconClock,
  IconHistory,
  IconWrench,
} from '../components/Icons';
import { formatDate, initials } from '../lib/labels';
import {
  ShieldCheck,
  CheckCircle2,
  KeyRound,
  Users,
  Warehouse,
  FileCheck2,
  AlertTriangle,
  Plus,
  Lock,
  ChevronRight,
  Clock,
  User as UserIcon,
  Compass,
  RefreshCw,
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
  const [tab, setTab] = useState<'presences' | 'retards' | 'conges' | 'outillage' | 'etabli' | 'catalogue' | 'profil'>('presences');
  const [myEtabli, setMyEtabli] = useState<MyEtabli | null>(null);
  const [auditChoices, setAuditChoices] = useState<Record<number, MyEtabli['items'][number]['condition']>>({});
  const [auditNote, setAuditNote] = useState('');
  const [auditBusy, setAuditBusy] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
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

  // Mobile-first ergonomics & live presence
  const [mobileTab, setMobileTab] = useState<'gouvernance' | 'profil'>('gouvernance');
  const [connectedUsers, setConnectedUsers] = useState<Array<{
    id: number;
    login: string;
    display_name: string;
    role: string;
    photo_path: string | null;
    last_active_at: string;
  }>>([]);
  const [showConnectedMenu, setShowConnectedMenu] = useState(false);

  useEffect(() => {
    let mounted = true;
    const fetchConnected = () => {
      api<{ users: Array<{ id: number; login: string; display_name: string; role: string; photo_path: string | null; last_active_at: string }> }>(
        '/api/auth/connected-users',
      )
        .then((res) => {
          if (mounted && res?.users) {
            setConnectedUsers(res.users);
          }
        })
        .catch(() => {});
    };
    fetchConnected();
    const interval = setInterval(fetchConnected, 30000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const isDirection = user?.role === 'direction';
  const canEditLogin = isDirection || Boolean(permissions?.['profile.login_edit']) || Boolean(permissions?.['users.manage']);

  const toast = useToast();
  const [permissionModalOpen, setPermissionModalOpen] = useState(false);
  const [permForm, setPermForm] = useState({ from_date: '', to_date: '', note: '' });
  const [permBusy, setPermBusy] = useState(false);
  const [permError, setPermError] = useState<string | null>(null);

  const submitWorkerPermission = async () => {
    if (!permForm.from_date || !permForm.to_date) {
      setPermError('Veuillez sélectionner les dates de début et de fin.');
      return;
    }
    if (!permForm.note.trim()) {
      setPermError('Veuillez préciser le motif de votre permission exceptionnelle.');
      return;
    }
    setPermBusy(true);
    setPermError(null);
    try {
      await requestWorkerPermission({
        from_date: permForm.from_date,
        to_date: permForm.to_date,
        note: permForm.note.trim(),
      });
      toast('Demande de permission exceptionnelle transmise à la Direction.', 'success');
      setPermissionModalOpen(false);
      setPermForm({ from_date: '', to_date: '', note: '' });
      void load();
    } catch (err: unknown) {
      setPermError(err instanceof Error ? err.message : 'Erreur lors de la transmission.');
    } finally {
      setPermBusy(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, cat, kit] = await Promise.all([
        api<MyOverview>('/api/me/overview').catch(() => null),
        api<Catalog>('/api/me/catalog').catch(() => null),
        api<MyEtabli>('/api/me/kit').catch(() => null),
      ]);
      setOverview(ov);
      setCatalog(cat);
      setMyEtabli(kit);
      setAuditChoices({});
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
        window.dispatchEvent(new CustomEvent('mf-refresh-data'));
        void load();
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
    const userPhoto = user?.photo_path || overview?.employee?.photo_path || (user?.employee_id ? `/photos/employees/${user.employee_id}.jpg` : '/photos/employees/EMP-001.jpg');

    return (
      <div className="space-y-4">
        {/* Executive Header Strip with Real Profile Photo & Facebook-Style Live Presence */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-line/70 pb-3.5">
          <div className="flex items-center gap-3.5 min-w-0">
            {/* Real Profile Photo with adequate & pleasant size and Facebook-style Presence Dot */}
            <div className="relative shrink-0">
              <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-2xl overflow-hidden border-2 border-line/80 bg-surface shadow-md">
                <img
                  src={userPhoto}
                  alt={displayName || 'Direction Générale'}
                  className="h-full w-full object-cover object-top"
                  onError={(e) => {
                    const target = e.currentTarget;
                    target.style.display = 'none';
                    if (target.nextElementSibling) {
                      (target.nextElementSibling as HTMLElement).style.display = 'grid';
                    }
                  }}
                />
                <div
                  style={{ display: 'none' }}
                  className="h-full w-full place-items-center bg-amber-wash text-amber text-lg font-bold"
                >
                  {initials(displayName || 'Direction')}
                </div>
              </div>
              {/* Facebook-style status dot */}
              <span
                className="absolute bottom-0 right-0 h-3 w-3 sm:h-3.5 sm:w-3.5 rounded-full bg-emerald-500 ring-2 ring-surface shadow-xs"
                title="En direct"
              />
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-ink truncate">
                  {displayName || 'Direction Générale'}
                </h1>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold bg-amber-wash text-amber border border-amber/30 shadow-xs">
                  <ShieldCheck size={12} className="shrink-0" />
                  <span>Super-Admin Permanent</span>
                </span>
              </div>
              <p className="text-[11px] text-ink-soft truncate mt-0.5">
                Direction du Monastère des Bénédictins · Tous privilèges exécutifs · Non soumis au pointage
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-start sm:self-auto shrink-0 flex-wrap">
            {/* Facebook-style Live Active Collaborators Indicator */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowConnectedMenu((prev) => !prev)}
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[11px] font-semibold text-emerald-400 hover:bg-emerald-500/20 transition-all cursor-pointer shadow-xs active:scale-95"
                title="Afficher les sessions actives en direct"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span>
                  {connectedUsers.length > 1
                    ? `${connectedUsers.length} connectés en direct`
                    : '1 connecté en direct'}
                </span>
                <ChevronRight
                  size={12}
                  className={`text-emerald-400 transition-transform ${showConnectedMenu ? 'rotate-90' : ''}`}
                />
              </button>

              {/* Popover listing connected collaborators */}
              {showConnectedMenu && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowConnectedMenu(false)}
                  />
                  <div className="absolute left-0 sm:right-0 sm:left-auto top-full mt-2 w-72 max-w-[calc(100vw-2.5rem)] rounded-2xl border border-line bg-surface/95 backdrop-blur-md shadow-2xl p-3 z-50 animate-in fade-in zoom-in-95">
                    <div className="flex items-center justify-between border-b border-line pb-2 mb-2">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        <h4 className="text-xs font-bold text-ink">Collaborateurs en direct</h4>
                      </div>
                      <span className="text-[10px] font-medium text-ink-soft bg-surface-2 px-2 py-0.5 rounded-full border border-line">
                        {Math.max(1, connectedUsers.length)} en ligne
                      </span>
                    </div>

                    <div className="space-y-1.5 max-h-60 overflow-y-auto">
                      {(connectedUsers.length > 0 ? connectedUsers : [{
                        id: user?.id ?? 1,
                        login: user?.login ?? 'direction',
                        display_name: displayName || 'Direction Générale',
                        role: user?.role ?? 'direction',
                        photo_path: userPhoto,
                        last_active_at: new Date().toISOString()
                      }]).map((u) => {
                        const isMe = u.id === user?.id || u.login === user?.login;
                        const photo = u.photo_path || (u.login === 'direction' ? '/photos/employees/EMP-001.jpg' : null);
                        return (
                          <div
                            key={u.id}
                            className={`flex items-center justify-between p-2 rounded-xl border transition-all ${
                              isMe ? 'bg-amber-wash/40 border-amber/30' : 'bg-surface-2 border-line hover:border-line/80'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="relative h-8 w-8 rounded-lg overflow-hidden shrink-0 border border-line/60 bg-surface">
                                {photo ? (
                                  <img src={photo} alt={u.display_name} className="h-full w-full object-cover object-top" />
                                ) : (
                                  <div className="h-full w-full grid place-items-center bg-surface-2 text-[11px] font-bold text-ink">
                                    {initials(u.display_name || u.login)}
                                  </div>
                                )}
                                <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-1 ring-surface" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-ink truncate flex items-center gap-1">
                                  <span>{u.display_name}</span>
                                  {isMe && (
                                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber text-paper font-bold">
                                      Vous
                                    </span>
                                  )}
                                </p>
                                <p className="text-[10px] text-ink-soft truncate font-mono">@{u.login} · {u.role}</p>
                              </div>
                            </div>
                            <span className="text-[10px] font-medium text-emerald-400 shrink-0 flex items-center gap-1">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              En ligne
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>

            <span className="rounded-lg border border-line bg-surface-2 px-3 py-1 font-mono text-[11px] font-semibold text-ink-soft shadow-xs">
              login : {user?.login}
            </span>
          </div>
        </div>

        {/* Mobile-First Segmented Control (Smartphones / Tablets) */}
        <div className="grid grid-cols-2 p-1 rounded-xl bg-surface-2 border border-line lg:hidden gap-1">
          <button
            type="button"
            onClick={() => setMobileTab('gouvernance')}
            className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
              mobileTab === 'gouvernance'
                ? 'bg-surface text-ink shadow-sm border border-line font-bold'
                : 'text-ink-soft hover:text-ink'
            }`}
          >
            <Compass size={14} className="text-blue" />
            <span>Gouvernance &amp; Centres</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('profil')}
            className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
              mobileTab === 'profil'
                ? 'bg-surface text-ink shadow-sm border border-line font-bold'
                : 'text-ink-soft hover:text-ink'
            }`}
          >
            <UserIcon size={14} className="text-amber" />
            <span>Profil &amp; Paramètres</span>
          </button>
        </div>

        {/* Dual-Panel Single-View Workspace with EQUAL HEIGHTS */}
        <div className="grid gap-4 lg:grid-cols-12 items-stretch">
          {/* Panel 1: Profil & Identifiants (7 cols on desktop, responsive on mobile) */}
          <Card className={`lg:col-span-7 p-4 sm:p-5 shadow-card border-line flex flex-col justify-between ${mobileTab !== 'profil' ? 'hidden lg:flex' : 'flex'}`}>
            <div>
              <div className="flex items-center justify-between border-b border-line pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-paper-2 border border-line text-amber">
                    <UserIcon size={13} />
                  </span>
                  <div>
                    <h2 className="text-xs sm:text-sm font-bold text-ink">Profil &amp; Paramètres de Connexion</h2>
                    <p className="text-[10px] sm:text-[11px] text-ink-soft">Identifiant officiel et sécurité du compte Direction</p>
                  </div>
                </div>
              </div>

              <form id="profile-form" onSubmit={handleUpdateProfile} className="mt-3.5 space-y-3.5">
                {/* Decoy hidden inputs to prevent Chrome / Edge aggressive autofill */}
                <div style={{ display: 'none' }} aria-hidden="true">
                  <input type="text" name="fake_account_user" tabIndex={-1} autoComplete="off" />
                  <input type="password" name="fake_account_pass" tabIndex={-1} autoComplete="off" />
                </div>

                {/* 2-column input row on tablet/desktop */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                        ? 'Lettres minuscules, chiffres, points et tirets (min. 3)'
                        : 'Modification réservée à la Direction'
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
                </div>

                {/* Password Fields directly visible - NO accordion */}
                <div className="pt-2 border-t border-line/60 space-y-2.5">
                  <div className="flex items-center gap-1.5">
                    <Lock size={12} className="text-amber" />
                    <p className="text-xs font-semibold text-ink">Changer de mot de passe</p>
                    <span className="text-[10px] text-ink-faint font-normal">(Optionnel)</span>
                  </div>

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

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <Field
                      label="Nouveau mot de passe"
                      name="profile_new_password"
                      id="profile_new_password"
                      type="password"
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Min. 6 caractères"
                    />
                    <Field
                      label="Confirmer le mot de passe"
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
                  <div className="rounded-lg bg-red-wash/60 border border-red/20 p-2 text-xs font-medium text-red animate-in fade-in">
                    {profileError}
                  </div>
                )}
                {profileSuccess && (
                  <div className="rounded-lg bg-green-wash border border-green/20 p-2 text-xs font-medium text-green flex items-center gap-2 animate-in fade-in">
                    <CheckCircle2 size={15} />
                    <span>{profileSuccess}</span>
                  </div>
                )}
              </form>
            </div>

            <div className="flex items-center justify-end pt-3 mt-1 border-t border-line/40">
              <Button
                type="submit"
                form="profile-form"
                variant="primary"
                size="sm"
                loading={profileSaving}
                className="w-full sm:w-auto px-5 h-9 font-semibold shadow-xs text-xs"
              >
                {profileSaving ? 'Enregistrement…' : 'Enregistrer les modifications'}
              </Button>
            </div>
          </Card>

          {/* Panel 2: Raccourcis de Gouvernance & Attribution (5 cols on desktop, responsive on mobile) */}
          <Card className={`lg:col-span-5 p-4 sm:p-5 shadow-card border-line flex flex-col justify-between ${mobileTab !== 'gouvernance' ? 'hidden lg:flex' : 'flex'}`}>
            <div>
              <div className="flex items-center justify-between border-b border-line pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-paper-2 border border-line text-blue">
                    <Compass size={13} />
                  </span>
                  <div>
                    <h2 className="text-xs sm:text-sm font-bold text-ink">Gouvernance &amp; Centres Maîtres</h2>
                    <p className="text-[10px] sm:text-[11px] text-ink-soft">Accès directs aux modules de contrôle</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-3.5 flex-1 flex flex-col justify-between gap-2.5">
              {/* Tile 1: Rôles & Permissions Dynamiques */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => {
                  sessionStorage.setItem('parametres_active_tab', 'permissions');
                  if (onNavigate) {
                    onNavigate('parametres');
                  } else {
                    window.location.hash = 'parametres';
                    window.dispatchEvent(new CustomEvent('nav-view', { detail: 'parametres' }));
                  }
                }}
                className="group p-3 sm:p-3.5 rounded-xl border border-line bg-surface hover:border-amber/50 hover:bg-surface-2 transition-all cursor-pointer flex items-center justify-between shadow-xs active:scale-[0.99] flex-1 min-h-[58px]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="grid h-8 w-8 sm:h-9 sm:w-9 shrink-0 place-items-center rounded-lg bg-amber-wash text-amber border border-amber/20">
                    <KeyRound size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-ink truncate group-hover:text-amber transition-colors">
                      Rôles &amp; Permissions Dynamiques
                    </p>
                    <p className="text-[10px] sm:text-[11px] text-ink-soft truncate">
                      Créer des rôles sur-mesure et allouer les privilèges
                    </p>
                  </div>
                </div>
                <span className="shrink-0 text-ink-faint group-hover:text-amber group-hover:translate-x-0.5 transition-all ml-2">
                  <ChevronRight size={16} />
                </span>
              </div>

              {/* Tile 2: Pointage & Kiosques CFTM */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => {
                  sessionStorage.setItem('parametres_active_tab', 'kiosk');
                  if (onNavigate) {
                    onNavigate('parametres');
                  } else {
                    window.location.hash = 'parametres';
                    window.dispatchEvent(new CustomEvent('nav-view', { detail: 'parametres' }));
                  }
                }}
                className="group p-3 sm:p-3.5 rounded-xl border border-line bg-surface hover:border-amber/50 hover:bg-surface-2 transition-all cursor-pointer flex items-center justify-between shadow-xs active:scale-[0.99] flex-1 min-h-[58px]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="grid h-8 w-8 sm:h-9 sm:w-9 shrink-0 place-items-center rounded-lg bg-amber-wash text-amber border border-amber/20">
                    <Clock size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-ink truncate group-hover:text-amber transition-colors">
                      Pointage &amp; Kiosques d'Atelier
                    </p>
                    <p className="text-[10px] sm:text-[11px] text-ink-soft truncate">
                      Cadences, verrous stricts &amp; bornes tablettes
                    </p>
                  </div>
                </div>
                <span className="shrink-0 text-ink-faint group-hover:text-amber group-hover:translate-x-0.5 transition-all ml-2">
                  <ChevronRight size={16} />
                </span>
              </div>

              {/* Tile 3: Magasins & Stocks */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (onNavigate) {
                    onNavigate('magasins');
                  } else {
                    window.location.hash = 'magasins';
                    window.dispatchEvent(new CustomEvent('nav-view', { detail: 'magasins' }));
                  }
                }}
                className="group p-3 sm:p-3.5 rounded-xl border border-line bg-surface hover:border-blue/50 hover:bg-surface-2 transition-all cursor-pointer flex items-center justify-between shadow-xs active:scale-[0.99] flex-1 min-h-[58px]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="grid h-8 w-8 sm:h-9 sm:w-9 shrink-0 place-items-center rounded-lg bg-blue-wash text-blue border border-blue/20">
                    <Warehouse size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-ink truncate group-hover:text-blue transition-colors">
                      Magasins, Dépôts &amp; Quincaillerie
                    </p>
                    <p className="text-[10px] sm:text-[11px] text-ink-soft truncate">
                      Gestion des dépôts et affectation des outillages
                    </p>
                  </div>
                </div>
                <span className="shrink-0 text-ink-faint group-hover:text-blue group-hover:translate-x-0.5 transition-all ml-2">
                  <ChevronRight size={16} />
                </span>
              </div>

              {/* Tile 4: Travailleurs & Collaborateurs */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (onNavigate) {
                    onNavigate('employes');
                  } else {
                    window.location.hash = 'employes';
                    window.dispatchEvent(new CustomEvent('nav-view', { detail: 'employes' }));
                  }
                }}
                className="group p-3 sm:p-3.5 rounded-xl border border-line bg-surface hover:border-green/50 hover:bg-surface-2 transition-all cursor-pointer flex items-center justify-between shadow-xs active:scale-[0.99] flex-1 min-h-[58px]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="grid h-8 w-8 sm:h-9 sm:w-9 shrink-0 place-items-center rounded-lg bg-green-wash text-green border border-green/20">
                    <Users size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-ink truncate group-hover:text-green transition-colors">
                      Comptes Utilisateurs &amp; Travailleurs
                    </p>
                    <p className="text-[10px] sm:text-[11px] text-ink-soft truncate">
                      Fiches ouvriers, affectations &amp; responsabilités
                    </p>
                  </div>
                </div>
                <span className="shrink-0 text-ink-faint group-hover:text-green group-hover:translate-x-0.5 transition-all ml-2">
                  <ChevronRight size={16} />
                </span>
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
        action={
          <Button
            onClick={load}
            loading={loading}
            icon={<RefreshCw size={14} className={loading ? 'animate-spin' : ''} />}
          >
            {loading ? 'Actualisation…' : 'Actualiser'}
          </Button>
        }
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
  const submitDailyAudit = async () => {
    if (!myEtabli?.kit || auditBusy) return;
    if (myEtabli.items.some((item) => !auditChoices[item.id])) {
      setAuditError('Vérifiez chaque élément de la liste avant de terminer le contrôle.');
      return;
    }
    setAuditBusy(true);
    setAuditError(null);
    try {
      await api('/api/me/kit/audit', {
        method: 'POST',
        body: JSON.stringify({ items_status: myEtabli.items.map((item) => ({ id: item.id, condition: auditChoices[item.id] })), anomalies_note: auditNote }),
      });
      toast('Contrôle quotidien enregistré avec l’heure du serveur.', 'success');
      setAuditNote('');
      await load();
      setTab('etabli');
    } catch (err) {
      setAuditError(err instanceof Error ? err.message : 'Le contrôle n’a pas pu être enregistré.');
    } finally {
      setAuditBusy(false);
    }
  };
  const situationTone = situation === 'present' ? 'border-green/25 bg-green-wash text-green'
    : situation === 'late' ? 'border-amber/30 bg-amber/10 text-amber'
      : situation === 'conge' || situation === 'permission' ? 'border-blue/25 bg-blue-wash text-blue'
        : 'border-line bg-surface-2 text-ink-soft';

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 pb-4 sm:space-y-5">
      <PageHeader
        title="Mon espace"
        hint={`${employee.full_name} · ${employee.id} · ${employee.job_title}`}
      />

      <Card className="overflow-hidden border-line bg-surface p-0 shadow-card">
        <div className="grid gap-0 md:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)]">
          <div className="p-4 sm:p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Aujourd’hui</p>
            <div className="mt-2 flex flex-wrap items-center gap-2.5">
              <span className={cx('inline-flex min-h-8 items-center rounded-full border px-3 text-sm font-semibold', situationTone)}>
                {SITUATION_LABEL[situation] ?? situation}
              </span>
              {situationNote && <span className="text-xs leading-5 text-ink-soft">{situationNote}</span>}
            </div>
          </div>
          <div className="border-t border-line bg-surface-2/35 px-4 py-3 md:border-l md:border-t-0 sm:px-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Mes horaires enregistrés</p>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] text-ink-faint">Arrivée</p>
                <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-ink">{today?.in_at ?? '—'}</p>
              </div>
              <div>
                <p className="text-[11px] text-ink-faint">Départ</p>
                <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-ink">{today?.out_at ?? '—'}</p>
              </div>
            </div>
            {today?.break_in && (
              <p className="mt-2 border-t border-line/70 pt-2 text-xs text-ink-soft">
                Pause {today.break_in}–{today.break_out ?? 'en cours'}
              </p>
            )}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-2 sm:gap-3" aria-label="Résumé du mois">
        {[
          { label: 'Présences', value: month.daysPresent, icon: <IconClock size={15} />, tone: 'text-blue' },
          { label: 'Retards', value: month.lateCount, icon: <IconAlert size={15} />, tone: month.lateCount ? 'text-amber' : 'text-ink-faint' },
          { label: 'Outils prêtés', value: openLoans.length, icon: <IconWrench size={15} />, tone: openLoans.length ? 'text-amber' : 'text-ink-faint' },
        ].map((item) => (
          <Card key={item.label} className="min-w-0 p-3 shadow-xs sm:p-4">
            <div className="flex items-center justify-between gap-1">
              <span className="truncate text-[10px] font-medium text-ink-soft sm:text-xs">{item.label}</span>
              <span className={cx('shrink-0', item.tone)}>{item.icon}</span>
            </div>
            <p className="mt-1.5 text-xl font-semibold leading-none tabular-nums text-ink sm:text-2xl">{item.value}</p>
          </Card>
        ))}
      </div>

      <nav aria-label="Rubriques de mon espace" className="grid grid-cols-3 gap-1.5 rounded-xl border border-line bg-surface p-1.5 sm:flex sm:flex-wrap sm:gap-1 sm:p-1">
        {[
          { value: 'presences' as const, label: 'Présences', icon: <IconClock size={15} /> },
          { value: 'retards' as const, label: 'Retards', count: retardsRows.length, icon: <AlertTriangle size={15} /> },
          { value: 'conges' as const, label: 'Congés', count: leaves.length, icon: <FileCheck2 size={15} /> },
          { value: 'outillage' as const, label: 'Mes outils', count: loansHistory.length, icon: <IconWrench size={15} /> },
          ...(myEtabli?.kit ? [{ value: 'etabli' as const, label: 'Mon établi', count: myEtabli.daily.status === 'pending' || myEtabli.daily.status === 'overdue' ? 'À faire' : undefined, icon: <IconBox size={15} /> }] : []),
          { value: 'catalogue' as const, label: 'Disponibles', icon: <IconBox size={15} /> },
          { value: 'profil' as const, label: 'Mon compte', icon: <KeyRound size={15} /> },
        ].map((item) => (
          <button
            key={item.value}
            type="button"
            aria-current={tab === item.value ? 'page' : undefined}
            onClick={() => setTab(item.value)}
            className={cx(
              'flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-[11px] font-semibold transition-colors sm:min-h-10 sm:flex-1 sm:px-3 sm:text-xs',
              tab === item.value
                ? 'border-line bg-paper-2 text-ink shadow-xs'
                : 'border-transparent text-ink-soft hover:bg-paper-2/70 hover:text-ink',
            )}
          >
            <span className={cx('shrink-0', tab === item.value ? 'text-amber' : 'text-ink-faint')}>{item.icon}</span>
            <span className="truncate">{item.label}</span>
            {item.count !== undefined && <span className="shrink-0 text-[10px] tabular-nums text-ink-faint">{item.count}</span>}
          </button>
        ))}
      </nav>

      {myEtabli?.kit && (myEtabli.daily.status === 'pending' || myEtabli.daily.status === 'overdue') && (
        <button type="button" onClick={() => setTab('etabli')} className="flex w-full items-start gap-3 rounded-xl border border-amber/35 bg-amber-wash/30 p-3 text-left focus-visible:outline-2 focus-visible:outline-blue">
          <span className="mt-0.5 text-amber"><IconAlert size={18} /></span>
          <span className="min-w-0"><span className="block text-sm font-semibold text-ink">Contrôle de l’établi à effectuer aujourd’hui</span><span className="mt-0.5 block text-xs text-ink-soft">À terminer avant {myEtabli.daily.dueAt ?? 'la fin de votre journée'} · {myEtabli.kit.code}</span></span>
          <ChevronRight size={17} className="ml-auto mt-0.5 shrink-0 text-ink-faint" />
        </button>
      )}

      {tab === 'etabli' && myEtabli?.kit && (
        <Card className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
            <div><h2 className="text-base font-bold text-ink">Mon établi · n° {myEtabli.kit.etabli_number}</h2><p className="mt-1 text-xs text-ink-soft">{myEtabli.kit.location} · {myEtabli.kit.code}</p></div>
            <Chip tone={myEtabli.daily.status === 'done' ? 'green' : myEtabli.daily.status === 'overdue' ? 'red' : myEtabli.daily.status === 'exempt' ? 'grey' : 'amber'}>
              {myEtabli.daily.status === 'done' ? 'Contrôle terminé' : myEtabli.daily.status === 'overdue' ? 'Contrôle en retard' : myEtabli.daily.status === 'exempt' ? 'Aucun contrôle requis' : 'À contrôler aujourd’hui'}
            </Chip>
          </div>
          {myEtabli.daily.status === 'done' && myEtabli.daily.audit ? (
            <div className="rounded-xl border border-green/25 bg-green-wash/40 p-4 text-sm text-ink">
              <p className="font-semibold">Contrôle enregistré · {new Intl.DateTimeFormat('fr-FR', { timeZone: 'Africa/Douala', hour: '2-digit', minute: '2-digit' }).format(new Date(myEtabli.daily.audit.audited_at))}</p>
              <p className="mt-1 text-xs text-ink-soft">{myEtabli.daily.audit.items_present_count}/{myEtabli.daily.audit.items_total_count} éléments présents · {myEtabli.daily.audit.status === 'conforme' ? 'Tout est en bon état' : 'Un écart a été signalé'}</p>
            </div>
          ) : myEtabli.daily.status === 'exempt' ? (
            <p className="rounded-xl border border-line bg-surface-2 p-3 text-sm text-ink-soft">{myEtabli.daily.reason}</p>
          ) : (
            <>
              <p className="text-sm text-ink-soft">Contrôlez physiquement chaque outil puis indiquez son état. L’enregistrement est horodaté par le serveur et ne peut être effectué qu’une fois par jour.</p>
              {myEtabli.items.length === 0 ? <EmptyState icon={<IconWrench size={22} />} title="Aucun outil n’est encore ajouté à cet établi" /> : (
                <div className="divide-y divide-line rounded-xl border border-line">
                  {myEtabli.items.map((item) => (
                    <div key={item.id} className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(180px,auto)] sm:items-center">
                      <div className="min-w-0"><p className="text-sm font-semibold text-ink">{item.name}{item.qty > 1 ? ` · ${item.qty} ${item.unit}` : ''}</p><p className="mt-0.5 text-[11px] text-ink-faint">{item.tool_code}</p></div>
                      <select aria-label={`État : ${item.name}`} value={auditChoices[item.id] ?? ''} onChange={(event) => setAuditChoices((current) => ({ ...current, [item.id]: event.target.value as MyEtabli['items'][number]['condition'] }))} className="min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-blue sm:w-48">
                        <option value="" disabled>Choisir l’état…</option><option value="bon">Présent · bon état</option><option value="a_affuter">À affûter</option><option value="a_reparer">À réparer</option><option value="manquant">Manquant</option><option value="reforme">À réformer</option>
                      </select>
                    </div>
                  ))}
                </div>
              )}
              <label className="block text-xs font-medium text-ink-soft">Note si un élément est abîmé ou manquant<textarea value={auditNote} onChange={(event) => setAuditNote(event.target.value)} rows={2} maxLength={1000} className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink" placeholder="Précisez le problème (facultatif)" /></label>
              {auditError && <Banner tone="error">{auditError}</Banner>}
              <Button variant="primary" block loading={auditBusy} disabled={!myEtabli.items.length || myEtabli.items.some((item) => !auditChoices[item.id])} onClick={submitDailyAudit}>Terminer le contrôle du jour</Button>
            </>
          )}
        </Card>
      )}

      {/* ONGLET 1 : PRÉSENCES & PAUSES */}
      {tab === 'presences' && (
        <Card padded={false} className="shadow-card overflow-hidden">
          {historyRows.length === 0 ? (
            <div className="flex min-h-36 flex-col items-center justify-center gap-2 px-5 py-8 text-center">
              <span className="grid h-10 w-10 place-items-center rounded-full border border-line bg-surface-2 text-ink-faint"><IconHistory size={19} /></span>
              <div><p className="text-sm font-semibold text-ink">Aucun pointage récent</p><p className="mt-1 text-xs text-ink-soft">Vos horaires apparaîtront ici après votre pointage.</p></div>
            </div>
          ) : (
            <>
            <div className="space-y-2 p-3 md:hidden">
              {historyRows.map((h) => (
                <article key={h.date} className="rounded-xl border border-line bg-surface p-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-ink">{formatDate(h.date)}</h3>
                    {h.late_minutes > 0 ? <Chip tone="amber">Retard {h.late_minutes} min</Chip> : h.in_at ? <Chip tone="green">Ponctuel</Chip> : <span className="text-xs text-ink-faint">Absent</span>}
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-2.5 text-xs">
                    {[['Arrivée', h.in_at], ['Départ', h.out_at], ['Début pause', h.break_in], ['Reprise', h.break_out]].map(([label, time]) => (
                      <div key={label} className="flex items-center justify-between gap-2"><dt className="text-ink-faint">{label}</dt><dd className="font-mono font-medium tabular-nums text-ink">{time || '—'}</dd></div>
                    ))}
                  </dl>
                </article>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm table-rhythm">
                <thead>
                  <tr className="border-b border-line bg-surface-2/60 text-left text-xs uppercase tracking-wider text-ink-faint">
                    <th className="px-4 py-3 col-lead">Date</th>
                    <th className="px-4 py-3">Arrivée</th>
                    <th className="px-4 py-3">Début Pause</th>
                    <th className="px-4 py-3">Reprise Pause</th>
                    <th className="px-4 py-3">Départ</th>
                    <th className="px-4 py-3 text-right">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {historyRows.map((h, idx) => (
                    <tr
                      key={h.date}
                      className={cx(
                        'transition-colors',
                        idx % 2 === 0 ? 'bg-surface/95' : 'bg-surface-2/45',
                        'hover:bg-amber-wash/20',
                      )}
                    >
                      <td className="px-4 py-3 font-semibold text-ink col-lead">{formatDate(h.date)}</td>
                      <td className="px-4 py-3 font-mono font-medium text-ink">{h.in_at ?? '-'}</td>
                      <td className="px-4 py-3 font-mono text-ink-soft">{h.break_in ?? '-'}</td>
                      <td className="px-4 py-3 font-mono text-ink-soft">{h.break_out ?? '-'}</td>
                      <td className="px-4 py-3 font-mono font-medium text-ink">{h.out_at ?? '-'}</td>
                      <td className="px-4 py-3 text-right">
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
            </>
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
            <>
            <div className="space-y-2 p-3 md:hidden">
              {retardsRows.map((h) => (
                <article key={h.date} className="rounded-xl border border-line bg-surface p-3">
                  <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold text-ink">{formatDate(h.date)}</h3><Chip tone="amber">{h.late_minutes} min</Chip></div>
                  <p className="mt-2 text-xs text-ink-soft">Arrivée constatée <span className="ml-1 font-mono font-semibold text-amber">{h.in_at ?? '—'}</span></p>
                  <p className="mt-1 text-xs text-ink-faint">{h.late_reason || 'Motif non précisé'}</p>
                </article>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
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
            </>
          )}
        </Card>
      )}

      {/* ONGLET 3 : CONGÉS & PERMISSIONS */}
      {tab === 'conges' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4 shadow-card">
            <div className="space-y-0.5">
              <p className="text-xs font-bold text-ink flex items-center gap-2">
                <FileCheck2 size={16} className="text-amber" />
                Régime des Congés &amp; Permissions Exceptionnelles
              </p>
              <p className="text-[11px] text-ink-soft">
                Les congés annuels sont fixés et planifiés par la Direction. En cas d'événement imprévu (familial, médical, administratif), formulez une demande de permission exceptionnelle ci-dessous.
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              icon={<Plus size={14} />}
              onClick={() => {
                const t = new Date().toISOString().slice(0, 10);
                setPermForm({ from_date: t, to_date: t, note: '' });
                setPermError(null);
                setPermissionModalOpen(true);
              }}
              className="shrink-0"
            >
              Demander une permission
            </Button>
          </div>

          <Card padded={false} className="shadow-card overflow-hidden">
            {leaves.length === 0 ? (
              <EmptyState icon={<FileCheck2 size={24} />} title="Aucun congé ou permission enregistré" />
            ) : (
              <>
              <div className="space-y-2 p-3 md:hidden">
                {leaves.map((l) => (
                  <article key={l.id} className="rounded-xl border border-line bg-surface p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div><h3 className="text-sm font-semibold text-ink">{l.kind === 'conge' ? 'Congé annuel' : l.kind === 'permission' ? 'Permission exceptionnelle' : 'Absence autorisée'}</h3><p className="mt-1 text-xs text-ink-soft">Du {formatDate(l.from_date)} au {formatDate(l.to_date)}</p></div>
                      <Chip tone={l.status === 'approved' ? 'green' : l.status === 'pending' ? 'amber' : 'red'}>{l.status === 'approved' ? 'Accordé' : l.status === 'pending' ? 'En examen' : 'Refusé'}</Chip>
                    </div>
                    {l.note && <p className="mt-2 border-t border-line pt-2 text-xs text-ink-soft">{l.note}</p>}
                    {l.reviewed_by && <p className="mt-1 text-[11px] text-ink-faint">Avis : {l.review_note || 'Traité'} · {l.reviewed_by}</p>}
                  </article>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line bg-surface-2/60 text-left text-xs uppercase tracking-wider text-ink-faint">
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Période</th>
                      <th className="px-4 py-3">Motif &amp; Objet</th>
                      <th className="px-4 py-3">Statut</th>
                      <th className="px-4 py-3">Avis Direction</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {leaves.map((l) => (
                      <tr key={l.id} className="hover:bg-surface-2/50 transition-colors">
                        <td className="px-4 py-3 font-semibold text-ink">
                          <span className="flex items-center gap-1.5">
                            <span
                              className={cx(
                                'h-2 w-2 rounded-full',
                                l.kind === 'conge' ? 'bg-blue' : l.kind === 'permission' ? 'bg-[#8b5cf6]' : 'bg-red'
                              )}
                            />
                            {l.kind === 'conge' ? 'Congé Annuel Payé' : l.kind === 'permission' ? 'Permission Exceptionnelle' : 'Absence Autorisée'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-ink-soft whitespace-nowrap">
                          Du {formatDate(l.from_date)} au {formatDate(l.to_date)}
                        </td>
                        <td className="px-4 py-3 text-xs text-ink">
                          {l.kind === 'conge' ? (
                            <span className="text-ink-soft italic">Droit au repos annuel (alloué par la Direction)</span>
                          ) : (
                            l.note || '-'
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Chip tone={l.status === 'approved' ? 'green' : l.status === 'pending' ? 'amber' : 'red'}>
                            {l.status === 'approved' ? 'Accordé' : l.status === 'pending' ? 'En examen' : 'Refusé'}
                          </Chip>
                        </td>
                        <td className="px-4 py-3 text-xs text-ink-soft">
                          {l.reviewed_by ? `${l.reviewed_by} · ${l.review_note || 'Accordé'}` : 'En attente de visa'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </Card>
        </div>
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
              <>
              <div className="space-y-2 p-3 md:hidden">
                {loansHistory.map((l) => (
                  <article key={l.id} className="rounded-xl border border-line bg-surface p-3">
                    <div className="flex items-start justify-between gap-2"><div><h3 className="text-sm font-semibold text-ink">{l.tool_name}</h3><p className="text-[11px] font-mono text-ink-faint">{l.tool_id}</p></div>{l.returned_at ? <Chip tone={l.return_condition === 'bon' ? 'green' : 'amber'}>{LOAN_COND_LABEL[l.return_condition ?? 'bon'] ?? l.return_condition}</Chip> : <Chip tone="amber">À rendre</Chip>}</div>
                    <div className="mt-2 grid grid-cols-2 gap-2 border-t border-line pt-2 text-xs"><div><p className="text-ink-faint">Sortie</p><p className="mt-0.5 text-ink">{formatDate(l.out_at)}</p></div><div><p className="text-ink-faint">Retour</p><p className="mt-0.5 text-ink">{l.returned_at ? formatDate(l.returned_at) : 'En cours'}</p></div></div>
                    {l.motive && <p className="mt-2 text-xs text-ink-soft">Motif : {l.motive}</p>}
                  </article>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
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
              </>
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

      {/* Modal Demande de Permission Exceptionnelle par le Travailleur */}
      <Modal
        open={permissionModalOpen}
        title="Formuler une Demande de Permission Exceptionnelle"
        onClose={() => setPermissionModalOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPermissionModalOpen(false)}>Annuler</Button>
            <Button
              variant="primary"
              disabled={permBusy}
              onClick={() => void submitWorkerPermission()}
              className="bg-accent hover:bg-accent-2 text-white font-bold"
            >
              {permBusy ? <Spinner /> : 'Transmettre la demande'}
            </Button>
          </>
        }
      >
        <div className="space-y-3.5 text-xs">
          {permError && <Banner tone="error">{permError}</Banner>}

          <div className="rounded-xl border border-line bg-surface-2 p-3 text-ink-soft">
            ℹ️ <span className="font-semibold text-ink">Rappel réglementaire :</span> Les congés annuels sont fixés et alloués par la Direction. Ce formulaire concerne uniquement une dérogation ou permission exceptionnelle (urgence familiale, santé, impératif administratif).
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block font-medium text-ink-soft">Date de début</label>
              <input
                type="date"
                value={permForm.from_date}
                onChange={(e) => setPermForm((f) => ({ ...f, from_date: e.target.value }))}
                className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-xs text-ink focus:border-amber focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block font-medium text-ink-soft">Date de fin</label>
              <input
                type="date"
                value={permForm.to_date}
                onChange={(e) => setPermForm((f) => ({ ...f, to_date: e.target.value }))}
                className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-xs text-ink focus:border-amber focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block font-medium text-ink-soft">
              Motif circonstancié de la permission <span className="text-red">*</span>
            </label>
            <textarea
              value={permForm.note}
              onChange={(e) => setPermForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="Ex : Urgence médicale familiale, convocation officielle, événement exceptionnel…"
              rows={3}
              className="w-full rounded-lg border border-line bg-surface p-2.5 text-xs text-ink focus:border-amber focus:outline-none"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
