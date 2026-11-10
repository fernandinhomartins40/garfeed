import { useEffect, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Clock, Crown, Eye, EyeOff, ExternalLink, Instagram, Layers, Link2, Play, Store, Upload, UtensilsCrossed, Volume2, Wifi } from 'lucide-react';
import { api, UpdateSettingsBody, type Settings } from '@garfeed/shared';
import { call, errMsg } from '@/lib/api';
import { usePrefs } from '@/lib/auth';
import { playAlert, unlockAudio } from '@/lib/alerts';
import { useMediaUpload } from '@/lib/upload';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Card, ErrorBox, PageTitle, Spinner } from '@/components/ui/misc';

const DAYS = [['mon', 'Seg'], ['tue', 'Ter'], ['wed', 'Qua'], ['thu', 'Qui'], ['fri', 'Sex'], ['sat', 'Sáb'], ['sun', 'Dom']] as const;
type Day = (typeof DAYS)[number][0];
type Hours = NonNullable<Settings['openingHours']>;
type Form = Omit<Settings, 'id' | 'slug' | 'plan' | 'status' | 'timezone'>;
const PLAN = { ESSENTIAL: 'Essencial', PRO: 'Pro', NETWORK: 'Rede' } as const;

export function SettingsPage() {
  const s = useQuery({ queryKey: ['settings'], queryFn: () => call(api.settings.get) });
  if (s.isLoading) return <Spinner />;
  if (s.error) return <div className="p-8"><ErrorBox error={s.error} retry={() => void s.refetch()} /></div>;
  return <SettingsForm s={s.data!} />;
}

function Section({ icon: Icon, title, text, children, className }: { icon: typeof Store; title: string; text: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn('p-5', className)}>
      <div className="mb-4 flex gap-3"><Icon className="mt-1 h-7 w-7 shrink-0" />
        <div><h2 className="font-heading text-2xl font-black">{title}</h2><p className="text-gf-navy-80">{text}</p></div></div>
      {children}
    </Card>
  );
}

