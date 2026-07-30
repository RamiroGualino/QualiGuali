import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { authApi } from '../api/auth.api';
import { setToken, setOnUnauthorized } from '../api/authStore';

const AuthContext = createContext(null);

const STORAGE_KEY = 'qualiguali.session';

// The JWT is session-critical, and this is a pure SPA with no
// backend-for-frontend/cookie session to fall back on — auth-service only
// ever returns a bearer token. Persisting a copy in localStorage (so a page
// refresh doesn't force a re-login) is the standard, documented trade-off
// the prompt explicitly allows for the real app (permitted outside of
// artifacts, kept to a minimum here): only { token, user } are stored,
// nothing else, and it's cleared on logout or on any 401.
function loadStoredSession() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  // Lazy initializer runs synchronously during the initial render, before
  // any effect (including descendants' first data fetches) — priming
  // authStore's token here, not only in the effect below, avoids a race
  // where a query fires with no Authorization header on page load/refresh,
  // gets a 401, and triggers a false logout via notifyUnauthorized.
  const [session, setSession] = useState(() => {
    const stored = loadStoredSession();
    setToken(stored?.token || null);
    return stored;
  });

  useEffect(() => {
    setToken(session?.token || null);
    if (session) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
      // Otherwise a different user logging in on the same browser would
      // start off with the previous user's project silently pre-selected
      // (see useCurrentProjectId).
      window.localStorage.removeItem('qualiguali.lastProjectId');
    }
  }, [session]);

  const logout = useCallback(() => setSession(null), []);

  useEffect(() => {
    setOnUnauthorized(logout);
  }, [logout]);

  const login = useCallback(async (email, password) => {
    const { token, user } = await authApi.login(email, password);
    setSession({ token, user });
  }, []);

  const value = useMemo(
    () => ({
      user: session?.user || null,
      isAuthenticated: Boolean(session?.token),
      login,
      logout,
    }),
    [session, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
