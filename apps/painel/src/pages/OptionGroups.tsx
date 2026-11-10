import { useState } from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Layers, Minus, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, formatBRL, UpsertOptionGroupBody, type OptionGroupWithUsage } from '@garfeed/shared';
import { call, errMsg } from '@/lib/api';
import { centsToInput, parseCents } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Confirm, Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Card, Empty, ErrorBox, MoreButton, PageTitle, Spinner } from '@/components/ui/misc';
import { Dropdown } from '@/components/ui/dropdown';
import { Handle, Sortable, SortableList } from '@/components/Sortable';
import { mk } from './Menu';

export function OptionGroupsPage() {
  const qc = useQueryClient();
  const groups = useQuery({ queryKey: mk.groups, queryFn: () => call(api.menu.listOptionGroups) });
  const [edit, setEdit] = useState<OptionGroupWithUsage | 'new' | null>(null);
  const [del, setDel] = useState<OptionGroupWithUsage | null>(null);
  const remove = useMutation({
    mutationFn: (g: OptionGroupWithUsage) => call(api.menu.deleteOptionGroup, { params: { id: g.id } }),
    onSuccess: () => { setDel(null); toast.success('Grupo excluído'); void qc.invalidateQueries({ queryKey: ['menu'] }); },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <div className="px-4 py-6 md:px-8">
      <PageTitle actions={<Button size="lg" onClick={() => setEdit('new')}><Plus className="h-5 w-5" />Novo grupo</Button>}>Grupos de opcionais</PageTitle>
      {groups.isLoading ? <Spinner /> : groups.error ? <ErrorBox error={groups.error} /> : !groups.data?.length ? (
        <Card><Empty icon={<Layers className="h-12 w-12 text-gf-orange" />} title="Nenhum grupo de opcionais" text='Ex.: "Ponto da carne" (obrigatório, escolha 1) ou "Adicionais" (opcional, até 3).'>
          <Button onClick={() => setEdit('new')}><Plus className="h-5 w-5" />Criar grupo</Button></Empty></Card>
      ) : (
        <div className="space-y-3">
          {groups.data.map((g) => (
            <Card key={g.id} className="flex items-center gap-4 px-5 py-4">
              <Layers className="h-8 w-8 text-gf-navy-80" />
              <div className="flex-1">
                <p className="font-heading text-xl font-black">{g.name}</p>
                <p className="text-gf-navy-80">{g.min > 0 ? 'Obrigatório' : 'Opcional'} · {g.min}/{g.max} · {g.options.map((o) => o.name).join(', ')}</p>
              </div>
              <span className="hidden text-sm text-gf-muted sm:block">Usado em {g.itemCount} {g.itemCount === 1 ? 'item' : 'itens'}</span>
              <Dropdown trigger={<MoreButton />} items={[
                { label: 'Editar', icon: Pencil, onSelect: () => setEdit(g) },
                { label: 'Excluir', icon: Trash2, danger: true, onSelect: () => setDel(g) },
              ]} />
            </Card>
          ))}
        </div>
      )}
      {edit && <GroupDialog group={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
      <Confirm open={!!del} onOpenChange={() => setDel(null)} title={`Excluir ${del?.name}?`} danger confirmLabel="Excluir" loading={remove.isPending}
        onConfirm={() => del && remove.mutate(del)} description={del?.itemCount ? `Este grupo está em ${del.itemCount} item(ns) e sairá de todos eles.` : 'O grupo não está em nenhum item.'} />
    </div>
  );
}

type Form = { name: string; min: number; max: number; options: { key: string; name: string; price: string }[] };
let seq = 0;
const key = () => `o${++seq}`;

function Stepper({ value, onChange, min, max, label }: { value: number; onChange: (n: number) => void; min: number; max: number; label: string }) {
  return (
    <div className="flex h-12 items-center justify-between rounded-lg border border-gf-border">
      <button type="button" aria-label={`Diminuir ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)} className="px-4 disabled:opacity-30"><Minus className="h-5 w-5" /></button>
      <span className="font-heading text-xl font-black" aria-label={label}>{value}</span>
      <button type="button" aria-label={`Aumentar ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)} className="px-4 disabled:opacity-30"><Plus className="h-5 w-5" /></button>
    </div>
  );
}

function GroupDialog({ group, onClose }: { group: OptionGroupWithUsage | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [err, setErr] = useState('');
  const { register, control, handleSubmit, setValue } = useForm<Form>({
    defaultValues: {
      name: group?.name ?? '', min: group?.min ?? 0, max: group?.max ?? 1,
      options: group?.options.map((o) => ({ key: key(), name: o.name, price: centsToInput(o.priceCents) })) ?? [{ key: key(), name: '', price: '' }],
    },
  });
  const { fields, append, remove, move } = useFieldArray({ control, name: 'options', keyName: 'fid' });
  const [min, max, options] = useWatch({ control, name: ['min', 'max', 'options'] });
  const save = useMutation({
    mutationFn: (b: UpsertOptionGroupBody) => (group ? call(api.menu.updateOptionGroup, { params: { id: group.id }, body: b }) : call(api.menu.createOptionGroup, { body: b })),
    onSuccess: () => { toast.success('Grupo salvo'); void qc.invalidateQueries({ queryKey: ['menu'] }); onClose(); },
    onError: (e) => setErr(errMsg(e)),
  });
  const onSubmit = handleSubmit((f) => {
    const r = UpsertOptionGroupBody.safeParse({
      name: f.name, min: f.min, max: f.max,
      options: f.options.filter((o) => o.name.trim()).map((o) => ({ name: o.name, priceCents: parseCents(o.price) ?? 0 })),
    });
    if (!r.success) return setErr(r.error.issues[0]?.message ?? 'Confira os campos');
    if (r.data.max > r.data.options.length) return setErr('O máximo de escolhas não pode passar do número de opções.');
    setErr('');
    save.mutate(r.data);
  });
  return (
    <Dialog open onOpenChange={onClose} title={group ? 'Editar grupo' : 'Novo grupo'} className="max-w-2xl"
      description={group?.itemCount ? `Alterações valem para os ${group.itemCount} itens que usam este grupo.` : undefined}>
      <form onSubmit={onSubmit} className="space-y-5">
        <Field label="Nome do grupo"><Input className="h-12 font-heading text-lg font-extrabold" placeholder="Ex.: Adicionais" {...register('name')} /></Field>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-[1fr_1fr_auto]">
          <div><p className="mb-1.5 text-sm font-semibold">Mínimo de escolhas</p>
            <Controller control={control} name="min" render={({ field }) => <Stepper label="mínimo" value={field.value} min={0} max={max} onChange={field.onChange} />} /></div>
          <div><p className="mb-1.5 text-sm font-semibold">Máximo de escolhas</p>
            <Controller control={control} name="max" render={({ field }) => <Stepper label="máximo" value={field.value} min={Math.max(1, min)} max={Math.max(1, options.length)} onChange={field.onChange} />} /></div>
          <label className="col-span-2 sm:col-span-1"><p className="mb-1.5 text-sm font-semibold">Obrigatório</p>
            <span className="flex h-12 items-center gap-3"><Switch checked={min > 0} onCheckedChange={(v) => setValue('min', v ? 1 : 0)} />{min > 0 ? 'Sim' : 'Não'}</span></label>
        </div>
        <div className="border-t border-gf-border pt-4">
          <p className="mb-2 text-sm font-semibold">Opções do grupo</p>
          <div className="space-y-2">
            <SortableList ids={fields.map((f) => f.key)} onReorder={(_, from, to) => move(from, to)}>
              {fields.map((f, i) => (
                <Sortable key={f.key} id={f.key}>{({ ref, style, handle }) => (
                  <div ref={ref} style={style} className="flex items-center gap-2 rounded-card border border-gf-border bg-white px-2 py-1.5">
                    <Handle {...handle} />
                    <Input aria-label="Nome da opção" placeholder="Nome da opção" className="h-10 flex-1 border-0 font-semibold focus:ring-0" {...register(`options.${i}.name`)} />
                    <span className="text-gf-muted">R$</span>
                    <Input aria-label="Preço adicional" inputMode="decimal" placeholder="0,00" className="h-10 w-24 text-right font-heading font-black" {...register(`options.${i}.price`)} />
                    <button type="button" aria-label="Remover opção" disabled={fields.length === 1} onClick={() => remove(i)} className="p-2 text-gf-navy-80 hover:text-danger disabled:opacity-30"><Trash2 className="h-5 w-5" /></button>
                  </div>
                )}</Sortable>
              ))}
            </SortableList>
            <button type="button" onClick={() => append({ key: key(), name: '', price: '' })}
              className="flex h-12 w-full items-center gap-2 rounded-card bg-gf-orange-soft px-4 font-semibold text-gf-orange hover:bg-gf-peach"><Plus className="h-5 w-5" />Nova opção</button>
          </div>
          <p className="mt-2 text-sm text-gf-muted">Prévia: {options.filter((o) => o.name).map((o) => `${o.name}${parseCents(o.price) ? ` +${formatBRL(parseCents(o.price)!)}` : ''}`).join(' · ') || '—'}</p>
        </div>
        {err && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-danger">{err}</p>}
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" size="lg" onClick={onClose}>Cancelar</Button>
          <Button type="submit" size="lg" loading={save.isPending}>Salvar grupo</Button>
        </div>
      </form>
    </Dialog>
  );
}
