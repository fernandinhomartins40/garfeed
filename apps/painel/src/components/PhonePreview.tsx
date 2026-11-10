import { ChevronUp, Heart, LayoutGrid, Plus, Share, ShoppingCart, Sparkles } from 'lucide-react';
import { BADGE_LABEL, formatBRL, type Badge } from '@garfeed/shared';
import logoNeg from '@/assets/logo-horizontal-negativa.svg';
import { cn } from '@/lib/utils';

/** Prévia do item como no feed do cliente (tela M3), dentro de um mockup de celular. */
export function PhonePreview({ name, description, priceCents, promoPriceCents, badges, media, categories, activeCategory }: {
  name: string; description: string; priceCents: number | null; promoPriceCents: number | null; badges: Badge[];
  media: { url: string; type: 'VIDEO' | 'IMAGE'; poster?: string | null } | null; categories: string[]; activeCategory?: string;
}) {
  const price = promoPriceCents ?? priceCents;
  return (
    <div className="mx-auto w-[280px] rounded-[44px] border-[10px] border-gf-navy bg-gf-navy shadow-2xl" aria-label="Prévia no celular">
      <div className="relative aspect-[9/19] overflow-hidden rounded-[34px] bg-neutral-900 text-white">
        {media?.type === 'VIDEO' ? <video src={media.url} poster={media.poster ?? undefined} autoPlay muted loop playsInline className="absolute inset-0 h-full w-full object-cover" />
          : media ? <img src={media.url} alt="" className="absolute inset-0 h-full w-full object-cover" />
          : <div className="absolute inset-0 grid place-items-center bg-gradient-to-b from-neutral-700 to-neutral-900 text-sm text-white/70">Sem foto ou vídeo</div>}
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent via-40% to-black/90" />
        <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 pt-2 text-[10px] font-semibold"><span>9:41</span><span>●●● 100</span></div>
        <div className="absolute inset-x-0 top-6 flex items-center justify-between px-3">
          <span className="w-7" />
          <img src={logoNeg} alt="" className="h-6" />
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-white text-gf-navy"><LayoutGrid className="h-4 w-4" /></span>
        </div>
        <div className="absolute inset-x-0 top-[3.75rem] flex gap-1.5 overflow-hidden px-3">
          {categories.slice(0, 4).map((c) => (
            <span key={c} className={cn('flex shrink-0 items-center gap-1 rounded-pill px-2.5 py-1 text-[10px] font-bold', c === activeCategory ? 'bg-gf-orange text-white' : 'bg-white text-gf-navy')}>
              {c === activeCategory && <Sparkles className="h-3 w-3" />}{c}
            </span>
          ))}
        </div>
        <div className="absolute right-2.5 top-[42%] flex flex-col items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-black/40"><Heart className="h-5 w-5" /></span>
          <span className="grid h-11 w-11 place-items-center rounded-full bg-gf-orange"><Plus className="h-6 w-6" /></span>
          <span className="grid h-10 w-10 place-items-center rounded-full bg-black/40"><Share className="h-5 w-5" /></span>
        </div>
        <div className="absolute inset-x-0 bottom-0 px-3.5 pb-3">
          {badges[0] && <span className="mb-1 inline-block rounded-pill bg-gf-orange-soft px-2 py-0.5 text-[10px] font-bold text-gf-orange">🔥 {BADGE_LABEL[badges[0]]}</span>}
          <p className="pr-12 font-heading text-2xl font-black leading-none">{name || 'Nome do item'}</p>
          {description && <p className="mt-1 line-clamp-2 pr-10 text-[11px] leading-tight text-white/90">{description}</p>}
          {description.length > 70 && <p className="text-[10px] font-semibold underline">ver mais</p>}
          {price != null && <p className="mt-1 font-heading text-2xl font-black">
            {promoPriceCents != null && priceCents != null && <s className="mr-1 text-xs text-white/60">{formatBRL(priceCents)}</s>}{formatBRL(price)}</p>}
          <p className="mt-1 flex flex-col items-center text-[10px]"><ChevronUp className="h-3 w-3" />Deslize para ver mais</p>
          <div className="mt-1.5 flex items-center justify-center gap-1.5 rounded-pill bg-gf-orange py-2 text-[11px] font-bold">
            <ShoppingCart className="h-3.5 w-3.5" />Ver pedido · 2 itens · R$ 57,80
          </div>
        </div>
      </div>
    </div>
  );
}
