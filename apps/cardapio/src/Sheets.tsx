import { useEffect, useState, type ReactNode } from 'react';
import { formatBRL } from '@garfeed/shared/money';
import type { PublicItem, PublicRestaurant, TableRef } from '@garfeed/shared';
import type { Dialog } from './App';
import { Icon, type IconName } from './icons';
import { groupError, groupHint, itemPrice, openUntil, todayHours, unitPrice } from './lib';
import { IconBtn, Logo, MesaChip, RestLogo, Stepper, Thumb } from './ui';

function useEsc(onClose: () => void) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', f);
    return () => removeEventListener('keydown', f);
  }, [onClose]);
}

function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  useEsc(onClose);
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-[#142433]/50" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}
        className="sheet-in max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-sheet bg-white px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-gf-border" />
        {children}
      </div>
    </div>
  );
}

/** M6 — opcionais com min/max, observação (140), quantidade e total. */
export function OptionsSheet({ item, optionIds = [], note: note0 = '', canOrder, onClose, onAdd }: {
  item: PublicItem; optionIds?: string[]; note?: string; canOrder: boolean; onClose: () => void;
  onAdd: (ids: string[], note: string, qty: number) => void;
}) {
  const [picked, setPicked] = useState(optionIds);
  const [note, setNote] = useState(note0);
  const [qty, setQty] = useState(1);
  const [tried, setTried] = useState(false);
  const errors = item.optionGroups.map((g) => groupError(g, picked));
  const firstErr = errors.find(Boolean);

  const toggle = (gIdx: number, id: string) => {
    const g = item.optionGroups[gIdx]!;
    const ids = g.options.map((o) => o.id);
    setPicked((p) => {
      if (g.max === 1) return [...p.filter((x) => !ids.includes(x)), id];
      if (p.includes(id)) return p.filter((x) => x !== id);
      return p.filter((x) => ids.includes(x)).length >= g.max ? p : [...p, id];
    });
  };

  return (
    <Sheet label="Personalizar pedido" onClose={onClose}>
      <div className="flex items-center">
        <IconBtn label="Fechar" onClick={onClose}><Icon name="back" /></IconBtn>
        <h2 className="flex-1 pr-12 text-center font-heading text-2xl font-black">Personalizar pedido</h2>
      </div>
      <div className="mt-4 flex items-center gap-4">
        <Thumb item={item} className="h-20 w-24 shrink-0 rounded-xl min-[360px]:h-24 min-[360px]:w-32" />
        <div className="min-w-0">
          <p className="font-heading text-2xl font-black leading-tight">{item.name}</p>
          <p className="font-heading text-2xl font-black text-orange-text">{formatBRL(itemPrice(item))}</p>
        </div>
      </div>

      {item.optionGroups.map((g, gi) => (
        <fieldset key={g.id} className={`mt-4 rounded-2xl border p-3 ${tried && errors[gi] ? 'border-danger' : 'border-gf-border'}`}>
          <legend className="sr-only">{g.name}</legend>
          <p className="font-heading text-xl font-black" aria-hidden="true">{g.name}</p>
          <p className={`text-sm ${tried && errors[gi] ? 'text-danger' : 'text-gf-muted'}`}>{tried && errors[gi] ? errors[gi] : groupHint(g)}</p>
          <div className="mt-2 space-y-2">
            {g.options.map((o) => {
              const on = picked.includes(o.id);
              const single = g.max === 1;
              return (
                <label key={o.id} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-3 ${on ? 'border-gf-orange bg-gf-orange-soft' : 'border-gf-border'}`}>
                  <input type={single ? 'radio' : 'checkbox'} name={g.id} checked={on} onChange={() => toggle(gi, o.id)}
                    className="h-6 w-6 accent-[var(--gf-orange)]" />
                  <span className="flex-1 text-lg">{o.name}</span>
                  {o.priceCents > 0 && <span className="font-heading text-lg font-black text-orange-text">+{formatBRL(o.priceCents)}</span>}
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}

      <div className="mt-4 rounded-2xl border border-gf-border p-3">
        <label htmlFor="obs" className="font-heading text-xl font-black">Alguma observação?</label>
        <div className="relative mt-2">
          <input id="obs" value={note} maxLength={140} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: sem cebola"
            className="h-12 w-full rounded-lg border border-gf-border px-3 pr-12 text-lg outline-none focus:border-gf-orange" />
          {note && <button type="button" aria-label="Limpar observação" onClick={() => setNote('')} className="absolute right-0 top-0 grid h-12 w-12 place-items-center text-gf-muted"><Icon name="x" /></button>}
        </div>
        <p className="mt-1 text-right text-xs text-gf-muted">{note.length}/140</p>
      </div>

      <div className="sticky bottom-0 -mx-4 mt-4 flex items-center gap-3 bg-white px-4 py-3">
        <Stepper value={qty} onChange={setQty} />
        <button type="button" disabled={!canOrder || item.soldOut}
          onClick={() => (firstErr ? setTried(true) : onAdd(picked, note.trim(), qty))}
          className="h-14 flex-1 rounded-pill bg-gf-orange font-heading text-lg font-black text-white disabled:bg-gf-border disabled:text-gf-muted">
          {item.soldOut ? 'Esgotado hoje' : `Adicionar · ${formatBRL(unitPrice(item, picked) * qty)}`}
        </button>
      </div>
    </Sheet>
  );
}

const Row = ({ icon, title, sub, action }: { icon: IconName; title: string; sub: string; action?: ReactNode }) => (
  <div className="flex min-h-16 items-center gap-4 border-b border-gf-border py-3 last:border-0">
    <Icon name={icon} className="h-7 w-7 shrink-0" />
    <div className="min-w-0 flex-1"><p className="font-heading text-lg font-extrabold">{title}</p><p className="break-words text-gf-muted">{sub}</p></div>
    {action}
  </div>
);

/** M9 — hub da mesa. Linhas sem dado não aparecem. */
export function Hub({ restaurant: r, table, hasSession, onClose, onCall, onBill, onOrders, say }: {
  restaurant: PublicRestaurant; table: TableRef | null; hasSession: boolean; onClose: () => void;
  onCall: () => void; onBill: () => void; onOrders: () => void; say: (m: string) => void;
}) {
  const until = r.isOpen ? openUntil(r.openingHours) : null;
  const hours = todayHours(r.openingHours);
  const ig = r.instagram?.replace(/^@/, '').trim();
  const copy = async () => {
    try { await navigator.clipboard.writeText(r.wifiPassword ?? ''); say('Senha do Wi-Fi copiada!'); } catch { say(`Senha: ${r.wifiPassword}`); }
  };
  const Card = ({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }) => (
    <button type="button" onClick={onClick} className="flex min-h-16 w-full items-center gap-4 rounded-card border border-gf-border px-4 text-left active:bg-gf-bg">
      <Icon name={icon} className="h-8 w-8" /><span className="flex-1 font-heading text-xl font-black">{label}</span>
      <Icon name="chevronRight" className="h-6 w-6 text-orange-text" />
    </button>
  );
  return (
    <Sheet label="Menu da mesa" onClose={onClose}>
      <div className="flex flex-wrap items-center gap-3">
        <RestLogo r={r} className="h-16 w-16 text-xl" />
        <div className="min-w-0 flex-1 basis-36">
          <h2 className="font-heading text-xl font-black leading-tight">{r.name}</h2>
          <p className={`flex items-center gap-2 ${r.isOpen ? 'text-success' : 'text-gf-muted'}`}>
            <span className={`h-2.5 w-2.5 rounded-full ${r.isOpen ? 'bg-success' : 'bg-gf-muted'}`} />
            {r.isOpen ? (until ? `Aberto até ${until}` : 'Aberto agora') : 'Fechado agora'}
          </p>
        </div>
        {table && <MesaChip name={table.name} soft />}
      </div>
      {hasSession && (
        <div className="mt-5 space-y-3">
          <Card icon="bell" label="Chamar garçom" onClick={onCall} />
          <Card icon="receipt" label="Pedir a conta" onClick={onBill} />
          <Card icon="layers" label="Pedidos da mesa" onClick={onOrders} />
        </div>
      )}
      <div className="mt-4 border-t border-gf-border">
        {r.wifiName && <Row icon="wifi" title="Wi-Fi" sub={r.wifiName} action={r.wifiPassword && (
          <button type="button" onClick={copy} className="flex min-h-11 items-center gap-2 rounded-pill border border-gf-navy px-4 font-semibold"><Icon name="copy" className="h-5 w-5" />Copiar senha</button>
        )} />}
        {ig && (
          <a href={`https://instagram.com/${encodeURIComponent(ig)}`} target="_blank" rel="noopener noreferrer" className="block">
            <Row icon="instagram" title="Instagram" sub={`@${ig}`} action={<Icon name="chevronRight" className="h-6 w-6 text-orange-text" />} />
          </a>
        )}
        {r.openingHours && <Row icon="clock" title="Horário de funcionamento" sub={hours ? `Hoje: ${hours}` : 'Fechado hoje'} />}
      </div>
      <div className="mt-4 space-y-2 text-center">
        <p className="flex items-center justify-center gap-2 text-sm text-gf-navy-80">Powered by <Logo className="h-6" /></p>
        <a href="https://garfeed.com.br/privacidade" target="_blank" rel="noopener noreferrer" className="inline-block min-h-11 py-3 text-sm text-gf-navy-80 underline">
          Política de privacidade
        </a>
      </div>
    </Sheet>
  );
}

/** M10 — contagem do bloqueio a partir do prazo salvo (servidor/retryAfterSec); reabrir não reinicia. */
export function CallDialog({ dialog, table, onClose, onAgain }: { dialog: Dialog; table: TableRef | null; onClose: () => void; onAgain: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEsc(onClose);
  const left = Math.max(0, Math.ceil((dialog.until - now) / 1000));
  const where = table ? ` da ${table.name}` : '';
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#142433]/45 p-4">
      <div role="alertdialog" aria-modal="true" aria-labelledby="call-t" className="max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-3xl bg-white p-6 text-center shadow-xl">
        <span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-gf-orange-soft text-gf-orange">
          <Icon name={dialog.type === 'BILL' ? 'receipt' : 'bell'} className="h-10 w-10" />
        </span>
        <h2 id="call-t" className="mt-3 font-heading text-3xl font-black leading-tight">
          {dialog.type === 'BILL' ? `Conta a caminho${where} 🧾` : `Garçom a caminho${where} 🙌`}
        </h2>
        <p className="mt-2 text-gf-muted" aria-live="polite">{left > 0 ? `Você pode chamar de novo em ${left} s` : 'Precisa de mais alguma coisa? Pode chamar de novo.'}</p>
        <button type="button" disabled={left > 0} onClick={onAgain}
          className="mt-5 h-12 w-full rounded-pill bg-gf-orange-soft font-heading text-lg font-black text-orange-text disabled:bg-gf-bg disabled:text-gf-muted">
          Chamar novamente
        </button>
        <button type="button" onClick={onClose} className="mt-3 h-12 w-full rounded-pill bg-gf-orange font-heading text-lg font-black text-white">Entendi</button>
      </div>
    </div>
  );
}
