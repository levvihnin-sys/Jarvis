import { useEffect, useState } from 'react';
import type { Account, AuthResponse } from '@ryadom/shared';
import { api, getToken, onUnauthorized, setToken } from './api';
import { Login } from './Login';
import { VenueList } from './VenueList';
import { VenueEditor } from './VenueEditor';
import { Logo } from './ui';
import { hrefs, navigate, useRoute } from './routes';

// ── Приложение ──────────────────────────────────────────────────────────────

export function App() {
  const [token, setTokenState] = useState<string | null>(getToken);
  const [account, setAccount] = useState<Account | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const route = useRoute();

  useEffect(() => {
    onUnauthorized(() => {
      setTokenState(null);
      setAccount(null);
      setNotice('Сессия закончилась — войдите снова.');
    });
    return () => onUnauthorized(null);
  }, []);

  useEffect(() => {
    if (!token || account) return;
    let cancelled = false;
    api
      .me()
      .then((a) => !cancelled && setAccount(a))
      .catch(() => {
        // 401 обработает onUnauthorized; без связи просто не покажем e-mail
      });
    return () => {
      cancelled = true;
    };
  }, [token, account]);

  function handleAuth(r: AuthResponse) {
    setToken(r.token);
    setTokenState(r.token);
    setAccount(r.account);
    setNotice(null);
  }

  function logout() {
    if (token) api.logout(token).catch(() => {});
    setToken(null);
    setTokenState(null);
    setAccount(null);
    setNotice(null);
    navigate(hrefs.list);
  }

  if (!token) return <Login notice={notice} onAuth={handleAuth} />;

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <a href={hrefs.list} className="brand">
            <Logo size={30} />
            <span className="brand-name">Рядом</span>
            <span className="brand-sub">кабинет заведения</span>
          </a>
          <div className="topbar-right">
            {account && (
              <span className="account" title={account.email}>
                {account.email}
              </span>
            )}
            <button type="button" className="btn btn-ghost btn-small" onClick={logout}>
              Выйти
            </button>
          </div>
        </div>
      </header>
      <main className="container">
        {route.page === 'list' && <VenueList />}
        {route.page === 'new' && <VenueEditor key="new" venueId={null} tab="profile" />}
        {route.page === 'venue' && <VenueEditor key={route.id} venueId={route.id} tab={route.tab} />}
      </main>
    </div>
  );
}
