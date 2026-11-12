import { useEffect, useState } from 'react';
import { Link, useBlocker, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, ChevronRight, CircleCheck, CloudUpload, FileVideo, Info, Layers, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { api, Badge as BadgeEnum, BADGE_LABEL, CreateItemBody, type Badge, type Item } from '@garfeed/shared';
import { call, errMsg } from '@/lib/api';
import { useMediaUpload } from '@/lib/upload';
import { canCrop, CROP_ITEM, ImageCropDialog } from '@/components/ImageCrop';
import { centsToInput, cn, parseCents } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Card, ErrorBox, Spinner } from '@/components/ui/misc';
import { Dropdown } from '@/components/ui/dropdown';
import { Confirm } from '@/components/ui/dialog';
import { PhonePreview } from '@/components/PhonePreview';
import { Handle, Sortable, SortableList } from '@/components/Sortable';
import { BADGE_STYLE, mk } from './Menu';

const DESC_MAX = 300;
type Form = { name: string; description: string; price: string; promo: string; categoryId: string; badges: Badge[]; optionGroupIds: string[] };

export function ItemEditPage() {
  const { id } = useParams();
  const isNew = id === 'novo';
  const item = useQuery({ queryKey: ['menu', 'item', id], enabled: !isNew, queryFn: () => call(api.menu.getItem, { params: { id: id! } }) });
  if (!isNew && item.isLoading) return <Spinner />;
  if (item.error) return <div className="p-8"><ErrorBox error={item.error} /></div>;
  return <Editor key={id} item={isNew ? null : item.data!} />;
}

