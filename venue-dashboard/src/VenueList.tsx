import { useCallback, useEffect, useState } from 'react';
import type { Venue } from '@ryadom/shared';
import { api, errorMessage } from './api';
import { categoryOf } from './format';
import { hrefs } from './routes';
import { Banner, Loading } from './ui';

export function VenueList() {
  const [venues, setVenues] = useState<Venue[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api
      .venues()
      .then((v) => setVenues([...v].sort((a, b) => b.createdAt - a.createdAt)))
      .catch((e) => setError(errorMessage(e)));
  }, []);

  useEffect(load, [load]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Ваши заведения</h1>
          <p className="muted">Профиль, Wi‑Fi сети, события и живая статистика каждого заведения.</p>
        </div>
        {venues && venues.length > 0 && (
          <a className="btn btn-primary" href={hrefs.newVenue}>
            <span aria-hidden="true">＋</span> Добавить заведение
          </a>
        )}
      </div>

      {error && (
        <Banner kind="error" onRetry={load}>
          {error}
        </Banner>
      )}
      {!venues && !error && <Loading />}

      {venues && venues.length === 0 && (
        <div className="card onboarding">
          <h2>Подключите заведение за три шага</h2>
          <ol className="steps">
            <li>
              <b>Создайте профиль</b>
              <span>Название, категория и точка на карте — так гости найдут вас в приложении.</span>
            </li>
            <li>
              <b>Привяжите Wi‑Fi</b>
              <span>Откройте кабинет, находясь в сети заведения, — адрес сети подставится сам.</span>
            </li>
            <li>
              <b>Создавайте события</b>
              <span>Живая музыка, турнир по настолкам, бизнес-завтрак — гости увидят их в приложении и на карте.</span>
            </li>
          </ol>
          <a className="btn btn-primary" href={hrefs.newVenue}>
            Создать первое заведение
          </a>
        </div>
      )}

      {venues && venues.length > 0 && (
        <ul className="venue-grid">
          {venues.map((v) => {
            const cat = categoryOf(v.category);
            return (
              <li key={v.id}>
                <a className="card venue-card" href={hrefs.venue(v.id)}>
                  <span className="venue-emoji" aria-hidden="true">
                    {cat.emoji}
                  </span>
                  <span className="venue-card-body">
                    <span className="venue-card-name">{v.name}</span>
                    <span className="venue-card-meta">
                      {cat.label}
                      {v.address ? ` · ${v.address}` : ''}
                    </span>
                    <span className="venue-card-tags">
                      <span className={`pill ${v.published ? 'pill-success' : 'pill-muted'}`}>
                        {v.published ? 'Опубликовано' : 'Черновик'}
                      </span>
                      <span className="pill pill-muted">{v.lat !== null ? '📍 На карте' : 'Без координат'}</span>
                    </span>
                  </span>
                  <span className="chevron" aria-hidden="true">
                    ›
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
