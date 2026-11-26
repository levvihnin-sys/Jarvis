import { Suspense, lazy, useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { VENUE_CATEGORIES, venueInputSchema, type Venue, type VenueCategory, type VenueInput } from '@ryadom/shared';
import { ApiRequestError, api, errorMessage, zodFieldErrors, type FieldErrors } from './api';
import { categoryOf } from './format';
import type { Coords } from './MapPicker';
import { Networks } from './Networks';
import { Events } from './Events';
import { Stats } from './Stats';
import { VENUE_TABS, hrefs, navigate, type VenueTab } from './routes';
import { Banner, Field, Loading, focusFirstError } from './ui';

// Leaflet грузится отдельным чанком — экран входа и списки открываются быстрее.
const MapPicker = lazy(() => import('./MapPicker').then((m) => ({ default: m.MapPicker })));

export function VenueEditor({ venueId, tab }: { venueId: string | null; tab: VenueTab }) {
  const [venue, setVenue] = useState<Venue | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!venueId) return;
    setError(null);
    api
      .venue(venueId)
      .then(setVenue)
      .catch((e) => setError(errorMessage(e)));
  }, [venueId]);

  useEffect(load, [load]);

  const back = (
    <a className="back-link" href={hrefs.list}>
      ‹ Все заведения
    </a>
  );

  if (!venueId) {
    return (
      <>
        {back}
        <div className="page-head">
          <div>
            <h1>Новое заведение</h1>
            <p className="muted">После сохранения привяжите Wi‑Fi сеть — так приложение гостей узнает заведение.</p>
          </div>
        </div>
        <VenueForm initial={null} onSaved={(v) => navigate(hrefs.venue(v.id, 'networks'))} />
      </>
    );
  }

  if (error) {
    return (
      <>
        {back}
        <Banner kind="error" onRetry={load}>
          {error}
        </Banner>
      </>
    );
  }
  if (!venue) return <Loading />;

  const cat = categoryOf(venue.category);
  return (
    <>
      {back}
      <div className="venue-head">
        <span className="venue-emoji venue-emoji-lg" aria-hidden="true">
          {cat.emoji}
        </span>
        <div className="venue-head-body">
          <h1>{venue.name}</h1>
          <p className="muted">
            {cat.label}
            {venue.address ? ` · ${venue.address}` : ''}
          </p>
        </div>
        <span className={`pill venue-head-status ${venue.published ? 'pill-success' : 'pill-muted'}`}>
          {venue.published ? 'Опубликовано' : 'Черновик'}
        </span>
      </div>

      <nav className="tabs" aria-label="Разделы заведения">
        {VENUE_TABS.map((t) => (
          <a
            key={t.id}
            href={hrefs.venue(venue.id, t.id)}
            className={`tab${t.id === tab ? ' active' : ''}`}
            aria-current={t.id === tab ? 'page' : undefined}
          >
            {t.label}
          </a>
        ))}
      </nav>

      {tab === 'profile' && (
        <VenueForm key={venue.id} initial={venue} onSaved={setVenue} onDeleted={() => navigate(hrefs.list)} />
      )}
      {tab === 'networks' && <Networks venueId={venue.id} />}
      {tab === 'events' && <Events venueId={venue.id} />}
      {tab === 'stats' && <Stats venueId={venue.id} />}
    </>
  );
}

// ── Форма профиля заведения ─────────────────────────────────────────────────

const MOVING_CATEGORIES: readonly string[] = ['train'];

