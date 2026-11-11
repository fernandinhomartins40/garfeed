// Cadastro do restaurante pelo próprio dono (autoatendimento): cria a conta, entra direto e cai no Cardápio vazio.
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, Navigate } from 'react-router-dom';
import { Check, Eye, EyeOff, Lock, Mail, Store, User } from 'lucide-react';
import { api, PASSWORD_RULES, SignupBody, TRIAL_DAYS } from '@garfeed/shared';
import { applyAuth, call, errMsg } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { isStoreApp } from '@/lib/storeApp';
import { unlockAudio } from '@/lib/alerts';
import { Button } from '@/components/ui/button';
import { AuthSplit, authInputCls } from './Login';

const SITE = 'https://garfeed.com.br';
const FIELDS = [
  ['restaurantName', 'Nome do restaurante', Store, 'text', 'organization', 'Ex.: Brasa & Pão'],
  ['name', 'Seu nome', User, 'text', 'name', 'Nome e sobrenome'],
  ['email', 'E-mail', Mail, 'email', 'email', 'Seu e-mail'],
] as const;

// índice = quantas regras de PASSWORD_RULES a senha já atende
const STRENGTH = [
  { label: 'muito fraca', bar: 'bg-danger', text: 'text-danger' },
  { label: 'fraca', bar: 'bg-danger', text: 'text-danger' },
  { label: 'razoável', bar: 'bg-warning', text: 'text-gf-navy-80' },
  { label: 'boa', bar: 'bg-warning', text: 'text-gf-navy-80' },
  { label: 'forte', bar: 'bg-success', text: 'text-success' },
];

function EyeButton({ shown, onClick }: { shown: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={shown ? 'Ocultar senha' : 'Mostrar senha'} className="absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center text-gf-navy-80">
      {shown ? <EyeOff className="h-6 w-6" /> : <Eye className="h-6 w-6" />}
    </button>
  );
}

export function SignupPage() {
  const user = useAuth((s) => s.user);
  const [show, setShow] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [error, setError] = useState('');
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(SignupBody) });
  const password = watch('password') ?? '';
  const passed = PASSWORD_RULES.filter((r) => r.test(password)).length;
  const strength = STRENGTH[passed]!;

  // Logado (inclusive logo após criar a conta): primeiro acesso útil = Cardápio vazio com "Cadastrar primeiro item".
  if (user) return <Navigate to={user.role === 'SUPERADMIN' ? '/admin/restaurantes' : '/cardapio'} replace />;
  if (isStoreApp()) return <Navigate to="/login" replace />; // no app da loja não há cadastro

  const onSubmit = handleSubmit(async (body) => {
    setError('');
    if (body.password !== confirm) return setConfirmError('As senhas não são iguais');
    unlockAudio(); // o clique já libera o som dos alertas
    try {
      applyAuth(await call(api.auth.signup, { body })); // com o usuário na store, o Navigate acima leva ao Cardápio
    } catch (e) { setError(errMsg(e)); }
  });

  return (
    <AuthSplit>
      <form onSubmit={onSubmit} noValidate className="w-full max-w-md">
        <h1 className="font-heading text-4xl font-black text-gf-navy md:text-5xl">Criar conta grátis</h1>
        <p className="mb-6 mt-2 text-lg text-gf-navy-80">{TRIAL_DAYS} dias grátis, sem cartão.</p>
        {FIELDS.map(([name, label, Icon, type, auto, ph]) => (
          <div key={name} className="mb-4">
            <label className="mb-1.5 block font-semibold" htmlFor={name}>{label}</label>
            <div className="relative">
              <Icon className="absolute left-4 top-1/2 h-6 w-6 -translate-y-1/2 text-gf-navy-80" />
              <input id={name} type={type} autoComplete={auto} placeholder={ph} aria-invalid={!!errors[name]} className={authInputCls} {...register(name)} />
            </div>
            {errors[name] && <p role="alert" className="mt-1 text-sm text-danger">{errors[name].message}</p>}
          </div>
        ))}
        <label className="mb-1.5 block font-semibold" htmlFor="password">Senha</label>
        <div className="relative">
          <Lock className="absolute left-4 top-1/2 h-6 w-6 -translate-y-1/2 text-gf-navy-80" />
          <input id="password" type={show ? 'text' : 'password'} autoComplete="new-password" placeholder="Crie uma senha forte" aria-invalid={!!errors.password} aria-describedby="password-rules" className={authInputCls} {...register('password')} />
          <EyeButton shown={show} onClick={() => setShow(!show)} />
        </div>
        {password && (
          <div className="mt-2" aria-live="polite">
            <div className="flex gap-1.5" aria-hidden>
              {PASSWORD_RULES.map((_, i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i < passed ? strength.bar : 'bg-gf-border'}`} />)}
            </div>
            <p className={`mt-1 text-sm font-semibold ${strength.text}`}>Senha {strength.label}</p>
          </div>
        )}
        <ul id="password-rules" className="mt-2 space-y-0.5 text-sm">
          {PASSWORD_RULES.map((r) => {
            const ok = r.test(password);
            return (
              <li key={r.label} className={`flex items-center gap-2 ${ok ? 'text-success' : 'text-gf-muted'}`}>
                <Check className={`h-4 w-4 shrink-0 ${ok ? '' : 'opacity-30'}`} aria-hidden />
                <span>{r.label}<span className="sr-only">{ok ? ' (atendido)' : ' (falta)'}</span></span>
              </li>
            );
          })}
        </ul>
        {errors.password && <p role="alert" className="mt-1 text-sm text-danger">{errors.password.message}</p>}
        <label className="mb-1.5 mt-4 block font-semibold" htmlFor="confirm">Repetir senha</label>
        <div className="relative">
          <Lock className="absolute left-4 top-1/2 h-6 w-6 -translate-y-1/2 text-gf-navy-80" />
          <input id="confirm" type={showConfirm ? 'text' : 'password'} autoComplete="new-password" placeholder="Digite a senha de novo" value={confirm} aria-invalid={!!confirmError}
            onChange={(e) => { setConfirm(e.target.value); setConfirmError(''); }} className={authInputCls} />
          <EyeButton shown={showConfirm} onClick={() => setShowConfirm(!showConfirm)} />
        </div>
        {confirmError && <p role="alert" className="mt-1 text-sm text-danger">{confirmError}</p>}
        <label className="mt-5 flex min-h-11 cursor-pointer items-start gap-3 text-gf-navy-80">
          <input type="checkbox" className="mt-0.5 h-6 w-6 shrink-0 accent-gf-orange" {...register('acceptTerms')} />
          <span>Li e aceito os <a href={`${SITE}/termos/`} target="_blank" rel="noreferrer" className="font-semibold text-info hover:underline">Termos de Uso</a> e a <a href={`${SITE}/privacidade/`} target="_blank" rel="noreferrer" className="font-semibold text-info hover:underline">Política de Privacidade</a>.</span>
        </label>
        {errors.acceptTerms && <p role="alert" className="mt-1 text-sm text-danger">{errors.acceptTerms.message}</p>}
        {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm font-medium text-danger">{error}</p>}
        <Button type="submit" loading={isSubmitting} className="mt-6 h-16 w-full rounded-2xl text-2xl">Criar conta</Button>
        <p className="mt-6 text-center text-lg">Já tenho conta. <Link to="/login" className="inline-flex min-h-11 items-center font-semibold text-info hover:underline">Entrar</Link></p>
      </form>
    </AuthSplit>
  );
}
