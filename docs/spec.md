# Spec do SDK do Stack CMS

O que o `stack-cms-sdk` entrega: o pacote `@stack201/cms-sdk`, que os sites usam para ler o conteúdo publicado no
Stack CMS pela Delivery API (spec da `stack-cms-api`, seção 9) e para fazer bem o que o CMS prepara para SEO, GEO e
AEO: sitemaps, feeds, `llms.txt`, redirecionamentos, `hreflang`, JSON-LD e a revalidação ao publicar.

Regras têm id `RS-NN` e critérios de aceite `CS-NN`. Decisões do Michel de 2026-10-22.

## 1. O pacote

- **RS-01** Um pacote só, `@stack201/cms-sdk`, público no npm, em TypeScript e ESM, com entradas separadas:

  | Entrada                                    | Para quê                                                                                             |
  | ------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
  | `@stack201/cms-sdk`                        | O cliente da Delivery API e os blocos do conteúdo, sem depender de framework (RS-10, RS-13, RS-14)   |
  | `@stack201/cms-sdk/react`                  | `<CmsContent>`: desenha o `hast` do post, trocando blocos e elementos por componentes (React e Next) |
  | `@stack201/cms-sdk/next`                   | Rotas prontas (sitemaps, feeds, `llms.txt`, `robots.txt`, IndexNow), redirecionamentos e revalidação |
  | `@stack201/cms-sdk/astro`                  | O _loader_ das coleções de conteúdo do Astro e as rotas prontas                                      |
  | `@stack201/cms-sdk/astro/CmsContent.astro` | `<CmsContent>` do Astro (RS-11)                                                                      |
  | `@stack201/cms-sdk/vue`                    | `<CmsContent>` do Vue 3 e do Nuxt (RS-11)                                                            |
  | `@stack201/cms-sdk/svelte`                 | `<CmsContent>` do Svelte 5 e do SvelteKit (RS-11)                                                    |
  | `@stack201/cms-sdk/webhooks`               | Conferir a assinatura dos avisos do CMS                                                              |

  React, Vue, Svelte e Astro são dependências opcionais (`peerDependencies` com `optional`): quem usa um
  framework não instala os outros.

- **RS-02** Os tipos e as chamadas são gerados do `openapi.json` da `stack-cms-api`. A versão do SDK diz com qual
  versão da Delivery API ele fala, e uma mudança que quebra é uma versão maior.

## 2. O cliente

- **RS-03** `createCmsClient({ apiKey, baseUrl?, locale?, fetch? })`. A chave `delivery` (ou `preview`, no modo de
  prévia) fica no servidor: o SDK avisa se for usado no navegador com uma chave `preview`.
- **RS-04** As chamadas seguem a Delivery API: `space()`, `posts.list()`, `posts.get(slug)`, `tags`, `categories`,
  `authors`, `menus` (RS-17), `resolve(path)`, `redirects()`, `search(q)`. Cada uma devolve os dados tipados ou um erro tipado
  (`CmsNotFoundError`, `CmsAuthError`, `CmsRateLimitError`), e repassa `ETag` e `If-None-Match`.

## 3. Desenhar o conteúdo

- **RS-05** O site pode usar o `html` pronto ou o `hast`. O
  `<CmsContent hast={post.hast} components={{ … }} blocks={{ … }} />` troca qualquer elemento (`img`, `a`,
  `table`), pela tag, e qualquer bloco (`answer`, `note`, `steps` e os blocos do space), pelo `data-block`, por um
  componente do site. Os dois ficam separados porque `table` é tag e também bloco. O bloco recebe o nome, os
  atributos sem o `data-`, o `id` e o conteúdo já desenhado. O que não for trocado sai como o HTML do CMS, menos
  os blocos do space sem componente (RS-12).
- **RS-06** Helpers para o `<head>`: o SEO já resolvido do post (título, descrição, canonical, `robots`, Open Graph,
  `hreflang` com o `x-default`) e o JSON-LD em `<script type="application/ld+json">`, com os caracteres perigosos
  escapados.

## 4. Next e Astro

- **RS-07** **Next:**
  - rotas prontas para `sitemap.xml`, feeds, `llms.txt`, `llms-full.txt`, `robots.txt` e o arquivo do IndexNow,
    repassando a Delivery API;
  - um helper de _middleware_ que aplica os redirecionamentos do CMS;
  - uma rota de revalidação que confere a assinatura do aviso e chama `revalidatePath` para os endereços afetados.
- **RS-08** **Astro:**
  - um _loader_ para as coleções de conteúdo: posts, tags, categorias, autores e menus entram no build como
    coleções;
  - as mesmas rotas prontas;
  - os redirecionamentos gerados para o `astro.config`.
    É o que o site da Stack201 vai usar no lugar dos MDX. O rebuild na Vercel vem de um _Deploy Hook_ cadastrado como
    webhook do space: o SDK não precisa conferir a assinatura, porque a Vercel só refaz o site.
- **RS-09** **Webhooks:** `verifyCmsWebhook(request, secret)` confere o HMAC, o horário (até 5 minutos) e devolve o
  evento tipado.

