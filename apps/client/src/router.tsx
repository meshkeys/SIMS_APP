import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import { z } from 'zod';
import { type Auth, safeRedirect } from '@/auth/use-auth';
import { AppShell } from '@/components/layout/app-shell';
import { ErrorState } from '@/components/ui/states';
import { LoginPage } from '@/features/auth/login-page';
import { registerSearchSchema } from '@/features/initiatives/register-search';
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

const myUpdatesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/my-updates',
  // Which of the caller's updates is open, so it can be linked to.
  validateSearch: z.object({
    initiative: z.uuid().optional().catch(undefined),
  }),
  component: lazyRouteComponent(
    () => import('@/features/updates/my-updates-page'),
    'MyUpdatesPage',
  ),
});

const reviewsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/reviews',
  validateSearch: z.object({
    stage: z
      .enum(['to-verify', 'with-sponsor', 'challenged', 'approved', 'all'])
      .optional()
      .catch(undefined),
    initiative: z.uuid().optional().catch(undefined),
  }),
  component: lazyRouteComponent(
    () => import('@/features/updates/reviews-page'),
    'ReviewsPage',
  ),
});

const strategyRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/strategy',
  // The selected element is in the URL, so it can be shared.
  validateSearch: z.object({ element: z.uuid().optional().catch(undefined) }),
  component: lazyRouteComponent(
    () => import('@/features/strategy/strategy-map-page'),
    'StrategyMapPage',
  ),
});

/** Register filters live in the URL, so any view can be shared. */
const initiativesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/initiatives',
  validateSearch: registerSearchSchema,
  component: lazyRouteComponent(
    () => import('@/features/initiatives/register-page'),
    'RegisterPage',
  ),
});

const proposeRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/initiatives/new',
  component: lazyRouteComponent(
    () => import('@/features/initiatives/propose-page'),
    'ProposePage',
  ),
});

const initiativeRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/initiatives/$id',
  // The open tab is in the URL (e.g. ?tab=risks), so it can be linked to.
  validateSearch: z.object({
    tab: z
      .enum(['overview', 'milestones', 'risks', 'dependencies', 'changes'])
      .optional()
      .catch(undefined),
  }),
  component: lazyRouteComponent(
    () => import('@/features/initiative/initiative-page'),
    'InitiativePage',
  ),
});

const performanceRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/performance',
  // The year on show is in the URL, so a view can be shared.
  validateSearch: z.object({
    year: z.coerce.number().int().optional().catch(undefined),
  }),
  component: lazyRouteComponent(
    () => import('@/features/performance/performance-page'),
    'PerformancePage',
  ),
});

const kpiActualsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/performance/actuals',
  validateSearch: z.object({ period: z.uuid().optional().catch(undefined) }),
  component: lazyRouteComponent(
    () => import('@/features/performance/kpi-actuals-page'),
    'KpiActualsPage',
  ),
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([
    dashboardRoute,
    strategyRoute,
    initiativesRoute,
    proposeRoute,
    initiativeRoute,
    performanceRoute,
    kpiActualsRoute,
    screen('/risks', 'Risks & escalations'),
    screen('/reports', 'Reports'),
    myUpdatesRoute,
    reviewsRoute,
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
  /** A one-off message for the next page, e.g. "DIG-016 was submitted". */
  interface HistoryState {
    notice?: string;
  }
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
