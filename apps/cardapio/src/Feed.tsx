import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { formatBRL } from '@garfeed/shared/money';
import type { PublicItem, PublicRestaurant, TableRef } from '@garfeed/shared';
import type { Category } from './App';
import { Icon } from './icons';
import { BADGES, store, track } from './lib';
import { CartBar, Logo, MesaChip } from './ui';

/** "Economia de dados" do celular: não baixa o próximo vídeo antes da hora. */
const saveData = !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const BADGE_EMOJI = { MOST_ORDERED: '🔥', NEW: '✨', VEGAN: '🌱', SPICY: '🌶️' } as const;

type Props = {
  restaurant: PublicRestaurant; table: TableRef | null; canOrder: boolean; cartCount: number; cartTotal: number;
  categories: Category[]; items: PublicItem[]; activeIdx: number; setActiveIdx: (i: number) => void;
  onAdd: (it: PublicItem) => void; onGrid: () => void; onCart: () => void; onHub: () => void; say: (m: string) => void;
};

export function Feed(p: Props) {
  const { items, activeIdx } = p;
  const ref = useRef<HTMLDivElement>(null);
  const chips = useRef<HTMLDivElement>(null);
  const [favs, setFavs] = useState<string[]>(() => store.get('gf_fav', []));
  const [hint, setHint] = useState(() => !store.get('gf_hint', false));

  // Volta ao prato em que estava (grade → feed, link compartilhado).
  useLayoutEffect(() => {
    if (ref.current) ref.current.scrollTop = activeIdx * ref.current.clientHeight;
  }, []);

  // Mantém cada prato encaixado na tela: se a altura muda (barra de endereço do celular some/aparece) ou a rolagem
  // termina fora do lugar, volta para o prato atual. Sem isso, da 3ª tela em diante aparece um pedaço da próxima.
  const activeRef = useRef(activeIdx);
  activeRef.current = activeIdx;
  useEffect(() => {
    const c = ref.current!;
    let lastH = c.clientHeight;
    const ro = new ResizeObserver(() => {
      if (c.clientHeight === lastH) return;
      lastH = c.clientHeight;
      c.scrollTop = activeRef.current * c.clientHeight;
    });
    ro.observe(c);
    let t: ReturnType<typeof setTimeout> | undefined;
    const settle = () => {
      const h = c.clientHeight, i = Math.round(c.scrollTop / h);
      if (Math.abs(c.scrollTop - i * h) > 1) c.scrollTo({ top: i * h, behavior: reduced ? 'auto' : 'smooth' });
    };
    // scrollend (Chrome/Firefox); no Safari antigo, 150 ms sem rolar
    const onScroll = () => { clearTimeout(t); t = setTimeout(settle, 150); };
    const native = 'onscrollend' in window;
    c.addEventListener(native ? 'scrollend' : 'scroll', native ? settle : onScroll, { passive: true });
    return () => { ro.disconnect(); clearTimeout(t); c.removeEventListener(native ? 'scrollend' : 'scroll', native ? settle : onScroll); };
  }, []);

  useEffect(() => {
    const root = ref.current!;
    const io = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting) p.setActiveIdx(Number((e.target as HTMLElement).dataset.i));
    }, { root, threshold: 0.6 });
    root.querySelectorAll('[data-i]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items, p.setActiveIdx]);

  const active = items[activeIdx];
  // RF-27 item_view com ms visível.
  useEffect(() => {
    if (!active) return;
    const t = Date.now();
    return () => track('item_view', { itemId: active.id, value: Date.now() - t });
  }, [active]);

  useEffect(() => {
    if (activeIdx > 0 && hint) { setHint(false); store.set('gf_hint', true); }
    chips.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  }, [activeIdx, hint]);

  const jump = (c: Category) => {
    const i = items.findIndex((it) => it.categoryId === c.id);
    track('category_change', { categoryId: c.id });
    ref.current?.scrollTo({ top: i * ref.current.clientHeight, behavior: reduced ? 'auto' : 'smooth' });
  };

  const fav = (it: PublicItem) => {
    const on = !favs.includes(it.id);
    const next = on ? [...favs, it.id] : favs.filter((x) => x !== it.id);
    setFavs(next);
    store.set('gf_fav', next);
    if (on) track('favorite', { itemId: it.id });
  };

  const share = async (it: PublicItem) => {
    // Link só de visualização: compartilhar a URL da placa colocaria quem recebe dentro da mesa.
    const url = `${location.origin}/r/${p.restaurant.slug}?item=${it.id}`;
    const text = `${it.name} — ${p.restaurant.name}`;
    try {
      if (navigator.share) await navigator.share({ title: it.name, text, url });
      else { await navigator.clipboard.writeText(url); p.say('Link copiado!'); }
    } catch { /* cancelado */ }
  };

  return (
    <div className="relative h-full bg-gf-navy">
      <div ref={ref} className="no-scrollbar h-full snap-y snap-mandatory overflow-y-auto overscroll-contain">
        {items.map((it, i) => (
          <Slide key={it.id} it={it} i={i} active={i === activeIdx} near={i >= activeIdx - 2 && i <= activeIdx + 2}
            ahead={i > activeIdx} canOrder={p.canOrder} fav={favs.includes(it.id)} hint={hint && i === 0} bottomGap={p.cartCount > 0}
            onAdd={p.onAdd} onFav={fav} onShare={share} />
        ))}
      </div>

      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 space-y-3 pt-[max(12px,env(safe-area-inset-top))]">
        <div className="pointer-events-auto flex items-center justify-between gap-2 px-3">
          {p.table ? <MesaChip name={p.table.name} onClick={p.onHub} /> : <button type="button" onClick={p.onHub} className="min-h-11 rounded-pill bg-white px-4 font-heading font-extrabold shadow-md">Info</button>}
          <Logo white className="h-8 drop-shadow" />
          <button type="button" aria-label="Ver em grade" onClick={p.onGrid} className="grid h-12 w-12 place-items-center rounded-xl bg-white text-gf-navy shadow-md">
            <Icon name="grid" className="h-7 w-7" />
          </button>
        </div>
        <nav ref={chips} aria-label="Categorias" className="no-scrollbar pointer-events-auto flex gap-2 overflow-x-auto px-3 pb-1">
          {p.categories.map((c) => {
            const on = c.id === active?.categoryId;
            return (
              <button key={c.id} type="button" aria-current={on} onClick={() => jump(c)}
                className={`flex min-h-11 shrink-0 items-center gap-2 rounded-pill px-5 font-heading text-base font-extrabold shadow-md ${on ? 'bg-accent text-on-accent' : 'bg-white text-gf-navy'}`}>
                {c.name === 'Destaques' && <Icon name="sparkle" className="h-5 w-5" />}{c.name}
              </button>
            );
          })}
        </nav>
        {!p.canOrder && (
          <p role="status" className="mx-3 rounded-card bg-[#142433]/85 px-4 py-2 text-center text-sm font-medium text-white backdrop-blur">
            {p.restaurant.isOpen ? 'Pedidos pelo celular indisponíveis agora.' : 'Fechado agora.'} Cardápio só para visualização.
          </p>
        )}
      </header>

      {p.canOrder && p.cartCount > 0 && <CartBar count={p.cartCount} total={p.cartTotal} onClick={p.onCart} />}
    </div>
  );
}