function Editor({ item }: { item: Item | null }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const cats = useQuery({ queryKey: mk.cats, queryFn: () => call(api.menu.listCategories) });
  const groups = useQuery({ queryKey: mk.groups, queryFn: () => call(api.menu.listOptionGroups) });
  const up = useMediaUpload(item?.media);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const send = (f: File) => { setMediaTouched(true); void up.start(f); };
  const [mediaId, setMediaId] = useState<string | null>(item?.media?.id ?? null);
  const [mediaTouched, setMediaTouched] = useState(false);
  const [saved, setSaved] = useState(false);

  const { register, handleSubmit, control, setError, formState: { errors, isDirty } } = useForm<Form>({
    defaultValues: {
      name: item?.name ?? '', description: item?.description ?? '', price: centsToInput(item?.priceCents), promo: centsToInput(item?.promoPriceCents),
      categoryId: item?.categoryId ?? params.get('categoria') ?? '', badges: item?.badges ?? [], optionGroupIds: item?.optionGroupIds ?? [],
    },
  });
  const v = useWatch({ control }) as Form;
  // Mídia nova só entra no item quando o processamento termina (não publica mídia incompleta).
  useEffect(() => { if (up.phase === 'ready' && up.media) setMediaId(up.media.id); }, [up.phase, up.media]);

  const dirty = (isDirty || mediaTouched) && !saved;
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const save = useMutation({
    mutationFn: (body: CreateItemBody) => (item ? call(api.menu.updateItem, { params: { id: item.id }, body }) : call(api.menu.createItem, { body })),
    onSuccess: (r) => {
      setSaved(true);
      void qc.invalidateQueries({ queryKey: ['menu'] });
      toast.success('Item salvo');
      setTimeout(() => nav(`/cardapio?categoria=${r.categoryId}`), 0);
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const onSubmit = handleSubmit((f) => {
    const priceCents = parseCents(f.price);
    const promo = f.promo.trim() ? parseCents(f.promo) : null;
    if (priceCents == null) return setError('price', { message: 'Informe o preço' });
    if (promo != null && promo >= priceCents) return setError('promo', { message: 'O promocional deve ser menor que o preço' });
    const parsed = CreateItemBody.safeParse({
      categoryId: f.categoryId, name: f.name, description: f.description.trim() || null, priceCents, promoPriceCents: promo,
      badges: f.badges, mediaId, optionGroupIds: f.optionGroupIds, ...(item ? { visible: item.visible, soldOut: item.soldOut } : {}),
    });
    if (!parsed.success) {
      for (const i of parsed.error.issues) setError((i.path[0] === 'categoryId' ? 'categoryId' : i.path[0] === 'name' ? 'name' : 'description') as keyof Form, { message: i.message });
      return;
    }
    save.mutate(parsed.data);
  });

  const catNames = cats.data?.map((c) => c.name) ?? [];
  const mediaUrl = up.phase === 'ready' && up.media?.url ? up.media.url : up.localUrl ?? (mediaId ? item?.media?.url ?? null : null);
  const mediaType = up.media?.type ?? (up.file && up.localUrl ? (up.file.name.match(/\.(mp4|mov)$/i) ? 'VIDEO' : 'IMAGE') : item?.media?.type) ?? 'IMAGE';
  const linked = v.optionGroupIds.map((gid) => groups.data?.find((g) => g.id === gid)).filter((g) => !!g);
  const available = (groups.data ?? []).filter((g) => !v.optionGroupIds.includes(g.id));

  return (
    <form onSubmit={onSubmit} className="px-4 pb-40 pt-6 sm:pb-28 md:px-8">
      <h1 className="mb-5 font-heading text-2xl font-black sm:text-3xl"><Link to="/cardapio" className="text-gf-muted hover:text-gf-navy">Cardápio</Link> / {item ? 'Editar item' : 'Novo item'}</h1>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,32rem)]">
        <Card className="min-w-0 space-y-5 p-4 sm:p-5">
          <Field label="Nome" error={errors.name?.message}><Input className="h-12 font-heading text-xl font-extrabold" maxLength={80} {...register('name', { required: 'Informe o nome' })} /></Field>
          <Field label="Descrição" error={errors.description?.message}>
            <div className="relative"><Textarea maxLength={DESC_MAX} rows={3} {...register('description')} />
              <span className="absolute bottom-2 right-3 text-sm text-gf-muted">{v.description.length} / {DESC_MAX}</span></div>
          </Field>
          <div className="grid items-end gap-4 sm:grid-cols-2">
            <Field label="Preço (R$)" error={errors.price?.message}><Input inputMode="decimal" placeholder="0,00" className="h-12 font-heading text-xl font-extrabold" {...register('price')} /></Field>
            <Field label="Preço promocional (R$)" error={errors.promo?.message}><Input inputMode="decimal" placeholder="Opcional" className="h-12 font-heading text-xl font-extrabold" {...register('promo')} /></Field>
          </div>
          <Field label="Categoria" error={errors.categoryId?.message}>
            <Select {...register('categoryId', { required: 'Escolha a categoria' })}>
              <option value="">Escolha…</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <div>
            <p className="mb-2 text-sm font-semibold">Selos</p>
            <Controller control={control} name="badges" render={({ field }) => (
              <div className="flex flex-wrap gap-2">
                {BadgeEnum.options.map((b) => {
                  const on = field.value.includes(b); const S = BADGE_STYLE[b];
                  return (
                    <button key={b} type="button" aria-pressed={on} onClick={() => field.onChange(on ? field.value.filter((x) => x !== b) : [...field.value, b])}
                      className={cn('flex h-11 items-center gap-2 rounded-pill border px-4 font-medium', on ? 'border-gf-orange bg-gf-orange text-white' : 'border-gf-border bg-white hover:bg-gf-bg')}>
                      {on ? <Check className="h-4 w-4" /> : <S.icon className="h-4 w-4" />}{BADGE_LABEL[b]}
                    </button>
                  );
                })}
              </div>
            )} />
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold">Grupos de opcionais</p>
            <Controller control={control} name="optionGroupIds" render={({ field }) => (
              <div className="space-y-2">
                <SortableList ids={field.value} onReorder={field.onChange}>
                  {linked.map((g) => (
                    <Sortable key={g.id} id={g.id}>{({ ref, style, handle }) => (
                      <div ref={ref} style={style} className="flex items-center gap-3 rounded-card border border-gf-border bg-white px-3 py-2.5">
                        <Handle {...handle} /><Layers className="h-5 w-5" />
                        <span className="min-w-0 flex-1"><b>{g.name}</b> <span className="text-sm text-gf-muted">· {g.min > 0 ? 'Obrigatório' : 'Opcional'} · {g.min}/{g.max}</span></span>
                        <button type="button" aria-label={`Remover ${g.name}`} className="grid h-11 w-11 shrink-0 place-items-center rounded text-gf-muted hover:text-danger" onClick={() => field.onChange(field.value.filter((x) => x !== g.id))}><X className="h-5 w-5" /></button>
                        <Link to="/cardapio/opcionais" aria-label="Ver grupos" className="grid h-11 w-8 shrink-0 place-items-center"><ChevronRight className="h-5 w-5" /></Link>
                      </div>
                    )}</Sortable>
                  ))}
                </SortableList>
                <Dropdown label="Adicionar grupo" trigger={<Button variant="soft" className="rounded-xl"><Plus className="h-5 w-5" />Adicionar grupo</Button>}
                  items={[...available.map((g) => ({ label: g.name, onSelect: () => field.onChange([...field.value, g.id]) })),
                    { label: 'Criar novo grupo…', icon: Plus, onSelect: () => nav('/cardapio/opcionais') }]} />
              </div>
            )} />
          </div>
        </Card>

        <Card className="min-w-0 space-y-3 self-start p-4 sm:p-5 lg:sticky lg:top-4">
          <MediaBox up={up} hasMedia={!!mediaId} onPick={(f) => (canCrop(f) ? setCropFile(f) : send(f))}
            onRemove={() => { up.cancel(); setMediaId(null); setMediaTouched(true); }} />
          <p className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm text-gf-navy-80"><Info className="h-4 w-4 shrink-0 text-info" />Vídeo vertical (9:16), até 30 s e 100 MB · ou foto até 15 MB</p>
          <div className="pt-2">
            <PhonePreview name={v.name} description={v.description} priceCents={parseCents(v.price)} promoPriceCents={v.promo ? parseCents(v.promo) : null}
              badges={v.badges} categories={catNames} activeCategory={cats.data?.find((c) => c.id === v.categoryId)?.name}
              media={mediaUrl ? { url: mediaUrl, type: mediaType, poster: up.media?.posterUrl } : null} />
          </div>
        </Card>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gf-border bg-white/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur md:left-56 md:px-8 xl:left-64">
        <div className="flex flex-wrap items-center justify-end gap-3">
          {up.busy && <span className="mr-auto basis-full text-sm text-gf-navy-80 sm:basis-auto">Você pode continuar <b>editando os dados</b>. Salve quando a mídia ficar pronta.</span>}
          <Button variant="outline" size="lg" className="flex-1 whitespace-nowrap px-4 sm:min-w-36 sm:flex-none sm:px-6" onClick={() => nav('/cardapio')}>Cancelar</Button>
          <Button type="submit" size="lg" className="flex-1 whitespace-nowrap px-4 sm:min-w-44 sm:flex-none sm:px-6" loading={save.isPending} disabled={up.busy}>Salvar item</Button>
        </div>
      </div>
      <ImageCropDialog file={cropFile} spec={CROP_ITEM} onCancel={() => setCropFile(null)} onDone={(f) => { setCropFile(null); send(f); }} />
      <Confirm open={blocker.state === 'blocked'} onOpenChange={() => blocker.reset?.()} title="Sair sem salvar?" confirmLabel="Sair sem salvar" danger
        description="As alterações deste item serão perdidas." onConfirm={() => blocker.proceed?.()} />
    </form>
  );
}

function MediaBox({ up, hasMedia, onPick, onRemove }: { up: ReturnType<typeof useMediaUpload>; hasMedia: boolean; onPick: (f: File) => void; onRemove: () => void }) {
  const [over, setOver] = useState(false);
  const mb = (n?: number) => (n ? `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : '');
  const name = up.file?.name ?? (up.media ? `${up.media.type === 'VIDEO' ? 'Vídeo' : 'Foto'} atual` : '');
  return (
    <>
      <label onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) onPick(f); }}
        className={cn('flex cursor-pointer flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-card border-2 border-dashed px-4 py-5 text-center font-semibold', over ? 'border-gf-orange bg-gf-orange-soft' : 'border-gf-border hover:bg-gf-bg')}>
        <CloudUpload className="h-6 w-6" />Arraste seu vídeo ou foto <span className="font-normal text-gf-muted">ou clique</span>
        <input type="file" className="sr-only" accept="video/mp4,video/quicktime,image/jpeg,image/png,image/webp,image/heic,image/heif"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ''; }} />
      </label>
      {(up.phase !== 'idle' || hasMedia) && (
        <div className="rounded-card border border-gf-border p-3">
          <div className="flex items-center gap-3">
            {up.phase === 'ready' ? <CircleCheck className="h-8 w-8 shrink-0 fill-success text-white" /> : <FileVideo className="h-7 w-7 shrink-0 text-gf-navy-80" />}
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{name}</p>
              <p className="text-sm text-gf-navy-80">
                {up.phase === 'uploading' && `Enviando… ${up.progress}%`}
                {up.phase === 'processing' && (up.media?.type === 'IMAGE' ? 'Processando foto…' : 'Processando vídeo…')}
                {up.phase === 'ready' && <span className="font-semibold text-success">Pronto ✓</span>}
                {up.phase === 'failed' && <span className="text-danger">{up.error}</span>}
                {up.file && ` · ${mb(up.file.size)}`}
              </p>
            </div>
            {up.phase === 'failed' && up.file && <Button size="sm" variant="outline" onClick={up.retry}><RotateCcw className="h-4 w-4" />Tentar de novo</Button>}
            <button type="button" aria-label={up.busy ? 'Cancelar envio' : 'Remover mídia'} onClick={onRemove} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-gf-border hover:text-danger">
              {up.busy ? <X className="h-5 w-5" /> : <Trash2 className="h-5 w-5" />}
            </button>
          </div>
          {up.busy && (
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-gf-border" role="progressbar" aria-valuenow={up.phase === 'uploading' ? up.progress : undefined}>
              {up.phase === 'uploading'
                ? <div className="h-full rounded-full bg-gf-orange transition-all" style={{ width: `${up.progress}%` }} />
                : <div className="h-full w-1/3 animate-[pulse_1.2s_ease-in-out_infinite] rounded-full bg-gf-orange" />}
            </div>
          )}
        </div>
      )}
    </>
  );
}
