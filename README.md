# stack-cms-sdk

SDK do **Stack CMS** (`@stack201/cms-sdk`): o cliente da Delivery API e o que os sites precisam para SEO, GEO e AEO,
com entradas para React, Next e Astro.

- API: `mchlima/stack-cms-api` (https://cms-api.stack201.com.br).
- Como desenvolver e as regras do repositório: [AGENTS.md](AGENTS.md). As regras do SDK: [docs/spec.md](docs/spec.md).

## Uso

```ts
import { createCmsClient, CmsNotFoundError } from '@stack201/cms-sdk';

const cms = createCmsClient({ apiKey: process.env.CMS_DELIVERY_KEY!, locale: 'pt-BR' });

const { items, next } = await cms.posts.list({ category: 'seo' });
try {
  const post = await cms.posts.get('core-web-vitals');
  // post.html, post.hast, post.seo, post.jsonLd, post.alternates…
} catch (error) {
  if (error instanceof CmsNotFoundError) {
    // 404 do site
  }
}
```

A chave fica no servidor, numa variável de ambiente.

Os avisos do CMS (webhooks) são conferidos assim:

```ts
import { verifyCmsWebhook } from '@stack201/cms-sdk/webhooks';

export async function POST(request: Request) {
  const event = await verifyCmsWebhook(request, process.env.CMS_WEBHOOK_SECRET!);
  // event.type, event.paths: as páginas a revalidar
  return new Response(null, { status: 204 });
}
```

Com React, o conteúdo e o `<head>`:

```tsx
import { CmsContent, CmsHead } from '@stack201/cms-sdk/react';

<CmsHead seo={post.seo} alternates={post.alternates} jsonLd={post.jsonLd} type="article" />
<CmsContent hast={post.hast} components={{ a: Link, img: Image }} blocks={{ note: Callout, cta: Cta }} />
```

Sem React, `headTags(page)` e `headHtml(page)` dão as mesmas tags do `<head>`, e `jsonLdString(data)` dá o JSON-LD
escapado.

Com Next (App Router), sem depender do pacote `next`:

```ts
// middleware.ts: redirecionamentos, sitemaps, feeds, llms.txt, robots.txt e o .md de cada post
import { NextResponse, type NextRequest } from 'next/server';
import { createCmsMiddleware } from '@stack201/cms-sdk/next';

const cmsMiddleware = createCmsMiddleware(cms);
export async function middleware(request: NextRequest) {
  return (await cmsMiddleware(request)) ?? NextResponse.next();
}

// app/api/cms/route.ts: o webhook do CMS revalida só as páginas afetadas
import { revalidatePath } from 'next/cache';
import { createRevalidateRoute } from '@stack201/cms-sdk/next';

export const POST = createRevalidateRoute({
  secret: process.env.CMS_WEBHOOK_SECRET!,
  revalidatePath,
});
```

`cmsMetadata(post)` dá o `Metadata` do `generateMetadata`, `cmsRedirects(cms)` dá os redirecionamentos do
`next.config`, e `cmsFileRoute(cms)` serve os arquivos como rotas, para quem não quer o middleware.

Com Astro (site estático), as coleções e os arquivos entram no build:

```ts
// src/content.config.ts
import { defineCollection, z } from 'astro:content';
import { cmsLoader } from '@stack201/cms-sdk/astro';
import type { Post } from '@stack201/cms-sdk';

const posts = defineCollection({
  loader: cmsLoader(cms, { collection: 'posts' }),
  schema: z.custom<Post>(),
});

// src/pages/sitemap.xml.ts (e llms.txt.ts, robots.txt.ts…)
export const GET = cmsFileEndpoint(cms);

// src/pages/sitemaps/[file].ts (e feeds/[file].ts)
export const getStaticPaths = () => cmsFilePaths(cms, 'sitemaps');
export const GET = cmsFileEndpoint(cms);
```

`render(entry)` dá o HTML do post e os títulos, `cmsMarkdownEndpoint(cms)` serve o `.md` de cada post,
`cmsPostSlugs(cms)` alimenta o `getStaticPaths` e `cmsAstroRedirects(cms)` dá os `redirects` do `astro.config`. Para
publicar no CMS e o site se refazer, crie um _Deploy Hook_ no projeto da Vercel e cadastre o endereço dele como webhook
do space.
