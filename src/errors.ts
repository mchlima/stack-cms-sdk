import type { ApiErrorBody, ErrorCode } from './types.js';

/** An answer of the API that is not a success, with the code and the message of the API (pt-BR). */
export class CmsError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'UNKNOWN',
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'CmsError';
  }
}

/** Nothing at that address, or a language the space does not have (CS-02). */
export class CmsNotFoundError extends CmsError {
  override name = 'CmsNotFoundError';
}

/** The key is missing, wrong, revoked, or not allowed here (a `delivery` key asking for a draft). */
export class CmsAuthError extends CmsError {
  override name = 'CmsAuthError';
}

/** Too many requests: try again after `retryAfter` seconds (RN-44 of the API). */
export class CmsRateLimitError extends CmsError {
  override name = 'CmsRateLimitError';

  constructor(
    status: number,
    code: ErrorCode | 'UNKNOWN',
    message: string,
    details: Record<string, unknown>,
    readonly retryAfter: number | null,
  ) {
    super(status, code, message, details);
  }
}

/** The error of a response, from the body of the API when it has one. */
export async function errorOf(response: Response): Promise<CmsError> {
  const body = (await response.json().catch(() => null)) as Partial<ApiErrorBody> | null;
  const code = body?.error?.code ?? 'UNKNOWN';
  const message = body?.error?.message ?? `A API do CMS respondeu ${String(response.status)}.`;
  const details = body?.error?.details ?? {};
  switch (response.status) {
    case 404:
      return new CmsNotFoundError(404, code, message, details);
    case 401:
    case 403:
      return new CmsAuthError(response.status, code, message, details);
    case 429: {
      const retryAfter = Number(response.headers.get('Retry-After'));
      return new CmsRateLimitError(
        429,
        code,
        message,
        details,
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
      );
    }
    default:
      return new CmsError(response.status, code, message, details);
  }
}