function VenueForm(props: { initial: Venue | null; onSaved: (v: Venue) => void; onDeleted?: () => void }) {
  const init = props.initial;
  const [name, setName] = useState(init?.name ?? '');
  const [category, setCategory] = useState<VenueCategory>(init?.category ?? 'cafe');
  const [description, setDescription] = useState(init?.description ?? '');
  const [address, setAddress] = useState(init?.address ?? '');
  const [published, setPublished] = useState(init?.published ?? true);
  const [coords, setCoords] = useState<Coords | null>(
    init && init.lat !== null && init.lon !== null ? { lat: init.lat, lon: init.lon } : null,
  );
  const [noCoords, setNoCoords] = useState(init ? init.lat === null : false);
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  function changeCategory(c: VenueCategory) {
    setCategory(c);
    // поезд движется — точка на карте ему обычно не нужна
    if (MOVING_CATEGORIES.includes(c) && !coords) setNoCoords(true);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaved(false);
    const input: VenueInput = {
      name: name.trim(),
      category,
      description: description.trim(),
      address: address.trim(),
      published,
      lat: noCoords ? null : (coords?.lat ?? null),
      lon: noCoords ? null : (coords?.lon ?? null),
    };
    const parsed = venueInputSchema.safeParse(input);
    const errs: FieldErrors = parsed.success ? {} : zodFieldErrors(parsed.error.issues);
    if (!noCoords && !coords) errs.lat = 'Поставьте метку на карте или выберите «Без координат»';
    if (Object.keys(errs).length) {
      setFields(errs);
      setFormError('Проверьте поля');
      focusFirstError(formRef.current);
      return;
    }
    setFields({});
    setBusy(true);
    try {
      const v = init ? await api.updateVenue(init.id, input) : await api.createVenue(input);
      setSaved(true);
      props.onSaved(v);
    } catch (err) {
      if (err instanceof ApiRequestError) setFields(err.fields);
      setFormError(errorMessage(err));
      focusFirstError(formRef.current);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!init) return;
    const ok = window.confirm(
      `Удалить «${init.name}»?\n\nWi‑Fi сети, события и статистика заведения будут удалены без возможности восстановления.`,
    );
    if (!ok) return;
    setBusy(true);
    try {
      await api.deleteVenue(init.id);
      props.onDeleted?.();
    } catch (err) {
      setFormError(errorMessage(err));
      setBusy(false);
    }
  }

  const coordError = fields.lat ?? fields.lon;

  return (
    <form ref={formRef} className="stack" onSubmit={submit} noValidate>
      <section className="card stack">
        <h2 className="card-title">Основное</h2>
        <div className="grid-2">
          <Field label="Название" htmlFor="v-name" error={fields.name}>
            <input
              id="v-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="Кофейня «Зерно»"
              aria-invalid={!!fields.name}
              autoFocus={!init}
            />
          </Field>
          <Field label="Категория" htmlFor="v-category" error={fields.category}>
            <select id="v-category" value={category} onChange={(e) => changeCategory(e.target.value as VenueCategory)}>
              {VENUE_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji} {c.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field
          label="Описание"
          htmlFor="v-description"
          optional
          error={fields.description}
          hint={`Гости увидят его в приложении. ${description.length} / 1000`}
        >
          <textarea
            id="v-description"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={1000}
            placeholder="Уютная кофейня у метро: настолки по пятницам, розетки у каждого стола"
          />
        </Field>
        <Field label="Адрес" htmlFor="v-address" optional error={fields.address} hint="Как его показать гостям — улица, дом, этаж">
          <input
            id="v-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            maxLength={200}
            placeholder="Москва, ул. Пятницкая, 12"
          />
        </Field>
        <label className="switch">
          <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
          <span className="switch-track" aria-hidden="true" />
          <span>
            <b>Опубликовано</b>
            <span className="switch-hint">
              {published
                ? 'Гости видят заведение в приложении и на карте.'
                : 'Черновик: гости пока не видят заведение.'}
            </span>
          </span>
        </label>
      </section>

      <section className={`card stack${coordError ? ' has-error' : ''}`}>
        <div className="card-title-row">
          <h2 className="card-title">Место на карте</h2>
          <div className="segmented segmented-small" role="radiogroup" aria-label="Координаты">
            <button
              type="button"
              role="radio"
              aria-checked={!noCoords}
              className={!noCoords ? 'active' : ''}
              onClick={() => setNoCoords(false)}
            >
              Точка на карте
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={noCoords}
              className={noCoords ? 'active' : ''}
              onClick={() => setNoCoords(true)}
            >
              Без координат
            </button>
          </div>
        </div>
        {noCoords ? (
          <p className="muted no-coords">
            <span aria-hidden="true">🚆</span> Подходит для поездов и других заведений, которые перемещаются или не
            должны быть на карте. Гости увидят заведение, когда подключатся к его Wi‑Fi.
          </p>
        ) : (
          <Suspense fallback={<div className="map map-placeholder"><Loading label="Загружаем карту…" /></div>}>
            <MapPicker
              value={coords}
              onChange={(c) => {
                setCoords(c);
                setFields(({ lat: _lat, lon: _lon, ...rest }) => rest);
              }}
            />
          </Suspense>
        )}
        {coordError && !noCoords && <p className="field-error">{coordError}</p>}
      </section>

      {formError && <Banner kind="error">{formError}</Banner>}
      {saved && init && <Banner kind="success">Изменения сохранены</Banner>}

      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Сохраняем…' : init ? 'Сохранить изменения' : 'Создать заведение'}
        </button>
        {!init && (
          <a className="btn btn-ghost" href={hrefs.list}>
            Отмена
          </a>
        )}
        {init && (
          <button type="button" className="btn btn-danger-ghost push-right" onClick={remove} disabled={busy}>
            Удалить заведение
          </button>
        )}
      </div>
    </form>
  );
}
