import type { ReactNode } from 'react';
import { formatBRL } from '@garfeed/shared/money';
import type { PublicItem, PublicRestaurant } from '@garfeed/shared';
import { Icon } from './icons';

const GarfeedLogo = ({ white, className = 'h-9' }: { white?: boolean; className?: string }) => (
  <img src={white ? '/logo-horizontal-negativa.svg' : '/logo-horizontal-cor.svg'} alt="Garfeed" className={`${className} w-auto`} />
);

/** Logo do restaurante com marca própria (o App preenche ao carregar o restaurante); null = logo do Garfeed. */
export const brandLogo: { current: { src: string; alt: string } | null } = { current: null };

/** Logo do topo: o do restaurante quando ele tem marca própria, senão o do Garfeed. */
export const Logo = ({ white, className = 'h-9' }: { white?: boolean; className?: string }) => {
  const b = brandLogo.current;
  if (!b) return <GarfeedLogo white={white} className={className} />;
  // logo quadrado (corte do painel); no feed escuro ganha fundo branco para não sumir sobre a foto
  return <img src={b.src} alt={b.alt} className={`${className} aspect-square w-auto rounded-xl object-contain ${white ? 'bg-white p-1 shadow-md' : ''}`} />;
};

export const PoweredBy = ({ white }: { white?: boolean }) => (
  <p className={`flex items-center justify-center gap-2 text-sm ${white ? 'text-white' : 'text-gf-navy-80'}`}>
    powered by <GarfeedLogo white={white} className="h-6" />
  </p>
);

/** Logo do restaurante ou iniciais em círculo marinho. */
export function RestLogo({ r, className = 'h-16 w-16 text-xl' }: { r: Pick<PublicRestaurant, 'name' | 'logoUrl'>; className?: string }) {
  if (r.logoUrl) return <img src={r.logoUrl} alt={r.name} className={`${className} shrink-0 rounded-full object-cover`} />;
  const ini = r.name.split(/\s+/).filter((w) => /^[A-ZÀ-Ú]/.test(w)).slice(0, 2).map((w) => w[0]).join('');
  return (
    <span aria-hidden="true" className={`${className} grid shrink-0 place-items-center rounded-full bg-gf-navy font-heading font-black text-white ring-4 ring-white/80`}>
      {ini}
    </span>
  );
}

/** Miniatura do item (thumb → pôster → foto) ou fundo elegante quando falta mídia. */
export function Thumb({ item, className = '' }: { item?: PublicItem; className?: string }) {
  const m = item?.media;
  const src = m?.thumbUrl ?? m?.posterUrl ?? (m?.type === 'IMAGE' ? m.url : null);
  return src
    ? <img src={src} alt="" loading="lazy" decoding="async" className={`${className} object-cover`} />
    : <span aria-hidden="true" className={`${className} media-fallback grid place-items-center`}><img src={brandLogo.current?.src ?? '/simbolo-laranja.svg'} alt="" className={`w-1/3 opacity-60 ${brandLogo.current ? 'rounded-xl' : ''}`} /></span>;
}

export const MesaChip = ({ name, onClick, soft }: { name: string; onClick?: () => void; soft?: boolean }) => {
  const cls = `inline-flex min-h-11 items-center gap-2 rounded-pill px-4 font-heading text-base font-extrabold ${soft ? 'bg-gf-orange-soft text-orange-text' : 'bg-white text-gf-navy shadow-md'}`;
  const body = <><Icon name="table" className="h-6 w-6" />{name}{onClick && <Icon name="chevronDown" className="h-5 w-5" />}</>;
  return onClick ? <button type="button" onClick={onClick} className={cls} aria-label={`${name} — abrir menu da mesa`}>{body}</button> : <span className={cls}>{body}</span>;
};

export const CartBar = ({ count, total, onClick }: { count: number; total: number; onClick: () => void }) => (
  <div className="fixed inset-x-0 bottom-0 z-20 px-4 pb-[max(12px,env(safe-area-inset-bottom))]">
    <button type="button" onClick={onClick}
      className="mx-auto flex h-14 w-full max-w-md items-center justify-center gap-3 rounded-pill bg-gf-orange font-heading text-lg font-black text-on-accent shadow-lg active:bg-gf-orange-hover">
      <Icon name="cart" className="h-7 w-7" />
      Ver pedido · {count} {count === 1 ? 'item' : 'itens'} · {formatBRL(total)}
    </button>
  </div>
);

export const IconBtn = ({ label, onClick, children, className = 'bg-gf-bg' }: { label: string; onClick: () => void; children: ReactNode; className?: string }) => (
  <button type="button" aria-label={label} onClick={onClick} className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl text-gf-navy ${className}`}>{children}</button>
);

export const Stepper = ({ value, onChange, min = 1 }: { value: number; onChange: (n: number) => void; min?: number }) => (
  <div className="inline-flex items-center gap-1.5">
    <button type="button" aria-label="Diminuir" disabled={value <= min} onClick={() => onChange(value - 1)}
      className="grid h-11 w-11 place-items-center rounded-lg border border-gf-border bg-gf-bg text-gf-navy-80 disabled:opacity-40"><Icon name="minus" /></button>
    <span aria-live="polite" className="grid h-11 w-12 place-items-center rounded-lg border border-gf-border text-lg font-semibold">{value}</span>
    <button type="button" aria-label="Aumentar" disabled={value >= 20} onClick={() => onChange(value + 1)}
      className="grid h-11 w-11 place-items-center rounded-lg border border-gf-orange-soft bg-gf-orange-soft text-orange-text disabled:opacity-40"><Icon name="plus" /></button>
  </div>
);
