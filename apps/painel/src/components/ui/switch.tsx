import * as S from '@radix-ui/react-switch';
import { cn } from '@/lib/utils';

export function Switch({ className, tone = 'success', ...p }: S.SwitchProps & { tone?: 'success' | 'danger' }) {
  return (
    <S.Root
      className={cn('relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-pill bg-gf-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gf-orange focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        tone === 'danger' ? 'data-[state=checked]:bg-danger' : 'data-[state=checked]:bg-success', className)}
      {...p}
    >
      <S.Thumb className="block h-5 w-5 translate-x-1 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-6" />
    </S.Root>
  );
}
