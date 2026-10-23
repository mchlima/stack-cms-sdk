import { errorOf } from './errors.js';
import type {
  AuthorItem,
  AuthorPage,
  CategoryItem,
  CategoryPage,
  Menu,
  MenuQuery,
  MenuSummary,
  Post,
  PostCardPage,
  PostsQuery,
  Redirect,
  ResolvedPath,
  Space,
  TagItem,
  TagPage,
  TermQuery,
} from './types.js';

export const DEFAULT_BASE_URL = 'https://cms-api.stack201.com.br';

export interface CmsClientOptions {
  /** A `delivery` key (or `preview`, to read drafts). Keep it on the server: read it from the environment. */
  apiKey: string;
  /** The API; production by default. */
  baseUrl?: string;
  /** The language of every call that does not say one; without it, the default language of the space. */
  locale?: string;
  /** Another `fetch`, such as the one of a framework with its cache. */
  fetch?: typeof fetch;
}

export interface RequestOptions {
  /** The `ETag` of a response kept by the site: a `304` answers `notModified` (RN-43 of the API). */
  ifNoneMatch?: string;
  signal?: AbortSignal;
  /** Passed to `fetch` as it is: `cache`, `next: { revalidate, tags }` and the like. */
  init?: RequestInit & Record<string, unknown>;
}

/** A JSON response, or the confirmation that the copy of the site is still the current one. */
export type CmsResponse<T> =
  | { notModified: false; data: T; etag: string | null }
  | { notModified: true; data: null; etag: string | null };

/** A file of the Delivery API: sitemap, feed, `llms.txt`, `robots.txt`, Markdown of a post. */
export interface CmsFile {
  body: string;
  contentType: string;
  etag: string | null;
}

/** `null` leaves the parameter out, even the default `locale`. */
type QueryValue = string | number | boolean | null | undefined;

let warned = false;

/** RS-03: a `preview` key reads the drafts; in the browser, anyone could take it. */
function warnInBrowser(apiKey: string): void {
  if (!warned && typeof window !== 'undefined' && apiKey.startsWith('scms_prv_')) {
    warned = true;
    console.warn(
      '[cms-sdk] Uma chave preview está sendo usada no navegador: ela lê os rascunhos. Use-a só no servidor.',
    );
  }
}

