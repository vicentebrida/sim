# Uma organização por instalação (self-hosted, sem multi-tenancy)

O SIM é open source e cada empresa roda a própria instância, com banco e SSO próprios. Não existe conceito de tenant no código: uma instalação = uma organização. Escolhemos isso em vez de multi-tenant porque o caso de uso principal é rodar dentro da rede da empresa integrado ao SSO local, e multi-tenancy adicionaria filtro por tenant em toda query, configuração de SSO por tenant, admin em dois níveis e risco de vazamento entre empresas — complexidade sem demanda real hoje.

## Consequences

Oferecer o SIM como SaaS multi-empresa no futuro exigiria migração significativa (coluna de tenant em todas as tabelas, isolamento de autenticação).
