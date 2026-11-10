import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, Info, Plus, QrCode } from 'lucide-react';
import { api, CreateTagBatchBody, tagUrl } from '@garfeed/shared';
import { call, download, errMsg } from '@/lib/api';
import { TAG_BASE_URL } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/input';
import { Card, Empty, ErrorBox, PageTitle, Spinner } from '@/components/ui/misc';
import { StatsCards } from './Restaurants';

const csvName = (batch: string) => `placas-${batch}.csv`;
const getCsv = (batch: string) => download(api.admin.tagBatchCsv, { batch }, csvName(batch)).catch((e: unknown) => toast.error(errMsg(e)));

export function AdminTagBatchesPage() {
  const batches = useQuery({ queryKey: ['admin', 'batches'], queryFn: () => call(api.admin.listTagBatches) });
  const [open, setOpen] = useState(false);
  return (
    <div className="px-4 py-6 md:px-8">
      <PageTitle actions={<Button size="lg" onClick={() => setOpen(true)}><Plus className="h-5 w-5" />Gerar lote</Button>}>Lotes de placas</PageTitle>
      <StatsCards />
      {batches.isLoading ? <Spinner /> : batches.error ? <ErrorBox error={batches.error} /> : !batches.data?.length ? (
        <Card><Empty icon={<QrCode className="h-12 w-12 text-gf-orange" />} title="Nenhum lote gerado"><Button onClick={() => setOpen(true)}>Gerar primeiro lote</Button></Empty></Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-lg">
            <thead><tr className="border-b border-gf-border text-gf-navy-80">
              <th className="px-6 py-4 font-semibold">Lote</th><th className="font-semibold">Quantidade</th><th className="font-semibold">Restaurante</th>
              <th className="font-semibold">Situação</th><th className="font-semibold">Data de criação</th><th className="pr-6 font-semibold">Arquivo</th>
            </tr></thead>
            <tbody>
              {batches.data.map((b) => (
                <tr key={b.batch} className="border-b border-gf-border last:border-0">
                  <td className="px-6 py-4 font-heading font-black">{b.batch}</td>
                  <td>{b.total}</td>
                  <td className="font-semibold">{b.restaurant?.name ?? <span className="font-normal text-gf-muted">Sem dono</span>}</td>
                  <td className="text-sm text-gf-navy-80">{b.active} ativas · {b.unassigned} livres{b.blocked ? ` · ${b.blocked} bloq.` : ''}</td>
                  <td>{new Date(b.createdAt).toLocaleDateString('pt-BR')}</td>
                  <td className="pr-6"><Button variant="outline" className="rounded-lg" onClick={() => void getCsv(b.batch)}><Download className="h-5 w-5" />Download CSV</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {open && <BatchDialog onClose={() => setOpen(false)} />}
    </div>
  );
}

function BatchDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const rest = useQuery({ queryKey: ['admin', 'restaurants'], queryFn: () => call(api.admin.listRestaurants) });
  const { register, handleSubmit, watch, formState: { errors } } = useForm({ resolver: zodResolver(CreateTagBatchBody), defaultValues: { quantity: 50, restaurantId: undefined } });
  const qty = watch('quantity');
  const m = useMutation({
    mutationFn: (b: CreateTagBatchBody) => call(api.admin.createTagBatch, { body: b }),
    onSuccess: (r) => {
      toast.success(`Lote ${r.batch} gerado com ${r.codes.length} placas`);
      void qc.invalidateQueries({ queryKey: ['admin'] });
      void getCsv(r.batch);
      onClose();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <Dialog open onOpenChange={onClose} title="Gerar lote" className="max-w-xl">
      <form onSubmit={handleSubmit((b) => m.mutate(b))} className="space-y-4">
        <Field label="Quantidade" error={errors.quantity?.message}><Input type="number" min={1} max={1000} {...register('quantity', { valueAsNumber: true })} /></Field>
        <Field label={<>Restaurante <span className="font-normal text-gf-navy-80">(opcional)</span></>}>
          <Select {...register('restaurantId', { setValueAs: (v: string) => v || undefined })}>
            <option value="">Sem restaurante (estoque)</option>
            {rest.data?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        </Field>
        <p className="flex gap-3 rounded-xl bg-gf-orange-soft p-4 text-gf-navy">
          <Info className="h-6 w-6 shrink-0 text-gf-orange" />
          <span>O CSV inclui código e URL da placa.<br />Exemplo: <b>{tagUrl(TAG_BASE_URL, 'GF7K2P').replace(/^https?:\/\//, '')}</b></span>
        </p>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" size="lg" onClick={onClose}>Cancelar</Button>
          <Button type="submit" size="lg" loading={m.isPending}>Gerar {Number.isFinite(qty) ? qty : ''} placas</Button>
        </div>
      </form>
    </Dialog>
  );
}
