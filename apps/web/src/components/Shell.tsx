import { type ReactNode, useEffect, useState } from 'react';
import {
  Briefcase,
  Clock,
  Gauge,
  LogOut,
  Menu,
  Package,
  QrCode,
  Settings,
  User as UserIcon,
  Users,
  Warehouse,
  Wrench,
  X,
  CloudUpload,
  WifiOff,
} from 'lucide-react';
import type { MyPermissions, Role, User } from '../lib/api';
import { ROLE_LABEL, initials } from '../lib/labels';
import { CommandPalette } from './CommandPalette';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from './ui/drawer';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { cx } from './ui';
import { getLastServerSync, getOfflineSyncHistory, listOfflineMutations, type OfflineMutation, type OfflineSyncHistory, updateOfflineMutation } from '../lib/offline';

export type ViewId = 'dashboard' | 'projets' | 'outils' | 'pointage' | 'stock' | 'employes' | 'magasins' | 'espace' | 'parametres';

type NavItem = {
  id: ViewId;
  label: string;
  short: string;
  icon: (props: { size?: number; className?: string }) => ReactNode;
  roles: Role[];
};

const ALL_STAFF: Role[] = ['direction', 'magasinier', 'chef_atelier'];

export const NAV: NavItem[] = [
  { id: 'dashboard', label: 'Tableau de bord', short: 'Bord', icon: Gauge, roles: ALL_STAFF },
  { id: 'projets', label: 'Commandes & Chantiers', short: 'Chantiers', icon: Briefcase, roles: ALL_STAFF },
  { id: 'pointage', label: 'Pointage', short: 'Pointage', icon: Clock, roles: ALL_STAFF },
  { id: 'employes', label: 'Travailleurs', short: 'Équipe', icon: Users, roles: ['direction', 'magasinier', 'chef_atelier'] },
  { id: 'outils', label: 'Matériel & Machines', short: 'Machines', icon: Wrench, roles: ALL_STAFF },
  { id: 'stock', label: 'Matières & Quincaillerie', short: 'Matières', icon: Package, roles: ALL_STAFF },
  { id: 'magasins', label: 'Magasins', short: 'Magasins', icon: Warehouse, roles: ALL_STAFF },
  { id: 'espace', label: 'Mon Espace', short: 'Espace', icon: UserIcon, roles: ['direction', 'magasinier', 'chef_atelier', 'travailleur'] },
  { id: 'parametres', label: 'Paramètres', short: 'Réglages', icon: Settings, roles: ['direction'] },
];

