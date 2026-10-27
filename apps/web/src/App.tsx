import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { api, type ScanResult, type User } from './lib/api';
import { computeAllowedViews, Shell, type ViewId } from './components/Shell';
import { Scanner } from './components/Scanner';
import { EmptyState, Spinner, ToastHost, useToast } from './components/ui';
import { Login } from './screens/Login';

const Pointage = lazy(() => import('./screens/Pointage').then((m) => ({ default: m.Pointage })));
const Outils = lazy(() => import('./screens/Outils').then((m) => ({ default: m.Outils })));
const Dashboard = lazy(() => import('./screens/Dashboard').then((m) => ({ default: m.Dashboard })));
const Stock = lazy(() => import('./screens/Stock').then((m) => ({ default: m.Stock })));
const Employees = lazy(() => import('./screens/Employees').then((m) => ({ default: m.Employees })));
const Magasins = lazy(() => import('./screens/Magasins').then((m) => ({ default: m.Magasins })));
const Espace = lazy(() => import('./screens/Espace').then((m) => ({ default: m.Espace })));
const Parametres = lazy(() => import('./screens/Parametres').then((m) => ({ default: m.Parametres })));

export default function App() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    api<{ user: User | null }>('/api/auth/me')
      .then((res) => setUser(res.user))
      .catch(() => setUser(null));

    function handleUserUpdate(e: CustomEvent<User>) {
      if (e.detail) {
        setUser((prev) => (prev ? { ...prev, ...e.detail } : e.detail));
      }
    }
    window.addEventListener('auth:user-updated' as any, handleUserUpdate);
    return () => window.removeEventListener('auth:user-updated' as any, handleUserUpdate);
  }, []);

  async function logout() {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      // la session est déjà close côté serveur
    }
    setUser(null);
  }

  if (!user) {
    return (
      <ToastHost>
        <Login onLogin={setUser} />
      </ToastHost>
    );
  }

  return (
    <ToastHost>
      <Workspace user={user} onLogout={() => void logout()} />
    </ToastHost>
  );
}

function Workspace({ user, onLogout }: { user: User; onLogout: () => void }) {
  const toast = useToast();
  const [permissions, setPermissions] = useState<Record<string, boolean> | null>(null);

  useEffect(() => {
    let cancelled = false;
    function fetchPermissions() {
      api<{ role: string; superAdmin: boolean; permissions: Record<string, boolean> }>('/api/permissions/me')
        .then((res) => {
          if (!cancelled && res?.permissions) setPermissions(res.permissions);
        })
        .catch(() => {});
    }
    fetchPermissions();

    const onPermsUpdated = () => fetchPermissions();
    window.addEventListener('permissions:updated', onPermsUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener('permissions:updated', onPermsUpdated);
    };
  }, [user.role]);

  const allowed = useMemo(() => computeAllowedViews(user.role, permissions), [user.role, permissions]);
  const defaultView: ViewId = user.role === 'travailleur' ? 'espace' : (allowed[0] ?? 'espace');
  const [view, setView] = useState<ViewId>(defaultView);
  const [visitedViews, setVisitedViews] = useState<Set<ViewId>>(() => new Set([defaultView]));

  // Preload remaining screen chunks in background during browser idle
  useEffect(() => {
    const idle = typeof window !== 'undefined' && 'requestIdleCallback' in window
      ? (window as any).requestIdleCallback
      : (cb: () => void) => setTimeout(cb, 200);
    idle(() => {
      import('./screens/Dashboard').catch(() => {});
      import('./screens/Outils').catch(() => {});
      import('./screens/Magasins').catch(() => {});
      import('./screens/Stock').catch(() => {});
      import('./screens/Employees').catch(() => {});
      import('./screens/Pointage').catch(() => {});
      import('./screens/Parametres').catch(() => {});
      import('./screens/Espace').catch(() => {});
    });
  }, []);

  // Track visited views to keep them alive in DOM for instant 0ms tab switching
  useEffect(() => {
    if (view) {
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
    if (result.kind === 'tool' || result.kind === 'stock' || result.kind === 'employee') {
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
      const raw = window.location.hash.replace(/^#/, '') as ViewId;
      if (raw && allowed.includes(raw)) {
        setView(raw);
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
  const canScan = activeView !== null && activeView !== 'pointage';

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
                <Dashboard />
              </div>
            )}
            {visitedViews.has('outils') && (
              <div className={activeView === 'outils' ? 'contents' : 'hidden'} aria-hidden={activeView !== 'outils'}>
                <Outils user={user} scan={scan} permissions={permissions} />
              </div>
            )}
            {visitedViews.has('pointage') && (
              <div className={activeView === 'pointage' ? 'contents' : 'hidden'} aria-hidden={activeView !== 'pointage'}>
                <Pointage />
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
                <Espace scan={scan} user={user} onNavigate={setView} />
              </div>
            )}
            {visitedViews.has('parametres') && (
              <div className={activeView === 'parametres' ? 'contents' : 'hidden'} aria-hidden={activeView !== 'parametres'}>
                <Parametres user={user} />
              </div>
            )}
          </Suspense>
        )}
      </Shell>
      <Scanner open={scannerOpen} onClose={() => setScannerOpen(false)} onResult={onScanResult} />
    </>
  );
}
