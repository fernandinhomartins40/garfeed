import { useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CircleCheck, Flame, FolderPlus, ImageOff, Layers, Leaf, Loader2, Pencil, Plus, Sparkles, Trash2, Upload, UtensilsCrossed, AlertTriangle, Copy } from 'lucide-react';
import { api, BADGE_LABEL, CreateCategoryBody, formatBRL, type Badge as BadgeT, type Category, type ImportCsvResponse, type Item, type Media } from '@garfeed/shared';
import { call, errMsg } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Confirm, Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge, Card, Empty, ErrorBox, MoreButton, PageTitle, Spinner, type Tone } from '@/components/ui/misc';
import { Dropdown } from '@/components/ui/dropdown';
import { Handle, Sortable, SortableList } from '@/components/Sortable';

export const mk = { cats: ['menu', 'categories'] as const, items: (c?: string) => ['menu', 'items', c ?? 'all'] as const, groups: ['menu', 'groups'] as const };

export const BADGE_STYLE: Record<BadgeT, { tone: Tone; icon: typeof Flame }> = {
  MOST_ORDERED: { tone: 'orange', icon: Flame }, NEW: { tone: 'blue', icon: Sparkles }, VEGAN: { tone: 'green', icon: Leaf }, SPICY: { tone: 'red', icon: Flame },
};
export const thumbOf = (m: Media | null) => m && (m.thumbUrl ?? m.posterUrl ?? (m.type === 'IMAGE' ? m.url : null));

export function MediaStatus({ m }: { m: Media | null }) {
  if (!m) return <span className="text-sm text-gf-muted">Sem mídia</span>;
  if (m.status === 'READY') return <Badge tone="green"><CircleCheck className="h-4 w-4" />Pronto</Badge>;
  if (m.status === 'FAILED') return <Badge tone="red" title={m.error ?? undefined}><AlertTriangle className="h-4 w-4" />Falhou</Badge>;
  return <Badge tone="blue"><Loader2 className="h-4 w-4 animate-spin" />Processando…</Badge>;
}

export function useCsvImport() {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<ImportCsvResponse | null>(null);
  const m = useMutation({
    mutationFn: async (f: File) => call(api.menu.importCsv, { body: { csv: await f.text() } }),
    onSuccess: (r) => { setResult(r); void qc.invalidateQueries({ queryKey: ['menu'] }); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const el = <>
    <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) m.mutate(f); e.target.value = ''; }} />
    <Dialog open={!!result} onOpenChange={() => setResult(null)} title="Planilha importada">
      {result && <>
        <p className="text-lg">{result.categoriesCreated} categorias e <b>{result.itemsCreated} itens</b> criados.</p>
        {result.errors.length > 0 && <ul className="mt-3 max-h-60 space-y-1 overflow-y-auto rounded-lg bg-red-50 p-3 text-sm text-danger">
          {result.errors.map((e) => <li key={e.line}>Linha {e.line}: {e.message}</li>)}</ul>}
      </>}
    </Dialog>
  </>;
  return { open: () => input.current?.click(), pending: m.isPending, el };
}

