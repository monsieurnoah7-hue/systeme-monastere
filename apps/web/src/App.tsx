import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { api, clearApiCache, setApiCacheUser, syncOfflineMutations, type ScanResult, type User } from './lib/api';
import { computeAllowedViews, Shell, type ViewId } from './components/Shell';
import { EmptyState, Spinner, ToastHost, useToast } from './components/ui';
import { UndoProvider } from './components/UndoToast';
import { Login } from './screens/Login';
import { ApiError } from './lib/api';
import { clearOfflinePermissions, clearOfflineUser, getOfflinePermissions, getOfflineUser, isOfflineLogoutPending, saveOfflinePermissions, saveOfflineUser, setOfflineLogoutPending } from './lib/offline';

const Scanner = lazy(() => import('./components/Scanner').then((m) => ({ default: m.Scanner })));
const Pointage = lazy(() => import('./screens/Pointage').then((m) => ({ default: m.Pointage })));
const Projets = lazy(() => import('./screens/Projets'));
const Outils = lazy(() => import('./screens/Outils').then((m) => ({ default: m.Outils })));
const Dashboard = lazy(() => import('./screens/Dashboard').then((m) => ({ default: m.Dashboard })));
const Stock = lazy(() => import('./screens/Stock').then((m) => ({ default: m.Stock })));
const Employees = lazy(() => import('./screens/Employees').then((m) => ({ default: m.Employees })));
const Magasins = lazy(() => import('./screens/Magasins').then((m) => ({ default: m.Magasins })));
const Espace = lazy(() => import('./screens/Espace').then((m) => ({ default: m.Espace })));
const Parametres = lazy(() => import('./screens/Parametres').then((m) => ({ default: m.Parametres })));

function preloadAllScreens() {
  const loaders = [
    () => import('./screens/Stock'),
    () => import('./screens/Outils'),
    () => import('./screens/Employees'),
    () => import('./screens/Dashboard'),
    () => import('./screens/Magasins'),
    () => import('./screens/Pointage'),
    () => import('./screens/Projets'),
    () => import('./screens/Espace'),
    () => import('./screens/Parametres'),
  ];
  const run = () => {
    loaders.forEach((fn) => {
      try { void fn(); } catch {}
    });
  };
  if (typeof window !== 'undefined') {
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(run, { timeout: 1500 });
    } else {
      setTimeout(run, 300);
    }
  }
}

export default function App() {
  const initialOfflineUser = useMemo(() => {
    if (isOfflineLogoutPending()) return null;
    const u = getOfflineUser<User>();
    if (u) setApiCacheUser(u.id);
    return u;
  }, []);

  const [user, setUser] = useState<User | null>(initialOfflineUser);
  const [booting, setBooting] = useState(() => !initialOfflineUser);

  useEffect(() => {
    preloadAllScreens();
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      if (isOfflineLogoutPending()) {
        if (navigator.onLine) {
          try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* révoqué au prochain démarrage connecté */ }
          setOfflineLogoutPending(false);
        }
        clearOfflineUser();
        if (!cancelled) {
          setApiCacheUser(null);
          setUser(null);
          setBooting(false);
        }
        return;
      }

      // Si l'utilisateur est déjà chargé hors ligne, vérifier la session en arrière-plan sans bloquer
      try {
        const res = await api<{ user: User | null }>('/api/auth/me', { timeoutMs: 3_000 });
        if (res.user) {
          setApiCacheUser(res.user.id);
          saveOfflineUser(res.user);
          if (!cancelled) setUser(res.user);
        } else {
          clearOfflineUser();
          setApiCacheUser(null);
          if (!cancelled) setUser(null);
        }
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          clearOfflineUser();
          setApiCacheUser(null);
          if (!cancelled) setUser(null);
        } else {
          // Hors-ligne ou connexion faible : conserver l'utilisateur local
          const offlineUser = getOfflineUser<User>();
          if (offlineUser) {
            setApiCacheUser(offlineUser.id);
            if (!cancelled) setUser(offlineUser);
          }
        }
      } finally {
        if (!cancelled) setBooting(false);
      }
    }
    void bootstrap();

    function handleUserUpdate(e: CustomEvent<User>) {
      if (e.detail) {
        setApiCacheUser(e.detail.id);
        saveOfflineUser(e.detail);
        setUser((prev) => (prev ? { ...prev, ...e.detail } : e.detail));
      }
    }
    window.addEventListener('auth:user-updated' as any, handleUserUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener('auth:user-updated' as any, handleUserUpdate);
    };
  }, []);

  async function logout() {
    const currentUserId = user?.id;
    let serverLogoutConfirmed = false;
    try {
      await api('/api/auth/logout', { method: 'POST' });
      serverLogoutConfirmed = true;
    } catch {
      // la session est déjà close côté serveur
    }
    setOfflineLogoutPending(!serverLogoutConfirmed);
    if (currentUserId !== undefined) {
      clearApiCache();
      clearOfflinePermissions(currentUserId);
    }
    clearOfflineUser();
    setApiCacheUser(null);
    setUser(null);
  }

  function acceptLogin(nextUser: User) {
    setOfflineLogoutPending(false);
    setApiCacheUser(nextUser.id);
    saveOfflineUser(nextUser);
    setUser(nextUser);
  }

  useEffect(() => {
    if (!user) return;
    const synchronize = async () => {
      if (!navigator.onLine) return;
      try {
        const session = await api<{ user: User | null }>('/api/auth/me', { bypassCache: true });
        if (session.user?.id !== user.id) {
          if (!session.user) {
            clearOfflineUser();
            setApiCacheUser(null);
            setUser(null);
          }
          return;
        }
        await syncOfflineMutations(user.id);
        window.dispatchEvent(new CustomEvent('mf-refresh-data'));
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          clearOfflineUser();
          setApiCacheUser(null);
          setUser(null);
          return;
        }
        // Réseau instable ou session expirée : la file reste locale et sera retentée après reconnexion.
      }
    };
    synchronize();
    window.addEventListener('online', synchronize);
    return () => window.removeEventListener('online', synchronize);
  }, [user?.id]);

  if (booting) {
    return <div className="grid min-h-full place-items-center bg-paper"><Spinner /></div>;
  }

  if (!user) {
    return (
      <ToastHost>
        <Login onLogin={acceptLogin} />
      </ToastHost>
    );
  }

  return (
    <ToastHost>
      <UndoProvider>
        <Workspace user={user} onLogout={() => void logout()} />
      </UndoProvider>
    </ToastHost>
  );
}

