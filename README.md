# SIM — Sistema de Ideias e Melhorias

[![CI](https://github.com/vicentebrida/sim/actions/workflows/ci.yml/badge.svg)](https://github.com/vicentebrida/sim/actions/workflows/ci.yml)
[![Licença](https://img.shields.io/badge/licen%C3%A7a-Apache%202.0-blue)](./LICENSE)

Sistema open source e self-hosted onde os colaboradores de uma empresa propõem **Ideias** de melhoria, apoiam as dos colegas com **Curtidas**, discutem nos **Comentários** e acompanham cada Ideia até a conclusão.

Quando alguém começa a escrever uma Ideia que já existe, o SIM mostra as **Ideias Semelhantes** e direciona a pessoa para apoiar e complementar a original, em vez de abrir uma repetida.

> 🚧 Em desenvolvimento: Marco 1 (núcleo utilizável). Veja o [PRD](./docs/PRD.md).

## Principais recursos (planejados)

- Login local ou pelo **SSO da empresa** (OIDC ou OAuth2 genérico)
- Ciclo de vida com Status (Aberta → Em análise → Aprovada → Em execução → Concluída), com Histórico e justificativas
- **Detecção de Ideias Semelhantes**: busca textual sempre ligada, mais busca semântica opcional com IA (OpenAI-compatível ou Ollama local)
- Categorias com Avaliadores, Campos Personalizados, Notificações e painel
- Identidade visual da empresa, pt-BR e en

## Documentação

| Documento                              | Conteúdo                |
| -------------------------------------- | ----------------------- |
| [`docs/PRD.md`](./docs/PRD.md)         | Requisitos e marcos     |
| [`CONTEXT.md`](./CONTEXT.md)           | Glossário do domínio    |
| [`docs/adr/`](./docs/adr/)             | Decisões de arquitetura |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | Como rodar e contribuir |

## Instalação (Docker)

```bash
cp .env.example .env        # ajuste POSTGRES_PASSWORD e SIM_ADMIN_EMAILS
docker compose -f docker/compose.yml up -d --build
```

O SIM fica disponível em `http://localhost:3000`, e a documentação da API em `http://localhost:3000/api/docs`.

## Stack

NestJS · Drizzle · PostgreSQL · React · Vite · TanStack Router/Query · shadcn/ui · pnpm + Turborepo

## Licença

[Apache 2.0](./LICENSE)
