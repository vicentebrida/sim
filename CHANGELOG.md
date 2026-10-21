# Changelog

## Não lançado

- A imagem arm64 passa a ser construída numa máquina ARM, sem emulação: a publicação de uma versão volta a levar minutos em vez de mais de uma hora. O CI também constrói a imagem arm64 em cada PR.

## 0.10.1

Correções encontradas ao validar a 0.10.0 de ponta a ponta, e imagem também para arm64.

- **Para atualizar**: nada é obrigatório; sem migrações e sem variáveis novas. A imagem `ghcr.io/vicentebrida/sim` passa a ser publicada para `linux/amd64` e `linux/arm64`, então o `docker compose` roda direto em Macs com Apple Silicon e em servidores ARM (Graviton, Ampere).

- **Imagem arm64**: antes só havia amd64, e o `docker compose up` falhava em máquinas ARM.
- **Correções da validação de ponta a ponta**:
  - O menu do Administrador virou um botão "Administração" com as dez telas. Antes, os links estouravam o cabeçalho: no celular a página rolava para o lado e o sininho e o "Sair" sumiam, e mesmo no computador o "Sair" ficava cortado.
  - O selo "Servidor no ar" saiu do cabeçalho; só aparece quando o servidor está com problemas ou fora do ar.
  - As telas Status e Identidade mostravam o nome interno do subtítulo em vez do texto.
  - "Colaborador anônimo" aparece no idioma de quem vê (antes vinha sempre no idioma da instalação). Os e-mails e os canais de chat continuam no idioma da instalação.
  - O título da aba segue o idioma da interface.
  - Na avaliação da Ideia, o Status vem antes da etapa, e "Nova categoria" some quando não há outra Categoria para onde mover.

## 0.10.0

Perfil com as Ideias Concluídas de cada pessoa e textos da interface ajustáveis.

- **Para atualizar**: nada é obrigatório; a migração só acrescenta uma coluna à identidade visual. Nenhuma variável nova. Sem textos trocados, as telas mostram os textos padrão do SIM.

- **Reconhecimento**: cada Colaborador tem um perfil, aberto pelo nome do Autor na Ideia, com as Ideias dele que foram Concluídas e as Curtidas que elas receberam. A página inicial mostra as Ideias concluídas recentemente, com o Autor. Sem pontos nem ranking, e nada que premie quantidade. Ideias com Autoria Oculta ficam fora do perfil público.

- **Textos da interface**: na tela Identidade, o Administrador troca, em português e em inglês, o título, o subtítulo e o botão da página inicial, a ajuda do título da Ideia e o título e o texto das Ideias Semelhantes, e pode escrever uma orientação que aparece no topo do formulário de nova Ideia. Campo vazio usa o texto padrão do SIM.

## 0.9.0

Arquivamento automático de Ideias sem apoio e etapas dentro de Em execução.

- **Para atualizar**: nada é obrigatório; as migrações só acrescentam tabela e colunas. Nenhuma variável nova. O arquivamento automático vem desligado, e sem etapas criadas tudo segue como na 0.8.0. A API passa a devolver `collaborator: null` no Histórico quando o SIM agiu sozinho; integrações que leem o Histórico pela API devem aceitar esse valor.

- **Etapas de Em execução**: na tela Status, o Administrador cria até 10 etapas (ex.: Planejamento, Desenvolvimento, Implantação), iguais para todas as Categorias, e escolhe a ordem. Os Avaliadores marcam em que etapa está cada Ideia Em execução, em qualquer ordem e com comentário opcional; a etapa aparece ao lado do Status, vai para o Histórico e avisa os Seguidores. As regras do Status não mudam.

