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
