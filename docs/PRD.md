# SIM — Sistema de Ideias e Melhorias · PRD

> Vocabulário: os termos em **negrito** seguem o glossário em [`CONTEXT.md`](../CONTEXT.md).
> Decisões de arquitetura: [`docs/adr/`](./adr/).

## 1. Visão

O SIM é um sistema open source (Apache 2.0) e self-hosted onde os **Colaboradores** de uma organização propõem **Ideias** para melhorar a empresa, apoiam as Ideias dos colegas com **Curtidas**, discutem nos **Comentários** e acompanham o andamento até a conclusão.

O diferencial é evitar Ideias repetidas. Enquanto o Colaborador escreve, o SIM mostra **Ideias Semelhantes** já existentes e o direciona para apoiar e complementar a Ideia original, em vez de abrir uma nova.

O maior risco de um sistema de ideias é o Colaborador sugerir e ninguém responder. Por isso o SIM dá visibilidade ao andamento (**Status**, **Histórico**) e cobra resposta dos **Avaliadores** (**Ideia Parada**).

## 2. Papéis

| Papel             | Quem                                                           | Pode                                                                                                                        |
| ----------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Colaborador**   | Qualquer pessoa autenticada                                    | Criar Ideias, curtir, comentar, seguir                                                                                      |
| **Avaliador**     | Designado por Categoria, dentro do SIM                         | Triar e mudar Status e Categoria das Ideias das suas Categorias, ocultar Comentários. Não avalia Ideias das quais é o Autor |
| **Administrador** | Via `SIM_ADMIN_EMAILS` / `SIM_ADMIN_GROUP` ou atribuído no SIM | Tudo. Configura o produto e cuida das Ideias de Categorias sem Avaliador                                                    |

## 3. Requisitos funcionais

### 3.1 Autenticação e contas ([ADR-0003](./adr/0003-autenticacao-contas-locais-e-oauth2-oidc.md))

- Contas locais (e-mail + senha) habilitadas por padrão. São **criadas por Administradores**, com senha temporária que precisa ser trocada no primeiro login. Não há cadastro livre até existir confirmação de e-mail (Marco 2, com SMTP), porque sem ela qualquer pessoa poderia se cadastrar com um e-mail de `SIM_ADMIN_EMAILS`.
- A **conta de emergência** (`SIM_EMERGENCY_EMAIL` / `SIM_EMERGENCY_PASSWORD`) é o primeiro Administrador da instalação.
- Um provedor SSO configurável com dois modos: **OIDC**, informando só a issuer URL (o resto vem do discovery), e **OAuth2 genérico**, com endpoints authorize/token/userinfo e mapeamento de campos informados manualmente. Os dois usam authorization code + PKCE.
- Criação de conta just-in-time no primeiro login via SSO: nome, e-mail e, se o provedor enviar, departamento e foto.
- Restrição opcional de acesso a um grupo do SSO.
- Com SSO ativo, o login local pode ser desligado. Uma **conta de emergência** definida por variável de ambiente continua funcionando.
- Primeiros Administradores definidos por `SIM_ADMIN_EMAILS`, ou por `SIM_ADMIN_GROUP` quando o provedor envia grupos.

### 3.2 Ideia

- **Campos fixos:** Título (obrigatório, até 120 caracteres), Categoria (obrigatória, exatamente uma), Anexos e Autoria Oculta.
- **Campos Personalizados:** a instalação já vem com _Situação atual_, _Proposta_ e _Benefício esperado_ (texto longo).
  - Tipos: texto curto, texto longo (Markdown), seleção única, seleção múltipla, número e sim/não.
  - Cada campo tem rótulo, texto de ajuda, obrigatoriedade, ordem e a opção "entra na detecção de semelhantes" (só para campos de texto).
  - Abrangência: todas as Categorias ou só algumas escolhidas.
  - Um campo já preenchido em alguma Ideia só pode ser desativado, nunca excluído.
  - Um campo novo e obrigatório não vale para Ideias antigas.
  - Uma mudança de rótulo aparece também nas Ideias antigas.
