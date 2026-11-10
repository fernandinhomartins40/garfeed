import * as M from '@radix-ui/react-dropdown-menu';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type MenuItem = { label: string; icon?: LucideIcon; onSelect: () => void; danger?: boolean; hidden?: boolean };

export function Dropdown({ trigger, items, label = 'Ações' }: { trigger: ReactNode; items: MenuItem[]; label?: string }) {
  return (
    <M.Root>
      <M.Trigger asChild aria-label={label}>{trigger}</M.Trigger>
      <M.Portal>
        <M.Content align="end" sideOffset={6} className="z-50 min-w-48 rounded-card border border-gf-border bg-white p-1.5 shadow-xl">
          {items.filter((i) => !i.hidden).map(({ label: l, icon: Icon, onSelect, danger }) => (
            <M.Item key={l} onSelect={onSelect}
              className={cn('flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 outline-none data-[highlighted]:bg-gf-bg', danger ? 'text-danger' : 'text-gf-navy')}>
              {Icon && <Icon className="h-5 w-5" />}{l}
            </M.Item>
          ))}
        </M.Content>
      </M.Portal>
    </M.Root>
  );
}
