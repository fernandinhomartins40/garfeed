import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, Check, CircleCheck, Info, Keyboard, List, Nfc, QrCode, Search, Store, Tag as TagIcon, Zap, ChevronRight, Armchair } from 'lucide-react';
import { api, type Table, type Tag, type TableRef } from '@garfeed/shared';
import logo from '@/assets/logo-horizontal-cor.svg';
import { ApiError, call, errMsg } from '@/lib/api';
import { qk } from '@/lib/live';
import { cn, extractTagCode, useThemeColor } from '@/lib/utils';
import { isNative, scanNfcNative } from '@/lib/native';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Confirm } from '@/components/ui/dialog';

type Step = 'choose' | 'scan' | 'nfc' | 'type' | 'table' | 'done';
const STEP_N: Record<Step, number> = { choose: 1, scan: 2, nfc: 2, type: 2, table: 3, done: 4 };
const hasNfc = () => 'NDEFReader' in window || isNative();

export function LinkTagPage() {
  useThemeColor('#FFFFFF');
  const nav = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const presetTable = params.get('mesa');
  const [step, setStep] = useState<Step>('choose');
  const [tag, setTag] = useState<Tag | null>(null);
  const [lookupErr, setLookupErr] = useState('');
  const [linked, setLinked] = useState<{ tag: Tag; table: Table } | null>(null);

  const lookup = useMutation({
    mutationFn: (code: string) => call(api.tags.get, { params: { code } }),
    onSuccess: (t) => {
      if (t.status === 'BLOCKED') return setLookupErr(`A placa ${t.code} está bloqueada. Use outra placa.`);
      setTag(t); setLookupErr(''); setStep('table');
    },
    onError: (e) => setLookupErr(e instanceof ApiError && e.status === 404 ? 'Placa não encontrada para este restaurante. Confira o código.' : errMsg(e)),
  });
  const onCode = (raw: string) => {
    const code = extractTagCode(raw);
    if (!code) return setLookupErr('Código inválido. Ele tem 6 caracteres e começa com GF (ex.: GF7K2P).');
    lookup.mutate(code);
  };
  // "Trocar mesa" na lista de placas abre direto no passo 3.
  const preCode = params.get('code');
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;
  useEffect(() => { if (preCode) onCodeRef.current(preCode); }, [preCode]);

  const back = () => {
    if (step === 'choose' || step === 'done') nav('/placas');
    else if (step === 'table') { setTag(null); setStep('choose'); }
    else setStep('choose');
  };
  const reset = () => { setTag(null); setLinked(null); setLookupErr(''); setStep('choose'); void qc.invalidateQueries({ queryKey: ['tags'] }); };

  return (
    <div className="min-h-dvh bg-white">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col">
        <header className="flex items-center gap-3 border-b border-gf-border px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <button onClick={back} aria-label="Voltar" className="grid h-11 w-11 place-items-center rounded-xl bg-gf-bg"><ArrowLeft className="h-6 w-6" /></button>
          <img src={logo} alt="Garfeed" className="mx-auto h-9 pr-11" />
        </header>
        <div className="flex-1 px-5 pb-6 pt-6">
          {step !== 'done' && <>
            <h1 className="font-heading text-3xl font-black sm:text-4xl">{step === 'scan' ? 'Escanear placa' : step === 'nfc' ? 'Aproximar placa' : step === 'type' ? 'Digitar código' : 'Vincular placa'}</h1>
            <p className="mt-3 text-lg text-gf-navy-80">Passo {STEP_N[step]} de 4</p>
            <div className="mt-2 h-2.5 rounded-full bg-gf-border"><div className="h-full rounded-full bg-gf-orange transition-all" style={{ width: `${STEP_N[step] * 25}%` }} /></div>
          </>}
          {lookupErr && step !== 'table' && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-danger">{lookupErr}</p>}
          {step === 'choose' && <Choose onPick={(s) => { setLookupErr(''); setStep(s); }} />}
          {step === 'scan' && <Scanner onCode={onCode} busy={lookup.isPending} onType={() => setStep('type')} />}
          {step === 'nfc' && <NfcReader onCode={onCode} onType={() => setStep('type')} />}
          {step === 'type' && <TypeCode onCode={onCode} busy={lookup.isPending} />}
          {step === 'table' && tag && <PickTable tag={tag} preset={presetTable} onDone={(t) => { setLinked({ tag, table: t }); setStep('done'); void qc.invalidateQueries({ queryKey: qk.tables }); }} />}
          {step === 'done' && linked && <Done {...linked} onNext={reset} />}
        </div>
      </div>
    </div>
  );
}

function Option({ icon: Icon, label, onClick }: { icon: typeof QrCode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-5 rounded-2xl border border-gf-border bg-white p-4 text-left shadow-card hover:border-gf-orange">
      <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gf-orange-soft"><Icon className="h-8 w-8" /></span>
      <span className="flex-1 font-heading text-2xl font-black leading-tight">{label}</span>
      <ChevronRight className="h-6 w-6 text-gf-navy-80" />
    </button>
  );
}

function Choose({ onPick }: { onPick: (s: Step) => void }) {
  return (
    <>
      <p className="mb-5 mt-6 text-lg text-gf-navy-80">Escolha como identificar a placa.</p>
      <div className="space-y-4">
        <Option icon={QrCode} label="Escanear QR da placa" onClick={() => onPick('scan')} />
        {hasNfc() && <Option icon={Nfc} label="Aproximar (NFC)" onClick={() => onPick('nfc')} />}
        <Option icon={Keyboard} label="Digitar código" onClick={() => onPick('type')} />
      </div>
      <p className="mt-6 flex items-center gap-3 rounded-xl bg-gf-bg p-4 text-gf-navy-80"><Info className="h-6 w-6 shrink-0" />Você fará isso uma vez para cada mesa.</p>
    </>
  );
}

/** Câmera: BarcodeDetector nativo; sem ele, @zxing/browser (carregado sob demanda). */
function Scanner({ onCode, busy, onType }: { onCode: (s: string) => void; busy: boolean; onType: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState('');
  const [torch, setTorch] = useState<boolean | null>(null);
  const track = useRef<MediaStreamTrack | null>(null);
  const cb = useRef(onCode);
  cb.current = onCode;
  const paused = useRef(false);
  paused.current = busy;

  useEffect(() => {
    let stop = () => {};
    let alive = true;
    let last = '';
    const hit = (text: string) => { if (!paused.current && text !== last) { last = text; cb.current(text); setTimeout(() => { last = ''; }, 3000); } };
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (!alive) return stream.getTracks().forEach((t) => t.stop());
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        track.current = stream.getVideoTracks()[0] ?? null;
        const caps = track.current?.getCapabilities?.() as { torch?: boolean } | undefined;
        if (caps?.torch) setTorch(false);
        stop = () => stream.getTracks().forEach((t) => t.stop());
        if ('BarcodeDetector' in window && (await BarcodeDetector.getSupportedFormats()).includes('qr_code')) {
          const det = new BarcodeDetector({ formats: ['qr_code'] });
          const loop = async () => {
            if (!alive) return;
            try { const [r] = await det.detect(v); if (r) hit(r.rawValue); } catch { /* frame vazio */ }
            setTimeout(() => void loop(), 250);
          };
          void loop();
        } else {
          const { BrowserQRCodeReader } = await import('@zxing/browser');
          const ctl = await new BrowserQRCodeReader().decodeFromVideoElement(v, (r) => { if (r) hit(r.getText()); });
          const prev = stop;
          stop = () => { ctl.stop(); prev(); };
        }
      } catch (e) {
        setErr(e instanceof DOMException && e.name === 'NotAllowedError' ? 'Acesso à câmera negado. Libere nas configurações do navegador ou digite o código.' : 'Não foi possível abrir a câmera. Digite o código.');
      }
    })();
    return () => { alive = false; stop(); };
  }, []);

  const toggleTorch = async () => {
    const on = !torch;
    await track.current?.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] }).catch(() => undefined);
    setTorch(on);
  };
  return (
    <div className="-mx-5 mt-6">
      <div className="relative aspect-[3/4] overflow-hidden bg-gf-navy">
        <video ref={video} muted playsInline className="absolute inset-0 h-full w-full object-cover" />
        <p className="absolute inset-x-0 top-5 text-center font-heading text-lg font-black text-white drop-shadow">Aponte para o QR da plaquinha</p>
        {torch !== null && <button onClick={() => void toggleTorch()} aria-label="Lanterna" aria-pressed={torch} className={cn('absolute right-4 top-3 grid h-11 w-11 place-items-center rounded-xl border border-white/40', torch ? 'bg-white text-gf-navy' : 'bg-black/30 text-white')}><Zap className="h-6 w-6" /></button>}
        <div className="absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2">
          {['left-0 top-0 border-l-[6px] border-t-[6px] rounded-tl-3xl', 'right-0 top-0 border-r-[6px] border-t-[6px] rounded-tr-3xl', 'left-0 bottom-0 border-l-[6px] border-b-[6px] rounded-bl-3xl', 'right-0 bottom-0 border-r-[6px] border-b-[6px] rounded-br-3xl']
            .map((c) => <span key={c} className={cn('absolute h-12 w-12 border-gf-orange', c)} />)}
        </div>
        {busy && <p className="absolute inset-x-0 bottom-4 text-center font-semibold text-white">Consultando placa…</p>}
        {err && <p className="absolute inset-x-4 bottom-4 rounded-lg bg-white p-3 text-center text-danger">{err}</p>}
      </div>
      <div className="space-y-3 px-5 pt-5">
        <Option icon={Keyboard} label="Digitar código" onClick={onType} />
        <p className="flex items-center gap-3 rounded-xl bg-gf-bg p-4 text-gf-navy-80"><Info className="h-6 w-6 shrink-0" />Permita o acesso à câmera para escanear o QR.</p>
      </div>
    </div>
  );
}