- **Edição:**
  - O Autor edita livremente em _Rascunho_ e _Aberta_.
  - A partir de _Em análise_, o texto fica travado para o Autor, e informações novas entram como Comentário.
  - Edições após a publicação guardam a versão anterior e marcam a Ideia como "editada".
- **Exclusão pelo Autor:** sempre em _Rascunho_. Em _Aberta_, só se não houver Curtidas nem Comentários de outras pessoas. Nos outros casos não pode excluir.

### 3.3 Ciclo de vida ([ADR-0004](./adr/0004-status-com-semantica-fixa.md))

```
Rascunho ─► Aberta ─► Em análise ─► Aprovada ─► Em execução ─► Concluída
              │           │  └─────────► Recusada ─(reabrir)─► Em análise
              │           ├─────────► Arquivada ─(desarquivar)─► Aberta
              └───────────┴─────────► Duplicada (aponta para a Ideia Original)
```

- Só Avaliador da Categoria ou Administrador muda o Status. Toda mudança exige justificativa e fica registrada no Histórico.
- **Recusada:** decisão de mérito. Pode ser reaberta.
- **Arquivada:** inatividade ou perda de relevância, a partir de _Aberta_ ou _Em análise_. Sai da listagem padrão e continua acessível por filtro e por link.
- **Duplicada:** Curtidas e Seguidores migram para a Ideia Original, sem contar em dobro quem já estava nas duas. Os Seguidores são notificados com o link.
- **Recategorização:** Avaliador ou Administrador pode mudar a Categoria, com justificativa. A mudança fica no Histórico e notifica os novos Avaliadores.
- **Personalização pelo Administrador:** rótulo, cor e descrição de cada Status. Pode desligar _Rascunho_, _Aprovada_ e _Em execução_. Não pode criar Status novos.

### 3.4 Ideias Semelhantes ([ADR-0002](./adr/0002-deteccao-de-semelhantes-textual-mais-semantica-opcional.md))

- Enquanto o Colaborador digita o título e os campos marcados para detecção, o SIM lista as Ideias Semelhantes com link. O sistema **avisa, mas não bloqueia**: o Colaborador pode seguir para a Ideia existente ou publicar mesmo assim.
- A busca inclui todos os Status publicados, **inclusive Arquivadas** (nesse caso o SIM oferece pedir a reativação). Duplicadas ficam de fora: a Ideia Original aparece no lugar delas.
- Os links das Ideias Semelhantes abrem em nova aba, para não perder o texto que está sendo escrito.
- A busca textual pontua cada Ideia por três sinais: quanto do título digitado aparece nela (o principal, que evita sugestões por uma única palavra genérica como "melhorar"), a relevância do texto completo e a semelhança entre os títulos (pega erros de digitação). Ignora acentos e variações das palavras ("relatórios" encontra "relatório").
- **Busca textual** (Postgres full-text em português + pg_trgm): sempre ativa.
- **Busca semântica** (embeddings + pgvector): ativa quando há provedor configurado, seja API compatível com OpenAI ou Ollama. Quando as duas estão ativas, os resultados são combinados.

### 3.5 Curtidas e listagem

- Uma Curtida por Colaborador por Ideia, e pode ser desfeita. O Autor não curte a própria Ideia. A Curtida é sempre identificada.
- Só dá pra curtir em _Aberta_, _Em análise_, _Aprovada_ e _Em execução_. Nos demais Status as Curtidas ficam congeladas: não dá pra curtir nem desfazer.
- Ordenações: **Em alta** (padrão, com Curtidas e Comentários recentes perdendo peso com o tempo), **Mais curtidas** e **Mais recentes**.
  - Em alta: a publicação e cada Curtida (e, depois, cada Comentário) valem 1 e perdem metade do peso a cada 7 dias; a Ideia soma esses pesos. Assim uma Ideia nova aparece bem, e uma antiga volta a subir quando recebe apoio.
- Filtros por Status, Categoria e Autor, e "minhas Ideias / que sigo".

### 3.6 Comentários

