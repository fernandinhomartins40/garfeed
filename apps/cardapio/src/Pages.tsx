import { useState, type ReactNode } from 'react';
import { formatBRL } from '@garfeed/shared/money';
import type { OrderStatus, PublicItem, PublicOrder, PublicRestaurant, TableRef } from '@garfeed/shared';
import type { CartLine } from './App';
import { Icon, type IconName } from './icons';
import { pad3, STATUS_LABEL, store } from './lib';
import { IconBtn, Logo, MesaChip, PoweredBy, RestLogo, Stepper, Thumb } from './ui';

const Btn = ({ children, onClick, disabled, outline, icon }: { children: ReactNode; onClick: () => void; disabled?: boolean; outline?: boolean; icon?: IconName }) => (
  <button type="button" onClick={onClick} disabled={disabled}
    className={`flex h-14 w-full items-center justify-center gap-3 rounded-pill font-heading text-lg font-black disabled:opacity-60 ${outline ? 'border-2 border-gf-border text-gf-navy' : 'bg-gf-orange text-white active:bg-gf-orange-hover'}`}>
    {icon && <Icon name={icon} className="h-7 w-7" />}{children}
  </button>
);
const Page = ({ children }: { children: ReactNode }) => (
  <main className="mx-auto min-h-full max-w-md bg-white px-4 pb-8 pt-[max(16px,env(safe-area-inset-top))]">{children}</main>
);
const Top = ({ onBack, right }: { onBack?: () => void; right?: ReactNode }) => (
  <header className="relative flex h-16 items-center justify-center">
    {onBack && <span className="absolute left-0"><IconBtn label="Voltar" onClick={onBack} className="border border-gf-border bg-white shadow-sm"><Icon name="back" /></IconBtn></span>}
    <Logo className="h-11" />
    {right && <span className="absolute right-0">{right}</span>}
  </header>
);
const optText = (o: { option: string }[]) => o.map((x) => ` + ${x.option}`).join('');

// ---------- M1 ----------
export function NotActive({ onRetry }: { onRetry: () => void }) {
  return (
    <Page>
      <div className="flex min-h-[90dvh] flex-col items-center justify-center text-center">
        <Logo className="h-16" />
        <svg viewBox="0 0 200 150" className="my-10 w-56" aria-hidden="true" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="100" cy="132" rx="80" ry="12" fill="#E6E8EC" />
          <path d="M60 30h60l22 95h-28z" fill="#E6E8EC" stroke="#3A4756" strokeWidth="3" />
          <rect x="38" y="30" width="82" height="96" rx="8" fill="#fff" stroke="#3A4756" strokeWidth="3" transform="skewX(-6) translate(12 0)" />
          <path d="M66 62a26 26 0 0 1 32 0M71 70a17 17 0 0 1 22 0M76 78a8 8 0 0 1 12 0" stroke="#3A4756" strokeWidth="3" />
          <text x="82" y="105" textAnchor="middle" fontSize="16" fontWeight="800" fontStyle="italic" fill="#3A4756" fontFamily="Inter, sans-serif">NFC</text>
          <path d="M140 8l-3 12M156 16l-9 8M160 32l-12 1" stroke="#FE581D" strokeWidth="4" />
        </svg>
        <h1 className="font-heading text-4xl font-black leading-tight">Esta mesa ainda não foi ativada</h1>
        <p className="mt-4 text-lg text-gf-navy-80">Peça ajuda ao garçom.<br />Enquanto isso, conheça o Garfeed.</p>
        <a href="https://instagram.com/garfeed" target="_blank" rel="noopener noreferrer" className="mt-6 inline-block min-h-11 font-heading text-2xl font-black text-orange-text underline underline-offset-4">@garfeed</a>
        <button type="button" onClick={onRetry} className="mt-6 min-h-11 px-4 text-sm font-medium text-gf-muted underline">Verificar de novo</button>
      </div>
    </Page>
  );
}

export function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Page>
      <div className="flex min-h-[90dvh] flex-col items-center justify-center gap-6 text-center">
        <Logo className="h-12" />
        <h1 className="font-heading text-3xl font-black">Não deu para abrir o cardápio</h1>
        <p className="text-gf-navy-80">{message}</p>
        <Btn onClick={onRetry} icon="refresh">Tentar novamente</Btn>
      </div>
    </Page>
  );
}

