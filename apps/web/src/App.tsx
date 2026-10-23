import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { api, type ScanResult, type User } from './lib/api';
import { allowedViews, Shell, type ViewId } from './components/Shell';
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
  const allowed = allowedViews(user.role);
  const defaultView: ViewId = user.role === 'travailleur' ? 'espace' : (allowed[0] ?? 'espace');
  const [view, setView] = useState<ViewId>(defaultView);
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
        view={activeView ?? 'dashboard'}
        onView={setView}
        onLogout={onLogout}
        onScan={canScan ? () => setScannerOpen(true) : undefined}
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
            {
              {
                dashboard: <Dashboard />,
                outils: <Outils user={user} scan={scan} />,
                pointage: <Pointage />,
                stock: <Stock user={user} scan={scan} />,
                employes: <Employees user={user} scan={scan} />,
                magasins: <Magasins user={user} scan={scan} />,
                espace: <Espace scan={scan} user={user} onNavigate={setView} />,
                parametres: <Parametres user={user} />,
              }[activeView]
            }
          </Suspense>
        )}
      </Shell>
      <Scanner open={scannerOpen} onClose={() => setScannerOpen(false)} onResult={onScanResult} />
    </>
  );
}
