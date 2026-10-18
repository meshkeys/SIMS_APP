import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router';
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

const screen = (path: string, title: string, eyebrow?: string) =>
  createRoute({
    getParentRoute: () => appRoute,
    path,
    component: () => <ComingSoon title={title} eyebrow={eyebrow} />,
  });

const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([
    screen('/', 'Strategy Execution Command Centre'),
    screen('/strategy', 'Strategy map'),
    screen('/initiatives', 'Initiatives'),
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
