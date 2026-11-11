import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MailX, Pencil, Power, Send, UserPlus, Users } from 'lucide-react';
import { api, CreateUserBody, ROLE_LABEL, UpdateUserBody, type StaffRole, type StaffUser } from '@garfeed/shared';
import { call, errMsg } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ago, cn, initials } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/input';
import { Card, Empty, ErrorBox, MoreButton, PageTitle, Spinner } from '@/components/ui/misc';
import { Dropdown } from '@/components/ui/dropdown';

const ROLE_HINT: Record<StaffRole, string> = {
  OWNER: 'gerencia toda a conta', MANAGER: 'organiza a operação', WAITER: 'atende mesas e chamados', KITCHEN: 'acompanha o preparo',
};
const ROLES: StaffRole[] = ['OWNER', 'MANAGER', 'WAITER', 'KITCHEN'];

export function TeamPage() {
  const qc = useQueryClient();
  const me = useAuth((s) => s.user?.id);
  const users = useQuery({ queryKey: ['users'], queryFn: () => call(api.users.list) });
  const [edit, setEdit] = useState<StaffUser | 'new' | null>(null);
  const toggle = useMutation({
    mutationFn: (u: StaffUser) => call(api.users.update, { params: { id: u.id }, body: { active: !u.active } }),
    onSuccess: (u) => { toast.success(u.active ? `${u.name} reativado` : `${u.name} desativado`); void qc.invalidateQueries({ queryKey: ['users'] }); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const resend = useMutation({
    mutationFn: (u: StaffUser) => call(api.users.resendInvite, { params: { id: u.id } }),
    onSuccess: (u) => { toast.success(`Convite reenviado para ${u.email}`); void qc.invalidateQueries({ queryKey: ['users'] }); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const cancel = useMutation({
    mutationFn: (u: StaffUser) => call(api.users.cancelInvite, { params: { id: u.id } }),
    onSuccess: () => { toast.success('Convite cancelado'); void qc.invalidateQueries({ queryKey: ['users'] }); },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <div className="px-4 py-6 md:px-8">
      <PageTitle actions={<Button size="lg" onClick={() => setEdit('new')}><UserPlus className="h-5 w-5" />Convidar pessoa</Button>}>Equipe</PageTitle>
      {users.isLoading ? <Spinner /> : users.error ? <ErrorBox error={users.error} /> : !users.data?.length ? (
        <Card><Empty icon={<Users className="h-12 w-12 text-gf-orange" />} title="Só você por aqui" text="Convide garçons, cozinha e gerentes." /></Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead><tr className="border-b border-gf-border text-gf-navy-80">
              <th className="px-6 py-4 font-semibold">Nome</th><th className="font-semibold">Papel</th><th className="font-semibold">E-mail</th><th className="font-semibold">Último acesso</th><th className="font-semibold">Status</th><th />
            </tr></thead>
            <tbody>
              {users.data.map((u) => (
                <tr key={u.id} className={cn('border-b border-gf-border last:border-0', !u.active && 'opacity-60')}>
                  <td className="px-6 py-4"><span className="flex items-center gap-3">
                    <span className="grid h-11 w-11 place-items-center rounded-xl bg-gf-orange-soft font-heading text-lg font-black text-gf-orange">{initials(u.name)}</span>
                    <b className="font-heading text-lg">{u.name}</b></span></td>
                  <td><span className="rounded-lg bg-gf-bg px-3 py-1.5">{ROLE_LABEL[u.role]}{u.sector && ` · ${u.sector === 'BAR' ? 'Bar' : 'Cozinha'}`}</span></td>
                  <td className="text-gf-navy-80">{u.email}</td>
                  <td className="text-gf-navy-80">{u.lastLoginAt ? ago(u.lastLoginAt) : 'Nunca entrou'}</td>
                  <td><StatusCell u={u} /></td>
                  <td className="pr-4 text-right">
                    <Dropdown trigger={<MoreButton />} items={[
                      { label: 'Editar', icon: Pencil, onSelect: () => setEdit(u) },
                      { label: 'Reenviar convite', icon: Send, hidden: !u.invite || !u.active, onSelect: () => resend.mutate(u) },
                      { label: 'Cancelar convite', icon: MailX, danger: true, hidden: !u.invite, onSelect: () => { if (window.confirm(`Cancelar o convite de ${u.name}? O acesso será removido.`)) cancel.mutate(u); } },
                      { label: u.active ? 'Desativar acesso' : 'Reativar acesso', icon: Power, danger: u.active, hidden: u.id === me, onSelect: () => toggle.mutate(u) },
                    ]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {edit && <UserDialog user={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

/** Ativo · Desativado · Convite pendente/expirado (quem ainda não definiu a senha). */
function StatusCell({ u }: { u: StaffUser }) {
  const [label, text, dot] = !u.active ? ['Desativado', 'text-gf-muted', 'bg-gf-muted']
    : u.invite === 'PENDING' ? ['Convite pendente', 'text-warning', 'bg-warning']
    : u.invite === 'EXPIRED' ? ['Convite expirado', 'text-danger', 'bg-danger']
    : ['Ativo', 'text-success', 'bg-success'];
  return <span className={cn('flex items-center gap-2 font-medium', text)}><span className={cn('h-2.5 w-2.5 rounded-full', dot)} />{label}</span>;
}

function UserDialog({ user, onClose }: { user: StaffUser | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { register, handleSubmit, control, setValue, formState: { errors } } = useForm<CreateUserBody>({
    // Convite: sem senha (a pessoa define pelo link do e-mail). Edição: senha e e-mail opcionais (e-mail não muda).
    resolver: zodResolver(user ? UpdateUserBody.extend({ email: CreateUserBody.shape.email.optional() }) : CreateUserBody) as never,
    defaultValues: { name: user?.name ?? '', email: user?.email ?? '', role: (user?.role as StaffRole) ?? 'WAITER', sector: user?.sector ?? null },
  });
  const role = useWatch({ control, name: 'role' });
  const m = useMutation({
    mutationFn: (b: CreateUserBody) => {
      const sector = b.role === 'KITCHEN' ? b.sector ?? 'KITCHEN' : null;
      return user
        ? call(api.users.update, { params: { id: user.id }, body: { name: b.name, role: b.role, sector, ...(b.password ? { password: b.password } : {}) } })
        : call(api.users.create, { body: { name: b.name, email: b.email, role: b.role, sector } });
    },
    onSuccess: () => { toast.success(user ? 'Pessoa atualizada' : 'Convite enviado por e-mail. O link vale por 7 dias.'); void qc.invalidateQueries({ queryKey: ['users'] }); onClose(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <Dialog open onOpenChange={onClose} title={user ? 'Editar pessoa' : 'Convidar pessoa'}>
      <form onSubmit={handleSubmit((b) => m.mutate(b))} className="space-y-4">
        <Field label="Nome" error={errors.name?.message}><Input placeholder="Ana Oliveira" {...register('name')} /></Field>
        <Field label="E-mail" error={errors.email?.message}><Input type="email" placeholder="pessoa@exemplo.com" disabled={!!user} {...register('email')} /></Field>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Papel</legend>
          <div className="space-y-2">
            {ROLES.map((r) => (
              <label key={r} className={cn('flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3', role === r ? 'border-gf-orange bg-gf-orange-soft' : 'border-gf-border')}>
                <input type="radio" value={r} className="h-5 w-5 accent-gf-orange" {...register('role')} onChange={() => setValue('role', r)} checked={role === r} />
                <span><b>{ROLE_LABEL[r]}</b> — {ROLE_HINT[r]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {role === 'KITCHEN' && (
          <Field label="Setor"><Select {...register('sector')}><option value="KITCHEN">Cozinha</option><option value="BAR">Bar</option></Select></Field>
        )}
        {user ? (
          <Field label="Nova senha (opcional)" error={errors.password?.message} hint="Mínimo de 8 caracteres, com letra maiúscula, número e caractere especial. A pessoa é avisada por e-mail e precisa entrar de novo.">
            <Input type="password" autoComplete="new-password" {...register('password', { setValueAs: (v: string) => v || undefined })} />
          </Field>
        ) : <p className="rounded-lg bg-gf-bg p-3 text-sm text-gf-navy-80">A pessoa recebe um e-mail com um link para criar a própria senha. O convite vale por 7 dias e pode ser reenviado.</p>}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button variant="outline" size="lg" onClick={onClose}>Cancelar</Button>
          <Button type="submit" size="lg" loading={m.isPending}>{user ? 'Salvar' : 'Enviar convite'}</Button>
        </div>
      </form>
    </Dialog>
  );
}
