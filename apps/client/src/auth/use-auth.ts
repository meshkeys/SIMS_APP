import type { LoginInput, SessionView } from '@sims/contracts';
import { createContext, useContext } from 'react';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

export interface Auth {
  status: AuthStatus;
  session: SessionView | null;
  signIn: (input: LoginInput) => Promise<void>;
  signOut: () => Promise<void>;
  switchOrganisation: (organisationId: string) => Promise<void>;
}

export const AuthContext = createContext<Auth | null>(null);

export function useAuth(): Auth {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('useAuth must be used inside <AuthProvider>');
  return auth;
}

/** The signed-in session; only for screens behind the sign-in guard. */
export function useSession(): SessionView {
  const { session } = useAuth();
  if (!session) throw new Error('useSession needs a signed-in user');
  return session;
}

/**
 * Where to go after signing in. Only same-site paths are accepted, so a
 * crafted link cannot send someone to another website ("open redirect").
 */
export function safeRedirect(target: unknown): string {
  return typeof target === 'string' &&
    target.startsWith('/') &&
    !target.startsWith('//') &&
    !target.startsWith('/\\') &&
    !target.startsWith('/login')
    ? target
    : '/';
}
