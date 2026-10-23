# stack-cms-sdk

SDK do **Stack CMS** (`@stack201/cms-sdk`): o cliente da Delivery API e o que os sites precisam para SEO, GEO e AEO,
com entradas para React, Next, Astro, Vue e Svelte.

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

### O conteúdo, com os componentes do site

O CMS entrega cada post como `html` e `hast`. O `<CmsContent>` desenha o `hast` trocando cada bloco (os de todo
space, como `note` e `answer`, e os do seu space, como `cta`) e cada elemento (`a`, `img`) por um componente do
site. A interface é a mesma em todos os frameworks: `hast`, `blocks`, `components` e, opcional, `customBlocks`
(o `space.customBlocks`, que tipa os atributos e avisa em desenvolvimento dos blocos sem componente). Um bloco do
space sem componente nunca quebra a página: o conteúdo dele fica e o bloco sem conteúdo some.

React e Next (também em Server Components):

```tsx
import { CmsContent, CmsHead, type BlockProps } from '@stack201/cms-sdk/react';

const Cta = ({ attributes }: BlockProps) => <a href={attributes.href}>{attributes.label}</a>;

<CmsHead seo={post.seo} alternates={post.alternates} jsonLd={post.jsonLd} type="article" />
<CmsContent hast={post.hast} components={{ a: Link, img: Image }} blocks={{ note: Callout, cta: Cta }} />
```

Vue e Nuxt (o bloco recebe `name`, `attributes`, `id` e `node` como props e o conteúdo no _slot_):

```vue
<script setup lang="ts">
import { CmsContent } from '@stack201/cms-sdk/vue';
import Cta from '~/components/Cta.vue';
import { NuxtLink } from '#components';
</script>

<template>
  <CmsContent :hast="post.hast" :blocks="{ cta: Cta }" :components="{ a: NuxtLink }" />
</template>
```

Astro (componentes do Astro ou de qualquer framework do site; o conteúdo chega no `<slot />`):

```astro
---
import CmsContent from '@stack201/cms-sdk/astro/CmsContent.astro';
import Cta from '../components/Cta.astro';
import Callout from '../components/Callout.tsx';
---

<CmsContent hast={post.hast} blocks={{ cta: Cta, note: Callout }} components={{ a: Link }} />
```

Svelte 5 e SvelteKit (o conteúdo chega em `children`):

```svelte
<script lang="ts">
  import { CmsContent } from '@stack201/cms-sdk/svelte';
  import Cta from '$lib/Cta.svelte';
  let { data } = $props();
</script>

<CmsContent hast={data.post.hast} blocks={{ cta: Cta }} />
```

Outro framework ou HTML puro: cada bloco vira o HTML que a função devolve (escape o que vier de fora); o resto sai
como o HTML do CMS.

```ts
import { renderHtml } from '@stack201/cms-sdk';

const html = renderHtml(post.hast, {
  customBlocks: space.customBlocks,
  blocks: {
    cta: ({ attributes }) =>
      `<a class="cta" href="${escape(attributes.href)}">${escape(attributes.label)}</a>`,
    destaque: (block, children) => `<section class="destaque">${children}</section>`,
  },
});
```

`blocksOf(hast, customBlocks)` lista os blocos de um post, com os atributos tipados (`number` vira número,
`boolean` vira booleano), e `missingBlocks(space.customBlocks, blocks)` diz quais blocos do space ainda não têm
componente no site.

Os tipos dos atributos de cada bloco do space saem da Delivery API:

```sh
CMS_DELIVERY_KEY=… npx cms-sdk blocks-types --out src/cms-blocks.ts
```

```tsx
import type { CmsBlockAttributes } from './cms-blocks';

const Cta = ({ attributes }: BlockProps<CmsBlockAttributes['cta']>) => (
  <a href={attributes.href} data-variant={attributes.variant}>
    {attributes.label}
  </a>
);
```

`blockTypes(customBlocks)` dá o mesmo texto, e `AttributesOf<typeof definicao>` tipa uma definição `as const`.

