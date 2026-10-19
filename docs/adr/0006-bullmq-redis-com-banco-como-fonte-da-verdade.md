# Tarefas em segundo plano com BullMQ + Redis; Postgres como fonte da verdade

Tarefas assíncronas (e-mails, embeddings, verificação de Ideias Paradas, inativação automática) rodam em BullMQ sobre Redis. Escolhemos BullMQ em vez de pg-boss pela maturidade do ecossistema NestJS e porque o Redis também servirá para pub/sub (tempo real futuro), cache e rate limiting — ao custo de um serviço a mais na instalação mínima (SIM + Postgres + Redis).

Como o enfileiramento no Redis não participa da transação do Postgres, o banco é a fonte da verdade: o trabalho pendente é registrado na mesma transação (ex.: `embedding_status` na Ideia, `email_status` na Notificação), a API enfileira após o commit como caminho rápido, e um job periódico de reconciliação reenfileira itens pendentes há mais de alguns minutos. Jobs são idempotentes.

Na prática, o e-mail das Notificações usa só o caminho de reconciliação: a Notificação nasce com `email_status = 'pending'` na transação, e um job BullMQ repetível (a cada 15 s) envia os pendentes, com trava de linha (`for update skip locked`) para nunca enviar duas vezes e no máximo 5 tentativas. Enfileirar após o commit como caminho rápido fica para quando houver uma tarefa que precise de latência menor.

## Considered Options

- pg-boss: enfileiramento transacional e zero infra extra, mas sem os benefícios adicionais do Redis.
- Transactional outbox genérico: mais formal, porém pesado demais para o volume do SIM.

## Consequences

Com o Redis fora do ar o SIM continua operando (criar, comentar, curtir, sininho); o trabalho assíncrono é retomado pela reconciliação quando o Redis volta.
