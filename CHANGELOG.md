# Changelog

## 0.3.0

Marco 3: governança e refinamento. Fica de fora, por decisão, a busca semântica com IA do Marco 2.

- **Para atualizar**: nenhuma configuração é obrigatória; as migrações rodam sozinhas e foram conferidas sobre um banco da 0.2.0 com dados. Novas variáveis opcionais: `SIM_ACCESS_GROUP`, `SIM_ADMIN_GROUP`, `SIM_SSO_CLAIM_GROUPS` e `SIM_INACTIVITY_DAYS`. A Autoria Oculta fica desligada até um Administrador ligar em Configurações.

- **Campos Personalizados por Categoria**: cada campo vale para todas as Categorias ou só para algumas; o formulário mostra e exige só os da Categoria escolhida.
- **Versões de edição**: o que a Ideia dizia antes de cada edição feita depois de publicada fica guardado, e quem vê a Ideia consulta as versões anteriores.
- **Autoria Oculta** (opcional, desligada por padrão): o Autor se mostra como "Colaborador anônimo"; só Administradores podem revelar, e cada revelação vai para a Auditoria.
- **Colaborador Inativo e Anonimização**, com a **Auditoria** das ações sensíveis (registro só de inclusão). Inativação automática opcional por `SIM_INACTIVITY_DAYS`.
- **Restrição de acesso por grupo do SSO**: `SIM_ACCESS_GROUP` limita quem entra pelo SSO e `SIM_ADMIN_GROUP` define os Administradores (claim em `SIM_SSO_CLAIM_GROUPS`).

## 0.2.0

Marco 2: o SIM passa a falar por e-mail, cobrar resposta dos Avaliadores e ganhar a cara da empresa. Fica de fora a busca semântica com IA.

- **Para atualizar**: a imagem agora usa o Redis e um volume em `/data` (o `docker/compose.yml` já tem os dois). Sem `SMTP_URL`/`REDIS_URL` o SIM funciona como antes, só sem e-mail e sem a verificação de Ideias Paradas. As migrações rodam sozinhas na subida.
- **Novas variáveis**: `REDIS_URL`, `SMTP_URL`, `SIM_MAIL_FROM`, `SIM_LOCALE`, `SIM_DATA_DIR`, `SIM_ATTACHMENT_MAX_MB`, `SIM_ATTACHMENT_MAX_COUNT`, `SIM_STALLED_OPEN_DAYS`, `SIM_STALLED_REVIEW_DAYS`, `SIM_STALLED_ESCALATION_DAYS`.
- **Aparência dos Status** (Administradores): nome, cor e descrição de cada Status, e desligar Aprovada e Em execução (as Ideias passam direto ao próximo). Os nomes valem também nas Notificações e nos e-mails. As regras de cada Status não mudam (ADR-0004).
- **Identidade visual** (Administradores): nome, cor principal, logo clara e escura, favicon, título/texto/imagem da página de login. Nos e-mails entram o nome e a cor.
- **Anexos** em Ideias e Comentários: imagens (miniatura) e documentos (PDF, Word, Excel, PowerPoint, texto), com limite de tamanho e quantidade, tipo conferido pelo conteúdo e download sempre autenticado. Guardados em disco (`SIM_DATA_DIR`; o `docker/compose.yml` já monta o volume `/data`).
- **Painel** (Administradores): Ideias por Status e Categoria, tempo médio até a primeira decisão, Ideias Paradas, mais curtidas ainda sem decisão e exportação em CSV.
- **Ideias Paradas**: Ideia Aberta (15 dias) ou Em análise (30 dias) sem ação de um Avaliador avisa os Avaliadores e, após 7 dias, escala para os Administradores. A marca "Parada" só aparece para Avaliadores e Administradores. Prazos padrão em `SIM_STALLED_*`, ajustáveis por Categoria.
- **Notificações por e-mail**: cada Notificação também chega por e-mail (com o link da Ideia, sem o texto do Comentário), se a instalação configurar `SMTP_URL` e o Colaborador não desligar nas preferências do sininho. Se o envio falhar, o SIM tenta de novo com espera crescente (1, 5, 15 e 60 minutos) antes de desistir. O envio roda em segundo plano com BullMQ + Redis; o `docker/compose.yml` agora inclui o Redis. Novas variáveis: `REDIS_URL`, `SMTP_URL`, `SIM_MAIL_FROM`, `SIM_LOCALE`.

## 0.1.0

Primeira versão: o núcleo utilizável do SIM (Marco 1 do [PRD](./docs/PRD.md)).

- **Acesso**: contas locais criadas pelo Administrador, com senha temporária e limite de tentativas; SSO por OIDC ou OAuth2 genérico; conta de emergência.
- **Ideias**: Rascunho, publicação, ciclo de Status com Histórico e justificativas, recategorização, Campos Personalizados configuráveis e Categorias com Avaliadores.
- **Curtidas** e ordenações Em alta, Mais curtidas e Mais recentes.
- **Comentários** com Respostas, Menções e moderação.
- **Seguir e Notificações** no sininho.
- **Ideias Semelhantes**: busca textual enquanto se escreve, sem bloquear a publicação.
- Interface em português e inglês, imagem Docker única e `docker compose`.

Fica para os próximos marcos: e-mail, busca semântica com IA, Anexos, Ideias Paradas, painel e identidade visual.
