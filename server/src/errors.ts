import type { ApiError } from '@ryadom/shared';
import type { z } from 'zod';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly issues?: ApiError['issues'],
  ) {
    super(message);
  }
}

export const notFound = () => new HttpError(404, 'not_found', 'Не найдено');
export const unauthorized = (m = 'Требуется вход') => new HttpError(401, 'unauthorized', m);

export function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const r = schema.safeParse(body);
  if (r.success) return r.data;
  throw new HttpError(
    400,
    'validation',
    'Проверьте заполнение полей',
    r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  );
}
