import { type ReactNode, useEffect, useState } from 'react';
import {
  Clock,
  Fingerprint,
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
} from 'lucide-react';
import type { MyPermissions, Role, User } from '../lib/api';
import { ROLE_LABEL, initials } from '../lib/labels';
import { CommandPalette } from './CommandPalette';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from './ui/drawer';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { cx } from './ui';

export type ViewId = 'dashboard' | 'outils' | 'pointage' | 'stock' | 'employes' | 'magasins' | 'espace' | 'parametres';

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
  { id: 'pointage', label: 'Pointage', short: 'Pointage', icon: Clock, roles: ALL_STAFF },
  { id: 'employes', label: 'Travailleurs', short: 'Équipe', icon: Users, roles: ['direction', 'magasinier', 'chef_atelier'] },
  { id: 'outils', label: 'Outils', short: 'Outils', icon: Wrench, roles: ALL_STAFF },
  { id: 'stock', label: 'Stock', short: 'Stock', icon: Package, roles: ALL_STAFF },
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
    return ['dashboard', 'pointage', 'employes', 'outils', 'stock', 'magasins', 'espace', 'parametres'];
  }

  // Si la matrice des droits personnalisés est disponible
  if (permissions) {
    const views: ViewId[] = [];

    // 1. Mon Espace est universellement accessible à tout compte utilisateur connecté
    views.push('espace');

    // 2. Tableau de bord pilotage
    if (permissions['dashboard.view']) {
      views.push('dashboard');
    }

    // 3. Module Outils & Matériels
    if (
      permissions['tools.view'] ||
      permissions['loans.view'] ||
      permissions['tools.create'] ||
      permissions['tools.edit'] ||
      permissions['tools.edit_status'] ||
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
      permissions['employees.print_badge']
    ) {
      views.push('employes');
    }

    // 7. Module Pointage & Présences
    if (
      permissions['attendance.view'] ||
      permissions['attendance.correct'] ||
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
  { title: 'Pilotage & Vision', views: ['dashboard'] },
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
      onClick={onClick}
      className={cx(
        'group relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-all duration-150',
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
  const effectiveAllowed = allowedList ?? allowedViews(user.role);
  const items = NAV.filter((item) => effectiveAllowed.includes(item.id));

  // Quick navigation items for mobile bottom bar
  const mobileNav = items.slice(0, 4);

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
          <div className="flex items-center gap-2.5 px-3.5 py-3 border-b border-line bg-surface-2/40">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-charcoal border border-line p-1 shadow-xs">
              <img src="/emblem-white.png" alt="Croix Bénédictine" className="h-6 w-6 object-contain" />
            </div>
            <div className="leading-tight min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold tracking-tight text-ink truncate">C.F.T. Menuiserie</span>
                <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-1.5 py-0.2 text-[9px] font-bold text-emerald-400 border border-emerald-500/20">
                  ACTIF
                </span>
              </div>
              <p className="text-[10px] text-ink-faint truncate font-medium">Bénédictins Mont Fébé</p>
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
          <header className="no-print sticky top-0 z-20 flex items-center justify-between border-b border-line bg-surface/95 px-4 py-2.5 backdrop-blur lg:hidden">
            <div className="flex items-center gap-2.5">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-charcoal border border-line p-1 shadow-xs">
                <img src="/emblem-white.png" alt="Croix Bénédictine" className="h-5 w-5 object-contain" />
              </div>
              <div className="leading-tight">
                <span className="text-xs font-bold text-ink">C.F.T. Bénédictins Mont Fébé</span>
                <span className="block text-[10px] text-ink-soft">{ROLE_LABEL[user.role]}</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {onScan && (
                <button
                  onClick={onScan}
                  className="flex items-center gap-1 rounded-full bg-amber-wash border border-amber/20 px-2.5 py-1 text-xs font-semibold text-amber shadow-xs active:scale-95"
                  aria-label="Scanner"
                >
                  <QrCode size={15} />
                  <span>Scan</span>
                </button>
              )}
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="rounded-lg p-2 text-ink-soft hover:bg-paper-2"
                aria-label="Menu"
              >
                {menuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>
          </header>

          {/* Mobile Slide-over Drawer Menu */}
          <Drawer open={menuOpen} direction="right" onOpenChange={setMenuOpen}>
            <DrawerContent className="gap-0 bg-surface p-0 sm:max-w-80">
              <DrawerHeader className="border-b border-line px-4 py-3.5">
                <div className="flex items-center justify-between">
                  <DrawerTitle className="text-sm font-bold text-ink">Menu principal</DrawerTitle>
                  <button
                    onClick={() => setMenuOpen(false)}
                    className="rounded-lg p-1 text-ink-faint hover:text-ink"
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
                    onClick={onLogout}
                    className="flex w-full items-center gap-2.5 rounded-lg border border-red/20 bg-red-wash/40 px-3 py-2 text-xs font-semibold text-red transition-colors"
                  >
                    <LogOut size={16} />
                    Se déconnecter
                  </button>
                </div>
              </div>
            </DrawerContent>
          </Drawer>

          {/* Main Scrollable Content with Antigravity Top Bar */}
          <main className="min-h-0 flex-1 overflow-y-auto scroll-thin flex flex-col">
            {/* Desktop Topbar Header */}
            <div className="no-print hidden lg:flex items-center justify-between px-6 py-2.5 border-b border-line bg-surface-2/40 backdrop-blur sticky top-0 z-10 text-xs">
              <div className="flex items-center gap-2 text-ink-soft">
                <span className="font-semibold text-ink">C.F.T.</span>
                <span className="text-ink-faint">/</span>
                <span className="text-ink-faint">Système Monastère</span>
                <span className="text-ink-faint">/</span>
                <span className="font-semibold text-sky-400 capitalize">
                  {NAV.find((n) => n.id === view)?.label ?? view}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface border border-line text-[11px] text-ink-soft font-mono">
                  <span className="h-1.5 w-1.5 rounded-full bg-green animate-pulse" />
                  <span>Système opérationnel</span>
                </div>
                {onScan && (
                  <button
                    onClick={onScan}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface border border-line text-xs font-medium text-ink hover:text-amber hover:border-amber/40 transition-colors shadow-xs"
                    title="Scanner un code QR"
                  >
                    <QrCode size={13} className="text-amber" />
                    <span>Scan QR</span>
                  </button>
                )}
              </div>
            </div>

            <div className="mx-auto w-full max-w-7xl px-3 py-4 pb-28 sm:px-6 lg:px-8 lg:py-6 lg:pb-12 flex-1">
              {children}
            </div>
          </main>

          {/* =========================================================================
              MOBILE BOTTOM NAVIGATION BAR
          ========================================================================= */}
          <nav className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/98 shadow-pop backdrop-blur lg:hidden pb-[env(safe-area-inset-bottom)]">
            <div className="relative mx-auto flex max-w-md items-center justify-around px-2 h-16">
              {mobileNav.slice(0, 2).map((item) => {
                const Icon = item.icon;
                const isActive = item.id === view;
                return (
                  <button
                    key={item.id}
                    onClick={() => onView(item.id)}
                    className={cx(
                      'flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors',
                      isActive ? 'text-amber font-semibold' : 'text-ink-soft hover:text-ink',
                    )}
                  >
                    <Icon size={19} className={isActive ? 'text-amber' : 'text-ink-faint'} />
                    <span className="truncate max-w-[64px]">{item.short}</span>
                  </button>
                );
              })}

              {/* Central Floating Punch Trigger Button (Mobile-First Hero Action) */}
              <div className="flex flex-1 items-center justify-center">
                <button
                  onClick={() => {
                    if (onScan) onScan();
                    else onView('pointage');
                  }}
                  className="group -top-3.5 relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber text-white shadow-float ring-4 ring-surface active:scale-90 transition-transform"
                  title="Scanner / Pointer"
                  aria-label="Pointer ou scanner"
                >
                  <Fingerprint size={22} className="group-active:scale-110 transition-transform" />
                </button>
              </div>

              {mobileNav.slice(2, 4).map((item) => {
                const Icon = item.icon;
                const isActive = item.id === view;
                return (
                  <button
                    key={item.id}
                    onClick={() => onView(item.id)}
                    className={cx(
                      'flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors',
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
