import { describe, expect, it } from 'vitest';

import { fakeApi, text } from '../test/fake-api.js';
import {
  cmsAstroRedirects,
  cmsCategoryPaths,
  cmsFileEndpoint,
  cmsFilePaths,
  cmsLoader,
  type CmsLoaderContext,
  cmsMarkdownEndpoint,
  cmsMenu,
  cmsPostSlugs,
} from './index.js';

const SITE = 'https://www.stack201.com.br';

/** The Content Layer of Astro in memory. */
function context(initial: string[] = []) {
  const entries = new Map<string, Parameters<CmsLoaderContext['store']['set']>[0]>(
    initial.map((id) => [id, { id, data: {} }]),
  );
  const ctx: CmsLoaderContext = {
    store: {
      set: (entry) => {
        entries.set(entry.id, entry);
        return true;
      },
      keys: () => [...entries.keys()],
      delete: (key) => entries.delete(key),
    },
    parseData: ({ data }) => Promise.resolve(data),
    generateDigest: (data) => JSON.stringify(data).length.toString(),
    logger: { info: () => undefined },
  };
  return { ctx, entries };
}

const post = (slug: string, locale = 'pt-BR') => ({
  slug,
  locale,
  url: `${SITE}/guias/${slug}`,
  title: slug,
  html: `<h2 id="a">${slug}</h2>`,
  toc: [{ id: 'a', label: 'A', depth: 2 }],
});