/** Web NFC (Chrome Android): lê o registro de URL gravado na placa. */
function NfcReader({ onCode, onType }: { onCode: (s: string) => void; onType: () => void }) {
  const [err, setErr] = useState('');
  const cb = useRef(onCode);
  cb.current = onCode;
  useEffect(() => {
    if (isNative()) return scanNfcNative((t) => cb.current(t), setErr); // app iOS: plugin nativo no lugar do Web NFC
    const ctl = new AbortController();
    const reader = new NDEFReader();
    reader.onreading = (e) => {
      for (const r of e.message.records) {
        if ((r.recordType === 'url' || r.recordType === 'text') && r.data) return cb.current(new TextDecoder(r.encoding ?? 'utf-8').decode(r.data));
      }
      setErr('Não encontramos o código nesta placa. Digite o código impresso.');
    };
    reader.scan({ signal: ctl.signal }).catch((e: unknown) => setErr(e instanceof DOMException && e.name === 'NotAllowedError' ? 'Permissão de NFC negada.' : 'NFC indisponível. Ative o NFC do celular.'));
    return () => ctl.abort();
  }, []);
  return (
    <div className="mt-8 text-center">
      <div className="mx-auto grid h-40 w-40 animate-pulse place-items-center rounded-full bg-gf-orange-soft"><Nfc className="h-20 w-20 text-gf-orange" /></div>
      <p className="mt-6 font-heading text-2xl font-black">Encoste o celular na placa</p>
      <p className="mt-1 text-gf-navy-80">Mantenha parado por um segundo.</p>
      {err && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-danger">{err}</p>}
      <div className="mt-8"><Option icon={Keyboard} label="Digitar código" onClick={onType} /></div>
    </div>
  );
}

function TypeCode({ onCode, busy }: { onCode: (s: string) => void; busy: boolean }) {
  const [v, setV] = useState('');
  return (
    <form className="mt-6 space-y-4" onSubmit={(e) => { e.preventDefault(); onCode(v); }}>
      <label className="block text-lg text-gf-navy-80" htmlFor="code">Digite o código impresso na placa (ou a URL).</label>
      <Input id="code" autoFocus autoCapitalize="characters" autoComplete="off" placeholder="GF7K2P" value={v} onChange={(e) => setV(e.target.value.toUpperCase())}
        className="h-16 text-center font-heading text-3xl font-black tracking-[0.3em]" />
      <Button type="submit" size="lg" className="h-14 w-full text-xl" loading={busy} disabled={v.trim().length < 6}>Continuar <ArrowRight className="h-5 w-5" /></Button>
    </form>
  );
}

function PickTable({ tag, preset, onDone }: { tag: Tag; preset: string | null; onDone: (t: Table) => void }) {
  const tables = useQuery({ queryKey: qk.tables, queryFn: () => call(api.tables.list) });
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(preset);
  const [conflict, setConflict] = useState<string | null>(null);
  const table = tables.data?.find((t) => t.id === sel);
  const link = useMutation({
    mutationFn: (confirm: boolean) => call(api.tags.link, { body: { code: tag.code, tableId: sel!, confirm: confirm || undefined } }),
    onSuccess: () => { setConflict(null); onDone(table!); },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'CONFLICT') {
        const other = (e.details as { table?: TableRef } | undefined)?.table;
        return setConflict(`A placa ${tag.code} está ativa na ${other?.name ?? 'outra mesa'}. Mover para a ${table?.name}?`);
      }
      setConflict(null);
      toast.error(errMsg(e));
    },
  });
  // Placa já na mesma mesa ou mesa com outra placa: pede confirmação antes (P7-3).
  const submit = () => {
    if (table?.tag && table.tag.code !== tag.code) return setConflict(`A ${table.name} já tem a placa ${table.tag.code}. Ela será substituída pela ${tag.code}.`);
    if (tag.table && tag.table.id !== sel) return setConflict(`A placa ${tag.code} está na ${tag.table.name}. Mover para a ${table?.name}?`);
    link.mutate(false);
  };
  const list = (tables.data ?? []).filter((t) => t.active && `${t.name} ${t.area ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="mt-5 pb-24">
      <div className="flex items-center gap-3 rounded-2xl bg-green-50 px-5 py-4 font-heading text-xl font-black text-success">
        <TagIcon className="h-7 w-7" /><span className="border-l border-success/30 pl-3">Placa {tag.code} encontrada ✓</span>
      </div>
      <h2 className="mt-6 font-heading text-3xl font-black">Escolha a mesa</h2>
      <div className="relative mt-3"><Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gf-navy-80" />
        <Input placeholder="Buscar mesa" value={q} onChange={(e) => setQ(e.target.value)} className="h-12 rounded-xl bg-gf-bg pl-12" /></div>
      <ul className="mt-3 space-y-2.5" role="radiogroup" aria-label="Mesas">
        {tables.isLoading && <li className="py-6 text-center text-gf-muted">Carregando mesas…</li>}
        {list.map((t) => (
          <li key={t.id}>
            <button role="radio" aria-checked={sel === t.id} onClick={() => setSel(t.id)}
              className={cn('flex w-full items-center gap-4 rounded-2xl border px-4 py-3 text-left', sel === t.id ? 'border-gf-orange bg-gf-orange-soft' : 'border-gf-border')}>
              <Armchair className="h-7 w-7 text-gf-navy-80" />
              <span className="flex-1 border-l border-gf-border pl-4"><b className="block font-heading text-xl font-black">{t.name}</b>
                <span className="text-gf-navy-80">{t.area ?? 'Sem área'}{t.tag && ` · placa ${t.tag.code}`}</span></span>
              {sel === t.id ? <CircleCheck className="h-8 w-8 fill-gf-orange text-white" /> : <span className="h-8 w-8 rounded-full border-2 border-gf-border" />}
            </button>
          </li>
        ))}
        {tables.data && !list.length && <li className="py-6 text-center text-gf-muted">Nenhuma mesa encontrada. <Link className="text-gf-orange underline" to="/mesas/gerenciar">Criar mesas</Link></li>}
      </ul>
      <div className="fixed inset-x-0 bottom-0 bg-white/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur"><div className="mx-auto max-w-md">
        <Button size="lg" className="h-16 w-full rounded-2xl font-heading text-2xl font-black" disabled={!table} loading={link.isPending} onClick={submit}>
          {table ? `Vincular à ${table.name}` : 'Escolha uma mesa'} <ArrowRight className="h-6 w-6" />
        </Button>
      </div></div>
      <Confirm open={!!conflict} onOpenChange={() => setConflict(null)} title="Confirmar troca" description={conflict} confirmLabel="Sim, vincular" loading={link.isPending} onConfirm={() => link.mutate(true)} />
    </div>
  );
}

function Done({ tag, table, onNext }: { tag: Tag; table: Table; onNext: () => void }) {
  const n = table.name.match(/(\d+)\s*$/)?.[1];
  return (
    <div className="pt-6 text-center">
      <div className="relative mx-auto h-56 w-56">
        {[['left-6 top-4 rotate-[-30deg] bg-amber-400'], ['right-8 top-6 rotate-[35deg] bg-green-500'], ['left-0 top-16 rotate-[20deg] bg-red-300'], ['right-2 top-20 rotate-[-15deg] bg-orange-300']]
          .map(([c]) => <span key={c} className={cn('absolute h-2 w-6 rounded-full', c)} />)}
        <div className="absolute inset-x-8 bottom-6 top-10 flex flex-col items-center justify-center rounded-t-2xl border-b-8 border-gf-orange bg-white shadow-xl">
          <p className="font-heading text-2xl font-black">{n ? 'Mesa' : ''}</p>
          <p className="font-heading text-6xl font-black leading-none">{n ?? <Store className="h-14 w-14" />}</p>
        </div>
        <span className="absolute bottom-2 right-4 grid h-20 w-20 place-items-center rounded-full border-4 border-white bg-success text-white shadow-lg"><Check className="h-10 w-10" strokeWidth={3} /></span>
      </div>
      <h2 className="mt-6 font-heading text-4xl font-black">{table.name} ativada!</h2>
      <p className="mt-2 text-lg text-gf-navy-80">Teste encostando seu celular na placa.</p>
      <div className="mt-8 flex items-center gap-4 rounded-2xl bg-gf-bg p-5 text-left">
        <div className="flex-1 space-y-2">
          <p className="flex items-center gap-3 font-heading text-xl font-black"><TagIcon className="h-6 w-6" />{tag.code} → {table.name}</p>
          <p className="flex items-center gap-3 text-gf-navy-80"><Store className="h-6 w-6" />{table.area ?? 'Sem área'}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-pill bg-green-100 px-3 py-1.5 font-semibold text-success"><CircleCheck className="h-5 w-5" />Ativa</span>
      </div>
      <Button size="lg" className="mt-8 h-16 w-full rounded-2xl font-heading text-2xl font-black" onClick={onNext}>Vincular próxima placa <ArrowRight className="h-6 w-6" /></Button>
      <Link to="/placas"><Button variant="outline" size="lg" className="mt-3 h-14 w-full rounded-2xl text-xl"><List className="h-6 w-6" />Ver todas as placas</Button></Link>
    </div>
  );
}