- **Arquivamento automático** (desligado por padrão): na tela Configurações, o Administrador escolhe depois de quantos dias (no mínimo 14) uma Ideia Aberta sem Curtidas, Comentários nem edições é arquivada pelo SIM. O Autor é avisado 7 dias antes e o arquivamento só acontece depois desse aviso, mesmo para Ideias já antigas quando a regra é ligada. Qualquer Curtida ou Comentário recomeça a contagem. O Histórico mostra "SIM" como autor, os Seguidores são notificados e os Avaliadores podem desarquivar. Ideias Em análise não são arquivadas (para elas valem as Ideias Paradas). Precisa do Redis, como as Ideias Paradas.

## 0.8.0

Tempo real no sininho e na página da Ideia, e antivírus opcional nos Anexos.

- **Para atualizar**: nada é obrigatório; a migração só cria gatilhos no banco. Nova variável opcional: `SIM_CLAMAV_URL`. Atrás de um proxy, a rota `/api/events` precisa ficar sem buffer (o SIM manda `X-Accel-Buffering: no`, que o nginx respeita) e com tempo de leitura acima de 30 s; se não ficar, o sininho continua funcionando por polling.

- **Tempo real**: o sininho e a página da Ideia (Comentários, Curtidas, Status, edições, Etiquetas e Anexos) se atualizam na hora, sem recarregar a página, por Server-Sent Events. Funciona sem o Redis e com várias réplicas, porque os eventos vêm do próprio Postgres (LISTEN/NOTIFY, [ADR-0009](./docs/adr/0009-tempo-real-com-sse-e-listen-notify.md)). Se a conexão cair, o sininho volta a perguntar a cada 30 s. Atrás de um proxy, deixe a resposta de `/api/events` sem buffer (o SIM já manda `X-Accel-Buffering: no`, que o nginx respeita) e com tempo de leitura acima de 30 s.

- **Antivírus nos Anexos (opcional)**: com `SIM_CLAMAV_URL` apontando para o `clamd` do ClamAV (ex.: `tcp://clamav:3310`), cada Anexo é verificado antes de ser guardado. Arquivo com ameaça é recusado e a tentativa vai para a Auditoria; com o antivírus fora do ar, os envios são recusados em vez de guardados sem verificação. A tela Integrações mostra o estado e testa a conexão, e o compose ganhou o perfil `clamav`.

## 0.7.0

Avisos em canais de chat e instalação em Kubernetes com Helm.

- **Para atualizar**: nada é obrigatório; a migração só acrescenta a tabela das mensagens aos canais. Novas variáveis opcionais: `SIM_WEBHOOK_SLACK_URL`, `SIM_WEBHOOK_TEAMS_URL`, `SIM_WEBHOOK_GOOGLE_CHAT_URL` e `SIM_WEBHOOK_EVENTS` (veja o `.env.example`). Sem elas, tudo segue como na 0.6.0.

- **Chart Helm** para Kubernetes em `deploy/helm/sim`, publicado a cada versão em `oci://ghcr.io/vicentebrida/charts/sim`. Traz Postgres (pgvector) e Redis embutidos ou usa os seus, worker separado opcional, Ingress, volume para os Anexos e segredos por `existingSecret`.
- **Canais de chat (webhooks)**: Slack, Microsoft Teams e Google Chat podem receber uma mensagem quando uma Ideia é publicada e quando muda de Status. Configure `SIM_WEBHOOK_SLACK_URL`, `SIM_WEBHOOK_TEAMS_URL` e/ou `SIM_WEBHOOK_GOOGLE_CHAT_URL` (exigem o Redis) e, se quiser, `SIM_WEBHOOK_EVENTS`. A mensagem traz o título e o link, nunca o texto da Ideia. A tela Integrações mostra os canais e envia uma mensagem de teste.

## 0.6.0

Etiquetas, Avaliadores pelo grupo do SSO, logo nos e-mails e a opção de desligar o Rascunho.

- **Para atualizar**: nada é obrigatório; as migrações rodam sozinhas e só acrescentam tabelas e colunas. Nenhuma variável nova. Sem Etiquetas criadas e sem grupo do SSO nas Categorias, tudo segue como na 0.5.0.