### O `<head>`

Com React, o `<CmsHead>` do exemplo acima. Sem React, `headTags(page)` e `headHtml(page)` dão as mesmas tags do `<head>`, e `jsonLdString(data)` dá o JSON-LD
escapado.

### Next e Astro

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

### Categorias em vários níveis

Com o modelo de endereço `{path}` (`/guias/categoria/sites/desempenho`), cada categoria tem `slugPath`
(`sites/desempenho`), também nas mães, nas filhas e nas categorias de cada post. A página da categoria fica numa rota
de vários níveis, e `categories.get` aceita o caminho inteiro ou as partes dele (cada `/` vai como `%2F`):

```tsx
// Next: app/guias/categoria/[...path]/page.tsx
export default async function Page({ params }: { params: Promise<{ path: string[] }> }) {
  const category = await cms.categories.get((await params).path);
  // category.parents, category.children (cada um com slugPath e url), category.posts…
}
```

```astro
---
// Astro: src/pages/guias/categoria/[...path].astro
import { cmsCategoryPaths } from '@stack201/cms-sdk/astro';

export const getStaticPaths = () => cmsCategoryPaths(cms);
const category = await cms.categories.get(Astro.params.path!);
---
```

Com o modelo `{slug}`, o slug sozinho também serve, porque ali ele é único. Com `{path}`, use sempre o caminho: o slug
sozinho não acha uma subcategoria. No `cmsLoader` do Astro, a categoria tem o `slugPath`
como id. Mudar o slug ou a mãe no CMS gera os `301` sozinho, e eles chegam pelos redirecionamentos de sempre.

O feed da categoria fica no endereço dela: `/guias/categoria/sites/desempenho/rss.xml` (e `atom.xml`, `feed.json`).
No Next, o _middleware_ já serve. No Astro:

```ts
// src/pages/guias/categoria/[...path]/rss.xml.ts (e atom.xml.ts, feed.json.ts)
export const getStaticPaths = () => cmsCategoryPaths(cms);
export const GET = cmsFileEndpoint(cms);
```

O redirecionamento de uma categoria leva junto os feeds dela (`…/antiga/rss.xml` → `…/nova/rss.xml`). Na API, o
arquivo é `feeds/category-sites.desempenho.rss`, com `.` no lugar de `/`.

### Menus

```ts
const menus = await cms.menus.list(); // [{ key, name, description }]
const menu = await cms.menus.get('principal', { locale: 'pt-BR' });
// menu.items: [{ label, kind, href, url, external, children }], já sem os itens ocultos
```

No Astro, `cmsMenu(cms, 'principal', { locale })` lê o menu no build, ou
`cmsLoader(cms, { collection: 'menus' })` traz todos como coleção (`getEntry('menus', 'principal')`).

O aviso `menu.updated` chega quando o menu muda e também quando uma página dele muda de nome ou de endereço, sai do
ar ou ganha uma subcategoria (`menuChangeOf(event).reason` é `'pages'`). Ele não traz páginas. No Next, `createRevalidateRoute` revalida o site todo
(`revalidatePath('/', 'layout')`) por padrão, porque o menu costuma estar no _layout_; `onMenuUpdated` troca isso
pelo que o site disser:

```ts
import { revalidatePath, revalidateTag } from 'next/cache';

export const POST = createRevalidateRoute({
  secret: process.env.CMS_WEBHOOK_SECRET!,
  revalidatePath,
  // A busca do menu marcada com cms.menus.get(key, {}, { init: { next: { tags: [`menu:${key}`] } } })
  onMenuUpdated: (menu) => {
    revalidateTag(`menu:${menu.key}`, 'max');
    if (menu.previousKey) revalidateTag(`menu:${menu.previousKey}`, 'max');
  },
});
```

Fora do Next, `menuChangeOf(event)` (de `@stack201/cms-sdk/webhooks`) dá `key`, `previousKey` e `deleted` do aviso.
