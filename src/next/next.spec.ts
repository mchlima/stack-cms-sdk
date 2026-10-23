import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { fakeApi, text } from '../test/fake-api.js';
import {
  cmsFileRoute,
  cmsMetadata,
  cmsRedirects,
  createCmsMiddleware,
  createRevalidateRoute,
} from './index.js';

const SITE = 'https://www.cliente.com.br';
const SECRET = `whsec_${Buffer.from('segredo').toString('base64')}`;

function notice(
  paths: string[],
  secret = SECRET,
  type = 'post.updated',
  data: Record<string, unknown> = {},
): Request {
  const body = JSON.stringify({ type, data, paths, urls: [] });
  const timestamp = Math.floor(Date.now() / 1000);
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const signature = createHmac('sha256', key)
    .update(`d1.${String(timestamp)}.${body}`)
    .digest('base64');
  return new Request(`${SITE}/api/cms`, {
    method: 'POST',
    body,
    headers: {
      's201-id': 'd1',
      's201-timestamp': String(timestamp),
      's201-signature': `v1,${signature}`,
    },
  });
}

describe('@stack201/cms-sdk/next (RS-07)', () => {
  it('one file route serves any file of the CMS, by the address', async () => {
    const { client } = fakeApi({ '/llms.txt': () => text('# Blog', 'text/plain; charset=utf-8') });
    const GET = cmsFileRoute(client);
    expect(await (await GET(new Request(`${SITE}/llms.txt`))).text()).toBe('# Blog');
    expect((await GET(new Request(`${SITE}/qualquer`))).status).toBe(404);
  });

  it('the middleware answers redirects, files and Markdown, and lets the rest go on', async () => {
    const { client } = fakeApi({
      '/redirects': () => Response.json([{ from: '/velho', to: '/novo', status: 308 }]),
      '/robots.txt': () => text('User-agent: *', 'text/plain; charset=utf-8'),
    });
    const middleware = createCmsMiddleware(client);
    expect((await middleware(new Request(`${SITE}/velho`)))?.status).toBe(308);
    expect(await (await middleware(new Request(`${SITE}/robots.txt`)))?.text()).toBe(
      'User-agent: *',
    );
    expect(await middleware(new Request(`${SITE}/blog/post`))).toBeUndefined();
    expect(await middleware(new Request(`${SITE}/velho`, { method: 'POST' }))).toBeUndefined();
  });

  it('CS-05: a notice of the CMS revalidates only the pages it says; a forged one is refused', async () => {
    const revalidated: string[] = [];
    const POST = createRevalidateRoute({
      secret: SECRET,
      revalidatePath: (path) => revalidated.push(path),
    });
    const ok = await POST(notice(['/blog/core-web-vitals', '/blog', '/blog']));
    expect(ok.status).toBe(200);
    expect(revalidated).toEqual(['/blog/core-web-vitals', '/blog']);

    const forged = await POST(notice(['/'], `whsec_${Buffer.from('outro').toString('base64')}`));
    expect(forged.status).toBe(401);
    expect(revalidated).toHaveLength(2);
  });

  it('redirects.updated still revalidates the paths it brings', async () => {
    const revalidated: string[] = [];
    const POST = createRevalidateRoute({
      secret: SECRET,
      revalidatePath: (path) => revalidated.push(path),
    });
    const answer = await POST(notice(['/guias/velho'], SECRET, 'redirects.updated'));
    expect(await answer.json()).toEqual({
      event: 'redirects.updated',
      revalidated: ['/guias/velho'],
    });
    expect(revalidated).toEqual(['/guias/velho']);
  });

  it('RS-17: a change of a menu revalidates the whole layout by default', async () => {
    const calls: [string, string | undefined][] = [];
    const POST = createRevalidateRoute({
      secret: SECRET,
      revalidatePath: (path, type) => calls.push([path, type]),
      alsoRevalidate: ['/blog'],
    });
    const answer = await POST(notice([], SECRET, 'menu.updated', { menuId: 'm1', key: 'topo' }));
    expect(answer.status).toBe(200);
    expect(calls).toEqual([
      ['/', 'layout'],
      ['/blog', undefined],
    ]);
  });

  it('RS-17: onMenuUpdated says what a change of a menu revalidates', async () => {
    const revalidated: string[] = [];
    const tags: string[] = [];
    const POST = createRevalidateRoute({
      secret: SECRET,
      revalidatePath: (path) => revalidated.push(path),
      onMenuUpdated: (menu) => {
        tags.push(`menu:${menu.key}`, ...(menu.previousKey ? [`menu:${menu.previousKey}`] : []));
        return menu.key === 'rodape' ? ['/contato'] : undefined;
      },
    });
    await POST(
      notice([], SECRET, 'menu.updated', { menuId: 'm1', key: 'topo', previousKey: 'principal' }),
    );
    expect(revalidated).toEqual([]);
    expect(tags).toEqual(['menu:topo', 'menu:principal']);

    const answer = await POST(notice([], SECRET, 'menu.updated', { menuId: 'm2', key: 'rodape' }));
    expect(await answer.json()).toEqual({ event: 'menu.updated', revalidated: ['/contato'] });
    expect(revalidated).toEqual(['/contato']);

    await POST(notice(['/blog/post'], SECRET));
    expect(revalidated).toEqual(['/contato', '/blog/post']);
  });

  it('the metadata of Next, and the redirects for next.config without the pages gone', async () => {
    const metadata = cmsMetadata({
      seo: {
        title: 'Post · Blog',
        description: 'Resumo.',
        canonical: `${SITE}/blog/post`,
        robots: { index: true, follow: true, content: 'index, follow' },
        ogTitle: 'Post',
        ogDescription: null,
        ogImage: null,
      },
      alternates: [{ hreflang: 'x-default', path: '/blog/post', url: `${SITE}/blog/post` }],
      type: 'article',
    });
    expect(metadata).toMatchObject({
      title: { absolute: 'Post · Blog' },
      alternates: {
        canonical: `${SITE}/blog/post`,
        languages: { 'x-default': `${SITE}/blog/post` },
      },
      openGraph: { type: 'article' },
      twitter: { card: 'summary' },
    });

    const { client } = fakeApi({
      '/redirects': () =>
        Response.json([
          { from: '/a:b', to: '/c', status: 301 },
          { from: '/saiu', to: null, status: 410 },
        ]),
    });
    expect(await cmsRedirects(client)).toEqual([
      { source: '/a\\:b', destination: '/c', statusCode: 301 },
    ]);
  });
});
