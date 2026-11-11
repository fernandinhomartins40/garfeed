// "Esqueci minha senha" e "Definir senha" (recuperação e convite — o link do e-mail traz ?token=).
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { MailCheck } from 'lucide-react';
import { api, ForgotPasswordBody, ResetPasswordBody } from '@garfeed/shared';
import logo from '@/assets/logo-horizontal-cor.svg';
import { call, errMsg, logout } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/misc';
import { useThemeColor } from '@/lib/utils';

function Shell({ title, children }: { title: string; children: ReactNode }) {
  useThemeColor('#F6F7F9'); // bg-gf-bg
  return (
    <div className="flex min-h-dvh items-center justify-center bg-gf-bg px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-gf-border bg-white p-6 shadow-sm sm:p-8">
        <img src={logo} alt="Garfeed" className="mx-auto mb-8 h-14 w-auto" />
        <h1 className="mb-4 font-heading text-3xl font-black text-gf-navy">{title}</h1>
        {children}
      </div>
    </div>
  );
}
const BackToLogin = () => <p className="mt-6 text-center"><Link to="/login" className="inline-flex min-h-11 items-center font-semibold text-info hover:underline">Voltar para o login</Link></p>;
const ErrorMsg = ({ children }: { children: ReactNode }) => <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm font-medium text-danger">{children}</p>;

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(ForgotPasswordBody) });
  const onSubmit = handleSubmit(async (body) => {
    setError('');
    try { await call(api.auth.forgotPassword, { body }); setSent(true); } catch (e) { setError(errMsg(e)); }
  });
  return (
    <Shell title={sent ? 'Confira seu e-mail' : 'Esqueci minha senha'}>
      {sent ? (
        <div className="space-y-3 text-gf-navy-80" role="status">
          <MailCheck className="h-10 w-10 text-gf-orange" />
          <p>Se existir um acesso com esse e-mail, enviamos um link para criar uma nova senha. Ele vale por 1 hora.</p>
          <p className="text-sm text-gf-muted">Não chegou? Veja a caixa de spam ou peça ao dono do restaurante para conferir seu e-mail em Equipe.</p>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <p className="text-gf-navy-80">Informe o e-mail do seu acesso. Enviaremos um link para você criar uma nova senha.</p>
          <Field label="E-mail" error={errors.email?.message}><Input type="email" autoComplete="email" autoFocus placeholder="Seu e-mail" className="h-12" {...register('email')} /></Field>
          {error && <ErrorMsg>{error}</ErrorMsg>}
          <Button type="submit" size="lg" loading={isSubmitting} className="w-full">Enviar link</Button>
        </form>
      )}
      <BackToLogin />
    </Shell>
  );
}

export function SetPasswordPage() {
  const token = useSearchParams()[0].get('token') ?? '';
  const nav = useNavigate();
  const [error, setError] = useState('');
  const info = useQuery({ queryKey: ['password-token', token], queryFn: () => call(api.auth.checkPasswordToken, { body: { token } }), retry: false, refetchOnWindowFocus: false });
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(ResetPasswordBody.extend({ confirm: ResetPasswordBody.shape.password }).refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'As senhas não conferem' })),
    defaultValues: { token, password: '', confirm: '' },
  });
  const invite = info.data?.purpose === 'INVITE';
  const onSubmit = handleSubmit(async ({ password }) => {
    setError('');
    try {
      await call(api.auth.resetPassword, { body: { token, password } });
      await logout(); // a API já derrubou as sessões; limpa o estado local se havia alguém logado neste navegador
      toast.success('Senha definida. Entre com ela.');
      nav('/login', { replace: true });
    } catch (e) { setError(errMsg(e)); }
  });

  if (info.isLoading) return <Shell title="Definir senha"><Spinner /></Shell>;
  if (!info.data) {
    return (
      <Shell title="Link inválido ou expirado">
        <div className="space-y-4">
          <ErrorMsg>{errMsg(info.error)}</ErrorMsg>
          <p className="text-gf-navy-80">Links de convite valem 7 dias e os de recuperação, 1 hora — e só funcionam uma vez. Peça um novo link ou, se foi um convite, peça a quem convidou para reenviar.</p>
          <Link to="/esqueci-senha" className="inline-flex h-12 w-full items-center justify-center rounded-pill bg-gf-orange px-6 text-lg font-semibold text-white hover:bg-gf-orange-hover">Pedir novo link</Link>
        </div>
        <BackToLogin />
      </Shell>
    );
  }
  return (
    <Shell title={invite ? 'Aceitar convite' : 'Definir nova senha'}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <p className="text-gf-navy-80">
          {invite
            ? <>Olá, <b>{info.data.name}</b>! Crie uma senha para entrar no painel{info.data.restaurantName && <> do <b>{info.data.restaurantName}</b></>}.</>
            : <>Crie uma nova senha para <b>{info.data.email}</b>.</>}
        </p>
        {/* ajuda o gerenciador de senhas a salvar com o e-mail certo */}
        <input type="email" autoComplete="username" value={info.data.email} readOnly hidden />
        <Field label="Nova senha" error={errors.password?.message} hint="Mínimo de 8 caracteres, com letra maiúscula, número e caractere especial."><Input type="password" autoComplete="new-password" autoFocus className="h-12" {...register('password')} /></Field>
        <Field label="Repita a senha" error={errors.confirm?.message}><Input type="password" autoComplete="new-password" className="h-12" {...register('confirm')} /></Field>
        {error && <ErrorMsg>{error}</ErrorMsg>}
        <Button type="submit" size="lg" loading={isSubmitting} className="w-full">{invite ? 'Criar senha' : 'Salvar nova senha'}</Button>
      </form>
      <BackToLogin />
    </Shell>
  );
}
