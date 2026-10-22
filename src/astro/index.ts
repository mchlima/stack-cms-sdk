import type { CmsClient } from '../client.js';
import { siteFile, siteMarkdown } from '../site.js';
import type { AuthorPage, CategoryPage, Post, TagPage } from '../types.js';

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

export type CmsCollection = 'posts' | 'tags' | 'categories' | 'authors';

export interface CmsLoaderOptions {
  /** What the collection brings: whole posts, or the pages of the tags, categories or authors. */
  collection: CmsCollection;
  /** The languages to load; the default language of the space when not said. */
  locales?: string[];
  /** How many requests at once; 5 by default. */
  concurrency?: number;
}

type Loaded = Post | TagPage | CategoryPage | AuthorPage;

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

/** Every slug of the collection in a language, following the pages of the list. */
async function slugsOf(client: CmsClient, collection: CmsCollection, locale: string | undefined) {
  if (collection !== 'posts') {
    const list = await client[collection].list({ locale });
    return list.map((item) => item.slug);
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
  }
}

/**
 * RS-08, CS-06: a loader of the content collections of Astro. Each entry is a whole page of the
 * Delivery API; a post also comes rendered, so `render(entry)` gives its HTML and its headings.
 *
 *   // src/content.config.ts
 *   const posts = defineCollection({ loader: cmsLoader(cms, { collection: 'posts' }) });
 *
 * With more than one language, the id is `<locale>/<slug>`; with one, the slug.
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
          const id = many && locale ? `${locale}/${page.slug}` : page.slug;
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
    (await siteFile(client, url)) ?? new Response('Não encontrado.', { status: 404 });
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
  const scopes = [
    'posts',
    ...categories.map((c) => `category-${c.slug}`),
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