function Workspace({ user, onLogout }: { user: User; onLogout: () => void }) {
  const toast = useToast();
  const [permissions, setPermissions] = useState<Record<string, boolean> | null>(() => getOfflinePermissions(user.id) ?? null);

  useEffect(() => {
    let cancelled = false;
    function fetchPermissions() {
      api<{ role: string; superAdmin: boolean; permissions: Record<string, boolean> }>('/api/permissions/me', { timeoutMs: 3_500 })
        .then((res) => {
          if (!cancelled && res?.permissions) {
            setPermissions(res.permissions);
            saveOfflinePermissions(user.id, res.permissions);
          }
        })
        .catch(() => {
          const saved = getOfflinePermissions(user.id);
          if (!cancelled && saved) setPermissions(saved);
        });
    }
    fetchPermissions();

    const onPermsUpdated = () => fetchPermissions();
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchPermissions();
    };
    const refreshTimer = window.setInterval(fetchPermissions, 30_000);
    window.addEventListener('permissions:updated', onPermsUpdated);
    window.addEventListener('focus', onPermsUpdated);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener('permissions:updated', onPermsUpdated);
      window.removeEventListener('focus', onPermsUpdated);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(refreshTimer);
    };
  }, [user.id, user.role]);

  const allowed = useMemo(() => computeAllowedViews(user.role, permissions), [user.role, permissions]);
  const defaultView: ViewId = user.role === 'travailleur' ? 'espace' : (allowed[0] ?? 'espace');
  const [view, setView] = useState<ViewId>(defaultView);
  const [visitedViews, setVisitedViews] = useState<Set<ViewId>>(() => new Set([defaultView]));

  // Track visited views to keep them alive in DOM for instant 0ms tab switching
  useEffect(() => {
    if (view) {
      window.dispatchEvent(new CustomEvent('view-changed', { detail: view }));
      setVisitedViews((prev) => {
        if (prev.has(view)) return prev;
        const next = new Set(prev);
        next.add(view);
        return next;
      });
    }
  }, [view]);

  // Si la vue courante n'est plus autorisée après mise à jour des droits
  useEffect(() => {
    if (!allowed.includes(view)) {
      setView(allowed[0] ?? 'espace');
    }
  }, [allowed, view]);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  const onScanResult = useCallback((result: ScanResult) => {
    setScannerOpen(false);
    switch (result.kind) {
      case 'tool':
        setView('outils');
        setScanMessage(`Outil ${result.tool.id} — ${result.tool.name}`);
        break;
      case 'etabli_kit_item':
        setView('outils');
        setScanMessage(`${result.item.name} · Établi ${result.item.etabli_number} · ${result.item.etabli_location}`);
        break;
      case 'stock':
        setView('stock');
        setScanMessage(`Stock — ${result.ref.name}`);
        break;
      case 'employee':
        if (user.role === 'travailleur') {
          setView('espace');
        } else {
          setView('employes');
        }
        setScanMessage(`${result.employee.full_name} (${result.employee.id})`);
        break;
      case 'terminal':
        setView('pointage');
        setScanMessage(`Terminal ${result.terminal.id}`);
        break;
      case 'ignored':
        setScanMessage(result.reason);
        break;
      default:
        setScanMessage(`Code non reconnu : ${result.code}`);
    }
    if (result.kind === 'tool' || result.kind === 'stock' || result.kind === 'employee' || result.kind === 'etabli_kit_item') {
      setScan(result);
    }
  }, [user.role]);

  useEffect(() => {
    if (!scanMessage) return;
    toast(scanMessage, 'info');
    const t = window.setTimeout(() => setScanMessage(null), 4000);
    return () => window.clearTimeout(t);
  }, [scanMessage, toast]);

  // Global view navigation listener (custom events & hash navigation)
  useEffect(() => {
    const handleNav = (e: Event) => {
      const targetView = (e as CustomEvent<ViewId>).detail;
      if (targetView && allowed.includes(targetView)) {
        setView(targetView);
      }
    };
    const handleHash = () => {
      const raw = window.location.hash.replace(/^#/, '').split('/')[0];
      if (raw === 'kiosk') {
        if (allowed.includes('pointage')) setView('pointage');
        return;
      }
      if (raw && (allowed as string[]).includes(raw)) {
        setView(raw as ViewId);
      }
    };
    window.addEventListener('nav-view', handleNav as EventListener);
    window.addEventListener('hashchange', handleHash);
    return () => {
      window.removeEventListener('nav-view', handleNav as EventListener);
      window.removeEventListener('hashchange', handleHash);
    };
  }, [allowed]);

  const activeView: ViewId | null = allowed.includes(view) ? view : (allowed[0] ?? null);
  const canScan =
    activeView !== null &&
    activeView !== 'pointage' &&
    (user.role === 'direction' || (permissions ? !!permissions['scanner.use'] : false));

  return (
    <>
      <Shell
        user={user}
        view={activeView ?? 'espace'}
        onView={setView}
        onLogout={onLogout}
        onScan={canScan ? () => setScannerOpen(true) : undefined}
        allowedViews={allowed}
      >
        {!activeView ? (
          <EmptyState
            title="Aucun module accessible avec ce profil"
            hint="Le pointage s’effectue sur un terminal enregistré de l’atelier, sans compte utilisateur."
          />
        ) : (
          <Suspense
            fallback={
              <div className="grid h-64 place-items-center">
                <Spinner />
              </div>
            }
          >
            {visitedViews.has('dashboard') && (
              <div className={activeView === 'dashboard' ? 'contents' : 'hidden'} aria-hidden={activeView !== 'dashboard'}>
                <Dashboard active={activeView === 'dashboard'} />
              </div>
            )}
            {visitedViews.has('projets') && (
              <div className={activeView === 'projets' ? 'contents' : 'hidden'} aria-hidden={activeView !== 'projets'}>
                <Projets user={user} permissions={permissions} />
              </div>
            )}
            {visitedViews.has('outils') && (
              <div className={activeView === 'outils' ? 'contents' : 'hidden'} aria-hidden={activeView !== 'outils'}>
                <Outils user={user} scan={scan} permissions={permissions} />
              </div>
            )}
            {visitedViews.has('pointage') && (
              <div className={activeView === 'pointage' ? 'contents' : 'hidden'} aria-hidden={activeView !== 'pointage'}>
                <Pointage user={user} permissions={permissions} />
              </div>
            )}
            {visitedViews.has('stock') && (
              <div className={activeView === 'stock' ? 'contents' : 'hidden'} aria-hidden={activeView !== 'stock'}>
                <Stock user={user} scan={scan} permissions={permissions} />
              </div>
            )}
            {visitedViews.has('employes') && (
              <div className={activeView === 'employes' ? 'contents' : 'hidden'} aria-hidden={activeView !== 'employes'}>
                <Employees user={user} scan={scan} permissions={permissions} />
              </div>
            )}
            {visitedViews.has('magasins') && (
              <div className={activeView === 'magasins' ? 'contents' : 'hidden'} aria-hidden={activeView !== 'magasins'}>
                <Magasins user={user} scan={scan} permissions={permissions} />
              </div>
            )}
            {visitedViews.has('espace') && (
              <div className={activeView === 'espace' ? 'contents' : 'hidden'} aria-hidden={activeView !== 'espace'}>
                <Espace scan={scan} user={user} permissions={permissions} onNavigate={setView} />
              </div>
            )}
            {visitedViews.has('parametres') && (
              <div className={activeView === 'parametres' ? 'contents' : 'hidden'} aria-hidden={activeView !== 'parametres'}>
                <Parametres user={user} permissions={permissions} />
              </div>
            )}
          </Suspense>
        )}
      </Shell>
      {scannerOpen && (
        <Suspense fallback={<div className="fixed inset-0 z-50 grid place-items-center bg-charcoal"><Spinner /></div>}>
          <Scanner open onClose={() => setScannerOpen(false)} onResult={onScanResult} />
        </Suspense>
      )}
    </>
  );
}
