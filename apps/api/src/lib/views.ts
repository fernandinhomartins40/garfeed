// Conversões linha do banco → formato do contrato (@garfeed/shared).
import type { Prisma, Media as MediaRow } from '@prisma/client';
import type { Media, OrderItemOption, PanelCall, PanelOrder, PublicCall, PublicOrder, TableRef } from '@garfeed/shared';

export const tableRef = (t: { id: string; name: string; area: string | null }): TableRef => ({ id: t.id, name: t.name, area: t.area });

export const toMedia = (m: MediaRow): Media => ({
  id: m.id, type: m.type, url: m.url, posterUrl: m.posterUrl, thumbUrl: m.thumbUrl, width: m.width, height: m.height,
  durationMs: m.durationMs, status: m.status, error: m.error, createdAt: m.createdAt.toISOString(),
});

export const orderInclude = {
  items: { include: { item: { select: { media: { select: { thumbUrl: true, posterUrl: true } } } } } },
  table: true,
} satisfies Prisma.OrderInclude;
export type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export const toPublicOrder = (o: OrderRow): PublicOrder => ({
  id: o.id, number: o.number, status: o.status, customerName: o.customerName, totalCents: o.totalCents,
  rejectReason: o.rejectReason, createdAt: o.createdAt.toISOString(), updatedAt: o.updatedAt.toISOString(),
  items: o.items.map((i) => ({
    id: i.id, itemId: i.itemId, name: i.nameSnapshot, unitPriceCents: i.unitPriceCents, quantity: i.quantity,
    options: i.options as OrderItemOption[], note: i.note, sector: i.sector,
  })),
});
export const toPanelOrder = (o: OrderRow): PanelOrder => {
  const pub = toPublicOrder(o);
  return { ...pub, sessionId: o.sessionId, table: tableRef(o.table), items: pub.items.map((i, k) => ({ ...i, thumbUrl: o.items[k]!.item.media?.thumbUrl ?? o.items[k]!.item.media?.posterUrl ?? null })) };
};

type CallRow = Prisma.ServiceCallGetPayload<{ include: { table: true } }>;
export const toPublicCall = (c: Pick<CallRow, 'id' | 'type' | 'status' | 'createdAt'>): PublicCall => ({
  id: c.id, type: c.type, status: c.status, createdAt: c.createdAt.toISOString(),
});
export const toPanelCall = (c: CallRow): PanelCall => ({
  ...toPublicCall(c), sessionId: c.sessionId, table: tableRef(c.table), doneAt: c.doneAt?.toISOString() ?? null,
});

/** Soma informativa da mesa: ignora recusados/cancelados. */
export const sessionTotal = (orders: { status: string; totalCents: number }[]) =>
  orders.filter((o) => o.status !== 'REJECTED' && o.status !== 'CANCELED').reduce((s, o) => s + o.totalCents, 0);
