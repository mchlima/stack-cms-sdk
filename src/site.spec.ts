import { describe, expect, it } from 'vitest';

import { createRedirectMatcher, siteFile, siteMarkdown } from './site.js';
import { fakeApi, text } from './test/fake-api.js';

const SITE = 'https://www.cliente.com.br';

describe('what every site serves (RS-07, RS-08)', () => {
  it('the files of the CMS at the same paths, with their type; other paths are not files', async () => {
    const { client, calls } = fakeApi({
      '/sitemap.xml': () => text('<sitemapindex/>', 'application/xml; charset=utf-8'),
      '/feeds/posts.rss': () => text('<rss/>', 'application/rss+xml; charset=utf-8'),
    });
    const sitemap = await siteFile(client, new URL(`${SITE}/sitemap.xml`));
    expect(sitemap?.headers.get('Content-Type')).toBe('application/xml; charset=utf-8');
    expect(await sitemap?.text()).toBe('<sitemapindex/>');

    await siteFile(client, new URL(`${SITE}/feeds/posts.rss?locale=en`));
    expect(calls).toContain('/feeds/posts.rss?locale=en');

    expect(await siteFile(client, new URL(`${SITE}/blog/post`))).toBeNull();
    expect((await siteFile(client, new URL(`${SITE}/sitemaps/x-pt-br.xml`)))?.status).toBe(404);
  });

  it('the Markdown of a post at its address with .md, and 404 for what is not a post', async () => {
    const { client } = fakeApi({
      '/resolve?path=%2Fblog%2Fcore-web-vitals': () =>
        Response.json({ kind: 'post', locale: 'pt-BR', slug: 'core-web-vitals' }),
      '/resolve?path=%2Fblog': () => Response.json({ kind: 'home', locale: 'pt-BR', slug: null }),
      '/posts/core-web-vitals.md?locale=pt-BR': () => text('# Core Web Vitals', 'text/markdown'),
    });
    const markdown = await siteMarkdown(client, new URL(`${SITE}/blog/core-web-vitals.md`));
    expect(markdown?.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8');
    expect(await markdown?.text()).toBe('# Core Web Vitals');
    expect((await siteMarkdown(client, new URL(`${SITE}/blog.md`)))?.status).toBe(404);
    expect((await siteMarkdown(client, new URL(`${SITE}/nada.md`)))?.status).toBe(404);
    expect(await siteMarkdown(client, new URL(`${SITE}/blog/core-web-vitals`))).toBeNull();
  });

  it('redirects and pages gone, read once a minute', async () => {
    const { client, calls } = fakeApi({
      '/redirects': () =>
        Response.json([
          { from: '/blog/antigo', to: '/blog/novo', status: 301 },
          { from: '/blog/saiu', to: null, status: 410 },
        ]),
    });
    const redirects = createRedirectMatcher(client);
    const moved = await redirects.response(new URL(`${SITE}/blog/antigo/`), 0);
    expect(moved?.status).toBe(301);
    expect(moved?.headers.get('Location')).toBe(`${SITE}/blog/novo`);
    expect((await redirects.response(new URL(`${SITE}/blog/saiu`), 1000))?.status).toBe(410);
    expect(await redirects.response(new URL(`${SITE}/blog/outro`), 2000)).toBeNull();
    expect(calls.filter((c) => c === '/redirects')).toHaveLength(1);

    await redirects.response(new URL(`${SITE}/blog/outro`), 61_000);
    expect(calls.filter((c) => c === '/redirects')).toHaveLength(2);
  });
});
