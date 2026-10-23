import type { CmsClient } from './client.js';
import { CmsNotFoundError } from './errors.js';
import type { Redirect } from './types.js';

/**
 * What every site does with the Delivery API, whatever the framework (RS-07, RS-08): the files at the
 * same paths of the API, the Markdown of each post at its address with `.md` and the redirects.
 */

/**
 * The files the site serves at the paths of the Delivery API (RN-34 of the API). The feed of a category has the slugs
 * of its parents and its own joined by `.`: `feeds/category-sites.desempenho.rss`.
 */
export const SITE_FILE =
  /^\/(?:sitemap\.xml|sitemaps\/[a-z0-9-]+\.xml|feeds\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:rss|atom|json)|llms\.txt|llms-full\.txt|robots\.txt|indexnow-key\.txt)$/;

/** The feeds of a category at its own address (`…/sites/desempenho/rss.xml`), by the end of the address. */
const CATEGORY_FEEDS = { 'rss.xml': 'rss', 'atom.xml': 'atom', 'feed.json': 'json' } as const;
const CATEGORY_FEED = /^(\/.+)\/(rss\.xml|atom\.xml|feed\.json)$/;

/** The files change with each publication; a minute in the caches is enough (RN-43 of the API). */
const FILE_CACHE = 'public, max-age=60, stale-while-revalidate=600';

const notFound = () => new Response('Não encontrado.', { status: 404 });

export interface SiteFileOptions {
  /**
   * A route made for the files (`cmsFileRoute`, `cmsFileEndpoint`): the API out of reach is an error, not "no file
   * here", so a reader of feeds gets a `5xx` and a static build fails. Off in the middleware, where the address may
   * be a route of the site (`/blog/rss.xml`) that goes on.
   */
  strict?: boolean;
}

/**
 * A file of the API, for the address asked, or null when the address is not one of them. The feed of a category is
 * also at the address of the category, with `rss.xml`, `atom.xml` or `feed.json` at the end, so the redirects of the
 * category cover it too.
 */
export async function siteFile(
  client: CmsClient,
  url: URL,
  options: SiteFileOptions = {},
): Promise<Response | null> {
  if (!SITE_FILE.test(url.pathname)) {
    return categoryFeed(client, url, options.strict ?? false);
  }
  const query = Object.fromEntries(url.searchParams);
  return fileResponse(client, url.pathname, { ...query, locale: query.locale ?? null });
}

/** What an address before `rss.xml` is, for a minute: a site's own feed (`/blog/rss.xml`) asks the API once. */
interface FeedPage {
  category: CategoryAt | null;
  until: number;
}
type FeedPages = Map<string, FeedPage>;
const FEED_PAGES = new WeakMap<CmsClient, FeedPages>();
const FEED_PAGE_TTL = 60_000;
const FEED_PAGES_MAX = 1000;
interface CategoryAt {
  slugPath: string;
  locale: string;
}

