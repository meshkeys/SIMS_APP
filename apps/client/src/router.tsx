import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import { Health } from '@sims/contracts';
import { z } from 'zod';
import { type Auth, safeRedirect } from '@/auth/use-auth';
import { AppShell } from '@/components/layout/app-shell';
import { ErrorState } from '@/components/ui/states';
import { LoginPage } from '@/features/auth/login-page';
import { ComingSoon, NotFound } from '@/features/placeholder/coming-soon';

export interface RouterContext {
  auth: Auth;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
  notFoundComponent: NotFound,
  errorComponent: ({ error, reset }) => (
    <ErrorState
      error={error}
      onRetry={reset}
      title="This page failed to load"
    />
  ),
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  validateSearch: z.object({ redirect: z.string().optional() }),
  beforeLoad: ({ context, search }) => {
    if (context.auth.status === 'authenticated') {
      throw redirect({ to: safeRedirect(search.redirect) });
    }
  },
  component: LoginPage,
});

/** Everything behind sign-in shares the shell. */
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  beforeLoad: ({ context, location }) => {
    if (context.auth.status !== 'authenticated') {
      throw redirect({
        to: '/login',
        search: { redirect: location.href === '/' ? undefined : location.href },
      });
    }
  },
  component: AppShell,
});

const screen = <Path extends string>(
  path: Path,
  title: string,
  eyebrow?: string,
) =>
  createRoute({
    getParentRoute: () => appRoute,
    path,
    component: () => <ComingSoon title={title} eyebrow={eyebrow} />,
  });

/** Each screen loads on demand, so the first visit downloads only what it shows. */
const dashboardRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  validateSearch: z.object({ elementId: z.uuid().optional().catch(undefined) }),
  component: lazyRouteComponent(
    () => import('@/features/dashboard/dashboard-page'),
    'DashboardPage',
  ),
});

/** Register filters live in the URL (the register screen uses them next). */
const initiativesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/initiatives',
  validateSearch: z.object({
    health: z.enum(Health).optional().catch(undefined),
  }),
  component: () => <ComingSoon title="Initiatives" />,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([
    dashboardRoute,
    screen('/strategy', 'Strategy map'),
    initiativesRoute,
    screen('/performance', 'KPIs & benefits realisation', 'Performance'),
    screen('/risks', 'Risks & escalations'),
    screen('/reports', 'Reports'),
    screen('/my-updates', 'My updates', 'My work'),
    screen('/admin', 'Administration', 'Settings'),
  ]),
]);

export function createAppRouter(auth: Auth) {
  return createRouter({
    routeTree,
    context: { auth },
    defaultPreload: 'intent',
    scrollRestoration: true,
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
