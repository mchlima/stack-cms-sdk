# Spec do SDK do Stack CMS

O que o `stack-cms-sdk` entrega: o pacote `@stack201/cms-sdk`, que os sites usam para ler o conteúdo publicado no
Stack CMS pela Delivery API (spec da `stack-cms-api`, seção 9) e para fazer bem o que o CMS prepara para SEO, GEO e
AEO: sitemaps, feeds, `llms.txt`, redirecionamentos, `hreflang`, JSON-LD e a revalidação ao publicar.

Regras têm id `RS-NN` e critérios de aceite `CS-NN`. Decisões do Michel de 2026-10-22.

## 1. O pacote

- **RS-01** Um pacote só, `@stack201/cms-sdk`, público no npm, em TypeScript e ESM, com entradas separadas:

  | Entrada                      | Para quê                                                                                             |
  | ---------------------------- | ---------------------------------------------------------------------------------------------------- |
  | `@stack201/cms-sdk`          | O cliente da Delivery API, sem depender de framework (só `fetch`)                                    |
  | `@stack201/cms-sdk/react`    | `<CmsContent>`: desenha o `hast` do post, trocando blocos e elementos por componentes                |
  | `@stack201/cms-sdk/next`     | Rotas prontas (sitemaps, feeds, `llms.txt`, `robots.txt`, IndexNow), redirecionamentos e revalidação |
  | `@stack201/cms-sdk/astro`    | O _loader_ das coleções de conteúdo do Astro e as rotas prontas                                      |
  | `@stack201/cms-sdk/webhooks` | Conferir a assinatura dos avisos do CMS                                                              |

- **RS-02** Os tipos e as chamadas são gerados do `openapi.json` da `stack-cms-api`. A versão do SDK diz com qual
  versão da Delivery API ele fala, e uma mudança que quebra é uma versão maior.

## 2. O cliente

- **RS-03** `createCmsClient({ apiKey, baseUrl?, locale?, fetch? })`. A chave `delivery` (ou `preview`, no modo de
  prévia) fica no servidor: o SDK avisa se for usado no navegador com uma chave `preview`.
- **RS-04** As chamadas seguem a Delivery API: `space()`, `posts.list()`, `posts.get(slug)`, `tags`, `categories`,
  `authors`, `resolve(path)`, `redirects()`, `search(q)`. Cada uma devolve os dados tipados ou um erro tipado
  (`CmsNotFoundError`, `CmsAuthError`, `CmsRateLimitError`), e repassa `ETag` e `If-None-Match`.

## 3. Desenhar o conteúdo

- **RS-05** O site pode usar o `html` pronto ou o `hast`. O
  `<CmsContent hast={post.hast} components={{ … }} blocks={{ … }} />` troca qualquer elemento (`img`, `a`,
  `table`), pela tag, e qualquer bloco (`answer`, `note`, `steps` e os blocos do space), pelo `data-block`, por um
  componente do site. Os dois ficam separados porque `table` é tag e também bloco. O bloco recebe o nome, os
  atributos sem o `data-`, o `id` e o conteúdo já desenhado. O que não for trocado sai como o HTML do CMS.
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
  - um _loader_ para as coleções de conteúdo: posts, tags, categorias e autores entram no build como coleções;
  - as mesmas rotas prontas;
  - os redirecionamentos gerados para o `astro.config`.
    É o que o site da Stack201 vai usar no lugar dos MDX. O rebuild na Vercel vem de um _Deploy Hook_ cadastrado como
    webhook do space: o SDK não precisa conferir a assinatura, porque a Vercel só refaz o site.
- **RS-09** **Webhooks:** `verifyCmsWebhook(request, secret)` confere o HMAC, o horário (até 5 minutos) e devolve o
  evento tipado.

## 5. Critérios de aceite

- **CS-01** Os tipos batem com o `openapi.json` publicado; mudar a API sem regenerar o SDK quebra a CI (RS-02).
- **CS-02** `posts.get` de um endereço que não existe dá `CmsNotFoundError`; chave errada dá `CmsAuthError` (RS-04).
- **CS-03** `<CmsContent>` troca um bloco do space pelo componente do site e mantém o resto igual ao `html` (RS-05).
- **CS-04** O JSON-LD com `</script>` no texto sai escapado (RS-06).
- **CS-05** Num site Next de exemplo, publicar no CMS revalida só as páginas afetadas (RS-07, RS-09).
- **CS-06** Num site Astro de exemplo, os posts entram como coleção e as rotas prontas respondem (RS-08).
- **CS-07** Aviso com assinatura errada ou fora dos 5 minutos é recusado (RS-09).

## 6. O que o Michel precisa providenciar

A organização `@stack201` no npm e um token de publicação para o GitHub Actions do repositório.
