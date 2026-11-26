// Мелкие общие элементы интерфейса.
import type { ReactNode } from 'react';

export function Field(props: {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string | undefined;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`field${props.error ? ' has-error' : ''}`}>
      <label className="field-label" htmlFor={props.htmlFor}>
        {props.label}
        {props.optional && <span className="field-optional">необязательно</span>}
      </label>
      {props.children}
      {props.error ? (
        <p className="field-error" role="alert">
          {props.error}
        </p>
      ) : (
        props.hint && <p className="field-hint">{props.hint}</p>
      )}
    </div>
  );
}

export function Banner(props: { kind: 'error' | 'success' | 'info' | 'warn'; children: ReactNode; onRetry?: () => void }) {
  return (
    <div className={`banner banner-${props.kind}`} role={props.kind === 'error' ? 'alert' : 'status'}>
      <div className="banner-body">{props.children}</div>
      {props.onRetry && (
        <button type="button" className="btn btn-small btn-secondary" onClick={props.onRetry}>
          Повторить
        </button>
      )}
    </div>
  );
}

export function Loading({ label = 'Загрузка…' }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <span className="spinner" aria-hidden="true" />
      {label}
    </div>
  );
}

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="logo">
      <rect width="32" height="32" rx="9" fill="var(--accent)" />
      <circle cx="12.5" cy="16" r="5" fill="#fff" />
      <circle cx="19.5" cy="16" r="5" fill="#fff" fillOpacity="0.6" />
    </svg>
  );
}

/** Прокрутить к первому полю с ошибкой и поставить в него фокус (после отрисовки ошибок). */
export function focusFirstError(form: HTMLElement | null): void {
  requestAnimationFrame(() => {
    const el = form?.querySelector<HTMLElement>('.has-error');
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (el.matches('.field')) el.querySelector<HTMLElement>('input, select, textarea')?.focus({ preventScroll: true });
  });
}
