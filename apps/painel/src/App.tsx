import { useEffect, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, RouterProvider, useLocation } from 'react-router-dom';
import type { Role } from '@garfeed/shared';
import { ROLES } from '@garfeed/shared';
import { useAuth } from './lib/auth';
import { refresh } from './lib/api';
import { can } from './lib/live';
import { AdminLayout, RestaurantLayout } from './components/Layout';
import { Spinner } from './components/ui/misc';
import { LoginPage } from './pages/Login';
import { LivePage } from './pages/Live';
import { TablesMapPage } from './pages/TablesMap';
import { TablesManagePage } from './pages/TablesManage';
import { MenuPage } from './pages/Menu';
import { ItemEditPage } from './pages/ItemEdit';
import { OptionGroupsPage } from './pages/OptionGroups';
import { LinkTagPage } from './pages/LinkTag';
import { TagsPage } from './pages/Tags';
import { TeamPage } from './pages/Team';
import { SettingsPage } from './pages/Settings';
import { AdminRestaurantsPage } from './pages/admin/Restaurants';
import { AdminTagBatchesPage } from './pages/admin/TagBatches';

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
  return <RouterProvider router={router} />;
}
export { home };
