import type { ReactNode } from 'react';
import { LogOut, QrCode } from 'lucide-react';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from './ui/command';

export type PaletteItem = {
  id: string;
  label: string;
  icon: (props: { size?: number; className?: string }) => ReactNode;
};

export function CommandPalette({
  open,
  onOpenChange,
  items,
  onSelect,
  onScan,
  onLogout,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: PaletteItem[];
  onSelect: (id: string) => void;
  onScan?: () => void;
  onLogout: () => void;
}) {
  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Menuiserie Mont Fèbè"
      description="Rechercher une page ou une action"
      className="sm:max-w-lg"
    >
      <Command loop>
        <CommandInput
          placeholder="Rechercher une page ou une action…"
          className="h-12 border-b border-line bg-surface pl-11 text-sm"
        />
        <CommandList className="max-h-[50vh] p-2">
          <CommandEmpty className="px-3 py-6 text-center text-[13px] text-ink-soft">
            Aucun résultat.
          </CommandEmpty>
          <CommandGroup
            heading="Navigation"
            className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-[0.12em] [&_[cmdk-group-heading]]:text-ink-faint [&_[cmdk-group-heading]]:uppercase"
          >
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem
                  key={item.id}
                  value={item.label}
                  onSelect={() => {
                    onSelect(item.id);
                    onOpenChange(false);
                  }}
                  className="gap-2.5 rounded-lg px-3 py-2 text-sm"
                >
                  <Icon size={16} className="shrink-0 text-ink-soft" />
                  <span>{item.label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
          <CommandGroup
            heading="Actions"
            className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-[0.12em] [&_[cmdk-group-heading]]:text-ink-faint [&_[cmdk-group-heading]]:uppercase"
          >
            {onScan ? (
              <CommandItem
                value="Scanner un code"
                onSelect={() => {
                  onScan();
                  onOpenChange(false);
                }}
                className="gap-2.5 rounded-lg px-3 py-2 text-sm"
              >
                <QrCode size={16} className="shrink-0 text-ink-soft" />
                <span>Scanner un code</span>
              </CommandItem>
            ) : null}
            <CommandItem
              value="Se déconnecter"
              onSelect={() => {
                onLogout();
                onOpenChange(false);
              }}
              className="gap-2.5 rounded-lg px-3 py-2 text-sm"
            >
              <LogOut size={16} className="shrink-0 text-ink-soft" />
              <span>Se déconnecter</span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
