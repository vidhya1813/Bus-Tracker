import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api, getToken, setToken } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!getToken());
  const [serverConfig, setServerConfig] = useState({ googleClientId: '', demoMode: false, googleDemo: false });

  useEffect(() => {
    api('/auth/config').then(setServerConfig).catch(() => {});
    if (!getToken()) return;
    api('/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(({ token, user: u }) => {
    setToken(token);
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, loading, login, logout, serverConfig }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

/** Route guard. `roles` limits access; drivers are sent to the driver login. */
export function RequireAuth({ roles, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="page center muted">Loading…</div>;
  if (!user) {
    const loginPath = roles?.includes('driver') && !roles.includes('passenger') ? '/driver/login' : '/login';
    return <Navigate to={loginPath} replace state={{ from: location.pathname + location.search }} />;
  }
  if (roles && !roles.includes(user.role)) {
    return (
      <div className="page">
        <div className="card error-card">You don't have access to this page.</div>
      </div>
    );
  }
  return children;
}