- Comentários com um nível de Resposta.
- Menções `@nome` notificam a pessoa mencionada. O editor sugere Colaboradores ativos enquanto se digita depois do `@`; Menção a quem está inativo vira texto simples.
- O autor do comentário pode editar (aparece a marca "editado", sem guardar versões) e pode remover (fica "comentário removido", e as Respostas continuam).
- Avaliador da Categoria ou Administrador pode **ocultar** um Comentário, com motivo (o Avaliador não modera as próprias Ideias). Todos veem quem ocultou e por quê; o texto fica visível só para quem escreveu e para quem modera. Comentário oculto não recebe Respostas nem pode ser editado.
- A linha do tempo da Ideia mistura Comentários e eventos do Histórico em ordem cronológica.
- Dá pra comentar em qualquer Status publicado, inclusive _Recusada_ e _Arquivada_.

### 3.7 Anexos

- Ideias e Comentários aceitam Anexos: imagens (png, jpg, webp, gif) e documentos (pdf, docx, xlsx, pptx, txt).
- Configurável. Padrão: 10 MB por arquivo e até 5 por item.
- Imagens aparecem em miniatura. Os demais tipos ficam como download.
- Armazenamento em disco local (`SIM_DATA_DIR`, o volume `/data` na imagem); o armazenamento compatível com S3 fica para uma etapa futura. Limites em `SIM_ATTACHMENT_MAX_MB` e `SIM_ATTACHMENT_MAX_COUNT`.
- O tipo vem da extensão e é conferido pelo conteúdo do arquivo (um `.png` que não é PNG é recusado); SVG e HTML não são aceitos. Quem pode anexar ou apagar segue quem pode editar: o Autor da Ideia enquanto ela é editável, e o autor do Comentário. Anexo de Comentário oculto ou removido some para quem não pode ler o texto; ao remover o Comentário ou apagar a Ideia, os arquivos são apagados.
- O download passa sempre pelo backend, com checagem de autenticação.

### 3.8 Seguir e Notificações

- O Colaborador passa a Seguir uma Ideia automaticamente ao criar, comentar ou curtir. Também pode seguir manualmente e deixar de seguir.

| Evento                  | Notificados                             |
| ----------------------- | --------------------------------------- |
| Mudança de Status       | Seguidores                              |
| Novo Comentário         | Seguidores (desligável por Colaborador) |
| Resposta                | Autor do Comentário                     |
| Menção                  | Colaborador mencionado                  |
| Nova Ideia na Categoria | Avaliadores da Categoria                |
| Ideia Duplicada         | Seguidores da Duplicada                 |
| Ideia Parada            | Avaliadores e depois Administradores    |

- Canais: sininho no sistema (polling) e e-mail (na hora ou desligado, escolhido pelo Colaborador; o resumo diário vem depois). O sininho entrou no Marco 1; o e-mail na hora, no Marco 2, com SMTP e Redis configurados — sem `SMTP_URL` o SIM não envia e-mail. O e-mail diz o que aconteceu e traz o link da Ideia, nunca o texto do Comentário. Ideia Parada fica para uma etapa seguinte do Marco 2.
- Cada Comentário gera no máximo uma Notificação por pessoa, a mais específica: Menção, depois Resposta, depois novo Comentário. Ninguém é notificado do que ele mesmo fez.
- Nova Ideia numa Categoria sem Avaliadores notifica os Administradores, que avaliam essas Ideias. Recategorizar conta como nova Ideia para os Avaliadores da Categoria de destino.
- Deixar de seguir vale até a próxima interação: comentar ou curtir de novo volta a seguir.

### 3.9 Ideia Parada e painel

