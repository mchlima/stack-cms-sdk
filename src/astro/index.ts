import type { CmsClient } from '../client.js';
import { siteFile, siteMarkdown } from '../site.js';
import type { AuthorPage, CategoryPage, Menu, Post, TagPage } from '../types.js';

/**
 * RS-08: Astro without depending on the `astro` package. The types below are the part of Astro these
 * helpers use (the Content Layer of Astro 5 and later, and the endpoints).
 */

interface StoredEntry {
  id: string;
  data: Record<string, unknown>;
  digest?: string | number;
  rendered?: { html: string; metadata?: Record<string, unknown> };
}

/** The part of the `LoaderContext` of Astro the loader uses. */
export interface CmsLoaderContext {
  store: {
    set(entry: StoredEntry): boolean;
    keys(): string[];
    delete(key: string): void;
  };
  parseData<T extends Record<string, unknown>>(props: { id: string; data: T }): Promise<T>;
  generateDigest(data: Record<string, unknown> | string): string;
  logger: { info(message: string): void };
}

export type CmsCollection = 'posts' | 'tags' | 'categories' | 'authors' | 'menus';

export interface CmsLoaderOptions {
  /** What the collection brings: whole posts, the pages of the tags, categories or authors, or the menus. */
  collection: CmsCollection;
  /** The languages to load; the default language of the space when not said. */
  locales?: string[];
  /** How many requests at once; 5 by default. */
  concurrency?: number;
}

type Loaded = Post | TagPage | CategoryPage | AuthorPage | Menu;

/** Runs `task` over `items`, at most `limit` at a time, keeping the order. */
async function inBatches<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * What names each entry of the collection in a language, following the pages of the list: the slug of
 * a post, tag or author, the `slugPath` of a category (`sites/desempenho`), the key of a menu.
 */
async function slugsOf(client: CmsClient, collection: CmsCollection, locale: string | undefined) {
  switch (collection) {
    case 'categories':
      return (await client.categories.list({ locale })).map((item) => item.slugPath);
    case 'menus':
      return (await client.menus.list()).map((item) => item.key);
    case 'tags':
    case 'authors':
      return (await client[collection].list({ locale })).map((item) => item.slug);
    case 'posts':
      break;
  }
  const slugs: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await client.posts.list({ locale, cursor, limit: 100 });
    slugs.push(...page.items.map((item) => item.slug));
    cursor = page.next ?? undefined;
  } while (cursor);
  return slugs;
}

/** The id of an entry: the `slugPath` of a category, the key of a menu, the slug of the rest. */
function idOf(page: Loaded): string {
  if ('key' in page) {
    return page.key;
  }
  return 'slugPath' in page ? page.slugPath : page.slug;
}

async function load(
  client: CmsClient,
  collection: CmsCollection,
  slug: string,
  locale?: string,
): Promise<Loaded> {
  switch (collection) {
    case 'posts':
      return client.posts.get(slug, { locale });
    case 'tags':
      return client.tags.get(slug, { locale });
    case 'categories':
      return client.categories.get(slug, { locale });
    case 'authors':
      return client.authors.get(slug, { locale });
    case 'menus':
      return client.menus.get(slug, { locale });
  }
}

/**
 * RS-08, CS-06: a loader of the content collections of Astro. Each entry is a whole page of the
 * Delivery API; a post also comes rendered, so `render(entry)` gives its HTML and its headings.
 *
 *   // src/content.config.ts
 *   const posts = defineCollection({ loader: cmsLoader(cms, { collection: 'posts' }) });
 *
 * With more than one language, the id is `<locale>/<slug>`; with one, the slug. A category is named
 * by its `slugPath` (`sites/desempenho`), for a `[...path]` route; a menu, by its key.
 */
export function cmsLoader(client: CmsClient, options: CmsLoaderOptions) {
  return {
    name: `stack-cms-${options.collection}`,
    async load(context: CmsLoaderContext): Promise<void> {
      const locales = options.locales ?? [undefined];
      const many = locales.length > 1;
      const kept = new Set<string>();
      for (const locale of locales) {
        const slugs = await slugsOf(client, options.collection, locale);
        const pages: Loaded[] = await inBatches(slugs, options.concurrency ?? 5, (slug) =>
          load(client, options.collection, slug, locale),
        );
        for (const page of pages) {
          const id = many && locale ? `${locale}/${idOf(page)}` : idOf(page);
          const data = await context.parseData({ id, data: page });
          context.store.set({
            id,
            data,
            digest: context.generateDigest(data),
            ...('html' in page
              ? {
                  rendered: {
                    html: page.html,
                    metadata: {
                      headings: page.toc.map((item) => ({
                        depth: item.depth,
                        slug: item.id,
                        text: item.label,
                      })),
                    },
                  },
                }
              : {}),
          });
          kept.add(id);
        }
      }
      for (const key of context.store.keys()) {
        if (!kept.has(key)) {
          context.store.delete(key);
        }
      }
      context.logger.info(`${String(kept.size)} entradas de ${options.collection} do Stack CMS`);
    },
  };
}

/** The part of the context of an endpoint of Astro these helpers use. */
export interface CmsEndpointContext {
  url: URL;
}

