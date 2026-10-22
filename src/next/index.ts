import type { CmsClient } from '../client.js';
import type { HeadInput } from '../head.js';
import { createRedirectMatcher, siteFile, siteMarkdown } from '../site.js';
import type { Redirect } from '../types.js';
import { CmsWebhookError, verifyCmsWebhook } from '../webhooks.js';

/**
 * RS-07: Next (App Router) without depending on the `next` package: the helpers take and give the
 * `Request` and `Response` of the web, and the revalidation gets `revalidatePath` from the site.
 */

/**
 * The files of the CMS as routes of the site (`sitemap.xml`, `sitemaps/…`, `feeds/…`, `llms.txt`,
 * `llms-full.txt`, `robots.txt`, `indexnow-key.txt`). The same handler serves any of them, by the address:
 *
 *   // app/sitemap.xml/route.ts, app/sitemaps/[file]/route.ts, app/feeds/[file]/route.ts…
 *   export const GET = cmsFileRoute(cms);
 */
export function cmsFileRoute(client: CmsClient) {
  return async (request: Request): Promise<Response> =>
    (await siteFile(client, new URL(request.url))) ??
    new Response('Não encontrado.', { status: 404 });
}

export interface CmsMiddlewareOptions {
  /** The redirects of the CMS (`301`, `308`, `410`); on by default. */
  redirects?: boolean;
  /** The files of the CMS at their paths, without route files; on by default. */
  files?: boolean;
  /** The Markdown of each post at its address with `.md`; on by default. */
  markdown?: boolean;
  /** How long the redirects stay in memory; a minute by default. */
  ttlMs?: number;
}

/**
 * RS-07: for the `middleware.ts` (or `proxy.ts`) of the site. Answers what is of the CMS and gives
 * `undefined` for the rest, which goes on to the site:
 *
 *   const cmsMiddleware = createCmsMiddleware(cms);
 *   export async function middleware(request: NextRequest) {
 *     return (await cmsMiddleware(request)) ?? NextResponse.next();
 *   }
 */
export function createCmsMiddleware(client: CmsClient, options: CmsMiddlewareOptions = {}) {
  const redirects = createRedirectMatcher(client, { ttlMs: options.ttlMs });
  return async (request: Request): Promise<Response | undefined> => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return undefined;
    }
    const url = new URL(request.url);
    if (options.redirects !== false) {
      const answer = await redirects.response(url);
      if (answer) {
        return answer;
      }
    }
    if (options.files !== false) {
      const file = await siteFile(client, url);
      if (file) {
        return file;
      }
    }
    if (options.markdown !== false) {
      const markdown = await siteMarkdown(client, url);
      if (markdown) {
        return markdown;
      }
    }
    return undefined;
  };
}

export interface RevalidateRouteOptions {
  /** The secret of the webhook in the CMS (`whsec_…`), from the environment. */
  secret: string;
  /** `revalidatePath` of `next/cache`. */
  revalidatePath: (path: string) => void;
  /** Paths revalidated on every notice, besides the ones the CMS says (a listing of the site, say). */
  alsoRevalidate?: string[];
}

/**
 * RS-07, RS-09, CS-05: the route the webhook of the CMS calls. Checks the signature and revalidates only
 * the pages the notice says changed:
 *
 *   // app/api/cms/route.ts
 *   import { revalidatePath } from 'next/cache';
 *   export const POST = createRevalidateRoute({ secret: process.env.CMS_WEBHOOK_SECRET!, revalidatePath });
 */
export function createRevalidateRoute(options: RevalidateRouteOptions) {
  return async (request: Request): Promise<Response> => {
    try {
      const event = await verifyCmsWebhook(request, options.secret);
      const paths = [...new Set([...event.paths, ...(options.alsoRevalidate ?? [])])];
      paths.forEach((path) => {
        options.revalidatePath(path);
      });
      return Response.json({ event: event.type, revalidated: paths });
    } catch (error) {
      if (error instanceof CmsWebhookError) {
        return Response.json({ error: error.reason }, { status: 401 });
      }
      throw error;
    }
  };
}

/** The `Metadata` of Next for a page of the CMS, for `generateMetadata` (RS-06). */
export function cmsMetadata(page: HeadInput) {
  const { seo } = page;
  const image = seo.ogImage
    ? [
        {
          url: seo.ogImage.url,
          width: seo.ogImage.width,
          height: seo.ogImage.height,
          alt: seo.ogImage.alt ?? undefined,
        },
      ]
    : undefined;
  return {
    title: { absolute: seo.title },
    description: seo.description ?? undefined,
    alternates: {
      canonical: seo.canonical,
      languages: Object.fromEntries((page.alternates ?? []).map((a) => [a.hreflang, a.url])),
    },
    robots: { index: seo.robots.index, follow: seo.robots.follow },
    openGraph: {
      type: page.type ?? 'website',
      title: seo.ogTitle,
      description: seo.ogDescription ?? undefined,
      url: seo.canonical,
      images: image,
    },
    twitter: {
      card: seo.ogImage ? ('summary_large_image' as const) : ('summary' as const),
      title: seo.ogTitle,
      description: seo.ogDescription ?? undefined,
      images: image?.map((i) => i.url),
    },
  };
}

/**
 * The redirects of the CMS for `redirects()` of `next.config`, applied in the build. The pages gone
 * (`410`) stay out: `next.config` has no `410`; the middleware answers them.
 */
export async function cmsRedirects(client: CmsClient) {
  const redirects: Redirect[] = await client.redirects();
  return redirects.flatMap((r) =>
    r.to === null
      ? []
      : [{ source: escapeSource(r.from), destination: r.to, statusCode: r.status as 301 | 308 }],
  );
}

/** A path of the site as a `source` of Next, where `:`, `(`, `)`, `*`, `+` and `?` mean something. */
const escapeSource = (path: string) => path.replace(/[:()*+?{}]/g, (c) => `\\${c}`);