## 5. Os blocos em qualquer framework

Decisões do Michel de 2026-10-23.

- **RS-10** **Núcleo sem framework**, na entrada principal: `readBlock(element, customBlocks?)` e
  `blocksOf(hast, customBlocks?)` dão cada bloco com `name`, `attributes` (sem o `data-`, pelo nome do atributo:
  `cta-text`), `id`, `custom` (se é bloco do space), os filhos e o `node`. Os blocos de todo space estão em
  `CMS_BLOCKS` (`answer`, `note`, `steps`, `questions`, `takeaways`, `table`, `image`, `video`, `code`); qualquer
  outro nome é bloco do space. As propriedades do `hast` vêm em camelCase (`dataCtaText`); a forma antiga
  (`data-href`) continua aceita. Com a definição do bloco (`space.customBlocks`), `number` vira número e `boolean`
  vira booleano; o resto (texto, `enum`, `link`) e tudo sem definição fica texto. `contentNodes(hast, options)`
  corta o conteúdo onde entram os componentes do site, para os adaptadores; o que não tem componente dentro sai
  como o HTML do CMS.
- **RS-11** **Adaptadores finos**, todos com a mesma interface do `<CmsContent>` do React (`hast`, `blocks`,
  `components`, `customBlocks`, `warn`), desenhando no servidor e sem estado:
  - `react`: serve ao Next, inclusive em Server Components (sem hooks, sem `'use client'`);
  - `vue`: componente com _render function_, serve ao Nuxt; o bloco recebe `name`, `attributes`, `id` e `node`
    como props e o conteúdo no _slot_ padrão;
  - `astro/CmsContent.astro`: aceita componentes do Astro e de qualquer framework que o site tenha no Astro; o
    conteúdo chega no _slot_;
  - `svelte`: Svelte 5, serve ao SvelteKit; os `.svelte` vão no pacote como estão e o _bundler_ do site os
    compila; o conteúdo chega em `children`.

  O componente de um elemento recebe, fora do React, os atributos como o HTML os escreve (`href`, `class`) e o
  `node`.

- **RS-12** **Bloco do space sem componente nunca quebra a página:** o de conteúdo deixa o conteúdo (sem o
  `<div data-block>`), o sem conteúdo some, com um aviso (`console.warn`) em desenvolvimento
  (`NODE_ENV` diferente de `production`, ou a opção `warn`). Com `customBlocks`, o aviso lista todos os blocos do
  space sem componente, mesmo os que o post não usa; `missingBlocks(customBlocks, blocks)` dá a mesma lista para
  conferir no build. Os blocos de todo space sem componente continuam saindo como o HTML do CMS.
- **RS-13** `renderHtml(hast, { blocks, components?, customBlocks? })` dá o HTML para quem usa outro framework
  ou HTML puro: cada bloco vira o que a função dele devolve (HTML, sem escapar: quem escreve escapa o que vem de
  fora); o resto sai como o HTML do CMS.
- **RS-14** **Tipos dos atributos:** `AttributesOf<Definição>` e `BlockAttributesMap<customBlocks>` dão os
  atributos de uma definição `as const`; `blockTypes(customBlocks)` escreve o texto de um `.ts` com a interface
  `CmsBlockAttributes`, e `npx cms-sdk blocks-types --out src/cms-blocks.ts` faz o mesmo lendo a Delivery API
  (chave em `CMS_DELIVERY_KEY`). O componente de um bloco usa `BlockProps<CmsBlockAttributes['cta']>`.
- **RS-15** **Valores seguros:** nenhum atributo chega a um componente (ou ao `renderHtml`) com `javascript:`, `data:`
  ou `vbscript:`, mesmo com espaços ou caracteres de controle no meio; e um atributo do tipo `link` só chega com
  `https://`, `http://`, `/caminho`, `#âncora`, `mailto:` ou `tel:`. O CMS já recusa esses valores; o SDK confere de
  novo, e o valor recusado simplesmente não vem.

## 6. Categorias em vários níveis e menus

Decisões do Michel de 2026-10-23.