/**
 * RS-08: the files of the CMS as endpoints, the same for any of them (`sitemap.xml`, `sitemaps/[file]`,
 * `feeds/[file]`, `llms.txt`, `llms-full.txt`, `robots.txt`, `indexnow-key.txt`), by the address:
 *
 *   // src/pages/sitemap.xml.ts, src/pages/sitemaps/[file].ts…
 *   export const GET = cmsFileEndpoint(cms);
 */
export function cmsFileEndpoint(client: CmsClient) {
  return async ({ url }: CmsEndpointContext): Promise<Response> =>
    (await siteFile(client, url, { strict: true })) ??
    new Response('Não encontrado.', { status: 404 });
}

/** RS-08: the Markdown of a post at its address with `.md` (`src/pages/blog/[slug].md.ts`). */
export function cmsMarkdownEndpoint(client: CmsClient) {
  return async ({ url }: CmsEndpointContext): Promise<Response> =>
    (await siteMarkdown(client, url)) ?? new Response('Não encontrado.', { status: 404 });
}

/**
 * The `getStaticPaths` of the files with a name in the address, for a static site: the sitemaps listed in
 * the index of the CMS, or the feeds of the posts, of each category and of each tag.
 */
export async function cmsFilePaths(client: CmsClient, kind: 'sitemaps' | 'feeds') {
  if (kind === 'sitemaps') {
    const index = await client.file('/sitemap.xml', { locale: null });
    const names = [...index.body.matchAll(/\/sitemaps\/([a-z0-9-]+\.xml)<\/loc>/g)].map(
      (m) => m[1] ?? '',
    );
    return names.map((file) => ({ params: { file } }));
  }
  const [categories, tags] = await Promise.all([client.categories.list(), client.tags.list()]);
  // The feed of a category is named by its slug path, with `.` for `/`: `category-sites.desempenho`.
  const scopes = [
    'posts',
    ...categories.map((c) => `category-${c.slugPath.replaceAll('/', '.')}`),
    ...tags.map((t) => `tag-${t.slug}`),
  ];
  return scopes.flatMap((scope) =>
    ['rss', 'atom', 'json'].map((format) => ({ params: { file: `${scope}.${format}` } })),
  );
}

/** The slugs of the published posts, for the `getStaticPaths` of the pages and of the `.md`. */
export async function cmsPostSlugs(client: CmsClient, options: { locale?: string } = {}) {
  return slugsOf(client, 'posts', options.locale);
}

/**
 * RS-16: the `getStaticPaths` of the pages of the categories, at a route `[...path].astro`: `path` is what the
 * address of the category has after its prefix, the `slugPath` with the model `{path}` (`sites/desempenho`) or the
 * slug with `{slug}` (`desempenho`). `categories.get` takes either.
 *
 *   // src/pages/guias/categoria/[...path].astro
 *   export const getStaticPaths = () => cmsCategoryPaths(cms);
 *   const category = await cms.categories.get(Astro.params.path);
 *
 * The feeds of a category at its own address take the same paths, with `cmsFileEndpoint`:
 *
 *   // src/pages/guias/categoria/[...path]/rss.xml.ts (and atom.xml.ts, feed.json.ts)
 *   export const getStaticPaths = () => cmsCategoryPaths(cms);
 *   export const GET = cmsFileEndpoint(cms);
 */
export async function cmsCategoryPaths(client: CmsClient, options: { locale?: string } = {}) {
  const categories = await client.categories.list({ locale: options.locale });
  // Around the slug of a category at the top is what every address has (`/guias/categoria/` and, in some models,
  // `/` or `.html` after it); between them, the slug path with `{path}`, the slug with `{slug}`.
  const top = categories.find((c) => !c.slugPath.includes('/') && c.path.includes(`/${c.slug}`));
  const at = top ? top.path.lastIndexOf(`/${top.slug}`) + 1 : -1;
  const prefix = top ? top.path.slice(0, at) : '';
  const suffix = top ? top.path.slice(at + top.slug.length) : '';
  return categories.map((c) => ({
    params: {
      path:
        top && c.path.startsWith(prefix) && c.path.endsWith(suffix)
          ? c.path.slice(prefix.length, c.path.length - suffix.length)
          : c.slugPath,
    },
  }));
}

/**
 * RS-17: a menu in the build, with its tree of items already resolved (`href`, `external`, `children`):
 *
 *   // src/components/Header.astro
 *   const menu = await cmsMenu(cms, 'principal', { locale: 'pt-BR' });
 */
export function cmsMenu(client: CmsClient, key: string, options: { locale?: string } = {}) {
  return client.menus.get(key, { locale: options.locale });
}

/**
 * The redirects of the CMS for `redirects` of `astro.config`, in the build. The pages gone (`410`) stay
 * out: Astro has no `410`.
 */
export async function cmsAstroRedirects(client: CmsClient) {
  const redirects = await client.redirects();
  return Object.fromEntries(
    redirects.flatMap((r) =>
      r.to === null ? [] : [[r.from, { status: r.status as 301 | 308, destination: r.to }]],
    ),
  );
}
