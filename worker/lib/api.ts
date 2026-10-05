import type { Context } from 'hono'
import type { ZodError } from 'zod'
import type { ApiErrorBody, ApiSuccess } from '../types'

export type AppContext = Pick<Context, 'json'>

export function ok<T>(c: AppContext, data: T, status: 200 | 201 | 202 = 200, meta?: Record<string, unknown>) {
  const body: ApiSuccess<T> = meta ? { ok: true, data, meta } : { ok: true, data }
  return c.json(body, status)
}

export function apiError(c: AppContext, status: 400 | 401 | 403 | 404 | 409 | 410 | 413 | 429 | 422 | 500 | 502 | 503, code: string, message: string, issues?: ApiErrorBody['error']['issues']) {
  const body: ApiErrorBody = { ok: false, error: { code, message, ...(issues?.length ? { issues } : {}) } }
  return c.json(body, status)
}

export function validationError(c: AppContext, error: ZodError) {
  return apiError(c, 400, 'VALIDATION_ERROR', 'Проверьте переданные данные', error.issues.map((issue) => ({
    path: issue.path.join('.') || 'body',
    message: issue.message,
  })))
}

export function rowNotFound(c: AppContext, entity: string) {
  return apiError(c, 404, 'NOT_FOUND', `${entity} не найден`)
}