export function MenuPage() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const cats = useQuery({ queryKey: mk.cats, queryFn: () => call(api.menu.listCategories) });
  const catId = params.get('categoria') ?? cats.data?.[0]?.id;
  const items = useQuery({ queryKey: mk.items(catId), enabled: !!catId, queryFn: () => call(api.menu.listItems, { query: { categoryId: catId } }) });
  const [catDialog, setCatDialog] = useState<Category | 'new' | null>(null);
  const [delItem, setDelItem] = useState<Item | null>(null);
  const csv = useCsvImport();

  const reorder = <T extends { id: string }>(key: readonly unknown[], fn: (ids: string[]) => Promise<T[]>) => (ids: string[]) => {
    const prev = qc.getQueryData<T[]>(key);
    qc.setQueryData<T[]>(key, (l = []) => ids.map((id) => l.find((x) => x.id === id)!).filter(Boolean));
    fn(ids).then((r) => qc.setQueryData(key, r)).catch((e: unknown) => { qc.setQueryData(key, prev); toast.error(`Ordem não salva: ${errMsg(e)}`); });
  };
  const patchItem = useMutation({
    mutationFn: ({ id, ...b }: { id: string; soldOut?: boolean; visible?: boolean }) =>
      b.soldOut !== undefined ? call(api.menu.setSoldOut, { params: { id }, body: { soldOut: b.soldOut } }) : call(api.menu.updateItem, { params: { id }, body: b }),
    onMutate: ({ id, ...b }) => qc.setQueryData<Item[]>(mk.items(catId), (l = []) => l.map((i) => (i.id === id ? { ...i, ...b } : i))),
    onSuccess: (u) => qc.setQueryData<Item[]>(mk.items(catId), (l = []) => l.map((i) => (i.id === u.id ? u : i))),
    onError: (e) => { toast.error(errMsg(e)); void qc.invalidateQueries({ queryKey: mk.items(catId) }); },
  });
  const removeItem = useMutation({
    mutationFn: (i: Item) => call(api.menu.deleteItem, { params: { id: i.id } }),
    onSuccess: () => { setDelItem(null); toast.success('Item excluído'); void qc.invalidateQueries({ queryKey: ['menu'] }); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const duplicate = useMutation({
    mutationFn: (i: Item) => call(api.menu.createItem, { body: { categoryId: i.categoryId, name: `${i.name} (cópia)`.slice(0, 80), description: i.description, priceCents: i.priceCents, promoPriceCents: i.promoPriceCents, badges: i.badges, visible: false, optionGroupIds: i.optionGroupIds } }),
    onSuccess: (n) => nav(`/cardapio/itens/${n.id}`),
    onError: (e) => toast.error(errMsg(e)),
  });

  const actions = <>
    <Button size="lg" onClick={() => nav(`/cardapio/itens/novo${catId ? `?categoria=${catId}` : ''}`)} disabled={!cats.data?.length}><Plus className="h-5 w-5" />Novo item</Button>
    <Button size="lg" variant="outline" onClick={() => setCatDialog('new')}><FolderPlus className="h-5 w-5" />Nova categoria</Button>
    <Button size="lg" variant="outline" onClick={csv.open} loading={csv.pending}><Upload className="h-5 w-5" />Importar planilha</Button>
  </>;

  if (cats.isLoading) return <Spinner />;
  return (
    <div className="px-4 py-6 md:px-8">
      {csv.el}
      <PageTitle actions={actions}>Cardápio</PageTitle>
      {cats.error ? <ErrorBox error={cats.error} retry={() => void cats.refetch()} /> : !cats.data?.length ? (
        <Card><Empty icon={<UtensilsCrossed className="h-12 w-12 text-gf-orange" />} title="Seu cardápio ainda está vazio" text="Cadastre o primeiro item do seu cardápio para começar a receber pedidos.">
          <Button onClick={() => setCatDialog('new')}><Plus className="h-5 w-5" />Cadastrar primeiro item</Button>
          <Button variant="outline" onClick={csv.open}><Upload className="h-5 w-5" />Importar planilha</Button>
        </Empty></Card>
      ) : <>
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <SortableList horizontal ids={cats.data.map((c) => c.id)} onReorder={reorder(mk.cats, (ids) => call(api.menu.reorderCategories, { body: { ids } }))}>
            {cats.data.map((c) => (
              <Sortable key={c.id} id={c.id}>{({ ref, style, handle, dragging }) => (
                <div ref={ref} style={style} className={cn('flex h-14 items-center gap-1 rounded-card border bg-white pl-2 pr-5 shadow-card', c.id === catId ? 'border-gf-orange bg-gf-orange-soft' : 'border-gf-border', dragging && 'shadow-xl')}>
                  <Handle {...handle} />
                  <button className={cn('min-h-11 flex-1 px-2 text-lg font-semibold', c.id === catId ? 'text-gf-orange' : 'text-gf-navy', !c.visible && 'line-through opacity-60')}
                    onClick={() => setParams({ categoria: c.id }, { replace: true })}>{c.name}</button>
                  {c.id === catId && <button aria-label="Editar categoria" onClick={() => setCatDialog(c)} className="-mr-3 grid h-11 w-11 place-items-center rounded text-gf-orange hover:bg-white"><Pencil className="h-4 w-4" /></button>}
                </div>
              )}</Sortable>
            ))}
          </SortableList>
          <Link to="/cardapio/opcionais" className="ml-auto"><Button variant="ghost"><Layers className="h-5 w-5" />Grupos de opcionais</Button></Link>
        </div>
        <Card className="overflow-x-auto">
          <table className="table-stack w-full text-left md:min-w-[900px]">
            <thead><tr className="border-b border-gf-border text-gf-navy-80">
              <th className="w-8" /><th className="py-4 pl-2 font-semibold">Item</th><th className="font-semibold">Preço</th><th className="font-semibold">Selos</th>
              <th className="font-semibold">Mídia</th><th className="font-semibold">Esgotado hoje</th><th className="font-semibold">Visível</th><th />
            </tr></thead>
            <tbody>
              {items.isLoading ? <tr><td colSpan={8}><Spinner /></td></tr> : !items.data?.length ? (
                <tr><td colSpan={8}><Empty icon={<UtensilsCrossed className="h-10 w-10 text-gf-orange" />} title="Nenhum item nesta categoria">
                  <Button onClick={() => nav(`/cardapio/itens/novo?categoria=${catId}`)}><Plus className="h-5 w-5" />Novo item</Button></Empty></td></tr>
              ) : (
                <SortableList ids={items.data.map((i) => i.id)} onReorder={reorder(mk.items(catId), (ids) => call(api.menu.reorderItems, { body: { ids } }))}>
                  {items.data.map((i) => (
                    <Sortable key={i.id} id={i.id}>{({ ref, style, handle }) => (
                      <tr ref={ref} style={style} className="border-b border-gf-border bg-white last:border-0">
                        <td className="pl-2"><Handle {...handle} /></td>
                        <td data-primary className="py-3 pl-2">
                          <Link to={`/cardapio/itens/${i.id}`} className="flex items-center gap-4">
                            {thumbOf(i.media) ? <img src={thumbOf(i.media)!} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover sm:h-24 sm:w-24" />
                              : <span className="grid h-16 w-16 shrink-0 place-items-center rounded-lg bg-gf-bg text-gf-muted sm:h-24 sm:w-24"><ImageOff className="h-6 w-6" /></span>}
                            <span className="min-w-0 break-words font-heading text-xl font-extrabold leading-tight">{i.name}</span>
                          </Link>
                        </td>
                        <td data-label="Preço" className="whitespace-nowrap font-heading text-xl font-black">
                          {i.promoPriceCents != null ? <><s className="block text-sm font-semibold text-gf-muted">{formatBRL(i.priceCents)}</s>{formatBRL(i.promoPriceCents)}</> : formatBRL(i.priceCents)}
                        </td>
                        <td data-label={i.badges.length ? 'Selos' : undefined}><div className="flex flex-wrap gap-1">{i.badges.map((b) => { const S = BADGE_STYLE[b]; return <Badge key={b} tone={S.tone}><S.icon className="h-4 w-4" />{BADGE_LABEL[b]}</Badge>; })}</div></td>
                        <td data-label="Mídia"><MediaStatus m={i.media} /></td>
                        <td data-label="Esgotado hoje"><Switch tone="danger" checked={i.soldOut} aria-label={`Esgotado hoje: ${i.name}`} onCheckedChange={(v) => patchItem.mutate({ id: i.id, soldOut: v })} /></td>
                        <td data-label="Visível"><Switch checked={i.visible} aria-label={`Visível: ${i.name}`} onCheckedChange={(v) => patchItem.mutate({ id: i.id, visible: v })} /></td>
                        <td className="pr-4 text-right">
                          <Dropdown trigger={<MoreButton />} items={[
                            { label: 'Editar', icon: Pencil, onSelect: () => nav(`/cardapio/itens/${i.id}`) },
                            { label: 'Duplicar', icon: Copy, onSelect: () => duplicate.mutate(i) },
                            { label: 'Excluir', icon: Trash2, danger: true, onSelect: () => setDelItem(i) },
                          ]} />
                        </td>
                      </tr>
                    )}</Sortable>
                  ))}
                </SortableList>
              )}
            </tbody>
          </table>
        </Card>
      </>}
      {catDialog && <CategoryDialog cat={catDialog === 'new' ? null : catDialog} onClose={(id) => { setCatDialog(null); if (id) setParams({ categoria: id }, { replace: true }); }} />}
      <Confirm open={!!delItem} onOpenChange={() => setDelItem(null)} title={`Excluir ${delItem?.name}?`} danger confirmLabel="Excluir" loading={removeItem.isPending}
        description="O item sai do cardápio. Pedidos antigos continuam no histórico." onConfirm={() => delItem && removeItem.mutate(delItem)} />
    </div>
  );
}

function CategoryDialog({ cat, onClose }: { cat: Category | null; onClose: (id?: string) => void }) {
  const qc = useQueryClient();
  const [del, setDel] = useState(false);
  const { register, handleSubmit, formState: { errors }, watch, setValue } = useForm({
    resolver: zodResolver(CreateCategoryBody), defaultValues: { name: cat?.name ?? '', sector: cat?.sector ?? 'KITCHEN', visible: cat?.visible ?? true },
  });
  const save = useMutation({
    mutationFn: (b: CreateCategoryBody) => (cat ? call(api.menu.updateCategory, { params: { id: cat.id }, body: b }) : call(api.menu.createCategory, { body: b })),
    onSuccess: (c) => { void qc.invalidateQueries({ queryKey: mk.cats }); toast.success('Categoria salva'); onClose(c.id); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const remove = useMutation({
    mutationFn: () => call(api.menu.deleteCategory, { params: { id: cat!.id } }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['menu'] }); toast.success('Categoria excluída'); onClose(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <Dialog open onOpenChange={() => onClose()} title={cat ? 'Editar categoria' : 'Nova categoria'}>
      <form onSubmit={handleSubmit((b) => save.mutate(b))} className="space-y-4">
        <Field label="Nome" error={errors.name?.message}><Input placeholder="Ex.: Lanches" {...register('name')} /></Field>
        <Field label="Setor de preparo" hint="Define em qual tela (Cozinha ou Bar) os itens aparecem no Ao vivo.">
          <Select {...register('sector')}><option value="KITCHEN">Cozinha</option><option value="BAR">Bar</option></Select>
        </Field>
        <label className="flex items-center justify-between"><span className="font-semibold">Visível no cardápio</span>
          <Switch checked={watch('visible')} onCheckedChange={(v) => setValue('visible', v)} /></label>
        <div className="flex flex-wrap justify-end gap-3 pt-2">
          {cat && <Button variant="ghost" className="mr-auto text-danger" onClick={() => setDel(true)}><Trash2 className="h-4 w-4" />Excluir</Button>}
          <Button variant="outline" onClick={() => onClose()}>Cancelar</Button>
          <Button type="submit" loading={save.isPending}>Salvar categoria</Button>
        </div>
      </form>
      <Confirm open={del} onOpenChange={setDel} title={`Excluir ${cat?.name}?`} danger confirmLabel="Excluir" loading={remove.isPending} onConfirm={() => remove.mutate()}
        description={cat?.itemCount ? `Esta categoria tem ${cat.itemCount} item(ns). Mova-os antes ou eles serão excluídos junto.` : 'A categoria está vazia.'} />
    </Dialog>
  );
}
