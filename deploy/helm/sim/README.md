# Chart Helm do SIM

Instala o SIM no Kubernetes: o processo web (API + interface), opcionalmente um worker separado, e,
para instalações pequenas, Postgres com pgvector e Redis dentro do próprio chart.

## Instalação rápida

```bash
helm install sim oci://ghcr.io/vicentebrida/charts/sim --version 0.10.1 \
  --namespace sim --create-namespace \
  --set publicUrl=https://ideias.empresa.com.br \
  --set ingress.enabled=true --set 'ingress.hosts[0].host=ideias.empresa.com.br' \
  --set-string secretEnv.SIM_EMERGENCY_EMAIL=admin@empresa.com.br \
  --set-string secretEnv.SIM_EMERGENCY_PASSWORD='uma-senha-longa-e-segura'
```

Do repositório, o mesmo com `helm install sim deploy/helm/sim ...`.

## Configuração

As variáveis da aplicação são as mesmas do [`.env.example`](../../../.env.example):

- `env`: as que não são segredo (`SIM_LOCALE`, `SIM_TIMEZONE`, `SIM_SSO_MODE`, `SIM_STORAGE`...).
- `secretEnv`: segredos (`SMTP_URL`, `SIM_SSO_CLIENT_SECRET`, `SIM_WEBHOOK_SLACK_URL`...), num
  Secret criado pelo chart.
- `existingSecret`: um Secret seu (de um cofre, Sealed Secrets, External Secrets...) cujas chaves
  viram variáveis de ambiente. Preferível a `secretEnv` em produção.

`publicUrl` é obrigatório; `DATABASE_URL`, `REDIS_URL` e `SIM_MODE` o chart preenche.

### Banco e Redis externos

```yaml
postgresql:
  enabled: false
externalDatabase:
  existingSecret: sim-database # chave DATABASE_URL (ou externalDatabase.url)
redis:
  enabled: false
externalRedis:
  url: redis://redis.infra:6379
```

O Postgres precisa da extensão pgvector disponível (a migração a cria). As migrações rodam na
subida do SIM, com trava para várias réplicas.

### Mais de uma réplica

Com `worker.enabled=true`, as tarefas em segundo plano (e-mail, Ideias Paradas, busca semântica,
canais de chat) vão para um pod próprio e `web.replicas` pode crescer. Os Anexos ficam em `/data`:
com mais de um pod, use `persistence.accessMode=ReadWriteMany` ou o S3 (`env.SIM_STORAGE=s3` e
`persistence.enabled=false`). As sessões ficam no banco, então não é preciso afinidade.
O tempo real (SSE em `/api/events`) também passa pelo banco, então funciona entre réplicas; o
ingress-nginx já respeita o `X-Accel-Buffering: no` que o SIM manda.

### Antivírus

O chart não traz o ClamAV. Com um `clamd` no cluster (por exemplo, a imagem `clamav/clamav-debian`, que também roda em ARM),
aponte o SIM para ele: `env.SIM_CLAMAV_URL=tcp://clamav.infra:3310`. Enquanto estiver
configurado, os envios de Anexos são recusados se o antivírus não responder.

## O que fica depois de `helm uninstall`

O volume dos Anexos (`<release>-data`) e o do Postgres embutido não são apagados.
