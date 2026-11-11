import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { api, LoginBody } from '@garfeed/shared';
import logo from '@/assets/logo-horizontal-cor.svg';
import hero from '@/assets/login.webp';
import { applyAuth, call, errMsg } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { unlockAudio } from '@/lib/alerts';
import { isStoreApp } from '@/lib/storeApp';

export const authInputCls = 'h-14 w-full rounded-xl border border-gf-border bg-white pl-12 pr-12 text-lg text-gf-navy placeholder:text-gf-muted focus:border-gf-orange focus:outline-none focus:ring-2 focus:ring-gf-orange/20';

/** Moldura das telas públicas (P0): foto com o slogan à esquerda (só no desktop), logo + formulário à direita. */
export function AuthSplit({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen bg-white md:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-gf-navy md:block">
        <img src={hero} alt="" className="absolute inset-0 h-full w-full object-cover object-[80%_center]" />
        <div className="absolute inset-0 bg-gradient-to-b from-gf-navy/80 via-gf-navy/20 to-transparent" />
        <p className="relative px-12 pt-20 font-heading text-6xl font-black leading-[1.05] text-white lg:text-7xl">Deu fome?<br />Rolou, pediu.</p>
      </div>
      <div className="flex flex-col items-center justify-center overflow-y-auto px-6 py-10">
        <img src={logo} alt="Garfeed" className="mb-10 h-20 w-auto md:h-24" />
        {children}
      </div>
    </div>
  );
}

export function LoginPage() {
  const user = useAuth((s) => s.user);
  const nav = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from;
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(LoginBody) });

  if (user) return <Navigate to={user.role === 'SUPERADMIN' ? '/admin/restaurantes' : '/ao-vivo'} replace />;

  const onSubmit = handleSubmit(async (body) => {
    setError('');
    unlockAudio(); // o clique em "Entrar" já libera o som dos alertas
    try {
      const r = await call(api.auth.login, { body });
      applyAuth(r);
      nav(from && from !== '/login' ? from : r.user.role === 'SUPERADMIN' ? '/admin/restaurantes' : '/ao-vivo', { replace: true });
    } catch (e) { setError(errMsg(e)); }
  });

  const inputCls = authInputCls;
  return (
    <AuthSplit>
        <form onSubmit={onSubmit} noValidate className="w-full max-w-md">
          <h1 className="mb-6 font-heading text-4xl font-black text-gf-navy md:text-5xl">Entrar no painel</h1>
          <label className="mb-1.5 block font-semibold" htmlFor="email">E-mail</label>
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 h-6 w-6 -translate-y-1/2 text-gf-navy-80" />
            <input id="email" type="email" autoComplete="email" placeholder="Seu e-mail" className={inputCls} {...register('email')} />
          </div>
          {errors.email && <p className="mt-1 text-sm text-danger">{errors.email.message}</p>}
          <label className="mb-1.5 mt-5 block font-semibold" htmlFor="password">Senha</label>
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 h-6 w-6 -translate-y-1/2 text-gf-navy-80" />
            <input id="password" type={show ? 'text' : 'password'} autoComplete="current-password" placeholder="Sua senha" className={inputCls} {...register('password')} />
            <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Ocultar senha' : 'Mostrar senha'} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gf-navy-80">
              {show ? <EyeOff className="h-6 w-6" /> : <Eye className="h-6 w-6" />}
            </button>
          </div>
          {errors.password && <p className="mt-1 text-sm text-danger">{errors.password.message}</p>}
          <div className="mt-3 text-right">
            <Link to="/esqueci-senha" className="font-semibold text-info hover:underline">Esqueci minha senha</Link>
          </div>
          {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm font-medium text-danger">{error}</p>}
          <Button type="submit" loading={isSubmitting} className="mt-8 h-16 w-full rounded-2xl text-2xl">Entrar</Button>
          {!isStoreApp() && (
            <p className="mt-6 text-center text-lg">Ainda não tem conta? <Link to="/cadastro" className="inline-flex min-h-11 items-center font-semibold text-info hover:underline">Criar conta</Link></p>
          )}
        </form>
    </AuthSplit>
  );
}
