import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { AuthProvider } from '@/auth/session';
import { useAuth } from '@/auth/use-auth';
import { Spinner } from '@/components/ui/spinner';
import { createQueryClient } from '@/lib/api/query';
import { createAppRouter } from '@/router';

export function App() {
  const [queryClient] = useState(createQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function AppRouter() {
  const auth = useAuth();
  const [router] = useState(() => createAppRouter(auth));

  // Re-run the route guards when the user signs in or out.
  useEffect(() => {
    router.update({ context: { auth } });
    void router.invalidate();
  }, [auth, router]);

  if (auth.status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center text-ink-muted">
        <Spinner size="lg" label="Loading SIMS…" />
      </div>
    );
  }
  return <RouterProvider router={router} context={{ auth }} />;
}
