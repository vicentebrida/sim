# Contribuindo com o SIM

Obrigado pelo interesse! Antes de começar, leia:

- [`CONTEXT.md`](./CONTEXT.md): o glossário do domínio. Use esses termos em código, issues e PRs ("Ideia", não "sugestão"; "Curtida", não "voto").
- [`docs/PRD.md`](./docs/PRD.md): escopo e marcos.
- [`docs/adr/`](./docs/adr/): decisões de arquitetura. Se a sua mudança contraria um ADR, discuta numa issue primeiro.

## Ambiente de desenvolvimento

Requisitos: Node 26 (veja `.nvmrc`), pnpm (`npm install -g pnpm`; a versão está em `packageManager`) e Docker.

```bash
corepack enable
pnpm install
docker compose -f docker/compose.dev.yml up -d   # Postgres
cp apps/api/.env.example apps/api/.env
pnpm dev                                          # API em :3000, web em :5173
```

## Comandos

| Comando                                        | O que faz                                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `pnpm dev`                                     | API e web em modo watch                                                                    |
| `pnpm test`                                    | Testes (os da API sobem Postgres via Testcontainers, então o Docker precisa estar rodando) |
| `pnpm lint` / `pnpm typecheck` / `pnpm format` | Qualidade                                                                                  |
| `pnpm generate:api`                            | Regera o OpenAPI e o cliente `@sim/api-client`. Rode sempre que mudar um endpoint          |
| `pnpm --filter @sim/api db:generate`           | Gera uma migration a partir do schema Drizzle                                              |

## Convenções

- **Commits** seguem [Conventional Commits](https://www.conventionalcommits.org/pt-br/) (`feat:`, `fix:`, `docs:`...).
- **Changesets**: mudanças visíveis para quem instala o SIM precisam de um `pnpm changeset`.
- **Regras de domínio** (transições de Status, quem pode curtir etc.) ficam em código puro, sem NestJS nem banco, e são cobertas por testes unitários.
- **Sem mock do banco** nos testes de integração: use o Postgres real via Testcontainers.
- O código em `packages/api-client/src/generated` é gerado; não edite à mão.
