# AGENTS.md

Instruções para agentes de código que trabalham no `stack-cms-sdk`.

## Este repositório

O pacote público `@stack201/cms-sdk` (TypeScript, ESM): cliente da Delivery API do **Stack CMS**, gerado do
`openapi.json` da `stack-cms-api`, o desenho dos blocos sem framework e as entradas `react`, `next`, `astro`
(com o `CmsContent.astro`), `vue`, `svelte` e `webhooks`. Regras em
[docs/spec.md](docs/spec.md).

## Comandos

```sh
pnpm install
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build
pnpm openapi:sync [url ou arquivo]   # traz o contrato da Delivery API (padrão: a API publicada)
pnpm generate                        # gera src/generated/delivery.ts de openapi/delivery.json
pnpm openapi:check                   # confere se openapi/delivery.json bate com a API publicada (CS-01)
```

Node 26 para desenvolver (`.nvmrc`); o pacote roda em Node 20+ e onde houver `fetch` e Web Crypto.

- **Contrato:** `openapi/delivery.json` é o `openapi.json` da API recortado para a Delivery (rotas, schemas que elas
  usam e o `SitePayload` dos avisos). Mudou a API: `pnpm openapi:sync ../stack-cms-api/openapi.json` (ou a URL),
  `pnpm generate` e versione os dois arquivos. A CI falha se os tipos gerados ou o contrato publicado divergirem.

## Regras

- **Fluxo:** branch a partir de `main`, PR e merge por squash só com aprovação do Michel. Nunca commit nem push direto
  em `main` (os hooks de `.githooks/` recusam: `git config core.hooksPath .githooks`).
- **Títulos de PR e commits:** Conventional Commits, descrição em português começando com minúscula. O release-please
  publica no npm; nunca publique à mão.
- **Tipos** gerados do `openapi.json`, nunca escritos à mão. Mudança que quebra é versão maior.
- **Nenhuma chave** em exemplo, teste ou documentação; só variáveis de ambiente.
- Código, nomes e campos em inglês; documentação em português.
