import { lazy, Suspense, useEffect, type ComponentType, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, RouterProvider, useLocation } from 'react-router-dom';
import type { Role } from '@garfeed/shared';
import { ROLES } from '@garfeed/shared';
import { useAuth } from './lib/auth';
import { refresh } from './lib/api';
import { can } from './lib/live';
import { isStoreApp } from './lib/storeApp';
import { AdminLayout, RestaurantLayout } from './components/Layout';
import { Spinner } from './components/ui/misc';

// Uma chunk por tela: o login e o Ao vivo não baixam dnd-kit, zxing, formulários etc.
const page = <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })));
const LoginPage = page(() => import('./pages/Login'), 'LoginPage');
const SignupPage = page(() => import('./pages/Signup'), 'SignupPage');
const ForgotPasswordPage = page(() => import('./pages/Password'), 'ForgotPasswordPage');
const SetPasswordPage = page(() => import('./pages/Password'), 'SetPasswordPage');
const LivePage = page(() => import('./pages/Live'), 'LivePage');
const TablesMapPage = page(() => import('./pages/TablesMap'), 'TablesMapPage');
const TablesManagePage = page(() => import('./pages/TablesManage'), 'TablesManagePage');
const MenuPage = page(() => import('./pages/Menu'), 'MenuPage');
const ItemEditPage = page(() => import('./pages/ItemEdit'), 'ItemEditPage');
const OptionGroupsPage = page(() => import('./pages/OptionGroups'), 'OptionGroupsPage');
const LinkTagPage = page(() => import('./pages/LinkTag'), 'LinkTagPage');
const TagsPage = page(() => import('./pages/Tags'), 'TagsPage');
const TeamPage = page(() => import('./pages/Team'), 'TeamPage');
const SettingsPage = page(() => import('./pages/Settings'), 'SettingsPage');
const AdminRestaurantsPage = page(() => import('./pages/admin/Restaurants'), 'AdminRestaurantsPage');
const AdminTagBatchesPage = page(() => import('./pages/admin/TagBatches'), 'AdminTagBatchesPage');
const AdminPlansPage = page(() => import('./pages/admin/Plans'), 'AdminPlansPage');

isStoreApp(); // 1ª carga: grava se o painel abriu dentro do app da loja (o referrer do TWA some depois)

const home = (role?: Role) => (role === 'SUPERADMIN' ? '/admin/restaurantes' : '/ao-vivo');

/** Exige login e (opcionalmente) um grupo de papéis do contrato (RF-22). */
function Guard({ group, children }: { group?: keyof typeof ROLES; children: ReactNode }) {
  const user = useAuth((s) => s.user);
  const loc = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  if (group && !can(user.role, group)) return <Navigate to={home(user.role)} replace />;
  if (!group && user.role === 'SUPERADMIN') return <Navigate to={home(user.role)} replace />;
  return <>{children}</>;
}

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/cadastro', element: <SignupPage /> },
  { path: '/esqueci-senha', element: <ForgotPasswordPage /> },
  // links dos e-mails (?token=): recuperação de senha e convite/boas-vindas
  { path: '/redefinir-senha', element: <SetPasswordPage /> },
  { path: '/aceitar-convite', element: <SetPasswordPage /> },
  { path: '/placas/vincular', element: <Guard group="MANAGE"><LinkTagPage /></Guard> },
  {
    element: <Guard><RestaurantLayout /></Guard>,
    children: [
      { path: '/ao-vivo', element: <LivePage /> },
      { path: '/mesas', element: <Guard group="OPERATE"><TablesMapPage /></Guard> },
      { path: '/mesas/gerenciar', element: <Guard group="MANAGE"><TablesManagePage /></Guard> },
      { path: '/cardapio', element: <Guard group="MANAGE"><MenuPage /></Guard> },
      { path: '/cardapio/opcionais', element: <Guard group="MANAGE"><OptionGroupsPage /></Guard> },
      { path: '/cardapio/itens/:id', element: <Guard group="MANAGE"><ItemEditPage /></Guard> },
      { path: '/placas', element: <Guard group="MANAGE"><TagsPage /></Guard> },
      { path: '/equipe', element: <Guard group="OWNER"><TeamPage /></Guard> },
      { path: '/configuracoes', element: <Guard group="OWNER"><SettingsPage /></Guard> },
    ],
  },
  {
    element: <Guard group="ADMIN"><AdminLayout /></Guard>,
    children: [
      { path: '/admin/restaurantes', element: <AdminRestaurantsPage /> },
      { path: '/admin/placas', element: <AdminTagBatchesPage /> },
      { path: '/admin/planos', element: <AdminPlansPage /> },
    ],
  },
  { path: '*', element: <HomeRedirect /> },
]);

function HomeRedirect() {
  const user = useAuth((s) => s.user);
  return <Navigate to={user ? home(user.role) : '/login'} replace />;
}

export function App() {
  const ready = useAuth((s) => s.ready);
  // Restaura a sessão pelo cookie de refresh ao abrir o painel.
  useEffect(() => { void refresh(); }, []);
  if (!ready) return <Spinner />;
  return <Suspense fallback={<Spinner />}><RouterProvider router={router} /></Suspense>;
}
export { home };
