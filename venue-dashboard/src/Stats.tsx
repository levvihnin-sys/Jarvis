import { useEffect, useState } from 'react';
import { INTERESTS, interestLabel, type VenueStats } from '@ryadom/shared';
import { api, errorMessage } from './api';
import { formatTime } from './format';
import { Banner, Loading } from './ui';

const POLL_MS = 10_000;

export function Stats({ venueId }: { venueId: string }) {
  const [stats, setStats] = useState<VenueStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      // во фоновой вкладке не дёргаем сервер — догоним, когда её откроют
      if (!document.hidden) {
        try {
          const s = await api.stats(venueId);
          if (cancelled) return;
          setStats(s);
          setError(null);
        } catch (e) {
          if (cancelled) return;
          setError(errorMessage(e));
        }
      }
      if (!cancelled) timer = setTimeout(tick, POLL_MS);
    };
    const onVisible = () => {
      if (!document.hidden) {
        clearTimeout(timer);
        void tick();
      }
    };
    void tick();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [venueId]);

  if (!stats) {
    return error ? <Banner kind="error">{error}</Banner> : <Loading />;
  }

  const hidden = stats.online === null;
  const entries = Object.entries(stats.interests ?? {})
    .filter((e): e is [string, number] => typeof e[1] === 'number' && e[1] > 0)
    .sort((a, b) => b[1] - a[1] || order(a[0]) - order(b[0]));
  const scale = Math.max(stats.online ?? 0, ...entries.map((e) => e[1]), 1);

  return (
    <div className="stack">
      <div className="section-head">
        <div>
          <h2>Статистика</h2>
          <p className="muted live-line">
            <span className="live-dot" aria-hidden="true" />
            Обновляется каждые 10 секунд · данные на {formatTime(stats.updatedAt, true)}
          </p>
        </div>
      </div>

      {error && <Banner kind="warn">Не удалось обновить: {error}. Показаны последние данные.</Banner>}

      <div className="stats-grid">
        <section className="card stat-hero" aria-live="polite">
          <p className="stat-label">Сейчас в сети</p>
          {hidden ? (
            <>
              <p className="stat-value stat-value-hidden">
                <span aria-hidden="true">🔒</span> &lt;&nbsp;{stats.minGroup}
              </p>
              <p className="stat-note">
                Меньше {stats.minGroup} человек — цифры скрыты ради приватности гостей
              </p>
            </>
          ) : (
            <>
              <p className="stat-value" aria-label={`Сейчас в сети: ${stats.online}`}>
                {stats.online}
              </p>
              <p className="stat-note">гости с приложением «Рядом», подключённые к Wi‑Fi заведения</p>
            </>
          )}
        </section>

        <section className="card">
          <h3 className="card-title">Что ищут гости</h3>
          {stats.interests === null ? (
            <p className="empty">
              Цели знакомства появятся, когда в сети будет хотя бы {stats.minGroup} человек.
            </p>
          ) : entries.length === 0 ? (
            <p className="empty">Гости пока не указали, чего ищут.</p>
          ) : (
            <ul className="bars">
              {entries.map(([id, count]) => (
                <li key={id} className="bar-row" title={`${interestLabel(id)}: ${count}`}>
                  <span className="bar-label">{interestLabel(id)}</span>
                  <span className="bar-track">
                    <span className="bar-fill" style={{ width: `${(count / scale) * 100}%` }} />
                  </span>
                  <span className="bar-value">{count}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <p className="muted small">
        <span aria-hidden="true">🛡️</span> Кабинет видит только обезличенные числа: кто именно в сети, мы не
        показываем. Если людей меньше {stats.minGroup}, цифры скрываются, чтобы нельзя было вычислить конкретного гостя.
      </p>
    </div>
  );
}

function order(id: string): number {
  const i = INTERESTS.findIndex((x) => x.id === id);
  return i < 0 ? INTERESTS.length : i;
}
