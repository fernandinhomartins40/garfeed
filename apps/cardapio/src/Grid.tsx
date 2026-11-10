import { useState } from 'react';
import { formatBRL } from '@garfeed/shared/money';
import type { PublicItem, PublicRestaurant, TableRef } from '@garfeed/shared';
import type { Category } from './App';
import { Icon } from './icons';
import { track } from './lib';
import { CartBar, IconBtn, Logo, Thumb } from './ui';

type Props = {
  restaurant: PublicRestaurant; table: TableRef | null; canOrder: boolean; cartCount: number; cartTotal: number;
  categories: Category[]; items: PublicItem[]; activeIdx: number;
  onPick: (i: number) => void; onFeed: () => void; onCart: () => void; onHub: () => void;
};

/** M5 — grade 3 colunas 9:16; abre na categoria do prato que estava no feed. */
export function Grid(p: Props) {
  const [catId, setCatId] = useState(p.items[p.activeIdx]?.categoryId ?? p.categories[0]?.id);
  const cat = p.categories.find((c) => c.id === catId) ?? p.categories[0];

  return (
    <div className="mx-auto min-h-full max-w-md bg-white px-4 pb-28 pt-[max(16px,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between">
        <Logo className="h-11" />
        <IconBtn label="Voltar ao feed" onClick={p.onFeed}><Icon name="home" className="h-7 w-7" /></IconBtn>
      </header>
      <button type="button" onClick={p.onHub} className="mt-5 flex w-full items-center gap-4 rounded-2xl bg-gf-bg p-4 text-left">
        <Icon name="store" className="h-9 w-9 shrink-0" />
        <span className="h-10 w-px bg-gf-border" />
        <span className="min-w-0 flex-1">
          {p.table && <span className="block font-heading text-2xl font-black leading-tight">{p.table.name}</span>}
          <span className="block truncate text-gf-navy-80">{p.restaurant.name}</span>
        </span>
        <Icon name="chevronDown" className="h-6 w-6 text-gf-navy-80" />
      </button>

      <nav aria-label="Categorias" className="no-scrollbar -mx-4 mt-5 flex gap-2 overflow-x-auto px-4">
        {p.categories.map((c) => (
          <button key={c.id} type="button" aria-current={c.id === cat?.id}
            onClick={() => { setCatId(c.id); track('category_change', { categoryId: c.id }); }}
            className={`min-h-11 shrink-0 rounded-pill px-5 font-medium ${c.id === cat?.id ? 'bg-accent font-bold text-on-accent' : 'bg-gf-bg text-gf-navy'}`}>
            {c.name}
          </button>
        ))}
      </nav>

      <h1 className="mt-6 font-heading text-3xl font-black">{cat?.name}</h1>
      <ul className="mt-4 grid grid-cols-3 gap-2">
        {cat?.items.map((it) => (
          <li key={it.id}>
            <button type="button" onClick={() => p.onPick(p.items.indexOf(it))}
              className="relative block aspect-[9/16] w-full overflow-hidden rounded-xl text-left">
              <Thumb item={it} className={`absolute inset-0 h-full w-full ${it.soldOut ? 'grayscale-[.6]' : ''}`} />
              <span className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent via-45% to-black/85" />
              {it.soldOut && <span className="absolute right-2 top-2 rounded-md bg-danger px-2 py-0.5 text-xs font-bold text-white">Esgotado</span>}
              <span className="absolute inset-x-2 bottom-2 text-white">
                <span className="line-clamp-3 font-heading text-sm font-extrabold leading-tight">{it.name}</span>
                <span className="mt-1 block font-heading text-base font-black">{formatBRL(it.promoPriceCents ?? it.priceCents)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {p.canOrder && p.cartCount > 0 && <CartBar count={p.cartCount} total={p.cartTotal} onClick={p.onCart} />}
    </div>
  );
}
