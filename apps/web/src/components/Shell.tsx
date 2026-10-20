import { type ReactNode, useEffect, useState } from 'react';
import {
  Clock,
  Gauge,
  LogOut,
  Menu,
  Package,
  QrCode,
  Search,
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

const ALL_STAFF: Role[] = ['direction', 'magasinier', 'chef_atelier', 'admin'];

export const NAV: NavItem[] = [
  { id: 'dashboard', label: 'Tableau de bord', short: 'Bord', icon: Gauge, roles: ALL_STAFF },
  { id: 'outils', label: 'Outils & QR', short: 'Outils', icon: Wrench, roles: ALL_STAFF },
  { id: 'magasins', label: 'Magasins', short: 'Magasin', icon: Warehouse, roles: ALL_STAFF },
  { id: 'pointage', label: 'Pointage', short: 'Pointage', icon: Clock, roles: ALL_STAFF },
  { id: 'stock', label: 'Stock', short: 'Stock', icon: Package, roles: ALL_STAFF },
  { id: 'employes', label: 'Travailleurs', short: 'Staff', icon: Users, roles: ['direction', 'magasinier', 'chef_atelier', 'admin'] },
  { id: 'espace', label: 'Mon espace', short: 'Espace', icon: UserIcon, roles: ['direction', 'magasinier', 'chef_atelier', 'travailleur', 'admin'] },
  { id: 'parametres', label: 'Paramètres', short: 'Réglages', icon: Settings, roles: ['direction', 'admin'] },
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
        'group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-all duration-150 ease-out',
        active ? 'bg-charcoal text-white shadow-card' : 'text-ink-soft hover:bg-paper-2 hover:text-ink',
      )}
    >
      <Icon size={18} className={cx('shrink-0', active ? 'text-amber' : 'text-ink-soft group-hover:text-ink')} />
      <span className={cx('font-medium', active && 'text-white')}>{item.label}</span>
    </button>
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
  const visible = items.slice(0, 5);

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
    <TooltipProvider delayDuration={250}>
      <div className="flex h-full min-h-0 bg-paper">
        <aside className="no-print hidden w-64 shrink-0 flex-col border-r border-line bg-surface lg:flex">
          <div className="flex items-center gap-3 px-5 py-5">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-charcoal to-charcoal-3 text-[15px] font-bold text-amber shadow-card">
              M
            </span>
            <div className="leading-tight">
              <p className="text-[13.5px] font-semibold tracking-tight text-ink">Menuiserie</p>
              <p className="text-[11.5px] text-ink-soft">Mont Fèbè</p>
            </div>
          </div>

          <div className="px-3 pb-2">
            <button
              onClick={() => setPaletteOpen(true)}
              className="flex h-9 w-full items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 text-[13px] text-ink-faint transition-colors duration-150 hover:border-line-strong hover:text-ink-soft"
              aria-label="Rechercher"
            >
              <Search size={15} className="shrink-0" />
              <span className="flex-1 text-left">Rechercher…</span>
              <kbd className="rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px] font-medium text-ink-faint">
                Ctrl K
              </kbd>
            </button>
          </div>

          <nav className="flex-1 space-y-0.5 px-3 py-2">
            {items.map((item) => (
              <NavButton key={item.id} item={item} active={item.id === view} onClick={() => onView(item.id)} />
            ))}
          </nav>

          {onScan && (
            <div className="px-3 pb-2">
              <button
                onClick={onScan}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber px-3 py-2.5 text-[13px] font-semibold text-white shadow-card transition-all duration-150 ease-out hover:bg-amber-2 active:scale-[0.98]"
              >
                <QrCode size={17} />
                Scanner un code
              </button>
            </div>
          )}

          <div className="border-t border-line p-3">
            <div className="flex items-center gap-3 rounded-lg px-2 py-2">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-charcoal text-[12px] font-semibold text-amber">
                {initials(user.display_name)}
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-[13px] font-medium text-ink">{user.display_name}</p>
                <p className="truncate text-[11.5px] text-ink-soft">{ROLE_LABEL[user.role]}</p>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={onLogout}
                    className="rounded-lg p-2 text-ink-soft transition-colors hover:bg-paper-2 hover:text-ink"
                    aria-label="Se déconnecter"
                  >
                    <LogOut size={17} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">Se déconnecter</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="no-print sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-surface/90 px-4 py-3 backdrop-blur lg:hidden">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-charcoal text-sm font-bold text-amber">M</span>
              <div className="leading-tight">
                <p className="text-[13px] font-semibold text-ink">Menuiserie</p>
                <p className="text-[11px] text-ink-soft">{ROLE_LABEL[user.role]}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {onScan && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button onClick={onScan} className="rounded-lg p-2 text-ink-soft hover:bg-paper-2" aria-label="Scanner">
                      <QrCode size={20} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Scanner un code</TooltipContent>
                </Tooltip>
              )}
              <button
                onClick={() => setMenuOpen((value) => !value)}
                className="rounded-lg p-2 text-ink-soft hover:bg-paper-2"
                aria-label="Menu"
              >
                {menuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>
          </header>

          <Drawer open={menuOpen} direction="right" onOpenChange={setMenuOpen}>
            <DrawerContent className="gap-0 bg-surface p-0 sm:max-w-80">
              <DrawerHeader className="border-b border-line px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <DrawerTitle className="text-sm font-semibold text-ink">Navigation</DrawerTitle>
                  <button
                    onClick={() => setMenuOpen(false)}
                    className="rounded-lg p-1.5 text-ink-soft hover:bg-paper-2"
                    aria-label="Fermer le menu"
                  >
                    <X size={18} />
                  </button>
                </div>
                <DrawerDescription className="sr-only">Navigation</DrawerDescription>
              </DrawerHeader>
              <div className="flex-1 overflow-y-auto p-3">
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
                <button
                  onClick={onLogout}
                  className="mt-4 flex w-full items-center gap-3 rounded-lg border border-line px-3 py-2.5 text-sm text-ink-soft transition-colors hover:bg-paper-2 hover:text-ink"
                >
                  <LogOut size={18} />
                  Se déconnecter
                </button>
              </div>
            </DrawerContent>
          </Drawer>

          <main className="min-h-0 flex-1 overflow-y-auto scroll-thin">
            <div className="mx-auto w-full max-w-6xl px-4 py-5 pb-28 lg:px-8 lg:py-8 lg:pb-12">{children}</div>
          </main>

          {onScan && (
            <button
              onClick={onScan}
              className="no-print fixed bottom-24 right-5 z-30 grid h-14 w-14 place-items-center rounded-full bg-amber text-white shadow-float transition-transform duration-150 active:scale-95 lg:hidden"
              aria-label="Scanner un code"
            >
              <QrCode size={24} />
            </button>
          )}

          <nav className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur lg:hidden">
            <div className="mx-auto flex max-w-lg items-stretch justify-around px-2 pb-[env(safe-area-inset-bottom)]">
              {visible.map((item) => {
                const Icon = item.icon;
                const isActive = item.id === view;
                return (
                  <button
                    key={item.id}
                    onClick={() => onView(item.id)}
                    className={cx(
                      'flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
                      isActive ? 'text-amber' : 'text-ink-soft',
                    )}
                  >
                    <Icon size={20} />
                    {item.short}
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