describe('@stack201/cms-sdk/astro (RS-08)', () => {
  it('CS-06: the posts enter as a collection, following the pages, rendered and with the headings', async () => {
    const { client } = fakeApi({
      '/posts?limit=100': () => Response.json({ items: [{ slug: 'core-web-vitals' }], next: 'c1' }),
      '/posts?cursor=c1&limit=100': () => Response.json({ items: [{ slug: 'lcp' }], next: null }),
      '/posts/core-web-vitals': () => Response.json(post('core-web-vitals')),
      '/posts/lcp': () => Response.json(post('lcp')),
    });
    const { ctx, entries } = context(['apagado']);
    await cmsLoader(client, { collection: 'posts' }).load(ctx);

    expect([...entries.keys()].sort()).toEqual(['core-web-vitals', 'lcp']);
    const entry = entries.get('lcp');
    expect(entry?.data).toMatchObject({ title: 'lcp' });
    expect(entry?.rendered).toEqual({
      html: '<h2 id="a">lcp</h2>',
      metadata: { headings: [{ depth: 2, slug: 'a', text: 'A' }] },
    });
    expect(entry?.digest).toBeTruthy();
  });

  it('with more than one language, the id has the language; tags come as their pages', async () => {
    const { client } = fakeApi({
      '/tags?locale=pt-BR': () => Response.json([{ slug: 'google' }]),
      '/tags?locale=en': () => Response.json([{ slug: 'google' }]),
      '/tags/google?locale=pt-BR': () =>
        Response.json({ slug: 'google', name: 'Google', url: `${SITE}/tag/google` }),
      '/tags/google?locale=en': () =>
        Response.json({ slug: 'google', name: 'Google', url: `${SITE}/en/tag/google` }),
    });
    const { ctx, entries } = context();
    await cmsLoader(client, { collection: 'tags', locales: ['pt-BR', 'en'] }).load(ctx);
    expect([...entries.keys()].sort()).toEqual(['en/google', 'pt-BR/google']);
    expect(entries.get('en/google')?.rendered).toBeUndefined();
  });

  it('RS-16: categories are named by their slugPath, read with it and give the paths of [...path]', async () => {
    const category = (slug: string, slugPath: string) => ({
      slug,
      slugPath,
      name: slug,
      path: `/guias/categoria/${slugPath}`,
      url: `${SITE}/guias/categoria/${slugPath}`,
    });
    const { client, calls } = fakeApi({
      '/categories': () =>
        Response.json([category('sites', 'sites'), category('desempenho', 'sites/desempenho')]),
      '/categories/sites': () => Response.json(category('sites', 'sites')),
      '/categories/sites%2Fdesempenho': () =>
        Response.json(category('desempenho', 'sites/desempenho')),
    });
    const { ctx, entries } = context();
    await cmsLoader(client, { collection: 'categories' }).load(ctx);

    expect([...entries.keys()].sort()).toEqual(['sites', 'sites/desempenho']);
    expect(calls).toContain('/categories/sites%2Fdesempenho');
    expect(await cmsCategoryPaths(client)).toEqual([
      { params: { path: 'sites' } },
      { params: { path: 'sites/desempenho' } },
    ]);

    // With {slug}, the address has the slug alone.
    const flat = fakeApi({
      '/categories': () =>
        Response.json([
          { ...category('desempenho', 'sites/desempenho'), path: '/guias/categoria/desempenho' },
        ]),
    });
    expect(await cmsCategoryPaths(flat.client)).toEqual([{ params: { path: 'desempenho' } }]);
  });

  it('RS-17: the menus enter as a collection by their key, or one at a time', async () => {
    const menu = (key: string, locale: string) => ({
      key,
      name: key,
      description: null,
      locale,
      items: [
        {
          id: 'i1',
          label: 'Guias',
          kind: 'url',
          href: '/guias',
          url: `${SITE}/guias`,
          external: false,
          targetId: null,
          children: [],
        },
      ],
    });
    const { client } = fakeApi({
      '/menus': () => Response.json([{ key: 'principal', name: 'Principal', description: null }]),
      '/menus/principal?locale=pt-BR': () => Response.json(menu('principal', 'pt-BR')),
      '/menus/principal?locale=en': () => Response.json(menu('principal', 'en')),
    });
    const { ctx, entries } = context();
    await cmsLoader(client, { collection: 'menus', locales: ['pt-BR', 'en'] }).load(ctx);

    expect([...entries.keys()].sort()).toEqual(['en/principal', 'pt-BR/principal']);
    expect(entries.get('en/principal')?.data).toMatchObject({ locale: 'en' });
    expect(entries.get('en/principal')?.rendered).toBeUndefined();
    expect((await cmsMenu(client, 'principal', { locale: 'pt-BR' })).items[0]?.href).toBe('/guias');
  });

  it('the files as endpoints, and their static paths from the index of the CMS', async () => {
    const { client } = fakeApi({
      '/sitemap.xml': () =>
        text(
          `<sitemapindex><sitemap><loc>${SITE}/sitemaps/posts-pt-br.xml</loc></sitemap><sitemap><loc>${SITE}/sitemaps/tags-pt-br.xml</loc></sitemap></sitemapindex>`,
          'application/xml; charset=utf-8',
        ),
      '/categories': () =>
        Response.json([
          { slug: 'seo', slugPath: 'seo' },
          { slug: 'desempenho', slugPath: 'sites/desempenho' },
          { slug: 'desempenho', slugPath: 'apps/desempenho' },
        ]),
      '/tags': () => Response.json([]),
      '/posts': () => Response.json({ items: [{ slug: 'lcp' }], next: null }),
      '/resolve?path=%2Fguias%2Flcp': () =>
        Response.json({ kind: 'post', locale: 'pt-BR', slug: 'lcp' }),
      '/posts/lcp.md?locale=pt-BR': () => text('# LCP', 'text/markdown'),
    });
    expect((await cmsFileEndpoint(client)({ url: new URL(`${SITE}/sitemap.xml`) })).status).toBe(
      200,
    );
    expect(await cmsFilePaths(client, 'sitemaps')).toEqual([
      { params: { file: 'posts-pt-br.xml' } },
      { params: { file: 'tags-pt-br.xml' } },
    ]);
    expect((await cmsFilePaths(client, 'feeds')).map((p) => p.params.file)).toEqual([
      'posts.rss',
      'posts.atom',
      'posts.json',
      'category-seo.rss',
      'category-seo.atom',
      'category-seo.json',
      'category-sites.desempenho.rss',
      'category-sites.desempenho.atom',
      'category-sites.desempenho.json',
      'category-apps.desempenho.rss',
      'category-apps.desempenho.atom',
      'category-apps.desempenho.json',
    ]);
    expect(await cmsPostSlugs(client)).toEqual(['lcp']);
    const markdown = await cmsMarkdownEndpoint(client)({ url: new URL(`${SITE}/guias/lcp.md`) });
    expect(await markdown.text()).toBe('# LCP');
  });

  it('the redirects for astro.config, without the pages gone', async () => {
    const { client } = fakeApi({
      '/redirects': () =>
        Response.json([
          { from: '/guias/velho', to: '/guias/novo', status: 301 },
          { from: '/guias/saiu', to: null, status: 410 },
        ]),
    });
    expect(await cmsAstroRedirects(client)).toEqual({
      '/guias/velho': { status: 301, destination: '/guias/novo' },
    });
  });
});