// ---------- M2 (e "mesa encerrada" após session:closed) ----------
export function Welcome({ restaurant, table, closed, onContinue }: { restaurant: PublicRestaurant | null; table: TableRef | null; closed: boolean; onContinue: () => void }) {
  return (
    <main className="media-fallback relative flex h-full flex-col items-center px-6 pb-[max(24px,env(safe-area-inset-bottom))] pt-[12dvh] text-center text-white">
      {restaurant && <RestLogo r={restaurant} className="h-40 w-40 text-5xl" />}
      <h1 className="mt-8 font-heading text-5xl font-black">{closed ? 'Até a próxima!' : 'Bem-vindo!'}</h1>
      <p className="mt-2 text-2xl">
        {closed ? 'Esta mesa foi encerrada.' : <>Você está na <b className="font-heading font-black">{table?.name ?? restaurant?.name}</b></>}
      </p>
      <button type="button" onClick={onContinue}
        className="mt-8 flex h-16 w-full max-w-sm items-center justify-between rounded-pill bg-gf-orange px-8 font-heading text-2xl font-black text-white shadow-lg">
        <Icon name="book" className="h-8 w-8" />{closed ? 'Abrir de novo' : 'Ver cardápio'}<Icon name="chevronRight" className="h-7 w-7" />
      </button>
      <div className="mt-auto"><PoweredBy white /></div>
    </main>
  );
}

type Common = { restaurant: PublicRestaurant; table: TableRef | null; onBack: () => void };
const mesa = (t: TableRef | null) => (t ? ` · ${t.name}` : '');

