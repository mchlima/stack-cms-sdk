import { describe, expect, it, vi } from 'vitest';

import { createCmsClient } from './client.js';
import { CmsAuthError, CmsError, CmsNotFoundError, CmsRateLimitError } from './errors.js';

const KEY = 'scms_dlv_test';

/** A fetch that answers what `answer` says and keeps what was asked. */
function fakeFetch(answer: (url: URL) => Response) {
  const calls: { url: URL; headers: Headers }[] = [];
  const fn = vi.fn((input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input);
    calls.push({ url, headers: new Headers(init?.headers) });
    return Promise.resolve(answer(url));
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

const apiError = (status: number, code: string, message: string) =>
  json({ error: { code, message, details: {} } }, status);

describe('createCmsClient (RS-03, RS-04)', () => {
  it('sends the key, uses production by default and the language of the client', async () => {
    const { fetch, calls } = fakeFetch(() => json({ items: [], next: null }));
    const cms = createCmsClient({ apiKey: KEY, locale: 'pt-BR', fetch });
    await cms.posts.list({ tag: 'google', limit: 10 });

    const [call] = calls;
    expect(call?.url.origin).toBe('https://cms-api.stack201.com.br');
    expect(call?.url.pathname).toBe('/delivery/v1/posts');
    expect(Object.fromEntries(call?.url.searchParams ?? [])).toEqual({
      tag: 'google',
      limit: '10',
      locale: 'pt-BR',
    });
    expect(call?.headers.get('Authorization')).toBe(`Bearer ${KEY}`);
  });

  it('a call can ask for another language; resolve and redirects never send one', async () => {
    const { fetch, calls } = fakeFetch(() => json({}));
    const cms = createCmsClient({
      apiKey: KEY,
      baseUrl: 'http://localhost:3301/',
      locale: 'pt-BR',
      fetch,
    });
    await cms.posts.get('core web vitals', { locale: 'en' });
    await cms.resolve('/blog/x');
    await cms.redirects();

    expect(calls.map((c) => `${c.url.pathname}${c.url.search}`)).toEqual([
      '/delivery/v1/posts/core%20web%20vitals?locale=en',
      '/delivery/v1/resolve?path=%2Fblog%2Fx',
      '/delivery/v1/redirects',
    ]);
  });

  it('the preview of a draft asks for it explicitly', async () => {
    const { fetch, calls } = fakeFetch(() => json({}));
    await createCmsClient({ apiKey: KEY, fetch }).posts.get('rascunho', { preview: true });
    expect(calls[0]?.url.searchParams.get('preview')).toBe('1');
  });

  it('CS-02: a missing page is CmsNotFoundError, a wrong key is CmsAuthError', async () => {
    const notFound = createCmsClient({
      apiKey: KEY,
      fetch: fakeFetch(() => apiError(404, 'NOT_FOUND', 'Não encontramos.')).fetch,
    });
    const missing = notFound.posts.get('nao-existe');
    await expect(missing).rejects.toBeInstanceOf(CmsNotFoundError);
    await expect(missing).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });

    const wrongKey = createCmsClient({
      apiKey: 'scms_dlv_errada',
      fetch: fakeFetch(() => apiError(401, 'UNAUTHENTICATED', 'Entre de novo.')).fetch,
    });
    await expect(wrongKey.space()).rejects.toBeInstanceOf(CmsAuthError);
  });

  it('too many requests says when to try again; other failures are CmsError', async () => {
    const limited = createCmsClient({
      apiKey: KEY,
      fetch: fakeFetch(() =>
        json({ error: { code: 'TOO_MANY_REQUESTS', message: 'Aguarde.', details: {} } }, 429, {
          'Retry-After': '12',
        }),
      ).fetch,
    });
    const error = await limited.space().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CmsRateLimitError);
    expect((error as CmsRateLimitError).retryAfter).toBe(12);

    const broken = createCmsClient({
      apiKey: KEY,
      fetch: fakeFetch(() => new Response('bad gateway', { status: 502 })).fetch,
    });
    await expect(broken.space()).rejects.toMatchObject({ status: 502, code: 'UNKNOWN' });
    await expect(broken.space()).rejects.toBeInstanceOf(CmsError);
  });

  it('request passes the ETag and tells when the copy of the site is current (RN-43)', async () => {
    const { fetch, calls } = fakeFetch((url) =>
      url.searchParams.has('fresh')
        ? json({ id: 'space' }, 200, { ETag: 'W/"1"' })
        : new Response(null, { status: 304, headers: { ETag: 'W/"1"' } }),
    );
    const cms = createCmsClient({ apiKey: KEY, fetch });
    expect(await cms.request('/space', { fresh: 1 })).toEqual({
      notModified: false,
      data: { id: 'space' },
      etag: 'W/"1"',
    });
    expect(await cms.request('/space', {}, { ifNoneMatch: 'W/"1"' })).toEqual({
      notModified: true,
      data: null,
      etag: 'W/"1"',
    });
    expect(calls[1]?.headers.get('If-None-Match')).toBe('W/"1"');
  });

  it('files come as they are, with their type', async () => {
    const { fetch } = fakeFetch(
      () =>
        new Response('# Título', { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } }),
    );
    const cms = createCmsClient({ apiKey: KEY, fetch });
    expect(await cms.posts.markdown('core-web-vitals')).toBe('# Título');
    expect(await cms.file('/llms.txt')).toMatchObject({
      body: '# Título',
      contentType: 'text/markdown; charset=utf-8',
    });
  });

  it('warns once when a preview key runs in the browser', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('window', {});
    try {
      createCmsClient({ apiKey: 'scms_prv_x', fetch: fakeFetch(() => json({})).fetch });
      createCmsClient({ apiKey: 'scms_prv_x', fetch: fakeFetch(() => json({})).fetch });
      createCmsClient({ apiKey: KEY, fetch: fakeFetch(() => json({})).fetch });
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
      warn.mockRestore();
    }
  });
});
