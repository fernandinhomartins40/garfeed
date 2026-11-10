import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BarChart3, ChevronDown, Layers, LogOut, Menu, QrCode, Radio, Settings, Store, Armchair, User, Users, UtensilsCrossed, Volume2, VolumeX, WifiOff, type LucideIcon,
} from 'lucide-react';
import { ROLE_LABEL, type Role } from '@garfeed/shared';
import logoNeg from '@/assets/logo-horizontal-negativa.svg';
import { useAuth, useLive, usePrefs } from '@/lib/auth';
import { logout } from '@/lib/api';
import { can, useRealtime } from '@/lib/live';
import { audioLocked, subscribePush, unlockAudio } from '@/lib/alerts';
import { cn } from '@/lib/utils';
import { Switch } from './ui/switch';
import { Dropdown } from './ui/dropdown';
import { Sheet } from './ui/dialog';

type NavItem = { to: string; label: string; icon: LucideIcon; show: boolean; soon?: boolean; badge?: number };

function Sidebar({ items, footer }: { items: NavItem[]; footer: ReactNode }) {
  return (
    <div className="flex h-full flex-col bg-gf-navy px-3 py-6 text-white">
      <img src={logoNeg} alt="Garfeed" className="mb-8 ml-3 h-11 w-auto self-start" />
      <nav className="flex-1 space-y-1">
        {items.filter((i) => i.show).map(({ to, label, icon: Icon, soon, badge }) =>
          soon ? (
            <span key={to} aria-disabled className="flex h-12 items-center gap-3 rounded-card px-3 text-white/80">
              <Icon className="h-6 w-6" /> <span className="text-lg">{label}</span>
              <span className="rounded-pill bg-white/15 px-2 py-0.5 text-xs">em breve</span>
            </span>
          ) : (
            <NavLink key={to} to={to}
              className={({ isActive }) => cn('flex h-12 items-center gap-3 rounded-card px-3 text-lg transition-colors',
                isActive ? 'bg-gf-orange font-semibold text-white shadow-lg shadow-black/20' : 'text-white/90 hover:bg-white/10')}>
              <Icon className="h-6 w-6" />
              <span className="flex-1">{label}</span>
              {!!badge && <span className="grid h-7 min-w-7 place-items-center rounded-full bg-gf-orange px-1.5 text-sm font-bold text-white ring-2 ring-white/20">{badge}</span>}
            </NavLink>
          ))}
      </nav>
      {footer}
    </div>
  );
}