// ---------- M7 ----------
export function Cart({ restaurant, table, cart, byId, sending, onBack, onSend, onQty, onRemove, cartTotal }: Common & {
  cart: CartLine[]; byId: Map<string, PublicItem>; sending: boolean; cartTotal: number;
  onSend: (name: string) => void; onQty: (key: string, q: number) => void; onRemove: (key: string) => void;
}) {
  const [name, setName] = useState(() => store.get('gf_name', ''));
  return (
    <Page>
      <Top onBack={onBack} />
      <div className="mt-4 flex items-center gap-4 rounded-2xl bg-gf-orange-soft p-4">
        <Icon name="store" className="h-10 w-10 shrink-0" />
        <span className="h-12 w-px bg-gf-peach" />
        <div className="min-w-0">
          <p className="font-heading text-xl font-black leading-tight">{restaurant.name}</p>
          {table && <span className="mt-1 inline-flex items-center gap-2 rounded-lg bg-gf-peach px-3 py-1 font-heading font-extrabold text-orange-text"><Icon name="table" className="h-5 w-5" />{table.name}</span>}
        </div>
      </div>
      <h1 className="mt-6 flex items-center gap-3 font-heading text-3xl font-black"><Icon name="cart" className="h-9 w-9" />Seu pedido{mesa(table)}</h1>

      {!cart.length ? (
        <div className="mt-10 space-y-6 text-center">
          <p className="text-lg text-gf-navy-80">Seu pedido está vazio.</p>
          <Btn onClick={onBack}>Ver o cardápio</Btn>
        </div>
      ) : (
        <>
          <ul className="mt-4 space-y-3">
            {cart.map((l) => (
              <li key={l.key} className="flex gap-3 rounded-2xl border border-gf-border p-3 shadow-sm">
                <Thumb item={byId.get(l.itemId)} className="h-32 w-28 shrink-0 rounded-xl" />
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-2">
                    <p className="font-heading text-lg font-black leading-tight">{l.name}</p>
                    <p className="shrink-0 font-heading text-lg font-black">{formatBRL(l.unitPriceCents * l.quantity)}</p>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {l.optionLabels.map((o) => <span key={o} className="inline-flex items-center gap-1 rounded-pill bg-gf-bg px-2.5 py-1 text-sm text-gf-navy-80"><Icon name="plusCircle" className="h-4 w-4" />{o}</span>)}
                    {l.note && <span className="inline-flex items-center gap-1 rounded-pill bg-gf-orange-soft px-2.5 py-1 text-sm font-semibold text-orange-text"><Icon name="message" className="h-4 w-4" />{l.note}</span>}
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <Stepper value={l.quantity} min={1} onChange={(q) => onQty(l.key, q)} />
                    <IconBtn label={`Remover ${l.name}`} onClick={() => onRemove(l.key)} className="border border-gf-border bg-white"><Icon name="trash" /></IconBtn>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <label htmlFor="nome" className="mt-6 block text-gf-navy-80">Seu nome (para o garçom te chamar)</label>
          <input id="nome" value={name} maxLength={40} autoComplete="given-name" onChange={(e) => setName(e.target.value)}
            className="mt-2 h-14 w-full rounded-xl border border-gf-border px-4 text-lg outline-none focus:border-gf-orange" />
          <div className="mt-5 flex items-center justify-between rounded-2xl bg-gf-bg px-5 py-5">
            <span className="font-heading text-2xl font-black">Total</span>
            <span className="font-heading text-3xl font-black">{formatBRL(cartTotal)}</span>
          </div>
          <p className="mt-4 flex items-center gap-2 text-gf-navy-80"><Icon name="info" className="h-5 w-5 shrink-0" />O restaurante confirma seu pedido em instantes.</p>
          <div className="mt-4"><Btn onClick={() => onSend(name)} disabled={sending} icon="send">{sending ? 'Enviando…' : 'Enviar pedido'}</Btn></div>
        </>
      )}
    </Page>
  );
}

// ---------- M8 ----------
const STEPS: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'DELIVERED'];
const hour = (iso: string) => `Hoje às ${new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

export function Track({ restaurant, table, order, byId, onBack, onCall }: Common & { order: PublicOrder | null; byId: Map<string, PublicItem>; onCall: () => void }) {
  if (!order) return <Page><Top onBack={onBack} /><p className="mt-10 text-center text-gf-navy-80" aria-busy="true">Carregando pedido…</p></Page>;
  const rejected = order.status === 'REJECTED' || order.status === 'CANCELED';
  const cur = STEPS.indexOf(order.status);
  return (
    <Page>
      <header className="flex h-14 items-center"><Logo className="h-11" /></header>
      <div className="mt-2 flex items-center gap-3">
        <RestLogo r={restaurant} className="h-14 w-14 rounded-2xl text-lg" />
        <div><p className="font-heading text-xl font-black">{restaurant.name}</p>{table && <p className="flex items-center gap-1 text-gf-navy-80"><Icon name="table" className="h-5 w-5" />{table.name}</p>}</div>
      </div>
      <div className="mt-6 text-center">
        <span className={`mx-auto grid h-24 w-24 place-items-center rounded-full ${rejected ? 'bg-red-50 text-danger' : 'bg-gf-orange-soft text-gf-orange'}`}>
          <Icon name={rejected ? 'ban' : 'receipt'} className="h-12 w-12" />
        </span>
        <h1 className="mt-3 font-heading text-4xl font-black">{rejected ? `Pedido ${STATUS_LABEL[order.status].toLowerCase()}` : 'Pedido enviado!'}</h1>
        <p className="text-xl text-gf-navy-80">Pedido nº {pad3(order.number)}{mesa(table)}</p>
      </div>

      {rejected ? (
        <p role="alert" className="mt-5 rounded-card bg-red-50 p-4 text-center text-danger">
          {order.rejectReason ? `Motivo: ${order.rejectReason}` : 'O restaurante não pôde aceitar este pedido.'} Fale com o garçom se precisar.
        </p>
      ) : (
        <ol className="mx-2 mt-6" aria-label="Andamento do pedido">
          {STEPS.map((s, i) => {
            const done = i < cur || order.status === 'DELIVERED';
            const now = i === cur && order.status !== 'DELIVERED';
            return (
              <li key={s} className="relative flex gap-4 pb-4 last:pb-0" aria-current={now ? 'step' : undefined}>
                {i < STEPS.length - 1 && <span className={`absolute left-[13px] top-7 h-full w-0.5 ${i < cur ? 'bg-gf-orange' : 'bg-gf-border'}`} />}
                <span className={`relative z-[1] grid h-7 w-7 shrink-0 place-items-center rounded-full ${done ? 'bg-success text-white' : now ? 'border-[7px] border-gf-orange bg-white' : 'border-[3px] border-gf-border bg-white'}`}>
                  {done && <Icon name="check" className="h-4 w-4" />}
                </span>
                <div>
                  <p className={`font-heading text-xl font-black ${now ? 'text-orange-text' : done ? '' : 'text-gf-navy-80'}`}>{STATUS_LABEL[s]}</p>
                  {(i === 0 || now) && <p className="text-sm text-gf-muted">{hour(i === 0 ? order.createdAt : order.updatedAt)}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <section className="mt-6 rounded-2xl bg-gf-bg p-4">
        <h2 className="font-heading text-xl font-black">Seu pedido</h2>
        <ul className="divide-y divide-gf-border">
          {order.items.map((l) => (
            <li key={l.id} className="flex items-center gap-3 py-2">
              <Thumb item={byId.get(l.itemId)} className="h-14 w-16 shrink-0 rounded-lg" />
              <span className="flex-1 font-heading font-extrabold">{l.quantity}× {l.name}{optText(l.options)}</span>
              <span className="font-heading font-extrabold">{formatBRL(l.unitPriceCents * l.quantity)}</span>
            </li>
          ))}
        </ul>
      </section>
      <div className="mt-5 space-y-3">
        <Btn onClick={onBack}>Continuar vendo o cardápio</Btn>
        <Btn onClick={onCall} outline icon="bell">Chamar garçom</Btn>
      </div>
    </Page>
  );
}

// ---------- M11 ----------
const live = (o: PublicOrder) => o.status !== 'REJECTED' && o.status !== 'CANCELED';
export function Bill({ restaurant, table, orders, totalCents, byId, onBack, onCall }: Common & { orders: PublicOrder[]; totalCents: number; byId: Map<string, PublicItem>; onCall: () => void }) {
  const list = orders.filter(live).sort((a, b) => a.number - b.number);
  return (
    <Page>
      <Top />
      <button type="button" onClick={onBack} className="mt-2 flex min-h-11 items-center gap-2 rounded-xl border border-gf-border bg-gf-bg px-4 font-heading font-extrabold"><Icon name="back" className="h-5 w-5" />Voltar</button>
      <h1 className="mt-5 font-heading text-4xl font-black">Resumo{table ? ` da ${table.name}` : ''}</h1>
      <p className="mt-1 flex items-center gap-2 font-heading text-lg font-extrabold text-gf-navy-80"><Icon name="store" />{restaurant.name}</p>
      {!list.length && <p className="mt-8 text-center text-gf-navy-80">Nenhum pedido nesta mesa ainda.</p>}
      <div className="mt-4 space-y-4">
        {list.map((o) => (
          <section key={o.id} className="rounded-2xl border border-gf-border p-4 shadow-sm">
            <h2 className="flex items-center gap-3 border-b border-gf-border pb-3 font-heading text-xl font-black"><Icon name="file" className="h-7 w-7 text-info" />Pedido nº {pad3(o.number)}</h2>
            <ul className="divide-y divide-gf-border">
              {o.items.map((l) => (
                <li key={l.id} className="flex items-center gap-3 py-3">
                  <Thumb item={byId.get(l.itemId)} className="h-20 w-24 shrink-0 rounded-xl" />
                  <span className="flex-1 font-heading text-lg font-extrabold leading-tight">{l.quantity}× {l.name}{optText(l.options)}</span>
                  <span className="font-heading text-lg font-black">{formatBRL(l.unitPriceCents * l.quantity)}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <div className="mt-5 flex items-center justify-between rounded-2xl bg-gf-orange-soft px-5 py-5">
        <span className="font-heading text-2xl font-black">Subtotal</span>
        <span className="font-heading text-3xl font-black">{formatBRL(totalCents)}</span>
      </div>
      <p className="mt-3 flex items-center gap-2 rounded-2xl bg-gf-bg px-4 py-3 text-gf-navy-80"><Icon name="info" className="h-5 w-5 shrink-0" />Valor informativo — confira com o garçom.</p>
      <div className="mt-4"><Btn onClick={onCall} icon="bell">Chamar garçom para pagar</Btn></div>
    </Page>
  );
}

// ---------- M12 ----------
const STATUS_STYLE: Record<OrderStatus, string> = {
  PENDING: 'bg-gf-bg text-gf-navy', CONFIRMED: 'bg-info text-white', PREPARING: 'bg-warning text-gf-navy',
  READY: 'bg-gf-orange text-white', DELIVERED: 'bg-success text-white', REJECTED: 'bg-danger text-white', CANCELED: 'bg-gf-muted text-white',
};
export function TableOrders({ restaurant, table, orders, byId, canOrder, onBack, onRepeat, onOpen }: Common & {
  orders: PublicOrder[]; byId: Map<string, PublicItem>; canOrder: boolean;
  onRepeat: (l: PublicOrder['items'][number]) => void; onOpen: (id: string) => void;
}) {
  const list = [...orders].sort((a, b) => a.number - b.number);
  return (
    <Page>
      <Top />
      <div className="mt-2 flex items-center gap-3">
        <IconBtn label="Voltar" onClick={onBack}><Icon name="back" /></IconBtn>
        <h1 className="flex-1 font-heading text-2xl font-black">Pedidos da mesa</h1>
        {table && <MesaChip name={table.name} soft />}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <RestLogo r={restaurant} className="h-16 w-16 rounded-xl text-xl" />
        <p className="font-heading text-2xl font-black leading-tight">{restaurant.name}</p>
      </div>
      {!list.length && <p className="mt-8 text-center text-gf-navy-80">Nenhum pedido nesta mesa ainda.</p>}
      <ul className="mt-4 space-y-3 pb-24">
        {list.map((o) => (
          <li key={o.id} className="rounded-2xl border border-gf-border p-4 shadow-sm">
            <button type="button" onClick={() => onOpen(o.id)} className="flex min-h-11 w-full items-center gap-3 text-left">
              <Icon name="bag" className="h-6 w-6 shrink-0" />
              <span className="flex-1 font-heading text-lg font-black">Pedido nº {pad3(o.number)}{o.customerName ? ` · ${o.customerName}` : ''}</span>
              <span className={`inline-flex items-center gap-1 rounded-pill px-3 py-1 text-sm font-bold ${STATUS_STYLE[o.status]}`}>
                {o.status === 'DELIVERED' && <Icon name="check" className="h-4 w-4" />}{o.status === 'PREPARING' && <Icon name="chef" className="h-4 w-4" />}
                {STATUS_LABEL[o.status]}
              </span>
            </button>
            <div className="mt-2 flex gap-3">
              <Thumb item={byId.get(o.items[0]?.itemId ?? '')} className="h-20 w-24 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1">
                {o.items.map((l) => (
                  <div key={l.id} className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-heading font-extrabold">{l.quantity}× {l.name}{optText(l.options)}</p>
                    {o.status === 'DELIVERED' && canOrder && (
                      <button type="button" onClick={() => onRepeat(l)} className="flex min-h-11 items-center gap-2 rounded-pill border border-gf-navy-80 px-3 text-sm font-semibold">
                        <Icon name="refresh" className="h-5 w-5" />Mais uma igual
                      </button>
                    )}
                  </div>
                ))}
                <p className="mt-1 font-heading text-xl font-black">{formatBRL(o.totalCents)}</p>
                {o.status === 'REJECTED' && o.rejectReason && <p className="text-sm text-danger">Motivo: {o.rejectReason}</p>}
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div className="fixed inset-x-0 bottom-0 bg-white/90 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-2 backdrop-blur">
        <button type="button" onClick={onBack} className="mx-auto flex h-14 w-full max-w-md items-center justify-center gap-3 rounded-2xl border border-gf-orange bg-gf-orange-soft font-heading text-lg font-black text-orange-text">
          <Icon name="book" className="h-6 w-6" />Voltar ao cardápio
        </button>
      </div>
    </Page>
  );
}
