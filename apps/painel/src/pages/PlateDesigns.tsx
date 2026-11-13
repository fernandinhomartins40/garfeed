import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Palette, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, type PlateDesignSummary } from '@garfeed/shared';
import { call, errMsg } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { renderPng, TEMPLATES, withBrand, type PlateTemplate } from '@/lib/plate';
import { ago } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Confirm, Dialog } from '@/components/ui/dialog';
import { Card, Empty, ErrorBox, PageTitle, Spinner } from '@/components/ui/misc';

/** Miniatura de um modelo pronto (renderizada no navegador, com dados de exemplo). */
function TemplateThumb({ t }: { t: PlateTemplate }) {
  const restaurante = useAuth((s) => s.restaurant?.name) ?? 'Seu restaurante';
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => { void renderPng(t, { mesa: 'Mesa 1', restaurante, url: 'https://g.garfeed.com.br/GF0000' }, 60).then(setSrc); }, [t, restaurante]);
  return (
    <div className="grid h-36 place-items-center rounded-card bg-gf-bg p-3">
      {src ? <img src={src} alt="" className="max-h-[7.5rem] w-auto max-w-full rounded object-contain shadow-sm ring-1 ring-gf-border" /> : <span className="text-sm text-gf-muted">…</span>}
    </div>
  );
}

export function PlateDesignsPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['plate-designs'], queryFn: () => call(api.plateDesigns.list) });
  const brand = useQuery({ queryKey: ['plate-brand'], queryFn: () => call(api.plateDesigns.brand), staleTime: 60_000 }).data;
  // com marca própria, os modelos já nascem nas cores do restaurante
  const templates = useMemo(() => TEMPLATES.map((t) => withBrand(t, brand?.enabled ? brand : null)), [brand]);
  const [picking, setPicking] = useState(false);
  const [del, setDel] = useState<PlateDesignSummary | null>(null);
  const create = useMutation({
    mutationFn: (t: PlateTemplate) => call(api.plateDesigns.create, { body: { name: t.name, widthMm: t.widthMm, heightMm: t.heightMm, doc: t.doc } }),
    onSuccess: (d) => { void qc.invalidateQueries({ queryKey: ['plate-designs'] }); nav(`/placas/artes/${d.id}`); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => call(api.plateDesigns.remove, { params: { id } }),
    onSuccess: () => { toast.success('Arte excluída'); setDel(null); void qc.invalidateQueries({ queryKey: ['plate-designs'] }); },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <div className="px-4 py-6 md:px-8">
      <button onClick={() => nav('/placas')} className="mb-2 inline-flex min-h-11 items-center gap-2 font-semibold text-gf-navy-80 hover:text-gf-navy">
        <ArrowLeft className="h-5 w-5" />Placas</button>
      <PageTitle actions={<Button size="lg" onClick={() => setPicking(true)}><Plus className="h-5 w-5" />Nova arte</Button>}>Adesivos e plaquinhas</PageTitle>
      <p className="-mt-2 mb-6 max-w-3xl text-gf-navy-80">
        Monte a arte com o QR Code da mesa e imprima para colar na mesa ou montar um display. Cada mesa sai com o próprio QR —
        mesas sem placa ganham um código na hora da impressão.
      </p>
      {list.isLoading ? <Spinner /> : list.error ? <ErrorBox error={list.error} /> : !list.data?.length ? (
        <Card><Empty icon={<Palette className="h-12 w-12 text-gf-orange" />} title="Nenhuma arte ainda" text="Comece por um modelo pronto e ajuste do seu jeito.">
          <Button onClick={() => setPicking(true)}>Escolher um modelo</Button></Empty></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.data.map((d) => (
            <Card key={d.id} className="flex flex-col gap-3 p-5">
              <div className="min-w-0">
                <h2 className="break-words font-heading text-xl font-black text-gf-navy">{d.name}</h2>
                <p className="text-sm text-gf-muted">{d.widthMm / 10} × {d.heightMm / 10} cm · editada {ago(d.updatedAt)}</p>
              </div>
              <div className="mt-auto flex flex-wrap gap-2">
                <Button onClick={() => nav(`/placas/artes/${d.id}`)}><Pencil className="h-4 w-4" />Editar e imprimir</Button>
                <Button variant="ghost" aria-label={`Excluir ${d.name}`} onClick={() => setDel(d)}><Trash2 className="h-5 w-5" /></Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={picking} onOpenChange={setPicking} title="Escolha um modelo" description="Tudo pode ser mudado depois: tamanho, cores, textos e posição." className="max-w-4xl">
        <div className="grid max-h-[70dvh] gap-3 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <button key={t.key} disabled={create.isPending} onClick={() => create.mutate(t)}
              className="rounded-card border border-gf-border p-3 text-left transition-colors hover:border-gf-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gf-orange disabled:opacity-50">
              <TemplateThumb t={t} />
              <b className="mt-3 block text-gf-navy">{t.label}</b>
              <span className="text-sm text-gf-muted">{t.hint}</span>
            </button>
          ))}
        </div>
      </Dialog>
      <Confirm open={!!del} onOpenChange={(o) => !o && setDel(null)} danger title="Excluir arte?" description={`"${del?.name}" será excluída. As placas e os QR das mesas continuam valendo.`}
        confirmLabel="Excluir" loading={remove.isPending} onConfirm={() => del && remove.mutate(del.id)} />
    </div>
  );
}