/** The client of the Delivery API (RS-03, RS-04). */
export function createCmsClient(options: CmsClientOptions) {
  const base = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  warnInBrowser(options.apiKey);

  function urlOf(path: string, query: Record<string, QueryValue> = {}): string {
    const url = new URL(`${base}/delivery/v1${path}`);
    const withLocale = {
      ...query,
      locale: query.locale === undefined ? options.locale : query.locale,
    };
    for (const [key, value] of Object.entries(withLocale)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  async function send(
    path: string,
    query: Record<string, QueryValue> | undefined,
    init: RequestOptions,
    accept: string,
  ): Promise<Response> {
    const headers = new Headers(init.init?.headers);
    headers.set('Authorization', `Bearer ${options.apiKey}`);
    headers.set('Accept', accept);
    if (init.ifNoneMatch) {
      headers.set('If-None-Match', init.ifNoneMatch);
    }
    const response = await doFetch(urlOf(path, query), {
      ...init.init,
      headers,
      signal: init.signal ?? init.init?.signal ?? null,
    });
    if (!response.ok && response.status !== 304) {
      throw await errorOf(response);
    }
    return response;
  }

  /** Any JSON route of the Delivery API, with the `ETag` (RS-04). */
  async function request<T>(
    path: string,
    query?: Record<string, QueryValue>,
    options: RequestOptions = {},
  ): Promise<CmsResponse<T>> {
    const response = await send(path, query, options, 'application/json');
    const etag = response.headers.get('ETag');
    if (response.status === 304) {
      return { notModified: true, data: null, etag };
    }
    return { notModified: false, data: (await response.json()) as T, etag };
  }

  async function get<T>(
    path: string,
    query?: Record<string, QueryValue>,
    options?: RequestOptions,
  ): Promise<T> {
    const response = await request<T>(path, query, options);
    if (response.notModified) {
      // Only when the caller sent `ifNoneMatch`, which `request` is for.
      throw new Error('[cms-sdk] 304 sem corpo: use client.request para respostas condicionais.');
    }
    return response.data;
  }

  /** A file as the API serves it, for the site to answer at the same address (RS-07, RS-08). */
  async function file(
    path: string,
    query?: Record<string, QueryValue>,
    options: RequestOptions = {},
  ): Promise<CmsFile> {
    const response = await send(path, query, options, '*/*');
    return {
      body: await response.text(),
      contentType: response.headers.get('Content-Type') ?? 'text/plain; charset=utf-8',
      etag: response.headers.get('ETag'),
    };
  }

  const slug = (value: string) => encodeURIComponent(value);
  /**
   * The `slugPath` of a category (`sites/desempenho`), or its segments as a catch-all route gives them
   * (`['sites', 'desempenho']`): each `/` goes as `%2F`, so the API sees one parameter.
   */
  const categoryRef = (value: string | readonly string[]) =>
    encodeURIComponent(
      (typeof value === 'string' ? value.split('/') : value).filter(Boolean).join('/'),
    );

  return {
    request,
    file,

    /** The space: languages, organization, SEO and the `<head>` of the home page. */
    space: (query: { locale?: string } = {}, options?: RequestOptions) =>
      get<Space>('/space', query, options),

    posts: {
      /** The newest first; with `q`, the most relevant first (RN-36 of the API). */
      list: (query: PostsQuery = {}, options?: RequestOptions) =>
        get<PostCardPage>('/posts', query, options),
      /** The whole post. `preview: true` reads the draft, only with a `preview` key. */
      get: (
        value: string,
        query: { locale?: string; preview?: boolean } = {},
        options?: RequestOptions,
      ) =>
        get<Post>(
          `/posts/${slug(value)}`,
          { locale: query.locale, preview: query.preview ? '1' : undefined },
          options,
        ),
      /** The clean Markdown of the post, for the AIs (RN-34 of the API). */
      markdown: (value: string, query: { locale?: string } = {}, options?: RequestOptions) =>
        file(`/posts/${slug(value)}.md`, query, options).then((f) => f.body),
    },

    /** The search in the text, in the language of the posts (RN-36 of the API). */
    search: (q: string, query: Omit<PostsQuery, 'q'> = {}, options?: RequestOptions) =>
      get<PostCardPage>('/posts', { ...query, q }, options),

    tags: {
      list: (query: { locale?: string } = {}, options?: RequestOptions) =>
        get<TagItem[]>('/tags', query, options),
      get: (value: string, query: TermQuery = {}, options?: RequestOptions) =>
        get<TagPage>(`/tags/${slug(value)}`, query, options),
    },

    categories: {
      list: (query: { locale?: string } = {}, options?: RequestOptions) =>
        get<CategoryItem[]>('/categories', query, options),
      /**
       * A category by its `slugPath` (`sites/desempenho`, or `['sites', 'desempenho']`), or by its slug
       * alone when only one category has it.
       */
      get: (value: string | readonly string[], query: TermQuery = {}, options?: RequestOptions) =>
        get<CategoryPage>(`/categories/${categoryRef(value)}`, query, options),
    },

    authors: {
      list: (query: { locale?: string } = {}, options?: RequestOptions) =>
        get<AuthorItem[]>('/authors', query, options),
      get: (value: string, query: TermQuery = {}, options?: RequestOptions) =>
        get<AuthorPage>(`/authors/${slug(value)}`, query, options),
    },

    menus: {
      /** The menus of the space: `key`, `name` and `description`, without the items. */
      list: (options?: RequestOptions) => get<MenuSummary[]>('/menus', { locale: null }, options),
      /** A menu with its tree of items already resolved (`href`, `url`, `external`), in a language. */
      get: (key: string, query: MenuQuery = {}, options?: RequestOptions) =>
        get<Menu>(`/menus/${slug(key)}`, query, options),
    },

    /**
     * What a path of the site is: a page, a redirect or gone (RN-31 of the API). For a category, `slug` is
     * its `slugPath`.
     */
    resolve: (path: string, options?: RequestOptions) =>
      get<ResolvedPath>('/resolve', { path, locale: null }, options),

    /** Every redirect, for the site to apply in the build or in its proxy. */
    redirects: (options?: RequestOptions) =>
      get<Redirect[]>('/redirects', { locale: null }, options),
  };
}

export type CmsClient = ReturnType<typeof createCmsClient>;
