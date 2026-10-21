# Tempo real com SSE e LISTEN/NOTIFY do Postgres

O sininho e a página da Ideia se atualizam na hora por Server-Sent Events (`GET /api/events`). Os eventos nascem no banco: gatilhos nas tabelas `ideas`, `comments`, `likes`, `attachments`, `idea_tags` e `notifications` fazem `pg_notify('sim_events', ...)`, e cada processo da API mantém uma conexão com `LISTEN sim_events` e repassa os eventos aos navegadores conectados a ele. Escolhemos o Postgres em vez do pub/sub do Redis que a [ADR-0006](./0006-bullmq-redis-com-banco-como-fonte-da-verdade.md) previa porque o banco é obrigatório e o Redis não: o tempo real funciona em toda instalação, inclusive com várias réplicas e com mudanças feitas pelo worker. O NOTIFY só é entregue no commit, então ninguém é avisado de algo que foi desfeito.

O evento diz só o que mudou (`idea` com o número, `notifications` para o destinatário), nunca o conteúdo. O navegador busca de novo pela API, com as checagens de permissão de sempre. Rascunhos não são anunciados. As colunas que os jobs atualizam (avisos de Ideia Parada, estado do e-mail) ficam fora dos gatilhos, para não gerar recargas à toa.

## Considered Options

- Pub/sub do Redis: deixaria o tempo real dependente de um serviço opcional, e cada ponto do código que muda dados precisaria publicar o evento.
- WebSocket: bidirecional, que o SIM não precisa; SSE passa por proxies HTTP comuns e o navegador reconecta sozinho.
- Continuar só com polling: simples, mas o sininho demora até 30 s e a página da Ideia não se atualiza.

## Consequences

- Cada aba aberta mantém uma conexão HTTP. Atrás de HTTP/1.1 o navegador limita a 6 conexões por site, então muitas abas do SIM podem travar as requisições; com HTTPS e HTTP/2 no proxy (o comum) não há esse limite.
- O stream manda um `ping` a cada 30 s, para proxies não fecharem a conexão parada, e confere a sessão: depois de sair, desativar a conta ou a sessão expirar, o stream termina.
- Se a conexão de LISTEN cai, a API reconecta com espera crescente e manda `resync`, e os navegadores buscam tudo de novo. Enquanto o stream está fora, o sininho volta ao polling de 30 s.
- O payload do NOTIFY tem limite de 8000 bytes, folgado para o que o SIM manda.
