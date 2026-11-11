import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeftRight, Link2, Link2Off, Lock, Plus, Printer, QrCode, Search } from 'lucide-react';
import { api, type Tag, type TagStatus } from '@garfeed/shared';
import { call, errMsg } from '@/lib/api';
import { qk, useNow } from '@/lib/live';
import { printEmergencyQrs } from '@/lib/qr';
import { ago } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Confirm } from '@/components/ui/dialog';
import { Input, Select } from '@/components/ui/input';
import { Badge, Card, Empty, ErrorBox, PageTitle, Spinner, type Tone } from '@/components/ui/misc';
import { Dropdown } from '@/components/ui/dropdown';

const ST: Record<TagStatus, { label: string; tone: Tone; dot: string }> = {
  ACTIVE: { label: 'Ativa', tone: 'green', dot: 'bg-success' },
  UNASSIGNED: { label: 'Não vinculada', tone: 'yellow', dot: 'bg-warning' },
  BLOCKED: { label: 'Bloqueada', tone: 'red', dot: 'bg-danger' },
};

export function TagsPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const now = useNow(60_000);
  const tags = useQuery({ queryKey: ['tags'], queryFn: () => call(api.tags.list) });
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<TagStatus | ''>('');
  const [act, setAct] = useState<{ tag: Tag; kind: 'unlink' | 'block' } | null>(null);
  const m = useMutation({
    mutationFn: ({ tag, kind }: { tag: Tag; kind: 'unlink' | 'block' }) => call(kind === 'block' ? api.tags.block : api.tags.unlink, { params: { code: tag.code } }),
    onSuccess: (t, { kind }) => {
      toast.success(kind === 'block' ? `Placa ${t.code} bloqueada` : `Placa ${t.code} desvinculada`);
      setAct(null); void qc.invalidateQueries({ queryKey: ['tags'] }); void qc.invalidateQueries({ queryKey: qk.tables });
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const list = (tags.data ?? []).filter((t) => (!status || t.status === status) && `${t.code} ${t.table?.name ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  const printable = (tags.data ?? []).filter((t) => t.status === 'ACTIVE' && t.table).map((t) => ({ table: t.table!.name, code: t.code }));

  return (
    <div className="px-4 py-6 md:px-8">
      <PageTitle actions={<>
        <Button size="lg" onClick={() => nav('/placas/vincular')}><Plus className="h-5 w-5" />Vincular placa</Button>
        <Button size="lg" variant="outline" disabled={!printable.length} onClick={() => !printEmergencyQrs(printable) && toast.error('Permita pop-ups para imprimir.')}>
          <Printer className="h-5 w-5" />Imprimir QRs de emergência</Button>
      </>}>Placas</PageTitle>
      <div className="mb-5 grid gap-3 sm:grid-cols-[2fr_1fr]">
        <div className="relative"><Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gf-navy-80" />
          <Input aria-label="Buscar" placeholder="Buscar por código ou mesa" className="h-12 pl-12" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select aria-label="Status" className="[&_select]:h-12" value={status} onChange={(e) => setStatus(e.target.value as TagStatus | '')}>
          <option value="">Status: Todos</option>{Object.entries(ST).map(([k, v]) => <option key={k} value={k}>Status: {v.label}</option>)}
        </Select>
      </div>
      {tags.isLoading ? <Spinner /> : tags.error ? <ErrorBox error={tags.error} /> : !tags.data?.length ? (
        <Card><Empty icon={<QrCode className="h-12 w-12 text-gf-orange" />} title="Nenhuma placa ainda" text="As placas do seu kit aparecem aqui depois de vinculadas a uma mesa.">
          <Button onClick={() => nav('/placas/vincular')}>Vincular primeira placa</Button></Empty></Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="table-stack w-full text-left text-lg md:min-w-[720px]">
            <thead><tr className="border-b border-gf-border text-gf-navy-80">
              <th className="px-6 py-4 font-semibold">Código</th><th className="font-semibold">Mesa vinculada</th><th className="font-semibold">Status</th><th className="font-semibold">Última leitura</th><th className="pr-6 text-right font-semibold">Ações</th>
            </tr></thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.code} className="border-b border-gf-border last:border-0 hover:bg-gf-bg/60">
                  <td data-primary className="px-6 py-4 font-heading text-xl font-black">{t.code}</td>
                  <td data-label="Mesa vinculada" className={t.table ? '' : 'text-gf-muted'}>{t.table?.name ?? 'Não vinculada'}</td>
                  <td data-label="Status"><Badge tone={ST[t.status].tone} className="text-base"><span className={`h-2.5 w-2.5 rounded-full ${ST[t.status].dot}`} />{ST[t.status].label}</Badge></td>
                  <td data-label="Última leitura">{t.lastReadAt ? ago(t.lastReadAt, now) : '—'}</td>
                  <td className="pr-6 text-right">
                    <Dropdown trigger={<button aria-label="Ações" className="h-11 w-11 rounded-lg border border-gf-border font-bold data-[state=open]:border-gf-orange">⋮</button>} items={[
                      { label: t.table ? 'Trocar mesa' : 'Vincular a mesa', icon: t.table ? ArrowLeftRight : Link2, hidden: t.status === 'BLOCKED', onSelect: () => nav(`/placas/vincular?code=${t.code}`) },
                      { label: 'Desvincular', icon: Link2Off, hidden: t.status !== 'ACTIVE', onSelect: () => setAct({ tag: t, kind: 'unlink' }) },
                      { label: 'Bloquear', icon: Lock, danger: true, hidden: t.status === 'BLOCKED', onSelect: () => setAct({ tag: t, kind: 'block' }) },
                    ]} />
                  </td>
                </tr>
              ))}
              {!list.length && <tr><td colSpan={5} className="py-10 text-center text-gf-muted">Nenhuma placa com esse filtro.</td></tr>}
            </tbody>
          </table>
        </Card>
      )}
      <Confirm open={!!act} onOpenChange={() => setAct(null)} loading={m.isPending} danger={act?.kind === 'block'}
        title={act?.kind === 'block' ? `Bloquear ${act.tag.code}?` : `Desvincular ${act?.tag.code}?`}
        confirmLabel={act?.kind === 'block' ? 'Bloquear placa' : 'Desvincular'}
        description={act?.kind === 'block' ? 'Use quando a placa for perdida ou roubada: ela para de abrir o cardápio e não pode ser reativada pelo painel.' : `A ${act?.tag.table?.name ?? 'mesa'} fica sem placa até você vincular outra.`}
        onConfirm={() => act && m.mutate(act)} />
    </div>
  );
}
