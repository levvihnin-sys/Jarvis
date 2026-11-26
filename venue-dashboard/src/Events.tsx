import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { INTERESTS, eventInputSchema, interestLabel, type EventInput, type InterestId, type VenueEvent } from '@ryadom/shared';
import { ApiRequestError, api, errorMessage, zodFieldErrors, type FieldErrors } from './api';
import { formatRange, fromLocalInput, toLocalInput } from './format';
import { Banner, Field, Loading, focusFirstError } from './ui';

const HOUR = 3600_000;
const MAX_INTERESTS = 5;

/** null — форма закрыта, 'new' — новое событие, иначе — редактируемое */
type Editing = null | 'new' | VenueEvent;

export function Events({ venueId }: { venueId: string }) {
  const [events, setEvents] = useState<VenueEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(() => {
    setError(null);
    api
      .events(venueId)
      .then(setEvents)
      .catch((e) => setError(errorMessage(e)));
  }, [venueId]);

  useEffect(load, [load]);
  // раз в минуту пересчитываем «идёт сейчас / прошло»
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  function saved(ev: VenueEvent) {
    setEvents((list) => {
      const rest = (list ?? []).filter((x) => x.id !== ev.id);
      return [...rest, ev].sort((a, b) => a.startsAt - b.startsAt);
    });
    setEditing(null);
    setNow(Date.now());
  }

  async function remove(ev: VenueEvent) {
    if (!window.confirm(`Удалить событие «${ev.title}»?`)) return;
    try {
      await api.deleteEvent(venueId, ev.id);
      setEvents((list) => list?.filter((x) => x.id !== ev.id) ?? null);
      if (editing !== null && editing !== 'new' && editing.id === ev.id) setEditing(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const sorted = [...(events ?? [])].sort((a, b) => a.startsAt - b.startsAt);
  const current = sorted.filter((e) => e.startsAt <= now && e.endsAt > now);
  const upcoming = sorted.filter((e) => e.startsAt > now);
  const past = sorted.filter((e) => e.endsAt <= now).reverse();

  const renderList = (list: VenueEvent[], kind: 'current' | 'upcoming' | 'past') => (
    <ul className="event-list">
      {list.map((ev) => (
        <EventCard
          key={ev.id}
          ev={ev}
          kind={kind}
          onEdit={() => setEditing(ev)}
          onDelete={() => remove(ev)}
          selected={editing !== null && editing !== 'new' && editing.id === ev.id}
        />
      ))}
    </ul>
  );

  return (
    <div className="stack">
      <div className="section-head">
        <div>
          <h2>События</h2>
          <p className="muted">Гости видят текущие и ближайшие события в приложении и на карте.</p>
        </div>
        {editing === null && (
          <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
            <span aria-hidden="true">＋</span> Новое событие
          </button>
        )}
      </div>

      {editing !== null && (
        <EventForm
          key={editing === 'new' ? 'new' : editing.id}
          venueId={venueId}
          initial={editing === 'new' ? null : editing}
          onSaved={saved}
          onCancel={() => setEditing(null)}
        />
      )}

      {error && (
        <Banner kind="error" onRetry={load}>
          {error}
        </Banner>
      )}
      {!events && !error && <Loading />}

      {events && events.length === 0 && editing === null && (
        <div className="card empty-card">
          <span className="empty-icon" aria-hidden="true">
            📅
          </span>
          <p>
            Событий пока нет. Расскажите гостям о живой музыке, турнире по настолкам или бизнес-завтраке — они увидят
            событие в приложении и на карте.
          </p>
        </div>
      )}

      {current.length > 0 && (
        <section>
          <h3 className="group-title">
            <span className="live-dot" aria-hidden="true" /> Идут сейчас
          </h3>
          {renderList(current, 'current')}
        </section>
      )}
      {upcoming.length > 0 && (
        <section>
          <h3 className="group-title">Предстоящие</h3>
          {renderList(upcoming, 'upcoming')}
        </section>
      )}
      {past.length > 0 && (
        <details className="past">
          <summary className="group-title">Прошедшие · {past.length}</summary>
          {renderList(past, 'past')}
        </details>
      )}
    </div>
  );
}

const monthShort = new Intl.DateTimeFormat('ru-RU', { month: 'short' });

function EventCard(props: {
  ev: VenueEvent;
  kind: 'current' | 'upcoming' | 'past';
  selected: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { ev, kind } = props;
  const d = new Date(ev.startsAt);
  return (
    <li className={`card event-card event-${kind}${props.selected ? ' selected' : ''}`}>
      <div className="event-date" aria-hidden="true">
        <span className="event-day">{d.getDate()}</span>
        <span className="event-month">{monthShort.format(d).replace('.', '')}</span>
      </div>
      <div className="event-body">
        <div className="event-title">
          {ev.title}
          {kind === 'current' && <span className="pill pill-live">идёт</span>}
        </div>
        <div className="event-time">{formatRange(ev.startsAt, ev.endsAt)}</div>
        {ev.description && <p className="event-desc">{ev.description}</p>}
        {ev.interests.length > 0 && (
          <div className="chips chips-static">
            {ev.interests.map((i) => (
              <span key={i} className="chip chip-small">
                {interestLabel(i)}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="event-actions">
        <button type="button" className="btn btn-small btn-secondary" onClick={props.onEdit}>
          Изменить
        </button>
        <button type="button" className="btn btn-small btn-danger-ghost" onClick={props.onDelete}>
          Удалить
        </button>
      </div>
    </li>
  );
}

function defaultStart(): number {
  const d = new Date(Date.now() + HOUR);
  d.setMinutes(0, 0, 0);
  return d.getTime();
}

function EventForm(props: {
  venueId: string;
  initial: VenueEvent | null;
  onSaved: (ev: VenueEvent) => void;
  onCancel: () => void;
}) {
  const init = props.initial;
  const start0 = init?.startsAt ?? defaultStart();
  const [title, setTitle] = useState(init?.title ?? '');
  const [description, setDescription] = useState(init?.description ?? '');
  const [starts, setStarts] = useState(toLocalInput(start0));
  const [ends, setEnds] = useState(toLocalInput(init?.endsAt ?? start0 + 2 * HOUR));
  const [interests, setInterests] = useState<InterestId[]>(init ? [...init.interests] : []);
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, []);

  function changeStart(v: string) {
    const prevStart = fromLocalInput(starts);
    const prevEnd = fromLocalInput(ends);
    const next = fromLocalInput(v);
    setStarts(v);
    // сдвигаем окончание вместе с началом, сохраняя длительность
    if (next !== null) {
      const duration = prevStart !== null && prevEnd !== null && prevEnd > prevStart ? prevEnd - prevStart : 2 * HOUR;
      setEnds(toLocalInput(next + duration));
    }
  }

  function toggle(id: InterestId) {
    setInterests((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const startsAt = fromLocalInput(starts);
    const endsAt = fromLocalInput(ends);
    const errs: FieldErrors = {};
    if (startsAt === null) errs.startsAt = 'Укажите дату и время начала';
    if (endsAt === null) errs.endsAt = 'Укажите дату и время окончания';
    const input: EventInput = {
      title: title.trim(),
      description: description.trim(),
      startsAt: startsAt ?? 0,
      endsAt: endsAt ?? 0,
      interests,
    };
    const parsed = eventInputSchema.safeParse(input);
    const all = { ...(parsed.success ? {} : zodFieldErrors(parsed.error.issues)), ...errs };
    if (Object.keys(all).length) {
      setFields(all);
      focusFirstError(ref.current);
      return;
    }
    setFields({});
    setBusy(true);
    try {
      const ev = init
        ? await api.updateEvent(props.venueId, init.id, input)
        : await api.createEvent(props.venueId, input);
      props.onSaved(ev);
    } catch (err) {
      if (err instanceof ApiRequestError) setFields(err.fields);
      setFormError(errorMessage(err));
      setBusy(false);
      focusFirstError(ref.current);
    }
  }

  return (
    <form ref={ref} className="card stack event-form" onSubmit={submit} noValidate>
      <h2 className="card-title">{init ? 'Редактирование события' : 'Новое событие'}</h2>
      <Field label="Название" htmlFor="e-title" error={fields.title}>
        <input
          id="e-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
          placeholder="Вечер настольных игр"
          aria-invalid={!!fields.title}
          autoFocus
        />
      </Field>
      <Field label="Описание" htmlFor="e-description" optional error={fields.description}>
        <textarea
          id="e-description"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={1000}
          placeholder="Приносите свои игры или берите наши. Ищем, с кем сыграть в «Каркассон»!"
        />
      </Field>
      <div className="grid-2">
        <Field label="Начало" htmlFor="e-start" error={fields.startsAt}>
          <input
            id="e-start"
            type="datetime-local"
            value={starts}
            onChange={(e) => changeStart(e.target.value)}
            aria-invalid={!!fields.startsAt}
          />
        </Field>
        <Field label="Окончание" htmlFor="e-end" error={fields.endsAt} hint="Не дольше 14 дней">
          <input
            id="e-end"
            type="datetime-local"
            value={ends}
            min={starts}
            onChange={(e) => setEnds(e.target.value)}
            aria-invalid={!!fields.endsAt}
          />
        </Field>
      </div>
      <Field
        label="Кому интересно"
        optional
        error={fields.interests}
        hint={`Подскажите гостям, кому подойдёт событие · выбрано ${interests.length} из ${MAX_INTERESTS}`}
      >
        <div className="chips" role="group" aria-label="Интересы">
          {INTERESTS.map((i) => {
            const on = interests.includes(i.id);
            return (
              <button
                key={i.id}
                type="button"
                className={`chip${on ? ' on' : ''}`}
                aria-pressed={on}
                disabled={!on && interests.length >= MAX_INTERESTS}
                onClick={() => toggle(i.id)}
              >
                <span aria-hidden="true">{i.emoji}</span> {i.label}
              </button>
            );
          })}
        </div>
      </Field>
      {formError && <Banner kind="error">{formError}</Banner>}
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Сохраняем…' : init ? 'Сохранить' : 'Создать событие'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={props.onCancel} disabled={busy}>
          Отмена
        </button>
      </div>
    </form>
  );
}