function SoundToggle() {
  const { sound, set } = usePrefs();
  return (
    <label className="mt-3 flex items-center gap-3 rounded-card border border-white/15 bg-white/5 px-3 py-2.5 text-sm">
      {sound ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
      <span className="flex-1">Som: {sound ? 'ligado' : 'desligado'}</span>
      <Switch checked={sound} onCheckedChange={(v) => { set({ sound: v }); unlockAudio(); }} aria-label="Som dos alertas" />
    </label>
  );
}

function UserBox({ title, subtitle, icon: Icon }: { title: string; subtitle: string; icon: LucideIcon }) {
  return (
    <Dropdown label="Conta" items={[{ label: 'Sair', icon: LogOut, onSelect: () => void logout() }]}
      trigger={
        <button className="flex w-full items-center gap-3 border-t border-white/15 px-2 pt-4 text-left">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/10"><Icon className="h-6 w-6" /></span>
          <span className="min-w-0 flex-1"><b className="block truncate font-heading text-lg">{title}</b><span className="text-sm text-white/80">{subtitle}</span></span>
          <ChevronDown className="h-5 w-5" />
        </button>
      } />
  );
}

function Shell({ items, footer, banners }: { items: NavItem[]; footer: ReactNode; banners?: boolean }) {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  return (
    <div className="min-h-screen bg-gf-bg">
      <aside className="fixed inset-y-0 left-0 hidden w-64 md:block"><Sidebar items={items} footer={footer} /></aside>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 bg-gf-navy px-4 md:hidden">
        <button aria-label="Abrir menu" className="text-white" onClick={() => setOpen(true)}><Menu className="h-6 w-6" /></button>
        <img src={logoNeg} alt="Garfeed" className="h-7" />
      </header>
      <Sheet open={open} onOpenChange={setOpen} title="Menu" side="left" className="max-w-[17rem] bg-gf-navy [&>button]:text-white">
        <Sidebar items={items} footer={footer} />
      </Sheet>
      <main className="md:pl-64">{banners && <Banners />}<Outlet /></main>
    </div>
  );
}

/** Banners globais: socket offline (P13) e áudio bloqueado até um gesto. */
function Banners() {
  const { connected, everConnected } = useLive();
  const sound = usePrefs((s) => s.sound);
  const [locked, setLocked] = useState(audioLocked);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const unlock = () => { unlockAudio(); setTimeout(() => setLocked(audioLocked()), 100); };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  }, []);
  // Só mostra "sem conexão" após 3 s fora do ar (evita piscar no carregamento).
  useEffect(() => {
    if (connected) { setOffline(false); return; }
    const t = setTimeout(() => setOffline(true), everConnected ? 1500 : 4000);
    return () => clearTimeout(t);
  }, [connected, everConnected]);
  return (
    <div className="sticky top-0 z-20 space-y-2 px-4 pt-3 empty:hidden md:px-8 [&:not(:empty)]:pb-1">
      {offline && (
        <div role="status" className="flex items-center gap-3 rounded-card border border-amber-200 bg-amber-100 px-4 py-3 font-semibold text-gf-navy">
          <WifiOff className="h-6 w-6 text-gf-orange" /><span className="border-l border-amber-300 pl-3">Sem conexão — tentando reconectar…</span>
        </div>
      )}
      {sound && locked && (
        <button onClick={() => { unlockAudio(); setLocked(false); }}
          className="flex w-full items-center gap-3 rounded-card border border-gf-peach bg-gf-orange-soft px-4 py-3 text-left font-semibold text-gf-navy">
          <Volume2 className="h-6 w-6 text-gf-orange" /> Toque aqui para ativar o som dos alertas
        </button>
      )}
    </div>
  );
}

export function RestaurantLayout() {
  const user = useAuth((s) => s.user)!;
  const restaurant = useAuth((s) => s.restaurant);
  const pending = useRealtime();
  // Permissão já concedida antes: renova a assinatura de Web Push deste aparelho.
  useEffect(() => { void subscribePush().catch(() => undefined); }, []);
  const r: Role = user.role;
  const items: NavItem[] = [
    { to: '/ao-vivo', label: 'Ao vivo', icon: Radio, show: true, badge: pending },
    { to: '/mesas', label: 'Mesas', icon: Armchair, show: can(r, 'OPERATE') },
    { to: '/cardapio', label: 'Cardápio', icon: UtensilsCrossed, show: can(r, 'MANAGE') },
    { to: '/placas', label: 'Placas', icon: QrCode, show: can(r, 'MANAGE') },
    { to: '/equipe', label: 'Equipe', icon: Users, show: can(r, 'OWNER') },
    { to: '/relatorios', label: 'Relatórios', icon: BarChart3, show: can(r, 'MANAGE'), soon: true },
    { to: '/configuracoes', label: 'Configurações', icon: Settings, show: can(r, 'OWNER') },
  ];
  const first = user.name.split(' ')[0];
  const sector = user.role === 'KITCHEN' && user.sector ? ` (${user.sector === 'BAR' ? 'Bar' : 'Cozinha'})` : '';
  return (
    <Shell items={items} footer={<><UserBox icon={Store} title={restaurant?.name ?? 'Restaurante'} subtitle={`${first} · ${ROLE_LABEL[r]}${sector}`} /><SoundToggle /></>} banners />
  );
}

export function AdminLayout() {
  const items: NavItem[] = [
    { to: '/admin/restaurantes', label: 'Restaurantes', icon: Store, show: true },
    { to: '/admin/placas', label: 'Placas', icon: QrCode, show: true },
    { to: '/admin/planos', label: 'Planos', icon: Layers, show: true, soon: true },
  ];
  return <Shell items={items} footer={<UserBox icon={User} title="Admin Garfeed" subtitle={useAuth.getState().user?.email ?? ''} />} />;
}