function SettingsForm({ s }: { s: Settings }) {
  const qc = useQueryClient();
  const prefs = usePrefs();
  const [showPw, setShowPw] = useState(false);
  const { register, control, handleSubmit, setValue, reset, formState: { isDirty } } = useForm<Form>({ defaultValues: s });
  const [accent, logoUrl, hours] = useWatch({ control, name: ['accentColor', 'logoUrl', 'openingHours'] });
  const logo = useMediaUpload();
  useEffect(() => { if (logo.phase === 'ready' && logo.media?.url) setValue('logoUrl', logo.media.url, { shouldDirty: true }); }, [logo.phase, logo.media, setValue]);
  useEffect(() => { if (logo.phase === 'failed') toast.error(logo.error ?? 'Falha no envio do logo'); }, [logo.phase, logo.error]);

  const save = useMutation({
    mutationFn: (b: UpdateSettingsBody) => call(api.settings.update, { body: b }),
    onSuccess: (r) => { qc.setQueryData(['settings'], r); reset(r); toast.success('Alterações salvas'); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const onSubmit = handleSubmit((f) => {
    const blank = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);
    const r = UpdateSettingsBody.safeParse({ ...f, wifiName: blank(f.wifiName), wifiPassword: blank(f.wifiPassword), instagram: blank(f.instagram), googleReviewUrl: blank(f.googleReviewUrl), logoUrl: blank(f.logoUrl), accentColor: blank(f.accentColor) });
    if (!r.success) return toast.error(r.error.issues.map((i) => `${String(i.path[0] ?? '')}: ${i.message}`).join(' · '));
    save.mutate(r.data);
  });
  const setDay = (d: Day, ranges: [string, string][] | null) => {
    const next: Hours = { ...(hours ?? {}) };
    if (ranges) next[d] = ranges; else delete next[d];
    setValue('openingHours', next, { shouldDirty: true });
  };

  return (
    <form onSubmit={onSubmit} className="px-4 pb-28 pt-6 md:px-8">
      <PageTitle>Configurações</PageTitle>
      <div className="grid gap-5 xl:grid-cols-2">
        <div className="space-y-5">
          <Section icon={Store} title="Dados do restaurante" text="Informações principais que aparecem no seu cardápio.">
            <Field label="Nome do restaurante"><Input className="h-12 font-heading text-lg font-extrabold" {...register('name', { required: true })} /></Field>
            <div className="mt-5 grid gap-5 sm:grid-cols-[1fr_auto]">
              <div>
                <p className="mb-2 text-sm font-semibold">Logo do restaurante</p>
                <div className="flex items-center gap-4">
                  <span className="grid h-36 w-36 place-items-center overflow-hidden rounded-2xl bg-gf-navy">
                    {logoUrl ? <img src={logoUrl} alt="Logo" className="h-full w-full object-cover" /> : <Store className="h-12 w-12 text-white/60" />}
                  </span>
                  <div>
                    <label className={cn('inline-flex h-10 cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg border border-gf-border bg-gf-bg px-4 font-medium', logo.busy && 'opacity-60')}>
                      <Upload className="h-4 w-4" />{logo.busy ? (logo.phase === 'uploading' ? `Enviando ${logo.progress}%` : 'Processando…') : 'Trocar logo'}
                      <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={logo.busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void logo.start(f); e.target.value = ''; }} />
                    </label>
                    <p className="mt-2 text-xs text-gf-muted">PNG, JPG ou WEBP, até 15 MB.</p>
                  </div>
                </div>
              </div>
              <div className="sm:border-l sm:border-gf-border sm:pl-5">
                <p className="mb-2 text-sm font-semibold">Cor do tema</p>
                <div className="flex gap-2">
                  <input type="color" aria-label="Escolher cor" value={accent ?? '#FE581D'} onChange={(e) => setValue('accentColor', e.target.value.toUpperCase(), { shouldDirty: true })} className="h-11 w-12 cursor-pointer rounded-lg border border-gf-border" />
                  <Input aria-label="Cor em hexadecimal" className="w-32 font-mono" placeholder="#FE581D" {...register('accentColor')} />
                </div>
                <p className="mb-2 mt-3 text-sm text-gf-navy-80">Pré-visualização</p>
                <div className="rounded-xl bg-gf-orange-soft p-3">
                  <span className="inline-flex items-center gap-2 rounded-lg px-4 py-2 font-semibold text-white" style={{ background: accent || '#FE581D' }}><UtensilsCrossed className="h-4 w-4" />Ver cardápio ›</span>
                </div>
              </div>
            </div>
          </Section>

          <Section icon={Layers} title="Operação" text="Ajustes de operação do seu restaurante.">
            <Controller control={control} name="requireConfirmation" render={({ field }) => (
              <label className="flex items-center justify-between gap-4 border-b border-gf-border pb-4">
                <span><b className="block text-lg">Confirmar pedidos antes de enviar para a cozinha</b><span className="text-gf-navy-80">Os pedidos ficam pendentes até a confirmação da equipe.</span></span>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </label>
            )} />
            <Controller control={control} name="soundEnabled" render={({ field }) => (
              <label className="flex items-center justify-between gap-4 border-b border-gf-border py-4">
                <span><b className="block text-lg">Som dos alertas</b><span className="text-gf-navy-80">Padrão do restaurante. Cada aparelho pode silenciar na barra lateral.</span></span>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </label>
            )} />
            <div className="pt-4">
              <b className="block text-lg">Volume das notificações</b>
              <span className="text-gf-navy-80">Ajuste o volume do som dos novos pedidos (neste aparelho).</span>
              <div className="mt-3 flex flex-wrap items-center gap-4">
                <Volume2 className="h-6 w-6" />
                <input type="range" min={0.1} max={1} step={0.05} value={prefs.volume} aria-label="Volume" onChange={(e) => prefs.set({ volume: Number(e.target.value) })} className="flex-1 accent-gf-orange" />
                <b className="w-12">{Math.round(prefs.volume * 100)}%</b>
                <Button variant="outline" onClick={() => { unlockAudio(); setTimeout(() => playAlert(prefs.volume), 50); }}><Play className="h-4 w-4" />Testar som</Button>
              </div>
            </div>
          </Section>
        </div>

        <div className="space-y-5">
          <Section icon={Clock} title="Horário de funcionamento" text="Defina os dias e horários de atendimento.">
            <div className="space-y-2">
              {DAYS.map(([d, label]) => {
                const ranges = hours?.[d];
                const [from, to] = ranges?.[0] ?? ['18:00', '23:00'];
                // shortcut: edita só o 1º turno do dia; turnos extras vindos da API são mantidos. Upgrade: lista de turnos por dia.
                const upd = (i: 0 | 1, v: string) => setDay(d, [[i === 0 ? v : from, i === 1 ? v : to], ...(ranges?.slice(1) ?? [])]);
                return (
                  <div key={d} className="grid grid-cols-[3rem_1fr_auto] items-center gap-3">
                    <b>{label}</b>
                    <div className={cn('flex items-center gap-2 rounded-lg border border-gf-border px-3 py-1.5', !ranges && 'opacity-40')}>
                      <Clock className="h-4 w-4" />
                      <input type="time" aria-label={`${label} abre`} value={from} disabled={!ranges} onChange={(e) => upd(0, e.target.value)} className="bg-transparent font-semibold" />
                      –
                      <input type="time" aria-label={`${label} fecha`} value={to} disabled={!ranges} onChange={(e) => upd(1, e.target.value)} className="bg-transparent font-semibold" />
                      {ranges && ranges.length > 1 && <span className="text-xs text-gf-muted">+{ranges.length - 1} turno</span>}
                    </div>
                    <Switch aria-label={`Aberto ${label}`} checked={!!ranges} onCheckedChange={(on) => setDay(d, on ? [[from, to]] : null)} />
                  </div>
                );
              })}
            </div>
          </Section>

          <Section icon={Wifi} title="Wi-Fi" text="Configure o Wi-Fi para seus clientes.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nome da rede (SSID)"><Input {...register('wifiName')} /></Field>
              <Field label="Senha">
                <div className="relative"><Input type={showPw ? 'text' : 'password'} className="pr-11" {...register('wifiPassword')} />
                  <button type="button" onClick={() => setShowPw(!showPw)} aria-label={showPw ? 'Ocultar senha' : 'Mostrar senha'} className="absolute right-3 top-1/2 -translate-y-1/2">
                    {showPw ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button></div>
              </Field>
            </div>
          </Section>

          <Section icon={Link2} title="Links" text="Conecte suas redes para aparecer no cardápio.">
            <div className="space-y-3">
              {([['instagram', 'Instagram', Instagram, '@brasaepao'], ['googleReviewUrl', 'Google', ExternalLink, 'https://g.page/r/…/review']] as const).map(([name, label, Icon, ph]) => (
                <label key={name} className="grid grid-cols-[7rem_1fr] items-center gap-3">
                  <span className="flex items-center gap-2 font-semibold"><Icon className="h-5 w-5" />{label}</span>
                  <Input placeholder={ph} {...register(name)} />
                </label>
              ))}
            </div>
          </Section>

          <Card className="flex flex-wrap items-center gap-4 p-5">
            <Crown className="h-7 w-7" />
            <div className="flex-1"><h2 className="font-heading text-2xl font-black">Plano atual</h2><p className="text-gf-navy-80">Seu plano e opções de assinatura.</p></div>
            <span className="rounded-pill bg-blue-50 px-4 py-1.5 text-lg font-bold text-info">{PLAN[s.plan]}</span>
            <a href="mailto:contato@garfeed.com.br?subject=Plano" className="inline-flex h-11 items-center rounded-lg bg-gf-bg px-4 font-semibold hover:bg-gf-border">Gerenciar plano</a>
          </Card>
        </div>
      </div>
      <div className="fixed bottom-5 right-5 z-20">
        <Button type="submit" size="lg" className="h-14 rounded-2xl px-8 text-xl shadow-xl" loading={save.isPending} disabled={!isDirty || logo.busy}><Check className="h-6 w-6" />Salvar alterações</Button>
      </div>
    </form>
  );
}
