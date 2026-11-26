import { useEffect, useRef, useState } from 'react';

// ── Навигация через location.hash ───────────────────────────────────────────

export const VENUE_TABS = [
  { id: 'profile', label: 'Профиль' },
  { id: 'networks', label: 'Wi‑Fi сети' },
  { id: 'events', label: 'События' },
  { id: 'stats', label: 'Статистика' },
] as const;
export type VenueTab = (typeof VENUE_TABS)[number]['id'];

type Route = { page: 'list' } | { page: 'new' } | { page: 'venue'; id: string; tab: VenueTab };

function isTab(x: string | undefined): x is VenueTab {
  return VENUE_TABS.some((t) => t.id === x);
}

function parseHash(hash: string): Route {
  const [section, id, tab] = hash.replace(/^#\/?/, '').split('/');
  if (section === 'venues' && id === 'new') return { page: 'new' };
  if (section === 'venues' && id) {
    return { page: 'venue', id: decodeURIComponent(id), tab: isTab(tab) ? tab : 'profile' };
  }
  return { page: 'list' };
}

export const hrefs = {
  list: '#/',
  newVenue: '#/venues/new',
  venue: (id: string, tab: VenueTab = 'profile') => `#/venues/${encodeURIComponent(id)}/${tab}`,
};

export function navigate(href: string): void {
  window.location.hash = href;
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  const pageKey = useRef('');
  useEffect(() => {
    const onChange = () => {
      const next = parseHash(window.location.hash);
      const key = next.page === 'venue' ? `venue:${next.id}` : next.page;
      // переключение вкладок не сбрасывает прокрутку, переход на другую страницу — сбрасывает
      if (key !== pageKey.current) window.scrollTo(0, 0);
      pageKey.current = key;
      setRoute(next);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
