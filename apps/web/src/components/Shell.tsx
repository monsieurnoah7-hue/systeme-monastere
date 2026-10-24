import { type ReactNode, useEffect, useState } from 'react';
import {
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
  Fingerprint,
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

export function allowedViews(role: Role): ViewId[] {
  return NAV.filter((item) => item.roles.includes(role)).map((item) => item.id);
}

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
        'group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-all duration-150',
        active
          ? 'bg-amber-wash text-amber font-semibold shadow-xs'
          : 'text-ink-soft hover:bg-paper-2 hover:text-ink',
      )}
    >
      <Icon
        size={18}
        className={cx(
          'shrink-0 transition-colors',
          active ? 'text-amber' : 'text-ink-faint group-hover:text-ink-soft',
        )}
      />
      <span className="flex-1 truncate">{item.label}</span>
      {active ? <span className="h-1.5 w-1.5 rounded-full bg-amber" /> : null}
    </button>
  );
}

/**
 * Widget Live Clock Tracker
 */
function LiveClockWidget({ onTrack, isDirection }: { onTrack: () => void; isDirection: boolean }) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const timeStr = time.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = time.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <div className="mx-3 my-2 rounded-xl border border-line bg-surface-2/70 p-3 shadow-xs">
      <div className="flex items-center justify-between text-xs text-ink-faint">
        <span className="flex items-center gap-1.5 font-medium text-ink-soft capitalize">
          <span className="h-2 w-2 rounded-full bg-green animate-pulse" />
          {dateStr}
        </span>
        <span className="text-[10px] uppercase tracking-wider font-semibold text-amber">Direct</span>
      </div>

      <div className="mt-1 text-center font-mono text-xl font-bold tracking-tight text-ink tabular-nums">
        {timeStr}
      </div>

      {!isDirection ? (
        <button
          onClick={onTrack}
          className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-lg bg-amber px-3 py-2 text-xs font-semibold text-white shadow-xs transition-all hover:bg-amber-2 active:scale-[0.98]"
        >
          <Fingerprint size={15} />
          Pointer maintenant
        </button>
      ) : (
        <div className="mt-2 text-center text-[11px] font-medium text-ink-faint">
          Super-Admin · Gouvernance C.F.T.
        </div>
      )}
    </div>
  );
}

export function Shell({
  user,
  view,
  onView,
  onLogout,
  onScan,
  children,
}: {
  user: User;
  view: ViewId;
  onView: (view: ViewId) => void;
  onLogout: () => void;
  onScan?: () => void;
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const items = NAV.filter((item) => item.roles.includes(user.role));

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
            DESKTOP SIDEBAR
        ========================================================================= */}
        <aside className="no-print hidden w-64 shrink-0 flex-col border-r border-line bg-surface lg:flex">
          {/* Logo Brand Header */}
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-line">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-charcoal border border-line p-1.5 shadow-xs">
              <img src="/emblem-white.png" alt="Croix Bénédictine" className="h-7 w-7 object-contain" />
            </div>
            <div className="leading-tight min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold tracking-tight text-ink truncate">C.F.T. Menuiserie</span>
              </div>
              <p className="text-[10px] text-ink-faint truncate font-medium">Bénédictins du Mont Fébé</p>
            </div>
          </div>

          {/* Quick Punch Tracker Widget */}
          <LiveClockWidget onTrack={() => onView('pointage')} isDirection={user.role === 'direction'} />

          {/* Main Navigation */}
          <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2 scroll-thin">
            {items.map((item) => (
              <NavButton key={item.id} item={item} active={item.id === view} onClick={() => onView(item.id)} />
            ))}
          </nav>

          {/* Scanner Button (Desktop) */}
          {onScan && (
            <div className="px-3 pb-2">
              <button
                onClick={onScan}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink transition-all hover:bg-paper-2 hover:border-line-strong active:scale-[0.98]"
              >
                <QrCode size={15} className="text-amber" />
                Scanner un QR code
              </button>
            </div>
          )}

          {/* User Profile Footer */}
          <div className="border-t border-line p-3">
            <div className="flex items-center gap-3 rounded-lg px-2 py-1.5 bg-paper/60">
              <span className="relative grid h-8 w-8 place-items-center rounded-full bg-amber-wash text-xs font-bold text-amber border border-amber/20 overflow-hidden shrink-0">
                {user.photo_path ? (
                  <img src={user.photo_path} alt={user.display_name} className="h-full w-full object-cover" />
                ) : (
                  initials(user.display_name)
                )}
                <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-green ring-1 ring-surface" />
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-xs font-semibold text-ink">{user.display_name}</p>
                <p className="truncate text-[11px] text-ink-faint">{ROLE_LABEL[user.role]}</p>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={onLogout}
                    className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-red-wash hover:text-red"
                    aria-label="Se déconnecter"
                  >
                    <LogOut size={16} />
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
                    <p className="truncate text-[11px] text-ink-faint">@{user.login} · {ROLE_LABEL[user.role]}</p>
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

          {/* Main Scrollable Content */}
          <main className="min-h-0 flex-1 overflow-y-auto scroll-thin">
            <div className="mx-auto w-full max-w-7xl px-3 py-4 pb-28 sm:px-6 lg:px-8 lg:py-6 lg:pb-12">
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
