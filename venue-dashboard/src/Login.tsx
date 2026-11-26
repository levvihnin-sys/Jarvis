import { useState, type FormEvent } from 'react';
import { credentialsSchema, type AuthResponse } from '@ryadom/shared';
import { ApiRequestError, api, errorMessage, zodFieldErrors, type FieldErrors } from './api';
import { Banner, Field, Logo } from './ui';

type Mode = 'login' | 'register';

export function Login({ notice, onAuth }: { notice: string | null; onAuth: (r: AuthResponse) => void }) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  function switchMode(m: Mode) {
    setMode(m);
    setFields({});
    setFormError(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = credentialsSchema.safeParse({ email: email.trim(), password });
    if (!parsed.success) {
      setFields(zodFieldErrors(parsed.error.issues));
      return;
    }
    setFields({});
    setBusy(true);
    try {
      const res = mode === 'login' ? await api.login(parsed.data) : await api.register(parsed.data);
      onAuth(res);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setFields(err.fields);
        // если сервер не прислал ApiError, для входа 401 — это неверная пара e-mail/пароль
        setFormError(err.body.error === 'http_401' ? 'Неверный e-mail или пароль' : err.message);
      } else {
        setFormError(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <section className="auth-hero" aria-label="О кабинете">
        <div className="auth-hero-inner">
          <div className="brand brand-hero">
            <Logo size={40} />
            <span className="brand-name">Рядом</span>
          </div>
          <h1 className="auth-title">Кабинет заведения</h1>
          <p className="auth-lead">
            Гости, подключённые к вашему Wi‑Fi, находят в приложении «Рядом» собеседников в том же месте —
            в кафе, поезде или спортзале. Подключите заведение, чтобы они узнавали его и видели ваши события.
          </p>
          <ul className="auth-points">
            <li>
              <span aria-hidden="true">📶</span>
              <div>
                <b>Привяжите Wi‑Fi</b> — приложение гостя узнает заведение автоматически
              </div>
            </li>
            <li>
              <span aria-hidden="true">📅</span>
              <div>
                <b>Создавайте события</b> — гости увидят их в приложении и на карте
              </div>
            </li>
            <li>
              <span aria-hidden="true">📊</span>
              <div>
                <b>Смотрите статистику</b> — сколько людей в сети и что их интересует, без личных данных
              </div>
            </li>
          </ul>
        </div>
      </section>

      <section className="auth-panel">
        <form className="card auth-card" onSubmit={submit} noValidate>
          <div className="segmented" role="tablist" aria-label="Вход или регистрация">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              className={mode === 'login' ? 'active' : ''}
              onClick={() => switchMode('login')}
            >
              Вход
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              className={mode === 'register' ? 'active' : ''}
              onClick={() => switchMode('register')}
            >
              Регистрация
            </button>
          </div>

          <h2 className="auth-card-title">{mode === 'login' ? 'С возвращением' : 'Новый аккаунт заведения'}</h2>

          {notice && <Banner kind="info">{notice}</Banner>}
          {formError && <Banner kind="error">{formError}</Banner>}

          <Field label="E-mail" htmlFor="auth-email" error={fields.email}>
            <input
              id="auth-email"
              type="email"
              inputMode="email"
              autoComplete="username"
              placeholder="owner@example.ru"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!fields.email}
              autoFocus
            />
          </Field>

          <Field
            label="Пароль"
            htmlFor="auth-password"
            error={fields.password}
            hint={mode === 'register' ? 'Минимум 8 символов' : undefined}
          >
            <div className="input-with-action">
              <input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={!!fields.password}
              />
              <button
                type="button"
                className="input-action"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
              >
                {showPassword ? 'Скрыть' : 'Показать'}
              </button>
            </div>
          </Field>

          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Подождите…' : mode === 'login' ? 'Войти' : 'Создать аккаунт'}
          </button>

          <p className="auth-switch">
            {mode === 'login' ? (
              <>
                Ещё нет аккаунта?{' '}
                <button type="button" className="link" onClick={() => switchMode('register')}>
                  Зарегистрируйтесь
                </button>
              </>
            ) : (
              <>
                Уже зарегистрированы?{' '}
                <button type="button" className="link" onClick={() => switchMode('login')}>
                  Войдите
                </button>
              </>
            )}
          </p>
        </form>
      </section>
    </div>
  );
}