type SlideProps = {
  it: PublicItem; i: number; active: boolean; near: boolean; ahead: boolean; canOrder: boolean; fav: boolean; hint: boolean; bottomGap: boolean;
  onAdd: (it: PublicItem) => void; onFav: (it: PublicItem) => void; onShare: (it: PublicItem) => void;
};

const Slide = memo(function Slide({ it, i, active, near, ahead, canOrder, fav, hint, bottomGap, onAdd, onFav, onShare }: SlideProps) {
  const [more, setMore] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const m = it.media;

  // Só o visível toca; prefers-reduced-motion = sem autoplay.
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (active && !reduced) void v.play().catch(() => {});
    else v.pause();
  }, [active, near]);

  const price = it.promoPriceCents ?? it.priceCents;
  return (
    <section data-i={i} aria-label={it.name} className="relative h-full snap-start snap-always overflow-hidden">
      <div className={`absolute inset-0 ${it.soldOut ? 'grayscale-[.75] brightness-75' : ''}`}>
        {/* Pré-carrega os 2 próximos; 3+ telas para trás a mídia é descarregada. */}
        {near && m?.url && m.type === 'VIDEO' ? (
          <video ref={video} src={m.url} poster={m.posterUrl ?? undefined} muted loop playsInline
            preload={active || (ahead && !saveData) ? 'auto' : 'metadata'} onClick={(e) => (e.currentTarget.paused ? void e.currentTarget.play() : e.currentTarget.pause())}
            className="h-full w-full object-cover" aria-label={`Vídeo: ${it.name}`} />
        ) : near && (m?.url ?? m?.posterUrl) ? (
          <img src={(m!.type === 'IMAGE' ? m!.url : m!.posterUrl) ?? m!.posterUrl ?? ''} alt={it.name} decoding="async"
            className={`h-full w-full object-cover ${active && !reduced ? 'kenburns' : ''}`} />
        ) : (
          <div className="media-fallback h-full w-full" />
        )}
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-transparent via-35% to-black/90" />

      <div className="absolute right-3 top-[56%] z-[1] flex -translate-y-1/2 flex-col items-center gap-4 [@media(max-height:500px)]:top-[62%] [@media(max-height:500px)]:gap-2">
        <button type="button" aria-pressed={fav} aria-label={fav ? 'Remover dos favoritos' : 'Favoritar'} onClick={() => onFav(it)}
          className={`grid h-14 w-14 place-items-center rounded-full bg-black/45 backdrop-blur ${fav ? 'text-accent' : 'text-white'}`}>
          <Icon name="heart" className="h-8 w-8" fill={fav} />
        </button>
        {canOrder && (
          <button type="button" disabled={it.soldOut} onClick={() => onAdd(it)} aria-label={it.soldOut ? `${it.name} esgotado` : `Adicionar ${it.name}`}
            className="grid h-16 w-16 place-items-center rounded-full bg-accent text-on-accent shadow-lg disabled:bg-white/40 disabled:text-white/80">
            <Icon name="plus" className="h-9 w-9" />
          </button>
        )}
        <button type="button" aria-label="Compartilhar" onClick={() => onShare(it)} className="grid h-14 w-14 place-items-center rounded-full bg-black/45 text-white backdrop-blur">
          <Icon name="share" className="h-7 w-7" />
        </button>
      </div>

      <div className={`absolute inset-x-0 bottom-0 px-5 text-white ${bottomGap ? 'pb-24 [@media(max-height:500px)]:pb-20' : 'pb-8 [@media(max-height:500px)]:pb-4'}`}>
        <div className="mr-16">
          <div className="mb-2 flex flex-wrap gap-2">
            {it.soldOut && (
              <span className="inline-flex items-center gap-1.5 rounded-pill bg-white/25 px-3 py-1 text-sm font-bold backdrop-blur">
                <Icon name="ban" className="h-5 w-5" />Esgotado hoje
              </span>
            )}
            {it.badges.map((b) => (
              <span key={b} className="rounded-pill bg-gf-orange-soft px-3 py-1 text-sm font-bold text-orange-text">{BADGE_EMOJI[b]} {BADGES[b]}</span>
            ))}
          </div>
          <h2 className="break-words font-heading text-4xl font-black leading-[1.05] drop-shadow [@media(max-height:500px)]:text-2xl">{it.name}</h2>
          {it.description && (
            <>
              <p className={`mt-2 text-base leading-snug text-white/95 ${more ? '' : 'line-clamp-2'}`}>{it.description}</p>
              {it.description.length > 70 && (
                <button type="button" onClick={() => setMore(!more)} className="min-h-11 text-base font-medium underline underline-offset-4">
                  {more ? 'ver menos' : 'ver mais'}
                </button>
              )}
            </>
          )}
          <p className="mt-1 font-heading text-4xl font-black [@media(max-height:500px)]:text-2xl">
            {formatBRL(price)}
            {it.promoPriceCents != null && <s className="ml-2 align-middle text-lg font-bold text-white/70">{formatBRL(it.priceCents)}</s>}
          </p>
        </div>
        {hint && (
          <p className="nudge mt-3 flex flex-col items-center text-sm font-medium text-white/90" aria-hidden="true">
            <Icon name="chevronUp" className="h-6 w-6" />Deslize para ver mais
          </p>
        )}
      </div>
    </section>
  );
});