- **RS-16** **O caminho das mães:** toda categoria da Delivery (`CategoryItem`, `CategoryPage`, `CategoryLink` em
  `parent`, `parents` e `children`, e cada categoria de `post.categories`) tem `slugPath`, os slugs das mães e o
  dela (`sites/desempenho`), que é o `{path}` do modelo de endereço. `categories.get(ref)` aceita o `slugPath`, as
  partes dele (`['sites', 'desempenho']`, como a rota _catch-all_ dá) ou, só com o modelo `{slug}`, o slug
  sozinho; cada `/` vai como `%2F`, num parâmetro só. O `resolve` dá, para categorias, o que está no endereço em `slug` e o caminho em `slugPath`. O site
  serve a categoria numa rota de vários níveis: `app/…/categoria/[...path]` no Next e
  `src/pages/…/categoria/[...path].astro` no Astro, com `cmsCategoryPaths(cms)` no `getStaticPaths`. No _loader_
  do Astro, a categoria tem o `slugPath` como id. O feed de uma categoria tem o caminho, com `.` no lugar de `/`
  (`feeds/category-sites.desempenho.rss`), e também fica no endereço da categoria (`…/sites/desempenho/rss.xml`,
  `atom.xml`, `feed.json`): `siteFile` e o _middleware_ do Next acham a categoria pelo `resolve`, e no Astro a rota
  `[...path]/rss.xml.ts` usa `cmsCategoryPaths` e `cmsFileEndpoint`. Mudar o slug ou a mãe gera os `301` no CMS, que
  chegam pelos redirecionamentos de sempre (`redirects()`, o _middleware_ e o aviso `redirects.updated`); o
  redirecionamento de uma página leva junto os feeds dela (`/antiga/rss.xml` → `/nova/rss.xml`), e a query do
  pedido (`?locale=en`) vai junto quando o destino é do próprio site e não tem a sua. O `siteFile` guarda por um minuto o que é cada
  endereço antes de `rss.xml`; no _middleware_, a API fora do ar deixa o pedido seguir para o site, e nas rotas
  feitas para os arquivos (`cmsFileRoute`, `cmsFileEndpoint`) é um erro, para o leitor de feeds receber `5xx` e o
  build estático falhar. Sites com o SDK até 0.4 não aceitam o nome novo do feed de subcategoria: atualize o SDK
  junto com a API.
- **RS-17** **Menus:** `menus.list()` dá `{ key, name, description }` de cada menu, e
  `menus.get(key, { locale })` dá o menu numa língua com a árvore de itens já resolvida (`label`, `kind`, `href`,
  `url`, `external`, `targetId`, `children`), sem os ocultos; os dois repassam o `ETag` como as outras chamadas. Os
  tipos `Menu`, `MenuItem`, `MenuItemKind` e `MenuSummary` vêm do `openapi.json`. No Astro, `cmsMenu(cms, key,
{ locale })` lê um menu no build, e `cmsLoader(cms, { collection: 'menus' })` traz todos como coleção (id: a
  chave, ou `<locale>/<chave>`). O aviso `menu.updated` não traz `paths`: `menuChangeOf(event)` dá `key`,
  `previousKey` (renomeado), `deleted` e `reason` (`menu`, ou `pages` quando uma página do menu mudou de nome ou de
  endereço, saiu do ar, ganhou ou perdeu uma subcategoria, ou o endereço do site mudou); no Next, `createRevalidateRoute` revalida o que `onMenuUpdated(menu,
event)` devolver (e o site chama `revalidateTag` ali, se marca a busca dos menus) ou, sem a opção, o site todo
  (`revalidatePath('/', 'layout')`), porque o menu costuma estar no _layout_.

## 7. Critérios de aceite

- **CS-01** Os tipos batem com o `openapi.json` publicado; mudar a API sem regenerar o SDK quebra a CI (RS-02).
- **CS-02** `posts.get` de um endereço que não existe dá `CmsNotFoundError`; chave errada dá `CmsAuthError` (RS-04).
- **CS-03** `<CmsContent>` troca um bloco do space pelo componente do site e mantém o resto igual ao `html` (RS-05).
- **CS-04** O JSON-LD com `</script>` no texto sai escapado (RS-06).
- **CS-05** Num site Next de exemplo, publicar no CMS revalida só as páginas afetadas (RS-07, RS-09).
- **CS-06** Num site Astro de exemplo, os posts entram como coleção e as rotas prontas respondem (RS-08).
- **CS-07** Aviso com assinatura errada ou fora dos 5 minutos é recusado (RS-09).
- **CS-08** O mesmo post (blocos de todo space, blocos do space no formato novo, um dentro do outro) sai igual no
  React, no Vue, no Svelte, no Astro e no `renderHtml`, com os atributos tipados pela definição (RS-10, RS-11,
  RS-13).
- **CS-09** Um bloco do space sem componente não quebra a página: o conteúdo fica, o bloco sem conteúdo some e há
  um aviso em desenvolvimento (RS-12).

- **CS-10** `categories.get('sites/desempenho')` e `categories.get(['sites', 'desempenho'])` chamam
  `/categories/sites%2Fdesempenho`; o _loader_ dá o `slugPath`, e `cmsCategoryPaths` dá o que o endereço tem: o `slugPath` com `{path}`, o slug com
  `{slug}` (RS-16).
- **CS-12** `…/sites/desempenho/rss.xml` serve `feeds/category-sites.desempenho.rss`, e o redirecionamento de
  `/sites/desempenho` leva `/sites/desempenho/rss.xml` ao novo endereço com `/rss.xml` (RS-16).
- **CS-11** Um aviso `menu.updated` revalida o _layout_ inteiro, ou só o que `onMenuUpdated` disser; os outros
  avisos continuam revalidando os `paths` que trazem (RS-17).

## 8. O que o Michel precisa providenciar

A organização `@stack201` no npm e um token de publicação para o GitHub Actions do repositório.
