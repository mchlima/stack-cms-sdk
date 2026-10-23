import type { SitePayload } from './types.js';

export type { SiteEvent, SitePayload } from './types.js';

/** A notice is accepted up to 5 minutes away from the clock of the site (CS-07). */
export const TOLERANCE_SECONDS = 5 * 60;

/** Why a notice was refused: answer it with a `401`. */
export class CmsWebhookError extends Error {
  constructor(
    readonly reason: 'missing_headers' | 'stale' | 'bad_signature' | 'bad_body',
    message: string,
  ) {
    super(message);
    this.name = 'CmsWebhookError';
  }
}

export interface VerifyOptions {
  /** Now, in milliseconds: for the tests. */
  now?: number;
}

type HeaderBag = Headers | Record<string, string | string[] | undefined>;

function header(headers: HeaderBag, name: string): string | null {
  if (headers instanceof Headers) {
    return headers.get(name);
  }
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

const decode = (base64: string): Uint8Array<ArrayBuffer> =>
  new Uint8Array(Array.from(atob(base64), (c) => c.charCodeAt(0)));

/** Compares in constant time, so the time taken says nothing about the signature. */
function same(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

/**
 * RS-09: checks a notice of the CMS from the raw body and the headers (`s201-id`, `s201-timestamp`,
 * `s201-signature`): HMAC-SHA256 of `<id>.<timestamp>.<body>` with the secret of the webhook (`whsec_…`).
 * Works wherever there is Web Crypto: Node 20+, Vercel, Cloudflare, Deno, Bun.
 */
export async function verifyCmsWebhookBody(
  body: string,
  headers: HeaderBag,
  secret: string,
  options: VerifyOptions = {},
): Promise<SitePayload> {
  const id = header(headers, 's201-id');
  const timestamp = header(headers, 's201-timestamp');
  const signature = header(headers, 's201-signature');
  if (!id || !timestamp || !signature || !/^\d+$/.test(timestamp)) {
    throw new CmsWebhookError(
      'missing_headers',
      'O aviso não tem os cabeçalhos s201-* da assinatura.',
    );
  }
  const now = options.now ?? Date.now();
  if (Math.abs(now / 1000 - Number(timestamp)) > TOLERANCE_SECONDS) {
    throw new CmsWebhookError('stale', 'O aviso está fora dos 5 minutos aceitos.');
  }
  const key = await crypto.subtle.importKey(
    'raw',
    decode(secret.replace(/^whsec_/, '')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const expected = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${body}`)),
  );
  const valid = signature.split(' ').some((entry) => {
    const [version, value] = entry.split(',');
    if (version !== 'v1' || !value) {
      return false;
    }
    try {
      return same(decode(value), expected);
    } catch {
      return false;
    }
  });
  if (!valid) {
    throw new CmsWebhookError('bad_signature', 'A assinatura do aviso não confere.');
  }
  try {
    return JSON.parse(body) as SitePayload;
  } catch {
    throw new CmsWebhookError('bad_body', 'O corpo do aviso não é JSON.');
  }
}

/** RS-09: the same, from the `Request` of the route that receives the notice. */
export async function verifyCmsWebhook(
  request: Request,
  secret: string,
  options: VerifyOptions = {},
): Promise<SitePayload> {
  return verifyCmsWebhookBody(await request.text(), request.headers, secret, options);
}

/**
 * What changed in a `menu.updated` notice, which brings no `paths`: the menu (`key`), its old key when
 * it was renamed (`previousKey`), whether it was deleted, and why: the menu itself was changed (`menu`), or a
 * page it shows changed name, address or went off the air (`pages`). `null` for any other notice.
 */
export interface MenuChange {
  menuId: string;
  key: string;
  previousKey: string | null;
  deleted: boolean;
  reason: 'menu' | 'pages';
}

export function menuChangeOf(event: SitePayload): MenuChange | null {
  if (event.type !== 'menu.updated') {
    return null;
  }
  const { menuId, key, previousKey, deleted, reason } = event.data;
  return {
    menuId: typeof menuId === 'string' ? menuId : '',
    key: typeof key === 'string' ? key : '',
    previousKey: typeof previousKey === 'string' ? previousKey : null,
    deleted: deleted === true,
    reason: reason === 'pages' ? 'pages' : 'menu',
  };
}