export function computeAllowedViews(
  role: Role,
  permissions?: Record<string, boolean> | null,
): ViewId[] {
  // Super-Administrateur / Direction a accès à l'ensemble des modules
  if (role === 'direction') {
    return ['dashboard', 'projets', 'pointage', 'employes', 'outils', 'stock', 'magasins', 'espace', 'parametres'];
  }

  // Si la matrice des droits personnalisés est disponible
  if (permissions) {
    const views: ViewId[] = [];

    // 1. Mon Espace est universellement accessible à tout compte utilisateur connecté
    views.push('espace');

    // 2. Tableau de bord et commandes / chantiers : deux droits indépendants.
    if (permissions['dashboard.view']) {
      views.push('dashboard');
    }
    if (
      permissions['projects.view'] ||
      permissions['projects.report_incident'] ||
      permissions['projects.create'] ||
      permissions['projects.edit'] ||
      permissions['projects.delete']
    ) {
      views.push('projets');
    }

    // 3. Module Outils & Matériels
    if (
      permissions['tools.view'] ||
      permissions['loans.view'] ||
      permissions['tools.create'] ||
      permissions['tools.edit'] ||
      permissions['tools.delete'] ||
      permissions['tools.edit_status'] ||
      permissions['tools.photo_edit'] ||
      permissions['loans.create'] ||
      permissions['loans.return']
    ) {
      views.push('outils');
    }

    // 4. Module Stock & Quincaillerie
    if (
      permissions['stock.view'] ||
      permissions['stock.move'] ||
      permissions['stock.create_ref'] ||
      permissions['stock.edit_ref'] ||
      permissions['stock.delete_ref'] ||
      permissions['stock.photo_edit'] ||
      permissions['stock.correct']
    ) {
      views.push('stock');
    }

    // 5. Module Magasins
    if (permissions['magasins.view'] || permissions['magasins.manage']) {
      views.push('magasins');
    }

    // 6. Module Fiches Travailleurs
    if (
      permissions['employees.view'] ||
      permissions['employees.create'] ||
      permissions['employees.edit'] ||
      permissions['employees.photo_edit'] ||
      permissions['employees.print_badge'] ||
      permissions['leaves.view'] ||
      permissions['leaves.manage']
    ) {
      views.push('employes');
    }

    // 7. Module Pointage & Présences
    if (
      permissions['attendance.view'] ||
      permissions['attendance.correct'] ||
      permissions['terminals.access'] ||
      permissions['leaves.view'] ||
      permissions['leaves.manage']
    ) {
      views.push('pointage');
    }

    // 8. Module Paramètres
    if (
      permissions['settings.view'] ||
      permissions['settings.edit'] ||
      permissions['users.view'] ||
      permissions['users.manage'] ||
      permissions['terminals.manage'] ||
      permissions['permissions.manage']
    ) {
      views.push('parametres');
    }

    const ORDER: ViewId[] = [
      'dashboard',
      'projets',
      'pointage',
      'employes',
      'outils',
      'stock',
      'magasins',
      'espace',
      'parametres',
    ];
    return ORDER.filter((v) => views.includes(v));
  }

  // Fallback rétrocompatible pour les rôles historiques
  const legacyAllowed = NAV.filter((item) => item.roles.includes(role)).map((item) => item.id);
  if (legacyAllowed.length > 0) return legacyAllowed;

  // Tout nouveau rôle dispose par défaut au minimum de son Espace Personnel
  return ['espace'];
}

export function allowedViews(role: Role, permissions?: Record<string, boolean> | null): ViewId[] {
  return computeAllowedViews(role, permissions);
}

const NAV_CATEGORIES: { title: string; views: ViewId[] }[] = [
  { title: 'Pilotage & Vision', views: ['dashboard', 'projets'] },
  { title: 'Atelier & Magasins', views: ['outils', 'stock', 'magasins'] },
  { title: 'Équipe & Présences', views: ['pointage', 'employes', 'espace'] },
  { title: 'Administration', views: ['parametres'] },
];

function NavButton({
  item,
  active,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'group relative flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors duration-150 lg:min-h-0 lg:px-2.5 lg:text-xs',
        active
          ? 'bg-blue-500/10 text-sky-400 font-semibold border border-blue-500/20 shadow-xs'
          : 'text-ink-soft hover:bg-surface-2 hover:text-ink border border-transparent',
      )}
    >
      {active && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-blue" />
      )}
      <Icon
        size={16}
        className={cx(
          'shrink-0 transition-colors',
          active ? 'text-blue' : 'text-ink-faint group-hover:text-ink-soft',
        )}
      />
      <span className="flex-1 truncate tracking-tight">{item.label}</span>
      {active && <span className="h-1.5 w-1.5 rounded-full bg-blue shadow-xs" />}
    </button>
  );
}

