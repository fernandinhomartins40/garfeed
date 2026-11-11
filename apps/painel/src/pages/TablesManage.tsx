import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Armchair, Pencil, Plus, QrCode, Trash2 } from 'lucide-react';
import { api, BulkTablesBody, CreateTableBody, type Table } from '@garfeed/shared';
import { Link, useNavigate } from 'react-router-dom';
import { call, errMsg } from '@/lib/api';
import { qk } from '@/lib/live';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Confirm, Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge, Card, Empty, ErrorBox, MoreButton, PageTitle, Spinner } from '@/components/ui/misc';
import { Dropdown } from '@/components/ui/dropdown';
import { groupByArea, STATUS } from './TablesMap';

export function TablesManagePage() {
  const tables = useQuery({ queryKey: qk.tables, queryFn: () => call(api.tables.list) });
  const nav = useNavigate();
  const [bulk, setBulk] = useState(false);
  const [edit, setEdit] = useState<Table | 'new' | null>(null);
  const [del, setDel] = useState<Table | null>(null);
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: (t: Table) => call(api.tables.delete, { params: { id: t.id } }),
    onSuccess: () => { setDel(null); toast.success('Mesa excluída'); void qc.invalidateQueries({ queryKey: qk.tables }); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const areas = [...new Set((tables.data ?? []).map((t) => t.area).filter((a): a is string => !!a))];

  return (
    <div className="px-4 py-6 md:px-8">
      <PageTitle actions={<>
        <Button variant="outline" onClick={() => setEdit('new')}><Plus className="h-5 w-5" />Nova mesa</Button>
        <Button variant="outline" className="border-gf-orange text-gf-orange" onClick={() => setBulk(true)}><Plus className="h-5 w-5" />Criar mesas em lote</Button>
      </>}>Mesas</PageTitle>
      <datalist id="areas">{areas.map((a) => <option key={a} value={a} />)}</datalist>
      {tables.isLoading ? <Spinner /> : tables.error ? <ErrorBox error={tables.error} /> : !tables.data?.length ? (
        <Card><Empty icon={<Armchair className="h-12 w-12 text-gf-orange" />} title="Nenhuma mesa ainda" text='Crie as mesas de uma vez: "Mesa 1" a "Mesa 20".'>
          <Button onClick={() => setBulk(true)}>Criar mesas em lote</Button></Empty></Card>
      ) : groupByArea(tables.data).map(([area, list]) => (
        <section key={area} className="mb-8">
          <h2 className="mb-3 flex items-center gap-2 font-heading text-2xl font-black"><Armchair className="h-6 w-6" />{area} <span className="font-sans text-base font-normal text-gf-muted">· {list.length} mesas</span></h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-3">
            {list.map((t) => (
              <Card key={t.id} className={cn('p-4', !t.active && 'opacity-60')}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-heading text-xl font-black">{t.name}</p>
                  <Dropdown trigger={<MoreButton />} items={[
                    { label: 'Editar', icon: Pencil, onSelect: () => setEdit(t) },
                    { label: 'Vincular placa', icon: QrCode, onSelect: () => nav(`/placas/vincular?mesa=${t.id}`) },
                    { label: 'Excluir', icon: Trash2, danger: true, onSelect: () => setDel(t) },
                  ]} />
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {t.active ? <Badge tone={t.status === 'FREE' ? 'green' : 'orange'}>{STATUS[t.status].label}</Badge> : <Badge tone="red">Inativa</Badge>}
                  {t.tag ? <Badge tone="gray"><QrCode className="h-3.5 w-3.5" />{t.tag.code}</Badge> : <Link to={`/placas/vincular?mesa=${t.id}`}><Badge tone="yellow">Sem placa</Badge></Link>}
                </div>
              </Card>
            ))}
          </div>
        </section>
      ))}
      <BulkDialog open={bulk} onOpenChange={setBulk} existing={new Set(tables.data?.map((t) => t.name))} />
      {edit && <TableDialog table={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
      <Confirm open={!!del} onOpenChange={() => setDel(null)} title={`Excluir ${del?.name}?`} danger confirmLabel="Excluir" loading={remove.isPending}
        description="A placa vinculada fica solta e pode ser usada em outra mesa." onConfirm={() => del && remove.mutate(del)} />
    </div>
  );
}

function BulkDialog({ open, onOpenChange, existing }: { open: boolean; onOpenChange: (o: boolean) => void; existing: Set<string> }) {
  const qc = useQueryClient();
  const { register, handleSubmit, control, formState: { errors }, reset } = useForm({
    resolver: zodResolver(BulkTablesBody), defaultValues: { prefix: 'Mesa', from: 1, to: 20, area: 'Salão' },
  });
  const [prefix, from, to] = useWatch({ control, name: ['prefix', 'from', 'to'] });
  const names = Number.isInteger(from) && Number.isInteger(to) && to >= from && to - from < 200
    ? Array.from({ length: to - from + 1 }, (_, i) => `${(prefix ?? '').trim()} ${from + i}`) : [];
  const fresh = names.filter((n) => !existing.has(n)).length;
  const m = useMutation({
    mutationFn: (b: BulkTablesBody) => call(api.tables.bulk, { body: b }),
    onSuccess: (r) => {
      toast.success(`${r.created.length} mesas criadas${r.skipped.length ? ` · ${r.skipped.length} já existiam` : ''}`);
      void qc.invalidateQueries({ queryKey: qk.tables }); onOpenChange(false); reset();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Criar mesas em lote" description="Crie várias mesas de uma vez, de forma rápida." className="max-w-2xl">
      <form onSubmit={handleSubmit((b) => m.mutate(b))}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[2fr_1fr_1fr_2fr]">
          <Field label="Prefixo" error={errors.prefix?.message}><Input {...register('prefix')} /></Field>
          <Field label="De" error={errors.from?.message}><Input type="number" min={0} {...register('from', { valueAsNumber: true })} /></Field>
          <Field label="Até" error={errors.to?.message}><Input type="number" min={0} {...register('to', { valueAsNumber: true })} /></Field>
          <Field label="Área"><Input list="areas" {...register('area')} /></Field>
        </div>
        <p className="mt-5 font-semibold">Pré-visualização <span className="font-normal text-gf-navy-80">({names.length} mesas)</span></p>
        <div className="mt-2 flex max-h-56 flex-wrap gap-2 overflow-y-auto rounded-card border border-gf-border bg-gf-bg p-3">
          {names.map((n) => (
            <span key={n} title={existing.has(n) ? 'Já existe — será pulada' : undefined}
              className={cn('rounded-pill px-4 py-1.5 text-sm font-medium', existing.has(n) ? 'bg-amber-100 text-amber-700 line-through' : 'bg-white shadow-sm')}>{n}</span>
          ))}
        </div>
        {fresh < names.length && <p className="mt-2 text-sm text-amber-700">{names.length - fresh} nome(s) já existem e serão pulados.</p>}
        <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-gf-border pt-5">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit" loading={m.isPending} disabled={!fresh}>Criar {fresh} mesas</Button>
        </div>
      </form>
    </Dialog>
  );
}

function TableDialog({ table, onClose }: { table: Table | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [active, setActive] = useState(table?.active ?? true);
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(CreateTableBody), defaultValues: { name: table?.name ?? '', area: table?.area ?? '' },
  });
  const m = useMutation({
    mutationFn: (b: CreateTableBody) => {
      const body = { ...b, area: b.area || null };
      return table ? call(api.tables.update, { params: { id: table.id }, body: { ...body, active } }) : call(api.tables.create, { body });
    },
    onSuccess: () => { toast.success('Mesa salva'); void qc.invalidateQueries({ queryKey: qk.tables }); onClose(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <Dialog open onOpenChange={onClose} title={table ? 'Editar mesa' : 'Nova mesa'}>
      <form onSubmit={handleSubmit((b) => m.mutate(b))} className="space-y-4">
        <Field label="Nome" error={errors.name?.message}><Input placeholder="Mesa 21" {...register('name')} /></Field>
        <Field label="Área"><Input list="areas" placeholder="Salão" {...register('area')} /></Field>
        {table && <label className="flex items-center justify-between"><span className="font-semibold">Mesa ativa</span><Switch checked={active} onCheckedChange={setActive} /></label>}
        <div className="flex justify-end gap-3 pt-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button type="submit" loading={m.isPending}>Salvar</Button></div>
      </form>
    </Dialog>
  );
}
