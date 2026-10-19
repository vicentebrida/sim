# Changelog

## Não lançado

- **Aparência dos Status** (Administradores): nome, cor e descrição de cada Status, e desligar Aprovada e Em execução (as Ideias passam direto ao próximo). Os nomes valem também nas Notificações e nos e-mails. As regras de cada Status não mudam (ADR-0004).
- **Identidade visual** (Administradores): nome, cor principal, logo clara e escura, favicon, título/texto/imagem da página de login. Nos e-mails entram o nome e a cor.
- **Anexos** em Ideias e Comentários: imagens (miniatura) e documentos (PDF, Word, Excel, PowerPoint, texto), com limite de tamanho e quantidade, tipo conferido pelo conteúdo e download sempre autenticado. Guardados em disco (`SIM_DATA_DIR`; o `docker/compose.yml` já monta o volume `/data`).
- **Painel** (Administradores): Ideias por Status e Categoria, tempo médio até a primeira decisão, Ideias Paradas, mais curtidas ainda sem decisão e exportação em CSV.
- **Ideias Paradas**: Ideia Aberta (15 dias) ou Em análise (30 dias) sem ação de um Avaliador avisa os Avaliadores e, após 7 dias, escala para os Administradores. A marca "Parada" só aparece para Avaliadores e Administradores. Prazos padrão em `SIM_STALLED_*`, ajustáveis por Categoria.
- **Notificações por e-mail**: cada Notificação também chega por e-mail (com o link da Ideia, sem o texto do Comentário), se a instalação configurar `SMTP_URL` e o Colaborador não desligar nas preferências do sininho. O envio roda em segundo plano com BullMQ + Redis; o `docker/compose.yml` agora inclui o Redis. Novas variáveis: `REDIS_URL`, `SMTP_URL`, `SIM_MAIL_FROM`, `SIM_LOCALE`.

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