export function Shell({
  user,
  view,
  onView,
  onLogout,
  onScan,
  allowedViews: allowedList,
  children,
}: {
  user: User;
  view: ViewId;
  onView: (view: ViewId) => void;
  onLogout: () => void;
  onScan?: () => void;
  allowedViews?: ViewId[];
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [pendingOfflineCount, setPendingOfflineCount] = useState(0);
  const [failedOfflineCount, setFailedOfflineCount] = useState(0);
  const [offlineMutations, setOfflineMutations] = useState<OfflineMutation[]>([]);
  const [offlineHistory, setOfflineHistory] = useState<OfflineSyncHistory[]>([]);
  const [lastServerSync, setLastServerSync] = useState<number | null>(() => getLastServerSync(user.id));
  const effectiveAllowed = allowedList ?? allowedViews(user.role);
  const items = NAV.filter((item) => effectiveAllowed.includes(item.id));

  // Keep the most-used destinations in the dock and always include the active screen.
  const mobilePriority: ViewId[] = ['dashboard', 'pointage', 'projets', 'outils', 'stock', 'employes', 'magasins', 'espace', 'parametres'];
  const mobileNavBase = mobilePriority
    .map((id) => items.find((item) => item.id === id))
    .filter((item): item is NavItem => Boolean(item))
    .slice(0, 4);
  const currentMobileItem = items.find((item) => item.id === view);
  const mobileNav = currentMobileItem && !mobileNavBase.some((item) => item.id === currentMobileItem.id)
    ? [...mobileNavBase.slice(0, 3), currentMobileItem]
    : mobileNavBase;

  useEffect(() => {
    const refreshOutbox = () => {
      void listOfflineMutations(user.id).then((items) => {
        setPendingOfflineCount(items.filter((item) => item.state === 'pending').length);
        setFailedOfflineCount(items.filter((item) => item.state === 'failed').length);
        setOfflineMutations(items);
        setOfflineHistory(getOfflineSyncHistory(user.id));
        setLastServerSync(getLastServerSync(user.id));
      }).catch(() => { setPendingOfflineCount(0); setFailedOfflineCount(0); });
    };
    const onOnline = () => setIsOnline(true);
    const onOffline = () => { setIsOnline(false); refreshOutbox(); };
    refreshOutbox();
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('offline:outbox-updated', refreshOutbox);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('offline:outbox-updated', refreshOutbox);
    };
  }, [user.id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((value) => !value);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-full min-h-0 bg-paper">
        {/* =========================================================================
            DESKTOP SIDEBAR (Google Antigravity Architecture)
        ========================================================================= */}
        <aside className="no-print hidden w-60 shrink-0 flex-col border-r border-line bg-surface lg:flex">
          {/* Logo Brand Header */}
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-line bg-surface-2/30">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-charcoal border border-line p-1 shadow-xs ring-1 ring-white/5">
              <img src="/emblem-white.png" alt="Croix Bénédictine" className="h-6 w-6 object-contain" />
            </div>
            <div className="leading-tight min-w-0 flex-1">
              <span className="block text-xs font-bold tracking-tight text-ink truncate">CFTM</span>
              <p className="text-[10px] text-ink-faint truncate font-medium mt-0.5">Bénédictins Mont Fébé</p>
            </div>
          </div>

          {/* Categorized Antigravity Navigation */}
          <nav className="flex-1 space-y-3 overflow-y-auto px-2.5 py-3 scroll-thin">
            {NAV_CATEGORIES.map((cat) => {
              const catItems = items.filter((it) => cat.views.includes(it.id));
              if (catItems.length === 0) return null;
              return (
                <div key={cat.title} className="space-y-0.5">
                  <div className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-ink-faint/80">
                    {cat.title}
                  </div>
                  {catItems.map((item) => (
                    <NavButton key={item.id} item={item} active={item.id === view} onClick={() => onView(item.id)} />
                  ))}
                </div>
              );
            })}
          </nav>

          {/* User Profile Footer */}
          <div className="border-t border-line p-2.5 bg-surface-2/30">
            <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 bg-surface border border-line/50">
              <span className="relative grid h-7 w-7 place-items-center rounded-full bg-amber-wash text-xs font-bold text-amber border border-amber/20 overflow-hidden shrink-0">
                {user.photo_path ? (
                  <img src={user.photo_path} alt={user.display_name} className="h-full w-full object-cover" />
                ) : (
                  initials(user.display_name)
                )}
                <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-green ring-1 ring-surface" />
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-xs font-semibold text-ink">{user.display_name}</p>
                <p className="truncate text-[10px] text-ink-faint font-mono">@{user.login}</p>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={onLogout}
                    className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-red-wash hover:text-red"
                    aria-label="Se déconnecter"
                  >
                    <LogOut size={15} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">Se déconnecter</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </aside>

        {/* =========================================================================
            MOBILE & TABLET VIEWPORT (MOBILE FIRST)
        ========================================================================= */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile Top Header */}
          <header className="no-print sticky top-0 z-20 flex min-h-14 items-center justify-between gap-2 border-b border-line bg-surface/95 px-3 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] backdrop-blur sm:px-4 lg:hidden lg:pt-2.5">
            <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-charcoal border border-line p-1 shadow-xs">
                <img src="/emblem-white.png" alt="Croix Bénédictine" className="h-5 w-5 object-contain" />
              </div>
              <div className="min-w-0 leading-tight">
                <span className="block max-w-[min(48vw,15rem)] truncate text-xs font-bold text-ink sm:max-w-[16rem]">CFTM Bénédictins Mont Fébé</span>
                <span className="block truncate text-[10px] text-ink-soft">{ROLE_LABEL[user.role]}</span>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
              {!isOnline && (
                <span className="flex items-center gap-1 rounded-full bg-amber-wash border border-amber/30 px-2 py-0.5 text-[10px] font-medium text-amber">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber" />
                  Hors ligne
                </span>
              )}
              {onScan && (
                <button
                  onClick={onScan}
                  className="flex min-h-11 items-center gap-1 rounded-full bg-amber-wash border border-amber/20 px-3 py-1 text-xs font-semibold text-amber shadow-xs active:scale-95"
                  aria-label="Scanner"
                >
                  <QrCode size={15} />
                  <span>Scan</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-expanded={menuOpen}
                aria-controls="mobile-primary-menu"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-ink-soft hover:bg-paper-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
                aria-label="Menu"
              >
                {menuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>
          </header>

          {/* Mobile Slide-over Drawer Menu */}
          <Drawer open={menuOpen} direction="right" onOpenChange={setMenuOpen}>
            <DrawerContent id="mobile-primary-menu" className="gap-0 bg-surface p-0 sm:max-w-80">
              <DrawerHeader className="border-b border-line px-4 py-3.5">
                <div className="flex items-center justify-between">
                  <DrawerTitle className="text-sm font-bold text-ink">Menu principal</DrawerTitle>
                  <button
                    type="button"
                    onClick={() => setMenuOpen(false)}
                    className="grid h-11 w-11 place-items-center rounded-lg text-ink-faint hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
                    aria-label="Fermer le menu"
                  >
                    <X size={18} />
                  </button>
                </div>
                <DrawerDescription className="sr-only">Menu de navigation</DrawerDescription>
              </DrawerHeader>

              <div className="flex-1 overflow-y-auto p-3">
                {/* Mobile User Identity Card */}
                <div className="mb-3 flex items-center gap-3 rounded-xl border border-line bg-paper/60 p-2.5">
                  <span className="relative grid h-10 w-10 place-items-center rounded-full bg-amber-wash text-xs font-bold text-amber border border-amber/20 overflow-hidden shrink-0">
                    {user.photo_path ? (
                      <img src={user.photo_path} alt={user.display_name} className="h-full w-full object-cover" />
                    ) : (
                      initials(user.display_name)
                    )}
                    <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-green ring-2 ring-surface" />
                  </span>
                  <div className="min-w-0 flex-1 leading-tight">
                    <p className="truncate text-xs font-bold text-ink">{user.display_name}</p>
                    <p className="truncate text-[11px] text-ink-faint">@{user.login} · {ROLE_LABEL[user.role] ?? user.role}</p>
                  </div>
                </div>

                <nav className="space-y-1">
                  {items.map((item) => (
                    <NavButton
                      key={item.id}
                      item={item}
                      active={item.id === view}
                      onClick={() => {
                        onView(item.id);
                        setMenuOpen(false);
                      }}
                    />
                  ))}
                </nav>

                <div className="mt-6 border-t border-line pt-3">
                  <button
                    type="button"
                    onClick={onLogout}
                    className="flex min-h-11 w-full items-center gap-2.5 rounded-lg border border-red/20 bg-red-wash/40 px-3 py-2 text-sm font-semibold text-red transition-colors"
                  >
                    <LogOut size={16} />
                    Se déconnecter
                  </button>
                </div>
              </div>
            </DrawerContent>
          </Drawer>

          {/* Main Scrollable Content with Antigravity Top Bar */}
          <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden scroll-thin flex flex-col">
            {/* Desktop Topbar Header - macOS / Apple Design */}
            <div className="no-print hidden lg:flex shrink-0 h-11 items-center justify-between px-6 border-b border-line/60 bg-surface sticky top-0 z-20 text-xs">
              {/* Breadcrumb section */}
              <div className="flex items-center gap-2">
                <span className="font-bold text-ink tracking-tight">CFTM</span>
                <span className="text-ink-faint/40 text-[10px]">/</span>
                <span className="font-medium text-ink-soft text-[11px]">
                  {NAV.find((n) => n.id === view)?.label ?? view}
                </span>
              </div>

              {/* Action & Status right section */}
              <div className="flex items-center gap-2.5">
                {/* Offline pill indicator shown ONLY when disconnected */}
                {!isOnline && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-wash border border-amber/30 text-[11px] text-amber font-medium shadow-xs">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber animate-ping" />
                    <span>Hors connexion · données locales</span>
                  </div>
                )}

                {onScan && (
                  <button
                    onClick={onScan}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface border border-line text-xs font-semibold text-ink hover:text-amber hover:border-amber/40 transition-all shadow-xs active:scale-95"
                    title="Scanner un code QR (Caméra)"
                  >
                    <QrCode size={14} className="text-amber" />
                    <span>Scanner QR</span>
                  </button>
                )}
              </div>
            </div>

            <div
              className={cx(
                'w-full min-w-0 px-3 py-3 sm:px-6 lg:px-8 lg:py-6 lg:pb-12 flex-1',
                view === 'pointage' ? 'pb-18' : 'pb-24',
              )}
            >
              {(!isOnline || pendingOfflineCount > 0 || failedOfflineCount > 0) && (
                <div role="status" aria-live="polite" className={cx(
                  'no-print mb-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs',
                  isOnline ? 'border-blue-500/25 bg-blue-500/5 text-blue-200' : 'border-amber/30 bg-amber-wash text-amber',
                )}>
                  {isOnline ? <CloudUpload size={15} className="mt-0.5 shrink-0" /> : <WifiOff size={15} className="mt-0.5 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p>
                    {!isOnline ? 'Hors connexion : affichage des dernières données synchronisées.' : 'Connexion rétablie.'}
                    {!isOnline && lastServerSync ? ` Dernière réponse serveur : ${new Date(lastServerSync).toLocaleString('fr-FR')}.` : ''}
                    {pendingOfflineCount > 0 && ` ${pendingOfflineCount} saisie(s) en attente de transmission${isOnline ? ' au serveur' : ''}.`}
                    {failedOfflineCount > 0 && ` ${failedOfflineCount} saisie(s) nécessitent une vérification; le serveur ne les a pas acceptées.`}
                    </p>
                    <details className="mt-1.5">
                      <summary className="w-fit cursor-pointer font-semibold underline underline-offset-2">Détails des synchronisations</summary>
                      <div className="mt-2 space-y-1.5 font-normal">
                        {offlineMutations.map((item) => (
                          <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line/60 bg-paper/60 px-2 py-1.5">
                            <span>{item.path.includes('/incidents') ? 'Signalement d’imprévu' : 'Demande de permission'} · {new Date(item.createdAt).toLocaleString('fr-FR')} · {item.state === 'failed' ? `À vérifier : ${item.error ?? 'refus serveur'}` : 'En attente'}</span>
                            {item.state === 'failed' && <button type="button" className="font-semibold underline" onClick={() => void updateOfflineMutation(item.id, 'pending')}>Réessayer</button>}
                          </div>
                        ))}
                        {offlineHistory.slice(0, 5).map((item) => (
                          <div key={item.id} className="text-ink-soft">Transmis au serveur · {item.path.includes('/incidents') ? 'Signalement d’imprévu' : 'Demande de permission'} · {new Date(item.syncedAt).toLocaleString('fr-FR')}</div>
                        ))}
                        {!offlineMutations.length && !offlineHistory.length && <span>Aucune saisie hors connexion récente.</span>}
                      </div>
                    </details>
                  </div>
                </div>
              )}
              {children}
            </div>
          </main>

          {/* =========================================================================
              MOBILE BOTTOM NAVIGATION BAR
          ========================================================================= */}
          <nav aria-label="Navigation principale" className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/98 shadow-pop backdrop-blur lg:hidden pb-[env(safe-area-inset-bottom)]">
            <div className="relative mx-auto flex h-16 max-w-xl items-center justify-around px-2">
              {mobileNav.slice(0, 2).map((item) => {
                const Icon = item.icon;
                const isActive = item.id === view;
                return (
                  <button
                    key={item.id}
                    onClick={() => onView(item.id)}
                    type="button"
                    aria-label={item.label}
                    aria-current={isActive ? 'page' : undefined}
                    className={cx(
                      'flex min-w-0 min-h-14 flex-1 flex-col items-center justify-center gap-1 px-1 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber',
                      isActive ? 'text-amber font-semibold' : 'text-ink-soft hover:text-ink',
                    )}
                  >
                    <Icon size={19} className={isActive ? 'text-amber' : 'text-ink-faint'} />
                    <span className="truncate max-w-[64px]">{item.short}</span>
                  </button>
                );
              })}

              {/* Le raccourci de scan n’apparaît que si le rôle y est autorisé. */}
              {onScan && <div className="flex flex-1 items-center justify-center">
                <button
                  onClick={onScan}
                  className="group -top-3.5 relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber text-white shadow-float ring-4 ring-surface active:scale-90 transition-transform"
                  title="Scanner un code"
                  aria-label="Scanner un code QR ou code-barres"
                >
                  <QrCode size={21} className="group-active:scale-110 transition-transform" />
                </button>
              </div>}

              {mobileNav.slice(2, 4).map((item) => {
                const Icon = item.icon;
                const isActive = item.id === view;
                return (
                  <button
                    key={item.id}
                    onClick={() => onView(item.id)}
                    type="button"
                    aria-label={item.label}
                    aria-current={isActive ? 'page' : undefined}
                    className={cx(
                      'flex min-w-0 min-h-14 flex-1 flex-col items-center justify-center gap-1 px-1 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber',
                      isActive ? 'text-amber font-semibold' : 'text-ink-soft hover:text-ink',
                    )}
                  >
                    <Icon size={19} className={isActive ? 'text-amber' : 'text-ink-faint'} />
                    <span className="truncate max-w-[64px]">{item.short}</span>
                  </button>
                );
              })}
            </div>
          </nav>
        </div>
      </div>

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        items={items}
        onSelect={(id) => onView(id as ViewId)}
        onScan={onScan}
        onLogout={onLogout}
      />
    </TooltipProvider>
  );
}

export function useCan(perms: MyPermissions | null, action: string): boolean {
  if (!perms) return false;
  if (perms.superAdmin) return true;
  return Boolean(perms.permissions[action]);
}