- Prazos por Status, configuráveis globalmente (variáveis `SIM_STALLED_OPEN_DAYS` e `SIM_STALLED_REVIEW_DAYS`) e por Categoria (tela de Categorias). Padrões: _Aberta_ 15 dias, _Em análise_ 30 dias, contados desde a última mudança de Status.
- Quando o prazo estoura, os Avaliadores são notificados (Categoria sem Avaliador: os Administradores). Depois de `SIM_STALLED_ESCALATION_DAYS` (padrão 7) a Ideia escala para os Administradores. Cada aviso sai uma vez por período de Status; mudar o Status recomeça a contagem. O Autor nunca recebe o aviso da própria Ideia.
- A verificação roda a cada hora no job em segundo plano (precisa de Redis); os avisos entram no sininho e, se configurado, por e-mail.
- A marca de Ideia Parada aparece só para Avaliadores e Administradores.
- **Painel:** Ideias por Status e Categoria, tempo médio até a primeira decisão, Ideias Paradas e Ideias mais curtidas ainda não decididas. Exportação em CSV (todas as Ideias publicadas, uma por linha, com BOM para o Excel e proteção contra fórmulas). Fica na tela **Painel**, só para Administradores; "decisão" é chegar a Aprovada, Em execução, Concluída, Recusada ou Duplicada, contado desde a publicação.

### 3.10 Autoria Oculta

- Configuração da instalação, desligada por padrão.
- Quando ligada, o Autor pode ocultar o nome numa Ideia. Isso cobre a Ideia e os Comentários dele nela.
- Só Administradores podem revelar o Autor, e cada revelação fica registrada em **Auditoria**.
- O texto da tela informa claramente que Administradores podem identificar o Autor.

### 3.11 Ciclo de vida do Colaborador e LGPD

- **Colaborador Inativo:** marcado manualmente ou automaticamente após X dias sem login (opcional).
  - Não entra no sistema e não recebe Notificações.
  - O conteúdo dele permanece com o nome visível.
  - Perde as designações de Avaliador.
- **Anonimização:** irreversível e auditada.
  - O nome vira "Ex-colaborador", e e-mail, foto e dados do SSO são apagados.
  - O conteúdo permanece.

### 3.12 Personalização (Administrador)

- Categorias (com descrição) e Avaliadores, Campos Personalizados, aparência dos Status, prazos de Ideia Parada, Autoria Oculta e login local.
- **Identidade visual:** nome da instalação, logo clara e escura, favicon, cor primária, texto e imagem da página de login, e-mails com a marca. Fica na tela **Identidade** (Administradores). A leitura é pública, porque a página de login já usa a identidade. Imagens de até 2 MB (PNG, JPG, GIF, WebP, SVG e ICO, conferidos pelo conteúdo), servidas com política que impede execução. Nos e-mails entram o nome e a cor do botão; a logo nos e-mails fica para depois. A cor principal vale para os dois temas; o texto sobre ela é escolhido pelo contraste.
- **i18n:** pt-BR e en.
- Integrações (SSO, SMTP, IA, armazenamento) aparecem na tela só para leitura, com botões "testar conexão" ([ADR-0007](./adr/0007-integracoes-configuradas-por-ambiente.md)).

## 4. Requisitos não funcionais

- **Implantação:** uma organização por instalação ([ADR-0001](./adr/0001-uma-organizacao-por-instalacao.md)).
- **Distribuição:** uma imagem Docker com API, worker e SPA (`SIM_MODE=api|worker|all`) e um `docker-compose.yml` de produção com SIM + Postgres (pgvector) + Redis, mais o profile opcional `ollama`.
- **Migrations:** automáticas ao subir, com trava contra execução concorrente. Podem ser desligadas.
- **Resiliência:** com o Redis fora do ar, o SIM continua operando. O trabalho assíncrono é retomado pela reconciliação ([ADR-0006](./adr/0006-bullmq-redis-com-banco-como-fonte-da-verdade.md)).
- **Segurança:** segredos só em variáveis de ambiente, download de anexos autenticado, Auditoria de ações sensíveis.
- **API pública:** REST documentada com OpenAPI em `/api/docs`.

## 5. Arquitetura técnica

