# Changelog

## Não lançado

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
