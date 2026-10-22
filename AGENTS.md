# AGENTS.md

Instruções para agentes de código que trabalham no `stack-cms-sdk`.

## Este repositório

O pacote público `@stack201/cms-sdk` (TypeScript, ESM): cliente da Delivery API do **Stack CMS**, gerado do
`openapi.json` da `stack-cms-api`, e as entradas `react`, `next`, `astro` e `webhooks`. Regras em
[docs/spec.md](docs/spec.md).

## Regras

- **Fluxo:** branch a partir de `main`, PR e merge por squash só com aprovação do Michel. Nunca commit nem push direto
  em `main` (os hooks de `.githooks/` recusam: `git config core.hooksPath .githooks`).
- **Títulos de PR e commits:** Conventional Commits, descrição em português começando com minúscula. O release-please
  publica no npm; nunca publique à mão.
- **Tipos** gerados do `openapi.json`, nunca escritos à mão. Mudança que quebra é versão maior.
- **Nenhuma chave** em exemplo, teste ou documentação; só variáveis de ambiente.
- Código, nomes e campos em inglês; documentação em português.