- **Etiquetas**: o Administrador cria as Etiquetas na nova tela Etiquetas (ex.: Custo, Segurança). O Autor escolhe ao criar a Ideia e enquanto ela está Aberta; depois, os Avaliadores e Administradores. A lista de Ideias mostra as Etiquetas e filtra por elas.
- **Avaliadores pelo grupo do SSO**: cada Categoria pode ter um grupo do SSO (em Editar). Quem está nele vira Avaliador da Categoria a cada login e deixa de ser ao sair do grupo. Os Avaliadores escolhidos à mão continuam, e a tela mostra quem veio "pelo SSO". Usa a mesma claim de grupos de `SIM_SSO_CLAIM_GROUPS`.
- **Logo nos e-mails**: as Notificações e o resumo diário trazem no topo a logo da identidade visual (a clara, ou a escura se for a única), embutida na mensagem. Vale para PNG, JPG ou GIF de até 300 KB; com outra imagem, o e-mail sai sem logo.
- **Desligar o Rascunho**: na tela Status, o Administrador pode desligar o Rascunho; aí toda Ideia nova já sai publicada e o botão "Salvar rascunho" some. Os Rascunhos que já existiam continuam com seus Autores, que podem editar, publicar ou excluir.

## 0.5.0

Resumo diário por e-mail, prazos de Ideia Parada ajustáveis pela interface e armazenamento S3 opcional.

- **Para atualizar**: nada é obrigatório; as migrações rodam sozinhas. Quem tinha desligado os e-mails fica com a opção "nenhum" e quem recebia continua recebendo na hora. Novas variáveis opcionais: `SIM_DIGEST_HOUR`, `SIM_TIMEZONE`, `SIM_STORAGE` e `SIM_S3_*` (veja o `.env.example`). Os prazos em `SIM_STALLED_*` continuam valendo até um Administrador escolher outros em Configurações.

- **Armazenamento S3 (opcional)** para Anexos e imagens da identidade, em AWS ou serviços compatíveis (MinIO, Cloudflare R2...): `SIM_STORAGE=s3` e `SIM_S3_*`. O padrão continua sendo o disco. Trocar não move os arquivos já enviados. A tela Integrações mostra qual está em uso.
- **Prazos de Ideia Parada pela tela Configurações**: o Administrador ajusta os dias (Aberta, Em análise e escalonamento) sem mexer no servidor; as variáveis `SIM_STALLED_*` viram o padrão enquanto nada for escolhido. Cada mudança fica na Auditoria.
- **Resumo diário por e-mail**: nas preferências do sininho cada pessoa escolhe receber os e-mails na hora, num resumo por dia ou nenhum. O resumo sai no horário `SIM_DIGEST_HOUR` (padrão 8) no fuso `SIM_TIMEZONE` (padrão UTC), com uma linha e um link por novidade. Quem tinha desligado os e-mails continua sem receber.

## 0.4.0

A busca semântica opcional chega, fechando o que faltava do Marco 2.

- **Para atualizar**: nada é obrigatório. Para usar a busca semântica, o Postgres precisa ter a extensão pgvector (a imagem do compose já tem) e é preciso configurar `SIM_EMBEDDINGS_URL`, `SIM_EMBEDDINGS_MODEL` e o Redis. Sem isso, tudo segue como na 0.3.0. A migração cria a extensão `vector`.

- **Busca semântica (opcional)**: as Ideias Semelhantes passam a achar também o que é parecido no sentido, não só nas palavras, com qualquer serviço de embeddings compatível com a API da OpenAI (OpenAI, Ollama, ...). As Ideias são indexadas em segundo plano; se o serviço cair, vale a busca textual. Configuração em `SIM_EMBEDDINGS_*` (veja o `.env.example`); o compose traz o perfil `ollama`. A tela **Integrações** mostra o estado e testa a conexão. Exige o Postgres com pgvector (a imagem do compose já tem).

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
