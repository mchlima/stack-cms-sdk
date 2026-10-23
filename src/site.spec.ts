import { describe, expect, it, vi } from 'vitest';

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

  it('the feed of a category at its address, by the slug path (RS-16)', async () => {
    const { client, calls } = fakeApi({
      '/resolve?path=%2Fguias%2Fcategoria%2Fsites%2Fdesempenho': () =>
        Response.json({ kind: 'category', locale: 'pt-BR', slug: 'sites/desempenho' }),
      '/resolve?path=%2Fguias%2Fcore-web-vitals': () =>
        Response.json({ kind: 'post', locale: 'pt-BR', slug: 'core-web-vitals' }),
      '/feeds/category-sites.desempenho.atom?locale=pt-BR': () =>
        text('<feed/>', 'application/atom+xml; charset=utf-8'),
      '/feeds/category-sites.desempenho.rss': () =>
        text('<rss/>', 'application/rss+xml; charset=utf-8'),
    });
    const atom = await siteFile(
      client,
      new URL(`${SITE}/guias/categoria/sites/desempenho/atom.xml`),
    );
    expect(atom?.headers.get('Content-Type')).toBe('application/atom+xml; charset=utf-8');
    expect(await atom?.text()).toBe('<feed/>');
    expect(await siteFile(client, new URL(`${SITE}/guias/core-web-vitals/rss.xml`))).toBeNull();
    expect(await siteFile(client, new URL(`${SITE}/nada/rss.xml`))).toBeNull();
    // What an address is stays known for a minute: a site's own feed asks the API once.
    await siteFile(client, new URL(`${SITE}/nada/rss.xml`));
    expect(calls.filter((c) => c.startsWith('/resolve?path=%2Fnada'))).toHaveLength(1);

    // The name in the API, with `.` for `/`, at the same path too.
    await siteFile(client, new URL(`${SITE}/feeds/category-sites.desempenho.rss`));
    expect(calls).toContain('/feeds/category-sites.desempenho.rss');
  });

  it('with {slug}, the feed of a subcategory by the slug path of resolve; the API out, the site goes on', async () => {
    const { client } = fakeApi({
      '/resolve?path=%2Fblog%2Fcategoria%2Fvelocidade': () =>
        Response.json({
          kind: 'category',
          locale: 'pt-BR',
          slug: 'velocidade',
          slugPath: 'desempenho/velocidade',
        }),
      '/feeds/category-desempenho.velocidade.rss?locale=pt-BR': () =>
        text('<rss/>', 'application/rss+xml; charset=utf-8'),
      '/resolve?path=%2Fblog': () => new Response('falhou', { status: 503 }),
    });
    const feed = await siteFile(client, new URL(`${SITE}/blog/categoria/velocidade/rss.xml`));
    expect(await feed?.text()).toBe('<rss/>');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await siteFile(client, new URL(`${SITE}/blog/rss.xml`))).toBeNull();
    warn.mockRestore();
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
    // The feeds of a page that moved go with it; other addresses under it do not.
    const feed = await redirects.response(new URL(`${SITE}/blog/antigo/rss.xml`), 2000);
    expect(feed?.headers.get('Location')).toBe(`${SITE}/blog/novo/rss.xml`);
    expect((await redirects.response(new URL(`${SITE}/blog/saiu/feed.json`), 2000))?.status).toBe(
      410,
    );
    expect(await redirects.response(new URL(`${SITE}/blog/antigo/outro`), 2000)).toBeNull();
    expect(calls.filter((c) => c === '/redirects')).toHaveLength(1);

    await redirects.response(new URL(`${SITE}/blog/outro`), 61_000);
    expect(calls.filter((c) => c === '/redirects')).toHaveLength(2);
  });
});
