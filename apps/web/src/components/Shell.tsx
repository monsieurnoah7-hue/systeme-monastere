import { type ReactNode, useState } from 'react';
import type { MyPermissions, Role, User } from '../lib/api';
import { ROLE_LABEL, initials } from '../lib/labels';
import {
  IconBox,
  IconClock,
  IconGauge,
  IconGear,
  IconLogout,
  IconQr,
  IconUser,
  IconUsers,
  IconWrench,
  IconX,
} from './Icons';
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
  { id: 'dashboard', label: 'Tableau de bord', short: 'Bord', icon: IconGauge, roles: ALL_STAFF },
  { id: 'outils', label: 'Outils & QR', short: 'Outils', icon: IconWrench, roles: ALL_STAFF },
  { id: 'magasins', label: 'Magasins', short: 'Magasin', icon: IconBox, roles: ALL_STAFF },
  { id: 'pointage', label: 'Pointage', short: 'Pointage', icon: IconClock, roles: ALL_STAFF },
  { id: 'stock', label: 'Stock', short: 'Stock', icon: IconBox, roles: ALL_STAFF },
  { id: 'employes', label: 'Travailleurs', short: 'Staff', icon: IconUsers, roles: ['direction', 'magasinier', 'chef_atelier', 'admin'] },
  { id: 'espace', label: 'Mon espace', short: 'Espace', icon: IconUser, roles: ['direction', 'magasinier', 'chef_atelier', 'travailleur', 'admin'] },
  { id: 'parametres', label: 'Paramètres', short: 'Réglages', icon: IconGear, roles: ['direction', 'admin'] },
];

export function allowedViews(role: Role): ViewId[] {
  return NAV.filter((item) => item.roles.includes(role)).map((item) => item.id);
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
  const items = NAV.filter((item) => item.roles.includes(user.role));
  const visible = items.slice(0, 5);

  return (
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

        <nav className="flex-1 space-y-0.5 px-3 py-2">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === view;
            return (
              <button
                key={item.id}
                onClick={() => onView(item.id)}
                className={cx(
                  'group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-all duration-150',
                  isActive
                    ? 'bg-charcoal text-white shadow-card'
                    : 'text-ink-soft hover:bg-paper-2 hover:text-ink',
                )}
              >
                <Icon size={18} className={isActive ? 'text-amber' : 'text-ink-soft group-hover:text-ink'} />
                <span className={cx('font-medium', isActive && 'text-white')}>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {onScan && (
          <div className="px-3 pb-2">
            <button
              onClick={onScan}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber px-3 py-2.5 text-[13px] font-semibold text-white shadow-card transition-transform active:scale-[0.98] hover:bg-amber-2"
            >
              <IconQr size={17} />
              Scanner un code
            </button>
          </div>
        )}

        <div className="border-t border-line p-3">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-charcoal text-[12px] font-semibold text-amber">
              {initials(user.display_name)}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[13px] font-medium text-ink">{user.display_name}</p>
              <p className="truncate text-[11.5px] text-ink-soft">{ROLE_LABEL[user.role]}</p>
            </div>
            <button
              onClick={onLogout}
              className="rounded-lg p-2 text-ink-soft transition-colors hover:bg-paper-2 hover:text-ink"
              aria-label="Se déconnecter"
              title="Se déconnecter"
            >
              <IconLogout size={17} />
            </button>
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
              <button onClick={onScan} className="rounded-lg p-2 text-ink-soft hover:bg-paper-2" aria-label="Scanner">
                <IconQr size={20} />
              </button>
            )}
            <button onClick={() => setMenuOpen((v) => !v)} className="rounded-lg p-2 text-ink-soft hover:bg-paper-2" aria-label="Menu">
              {menuOpen ? <IconX size={20} /> : <span className="grid h-5 w-5 place-items-center text-[16px] leading-none">≡</span>}
            </button>
          </div>
        </header>

        {menuOpen && (
          <div className="no-print fixed inset-0 z-40 lg:hidden" onClick={() => setMenuOpen(false)}>
            <div className="absolute inset-0 bg-charcoal/40 backdrop-blur-sm" />
            <div className="absolute right-0 top-0 h-full w-64 bg-surface p-4 shadow-pop slide-in" onClick={(e) => e.stopPropagation()}>
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-semibold text-ink">Navigation</p>
                <button onClick={() => setMenuOpen(false)} className="rounded-lg p-1.5 text-ink-soft hover:bg-paper-2">
                  <IconX size={18} />
                </button>
              </div>
              <nav className="space-y-1">
                {items.map((item) => {
                  const Icon = item.icon;
                  const isActive = item.id === view;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        onView(item.id);
                        setMenuOpen(false);
                      }}
                      className={cx(
                        'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm',
                        isActive ? 'bg-charcoal text-white' : 'text-ink-soft hover:bg-paper-2',
                      )}
                    >
                      <Icon size={18} className={isActive ? 'text-amber' : ''} />
                      <span className="font-medium">{item.label}</span>
                    </button>
                  );
                })}
              </nav>
              <button
                onClick={onLogout}
                className="mt-4 flex w-full items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-sm text-ink-soft hover:bg-paper-2"
              >
                <IconLogout size={18} />
                Se déconnecter
              </button>
            </div>
          </div>
        )}

        <main className="min-h-0 flex-1 overflow-y-auto scroll-thin">
          <div className="mx-auto w-full max-w-6xl px-4 py-5 pb-28 lg:px-8 lg:py-8 lg:pb-12">{children}</div>
        </main>

        {onScan && (
          <button
            onClick={onScan}
            className="no-print fixed bottom-24 right-5 z-30 grid h-14 w-14 place-items-center rounded-full bg-amber text-white shadow-float transition-transform active:scale-95 lg:hidden"
            aria-label="Scanner un code"
          >
            <IconQr size={24} />
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
  );
}

export function useCan(perms: MyPermissions | null, action: string): boolean {
  if (!perms) return false;
  if (perms.superAdmin) return true;
  return Boolean(perms.permissions[action]);
}
