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

/**
 * A file of the API, for the address asked, or null when the address is not one of them. The feed of a category is
 * also at the address of the category, with `rss.xml`, `atom.xml` or `feed.json` at the end, so the redirects of the
 * category cover it too.
 */
export async function siteFile(client: CmsClient, url: URL): Promise<Response | null> {
  if (!SITE_FILE.test(url.pathname)) {
    return categoryFeed(client, url);
  }
  const query = Object.fromEntries(url.searchParams);
  return fileResponse(client, url.pathname, { ...query, locale: query.locale ?? null });
}

/** The feed of a category at its address, or null when the address before the end is not a category. */
async function categoryFeed(client: CmsClient, url: URL): Promise<Response | null> {
  const [, page = '', end = ''] = CATEGORY_FEED.exec(url.pathname) ?? [];
  if (!page) {
    return null;
  }
  let resolved: Awaited<ReturnType<CmsClient['resolve']>>;
  try {
    resolved = await client.resolve(page);
  } catch (error) {
    if (error instanceof CmsNotFoundError) {
      return null;
    }
    throw error;
  }
  if (!('locale' in resolved) || resolved.kind !== 'category' || !resolved.slug) {
    return null;
  }
  const format = CATEGORY_FEEDS[end as keyof typeof CATEGORY_FEEDS];
  const name = `category-${resolved.slug.replaceAll('/', '.')}.${format}`;
  return fileResponse(client, `/feeds/${name}`, { locale: resolved.locale });
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
      return new Response(null, {
        status: redirect.status,
        headers: { Location: new URL(redirect.to, url).toString() },
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
