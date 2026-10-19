# Drizzle como camada de acesso ao banco

O backend usa Drizzle ORM (com drizzle-kit para migrations) sobre PostgreSQL. A funcionalidade central do SIM — detecção de Ideias Semelhantes — depende de pgvector, full-text em português e pg_trgm, e os Campos Personalizados ficam em JSONB; o Drizzle suporta pgvector nativamente e expressa essas consultas de forma tipada, próximas do SQL.

## Considered Options

- Prisma: mais popular, mas `vector` é `Unsupported` e toda busca de semelhança/full-text cairia em `$queryRaw` sem tipagem — justamente o diferencial do produto ficaria fora do ORM.
- TypeORM: integração "oficial" com NestJS, mas manutenção irregular e tipagem fraca.
- MikroORM: bom para DDD, curva maior e sem vantagem para pgvector.

## Consequences

Não há módulo oficial NestJS para Drizzle; a integração é um provider próprio.
