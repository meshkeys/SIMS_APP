import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import { z } from 'zod';
import { ONBOARDING_ROLES } from '@sims/contracts';
import { type Auth, safeRedirect } from '@/auth/use-auth';
import { hasAnyRole } from '@/lib/access';
import { AppShell } from '@/components/layout/app-shell';
import { ErrorState } from '@/components/ui/states';
import { LoginPage } from '@/features/auth/login-page';
import { registerSearchSchema } from '@/features/initiatives/register-search';
import { NotFound } from '@/features/placeholder/coming-soon';

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

const signupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/signup',
  beforeLoad: ({ context }) => {
    if (context.auth.status === 'authenticated') throw redirect({ to: '/' });
  },
  component: lazyRouteComponent(
    () => import('@/features/auth/signup-page'),
    'SignupPage',
  ),
});

/** Where invitation emails link. Open whether signed in or not. */
const acceptInvitationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/accept-invitation',
  validateSearch: z.object({ token: z.string().optional().catch(undefined) }),
  component: lazyRouteComponent(
    () => import('@/features/auth/accept-invitation-page'),
    'AcceptInvitationPage',
  ),
});

/** True while the workspace is being set up by someone who can set it up. */
const mustFinishSetup = (auth: Auth) =>
  auth.session?.organisation.status === 'ONBOARDING' &&
  hasAnyRole(auth.session, ONBOARDING_ROLES);

/** Workspace set-up: its own full-screen layout, outside the shell. */
const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/setup',
  validateSearch: z.object({
    step: z.coerce.number().int().min(1).max(5).optional().catch(undefined),
  }),
  beforeLoad: ({ context, location }) => {
    if (context.auth.status !== 'authenticated') {
      throw redirect({ to: '/login', search: { redirect: location.href } });
    }
    if (!mustFinishSetup(context.auth)) throw redirect({ to: '/' });
  },
  component: lazyRouteComponent(
    () => import('@/features/setup/setup-page'),
    'SetupPage',
  ),
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
    // A new workspace opens the set-up wizard until set-up is finished.
    if (mustFinishSetup(context.auth)) throw redirect({ to: '/setup' });
  },
  component: AppShell,
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

const risksRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/risks',
  // Filters and the open escalation are in the URL, so a view can be shared.
  validateSearch: z.object({
    level: z.coerce.number().int().min(1).max(10).optional().catch(undefined),
    likelihood: z.coerce
      .number()
      .int()
      .min(1)
      .max(5)
      .optional()
      .catch(undefined),
    impact: z.coerce.number().int().min(1).max(5).optional().catch(undefined),
    escalation: z.uuid().optional().catch(undefined),
  }),
  component: lazyRouteComponent(
    () => import('@/features/escalations/escalation-centre-page'),
    'EscalationCentrePage',
  ),
});

const reportsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/reports',
  component: lazyRouteComponent(
    () => import('@/features/reports/reports-page'),
    'ReportsPage',
  ),
});

const adminRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/admin',
  // The open section is in the URL, so it can be linked to.
  validateSearch: z.object({
    section: z
      .enum([
        'organisation',
        'rules',
        'escalation',
        'cycle',
        'versions',
        'people',
        'departments',
        'audit',
      ])
      .optional()
      .catch(undefined),
  }),
  component: lazyRouteComponent(
    () => import('@/features/admin/admin-page'),
    'AdminPage',
  ),
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  signupRoute,
  acceptInvitationRoute,
  setupRoute,
  appRoute.addChildren([
    dashboardRoute,
    strategyRoute,
    initiativesRoute,
    proposeRoute,
    initiativeRoute,
    performanceRoute,
    kpiActualsRoute,
    risksRoute,
    reportsRoute,
    myUpdatesRoute,
    reviewsRoute,
    adminRoute,
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