| Camada   | Escolha                                                                                                                                                                                                                                                                                      |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend  | NestJS, Drizzle ORM + drizzle-kit ([ADR-0005](./adr/0005-drizzle-como-orm.md)), `nestjs-zod` (validação + OpenAPI)                                                                                                                                                                           |
| Banco    | PostgreSQL com full-text em português, pg_trgm e pgvector                                                                                                                                                                                                                                    |
| Filas    | BullMQ + Redis, com reconciliação periódica e jobs idempotentes                                                                                                                                                                                                                              |
| Frontend | React + Vite + TypeScript (SPA), TanStack Router, TanStack Query, shadcn/ui (Radix + Tailwind), React Hook Form + Zod, react-i18next, editor Markdown com preview                                                                                                                            |
| Contrato | Zod no backend → OpenAPI → Orval gera tipos e hooks TanStack Query em `packages/api-client`                                                                                                                                                                                                  |
| Monorepo | pnpm workspaces + Turborepo, Node 26 LTS, ESLint (flat config) + Prettier, Conventional Commits + Changesets                                                                                                                                                                                 |
| Testes   | Vitest em tudo. Regras de domínio em código puro com testes unitários. Integração com Testcontainers (Postgres+pgvector, Redis), sem mock do banco. Supertest na API. Testing Library + MSW no front. Playwright no E2E, com Keycloak de teste. Provedor de embeddings _fake_ determinístico |
| CI       | GitHub Actions: lint, typecheck, unitários, integração, E2E e verificação de que o api-client está atualizado                                                                                                                                                                                |

```
sim/
├── apps/
│   ├── api/            # NestJS (api | worker | all)
│   └── web/            # React + Vite
├── packages/
│   ├── api-client/     # gerado pelo Orval
│   └── config/         # tsconfig, ESLint, Prettier
├── docker/
├── docs/
│   ├── adr/
│   └── PRD.md
├── CONTEXT.md
├── LICENSE             # Apache 2.0
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
└── SECURITY.md
```

## 6. Marcos

### Marco 1: núcleo utilizável

- Contas locais + SSO OAuth2/OIDC, criação de conta no primeiro login, Administradores via variável de ambiente, conta de emergência.
- Categorias + Avaliadores, com a regra de conflito de interesse.
- Ideia com Campos Personalizados **globais**, Rascunho, ciclo completo de Status com Histórico, recategorização.
- Detecção de Ideias Semelhantes **textual**.
- Curtidas, ordenações e filtros.
- Comentários, Respostas, Menções e moderação.
- Seguir + Notificações no sininho (polling).
- i18n pt-BR/en, imagem Docker + compose, CI.

### Marco 2: inteligência e engajamento

- Busca **semântica** (OpenAI-compatível / Ollama + pgvector), BullMQ/Redis e reconciliação.
- Notificações por e-mail (na hora e resumo diário).
- Anexos (disco / S3).
- Ideias Paradas + escalonamento.
- Painel + exportação CSV.
- Identidade visual + personalização de Status.

### Marco 3: governança e refinamento

- Campos Personalizados por Categoria.
- Versões de edição da Ideia.
- Autoria Oculta + Auditoria.
- Colaborador Inativo + Anonimização.
- Restrição de acesso por grupo do SSO, `SIM_ADMIN_GROUP`.

### Backlog (depois dos marcos)

SAML 2.0 e LDAP direto · SCIM · grupo do SSO → Avaliador · Etiquetas · sugestão de Categoria por IA · explicação de semelhança por LLM · arquivamento automático · subetapas de _Em execução_ · sobrescrever textos da interface · editor rico (Tiptap) · tempo real (SSE) · webhooks Teams/Slack/Google Chat · antivírus (ClamAV) · Helm chart · gamificação (premiando Ideias Concluídas, nunca volume).

## 7. Fora de escopo (decidido)

- Multi-tenancy ([ADR-0001](./adr/0001-uma-organizacao-por-instalacao.md)).
- Status criados livremente pelo Administrador ([ADR-0004](./adr/0004-status-com-semantica-fixa.md)).
- Renomear termos centrais do domínio ("Ideia", "Curtida", ...).
- Anonimato total, sem registro do Autor.
- Moderação antes da publicação.
- Configurar SSO, SMTP ou IA pela tela ([ADR-0007](./adr/0007-integracoes-configuradas-por-ambiente.md)).
