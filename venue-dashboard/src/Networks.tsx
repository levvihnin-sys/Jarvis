import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { networkInputSchema, type NetworkInput, type VenueNetwork, type WhoAmIResponse } from '@ryadom/shared';
import { ApiRequestError, api, errorMessage, zodFieldErrors, type FieldErrors } from './api';
import { formatDate } from './format';
import { Banner, Field, Loading } from './ui';

export function Networks({ venueId }: { venueId: string }) {
  const [networks, setNetworks] = useState<VenueNetwork[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [whoami, setWhoami] = useState<WhoAmIResponse | null>(null);
  const [whoamiFailed, setWhoamiFailed] = useState(false);

  const [ssid, setSsid] = useState('');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<{ message: string; conflict: boolean } | null>(null);
  const [added, setAdded] = useState<VenueNetwork | null>(null);

  const load = useCallback(() => {
    setLoadError(null);
    api
      .networks(venueId)
      .then(setNetworks)
      .catch((e) => setLoadError(errorMessage(e)));
  }, [venueId]);

  const loadWhoami = useCallback(() => {
    setWhoamiFailed(false);
    api
      .whoami()
      .then(setWhoami)
      .catch(() => setWhoamiFailed(true));
  }, []);

  useEffect(load, [load]);
  useEffect(loadWhoami, [loadWhoami]);

  const here = whoami?.networkKey ?? null;
  const currentBound = !!here && !!networks?.some((n) => n.networkKey === here);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setAdded(null);
    const input: NetworkInput = { ssid: ssid.trim() || null, address: address.trim() || null };
    const parsed = networkInputSchema.safeParse(input);
    if (!parsed.success) {
      setFields(zodFieldErrors(parsed.error.issues));
      return;
    }
    setFields({});
    setBusy(true);
    try {
      const n = await api.addNetwork(venueId, parsed.data);
      setNetworks((list) => [...(list ?? []), n]);
      setAdded(n);
      setSsid('');
      setAddress('');
    } catch (err) {
      if (err instanceof ApiRequestError) setFields(err.fields);
      setFormError({
        message: errorMessage(err),
        conflict: err instanceof ApiRequestError && err.status === 409,
      });
    } finally {
      setBusy(false);
    }
  }

  async function remove(n: VenueNetwork) {
    const name = n.ssid ? `«${n.ssid}» (${n.addressLabel})` : n.addressLabel;
    if (!window.confirm(`Отвязать сеть ${name}?\n\nГости из этой сети перестанут видеть заведение.`)) return;
    try {
      await api.deleteNetwork(venueId, n.id);
      setNetworks((list) => list?.filter((x) => x.id !== n.id) ?? null);
      if (added?.id === n.id) setAdded(null);
    } catch (err) {
      setLoadError(errorMessage(err));
    }
  }

  return (
    <div className="stack">
      <section className="callout">
        <span className="callout-icon" aria-hidden="true">
          📶
        </span>
        <div className="callout-body">
          <h2>Как привязать Wi‑Fi заведения</h2>
          <p className="callout-main">
            Откройте кабинет, находясь в Wi‑Fi заведения, и оставьте адрес пустым — сервер подставит его сам.
          </p>
          <p className="muted">
            Телефоны гостей в этой сети выходят в интернет через тот же адрес, поэтому приложение «Рядом» поймёт, что
            они у вас.
          </p>
          <div className="whoami">
            {whoami ? (
              <>
                Сейчас вы подключены через:{' '}
                <b className="mono">{whoami.addressLabel ?? 'адрес не определён'}</b>
                {currentBound && <span className="pill pill-success">уже привязана к этому заведению</span>}
              </>
            ) : whoamiFailed ? (
              <>
                Не удалось узнать ваш текущий адрес.{' '}
                <button type="button" className="link" onClick={loadWhoami}>
                  Повторить
                </button>
              </>
            ) : (
              'Определяем ваш текущий адрес…'
            )}
          </div>
        </div>
      </section>

      <form className="card stack" onSubmit={submit} noValidate>
        <h2 className="card-title">Добавить сеть</h2>
        <div className="grid-2">
          <Field
            label="Название сети (SSID)"
            htmlFor="n-ssid"
            optional
            error={fields.ssid}
            hint="Если указать, гости из другой сети за тем же адресом (например, «Staff») не будут считаться вашими гостями."
          >
            <input
              id="n-ssid"
              value={ssid}
              onChange={(e) => setSsid(e.target.value)}
              maxLength={32}
              placeholder="Например, Zerno_Guest"
              autoComplete="off"
            />
          </Field>
          <Field
            label="Адрес сети"
            htmlFor="n-address"
            optional
            error={fields.address}
            hint="Оставьте пустым, если вы сейчас в Wi‑Fi заведения. Иначе — IP или префикс: 203.0.113.7, 2001:db8:1:2::/64"
          >
            <input
              id="n-address"
              className="mono"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              maxLength={64}
              placeholder={whoami?.addressLabel ? `Пусто = ${whoami.addressLabel}` : 'Пусто = текущий адрес'}
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
        </div>
        {formError && (
          <Banner kind="error">
            {formError.message}
            {formError.conflict && (
              <p className="banner-note">
                Одна сеть может принадлежать только одному заведению. Если это сеть другого вашего заведения — сначала
                отвяжите её там.
              </p>
            )}
          </Banner>
        )}
        {added && (
          <Banner kind="success">
            Сеть {added.ssid ? `«${added.ssid}» ` : ''}
            <span className="mono">{added.addressLabel}</span> привязана. Гости в ней теперь видят заведение.
          </Banner>
        )}
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Привязываем…' : address.trim() ? 'Привязать сеть' : 'Привязать текущую сеть'}
          </button>
        </div>
      </form>

      <section className="card">
        <h2 className="card-title">
          Привязанные сети{networks && networks.length > 0 ? <span className="count">{networks.length}</span> : null}
        </h2>
        {loadError && (
          <Banner kind="error" onRetry={load}>
            {loadError}
          </Banner>
        )}
        {!networks && !loadError && <Loading />}
        {networks && networks.length === 0 && (
          <p className="empty">Пока нет ни одной сети — приложение гостей не узнает заведение по Wi‑Fi.</p>
        )}
        {networks && networks.length > 0 && (
          <ul className="rows">
            {networks.map((n) => (
              <li key={n.id} className="row">
                <span className="row-icon" aria-hidden="true">
                  📶
                </span>
                <div className="row-body">
                  <div className="row-title">
                    {n.ssid ? n.ssid : <span className="muted-italic">любой SSID</span>}
                    {here === n.networkKey && <span className="pill pill-accent">вы здесь</span>}
                  </div>
                  <div className="row-meta">
                    <span className="mono">{n.addressLabel}</span> · добавлена {formatDate(n.createdAt)}
                  </div>
                </div>
                <button type="button" className="btn btn-small btn-danger-ghost" onClick={() => remove(n)}>
                  Удалить
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
