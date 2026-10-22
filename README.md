# SIM — Sistema de Ideias e Melhorias

[![CI](https://github.com/vicentebrida/sim/actions/workflows/ci.yml/badge.svg)](https://github.com/vicentebrida/sim/actions/workflows/ci.yml)
[![Licença](https://img.shields.io/badge/licen%C3%A7a-Apache%202.0-blue)](./LICENSE)

Sistema open source e self-hosted onde os colaboradores de uma empresa propõem **Ideias** de melhoria, apoiam as dos colegas com **Curtidas**, discutem nos **Comentários** e acompanham cada Ideia até a conclusão.

Quando alguém começa a escrever uma Ideia que já existe, o SIM mostra as **Ideias Semelhantes** e direciona a pessoa para apoiar e complementar a original, em vez de abrir uma repetida.

> **Versão 0.11.0**: Marcos 1 a 3, com editor rico (Markdown) nos textos longos e Comentários, imagem para amd64 e arm64, reconhecimento por Ideias Concluídas, textos da interface ajustáveis, tempo real, etapas de Em execução, arquivamento automático, e-mail (na hora ou em resumo diário), avisos no Slack/Teams/Google Chat, Anexos (em disco ou S3, com antivírus opcional), Ideias Paradas, Painel, Etiquetas, chart Helm, identidade visual, governança, Auditoria e busca semântica opcional. Veja o [CHANGELOG](./CHANGELOG.md), o [PRD](./docs/PRD.md) e o que vem a seguir nos Marcos 2 e 3.

## Principais recursos

- Login local ou pelo **SSO da empresa** (OIDC ou OAuth2 genérico)
- Ciclo de vida com Status (Aberta → Em análise → Aprovada → Em execução → Concluída), com Histórico e justificativas
- **Detecção de Ideias Semelhantes** enquanto se escreve (busca textual). A busca semântica opcional com IA complementa a busca textual
- Curtidas, Comentários com Menções, Seguir e Notificações no sininho (em tempo real) e por e-mail (opcional, via SMTP)
- Categorias com Avaliadores e Campos Personalizados configuráveis, inclusive por Categoria
- Versões de edição, Autoria Oculta (opcional), Colaborador Inativo, Anonimização e Auditoria
- Acesso e Administradores por grupo do SSO
- Interface em pt-BR e en
- Ideias Paradas com aviso aos Avaliadores e escalonamento aos Administradores
- Identidade visual da empresa (nome, cor, logo, favicon e página de login)
- Anexos (imagens e documentos) em Ideias e Comentários, com antivírus opcional (ClamAV)
- Painel para Administradores, com exportação em CSV
- Aparência dos Status personalizável (nome, cor e descrição)
- Busca semântica opcional (OpenAI, Ollama ou compatível) nas Ideias Semelhantes
- Etiquetas nas Ideias, com filtro na lista
- Avisos de Ideias novas e mudanças de Status no Slack, Microsoft Teams ou Google Chat
- Instalação com Docker Compose ou Kubernetes (chart Helm)

## Documentação

| Documento                              | Conteúdo                |
| -------------------------------------- | ----------------------- |
| [`docs/PRD.md`](./docs/PRD.md)         | Requisitos e marcos     |
| [`CONTEXT.md`](./CONTEXT.md)           | Glossário do domínio    |
| [`docs/adr/`](./docs/adr/)             | Decisões de arquitetura |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | Como rodar e contribuir |

## Instalação (Docker)

Precisa do Docker com o Compose (Docker Desktop no Windows e no macOS).

```bash
git clone https://github.com/vicentebrida/sim.git
cd sim
cp .env.example .env
```

No `.env`, defina pelo menos `POSTGRES_PASSWORD` e a conta de emergência, que é o primeiro Administrador: `SIM_EMERGENCY_EMAIL` e `SIM_EMERGENCY_PASSWORD` (no mínimo 12 caracteres). Os campos deixados vazios ficam desligados. Para usar a imagem pronta, publicada a cada versão em `ghcr.io/vicentebrida/sim` para amd64 e arm64, descomente a linha `SIM_IMAGE` do `.env` e suba:

```bash
docker compose --env-file .env -f docker/compose.yml up -d
```

Ou, sem `SIM_IMAGE`, construa a imagem a partir do código:

```bash
docker compose --env-file .env -f docker/compose.yml up -d --build
```

O `--env-file .env` é necessário: sem ele, o Compose procura o `.env` na pasta `docker/` e ignora a senha do banco e a imagem escolhidas.

O SIM fica disponível em `http://localhost:3000` (entre com a conta de emergência), e a documentação da API em `http://localhost:3000/api/docs`. Para acessar de outros computadores, ajuste `SIM_PUBLIC_URL` para o endereço usado por eles (ex.: `http://192.168.0.10:3000`). Para ver os registros: `docker compose --env-file .env -f docker/compose.yml logs -f sim`.

## Instalação (Kubernetes)

Há um chart Helm em [`deploy/helm/sim`](./deploy/helm/sim/README.md), publicado a cada versão em `oci://ghcr.io/vicentebrida/charts/sim`:

```bash
helm install sim oci://ghcr.io/vicentebrida/charts/sim --set publicUrl=https://ideias.empresa.com.br
```

## Stack

NestJS · Drizzle · PostgreSQL · React · Vite · TanStack Router/Query · shadcn/ui · pnpm + Turborepo

## Licença

[Apache 2.0](./LICENSE)
