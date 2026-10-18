import type { LoginInput, SessionView } from '@sims/contracts';
import { useQueryClient } from '@tanstack/react-query';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { refreshSession, request, setSignedOutHandler } from '@/lib/api/client';
import { onSessionChange, setSession } from '@/lib/api/session-token';
import { type Auth, AuthContext, type AuthStatus } from './use-auth';

/**
 * Restores the session on load (from the refresh cookie), and keeps React in
 * step with sign-in, refresh, switching workspace and sign-out.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSessionView] = useState<SessionView | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  useEffect(() => {
    const unsubscribe = onSessionChange((next) => {
      setSessionView(next);
      setStatus(next ? 'authenticated' : 'anonymous');
    });
    setSignedOutHandler(() => {
      setSession(null);
      queryClient.clear();
    });
    void refreshSession().then((restored) => {
      if (!restored) setStatus('anonymous');
    });
    return unsubscribe;
  }, [queryClient]);

  const signIn = useCallback(async (input: LoginInput) => {
    setSession(await request('login', { body: input }));
  }, []);

  const signOut = useCallback(async () => {
    try {
      await request('logout');
    } finally {
      setSession(null);
      // Nothing from this user may remain in memory for the next one.
      queryClient.clear();
    }
  }, [queryClient]);

  const switchOrganisation = useCallback(
    async (organisationId: string) => {
      const next = await request('switchOrganisation', {
        body: { organisationId },
      });
      queryClient.clear();
      setSession(next);
    },
    [queryClient],
  );

  const value = useMemo<Auth>(
    () => ({ status, session, signIn, signOut, switchOrganisation }),
    [status, session, signIn, signOut, switchOrganisation],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