async function categoryAt(
  client: CmsClient,
  page: string,
  strict: boolean,
): Promise<CategoryAt | null> {
  const cache: FeedPages = FEED_PAGES.get(client) ?? new Map<string, FeedPage>();
  FEED_PAGES.set(client, cache);
  const known = cache.get(page);
  if (known && known.until > Date.now()) {
    return known.category;
  }
  let category: CategoryAt | null = null;
  try {
    const resolved = await client.resolve(page);
    if ('locale' in resolved && resolved.kind === 'category' && resolved.slug) {
      category = { slugPath: resolved.slugPath ?? resolved.slug, locale: resolved.locale };
    }
  } catch (error) {
    if (!(error instanceof CmsNotFoundError)) {
      if (strict) {
        throw error;
      }
      // The API out of reach does not take down a route of the site with the same end.
      console.warn(
        `[cms-sdk] Não deu para saber se ${page} é uma categoria: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }
  if (cache.size >= FEED_PAGES_MAX) {
    cache.clear();
  }
  cache.set(page, { category, until: Date.now() + FEED_PAGE_TTL });
  return category;
}

/** The feed of a category at its address, or null when the address before the end is not a category. */
async function categoryFeed(
  client: CmsClient,
  url: URL,
  strict: boolean,
): Promise<Response | null> {
  const [, page = '', end = ''] = CATEGORY_FEED.exec(url.pathname) ?? [];
  const category = page ? await categoryAt(client, page, strict) : null;
  if (!category) {
    return null;
  }
  const format = CATEGORY_FEEDS[end as keyof typeof CATEGORY_FEEDS];
  const name = `category-${category.slugPath.replaceAll('/', '.')}.${format}`;
  return fileResponse(client, `/feeds/${name}`, { locale: category.locale });
}

async function fileResponse(
  client: CmsClient,
  path: string,
  query: Record<string, string | null>,
): Promise<Response> {
  try {
    const file = await client.file(path, query);
    return new Response(file.body, {
      headers: { 'Content-Type': file.contentType, 'Cache-Control': FILE_CACHE },
    });
  } catch (error) {
    if (error instanceof CmsNotFoundError) {
      return notFound();
    }
    throw error;
  }
}

/** The clean Markdown of a post at its address with `.md`, for the AIs; null for other addresses. */
export async function siteMarkdown(client: CmsClient, url: URL): Promise<Response | null> {
  if (!url.pathname.endsWith('.md')) {
    return null;
  }
  try {
    const page = await client.resolve(url.pathname.slice(0, -3));
    if (!('locale' in page) || page.kind !== 'post' || !page.slug) {
      return notFound();
    }
    const markdown = await client.posts.markdown(page.slug, { locale: page.locale });
    return new Response(markdown, {
      headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': FILE_CACHE },
    });
  } catch (error) {
    if (error instanceof CmsNotFoundError) {
      return notFound();
    }
    throw error;
  }
}

export interface RedirectMatcherOptions {
  /** How long the list stays in memory before being read again; a minute by default. */
  ttlMs?: number;
}

/**
 * The redirects of the CMS (RN-31 of the API), read once in a while and kept in memory: a redirect, a
 * page gone (`410`) or nothing. A failure to read keeps the last list.
 */
export function createRedirectMatcher(client: CmsClient, options: RedirectMatcherOptions = {}) {
  const ttl = options.ttlMs ?? 60_000;
  let table = new Map<string, Redirect>();
  let until = 0;
  let loading: Promise<void> | null = null;

  async function refresh(now: number): Promise<void> {
    try {
      const redirects = await client.redirects();
      table = new Map(redirects.map((r) => [r.from, r]));
    } catch (error) {
      console.warn(
        `[cms-sdk] Não deu para ler os redirecionamentos: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    until = now + ttl;
  }

  return {
    async match(pathname: string, now = Date.now()): Promise<Redirect | undefined> {
      if (now >= until) {
        loading ??= refresh(now).finally(() => {
          loading = null;
        });
        await loading;
      }
      const exact = (path: string) => table.get(path) ?? table.get(path.replace(/\/+$/, '') || '/');
      const found = exact(pathname);
      if (found) {
        return found;
      }
      // The feeds of a page that moved go with it: `/antigo/rss.xml` → `/novo/rss.xml`.
      const tail = FOLLOWS_PAGE.exec(pathname);
      const page = tail && exact(pathname.slice(0, tail.index));
      if (!tail || !page) {
        return undefined;
      }
      return page.to === null ? page : { ...page, from: pathname, to: withTail(page.to, tail[0]) };
    },

    /** The answer to a redirect: the new address, or `410` for a page gone. */
    async response(url: URL, now = Date.now()): Promise<Response | null> {
      const redirect = await this.match(url.pathname, now);
      if (!redirect) {
        return null;
      }
      if (redirect.to === null) {
        return new Response('Esta página não existe mais.', {
          status: 410,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
      // The query goes along (`?locale=en` of a feed), unless the redirect has its own.
      const location = new URL(redirect.to, url);
      if (!location.search) {
        location.search = url.search;
      }
      return new Response(null, {
        status: redirect.status,
        headers: { Location: location.toString() },
      });
    },
  };
}

export type RedirectMatcher = ReturnType<typeof createRedirectMatcher>;

/** What comes after the address of a page and goes along with its redirect: its feeds. */
const FOLLOWS_PAGE = /\/(?:rss\.xml|atom\.xml|feed\.json)$/;

/** The end of an address after another, before its query: `/novo?x=1` and `/rss.xml` → `/novo/rss.xml?x=1`. */
function withTail(to: string, tail: string): string {
  const at = to.search(/[?#]/);
  const [path, rest] = at === -1 ? [to, ''] : [to.slice(0, at), to.slice(at)];
  return `${path.replace(/\/+$/, '')}${tail}${rest}`;
}
